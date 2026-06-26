import { sep } from 'node:path';
import { and, asc, eq, inArray, isNotNull, like, or, sql } from 'drizzle-orm';
import type { IndexState } from '@shared/types';
import { db } from './index';
import { fileChunks, indexState } from './schema';

/**
 * Storage for the AI index: one row per indexed file (`index_state`) plus its
 * extracted, optionally-embedded chunks (`file_chunks`). Pure database logic —
 * no fs access and no vector math (that lives in vectorStore.sqlite.ts). Every
 * mutation is a single statement so concurrent IPC calls can't interleave, and
 * embeddings cross this boundary already encoded as BLOBs. Stale rows (files
 * deleted outside FilDOS) are dropped by `prune`, which the future indexing
 * worker calls with the paths it has confirmed gone — the decision never lives
 * here, matching tags.ts/recents.ts.
 */

/** SQLite caps bound parameters per statement; stay well under the limit. */
const CHUNK = 500;

/** A chunk ready to persist: embedding is a Float32 LE BLOB (or null). */
export interface ChunkRow {
  chunkIx: number;
  text: string;
  embedding: Buffer | null;
  modelId: string;
}

/** A candidate chunk pulled for vector search (only rows that have a vector). */
export interface ChunkCandidate {
  path: string;
  chunkIx: number;
  text: string;
  embedding: Buffer;
}

/** Current index bookkeeping for a path, or null if never indexed. */
export async function getState(path: string): Promise<IndexState | null> {
  const [row] = await db().select().from(indexState).where(eq(indexState.path, path));
  // `status` widens to string through Drizzle; the column only ever holds an
  // IndexStatus (it's written exclusively via upsertState).
  return (row as IndexState) ?? null;
}

/** Insert or refresh the bookkeeping row for a file. */
export async function upsertState(state: IndexState): Promise<void> {
  await db()
    .insert(indexState)
    .values(state)
    .onConflictDoUpdate({
      target: indexState.path,
      set: {
        mtime: sql`excluded.mtime`,
        size: sql`excluded.size`,
        contentHash: sql`excluded.content_hash`,
        modelId: sql`excluded.model_id`,
        indexedAt: sql`excluded.indexed_at`,
        status: sql`excluded.status`,
      },
    });
}

/**
 * Replace a file's chunks wholesale: drop the old set, insert the new one. The
 * caller must have an `index_state` row for `path` first (the FK requires it).
 */
export async function replaceChunks(path: string, chunks: ChunkRow[]): Promise<void> {
  await db().delete(fileChunks).where(eq(fileChunks.path, path));
  for (let i = 0; i < chunks.length; i += CHUNK) {
    await db()
      .insert(fileChunks)
      .values(chunks.slice(i, i + CHUNK).map((c) => ({ path, ...c })));
  }
}

/** Drop index rows for the given paths; their chunks cascade away. */
export async function remove(paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += CHUNK) {
    await db().delete(indexState).where(inArray(indexState.path, paths.slice(i, i + CHUNK)));
  }
}

/**
 * Drop index rows for files that no longer exist on disk. Identical to
 * `remove`; named separately so callers read as "these paths are stale".
 */
export const prune = remove;

/** Wipe the whole index (used by "Clear index"); chunks cascade away. */
export async function clearAll(): Promise<void> {
  await db().delete(indexState);
}

/**
 * Every index_state row, optionally narrowed to a subtree. The indexer loads
 * these into a Map at the start of a crawl so staleness checks are in-memory
 * instead of one query per file.
 */
export async function statesUnder(underPath?: string): Promise<IndexState[]> {
  const base = db().select().from(indexState);
  const rows = underPath
    ? await base.where(
        or(eq(indexState.path, underPath), like(indexState.path, `${underPath}${sep}%`)),
      )
    : await base;
  return rows as IndexState[];
}

/**
 * Pull embedded chunks for brute-force vector search, optionally narrowed to a
 * subtree (`underPath`) and/or a file extension (`ext`, without the dot). Rows
 * without an embedding are skipped — there's nothing to compare them against.
 */
export async function searchCandidates(opts: {
  underPath?: string;
  ext?: string;
} = {}): Promise<ChunkCandidate[]> {
  const filters = [isNotNull(fileChunks.embedding)];
  if (opts.underPath) {
    // Exact file, or anything beneath the folder — the trailing separator keeps
    // "/proj" from also matching a sibling "/projects".
    filters.push(
      or(eq(fileChunks.path, opts.underPath), like(fileChunks.path, `${opts.underPath}${sep}%`))!,
    );
  }
  if (opts.ext) filters.push(like(fileChunks.path, `%.${opts.ext}`));

  const rows = await db()
    .select({
      path: fileChunks.path,
      chunkIx: fileChunks.chunkIx,
      text: fileChunks.text,
      embedding: fileChunks.embedding,
    })
    .from(fileChunks)
    .where(and(...filters))
    .orderBy(asc(fileChunks.path), asc(fileChunks.chunkIx));

  return rows as ChunkCandidate[];
}
