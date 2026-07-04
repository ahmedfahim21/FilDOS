import { app, BrowserWindow, ipcMain } from 'electron';
import { homedir } from 'node:os';
import { Channels, Events } from '@shared/channels';
import type { AppError, IndexConfig, IndexProgress, Result, SemanticHit } from '@shared/types';
import { IMAGE_MODEL_ID, RERANKER_MODEL_ID, TEXT_MODEL_ID } from '@shared/aiModels';
import { getPrefs, setPrefs } from '../../prefs';
import { assertValidPath } from '../../fs/service';
import { activeAiProvider } from '../registry';
import * as aiIndex from '../../db/aiIndex';
import { SqliteVectorStore } from '../../db/vectorStore.sqlite';
import { Indexer } from './indexer';
import { IndexWatcher } from './watcher';
import { MiniSearchKeywordStore } from './keywordStore';
import { semanticSearch } from './search';

/**
 * IPC surface + lifecycle for the background indexer. Owns the single `Indexer`
 * and `IndexWatcher`, wired to the real provider/prefs/vector store, and
 * broadcasts progress to every window (the indexer runs in the background, not
 * in response to one renderer request). Mirrors the `wrap()`/`assertValidPath`
 * conventions of fs/handlers.ts and ai/handlers.ts.
 */

async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const e = err as Error & { code?: string };
    const error: AppError = { code: e.code ?? 'EUNKNOWN', message: e.message ?? 'Something went wrong.' };
    return { ok: false, error };
  }
}

/** Effective indexing config, with sane defaults (root = home directory). */
async function indexConfig(): Promise<IndexConfig> {
  const ix = (await getPrefs()).index ?? {};
  return {
    enabled: ix.enabled ?? false,
    roots: ix.roots?.length ? ix.roots : [homedir()],
    excludes: ix.excludes ?? [],
    intervalMinutes: ix.intervalMinutes ?? 15,
  };
}

async function patchConfig(patch: Partial<IndexConfig>): Promise<void> {
  await setPrefs({ index: { ...(await indexConfig()), ...patch } });
}

/**
 * The user's exclusions plus FilDOS's own data dir. The SQLite WAL and model
 * cache live under `userData` (on macOS that's ~/Library/Application Support,
 * which the built-in ignore rules don't catch), and that dir sits inside the
 * watched home root — without excluding it, our own writes would re-trigger the
 * watcher in a loop. Not shown in the user-facing exclusion list.
 */
async function effectiveExcludes(): Promise<string[]> {
  return [...(await indexConfig()).excludes, app.getPath('userData')];
}

const vectorStore = new SqliteVectorStore();
const keywordStore = new MiniSearchKeywordStore();

function broadcast(progress: IndexProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) win.webContents.send(Events.indexProgress, progress);
  }
}

const indexer = new Indexer({
  provider: () => activeAiProvider(),
  textModel: TEXT_MODEL_ID,
  imageModel: IMAGE_MODEL_ID,
  config: async () => ({ roots: (await indexConfig()).roots, excludes: await effectiveExcludes() }),
  vectorStore,
  keywordStore,
  emit: broadcast,
  countTokens: async (modelId, texts) => {
    const p = await activeAiProvider();
    return p?.countTokens ? p.countTokens(modelId, texts) : texts.map((t) => Math.ceil(t.length / 4));
  },
});

const watcher = new IndexWatcher({
  config: async () => {
    const c = await indexConfig();
    return {
      enabled: c.enabled,
      roots: c.roots,
      excludes: await effectiveExcludes(),
      intervalMinutes: c.intervalMinutes,
    };
  },
  reconcile: () => void indexer.reconcile(),
});

/** Register the indexing IPC handlers. Call once after the AI providers exist. */
export function registerIndexHandlers(): void {
  ipcMain.handle(Channels.indexStart, () =>
    wrap<void>(async () => {
      await patchConfig({ enabled: true });
      await watcher.refresh();
      void indexer.start(); // fire-and-forget; progress streams via events
    }),
  );

  ipcMain.handle(Channels.indexPause, () => wrap<void>(async () => indexer.pause()));

  ipcMain.handle(Channels.indexClear, () => wrap<void>(async () => indexer.clear()));

  ipcMain.handle(Channels.indexStatus, () => wrap<IndexProgress>(async () => indexer.status()));

  ipcMain.handle(Channels.indexAddExclude, (_e, path: string) =>
    wrap<void>(async () => {
      const p = assertValidPath(path);
      const cfg = await indexConfig();
      if (!cfg.excludes.includes(p)) await patchConfig({ excludes: [...cfg.excludes, p] });
      // Drop anything already indexed at or under the excluded path.
      const under = (await aiIndex.statesUnder(p)).map((s) => s.path);
      if (under.length) {
        await aiIndex.remove(under);
        keywordStore.remove(under);
      }
      await watcher.refresh(); // teach the watcher to ignore the new exclusion
    }),
  );

  ipcMain.handle(Channels.indexRemoveExclude, (_e, path: string) =>
    wrap<void>(async () => {
      const cfg = await indexConfig();
      await patchConfig({ excludes: cfg.excludes.filter((x) => x !== path) });
      await watcher.refresh();
    }),
  );

  ipcMain.handle(Channels.indexListExcludes, () =>
    wrap<string[]>(async () => (await indexConfig()).excludes),
  );

  ipcMain.handle(Channels.indexSetInterval, (_e, minutes: number) =>
    wrap<void>(async () => {
      await patchConfig({ intervalMinutes: Math.max(1, Math.min(1440, Math.round(minutes))) });
      await watcher.refresh(); // apply the new cadence immediately
    }),
  );

  ipcMain.handle(
    Channels.indexSearch,
    (_e, query: string, opts?: { rootPath?: string; k?: number }) =>
      wrap<SemanticHit[]>(async () => {
        const provider = await activeAiProvider();
        if (!provider) {
          throw Object.assign(new Error('No AI provider is configured.'), { code: 'EINVAL' });
        }
        const rootPath = opts?.rootPath ? assertValidPath(opts.rootPath) : undefined;
        return semanticSearch(
          provider,
          { text: TEXT_MODEL_ID, image: IMAGE_MODEL_ID },
          vectorStore,
          query,
          { rootPath, k: opts?.k, keywordStore, rerankerModelId: RERANKER_MODEL_ID },
        );
      }),
  );
}

/**
 * Populate the in-memory BM25 store from all chunks already in the DB.
 * Skips the embedding BLOBs so this is fast at personal-filesystem scale.
 * Non-fatal: a failure leaves the store empty and search falls back to vector-only.
 */
async function rebuildKeywordIndex(): Promise<void> {
  const chunks = await aiIndex.allChunks();
  const byPath = new Map<string, { chunkIx: number; text: string }[]>();
  for (const c of chunks) {
    // Image chunks (modelId === IMAGE_MODEL_ID) carry the basename as text and
    // belong only in the vector lane. Exclude them so the keyword store stays
    // consistent with how Indexer.process() updates it (text-only writes).
    if (c.modelId === IMAGE_MODEL_ID) continue;
    const arr = byPath.get(c.path) ?? [];
    arr.push({ chunkIx: c.chunkIx, text: c.text });
    byPath.set(c.path, arr);
  }
  for (const [path, pathChunks] of byPath) keywordStore.upsert(path, pathChunks);
}

/** Arm the watcher and resume leftover jobs, if indexing was enabled. Call at startup. */
export async function startIndexBackground(): Promise<void> {
  if (!(await indexConfig()).enabled) return;
  // Rebuild BM25 from DB before arming the watcher so keyword search is
  // available immediately on the first query after startup.
  try { await rebuildKeywordIndex(); } catch { /* non-fatal; search falls back to vector-only */ }
  await watcher.start();
  void indexer.resume();
}

/** Tear down watches/timers and stop processing. Call on app quit. */
export function stopIndexBackground(): void {
  watcher.stop();
  indexer.pause();
}
