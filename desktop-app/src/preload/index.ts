import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { Channels, Events } from '@shared/channels';
import type { FsApi, Prefs } from '@shared/types';

/**
 * The single, explicit API exposed to the renderer. We never hand the renderer
 * raw `ipcRenderer`; each method maps to one known channel.
 */
const fsapi: FsApi = {
  listDir: (path) => ipcRenderer.invoke(Channels.listDir, path),
  getInfo: (path) => ipcRenderer.invoke(Channels.getInfo, path),
  createFolder: (parentPath, name) =>
    ipcRenderer.invoke(Channels.createFolder, parentPath, name),
  createFile: (parentPath, name) =>
    ipcRenderer.invoke(Channels.createFile, parentPath, name),
  rename: (path, newName) => ipcRenderer.invoke(Channels.rename, path, newName),
  copy: (paths, destDir) => ipcRenderer.invoke(Channels.copy, paths, destDir),
  move: (paths, destDir) => ipcRenderer.invoke(Channels.move, paths, destDir),
  duplicate: (path) => ipcRenderer.invoke(Channels.duplicate, path),
  trash: (paths) => ipcRenderer.invoke(Channels.trash, paths),
  listTrashed: () => ipcRenderer.invoke(Channels.listTrashed),
  restoreTrashed: (ids) => ipcRenderer.invoke(Channels.restoreTrashed, ids),
  emptyTrash: () => ipcRenderer.invoke(Channels.emptyTrash),
  openOsTrash: () => ipcRenderer.invoke(Channels.openOsTrash),
  open: (path) => ipcRenderer.invoke(Channels.open, path),
  reveal: (path) => ipcRenderer.invoke(Channels.reveal, path),
  quickAccess: () => ipcRenderer.invoke(Channels.quickAccess),
  getHome: () => ipcRenderer.invoke(Channels.getHome),
  folderSize: (path) => ipcRenderer.invoke(Channels.folderSize, path),
  search: (rootPath, query) => ipcRenderer.invoke(Channels.search, rootPath, query),
  thumbnail: (path, size) => ipcRenderer.invoke(Channels.thumbnail, path, size),
};

contextBridge.exposeInMainWorld('fsapi', fsapi);

// Live directory watching: point the watcher at a path, subscribe to changes.
contextBridge.exposeInMainWorld('watcher', {
  watch: (path: string) => ipcRenderer.invoke(Channels.watchSet, path),
  onChanged: (cb: (dirPath: string) => void) => {
    const listener = (_e: IpcRendererEvent, dirPath: string) => cb(dirPath);
    ipcRenderer.on(Events.dirChanged, listener);
    return () => ipcRenderer.removeListener(Events.dirChanged, listener);
  },
});

// Persisted preferences.
contextBridge.exposeInMainWorld('prefs', {
  get: (): Promise<Prefs> => ipcRenderer.invoke(Channels.prefsGet),
  set: (patch: Prefs): Promise<void> => ipcRenderer.invoke(Channels.prefsSet, patch),
});

// Drag-and-drop helpers: start an OS drag-out, and resolve a dropped File's path.
contextBridge.exposeInMainWorld('dnd', {
  startDrag: (paths: string[]) => ipcRenderer.invoke(Channels.dragStart, paths),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
});

// Expose the platform path separator so the renderer can split breadcrumbs
// without bundling Node's `path`.
contextBridge.exposeInMainWorld('platform', {
  sep: process.platform === 'win32' ? '\\' : '/',
  os: process.platform,
});
