import { spawn as cpSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import { getPrefs } from '../../prefs';
import { registerMemoryBackend } from './registry';
import { SupermemoryBackend } from './supermemoryBackend';
import { SupermemoryDaemon, type DaemonProcess } from './supermemoryDaemon';
import { resolveLlmEnv } from './supermemoryConfig';

/**
 * Electron glue that owns the bundled supermemory daemon and registers the
 * `supermemory` backend. Kept thin — the testable logic lives in
 * `SupermemoryDaemon` and `supermemoryConfig`. The daemon is started only when
 * the user has actually selected supermemory *and* configured an LLM (it can't
 * boot otherwise), so a normal run never spawns the 192 MB / ~1 GB-RAM process.
 */

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

/** Construct the daemon and register the backend. Call once at startup. */
export function registerSupermemory(): void {
  const dir = dataDir();
  daemon = new SupermemoryDaemon({
    binaryPath: binaryPath(),
    dataDir: dir,
    // LLM env resolved now from process.env; Settings will supply these later.
    llmEnv: resolveLlmEnv(process.env) ?? {},
    spawn: (bin, args, env): DaemonProcess =>
      cpSpawn(bin, args, { env: { ...process.env, ...env }, stdio: 'ignore' }),
    // The daemon prints and persists its bearer token here (confirmed live).
    readToken: async (d) => {
      try {
        return (await readFile(join(d, 'api-key'), 'utf8')).trim();
      } catch {
        return null;
      }
    },
  });

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
  if (prefs.ai?.activeBackend !== 'supermemory' || !daemon) return;

  if (!resolveLlmEnv(process.env)) {
    console.warn('[supermemory] no LLM provider configured — not starting the daemon.');
    return;
  }
  if (!existsSync(binaryPath())) {
    console.warn('[supermemory] server binary not found — not starting the daemon.');
    return;
  }

  try {
    await mkdir(dataDir(), { recursive: true });
    await daemon.start();
  } catch (err) {
    console.error('[supermemory] failed to start the daemon:', err);
  }
}

/** Tear the daemon down on quit. Safe when it never started. */
export function stopSupermemory(): void {
  daemon?.stop();
}
