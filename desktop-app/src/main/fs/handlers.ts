import { app, ipcMain, nativeImage, shell } from 'electron';
import { basename, sep } from 'node:path';
import { Channels } from '@shared/channels';
import type { AppError, Entry, FolderView, Result } from '@shared/types';
import * as service from './service';
import { quickAccess } from './quickAccess';
import { setWatch } from './watch';
import { thumbnail } from './thumbnails';
import {
  emptyTracked,
  listTrashed,
  openOsTrash,
  restoreTrashed,
  trashItems,
} from './trashTracker';
import { getPrefs, setPrefs } from '../prefs';
import type { Prefs } from '@shared/types';
import { remapPaths } from '../db';
import * as tags from '../db/tags';
import * as recents from '../db/recents';
import { getFolderView, setFolderView } from '../db/views';

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
  };
  return { code, message: messages[code] ?? e?.message ?? 'Something went wrong.' };
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

/** Register every FS IPC handler. Call once after app is ready. */
export function registerFsHandlers(): void {
  ipcMain.handle(Channels.listDir, (_e, path: string) =>
    wrap(() => service.listDir(assertValidPath(path))),
  );

  ipcMain.handle(Channels.getInfo, (_e, path: string) =>
    wrap(() => service.getInfo(assertValidPath(path))),
  );

  ipcMain.handle(Channels.createFolder, (_e, parentPath: string, name: string) =>
    wrap(() => service.createFolder(assertValidPath(parentPath), name)),
  );

  ipcMain.handle(Channels.createFile, (_e, parentPath: string, name: string) =>
    wrap(() => service.createFile(assertValidPath(parentPath), name)),
  );

  ipcMain.handle(Channels.rename, (_e, path: string, newName: string) =>
    wrap(async () => {
      const from = assertValidPath(path);
      const entry = await service.rename(from, newName);
      remapPaths(from, entry.path, sep); // keep tags/recents/views attached
      return entry;
    }),
  );

  ipcMain.handle(Channels.copy, (_e, paths: string[], destDir: string) =>
    wrap(() => service.copy(paths.map(assertValidPath), assertValidPath(destDir))),
  );

  ipcMain.handle(Channels.move, (_e, paths: string[], destDir: string) =>
    wrap(async () => {
      const sources = paths.map(assertValidPath);
      const moved = await service.move(sources, assertValidPath(destDir));
      // service.move returns entries in source order; remap each old → new.
      moved.forEach((entry, i) => remapPaths(sources[i], entry.path, sep));
      return moved;
    }),
  );

  ipcMain.handle(Channels.duplicate, (_e, path: string) =>
    wrap(() => service.duplicate(assertValidPath(path))),
  );

  ipcMain.handle(Channels.trash, (_e, paths: string[]) =>
    wrap(() => trashItems(paths.map(assertValidPath))),
  );

  ipcMain.handle(Channels.listTrashed, () => wrap(() => listTrashed()));

  ipcMain.handle(Channels.restoreTrashed, (_e, ids: string[]) =>
    wrap(() => restoreTrashed(ids)),
  );

  ipcMain.handle(Channels.emptyTrash, () => wrap(() => emptyTracked()));

  ipcMain.handle(Channels.openOsTrash, () => wrap(() => openOsTrash()));

  ipcMain.handle(Channels.open, (_e, path: string) =>
    wrap(async () => {
      const target = assertValidPath(path);
      const errMsg = await shell.openPath(target);
      if (errMsg) {
        const err = new Error(errMsg) as NodeJS.ErrnoException;
        err.code = 'EUNKNOWN';
        throw err;
      }
      await recents.recordOpen(target, basename(target));
    }),
  );

  ipcMain.handle(Channels.reveal, (_e, path: string) =>
    wrap(async () => {
      shell.showItemInFolder(assertValidPath(path));
    }),
  );

  ipcMain.handle(Channels.quickAccess, () => wrap(() => quickAccess()));

  ipcMain.handle(Channels.getHome, () => wrap(async () => app.getPath('home')));

  ipcMain.handle(Channels.folderSize, (_e, path: string) =>
    wrap(() => service.folderSize(assertValidPath(path))),
  );

  ipcMain.handle(Channels.search, (_e, rootPath: string, query: string) =>
    wrap(() => service.search(assertValidPath(rootPath), query)),
  );

  ipcMain.handle(Channels.thumbnail, (_e, path: string, size: number) =>
    wrap(() => thumbnail(assertValidPath(path), size)),
  );

  // Fire-and-forget: point the live watcher at the given directory.
  ipcMain.handle(Channels.watchSet, (e, path: string) => {
    setWatch(assertValidPath(path), e.sender);
  });

  ipcMain.handle(Channels.prefsGet, () => getPrefs());
  ipcMain.handle(Channels.prefsSet, (_e, patch: Prefs) => setPrefs(patch));

  // --- Tags ---
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
    wrap(async () => tags.assignTag(paths.map(assertValidPath), tagId)),
  );

  ipcMain.handle(Channels.tagsUnassign, (_e, paths: string[], tagId: number) =>
    wrap(async () => tags.unassignTag(paths.map(assertValidPath), tagId)),
  );

  ipcMain.handle(Channels.tagsForPaths, (_e, paths: string[]) =>
    wrap(async () => tags.tagsForPaths(paths.map(assertValidPath))),
  );

  // Entries carrying a tag: stat each stored path, prune the ones that are gone.
  ipcMain.handle(Channels.tagsFiles, (_e, tagId: number) =>
    wrap(async () => {
      const paths = await tags.pathsForTag(tagId);
      // Stat in parallel but keep pathsForTag's most-recently-tagged order.
      const infos = await Promise.all(
        paths.map((p): Promise<Entry | null> => service.getInfo(p).catch(() => null)),
      );
      const dead = paths.filter((_, i) => infos[i] === null);
      if (dead.length) await tags.pruneTaggedPaths(dead);
      return infos.filter((e): e is Entry => e !== null);
    }),
  );

  // --- Recents ---
  ipcMain.handle(Channels.recentsList, (_e, limit?: number) =>
    wrap(async () => {
      const items = await recents.listRecents(limit);
      const exists = await Promise.all(items.map((item) => service.pathExists(item.path)));
      const dead = items.filter((_, i) => !exists[i]).map((item) => item.path);
      if (dead.length) await recents.removeRecents(dead);
      return items.filter((_, i) => exists[i]);
    }),
  );

  ipcMain.handle(Channels.recentsRemove, (_e, path: string) =>
    wrap(async () => recents.removeRecents([assertValidPath(path)])),
  );

  ipcMain.handle(Channels.recentsClear, () => wrap(async () => recents.clearRecents()));

  // --- Per-folder view settings ---
  ipcMain.handle(Channels.viewsGet, (_e, path: string) =>
    wrap(async () => getFolderView(assertValidPath(path))),
  );

  ipcMain.handle(Channels.viewsSet, (_e, path: string, view: FolderView) =>
    wrap(async () => setFolderView(assertValidPath(path), view)),
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
