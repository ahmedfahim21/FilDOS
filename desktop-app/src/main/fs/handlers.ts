import { app, ipcMain, nativeImage, shell } from 'electron';
import { Channels } from '@shared/channels';
import type { AppError, Result } from '@shared/types';
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
    wrap(() => service.rename(assertValidPath(path), newName)),
  );

  ipcMain.handle(Channels.copy, (_e, paths: string[], destDir: string) =>
    wrap(() => service.copy(paths.map(assertValidPath), assertValidPath(destDir))),
  );

  ipcMain.handle(Channels.move, (_e, paths: string[], destDir: string) =>
    wrap(() => service.move(paths.map(assertValidPath), assertValidPath(destDir))),
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
      const errMsg = await shell.openPath(assertValidPath(path));
      if (errMsg) {
        const err = new Error(errMsg) as NodeJS.ErrnoException;
        err.code = 'EUNKNOWN';
        throw err;
      }
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
