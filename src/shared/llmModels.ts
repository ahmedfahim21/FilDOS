/**
 * The catalog of on-device chat (LLM) models, shared by the main process (the
 * LLM worker downloads and loads them) and the renderer (the Assistant's model
 * picker lists them). Each model is a GGUF checkpoint pulled from Hugging Face
 * by node-llama-cpp's downloader and run fully offline afterwards.
 *
 * The built-ins span tiny (1B) to heavyweight (9B); the recommendation logic
 * steers users to what their machine can carry, since chat runs beside the
 * embedding worker and the indexer. One model is resident in RAM at a time;
 * switching models unloads the previous one. Users can also add any GGUF from
 * the internet via {@link parseCustomModelInput} (stored in prefs, not here).
 */
/** Model family, for grouping and (eventually) a logo per family in the UI. */
export type LlmModelFamily = 'llama' | 'qwen' | 'gemma' | 'phi' | 'mistral' | 'smollm' | 'custom';

export interface LlmModelDef {
  /** Stable catalog id (also the on-disk folder key), e.g. 'llama-3.2-1b'. */
  id: string;
  /** Short display name for the picker. */
  label: string;
  /** node-llama-cpp model URI (`hf:owner/repo[:quant]`) or a direct .gguf URL. */
  uri: string;
  /** Approximate download size in MB (0 = unknown until download, for custom models). */
  sizeMb: number;
  /** Context window (tokens) to allocate — bounded so RAM stays predictable. */
  ctx: number;
  /** One-line description for the picker. */
  description: string;
  /** Family key for logos/grouping ('custom' for user-added models). */
  family: LlmModelFamily;
}

export const LLM_MODELS: LlmModelDef[] = [
  {
    id: 'smollm2-1.7b',
    family: 'smollm',
    label: 'SmolLM2 1.7B',
    uri: 'hf:bartowski/SmolLM2-1.7B-Instruct-GGUF:Q4_K_M',
    sizeMb: 1060,
    ctx: 4096,
    description: 'Tiny and quick — fine for short questions on modest machines.',
  },
  {
    id: 'llama-3.2-1b',
    family: 'llama',
    label: 'Llama 3.2 1B',
    uri: 'hf:bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M',
    sizeMb: 810,
    ctx: 4096,
    description: 'Fast and light — a good default for quick questions.',
  },
  {
    id: 'qwen-2.5-1.5b',
    family: 'qwen',
    label: 'Qwen 2.5 1.5B',
    uri: 'hf:bartowski/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M',
    sizeMb: 990,
    ctx: 4096,
    description: 'Strong at summaries and structured answers for its size.',
  },
  {
    id: 'gemma-2-2b',
    family: 'gemma',
    label: 'Gemma 2 2B',
    uri: 'hf:bartowski/gemma-2-2b-it-GGUF:Q4_K_M',
    sizeMb: 1710,
    ctx: 4096,
    description: 'Balanced quality and speed for everyday file questions.',
  },
  {
    id: 'llama-3.2-3b',
    family: 'llama',
    label: 'Llama 3.2 3B',
    uri: 'hf:bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M',
    sizeMb: 2020,
    ctx: 4096,
    description: 'A solid all-rounder when you have a few GB to spare.',
  },
  {
    id: 'qwen-2.5-3b',
    family: 'qwen',
    label: 'Qwen 2.5 3B',
    uri: 'hf:bartowski/Qwen2.5-3B-Instruct-GGUF:Q4_K_M',
    sizeMb: 1930,
    ctx: 4096,
    description: 'Great summaries and multilingual answers in the 3B class.',
  },
  {
    id: 'qwen-2.5-coder-3b',
    family: 'qwen',
    label: 'Qwen 2.5 Coder 3B',
    uri: 'hf:bartowski/Qwen2.5-Coder-3B-Instruct-GGUF:Q4_K_M',
    sizeMb: 1930,
    ctx: 4096,
    description: 'Tuned for source code — best for explaining repositories.',
  },
  {
    id: 'phi-3.5-mini',
    family: 'phi',
    label: 'Phi 3.5 Mini',
    uri: 'hf:bartowski/Phi-3.5-mini-instruct-GGUF:Q4_K_M',
    sizeMb: 2390,
    ctx: 4096,
    description: 'Punches above its size on reasoning-style questions.',
  },
  {
    id: 'mistral-7b',
    family: 'mistral',
    label: 'Mistral 7B',
    uri: 'hf:bartowski/Mistral-7B-Instruct-v0.3-GGUF:Q4_K_M',
    sizeMb: 4370,
    ctx: 4096,
    description: 'A classic mid-size model — needs a roomier machine.',
  },
  {
    id: 'qwen-2.5-7b',
    family: 'qwen',
    label: 'Qwen 2.5 7B',
    uri: 'hf:bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M',
    sizeMb: 4680,
    ctx: 4096,
    description: 'High-quality answers across languages; heavy on RAM.',
  },
  {
    id: 'llama-3.1-8b',
    family: 'llama',
    label: 'Llama 3.1 8B',
    uri: 'hf:bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M',
    sizeMb: 4920,
    ctx: 4096,
    description: 'The most capable built-in — for machines with 24 GB+.',
  },
  {
    id: 'gemma-2-9b',
    family: 'gemma',
    label: 'Gemma 2 9B',
    uri: 'hf:bartowski/gemma-2-9b-it-GGUF:Q4_K_M',
    sizeMb: 5760,
    ctx: 4096,
    description: 'Excellent quality, the heaviest of the built-ins.',
  },
];

export const DEFAULT_LLM_MODEL_ID = 'llama-3.2-1b';

export function getLlmModelDef(id: string): LlmModelDef | undefined {
  return LLM_MODELS.find((m) => m.id === id);
}

/**
 * User-tunable generation settings for one chat model — the knobs
 * node-llama-cpp actually honors per prompt (sampling + budget) plus extra
 * standing instructions appended to the system prompt. Stored per model in
 * `prefs.ai.llmConfigs` as a partial; resolve with {@link resolveLlmConfig}.
 */
export interface LlmModelConfig {
  /** Sampling temperature — lower is more factual, higher more creative. */
  temperature: number;
  /** Nucleus sampling cutoff. */
  topP: number;
  /** Longest allowed answer, in tokens. */
  maxTokens: number;
  /** Context window to allocate, in tokens (more = more file content, more RAM). */
  contextSize: number;
  /** Standing instructions appended to the Assistant's system prompt. */
  systemPrompt: string;
}

/** Slider ranges for the Settings UI and clamping. */
export const LLM_CONFIG_LIMITS = {
  temperature: { min: 0, max: 1.5, step: 0.05 },
  topP: { min: 0.1, max: 1, step: 0.05 },
  maxTokens: { min: 128, max: 2048, step: 64 },
  contextSize: { min: 1024, max: 8192, step: 1024 },
} as const;

/** Longest accepted custom instructions. */
export const LLM_SYSTEM_PROMPT_MAX = 500;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** The out-of-the-box settings for a model. */
export function defaultLlmConfig(modelId: string): LlmModelConfig {
  return {
    temperature: 0.3,
    topP: 0.9,
    maxTokens: 1024,
    contextSize: getLlmModelDef(modelId)?.ctx ?? 4096,
    systemPrompt: '',
  };
}

/** Merge a stored partial config over the defaults, clamping every field. */
export function resolveLlmConfig(
  modelId: string,
  stored?: Partial<LlmModelConfig>,
): LlmModelConfig {
  const base = defaultLlmConfig(modelId);
  const L = LLM_CONFIG_LIMITS;
  return {
    temperature: clamp(stored?.temperature ?? base.temperature, L.temperature.min, L.temperature.max),
    topP: clamp(stored?.topP ?? base.topP, L.topP.min, L.topP.max),
    maxTokens: Math.round(clamp(stored?.maxTokens ?? base.maxTokens, L.maxTokens.min, L.maxTokens.max)),
    contextSize: Math.round(
      clamp(stored?.contextSize ?? base.contextSize, L.contextSize.min, L.contextSize.max),
    ),
    systemPrompt: (stored?.systemPrompt ?? '').slice(0, LLM_SYSTEM_PROMPT_MAX),
  };
}

/**
 * What the machine can run, probed by the LLM worker: llama.cpp's GPU backend
 * and the memory it sees (on Apple Silicon, VRAM ≈ unified memory).
 */
export interface LlmSystemSpecs {
  /** Active GPU backend ('metal' | 'cuda' | 'vulkan'), or null when CPU-only. */
  gpu: string | null;
  /** Memory visible to the GPU backend, in MB (0 when CPU-only). */
  vramMb: number;
  /** Total system RAM, in MB. */
  ramMb: number;
  cpus: number;
  arch: string;
}

/**
 * The catalog model this machine should run: the largest one that fits its
 * memory with comfortable headroom for the OS, the app, and the context
 * buffer. GPU machines budget against VRAM (unified memory on Apple Silicon);
 * CPU-only machines against RAM.
 */
export function recommendLlmModel(specs: LlmSystemSpecs): string {
  const budgetGb = (specs.gpu ? Math.max(specs.vramMb, specs.ramMb / 2) : specs.ramMb) / 1024;
  if (budgetGb >= 24) return 'llama-3.1-8b';
  if (budgetGb >= 16) return 'llama-3.2-3b';
  if (budgetGb >= 11) return 'gemma-2-2b';
  if (budgetGb >= 8) return 'qwen-2.5-1.5b';
  return 'llama-3.2-1b';
}

// ---------------------------------------------------------------------------
// Custom models (user-added, from the internet)
// ---------------------------------------------------------------------------

/**
 * Parse what a user pasted into a model definition, or null when it isn't a
 * usable reference. Accepted forms (everything node-llama-cpp can download):
 *
 *   hf:owner/repo             — Hugging Face repo, best quant auto-picked
 *   hf:owner/repo:Q4_K_M      — Hugging Face repo, explicit quant
 *   owner/repo[:quant]        — same, 'hf:' implied
 *   https://…/model.gguf      — direct GGUF download URL
 *
 * The id is a stable slug of the source (also the on-disk folder name);
 * size is unknown (0) until the downloader resolves the file.
 */
export function parseCustomModelInput(input: string): LlmModelDef | null {
  const raw = input.trim();
  if (!raw) return null;

  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  const build = (uri: string, label: string, source: string): LlmModelDef => ({
    id: `custom-${slug(uri.replace(/^hf:/, '').replace(/^https?:\/\//, ''))}`,
    label,
    uri,
    sizeMb: 0,
    ctx: 4096,
    description: `Custom model — ${source}`,
    family: 'custom',
  });

  // Direct GGUF URL.
  if (/^https?:\/\/\S+\.gguf(\?\S*)?$/i.test(raw)) {
    const base = decodeURIComponent(raw.split('?')[0].split('/').pop() ?? 'model.gguf');
    return build(raw, base.replace(/\.gguf$/i, ''), 'direct download');
  }

  // Hugging Face reference, with or without the hf: scheme and quant.
  const m = /^(?:hf:)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?::([A-Za-z0-9_.-]+))?$/.exec(raw);
  if (!m) return null;
  const [, owner, repo, quant] = m;
  const uri = `hf:${owner}/${repo}${quant ? `:${quant}` : ''}`;
  const label = `${repo.replace(/-gguf$/i, '')}${quant ? ` · ${quant}` : ''}`;
  return build(uri, label, `${owner}/${repo}`);
}

/**
 * The Assistant's slash commands. Each command is a prompt recipe: `find` runs
 * a semantic search first and hands the hits to the model; the others shape how
 * the mentioned files/folders (or the current folder) are used.
 */
export type ChatCommandId = 'summarize' | 'find' | 'explain' | 'compare';

export interface ChatCommandDef {
  id: ChatCommandId;
  /** Usage hint shown in the composer's command popup. */
  hint: string;
  description: string;
}

export const CHAT_COMMANDS: ChatCommandDef[] = [
  {
    id: 'summarize',
    hint: '/summarize @file or #folder',
    description: 'Summarize the mentioned files or folder.',
  },
  {
    id: 'find',
    hint: '/find what you remember about it',
    description: 'Search your indexed files by meaning and answer from the hits.',
  },
  {
    id: 'explain',
    hint: '/explain @file',
    description: 'Explain what a file is and what it contains.',
  },
  {
    id: 'compare',
    hint: '/compare @one @two',
    description: 'Compare two or more mentioned files.',
  },
];

export function getChatCommand(id: string): ChatCommandDef | undefined {
  return CHAT_COMMANDS.find((c) => c.id === id);
}
