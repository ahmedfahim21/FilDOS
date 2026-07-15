import type { ChatToolCall, ChatTurn } from '@shared/types';
import type { LlmModelConfig } from '@shared/llmModels';
import { CHAT_TOOLS, type ChatToolParams } from '@shared/chatTools';
import {
  getCloudProvider,
  usesProviderDefaultSampling,
  type CloudLlmProviderId,
  type CloudLlmTestResult,
  type CloudModelDef,
} from '@shared/cloudLlm';
import { executeChatTool, type ChatToolDeps } from './tools';

/**
 * The cloud chat engine: the BYO-key counterpart to the local LlmManager,
 * built on the Vercel AI SDK so five providers speak one streaming +
 * tool-calling surface. Runs directly in the main process — cloud chat is
 * I/O-bound, so no utilityProcess is needed — which also means tools execute
 * in-place via {@link executeChatTool} instead of the worker's RPC dance.
 *
 * The `ai` and `@ai-sdk/*` packages are ESM-only; they're pulled with dynamic
 * `import()` from this CJS bundle exactly like node-llama-cpp in llmWorker.ts.
 */

// Type-only: erased at compile time, so the ESM package never leaks into
// the CJS bundle — the runtime load stays the dynamic import() below.
import type * as AiTypes from 'ai';
import type { LanguageModel, ToolSet } from 'ai';

type AiLib = typeof AiTypes;

let aiLib: Promise<AiLib> | null = null;
const loadAi = (): Promise<AiLib> => (aiLib ??= import('ai'));

/** How many think→act rounds one answer may take before generation stops. */
const MAX_TOOL_STEPS = 8;

const err = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code });

// ---------------------------------------------------------------------------
// Tool schema translation
// ---------------------------------------------------------------------------

interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

/**
 * Translate a CHAT_TOOLS param spec (the GBNF-JSON subset node-llama-cpp
 * takes) into the standard JSON Schema cloud providers take. The one idiom
 * that differs is optionality: GBNF marks it `oneOf: [{type:'null'}, X]`,
 * which becomes a required-but-nullable `type: [X.type, 'null']` — friendly
 * to OpenAI's strict mode, which wants every property listed in `required`.
 */
export function chatToolJsonSchema(params: ChatToolParams): JsonSchemaObject {
  const properties: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(params.properties)) {
    const prop = raw as {
      oneOf?: { type: string }[];
      type?: string;
      description?: string;
      items?: unknown;
    };
    if (prop.oneOf) {
      const real = prop.oneOf.find((b) => b.type !== 'null') ?? { type: 'string' };
      properties[key] = {
        ...real,
        type: [real.type, 'null'],
        ...(prop.description ? { description: prop.description } : {}),
      };
    } else {
      properties[key] = prop;
    }
  }
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

// ---------------------------------------------------------------------------
// Credentials and model factory
// ---------------------------------------------------------------------------

/** Bedrock provider settings from a stored connection (keys or AWS profile). */
async function bedrockAuth(options: Record<string, string>): Promise<{
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  credentialProvider?: () => Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  }>;
}> {
  const region = options.region;
  if (!region) throw err('EINVAL', 'The Bedrock connection is missing a region — reconnect it.');
  if (options.authMode !== 'profile' && options.accessKeyId) {
    return {
      region,
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      sessionToken: options.sessionToken || undefined,
    };
  }
  const { fromNodeProviderChain } = await import('@aws-sdk/credential-providers');
  return {
    region,
    credentialProvider: fromNodeProviderChain(
      options.profile ? { profile: options.profile } : {},
    ),
  };
}

/** An AI SDK language model for a provider + remote model id + credentials. */
async function createCloudModel(
  provider: CloudLlmProviderId,
  remoteId: string,
  credentials: Record<string, string>,
): Promise<LanguageModel> {
  switch (provider) {
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      return createAnthropic({ apiKey: credentials.apiKey })(remoteId);
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai');
      return createOpenAI({
        apiKey: credentials.apiKey,
        ...(credentials.baseURL ? { baseURL: credentials.baseURL } : {}),
      })(remoteId);
    }
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      return createGoogleGenerativeAI({ apiKey: credentials.apiKey })(remoteId);
    }
    case 'bedrock': {
      const { createAmazonBedrock } = await import('@ai-sdk/amazon-bedrock');
      return createAmazonBedrock(await bedrockAuth(credentials))(remoteId);
    }
    case 'openai-compat': {
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
      return createOpenAICompatible({
        name: credentials.name || 'custom',
        baseURL: credentials.baseURL,
        ...(credentials.apiKey ? { apiKey: credentials.apiKey } : {}),
      }).chatModel(remoteId);
    }
  }
}

// ---------------------------------------------------------------------------
// Sampling + errors
// ---------------------------------------------------------------------------

/**
 * Sampling params to pass through, if any. Current Anthropic models (also
 * behind Bedrock) reject explicit temperature/top-p with a 400, so those get
 * none; a 400 naming them triggers one retry without sampling either way.
 */
export function samplingFor(
  provider: CloudLlmProviderId,
  remoteId: string,
  config: LlmModelConfig,
): { temperature?: number; topP?: number } {
  if (usesProviderDefaultSampling(provider, remoteId)) return {};
  return { temperature: config.temperature, topP: config.topP };
}

const isSamplingRejection = (e: unknown): boolean => {
  const m = e instanceof Error ? e.message : String(e);
  return /temperature|top_p|topP/i.test(m);
};

const isAbortError = (e: unknown): boolean =>
  e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message));

/** Map a provider/SDK failure onto the app's friendly coded errors. */
export function toCloudError(
  cause: unknown,
  provider: CloudLlmProviderId,
  remoteId: string,
): Error {
  const label = getCloudProvider(provider)?.label ?? provider;
  const raw = cause instanceof Error ? cause : new Error(String(cause));
  const status = (cause as { statusCode?: number } | null)?.statusCode;
  const text = `${raw.name}: ${raw.message}`;

  if (status === 401 || status === 403 || /api.?key|unauthorized|invalid signature|expired.?token|unrecognizedclient/i.test(text)) {
    return err('EAUTH', `${label} rejected the credentials — check them in Settings → Ask AI.`);
  }
  if (/credentialsprovidererror|could not load credentials|sso.*(expired|session)/i.test(text)) {
    return err(
      'EAUTH',
      `AWS credentials couldn't be resolved — run \`aws sso login\` or re-enter keys in Settings → Ask AI.`,
    );
  }
  if (status === 404 || /model.*not.?found|does not exist|no such model/i.test(text)) {
    return err('EINVAL', `Model '${remoteId}' was not found on ${label}.`);
  }
  if (status === 429) {
    return err('ERATELIMIT', `${label} is rate-limiting — try again shortly.`);
  }
  if (/validationexception|invalid.*model|on-demand throughput/i.test(text)) {
    return err('EINVAL', `${label} rejected '${remoteId}': ${raw.message.slice(0, 200)}`);
  }
  if (
    /fetch failed|enotfound|econnrefused|econnreset|network|etimedout|timeout/i.test(text) &&
    !status
  ) {
    return err('EOFFLINE', `Couldn't reach ${label} — check your connection.`);
  }
  return err('ELLMFAILED', `${label}: ${raw.message.slice(0, 300)}`);
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface CloudChatArgs {
  def: CloudModelDef;
  /** Decrypted account options (API key / AWS settings / endpoint). */
  credentials: Record<string, string>;
  requestId: string;
  system: string;
  history: ChatTurn[];
  prompt: string;
  config: LlmModelConfig;
  /** The folder open in the browser — relative tool paths resolve against it. */
  cwd?: string;
  toolDeps: ChatToolDeps;
  onChunk(text: string): void;
  onToolCall(call: ChatToolCall): void;
}

const aborts = new Map<string, AbortController>();

/** Abort an in-flight cloud chat; a no-op for unknown/local requestIds. */
export function stopCloudChat(requestId: string): void {
  aborts.get(requestId)?.abort();
}

/**
 * Answer one message through a cloud model, streaming text via `onChunk` and
 * executing file tools in-process as the model calls them. Resolves with the
 * full answer; an abort resolves with whatever streamed (local-stop parity).
 */
export async function cloudChat(args: CloudChatArgs): Promise<string> {
  const { def } = args;
  const ai = await loadAi();
  const model = await createCloudModel(def.provider, def.remoteId, args.credentials);

  const tools: ToolSet = {};
  for (const toolDef of CHAT_TOOLS) {
    tools[toolDef.name] = ai.tool({
      description: toolDef.description,
      inputSchema: ai.jsonSchema<Record<string, unknown>>(
        chatToolJsonSchema(toolDef.params) as never,
      ),
      execute: async (params: Record<string, unknown>) => {
        const { call, result } = await executeChatTool(
          toolDef.name,
          params ?? {},
          args.cwd,
          args.toolDeps,
        );
        args.onToolCall(call);
        return result;
      },
    });
  }

  const messages = [
    ...args.history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user' as const, content: args.prompt },
  ];

  const ac = new AbortController();
  aborts.set(args.requestId, ac);
  let sampling = samplingFor(def.provider, def.remoteId, args.config);
  try {
    // One retry without sampling: some providers/models 400 on explicit
    // temperature/top-p. Only safe while nothing has streamed yet.
    for (;;) {
      let answer = '';
      let streamed = false;
      try {
        const result = ai.streamText({
          model,
          system: args.system,
          messages,
          tools,
          stopWhen: ai.stepCountIs(MAX_TOOL_STEPS),
          maxOutputTokens: args.config.maxTokens,
          abortSignal: ac.signal,
          ...sampling,
        });
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            answer += part.text;
            streamed = true;
            args.onChunk(part.text);
          } else if (part.type === 'abort') {
            return answer;
          } else if (part.type === 'error') {
            throw part.error;
          }
        }
        return answer;
      } catch (cause) {
        if (ac.signal.aborted || isAbortError(cause)) return answer;
        const canRetry =
          !streamed &&
          'temperature' in sampling &&
          (cause as { statusCode?: number } | null)?.statusCode === 400 &&
          isSamplingRejection(cause);
        if (canRetry) {
          sampling = {};
          continue;
        }
        throw toCloudError(cause, def.provider, def.remoteId);
      }
    }
  } finally {
    aborts.delete(args.requestId);
  }
}

// ---------------------------------------------------------------------------
// Connection checks
// ---------------------------------------------------------------------------

/**
 * The truthful end-to-end check: one tiny generation against the model.
 * Used by the per-model Test button and after adding a model.
 */
export async function testCloudModel(
  provider: CloudLlmProviderId,
  remoteId: string,
  credentials: Record<string, string>,
): Promise<CloudLlmTestResult> {
  const ai = await loadAi();
  try {
    const model = await createCloudModel(provider, remoteId, credentials);
    await ai.generateText({
      model,
      prompt: 'Reply with the single word: ok',
      maxOutputTokens: 8,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(30_000),
    });
    return { ok: true };
  } catch (cause) {
    throw toCloudError(cause, provider, remoteId);
  }
}

/**
 * Bedrock connect-time check: resolve credentials (explicit keys or the AWS
 * profile/SSO chain — failing fast when the chain is empty), then call the
 * one-permission ListFoundationModels. An account allowed to invoke models
 * but not list them saves as `unverified` — the per-model Test settles it.
 */
export async function bedrockCheck(
  options: Record<string, string>,
): Promise<CloudLlmTestResult> {
  const auth = await bedrockAuth(options);
  try {
    const { BedrockClient, ListFoundationModelsCommand } = await import(
      '@aws-sdk/client-bedrock'
    );
    const client = new BedrockClient({
      region: auth.region,
      credentials:
        auth.credentialProvider ??
        {
          accessKeyId: auth.accessKeyId!,
          secretAccessKey: auth.secretAccessKey!,
          ...(auth.sessionToken ? { sessionToken: auth.sessionToken } : {}),
        },
    });
    await client.send(new ListFoundationModelsCommand({}));
    return { ok: true };
  } catch (cause) {
    const name = (cause as Error)?.name ?? '';
    if (name === 'AccessDeniedException') {
      return {
        ok: true,
        unverified: true,
        message:
          'Saved — these credentials can\'t list models (bedrock:ListFoundationModels). Use Test on a model to verify.',
      };
    }
    throw toCloudError(cause, 'bedrock', options.region ?? '');
  }
}
