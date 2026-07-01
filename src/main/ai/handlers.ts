import { ipcMain } from 'electron';
import { Channels, Events } from '@shared/channels';
import type { AiModelStatus, AppError, Result } from '@shared/types';
import { DEFAULT_MODEL_ID } from '@shared/aiModels';
import { getPrefs } from '../prefs';
import { activeAiProvider } from './registry';

/** Wrap an async op in the Result union (mirrors cloud/handlers.ts). */
async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const e = err as Error & { code?: string };
    const error: AppError = {
      code: e.code ?? 'EUNKNOWN',
      message: e.message ?? 'Something went wrong.',
    };
    return { ok: false, error };
  }
}

/** The user's selected provider, or a friendly error if none is registered. */
async function provider() {
  const p = await activeAiProvider();
  if (!p) {
    throw Object.assign(new Error('No AI provider is configured.'), { code: 'EINVAL' });
  }
  return p;
}

/** The selected model id (explicit arg wins; else prefs; else the default). */
async function activeModelId(modelId?: string): Promise<string> {
  if (modelId) return modelId;
  const prefs = await getPrefs();
  return prefs.ai?.modelId ?? DEFAULT_MODEL_ID;
}

/** Register the AI IPC handlers. Call once after the providers are registered. */
export function registerAiHandlers(): void {
  ipcMain.handle(Channels.aiStatus, (_e, modelId?: string) =>
    wrap<AiModelStatus>(async () => (await provider()).status(await activeModelId(modelId))),
  );

  ipcMain.handle(Channels.aiDownload, (e, modelId?: string) =>
    wrap<void>(async () => {
      const p = await provider();
      const id = await activeModelId(modelId);
      // Forward the provider's progress to the requesting renderer for the
      // duration of the download (same sender.send pattern as fs/watch.ts).
      const off = p.onProgress?.((status) => {
        if (!e.sender.isDestroyed()) e.sender.send(Events.aiModelProgress, status);
      });
      try {
        await p.download(id);
      } finally {
        off?.();
      }
    }),
  );

  ipcMain.handle(Channels.aiEmbed, (_e, texts: string[]) =>
    wrap<number[][]>(async () => {
      const vectors = await (await provider()).embed(await activeModelId(), texts);
      return vectors.map((v) => Array.from(v));
    }),
  );

  ipcMain.handle(Channels.aiEmbedImages, (_e, paths: string[]) =>
    wrap<number[][]>(async () => {
      const vectors = await (await provider()).embedImages(await activeModelId(), paths);
      return vectors.map((v) => Array.from(v));
    }),
  );
}
