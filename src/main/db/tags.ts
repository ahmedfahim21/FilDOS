import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Tag } from '@shared/types';
import { db } from './index';
import { fileTags, tags } from './schema';

/**
 * Tagging: user-defined labels attached to absolute file paths. Pure database
 * logic — no fs access. Stale assignments (files deleted outside FilDOS) are
 * pruned by the handler when a tag's files are listed. Every mutation is a
 * single statement, so concurrent IPC calls can't interleave half-done work.
 */

/** Palette cycled through for auto-assigned tag colors. */
export const TAG_COLORS = [
  '#e5534b', // red
  '#e8883a', // orange
  '#d4a72c', // yellow
  '#3fb950', // green
  '#5b8cff', // blue
  '#a371f7', // purple
  '#db61a2', // pink
  '#8b949e', // gray
] as const;

function makeError(code: string, message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

function assertValidTagName(name: unknown): string {
  if (typeof name !== 'string') throw makeError('EINVAL', 'Invalid tag name.');
  const safe = name.trim();
  if (!safe || safe.length > 64) throw makeError('EINVAL', 'Tag names must be 1–64 characters.');
  return safe;
}

const tagColumns = {
  id: tags.id,
  name: tags.name,
  color: tags.color,
  count: count(fileTags.path),
};

/** All tags with usage counts, sorted by name. */
export function listTags(): Promise<Tag[]> {
  return db()
    .select(tagColumns)
    .from(tags)
    .leftJoin(fileTags, eq(fileTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(asc(sql`${tags.name} COLLATE NOCASE`));
}

async function getTag(id: number): Promise<Tag> {
  const [tag] = await db()
    .select(tagColumns)
    .from(tags)
    .leftJoin(fileTags, eq(fileTags.tagId, tags.id))
    .where(eq(tags.id, id))
    .groupBy(tags.id);
  if (!tag) throw makeError('ENOENT', 'That tag no longer exists.');
  return tag;
}

/** Create a tag; cycles the palette when no color is given. */
export async function createTag(name: string, color?: string): Promise<Tag> {
  const safe = assertValidTagName(name);
  const [{ n }] = await db().select({ n: count() }).from(tags);
  const chosen = color ?? TAG_COLORS[n % TAG_COLORS.length];
  try {
    const [created] = await db()
      .insert(tags)
      .values({ name: safe, color: chosen, createdAt: Date.now() })
      .returning({ id: tags.id });
    return await getTag(created.id);
  } catch {
    throw makeError('EINVAL', `A tag named “${safe}” already exists.`);
  }
}

export async function renameTag(id: number, name: string): Promise<Tag> {
  const safe = assertValidTagName(name);
  try {
    await db().update(tags).set({ name: safe }).where(eq(tags.id, id));
  } catch {
    throw makeError('EINVAL', `A tag named “${safe}” already exists.`);
  }
  return getTag(id);
}

/** Delete a tag; its file assignments cascade away. */
export async function deleteTag(id: number): Promise<void> {
  await db().delete(tags).where(eq(tags.id, id));
}

/** SQLite caps bound parameters per statement; stay well under the limit. */
const CHUNK = 500;

/** Attach a tag to the given paths (already-tagged paths are skipped). */
export async function assignTag(paths: string[], tagId: number): Promise<void> {
  const now = Date.now();
  for (let i = 0; i < paths.length; i += CHUNK) {
    await db()
      .insert(fileTags)
      .values(paths.slice(i, i + CHUNK).map((path) => ({ path, tagId, taggedAt: now })))
      .onConflictDoNothing();
  }
}

/** Detach a tag from the given paths. */
export async function unassignTag(paths: string[], tagId: number): Promise<void> {
  for (let i = 0; i < paths.length; i += CHUNK) {
    await db()
      .delete(fileTags)
      .where(and(eq(fileTags.tagId, tagId), inArray(fileTags.path, paths.slice(i, i + CHUNK))));
  }
}

/** Map of path → tag ids for the given paths. Untagged paths are omitted. */
export async function tagsForPaths(paths: string[]): Promise<Record<string, number[]>> {
  const result: Record<string, number[]> = {};
  for (let i = 0; i < paths.length; i += CHUNK) {
    const rows = await db()
      .select({ path: fileTags.path, tagId: fileTags.tagId })
      .from(fileTags)
      .where(inArray(fileTags.path, paths.slice(i, i + CHUNK)))
      .orderBy(asc(fileTags.taggedAt));
    for (const row of rows) (result[row.path] ??= []).push(row.tagId);
  }
  return result;
}

/** Every path currently carrying the tag, most recently tagged first. */
export async function pathsForTag(tagId: number): Promise<string[]> {
  const rows = await db()
    .select({ path: fileTags.path })
    .from(fileTags)
    .where(eq(fileTags.tagId, tagId))
    .orderBy(desc(fileTags.taggedAt));
  return rows.map((r) => r.path);
}

/** Drop assignments for files that no longer exist on disk. */
export async function pruneTaggedPaths(paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += CHUNK) {
    await db()
      .delete(fileTags)
      .where(inArray(fileTags.path, paths.slice(i, i + CHUNK)));
  }
}
