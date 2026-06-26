import { relative } from 'node:path';
import type { SearchMatch, SemanticHit } from '@shared/types';
import type { AiProvider } from '../providers/types';
import type { VectorStore } from './vectorStore';
import * as service from '../../fs/service';
import * as aiIndex from '../../db/aiIndex';

/**
 * Semantic search: embed the query with the active model, rank indexed chunks by
 * cosine (via the vector store), then collapse to one hit per file and enrich
 * with live file metadata. Files that have since been deleted on disk are pruned
 * from the index and dropped from the results — the same lazy-prune the tag and
 * recents handlers do. Pure orchestration with injected deps so it's testable
 * without Electron (mirrors indexer.ts).
 */

const DEFAULT_K = 20;
/** Chunks per file vary, so over-fetch candidates before collapsing to files. */
const OVERFETCH = 5;

export async function semanticSearch(
  provider: AiProvider,
  modelId: string,
  vectorStore: VectorStore,
  query: string,
  opts: { rootPath?: string; k?: number } = {},
): Promise<SemanticHit[]> {
  const q = query.trim();
  if (!q) return [];

  const [vec] = await provider.embed(modelId, [q]);
  if (!vec) return [];

  const k = opts.k ?? DEFAULT_K;
  const matches = await vectorStore.search(vec, {
    underPath: opts.rootPath,
    k: Math.max(k * OVERFETCH, 50),
  });

  // Collapse to the best-scoring chunk per file (matches arrive score-desc, so
  // the first time we see a path is its best). Drop opposite-direction matches.
  const bestPerFile = new Map<string, SearchMatch>();
  for (const m of matches) {
    if (m.score <= 0) continue;
    if (!bestPerFile.has(m.path)) bestPerFile.set(m.path, m);
  }

  const best = [...bestPerFile.values()];
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
        snippet: m.text.slice(0, 240),
      };
    })
    .filter((h): h is SemanticHit => h !== null)
    .slice(0, k);
}
