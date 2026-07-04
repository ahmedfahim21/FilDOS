import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import type { Entry } from '@shared/types';
import { isRemote, parseRemote } from '@shared/remote';
import { getProvider } from '../cloud/registry';
import type { Provider } from '../cloud/provider';
import * as service from './service';

/**
 * Cross-storage transfers. When a copy/move crosses a realm boundary — local ↔
 * cloud, or between two different cloud accounts/providers — there is no single
 * backend that can move the bytes, so we orchestrate it here on top of the
 * per-provider `Provider` interface (download/upload) and the local `service`.
 *
 * Same-realm transfers never reach this module: the handlers route all-local
 * ops to `service.copy/move` and same-account cloud ops to the provider's own
 * server-side `copy/move`.
 */

const MAX_DEPTH = 64;

/** A location resolved to the concrete calls needed to read/write it. */
interface RemoteTarget {
  provider: Provider;
  accountId: string;
  /** Path within the provider (the RemoteRef.path component). */
  path: string;
}

/** Resolve a remote URI to its provider + ref, throwing a friendly error if unknown. */
function resolveRemote(uri: string): RemoteTarget {
  const ref = parseRemote(uri);
  if (!ref) throw Object.assign(new Error('Invalid remote URI.'), { code: 'EINVAL' });
  const provider = getProvider(ref.provider);
  if (!provider)
    throw Object.assign(
      new Error(`No provider registered for '${ref.provider}'. Connect an account first.`),
      { code: 'ENOENT' },
    );
  return { provider, accountId: ref.accountId, path: ref.path };
}

/** getInfo for either realm, yielding a uniform Entry. */
function statAny(path: string): Promise<Entry> {
  if (isRemote(path)) {
    const t = resolveRemote(path);
    return t.provider.getInfo(t.accountId, t.path);
  }
  return service.getInfo(service.assertValidPath(path));
}

/** listDir for either realm; each returned Entry.path is a local path or a URI. */
function listAny(path: string): Promise<Entry[]> {
  if (isRemote(path)) {
    const t = resolveRemote(path);
    return t.provider.listDir(t.accountId, t.path);
  }
  return service.listDir(service.assertValidPath(path));
}

/** Create a child folder named `name` under `destDir`; returns its new path (URI or local). */
async function makeChildDir(destDir: string, name: string): Promise<string> {
  if (isRemote(destDir)) {
    const t = resolveRemote(destDir);
    const entry = await t.provider.createFolder(t.accountId, t.path, name);
    return entry.path;
  }
  const parent = service.assertValidPath(destDir);
  const target = await service.uniqueDestination(parent, name);
  await fs.mkdir(target);
  return target;
}

/** Copy a single file (not a folder) named `name` from `srcPath` into `destDir`. */
async function copyFileAcross(srcPath: string, destDir: string, name: string): Promise<Entry> {
  const srcRemote = isRemote(srcPath);
  const destRemote = isRemote(destDir);

  // local → cloud
  if (!srcRemote && destRemote) {
    const dst = resolveRemote(destDir);
    return dst.provider.upload(dst.accountId, service.assertValidPath(srcPath), dst.path);
  }

  // cloud → local
  if (srcRemote && !destRemote) {
    const src = resolveRemote(srcPath);
    const dest = await service.uniqueDestination(service.assertValidPath(destDir), name);
    const written = await src.provider.download(src.accountId, src.path, dest);
    return service.getInfo(written);
  }

  // cloud → cloud (different provider or account): bounce through a temp file.
  if (srcRemote && destRemote) {
    const src = resolveRemote(srcPath);
    const dst = resolveRemote(destDir);
    const tempDir = join(app.getPath('temp'), `fildos-xfer-${randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });
    try {
      const localTmp = await src.provider.download(src.accountId, src.path, join(tempDir, name));
      return await dst.provider.upload(dst.accountId, localTmp, dst.path);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  // local → local never reaches here (handlers route it to service.copy).
  const [created] = await service.copy(
    [service.assertValidPath(srcPath)],
    service.assertValidPath(destDir),
  );
  return created;
}

/** Recursively copy an entry (file or folder) from `srcPath` into `destDir`. */
async function copyEntry(srcPath: string, destDir: string, depth = 0): Promise<Entry> {
  if (depth > MAX_DEPTH)
    throw Object.assign(new Error('Folder nesting is too deep to transfer.'), { code: 'EINVAL' });

  const info = await statAny(srcPath);
  if (!info.isDirectory) return copyFileAcross(srcPath, destDir, info.name);

  const newDir = await makeChildDir(destDir, info.name);
  for (const child of await listAny(srcPath)) {
    await copyEntry(child.path, newDir, depth + 1);
  }
  return statAny(newDir);
}

/** Remove a source entry after a verified move (OS/cloud trash for safety on remote). */
async function removeSource(srcPath: string): Promise<void> {
  if (isRemote(srcPath)) {
    const t = resolveRemote(srcPath);
    await t.provider.trash(t.accountId, [t.path]);
  } else {
    await fs.rm(service.assertValidPath(srcPath), { recursive: true, force: true });
  }
}

/**
 * Copy `paths` (any realm) into `destDir` (any realm). Returns the top-level
 * created entries, in input order.
 */
export async function copyAcross(paths: string[], destDir: string): Promise<Entry[]> {
  const created: Entry[] = [];
  for (const src of paths) created.push(await copyEntry(src, destDir));
  return created;
}

/**
 * Move `paths` (any realm) into `destDir` (any realm): each source is copied,
 * then removed only after its copy fully succeeds. Returns top-level entries.
 */
export async function moveAcross(paths: string[], destDir: string): Promise<Entry[]> {
  const moved: Entry[] = [];
  for (const src of paths) {
    const entry = await copyEntry(src, destDir);
    await removeSource(src);
    moved.push(entry);
  }
  return moved;
}
