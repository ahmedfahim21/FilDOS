import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChunkKind, IndexState } from '@shared/types';
import { EMBED_MODEL_ID, getModelDef } from '@shared/aiModels';
import type { AiProvider } from '../providers/types';
import * as aiIndex from '../../db/aiIndex';
import { closeDb, initDb } from '../../db';
import { SqliteVectorStore } from '../../db/vectorStore.sqlite';
import { useTempDir } from '../../fs/fixtures';
import { MiniSearchKeywordStore } from './keywordStore';
import type { ScoredChunk } from './vectorStore';
import { markedSnippet, semanticSearch, similarByFile, STRONG_RATIO, Z_GATE, zScores } from './search';

const tmp = useTempDir();
let store: SqliteVectorStore;
let keywords: MiniSearchKeywordStore;

/** Roles the fake was asked to embed with, for asserting the task prefix choice. */
const roles: (string | undefined)[] = [];

/** A provider that embeds any query to a fixed vector (the test controls ranking). */
function fakeProvider(queryVec: number[]): AiProvider {
  return {
    id: 'fake',
    capabilities: { embed: true, generate: false, images: false },
    async status(modelId) {
      return { state: 'ready', modelId, dim: queryVec.length };
    },
    async download() {},
    async embed(_m, _texts, role) {
      roles.push(role);
      return [Float32Array.from(queryVec)];
    },
    async embedMedia() {
      return [Float32Array.from(queryVec)];
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

/** A unit vector at `angle` radians from the x axis, in the xy plane. */
const at = (angle: number) => [Math.cos(angle), Math.sin(angle), 0];

/** Write a real file and index it with chunks (vectors, kinds, places, words). */
async function indexFile(
  name: string,
  chunks: { vec: number[] | null; text: string; kind?: ChunkKind; loc?: number; pass?: number }[],
): Promise<string> {
  const path = join(tmp(), name);
  await fs.writeFile(path, chunks.map((c) => c.text).join('\n'));
  await aiIndex.upsertState(state(path));
  await store.upsert(
    path,
    chunks.map((c, i) => ({
      chunkIx: i,
      text: c.text,
      embedding: c.vec ? Float32Array.from(c.vec) : null,
      modelId: 'm1',
      kind: c.kind ?? 'text',
      loc: c.loc ?? null,
      locEnd: c.loc ?? null,
      pass: c.pass ?? 1,
    })),
  );
  keywords.upsert(path, chunks.map((c, i) => ({ chunkIx: i, text: c.text })));
  return path;
}

/** Thirty unrelated files spread around the circle, so a query has a real score distribution. */
async function filler(): Promise<void> {
  for (let i = 0; i < 30; i++) await indexFile(`filler-${i}.txt`, [{ vec: at(1.2 + (i / 30) * 1.9), text: `filler note ${i}` }]);
}

beforeEach(() => {
  initDb(':memory:');
  store = new SqliteVectorStore();
  keywords = new MiniSearchKeywordStore();
  roles.length = 0;
});
afterEach(() => closeDb());

describe('zScores', () => {
  const chunk = (score: number, kind: ChunkKind = 'text', pass = 1): ScoredChunk => ({ path: '/x', chunkIx: 0, score, kind, pass });

  it('puts each chunk on the query’s own scale', () => {
    const z = zScores([chunk(0.5), chunk(0.5), chunk(0.5), chunk(0.9)]);
    expect(z[3]).toBeGreaterThan(z[0]);
    expect(z.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 6);
  });

  it('centres pictures and text on their own means once each has enough vectors', () => {
    const text = Array.from({ length: 20 }, () => chunk(0.6));
    const images = Array.from({ length: 20 }, () => chunk(0.4, 'image'));
    const z = zScores([...text, ...images, chunk(0.7), chunk(0.5, 'image')]);
    // Both sit 0.1 above their modality's mean, so they stand out equally.
    expect(z.at(-1)).toBeCloseTo(z.at(-2)!, 1);
  });

  it('scores later-pass chunks without letting them set the scale', () => {
    const base = [chunk(0.5), chunk(0.52), chunk(0.48), chunk(0.5)];
    const withLater = zScores([...base, ...Array.from({ length: 100 }, () => chunk(0.1, 'page', 2)), chunk(0.9, 'page', 2)]);
    const alone = zScores([...base, chunk(0.9, 'page', 2)]);
    expect(withLater.at(-1)).toBeCloseTo(alone.at(-1)!, 6);
  });
});

describe('markedSnippet', () => {
  it('marks query words where they matched, centring on the first', () => {
    expect(markedSnippet('Rest the dough, then bake at 250°C until brown.', ['bake'])).toBe(
      'Rest the dough, then «bake» at 250°C until brown.',
    );
  });

  it('marks words that start with a term (stemmed endings) and leaves others alone', () => {
    expect(markedSnippet('Invoices and invoiced totals; no voice here.', ['invoice'])).toBe(
      '«Invoices» and «invoiced» totals; no voice here.',
    );
  });

  it('elides long text around the match', () => {
    const text = `${'x '.repeat(200)}the needle is here ${'y '.repeat(200)}`;
    const out = markedSnippet(text, ['needle'], 60);
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toContain('«needle»');
  });

  it('is plain when there are no terms', () => {
    expect(markedSnippet('  a\n b  ', [])).toBe('a b');
  });
});

describe('semanticSearch — meaning gate', () => {
  it('finds the file that stands out and points at its matching chunk', async () => {
    await filler();
    const target = await indexFile('notes.txt', [
      { vec: at(1.5), text: 'shopping list' },
      { vec: at(0.02), text: 'vessels at sea and harbour ships' },
    ]);

    const { hits, strong } = await semanticSearch(fakeProvider(at(0)), 'm1', store, 'ships in the harbour');

    expect(hits[0].path).toBe(target);
    expect(hits[0]).toMatchObject({ name: 'notes.txt', segment: 'text', loc: null, passage: 'vessels at sea and harbour ships' });
    expect(hits[0].score).toBeGreaterThan(0);
    expect(hits[0].score).toBeLessThan(1);
    expect(strong).toBeGreaterThanOrEqual(1);
    expect(roles).toEqual(['query']);
  });

  it('finds nothing when nothing stands out', async () => {
    // Every file is equally (un)related: no z-score clears the gate.
    for (let i = 0; i < 20; i++) await indexFile(`same-${i}.txt`, [{ vec: at(1), text: 'same' }]);
    const { hits, strong } = await semanticSearch(fakeProvider(at(0)), 'm1', store, 'quantum chromodynamics');
    expect(hits).toEqual([]);
    expect(strong).toBe(0);
  });

  it('needs the model’s minimum cosine as well as standing out', async () => {
    // Only EmbeddingGemma has a floor; build a distribution whose best is far below it.
    const floor = getModelDef(EMBED_MODEL_ID)!.minMatch!;
    const path = join(tmp(), 'weak.txt');
    await fs.writeFile(path, 'weak');
    await aiIndex.upsertState({ ...state(path), modelId: EMBED_MODEL_ID });
    const lowAngle = Math.acos(floor - 0.2);
    await store.upsert(path, [{ chunkIx: 0, text: 'weak', embedding: Float32Array.from(at(lowAngle)), modelId: EMBED_MODEL_ID, kind: 'text' }]);
    for (let i = 0; i < 20; i++) {
      const p = join(tmp(), `far-${i}.txt`);
      await fs.writeFile(p, 'far');
      await aiIndex.upsertState({ ...state(p), modelId: EMBED_MODEL_ID });
      await store.upsert(p, [{ chunkIx: 0, text: 'far', embedding: Float32Array.from(at(Math.PI / 2 + i * 0.01)), modelId: EMBED_MODEL_ID, kind: 'text' }]);
    }
    expect((await semanticSearch(fakeProvider(at(0)), EMBED_MODEL_ID, store, 'anything')).hits).toEqual([]);
  });

  it('reports the PDF page a hit points at', async () => {
    await filler();
    const book = await indexFile('guide.pdf', [
      { vec: at(1.4), text: 'owls', kind: 'page', loc: 5 },
      { vec: at(0.01), text: 'kingfishers dive from low branches', kind: 'page', loc: 120, pass: 2 },
    ]);
    const { hits } = await semanticSearch(fakeProvider(at(0)), 'm1', store, 'kingfisher diving');
    expect(hits[0]).toMatchObject({ path: book, segment: 'page', loc: 120, locEnd: 120 });
  });

  it('scopes results to rootPath, keeping the whole index’s scale', async () => {
    await filler();
    await fs.mkdir(join(tmp(), 'docs'));
    const inDocs = await indexFile(join('docs', 'a.txt'), [{ vec: at(0), text: 'in docs' }]);
    await indexFile('b.txt', [{ vec: at(0), text: 'outside' }]);
    const { hits } = await semanticSearch(fakeProvider(at(0)), 'm1', store, 'q', { rootPath: join(tmp(), 'docs') });
    expect(hits.map((h) => h.path)).toEqual([inDocs]);
  });

  it('returns nothing for a blank query without embedding it', async () => {
    expect(await semanticSearch(fakeProvider(at(0)), 'm1', store, '   ')).toEqual({ hits: [], strong: 0 });
    expect(roles).toEqual([]);
  });

  it('ignores chunks embedded by a different model', async () => {
    const a = join(tmp(), 'a.txt');
    await fs.writeFile(a, 'alpha');
    await aiIndex.upsertState(state(a));
    await store.upsert(a, [{ chunkIx: 0, text: 'alpha', embedding: Float32Array.from(at(0)), modelId: 'OTHER', kind: 'text' }]);
    expect((await semanticSearch(fakeProvider(at(0)), 'm1', store, 'q')).hits).toEqual([]);
  });

  it('prunes and omits files deleted on disk', async () => {
    await filler();
    const gone = await indexFile('gone.txt', [{ vec: at(0), text: 'alpha' }]);
    await fs.rm(gone);
    const { hits } = await semanticSearch(fakeProvider(at(0)), 'm1', store, 'q');
    expect(hits.map((h) => h.path)).not.toContain(gone);
    expect(await aiIndex.getState(gone)).toBeNull();
  });

  it('embeds chat questions with the question prefix', async () => {
    await semanticSearch(fakeProvider(at(0)), 'm1', store, 'when is it due?', { role: 'question' });
    expect(roles).toEqual(['question']);
  });
});

describe('semanticSearch — words', () => {
  it('qualifies a file on words alone when it holds most of the query’s terms', async () => {
    await filler();
    // Far from the query in meaning, but it contains both terms.
    const doc = await indexFile('orders.csv', [{ vec: null, text: 'order_id amount ORD-48151623 1250.00' }]);
    const { hits } = await semanticSearch(fakeProvider(at(0)), 'm1', store, 'ORD-48151623', { keywordStore: keywords });
    expect(hits.map((h) => h.path)).toEqual([doc]);
    expect(hits[0].snippet).toContain('«ORD»-«48151623»');
  });

  it('treats a code query as a lookup: no meaning-only matches', async () => {
    await filler();
    await indexFile('close.txt', [{ vec: at(0), text: 'nothing about it' }]);
    const { hits } = await semanticSearch(fakeProvider(at(0)), 'm1', store, 'XQZ-99817734', { keywordStore: keywords });
    expect(hits).toEqual([]);
  });

  it('matches a term that is in no file as typed as a word start', async () => {
    await filler();
    const doc = await indexFile('ideas.txt', [{ vec: at(2), text: 'notes on grokipedia' }]);
    const { hits } = await semanticSearch(fakeProvider(at(0)), 'm1', store, 'grok', { keywordStore: keywords });
    expect(hits.map((h) => h.path)).toContain(doc);
  });

  it('boosts the file kind the query names', async () => {
    await filler();
    const note = await indexFile('invoice-note.txt', [{ vec: at(0.02), text: 'invoice table' }]);
    const shot = await indexFile('Screenshot 2026-10-01 at 14.22.10.png', [{ vec: at(0.03), text: 'Screenshot', kind: 'image' }]);
    const { hits } = await semanticSearch(fakeProvider(at(0)), 'm1', store, 'screenshot of an invoice table');
    expect(hits[0].path).toBe(shot);
    expect(hits[0].segment).toBe('image');
    expect(hits[0].snippet).toBe('');
    expect(hits.map((h) => h.path)).toContain(note);
  });

  it('only marks words from the chunk the hit points at', async () => {
    await filler();
    await indexFile('mixed.txt', [
      { vec: at(0.01), text: 'the meaning matches here' },
      { vec: at(1.5), text: 'zebra crossing' },
    ]);
    const { hits } = await semanticSearch(fakeProvider(at(0)), 'm1', store, 'zebra', { keywordStore: keywords });
    // Meaning points at chunk 0; the word matched chunk 1 — so no marks.
    expect(hits[0].passage).toBe('the meaning matches here');
    expect(hits[0].snippet).not.toContain('«');
  });

  it('counts hits under STRONG_RATIO of the top as weaker matches', async () => {
    await filler();
    const best = await indexFile('best.txt', [{ vec: at(0), text: 'ships in the harbour' }]);
    // Half the terms, nothing in meaning: it qualifies, but trails far behind.
    const weak = await indexFile('weak.txt', [{ vec: at(2.5), text: 'harbour fees' }]);
    const { hits, strong } = await semanticSearch(fakeProvider(at(0)), 'm1', store, 'harbour ships', { keywordStore: keywords });
    expect(hits.map((h) => h.path)).toEqual([best, weak]);
    expect(strong).toBe(1);
    expect(hits.length).toBeGreaterThan(strong);
    const top = hits[0].score;
    expect(hits.slice(0, strong).every((h) => h.score >= top * STRONG_RATIO)).toBe(true);
    expect(Z_GATE).toBe(2);
  });
});

describe('similarByFile', () => {
  it('ranks files by similarity to a text probe and excludes the probe itself', async () => {
    const probe = await indexFile('probe.txt', [{ vec: at(0), text: 'the probe document' }]);
    const near = await indexFile('near.txt', [{ vec: at(0.1), text: 'a very similar document' }]);
    await indexFile('far.txt', [{ vec: at(1.5), text: 'something unrelated' }]);

    const hits = await similarByFile(fakeProvider(at(0)), 'm1', store, probe);

    expect(hits.map((h) => h.path)).not.toContain(probe);
    expect(hits[0].path).toBe(near);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it('rejects file types it cannot read', async () => {
    const bin = join(tmp(), 'movie.mp4');
    await fs.writeFile(bin, 'not really a movie');
    await expect(similarByFile(fakeProvider(at(0)), 'm1', store, bin)).rejects.toMatchObject({ code: 'EUNSUPPORTED' });
  });

  it('embeds picture probes as media and matches any file in the shared space', async () => {
    const probeImg = join(tmp(), 'photo.png');
    await fs.writeFile(probeImg, 'png-bytes');
    const otherImg = await indexFile('other.png', [{ vec: at(0), text: 'other png', kind: 'image' }]);
    const note = await indexFile('a.txt', [{ vec: at(0.1), text: 'a note about the same scene' }]);

    let budget: number | undefined;
    const provider: AiProvider = {
      ...fakeProvider(at(0)),
      async embedMedia(_m, kind, paths, opts) {
        expect(kind).toBe('image');
        expect(paths).toEqual([probeImg]);
        budget = opts?.budget;
        return [Float32Array.from(at(0))];
      },
    };
    const hits = await similarByFile(provider, 'm1', store, probeImg);

    expect(hits.map((h) => h.path)).toEqual([otherImg, note]);
    expect(hits[0].segment).toBe('image');
    expect(budget).toBe(140);
  });
});
