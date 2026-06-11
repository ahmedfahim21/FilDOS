import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, initDb } from './index';
import {
  assignTag,
  createTag,
  deleteTag,
  listTags,
  pathsForTag,
  pruneTaggedPaths,
  renameTag,
  TAG_COLORS,
  tagsForPaths,
  unassignTag,
} from './tags';

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

describe('createTag', () => {
  it('creates a tag and cycles the color palette', async () => {
    const first = await createTag('work');
    const second = await createTag('home');
    expect(first).toMatchObject({ name: 'work', color: TAG_COLORS[0], count: 0 });
    expect(second.color).toBe(TAG_COLORS[1]);
  });

  it('honours an explicit color and trims the name', async () => {
    const tag = await createTag('  urgent  ', '#123456');
    expect(tag).toMatchObject({ name: 'urgent', color: '#123456' });
  });

  it('rejects duplicates case-insensitively', async () => {
    await createTag('Work');
    await expect(createTag('work')).rejects.toMatchObject({ code: 'EINVAL' });
  });

  it('rejects empty and oversized names', async () => {
    await expect(createTag('   ')).rejects.toMatchObject({ code: 'EINVAL' });
    await expect(createTag('x'.repeat(65))).rejects.toMatchObject({ code: 'EINVAL' });
  });
});

describe('renameTag / deleteTag', () => {
  it('renames a tag', async () => {
    const tag = await createTag('work');
    expect((await renameTag(tag.id, 'office')).name).toBe('office');
  });

  it('refuses to rename onto an existing name', async () => {
    await createTag('work');
    const other = await createTag('home');
    await expect(renameTag(other.id, 'work')).rejects.toMatchObject({ code: 'EINVAL' });
  });

  it('rejects renaming a vanished tag', async () => {
    await expect(renameTag(999, 'ghost')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('deleting a tag cascades its assignments away', async () => {
    const tag = await createTag('work');
    await assignTag(['/a.txt'], tag.id);
    await deleteTag(tag.id);
    expect(await listTags()).toEqual([]);
    expect(await tagsForPaths(['/a.txt'])).toEqual({});
  });
});

describe('assignments', () => {
  it('assigns and reports usage counts, sorted by name', async () => {
    const work = await createTag('work');
    const home = await createTag('home');
    await assignTag(['/a.txt', '/b.txt'], work.id);
    await assignTag(['/a.txt'], home.id);

    expect(await listTags()).toMatchObject([
      { name: 'home', count: 1 },
      { name: 'work', count: 2 },
    ]);
  });

  it('re-assigning is a no-op rather than an error', async () => {
    const tag = await createTag('work');
    await assignTag(['/a.txt'], tag.id);
    await assignTag(['/a.txt'], tag.id);
    expect((await listTags())[0].count).toBe(1);
  });

  it('maps paths to their tag ids, omitting untagged paths', async () => {
    const work = await createTag('work');
    const home = await createTag('home');
    await assignTag(['/a.txt'], work.id);
    await assignTag(['/a.txt'], home.id);

    const map = await tagsForPaths(['/a.txt', '/untagged.txt']);
    expect(map['/a.txt']).toEqual([work.id, home.id]);
    expect(map['/untagged.txt']).toBeUndefined();
  });

  it('unassigns only the given tag from the given paths', async () => {
    const work = await createTag('work');
    const home = await createTag('home');
    await assignTag(['/a.txt', '/b.txt'], work.id);
    await assignTag(['/a.txt'], home.id);

    await unassignTag(['/a.txt'], work.id);
    expect(await tagsForPaths(['/a.txt', '/b.txt'])).toEqual({
      '/a.txt': [home.id],
      '/b.txt': [work.id],
    });
  });

  it('lists and prunes the paths carrying a tag', async () => {
    const tag = await createTag('work');
    await assignTag(['/gone.txt', '/here.txt'], tag.id);
    expect((await pathsForTag(tag.id)).sort()).toEqual(['/gone.txt', '/here.txt']);

    await pruneTaggedPaths(['/gone.txt']);
    expect(await pathsForTag(tag.id)).toEqual(['/here.txt']);
  });
});
