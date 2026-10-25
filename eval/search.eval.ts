/**
 * Search eval: known-answer queries over the testbed (`queries/search.json`).
 *
 * Reports, per tag and overall: R@1, R@5, MRR, place accuracy (the right page
 * or moment, for expectations pinned with @p / @t), "nothing found" precision
 * on unanswerable queries (no hits at all counts as correct), and latency.
 * Three configurations show what each lane contributes: keyword-only (BM25),
 * meaning-only (vectors), and the production fusion.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SemanticHit } from '@shared/types';
import { semanticSearch } from '../src/main/ai/index/search';
import {
  addBowVocabulary,
  closeTestbed,
  indexTestbed,
  rerankerReady,
  search,
  type Indexed,
} from './lib/harness';
import {
  firstRank,
  parseExpectation,
  pct,
  percentile,
  placeMatches,
  table,
  writeResults,
  type Expectation,
  type HitPlace,
} from './lib/report';

interface Query {
  q: string;
  expect: string[];
  tag: string;
}

const QUERIES: Query[] = JSON.parse(readFileSync(join(__dirname, 'queries', 'search.json'), 'utf8')).queries;
const K = 10;

type Lane = 'keyword' | 'meaning' | 'fused';

interface Outcome {
  q: string;
  tag: string;
  rank: number | null;
  placeOk: boolean | null;
  hits: number;
  ms: number;
  top: string[];
}

let ix: Indexed;

beforeAll(async () => {
  addBowVocabulary(QUERIES.map((q) => q.q));
  ix = await indexTestbed();
}, 1_800_000);

afterAll(() => closeTestbed());

/** Files for one query under one lane, best first. */
async function run(lane: Lane, q: string): Promise<{ paths: string[]; hits: SemanticHit[] }> {
  if (lane === 'keyword') {
    const seen = new Set<string>();
    const paths: string[] = [];
    for (const m of ix.keywordStore.search(q, { k: K * 5 })) {
      if (!seen.has(m.path)) {
        seen.add(m.path);
        paths.push(ix.rel(m.path));
      }
    }
    return { paths: paths.slice(0, K), hits: [] };
  }
  const hits =
    lane === 'meaning'
      ? await semanticSearch(ix.provider, ix.model, ix.vectorStore, q, { k: K })
      : await search(ix, q, K);
  return { paths: hits.map((h) => ix.rel(h.path)), hits };
}

async function evaluate(lane: Lane): Promise<Outcome[]> {
  const out: Outcome[] = [];
  for (const query of QUERIES) {
    const expected: Expectation[] = query.expect.map(parseExpectation);
    const started = performance.now();
    const { paths, hits } = await run(lane, query.q);
    const ms = performance.now() - started;
    const rank = expected.length ? firstRank(paths, expected) : null;
    let placeOk: boolean | null = null;
    const pinned = expected.find((e) => e.page !== undefined || e.time);
    if (pinned && rank !== null && hits.length) {
      placeOk = placeMatches(pinned, hits[rank - 1] as SemanticHit & HitPlace);
    }
    out.push({ q: query.q, tag: query.tag, rank, placeOk, hits: paths.length, ms, top: paths.slice(0, 3) });
  }
  return out;
}

function summarize(rows: Outcome[]) {
  const answerable = rows.filter((r) => r.tag !== 'none');
  const none = rows.filter((r) => r.tag === 'none');
  const placed = answerable.filter((r) => r.placeOk !== null);
  const n = answerable.length || 1;
  return {
    queries: rows.length,
    r1: answerable.filter((r) => r.rank === 1).length / n,
    r5: answerable.filter((r) => r.rank !== null && r.rank <= 5).length / n,
    mrr: answerable.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / n,
    placeAccuracy: placed.length ? placed.filter((r) => r.placeOk).length / placed.length : null,
    nothingFound: none.length ? none.filter((r) => r.hits === 0).length / none.length : null,
    p50ms: percentile(rows.map((r) => r.ms), 50),
    p95ms: percentile(rows.map((r) => r.ms), 95),
  };
}

describe('search eval', () => {
  it('measures recall, place accuracy and "nothing found" per lane', async () => {
    const lanes: Lane[] = ['keyword', 'meaning', 'fused'];
    const results: Record<Lane, Outcome[]> = { keyword: [], meaning: [], fused: [] };
    for (const lane of lanes) results[lane] = await evaluate(lane);

    const tags = [...new Set(QUERIES.map((q) => q.tag))];
    const byTag = tags.map((tag) => {
      const s = summarize(results.fused.filter((r) => r.tag === tag));
      return [tag, s.queries, tag === 'none' ? '-' : pct(s.r1), tag === 'none' ? '-' : pct(s.r5),
        s.placeAccuracy === null ? '-' : pct(s.placeAccuracy), s.nothingFound === null ? '-' : pct(s.nothingFound)];
    });
    const overall = lanes.map((lane) => {
      const s = summarize(results[lane]);
      return [lane, pct(s.r1), pct(s.r5), s.mrr.toFixed(3), s.placeAccuracy === null ? '-' : pct(s.placeAccuracy),
        s.nothingFound === null ? '-' : pct(s.nothingFound), s.p50ms.toFixed(0), s.p95ms.toFixed(0)];
    });
    const misses = results.fused
      .filter((r) => (r.tag === 'none' ? r.hits > 0 : r.rank !== 1))
      .map((r) => `  [${r.tag}] "${r.q}" → rank ${r.rank ?? '-'}; top: ${r.top.join(' | ') || '(nothing)'}`);

    console.log(`\nSearch eval — provider ${ix.kind}, reranker ${(await rerankerReady(ix)) ? 'on' : 'off'}`);
    console.log(table(['lane', 'R@1', 'R@5', 'MRR', 'place', 'nothing', 'p50ms', 'p95ms'], overall));
    console.log('\nFused, by tag');
    console.log(table(['tag', 'n', 'R@1', 'R@5', 'place', 'nothing'], byTag));
    if (misses.length) console.log(`\nFused misses (not first, or results for an unanswerable query):\n${misses.join('\n')}`);

    const file = await writeResults('search', ix.kind, {
      reranker: await rerankerReady(ix),
      lanes: Object.fromEntries(lanes.map((l) => [l, summarize(results[l])])),
      byTag: Object.fromEntries(tags.map((t) => [t, summarize(results.fused.filter((r) => r.tag === t))])),
      queries: results.fused,
    });
    console.log(`\nWrote ${file}`);

    // Pipeline sanity, not a quality bar: fusing must not lose what either lane finds at R@5.
    const fused = summarize(results.fused);
    expect(fused.r5).toBeGreaterThanOrEqual(Math.min(summarize(results.keyword).r5, summarize(results.meaning).r5));
  }, 1_800_000);
});
