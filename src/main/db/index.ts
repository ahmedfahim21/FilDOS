/**
 * Public surface of the database layer. Connection/setup lives in
 * connection.ts, the schema DDL in migrations.ts, the Drizzle table
 * definitions in schema.ts, and feature queries in tags.ts / recents.ts /
 * views.ts.
 */
export { initDb, closeDb, db, rawDb, type Db } from './connection';
export { remapPaths } from './remap';
