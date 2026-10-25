import { extractPdfPages, extractText, type PdfPages } from './extract';

/** Reads a file's text: in a watched utilityProcess in the app, in-process in tests and evals. */
export interface Extractor {
  text(path: string): Promise<string | null>;
  pdfPages(path: string, from?: number, to?: number): Promise<PdfPages | null>;
}

export const inProcessExtractor: Extractor = { text: extractText, pdfPages: extractPdfPages };

export type ExtractRequest = { op: 'text'; path: string } | { op: 'pdfPages'; path: string; from?: number; to?: number };

export type ExtractReply = { id: number; ok: true; data: unknown } | { id: number; ok: false; error: { code: string; message: string } };

/** What the client needs of a utilityProcess (injected, so tests drive a fake). */
export interface ExtractWorker {
  postMessage(message: ExtractRequest & { id: number }): void;
  on(event: 'message', listener: (reply: ExtractReply) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  kill(): boolean;
}

/** One read never takes longer than this; past it the worker is killed. */
export const EXTRACT_TIMEOUT_MS = 120_000;
/** Close the worker after this long without work. */
const IDLE_MS = 60_000;
/** A read the worker died during is sent once more on a fresh one; a second death fails it. */
const MAX_ATTEMPTS = 2;

interface Pending {
  req: ExtractRequest;
  attempts: number;
  timer: NodeJS.Timeout | null;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

/**
 * The watchdog around the extraction worker. pdfjs and mammoth parse
 * untrusted files; a runaway one is now a killed child process, not a stalled
 * or out-of-memory main process. A read past `timeoutMs` kills the worker and
 * fails with ETIMEDOUT. When the worker dies on its own (heap cap, crash),
 * the reads in flight retry once on a fresh worker: the file that killed it
 * fails on its second try, and the files that only shared the worker with it
 * succeed.
 */
export class ExtractClient implements Extractor {
  private worker: ExtractWorker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private idle: NodeJS.Timeout | null = null;
  /** The request a timeout killed the worker for: it fails, the rest retry. */
  private timedOut: { id: number; error: Error } | null = null;

  constructor(
    private readonly spawn: () => ExtractWorker,
    private readonly opts: { timeoutMs: number; idleMs: number } = { timeoutMs: EXTRACT_TIMEOUT_MS, idleMs: IDLE_MS },
  ) {}

  text(path: string): Promise<string | null> {
    return this.request({ op: 'text', path }) as Promise<string | null>;
  }

  pdfPages(path: string, from?: number, to?: number): Promise<PdfPages | null> {
    return this.request({ op: 'pdfPages', path, from, to }) as Promise<PdfPages | null>;
  }

  /** Stop the worker (it starts again on the next read). */
  close(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    this.worker?.kill();
  }

  private ensureWorker(): ExtractWorker {
    if (this.worker) return this.worker;
    const worker = this.spawn();
    worker.on('message', (reply) => this.onReply(reply));
    worker.on('exit', (code) => this.onExit(worker, code));
    this.worker = worker;
    return worker;
  }

  private request(req: ExtractRequest): Promise<unknown> {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const p: Pending = { req, attempts: 0, timer: null, resolve, reject };
      this.pending.set(id, p);
      this.send(id, p);
    });
  }

  private send(id: number, p: Pending): void {
    p.attempts++;
    p.timer = setTimeout(() => {
      console.warn(`[fildos] extraction took over ${this.opts.timeoutMs / 1000} s, stopping its worker:`, p.req.path);
      const error = Object.assign(new Error(`Reading this file took over ${this.opts.timeoutMs / 1000} s; it was stopped.`), {
        code: 'ETIMEDOUT',
      });
      this.timedOut = { id, error };
      this.worker?.kill();
    }, this.opts.timeoutMs);
    this.ensureWorker().postMessage({ id, ...p.req });
  }

  private settle(id: number): Pending | undefined {
    const p = this.pending.get(id);
    if (!p) return undefined;
    if (p.timer) clearTimeout(p.timer);
    this.pending.delete(id);
    if (this.pending.size === 0) this.scheduleIdle();
    return p;
  }

  private onReply(reply: ExtractReply): void {
    const p = this.settle(reply.id);
    if (!p) return;
    if (reply.ok) p.resolve(reply.data);
    else p.reject(Object.assign(new Error(reply.error.message), { code: reply.error.code }));
  }

  private onExit(worker: ExtractWorker, code: number): void {
    if (this.worker === worker) this.worker = null;
    const killed = this.timedOut;
    this.timedOut = null;
    if (!this.pending.size) return;
    if (!killed) console.error(`[fildos] extraction worker exited (code ${code}) with ${this.pending.size} read(s) pending`);
    for (const [id, p] of [...this.pending]) {
      if (p.timer) clearTimeout(p.timer);
      p.timer = null;
      if (killed?.id === id) {
        this.settle(id);
        p.reject(killed.error);
      } else if (p.attempts >= MAX_ATTEMPTS) {
        this.settle(id);
        p.reject(Object.assign(new Error(`Reading this file stopped its worker (exit code ${code}); it may be too large or malformed.`), { code: 'EEXTRACT' }));
      } else {
        this.send(id, p);
      }
    }
  }

  private scheduleIdle(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      this.idle = null;
      if (this.pending.size === 0) this.worker?.kill();
    }, this.opts.idleMs);
    this.idle.unref?.();
  }
}
