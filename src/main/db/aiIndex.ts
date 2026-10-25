import { sep } from 'node:path';
import { asc, eq, inArray, isNotNull, like, or, sql } from 'drizzle-orm';
import type { ChunkKind, IndexInfo, IndexState, IndexStatus } from '@shared/types';
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
  kind: ChunkKind;
  loc?: number | null;
  locEnd?: number | null;
  pass?: number;
}

type StateRow = typeof indexState.$inferSelect;

/** A stored row as an IndexState (`info` is JSON in the table). */
function toState(row: StateRow): IndexState {
  // `status` widens to string through Drizzle; the column only ever holds an
  // IndexStatus (it's written exclusively via upsertState).
  return { ...row, status: row.status as IndexStatus, info: row.info ? (JSON.parse(row.info) as IndexInfo) : null };
}

/** Current index bookkeeping for a path, or null if never indexed. */
export async function getState(path: string): Promise<IndexState | null> {
  const [row] = await db().select().from(indexState).where(eq(indexState.path, path));
  return row ? toState(row) : null;
}

/** Insert or refresh the bookkeeping row for a file. */
export async function upsertState(state: IndexState): Promise<void> {
  const info = state.info ? JSON.stringify(state.info) : null;
  await db()
    .insert(indexState)
    .values({ ...state, info })
    .onConflictDoUpdate({
      target: indexState.path,
      set: {
        mtime: sql`excluded.mtime`,
        size: sql`excluded.size`,
        contentHash: sql`excluded.content_hash`,
        modelId: sql`excluded.model_id`,
        indexVersion: sql`excluded.index_version`,
        indexedAt: sql`excluded.indexed_at`,
        status: sql`excluded.status`,
        info: sql`excluded.info`,
      },
    });
}

/**
 * Replace a file's chunks wholesale: drop the old set, insert the new one. The
 * caller must have an `index_state` row for `path` first (the FK requires it).
 */
export async function replaceChunks(path: string, chunks: ChunkRow[]): Promise<void> {
  await db().delete(fileChunks).where(eq(fileChunks.path, path));
  await appendChunks(path, chunks);
}

/** Add chunks to a file's set (the later pass over a long file). */
export async function appendChunks(path: string, chunks: ChunkRow[]): Promise<void> {
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
  return rows.map(toState);
}

/** Long files still waiting for the later pass, oldest first. */
export async function partialStates(): Promise<IndexState[]> {
  const rows = await db().select().from(indexState).where(eq(indexState.status, 'partial')).orderBy(asc(indexState.indexedAt));
  return rows.map(toState);
}

/**
 * All indexed chunks, without their embedding BLOBs — used to rebuild the
 * in-memory BM25 store at startup. Omitting the BLOB makes the query cheap
 * regardless of how many files are indexed.
 */
export async function allChunks(): Promise<{ path: string; chunkIx: number; text: string; modelId: string }[]> {
  return db()
    .select({ path: fileChunks.path, chunkIx: fileChunks.chunkIx, text: fileChunks.text, modelId: fileChunks.modelId })
    .from(fileChunks)
    .orderBy(asc(fileChunks.path), asc(fileChunks.chunkIx));
}

/**
 * Every embedded chunk WITHOUT its text — the load that warms the in-memory
 * vector cache (vectorStore.sqlite.ts). Chunk text dominates row size, so
 * omitting it keeps the one-time load cheap; texts for the final top-k are
 * fetched separately via `chunkTexts`.
 */
export async function allEmbeddings(): Promise<EmbeddingRow[]> {
  const rows = await db()
    .select({
      path: fileChunks.path,
      chunkIx: fileChunks.chunkIx,
      modelId: fileChunks.modelId,
      embedding: fileChunks.embedding,
      kind: fileChunks.kind,
      pass: fileChunks.pass,
    })
    .from(fileChunks)
    .where(isNotNull(fileChunks.embedding))
    .orderBy(asc(fileChunks.path), asc(fileChunks.chunkIx));
  return rows as EmbeddingRow[];
}

/** An embedded chunk as the vector cache holds it (no text). */
export interface EmbeddingRow {
  path: string;
  chunkIx: number;
  modelId: string;
  embedding: Buffer;
  kind: ChunkKind;
  pass: number;
}

/** A chunk's text and place, for the hits a search returns. */
export interface ChunkDetail {
  text: string;
  kind: ChunkKind;
  loc: number | null;
  locEnd: number | null;
}

/** Text and place of specific chunks, keyed by `path\0chunkIx`. */
export async function chunkDetails(keys: { path: string; chunkIx: number }[]): Promise<Map<string, ChunkDetail>> {
  const out = new Map<string, ChunkDetail>();
  const paths = [...new Set(keys.map((k) => k.path))];
  const wanted = new Set(keys.map((k) => `${k.path}\x00${k.chunkIx}`));
  for (let i = 0; i < paths.length; i += CHUNK) {
    const rows = await db()
      .select({
        path: fileChunks.path,
        chunkIx: fileChunks.chunkIx,
        text: fileChunks.text,
        kind: fileChunks.kind,
        loc: fileChunks.loc,
        locEnd: fileChunks.locEnd,
      })
      .from(fileChunks)
      .where(inArray(fileChunks.path, paths.slice(i, i + CHUNK)));
    for (const r of rows) {
      const key = `${r.path}\x00${r.chunkIx}`;
      if (wanted.has(key)) out.set(key, { text: r.text, kind: r.kind as ChunkKind, loc: r.loc, locEnd: r.locEnd });
    }
  }
  return out;
}

/** Chunk texts for the given paths (the search top-k), keyed by path + chunkIx. */
export async function chunkTexts(
  paths: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < paths.length; i += CHUNK) {
    const rows = await db()
      .select({ path: fileChunks.path, chunkIx: fileChunks.chunkIx, text: fileChunks.text })
      .from(fileChunks)
      .where(inArray(fileChunks.path, paths.slice(i, i + CHUNK)));
    for (const r of rows) out.set(`${r.path}\x00${r.chunkIx}`, r.text);
  }
  return out;
}
