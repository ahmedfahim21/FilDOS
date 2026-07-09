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

/** Whether text is being embedded as a search query or as document content. */
export type EmbedRole = 'query' | 'passage';

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
  kind: 'feature-extraction' | 'clip' | 'reranker' | 'ner';
  /** Approximate quantized download size in MB (for the UI). */
  sizeMb: number;
  /** One-line description for Settings. */
  description: string;
  /**
   * Instruction prefixes some retrieval models expect on the query vs. the
   * indexed passage (BGE/E5 are asymmetric — skipping these noticeably hurts
   * ranking). Symmetric models (MiniLM/GTE) omit this.
   */
  prompts?: Record<EmbedRole, string>;
  /**
   * Maps this model's cosine scores to a [0, 1] relevance — cosine isn't a
   * probability and its useful range differs by model (text vs. CLIP especially).
   * `floor`→0, `ceil`→1. Lets results from different models be ranked together
   * and shown with an honest relevance bar. Omitted → cosine used as-is.
   */
  relevance?: { floor: number; ceil: number };
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
    description: 'Compact English text model — fast, low RAM.',
    prompts: {
      query: 'Represent this sentence for searching relevant passages: ',
      passage: '',
    },
    relevance: { floor: 0.35, ceil: 0.8 },
  },
  {
    id: 'Xenova/bge-base-en-v1.5',
    label: 'BGE Base',
    modality: 'text',
    dim: 768,
    kind: 'feature-extraction',
    sizeMb: 110,
    description: 'Higher-quality English embeddings for documents and notes.',
    prompts: {
      query: 'Represent this sentence for searching relevant passages: ',
      passage: '',
    },
    // Calibrated provisionally from bge-small's range; refine with eval/recall@k.
    relevance: { floor: 0.35, ceil: 0.8 },
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
    prompts: { query: 'query: ', passage: 'passage: ' },
  },
  {
    id: 'Xenova/clip-vit-base-patch32',
    label: 'CLIP ViT-B/32',
    modality: 'image',
    dim: 512,
    kind: 'clip',
    sizeMb: 90,
    description: 'Images and text in one space — find photos by describing them.',
    // CLIP text↔image cosines run much lower than sentence-transformer scores.
    relevance: { floor: 0.18, ceil: 0.35 },
  },
  {
    // Cross-encoder that scores (query, passage) pairs instead of embedding them.
    // Reranks the top-50 RRF candidates on the text lane for higher precision.
    // Not downloaded automatically — only activates when the user downloads it.
    id: 'Xenova/ms-marco-MiniLM-L-6-v2',
    label: 'MS-MARCO Reranker',
    modality: 'text',
    dim: 0, // no embedding output
    kind: 'reranker',
    sizeMb: 85,
    description: 'Cross-encoder for search result reranking. Download to improve precision.',
  },
  {
    // Token-classification (BIO tags) — feeds the knowledge graph's entity
    // nodes. Like the reranker, never downloaded automatically: the Canvas
    // view works without it and entities light up once the user opts in.
    id: 'Xenova/bert-base-NER',
    label: 'Entity Extractor',
    modality: 'text',
    dim: 0, // no embedding output
    kind: 'ner',
    sizeMb: 110,
    description: 'Finds people, organizations and places in your files for the Canvas view.',
  },
];

/**
 * The two models the app manages automatically (the user never picks a model):
 * a strong text model for documents/code and CLIP for images. Each indexed chunk
 * records which one produced it, so search compares like with like and can blend
 * both modalities.
 */
export const TEXT_MODEL_ID = 'Xenova/bge-base-en-v1.5';
export const IMAGE_MODEL_ID = 'Xenova/clip-vit-base-patch32';
export const RERANKER_MODEL_ID = 'Xenova/ms-marco-MiniLM-L-6-v2';
export const NER_MODEL_ID = 'Xenova/bert-base-NER';
export const INDEX_MODEL_IDS = [TEXT_MODEL_ID, IMAGE_MODEL_ID] as const;

// Kept for the few callers that need a single text model (e.g. the test-embed).
export const DEFAULT_MODEL_ID = TEXT_MODEL_ID;

export function getModelDef(id: string): AiModelDef | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

/** The instruction prefix for a model + role (empty when the model needs none). */
export function promptFor(id: string, role: EmbedRole): string {
  return getModelDef(id)?.prompts?.[role] ?? '';
}

/**
 * Map a raw cosine score to a [0, 1] relevance using the model's calibration,
 * so hits from different models are comparable and the UI bar is honest. Without
 * calibration (e.g. test models) the cosine is returned unchanged.
 */
export function relevanceOf(id: string, cosine: number): number {
  const r = getModelDef(id)?.relevance;
  if (!r) return cosine;
  return Math.max(0, Math.min(1, (cosine - r.floor) / (r.ceil - r.floor)));
}
