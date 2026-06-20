import type { DatabaseSync } from 'node:sqlite';

/**
 * Schema migrations, applied in order. `PRAGMA user_version` records how many
 * have run, so adding a statement to the END of this list upgrades existing
 * databases in place (keep ./schema.ts in sync). Never edit or reorder
 * shipped entries. Plain SQL — no migration files to locate inside an asar.
 *
 * To scaffold the SQL for a schema change: edit ./schema.ts, run
 * `npm run db:generate` (drizzle-kit diffs against the snapshots in
 * /drizzle), review the emitted SQL and paste it here as a new entry.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE prefs (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL              -- JSON-encoded
  );

  CREATE TABLE tags (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
    color      TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE file_tags (
    path      TEXT NOT NULL,
    tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    tagged_at INTEGER NOT NULL,
    PRIMARY KEY (path, tag_id)
  );
  CREATE INDEX idx_file_tags_tag ON file_tags(tag_id);

  CREATE TABLE recents (
    path       TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    opened_at  INTEGER NOT NULL,
    open_count INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX idx_recents_opened ON recents(opened_at DESC);

  CREATE TABLE folder_views (
    path       TEXT PRIMARY KEY,
    sort_key   TEXT,
    sort_dir   TEXT,
    view_mode  TEXT,
    icon_size  TEXT,
    updated_at INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE accounts (
    id         TEXT PRIMARY KEY,
    provider   TEXT NOT NULL,
    label      TEXT NOT NULL,
    token      TEXT NOT NULL,  -- base64-encoded safeStorage-encrypted JSON
    created_at INTEGER NOT NULL
  );
  `,
];

/** Bring a freshly opened database up to the latest schema version. */
export function migrate(d: DatabaseSync): void {
  const row = d.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    d.exec('BEGIN');
    try {
      d.exec(MIGRATIONS[v]);
      d.exec(`PRAGMA user_version = ${v + 1}`);
      d.exec('COMMIT');
    } catch (err) {
      d.exec('ROLLBACK');
      throw err;
    }
  }
}
