import { sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IndexState } from '@shared/types';
import { upsertState } from './aiIndex';
import { closeDb, initDb } from './index';
import { SqliteVectorStore } from './vectorStore.sqlite';

// Build paths with the OS separator so the underPath prefix filter (which uses
// node:path's sep) matches on every platform CI runs.
const root = `${sep}idxtest`;
const p = (...segs: string[]) => [root, ...segs].join(sep);

const DOCS_A = p('docs', 'a.md');
const DOCS_B = p('docs', 'b.md');
const OTHER_C = p('other', 'c.txt');

// Fresh per test: the store carries an in-memory vector cache, which must not
// outlive the :memory: database it mirrors.
let store: SqliteVectorStore;

const state = (path: string): IndexState => ({
  path,
  mtime: 1,
  size: 1,
  contentHash: null,
  modelId: 'm1',
  indexVersion: 1,
  indexedAt: 1,
  status: 'indexed',
});

/** Index one file with a single chunk carrying `vec`. */
async function indexFile(path: string, vec: number[]): Promise<void> {
  await upsertState(state(path));
  await store.upsert(path, [
    { chunkIx: 0, text: path, embedding: new Float32Array(vec), modelId: 'm1' },
  ]);
}

beforeEach(async () => {
  initDb(':memory:');
  store = new SqliteVectorStore();
  await indexFile(DOCS_A, [1, 0, 0]);
  await indexFile(DOCS_B, [0, 1, 0]);
  await indexFile(OTHER_C, [0, 0, 1]);
});
afterEach(() => closeDb());

describe('SqliteVectorStore.search', () => {
  it('ranks the nearest chunk first by cosine similarity', async () => {
    const hits = await store.search(new Float32Array([0.9, 0.1, 0]));
    expect(hits[0].path).toBe(DOCS_A);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it('honours k', async () => {
    expect(await store.search(new Float32Array([1, 1, 1]), { k: 2 })).toHaveLength(2);
  });

  it('filters by underPath', async () => {
    const hits = await store.search(new Float32Array([1, 1, 1]), { underPath: p('docs') });
    expect(hits.map((h) => h.path).sort()).toEqual([DOCS_A, DOCS_B]);
  });

  it('filters by extension', async () => {
    const hits = await store.search(new Float32Array([1, 1, 1]), { ext: 'txt' });
    expect(hits.map((h) => h.path)).toEqual([OTHER_C]);
  });
});

describe('SqliteVectorStore.remove', () => {
  it('forgets the given paths', async () => {
    await store.remove([DOCS_A]);
    const hits = await store.search(new Float32Array([1, 0, 0]));
    expect(hits.map((h) => h.path)).not.toContain(DOCS_A);
  });
});

describe('SqliteVectorStore.remap', () => {
  it('carries a file’s vectors to the new path (chunks follow via cascade)', async () => {
    const moved = p('docs', 'renamed.md');
    await store.remap(DOCS_A, moved);

    const hits = await store.search(new Float32Array([1, 0, 0]), { k: 1 });
    expect(hits[0].path).toBe(moved);
  });

  it('remaps cached vectors too when the cache is already warm', async () => {
    await store.search(new Float32Array([1, 1, 1])); // warm the cache
    const moved = p('docs', 'renamed.md');
    await store.remap(DOCS_A, moved);

    const hits = await store.search(new Float32Array([1, 0, 0]), { k: 1 });
    expect(hits[0].path).toBe(moved);
  });
});

describe('SqliteVectorStore cache coherence', () => {
  it('sees files indexed after the cache was warmed', async () => {
    await store.search(new Float32Array([1, 1, 1])); // warm
    await indexFile(p('docs', 'new.md'), [0.9, 0.9, 0]);

    const hits = await store.search(new Float32Array([0.9, 0.9, 0]), { k: 1 });
    expect(hits[0].path).toBe(p('docs', 'new.md'));
  });

  it('drops removed files from a warm cache', async () => {
    await store.search(new Float32Array([1, 1, 1])); // warm
    await store.remove([DOCS_A]);

    const hits = await store.search(new Float32Array([1, 0, 0]));
    expect(hits.map((h) => h.path)).not.toContain(DOCS_A);
  });

  it('reloads from the database after clear()', async () => {
    await store.search(new Float32Array([1, 1, 1])); // warm
    store.clear();

    const hits = await store.search(new Float32Array([1, 0, 0]), { k: 1 });
    expect(hits[0].path).toBe(DOCS_A); // rows still in the DB; cache rebuilt
  });
});
