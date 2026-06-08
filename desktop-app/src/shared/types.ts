/**
 * Types shared across the main process, preload bridge and renderer.
 * Keep this file dependency-free so it can be imported from any layer.
 */

/** A single directory entry as shown in the file list. */
export interface Entry {
  /** Base name including extension, e.g. "report.pdf". */
  name: string;
  /** Absolute path to the entry. */
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  /** Dotfile / OS-hidden. */
  isHidden: boolean;
  /** Size in bytes (0 for directories — not recursively computed). */
  size: number;
  /** Lowercase extension without the dot, e.g. "pdf". Empty for folders / extensionless files. */
  ext: string;
  /** Last modified time, epoch milliseconds. */
  modified: number;
  /** Creation/birth time, epoch milliseconds. */
  created: number;
}

/** Detailed information shown in the Info panel. */
export interface FileInfo extends Entry {
  /** Last access time, epoch milliseconds. */
  accessed: number;
  /** Numeric permission bits (mode & 0o777). */
  mode: number;
  /** Human-readable permission string, e.g. "rwxr-xr-x". */
  permissions: string;
  /** Resolved target if this entry is a symlink, else null. */
  realPath: string | null;
}

/** A pinned location in the sidebar. */
export interface QuickAccessItem {
  label: string;
  path: string;
  /** Stable key for an icon lookup in the renderer. */
  kind:
    | 'home'
    | 'desktop'
    | 'documents'
    | 'downloads'
    | 'pictures'
    | 'music'
    | 'videos';
}

/** Structured error surfaced to the renderer instead of throwing. */
export interface AppError {
  /** Errno-style code when available (e.g. "EACCES", "ENOENT", "EEXIST"), else "EUNKNOWN". */
  code: string;
  /** Friendly, display-ready message. */
  message: string;
}

/**
 * Discriminated result returned by every FS operation. The renderer checks
 * `ok` rather than catching exceptions for expected failures.
 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

/** A single hit from a recursive search, with its location relative to the root. */
export interface SearchHit extends Entry {
  /** Path relative to the searched root, for display, e.g. "sub/dir/file.txt". */
  relativePath: string;
}

/** A record of something moved to the Trash, used for best-effort restore. */
export interface TrashedItem {
  id: string;
  name: string;
  /** Where it lived before deletion. */
  originalPath: string;
  /** Where it landed in the OS Trash (best-effort resolved). */
  trashedPath: string;
  deletedAt: number;
}

/** Persisted user preferences (window + view state). */
export interface Prefs {
  windowBounds?: { x: number; y: number; width: number; height: number };
  lastPath?: string;
  showHidden?: boolean;
  sort?: { key: string; dir: 'asc' | 'desc' };
  viewMode?: 'list' | 'grid';
  columnWidths?: { size: number; type: number; modified: number };
}

/** The API surface exposed on `window.fsapi` by the preload bridge. */
export interface FsApi {
  listDir(path: string): Promise<Result<Entry[]>>;
  getInfo(path: string): Promise<Result<FileInfo>>;
  createFolder(parentPath: string, name: string): Promise<Result<Entry>>;
  createFile(parentPath: string, name: string): Promise<Result<Entry>>;
  rename(path: string, newName: string): Promise<Result<Entry>>;
  /** Copy entries into destDir; collisions auto-renamed (" copy", " copy 2", …). */
  copy(paths: string[], destDir: string): Promise<Result<Entry[]>>;
  /** Move entries into destDir; collisions auto-renamed. */
  move(paths: string[], destDir: string): Promise<Result<Entry[]>>;
  /** Copy an entry beside itself with a " copy" suffix. */
  duplicate(path: string): Promise<Result<Entry>>;
  /** Move to OS Trash; returns records enabling best-effort restore/undo. */
  trash(paths: string[]): Promise<Result<TrashedItem[]>>;
  /** List items FilDOS has trashed (and still tracks). */
  listTrashed(): Promise<Result<TrashedItem[]>>;
  /** Best-effort restore of tracked trashed items to their original location. */
  restoreTrashed(ids: string[]): Promise<Result<void>>;
  /** Permanently delete all tracked trashed items. */
  emptyTrash(): Promise<Result<void>>;
  /** Open the OS Trash in the system file manager. */
  openOsTrash(): Promise<Result<void>>;
  open(path: string): Promise<Result<void>>;
  reveal(path: string): Promise<Result<void>>;
  quickAccess(): Promise<Result<QuickAccessItem[]>>;
  getHome(): Promise<Result<string>>;
  /** Recursive byte size of a folder (depth-guarded). */
  folderSize(path: string): Promise<Result<number>>;
  /** Recursive name search under rootPath, capped result set. */
  search(rootPath: string, query: string): Promise<Result<SearchHit[]>>;
  /** Thumbnail data URL for an image file, or null if unavailable. */
  thumbnail(path: string, size: number): Promise<Result<string | null>>;
}
