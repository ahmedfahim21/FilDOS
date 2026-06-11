import { promises as fs } from 'node:fs';
import { count, sql } from 'drizzle-orm';
import type { Prefs } from '@shared/types';
import { db } from './db';
import { prefs as prefsTable } from './db/schema';

/**
 * User preferences, stored one row per field in the SQLite `prefs` table
 * (values JSON-encoded). Replaces the old prefs.json; `importLegacyPrefs`
 * migrates that file into the table once, then renames it out of the way.
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

/**
 * One-time import of the pre-SQLite prefs.json. Only runs when the prefs
 * table is empty; the old file is renamed to *.migrated afterwards so the
 * import never repeats (and the data survives if anything goes wrong).
 */
export async function importLegacyPrefs(jsonFile: string): Promise<void> {
  const [{ n }] = await db().select({ n: count() }).from(prefsTable);
  if (n > 0) return;
  let legacy: Prefs;
  try {
    legacy = JSON.parse(await fs.readFile(jsonFile, 'utf8')) as Prefs;
  } catch {
    return; // no legacy file (fresh install) or unreadable — nothing to import
  }
  await setPrefs(legacy);
  await fs.rename(jsonFile, `${jsonFile}.migrated`).catch(() => {});
}
