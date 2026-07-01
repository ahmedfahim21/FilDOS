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
}

export interface MemorySearchOpts {
  /** Restrict results to files at or under this absolute path. */
  rootPath?: string;
  /** Maximum number of hits to return. */
  k?: number;
}
