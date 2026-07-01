import { createHash } from 'node:crypto';

/**
 * A stable supermemory `customId` for a file path. Supermemory keys documents by
 * `customId` (≤100 chars, `[A-Za-z0-9_-:]` only), so a raw path — with slashes,
 * spaces, and unicode — can't be used directly. We hash the absolute path to a
 * hex digest (deterministic, collision-safe, well within the length limit) and
 * store the real path in the document's `metadata` for the reverse lookup.
 *
 * Because the id is derived from the path, re-ingesting a changed file reuses the
 * same id (supermemory upserts on matching `customId`, confirmed live), and a
 * rename is a delete(old) + add(new).
 */
export function stableId(path: string): string {
  return `f_${createHash('sha256').update(path).digest('hex')}`;
}
