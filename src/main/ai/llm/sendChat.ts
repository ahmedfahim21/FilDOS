import { randomUUID } from 'node:crypto';
import type {
  ChatSendPayload,
  ChatStreamEvent,
  ChatToolCall,
  ChatTurn,
  Prefs,
  SemanticHit,
} from '@shared/types';
import {
  CLOUD_CONFIG_LIMITS,
  DEFAULT_LLM_MODEL_ID,
  resolveLlmConfig,
  type LlmModelConfig,
  type LlmModelDef,
} from '@shared/llmModels';
import { getCloudProvider } from '@shared/cloudLlm';
import type { buildChat, ChatContextDeps } from './context';
import { executeChatTool, type ChatToolDeps } from './tools';
import type { CloudChatArgs } from './cloudChat';

/**
 * The engine-agnostic body of `chat:send`: resolve the model and config,
 * persist the exchange, build the prompt, and route generation to the local
 * LlmManager or the cloud engine — both streaming the same ChatStreamEvents.
 * Dependencies are injected (Indexer-style) so tests drive it with fakes;
 * llm/handlers.ts owns the real wiring.
 */

/** The slice of LlmManager the local generation path needs. */
export interface LocalChatEngine {
  chat(args: {
    modelId: string;
    requestId: string;
    system: string;
    history: ChatTurn[];
    prompt: string;
    config?: Partial<LlmModelConfig>;
    tools?: boolean;
  }): Promise<string>;
  onChunk(cb: (requestId: string, text: string) => void): () => void;
  onToolCall(
    cb: (requestId: string, callId: string, name: string, params: unknown) => void,
  ): () => void;
  toolResult(callId: string, result: unknown): void;
}

/** The slice of db/chats.ts the exchange persistence needs. */
export interface ChatStore {
  titleFor(prompt: string, command?: string): string;
  createSession(id: string, title: string, modelId?: string): Promise<void>;
  touchSession(id: string, modelId?: string): Promise<void>;
  appendMessage(
    sessionId: string,
    message: {
      role: 'user' | 'assistant';
      content: string;
      command?: string;
      mentions?: ChatSendPayload['mentions'];
      sources?: SemanticHit[];
      toolCalls?: ChatToolCall[];
    },
  ): Promise<void>;
}

export interface SendChatDeps {
  getPrefs(): Promise<Prefs>;
  chats: ChatStore;
  buildChat: typeof buildChat;
  contextDeps: ChatContextDeps;
  toolDeps: ChatToolDeps;
  local: LocalChatEngine;
  cloud(args: CloudChatArgs): Promise<string>;
  /** Decrypted account options for a cloud model (accountsDb.getConfig). */
  getCredentials(accountId: string): Promise<Record<string, string> | null>;
  /** Def lookup for research-mode context widening (built-in + custom GGUFs). */
  modelDefOf(modelId: string): Promise<LlmModelDef | undefined>;
  send(event: ChatStreamEvent): void;
}

/** Appended to the system prompt when the file tools are available. */
const TOOLS_SYSTEM = [
  'You can also act on the user\'s files with the provided functions: create files and folders, copy, move, rename, delete (to the OS Trash), list folders, read files, and search the index.',
  'Only call an action that changes files (create/copy/move/rename/delete) when the user clearly asks for it — never delete, move, or modify anything they did not ask about.',
  'To research or answer questions about the user\'s files, use search_index to find relevant files, then read_file to read them; you may search several times to gather what you need before answering.',
  'Prefer paths from the message or the current folder. After acting, briefly confirm what you did, naming the files.',
].join(' ');

/** Most prior turns replayed to the model, each capped, so context stays bounded. */
const MAX_HISTORY_TURNS = 8;
const MAX_TURN_CHARS = 2_000;

/** File-context budget for cloud models (tokens) — generous, but cost-capped. */
const CLOUD_CONTEXT_TOKENS = 16_384;
const CLOUD_RESEARCH_CONTEXT_TOKENS = 32_768;

function capHistory(history: ChatTurn[]): ChatTurn[] {
  return history.slice(-MAX_HISTORY_TURNS).map((t) => ({
    role: t.role,
    content: t.content.length > MAX_TURN_CHARS ? `${t.content.slice(0, MAX_TURN_CHARS)}…` : t.content,
  }));
}

export async function sendChat(
  payload: ChatSendPayload,
  deps: SendChatDeps,
): Promise<{ sessionId: string }> {
  const requestId = payload.requestId;
  const { send } = deps;
  const prefs = await deps.getPrefs();
  const modelId = payload.modelId ?? prefs.ai?.llmModelId ?? DEFAULT_LLM_MODEL_ID;
  const cloudDef = prefs.ai?.cloudModels?.find((m) => m.id === modelId);
  // The user's per-model settings (Settings → Ask AI), defaults applied.
  const config = resolveLlmConfig(
    modelId,
    prefs.ai?.llmConfigs?.[modelId],
    cloudDef ? CLOUD_CONFIG_LIMITS : undefined,
  );
  if (cloudDef) {
    // Cloud windows dwarf local ones; contextSize only steers how much file
    // content buildChat packs (the provider allocates its own window).
    const cap = Math.min(
      cloudDef.ctx ?? CLOUD_RESEARCH_CONTEXT_TOKENS,
      payload.mode === 'research' ? CLOUD_RESEARCH_CONTEXT_TOKENS : CLOUD_CONTEXT_TOKENS,
    );
    config.contextSize = Math.max(config.contextSize, cap);
  } else if (payload.mode === 'research') {
    // Research (the maximized page) leans on context: open the window as wide
    // as the model and the config bounds allow so more file content fits.
    const ctxCap = Math.min(8192, (await deps.modelDefOf(modelId))?.ctx ?? 8192);
    config.contextSize = Math.max(config.contextSize, ctxCap);
  }

  // Persist the user's message up front (a fresh conversation mints its
  // session here); the assistant's reply lands when generation settles.
  const sessionId = payload.sessionId ?? randomUUID();
  if (!payload.sessionId) {
    await deps.chats.createSession(
      sessionId,
      deps.chats.titleFor(payload.prompt, payload.command),
      modelId,
    );
  }
  await deps.chats.appendMessage(sessionId, {
    role: 'user',
    content: payload.prompt,
    command: payload.command,
    mentions: payload.mentions,
  });

  try {
    const built = await deps.buildChat(payload, deps.contextDeps, {
      contextTokens: config.contextSize,
    });
    if (built.hits) send({ requestId, type: 'sources', hits: built.hits });

    // The user's standing instructions ride along with the system prompt.
    let system = `${built.system} ${TOOLS_SYSTEM}`;
    if (payload.cwd) system += `\nThe folder currently open in the browser: ${payload.cwd}`;
    if (config.systemPrompt) {
      system += `\n\nAdditional instructions from the user: ${config.systemPrompt}`;
    }

    const toolCalls: ChatToolCall[] = [];
    let answer: string;

    if (cloudDef) {
      const credentials = await deps.getCredentials(cloudDef.accountId);
      if (!credentials) {
        const label = getCloudProvider(cloudDef.provider)?.label ?? cloudDef.provider;
        throw Object.assign(
          new Error(`The ${label} connection is gone — reconnect it in Settings → Ask AI.`),
          { code: 'EAUTH' },
        );
      }
      answer = await deps.cloud({
        def: cloudDef,
        credentials,
        requestId,
        system,
        history: capHistory(payload.history),
        prompt: built.prompt,
        config,
        cwd: payload.cwd,
        toolDeps: deps.toolDeps,
        onChunk: (text) => send({ requestId, type: 'chunk', text }),
        onToolCall: (call) => {
          toolCalls.push(call);
          send({ requestId, type: 'tool', call });
        },
      });
    } else {
      const offChunk = deps.local.onChunk((rid, text) => {
        if (rid === requestId) send({ requestId, type: 'chunk', text });
      });
      // File tools: execute what the model asks for, surface each action to
      // the renderer as it happens, and hand the outcome back to generation.
      const offTool = deps.local.onToolCall((rid, callId, name, params) => {
        if (rid !== requestId) return;
        void executeChatTool(
          name,
          (params ?? {}) as Record<string, unknown>,
          payload.cwd,
          deps.toolDeps,
        ).then(({ call, result }) => {
          toolCalls.push(call);
          send({ requestId, type: 'tool', call });
          deps.local.toolResult(callId, result);
        });
      });
      try {
        answer = await deps.local.chat({
          modelId,
          requestId,
          system,
          history: capHistory(payload.history),
          prompt: built.prompt,
          config,
          tools: true,
        });
      } finally {
        offChunk();
        offTool();
      }
    }

    await deps.chats.appendMessage(sessionId, {
      role: 'assistant',
      content: answer,
      sources: built.hits,
      toolCalls,
    });
    await deps.chats.touchSession(sessionId, modelId);
    send({ requestId, type: 'done' });
    return { sessionId };
  } catch (err) {
    const er = err as Error & { code?: string };
    await deps.chats.touchSession(sessionId, modelId);
    send({
      requestId,
      type: 'error',
      error: { code: er.code ?? 'ELLMFAILED', message: er.message ?? 'Chat failed.' },
    });
    throw err;
  }
}
