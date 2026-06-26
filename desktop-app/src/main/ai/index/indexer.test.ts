import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IndexProgress } from '@shared/types';
import type { AiProvider } from '../providers/types';
import * as aiIndex from '../../db/aiIndex';
import { countPending } from '../../db/indexJobs';
import { closeDb, db, initDb } from '../../db';
import { fileChunks } from '../../db/schema';
import { SqliteVectorStore } from '../../db/vectorStore.sqlite';
import { Indexer } from './indexer';
import { isUnder } from './ignore';

import { useTempDir } from '../../fs/fixtures';

const tmp = useTempDir();

/** A provider that embeds deterministically and can be told to fail on a marker. */
function fakeProvider(boom?: string) {
  let calls = 0;
  const provider: AiProvider = {
    id: 'fake',
    capabilities: { embed: true, generate: false, images: false },
    async status(modelId) {
      return { state: 'ready', modelId, dim: 3 };
    },
    async download() {},
    async embed(_modelId, texts) {
      calls++;
      if (boom && texts.some((t) => t.includes(boom))) throw new Error('boom');
      return texts.map((t) => Float32Array.from([t.length, 1, 0]));
    },
    async embedImages() {
      return [];
    },
  };
  return { provider, calls: () => calls };
}

/** Build an indexer over the temp dir with the given excludes + provider. */
function makeIndexer(provider: AiProvider, excludes: string[] = []) {
  let last: IndexProgress | null = null;
  let emits = 0;
  const indexer = new Indexer({
    provider: async () => provider,
    modelId: async () => 'm1',
    config: async () => ({ roots: [tmp()], excludes }),
    vectorStore: new SqliteVectorStore(),
    emit: (p) => {
      last = p;
      emits++;
    },
    // Honour only user exclusions here — the OS temp dir lives under an
    // ignored segment on Windows (AppData), which the built-in rules would
    // otherwise skip. Built-ins have their own coverage in ignore.test.ts.
    ignore: (p, ex) => ex.some((base) => isUnder(p, base)),
  });
  return { indexer, progress: () => last, emits: () => emits };
}

const write = (name: string, body: string) => fs.writeFile(join(tmp(), name), body);
const chunkCount = async () => (await db().select().from(fileChunks)).length;

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

describe('Indexer.start', () => {
  it('populates chunks and bookkeeping for a folder', async () => {
    await write('a.txt', 'hello world');
    await write('b.md', '# Title\n\nsome body text');
    await write('photo.png', 'not text'); // non-extractable, skipped

    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider);
    await indexer.start();

    expect((await aiIndex.getState(join(tmp(), 'a.txt')))?.status).toBe('indexed');
    expect((await aiIndex.getState(join(tmp(), 'b.md')))?.status).toBe('indexed');
    expect(await aiIndex.getState(join(tmp(), 'photo.png'))).toBeNull();
    expect(await chunkCount()).toBeGreaterThan(0);
    expect(indexer.status().state).toBe('idle');
  });

  it('is a no-op on re-run when nothing changed', async () => {
    await write('a.txt', 'hello world');
    const { provider, calls } = fakeProvider();
    const { indexer, progress } = makeIndexer(provider);

    await indexer.start();
    const afterFirst = calls();

    await indexer.start();
    expect(progress()?.total).toBe(0); // crawl enqueued nothing
    expect(calls()).toBe(afterFirst); // no re-embedding
  });

  it('skips a failing file without aborting the run', async () => {
    await write('good.txt', 'perfectly fine');
    await write('bad.txt', 'BOOM detonate');
    const { provider } = fakeProvider('BOOM');
    const { indexer } = makeIndexer(provider);

    await indexer.start();

    expect((await aiIndex.getState(join(tmp(), 'good.txt')))?.status).toBe('indexed');
    expect(indexer.status().errors).toBe(1);
    expect(await countPending()).toBe(0); // the bad job is marked error, not pending
  });

  it('prunes files deleted on disk', async () => {
    await write('a.txt', 'aaa');
    await write('b.txt', 'bbb');
    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider);
    await indexer.start();

    await fs.rm(join(tmp(), 'a.txt'));
    await indexer.start();

    expect(await aiIndex.getState(join(tmp(), 'a.txt'))).toBeNull();
    expect(await aiIndex.getState(join(tmp(), 'b.txt'))).not.toBeNull();
  });

  it('prunes and skips an excluded path', async () => {
    await write('keep.txt', 'keep me');
    await write('hide.txt', 'hide me');
    const { provider } = fakeProvider();

    const first = makeIndexer(provider);
    await first.indexer.start();
    expect(await aiIndex.getState(join(tmp(), 'hide.txt'))).not.toBeNull();

    const second = makeIndexer(provider, [join(tmp(), 'hide.txt')]);
    await second.indexer.start();
    expect(await aiIndex.getState(join(tmp(), 'hide.txt'))).toBeNull();
    expect(await aiIndex.getState(join(tmp(), 'keep.txt'))).not.toBeNull();
  });
});

describe('Indexer.reconcile', () => {
  it('stays silent when nothing changed (no UI churn)', async () => {
    await write('a.txt', 'hello');
    const { provider } = fakeProvider();
    const { indexer, emits } = makeIndexer(provider);
    await indexer.start();
    const afterStart = emits();

    await indexer.reconcile(); // background tick, nothing changed

    expect(emits()).toBe(afterStart); // no progress events emitted
    expect(indexer.status().state).toBe('idle');
  });

  it('picks up a newly added file', async () => {
    await write('a.txt', 'hello');
    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider);
    await indexer.start();

    await write('b.txt', 'brand new');
    await indexer.reconcile();

    expect((await aiIndex.getState(join(tmp(), 'b.txt')))?.status).toBe('indexed');
  });
});

describe('Indexer.clear', () => {
  it('empties index state, chunks, and the queue', async () => {
    await write('a.txt', 'hello');
    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider);
    await indexer.start();

    await indexer.clear();

    expect(await chunkCount()).toBe(0);
    expect(await aiIndex.getState(join(tmp(), 'a.txt'))).toBeNull();
    expect(await countPending()).toBe(0);
  });
});

describe('Indexer.start — guards', () => {
  it('fails gracefully when the model is not ready', async () => {
    await write('a.txt', 'hello');
    const { provider } = fakeProvider();
    provider.status = async (modelId) => ({ state: 'absent', modelId, dim: 3 });
    const { indexer } = makeIndexer(provider);

    await indexer.start();

    expect(indexer.status().state).toBe('error');
    expect(await chunkCount()).toBe(0);
  });
});
