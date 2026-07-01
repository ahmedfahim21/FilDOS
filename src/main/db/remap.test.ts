import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db, initDb, remapPaths } from './index';
import { fileChunks, fileTags, folderViews, indexState, recents, tags } from './schema';

beforeEach(async () => {
  initDb(':memory:');
  await db().insert(tags).values({ id: 1, name: 'work', color: '#5b8cff', createdAt: 1 });
});
afterEach(() => closeDb());

const tagPaths = (paths: string[]) =>
  db()
    .insert(fileTags)
    .values(paths.map((path, i) => ({ path, tagId: 1, taggedAt: i })));

const taggedPaths = async () =>
  (await db().select({ path: fileTags.path }).from(fileTags)).map((r) => r.path).sort();

describe('remapPaths', () => {
  it('moves a single file across all tables, renaming the recents entry', async () => {
    await tagPaths(['/a/file.txt']);
    await db()
      .insert(recents)
      .values({ path: '/a/file.txt', name: 'file.txt', openedAt: 1, openCount: 1 });
    await db().insert(folderViews).values({ path: '/a/file.txt', updatedAt: 1 });

    remapPaths('/a/file.txt', '/b/renamed.txt', '/');

    expect(await taggedPaths()).toEqual(['/b/renamed.txt']);
    expect((await db().select().from(recents))[0]).toMatchObject({
      path: '/b/renamed.txt',
      name: 'renamed.txt', // display name follows the rename
    });
    expect((await db().select().from(folderViews))[0].path).toBe('/b/renamed.txt');
  });

  it('moves a folder together with everything inside it', async () => {
    await tagPaths(['/proj', '/proj/src/a.ts', '/projects/other.ts']);

    remapPaths('/proj', '/archive/proj', '/');

    // "/projects" merely shares the "/proj" prefix — it must not be touched.
    expect(await taggedPaths()).toEqual([
      '/archive/proj',
      '/archive/proj/src/a.ts',
      '/projects/other.ts',
    ]);
  });

  it('resolves collisions in favour of the moved row', async () => {
    await tagPaths(['/a.txt', '/b.txt']);

    remapPaths('/a.txt', '/b.txt', '/'); // overwrite move

    expect(await taggedPaths()).toEqual(['/b.txt']);
  });

  it('carries the AI index along, with chunks following via ON UPDATE CASCADE', async () => {
    await db()
      .insert(indexState)
      .values({ path: '/a/file.txt', mtime: 1, size: 1, modelId: 'm1', indexedAt: 1, status: 'indexed' });
    await db()
      .insert(fileChunks)
      .values({ path: '/a/file.txt', chunkIx: 0, text: 'hi', modelId: 'm1' });

    remapPaths('/a/file.txt', '/b/renamed.txt', '/');

    expect((await db().select().from(indexState))[0].path).toBe('/b/renamed.txt');
    const chunks = await db().select().from(fileChunks).where(eq(fileChunks.path, '/b/renamed.txt'));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('hi');
  });
});
