import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { IndexState } from '@shared/types';
import { appendChunks, chunkDetails, getState, partialStates, prune, remove, replaceChunks, statesUnder, upsertState } from './aiIndex';
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
      { chunkIx: 0, text: 'one', embedding: null, modelId: 'm1', kind: 'text' },
      { chunkIx: 1, text: 'two', embedding: null, modelId: 'm1', kind: 'text' },
    ]);
    expect(await chunkRows('/a.txt')).toEqual([0, 1]);

    await replaceChunks('/a.txt', [{ chunkIx: 0, text: 'only', embedding: null, modelId: 'm1', kind: 'text' }]);
    expect(await chunkRows('/a.txt')).toEqual([0]);
  });
});

describe('remove / prune', () => {
  it('cascades chunks when an index_state row is removed', async () => {
    await upsertState(state('/a.txt'));
    await replaceChunks('/a.txt', [{ chunkIx: 0, text: 'x', embedding: null, modelId: 'm1', kind: 'text' }]);

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

describe('state info + partial files', () => {
  it('round-trips the later-pass info as JSON and lists partial files oldest first', async () => {
    await upsertState(state('/book.pdf', { status: 'partial', indexedAt: 5, info: { pages: 200, pagesRead: 30 } }));
    await upsertState(state('/old.pdf', { status: 'partial', indexedAt: 2, info: { pages: 90, pagesRead: 30 } }));
    await upsertState(state('/done.txt'));

    expect(await getState('/book.pdf')).toEqual(
      state('/book.pdf', { status: 'partial', indexedAt: 5, info: { pages: 200, pagesRead: 30 } }),
    );
    expect(await getState('/done.txt')).toEqual(state('/done.txt', { info: null }));
    expect((await partialStates()).map((s) => s.path)).toEqual(['/old.pdf', '/book.pdf']);
    expect((await statesUnder()).find((s) => s.path === '/book.pdf')?.info).toEqual({ pages: 200, pagesRead: 30 });

    // Finishing clears the info and the partial status; nothing else changes.
    await upsertState(state('/book.pdf', { indexedAt: 5, info: null }));
    expect(await getState('/book.pdf')).toEqual(state('/book.pdf', { indexedAt: 5, info: null }));
    expect((await partialStates()).map((s) => s.path)).toEqual(['/old.pdf']);
  });
});

describe('appendChunks / chunkDetails', () => {
  it('appends later-pass chunks and reports each chunk’s text and place', async () => {
    await upsertState(state('/book.pdf'));
    await replaceChunks('/book.pdf', [
      { chunkIx: 0, text: 'page one', embedding: null, modelId: 'm1', kind: 'page', loc: 1, locEnd: 1 },
    ]);
    await appendChunks('/book.pdf', [
      { chunkIx: 1, text: 'page forty', embedding: null, modelId: 'm1', kind: 'page', loc: 40, locEnd: 40, pass: 2 },
    ]);

    expect(await chunkRows('/book.pdf')).toEqual([0, 1]);
    const rows = await db().select().from(fileChunks).where(eq(fileChunks.path, '/book.pdf'));
    expect(rows.map((r) => ({ ix: r.chunkIx, kind: r.kind, loc: r.loc, pass: r.pass }))).toEqual([
      { ix: 0, kind: 'page', loc: 1, pass: 1 },
      { ix: 1, kind: 'page', loc: 40, pass: 2 },
    ]);

    const details = await chunkDetails([{ path: '/book.pdf', chunkIx: 1 }]);
    expect([...details.entries()]).toEqual([
      ['/book.pdf\x001', { text: 'page forty', kind: 'page', loc: 40, locEnd: 40 }],
    ]);
  });
});
