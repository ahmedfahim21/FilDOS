/**
 * Shared eval setup: build the testbed, index it with the production Indexer
 * (production ignore rules, real stores), and search it the way
 * `index/handlers.ts#searchIndex` does.
 *
 * Provider: `FILDOS_EVAL_PROVIDER=real` (default) runs the app's model runtime
 * in-process; `bow` runs the bag-of-words stand-in (no downloads, CI smoke).
 * Models download into `FILDOS_MODELS_DIR` (default `eval/.models`).
 *
 * Indexing the testbed with real models takes minutes, so the indexed DB is
 * cached under `eval/.cache`, keyed by provider + models + testbed (BoW runs are
 * never cached: their vocabulary differs per suite). Suites that
 * measure indexing itself pass `fresh: true` (and `wrap` to time the provider).
 */
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import {
  IMAGE_MODEL_ID,
  INDEX_MODEL_IDS,
  RERANKER_MODEL_ID,
  TEXT_MODEL_ID,
} from '@shared/aiModels';
import type { IndexProgress, SemanticHit } from '@shared/types';
import { closeDb, initDb, rawDb } from '../../src/main/db';
import * as aiIndex from '../../src/main/db/aiIndex';
import { SqliteVectorStore } from '../../src/main/db/vectorStore.sqlite';
import { Indexer } from '../../src/main/ai/index/indexer';
import { MiniSearchKeywordStore } from '../../src/main/ai/index/keywordStore';
import { semanticSearch, type SearchModels } from '../../src/main/ai/index/search';
import type { AiProvider } from '../../src/main/ai/providers/types';
import { buildTestbed, manifestHash } from '../testbed/build';
import { DOCX_FILES, PDF_FILES, TEXT_FILES } from '../testbed/manifest';
import { BowProvider, buildVocab, RuntimeProvider } from './providers';

const EVAL_DIR = resolve(__dirname, '..');
const CACHE_DIR = join(EVAL_DIR, '.cache');

export type ProviderKind = 'real' | 'bow';

export function providerKind(): ProviderKind {
  const v = process.env.FILDOS_EVAL_PROVIDER ?? 'real';
  if (v !== 'real' && v !== 'bow') throw new Error(`FILDOS_EVAL_PROVIDER must be 'real' or 'bow', got '${v}'`);
  return v;
}

export interface Indexed {
  root: string;
  kind: ProviderKind;
  provider: AiProvider;
  models: SearchModels;
  vectorStore: SqliteVectorStore;
  keywordStore: MiniSearchKeywordStore;
  /** Wall-clock seconds the indexing run took; 0 when the index came from cache. */
  indexSeconds: number;
  fromCache: boolean;
  /** The last progress snapshot of the run (null from cache). */
  progress: IndexProgress | null;
  abs(rel: string): string;
  rel(abs: string): string;
}

/** Extra vocabulary for the BoW provider: query words must exist in its space. */
let bowExtraTexts: string[] = [];
export function addBowVocabulary(texts: string[]): void {
  bowExtraTexts = [...bowExtraTexts, ...texts];
}

function makeProvider(kind: ProviderKind): { provider: AiProvider; models: SearchModels } {
  if (kind === 'bow') {
    const texts = [
      ...TEXT_FILES.map((f) => f.content),
      ...PDF_FILES.flatMap((f) => f.pages),
      ...DOCX_FILES.flatMap((f) => f.paragraphs),
      ...bowExtraTexts,
    ];
    return { provider: new BowProvider(buildVocab(texts)), models: { text: 'bow', image: 'bow-image' } };
  }
  process.env.FILDOS_MODELS_DIR ??= join(EVAL_DIR, '.models');
  return { provider: new RuntimeProvider(), models: { text: TEXT_MODEL_ID, image: IMAGE_MODEL_ID } };
}

function cacheFile(kind: ProviderKind): string {
  const models = kind === 'bow' ? 'bow' : INDEX_MODEL_IDS.join('+').replace(/[^\w.+-]/g, '_');
  return join(CACHE_DIR, `${kind}-${models}-${manifestHash()}.db`);
}

/** Load every stored chunk into the keyword store, as startup does in production. */
async function rebuildKeywords(store: MiniSearchKeywordStore, imageModel: string): Promise<void> {
  const byPath = new Map<string, { chunkIx: number; text: string }[]>();
  for (const c of await aiIndex.allChunks()) {
    if (c.modelId === imageModel) continue;
    const arr = byPath.get(c.path) ?? [];
    arr.push({ chunkIx: c.chunkIx, text: c.text });
    byPath.set(c.path, arr);
  }
  for (const [path, chunks] of byPath) store.upsert(path, chunks);
}

/**
 * The testbed, indexed. Opens a private copy of the DB for this suite (each
 * suite file runs in its own worker), so suites never share mutable state.
 */
export async function indexTestbed(
  opts: { fresh?: boolean; wrap?: (p: AiProvider) => AiProvider } = {},
): Promise<Indexed> {
  const kind = providerKind();
  const root = await buildTestbed();
  const made = makeProvider(kind);
  const models = made.models;
  const provider = opts.wrap ? opts.wrap(made.provider) : made.provider;
  const vectorStore = new SqliteVectorStore();
  const keywordStore = new MiniSearchKeywordStore();
  const work = await fs.mkdtemp(join(tmpdir(), 'fildos-eval-db-'));
  const dbFile = join(work, 'index.db');
  const cached = cacheFile(kind);
  const base = {
    root,
    kind,
    provider,
    models,
    vectorStore,
    keywordStore,
    abs: (rel: string) => join(root, ...rel.split('/')),
    rel: (abs: string) => relative(root, abs).split(sep).join('/'),
  };

  // BoW vectors depend on a vocabulary that differs per suite (search adds its
  // query words), so a BoW index is never cached: each run builds its own.
  const cacheable = kind !== 'bow';
  const hasCache = cacheable && !opts.fresh && (await fs.stat(cached).then(() => true, () => false));
  if (hasCache) {
    await fs.copyFile(cached, dbFile);
    initDb(dbFile);
    await rebuildKeywords(keywordStore, models.image);
    return { ...base, indexSeconds: 0, fromCache: true, progress: null };
  }

  initDb(dbFile);
  let progress: IndexProgress | null = null;
  const indexer = new Indexer({
    provider: async () => provider,
    textModel: models.text,
    imageModel: models.image,
    config: async () => ({ roots: [root], excludes: [] }),
    vectorStore,
    keywordStore,
    emit: (p) => {
      progress = p;
    },
    countTokens: provider.countTokens
      ? (modelId, texts) => provider.countTokens!(modelId, texts)
      : undefined,
  });
  const started = performance.now();
  await indexer.start();
  const indexSeconds = (performance.now() - started) / 1000;

  if (cacheable) {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.rm(cached, { force: true });
    rawDb().exec(`VACUUM INTO '${cached.replace(/'/g, "''")}'`);
  }
  return { ...base, indexSeconds, fromCache: false, progress };
}

export function closeTestbed(): void {
  closeDb();
}

/** Whether the opt-in reranker is downloaded (search only uses it then, as in production). */
export async function rerankerReady(ix: Indexed): Promise<boolean> {
  if (ix.kind === 'bow') return false;
  return (await ix.provider.status(RERANKER_MODEL_ID)).state === 'ready';
}

/** Search exactly as `searchIndex` does in production. */
export function search(ix: Indexed, query: string, k: number): Promise<SemanticHit[]> {
  return semanticSearch(ix.provider, ix.models, ix.vectorStore, query, {
    k,
    keywordStore: ix.keywordStore,
    rerankerModelId: ix.kind === 'real' ? RERANKER_MODEL_ID : undefined,
  });
}
