/**
 * The catalog of on-device models, shared by the main process (the runtime
 * loads them) and the renderer (Settings lists them). Each is a transformers.js
 * checkpoint with ONNX weights.
 *
 * `kind` tells the runtime how to load and run a model:
 *  - 'multimodal' — EmbeddingGemma 2: text, images (and later audio/video) into
 *                   one 768-d space, so any query compares with any file. Its
 *                   vision/audio encoders are separate components, loaded only
 *                   when a batch needs them.
 *  - 'reranker'   — a cross-encoder scoring (query, passage) pairs.
 *  - 'ner'        — token classification for the Canvas entity nodes.
 */
export type AiModality = 'text' | 'code' | 'image';

/**
 * What a text is being embedded as. EmbeddingGemma 2 is asymmetric: queries
 * and documents get different task prefixes (`embeddingPrompts.ts`).
 *  - 'query'    — a search box query
 *  - 'question' — a question asked of the files (chat retrieval)
 *  - 'passage'  — document content being indexed
 */
export type EmbedRole = 'query' | 'question' | 'passage';

/**
 * Weight precisions the runtime may load. EmbeddingGemma 2's activations
 * overflow float16 — it returns NaN or silently degraded vectors instead of
 * failing — so fp16/q4f16 are deliberately not representable here. q8 keeps
 * float32 activations with int8 weights.
 */
export type ModelDtype = 'q8' | 'fp32';

/** An independently downloadable part of a multimodal model. */
export interface ModelComponent {
  /** transformers.js session name: 'model' (text), 'vision_encoder', 'audio_encoder'. */
  session: 'model' | 'vision_encoder' | 'audio_encoder';
  /** What it unlocks, for the UI. */
  label: string;
  sizeMb: number;
}

export interface AiModelDef {
  /** transformers.js repo id, e.g. 'onnx-community/embeddinggemma-2-ONNX'. */
  id: string;
  /** Short display name. */
  label: string;
  /** What the model is best at — groups the picker and hints at file types. */
  modality: AiModality;
  /** Embedding dimensionality as stored (after any Matryoshka truncation); 0 for non-embedders. */
  dim: number;
  /** How the runtime loads/runs it. */
  kind: 'multimodal' | 'reranker' | 'ner';
  /** Approximate download size in MB (for the UI). */
  sizeMb: number;
  /** One-line description for Settings. */
  description: string;
  /** Weight precision to load. */
  dtype: ModelDtype;
  /** Multimodal models: their parts, downloaded in order. */
  components?: ModelComponent[];
  /**
   * Maps cosine scores to a [0, 1] relevance for the UI bar. `floor`→0,
   * `ceil`→1. Omitted → cosine used as-is.
   */
  relevance?: { floor: number; ceil: number };
}

/** The embedding model: indexes every file and embeds every query. */
export const EMBED_MODEL_ID = 'onnx-community/embeddinggemma-2-ONNX';
export const RERANKER_MODEL_ID = 'Xenova/ms-marco-MiniLM-L-6-v2';
export const NER_MODEL_ID = 'Xenova/bert-base-NER';

/**
 * Matryoshka dimensions EmbeddingGemma 2 is trained for and we allow. 128 is
 * excluded: it degrades multimodal quality substantially.
 */
export const EMBED_DIMS = [768, 512, 256] as const;
export type EmbedDim = (typeof EMBED_DIMS)[number];

export const AI_MODELS: AiModelDef[] = [
  {
    id: EMBED_MODEL_ID,
    label: 'EmbeddingGemma 2',
    modality: 'text',
    dim: 768,
    kind: 'multimodal',
    sizeMb: 509,
    dtype: 'q8',
    components: [
      { session: 'model', label: 'Text & documents', sizeMb: 314 },
      { session: 'vision_encoder', label: 'Pictures', sizeMb: 195 },
    ],
    description: 'Text and pictures in one space, in 100+ languages — search any file by describing it.',
    // Provisional, from the eval testbed: unrelated pairs sit near 0.5, clear matches 0.7–0.8.
    relevance: { floor: 0.5, ceil: 0.8 },
  },
  {
    // Cross-encoder that scores (query, passage) pairs instead of embedding them.
    // Reranks the top candidates for higher precision. Not downloaded
    // automatically — only activates when the user downloads it.
    id: RERANKER_MODEL_ID,
    label: 'MS-MARCO Reranker',
    modality: 'text',
    dim: 0, // no embedding output
    kind: 'reranker',
    sizeMb: 85,
    dtype: 'q8',
    description: 'Cross-encoder for search result reranking. Download to improve precision.',
  },
  {
    // Token-classification (BIO tags) — feeds the knowledge graph's entity
    // nodes. Like the reranker, never downloaded automatically: the Canvas
    // view works without it and entities light up once the user opts in.
    id: NER_MODEL_ID,
    label: 'Entity Extractor',
    modality: 'text',
    dim: 0, // no embedding output
    kind: 'ner',
    sizeMb: 110,
    dtype: 'q8',
    description: 'Finds people, organizations and places in your files for the Canvas view.',
  },
];

/** Models the app downloads and uses automatically (the user never picks one). */
export const INDEX_MODEL_IDS = [EMBED_MODEL_ID] as const;

export function getModelDef(id: string): AiModelDef | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

/**
 * Map a raw cosine score to a [0, 1] relevance using the model's calibration,
 * so the UI bar is honest. Without calibration (e.g. test models) the cosine is
 * returned unchanged.
 */
export function relevanceOf(id: string, cosine: number): number {
  const r = getModelDef(id)?.relevance;
  if (!r) return cosine;
  return Math.max(0, Math.min(1, (cosine - r.floor) / (r.ceil - r.floor)));
}

/**
 * Identifies the vectors an index holds: model, precision, dimension and
 * prompt format. Any change means stored vectors are incomparable with new
 * queries, so the index is emptied and rebuilt (`index/fingerprint.ts`).
 */
export function indexFingerprint(promptsVersion: number): string {
  const def = getModelDef(EMBED_MODEL_ID)!;
  return `${def.id}|${def.dtype}|${def.dim}|prompts${promptsVersion}`;
}
