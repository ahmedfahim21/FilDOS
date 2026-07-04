import MiniSearch from 'minisearch';
import { basename } from 'node:path';

/**
 * In-memory BM25 keyword index over the indexed file chunks. Complements the
 * brute-force cosine vector store for exact/identifier searches — filenames,
 * error codes, function names, and IDs that embeddings handle poorly.
 *
 * Lifecycle: rebuilt from `file_chunks` at startup (cheap — skips the embedding
 * BLOB), then kept in sync via upsert/remove alongside every vector write. No
 * persistence: a rebuild from DB takes milliseconds at personal-filesystem scale
 * and avoids a second source of truth that can drift or corrupt.
 */

interface Doc {
  id: string;
  path: string;
  chunkIx: number;
  text: string;
  /** basename(path) — boosted so filename matches rank above body matches. */
  filename: string;
}

export interface KeywordMatch {
  path: string;
  chunkIx: number;
  text: string;
  /** Raw BM25 score from minisearch. Not calibrated to [0,1]; used for RRF rank. */
  score: number;
}

export interface KeywordStore {
  /** Replace all indexed chunks for a file. Synchronous (in-memory). */
  upsert(path: string, chunks: { chunkIx: number; text: string }[]): void;
  /** Drop all chunks for the given paths. */
  remove(paths: string[]): void;
  /** Move a file's chunks to a new path after rename/move. */
  remap(oldPath: string, newPath: string): void;
  /** BM25 search. Results are sorted by score, optionally narrowed to a subtree. */
  search(query: string, opts?: { underPath?: string; k?: number }): KeywordMatch[];
  /** Drop all indexed documents. */
  clear(): void;
  /** Total number of indexed chunk documents. */
  size(): number;
}

function docId(path: string, chunkIx: number): string {
  return `${path}\x00${chunkIx}`;
}

const MS_OPTS: ConstructorParameters<typeof MiniSearch<Doc>>[0] = {
  fields: ['text', 'filename'],
  storeFields: ['path', 'chunkIx', 'text'],
  idField: 'id',
};

export class MiniSearchKeywordStore implements KeywordStore {
  private ms = new MiniSearch<Doc>(MS_OPTS);
  /** Side index: path → stored chunks, for O(chunks) remove and remap. */
  private readonly byPath = new Map<string, { ix: number; text: string }[]>();

  upsert(path: string, chunks: { chunkIx: number; text: string }[]): void {
    this.remove([path]);
    if (!chunks.length) return;
    const filename = basename(path);
    this.ms.addAll(
      chunks.map((c) => ({ id: docId(path, c.chunkIx), path, chunkIx: c.chunkIx, text: c.text, filename })),
    );
    this.byPath.set(path, chunks.map((c) => ({ ix: c.chunkIx, text: c.text })));
  }

  remove(paths: string[]): void {
    for (const path of paths) {
      const stored = this.byPath.get(path);
      if (!stored) continue;
      for (const { ix } of stored) {
        try {
          this.ms.discard(docId(path, ix));
        } catch {
          // Already absent — safe to ignore.
        }
      }
      this.byPath.delete(path);
    }
  }

  remap(oldPath: string, newPath: string): void {
    const stored = this.byPath.get(oldPath);
    if (!stored) return;
    const chunks = stored.map((c) => ({ chunkIx: c.ix, text: c.text }));
    this.remove([oldPath]);
    this.upsert(newPath, chunks);
  }

  search(query: string, opts: { underPath?: string; k?: number } = {}): KeywordMatch[] {
    const k = opts.k ?? 20;
    interface SR { path: string; chunkIx: number; text: string; score: number }
    const raw = this.ms.search(query, {
      boost: { filename: 2 },
      fuzzy: 0.15,
      prefix: true,
    }) as unknown as SR[];

    const { underPath } = opts;
    // Check both separators so the filter works on Windows (\) and POSIX (/) paths.
    const results = underPath
      ? raw.filter(
          (r) =>
            r.path === underPath ||
            r.path.startsWith(underPath + '/') ||
            r.path.startsWith(underPath + '\\'),
        )
      : raw;

    return results.slice(0, k).map((r) => ({
      path: r.path,
      chunkIx: r.chunkIx,
      text: r.text,
      score: r.score,
    }));
  }

  clear(): void {
    this.ms = new MiniSearch<Doc>(MS_OPTS);
    this.byPath.clear();
  }

  size(): number {
    return this.ms.documentCount;
  }
}
