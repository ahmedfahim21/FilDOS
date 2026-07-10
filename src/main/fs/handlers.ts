import { app, ipcMain, nativeImage, nativeTheme, shell } from 'electron';
import { basename, join, sep } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Channels } from '@shared/channels';
import type { AppError, Entry, FolderView, Result } from '@shared/types';
import { isRemote, parseRemote } from '@shared/remote';
import { getProvider } from '../cloud/registry';
import * as service from './service';
import { copyAcross, moveAcross } from './transfer';
import { quickAccess } from './quickAccess';
import { closeWatch, setWatch } from './watch';
import { thumbnail } from './thumbnails';
import { getPrefs, setPrefs } from '../prefs';
import type { Prefs } from '@shared/types';
import { remapPaths } from '../db';
import * as tags from '../db/tags';
import * as recents from '../db/recents';
import * as aiIndex from '../db/aiIndex';
import { getFolderView, setFolderView } from '../db/views';
import { listDrives, ejectDrive } from './drives';

/** Map a thrown error into a friendly, display-ready AppError. */
function toAppError(err: unknown): AppError {
  const e = err as NodeJS.ErrnoException;
  const code = e?.code ?? 'EUNKNOWN';
  const messages: Record<string, string> = {
    EACCES: 'Permission denied.',
    EPERM: 'Operation not permitted.',
    ENOENT: 'This item no longer exists.',
    EEXIST: 'A file with that name already exists.',
    ENOTDIR: 'That path is not a folder.',
    EISDIR: 'That path is a folder.',
    ENOTEMPTY: 'The folder is not empty.',
    EINVAL: e?.message || 'Invalid input.',
    ENAMETOOLONG: 'The name is too long.',
    EBUSY: 'The item is in use by another program.',
    EAUTH: e?.message || 'Session expired. Please reconnect this account.',
  };
  return { code, message: messages[code] ?? e?.message ?? 'Something went wrong.' };
}

function notSupported(op: string): NodeJS.ErrnoException {
  const err = new Error(`${op} is not supported for cloud storage.`) as NodeJS.ErrnoException;
  err.code = 'EINVAL';
  return err;
}

/**
 * True when every source and the destination live in the same cloud realm
 * (same provider + account), so the provider's own server-side copy/move can
 * handle it. Anything else crossing a boundary goes through the orchestrator.
 */
function sameRemoteRealm(paths: string[], destDir: string): boolean {
  const dst = parseRemote(destDir);
  if (!dst) return false;
  return paths.every((p) => {
    const s = parseRemote(p);
    return !!s && s.provider === dst.provider && s.accountId === dst.accountId;
  });
}

/** Run an async operation and wrap it in the Result discriminated union. */
async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: toAppError(err) };
  }
}

const { assertValidPath } = service;

/** Like assertValidPath but passes remote URIs through unchanged. */
const validatePath = (p: string) => (isRemote(p) ? p : assertValidPath(p));

/** Resolve a remote URI to its provider + ref, throwing if unknown. */
function remoteOp<T>(
  path: string,
  fn: (provider: NonNullable<ReturnType<typeof getProvider>>, ref: NonNullable<ReturnType<typeof parseRemote>>) => Promise<T>,
): Promise<Result<T>> {
  return wrap(async () => {
    const ref = parseRemote(path);
    if (!ref) throw Object.assign(new Error('Invalid remote URI.'), { code: 'EINVAL' });
    const provider = getProvider(ref.provider);
    if (!provider)
      throw Object.assign(
        new Error(`No provider registered for '${ref.provider}'. Connect an account first.`),
        { code: 'ENOENT' },
      );
    return fn(provider, ref);
  });
}

/** Register every FS IPC handler. Call once after app is ready. */
export function registerFsHandlers(): void {
  ipcMain.handle(Channels.listDir, (_e, path: string) => {
    if (isRemote(path)) return remoteOp(path, (p, ref) => p.listDir(ref.accountId, ref.path));
    return wrap(() => service.listDir(assertValidPath(path)));
  });

  ipcMain.handle(Channels.getInfo, (_e, path: string) => {
    if (isRemote(path)) return remoteOp(path, (p, ref) => p.getInfo(ref.accountId, ref.path));
    return wrap(() => service.getInfo(assertValidPath(path)));
  });

  ipcMain.handle(Channels.createFolder, (_e, parentPath: string, name: string) => {
    if (isRemote(parentPath))
      return remoteOp(parentPath, (p, ref) => p.createFolder(ref.accountId, ref.path, name));
    return wrap(() => service.createFolder(assertValidPath(parentPath), name));
  });

  ipcMain.handle(Channels.createFile, (_e, parentPath: string, name: string) => {
    if (isRemote(parentPath)) return wrap(async () => { throw notSupported('Creating files'); });
    return wrap(() => service.createFile(assertValidPath(parentPath), name));
  });

  ipcMain.handle(Channels.rename, (_e, path: string, newName: string) => {
    if (isRemote(path)) {
      return remoteOp(path, async (p, ref) => {
        const entry = await p.rename(ref.accountId, ref.path, newName);
        remapPaths(path, entry.path, '/');
        return entry;
      });
    }
    return wrap(async () => {
      const from = assertValidPath(path);
      const entry = await service.rename(from, newName);
      remapPaths(from, entry.path, sep);
      return entry;
    });
  });

  ipcMain.handle(Channels.copy, (_e, paths: string[], destDir: string) => {
    const srcRemote = paths.some(isRemote);
    const dstRemote = isRemote(destDir);
    // All-local: fast local path.
    if (!srcRemote && !dstRemote)
      return wrap(() => service.copy(paths.map(assertValidPath), assertValidPath(destDir)));
    // Same cloud account on both ends: efficient server-side copy.
    if (srcRemote && dstRemote && sameRemoteRealm(paths, destDir))
      return remoteOp(paths[0], (p, ref) =>
        p.copy(ref.accountId, paths.map((x) => parseRemote(x)!.path), parseRemote(destDir)!.path),
      );
    // Crosses a realm/account boundary: stream through the orchestrator.
    return wrap(() => copyAcross(paths, destDir));
  });

  ipcMain.handle(Channels.move, (_e, paths: string[], destDir: string) => {
    const srcRemote = paths.some(isRemote);
    const dstRemote = isRemote(destDir);
    // All-local: fast local path.
    if (!srcRemote && !dstRemote)
      return wrap(async () => {
        const sources = paths.map(assertValidPath);
        const moved = await service.move(sources, assertValidPath(destDir));
        moved.forEach((entry, i) => remapPaths(sources[i], entry.path, sep));
        return moved;
      });
    // Same cloud account on both ends: efficient server-side move.
    if (srcRemote && dstRemote && sameRemoteRealm(paths, destDir))
      return remoteOp(paths[0], async (p, ref) => {
        const moved = await p.move(ref.accountId, paths.map((x) => parseRemote(x)!.path), parseRemote(destDir)!.path);
        moved.forEach((entry, i) => remapPaths(paths[i], entry.path, '/'));
        return moved;
      });
    // Crosses a realm/account boundary: copy-then-remove via the orchestrator.
    return wrap(async () => {
      const moved = await moveAcross(paths, destDir);
      moved.forEach((entry, i) => remapPaths(paths[i], entry.path, isRemote(paths[i]) ? '/' : sep));
      return moved;
    });
  });

  ipcMain.handle(Channels.duplicate, (_e, path: string) => {
    if (isRemote(path)) return wrap(async () => { throw notSupported('Duplicate'); });
    return wrap(() => service.duplicate(assertValidPath(path)));
  });

  // Delete: send to the OS Trash/Recycle Bin (recoverable from Finder/Explorer).
  // FilDOS keeps no trash of its own — there is no in-app restore or undo.
  ipcMain.handle(Channels.trash, (_e, paths: string[]) => {
    if (paths.some(isRemote)) {
      return remoteOp(paths[0], (p, ref) =>
        p.trash(ref.accountId, paths.map((x) => parseRemote(x)!.path)),
      );
    }
    return wrap(async () => {
      const valid = paths.map(assertValidPath);
      for (const p of valid) {
        await shell.trashItem(p);
        // Drop AI-index rows for the deleted file and any indexed descendants.
        const under = (await aiIndex.statesUnder(p)).map((s) => s.path);
        if (under.length) await aiIndex.remove(under);
      }
    });
  });

  ipcMain.handle(Channels.open, (_e, path: string) => {
    if (isRemote(path)) {
      return remoteOp(path, async (p, ref) => {
        const info = await p.getInfo(ref.accountId, ref.path);
        const tempDir = join(app.getPath('temp'), `fildos-${randomUUID()}`);
        await mkdir(tempDir, { recursive: true });
        const localPath = await p.download(ref.accountId, ref.path, join(tempDir, info.name));
        const errMsg = await shell.openPath(localPath);
        if (errMsg) throw Object.assign(new Error(errMsg), { code: 'EUNKNOWN' });
        await recents.recordOpen(path, info.name);
      });
    }
    return wrap(async () => {
      const target = assertValidPath(path);
      const errMsg = await shell.openPath(target);
      if (errMsg) throw Object.assign(new Error(errMsg), { code: 'EUNKNOWN' });
      await recents.recordOpen(target, basename(target));
    });
  });

  ipcMain.handle(Channels.reveal, (_e, path: string) => {
    if (isRemote(path)) return wrap(async () => { throw notSupported('Reveal in Finder'); });
    return wrap(async () => { shell.showItemInFolder(assertValidPath(path)); });
  });

  ipcMain.handle(Channels.openPrivacySettings, (_e, pane: 'files' | 'full-disk') =>
    wrap(async () => {
      // macOS only: deep-link into System Settings → Privacy & Security. On
      // other platforms there's no equivalent gate, so this is a no-op.
      if (process.platform !== 'darwin') return;
      const section = pane === 'full-disk' ? 'Privacy_AllFiles' : 'Privacy_FilesAndFolders';
      await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${section}`);
    }),
  );

  ipcMain.handle(Channels.quickAccess, () => wrap(() => quickAccess()));

  ipcMain.handle(Channels.getHome, () => wrap(async () => app.getPath('home')));

  ipcMain.handle(Channels.folderSize, (_e, path: string) => {
    if (isRemote(path)) return wrap(async (): Promise<number> => 0);
    return wrap(() => service.folderSize(assertValidPath(path)));
  });

  ipcMain.handle(Channels.search, (_e, rootPath: string, query: string) => {
    if (isRemote(rootPath)) return wrap(async () => { throw notSupported('Search'); });
    return wrap(() => service.search(assertValidPath(rootPath), query));
  });

  ipcMain.handle(Channels.thumbnail, (_e, path: string, size: number) => {
    if (isRemote(path)) return remoteOp(path, (p, ref) => p.thumbnail(ref.accountId, ref.path, size));
    return wrap(() => thumbnail(assertValidPath(path), size));
  });

  // Fire-and-forget: point the live watcher at the given directory.
  ipcMain.handle(Channels.watchSet, (e, path: string) => {
    if (isRemote(path)) { closeWatch(); return; }
    setWatch(assertValidPath(path), e.sender);
  });

  ipcMain.handle(Channels.prefsGet, () => getPrefs());
  ipcMain.handle(Channels.prefsSet, (_e, patch: Prefs) => {
    // Keep the native window appearance (traffic lights, scrollbars, etc.) in
    // sync with the app theme so they render correctly in mixed system/app modes.
    if (patch.theme) nativeTheme.themeSource = patch.theme;
    return setPrefs(patch);
  });

  // --- Tags (validatePath lets remote URIs pass through) ---
  ipcMain.handle(Channels.tagsList, () => wrap(async () => tags.listTags()));

  ipcMain.handle(Channels.tagsCreate, (_e, name: string, color?: string) =>
    wrap(async () => tags.createTag(name, color)),
  );

  ipcMain.handle(Channels.tagsRename, (_e, id: number, name: string) =>
    wrap(async () => tags.renameTag(id, name)),
  );

  ipcMain.handle(Channels.tagsRemove, (_e, id: number) =>
    wrap(async () => tags.deleteTag(id)),
  );

  ipcMain.handle(Channels.tagsAssign, (_e, paths: string[], tagId: number) =>
    wrap(async () => tags.assignTag(paths.map(validatePath), tagId)),
  );

  ipcMain.handle(Channels.tagsUnassign, (_e, paths: string[], tagId: number) =>
    wrap(async () => tags.unassignTag(paths.map(validatePath), tagId)),
  );

  ipcMain.handle(Channels.tagsForPaths, (_e, paths: string[]) =>
    wrap(async () => tags.tagsForPaths(paths.map(validatePath))),
  );

  // Entries carrying a tag: route remote paths through their provider; prune dead local paths.
  ipcMain.handle(Channels.tagsFiles, (_e, tagId: number) =>
    wrap(async () => {
      const paths = await tags.pathsForTag(tagId);
      const infos = await Promise.all(
        paths.map((p): Promise<Entry | null> => {
          if (isRemote(p)) {
            const ref = parseRemote(p);
            if (!ref) return Promise.resolve(null);
            const provider = getProvider(ref.provider);
            if (!provider) return Promise.resolve(null);
            return provider.getInfo(ref.accountId, ref.path).catch(() => null);
          }
          return service.getInfo(p).catch(() => null);
        }),
      );
      // Only prune local dead paths; disconnected remote accounts shouldn't lose tags.
      const dead = paths.filter((p, i) => !isRemote(p) && infos[i] === null);
      if (dead.length) await tags.pruneTaggedPaths(dead);
      return infos.filter((e): e is Entry => e !== null);
    }),
  );

  // --- Recents ---
  ipcMain.handle(Channels.recentsList, (_e, limit?: number) =>
    wrap(async () => {
      const items = await recents.listRecents(limit);
      // Only prune local paths; remote URIs can't be stat-checked cheaply.
      const exists = await Promise.all(
        items.map((item) => isRemote(item.path) ? Promise.resolve(true) : service.pathExists(item.path)),
      );
      const dead = items.filter((_, i) => !exists[i]).map((item) => item.path);
      if (dead.length) await recents.removeRecents(dead);
      return items.filter((_, i) => exists[i]);
    }),
  );

  ipcMain.handle(Channels.recentsRemove, (_e, path: string) =>
    wrap(async () => recents.removeRecents([validatePath(path)])),
  );

  ipcMain.handle(Channels.recentsClear, () => wrap(async () => recents.clearRecents()));

  // --- Per-folder view settings ---
  ipcMain.handle(Channels.viewsGet, (_e, path: string) =>
    wrap(async () => getFolderView(validatePath(path))),
  );

  ipcMain.handle(Channels.viewsSet, (_e, path: string, view: FolderView) =>
    wrap(async () => setFolderView(validatePath(path), view)),
  );

  // --- Drives ---
  ipcMain.handle(Channels.drives, () => wrap(async () => listDrives()));

  ipcMain.handle(Channels.ejectDrive, (_e, path: string) =>
    wrap(async () => ejectDrive(assertValidPath(path))),
  );

  // Begin an OS drag of the given files (drag-out to Finder/Explorer/other apps).
  ipcMain.handle(Channels.dragStart, async (e, paths: string[]) => {
    if (!Array.isArray(paths) || paths.length === 0) return;
    const files = paths.map(assertValidPath);

    // Prefer the real file icon; fall back to a 1x1 placeholder.
    let icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    );
    try {
      const fileIcon = await app.getFileIcon(files[0], { size: 'normal' });
      if (!fileIcon.isEmpty()) icon = fileIcon;
    } catch {
      /* keep placeholder */
    }
    if (icon.isEmpty()) return; // can't drag without an icon
    try {
      // `file` is required by the type; `files` carries the full multi-item drag.
      e.sender.startDrag({ file: files[0], files, icon });
    } catch {
      /* drag unsupported here */
    }
  });
}
