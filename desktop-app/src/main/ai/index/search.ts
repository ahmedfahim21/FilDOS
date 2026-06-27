import { relative } from 'node:path';
import type { SemanticHit } from '@shared/types';
import { relevanceOf } from '@shared/aiModels';
import type { AiProvider } from '../providers/types';
import type { VectorStore } from './vectorStore';
import * as service from '../../fs/service';
import * as aiIndex from '../../db/aiIndex';

/**
 * Semantic search across both indexed modalities. The query is embedded by each
 * model (the text model for documents, CLIP for images), each searches only its
 * own chunks (cosine across models is meaningless), and the per-model cosines are
 * mapped to a common [0, 1] relevance so the two can be ranked together. Results
 * collapse to one hit per file and are enriched with live metadata; files deleted
 * on disk are pruned. Pure orchestration with injected deps (testable, no Electron).
 */

const DEFAULT_K = 20;
/** Chunks per file vary, so over-fetch candidates before collapsing to files. */
const OVERFETCH = 5;

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

export async function semanticSearch(
  provider: AiProvider,
  models: SearchModels,
  vectorStore: VectorStore,
  query: string,
  opts: { rootPath?: string; k?: number } = {},
): Promise<SemanticHit[]> {
  const q = query.trim();
  if (!q) return [];

  const k = opts.k ?? DEFAULT_K;
  const fetchK = Math.max(k * OVERFETCH, 50);

  const text = await searchOne(provider, models.text, vectorStore, q, opts.rootPath, fetchK);
  // Image search is best-effort — skip if the CLIP model isn't available.
  let image: Scored[] = [];
  try {
    image = await searchOne(provider, models.image, vectorStore, q, opts.rootPath, fetchK);
  } catch {
    image = [];
  }

  // Collapse to the best-scoring chunk per file, dropping sub-threshold matches.
  const bestPerFile = new Map<string, Scored>();
  for (const m of [...text, ...image]) {
    if (m.score <= 0) continue;
    const cur = bestPerFile.get(m.path);
    if (!cur || m.score > cur.score) bestPerFile.set(m.path, m);
  }

  const best = [...bestPerFile.values()].sort((a, b) => b.score - a.score).slice(0, k * 3);
  const infos = await Promise.all(best.map((m) => service.getInfo(m.path).catch(() => null)));

  // Prune index rows for files that have vanished from disk.
  const stale = best.filter((_, i) => infos[i] === null).map((m) => m.path);
  if (stale.length) await aiIndex.remove(stale);

  return best
    .map((m, i): SemanticHit | null => {
      const info = infos[i];
      if (!info) return null;
      return {
        ...info,
        relativePath: opts.rootPath ? relative(opts.rootPath, m.path) : m.path,
        score: m.score,
        snippet: m.text.replace(/\s+/g, ' ').trim().slice(0, 240),
      };
    })
    .filter((h): h is SemanticHit => h !== null)
    .slice(0, k);
}
