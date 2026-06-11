import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { useTempDir } from '../fs/fixtures';
import { closeDb, db, initDb, rawDb } from './index';
import { prefs } from './schema';

/**
 * Generic database setup coverage: initialisation, migrations and the
 * Drizzle round-trip. Feature behaviour lives beside each feature module
 * (tags.test.ts, recents.test.ts, views.test.ts, remap.test.ts).
 */
describe('initDb', () => {
  const tmp = useTempDir();
  afterEach(() => closeDb());

  it('throws when used before initialisation', () => {
    expect(() => db()).toThrow(/not initialised/);
    expect(() => rawDb()).toThrow(/not initialised/);
  });

  it('creates every table of the current schema version', () => {
    initDb(':memory:');
    const rows = rawDb()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(
      expect.arrayContaining(['prefs', 'tags', 'file_tags', 'recents', 'folder_views']),
    );
    const [version] = rawDb().prepare('PRAGMA user_version').all() as {
      user_version: number;
    }[];
    expect(version.user_version).toBeGreaterThan(0);
  });

  it('round-trips reads and writes through Drizzle', async () => {
    initDb(':memory:');
    await db().insert(prefs).values({ key: 'k', value: '"v"' });
    expect(await db().select().from(prefs)).toEqual([{ key: 'k', value: '"v"' }]);
    expect(await db().run(sql`DELETE FROM prefs`)).toBeDefined();
    expect(await db().select().from(prefs)).toEqual([]);
  });

  it('persists data across reopens without re-running migrations', async () => {
    const file = join(tmp(), 'test.db');
    initDb(file);
    await db().insert(prefs).values({ key: 'k', value: '1' });
    closeDb();

    initDb(file); // migrations must be idempotent on an up-to-date database
    expect(await db().select().from(prefs)).toEqual([{ key: 'k', value: '1' }]);
  });
});
