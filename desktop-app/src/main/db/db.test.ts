import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTempDir } from '../fs/fixtures';
import { closeDb, db, initDb, remapPaths } from './index';
import { fileTags, folderViews, recents, tags } from './schema';
import { assignTag, createTag, tagsForPaths } from './tags';
import { recordOpen } from './recents';
import { setFolderView } from './views';

describe('initDb', () => {
  const tmp = useTempDir();
  afterEach(() => closeDb());

  it('throws when used before initialisation', () => {
    expect(() => db()).toThrow(/not initialised/);
  });

  it('creates the schema and persists data across reopens', async () => {
    const file = join(tmp(), 'test.db');
    initDb(file);
    await createTag('work');
    closeDb();

    initDb(file); // migrations must be idempotent on an up-to-date database
    const rows = await db().select().from(tags);
    expect(rows.map((t) => t.name)).toEqual(['work']);
  });
});

describe('remapPaths', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => closeDb());

  it('moves a single file across all tables', async () => {
    const tag = await createTag('work');
    await assignTag(['/a/file.txt'], tag.id);
    await recordOpen('/a/file.txt', 'file.txt');
    await setFolderView('/a/file.txt', { viewMode: 'grid' }); // contrived, but exercises the table

    remapPaths('/a/file.txt', '/b/renamed.txt', '/');

    expect(await tagsForPaths(['/b/renamed.txt'])).toEqual({ '/b/renamed.txt': [tag.id] });
    expect((await db().select().from(recents))[0]).toMatchObject({
      path: '/b/renamed.txt',
      name: 'renamed.txt', // display name follows the rename
    });
    expect((await db().select().from(folderViews))[0].path).toBe('/b/renamed.txt');
  });

  it('moves a folder together with everything inside it', async () => {
    const tag = await createTag('work');
    await assignTag(['/proj', '/proj/src/a.ts', '/projects/other.ts'], tag.id);

    remapPaths('/proj', '/archive/proj', '/');

    const map = await tagsForPaths([
      '/archive/proj',
      '/archive/proj/src/a.ts',
      '/projects/other.ts',
    ]);
    // "/projects" merely shares the "/proj" prefix — it must not be touched.
    expect(Object.keys(map).sort()).toEqual([
      '/archive/proj',
      '/archive/proj/src/a.ts',
      '/projects/other.ts',
    ]);
  });

  it('resolves collisions in favour of the moved row', async () => {
    const tag = await createTag('work');
    await assignTag(['/a.txt', '/b.txt'], tag.id);

    remapPaths('/a.txt', '/b.txt', '/'); // overwrite move

    const rows = await db().select().from(fileTags);
    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe('/b.txt');
  });
});
