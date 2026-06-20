import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
