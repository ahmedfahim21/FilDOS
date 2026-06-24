/**
 * The catalog of on-device embedding models, shared by the main process (the
 * worker loads them) and the renderer (Settings lists them). Each model is a
 * transformers.js checkpoint with ONNX weights, run on the WASM backend.
 *
 * `kind` tells the worker how to load and run a model:
 *  - 'feature-extraction' — a sentence-transformer; mean-pool + L2-normalize.
 *  - 'clip'               — CLIP; a text encoder and an image encoder that map
 *                           into one shared space (so text can match images).
 *
 * All entries are verified to load with `dtype: 'q8'` (the quantized weights).
 */
export type AiModality = 'text' | 'code' | 'image';

export interface AiModelDef {
  /** transformers.js repo id, e.g. 'Xenova/all-MiniLM-L6-v2'. */
  id: string;
  /** Short display name. */
  label: string;
  /** What the model is best at — groups the picker and hints at file types. */
  modality: AiModality;
  /** Embedding dimensionality. */
  dim: number;
  /** How the worker loads/runs it. */
  kind: 'feature-extraction' | 'clip';
  /** Approximate quantized download size in MB (for the UI). */
  sizeMb: number;
  /** One-line description for Settings. */
  description: string;
}

export const AI_MODELS: AiModelDef[] = [
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    label: 'MiniLM',
    modality: 'text',
    dim: 384,
    kind: 'feature-extraction',
    sizeMb: 23,
    description: 'General-purpose text. Fast and small — a great default.',
  },
  {
    id: 'Xenova/bge-small-en-v1.5',
    label: 'BGE Small',
    modality: 'text',
    dim: 384,
    kind: 'feature-extraction',
    sizeMb: 33,
    description: 'Higher-quality English embeddings for documents and notes.',
  },
  {
    id: 'Xenova/gte-small',
    label: 'GTE Small',
    modality: 'code',
    dim: 384,
    kind: 'feature-extraction',
    sizeMb: 33,
    description: 'Versatile across prose and source code.',
  },
  {
    id: 'Xenova/multilingual-e5-small',
    label: 'E5 Multilingual',
    modality: 'text',
    dim: 384,
    kind: 'feature-extraction',
    sizeMb: 118,
    description: 'Text and filenames across ~100 languages.',
  },
  {
    id: 'Xenova/clip-vit-base-patch32',
    label: 'CLIP ViT-B/32',
    modality: 'image',
    dim: 512,
    kind: 'clip',
    sizeMb: 90,
    description: 'Images and text in one space — find photos by describing them.',
  },
];

export const DEFAULT_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

export function getModelDef(id: string): AiModelDef | undefined {
  return AI_MODELS.find((m) => m.id === id);
}
