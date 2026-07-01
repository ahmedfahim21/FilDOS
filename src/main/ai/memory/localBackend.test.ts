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

  it('fingerprints text vs image by model id', () => {
    const b = backend(fakeProvider([1, 0, 0]));
    expect(b.fingerprint(join(tmp(), 'a.txt'))).toBe('m1');
    expect(b.fingerprint(join(tmp(), 'a.png'))).toBe('clip');
  });

  it('ingest embeds a real file, records index_state, and makes it searchable', async () => {
    const f = join(tmp(), 'doc.txt');
    await fs.writeFile(f, 'hello world about sailing ships');
    await backend(fakeProvider([1, 0, 0])).ingest(f);

    expect((await aiIndex.getState(f))?.status).toBe('indexed');
    const hits = await backend(fakeProvider([1, 0, 0])).search('ships');
    expect(hits.map((h) => h.path)).toContain(f);
  });

  it('ingest is a no-op for an unchanged file (does not re-embed)', async () => {
    const f = join(tmp(), 'doc.txt');
    await fs.writeFile(f, 'unchanged');
    let embeds = 0;
    const provider: AiProvider = {
      ...fakeProvider([1, 0, 0]),
      async embed() {
        embeds++;
        return [Float32Array.from([1, 0, 0])];
      },
    };
    const b = new LocalBackend({ provider: async () => provider, models: { text: 'm1', image: 'clip' }, vectorStore: store });
    await b.ingest(f);
    await b.ingest(f);
    expect(embeds).toBe(1);
  });

  it('ingest drops a file that vanished before processing', async () => {
    const gone = join(tmp(), 'ghost.txt');
    await backend(fakeProvider([1, 0, 0])).ingest(gone);
    expect(await aiIndex.getState(gone)).toBeNull();
  });

  it('remove drops index_state (and chunks cascade)', async () => {
    const f = join(tmp(), 'doc.txt');
    await fs.writeFile(f, 'to be removed');
    const b = backend(fakeProvider([1, 0, 0]));
    await b.ingest(f);
    await b.remove([f]);
    expect(await aiIndex.getState(f)).toBeNull();
  });
});
