import { basename, relative } from 'node:path';
import type { SemanticHit } from '@shared/types';
import { relevanceOf, type EmbedRole } from '@shared/aiModels';
import type { AiProvider } from '../providers/types';
import type { VectorStore } from './vectorStore';
import type { KeywordStore } from './keywordStore';
import { extractText, isImage } from './extract';
import { visionBudget } from './ignore';
import { chunk } from './chunk';
import * as service from '../../fs/service';

/**
 * Semantic search over the index. Text and pictures share one embedding space
 * (EmbeddingGemma 2), so a single vector lane ranks every kind of file. It is
 * fused with BM25 keyword ranking via Reciprocal Rank Fusion (RRF) when a
 * keyword store is provided — exact/identifier matches that embeddings handle
 * poorly (error codes, filenames, API names) get boosted without calibrating
 * scores across two scales — and the top candidates can be reranked by a
 * cross-encoder.
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

interface Scored {
  path: string;
  text: string;
  /** Calibrated relevance in [0, 1]. */
  score: number;
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

/**
 * How many text-lane candidates to pass through the cross-encoder, and how much
 * of each chunk it reads. The reranker runs on WASM: cost is roughly linear in
 * pairs × tokens, so 50 full 2 KB chunks meant seconds of latency per query.
 * 16 × 600 chars keeps the precision boost where it matters (the visible top)
 * at interactive speed.
 */
const RERANK_N = 16;
const RERANK_CHARS = 600;

/**
 * Resolve scored paths into SemanticHits: stat each file, prune index rows for
 * files that vanished from disk, attach relative path + snippet, cap at k.
 */
async function resolveHits(
  scored: Scored[],
  vectorStore: VectorStore,
  rootPath: string | undefined,
  k: number,
): Promise<SemanticHit[]> {
  const infos = await Promise.all(scored.map((m) => service.getInfo(m.path).catch(() => null)));

  const stale = scored.filter((_, i) => infos[i] === null).map((m) => m.path);
  // Prune through the vector store so its in-memory cache drops them too.
  if (stale.length) await vectorStore.remove(stale);

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
  modelId: string,
  vectorStore: VectorStore,
  query: string,
  opts: {
    rootPath?: string;
    k?: number;
    keywordStore?: KeywordStore;
    rerankerModelId?: string;
    /** 'question' when the query is a question asked of the files (chat). */
    role?: Exclude<EmbedRole, 'passage'>;
  } = {},
): Promise<SemanticHit[]> {
  const q = query.trim();
  if (!q) return [];

  const k = opts.k ?? DEFAULT_K;
  const fetchK = Math.max(k * OVERFETCH, 50);

  const [vec] = await provider.embed(modelId, [q], opts.role ?? 'query');
  const matches = await vectorStore.search(vec, { underPath: opts.rootPath, k: fetchK, modelId });
  const vecHits = matches.map((m) => ({ path: m.path, text: m.text, score: relevanceOf(modelId, m.score) }));
  const bm25Hits = opts.keywordStore?.search(q, { underPath: opts.rootPath, k: fetchK });
  let hits = bm25Hits ? rrfFuse(vecHits, bm25Hits, fetchK) : bestPerFile(vecHits, fetchK);

  // Cross-encoder reranking of the top-N. Only when the model is already
  // downloaded (the query path never triggers a download).
  if (opts.rerankerModelId && provider.rerank && hits.length > 0) {
    const st = await provider.status(opts.rerankerModelId);
    if (st.state === 'ready') {
      const toRerank = hits.slice(0, RERANK_N);
      const scores = await provider.rerank(
        opts.rerankerModelId,
        q,
        toRerank.map((h) => h.text.slice(0, RERANK_CHARS)),
      );
      const reranked = toRerank
        .map((h, i): [Scored, number] => [h, scores[i] ?? 0])
        .sort(([, a], [, b]) => b - a)
        .map(([h]) => h);
      hits = [...reranked, ...hits.slice(RERANK_N)];
    }
  }

  return resolveHits(hits, vectorStore, opts.rootPath, k);
}

/** How many leading chunks of the probe file to average into the query vector. */
const SIMILAR_PROBE_CHUNKS = 4;

/**
 * "Find similar" search: rank indexed files by similarity to a given file
 * instead of a text query. Pictures and documents share one space, so a photo
 * can surface related notes and the other way round. A document's probe is
 * the average of its first few passages; the file itself is excluded.
 */
export async function similarByFile(
  provider: AiProvider,
  modelId: string,
  vectorStore: VectorStore,
  filePath: string,
  opts: { rootPath?: string; k?: number } = {},
): Promise<SemanticHit[]> {
  const k = opts.k ?? DEFAULT_K;
  const fetchK = Math.max(k * OVERFETCH, 50);

  let vec: Float32Array | undefined;
  if (isImage(filePath)) {
    [vec] = await provider.embedMedia(modelId, 'image', [filePath], { budget: visionBudget(filePath) });
  } else {
    const text = await extractText(filePath);
    if (!text) {
      throw Object.assign(
        new Error('This file type can’t be read for similarity search.'),
        { code: 'EUNSUPPORTED' },
      );
    }
    const probes = chunk(text).slice(0, SIMILAR_PROBE_CHUNKS).map((c) => c.text);
    const title = basename(filePath);
    const vecs = await provider.embed(modelId, probes, 'passage', probes.map(() => title));
    if (vecs.length) {
      // Average the chunk vectors; cosine ignores magnitude, so no renorm needed.
      const dim = vecs[0].length;
      const avg = new Float32Array(dim);
      for (const v of vecs) for (let i = 0; i < dim; i++) avg[i] += v[i];
      vec = avg;
    }
  }
  if (!vec) return [];

  const matches = await vectorStore.search(vec, { underPath: opts.rootPath, k: fetchK, modelId });
  const scored = matches
    .filter((m) => m.path !== filePath)
    .map((m) => ({ path: m.path, text: m.text, score: relevanceOf(modelId, m.score) }));

  return resolveHits(bestPerFile(scored, k), vectorStore, opts.rootPath, k);
}
