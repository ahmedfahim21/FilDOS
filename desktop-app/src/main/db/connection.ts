import type * as NodeSqlite from 'node:sqlite';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { migrate } from './migrations';
import * as schema from './schema';

// node:sqlite is still experimental, so bundlers (vite/rollup) don't list it
// as a builtin yet. process.getBuiltinModule loads it at runtime without a
// static import; the imports above are type-only and erased at compile time.
const sqliteModule = process.getBuiltinModule('node:sqlite') as typeof NodeSqlite;

/**
 * App-wide SQLite database. The engine is Node's built-in `node:sqlite` (no
 * native deps to rebuild for Electron), with Drizzle ORM layered on top via
 * its sqlite-proxy driver for typed schema and queries. It holds everything
 * that isn't the filesystem itself: tags, recently opened files, per-folder
 * view settings and global preferences. The main process opens it once at
 * startup (`initDb`); feature modules grab the handle via `db()`. Tests open
 * `:memory:` databases the same way.
 */

export type Db = SqliteRemoteDatabase<typeof schema>;

let sqlite: DatabaseSync | null = null;
let orm: Db | null = null;

/** Open (or create) the database at `file` and bring its schema up to date. */
export function initDb(file: string): void {
  closeDb();
  const d = new sqliteModule.DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL');
  d.exec('PRAGMA foreign_keys = ON');
  migrate(d);
  sqlite = d;

  // Drizzle's sqlite-proxy driver: execute each query on the synchronous
  // node:sqlite connection. Drizzle expects rows as arrays of values in
  // SELECT-column order, which matches the key order of node:sqlite's rows.
  orm = drizzle(
    async (sqlText, params, method) => {
      const stmt = d.prepare(sqlText);
      const args = params as SQLInputValue[];
      if (method === 'run') {
        stmt.run(...args);
        return { rows: [] };
      }
      if (method === 'get') {
        const row = stmt.get(...args) as Record<string, unknown> | undefined;
        return { rows: row ? Object.values(row) : [] };
      }
      const rows = stmt.all(...args) as Record<string, unknown>[];
      return { rows: rows.map((r) => Object.values(r)) };
    },
    { schema },
  );
}

/** The Drizzle handle. Throws if `initDb` hasn't run yet. */
export function db(): Db {
  if (!orm) throw new Error('Database not initialised — call initDb() first.');
  return orm;
}

/** The raw synchronous connection, for the few spots Drizzle can't express. */
export function rawDb(): DatabaseSync {
  if (!sqlite) throw new Error('Database not initialised — call initDb() first.');
  return sqlite;
}

export function closeDb(): void {
  sqlite?.close();
  sqlite = null;
  orm = null;
}
