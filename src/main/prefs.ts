import { sql } from 'drizzle-orm';
import type { Prefs } from '@shared/types';
import { db } from './db';
import { prefs as prefsTable } from './db/schema';

/**
 * User preferences, stored one row per field in the SQLite `prefs` table
 * (values JSON-encoded).
 */

export async function getPrefs(): Promise<Prefs> {
  const rows = await db().select().from(prefsTable);
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      /* skip a corrupt row rather than failing every preference */
    }
  }
  return result as Prefs;
}

/** Merge `patch` into the stored preferences (undefined fields are ignored). */
export async function setPrefs(patch: Prefs): Promise<void> {
  const rows = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value: JSON.stringify(value) }));
  if (rows.length === 0) return;
  await db()
    .insert(prefsTable)
    .values(rows)
    .onConflictDoUpdate({ target: prefsTable.key, set: { value: sql`excluded.value` } });
}
