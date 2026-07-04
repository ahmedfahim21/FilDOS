/**
 * On-device embedding worker. Runs in an Electron `utilityProcess` (a plain
 * Node context — not the renderer, not the main event loop) so model download
 * and inference never block the UI.
 *
 * It loads `@huggingface/transformers` with the WASM backend and serves the
 * whole model catalog (`@shared/aiModels`), memoizing one loaded model per id.
 * Two model kinds:
 *   - 'feature-extraction' — sentence-transformers; mean-pool + normalize text.
 *   - 'clip'               — a text encoder and an image encoder into one space,
 *                            so text queries can match image files.
 *
 * Protocol over `process.parentPort`:
 *   in:  { id, type: 'status'|'download'|'embed'|'embedImages', modelId, texts?, paths? }
 *   out: { id, ok: true, data } | { id, ok: false, error: { code, message } }
 *        { type: 'progress', status: AiModelStatus }   // unsolicited, during download
 *
 * `@huggingface/transformers` is ESM-only, so it's pulled in with a dynamic
 * import from this CJS bundle. WASM binaries are copied next to this file at
 * build time (see `copyOnnxWasm` in electron.vite.config.ts); pointing
 * `wasmPaths` at __dirname keeps the runtime fully offline for WASM.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import type { ProgressInfo } from '@huggingface/transformers';
import type { AiModelStatus } from '@shared/types';
import { getModelDef, promptFor, type EmbedRole } from '@shared/aiModels';

const CACHE_DIR = process.env.FILDOS_MODELS_DIR ?? join(__dirname, 'models');

interface EmbedTensor {
  tolist(): number[][];
}
type FeatureExtractor = (
  texts: string[],
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<EmbedTensor>;
type ModelCall = (inputs: unknown) => Promise<Record<string, EmbedTensor>>;
type Tokenize = (texts: string[], opts: { padding: boolean; truncation: boolean }) => unknown;
/** Subset of AutoTokenizer used for cheap token-count queries (no inference). */
type TokenizerFn = (texts: string[], opts: { padding: boolean; truncation: boolean }) => {
  input_ids: { dims: number[] };
};
type Process = (image: unknown) => Promise<unknown>;

type Loaded =
  | { kind: 'feature-extraction'; extract: FeatureExtractor; tokenizer: TokenizerFn }
  | { kind: 'clip'; tokenize: Tokenize; textModel: ModelCall; process: Process; visionModel: ModelCall };

let libPromise: ReturnType<typeof loadLib> | null = null;
const loaders = new Map<string, Promise<Loaded>>();
const downloading = new Set<string>();

function post(message: unknown): void {
  process.parentPort.postMessage(message);
}

function emit(status: AiModelStatus): void {
  post({ type: 'progress', status });
}

/** Dynamically import (transformers is ESM) and configure the runtime. */
function loadLib() {
  return import('@huggingface/transformers').then((t) => {
    // Cache models under userData; never reach a CDN for the WASM runtime.
    t.env.cacheDir = CACHE_DIR;
    t.env.allowRemoteModels = true;
    t.env.allowLocalModels = true;
    if (t.env.backends?.onnx?.wasm) t.env.backends.onnx.wasm.wasmPaths = __dirname + sep;
    return t;
  });
}

/** Load (once) and configure the transformers runtime. */
function lib() {
  if (!libPromise) libPromise = loadLib();
  return libPromise;
}

/** True once a model's onnx weights exist in the cache dir. */
function modelCached(modelId: string): boolean {
  const dir = join(CACHE_DIR, ...modelId.split('/'), 'onnx');
  try {
    return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.onnx'));
  } catch {
    return false;
  }
}

function statusFor(modelId: string): AiModelStatus {
  const dim = getModelDef(modelId)?.dim ?? 0;
  if (downloading.has(modelId)) return { state: 'downloading', modelId, dim };
  return { state: modelCached(modelId) ? 'ready' : 'absent', modelId, dim };
}

/** L2-normalize each row so vectors are comparable by cosine / dot product. */
function l2normalize(rows: number[][]): number[][] {
  return rows.map((row) => {
    let sum = 0;
    for (const v of row) sum += v * v;
    const norm = Math.sqrt(sum) || 1;
    return row.map((v) => v / norm);
  });
}

/** Lazily load (and memoize) a catalog model, emitting download progress. */
function get(modelId: string): Promise<Loaded> {
  const existing = loaders.get(modelId);
  if (existing) return existing;

  const def = getModelDef(modelId);
  if (!def) {
    return Promise.reject(Object.assign(new Error(`Unknown model: ${modelId}`), { code: 'EINVAL' }));
  }

  const onProgress = (info: ProgressInfo) => {
    if (info.status === 'progress') {
      emit({
        state: 'downloading',
        modelId,
        dim: def.dim,
        progress: Math.max(0, Math.min(1, info.progress / 100)),
      });
    }
  };
  const opts = { dtype: 'q8' as const, progress_callback: onProgress };

  const promise = (async (): Promise<Loaded> => {
    const t = await lib();
    if (!modelCached(modelId)) downloading.add(modelId);
    let loaded: Loaded;
    if (def.kind === 'clip') {
      const tokenize = (await t.AutoTokenizer.from_pretrained(modelId, opts)) as unknown as Tokenize;
      const textModel = (await t.CLIPTextModelWithProjection.from_pretrained(
        modelId,
        opts,
      )) as unknown as ModelCall;
      const process = (await t.AutoProcessor.from_pretrained(modelId, opts)) as unknown as Process;
      const visionModel = (await t.CLIPVisionModelWithProjection.from_pretrained(
        modelId,
        opts,
      )) as unknown as ModelCall;
      loaded = { kind: 'clip', tokenize, textModel, process, visionModel };
    } else {
      // Load the tokenizer separately so countTokens can run without inference.
      // AutoTokenizer.from_pretrained reads the same cached vocab files as the
      // pipeline; no extra download, but a second in-memory allocation (~few MB).
      const tokenizer = (await t.AutoTokenizer.from_pretrained(modelId, opts)) as unknown as TokenizerFn;
      const extract = (await t.pipeline('feature-extraction', modelId, opts)) as unknown as FeatureExtractor;
      loaded = { kind: 'feature-extraction', extract, tokenizer };
    }
    downloading.delete(modelId);
    emit({ state: 'ready', modelId, dim: def.dim });
    return loaded;
  })().catch((err) => {
    loaders.delete(modelId);
    downloading.delete(modelId);
    emit({
      state: 'error',
      modelId,
      dim: def.dim,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  });

  loaders.set(modelId, promise);
  return promise;
}

async function embedText(
  modelId: string,
  texts: string[],
  role: EmbedRole = 'passage',
): Promise<number[][]> {
  const model = await get(modelId);
  if (model.kind === 'feature-extraction') {
    // Asymmetric models (BGE/E5) want an instruction prefix on queries vs passages.
    const prefix = promptFor(modelId, role);
    const input = prefix ? texts.map((t) => prefix + t) : texts;
    const out = await model.extract(input, { pooling: 'mean', normalize: true });
    return out.tolist();
  }
  // CLIP text encoder → projected embeddings (normalized to match image space).
  const inputs = model.tokenize(texts, { padding: true, truncation: true });
  const out = await model.textModel(inputs);
  return l2normalize(out.text_embeds.tolist());
}

/**
 * Count tokens for each text using the model's own tokenizer — pure tokenization,
 * no inference. Used by the indexer to calibrate chunk window size per file so
 * dense code or non-Latin text never silently overflows the model's token limit.
 */
async function countTokensForModel(modelId: string, texts: string[]): Promise<number[]> {
  const model = await get(modelId);
  if (model.kind === 'feature-extraction') {
    return texts.map((text) => {
      try {
        const out = model.tokenizer([text], { padding: false, truncation: false });
        return out.input_ids.dims[1] ?? Math.ceil(text.length / 4);
      } catch {
        return Math.ceil(text.length / 4);
      }
    });
  }
  // CLIP has its own truncation during tokenization; char-approx is fine here.
  return texts.map((t) => Math.ceil(t.length / 4));
}

async function embedImages(modelId: string, paths: string[]): Promise<number[][]> {
  const model = await get(modelId);
  if (model.kind !== 'clip') {
    throw Object.assign(new Error('This model cannot embed images.'), { code: 'EUNSUPPORTED' });
  }
  const t = await lib();
  const rows: number[][] = [];
  for (const path of paths) {
    const image = await t.RawImage.read(path);
    const inputs = await model.process(image);
    const out = await model.visionModel(inputs);
    rows.push(...l2normalize(out.image_embeds.tolist()));
  }
  return rows;
}

async function handle(
  type: string,
  modelId: string,
  texts?: string[],
  paths?: string[],
  role?: EmbedRole,
): Promise<unknown> {
  switch (type) {
    case 'status':
      return statusFor(modelId);
    case 'download':
      await get(modelId);
      return undefined;
    case 'embed':
      return embedText(modelId, texts ?? [], role);
    case 'embedImages':
      return embedImages(modelId, paths ?? []);
    case 'countTokens':
      return countTokensForModel(modelId, texts ?? []);
    default:
      throw Object.assign(new Error(`Unknown AI request: ${type}`), { code: 'EINVAL' });
  }
}

process.parentPort.on(
  'message',
  (e: {
    data: { id: number; type: string; modelId: string; texts?: string[]; paths?: string[]; role?: EmbedRole };
  }) => {
    const { id, type, modelId, texts, paths, role } = e.data;
    handle(type, modelId, texts, paths, role)
      .then((data) => post({ id, ok: true, data }))
      .catch((err: NodeJS.ErrnoException) =>
        post({ id, ok: false, error: { code: err.code ?? 'EAIFAILED', message: err.message } }),
      );
  },
);
