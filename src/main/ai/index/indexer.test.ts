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

import type { IndexState } from '@shared/types';
import { useTempDir } from '../../fs/fixtures';
import { INDEX_VERSION, isStale } from './indexer';

// ---------------------------------------------------------------------------
// isStale — truth table
// ---------------------------------------------------------------------------

const STAT = { mtimeMs: 1000, size: 512 };
const BASE: IndexState = {
  path: '/f',
  mtime: 1000,
  size: 512,
  contentHash: null,
  modelId: 'm1',
  indexVersion: INDEX_VERSION,
  indexedAt: 0,
  status: 'indexed',
};

describe('isStale', () => {
  it('stale when no prior state', () => expect(isStale(null, STAT, 'm1')).toBe(true));
  it('stale when prior state is undefined', () => expect(isStale(undefined, STAT, 'm1')).toBe(true));
  it('stale when prior status is error', () =>
    expect(isStale({ ...BASE, status: 'error' }, STAT, 'm1')).toBe(true));
  it('stale when mtime changed', () =>
    expect(isStale(BASE, { mtimeMs: 9999, size: 512 }, 'm1')).toBe(true));
  it('stale when size changed', () =>
    expect(isStale(BASE, { mtimeMs: 1000, size: 9999 }, 'm1')).toBe(true));
  it('stale when modelId changed', () => expect(isStale(BASE, STAT, 'm2')).toBe(true));
  it('fresh on v1 rows with content chunks (v2 only changed skipped files)', () =>
    expect(isStale({ ...BASE, indexVersion: 1 }, STAT, 'm1')).toBe(false));
  it('stale on v1 rows that were skipped (they gain a filename chunk in v2)', () =>
    expect(isStale({ ...BASE, indexVersion: 1, status: 'skipped' }, STAT, 'm1')).toBe(true));
  it('stale on any older indexVersion', () =>
    expect(isStale({ ...BASE, indexVersion: 0 }, STAT, 'm1')).toBe(true));
  it('fresh when all fields match', () => expect(isStale(BASE, STAT, 'm1')).toBe(false));
  it('fresh even when prior status is skipped', () =>
    expect(isStale({ ...BASE, status: 'skipped' }, STAT, 'm1')).toBe(false));
});

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
    async embedImages(_modelId, paths) {
      return paths.map(() => Float32Array.from([0, 0, 1]));
    },
  };
  return { provider, calls: () => calls };
}

/** Build an indexer over the temp dir with the given excludes + provider. */
function makeIndexer(
  provider: AiProvider,
  excludes: string[] = [],
  textModel = 'm1',
  countTokens?: (modelId: string, texts: string[]) => Promise<number[]>,
  excludeExtensions: string[] = [],
) {
  let last: IndexProgress | null = null;
  let emits = 0;
  const indexer = new Indexer({
    provider: async () => provider,
    textModel,
    imageModel: 'clip',
    config: async () => ({ roots: [tmp()], excludes, excludeExtensions }),
    vectorStore: new SqliteVectorStore(),
    emit: (p) => {
      last = p;
      emits++;
    },
    countTokens,
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
    await write('movie.mp4', 'not indexable'); // not text, not an image — skipped

    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider);
    await indexer.start();

    expect((await aiIndex.getState(join(tmp(), 'a.txt')))?.status).toBe('indexed');
    expect((await aiIndex.getState(join(tmp(), 'b.md')))?.status).toBe('indexed');
    expect(await aiIndex.getState(join(tmp(), 'movie.mp4'))).toBeNull();
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

describe('Indexer — multimodal routing', () => {
  it('indexes text and image files with their respective models', async () => {
    await write('a.txt', 'hello world');
    await fs.writeFile(join(tmp(), 'pic.png'), Buffer.from([1, 2, 3, 4]));
    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider); // textModel 'm1', imageModel 'clip'

    await indexer.start();

    expect((await aiIndex.getState(join(tmp(), 'a.txt')))?.modelId).toBe('m1');
    const img = await aiIndex.getState(join(tmp(), 'pic.png'));
    expect(img?.status).toBe('indexed');
    expect(img?.modelId).toBe('clip'); // routed to the image model
  });

  it('falls back to a filename chunk when an image cannot be decoded (HEIC)', async () => {
    // iPhone HEIC: sharp's libvips ships without the HEVC codec, so decode
    // always throws. The file must not error-loop — it gets a name chunk.
    await fs.writeFile(join(tmp(), 'IMG_6921.HEIC'), Buffer.from([0, 1, 2, 3]));
    const { provider } = fakeProvider();
    const textEmbeds: [string, string][] = [];
    provider.embedImages = async () => {
      throw new Error('heif: Error while loading plugin: bad seek');
    };
    const baseEmbed = provider.embed.bind(provider);
    provider.embed = async (modelId, texts, role) => {
      texts.forEach((t) => textEmbeds.push([modelId, t]));
      return baseEmbed(modelId, texts, role);
    };
    const { indexer, progress } = makeIndexer(provider);

    await indexer.start();

    const path = join(tmp(), 'IMG_6921.HEIC');
    const state = await aiIndex.getState(path);
    expect(state?.status).toBe('skipped'); // bookkept, not error-looped
    expect(progress()?.errors).toBe(0);
    // The filename went through the CLIP text encoder (same vector space).
    expect(textEmbeds).toContainEqual(['clip', 'IMG 6921 HEIC']);
    expect((await db().select().from(fileChunks)).some((c) => c.path === path)).toBe(true);

    // Unchanged file: the next crawl leaves it alone instead of retrying.
    textEmbeds.length = 0;
    await indexer.start();
    expect(textEmbeds).toHaveLength(0);
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

describe('Indexer — token-aware chunking', () => {
  it('produces more chunks for dense content when countTokens reports small chars/token', async () => {
    // Write a file large enough to span multiple windows even under the narrow window.
    // WINDOW default is 2048 chars. Simulate 2 chars/token → safe window ~870 chars.
    const bigText = 'x'.repeat(4000);
    await write('dense.ts', bigText);

    const { provider } = fakeProvider();

    // Baseline: no countTokens → char-approx → one or two chunks for 4000 chars
    const { indexer: base } = makeIndexer(provider);
    await base.start();
    const baseChunkCount = await chunkCount();

    await base.clear();

    // With countTokens reporting 2 chars/token (dense code), window narrows to ~870 chars
    // → should produce more chunks for the same 4000-char file.
    const denseCountTokens = async (_modelId: string, texts: string[]) =>
      texts.map((t) => Math.ceil(t.length / 2)); // 2 chars = 1 token
    const { indexer: dense } = makeIndexer(provider, [], 'm1', denseCountTokens);
    await dense.start();
    const denseCount = await chunkCount();

    expect(denseCount).toBeGreaterThan(baseChunkCount);
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
  it('fails gracefully when no provider is configured', async () => {
    await write('a.txt', 'hello');
    const seen: IndexProgress[] = [];
    const indexer = new Indexer({
      provider: async () => null,
      textModel: 'm1',
      imageModel: 'clip',
      config: async () => ({ roots: [tmp()], excludes: [] }),
      vectorStore: new SqliteVectorStore(),
      emit: (p) => seen.push(p),
    });

    await indexer.start();

    expect(seen.at(-1)?.state).toBe('error');
    expect(await chunkCount()).toBe(0);
  });
});

describe('Indexer — filename fallback', () => {
  it('indexes the humanized filename when a document’s content can’t be extracted', async () => {
    // Garbage bytes with a .pdf extension: extractText yields null (parse fails).
    await write('Modern_Angular_Also_covers_signals.pdf', 'not really a pdf');

    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider);
    await indexer.start();

    const path = join(tmp(), 'Modern_Angular_Also_covers_signals.pdf');
    expect((await aiIndex.getState(path))?.status).toBe('skipped');
    const mine = (await db().select().from(fileChunks)).filter((c) => c.path === path);
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toBe('Modern Angular Also covers signals pdf');
  });
});

describe('Indexer — codebases', () => {
  it('indexes only documentation inside a detected code project', async () => {
    await fs.mkdir(join(tmp(), 'proj', 'src'), { recursive: true });
    await fs.writeFile(join(tmp(), 'proj', 'package.json'), '{}');
    await fs.writeFile(join(tmp(), 'proj', 'README.md'), '# readme with context');
    await fs.writeFile(join(tmp(), 'proj', 'src', 'main.ts'), 'export const x = 1;');
    await fs.writeFile(join(tmp(), 'proj', 'src', 'notes.md'), '# design notes');
    await write('loose.ts', 'export const y = 2;'); // not inside a codebase

    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider);
    await indexer.start();

    expect((await aiIndex.getState(join(tmp(), 'proj', 'README.md')))?.status).toBe('indexed');
    expect((await aiIndex.getState(join(tmp(), 'proj', 'src', 'notes.md')))?.status).toBe('indexed');
    expect(await aiIndex.getState(join(tmp(), 'proj', 'src', 'main.ts'))).toBeNull();
    expect((await aiIndex.getState(join(tmp(), 'loose.ts')))?.status).toBe('indexed');
  });

  it('prunes already-indexed code files when a project marker appears', async () => {
    await fs.mkdir(join(tmp(), 'proj'), { recursive: true });
    const code = join(tmp(), 'proj', 'main.ts');
    await fs.writeFile(code, 'export const x = 1;');

    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider);
    await indexer.start();
    expect((await aiIndex.getState(code))?.status).toBe('indexed');

    await fs.writeFile(join(tmp(), 'proj', 'package.json'), '{}');
    await indexer.start();
    expect(await aiIndex.getState(code)).toBeNull();
  });

  it('never descends into build output inside a codebase', async () => {
    await fs.mkdir(join(tmp(), 'proj', 'out'), { recursive: true });
    await fs.writeFile(join(tmp(), 'proj', 'package.json'), '{}');
    await fs.writeFile(join(tmp(), 'proj', 'README.md'), '# real docs');
    await fs.writeFile(join(tmp(), 'proj', 'out', 'README.md'), '# bundled copy');

    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider);
    await indexer.start();

    expect((await aiIndex.getState(join(tmp(), 'proj', 'README.md')))?.status).toBe('indexed');
    expect(await aiIndex.getState(join(tmp(), 'proj', 'out', 'README.md'))).toBeNull();
  });

  it('does not treat the crawl root itself as a codebase', async () => {
    await write('package.json', '{}'); // stray marker at the root
    await write('script.ts', 'export const z = 3;');

    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider);
    await indexer.start();

    expect((await aiIndex.getState(join(tmp(), 'script.ts')))?.status).toBe('indexed');
  });
});

describe('Indexer — excluded extensions', () => {
  it('skips excluded types during the crawl', async () => {
    await write('keep.md', 'hello docs');
    await write('skip.txt', 'hello text');

    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider, [], 'm1', undefined, ['txt']);
    await indexer.start();

    expect((await aiIndex.getState(join(tmp(), 'keep.md')))?.status).toBe('indexed');
    expect(await aiIndex.getState(join(tmp(), 'skip.txt'))).toBeNull();
  });

  it('prunes already-indexed files once their type is excluded', async () => {
    await write('a.txt', 'hello');
    const { provider } = fakeProvider();
    const { indexer: first } = makeIndexer(provider);
    await first.start();
    expect((await aiIndex.getState(join(tmp(), 'a.txt')))?.status).toBe('indexed');

    const { indexer: second } = makeIndexer(provider, [], 'm1', undefined, ['txt']);
    await second.start();
    expect(await aiIndex.getState(join(tmp(), 'a.txt'))).toBeNull();
  });
});
