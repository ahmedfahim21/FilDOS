import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import type { IndexProgress, IndexState } from '@shared/types';
import type { AiProvider } from '../providers/types';
import * as aiIndex from '../../db/aiIndex';
import * as jobs from '../../db/indexJobs';
import type { IndexJob } from '../../db/indexJobs';
import type { VectorStore } from './vectorStore';
import { extractText, isExtractable, isImage } from './extract';
import { chunk, OVERLAP, TARGET_TOKENS, WINDOW } from './chunk';
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

/**
 * Bump this when chunking or extraction logic changes. Any file whose stored
 * indexVersion doesn't match triggers a full re-embed on the next run, even
 * if its mtime/size/model haven't changed.
 */
export const INDEX_VERSION = 1;

/** How many bytes to sample from the start and end of a large file for the hash. */
const HASH_SAMPLE = 65_536; // 64 KB

/**
 * Cheap content hash: SHA-256 of the first+last 64 KB (or the whole file when
 * smaller). Truncated to 16 hex chars — more than enough for change detection.
 * Used to distinguish a real content change from a metadata-only mtime bump
 * (git checkout, cloud-sync re-stat, backup restore) so we skip re-embedding when
 * the bytes haven't actually changed.
 */
async function computeContentHash(path: string, stat: { size: number }): Promise<string> {
  const fh = await fs.open(path, 'r');
  try {
    const h = createHash('sha256');
    if (stat.size <= HASH_SAMPLE * 2) {
      const buf = Buffer.allocUnsafe(stat.size);
      await fh.read(buf, 0, stat.size, 0);
      h.update(buf);
    } else {
      const first = Buffer.allocUnsafe(HASH_SAMPLE);
      const last = Buffer.allocUnsafe(HASH_SAMPLE);
      await fh.read(first, 0, HASH_SAMPLE, 0);
      await fh.read(last, 0, HASH_SAMPLE, stat.size - HASH_SAMPLE);
      h.update(first).update(last);
    }
    return h.digest('hex').slice(0, 16);
  } finally {
    await fh.close();
  }
}

/**
 * True when a file needs to be re-embedded: no prior state, previous run
 * errored, mtime/size/model changed, or the indexer version changed. Single
 * source of truth — both the crawl phase (bulk in-memory compare) and the
 * process phase (double-check just before embedding) use this function.
 */
export function isStale(
  prev: IndexState | null | undefined,
  stat: { mtimeMs: number; size: number },
  modelId: string,
): boolean {
  if (!prev || prev.status === 'error') return true;
  if (prev.indexVersion !== INDEX_VERSION) return true;
  return prev.mtime !== stat.mtimeMs || prev.size !== stat.size || prev.modelId !== modelId;
}

export interface IndexerDeps {
  /** The active embedding provider, or null when none is configured. */
  provider: () => Promise<AiProvider | null>;
  /** Model id for text/document content. */
  textModel: string;
  /** Model id for images (CLIP). */
  imageModel: string;
  /** Current roots + exclusions. */
  config: () => Promise<{ roots: string[]; excludes: string[] }>;
  /** Where embedded chunks are persisted. */
  vectorStore: VectorStore;
  /** Push a progress snapshot to the renderer (or capture it in tests). */
  emit: (progress: IndexProgress) => void;
  /**
   * Count tokens for texts using the model's tokenizer (no inference). When
   * present the indexer uses it to calibrate chunk window size per file so
   * dense code or non-Latin text stays within the model's actual token limit.
   */
  countTokens?: (modelId: string, texts: string[]) => Promise<number[]>;
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
  /** Models confirmed downloaded during the current run (avoids repeat calls). */
  private readonly ensured = new Set<string>();
  private lastEmit = 0;
  private readonly ignore: (path: string, excludes: readonly string[]) => boolean;

  constructor(private readonly deps: IndexerDeps) {
    this.ignore = deps.ignore ?? isIgnored;
  }

  /** The model that should embed a given file: CLIP for images, else the text model. */
  private modelFor(path: string): string {
    return isImage(path) ? this.deps.imageModel : this.deps.textModel;
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

    const { roots, excludes } = await this.deps.config();
    this.excludes = excludes;
    this.ensured.clear();
    this.resetCounters();
    if (!silent) {
      this.state = 'scanning';
      this.emit(true);
    }

    for (const root of roots) {
      if (this.paused) break;
      await this.crawlRoot(root, excludes);
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

    await this.drain(provider);
  }

  /**
   * Drain whatever is already queued, without re-crawling — for startup, where
   * we resume jobs left over from a previous session.
   */
  async resume(): Promise<void> {
    await jobs.resume(); // re-arm transient errors from last session
    if ((await jobs.countPending()) === 0) return;
    const provider = await this.deps.provider();
    if (!provider) return;

    this.resetCounters();
    this.paused = false;
    this.excludes = (await this.deps.config()).excludes;
    this.ensured.clear();
    this.total = await jobs.countPending();
    await this.drain(provider);
  }

  /** Make sure a model is downloaded before we embed with it (idempotent). */
  private async ensureModel(provider: AiProvider, modelId: string): Promise<void> {
    if (this.ensured.has(modelId)) return;
    await provider.download(modelId);
    this.ensured.add(modelId);
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
  private async crawlRoot(root: string, excludes: string[]): Promise<void> {
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
        if (!dirent.isFile() || !this.indexable(full)) continue;
        this.scanned++;
        seen.add(full);
        let stat;
        try {
          stat = await fs.stat(full);
        } catch {
          continue;
        }
        if (isStale(states.get(full), stat, this.modelFor(full))) {
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
  private async drain(provider: AiProvider): Promise<void> {
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
          await this.process(job, provider);
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
  private async process(job: IndexJob, provider: AiProvider): Promise<void> {
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
    if (!stat.isFile() || !this.indexable(path) || this.ignore(path, this.excludes)) {
      await aiIndex.remove([path]); // no longer indexable
      return;
    }

    const modelId = this.modelFor(path);
    const prev = await aiIndex.getState(path);
    if (!isStale(prev, stat, modelId)) return;

    // For text files, compute a content hash and skip re-embedding when only
    // metadata changed (mtime bumped by git/sync/backup, bytes unchanged).
    // Images are skipped — CLIP re-embed is cheap and the basename snippet
    // can't change without the file moving.
    if (!isImage(path)) {
      let contentHash: string | null = null;
      try { contentHash = await computeContentHash(path, stat); } catch { /* ignore */ }
      if (
        contentHash !== null &&
        prev?.status !== 'error' &&
        prev?.indexVersion === INDEX_VERSION &&
        prev?.modelId === modelId &&
        prev?.contentHash !== null &&
        contentHash === prev.contentHash
      ) {
        // Metadata-only touch — update bookkeeping without re-embedding.
        await aiIndex.upsertState({ ...prev, mtime: stat.mtimeMs, size: stat.size, contentHash, indexedAt: Date.now() });
        return;
      }
    }

    await this.ensureModel(provider, modelId);

    // Images: one CLIP embedding per file, labelled by its name (the snippet).
    if (isImage(path)) {
      const [embedding] = await provider.embedImages(modelId, [path]);
      await aiIndex.upsertState(this.stateFor(path, stat, modelId, embedding ? 'indexed' : 'skipped'));
      await this.deps.vectorStore.upsert(
        path,
        embedding ? [{ chunkIx: 0, text: basename(path), embedding, modelId }] : [],
      );
      return;
    }

    let contentHash: string | null = null;
    try { contentHash = await computeContentHash(path, stat); } catch { /* ignore */ }

    const text = await extractText(path);
    await aiIndex.upsertState(this.stateFor(path, stat, modelId, text === null ? 'skipped' : 'indexed', contentHash));

    // Calibrate the chunk window for this file's actual token density. A 1000-char
    // sample is enough to determine chars/token; dense code or CJK runs ~2 chars/token
    // vs ~4 for English prose, so the default 2048-char window can silently double the
    // model's 512-token limit without this adjustment.
    let windowChars = WINDOW;
    let overlapChars = OVERLAP;
    if (text !== null && this.deps.countTokens) {
      const sample = text.slice(0, Math.min(text.length, 1000));
      try {
        const [sampleTokens] = await this.deps.countTokens(modelId, [sample]);
        if (sampleTokens > 0) {
          const charsPerToken = sample.length / sampleTokens;
          windowChars = Math.max(Math.floor(TARGET_TOKENS * charsPerToken * 0.85), 256);
          overlapChars = Math.floor(windowChars / 8);
        }
      } catch {
        // Fall through to char-approx defaults.
      }
    }
    const chunks = text === null ? [] : chunk(text, windowChars, overlapChars);
    if (chunks.length === 0) {
      await this.deps.vectorStore.upsert(path, []); // clear any stale chunks
      return;
    }
    const vectors = await provider.embed(
      modelId,
      chunks.map((c) => c.text),
      'passage',
    );
    await this.deps.vectorStore.upsert(
      path,
      chunks.map((c, i) => ({ chunkIx: c.chunkIx, text: c.text, embedding: vectors[i], modelId })),
    );
  }

  /** A file is indexable if its text can be extracted, or it's an image (CLIP). */
  private indexable(path: string): boolean {
    return isExtractable(path) || isImage(path);
  }

  private stateFor(
    path: string,
    stat: { mtimeMs: number; size: number },
    modelId: string,
    status: IndexState['status'],
    contentHash: string | null = null,
  ): IndexState {
    return {
      path,
      mtime: stat.mtimeMs,
      size: stat.size,
      contentHash,
      modelId,
      indexVersion: INDEX_VERSION,
      indexedAt: Date.now(),
      status,
    };
  }
}
