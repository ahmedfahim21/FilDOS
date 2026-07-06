import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { Channels, Events } from '@shared/channels';
import type {
  AiApi,
  AiModelStatus,
  ChatsApi,
  ChatStreamEvent,
  CloudApi,
  FsApi,
  IndexApi,
  IndexProgress,
  LlmApi,
  LlmModelStatus,
  Prefs,
  RecentsApi,
  TagsApi,
  ViewsApi,
} from '@shared/types';

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
  open: (path) => ipcRenderer.invoke(Channels.open, path),
  reveal: (path) => ipcRenderer.invoke(Channels.reveal, path),
  quickAccess: () => ipcRenderer.invoke(Channels.quickAccess),
  getHome: () => ipcRenderer.invoke(Channels.getHome),
  folderSize: (path) => ipcRenderer.invoke(Channels.folderSize, path),
  search: (rootPath, query) => ipcRenderer.invoke(Channels.search, rootPath, query),
  thumbnail: (path, size) => ipcRenderer.invoke(Channels.thumbnail, path, size),
  drives: () => ipcRenderer.invoke(Channels.drives),
  ejectDrive: (path) => ipcRenderer.invoke(Channels.ejectDrive, path),
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

// File tagging.
const tagsApi: TagsApi = {
  list: () => ipcRenderer.invoke(Channels.tagsList),
  create: (name, color) => ipcRenderer.invoke(Channels.tagsCreate, name, color),
  rename: (id, name) => ipcRenderer.invoke(Channels.tagsRename, id, name),
  remove: (id) => ipcRenderer.invoke(Channels.tagsRemove, id),
  assign: (paths, tagId) => ipcRenderer.invoke(Channels.tagsAssign, paths, tagId),
  unassign: (paths, tagId) => ipcRenderer.invoke(Channels.tagsUnassign, paths, tagId),
  forPaths: (paths) => ipcRenderer.invoke(Channels.tagsForPaths, paths),
  files: (tagId) => ipcRenderer.invoke(Channels.tagsFiles, tagId),
};
contextBridge.exposeInMainWorld('tags', tagsApi);

// Recently opened files.
const recentsApi: RecentsApi = {
  list: (limit) => ipcRenderer.invoke(Channels.recentsList, limit),
  remove: (path) => ipcRenderer.invoke(Channels.recentsRemove, path),
  clear: () => ipcRenderer.invoke(Channels.recentsClear),
};
contextBridge.exposeInMainWorld('recents', recentsApi);

// Per-folder view settings.
const viewsApi: ViewsApi = {
  get: (path) => ipcRenderer.invoke(Channels.viewsGet, path),
  set: (path, view) => ipcRenderer.invoke(Channels.viewsSet, path, view),
};
contextBridge.exposeInMainWorld('views', viewsApi);

// Drag-and-drop helpers: start an OS drag-out, and resolve a dropped File's path.
contextBridge.exposeInMainWorld('dnd', {
  startDrag: (paths: string[]) => ipcRenderer.invoke(Channels.dragStart, paths),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
});

// Cloud account management.
const cloudApi: CloudApi = {
  connect: (providerId) => ipcRenderer.invoke(Channels.cloudConnect, providerId),
  connectConfig: (providerId, options) =>
    ipcRenderer.invoke(Channels.cloudConnectConfig, providerId, options),
  listAccounts: () => ipcRenderer.invoke(Channels.cloudListAccounts),
  disconnect: (accountId) => ipcRenderer.invoke(Channels.cloudDisconnect, accountId),
};
contextBridge.exposeInMainWorld('cloud', cloudApi);

// On-device AI: model status/download/embed, plus a download-progress stream.
const aiApi: AiApi = {
  status: (modelId) => ipcRenderer.invoke(Channels.aiStatus, modelId),
  download: (modelId) => ipcRenderer.invoke(Channels.aiDownload, modelId),
  embed: (texts) => ipcRenderer.invoke(Channels.aiEmbed, texts),
  embedImages: (paths) => ipcRenderer.invoke(Channels.aiEmbedImages, paths),
  onModelProgress: (cb: (status: AiModelStatus) => void) => {
    const listener = (_e: IpcRendererEvent, status: AiModelStatus) => cb(status);
    ipcRenderer.on(Events.aiModelProgress, listener);
    return () => ipcRenderer.removeListener(Events.aiModelProgress, listener);
  },
};
contextBridge.exposeInMainWorld('ai', aiApi);

// Background indexing: start/pause/clear, exclusions, and a live progress stream.
const indexApi: IndexApi = {
  start: () => ipcRenderer.invoke(Channels.indexStart),
  pause: () => ipcRenderer.invoke(Channels.indexPause),
  clear: () => ipcRenderer.invoke(Channels.indexClear),
  status: () => ipcRenderer.invoke(Channels.indexStatus),
  addExclude: (path) => ipcRenderer.invoke(Channels.indexAddExclude, path),
  removeExclude: (path) => ipcRenderer.invoke(Channels.indexRemoveExclude, path),
  listExcludes: () => ipcRenderer.invoke(Channels.indexListExcludes),
  setInterval: (minutes) => ipcRenderer.invoke(Channels.indexSetInterval, minutes),
  search: (query, opts) => ipcRenderer.invoke(Channels.indexSearch, query, opts),
  searchFile: (path, opts) => ipcRenderer.invoke(Channels.indexSearchFile, path, opts),
  onProgress: (cb: (progress: IndexProgress) => void) => {
    const listener = (_e: IpcRendererEvent, progress: IndexProgress) => cb(progress);
    ipcRenderer.on(Events.indexProgress, listener);
    return () => ipcRenderer.removeListener(Events.indexProgress, listener);
  },
};
contextBridge.exposeInMainWorld('index', indexApi);

// The Assistant chat: model catalog status/download plus streaming generation.
const llmApi: LlmApi = {
  models: () => ipcRenderer.invoke(Channels.llmModels),
  download: (modelId) => ipcRenderer.invoke(Channels.llmDownload, modelId),
  remove: (modelId) => ipcRenderer.invoke(Channels.llmRemove, modelId),
  specs: () => ipcRenderer.invoke(Channels.llmSpecs),
  send: (payload) => ipcRenderer.invoke(Channels.chatSend, payload),
  stop: (requestId) => ipcRenderer.invoke(Channels.chatStop, requestId),
  onEvent: (cb: (event: ChatStreamEvent) => void) => {
    const listener = (_e: IpcRendererEvent, event: ChatStreamEvent) => cb(event);
    ipcRenderer.on(Events.chatStream, listener);
    return () => ipcRenderer.removeListener(Events.chatStream, listener);
  },
  onModelProgress: (cb: (status: LlmModelStatus) => void) => {
    const listener = (_e: IpcRendererEvent, status: LlmModelStatus) => cb(status);
    ipcRenderer.on(Events.llmModelProgress, listener);
    return () => ipcRenderer.removeListener(Events.llmModelProgress, listener);
  },
};
contextBridge.exposeInMainWorld('llm', llmApi);

// Saved Assistant conversations (list, reopen, rename, delete).
const chatsApi: ChatsApi = {
  list: () => ipcRenderer.invoke(Channels.chatsList),
  messages: (sessionId) => ipcRenderer.invoke(Channels.chatsMessages, sessionId),
  rename: (sessionId, title) => ipcRenderer.invoke(Channels.chatsRename, sessionId, title),
  remove: (sessionId) => ipcRenderer.invoke(Channels.chatsRemove, sessionId),
};
contextBridge.exposeInMainWorld('chats', chatsApi);

// Expose the platform path separator so the renderer can split breadcrumbs
// without bundling Node's `path`.
contextBridge.exposeInMainWorld('platform', {
  sep: process.platform === 'win32' ? '\\' : '/',
  os: process.platform,
});
