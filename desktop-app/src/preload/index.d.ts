import type { FsApi, Prefs, RecentsApi, TagsApi, ViewsApi } from '@shared/types';

export interface PlatformInfo {
  /** Platform path separator: "\\" on Windows, "/" elsewhere. */
  sep: string;
  /** process.platform value, e.g. "darwin", "win32", "linux". */
  os: NodeJS.Platform;
}

export interface Watcher {
  /** Point the live watcher at a directory. */
  watch(path: string): Promise<void>;
  /** Subscribe to change events; returns an unsubscribe function. */
  onChanged(cb: (dirPath: string) => void): () => void;
}

export interface Dnd {
  /** Start an OS drag-out of the given file paths. */
  startDrag(paths: string[]): void;
  /** Resolve the absolute path of a File from a drop event. */
  pathForFile(file: File): string;
}

export interface PrefsApi {
  get(): Promise<Prefs>;
  set(patch: Prefs): Promise<void>;
}

declare global {
  interface Window {
    fsapi: FsApi;
    platform: PlatformInfo;
    watcher: Watcher;
    dnd: Dnd;
    prefs: PrefsApi;
    tags: TagsApi;
    recents: RecentsApi;
    views: ViewsApi;
  }
}
