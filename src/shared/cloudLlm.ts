/**
 * Optional BYO-key cloud chat providers. FilDOS is local-first — indexing,
 * embeddings, search and the Canvas graph always run on-device — but the
 * Assistant chat can optionally talk to a cloud model with the user's own
 * API key. This module is the shared catalog: which providers exist, what
 * credentials each needs (drives the Settings form), and how a user-added
 * cloud model is described. Credentials themselves are never stored here or
 * in prefs — they live encrypted in the accounts table (OS keychain via
 * safeStorage); prefs only hold the non-secret {@link CloudModelDef} metadata.
 */
import type { LlmModelFamily } from './llmModels';

export type CloudLlmProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'bedrock'
  | 'openai-compat';

/**
 * Cloud-LLM accounts share the accounts table with cloud *storage* accounts
 * (Google Drive, S3, …), which the sidebar renders as drives. The `llm-`
 * prefix keeps the two worlds apart: storage UI filters these out, and the
 * LLM channels only ever touch rows carrying it.
 */
export const LLM_ACCOUNT_PREFIX = 'llm-';

/** The accounts-table `provider` value for a cloud LLM connection. */
export const llmAccountProvider = (id: CloudLlmProviderId): string =>
  `${LLM_ACCOUNT_PREFIX}${id}`;

export const isLlmAccountProvider = (provider: string): boolean =>
  provider.startsWith(LLM_ACCOUNT_PREFIX);

/** The CloudLlmProviderId behind an accounts-table provider value, if any. */
export function cloudProviderOfAccount(provider: string): CloudLlmProviderId | null {
  if (!isLlmAccountProvider(provider)) return null;
  const id = provider.slice(LLM_ACCOUNT_PREFIX.length) as CloudLlmProviderId;
  return CLOUD_PROVIDERS.some((p) => p.id === id) ? id : null;
}

/** One credential/config field a provider's connect form asks for. */
export interface CloudProviderField {
  /** Key in the stored options object, e.g. 'apiKey'. */
  key: string;
  label: string;
  /** Render as a password input and never echo the value back. */
  secret?: boolean;
  optional?: boolean;
  placeholder?: string;
  /** Render as a fixed set of choices instead of free text. */
  choices?: string[];
  /** Only show (and require) this field when another field has this value. */
  showWhen?: { key: string; value: string };
}

export interface CloudProviderDef {
  id: CloudLlmProviderId;
  label: string;
  /** Model family used for the logo of models added under this provider. */
  family: LlmModelFamily;
  /** Connect-form fields, in display order. */
  fields: CloudProviderField[];
  /** One-line hint under the provider picker. */
  hint: string;
}

export const CLOUD_PROVIDERS: CloudProviderDef[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    family: 'anthropic',
    hint: 'Claude models via the Anthropic API.',
    fields: [
      { key: 'apiKey', label: 'API key', secret: true, placeholder: 'sk-ant-…' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    family: 'openai',
    hint: 'GPT models via the OpenAI API.',
    fields: [
      { key: 'apiKey', label: 'API key', secret: true, placeholder: 'sk-…' },
      {
        key: 'baseURL',
        label: 'Base URL',
        optional: true,
        placeholder: 'https://api.openai.com/v1 (leave empty for default)',
      },
    ],
  },
  {
    id: 'google',
    label: 'Google',
    family: 'google',
    hint: 'Gemini models via the Google AI API.',
    fields: [
      { key: 'apiKey', label: 'API key', secret: true, placeholder: 'AIza…' },
    ],
  },
  {
    id: 'bedrock',
    label: 'AWS Bedrock',
    family: 'bedrock',
    hint: 'Any model enabled in your AWS account, via your keys or AWS profile.',
    fields: [
      { key: 'region', label: 'Region', placeholder: 'us-east-1' },
      { key: 'authMode', label: 'Authentication', choices: ['profile', 'keys'] },
      {
        key: 'profile',
        label: 'AWS profile',
        optional: true,
        placeholder: 'default (from ~/.aws — SSO and env credentials work too)',
        showWhen: { key: 'authMode', value: 'profile' },
      },
      {
        key: 'accessKeyId',
        label: 'Access key ID',
        placeholder: 'AKIA…',
        showWhen: { key: 'authMode', value: 'keys' },
      },
      {
        key: 'secretAccessKey',
        label: 'Secret access key',
        secret: true,
        showWhen: { key: 'authMode', value: 'keys' },
      },
      {
        key: 'sessionToken',
        label: 'Session token',
        secret: true,
        optional: true,
        showWhen: { key: 'authMode', value: 'keys' },
      },
    ],
  },
  {
    id: 'openai-compat',
    label: 'OpenAI-compatible',
    family: 'openai-compat',
    hint: 'Any endpoint speaking the OpenAI API — OpenRouter, Groq, Together, a local server…',
    fields: [
      { key: 'name', label: 'Name', placeholder: 'OpenRouter' },
      { key: 'baseURL', label: 'Base URL', placeholder: 'https://openrouter.ai/api/v1' },
      { key: 'apiKey', label: 'API key', secret: true, optional: true },
    ],
  },
];

export function getCloudProvider(id: string): CloudProviderDef | undefined {
  return CLOUD_PROVIDERS.find((p) => p.id === id);
}

/**
 * A user-added cloud chat model. Lives in `prefs.ai.cloudModels` (metadata
 * only — the credentials are in the account it references) and shows up in
 * the model picker beside the local catalog, always "ready".
 */
export interface CloudModelDef {
  /** Stable id, `cloud-…` — never collides with catalog or `custom-` GGUF ids. */
  id: string;
  provider: CloudLlmProviderId;
  /** Accounts-table row holding this model's credentials. */
  accountId: string;
  /** The provider's model id, e.g. 'claude-sonnet-5' or a Bedrock inference profile. */
  remoteId: string;
  label: string;
  family: LlmModelFamily;
  /** Advertised context window (tokens), when known — widens the file-context budget. */
  ctx?: number;
}

export const isCloudModelId = (id: string): boolean => id.startsWith('cloud-');

/** Build the def for a model the user added under a connected account. */
export function makeCloudModelDef(
  provider: CloudLlmProviderId,
  accountId: string,
  remoteId: string,
  label?: string,
): CloudModelDef | null {
  const remote = remoteId.trim();
  if (!remote || /\s/.test(remote)) return null;
  const slug = remote
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!slug) return null;
  const def = getCloudProvider(provider);
  return {
    // The account fragment keeps two endpoints serving the same model id apart.
    id: `cloud-${accountId.slice(0, 8)}-${slug}`,
    provider,
    accountId,
    remoteId: remote,
    label: label?.trim() || remote,
    family: def?.family ?? 'custom',
  };
}

/**
 * Starter models offered as one-click chips under a connected account.
 * Free-text entry is always available beside them — Bedrock ids vary by
 * region and enabled inference profiles, and compat endpoints serve anything.
 */
export const CLOUD_MODEL_SUGGESTIONS: Record<
  CloudLlmProviderId,
  { remoteId: string; label: string }[]
> = {
  anthropic: [
    { remoteId: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
    { remoteId: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { remoteId: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  openai: [
    { remoteId: 'gpt-5.1', label: 'GPT-5.1' },
    { remoteId: 'gpt-5-mini', label: 'GPT-5 mini' },
    { remoteId: 'gpt-5-nano', label: 'GPT-5 nano' },
  ],
  google: [
    { remoteId: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { remoteId: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
  bedrock: [],
  'openai-compat': [],
};

/** Placeholder for the free-text model input, per provider. */
export const CLOUD_MODEL_PLACEHOLDER: Record<CloudLlmProviderId, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.1',
  google: 'gemini-2.5-flash',
  bedrock: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  'openai-compat': 'the model id your endpoint serves',
};

/**
 * Whether a model runs on the provider's default sampling: current Anthropic
 * models (also behind Bedrock) reject explicit temperature/top-p, so the
 * engine never sends them and Settings hides the sliders.
 */
export function usesProviderDefaultSampling(
  provider: CloudLlmProviderId,
  remoteId: string,
): boolean {
  return (
    provider === 'anthropic' ||
    (provider === 'bedrock' && /anthropic|claude/i.test(remoteId))
  );
}

/** Outcome of a connection or per-model test. */
export interface CloudLlmTestResult {
  ok: boolean;
  message?: string;
  /**
   * Saved without proof: the endpoint had no cheap way to verify credentials
   * (compat servers without /models, Bedrock keys lacking ListFoundationModels).
   */
  unverified?: boolean;
}
