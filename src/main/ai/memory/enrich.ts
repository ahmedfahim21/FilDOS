import { relative, sep } from 'node:path';
import type { SemanticHit } from '@shared/types';
import * as service from '../../fs/service';

/**
 * A scored search candidate before enrichment: an absolute file path, a
 * calibrated relevance in [0, 1], and the matching text (for the snippet).
 * Both the local vector search and the supermemory backend reduce their
 * results to this shape, then share `enrichHits` to produce `SemanticHit`s.
 */
export interface ScoredHit {
  path: string;
  score: number;
  text: string;
}

const DEFAULT_K = 20;

/** True if `path` is `root` or lives beneath it (path-boundary safe). */
function isUnder(path: string, root: string): boolean {
  if (path === root) return true;
  return path.startsWith(root.endsWith(sep) ? root : root + sep);
}

/**
 * Turn scored (path, score, text) candidates into enriched `SemanticHit`s:
 * collapse to the best chunk per file, scope to `rootPath`, drop sub-threshold
 * matches and files that have vanished from disk, attach live metadata + a
 * snippet, rank by score, and cap at `k`.
 *
 * `onStale` receives the paths that no longer exist on disk so the caller can
 * prune its own store (the local backend deletes index rows; supermemory would
 * delete the document) — enrichment itself just omits them from the results.
 */
export async function enrichHits(
  scored: ScoredHit[],
  opts: { rootPath?: string; k?: number; onStale?: (paths: string[]) => Promise<void> } = {},
): Promise<SemanticHit[]> {
  const k = opts.k ?? DEFAULT_K;

  // Collapse to the best-scoring chunk per file, honouring the root scope.
  const bestPerFile = new Map<string, ScoredHit>();
  for (const m of scored) {
    if (m.score <= 0) continue;
    if (opts.rootPath && !isUnder(m.path, opts.rootPath)) continue;
    const cur = bestPerFile.get(m.path);
    if (!cur || m.score > cur.score) bestPerFile.set(m.path, m);
  }

  const best = [...bestPerFile.values()].sort((a, b) => b.score - a.score).slice(0, k * 3);
  const infos = await Promise.all(best.map((m) => service.getInfo(m.path).catch(() => null)));

  const stale = best.filter((_, i) => infos[i] === null).map((m) => m.path);
  if (stale.length && opts.onStale) await opts.onStale(stale);

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
