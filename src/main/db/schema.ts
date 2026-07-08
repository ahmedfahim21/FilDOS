import { blob, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Drizzle table definitions mirroring the SQL migrations in ./index.ts. The
 * migrations remain the source of truth for the on-disk schema (applied via
 * PRAGMA user_version); these definitions give every query static types.
 */

/** Global preferences, one row per field, values JSON-encoded. */
export const prefs = sqliteTable('prefs', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** User-defined tags. Names are unique case-insensitively (COLLATE NOCASE). */
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** Tag ↔ file assignments, keyed by absolute path. */
export const fileTags = sqliteTable(
  'file_tags',
  {
    path: text('path').notNull(),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    taggedAt: integer('tagged_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.path, t.tagId] }), index('idx_file_tags_tag').on(t.tagId)],
);

/** Recently opened files, one row per path. */
export const recents = sqliteTable(
  'recents',
  {
    path: text('path').primaryKey(),
    name: text('name').notNull(),
    openedAt: integer('opened_at').notNull(),
    openCount: integer('open_count').notNull().default(1),
  },
  (t) => [index('idx_recents_opened').on(t.openedAt)],
);

/** Per-folder view settings; NULL columns fall back to global prefs. */
export const folderViews = sqliteTable('folder_views', {
  path: text('path').primaryKey(),
  sortKey: text('sort_key'),
  sortDir: text('sort_dir'),
  viewMode: text('view_mode'),
  iconSize: text('icon_size'),
  updatedAt: integer('updated_at').notNull(),
});

/** Connected cloud accounts with encrypted OAuth tokens. */
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  label: text('label').notNull(),
  token: text('token').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** AI index bookkeeping: one row per indexed file (see file_chunks for content). */
export const indexState = sqliteTable('index_state', {
  path: text('path').primaryKey(),
  mtime: integer('mtime').notNull(),
  size: integer('size').notNull(),
  contentHash: text('content_hash'),
  modelId: text('model_id').notNull(),
  indexVersion: integer('index_version').notNull().default(0),
  indexedAt: integer('indexed_at').notNull(),
  status: text('status').notNull(),
});

/** Extracted, chunked text per file with optional embedding (Float32 LE BLOB). */
export const fileChunks = sqliteTable(
  'file_chunks',
  {
    id: integer('id').primaryKey(),
    path: text('path')
      .notNull()
      .references(() => indexState.path, { onUpdate: 'cascade', onDelete: 'cascade' }),
    chunkIx: integer('chunk_ix').notNull(),
    text: text('text').notNull(),
    embedding: blob('embedding', { mode: 'buffer' }),
    modelId: text('model_id').notNull(),
  },
  (t) => [index('idx_file_chunks_path').on(t.path)],
);

/** Assistant chat sessions (see db/chats.ts). */
export const chatSessions = sqliteTable(
  'chat_sessions',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    modelId: text('model_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_chat_sessions_updated').on(t.updatedAt)],
);

/** Messages within a chat session; mentions/sources are JSON snapshots. */
export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: integer('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    command: text('command'),
    mentions: text('mentions'),
    sources: text('sources'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_chat_messages_session').on(t.sessionId, t.id)],
);

/** Persistent indexing queue; one pending job per path (see db/indexJobs.ts). */
export const indexJobs = sqliteTable(
  'index_jobs',
  {
    path: text('path').primaryKey(),
    op: text('op').notNull(),
    enqueuedAt: integer('enqueued_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    status: text('status').notNull(),
    /** Cost class: 0 cheap text / removals, 1 images, 2 heavy docs (pdf/docx). */
    priority: integer('priority').notNull().default(0),
  },
  (t) => [
    index('idx_index_jobs_status').on(t.status, t.enqueuedAt),
    index('idx_index_jobs_priority').on(t.status, t.priority, t.enqueuedAt),
  ],
);
