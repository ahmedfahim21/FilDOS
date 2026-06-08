/**
 * IPC channel names shared between the main process (handlers) and the
 * preload bridge. Centralized here so a typo can't silently break a call.
 */
export const Channels = {
  listDir: 'fs:listDir',
  getInfo: 'fs:getInfo',
  createFolder: 'fs:createFolder',
  createFile: 'fs:createFile',
  rename: 'fs:rename',
  copy: 'fs:copy',
  move: 'fs:move',
  duplicate: 'fs:duplicate',
  trash: 'fs:trash',
  listTrashed: 'fs:listTrashed',
  restoreTrashed: 'fs:restoreTrashed',
  emptyTrash: 'fs:emptyTrash',
  openOsTrash: 'fs:openOsTrash',
  open: 'fs:open',
  reveal: 'fs:reveal',
  quickAccess: 'fs:quickAccess',
  getHome: 'fs:getHome',
  folderSize: 'fs:folderSize',
  search: 'fs:search',
  thumbnail: 'fs:thumbnail',
  watchSet: 'watch:set',
  dragStart: 'drag:start',
  prefsGet: 'prefs:get',
  prefsSet: 'prefs:set',
} as const;

export type ChannelName = (typeof Channels)[keyof typeof Channels];

/** Main -> renderer push events (ipcRenderer.on, not invoke). */
export const Events = {
  /** A watched directory changed on disk; payload is the directory path. */
  dirChanged: 'fs:changed',
} as const;
