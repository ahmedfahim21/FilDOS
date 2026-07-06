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
  `
  -- AI index storage. One row per indexed file plus its extracted chunks.
  -- No embedder/worker yet — these tables are the persistence the indexing
  -- phase will sit on. mtime+size give a cheap staleness check; content_hash
  -- confirms a real change; model_id lets a model swap invalidate old vectors.
  CREATE TABLE index_state (
    path         TEXT PRIMARY KEY,
    mtime        INTEGER NOT NULL,
    size         INTEGER NOT NULL,
    content_hash TEXT,
    model_id     TEXT NOT NULL,
    indexed_at   INTEGER NOT NULL,
    status       TEXT NOT NULL          -- 'indexed' | 'skipped' | 'error'
  );

  CREATE TABLE file_chunks (
    id        INTEGER PRIMARY KEY,
    path      TEXT NOT NULL
                REFERENCES index_state(path) ON UPDATE CASCADE ON DELETE CASCADE,
    chunk_ix  INTEGER NOT NULL,
    text      TEXT NOT NULL,
    embedding BLOB,                      -- Float32 LE; NULL until the embedder runs
    model_id  TEXT NOT NULL
  );
  CREATE INDEX idx_file_chunks_path ON file_chunks(path);
  `,
  `
  -- Persistent indexing queue. One pending job per path so re-enqueuing a file
  -- coalesces; a 'remove' supersedes a stale 'upsert'. Survives restarts: every
  -- row is treated as pending on startup, so the indexer just drains the table.
  CREATE TABLE index_jobs (
    path        TEXT PRIMARY KEY,
    op          TEXT NOT NULL,            -- 'upsert' | 'remove'
    enqueued_at INTEGER NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL             -- 'pending' | 'error'
  );
  CREATE INDEX idx_index_jobs_status ON index_jobs(status, enqueued_at);
  `,
  `
  -- Add index_version to track chunker/extractor changes. Existing rows default
  -- to 0 so they are flagged stale when INDEX_VERSION (currently 1) is introduced,
  -- triggering a one-time full re-index on the next run.
  ALTER TABLE index_state ADD COLUMN index_version INTEGER NOT NULL DEFAULT 0;
  `,
  `
  -- Assistant chat history: sessions and their messages, so conversations can
  -- be reopened and continued later. Mentions and /find sources are stored as
  -- JSON snapshots of what the message was answered with at the time.
  CREATE TABLE chat_sessions (
    id         TEXT PRIMARY KEY,          -- UUID minted by the chat handler
    title      TEXT NOT NULL,             -- derived from the first message
    model_id   TEXT,                      -- last model the session used
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

  CREATE TABLE chat_messages (
    id         INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role       TEXT NOT NULL,             -- 'user' | 'assistant'
    content    TEXT NOT NULL,
    command    TEXT,                      -- slash command, user messages only
    mentions   TEXT,                      -- JSON ChatMention[], user messages only
    sources    TEXT,                      -- JSON SemanticHit[], assistant messages only
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, id);
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
