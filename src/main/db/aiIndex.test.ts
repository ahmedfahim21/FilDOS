import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { IndexState } from '@shared/types';
import { getState, prune, remove, replaceChunks, searchCandidates, upsertState } from './aiIndex';
import { closeDb, db, initDb } from './index';
import { fileChunks } from './schema';

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

const state = (path: string, over: Partial<IndexState> = {}): IndexState => ({
  path,
  mtime: 100,
  size: 10,
  contentHash: 'h',
  modelId: 'm1',
  indexVersion: 1,
  indexedAt: 1,
  status: 'indexed',
  ...over,
});

const chunkRows = async (path: string) =>
  (await db().select({ ix: fileChunks.chunkIx }).from(fileChunks).where(eq(fileChunks.path, path))).map(
    (r) => r.ix,
  );

describe('upsertState / getState', () => {
  it('round-trips a row and updates on conflict', async () => {
    await upsertState(state('/a.txt'));
    expect(await getState('/a.txt')).toMatchObject({ path: '/a.txt', size: 10, status: 'indexed' });

    await upsertState(state('/a.txt', { size: 99, status: 'error', contentHash: null }));
    expect(await getState('/a.txt')).toMatchObject({ size: 99, status: 'error', contentHash: null });
  });

  it('returns null for an unknown path', async () => {
    expect(await getState('/missing')).toBeNull();
  });
});

describe('replaceChunks', () => {
  it('replaces the previous set rather than appending', async () => {
    await upsertState(state('/a.txt'));
    await replaceChunks('/a.txt', [
      { chunkIx: 0, text: 'one', embedding: null, modelId: 'm1' },
      { chunkIx: 1, text: 'two', embedding: null, modelId: 'm1' },
    ]);
    expect(await chunkRows('/a.txt')).toEqual([0, 1]);

    await replaceChunks('/a.txt', [{ chunkIx: 0, text: 'only', embedding: null, modelId: 'm1' }]);
    expect(await chunkRows('/a.txt')).toEqual([0]);
  });
});

describe('remove / prune', () => {
  it('cascades chunks when an index_state row is removed', async () => {
    await upsertState(state('/a.txt'));
    await replaceChunks('/a.txt', [{ chunkIx: 0, text: 'x', embedding: null, modelId: 'm1' }]);

    await remove(['/a.txt']);

    expect(await getState('/a.txt')).toBeNull();
    expect(await chunkRows('/a.txt')).toEqual([]);
  });

  it('prune deletes only the given paths', async () => {
    await upsertState(state('/a.txt'));
    await upsertState(state('/b.txt'));

    await prune(['/a.txt']);

    expect(await getState('/a.txt')).toBeNull();
    expect(await getState('/b.txt')).not.toBeNull();
  });
});

describe('searchCandidates', () => {
  it('returns only rows that have an embedding', async () => {
    await upsertState(state('/a.txt'));
    await replaceChunks('/a.txt', [
      { chunkIx: 0, text: 'embedded', embedding: Buffer.from([1, 2, 3, 4]), modelId: 'm1' },
      { chunkIx: 1, text: 'bare', embedding: null, modelId: 'm1' },
    ]);

    const rows = await searchCandidates();
    expect(rows.map((r) => r.text)).toEqual(['embedded']);
  });
});
