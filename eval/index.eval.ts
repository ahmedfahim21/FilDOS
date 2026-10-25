/**
 * Index eval: a fresh index of the testbed, checked against `EXPECT`.
 *
 *  - rules: nothing under a `skip` path was read (secrets, caches, datasets,
 *    codebase source), and every `index` path is searchable
 *  - extraction: each document's chunks contain a known phrase from it
 *  - structure: PDFs keep their pages (chunks carry a page location), the
 *    tail of a long book is indexed, mostly-numeric text has no vector
 *  - cost: wall time, seconds spent in the model per kind, chunk and
 *    vector counts, index size — the inputs for indexing estimates
 */
import { afterAll, beforeAll, describe, it } from 'vitest';
import { rawDb } from '../src/main/db';
import type { DecodedInput } from '@shared/types';
import type { AiProvider } from '../src/main/ai/providers/types';
import { closeTestbed, indexTestbed, type Indexed } from './lib/harness';
import { pct, table, writeResults } from './lib/report';
import { DOCX_FILES, EXPECT, PDF_FILES, TEXT_FILES } from './testbed/manifest';

interface Timing {
  calls: number;
  seconds: number;
  units: number;
}

const timings: Record<'text' | 'image' | 'frame' | 'audio', Timing> = {
  text: { calls: 0, seconds: 0, units: 0 },
  image: { calls: 0, seconds: 0, units: 0 },
  frame: { calls: 0, seconds: 0, units: 0 },
  audio: { calls: 0, seconds: 0, units: 0 },
};

/** Wrap the provider so every model call is timed by kind. */
function timed(p: AiProvider): AiProvider {
  const time = async <T>(kind: keyof typeof timings, units: number, run: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    try {
      return await run();
    } finally {
      timings[kind].calls += 1;
      timings[kind].units += units;
      timings[kind].seconds += (performance.now() - started) / 1000;
    }
  };
  return Object.assign(Object.create(Object.getPrototypeOf(p)) as AiProvider, p, {
    embed: (modelId: string, texts: string[], role?: Parameters<AiProvider['embed']>[2], titles?: string[]) =>
      time('text', texts.length, () => p.embed(modelId, texts, role, titles)),
    embedMedia: (modelId: string, kind: 'image', paths: string[], opts?: { budget?: number }) =>
      time('image', paths.length, () => p.embedMedia(modelId, kind, paths, opts)),
    embedDecoded: (modelId: string, inputs: DecodedInput[]) =>
      time(inputs[0]?.kind ?? 'frame', inputs.length, () => p.embedDecoded(modelId, inputs)),
  });
}

let ix: Indexed;

beforeAll(async () => {
  ix = await indexTestbed({ fresh: true, wrap: timed });
}, 1_800_000);

afterAll(() => closeTestbed());

interface StateRow {
  path: string;
  status: string;
}

function columns(table: string): Set<string> {
  return new Set((rawDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
}

/** A phrase each generated document must yield after extraction. */
function probes(): { path: string; phrase: string }[] {
  const firstWords = (text: string) => text.replace(/^#.*\n/, '').trim().split(/\s+/).slice(0, 4).join(' ');
  return [
    ...TEXT_FILES.filter((f) => EXPECT.index.includes(f.path)).map((f) => ({ path: f.path, phrase: firstWords(f.content) })),
    ...PDF_FILES.map((f) => ({ path: f.path, phrase: firstWords(f.pages[0]) })),
    ...DOCX_FILES.map((f) => ({ path: f.path, phrase: firstWords(f.paragraphs[0]) })),
  ];
}

describe('index eval', () => {
  it('checks rules, extraction, structure and cost', async () => {
    const db = rawDb();
    const states = db.prepare('SELECT path, status FROM index_state').all() as unknown as StateRow[];
    const byRel = new Map(states.map((s) => [ix.rel(s.path), s.status]));

    // Rules: anything with an index_state row was read.
    const violations = EXPECT.skip
      .map(({ path, reason }) => {
        const read = [...byRel.keys()].filter((p) => (path.endsWith('/') ? p.startsWith(path) : p === path));
        return { rule: path, reason, count: read.length, sample: read.slice(0, 3) };
      })
      .filter((v) => v.count > 0);
    const violationFiles = violations.reduce((s, v) => s + v.count, 0);
    const missing = EXPECT.index.filter((p) => byRel.get(p) !== 'indexed');

    // Extraction: a known phrase survives into the stored chunks.
    const chunkText = db.prepare('SELECT text FROM file_chunks WHERE path = ?');
    const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();
    const extraction = probes().map(({ path, phrase }) => {
      const rows = chunkText.all(ix.abs(path)) as { text: string }[];
      return { path, ok: rows.some((r) => norm(r.text).includes(norm(phrase))) };
    });
    const extractionFails = extraction.filter((e) => !e.ok).map((e) => e.path);

    // Structure: page locations, the long book's tail, keyword-only numbers.
    const chunkCols = columns('file_chunks');
    const pages = EXPECT.pages.map(({ path, count }) => {
      const found = chunkCols.has('loc')
        ? (db.prepare('SELECT COUNT(DISTINCT loc) AS n FROM file_chunks WHERE path = ? AND loc IS NOT NULL').get(ix.abs(path)) as { n: number }).n
        : 0;
      return { path, expected: count, withLocation: found };
    });
    const book = PDF_FILES.find((f) => f.path.includes('field-guide'))!;
    const tailProbes = [120, 190].map((page) => {
      const phrase = book.pages[page - 1].split('. ').slice(1, 2).join('');
      const rows = chunkText.all(ix.abs(book.path)) as { text: string }[];
      return { page, indexed: rows.some((r) => norm(r.text).includes(norm(phrase.slice(0, 60)))) };
    });
    const keywordOnly = EXPECT.keywordOnly.map((path) => {
      const r = db
        .prepare('SELECT COUNT(*) AS chunks, SUM(embedding IS NOT NULL) AS vectors FROM file_chunks WHERE path = ?')
        .get(ix.abs(path)) as { chunks: number; vectors: number | null };
      return { path, chunks: r.chunks, vectors: r.vectors ?? 0, ok: r.chunks > 0 && !r.vectors };
    });

    // Cost.
    const totals = db
      .prepare('SELECT COUNT(*) AS chunks, SUM(embedding IS NOT NULL) AS vectors, SUM(LENGTH(embedding)) AS vectorBytes FROM file_chunks')
      .get() as { chunks: number; vectors: number; vectorBytes: number };
    const { page_count: pageCount } = db.prepare('PRAGMA page_count').get() as { page_count: number };
    const { page_size: pageSize } = db.prepare('PRAGMA page_size').get() as { page_size: number };
    const statusCounts = states.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {});

    console.log(`\nIndex eval — provider ${ix.kind}`);
    console.log(
      table(
        ['check', 'result'],
        [
          ['skip rules respected', `${EXPECT.skip.length - violations.length}/${EXPECT.skip.length} (${violationFiles} files read that must not be)`],
          ['expected files indexed', `${EXPECT.index.length - missing.length}/${EXPECT.index.length}`],
          ['extraction probes', `${extraction.length - extractionFails.length}/${extraction.length}`],
          ['PDF pages located', pages.map((p) => `${p.withLocation}/${p.expected}`).join(', ')],
          ['long book tail (p120, p190)', tailProbes.map((t) => (t.indexed ? 'yes' : 'no')).join(', ')],
          ['keyword-only numeric text', keywordOnly.map((k) => (k.ok ? 'yes' : `no (${k.vectors} vectors)`)).join(', ')],
          ['files by status', JSON.stringify(statusCounts)],
        ],
      ),
    );
    if (violations.length) {
      console.log(`\nRead but must be skipped:\n${violations.map((v) => `  [${v.reason}] ${v.rule} — ${v.count} file(s), e.g. ${v.sample.join(', ')}`).join('\n')}`);
    }
    if (missing.length) console.log(`\nExpected but not indexed:\n${missing.map((p) => `  ${p} (${byRel.get(p) ?? 'no row'})`).join('\n')}`);
    if (extractionFails.length) console.log(`\nExtraction probe missing:\n${extractionFails.map((p) => `  ${p}`).join('\n')}`);

    const perUnit = (t: Timing) => (t.units ? t.seconds / t.units : 0);
    console.log('\nCost');
    console.log(
      table(
        ['measure', 'value'],
        [
          ['wall time', `${ix.indexSeconds.toFixed(1)} s`],
          ['text: model seconds / chunks', `${timings.text.seconds.toFixed(1)} s / ${timings.text.units} → ${(perUnit(timings.text) * 1000).toFixed(0)} ms per chunk`],
          ['image: model seconds / images', `${timings.image.seconds.toFixed(1)} s / ${timings.image.units} → ${(perUnit(timings.image) * 1000).toFixed(0)} ms per image`],
          ['video: model seconds / frames', `${timings.frame.seconds.toFixed(1)} s / ${timings.frame.units} → ${(perUnit(timings.frame) * 1000).toFixed(0)} ms per frame`],
          ['audio: model seconds / 30 s windows', `${timings.audio.seconds.toFixed(1)} s / ${timings.audio.units} → ${(perUnit(timings.audio) * 1000).toFixed(0)} ms per window`],
          ['chunks / vectors', `${totals.chunks} / ${totals.vectors}`],
          ['vector bytes', `${((totals.vectorBytes ?? 0) / 1024).toFixed(0)} KB`],
          ['database size', `${((pageCount * pageSize) / 1024).toFixed(0)} KB`],
        ],
      ),
    );

    const file = await writeResults('index', ix.kind, {
      rules: { violations, missing, skipRules: EXPECT.skip.length },
      extraction: { probes: extraction.length, failed: extractionFails },
      structure: { pages, tailProbes, keywordOnly },
      cost: {
        wallSeconds: ix.indexSeconds,
        timings,
        msPerTextChunk: perUnit(timings.text) * 1000,
        msPerImage: perUnit(timings.image) * 1000,
        ...totals,
        databaseBytes: pageCount * pageSize,
      },
      statusCounts,
      coverage: pct((EXPECT.index.length - missing.length) / EXPECT.index.length),
    });
    console.log(`\nWrote ${file}`);
  }, 1_800_000);
});
