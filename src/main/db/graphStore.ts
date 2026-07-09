import { and, asc, eq, inArray, lt, ne, or, sql } from 'drizzle-orm';
import type { EntityType } from '@shared/graphTypes';
import { db } from './index';
import { entities, entityState, fileChunks, fileEntities, fileTags, graphEdges } from './schema';

/**
 * Storage for the knowledge graph: extracted entities and their file mentions,
 * per-file NER bookkeeping (`entity_state`), and the cached embedding-similarity
 * edges (`graph_edges`). Pure database logic — the relationship engine
 * (src/main/ai/graph/) decides what to write; matching aiIndex.ts, every
 * mutation is a single statement and all rows follow index_state(path) via FK
 * cascades on rename/move/delete.
 */

/** SQLite caps bound parameters per statement; stay well under the limit. */
const CHUNK = 400;

/** One entity a file mentions, aggregated: how often it appeared. */
export interface FileEntity {
  name: string;
  type: EntityType;
  count: number;
}

/** A mention row joined with its entity, as the snapshot assembler reads it. */
export interface MentionRow {
  path: string;
  entityId: number;
  name: string;
  type: EntityType;
  count: number;
}

/** An undirected similarity edge; store with src < dst so pairs stay unique. */
export interface SimilarityEdge {
  src: string;
  dst: string;
  weight: number;
}

/**
 * Replace a file's extracted entities and stamp `entity_state` with the
 * index_state.indexed_at the extraction ran against (the staleness check).
 * Entity rows are shared across files, created on first mention.
 */
export async function replaceFileEntities(
  path: string,
  found: FileEntity[],
  indexedAt: number,
): Promise<void> {
  await db().delete(fileEntities).where(eq(fileEntities.path, path));
  if (found.length > 0) {
    await db()
      .insert(entities)
      .values(found.map((f) => ({ name: f.name, type: f.type })))
      .onConflictDoNothing();
    // (name, type) is UNIQUE COLLATE NOCASE, so match the same way we insert.
    const rows = await db()
      .select({ id: entities.id, name: entities.name, type: entities.type })
      .from(entities)
      .where(
        or(
          ...found.map((f) =>
            and(sql`${entities.name} = ${f.name} COLLATE NOCASE`, eq(entities.type, f.type)),
          ),
        ),
      );
    const idByKey = new Map(rows.map((r) => [`${r.name.toLowerCase()}\x00${r.type}`, r.id]));
    const values = found.flatMap((f) => {
      const id = idByKey.get(`${f.name.toLowerCase()}\x00${f.type}`);
      return id == null ? [] : [{ path, entityId: id, count: f.count }];
    });
    for (let i = 0; i < values.length; i += CHUNK) {
      await db()
        .insert(fileEntities)
        .values(values.slice(i, i + CHUNK))
        .onConflictDoNothing();
    }
  }
  await db()
    .insert(entityState)
    .values({ path, indexedAt })
    .onConflictDoUpdate({ target: entityState.path, set: { indexedAt: sql`excluded.indexed_at` } });
}

/** Every entity_state row as path → indexed_at, for the staleness diff. */
export async function entityStates(): Promise<Map<string, number>> {
  const rows = await db().select().from(entityState);
  return new Map(rows.map((r) => [r.path, r.indexedAt]));
}

/** All mentions joined with their entities, for snapshot assembly. */
export async function allMentions(): Promise<MentionRow[]> {
  const rows = await db()
    .select({
      path: fileEntities.path,
      entityId: fileEntities.entityId,
      name: entities.name,
      type: entities.type,
      count: fileEntities.count,
    })
    .from(fileEntities)
    .innerJoin(entities, eq(fileEntities.entityId, entities.id));
  return rows as MentionRow[];
}

/** Drop entity rows nothing mentions anymore (after removals/re-extraction). */
export async function pruneOrphanEntities(): Promise<void> {
  await db()
    .delete(entities)
    .where(
      sql`${entities.id} NOT IN (SELECT DISTINCT ${fileEntities.entityId} FROM ${fileEntities})`,
    );
}

/** Replace the similarity edges touching the given paths (their kNN changed). */
export async function replaceEdgesFor(paths: string[], edges: SimilarityEdge[]): Promise<void> {
  for (let i = 0; i < paths.length; i += CHUNK) {
    const slice = paths.slice(i, i + CHUNK);
    await db()
      .delete(graphEdges)
      .where(or(inArray(graphEdges.src, slice), inArray(graphEdges.dst, slice)));
  }
  await insertEdges(edges);
}

/** Wipe and rewrite all similarity edges (full rebuild). */
export async function replaceAllEdges(edges: SimilarityEdge[]): Promise<void> {
  await db().delete(graphEdges);
  await insertEdges(edges);
}

async function insertEdges(edges: SimilarityEdge[]): Promise<void> {
  for (let i = 0; i < edges.length; i += CHUNK) {
    await db()
      .insert(graphEdges)
      .values(edges.slice(i, i + CHUNK))
      .onConflictDoNothing();
  }
}

/** Every cached similarity edge, for snapshot assembly. */
export async function allEdges(): Promise<SimilarityEdge[]> {
  return db().select().from(graphEdges);
}

/**
 * The text NER runs over: each file's first chunks (a file's entities are
 * overwhelmingly in its opening), skipping image chunks (their "text" is just
 * the basename). Returned joined per path, in chunk order.
 */
export async function nerTexts(
  paths: string[],
  excludeModelId: string,
  maxChunks = 3,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < paths.length; i += CHUNK) {
    const rows = await db()
      .select({ path: fileChunks.path, text: fileChunks.text })
      .from(fileChunks)
      .where(
        and(
          inArray(fileChunks.path, paths.slice(i, i + CHUNK)),
          ne(fileChunks.modelId, excludeModelId),
          lt(fileChunks.chunkIx, maxChunks),
        ),
      )
      .orderBy(asc(fileChunks.path), asc(fileChunks.chunkIx));
    for (const r of rows) out.set(r.path, out.has(r.path) ? `${out.get(r.path)}\n${r.text}` : r.text);
  }
  return out;
}

/** Every tag assignment, for snapshot assembly (reads only; tags.ts mutates). */
export async function allFileTags(): Promise<{ path: string; tagId: number }[]> {
  return db().select({ path: fileTags.path, tagId: fileTags.tagId }).from(fileTags);
}

/** Forget the whole graph (entity mentions cascade off entities). */
export async function clearAll(): Promise<void> {
  await db().delete(graphEdges);
  await db().delete(entityState);
  await db().delete(entities);
  await db().delete(fileEntities);
}
