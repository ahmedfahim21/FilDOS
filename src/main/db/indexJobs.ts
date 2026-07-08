import { and, asc, count, eq, lt, sql } from 'drizzle-orm';
import { db } from './index';
import { indexJobs } from './schema';

/**
 * The persistent indexing queue. One row per path, so re-enqueuing a file
 * coalesces and the latest intent wins (a 'remove' supersedes a stale 'upsert',
 * and vice-versa when a deleted file reappears). Pure database logic mirroring
 * db/aiIndex.ts: every mutation is a single statement. The queue survives
 * restarts — `resume()` flips any in-flight rows back to pending so a crash
 * mid-job re-runs it.
 */

export type IndexOp = 'upsert' | 'remove';

/** A dequeued job for the indexer to process. */
export interface IndexJob {
  path: string;
  op: IndexOp;
}

/** SQLite caps bound parameters per statement; stay well under the limit. */
const CHUNK = 500;
/** Give up retrying a file after this many failures (kept as 'error', visible). */
export const MAX_ATTEMPTS = 3;

/** Heavy documents: full parse plus hundreds of chunk embeddings per file. */
const HEAVY_EXTENSIONS = new Set(['pdf', 'docx']);
/** One CLIP embedding per file — cheap-ish, but behind plain text. */
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif',
]);

/**
 * Cost class for queue ordering: cheap text/code and removals drain first so a
 * fresh index is useful within minutes; images next; book-size documents last.
 * (Extension sets mirror ai/index/extract.ts — the queue only needs the coarse
 * classes, not the full taxonomy.)
 */
function costClass(path: string, op: IndexOp): number {
  if (op === 'remove') return 0;
  const dot = path.lastIndexOf('.');
  const ext = dot >= 0 ? path.slice(dot + 1).toLowerCase() : '';
  if (HEAVY_EXTENSIONS.has(ext)) return 2;
  if (IMAGE_EXTENSIONS.has(ext)) return 1;
  return 0;
}

/** Enqueue (or re-arm) a single path; the newest op wins, status resets to pending. */
export async function enqueue(path: string, op: IndexOp): Promise<void> {
  await enqueueMany([path], op);
}

/** Enqueue many paths with the same op in one batched, idempotent statement. */
export async function enqueueMany(paths: string[], op: IndexOp): Promise<void> {
  const now = Date.now();
  for (let i = 0; i < paths.length; i += CHUNK) {
    await db()
      .insert(indexJobs)
      .values(
        paths
          .slice(i, i + CHUNK)
          .map((path) => ({ path, op, enqueuedAt: now, status: 'pending', priority: costClass(path, op) })),
      )
      .onConflictDoUpdate({
        target: indexJobs.path,
        set: {
          op: sql`excluded.op`,
          enqueuedAt: sql`excluded.enqueued_at`,
          status: sql`'pending'`,
          attempts: sql`0`,
          priority: sql`excluded.priority`,
        },
      });
  }
}

/** The next pending jobs: cheapest cost class first, then oldest first. */
export async function nextPending(limit = 1): Promise<IndexJob[]> {
  const rows = await db()
    .select({ path: indexJobs.path, op: indexJobs.op })
    .from(indexJobs)
    .where(eq(indexJobs.status, 'pending'))
    .orderBy(asc(indexJobs.priority), asc(indexJobs.enqueuedAt))
    .limit(limit);
  return rows as IndexJob[];
}

/** Mark a job failed; once it has burned through MAX_ATTEMPTS it stops retrying. */
export async function markError(path: string): Promise<void> {
  await db()
    .update(indexJobs)
    .set({ attempts: sql`attempts + 1`, status: sql`'error'` })
    .where(eq(indexJobs.path, path));
}

/** Re-arm jobs that errored fewer than MAX_ATTEMPTS times (called on resume). */
export async function resume(): Promise<void> {
  await db()
    .update(indexJobs)
    .set({ status: sql`'pending'` })
    .where(and(eq(indexJobs.status, 'error'), lt(indexJobs.attempts, MAX_ATTEMPTS)));
}

/** Remove a finished job. */
export async function done(path: string): Promise<void> {
  await db().delete(indexJobs).where(eq(indexJobs.path, path));
}

/** How many jobs are still pending. */
export async function countPending(): Promise<number> {
  const [{ n }] = await db()
    .select({ n: count() })
    .from(indexJobs)
    .where(eq(indexJobs.status, 'pending'));
  return n;
}

/** Drop the whole queue (used by "Clear index"). */
export async function clearJobs(): Promise<void> {
  await db().delete(indexJobs);
}
