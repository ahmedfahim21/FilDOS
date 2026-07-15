/**
 * The catalog of on-device chat (LLM) models, shared by the main process (the
 * LLM worker downloads and loads them) and the renderer (the Assistant's model
 * picker lists them). Each model is a GGUF checkpoint pulled from Hugging Face
 * by node-llama-cpp's downloader and run fully offline afterwards.
 *
 * The built-ins span tiny (0.6B) to heavyweight (35B MoE); the recommendation logic
 * steers users to what their machine can carry, since chat runs beside the
 * embedding worker and the indexer. One model is resident in RAM at a time;
 * switching models unloads the previous one. Users can also add any GGUF from
 * the internet via {@link parseCustomModelInput} (stored in prefs, not here).
 */
/**
 * Model family, for grouping and a logo per family in the UI. The last five
 * are cloud providers (see `@shared/cloudLlm`) — models added under a BYO-key
 * connection carry their provider as the family.
 */
export type LlmModelFamily =
  | 'llama'
  | 'qwen'
  | 'gemma'
  | 'phi'
  | 'mistral'
  | 'smollm'
  | 'deepseek'
  | 'granite'
  | 'lfm'
  | 'custom'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'bedrock'
  | 'openai-compat';

/**
 * What the checkpoint can take as input. 'vision' means the source repo ships
 * multimodal weights (an mmproj projector exists for it) — shown as a badge so
 * users know what a model is built for. Image input in chat itself is a
 * separate, future step; every model answers text either way.
 */
export type LlmModality = 'text' | 'vision';

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
  /** Input capability badge; absent means 'text' (all pre-existing/custom defs). */
  modality?: LlmModality;
}

/** Where to browse for more GGUF chat models (linked from Settings). */
export const HF_GGUF_MODELS_URL =
  'https://huggingface.co/models?pipeline_tag=text-generation&library=gguf&sort=trending';

/**
 * The built-in catalog, grouped by family. Every uri was verified against the
 * Hugging Face API (repo exists + the named quant file is present); sizes are
 * the actual quant file sizes. Q4_K_M everywhere it exists, with a couple of
 * per-repo exceptions noted inline.
 */
export const LLM_MODELS: LlmModelDef[] = [
  // --- Llama (Meta) ---
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
    id: 'llama-3.2-3b',
    family: 'llama',
    label: 'Llama 3.2 3B',
    uri: 'hf:bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M',
    sizeMb: 2020,
    ctx: 4096,
    description: 'A solid all-rounder when you have a few GB to spare.',
  },
  {
    id: 'llama-3-8b',
    family: 'llama',
    label: 'Llama 3 8B',
    uri: 'hf:bartowski/Meta-Llama-3-8B-Instruct-GGUF:Q4_K_M',
    sizeMb: 4693,
    ctx: 4096,
    description: "Previous-generation 8B from Meta — still a capable generalist.",
  },
  {
    id: 'llama-3.1-8b',
    family: 'llama',
    label: 'Llama 3.1 8B',
    uri: 'hf:bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M',
    sizeMb: 4920,
    ctx: 4096,
    description: 'General-purpose 8B from Meta — for machines with 24 GB+.',
  },
  {
    id: 'llava-llama3-8b',
    family: 'llama',
    label: 'LLaVA Llama 3 8B',
    modality: 'vision',
    // The int4 file directly — the repo's quants don't follow bartowski naming.
    uri: 'https://huggingface.co/xtuner/llava-llama-3-8b-v1_1-gguf/resolve/main/llava-llama-3-8b-v1_1-int4.gguf',
    sizeMb: 4693,
    ctx: 4096,
    description: 'Vision-language model built on Llama 3 with LLaVA tuning.',
  },

  // --- Qwen (Alibaba) ---
  {
    id: 'qwen3.5-0.8b',
    family: 'qwen',
    label: 'Qwen 3.5 0.8B',
    modality: 'vision',
    uri: 'hf:unsloth/Qwen3.5-0.8B-GGUF:Q4_K_M',
    sizeMb: 508,
    ctx: 4096,
    description: 'Smallest Qwen 3.5 — for lightweight, instant answers.',
  },
  {
    id: 'qwen3.5-2b',
    family: 'qwen',
    label: 'Qwen 3.5 2B',
    modality: 'vision',
    uri: 'hf:unsloth/Qwen3.5-2B-GGUF:Q4_K_M',
    sizeMb: 1222,
    ctx: 4096,
    description: 'Compact 2B general-purpose model from the Qwen 3.5 family.',
  },
  {
    id: 'qwen3.5-4b',
    family: 'qwen',
    label: 'Qwen 3.5 4B',
    modality: 'vision',
    uri: 'hf:unsloth/Qwen3.5-4B-GGUF:Q4_K_M',
    sizeMb: 2614,
    ctx: 4096,
    description: 'Mid-sized Qwen 3.5 — a strong quality/speed balance.',
  },
  {
    id: 'qwen3.5-9b',
    family: 'qwen',
    label: 'Qwen 3.5 9B',
    modality: 'vision',
    uri: 'hf:unsloth/Qwen3.5-9B-GGUF:Q4_K_M',
    sizeMb: 5417,
    ctx: 4096,
    description: 'Best all-around performance in the Qwen 3.5 family.',
  },
  {
    id: 'qwen3.5-27b',
    family: 'qwen',
    label: 'Qwen 3.5 27B',
    modality: 'vision',
    uri: 'hf:unsloth/Qwen3.5-27B-GGUF:Q4_K_M',
    sizeMb: 15965,
    ctx: 4096,
    description: 'Large Qwen 3.5 — a substantial capability jump over 9B.',
  },
  {
    id: 'qwen3.5-35b-a3b',
    family: 'qwen',
    label: 'Qwen 3.5 35B A3B',
    modality: 'vision',
    uri: 'hf:unsloth/Qwen3.5-35B-A3B-GGUF:Q4_K_M',
    sizeMb: 20996,
    ctx: 4096,
    description: '35B mixture-of-experts with 3B active — efficient for its size.',
  },
  {
    id: 'qwen3-vl-2b-instruct',
    family: 'qwen',
    label: 'Qwen3 VL 2B Instruct',
    modality: 'vision',
    uri: 'hf:unsloth/Qwen3-VL-2B-Instruct-GGUF:Q4_K_M',
    sizeMb: 1056,
    ctx: 4096,
    description: '2B vision-language instruction model for image and text.',
  },
  {
    id: 'qwen3-vl-2b-thinking',
    family: 'qwen',
    label: 'Qwen3 VL 2B Thinking',
    modality: 'vision',
    uri: 'hf:unsloth/Qwen3-VL-2B-Thinking-GGUF:Q4_K_M',
    sizeMb: 1056,
    ctx: 4096,
    description: '2B vision reasoning model with step-by-step thinking.',
  },
  {
    id: 'qwen3-vl-4b-instruct',
    family: 'qwen',
    label: 'Qwen3 VL 4B Instruct',
    modality: 'vision',
    uri: 'hf:unsloth/Qwen3-VL-4B-Instruct-GGUF:Q4_K_M',
    sizeMb: 2382,
    ctx: 4096,
    description: '4B vision-language instruction model.',
  },
  {
    id: 'qwen3-vl-4b-thinking',
    family: 'qwen',
    label: 'Qwen3 VL 4B Thinking',
    modality: 'vision',
    uri: 'hf:unsloth/Qwen3-VL-4B-Thinking-GGUF:Q4_K_M',
    sizeMb: 2382,
    ctx: 4096,
    description: '4B vision reasoning model for complex visual questions.',
  },
  {
    id: 'qwen3-vl-8b-instruct',
    family: 'qwen',
    label: 'Qwen3 VL 8B Instruct',
    modality: 'vision',
    uri: 'hf:unsloth/Qwen3-VL-8B-Instruct-GGUF:Q4_K_M',
    sizeMb: 4795,
    ctx: 4096,
    description: '8B vision-language instruction model — the strongest VL built-in.',
  },
  {
    id: 'qwen3-vl-8b-thinking',
    family: 'qwen',
    label: 'Qwen3 VL 8B Thinking',
    modality: 'vision',
    uri: 'hf:unsloth/Qwen3-VL-8B-Thinking-GGUF:Q4_K_M',
    sizeMb: 4795,
    ctx: 4096,
    description: '8B vision reasoning model for advanced visual and text reasoning.',
  },
  {
    id: 'qwen3-0.6b',
    family: 'qwen',
    label: 'Qwen 3 0.6B',
    // The official Qwen repo ships Q8_0 as its smallest quant — still tiny.
    uri: 'hf:Qwen/Qwen3-0.6B-GGUF:Q8_0',
    sizeMb: 610,
    ctx: 4096,
    description: 'Ultra-lightweight general-purpose model.',
  },
  {
    id: 'qwen3-1.7b',
    family: 'qwen',
    label: 'Qwen 3 1.7B',
    uri: 'hf:unsloth/Qwen3-1.7B-GGUF:Q4_K_M',
    sizeMb: 1056,
    ctx: 4096,
    description: 'Small model balancing speed and capability.',
  },
  {
    id: 'qwen3-4b',
    family: 'qwen',
    label: 'Qwen 3 4B',
    uri: 'hf:Qwen/Qwen3-4B-GGUF:Q4_K_M',
    sizeMb: 2382,
    ctx: 4096,
    description: 'Mid-sized text model from the Qwen 3 generation.',
  },
  {
    id: 'qwen3-8b',
    family: 'qwen',
    label: 'Qwen 3 8B',
    uri: 'hf:Qwen/Qwen3-8B-GGUF:Q4_K_M',
    sizeMb: 4795,
    ctx: 4096,
    description: 'High-performance text model from the Qwen 3 generation.',
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
    id: 'qwen-2.5-7b',
    family: 'qwen',
    label: 'Qwen 2.5 7B',
    uri: 'hf:bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M',
    sizeMb: 4680,
    ctx: 4096,
    description: 'High-quality answers across languages; heavy on RAM.',
  },

  // --- Gemma (Google) ---
  {
    id: 'gemma-4-e2b',
    family: 'gemma',
    label: 'Gemma 4 E2B',
    modality: 'vision',
    uri: 'hf:unsloth/gemma-4-E2B-it-GGUF:Q4_K_M',
    sizeMb: 2963,
    ctx: 4096,
    description: 'Efficient 2B-active mixture-of-experts multimodal model.',
  },
  {
    id: 'gemma-4-e4b',
    family: 'gemma',
    label: 'Gemma 4 E4B',
    modality: 'vision',
    uri: 'hf:unsloth/gemma-4-E4B-it-GGUF:Q4_K_M',
    sizeMb: 4747,
    ctx: 4096,
    description: 'Efficient 4B-active mixture-of-experts with improved capability.',
  },
  {
    id: 'gemma-4-26b-a4b',
    family: 'gemma',
    label: 'Gemma 4 26B A4B',
    modality: 'vision',
    // Unsloth ships this one as a UD-Q4_K_M dynamic quant — link it directly.
    uri: 'https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/resolve/main/gemma-4-26B-A4B-it-UD-Q4_K_M.gguf',
    sizeMb: 16162,
    ctx: 4096,
    description: '26B mixture-of-experts with 4B active parameters; multimodal.',
  },
  {
    id: 'gemma-4-31b',
    family: 'gemma',
    label: 'Gemma 4 31B',
    modality: 'vision',
    uri: 'hf:unsloth/gemma-4-31B-it-GGUF:Q4_K_M',
    sizeMb: 17475,
    ctx: 4096,
    description: '31B dense multimodal model — the heaviest built-in.',
  },
  {
    id: 'gemma-3-1b',
    family: 'gemma',
    label: 'Gemma 3 1B',
    uri: 'hf:ggml-org/gemma-3-1b-it-GGUF:Q4_K_M',
    sizeMb: 769,
    ctx: 4096,
    description: 'Lightweight third-generation Gemma.',
  },
  {
    id: 'gemma-3-4b',
    family: 'gemma',
    label: 'Gemma 3 4B',
    modality: 'vision',
    uri: 'hf:ggml-org/gemma-3-4b-it-GGUF:Q4_K_M',
    sizeMb: 2374,
    ctx: 4096,
    description: '4B multimodal Gemma supporting text and vision.',
  },
  {
    id: 'gemma-3-12b',
    family: 'gemma',
    label: 'Gemma 3 12B',
    modality: 'vision',
    uri: 'hf:ggml-org/gemma-3-12b-it-GGUF:Q4_K_M',
    sizeMb: 6962,
    ctx: 4096,
    description: 'Larger multimodal Gemma with stronger reasoning.',
  },
  {
    id: 'gemma-3n-e2b',
    family: 'gemma',
    label: 'Gemma 3n E2B',
    uri: 'hf:unsloth/gemma-3n-E2B-it-GGUF:Q4_K_M',
    sizeMb: 2887,
    ctx: 4096,
    description: '2B-active mixture-of-experts tuned for on-device use.',
  },
  {
    id: 'gemma-3n-e4b',
    family: 'gemma',
    label: 'Gemma 3n E4B',
    uri: 'hf:unsloth/gemma-3n-E4B-it-GGUF:Q4_K_M',
    sizeMb: 4329,
    ctx: 4096,
    description: '4B-active mixture-of-experts for efficient on-device AI.',
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
    id: 'gemma-2-9b',
    family: 'gemma',
    label: 'Gemma 2 9B',
    uri: 'hf:bartowski/gemma-2-9b-it-GGUF:Q4_K_M',
    sizeMb: 5760,
    ctx: 4096,
    description: "Google's second-generation 9B — excellent quality.",
  },

  // --- Phi (Microsoft) ---
  {
    id: 'phi-4',
    family: 'phi',
    label: 'Phi 4 14B',
    uri: 'hf:bartowski/phi-4-GGUF:Q4_K_M',
    sizeMb: 8634,
    ctx: 4096,
    description: "Microsoft's 14B emphasizing reasoning and coding.",
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
    id: 'phi-3-mini',
    family: 'phi',
    label: 'Phi 3 Mini',
    uri: 'hf:bartowski/Phi-3-mini-4k-instruct-GGUF:Q4_K_M',
    sizeMb: 2282,
    ctx: 4096,
    description: 'Earlier 3.8B Microsoft model with solid reasoning.',
  },

  // --- Mistral ---
  {
    id: 'mistral-7b',
    family: 'mistral',
    label: 'Mistral 7B',
    uri: 'hf:bartowski/Mistral-7B-Instruct-v0.3-GGUF:Q4_K_M',
    sizeMb: 4370,
    ctx: 4096,
    description: 'A classic mid-size model — strong performance per parameter.',
  },
  {
    id: 'mixtral-8x7b',
    family: 'mistral',
    label: 'Mixtral 8x7B',
    uri: 'hf:TheBloke/Mixtral-8x7B-Instruct-v0.1-GGUF:Q4_K_M',
    sizeMb: 25217,
    ctx: 4096,
    description: 'Sparse mixture-of-experts with eight 7B experts — very heavy.',
  },

  // --- DeepSeek ---
  {
    id: 'deepseek-r1-1.5b',
    family: 'deepseek',
    label: 'DeepSeek R1 1.5B',
    uri: 'hf:bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF:Q4_K_M',
    sizeMb: 1066,
    ctx: 4096,
    description: 'Compact reasoning-focused model (R1 distilled into Qwen).',
  },
  {
    id: 'deepseek-r1-8b',
    family: 'deepseek',
    label: 'DeepSeek R1 8B',
    uri: 'hf:bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF:Q4_K_M',
    sizeMb: 4693,
    ctx: 4096,
    description: 'Mid-sized reasoning model with stronger logical capability.',
  },
  {
    id: 'deepseek-r1-14b',
    family: 'deepseek',
    label: 'DeepSeek R1 14B',
    uri: 'hf:bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF:Q4_K_M',
    sizeMb: 8572,
    ctx: 4096,
    description: 'Large reasoning model for advanced problem solving.',
  },

  // --- Granite (IBM) ---
  {
    id: 'granite-4-micro',
    family: 'granite',
    label: 'Granite 4 Micro',
    uri: 'hf:unsloth/granite-4.0-micro-GGUF:Q4_K_M',
    sizeMb: 2002,
    ctx: 4096,
    description: 'IBM 3B optimized for tool use and agentic workflows.',
  },
  {
    id: 'granite-3-8b',
    family: 'granite',
    label: 'Granite 3 8B',
    uri: 'hf:bartowski/granite-3.1-8b-instruct-GGUF:Q4_K_M',
    sizeMb: 4714,
    ctx: 4096,
    description: 'IBM 8B dense model designed for tool-based applications.',
  },

  // --- LFM (Liquid AI) ---
  {
    id: 'lfm2.5-thinking-1.2b',
    family: 'lfm',
    label: 'LFM 2.5 Thinking 1.2B',
    uri: 'hf:LiquidAI/LFM2.5-1.2B-Thinking-GGUF:Q4_K_M',
    sizeMb: 697,
    ctx: 4096,
    description: 'Lightweight reasoning model from Liquid AI.',
  },
  {
    id: 'lfm2-24b-a2b',
    family: 'lfm',
    label: 'LFM 2 24B A2B',
    uri: 'hf:LiquidAI/LFM2-24B-A2B-GGUF:Q4_K_M',
    sizeMb: 13748,
    ctx: 4096,
    description: '24B mixture-of-experts with 2B active parameters.',
  },

  // --- SmolLM (Hugging Face) ---
  {
    id: 'smollm2-1.7b',
    family: 'smollm',
    label: 'SmolLM2 1.7B',
    uri: 'hf:bartowski/SmolLM2-1.7B-Instruct-GGUF:Q4_K_M',
    sizeMb: 1060,
    ctx: 4096,
    description: 'Tiny and quick — fine for short questions on modest machines.',
  },
];

/**
 * The model pre-selected before the machine is probed (and before the user
 * picks one). A capable-but-modest 4B so first impressions aren't "too basic";
 * {@link recommendLlmModel} then steers to the right tier once specs load.
 */
export const DEFAULT_LLM_MODEL_ID = 'qwen3-4b';

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

interface ConfigRange {
  min: number;
  max: number;
  step: number;
}

export interface LlmConfigLimits {
  temperature: ConfigRange;
  topP: ConfigRange;
  maxTokens: ConfigRange;
  contextSize: ConfigRange;
}

/**
 * Ranges for cloud models: answers may run longer (no local KV-cache cost),
 * and the context ceiling only bounds how much file content the prompt
 * builder packs — the provider allocates its own window.
 */
export const CLOUD_CONFIG_LIMITS: LlmConfigLimits = {
  temperature: { min: 0, max: 1.5, step: 0.05 },
  topP: { min: 0.1, max: 1, step: 0.05 },
  maxTokens: { min: 128, max: 8192, step: 128 },
  contextSize: { min: 1024, max: 131072, step: 1024 },
};

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

/**
 * Merge a stored partial config over the defaults, clamping every field.
 * Cloud models pass {@link CLOUD_CONFIG_LIMITS}; the default suits local GGUFs.
 */
export function resolveLlmConfig(
  modelId: string,
  stored?: Partial<LlmModelConfig>,
  limits: LlmConfigLimits = LLM_CONFIG_LIMITS,
): LlmModelConfig {
  const base = defaultLlmConfig(modelId);
  const L = limits;
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
 * The catalog model this machine should run — the most capable one that stays
 * comfortable alongside the OS, the app, the embedding worker and a large KV
 * cache. Keyed on total system memory (the resident model shares it), by tier:
 *
 *   Memory      Recommended     Class            Good for
 *   ≥ 96 GB     Gemma 4 31B     workstation      near cloud-quality local chat
 *   ≥ 48 GB     Qwen 3.5 27B    power user       large projects, technical docs
 *   ≥ 32 GB     Qwen 3 8B       mainstream       best speed/quality balance
 *   ≥ 16 GB     Qwen 3 4B       budget laptop    daily document chat
 *   ≥ 8 GB      Qwen 3 1.7B     ultra low-end    small PDFs, notes, snippets
 *   < 8 GB      Qwen 3 0.6B     below spec        the smallest that still runs
 *
 * A discrete GPU can only lift the tier (its VRAM carries the model), never
 * lower it; on Apple Silicon VRAM ≈ unified RAM, so RAM alone is the budget.
 */
export function recommendLlmModel(specs: LlmSystemSpecs): string {
  const budgetGb = Math.max(specs.ramMb, specs.vramMb) / 1024;
  if (budgetGb >= 96) return 'gemma-4-31b';
  if (budgetGb >= 48) return 'qwen3.5-27b';
  if (budgetGb >= 32) return 'qwen3-8b';
  if (budgetGb >= 16) return 'qwen3-4b';
  if (budgetGb >= 8) return 'qwen3-1.7b';
  return 'qwen3-0.6b';
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
