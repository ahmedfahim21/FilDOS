import { createServer } from 'node:net';

/**
 * Lifecycle manager for the bundled self-hosted supermemory daemon
 * (`supermemory-server`, issue #39). The main process owns it exactly like the
 * embedding `utilityProcess`: start it after `initDb`, tear it down on quit. It
 * is a native binary (not a JS worker), so it's launched with `child_process`
 * rather than `utilityProcess.fork`.
 *
 * Everything external is injected — the spawner, `fetch`, the token reader, and
 * the port probe — so the whole start/health/stop flow is unit-tested without
 * launching a 192 MB binary or touching the network.
 *
 * Confirmed against a live v0.0.3 run: the daemon **refuses to start without a
 * model-provider key** (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`
 * / `GROQ_API_KEY`, or an Ollama-style `OPENAI_BASE_URL`), so `llmEnv` is
 * mandatory in practice. The port env/flag and token-file location are supplied
 * by the caller (`readToken`) and remain pending live confirmation.
 */

type FetchFn = typeof fetch;

/** The subset of `child_process.ChildProcess` this manager relies on. */
export interface DaemonProcess {
  readonly pid?: number;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(event: 'exit', listener: (code: number | null) => void): unknown;
  once(event: 'error', listener: (err: Error) => void): unknown;
}

export type Spawner = (
  binaryPath: string,
  args: string[],
  env: Record<string, string>,
) => DaemonProcess;

export interface SupermemoryDaemonDeps {
  /** Absolute path to the `supermemory-server` binary. */
  binaryPath: string;
  /** `$SUPERMEMORY_DATA_DIR` — under Electron `userData/` in production. */
  dataDir: string;
  host?: string;
  /** First port to try; scans upward if taken. Default 6767. */
  basePort?: number;
  /** LLM provider env the daemon needs to boot (key or Ollama base URL). */
  llmEnv?: Record<string, string>;
  /** Launches the binary; injected so tests never spawn anything. */
  spawn: Spawner;
  /** Reads the daemon's `sm_` bearer token from `dataDir` once it's up. */
  readToken: (dataDir: string) => Promise<string | null>;
  fetch?: FetchFn;
  isPortFree?: (host: string, port: number) => Promise<boolean>;
  /** Delay between health polls; injected as a no-op in tests. */
  delay?: (ms: number) => Promise<void>;
  healthPath?: string;
  maxHealthAttempts?: number;
  pollIntervalMs?: number;
}

const PORT_SCAN_RANGE = 20;

export class SupermemoryDaemon {
  private proc: DaemonProcess | null = null;
  private port: number | null = null;
  private tokenValue: string | null = null;
  private starting: Promise<void> | null = null;

  private readonly host: string;
  private readonly basePort: number;
  private readonly fetchFn: FetchFn;
  private readonly isPortFree: (host: string, port: number) => Promise<boolean>;
  private readonly delay: (ms: number) => Promise<void>;
  private readonly healthPath: string;
  private readonly maxHealthAttempts: number;
  private readonly pollIntervalMs: number;

  constructor(private readonly deps: SupermemoryDaemonDeps) {
    this.host = deps.host ?? '127.0.0.1';
    this.basePort = deps.basePort ?? 6767;
    this.fetchFn = deps.fetch ?? fetch;
    this.isPortFree = deps.isPortFree ?? defaultIsPortFree;
    this.delay = deps.delay ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.healthPath = deps.healthPath ?? '/';
    this.maxHealthAttempts = deps.maxHealthAttempts ?? 60;
    this.pollIntervalMs = deps.pollIntervalMs ?? 500;
  }

  isRunning(): boolean {
    return this.proc !== null && this.port !== null;
  }

  /** `http://host:port` once started, else null. */
  baseUrl(): string | null {
    return this.port === null ? null : `http://${this.host}:${this.port}`;
  }

  /** The `sm_` bearer token once read, else null. Main-process only. */
  token(): string | null {
    return this.tokenValue;
  }

  /** Start the daemon (idempotent; coalesces concurrent callers). */
  async start(): Promise<void> {
    if (this.isRunning()) return;
    if (this.starting) return this.starting;
    this.starting = this.doStart().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async doStart(): Promise<void> {
    const port = await this.findFreePort();
    const env: Record<string, string> = {
      ...(this.deps.llmEnv ?? {}),
      SUPERMEMORY_DATA_DIR: this.deps.dataDir,
      PORT: String(port),
      HOST: this.host,
    };

    const proc = this.deps.spawn(this.deps.binaryPath, [], env);
    proc.once('exit', () => {
      if (this.proc === proc) this.handleExit();
    });
    proc.once('error', () => {
      if (this.proc === proc) this.handleExit();
    });
    this.proc = proc;
    this.port = port;

    try {
      await this.waitForHealth(`http://${this.host}:${port}`);
      this.tokenValue = await this.deps.readToken(this.deps.dataDir);
    } catch (err) {
      this.stop();
      throw err;
    }
  }

  private handleExit(): void {
    this.proc = null;
    this.port = null;
    this.tokenValue = null;
  }

  /** Kill the daemon and clear state. Safe to call when not running. */
  stop(): void {
    const proc = this.proc;
    this.handleExit();
    if (proc) {
      try {
        proc.kill();
      } catch {
        /* already gone */
      }
    }
  }

  private async findFreePort(): Promise<number> {
    for (let p = this.basePort; p < this.basePort + PORT_SCAN_RANGE; p++) {
      if (await this.isPortFree(this.host, p)) return p;
    }
    throw Object.assign(
      new Error(`No free port near ${this.basePort} for the supermemory daemon.`),
      { code: 'EADDRINUSE' },
    );
  }

  private async waitForHealth(baseUrl: string): Promise<void> {
    for (let attempt = 0; attempt < this.maxHealthAttempts; attempt++) {
      try {
        const res = await this.fetchFn(`${baseUrl}${this.healthPath}`, { method: 'GET' });
        if (res && res.status < 500) return; // listening and not crashing
      } catch {
        /* connection refused — not up yet */
      }
      await this.delay(this.pollIntervalMs);
    }
    throw Object.assign(
      new Error('The supermemory daemon did not become healthy in time.'),
      { code: 'ETIMEDOUT' },
    );
  }
}

/** Default port probe: can we bind it? Used in production; injected in tests. */
function defaultIsPortFree(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}
