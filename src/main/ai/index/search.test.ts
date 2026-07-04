import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IndexState } from '@shared/types';
import type { AiProvider } from '../providers/types';
import * as aiIndex from '../../db/aiIndex';
import { closeDb, initDb } from '../../db';
import { SqliteVectorStore } from '../../db/vectorStore.sqlite';
import { useTempDir } from '../../fs/fixtures';
import { semanticSearch } from './search';

const tmp = useTempDir();
const store = new SqliteVectorStore();

/** A provider that embeds any query to a fixed vector (the test controls ranking). */
function fakeProvider(queryVec: number[]): AiProvider {
  return {
    id: 'fake',
    capabilities: { embed: true, generate: false, images: false },
    async status(modelId) {
      return { state: 'ready', modelId, dim: queryVec.length };
    },
    async download() {},
    async embed() {
      return [Float32Array.from(queryVec)];
    },
    async embedImages() {
      return [];
    },
  };
}

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

/** Write a real file and index it with one chunk carrying `vec`. */
async function indexFile(path: string, vec: number[], text: string): Promise<void> {
  await fs.writeFile(path, text);
  await aiIndex.upsertState(state(path));
  await store.upsert(path, [{ chunkIx: 0, text, embedding: Float32Array.from(vec), modelId: 'm1' }]);
}

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

describe('semanticSearch', () => {
  it('ranks the most similar file first and returns its snippet', async () => {
    const a = join(tmp(), 'a.txt');
    const b = join(tmp(), 'b.txt');
    const c = join(tmp(), 'c.txt');
    await indexFile(a, [1, 0, 0], 'alpha content about ships');
    await indexFile(b, [0, 1, 0], 'beta content about trains');
    await indexFile(c, [0, 0, 1], 'gamma content about planes');

    const hits = await semanticSearch(fakeProvider([0.9, 0.1, 0]), { text: 'm1', image: 'clip' }, store, 'vessels at sea');

    expect(hits[0].path).toBe(a);
    expect(hits[0].snippet).toContain('alpha');
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it('collapses multiple chunks of one file to a single best-scored hit', async () => {
    const a = join(tmp(), 'a.txt');
    await fs.writeFile(a, 'two chunks');
    await aiIndex.upsertState(state(a));
    await store.upsert(a, [
      // Different directions — cosine ignores magnitude — so 'strong' wins.
      { chunkIx: 0, text: 'weak match', embedding: Float32Array.from([1, 1, 0]), modelId: 'm1' },
      { chunkIx: 1, text: 'strong match', embedding: Float32Array.from([1, 0, 0]), modelId: 'm1' },
    ]);

    const hits = await semanticSearch(fakeProvider([1, 0, 0]), { text: 'm1', image: 'clip' }, store, 'q');

    expect(hits).toHaveLength(1);
    expect(hits[0].snippet).toContain('strong');
  });

  it('scopes results to rootPath', async () => {
    await fs.mkdir(join(tmp(), 'docs'));
    await fs.mkdir(join(tmp(), 'other'));
    const inDocs = join(tmp(), 'docs', 'a.txt');
    const outside = join(tmp(), 'other', 'c.txt');
    await indexFile(inDocs, [1, 0, 0], 'in docs');
    await indexFile(outside, [1, 0, 0], 'outside');

    const hits = await semanticSearch(fakeProvider([1, 0, 0]), { text: 'm1', image: 'clip' }, store, 'q', {
      rootPath: join(tmp(), 'docs'),
    });

    expect(hits.map((h) => h.path)).toEqual([inDocs]);
  });

  it('returns empty for a blank query or an empty index', async () => {
    expect(await semanticSearch(fakeProvider([1, 0, 0]), { text: 'm1', image: 'clip' }, store, '   ')).toEqual([]);
    expect(await semanticSearch(fakeProvider([1, 0, 0]), { text: 'm1', image: 'clip' }, store, 'anything')).toEqual([]);
  });

  it('ignores chunks embedded by a different model', async () => {
    const a = join(tmp(), 'a.txt');
    await fs.writeFile(a, 'alpha');
    await aiIndex.upsertState(state(a)); // state() uses modelId 'm1'
    // Chunk was embedded by a *different* model than the query will use.
    await store.upsert(a, [
      { chunkIx: 0, text: 'alpha', embedding: Float32Array.from([1, 0, 0]), modelId: 'OTHER' },
    ]);

    const hits = await semanticSearch(fakeProvider([1, 0, 0]), { text: 'm1', image: 'clip' }, store, 'q');

    expect(hits).toEqual([]); // no same-model chunks → clean empty, not a false match
  });

  it('prunes and omits files deleted on disk', async () => {
    const a = join(tmp(), 'a.txt');
    const b = join(tmp(), 'b.txt');
    await indexFile(a, [1, 0, 0], 'alpha');
    await indexFile(b, [0, 1, 0], 'beta');
    await fs.rm(a); // deleted after indexing

    const hits = await semanticSearch(fakeProvider([1, 0, 0]), { text: 'm1', image: 'clip' }, store, 'q');

    expect(hits.map((h) => h.path)).not.toContain(a);
    expect(await aiIndex.getState(a)).toBeNull(); // pruned from the index
  });
});

describe('semanticSearch — RRF hybrid fusion', () => {
  it('BM25-boosted exact match surfaces higher than vector-only ranking would place it', async () => {
    // Vector: file A ranks first (high cosine), file B ranks second (lower cosine).
    // BM25: file B is an exact filename/identifier match → ranks first in keyword lane.
    // RRF should fuse: A gets 1/(61+1)=0.0164, B gets 1/(61+2)+1/(61+1)≈0.0322 → B wins.
    const a = join(tmp(), 'alpha.txt');
    const b = join(tmp(), 'beta.txt');
    await indexFile(a, [1, 0, 0], 'unrelated prose content here alpha topic');
    await indexFile(b, [0.85, 0, 0], 'fetchUser function signature docs'); // lower cosine

    // Keyword store populated with the same content.
    const { MiniSearchKeywordStore } = await import('./keywordStore');
    const ks = new MiniSearchKeywordStore();
    ks.upsert(a, [{ chunkIx: 0, text: 'unrelated prose content here alpha topic' }]);
    ks.upsert(b, [{ chunkIx: 0, text: 'fetchUser function signature docs' }]);

    // Without BM25: A wins (higher cosine).
    const vecOnly = await semanticSearch(fakeProvider([1, 0, 0]), { text: 'm1', image: 'clip' }, store, 'fetchUser');
    expect(vecOnly[0].path).toBe(a);

    // With BM25: B surfaces first because 'fetchUser' is an exact identifier match.
    const hybrid = await semanticSearch(fakeProvider([1, 0, 0]), { text: 'm1', image: 'clip' }, store, 'fetchUser', {
      keywordStore: ks,
    });
    expect(hybrid[0].path).toBe(b);
  });
});
