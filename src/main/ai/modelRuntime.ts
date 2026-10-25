/**
 * On-device embedding runtime. `modelWorker.ts` runs it in an Electron
 * `utilityProcess` (a plain Node context — not the renderer, not the main event
 * loop) so model download and inference never block the UI; the eval harness
 * runs the same code in-process.
 *
 * It loads `@huggingface/transformers` on onnxruntime-node (native CPU — in
 * Node, transformers.js has no WASM backend) and serves the model catalog
 * (`@shared/aiModels`):
 *   - 'multimodal' — EmbeddingGemma 2. Text queries and documents load the text
 *     model alone (270M); the vision encoder is added the first time a picture
 *     needs embedding, and then serves text too, so at most one copy of the
 *     text model is resident.
 *   - 'ner' — a transformers.js token-classification pipeline.
 *
 * Every vector is checked (NaN/Inf/zero rows throw — EmbeddingGemma 2 degrades
 * silently under float16, so the dtype is q8 and never fp16), truncated to the
 * catalog dimension and L2-normalized, and returned as a Float32Array.
 *
 * Protocol (over `process.parentPort` in the worker): requests are
 * `{ id, type, modelId, ...args }` (see `RuntimeRequest`), replies
 * `{ id, ok: true, data } | { id, ok: false, error: { code, message } }`, plus
 * unsolicited `{ type: 'progress', status }` during downloads.
 *
 * `@huggingface/transformers` is ESM-only, so it's pulled in with a dynamic
 * import from this CJS bundle.
 */
import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename, join } from 'node:path';
import type { ProgressInfo } from '@huggingface/transformers';
import type { AiModelStatus, EmbedDevice, DeviceCheckResult } from '@shared/types';
import type { EntitySpan } from '@shared/graphTypes';
import { getModelDef, type AiModelDef, type EmbedRole, type ModelDtype } from '@shared/aiModels';
import { promptedText } from '@shared/embeddingPrompts';
import { mergeBioSpans, type BioToken } from './graph/ner';
import { rowsOf } from './vectors';
import { PHOTO_BUDGET } from './index/ignore';

/** Read on use, so an in-process host can set the env before the first call. */
function cacheDir(): string {
  return process.env.FILDOS_MODELS_DIR ?? join(__dirname, 'models');
}

/**
 * The device EmbeddingGemma 2's vision encoder runs on (the text model is
 * always CPU: CoreML rejects its empty modality inputs). CPU unless
 * `FILDOS_EMBED_DEVICE` names another — set by the devices eval, which
 * measures whether a GPU is faster *and* agrees with the CPU before anyone
 * should ship it as a default.
 */
function visionDevice(): EmbedDevice {
  const d = process.env.FILDOS_EMBED_DEVICE;
  return d === 'coreml' || d === 'dml' || d === 'cuda' ? d : 'cpu';
}

/** Soft tokens per picture when the caller names no budget (the model's default). */
const DEFAULT_VISION_BUDGET = 280;

/**
 * Most padded tokens (inputs × longest input) in one model call. The model
 * returns per-token hidden states alongside the pooled vector; in Electron's
 * utility process, outputs much past ~5 MB crash the process (exit code 5) —
 * 8 inputs of ~600 tokens did, 4 did not — so batches are split to stay at
 * ≤ 2048 × 512 floats (4 MB).
 */
export const MAX_CALL_TOKENS = 2048;

/**
 * Split inputs (by their token lengths, in order) into [start, end) runs whose
 * padded size — count × longest — stays within `budget`. An input longer than
 * the budget goes alone.
 */
export function tokenGroups(lengths: number[], budget: number): [number, number][] {
  const groups: [number, number][] = [];
  let start = 0;
  let longest = 0;
  for (let i = 0; i < lengths.length; i++) {
    const nextLongest = Math.max(longest, lengths[i]);
    if (i > start && nextLongest * (i - start + 1) > budget) {
      groups.push([start, i]);
      start = i;
      longest = lengths[i];
    } else {
      longest = nextLongest;
    }
  }
  if (lengths.length) groups.push([start, lengths.length]);
  return groups;
}

/** Longest text input, in tokens. Chunks are ~512 tokens; this bounds a runaway one. */
const MAX_TEXT_TOKENS = 2048;

/** Inference threads: half the cores (max 4), so indexing never monopolises the machine. */
function threads(): number {
  return Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
}

export type RuntimeRequest =
  | { type: 'status'; modelId: string }
  | { type: 'download'; modelId: string }
  | { type: 'embed'; modelId: string; texts: string[]; role?: EmbedRole; titles?: string[] }
  | { type: 'embedMedia'; modelId: string; kind: 'image'; paths: string[]; budget?: number }
  | { type: 'countTokens'; modelId: string; texts: string[] }
  | { type: 'extractEntities'; modelId: string; texts: string[] }
  | { type: 'deviceCheck'; modelId: string; devices: EmbedDevice[]; images: string[] };


interface Tensor {
  data: ArrayLike<number>;
  dims: number[];
}
type Callable = (inputs: unknown) => Promise<Record<string, Tensor>>;
type Processor = ((text: unknown, images?: unknown) => Promise<unknown>) & {
  image_processor: { max_soft_tokens: number };
};
type TokenizerFn = (texts: string[], opts: { padding: boolean; truncation: boolean; max_length?: number }) => {
  input_ids: { dims: number[] };
};
interface Disposable {
  dispose(): Promise<unknown>;
}

/** Token-classification pipeline (NER): BIO subword tokens per text. */
type NerFn = (text: string) => Promise<BioToken[]>;

interface Multimodal {
  kind: 'multimodal';
  vision: boolean;
  model: Callable & Disposable;
  processor: Processor;
  tokenizer: TokenizerFn;
  /** Calls running on this instance; a retired instance is disposed when it drops to 0. */
  inFlight: number;
  retired: boolean;
}
type Loaded = Multimodal | { kind: 'ner'; ner: NerFn };

let libPromise: ReturnType<typeof loadLib> | null = null;
const loaders = new Map<string, Promise<Loaded>>();
const downloading = new Set<string>();

/** Where unsolicited messages (download progress) go; the host sets it. */
let post: (message: unknown) => void = () => {};

export function setPost(fn: (message: unknown) => void): void {
  post = fn;
}

function emit(status: AiModelStatus): void {
  post({ type: 'progress', status });
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

/** Dynamically import (transformers is ESM) and point its cache at userData. */
function loadLib() {
  return import('@huggingface/transformers').then((t) => {
    t.env.cacheDir = cacheDir();
    t.env.allowRemoteModels = true;
    t.env.allowLocalModels = true;
    return t;
  });
}

function lib() {
  if (!libPromise) libPromise = loadLib();
  return libPromise;
}

function defOf(modelId: string): AiModelDef {
  return getModelDef(modelId) ?? fail('EINVAL', `Unknown model: ${modelId}`);
}

/** The ONNX file transformers.js loads for a session at a dtype. */
function onnxFile(session: string, dtype: ModelDtype): string {
  return `${session}${dtype === 'q8' ? '_quantized' : ''}.onnx`;
}

/** True once every file a model needs is in the cache dir. */
function modelCached(def: AiModelDef): boolean {
  const dir = join(cacheDir(), ...def.id.split('/'), 'onnx');
  const sessions = def.components?.map((c) => c.session) ?? ['model'];
  return sessions.every((s) => {
    const file = join(dir, onnxFile(s, def.dtype));
    // Multimodal exports keep their weights beside the graph.
    return existsSync(file) && (def.kind !== 'multimodal' || existsSync(`${file}_data`));
  });
}

function statusFor(modelId: string): AiModelStatus {
  const def = defOf(modelId);
  if (downloading.has(modelId)) return { state: 'downloading', modelId, dim: def.dim };
  return { state: modelCached(def) ? 'ready' : 'absent', modelId, dim: def.dim };
}

function progressReporter(def: AiModelDef) {
  return (info: ProgressInfo) => {
    if (info.status === 'progress_total') {
      emit({ state: 'downloading', modelId: def.id, dim: def.dim, progress: Math.max(0, Math.min(1, info.progress / 100)) });
    }
  };
}

async function loadMultimodal(def: AiModelDef, vision: boolean, device: EmbedDevice): Promise<Multimodal> {
  const t = await lib();
  const onProgress = progressReporter(def);
  const config = (await t.AutoConfig.from_pretrained(def.id, { progress_callback: onProgress })) as unknown as Record<string, unknown>;
  config.audio_config = null;
  if (!vision) config.vision_config = null;
  const model = (await t.AutoModel.from_pretrained(def.id, {
    config: config as never,
    dtype: { model: def.dtype, vision_encoder: def.dtype },
    device: { model: 'cpu', vision_encoder: device },
    session_options: { intraOpNumThreads: threads(), interOpNumThreads: 1 },
    progress_callback: onProgress,
  })) as unknown as Callable & Disposable;
  const processor = (await t.AutoProcessor.from_pretrained(def.id, { progress_callback: onProgress })) as unknown as Processor;
  const tokenizer = (await t.AutoTokenizer.from_pretrained(def.id, { progress_callback: onProgress })) as unknown as TokenizerFn;
  return { kind: 'multimodal', vision, model, processor, tokenizer, inFlight: 0, retired: false };
}

/** Run `fn` on an instance, disposing it afterwards if it was retired meanwhile. */
async function using<T>(m: Multimodal, fn: () => Promise<T>): Promise<T> {
  m.inFlight++;
  try {
    return await fn();
  } finally {
    m.inFlight--;
    if (m.retired && m.inFlight === 0) await m.model.dispose();
  }
}

/** Stop handing out an instance; it's disposed once its last call finishes. */
async function retire(m: Multimodal): Promise<void> {
  m.retired = true;
  if (m.inFlight === 0) await m.model.dispose();
}

/**
 * Load (once) a catalog model. For the multimodal model, `vision` asks for the
 * vision encoder too: a loaded text-only instance is then disposed and replaced,
 * and a vision instance already loaded serves text requests as well.
 */
function get(modelId: string, opts: { vision?: boolean } = {}): Promise<Loaded> {
  const def = defOf(modelId);
  const existing = loaders.get(modelId);
  if (existing && def.kind === 'multimodal' && opts.vision) {
    // Upgrade a text-only instance to one with the vision encoder.
    const upgraded = existing.then(async (m) => {
      if (m.kind !== 'multimodal' || m.vision) return m;
      const next = await loadMultimodal(def, true, visionDevice());
      await retire(m);
      return next;
    });
    return track(modelId, upgraded);
  }
  if (existing) return existing;

  const promise = (async (): Promise<Loaded> => {
    const t = await lib();
    const opts2 = { dtype: def.dtype, progress_callback: progressReporter(def) };
    if (def.kind === 'multimodal') return loadMultimodal(def, opts.vision ?? false, visionDevice());
    return { kind: 'ner', ner: (await t.pipeline('token-classification', def.id, opts2)) as unknown as NerFn };
  })();
  return track(modelId, promise);
}

/** Memoize a load, report its state, and forget it if it fails (so a retry reloads). */
function track(modelId: string, promise: Promise<Loaded>): Promise<Loaded> {
  const def = defOf(modelId);
  const wasCached = modelCached(def);
  if (!wasCached) downloading.add(modelId);
  const tracked = promise.then(
    (loaded) => {
      downloading.delete(modelId);
      if (!wasCached) emit({ state: 'ready', modelId, dim: def.dim });
      return loaded;
    },
    (err: unknown) => {
      loaders.delete(modelId);
      downloading.delete(modelId);
      emit({ state: 'error', modelId, dim: def.dim, message: err instanceof Error ? err.message : String(err) });
      throw err;
    },
  );
  loaders.set(modelId, tracked);
  return tracked;
}

async function multimodal(modelId: string, vision = false): Promise<Multimodal> {
  const m = await get(modelId, { vision });
  if (m.kind !== 'multimodal') fail('EUNSUPPORTED', `${modelId} is not an embedding model.`);
  return m;
}

/** The pooled, normalized sentence embeddings of a processed batch, at the catalog dim. */
async function sentenceEmbeddings(m: Multimodal, inputs: unknown, rows: number, dim: number): Promise<Float32Array[]> {
  const out = await m.model(inputs);
  const e = out.sentence_embedding ?? fail('EAIFAILED', 'The model returned no sentence embedding.');
  if (e.dims[0] !== rows) fail('EAIFAILED', `Expected ${rows} embeddings, got ${e.dims[0]}.`);
  return rowsOf(e.data, rows, e.dims[1], dim);
}

async function embedText(modelId: string, texts: string[], role: EmbedRole = 'passage', titles?: string[]): Promise<Float32Array[]> {
  if (!texts.length) return [];
  const def = defOf(modelId);
  const m = await multimodal(modelId);
  const prompted = texts.map((t, i) => promptedText(t, role, titles?.[i]));
  return using(m, async () => {
    const lengths = prompted.map((t) =>
      Math.min(MAX_TEXT_TOKENS, m.tokenizer([t], { padding: false, truncation: false }).input_ids.dims[1]),
    );
    const out: Float32Array[] = [];
    for (const [start, end] of tokenGroups(lengths, MAX_CALL_TOKENS)) {
      const group = prompted.slice(start, end);
      const inputs = m.tokenizer(group, { padding: true, truncation: true, max_length: MAX_TEXT_TOKENS });
      out.push(...(await sentenceEmbeddings(m, inputs, group.length, def.dim)));
    }
    return out;
  });
}

/**
 * Embed pictures, one input each, at a vision budget (soft tokens per image:
 * 70–1120; more reads finer detail and costs more). Pictures carry no prefix.
 */
async function embedImages(modelId: string, paths: string[], budget?: number): Promise<Float32Array[]> {
  if (!paths.length) return [];
  const def = defOf(modelId);
  const m = await multimodal(modelId, true);
  const t = await lib();
  const images = await Promise.all(paths.map((p) => t.RawImage.read(p)));
  return using(m, async () => {
    m.processor.image_processor.max_soft_tokens = budget ?? DEFAULT_VISION_BUDGET;
    // One list per sample: a flat list would be a single input made of all images.
    const inputs = await m.processor(null, images.map((img) => [img]));
    return sentenceEmbeddings(m, inputs, paths.length, def.dim);
  });
}

/** Token counts from the model's own tokenizer — no inference. */
async function countTokens(modelId: string, texts: string[]): Promise<number[]> {
  const m = await multimodal(modelId);
  return using(m, async () =>
    texts.map((text) => m.tokenizer([text], { padding: false, truncation: false }).input_ids.dims[1]),
  );
}

/** Named-entity recognition: one EntitySpan[] per text, sequentially. */
async function extractEntitiesForModel(modelId: string, texts: string[]): Promise<EntitySpan[][]> {
  const model = await get(modelId);
  if (model.kind !== 'ner') fail('EUNSUPPORTED', 'This model cannot extract entities.');
  const out: EntitySpan[][] = [];
  for (const text of texts) out.push(mergeBioSpans(await model.ner(text)));
  return out;
}

/**
 * Which device embeds pictures fastest *and* identically: each candidate's
 * vision encoder embeds the same pictures as the CPU's; a device qualifies
 * only if every vector agrees with the CPU's to cosine ≥ 0.999. Failures are
 * reported per device, not thrown — an unusable GPU just isn't chosen.
 */
async function deviceCheck(modelId: string, devices: EmbedDevice[], images: string[]): Promise<DeviceCheckResult> {
  const def = defOf(modelId);
  const t = await lib();
  const raw = await Promise.all(images.map((p) => t.RawImage.read(p)));
  // One picture per call, as indexing embeds them (and some GPU providers
  // can't take a large batch).
  const run = async (device: EmbedDevice) => {
    const m = await loadMultimodal(def, true, device);
    try {
      m.processor.image_processor.max_soft_tokens = PHOTO_BUDGET;
      const inputs = await Promise.all(raw.map((img) => m.processor(null, [[img]])));
      await m.model(inputs[0]); // warm-up: first runs compile kernels
      const started = performance.now();
      const vecs: Float32Array[] = [];
      for (const input of inputs) vecs.push(...(await sentenceEmbeddings(m, input, 1, def.dim)));
      return { vecs, msPerImage: (performance.now() - started) / raw.length };
    } finally {
      await m.model.dispose();
    }
  };
  const cpu = await run('cpu');
  const results: DeviceCheckResult['results'] = [{ device: 'cpu', msPerImage: cpu.msPerImage, agreement: 1 }];
  for (const device of devices.filter((d) => d !== 'cpu')) {
    try {
      const r = await run(device);
      const agreement = Math.min(...r.vecs.map((v, i) => v.reduce((s, x, j) => s + x * cpu.vecs[i][j], 0)));
      results.push({ device, msPerImage: r.msPerImage, agreement });
    } catch (err) {
      results.push({ device, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const usable = results.filter((r) => r.agreement !== undefined && r.agreement >= 0.999);
  const best = usable.reduce((a, b) => ((b.msPerImage ?? Infinity) < (a.msPerImage ?? Infinity) ? b : a));
  return { chosen: best.device, results, images: images.map((p) => basename(p)) };
}

export async function handle(req: RuntimeRequest): Promise<unknown> {
  switch (req.type) {
    case 'status':
      return statusFor(req.modelId);
    case 'download':
      // Multimodal: fetch every component (text + vision) so indexing never waits.
      await get(req.modelId, { vision: defOf(req.modelId).kind === 'multimodal' });
      return undefined;
    case 'embed':
      return embedText(req.modelId, req.texts, req.role, req.titles);
    case 'embedMedia':
      return embedImages(req.modelId, req.paths, req.budget);
    case 'countTokens':
      return countTokens(req.modelId, req.texts);
    case 'extractEntities':
      return extractEntitiesForModel(req.modelId, req.texts);
    case 'deviceCheck':
      return deviceCheck(req.modelId, req.devices, req.images);
    default:
      return fail('EINVAL', `Unknown AI request: ${(req as { type: string }).type}`);
  }
}
