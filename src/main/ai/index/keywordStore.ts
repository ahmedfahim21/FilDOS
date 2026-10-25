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
  /** Add chunks to a file's set (the later pass over a long file). */
  append(path: string, chunks: { chunkIx: number; text: string }[]): void;
  /** Drop all chunks for the given paths. */
  remove(paths: string[]): void;
  /** Move a file's chunks to a new path after rename/move. */
  remap(oldPath: string, newPath: string): void;
  /** BM25 search. Results are sorted by score, optionally narrowed to a subtree. */
  search(query: string, opts?: { underPath?: string; k?: number }): KeywordMatch[];
  /**
   * BM25 over exact query terms (no fuzziness), `prefixed` terms also matching
   * as word starts: the chunks containing any of them, best first.
   */
  searchTerms(terms: string[], opts: { prefixed: Set<string>; underPath?: string; k?: number }): KeywordMatch[];
  /** Files containing `term` (as a word, or a word start when `prefix`). */
  filesWith(term: string, opts: { prefix: boolean; underPath?: string }): Set<string>;
  /** Drop all indexed documents. */
  clear(): void;
  /** Total number of indexed chunk documents. */
  size(): number;
}

function docId(path: string, chunkIx: number): string {
  return `${path}\x00${chunkIx}`;
}

// Texts live once, in `byPath` (needed to re-add documents on remap); the
// index stores only what a result needs to point at a chunk.
const MS_OPTS: ConstructorParameters<typeof MiniSearch<Doc>>[0] = {
  fields: ['text', 'filename'],
  storeFields: ['path', 'chunkIx'],
  idField: 'id',
};

/** Separator-aware "path is root or beneath it" (both separators, for Windows). */
function under(path: string, root: string | undefined): boolean {
  return !root || path === root || path.startsWith(root + '/') || path.startsWith(root + '\\');
}

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

  append(path: string, chunks: { chunkIx: number; text: string }[]): void {
    if (!chunks.length) return;
    const filename = basename(path);
    this.ms.addAll(chunks.map((c) => ({ id: docId(path, c.chunkIx), path, chunkIx: c.chunkIx, text: c.text, filename })));
    this.byPath.set(path, [...(this.byPath.get(path) ?? []), ...chunks.map((c) => ({ ix: c.chunkIx, text: c.text }))]);
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

  /** The stored text of a chunk. */
  private textOf(path: string, chunkIx: number): string {
    return this.byPath.get(path)?.find((c) => c.ix === chunkIx)?.text ?? '';
  }

  private matches(raw: { path: string; chunkIx: number; score: number }[], underPath?: string, k = 20): KeywordMatch[] {
    return raw
      .filter((r) => under(r.path, underPath))
      .slice(0, k)
      .map((r) => ({ path: r.path, chunkIx: r.chunkIx, text: this.textOf(r.path, r.chunkIx), score: r.score }));
  }

  search(query: string, opts: { underPath?: string; k?: number } = {}): KeywordMatch[] {
    interface SR { path: string; chunkIx: number; score: number }
    const raw = this.ms.search(query, {
      boost: { filename: 2 },
      fuzzy: 0.15,
      prefix: true,
    }) as unknown as SR[];
    return this.matches(raw, opts.underPath, opts.k);
  }

  searchTerms(terms: string[], opts: { prefixed: Set<string>; underPath?: string; k?: number }): KeywordMatch[] {
    if (!terms.length) return [];
    interface SR { path: string; chunkIx: number; score: number }
    const raw = this.ms.search(terms.join(' '), {
      boost: { filename: 2 },
      fuzzy: false,
      prefix: (term) => opts.prefixed.has(term),
      combineWith: 'OR',
    }) as unknown as SR[];
    return this.matches(raw, opts.underPath, opts.k ?? 1000);
  }

  filesWith(term: string, opts: { prefix: boolean; underPath?: string }): Set<string> {
    interface SR { path: string }
    const raw = this.ms.search(term, { fuzzy: false, prefix: opts.prefix }) as unknown as SR[];
    return new Set(raw.filter((r) => under(r.path, opts.underPath)).map((r) => r.path));
  }

  clear(): void {
    this.ms = new MiniSearch<Doc>(MS_OPTS);
    this.byPath.clear();
  }

  size(): number {
    return this.ms.documentCount;
  }
}
