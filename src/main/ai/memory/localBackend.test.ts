import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IndexState } from '@shared/types';
import type { AiProvider } from '../providers/types';
import * as aiIndex from '../../db/aiIndex';
import { closeDb, initDb } from '../../db';
import { SqliteVectorStore } from '../../db/vectorStore.sqlite';
import { useTempDir } from '../../fs/fixtures';
import { LocalBackend } from './localBackend';

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
  indexedAt: 1,
  status: 'indexed',
});

async function indexFile(path: string, vec: number[], text: string): Promise<void> {
  await fs.writeFile(path, text);
  await aiIndex.upsertState(state(path));
  await store.upsert(path, [{ chunkIx: 0, text, embedding: Float32Array.from(vec), modelId: 'm1' }]);
}

function backend(provider: AiProvider | null): LocalBackend {
  return new LocalBackend({
    provider: async () => provider,
    models: { text: 'm1', image: 'clip' },
    vectorStore: store,
  });
}

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

describe('LocalBackend', () => {
  it('delegates to the on-device vector search and ranks the best file first', async () => {
    const a = join(tmp(), 'a.txt');
    const b = join(tmp(), 'b.txt');
    await indexFile(a, [1, 0, 0], 'alpha content about ships');
    await indexFile(b, [0, 1, 0], 'beta content about trains');

    const hits = await backend(fakeProvider([0.9, 0.1, 0])).search('vessels at sea');

    expect(hits[0].path).toBe(a);
    expect(hits[0].snippet).toContain('alpha');
  });

  it('passes rootPath through to scope results to a subtree', async () => {
    await fs.mkdir(join(tmp(), 'docs'));
    await fs.mkdir(join(tmp(), 'other'));
    const inDocs = join(tmp(), 'docs', 'a.txt');
    const outside = join(tmp(), 'other', 'c.txt');
    await indexFile(inDocs, [1, 0, 0], 'in docs');
    await indexFile(outside, [1, 0, 0], 'outside');

    const hits = await backend(fakeProvider([1, 0, 0])).search('q', { rootPath: join(tmp(), 'docs') });

    expect(hits.map((h) => h.path)).toEqual([inDocs]);
  });

  it('throws EINVAL when no embedding provider is configured', async () => {
    await expect(backend(null).search('q')).rejects.toMatchObject({ code: 'EINVAL' });
  });

  it('exposes its registry id', () => {
    expect(backend(fakeProvider([1, 0, 0])).id).toBe('local');
  });
});
