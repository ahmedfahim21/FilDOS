/**
 * The catalog of on-device chat (LLM) models, shared by the main process (the
 * LLM worker downloads and loads them) and the renderer (the Assistant's model
 * picker lists them). Each model is a GGUF checkpoint pulled from Hugging Face
 * by node-llama-cpp's downloader and run fully offline afterwards.
 *
 * Deliberately small models only: chat runs beside the embedding worker and the
 * indexer, and a heavyweight local LLM would drag the whole machine down. One
 * model is resident in RAM at a time; switching models unloads the previous one.
 */
export interface LlmModelDef {
  /** Stable catalog id (also the on-disk folder key), e.g. 'llama-3.2-1b'. */
  id: string;
  /** Short display name for the picker. */
  label: string;
  /** node-llama-cpp model URI, e.g. 'hf:bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M'. */
  uri: string;
  /** Approximate download size in MB (for the UI). */
  sizeMb: number;
  /** Context window (tokens) to allocate — bounded so RAM stays predictable. */
  ctx: number;
  /** One-line description for the picker. */
  description: string;
}

export const LLM_MODELS: LlmModelDef[] = [
  {
    id: 'llama-3.2-1b',
    label: 'Llama 3.2 1B',
    uri: 'hf:bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M',
    sizeMb: 810,
    ctx: 4096,
    description: 'Fast and light — a good default for quick questions.',
  },
  {
    id: 'qwen-2.5-1.5b',
    label: 'Qwen 2.5 1.5B',
    uri: 'hf:bartowski/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M',
    sizeMb: 990,
    ctx: 4096,
    description: 'Strong at summaries and structured answers for its size.',
  },
  {
    id: 'gemma-2-2b',
    label: 'Gemma 2 2B',
    uri: 'hf:bartowski/gemma-2-2b-it-GGUF:Q4_K_M',
    sizeMb: 1710,
    ctx: 4096,
    description: 'Balanced quality and speed for everyday file questions.',
  },
  {
    id: 'llama-3.2-3b',
    label: 'Llama 3.2 3B',
    uri: 'hf:bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M',
    sizeMb: 2020,
    ctx: 4096,
    description: 'The most capable option — slower and hungrier on RAM.',
  },
];

export const DEFAULT_LLM_MODEL_ID = 'llama-3.2-1b';

export function getLlmModelDef(id: string): LlmModelDef | undefined {
  return LLM_MODELS.find((m) => m.id === id);
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
