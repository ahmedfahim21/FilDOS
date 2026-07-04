import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MiniSearchKeywordStore } from './keywordStore';
import * as aiIndex from '../../db/aiIndex';
import { closeDb, initDb } from '../../db';

// ---------------------------------------------------------------------------
// Unit tests — pure in-memory store, no DB
// ---------------------------------------------------------------------------

describe('MiniSearchKeywordStore — core', () => {
  let store: MiniSearchKeywordStore;

  beforeEach(() => {
    store = new MiniSearchKeywordStore();
  });

  it('upsert + search returns the indexed document', () => {
    store.upsert('/docs/readme.md', [{ chunkIx: 0, text: 'async function fetchUser returns a promise' }]);
    const hits = store.search('fetch user');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].path).toBe('/docs/readme.md');
  });

  it('filename match ranks higher than a body-text match', () => {
    // 'config' appears only in the body of alpha but is the filename of beta.
    store.upsert('/docs/alpha.txt', [{ chunkIx: 0, text: 'This file talks about config settings.' }]);
    store.upsert('/project/config.ts', [{ chunkIx: 0, text: 'export default { port: 3000 }' }]);
    const hits = store.search('config');
    expect(hits[0].path).toBe('/project/config.ts');
  });

  it('remove drops all chunks for a path', () => {
    store.upsert('/a.txt', [
      { chunkIx: 0, text: 'first chunk of a' },
      { chunkIx: 1, text: 'second chunk of a' },
    ]);
    expect(store.size()).toBe(2);
    store.remove(['/a.txt']);
    expect(store.size()).toBe(0);
    expect(store.search('chunk a')).toHaveLength(0);
  });

  it('upsert is idempotent — re-indexing a path replaces old chunks', () => {
    store.upsert('/a.txt', [{ chunkIx: 0, text: 'original content alpha' }]);
    store.upsert('/a.txt', [{ chunkIx: 0, text: 'updated content beta' }]);
    expect(store.size()).toBe(1);
    expect(store.search('beta')[0].path).toBe('/a.txt');
    expect(store.search('alpha')).toHaveLength(0);
  });

  it('remap moves chunks to the new path', () => {
    store.upsert('/old/notes.txt', [{ chunkIx: 0, text: 'important meeting notes' }]);
    store.remap('/old/notes.txt', '/new/notes.txt');
    const hits = store.search('meeting notes');
    expect(hits[0].path).toBe('/new/notes.txt');
    expect(store.search('meeting').find((h) => h.path === '/old/notes.txt')).toBeUndefined();
  });

  it('underPath filter narrows results to a subtree', () => {
    store.upsert('/work/project/a.ts', [{ chunkIx: 0, text: 'export function compute result' }]);
    store.upsert('/home/personal/b.txt', [{ chunkIx: 0, text: 'export function private note' }]);

    const all = store.search('export function');
    expect(all.length).toBe(2);

    const scoped = store.search('export function', { underPath: '/work/project' });
    expect(scoped.length).toBe(1);
    expect(scoped[0].path).toBe('/work/project/a.ts');
  });

  it('underPath does not match a path that is merely a prefix', () => {
    store.upsert('/proj/a.ts', [{ chunkIx: 0, text: 'hello world' }]);
    store.upsert('/projects/b.ts', [{ chunkIx: 0, text: 'hello world' }]);
    const hits = store.search('hello', { underPath: '/proj' });
    expect(hits.every((h) => !h.path.startsWith('/projects'))).toBe(true);
  });

  it('clear empties the store', () => {
    store.upsert('/a.txt', [{ chunkIx: 0, text: 'some data here' }]);
    store.upsert('/b.txt', [{ chunkIx: 0, text: 'more data there' }]);
    store.clear();
    expect(store.size()).toBe(0);
    expect(store.search('data')).toHaveLength(0);
  });

  it('size() reflects the number of indexed chunk documents', () => {
    expect(store.size()).toBe(0);
    store.upsert('/a.txt', [{ chunkIx: 0, text: 'a' }, { chunkIx: 1, text: 'b' }]);
    expect(store.size()).toBe(2);
    store.upsert('/b.txt', [{ chunkIx: 0, text: 'c' }]);
    expect(store.size()).toBe(3);
    store.remove(['/a.txt']);
    expect(store.size()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Integration test — allChunks() + rebuild round-trip
// ---------------------------------------------------------------------------

describe('allChunks + keyword rebuild round-trip', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => closeDb());

  it('rebuilding from allChunks() recovers the same search results', async () => {
    // Seed two indexed files via aiIndex.
    const stateA = {
      path: '/src/auth.ts',
      mtime: 1,
      size: 10,
      contentHash: null,
      modelId: 'm1',
      indexVersion: 1,
      indexedAt: 1,
      status: 'indexed' as const,
    };
    const stateB = { ...stateA, path: '/src/db.ts' };
    await aiIndex.upsertState(stateA);
    await aiIndex.upsertState(stateB);
    await aiIndex.replaceChunks('/src/auth.ts', [
      { chunkIx: 0, text: 'verifyToken validates JWT claims', embedding: null, modelId: 'm1' },
    ]);
    await aiIndex.replaceChunks('/src/db.ts', [
      { chunkIx: 0, text: 'connect to PostgreSQL database', embedding: null, modelId: 'm1' },
    ]);

    // Rebuild a fresh store from the DB.
    const ks = new MiniSearchKeywordStore();
    const raw = await aiIndex.allChunks();
    const byPath = new Map<string, { chunkIx: number; text: string }[]>();
    for (const c of raw) {
      const arr = byPath.get(c.path) ?? [];
      arr.push({ chunkIx: c.chunkIx, text: c.text });
      byPath.set(c.path, arr);
    }
    for (const [p, chunks] of byPath) ks.upsert(p, chunks);

    expect(ks.size()).toBe(2);
    expect(ks.search('JWT')[0].path).toBe('/src/auth.ts');
    expect(ks.search('database')[0].path).toBe('/src/db.ts');
  });
});

