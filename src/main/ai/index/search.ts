import { basename, relative } from 'node:path';
import type { ChunkKind, SearchResult, SemanticHit } from '@shared/types';
import { getModelDef, relevanceOf, type EmbedRole } from '@shared/aiModels';
import * as aiIndex from '../../db/aiIndex';
import type { AiProvider } from '../providers/types';
import type { ScoredChunk, VectorStore } from './vectorStore';
import type { KeywordStore } from './keywordStore';
import { extractText, isImage } from './extract';
import { isUnder, visionBudget } from './ignore';
import { chunk } from './chunk';
import { fileKinds, isLookup, kindHints, queryTerms } from './query';
import * as service from '../../fs/service';

/**
 * Hybrid search: meaning (EmbeddingGemma 2 vectors — text and pictures in one
 * space) + words (BM25 over chunk text and file names), with an honest
 * "nothing found".
 *
 * Meaning: every chunk is scored anyway (brute force over the vector cache),
 * so the query's whole score distribution is free. Each cosine is centred on
 * its modality's mean (picture and text vectors sit at slightly different
 * levels for the same query) and divided by the pooled deviation: a z-score
 * on this query's own scale. Only chunks that stand out (z ≥ Z_GATE) count as
 * meaning matches — and only when their cosine also clears the model's
 * `minMatch` floor (the top of any distribution would otherwise always
 * "match") — so a query about nothing in the index finds nothing.
 * Chunks the later pass added over long files are scored but don't set the
 * scale (a book's hundreds of pages would otherwise drag every query's text
 * mean down).
 *
 * Words: a file qualifies when it contains at least half the query's content
 * terms; its bonus grows with that coverage. Codes, IDs and names that no
 * vector holds exactly are found this way. A term that's in no file as typed
 * also matches as a word start ("grok" finds "grokipedia").
 *
 * Score = meaning z + WORD_WEIGHT·coverage^1.5 (+1 when the query names the
 * file's kind: "a screenshot of…"). A lookup query (only codes/numbers)
 * qualifies files by words alone — an embedding can't hold "INV-20431", and
 * a nearest neighbour to it is noise — and weighs words double. Hits scoring under STRONG_RATIO of
 * the top one are "weaker matches" (`strong` counts the rest).
 *
 * Pure orchestration with injected deps (testable, no Electron).
 */

const DEFAULT_K = 20;
/** z-score a chunk needs to count as a meaning match. */
export const Z_GATE = 2.0;
/** Share of the query's terms a file needs to qualify on words alone. */
export const COVERAGE_GATE = 0.5;
/** Weight of full word coverage against one standard deviation of meaning. */
export const WORD_WEIGHT = 2;
/** Hits below this share of the top score are folded as weaker matches. */
export const STRONG_RATIO = 0.5;
/** Characters of the matched segment handed to chat (the model reads this). */
const PASSAGE_CHARS = 1500;
/** Characters of the snippet shown in result lists. */
const SNIPPET_CHARS = 240;

/** Per-chunk z-scores on this query's scale (see the module comment). */
export function zScores(chunks: ScoredChunk[]): number[] {
  // Video frames are pictures; sound sits at its own level.
  const modality = (c: ScoredChunk) =>
    c.kind === 'image' || c.kind === 'frame' ? 'image' : c.kind === 'audio' ? 'audio' : 'text';
  const sum = new Map<string, number>();
  const count = new Map<string, number>();
  let all = 0;
  let n = 0;
  for (const c of chunks) {
    if (c.pass !== 1) continue;
    const m = modality(c);
    sum.set(m, (sum.get(m) ?? 0) + c.score);
    count.set(m, (count.get(m) ?? 0) + 1);
    all += c.score;
    n++;
  }
  if (n === 0) return chunks.map(() => 0);
  // A modality with too few vectors to have a stable mean uses the overall one.
  const mean = (m: string) => ((count.get(m) ?? 0) >= 20 ? sum.get(m)! / count.get(m)! : all / n);
  let sq = 0;
  for (const c of chunks) if (c.pass === 1) sq += (c.score - mean(modality(c))) ** 2;
  const sd = Math.sqrt(sq / n) || 1;
  return chunks.map((c) => (c.score - mean(modality(c))) / sd);
}

/** Segments with no text of their own to quote (a picture, a moment of a recording, a file name). */
function textless(segment: ChunkKind): boolean {
  return segment === 'image' || segment === 'frame' || segment === 'audio' || segment === 'name';
}

/** Display relevance in [0, 1) from a fused score (monotone; 2 ≈ 0.55, 4 ≈ 0.8). */
function relevance(score: number): number {
  return 1 - Math.exp(-Math.max(0, score) / 2.5);
}

/** A snippet of `text` around the first query term, with matched words marked «like this». */
export function markedSnippet(text: string, terms: string[], limit = SNIPPET_CHARS): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!terms.length) return flat.slice(0, limit);
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})[\\p{L}\\p{N}]*`, 'giu');
  const first = flat.search(re);
  const start = first > 60 ? flat.lastIndexOf(' ', first - 40) + 1 : 0;
  let slice = flat.slice(start, start + limit);
  if (start > 0) slice = `…${slice}`;
  if (start + limit < flat.length) slice = `${slice}…`;
  return slice.replace(re, (m) => `«${m}»`);
}

interface Candidate {
  path: string;
  score: number;
  /** The chunk the hit points at. */
  chunkIx: number;
  /** Whether that chunk came from the word lane (its snippet may be marked). */
  byWords: boolean;
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
    /** 'question' when the query is a question asked of the files (chat). */
    role?: Exclude<EmbedRole, 'passage'>;
  } = {},
): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { hits: [], strong: 0 };
  const k = opts.k ?? DEFAULT_K;

  // Meaning: z-score every chunk, keep each file's best.
  const [vec] = await provider.embed(modelId, [q], opts.role ?? 'query');
  // The scale comes from the whole index, so a search scoped to a small folder
  // still knows what "standing out" means; only the candidates are scoped.
  const scanned = await vectorStore.scan(vec, { modelId });
  const z = zScores(scanned);
  const minMatch = getModelDef(modelId)?.minMatch ?? -Infinity;
  const meaning = new Map<string, { z: number; chunkIx: number; matches: boolean }>();
  scanned.forEach((c, i) => {
    if (opts.rootPath && !isUnder(c.path, opts.rootPath)) return;
    const prev = meaning.get(c.path);
    if (!prev || z[i] > prev.z) {
      meaning.set(c.path, { z: z[i], chunkIx: c.chunkIx, matches: z[i] >= Z_GATE && c.score >= minMatch });
    }
  });

  // Words: per-file coverage of the query's terms, and each file's best keyword chunk.
  const terms = queryTerms(q);
  const coverage = new Map<string, number>();
  const wordChunk = new Map<string, number>();
  if (opts.keywordStore && terms.length) {
    const ks = opts.keywordStore;
    // A term in no file as typed matches as a word start; a two-letter one never
    // does (it starts too many words to stand for one).
    const prefixed = new Set(
      terms.filter((t) => [...t].length >= 3 && ks.filesWith(t, { prefix: false, underPath: opts.rootPath }).size === 0),
    );
    for (const t of terms) {
      for (const p of ks.filesWith(t, { prefix: prefixed.has(t), underPath: opts.rootPath })) {
        coverage.set(p, (coverage.get(p) ?? 0) + 1 / terms.length);
      }
    }
    for (const m of ks.searchTerms(terms, { prefixed, underPath: opts.rootPath })) {
      if (!wordChunk.has(m.path)) wordChunk.set(m.path, m.chunkIx);
    }
  }

  const lookup = isLookup(q);
  const [meaningWeight, wordWeight] = lookup ? [0.5, WORD_WEIGHT * 2] : [1, WORD_WEIGHT];
  const hinted = kindHints(q);
  const candidates = new Set<string>();
  if (!lookup) for (const [p, m] of meaning) if (m.matches) candidates.add(p);
  for (const [p, c] of coverage) if (c >= COVERAGE_GATE) candidates.add(p);

  const scored: Candidate[] = [...candidates].map((path) => {
    const m = meaning.get(path);
    const cov = coverage.get(path) ?? 0;
    let score = meaningWeight * Math.max(m?.z ?? 0, 0) + wordWeight * cov ** 1.5;
    if ([...fileKinds(path)].some((kind) => hinted.has(kind))) score += 1;
    // Point at the best meaning chunk when it stands out; else where the words matched.
    const useMeaning = m !== undefined && (m.matches || !wordChunk.has(path));
    return {
      path,
      score,
      chunkIx: useMeaning ? m.chunkIx : wordChunk.get(path)!,
      byWords: !useMeaning || wordChunk.get(path) === m?.chunkIx,
    };
  });
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const hits = await resolveHits(scored.slice(0, k), terms, vectorStore, opts.rootPath);
  const top = hits[0]?.score ?? 0;
  return { hits, strong: hits.filter((h) => h.score >= top * STRONG_RATIO).length };
}

/**
 * Resolve candidates into SemanticHits: stat each file (pruning index rows for
 * files that vanished from disk), attach the pointed-at chunk's place, a
 * passage for chat, and a snippet — with the query's words marked only when
 * they come from that chunk.
 */
async function resolveHits(
  scored: Candidate[],
  terms: string[],
  vectorStore: VectorStore,
  rootPath: string | undefined,
): Promise<SemanticHit[]> {
  const infos = await Promise.all(scored.map((m) => service.getInfo(m.path).catch(() => null)));
  const stale = scored.filter((_, i) => infos[i] === null).map((m) => m.path);
  // Prune through the vector store so its in-memory cache drops them too.
  if (stale.length) await vectorStore.remove(stale);

  const details = await aiIndex.chunkDetails(scored.map((c) => ({ path: c.path, chunkIx: c.chunkIx })));
  const hits: SemanticHit[] = [];
  scored.forEach((c, i) => {
    const info = infos[i];
    if (!info) return;
    const d = details.get(`${c.path}\x00${c.chunkIx}`);
    const text = d?.text ?? '';
    const segment: ChunkKind = d?.kind ?? 'text';
    hits.push({
      ...info,
      relativePath: rootPath ? relative(rootPath, c.path) : c.path,
      score: relevance(c.score),
      snippet: textless(segment) ? '' : markedSnippet(text, c.byWords ? terms : []),
      passage: textless(segment) ? '' : text.replace(/\s+/g, ' ').trim().slice(0, PASSAGE_CHARS),
      segment,
      loc: d?.loc ?? null,
      locEnd: d?.locEnd ?? null,
    });
  });
  return hits;
}

/** How many leading chunks of the probe file to average into the query vector. */
const SIMILAR_PROBE_CHUNKS = 4;
/** Chunks per file vary, so over-fetch candidates before collapsing to files. */
const OVERFETCH = 5;

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
  const best = new Map<string, { score: number; chunkIx: number }>();
  for (const m of matches) {
    if (m.path === filePath) continue;
    const s = relevanceOf(modelId, m.score);
    if (!best.has(m.path) || s > best.get(m.path)!.score) best.set(m.path, { score: s, chunkIx: m.chunkIx });
  }
  const ranked = [...best.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, k);
  const hits = await resolveHits(
    ranked.map(([path, b]) => ({ path, score: 0, chunkIx: b.chunkIx, byWords: false })),
    [],
    vectorStore,
    opts.rootPath,
  );
  // Similarity keeps its calibrated cosine as the relevance shown.
  const scoreOf = new Map(ranked.map(([path, b]) => [path, b.score]));
  return hits.map((h) => ({ ...h, score: scoreOf.get(h.path) ?? 0 }));
}
