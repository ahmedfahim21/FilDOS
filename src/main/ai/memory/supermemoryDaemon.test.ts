import { describe, expect, it, vi } from 'vitest';
import { SupermemoryDaemon, type DaemonProcess, type SupermemoryDaemonDeps } from './supermemoryDaemon';

/** A fake child process that records kill() and lets tests fire exit/error. */
function fakeProc() {
  const listeners: { exit?: (code: number | null) => void; error?: (e: Error) => void } = {};
  const proc: DaemonProcess & { fireExit: () => void; killed: boolean } = {
    pid: 4242,
    killed: false,
    kill() {
      this.killed = true;
      return true;
    },
    once(event: 'exit' | 'error', cb: never) {
      listeners[event] = cb;
      return this;
    },
    fireExit() {
      listeners.exit?.(0);
    },
  };
  return proc;
}

/** `fetch` that refuses `failFirst` times, then returns 200 — simulates warmup. */
function healthAfter(failFirst: number) {
  let n = 0;
  return vi.fn(async () => {
    if (n++ < failFirst) throw new Error('ECONNREFUSED');
    return new Response('ok', { status: 200 });
  }) as unknown as typeof fetch;
}

function makeDeps(over: Partial<SupermemoryDaemonDeps> = {}): SupermemoryDaemonDeps & { proc: ReturnType<typeof fakeProc> } {
  const proc = fakeProc();
  return {
    binaryPath: '/fake/supermemory-server',
    dataDir: '/fake/data',
    llmEnv: { OPENAI_API_KEY: 'ollama', OPENAI_BASE_URL: 'http://localhost:11434/v1' },
    spawn: vi.fn(() => proc),
    readToken: vi.fn(async () => 'sm_token123'),
    fetch: healthAfter(0),
    isPortFree: vi.fn(async () => true),
    delay: async () => {}, // no real waiting in tests
    pollIntervalMs: 1,
    ...over,
    proc,
  };
}

describe('SupermemoryDaemon', () => {
  it('spawns, waits for health, reads the token, and exposes baseUrl', async () => {
    const deps = makeDeps({ fetch: healthAfter(2) }); // refuses twice, then up
    const daemon = new SupermemoryDaemon(deps);

    await daemon.start();

    expect(daemon.isRunning()).toBe(true);
    expect(daemon.baseUrl()).toBe('http://127.0.0.1:6767');
    expect(daemon.token()).toBe('sm_token123');
    expect(deps.spawn).toHaveBeenCalledOnce();
    // The mandatory LLM env + data dir + chosen port are passed through.
    const [bin, , env] = (deps.spawn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(bin).toBe('/fake/supermemory-server');
    expect(env).toMatchObject({
      OPENAI_API_KEY: 'ollama',
      SUPERMEMORY_DATA_DIR: '/fake/data',
      PORT: '6767',
    });
  });

  it('scans upward for a free port when the base port is taken', async () => {
    const isPortFree = vi.fn(async (_h: string, p: number) => p >= 6769);
    const daemon = new SupermemoryDaemon(makeDeps({ isPortFree }));

    await daemon.start();

    expect(daemon.baseUrl()).toBe('http://127.0.0.1:6769');
  });

  it('is idempotent — a second start does not spawn again', async () => {
    const deps = makeDeps();
    const daemon = new SupermemoryDaemon(deps);

    await daemon.start();
    await daemon.start();

    expect(deps.spawn).toHaveBeenCalledOnce();
  });

  it('throws ETIMEDOUT and stops if health never comes up', async () => {
    const deps = makeDeps({ fetch: healthAfter(999), maxHealthAttempts: 3 });
    const daemon = new SupermemoryDaemon(deps);

    await expect(daemon.start()).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    expect(daemon.isRunning()).toBe(false);
    expect(deps.proc.killed).toBe(true);
  });

  it('throws EADDRINUSE when no port in range is free', async () => {
    const daemon = new SupermemoryDaemon(makeDeps({ isPortFree: vi.fn(async () => false) }));
    await expect(daemon.start()).rejects.toMatchObject({ code: 'EADDRINUSE' });
    expect(daemon.isRunning()).toBe(false);
  });

  it('stop() kills the process and clears state', async () => {
    const deps = makeDeps();
    const daemon = new SupermemoryDaemon(deps);
    await daemon.start();

    daemon.stop();

    expect(deps.proc.killed).toBe(true);
    expect(daemon.isRunning()).toBe(false);
    expect(daemon.baseUrl()).toBeNull();
    expect(daemon.token()).toBeNull();
  });

  it('clears state when the process exits on its own', async () => {
    const deps = makeDeps();
    const daemon = new SupermemoryDaemon(deps);
    await daemon.start();

    deps.proc.fireExit();

    expect(daemon.isRunning()).toBe(false);
  });
});
