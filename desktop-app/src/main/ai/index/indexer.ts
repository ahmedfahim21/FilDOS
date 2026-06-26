import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { IndexProgress, IndexState } from '@shared/types';
import type { AiProvider } from '../providers/types';
import * as aiIndex from '../../db/aiIndex';
import * as jobs from '../../db/indexJobs';
import type { IndexJob } from '../../db/indexJobs';
import type { VectorStore } from './vectorStore';
import { extractText, isExtractable } from './extract';
import { chunk } from './chunk';
import { isIgnored } from './ignore';

/**
 * The background indexer: crawl the configured roots, extract + chunk text,
 * embed it via the active AiProvider, and persist vectors. It drains the
 * persistent `index_jobs` queue one file at a time, yielding between files so
 * the main process stays responsive (the heavy embedding already runs in the
 * model utilityProcess). A single bad file is marked errored and skipped, never
 * fatal. Dependencies are injected so tests drive it with a fake provider and an
 * in-memory emit, no Electron required.
 */

const MAX_DEPTH = 64;
const EMIT_INTERVAL_MS = 120;

export interface IndexerDeps {
  /** The active embedding provider, or null when none is configured. */
  provider: () => Promise<AiProvider | null>;
  /** The active embedding model id. */
  modelId: () => Promise<string>;
  /** Current roots + exclusions. */
  config: () => Promise<{ roots: string[]; excludes: string[] }>;
  /** Where embedded chunks are persisted. */
  vectorStore: VectorStore;
  /** Push a progress snapshot to the renderer (or capture it in tests). */
  emit: (progress: IndexProgress) => void;
  /** Whether to skip a path (defaults to the built-in ignore rules). */
  ignore?: (path: string, excludes: readonly string[]) => boolean;
}

export class Indexer {
  private state: IndexProgress['state'] = 'idle';
  private scanned = 0;
  private total = 0;
  private indexed = 0;
  private errors = 0;
  private currentFile: string | null = null;
  private message?: string;

  private paused = false;
  private draining = false;
  private excludes: string[] = [];
  private lastEmit = 0;
  private readonly ignore: (path: string, excludes: readonly string[]) => boolean;

  constructor(private readonly deps: IndexerDeps) {
    this.ignore = deps.ignore ?? isIgnored;
  }

  /** Current progress snapshot. */
  status(): IndexProgress {
    return {
      state: this.state,
      scanned: this.scanned,
      total: this.total,
      indexed: this.indexed,
      errors: this.errors,
      currentFile: this.currentFile,
      message: this.message,
    };
  }

  /** Manual start (from Settings): announces progress and surfaces errors. */
  start(): Promise<void> {
    return this.run(false);
  }

  /**
   * Background reconcile (the watcher / periodic timer). Stays silent when the
   * model isn't ready or nothing changed, so a reconcile that finds no work
   * never flips the UI idle→scanning→indexing→idle.
   */
  reconcile(): Promise<void> {
    return this.run(true);
  }

  private async run(silent: boolean): Promise<void> {
    if (this.state === 'scanning' || this.state === 'indexing') return;
    this.paused = false;

    const provider = await this.deps.provider();
    if (!provider) {
      if (!silent) this.fail('No AI provider is configured.');
      return;
    }
    const modelId = await this.deps.modelId();
    if ((await provider.status(modelId)).state !== 'ready') {
      if (!silent) this.fail(`The model “${modelId}” isn’t downloaded yet — download it first.`);
      return;
    }

    const { roots, excludes } = await this.deps.config();
    this.excludes = excludes;
    this.resetCounters();
    if (!silent) {
      this.state = 'scanning';
      this.emit(true);
    }

    for (const root of roots) {
      if (this.paused) break;
      await this.crawlRoot(root, excludes, modelId);
    }
    this.total = await jobs.countPending();

    if (this.total === 0) {
      // Nothing to do. Settle to idle, but only announce it if we'd already
      // shown activity — a silent reconcile leaves the UI untouched.
      if (this.state !== 'idle') {
        this.state = 'idle';
        this.emit(true);
      }
      return;
    }

    await this.drain(modelId, provider);
  }

  /**
   * Drain whatever is already queued, without re-crawling — for startup, where
   * we resume jobs left over from a previous session. No-ops if the model isn't
   * ready yet (the jobs stay pending until the user starts indexing).
   */
  async resume(): Promise<void> {
    await jobs.resume(); // re-arm transient errors from last session
    if ((await jobs.countPending()) === 0) return;
    const provider = await this.deps.provider();
    if (!provider) return;
    const modelId = await this.deps.modelId();
    if ((await provider.status(modelId)).state !== 'ready') return;

    this.resetCounters();
    this.paused = false;
    this.excludes = (await this.deps.config()).excludes;
    this.total = await jobs.countPending();
    await this.drain(modelId, provider);
  }

  /** Stop processing; the queue is preserved and a later start() picks it up. */
  pause(): void {
    this.paused = true;
  }

  /** Forget the entire index and queue. */
  async clear(): Promise<void> {
    this.paused = true;
    await aiIndex.clearAll();
    await jobs.clearJobs();
    this.resetCounters();
    this.state = 'idle';
    this.emit(true);
  }

  // --- internals -----------------------------------------------------------

  private resetCounters(): void {
    this.scanned = 0;
    this.total = 0;
    this.indexed = 0;
    this.errors = 0;
    this.currentFile = null;
    this.message = undefined;
  }

  private fail(message: string): void {
    this.state = 'error';
    this.message = message;
    this.currentFile = null;
    this.emit(true);
  }

  private emit(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastEmit < EMIT_INTERVAL_MS) return;
    this.lastEmit = now;
    this.deps.emit(this.status());
  }

  /** Walk one root: enqueue new/changed files, queue removals for vanished ones. */
  private async crawlRoot(root: string, excludes: string[], modelId: string): Promise<void> {
    const states = new Map<string, IndexState>();
    for (const s of await aiIndex.statesUnder(root)) states.set(s.path, s);
    const seen = new Set<string>();
    let changed: string[] = [];

    const flush = async () => {
      if (changed.length >= 500) {
        await jobs.enqueueMany(changed, 'upsert');
        changed = [];
      }
    };

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > MAX_DEPTH || this.paused) return;
      let dirents;
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // unreadable directory — skip
      }
      for (const dirent of dirents) {
        if (this.paused) return;
        const full = join(dir, dirent.name);
        if (dirent.isSymbolicLink() || this.ignore(full, excludes)) continue;
        if (dirent.isDirectory()) {
          await walk(full, depth + 1);
          continue;
        }
        if (!dirent.isFile() || !isExtractable(full)) continue;
        this.scanned++;
        seen.add(full);
        let stat;
        try {
          stat = await fs.stat(full);
        } catch {
          continue;
        }
        const prev = states.get(full);
        if (
          !prev ||
          prev.status === 'error' ||
          prev.mtime !== stat.mtimeMs ||
          prev.size !== stat.size ||
          prev.modelId !== modelId
        ) {
          changed.push(full);
          await flush();
        }
        if (this.state === 'scanning' && this.scanned % 200 === 0) this.emit();
      }
    };

    await walk(root, 0);
    if (changed.length) await jobs.enqueueMany(changed, 'upsert');

    // Anything we had indexed under this root but didn't see is gone or now
    // excluded — queue it for removal.
    const gone = [...states.keys()].filter((p) => !seen.has(p));
    if (gone.length) await jobs.enqueueMany(gone, 'remove');
  }

  /** Process the queue until empty or paused. */
  private async drain(modelId: string, provider: AiProvider): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    this.state = 'indexing';
    this.emit(true);
    try {
      while (!this.paused) {
        const [job] = await jobs.nextPending(1);
        if (!job) break;
        this.currentFile = job.path;
        try {
          await this.process(job, modelId, provider);
          await jobs.done(job.path);
        } catch {
          await jobs.markError(job.path);
          this.errors++;
        }
        this.indexed++;
        this.emit();
        // Yield so IPC and the UI stay responsive between files.
        await new Promise((r) => setImmediate(r));
      }
    } finally {
      this.draining = false;
    }
    this.currentFile = null;
    this.state = this.paused ? 'paused' : 'idle';
    this.emit(true);
  }

  /** Index or remove a single file. Throws on failure so drain() can retry. */
  private async process(job: IndexJob, modelId: string, provider: AiProvider): Promise<void> {
    const { path } = job;
    if (job.op === 'remove') {
      await aiIndex.remove([path]);
      return;
    }

    let stat;
    try {
      stat = await fs.stat(path);
    } catch {
      await aiIndex.remove([path]); // vanished since enqueue
      return;
    }
    if (!stat.isFile() || !isExtractable(path) || this.ignore(path, this.excludes)) {
      await aiIndex.remove([path]); // no longer indexable
      return;
    }

    // Already current under this model — re-run is a no-op.
    const prev = await aiIndex.getState(path);
    if (
      prev &&
      prev.status !== 'error' &&
      prev.mtime === stat.mtimeMs &&
      prev.size === stat.size &&
      prev.modelId === modelId
    ) {
      return;
    }

    const text = await extractText(path);
    await aiIndex.upsertState({
      path,
      mtime: stat.mtimeMs,
      size: stat.size,
      contentHash: null,
      modelId,
      indexedAt: Date.now(),
      status: text === null ? 'skipped' : 'indexed',
    });

    const chunks = text === null ? [] : chunk(text);
    if (chunks.length === 0) {
      await this.deps.vectorStore.upsert(path, []); // clear any stale chunks
      return;
    }
    const vectors = await provider.embed(
      modelId,
      chunks.map((c) => c.text),
    );
    await this.deps.vectorStore.upsert(
      path,
      chunks.map((c, i) => ({ chunkIx: c.chunkIx, text: c.text, embedding: vectors[i], modelId })),
    );
  }
}
