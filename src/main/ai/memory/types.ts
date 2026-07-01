import type { SemanticHit } from '@shared/types';

/**
 * The memory-backend contract — the seam that lets FilDOS swap *what* answers
 * search (and, later, owns ingestion) without touching the crawl/watch/queue
 * machinery around it.
 *
 * It sits ONE LEVEL ABOVE the `AiProvider` embed seam: a provider turns text
 * into vectors, whereas a backend owns the whole "make files searchable + answer
 * queries" problem. `LocalBackend` implements this over the on-device indexer +
 * SQLite vector store (so `AiProvider` becomes an implementation detail of it);
 * a future `SupermemoryBackend` implements it by forwarding to the bundled
 * supermemory daemon.
 *
 * Methods throw on failure — the IPC handler converts thrown errors into the
 * `Result<T>` discriminated union, like the FS and AI handlers.
 */
export interface MemoryBackend {
  /** Registry key (e.g. 'local', 'supermemory'). */
  readonly id: string;

  /**
   * Answer a natural-language query with the most relevant files. `rootPath`
   * scopes results to a subtree; `k` caps the number of hits.
   */
  search(query: string, opts?: MemorySearchOpts): Promise<SemanticHit[]>;

  /**
   * Make one file searchable (extract/embed/store, or upload to the daemon) and
   * record its `index_state` bookkeeping. Idempotent — a file that is already
   * current under this backend is a no-op. Throws on failure so the indexer can
   * mark the job errored and move on.
   */
  ingest(path: string): Promise<void>;

  /** Drop files from the index (and the backend's own store). */
  remove(paths: string[]): Promise<void>;

  /**
   * The backend's identity for a file, stored in `index_state.modelId` and used
   * by the crawler for change-detection. Changing backend (or, for local, the
   * per-file model) changes the fingerprint, so switching re-indexes. Cheap and
   * synchronous — the crawler calls it per file.
   */
  fingerprint(path: string): string;
}

export interface MemorySearchOpts {
  /** Restrict results to files at or under this absolute path. */
  rootPath?: string;
  /** Maximum number of hits to return. */
  k?: number;
}
