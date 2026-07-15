import type { AccountRecord, Prefs } from '@shared/types';
import {
  getCloudProvider,
  llmAccountProvider,
  type CloudLlmProviderId,
  type CloudLlmTestResult,
  type CloudProviderField,
} from '@shared/cloudLlm';

/**
 * Connecting and verifying BYO-key cloud chat providers. Credentials are
 * checked with the cheapest call each provider offers before being persisted
 * to the encrypted accounts store; prefs only ever hold non-secret model
 * metadata. Dependencies are injected so tests run with a fake fetch and an
 * in-memory store — the real wiring lives in llm/handlers.ts.
 */

export interface CloudAccountsDeps {
  fetchFn: typeof fetch;
  saveAccount(
    provider: string,
    label: string,
    options: Record<string, string>,
  ): Promise<AccountRecord>;
  deleteAccount(accountId: string): Promise<void>;
  getPrefs(): Promise<Prefs>;
  setPrefs(patch: Partial<Prefs>): Promise<void>;
  /**
   * Bedrock reachability check (ListFoundationModels with resolved AWS
   * credentials) — injected because it rides on the AWS SDK, not fetch.
   * Resolves like {@link verifyCredentials}; throws coded errors the same way.
   */
  bedrockCheck(options: Record<string, string>): Promise<CloudLlmTestResult>;
}

const err = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code });

/** Whether a field applies given the values entered so far (showWhen). */
function fieldApplies(field: CloudProviderField, options: Record<string, string>): boolean {
  return !field.showWhen || options[field.showWhen.key] === field.showWhen.value;
}

/**
 * Check the submitted options against the provider's field spec and return
 * a trimmed copy carrying only known, applicable, non-empty fields.
 */
export function validateOptions(
  providerId: string,
  options: Record<string, string>,
): { provider: CloudLlmProviderId; options: Record<string, string> } {
  const def = getCloudProvider(providerId);
  if (!def) throw err('EINVAL', `Unknown cloud provider: '${providerId}'.`);
  const clean: Record<string, string> = {};
  for (const field of def.fields) {
    const raw = options[field.key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!fieldApplies(field, options)) continue;
    if (!value) {
      if (!field.optional && !field.choices) {
        throw err('EINVAL', `${def.label} needs a ${field.label.toLowerCase()}.`);
      }
      continue;
    }
    if (field.choices && !field.choices.includes(value)) {
      throw err('EINVAL', `Invalid ${field.label.toLowerCase()}: '${value}'.`);
    }
    clean[field.key] = value;
  }
  return { provider: def.id, options: clean };
}

/** Display label for a connection, e.g. 'Bedrock · us-east-1'. */
export function labelFor(provider: CloudLlmProviderId, options: Record<string, string>): string {
  switch (provider) {
    case 'anthropic':
      return 'Anthropic';
    case 'openai':
      return options.baseURL ? `OpenAI · ${hostOf(options.baseURL)}` : 'OpenAI';
    case 'google':
      return 'Google';
    case 'bedrock':
      return `Bedrock · ${options.region}`;
    case 'openai-compat':
      return options.name || hostOf(options.baseURL);
  }
}

function hostOf(url: string | undefined): string {
  try {
    return new URL(url ?? '').host || 'custom endpoint';
  } catch {
    return 'custom endpoint';
  }
}

/** A fetch that fails fast and turns network trouble into a friendly EOFFLINE. */
async function probe(
  deps: CloudAccountsDeps,
  label: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await deps.fetchFn(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw err('EOFFLINE', `Couldn't reach ${label} — check your connection and the URL.`);
  }
}

/**
 * The cheapest credentials check each provider offers. Resolves with
 * `unverified: true` when the endpoint gives no way to verify (a compat
 * server without /models); throws EAUTH/EOFFLINE/EINVAL otherwise.
 */
export async function verifyCredentials(
  provider: CloudLlmProviderId,
  options: Record<string, string>,
  deps: CloudAccountsDeps,
): Promise<CloudLlmTestResult> {
  switch (provider) {
    case 'anthropic': {
      const res = await probe(deps, 'Anthropic', 'https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': options.apiKey, 'anthropic-version': '2023-06-01' },
      });
      if (res.status === 401 || res.status === 403) {
        throw err('EAUTH', 'Anthropic rejected the API key.');
      }
      if (!res.ok) throw err('EAUTH', `Anthropic answered ${res.status} — check the key.`);
      return { ok: true };
    }
    case 'openai': {
      const base = (options.baseURL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
      const res = await probe(deps, 'OpenAI', `${base}/models`, {
        headers: { Authorization: `Bearer ${options.apiKey}` },
      });
      if (res.status === 401 || res.status === 403) {
        throw err('EAUTH', 'OpenAI rejected the API key.');
      }
      if (!res.ok) throw err('EAUTH', `OpenAI answered ${res.status} — check the key.`);
      return { ok: true };
    }
    case 'google': {
      const res = await probe(
        deps,
        'Google',
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(options.apiKey)}&pageSize=1`,
      );
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw err('EAUTH', 'Google rejected the API key.');
      }
      if (!res.ok) throw err('EAUTH', `Google answered ${res.status} — check the key.`);
      return { ok: true };
    }
    case 'bedrock':
      return deps.bedrockCheck(options);
    case 'openai-compat': {
      const name = options.name || 'the endpoint';
      const base = (options.baseURL ?? '').replace(/\/+$/, '');
      if (!/^https?:\/\//.test(base)) {
        throw err('EINVAL', 'The base URL must start with http:// or https://.');
      }
      const res = await probe(deps, name, `${base}/models`, {
        headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : undefined,
      });
      if (res.status === 401 || res.status === 403) {
        throw err('EAUTH', `${name} rejected the API key.`);
      }
      // Many compat servers don't implement /models — save anyway; the real
      // proof is the per-model Test button (an actual generation).
      if (res.status === 404 || res.status === 405) {
        return { ok: true, unverified: true, message: 'Saved — this endpoint has no /models to verify against.' };
      }
      if (!res.ok) throw err('EAUTH', `${name} answered ${res.status}.`);
      return { ok: true };
    }
  }
}

/**
 * Validate, verify, and persist a cloud chat connection. Returns the stored
 * account plus whether verification was only partial.
 */
export async function connectCloudProvider(
  providerId: string,
  rawOptions: Record<string, string>,
  deps: CloudAccountsDeps,
): Promise<{ account: AccountRecord; unverified?: boolean }> {
  const { provider, options } = validateOptions(providerId, rawOptions);
  const check = await verifyCredentials(provider, options, deps);
  const account = await deps.saveAccount(
    llmAccountProvider(provider),
    labelFor(provider, options),
    options,
  );
  return check.unverified ? { account, unverified: true } : { account };
}

/**
 * Remove a cloud chat account and every model that referenced it, so the
 * picker never offers a model whose credentials are gone.
 */
export async function disconnectCloudAccount(
  accountId: string,
  deps: CloudAccountsDeps,
): Promise<void> {
  await deps.deleteAccount(accountId);
  const prefs = await deps.getPrefs();
  const ai = prefs.ai;
  if (!ai?.cloudModels?.some((m) => m.accountId === accountId)) return;
  const cloudModels = ai.cloudModels.filter((m) => m.accountId !== accountId);
  const llmConfigs = { ...ai.llmConfigs };
  for (const m of ai.cloudModels) {
    if (m.accountId === accountId) delete llmConfigs[m.id];
  }
  // A removed model can't stay selected; fall back to the local default choice.
  const llmModelId = ai.cloudModels.some(
    (m) => m.accountId === accountId && m.id === ai.llmModelId,
  )
    ? undefined
    : ai.llmModelId;
  await deps.setPrefs({ ai: { ...ai, cloudModels, llmConfigs, llmModelId } });
}
