/**
 * Types shared across the main process, preload bridge and renderer.
 * Keep this file dependency-free so it can be imported from any layer
 * (the llmModels import below is type-only — erased at compile time).
 */
import type { LlmModelConfig, LlmModelDef, LlmSystemSpecs } from './llmModels';

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

/** A semantic-search hit: a file ranked by meaning, with the matching snippet. */
export interface SemanticHit extends SearchHit {
  /** Cosine similarity of the best-matching chunk, in [0, 1]. */
  score: number;
  /** A slice of the matching chunk's text, for preview. */
  snippet: string;
}

/** Column the file views sort by. */
export type SortKey = 'name' | 'size' | 'type' | 'modified';
export type SortDir = 'asc' | 'desc';
export type ViewMode = 'list' | 'grid' | 'gallery' | 'column';
/** Tile size used by the grid and gallery views. */
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

/** UI color theme; 'system' follows the OS. */
export type Theme = 'light' | 'dark' | 'system';

/** Persisted user preferences (window + global view defaults). */
export interface Prefs {
  /** Color theme (defaults to 'system'). */
  theme?: Theme;
  windowBounds?: { x: number; y: number; width: number; height: number };
  lastPath?: string;
  showHidden?: boolean;
  sort?: { key: SortKey; dir: SortDir };
  viewMode?: ViewMode;
  iconSize?: IconSize;
  columnWidths?: { size: number; type: number; modified: number };
  /** AI feature settings (enable toggle + provider; the model is chosen automatically). */
  ai?: {
    enabled: boolean;
    activeProvider: string;
    modelId?: string;
    /** The chat model the Assistant uses. */
    llmModelId?: string;
    /** Per-chat-model generation settings (partial; see `@shared/llmModels`). */
    llmConfigs?: Record<string, Partial<LlmModelConfig>>;
    /** User-added chat models (from `parseCustomModelInput`). */
    llmCustomModels?: LlmModelDef[];
  };
  /** Background indexing settings (kept separate from `ai` so neither clobbers the other). */
  index?: {
    enabled?: boolean;
    roots?: string[];
    excludes?: string[];
    /** File extensions (lowercase, no dot) the indexer never touches. */
    excludeExtensions?: string[];
    /** Minutes between background rescans of the roots. */
    intervalMinutes?: number;
    /** Keep indexing (app resident in the tray) after the last window closes. */
    ambient?: boolean;
  };
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
  /** Content hash (first+last 64 KB, SHA-256 prefix); null for images or hash failures. */
  contentHash: string | null;
  /** Embedding model that produced this file's chunks. */
  modelId: string;
  /**
   * Incremented in INDEX_VERSION (indexer.ts) whenever chunking or extraction
   * logic changes, so old chunks are re-embedded even when the file is unchanged.
   */
  indexVersion: number;
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
  /** Files/folders the user has hidden from AI ("Hide from AI"). */
  excludes: string[];
  /** File extensions (lowercase, no dot) the indexer never touches. */
  excludeExtensions: string[];
  /** Minutes between background rescans of the roots. */
  intervalMinutes: number;
  /** Keep indexing (app resident in the tray) after the last window closes. */
  ambient: boolean;
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
  /** Hide a file/folder from AI (and drop anything already indexed under it). */
  addExclude(path: string): Promise<Result<void>>;
  /** Stop hiding a path from AI. */
  removeExclude(path: string): Promise<Result<void>>;
  /** The current "Hide from AI" list. */
  listExcludes(): Promise<Result<string[]>>;
  /** Native picker to hide paths from AI; resolves to the updated list. */
  pickExcludes(): Promise<Result<string[]>>;
  /** Replace the list of file extensions the indexer skips (normalized server-side). */
  setExcludeExtensions(exts: string[]): Promise<Result<string[]>>;
  /** Set how often (minutes) the background rescan runs. */
  setInterval(minutes: number): Promise<Result<void>>;
  /** Keep indexing in the background after the last window closes. */
  setAmbient(enabled: boolean): Promise<Result<void>>;
  /** Semantic search: ranked file hits with snippets, optionally scoped to a folder. */
  search(query: string, opts?: { rootPath?: string; k?: number }): Promise<Result<SemanticHit[]>>;
  /** "Find similar": rank indexed files by similarity to the given file. */
  searchFile(path: string, opts?: { rootPath?: string; k?: number }): Promise<Result<SemanticHit[]>>;
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
  /** Delete entries by moving them to the OS Trash/Recycle Bin (no in-app restore). */
  trash(paths: string[]): Promise<Result<void>>;
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
  /** Connect a config-based backend (S3/IPFS/…) from a credentials/options object. */
  connectConfig(providerId: string, options: Record<string, string>): Promise<Result<AccountRecord>>;
  /** All stored cloud accounts. */
  listAccounts(): Promise<Result<AccountRecord[]>>;
  /** Remove an account and its stored credentials. */
  disconnect(accountId: string): Promise<Result<void>>;
}

/** Lifecycle snapshot of one chat (LLM) model, surfaced in the Assistant's picker. */
export interface LlmModelStatus {
  /** Catalog id from `@shared/llmModels`. */
  modelId: string;
  state: AiModelState;
  /** Download progress in [0, 1] while `state === 'downloading'`. */
  progress?: number;
  /** Error detail when `state === 'error'`. */
  message?: string;
}

/** A file or folder the user attached to a chat message with @ / #. */
export interface ChatMention {
  kind: 'file' | 'folder';
  /** Absolute path. */
  path: string;
  /** Base name, as shown in the mention chip. */
  name: string;
}

/** One prior exchange replayed to the model for conversational continuity. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Everything needed to answer one chat message. */
export interface ChatSendPayload {
  /** Renderer-generated id correlating the stream events with this request. */
  requestId: string;
  /** Session to append this exchange to; omitted on a fresh conversation
   * (the handler mints one and returns it). */
  sessionId?: string;
  /** Chat model to use (falls back to prefs, then the catalog default). */
  modelId?: string;
  /** The user's message with mention tokens still inline. */
  prompt: string;
  /** Prior turns of this conversation (already capped by the renderer). */
  history: ChatTurn[];
  /** Files/folders attached with @ / #. */
  mentions: ChatMention[];
  /** Slash command, when the message started with one (see `@shared/llmModels`). */
  command?: string;
  /** The folder currently open in the browser — the default subject for commands. */
  cwd?: string;
}

/**
 * One file action the Assistant performed via its tools (see
 * `@shared/chatTools`), surfaced as an activity chip in the conversation and
 * stored with the answer it belongs to.
 */
export interface ChatToolCall {
  /** Tool name, e.g. 'create_file'. */
  name: string;
  /** Display-ready one-liner, e.g. 'Created "notes.md"'. */
  summary: string;
  ok: boolean;
  /** Primary path(s) the call touched, for future affordances (reveal, open). */
  paths?: string[];
}

/** A saved conversation, listed in the Assistant's history. */
export interface ChatSessionMeta {
  id: string;
  title: string;
  /** Last chat model the session used. */
  modelId?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

/** One persisted message of a saved session. */
export interface StoredChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  command?: string;
  mentions?: ChatMention[];
  sources?: SemanticHit[];
  /** File actions the Assistant performed while producing this answer. */
  toolCalls?: ChatToolCall[];
  createdAt: number;
}

/** The API surface exposed on `window.chats` (saved Assistant conversations). */
export interface ChatsApi {
  /** All saved sessions, most recently active first. */
  list(): Promise<Result<ChatSessionMeta[]>>;
  /** A session's messages, oldest first. */
  messages(sessionId: string): Promise<Result<StoredChatMessage[]>>;
  rename(sessionId: string, title: string): Promise<Result<void>>;
  /** Delete a session and its messages. */
  remove(sessionId: string): Promise<Result<void>>;
}

/** Streamed chat output, pushed on `Events.chatStream`. */
export type ChatStreamEvent = { requestId: string } & (
  | { type: 'chunk'; text: string }
  | { type: 'sources'; hits: SemanticHit[] }
  | { type: 'tool'; call: ChatToolCall }
  | { type: 'done' }
  | { type: 'error'; error: AppError }
);

/** The API surface exposed on `window.llm` (the Assistant chat). */
export interface LlmApi {
  /** Status of every catalog model (absent / downloading / ready / error). */
  models(): Promise<Result<LlmModelStatus[]>>;
  /** Download a chat model; progress arrives via `onModelProgress`. */
  download(modelId: string): Promise<Result<void>>;
  /** Delete a downloaded chat model's weights from disk. */
  remove(modelId: string): Promise<Result<void>>;
  /** What this machine can run (GPU backend + memory), for the model picker. */
  specs(): Promise<Result<LlmSystemSpecs>>;
  /** Answer a message; output streams via `onEvent`, resolves when the stream
   * ends with the session the exchange was saved under. */
  send(payload: ChatSendPayload): Promise<Result<{ sessionId: string }>>;
  /** Abort an in-flight `send` by its requestId. */
  stop(requestId: string): Promise<Result<void>>;
  /** Subscribe to streaming chat output; returns an unsubscribe fn. */
  onEvent(cb: (event: ChatStreamEvent) => void): () => void;
  /** Subscribe to model download/state progress; returns an unsubscribe fn. */
  onModelProgress(cb: (status: LlmModelStatus) => void): () => void;
}

/** The API surface exposed on `window.ai` by the preload bridge. */
export interface AiApi {
  /** State of a model (defaults to the active one when modelId is omitted). */
  status(modelId?: string): Promise<Result<AiModelStatus>>;
  /** Ensure a model is downloaded (defaults to the text model; progress via onModelProgress). */
  download(modelId?: string): Promise<Result<void>>;
  /** Embed each string; rows are plain number[] (Float32Array doesn't survive IPC). */
  embed(texts: string[]): Promise<Result<number[][]>>;
  /** Embed each image file by path; image-capable models (CLIP) only. */
  embedImages(paths: string[]): Promise<Result<number[][]>>;
  /** Subscribe to model download/state progress; returns an unsubscribe fn. */
  onModelProgress(cb: (status: AiModelStatus) => void): () => void;
}
