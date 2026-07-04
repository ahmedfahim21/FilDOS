import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { basename, dirname, extname, join, relative } from 'node:path';
import type { Entry, FileInfo, SearchHit } from '@shared/types';

/**
 * Pure file-system logic. Functions here throw on failure; the IPC handlers
 * (handlers.ts) are responsible for converting thrown errors into the
 * Result<T> shape the renderer consumes.
 */

/** Construct an errno-style error so handlers map it to a friendly message. */
function makeError(code: string, message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

/**
 * Validate a path coming from the renderer before touching the disk. Browsing
 * is intentionally unrestricted (it's a file manager), but we reject malformed
 * input — empty, non-absolute, or containing a null byte.
 */
export function assertValidPath(p: unknown): string {
  if (typeof p !== 'string' || p.length === 0) {
    throw makeError('EINVAL', 'Invalid path.');
  }
  if (p.includes('\0')) {
    throw makeError('EINVAL', 'Invalid path.');
  }
  if (!path.isAbsolute(p)) {
    throw makeError('EINVAL', 'Path must be absolute.');
  }
  return path.normalize(p);
}

/** Reject a name that is empty, "." / "..", or contains a path separator. */
function assertValidName(name: string): string {
  const safe = name.trim();
  if (!safe || safe === '.' || safe === '..') {
    throw makeError('EINVAL', 'Invalid name.');
  }
  if (safe.includes(path.sep) || safe.includes('/') || safe.includes('\0')) {
    throw makeError('EINVAL', 'Name cannot contain path separators.');
  }
  return safe;
}

function isHiddenName(name: string): boolean {
  return name.startsWith('.');
}

/**
 * Find a non-colliding destination path inside `destDir` for `name`, inserting
 * " copy", " copy 2", … before the extension as needed.
 */
export async function uniqueDestination(destDir: string, name: string): Promise<string> {
  const ext = extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;

  const candidate = (suffix: string) => join(destDir, `${stem}${suffix}${ext}`);
  const exists = async (p: string) =>
    fs.access(p).then(
      () => true,
      () => false,
    );

  if (!(await exists(join(destDir, name)))) return join(destDir, name);
  if (!(await exists(candidate(' copy')))) return candidate(' copy');
  for (let i = 2; i < 1000; i++) {
    const c = candidate(` copy ${i}`);
    if (!(await exists(c))) return c;
  }
  throw makeError('EEXIST', 'A file with that name already exists.');
}

/** Render mode bits (e.g. 0o755) as "rwxr-xr-x". */
function formatPermissions(mode: number): string {
  const bits = mode & 0o777;
  const rwx = (n: number) =>
    `${n & 4 ? 'r' : '-'}${n & 2 ? 'w' : '-'}${n & 1 ? 'x' : '-'}`;
  return rwx((bits >> 6) & 7) + rwx((bits >> 3) & 7) + rwx(bits & 7);
}

function extOf(name: string, isDirectory: boolean): string {
  if (isDirectory) return '';
  return extname(name).replace(/^\./, '').toLowerCase();
}

/**
 * List a directory. Folders are returned first, then files, each group sorted
 * case-insensitively by name. Entries that can't be stat'd (e.g. broken
 * symlinks, races) are skipped rather than failing the whole listing.
 */
export async function listDir(dirPath: string): Promise<Entry[]> {
  const dirents = await fs.readdir(dirPath, { withFileTypes: true });

  const entries = await Promise.all(
    dirents.map(async (dirent): Promise<Entry | null> => {
      const fullPath = join(dirPath, dirent.name);
      try {
        const stats = await fs.lstat(fullPath);
        const isSymlink = stats.isSymbolicLink();
        // For symlinks, reflect the target's directory-ness when resolvable.
        let isDirectory = stats.isDirectory();
        if (isSymlink) {
          try {
            const target = await fs.stat(fullPath);
            isDirectory = target.isDirectory();
          } catch {
            // Broken link — treat as a file-like entry.
          }
        }
        return {
          name: dirent.name,
          path: fullPath,
          isDirectory,
          isSymlink,
          isHidden: isHiddenName(dirent.name),
          size: isDirectory ? 0 : stats.size,
          ext: extOf(dirent.name, isDirectory),
          modified: stats.mtimeMs,
          created: stats.birthtimeMs || stats.ctimeMs,
        };
      } catch {
        return null;
      }
    }),
  );

  return entries
    .filter((e): e is Entry => e !== null)
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

/** Detailed metadata for a single entry. */
export async function getInfo(targetPath: string): Promise<FileInfo> {
  const stats = await fs.lstat(targetPath);
  const isSymlink = stats.isSymbolicLink();
  const name = basename(targetPath);

  let isDirectory = stats.isDirectory();
  let realPath: string | null = null;
  if (isSymlink) {
    realPath = await fs.readlink(targetPath).catch(() => null);
    try {
      const target = await fs.stat(targetPath);
      isDirectory = target.isDirectory();
    } catch {
      /* broken link */
    }
  }

  return {
    name,
    path: targetPath,
    isDirectory,
    isSymlink,
    isHidden: isHiddenName(name),
    size: isDirectory ? 0 : stats.size,
    ext: extOf(name, isDirectory),
    modified: stats.mtimeMs,
    created: stats.birthtimeMs || stats.ctimeMs,
    accessed: stats.atimeMs,
    mode: stats.mode & 0o777,
    permissions: formatPermissions(stats.mode),
    realPath,
  };
}

/** Create a folder under `parentPath`. Throws EEXIST if the name is taken. */
export async function createFolder(parentPath: string, name: string): Promise<Entry> {
  const safeName = assertValidName(name);
  const target = join(parentPath, safeName);
  await fs.mkdir(target); // no recursive: surfaces EEXIST
  return getInfo(target);
}

/** Create a new, empty file. Surfaces EEXIST if the name is taken. */
export async function createFile(parentPath: string, name: string): Promise<Entry> {
  const safeName = assertValidName(name);
  const target = join(parentPath, safeName);
  const handle = await fs.open(target, 'wx'); // 'wx' fails if it exists
  await handle.close();
  return getInfo(target);
}

/** Rename an entry in place (same parent directory). */
export async function rename(targetPath: string, newName: string): Promise<Entry> {
  const safeName = assertValidName(newName);
  const destination = join(dirname(targetPath), safeName);
  if (destination === targetPath) return getInfo(targetPath);
  // Guard against clobbering an existing entry (fs.rename would overwrite).
  if (await pathExists(destination)) {
    throw makeError('EEXIST', 'A file with that name already exists.');
  }
  await fs.rename(targetPath, destination);
  return getInfo(destination);
}

export async function pathExists(p: string): Promise<boolean> {
  return fs.access(p).then(
    () => true,
    () => false,
  );
}

/** Copy entries into destDir, auto-renaming on collision. */
export async function copy(paths: string[], destDir: string): Promise<Entry[]> {
  const created: Entry[] = [];
  for (const src of paths) {
    const dest = await uniqueDestination(destDir, basename(src));
    await fs.cp(src, dest, { recursive: true, errorOnExist: true, force: false });
    created.push(await getInfo(dest));
  }
  return created;
}

/** Move entries into destDir, auto-renaming on collision (cross-device safe). */
export async function move(paths: string[], destDir: string): Promise<Entry[]> {
  const moved: Entry[] = [];
  for (const src of paths) {
    if (dirname(src) === destDir) {
      moved.push(await getInfo(src)); // already there
      continue;
    }
    const dest = await uniqueDestination(destDir, basename(src));
    try {
      await fs.rename(src, dest);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EXDEV') {
        // Across filesystems: copy then remove the original.
        await fs.cp(src, dest, { recursive: true });
        await fs.rm(src, { recursive: true, force: true });
      } else {
        throw e;
      }
    }
    moved.push(await getInfo(dest));
  }
  return moved;
}

/** Copy an entry beside itself with a " copy" suffix. */
export async function duplicate(targetPath: string): Promise<Entry> {
  const [created] = await copy([targetPath], dirname(targetPath));
  return created;
}

/** Recursive byte size of a folder. Depth- and entry-guarded; skips unreadable. */
export async function folderSize(targetPath: string): Promise<number> {
  let total = 0;
  const MAX_DEPTH = 64;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory — skip
    }
    for (const dirent of dirents) {
      const full = join(dir, dirent.name);
      if (dirent.isSymbolicLink()) continue; // don't follow links
      if (dirent.isDirectory()) {
        await walk(full, depth + 1);
      } else if (dirent.isFile()) {
        try {
          total += (await fs.stat(full)).size;
        } catch {
          /* skip */
        }
      }
    }
  }

  await walk(targetPath, 0);
  return total;
}

/** Recursive, case-insensitive name search under rootPath. Capped result set. */
export async function search(rootPath: string, query: string): Promise<SearchHit[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const LIMIT = 1000;
  const MAX_DEPTH = 32;
  const hits: SearchHit[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (hits.length >= LIMIT || depth > MAX_DEPTH) return;
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (hits.length >= LIMIT) return;
      const full = join(dir, dirent.name);
      if (dirent.name.toLowerCase().includes(needle)) {
        try {
          const info = await getInfo(full);
          hits.push({ ...info, relativePath: relative(rootPath, full) });
        } catch {
          /* skip */
        }
      }
      if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
        await walk(full, depth + 1);
      }
    }
  }

  await walk(rootPath, 0);
  return hits;
}
