import { relative } from 'node:path';
import type { SemanticHit } from '@shared/types';
import { relevanceOf } from '@shared/aiModels';
import type { AiProvider } from '../providers/types';
import type { VectorStore } from './vectorStore';
import type { KeywordStore } from './keywordStore';
import { extractText, isImage } from './extract';
import { chunk } from './chunk';
import * as service from '../../fs/service';
import * as aiIndex from '../../db/aiIndex';

/**
 * Semantic search across both indexed modalities. The text lane fuses vector
 * similarity and BM25 keyword ranking via Reciprocal Rank Fusion (RRF) when a
 * keyword store is provided — exact/identifier matches that embeddings handle
 * poorly (error codes, filenames, API names) get boosted without needing to
 * calibrate scores across two different scales. The image lane is vector-only;
 * CLIP already maps text and images into the same space, so BM25 adds nothing
 * there. Both lanes use calibrated [0,1] cosine for the final merged ranking.
 *
 * Pure orchestration with injected deps (testable, no Electron).
 */

const DEFAULT_K = 20;
/** Chunks per file vary, so over-fetch candidates before collapsing to files. */
const OVERFETCH = 5;
/**
 * Standard RRF constant. Lower → earlier ranks dominate more sharply.
 * 60 is the empirically validated default from the original RRF paper.
 */
const RRF_K = 60;

export interface SearchModels {
  text: string;
  image: string;
}

interface Scored {
  path: string;
  text: string;
  /** Calibrated relevance in [0, 1]. */
  score: number;
}

/** Embed the query with one model and rank that model's chunks; calibrated. */
async function searchOne(
  provider: AiProvider,
  modelId: string,
  vectorStore: VectorStore,
  query: string,
  rootPath: string | undefined,
  k: number,
): Promise<Scored[]> {
  const [vec] = await provider.embed(modelId, [query], 'query');
  if (!vec) return [];
  const matches = await vectorStore.search(vec, { underPath: rootPath, k, modelId });
  return matches.map((m) => ({ path: m.path, text: m.text, score: relevanceOf(modelId, m.score) }));
}

/**
 * Collapse multiple chunks for the same file to the single best-scoring one,
 * then sort by score descending and take at most k.
 */
function bestPerFile(hits: { path: string; text: string; score: number }[], k: number): Scored[] {
  const best = new Map<string, Scored>();
  for (const h of hits) {
    const cur = best.get(h.path);
    if (!cur || h.score > cur.score) best.set(h.path, h);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, k);
}

/**
 * Reciprocal Rank Fusion for the text lane.
 *
 * Fuses the vector-ranked list and the BM25-ranked list without needing a
 * shared score scale — ranks are scale-free. RRF score for a path:
 *   1/(RRF_K + vecRank) + 1/(RRF_K + bm25Rank)
 * Paths absent from a lane get a penalty rank (length + RRF_K) rather than
 * infinity, so a strong BM25 hit with no embedding can still surface.
 *
 * The final `score` is the calibrated cosine from the vector lane (or 0 when
 * a path only appears in BM25). This keeps the merged ranking with the image
 * lane on a comparable scale for the UI relevance bar.
 */
function rrfFuse(
  vecHits: Scored[],
  bm25Hits: { path: string; text: string; score: number }[],
  k: number,
): Scored[] {
  // Best-per-file from each lane, ordered for rank assignment.
  const vecFile = bestPerFile(vecHits, vecHits.length);
  const vecRank = new Map(vecFile.map((h, i) => [h.path, i + 1]));
  const vecData = new Map(vecFile.map((h) => [h.path, h]));

  const bm25File = bestPerFile(bm25Hits, bm25Hits.length);
  const bm25Rank = new Map(bm25File.map((h, i) => [h.path, i + 1]));
  const bm25Text = new Map(bm25File.map((h) => [h.path, h.text]));

  const fallbackVecRank = vecFile.length + RRF_K;
  const fallbackBm25Rank = bm25File.length + RRF_K;

  const allPaths = new Set([...vecRank.keys(), ...bm25Rank.keys()]);
  const fused = [...allPaths].map((path) => {
    const vr = vecRank.get(path) ?? fallbackVecRank;
    const br = bm25Rank.get(path) ?? fallbackBm25Rank;
    const rrfScore = 1 / (RRF_K + vr) + 1 / (RRF_K + br);
    const vec = vecData.get(path);
    return {
      path,
      score: vec?.score ?? 0,
      text: vec?.text ?? bm25Text.get(path) ?? '',
      rrfScore,
    };
  });

  return fused
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, k)
    .map(({ path, score, text }) => ({ path, score, text }));
}

/** How many text-lane candidates to pass through the cross-encoder. */
const RERANK_N = 50;

/**
 * Resolve scored paths into SemanticHits: stat each file, prune index rows for
 * files that vanished from disk, attach relative path + snippet, cap at k.
 */
async function resolveHits(
  scored: Scored[],
  rootPath: string | undefined,
  k: number,
): Promise<SemanticHit[]> {
  const infos = await Promise.all(scored.map((m) => service.getInfo(m.path).catch(() => null)));

  const stale = scored.filter((_, i) => infos[i] === null).map((m) => m.path);
  if (stale.length) await aiIndex.remove(stale);

  return scored
    .map((m, i): SemanticHit | null => {
      const info = infos[i];
      if (!info) return null;
      return {
        ...info,
        relativePath: rootPath ? relative(rootPath, m.path) : m.path,
        score: m.score,
        snippet: m.text.replace(/\s+/g, ' ').trim().slice(0, 240),
      };
    })
    .filter((h): h is SemanticHit => h !== null)
    .slice(0, k);
}

export async function semanticSearch(
  provider: AiProvider,
  models: SearchModels,
  vectorStore: VectorStore,
  query: string,
  opts: { rootPath?: string; k?: number; keywordStore?: KeywordStore; rerankerModelId?: string } = {},
): Promise<SemanticHit[]> {
  const q = query.trim();
  if (!q) return [];

  const k = opts.k ?? DEFAULT_K;
  const fetchK = Math.max(k * OVERFETCH, 50);

  // Text lane: fuse vector + BM25 via RRF when a keyword store is available.
  const vecText = await searchOne(provider, models.text, vectorStore, q, opts.rootPath, fetchK);
  const bm25Hits = opts.keywordStore?.search(q, { underPath: opts.rootPath, k: fetchK });
  let textHits = bm25Hits ? rrfFuse(vecText, bm25Hits, fetchK) : bestPerFile(vecText, fetchK);

  // Cross-encoder reranking of text-lane top-N. Only activates when the model
  // was already downloaded (we never trigger a download on the query path).
  if (opts.rerankerModelId && provider.rerank && textHits.length > 0) {
    try {
      const st = await provider.status(opts.rerankerModelId);
      if (st.state === 'ready') {
        const toRerank = textHits.slice(0, RERANK_N);
        const scores = await provider.rerank(opts.rerankerModelId, q, toRerank.map((h) => h.text));
        const reranked = toRerank
          .map((h, i): [Scored, number] => [h, scores[i] ?? 0])
          .sort(([, a], [, b]) => b - a)
          .map(([h]) => h);
        textHits = [...reranked, ...textHits.slice(RERANK_N)];
      }
    } catch {
      // Non-fatal: cross-encoder unavailable or errored; keep RRF order.
    }
  }

  // Image lane: vector-only — CLIP maps text and images into one space natively.
  let imageHits: Scored[] = [];
  try {
    const vecImage = await searchOne(provider, models.image, vectorStore, q, opts.rootPath, fetchK);
    imageHits = bestPerFile(vecImage, fetchK);
  } catch {
    imageHits = [];
  }

  // Merge text (RRF/rerank-ordered) and image (cosine-ordered).
  //
  // Two invariants to respect:
  //  1. Text-lane ordering (RRF/rerank) is trusted within that lane — don't re-sort
  //     by cosine, which would discard the BM25 boost.
  //  2. Cross-lane comparison uses cosine score so a strongly-relevant image can
  //     beat a weakly-relevant text hit.
  //  3. BM25-only text hits (cosine = 0) are included at the bottom of the text lane
  //     so exact keyword matches that have no embedding are not silently dropped.
  //
  // Strategy: keep text hits in their existing order; sort image hits by cosine;
  // interleave the two streams by cosine at each step.
  const textPaths = new Set(textHits.map((h) => h.path));
  const sortedImages = imageHits
    .filter((h) => h.score > 0 && !textPaths.has(h.path))
    .sort((a, b) => b.score - a.score);

  // Assign BM25-only text hits a tiny positive score so they're included but ranked last.
  const textWithFloor = textHits.map((h) => (h.score > 0 ? h : { ...h, score: 1e-9 }));

  // Two-pointer merge preserving within-text-lane order, interleaving images by cosine.
  const best: Scored[] = [];
  let ti = 0, ii = 0;
  while (best.length < k * 3 && (ti < textWithFloor.length || ii < sortedImages.length)) {
    const t = textWithFloor[ti];
    const img = sortedImages[ii];
    if (!t) { best.push(img!); ii++; }
    else if (!img || t.score >= img.score) { best.push(t); ti++; }
    else { best.push(img); ii++; }
  }
  return resolveHits(best, opts.rootPath, k);
}

/** How many leading chunks of the probe file to average into the query vector. */
const SIMILAR_PROBE_CHUNKS = 4;

/**
 * "Find similar" search: rank indexed files by similarity to a given file
 * instead of a text query. Images are embedded with the CLIP model and matched
 * against the image lane; text/document files are embedded with the text model
 * (the first few chunks averaged into one probe vector) and matched against the
 * text lane. The probe file itself is excluded from the results.
 */
export async function similarByFile(
  provider: AiProvider,
  models: SearchModels,
  vectorStore: VectorStore,
  filePath: string,
  opts: { rootPath?: string; k?: number } = {},
): Promise<SemanticHit[]> {
  const k = opts.k ?? DEFAULT_K;
  const fetchK = Math.max(k * OVERFETCH, 50);

  let vec: Float32Array | undefined;
  let modelId: string;
  if (isImage(filePath)) {
    modelId = models.image;
    [vec] = await provider.embedImages(modelId, [filePath]);
  } else {
    modelId = models.text;
    const text = await extractText(filePath);
    if (!text) {
      throw Object.assign(
        new Error('This file type can’t be read for similarity search.'),
        { code: 'EUNSUPPORTED' },
      );
    }
    const probes = chunk(text).slice(0, SIMILAR_PROBE_CHUNKS).map((c) => c.text);
    const vecs = await provider.embed(modelId, probes, 'passage');
    if (vecs.length) {
      // Average the chunk vectors; cosine ignores magnitude, so no renorm needed.
      const dim = vecs[0].length;
      const avg = new Float32Array(dim);
      for (const v of vecs) for (let i = 0; i < dim; i++) avg[i] += v[i];
      vec = avg;
    }
  }
  if (!vec) return [];

  const matches = await vectorStore.search(vec, {
    underPath: opts.rootPath,
    k: fetchK,
    modelId,
  });
  const scored = matches
    .filter((m) => m.path !== filePath)
    .map((m) => ({ path: m.path, text: m.text, score: relevanceOf(modelId, m.score) }));

  return resolveHits(bestPerFile(scored, k), opts.rootPath, k);
}
