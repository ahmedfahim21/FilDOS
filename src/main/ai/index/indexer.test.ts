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
import { isUnder, PHOTO_BUDGET } from './ignore';

import type { IndexState } from '@shared/types';
import { useTempDir } from '../../fs/fixtures';
import { FIRST_PASS_CHUNKS, FIRST_PASS_PAGES, INDEX_VERSION, isStale, PASS_PAGES } from './indexer';
import { MiniSearchKeywordStore } from './keywordStore';
import { AUDIO_RATE, type DecodedImage, type DecodedMedia, type Frame } from '../../media/signals';

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
  it.each([0, 1, 2])('stale on older indexVersion %i, whatever its status', (v) => {
    expect(isStale({ ...BASE, indexVersion: v }, STAT, 'm1')).toBe(true);
    expect(isStale({ ...BASE, indexVersion: v, status: 'skipped' }, STAT, 'm1')).toBe(true);
  });
  it('fresh when all fields match', () => expect(isStale(BASE, STAT, 'm1')).toBe(false));
  it('fresh even when prior status is skipped', () =>
    expect(isStale({ ...BASE, status: 'skipped' }, STAT, 'm1')).toBe(false));
});

const tmp = useTempDir();

/** A provider that embeds deterministically and can be told to fail on a marker. */
function fakeProvider(boom?: string) {
  let calls = 0;
  const seen: { texts: string[]; role?: string; titles?: string[] }[] = [];
  const media: { paths: string[]; budget?: number }[] = [];
  const decoded: string[][] = [];
  const decodedBudgets: (number | undefined)[] = [];
  const provider: AiProvider = {
    id: 'fake',
    capabilities: { embed: true, generate: false, images: false },
    async status(modelId) {
      return { state: 'ready', modelId, dim: 3 };
    },
    async download() {},
    async embed(_modelId, texts, role, titles) {
      calls++;
      seen.push({ texts, role, titles });
      if (boom && texts.some((t) => t.includes(boom))) throw new Error('boom');
      return texts.map((t) => Float32Array.from([t.length, 1, 0]));
    },
    async embedMedia(_modelId, _kind, paths, opts) {
      media.push({ paths, budget: opts?.budget });
      return paths.map(() => Float32Array.from([0, 0, 1]));
    },
    async embedDecoded(_modelId, inputs, opts) {
      decoded.push(inputs.map((i) => i.kind));
      decodedBudgets.push(opts?.budget);
      return inputs.map((i) => Float32Array.from(i.kind === 'audio' ? [0, 1, 0] : [1, 0, 0]));
    },
  };
  return { provider, calls: () => calls, seen, media, decoded, decodedBudgets };
}

/** Build an indexer over the temp dir with the given excludes + provider. */
function makeIndexer(
  provider: AiProvider,
  excludes: string[] = [],
  model = 'm1',
  countTokens?: (modelId: string, texts: string[]) => Promise<number[]>,
  excludeExtensions: string[] = [],
) {
  let last: IndexProgress | null = null;
  let emits = 0;
  const indexer = new Indexer({
    provider: async () => provider,
    model,
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

describe('Indexer — one model for text and pictures', () => {
  it('embeds text as titled passages and pictures as media, both with the one model', async () => {
    await write('a.txt', 'hello world');
    await fs.writeFile(join(tmp(), 'pic.png'), Buffer.from([1, 2, 3, 4]));
    await fs.writeFile(join(tmp(), 'Screenshot 2026-10-01 at 14.22.10.png'), Buffer.from([1, 2, 3, 4]));
    const { provider, seen, media } = fakeProvider();
    const { indexer } = makeIndexer(provider);

    await indexer.start();

    expect((await aiIndex.getState(join(tmp(), 'a.txt')))?.modelId).toBe('m1');
    expect(seen).toEqual([{ texts: ['hello world'], role: 'passage', titles: ['a.txt'] }]);
    const img = await aiIndex.getState(join(tmp(), 'pic.png'));
    expect(img).toMatchObject({ status: 'indexed', modelId: 'm1', indexVersion: INDEX_VERSION });
    // Screenshots get the larger vision budget (small text, UI detail).
    expect(media).toEqual(
      expect.arrayContaining([
        { paths: [join(tmp(), 'pic.png')], budget: 140 },
        { paths: [join(tmp(), 'Screenshot 2026-10-01 at 14.22.10.png')], budget: 280 },
      ]),
    );
    expect(media).toHaveLength(2);
  });

  it('gives pictures a keyword entry: their humanized name', async () => {
    await fs.writeFile(join(tmp(), 'beach_trip-2026.png'), Buffer.from([1, 2, 3]));
    const { provider } = fakeProvider();
    const keywordStore = new MiniSearchKeywordStore();
    const indexer = new Indexer({
      provider: async () => provider,
      model: 'm1',
      config: async () => ({ roots: [tmp()], excludes: [] }),
      vectorStore: new SqliteVectorStore(),
      keywordStore,
      emit: () => {},
      ignore: (p, ex) => ex.some((base) => isUnder(p, base)),
    });
    await indexer.start();

    const rows = await db().select().from(fileChunks);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ chunkIx: 0, text: 'beach trip 2026 png', modelId: 'm1' });
    expect(keywordStore.search('beach').map((m) => m.path)).toEqual([join(tmp(), 'beach_trip-2026.png')]);
  });
});

describe('Indexer — keyword-only content', () => {
  it('stores data files and mostly-numeric text without vectors, still keyword-searchable', async () => {
    await write('orders.csv', 'order_id,amount\nORD-48151623,1250.00\nORD-48151624,320.50');
    await write('readings.txt', Array.from({ length: 40 }, (_, i) => `${i} ${i * 3} ${i * 7}`).join('\n'));
    await write('note.txt', 'A short note about the garden and the roses in June.');
    const { provider, seen } = fakeProvider();
    const keywordStore = new MiniSearchKeywordStore();
    const indexer = new Indexer({
      provider: async () => provider,
      model: 'm1',
      config: async () => ({ roots: [tmp()], excludes: [] }),
      vectorStore: new SqliteVectorStore(),
      keywordStore,
      emit: () => {},
      ignore: (p, ex) => ex.some((base) => isUnder(p, base)),
    });
    await indexer.start();

    const rows = await db().select().from(fileChunks);
    const byName = (n: string) => rows.filter((r) => r.path === join(tmp(), n));
    expect(byName('orders.csv').every((r) => r.embedding === null)).toBe(true);
    expect(byName('readings.txt').every((r) => r.embedding === null)).toBe(true);
    expect(byName('note.txt').every((r) => r.embedding !== null)).toBe(true);
    // Only the note reached the model.
    expect(seen.flatMap((s) => s.titles)).toEqual(['note.txt']);
    expect(keywordStore.search('ORD-48151623').map((m) => m.path)).toContain(join(tmp(), 'orders.csv'));
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
      model: 'm1',
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

describe('Indexer — places and the later pass', () => {
  it('locates PDF chunks by page and reads a long PDF’s rest in the later pass', async () => {
    const { makePdf } = await import('../../../../eval/testbed/writers');
    const pages = Array.from({ length: FIRST_PASS_PAGES + PASS_PAGES + 5 }, (_, i) => `Page ${i + 1} about topic ${i + 1}.`);
    await fs.writeFile(join(tmp(), 'book.pdf'), makePdf(pages));
    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider);

    await indexer.start();

    const rows = (await db().select().from(fileChunks)).sort((a, b) => a.chunkIx - b.chunkIx);
    expect(rows.map((r) => r.loc)).toEqual(pages.map((_, i) => i + 1));
    expect(rows.every((r) => r.kind === 'page')).toBe(true);
    expect(rows.map((r) => r.chunkIx)).toEqual(pages.map((_, i) => i));
    // First pass: the first FIRST_PASS_PAGES; the later pass appended the rest.
    expect(rows.filter((r) => r.pass === 1).map((r) => r.loc)).toEqual(pages.slice(0, FIRST_PASS_PAGES).map((_, i) => i + 1));
    expect(rows.filter((r) => r.pass === 2)).toHaveLength(pages.length - FIRST_PASS_PAGES);
    expect(rows.find((r) => r.loc === pages.length)?.text).toBe(`Page ${pages.length} about topic ${pages.length}.`);
    expect(await aiIndex.getState(join(tmp(), 'book.pdf'))).toMatchObject({ status: 'indexed', info: null });
  });

  it('reads a long document’s first passages first and appends the rest', async () => {
    const paragraph = (i: number) => `Paragraph ${i}. ${'word '.repeat(380)}`;
    await write('long.txt', Array.from({ length: FIRST_PASS_CHUNKS + 10 }, (_, i) => paragraph(i)).join('\n'));
    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider);

    await indexer.start();

    const rows = (await db().select().from(fileChunks)).sort((a, b) => a.chunkIx - b.chunkIx);
    expect(rows.length).toBeGreaterThan(FIRST_PASS_CHUNKS);
    expect(rows.map((r) => r.chunkIx)).toEqual(rows.map((_, i) => i));
    expect(rows.filter((r) => r.pass === 1)).toHaveLength(FIRST_PASS_CHUNKS);
    expect(rows.every((r) => r.kind === 'text' && r.loc === null)).toBe(true);
    expect(await aiIndex.getState(join(tmp(), 'long.txt'))).toMatchObject({ status: 'indexed', info: null });
  });

  it('indexes an unreadable PDF by name, as skipped', async () => {
    await write('Broken_Report.pdf', 'not a pdf');
    const { provider } = fakeProvider();
    const { indexer } = makeIndexer(provider);
    await indexer.start();
    const rows = await db().select().from(fileChunks);
    expect(rows.map((r) => [r.kind, r.text])).toEqual([['name', 'Broken Report pdf']]);
    expect((await aiIndex.getState(join(tmp(), 'Broken_Report.pdf')))?.status).toBe('skipped');
  });
});

describe('Indexer — audio and video', () => {
  const frame = (t: number, gray: number): Frame => ({
    t,
    width: 8,
    height: 8,
    rgba: new Uint8Array(256).map((_, i) => (i % 4 === 3 ? 255 : gray)),
  });

  function mediaIndexer(provider: AiProvider, decode: (path: string) => Promise<DecodedMedia>) {
    const keywordStore = new MiniSearchKeywordStore();
    const indexer = new Indexer({
      provider: async () => provider,
      model: 'm1',
      config: async () => ({ roots: [tmp()], excludes: [] }),
      vectorStore: new SqliteVectorStore(),
      keywordStore,
      emit: () => {},
      ignore: (p, ex) => ex.some((base) => isUnder(p, base)),
      decodeMedia: decode,
    });
    return { indexer, keywordStore };
  }

  it('embeds a video’s distinct shots and its sound windows, each at its moment', async () => {
    await fs.writeFile(join(tmp(), 'Trip_to_Lisbon.mp4'), 'video bytes');
    const { provider, decoded } = fakeProvider();
    const { indexer, keywordStore } = mediaIndexer(provider, async () => ({
      duration: 70,
      // 3 and 6 look alike: one shot.
      frames: [frame(0.5, 10), frame(3.5, 11), frame(6.5, 200)],
      audio: new Float32Array(70 * AUDIO_RATE),
    }));

    await indexer.start();

    const rows = (await db().select().from(fileChunks)).sort((a, b) => a.chunkIx - b.chunkIx);
    expect(rows.map((r) => [r.kind, r.loc, r.locEnd, r.embedding === null])).toEqual([
      ['name', null, null, true],
      ['frame', 0.5, 0.5, false],
      ['frame', 6.5, 6.5, false],
      ['audio', 0, 30, false],
      ['audio', 25, 55, false],
      ['audio', 50, 70, false],
    ]);
    expect(rows[0].text).toBe('Trip to Lisbon mp4');
    expect(decoded).toEqual([['frame', 'frame'], ['audio', 'audio', 'audio']]);
    expect(await aiIndex.getState(join(tmp(), 'Trip_to_Lisbon.mp4'))).toMatchObject({ status: 'indexed', modelId: 'm1' });
    // Keyword search finds it by name; moments have no text to match.
    expect(keywordStore.search('lisbon').map((m) => [m.path, m.chunkIx])).toEqual([[join(tmp(), 'Trip_to_Lisbon.mp4'), 0]]);
  });

  it('keeps a recording with nothing decodable findable by name, as skipped', async () => {
    await fs.writeFile(join(tmp(), 'empty.mp3'), 'x');
    const { provider, decoded } = fakeProvider();
    const { indexer } = mediaIndexer(provider, async () => ({ duration: 0, frames: [], audio: null }));
    await indexer.start();
    expect((await db().select().from(fileChunks)).map((r) => r.kind)).toEqual(['name']);
    expect(decoded).toEqual([]);
    expect((await aiIndex.getState(join(tmp(), 'empty.mp3')))?.status).toBe('skipped');
  });

  it('marks the file errored when decoding fails, and leaves media alone without a decoder', async () => {
    await fs.writeFile(join(tmp(), 'broken.mp4'), 'x');
    const { provider } = fakeProvider();
    const { indexer } = mediaIndexer(provider, async () => {
      throw new Error('Unreadable media');
    });
    await indexer.start();
    expect(await aiIndex.getState(join(tmp(), 'broken.mp4'))).toBeNull();
    expect(indexer.status().errors).toBe(1);

    // No decoder (e.g. a host without Chromium): media isn't indexable at all.
    const plain = makeIndexer(fakeProvider().provider);
    await plain.indexer.start();
    expect(plain.progress()?.errors ?? 0).toBe(0);
  });
});

describe('Indexer — pictures only the OS decodes (HEIC)', () => {
  function heicIndexer(provider: AiProvider, decodeImage?: (path: string) => Promise<DecodedImage>) {
    return new Indexer({
      provider: async () => provider,
      model: 'm1',
      config: async () => ({ roots: [tmp()], excludes: [] }),
      vectorStore: new SqliteVectorStore(),
      emit: () => {},
      ignore: (p, ex) => ex.some((base) => isUnder(p, base)),
      decodeImage,
    });
  }

  it('embeds the OS-decoded pixels at the photo budget, never through the path reader', async () => {
    await fs.writeFile(join(tmp(), 'IMG_6921.HEIC'), 'heic bytes');
    const { provider, media, decoded, decodedBudgets } = fakeProvider();
    const asked: string[] = [];
    const indexer = heicIndexer(provider, async (path) => {
      asked.push(path);
      return { width: 4, height: 3, rgba: new Uint8Array(48) };
    });

    await indexer.start();

    expect(asked).toEqual([join(tmp(), 'IMG_6921.HEIC')]);
    expect(media).toEqual([]);
    expect(decoded).toEqual([['frame']]);
    expect(decodedBudgets).toEqual([PHOTO_BUDGET]);
    const rows = await db().select().from(fileChunks);
    expect(rows.map((r) => [r.chunkIx, r.kind, r.text, r.embedding === null])).toEqual([[0, 'image', 'IMG 6921 HEIC', false]]);
    expect(await aiIndex.getState(join(tmp(), 'IMG_6921.HEIC'))).toMatchObject({ status: 'indexed', modelId: 'm1' });
  });

  it('keeps it by name, as skipped, where nothing can decode it', async () => {
    await fs.writeFile(join(tmp(), 'Beach.heif'), 'heif bytes');
    const { provider, media, decoded } = fakeProvider();
    await heicIndexer(provider).start();
    expect(media).toEqual([]);
    expect(decoded).toEqual([]);
    const rows = await db().select().from(fileChunks);
    expect(rows.map((r) => [r.chunkIx, r.kind, r.text, r.embedding])).toEqual([[0, 'name', 'Beach heif', null]]);
    expect((await aiIndex.getState(join(tmp(), 'Beach.heif')))?.status).toBe('skipped');
  });

  it('marks it errored when the OS fails to decode it', async () => {
    await fs.writeFile(join(tmp(), 'bad.heic'), 'x');
    const indexer = heicIndexer(fakeProvider().provider, async () => {
      throw new Error('The system could not decode this picture.');
    });
    await indexer.start();
    expect(await aiIndex.getState(join(tmp(), 'bad.heic'))).toBeNull();
    expect(indexer.status().errors).toBe(1);
  });

  it('still reads ordinary pictures by path', async () => {
    await fs.writeFile(join(tmp(), 'cat.jpg'), 'jpg bytes');
    const { provider, media, decoded } = fakeProvider();
    await heicIndexer(provider, async () => {
      throw new Error('should not be called');
    }).start();
    expect(media).toEqual([{ paths: [join(tmp(), 'cat.jpg')], budget: PHOTO_BUDGET }]);
    expect(decoded).toEqual([]);
  });
});

