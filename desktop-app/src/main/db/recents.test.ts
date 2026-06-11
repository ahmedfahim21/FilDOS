import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, initDb } from './index';
import { clearRecents, listRecents, recordOpen, removeRecents } from './recents';

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

describe('recents', () => {
  it('records opens newest-first', async () => {
    await recordOpen('/a.txt', 'a.txt');
    await recordOpen('/b.txt', 'b.txt');
    expect((await listRecents()).map((r) => r.name)).toEqual(['b.txt', 'a.txt']);
  });

  it('re-opening bumps the count and moves the file to the top', async () => {
    await recordOpen('/a.txt', 'a.txt');
    await recordOpen('/b.txt', 'b.txt');
    await recordOpen('/a.txt', 'a.txt');

    const [first] = await listRecents();
    expect(first).toMatchObject({ path: '/a.txt', openCount: 2 });
    expect(await listRecents()).toHaveLength(2);
  });

  it('respects the requested limit', async () => {
    for (const n of [1, 2, 3]) await recordOpen(`/f${n}.txt`, `f${n}.txt`);
    expect(await listRecents(2)).toHaveLength(2);
  });

  it('removes and clears entries', async () => {
    await recordOpen('/a.txt', 'a.txt');
    await recordOpen('/b.txt', 'b.txt');

    await removeRecents(['/a.txt']);
    expect((await listRecents()).map((r) => r.path)).toEqual(['/b.txt']);

    await clearRecents();
    expect(await listRecents()).toEqual([]);
  });
});
