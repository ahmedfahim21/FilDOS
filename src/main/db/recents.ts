import { desc, inArray, notInArray, sql } from 'drizzle-orm';
import type { RecentItem } from '@shared/types';
import { db } from './index';
import { recents } from './schema';

/**
 * Recently opened files, recorded whenever a file is opened through FilDOS.
 * One row per path; re-opening bumps the timestamp and count. Vanished files
 * are pruned by the handler when the list is fetched.
 */

const DEFAULT_LIMIT = 50;
/** Hard cap on stored rows so the table can't grow without bound. */
const MAX_ROWS = 500;

/** Record (or refresh) an opened file. */
export async function recordOpen(path: string, name: string): Promise<void> {
  await db()
    .insert(recents)
    .values({ path, name, openedAt: Date.now() })
    .onConflictDoUpdate({
      target: recents.path,
      set: {
        name: sql`excluded.name`,
        openedAt: sql`excluded.opened_at`,
        openCount: sql`open_count + 1`,
      },
    });
  // Trim anything older than the newest MAX_ROWS entries.
  await db()
    .delete(recents)
    .where(
      notInArray(
        recents.path,
        db().select({ path: recents.path }).from(recents).orderBy(desc(recents.openedAt)).limit(MAX_ROWS),
      ),
    );
}

/** Most recently opened files, newest first. */
export function listRecents(limit = DEFAULT_LIMIT): Promise<RecentItem[]> {
  return db()
    .select({
      path: recents.path,
      name: recents.name,
      openedAt: recents.openedAt,
      openCount: recents.openCount,
    })
    .from(recents)
    .orderBy(desc(recents.openedAt))
    .limit(Math.max(1, Math.min(limit, MAX_ROWS)));
}

export async function removeRecents(paths: string[]): Promise<void> {
  await db().delete(recents).where(inArray(recents.path, paths));
}

export async function clearRecents(): Promise<void> {
  await db().delete(recents);
}
