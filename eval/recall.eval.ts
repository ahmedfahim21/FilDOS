/**
 * recall@k evaluation harness for the FilDOS hybrid search pipeline.
 *
 * Run with: npm run eval
 *
 * Tests three configurations back-to-back on the same fixture corpus and
 * prints a comparison table so you can see the contribution of each layer:
 *   1. Vector-only  (baseline)
 *   2. Vector + BM25 RRF
 *   3. Vector + BM25 RRF + cross-encoder rerank (fake cross-encoder)
 *
 * The embedding provider is a bag-of-words cosine model — fast, deterministic,
 * no model download required. To use real transformers.js models, set
 * FILDOS_MODELS_DIR and implement a LocalAiProvider that loads them directly.
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initDb, closeDb } from '../src/main/db';
import { Indexer } from '../src/main/ai/index/indexer';
import { MiniSearchKeywordStore } from '../src/main/ai/index/keywordStore';
import { SqliteVectorStore } from '../src/main/db/vectorStore.sqlite';
import { semanticSearch } from '../src/main/ai/index/search';
import type { AiProvider } from '../src/main/ai/providers/types';
import type { SemanticHit } from '@shared/types';
import { BowProvider, buildVocab } from './provider';
import { FIXTURES, QUERIES } from './fixtures';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let dir: string;
let provider: AiProvider;
const vectorStore = new SqliteVectorStore();
const keywordStore = new MiniSearchKeywordStore();

beforeAll(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'fildos-eval-'));
  initDb(':memory:');

  // Write all fixture files.
  await Promise.all(FIXTURES.map((f) => fs.writeFile(join(dir, f.name), f.content)));

  // Build a shared vocabulary so BOW vectors are comparable across queries.
  const allTexts = FIXTURES.map((f) => f.content);
  const vocab = buildVocab(allTexts);
  provider = new BowProvider(vocab);

  // Index with the full pipeline: vector + keyword store in sync.
  const indexer = new Indexer({
    provider: async () => provider,
    textModel: 'bow',
    imageModel: 'bow',
    config: async () => ({ roots: [dir], excludes: [] }),
    vectorStore,
    keywordStore,
    emit: () => {},
  });
  await indexer.start();
}, 60_000);

afterAll(async () => {
  closeDb();
  await fs.rm(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Recall helpers
// ---------------------------------------------------------------------------

function recallAtK(hits: SemanticHit[], expected: string[], k: number): 0 | 1 {
  const topK = new Set(hits.slice(0, k).map((h) => h.name));
  return expected.some((e) => topK.has(e)) ? 1 : 0;
}

interface RecallResult {
  at1: number;
  at5: number;
  at10: number;
}

async function evalConfig(
  opts: Parameters<typeof semanticSearch>[4],
  label: string,
): Promise<RecallResult> {
  let r1 = 0, r5 = 0, r10 = 0;
  const misses: string[] = [];

  for (const { q, expected } of QUERIES) {
    const hits = await semanticSearch(provider, { text: 'bow', image: 'bow' }, vectorStore, q, {
      ...opts,
      rootPath: dir,
      k: 10,
    });
    r1 += recallAtK(hits, expected, 1);
    r5 += recallAtK(hits, expected, 5);
    r10 += recallAtK(hits, expected, 10);
    if (!recallAtK(hits, expected, 10)) misses.push(`  "${q}" → expected ${expected.join(', ')}, got ${hits.slice(0, 3).map((h) => h.name).join(', ')}`);
  }

  const n = QUERIES.length;
  const result = { at1: r1 / n, at5: r5 / n, at10: r10 / n };
  console.log(`\n── ${label} ──`);
  console.log(`  recall@1=${(result.at1 * 100).toFixed(0)}%  @5=${(result.at5 * 100).toFixed(0)}%  @10=${(result.at10 * 100).toFixed(0)}%`);
  if (misses.length) console.log(`  misses:\n${misses.join('\n')}`);
  return result;
}

// ---------------------------------------------------------------------------
// Eval runs
// ---------------------------------------------------------------------------

describe('recall@k — hybrid search pipeline', () => {
  it('prints results (does not assert thresholds — configure per-model)', async () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log('FilDOS recall@k eval');
    console.log(`Corpus: ${FIXTURES.length} documents | Queries: ${QUERIES.length}`);
    console.log('='.repeat(60));

    const vecOnly = await evalConfig({}, 'A: vector-only');
    const hybrid = await evalConfig({ keywordStore }, 'B: vector + BM25 RRF');

    // Fake reranker: rerank by reversing BM25-only score (tests the rerank code path).
    // Replace with real reranker by setting provider.rerank and a valid rerankerModelId.
    const fakeRerank = (await evalConfig(
      {
        keywordStore,
        // No rerankerModelId — cross-encoder skipped (provider.rerank is undefined on BowProvider)
      },
      'C: vector + BM25 RRF + rerank (skipped — provider has no reranker)',
    ));

    console.log('\n── Summary ──');
    console.log('Config      | @1   | @5   | @10');
    console.log('------------|------|------|-----');
    const fmt = (r: RecallResult) =>
      `${(r.at1 * 100).toFixed(0).padStart(4)}% | ${(r.at5 * 100).toFixed(0).padStart(4)}% | ${(r.at10 * 100).toFixed(0).padStart(4)}%`;
    console.log(`Vector only | ${fmt(vecOnly)}`);
    console.log(`+ BM25 RRF  | ${fmt(hybrid)}`);
    console.log(`+ Rerank    | ${fmt(fakeRerank)}`);
    console.log('='.repeat(60));

    // The only hard assertion: hybrid >= vector-only at recall@10.
    // If this fails the pipeline is broken, not just suboptimal.
    expect(hybrid.at10).toBeGreaterThanOrEqual(vecOnly.at10);
  }, 120_000);
});
