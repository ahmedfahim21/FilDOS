import { app, shell } from 'electron';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { TrashedItem } from '@shared/types';

/**
 * Hybrid trash model: deletions go to the real OS Trash via shell.trashItem, but
 * we additionally record where each item landed (by diffing the Trash directory
 * before/after) so we can offer a best-effort restore/undo. Restore can fail if
 * the OS renamed on collision or the original parent is gone — callers surface
 * that honestly.
 *
 * Trash-dir diffing is implemented for macOS (~/.Trash). On other platforms we
 * still trash the file but skip tracking (no restore).
 */
const LOG_FILE = () => join(app.getPath('userData'), 'trash-log.json');

function osTrashDir(): string | null {
  return process.platform === 'darwin' ? join(homedir(), '.Trash') : null;
}

async function readLog(): Promise<TrashedItem[]> {
  try {
    return JSON.parse(await fs.readFile(LOG_FILE(), 'utf8')) as TrashedItem[];
  } catch {
    return [];
  }
}

async function writeLog(items: TrashedItem[]): Promise<void> {
  try {
    await fs.writeFile(LOG_FILE(), JSON.stringify(items, null, 2));
  } catch {
    /* best-effort */
  }
}

async function listNames(dir: string): Promise<Set<string>> {
  try {
    return new Set(await fs.readdir(dir));
  } catch {
    return new Set();
  }
}

/** Trash each path, recording its landing spot when possible. */
export async function trashItems(paths: string[]): Promise<TrashedItem[]> {
  const trashDir = osTrashDir();
  const log = await readLog();
  const records: TrashedItem[] = [];

  for (const p of paths) {
    const before = trashDir ? await listNames(trashDir) : new Set<string>();
    await shell.trashItem(p);

    let trashedPath = '';
    if (trashDir) {
      const after = await listNames(trashDir);
      const added = [...after].filter((n) => !before.has(n));
      // Prefer an added entry matching the original base name.
      const name = basename(p);
      const match = added.find((n) => n === name) ?? added[0];
      if (match) trashedPath = join(trashDir, match);
    }

    const record: TrashedItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: basename(p),
      originalPath: p,
      trashedPath,
      deletedAt: Date.now(),
    };
    records.push(record);
    if (trashedPath) log.unshift(record); // only track if we found the landing spot
  }

  await writeLog(log);
  return records;
}

/** Tracked trashed items whose trashed file still exists. */
export async function listTrashed(): Promise<TrashedItem[]> {
  const log = await readLog();
  const alive: TrashedItem[] = [];
  for (const item of log) {
    try {
      await fs.access(item.trashedPath);
      alive.push(item);
    } catch {
      /* gone from Trash (emptied elsewhere) — drop it */
    }
  }
  if (alive.length !== log.length) await writeLog(alive);
  return alive;
}

/** Best-effort restore: move each tracked item back to its original location. */
export async function restoreTrashed(ids: string[]): Promise<void> {
  const log = await readLog();
  const remaining: TrashedItem[] = [];
  let lastError: Error | null = null;

  for (const item of log) {
    if (!ids.includes(item.id)) {
      remaining.push(item);
      continue;
    }
    try {
      // Refuse to clobber something now living at the original path.
      try {
        await fs.access(item.originalPath);
        throw Object.assign(new Error('Original location is occupied'), { code: 'EEXIST' });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      await fs.rename(item.trashedPath, item.originalPath);
    } catch (e) {
      lastError = e as Error;
      remaining.push(item); // keep it tracked so the user can retry
    }
  }

  await writeLog(remaining);
  if (lastError) throw lastError;
}

/** Permanently delete every tracked trashed item and clear the log. */
export async function emptyTracked(): Promise<void> {
  const log = await readLog();
  for (const item of log) {
    await fs.rm(item.trashedPath, { recursive: true, force: true });
  }
  await writeLog([]);
}

/** Reveal the OS Trash in the system file manager. */
export async function openOsTrash(): Promise<void> {
  const dir = osTrashDir();
  if (dir) await shell.openPath(dir);
}
