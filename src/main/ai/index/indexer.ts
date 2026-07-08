import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type { IndexProgress, IndexState } from '@shared/types';
import type { AiProvider } from '../providers/types';
import * as aiIndex from '../../db/aiIndex';
import * as jobs from '../../db/indexJobs';
import type { IndexJob } from '../../db/indexJobs';
import type { VectorStore } from './vectorStore';
import type { KeywordStore } from './keywordStore';
import { extractText, isExtractable, isImage } from './extract';
import { chunk, OVERLAP, TARGET_TOKENS, WINDOW } from './chunk';
import { hasCodebaseMarker, isCodebaseBuildDir, isCodebaseDoc, isIgnored, isUnder } from './ignore';

/**
 * The background indexer: crawl the configured roots, extract + chunk text,
 * embed it via the active AiProvider, and persist vectors. It drains the
 * persistent `index_jobs` queue as a two-stage pipeline — while one file's
 * embedding runs in the model utilityProcess, the next file's I/O (stat, hash,
 * extract, chunk) proceeds in parallel — yielding between files so the main
 * process stays responsive. A single bad file is marked errored and skipped,
 * never fatal. Dependencies are injected so tests drive it with a fake provider
 * and an in-memory emit, no Electron required.
 */

const MAX_DEPTH = 64;
const EMIT_INTERVAL_MS = 120;
/** Queue jobs fetched per pipeline round (prepare runs one file ahead of commit). */
const PIPELINE_DEPTH = 4;
/**
 * Chunks per embed request. A book-size PDF yields hundreds of chunks; sent as
 * one giant request it monopolises the worker for minutes (starving interactive
 * search) and can blow the WASM heap, killing the worker and erroring every
 * in-flight job. Small batches keep the worker responsive and failures scoped.
 */
const EMBED_BATCH = 16;

/**
 * Bump this when chunking or extraction logic changes. Any file whose stored
 * indexVersion doesn't match triggers a re-embed on the next run, even if its
 * mtime/size/model haven't changed (see isStale for how much v1→v2 re-runs).
 *
 * v2: files whose content can't be extracted get a filename-fallback chunk
 * instead of vanishing from the index entirely.
 */
export const INDEX_VERSION = 2;

/** How many bytes to sample from the start and end of a large file for the hash. */
const HASH_SAMPLE = 65_536; // 64 KB

/**
 * The filename as searchable text — separators flattened to spaces so
 * "Modern_Angular_….pdf" embeds and BM25-tokenizes like the phrase it is.
 * Used as the fallback chunk for files whose content can't be extracted.
 */
function nameChunkText(path: string): string {
  return basename(path).replace(/[_\-.,()[\]{}+]+/g, ' ').replace(/\s+/g, ' ').trim();
}

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
  if (prev.indexVersion !== INDEX_VERSION) {
    // v1 → v2 only added filename-fallback chunks for files whose content
    // couldn't be extracted ('skipped'); files with real content chunks are
    // untouched by it, so spare them the full re-embed. Any other version gap
    // re-runs everything.
    return prev.indexVersion !== 1 || prev.status === 'skipped';
  }
  return prev.mtime !== stat.mtimeMs || prev.size !== stat.size || prev.modelId !== modelId;
}

/** Result of the pipeline's prepare stage (never a rejection — see drain()). */
type Prep =
  | { kind: 'remove' } // drop from the index: deleted, excluded, or no longer indexable
  | { kind: 'done' } // nothing to embed: fresh, or a metadata-only touch already recorded
  | { kind: 'image'; modelId: string; stat: { mtimeMs: number; size: number } }
  | { kind: 'text'; modelId: string; chunks: { chunkIx: number; text: string }[]; state: IndexState }
  | { kind: 'error'; error: unknown };

export interface IndexerDeps {
  /** The active embedding provider, or null when none is configured. */
  provider: () => Promise<AiProvider | null>;
  /** Model id for text/document content. */
  textModel: string;
  /** Model id for images (CLIP). */
  imageModel: string;
  /** Current roots + exclusions (paths and, optionally, file extensions). */
  config: () => Promise<{ roots: string[]; excludes: string[]; excludeExtensions?: string[] }>;
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
  /**
   * In-memory BM25 index kept in sync alongside the vector store. Optional
   * so tests that don't care about keyword search don't need to supply it.
   */
  keywordStore?: KeywordStore;
  /** Whether to skip a path (defaults to the built-in ignore rules). */
  ignore?: (path: string, excludes: readonly string[]) => boolean;
  /**
   * Rest between units of embedding work. Called with how long the unit took;
   * the production wiring (index/handlers.ts) duty-cycles on user activity and
   * battery so a long index run never heats a laptop someone is typing on.
   */
  pace?: (elapsedMs: number) => Promise<void>;
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
  private excludeExts = new Set<string>();
  private roots: string[] = [];
  /** Per-run cache: does this directory contain a codebase marker? */
  private readonly codebaseDirs = new Map<string, boolean>();
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

    const { roots, excludes, excludeExtensions } = await this.deps.config();
    this.excludes = excludes;
    this.excludeExts = new Set(excludeExtensions ?? []);
    this.roots = roots;
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
    const { roots, excludes, excludeExtensions } = await this.deps.config();
    this.excludes = excludes;
    this.excludeExts = new Set(excludeExtensions ?? []);
    this.roots = roots;
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
    this.deps.vectorStore.clear?.();
    this.deps.keywordStore?.clear();
    this.resetCounters();
    this.state = 'idle';
    this.emit(true);
  }

  // --- internals -----------------------------------------------------------

  private resetCounters(): void {
    this.codebaseDirs.clear();
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

    const walk = async (dir: string, depth: number, inCodebase: boolean): Promise<void> => {
      if (depth > MAX_DEPTH || this.paused) return;
      let dirents;
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // unreadable directory — skip
      }
      // A codebase marker anywhere in the ancestry flips the subtree to
      // docs-only. The root itself is exempt: roots are deliberate choices, and
      // a stray package.json in the home dir shouldn't demote the whole crawl.
      const codebase = inCodebase || (depth > 0 && hasCodebaseMarker(dirents.map((d) => d.name)));
      for (const dirent of dirents) {
        if (this.paused) return;
        const full = join(dir, dirent.name);
        if (dirent.isSymbolicLink() || this.ignore(full, excludes)) continue;
        if (dirent.isDirectory()) {
          // Build output inside a codebase holds only generated copies of docs.
          if (codebase && isCodebaseBuildDir(dirent.name)) continue;
          await walk(full, depth + 1, codebase);
          continue;
        }
        if (!dirent.isFile() || !this.indexable(full)) continue;
        if (codebase && !isCodebaseDoc(full)) continue;
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

    await walk(root, 0, false);
    if (changed.length) await jobs.enqueueMany(changed, 'upsert');

    // Anything we had indexed under this root but didn't see is gone or now
    // excluded — queue it for removal.
    const gone = [...states.keys()].filter((p) => !seen.has(p));
    if (gone.length) await jobs.enqueueMany(gone, 'remove');
  }

  /**
   * Process the queue until empty or paused. Two-stage pipeline: `prepare`
   * (I/O — stat, hash, extract, chunk) runs one file ahead of `commit`
   * (embedding in the worker process + DB writes), so disk and inference
   * overlap instead of serialising.
   */
  private async drain(provider: AiProvider): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    this.state = 'indexing';
    this.emit(true);
    try {
      while (!this.paused) {
        const batch = await jobs.nextPending(PIPELINE_DEPTH);
        if (batch.length === 0) break;
        // prepare() never rejects — failures surface as { kind: 'error' } — so
        // the lookahead promise can sit unawaited without tripping Node's
        // unhandled-rejection handling.
        let next = this.prepare(batch[0]);
        for (let i = 0; i < batch.length && !this.paused; i++) {
          const job = batch[i];
          this.currentFile = job.path;
          const prep = await next;
          if (i + 1 < batch.length) next = this.prepare(batch[i + 1]);
          try {
            await this.commit(job, prep, provider);
            await jobs.done(job.path);
          } catch (err) {
            // Surface the reason — the UI only shows a count, and "why did
            // this file fail" is the first debugging question.
            console.warn(
              '[fildos] indexing failed:',
              job.path,
              err instanceof Error ? err.message : err,
            );
            await jobs.markError(job.path);
            this.errors++;
          }
          this.indexed++;
          this.emit();
          // Yield so IPC and the UI stay responsive between files.
          await new Promise((r) => setImmediate(r));
        }
      }
    } finally {
      this.draining = false;
    }
    this.currentFile = null;
    this.state = this.paused ? 'paused' : 'idle';
    this.emit(true);
  }

  /**
   * Stage 1: everything up to (but excluding) embedding — validity checks,
   * staleness, content hash, extraction and chunking. Never throws; errors are
   * carried in the result so drain()'s lookahead can't leak a rejection.
   */
  private async prepare(job: IndexJob): Promise<Prep> {
    try {
      const { path } = job;
      if (job.op === 'remove') return { kind: 'remove' };

      let stat;
      try {
        stat = await fs.stat(path);
      } catch {
        return { kind: 'remove' }; // vanished since enqueue
      }
      if (!stat.isFile() || !this.indexable(path) || this.ignore(path, this.excludes)) {
        return { kind: 'remove' }; // no longer indexable
      }
      // The crawl already skips non-doc files in codebases, but jobs can arrive
      // from an older session — re-check against the file's ancestors.
      if (!isCodebaseDoc(path) && (await this.inCodebase(path))) return { kind: 'remove' };

      const modelId = this.modelFor(path);
      const prev = await aiIndex.getState(path);
      if (!isStale(prev, stat, modelId)) return { kind: 'done' };

      // Images: one CLIP embedding per file, labelled by its name (the snippet).
      // No content hash — CLIP re-embed is cheap and the basename snippet can't
      // change without the file moving.
      if (isImage(path)) return { kind: 'image', modelId, stat };

      // For text files, compute a content hash and skip re-embedding when only
      // metadata changed (mtime bumped by git/sync/backup, bytes unchanged).
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
        return { kind: 'done' };
      }

      const text = await extractText(path);

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
            windowChars = Math.min(WINDOW, Math.max(Math.floor(TARGET_TOKENS * charsPerToken * 0.85), 256));
            overlapChars = Math.floor(windowChars / 8);
          }
        } catch {
          // Fall through to char-approx defaults.
        }
      }
      let chunks: { chunkIx: number; text: string }[] =
        text === null ? [] : chunk(text, windowChars, overlapChars);
      if (chunks.length === 0) {
        // Content can't be read (oversized, parse failure, scanned PDF with no
        // text layer) or is empty — index the humanized filename instead, so
        // the file is still findable by name through both search lanes.
        chunks = [{ chunkIx: 0, text: nameChunkText(path) }];
      }
      return {
        kind: 'text',
        modelId,
        chunks,
        state: this.stateFor(path, stat, modelId, text === null ? 'skipped' : 'indexed', contentHash),
      };
    } catch (error) {
      return { kind: 'error', error };
    }
  }

  /** Stage 2: embed and persist a prepared file. Throws on failure so drain() can retry. */
  private async commit(job: IndexJob, prep: Prep, provider: AiProvider): Promise<void> {
    const { path } = job;
    if (prep.kind === 'error') throw prep.error;
    if (prep.kind === 'done') return;
    if (prep.kind === 'remove') {
      // Route through the vector store so its in-memory cache stays coherent
      // (it deletes the index_state row, and chunks cascade away).
      await this.deps.vectorStore.remove([path]);
      this.deps.keywordStore?.remove([path]);
      return;
    }

    await this.ensureModel(provider, prep.modelId);

    if (prep.kind === 'image') {
      const t0 = Date.now();
      const [embedding] = await provider.embedImages(prep.modelId, [path]);
      await this.deps.pace?.(Date.now() - t0);
      await aiIndex.upsertState(this.stateFor(path, prep.stat, prep.modelId, embedding ? 'indexed' : 'skipped'));
      await this.deps.vectorStore.upsert(
        path,
        embedding ? [{ chunkIx: 0, text: basename(path), embedding, modelId: prep.modelId }] : [],
      );
      return;
    }

    await aiIndex.upsertState(prep.state);
    if (prep.chunks.length === 0) {
      await this.deps.vectorStore.upsert(path, []); // clear any stale chunks
      this.deps.keywordStore?.remove([path]);
      return;
    }
    const vectors: Float32Array[] = [];
    for (let i = 0; i < prep.chunks.length; i += EMBED_BATCH) {
      const batch = prep.chunks.slice(i, i + EMBED_BATCH);
      const t0 = Date.now();
      vectors.push(...(await provider.embed(prep.modelId, batch.map((c) => c.text), 'passage')));
      await this.deps.pace?.(Date.now() - t0);
    }
    await this.deps.vectorStore.upsert(
      path,
      prep.chunks.map((c, i) => ({ chunkIx: c.chunkIx, text: c.text, embedding: vectors[i], modelId: prep.modelId })),
    );
    this.deps.keywordStore?.upsert(
      path,
      prep.chunks.map((c) => ({ chunkIx: c.chunkIx, text: c.text })),
    );
  }

  /** Cached "does this directory contain a codebase marker?" lookup (per run). */
  private async dirHasMarker(dir: string): Promise<boolean> {
    const cached = this.codebaseDirs.get(dir);
    if (cached !== undefined) return cached;
    let marked = false;
    try {
      marked = hasCodebaseMarker(await fs.readdir(dir));
    } catch {
      // unreadable — treat as unmarked
    }
    this.codebaseDirs.set(dir, marked);
    return marked;
  }

  /**
   * True when `path` sits inside a code project: an ancestor directory — up to,
   * but not including, its crawl root — carries a codebase marker. Mirrors the
   * crawl's descent rule for files that arrive via the persistent queue.
   */
  private async inCodebase(path: string): Promise<boolean> {
    const root = this.roots.find((r) => isUnder(path, r));
    for (let dir = dirname(path); dir !== root; ) {
      if (await this.dirHasMarker(dir)) return true;
      const parent = dirname(dir);
      if (parent === dir) break; // filesystem root
      dir = parent;
    }
    return false;
  }

  /**
   * A file is indexable if its text can be extracted or it's an image (CLIP),
   * and its extension isn't on the user's "don't index these types" list.
   */
  private indexable(path: string): boolean {
    if (this.excludeExts.has(extname(path).slice(1).toLowerCase())) return false;
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
