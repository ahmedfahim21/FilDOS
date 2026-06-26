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

/** Column the file views sort by. */
export type SortKey = 'name' | 'size' | 'type' | 'modified';
export type SortDir = 'asc' | 'desc';
export type ViewMode = 'list' | 'grid';
/** Tile size used by the grid view. */
export type IconSize = 'small' | 'medium' | 'large';

/** A user-defined tag that can be attached to any number of files. */
export interface Tag {
  id: number;
  name: string;
  /** CSS color for the tag dot, e.g. "#e5534b". */
  color: string;
  /** Number of files currently carrying this tag. */
  count: number;
}

/** A recently opened file, surfaced in the Recents view. */
export interface RecentItem {
  path: string;
  name: string;
  /** Last time the file was opened, epoch milliseconds. */
  openedAt: number;
  /** How many times it has been opened through FilDOS. */
  openCount: number;
}

/**
 * View settings remembered for one specific folder. Unset fields fall back to
 * the global defaults in `Prefs`.
 */
export interface FolderView {
  sortKey?: SortKey;
  sortDir?: SortDir;
  viewMode?: ViewMode;
  iconSize?: IconSize;
}

/** A mounted volume (internal, USB, or network drive). */
export interface DriveItem {
  name: string;
  /** Absolute mount path, e.g. "/Volumes/MyDrive" or "D:\". */
  path: string;
  /** Total capacity in bytes (0 if statfs failed). */
  total: number;
  /** Available free bytes (0 if statfs failed). */
  free: number;
  /** True for removable/external drives; false for the boot volume. */
  removable: boolean;
}

/** Persisted user preferences (window + global view defaults). */
export interface Prefs {
  windowBounds?: { x: number; y: number; width: number; height: number };
  lastPath?: string;
  showHidden?: boolean;
  sort?: { key: SortKey; dir: SortDir };
  viewMode?: ViewMode;
  iconSize?: IconSize;
  columnWidths?: { size: number; type: number; modified: number };
  /** AI feature settings (enable toggle + active provider + model). */
  ai?: { enabled: boolean; activeProvider: string; modelId: string };
  /** Background indexing settings (kept separate from `ai` so neither clobbers the other). */
  index?: { enabled?: boolean; roots?: string[]; excludes?: string[] };
}

/** Lifecycle of a provider's embedding model. */
export type AiModelState = 'absent' | 'downloading' | 'ready' | 'error';

/** Snapshot of a provider's embedding model, surfaced in Settings. */
export interface AiModelStatus {
  state: AiModelState;
  /** Model identifier (e.g. 'Xenova/all-MiniLM-L6-v2'). */
  modelId: string;
  /** Embedding dimensionality (e.g. 384); 0 when unknown. */
  dim: number;
  /** Download progress in [0, 1] while `state === 'downloading'`. */
  progress?: number;
  /** Error detail when `state === 'error'`. */
  message?: string;
}

/** Outcome of indexing a single file. */
export type IndexStatus = 'indexed' | 'skipped' | 'error';

/** Bookkeeping row for an indexed file (mirrors the index_state table). */
export interface IndexState {
  /** Absolute file path (primary key). */
  path: string;
  /** Last-modified time in ms, paired with size for cheap staleness checks. */
  mtime: number;
  /** Size in bytes. */
  size: number;
  /** Content hash that confirms a real change; null when not computed. */
  contentHash: string | null;
  /** Embedding model that produced this file's chunks. */
  modelId: string;
  /** When the file was last indexed, in ms. */
  indexedAt: number;
  status: IndexStatus;
}

/** A stored text chunk with its (optional) embedding. */
export interface FileChunk {
  path: string;
  /** 0-based position of the chunk within the file. */
  chunkIx: number;
  text: string;
  /** Embedding vector; null until the embedder has run. */
  embedding: Float32Array | null;
  modelId: string;
}

/** A chunk paired with its embedding, ready to persist in the vector store. */
export interface ChunkVector {
  chunkIx: number;
  text: string;
  embedding: Float32Array;
  modelId: string;
}

/** A vector-search hit: the matching chunk plus its cosine similarity. */
export interface SearchMatch {
  path: string;
  chunkIx: number;
  text: string;
  /** Cosine similarity in [-1, 1]; higher is closer. */
  score: number;
}

/** What the background indexer is doing right now. */
export type IndexRunState = 'idle' | 'scanning' | 'indexing' | 'paused' | 'error';

/** A snapshot of indexing progress, pushed to the renderer as it advances. */
export interface IndexProgress {
  state: IndexRunState;
  /** Files visited during the current crawl. */
  scanned: number;
  /** Jobs to process this run (the progress denominator). */
  total: number;
  /** Jobs completed this run (the progress numerator). */
  indexed: number;
  /** Files that failed and were skipped. */
  errors: number;
  /** Path currently being processed, or null when idle. */
  currentFile: string | null;
  /** Error detail when `state === 'error'`. */
  message?: string;
}

/** Indexing configuration persisted in `prefs.index`. */
export interface IndexConfig {
  enabled: boolean;
  /** Roots to crawl (defaults to the user's home directory). */
  roots: string[];
  /** Files/folders the user has excluded from indexing. */
  excludes: string[];
}

/** The API surface exposed on `window.index` (background indexing control). */
export interface IndexApi {
  /** Enable indexing and start a crawl; progress arrives via `onProgress`. */
  start(): Promise<Result<void>>;
  /** Stop processing; the queue is preserved for a later start(). */
  pause(): Promise<Result<void>>;
  /** Forget the entire index and queue. */
  clear(): Promise<Result<void>>;
  /** Current progress snapshot. */
  status(): Promise<Result<IndexProgress>>;
  /** Exclude a file/folder from indexing (and drop anything already indexed under it). */
  addExclude(path: string): Promise<Result<void>>;
  /** Remove an exclusion. */
  removeExclude(path: string): Promise<Result<void>>;
  /** The current exclusion list. */
  listExcludes(): Promise<Result<string[]>>;
  /** Subscribe to indexing progress; returns an unsubscribe fn. */
  onProgress(cb: (progress: IndexProgress) => void): () => void;
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
  /** List mounted volumes (internal + removable + network). */
  drives(): Promise<Result<DriveItem[]>>;
  /** Eject a removable drive by its mount path. */
  ejectDrive(path: string): Promise<Result<void>>;
}

/** The API surface exposed on `window.tags`. */
export interface TagsApi {
  /** All tags with usage counts, sorted by name. */
  list(): Promise<Result<Tag[]>>;
  /** Create a tag; the color is auto-assigned when omitted. */
  create(name: string, color?: string): Promise<Result<Tag>>;
  rename(id: number, name: string): Promise<Result<Tag>>;
  /** Delete a tag everywhere (assignments cascade). */
  remove(id: number): Promise<Result<void>>;
  /** Attach a tag to the given files (no-op where already attached). */
  assign(paths: string[], tagId: number): Promise<Result<void>>;
  /** Detach a tag from the given files. */
  unassign(paths: string[], tagId: number): Promise<Result<void>>;
  /** Map of path → tag ids for the given paths (paths without tags omitted). */
  forPaths(paths: string[]): Promise<Result<Record<string, number[]>>>;
  /** Entries currently carrying the tag; vanished files are pruned. */
  files(tagId: number): Promise<Result<Entry[]>>;
}

/** The API surface exposed on `window.recents`. */
export interface RecentsApi {
  /** Most recently opened files, newest first; vanished files are pruned. */
  list(limit?: number): Promise<Result<RecentItem[]>>;
  remove(path: string): Promise<Result<void>>;
  clear(): Promise<Result<void>>;
}

/** The API surface exposed on `window.views` (per-folder view settings). */
export interface ViewsApi {
  get(path: string): Promise<Result<FolderView | null>>;
  set(path: string, view: FolderView): Promise<Result<void>>;
}

/** A connected cloud account stored in the accounts table. */
export interface AccountRecord {
  id: string;
  provider: string;
  /** Display name, e.g. the user's email address. */
  label: string;
  createdAt: number;
}

/** The API surface exposed on `window.cloud` by the preload bridge. */
export interface CloudApi {
  /** Start an OAuth flow for the given provider; returns the saved account. */
  connect(providerId: string): Promise<Result<AccountRecord>>;
  /** All stored cloud accounts. */
  listAccounts(): Promise<Result<AccountRecord[]>>;
  /** Remove an account and its stored credentials. */
  disconnect(accountId: string): Promise<Result<void>>;
}

/** The API surface exposed on `window.ai` by the preload bridge. */
export interface AiApi {
  /** State of a model (defaults to the active one when modelId is omitted). */
  status(modelId?: string): Promise<Result<AiModelStatus>>;
  /** Ensure the active model is downloaded (progress via onModelProgress). */
  download(): Promise<Result<void>>;
  /** Embed each string; rows are plain number[] (Float32Array doesn't survive IPC). */
  embed(texts: string[]): Promise<Result<number[][]>>;
  /** Embed each image file by path; image-capable models (CLIP) only. */
  embedImages(paths: string[]): Promise<Result<number[][]>>;
  /** Subscribe to model download/state progress; returns an unsubscribe fn. */
  onModelProgress(cb: (status: AiModelStatus) => void): () => void;
}
