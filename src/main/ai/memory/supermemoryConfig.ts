/**
 * Pure configuration helpers for the supermemory daemon — no Electron, so they
 * unit-test directly. The Electron glue (paths, spawn, prefs) lives in
 * `lifecycle.ts` and builds on these.
 */

/** LLM env vars the daemon understands (a native key, or an Ollama base URL). */
export const SUPERMEMORY_LLM_KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'OPENAI_FAST_MODEL',
  'OPENAI_TEXT_MODEL',
] as const;

/** The keys that, if present, mean a model provider is configured. */
const PROVIDER_KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'OPENAI_BASE_URL', // Ollama / LM Studio / vLLM style local endpoint
] as const;

/**
 * Collect the daemon's LLM env from a source (e.g. `process.env` and, later,
 * Settings-provided values). Returns null when no provider is configured — the
 * daemon can't boot without one (confirmed live), so callers must not start it.
 */
export function resolveLlmEnv(
  source: Record<string, string | undefined>,
): Record<string, string> | null {
  const env: Record<string, string> = {};
  for (const key of SUPERMEMORY_LLM_KEYS) {
    const value = source[key];
    if (value) env[key] = value;
  }
  const hasProvider = PROVIDER_KEYS.some((key) => env[key]);
  return hasProvider ? env : null;
}

const DEFAULT_OLLAMA_URL = 'http://localhost:11434/v1';

/** The stored LLM config plus its (main-only) key. */
export interface StoredLlmConfig {
  provider: 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'groq';
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

/**
 * Map a user's LLM choice to the daemon's env. Local Ollama never needs a key
 * (a dummy `OPENAI_API_KEY=ollama` + base URL); cloud providers require a key
 * and return null without one, so the caller won't start a daemon that can't
 * authenticate. Model, when set, is passed as `OPENAI_MODEL` for every provider
 * (the daemon's convention).
 */
export function buildLlmEnv(config: StoredLlmConfig): Record<string, string> | null {
  const env: Record<string, string> = {};
  const model = config.model?.trim();
  const baseUrl = config.baseUrl?.trim();
  if (model) env.OPENAI_MODEL = model;

  if (config.provider === 'ollama') {
    env.OPENAI_BASE_URL = baseUrl || DEFAULT_OLLAMA_URL;
    env.OPENAI_API_KEY = 'ollama'; // any non-empty string for local runners
    return env;
  }

  if (!config.apiKey) return null; // cloud provider without a key can't boot

  switch (config.provider) {
    case 'openai':
      env.OPENAI_API_KEY = config.apiKey;
      if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
      return env;
    case 'anthropic':
      env.ANTHROPIC_API_KEY = config.apiKey;
      return env;
    case 'gemini':
      env.GEMINI_API_KEY = config.apiKey;
      return env;
    case 'groq':
      env.GROQ_API_KEY = config.apiKey;
      return env;
    default:
      return null;
  }
}
