import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Prefs } from '@shared/types';

/**
 * Tiny JSON-backed preferences store in userData. Cached in memory; writes are
 * best-effort and merge into the existing object.
 */
let cache: Prefs | null = null;

const file = () => join(app.getPath('userData'), 'prefs.json');

export async function getPrefs(): Promise<Prefs> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(file(), 'utf8')) as Prefs;
  } catch {
    cache = {};
  }
  return cache;
}

export async function setPrefs(patch: Prefs): Promise<void> {
  const current = await getPrefs();
  cache = { ...current, ...patch };
  try {
    await fs.writeFile(file(), JSON.stringify(cache, null, 2));
  } catch {
    /* best-effort */
  }
}
