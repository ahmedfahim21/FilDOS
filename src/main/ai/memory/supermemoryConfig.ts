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
