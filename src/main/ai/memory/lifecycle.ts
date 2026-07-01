import { spawn as cpSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, ipcMain } from 'electron';
import { Channels } from '@shared/channels';
import type { AppError, Result, SupermemoryLlmInput, SupermemoryLlmStatus } from '@shared/types';
import { getPrefs } from '../../prefs';
import { getSecret, setSecret } from '../../db/secrets';
import { registerMemoryBackend } from './registry';
import { SupermemoryBackend } from './supermemoryBackend';
import { SupermemoryDaemon, type DaemonProcess } from './supermemoryDaemon';
import { buildLlmEnv, resolveLlmEnv, type StoredLlmConfig } from './supermemoryConfig';

/**
 * Electron glue that owns the bundled supermemory daemon, registers the
 * `supermemory` backend, and exposes the LLM-config IPC. Kept thin — the
 * testable logic lives in `SupermemoryDaemon` and `supermemoryConfig`.
 *
 * The daemon is (re)constructed at start with the LLM env resolved from the
 * user's saved config (an encrypted secret, main-only) — or, in dev, from
 * `process.env`. It starts only when the user selected supermemory *and* an LLM
 * is configured *and* the binary exists, so a normal run never spawns the
 * ~192 MB / ~1 GB-RAM process. The provider key never leaves the main process.
 */

/** Encrypted-secret name holding the JSON `StoredLlmConfig` (incl. the key). */
const LLM_SECRET = 'supermemory-llm';

let daemon: SupermemoryDaemon | null = null;

/** Bundled binary path (override with FILDOS_SUPERMEMORY_BIN in dev). */
function binaryPath(): string {
  return (
    process.env.FILDOS_SUPERMEMORY_BIN ??
    join(app.getPath('userData'), 'supermemory', 'bin', 'supermemory-server')
  );
}

function dataDir(): string {
  return join(app.getPath('userData'), 'supermemory', 'data');
}

function loadStoredConfig(): StoredLlmConfig | null {
  const raw = getSecret(LLM_SECRET);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredLlmConfig;
  } catch {
    return null;
  }
}

/** LLM env from the saved config, falling back to process.env in dev. */
function currentLlmEnv(): Record<string, string> | null {
  const config = loadStoredConfig();
  return config ? buildLlmEnv(config) : resolveLlmEnv(process.env);
}

function makeDaemon(llmEnv: Record<string, string>): SupermemoryDaemon {
  return new SupermemoryDaemon({
    binaryPath: binaryPath(),
    dataDir: dataDir(),
    llmEnv,
    spawn: (bin, args, env): DaemonProcess =>
      cpSpawn(bin, args, { env: { ...process.env, ...env }, stdio: 'ignore' }),
    // The daemon prints and persists its bearer token here (confirmed live).
    readToken: async (dir) => {
      try {
        return (await readFile(join(dir, 'api-key'), 'utf8')).trim();
      } catch {
        return null;
      }
    },
  });
}

/** Register the supermemory backend (wired to the live daemon). Call once. */
export function registerSupermemory(): void {
  registerMemoryBackend(
    new SupermemoryBackend({
      baseUrl: () => daemon?.baseUrl() ?? null,
      token: () => daemon?.token() ?? null,
    }),
  );
}

/**
 * Start the daemon only if supermemory is the active backend and an LLM is
 * configured and the binary exists — otherwise stay inert. Never throws.
 */
export async function startSupermemoryIfSelected(): Promise<void> {
  const prefs = await getPrefs();
  if (prefs.ai?.activeBackend !== 'supermemory') return;

  const llmEnv = currentLlmEnv();
  if (!llmEnv) {
    console.warn('[supermemory] no LLM provider configured — not starting the daemon.');
    return;
  }
  if (!existsSync(binaryPath())) {
    console.warn('[supermemory] server binary not found — not starting the daemon.');
    return;
  }

  try {
    await mkdir(dataDir(), { recursive: true });
    daemon = makeDaemon(llmEnv);
    await daemon.start();
  } catch (err) {
    console.error('[supermemory] failed to start the daemon:', err);
  }
}

/** Tear the daemon down. Safe when it never started. */
export function stopSupermemory(): void {
  daemon?.stop();
  daemon = null;
}

/** Stop then start — used after the LLM config changes (env is read at spawn). */
export async function restartSupermemory(): Promise<void> {
  stopSupermemory();
  await startSupermemoryIfSelected();
}

/** IPC for reading/writing the supermemory LLM config. Call once at startup. */
export function registerMemoryHandlers(): void {
  ipcMain.handle(Channels.memoryGetLlm, () =>
    wrap<SupermemoryLlmStatus>(async () => {
      const config = loadStoredConfig();
      return {
        config: config
          ? { provider: config.provider, model: config.model, baseUrl: config.baseUrl }
          : { provider: 'ollama' },
        hasKey: Boolean(config?.apiKey),
      };
    }),
  );

  ipcMain.handle(Channels.memorySetLlm, (_e, input: SupermemoryLlmInput) =>
    wrap<void>(async () => {
      const prev = loadStoredConfig();
      const next: StoredLlmConfig = {
        provider: input.provider,
        model: input.model?.trim() || undefined,
        baseUrl: input.baseUrl?.trim() || undefined,
        // Keep the stored key unless a new one is supplied or it's cleared.
        apiKey: input.clearKey ? undefined : input.apiKey?.trim() || prev?.apiKey,
      };
      setSecret(LLM_SECRET, JSON.stringify(next));

      // Apply immediately if supermemory is the active backend.
      const prefs = await getPrefs();
      if (prefs.ai?.activeBackend === 'supermemory') await restartSupermemory();
    }),
  );
}

async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const e = err as Error & { code?: string };
    const error: AppError = { code: e.code ?? 'EUNKNOWN', message: e.message ?? 'Something went wrong.' };
    return { ok: false, error };
  }
}
