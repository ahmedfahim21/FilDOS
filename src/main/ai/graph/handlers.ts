import { BrowserWindow, ipcMain } from 'electron';
import { Channels, Events } from '@shared/channels';
import type { AppError, Result } from '@shared/types';
import type { GraphProgress, GraphSnapshot } from '@shared/graphTypes';
import { IMAGE_MODEL_ID, NER_MODEL_ID } from '@shared/aiModels';
import { getPrefs, setPrefs } from '../../prefs';
import { activeAiProvider } from '../registry';
import { pace } from '../index/handlers';
import { GraphBuilder } from './builder';

/**
 * IPC surface for the knowledge graph. Owns the single `GraphBuilder`, wired
 * to the real provider/prefs and the indexer's duty-cycle pace. Builds are
 * fire-and-forget: `graph:get` returns whatever is stored immediately and
 * kicks a background refresh when stale — the renderer watches
 * `Events.graphProgress` and re-fetches when the build settles.
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

function broadcast(progress: GraphProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) win.webContents.send(Events.graphProgress, progress);
  }
}

const builder = new GraphBuilder({
  provider: () => activeAiProvider(),
  nerModel: NER_MODEL_ID,
  imageModel: IMAGE_MODEL_ID,
  emit: broadcast,
  pace,
  prefs: { get: getPrefs, set: setPrefs },
});

/** Register the knowledge-graph IPC handlers. Call once at startup. */
export function registerGraphHandlers(): void {
  ipcMain.handle(Channels.graphGet, (_e, opts?: { maxNodes?: number }) =>
    wrap<GraphSnapshot>(async () => {
      // Refresh in the background; a failed build leaves the stored graph as-is.
      void builder.ensureBuilt().catch(() => {});
      return builder.snapshot({ maxNodes: opts?.maxNodes });
    }),
  );

  ipcMain.handle(Channels.graphBuild, () =>
    wrap<void>(async () => {
      void builder.build(true).catch(() => {});
    }),
  );

  ipcMain.handle(Channels.graphStatus, () => wrap<GraphProgress>(async () => builder.status()));
}

/** Stop an in-flight build (persisted work is kept). Call on app quit. */
export function stopGraphBackground(): void {
  builder.stop();
}

/** Forget the stored graph — companions the indexer's "Clear index". */
export async function clearGraph(): Promise<void> {
  await builder.clear();
}
