import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import type {
  ChunkKind,
  ChunkVector,
  DecodedInput,
  IndexEstimate,
  IndexInfo,
  IndexProgress,
  IndexState,
} from '@shared/types';
import { secondsFor, unitsFor, type UnitKind, type Units } from './estimate';
import type { AiProvider } from '../providers/types';
import * as aiIndex from '../../db/aiIndex';
import * as jobs from '../../db/indexJobs';
import type { IndexJob } from '../../db/indexJobs';
import type { VectorStore } from './vectorStore';
import type { KeywordStore } from './keywordStore';
import { inProcessExtractor, type Extractor } from './extractClient';
import { isDataFile, isExtractable, isImage, isMedia, isMostlyNumeric, needsOsDecode } from './extract';
import { audioWindows, keepShots, type DecodedImage, type DecodedMedia } from '../../media/signals';
import { chunk, chunkPages, OVERLAP, TARGET_TOKENS, WINDOW } from './chunk';
import {
  hasCodebaseMarker,
  isCacheDirTag,
  isCodebaseBuildDir,
  isCodebaseDoc,
  isIgnored,
  isUnder,
  looksLikeDataset,
  visionBudget,
} from './ignore';

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
/** Frames or audio windows per embed request (each is hundreds of soft tokens). */
const MEDIA_BATCH = 4;

/**
 * Bump this when chunking or extraction logic changes. Any file whose stored
 * indexVersion doesn't match triggers a re-embed on the next run, even if its
 * mtime/size/model haven't changed (see isStale for how much v1→v2 re-runs).
 *
 * v2: files whose content can't be extracted get a filename-fallback chunk
 * instead of vanishing from the index entirely.
 * v3: EmbeddingGemma 2 (one space for text and pictures, titled passages);
 * pictures get a keyword entry; mostly-numeric text is keyword-only. The
 * index fingerprint wipes older indexes, so no migration path is kept.
 * v4: chunks know their place (PDF pages, kinds) and long files get a later
 * pass instead of being cut off.
 */
export const INDEX_VERSION = 4;

/**
 * Long files are read in two passes so a fresh index is useful fast: the
 * first pass reads a PDF's first FIRST_PASS_PAGES pages (a short PDF whole)
 * and a document's first FIRST_PASS_CHUNKS passages; once nothing else is
 * queued, the later pass reads the rest a step at a time (PASS_PAGES pages or
 * FIRST_PASS_CHUNKS passages per step). A book's last pages matter less than
 * every other file's first ones.
 */
export const FIRST_PASS_PAGES = 50;
export const PASS_PAGES = 30;
export const FIRST_PASS_CHUNKS = 40;

/** A chunk ready to embed, with what it is and where it sits. */
interface Piece {
  chunkIx: number;
  text: string;
  kind: ChunkKind;
  loc?: number;
}

/**
 * A PDF's page count, reading only its tail and catalog (no page is parsed);
 * null when it can't be opened (it'd be indexed by name only).
 */
async function pdfPageCount(extract: Extractor, path: string): Promise<number | null> {
  try {
    return (await extract.pdfPages(path, 1, 0))?.total ?? null;
  } catch (err) {
    console.info('[fildos] estimate: PDF unreadable, counting its name only:', path, String(err));
    return null;
  }
}

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
  if (prev.indexVersion !== INDEX_VERSION) return true;
  return prev.mtime !== stat.mtimeMs || prev.size !== stat.size || prev.modelId !== modelId;
}

/** Result of the pipeline's prepare stage (never a rejection — see drain()). */
type Prep =
  | { kind: 'remove' } // drop from the index: deleted, excluded, or no longer indexable
  | { kind: 'done' } // nothing to embed: fresh, or a metadata-only touch already recorded
  | { kind: 'image'; stat: { mtimeMs: number; size: number } }
  | { kind: 'media'; stat: { mtimeMs: number; size: number } }
  | { kind: 'text'; chunks: Piece[]; keywordOnly: boolean; state: IndexState }
  | { kind: 'error'; error: unknown };

export interface IndexerDeps {
  /** The active embedding provider, or null when none is configured. */
  provider: () => Promise<AiProvider | null>;
  /** The embedding model: one space for text and pictures. */
  model: string;
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
  /** Whether to skip a path (defaults to the built-in ignore rules, scoped below `root`). */
  ignore?: (path: string, excludes: readonly string[], root?: string) => boolean;
  /**
   * Rest between units of embedding work. Called with how long the unit took;
   * the production wiring (index/handlers.ts) duty-cycles on user activity and
   * battery so a long index run never heats a laptop someone is typing on.
   */
  pace?: (elapsedMs: number) => Promise<void>;
  /**
   * Decode an audio or video file (frames + mono 16 kHz sound). Electron's
   * Chromium in the app (`media/decoder.ts`); without it, media files aren't
   * indexed.
   */
  decodeMedia?: (path: string) => Promise<DecodedMedia>;
  /**
   * Milliseconds the indexer must wait before more work (0: go on) — "index
   * only at set hours" in the app. Asked between files.
   */
  gate?: () => Promise<number>;
  /** Model time a unit of work took (for estimates): `seconds` for `units` of `kind`. */
  recordCost?: (kind: UnitKind, seconds: number, units: number) => void;
  /** Seconds per unit to estimate the ETA with (measured costs, or seeds). */
  costs?: () => Promise<Units>;
  /**
   * Decode a picture the model runtime can't read (HEIC/HEIF) with the OS's
   * codecs (`media/osImage.ts`, macOS + Windows). Without it such pictures are
   * indexed by name only.
   */
  decodeImage?: (path: string) => Promise<DecodedImage>;
  /** Reads file text. The app's runs in a watched utilityProcess (`extractClient.ts`); default in-process. */
  extract?: Extractor;
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
  /** Dataset-like folders the current crawl skipped (reported in progress). */
  private datasets: string[] = [];
  /** When a gate holds the indexer back: the epoch ms it may run again. */
  private waitingUntil: number | undefined;
  /** This run's ETA bookkeeping: estimated seconds per queued path, done so far, wall time so far. */
  private eta: { perPath: Map<string, number>; total: number; done: number; started: number } | null = null;
  /** Per-run cache: does this directory contain a codebase marker? */
  private readonly codebaseDirs = new Map<string, boolean>();
  /** Models confirmed downloaded during the current run (avoids repeat calls). */
  private readonly ensured = new Set<string>();
  private lastEmit = 0;
  private readonly ignore: (path: string, excludes: readonly string[], root?: string) => boolean;

  private get extract(): Extractor {
    return this.deps.extract ?? inProcessExtractor;
  }

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
      datasets: this.datasets.length ? [...this.datasets] : undefined,
      waitingUntil: this.waitingUntil,
      etaSeconds: this.etaSeconds(),
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
    this.datasets = [];
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

    if (this.total === 0 && !(await this.hasPartialFiles())) {
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
    if ((await jobs.countPending()) === 0 && !(await this.hasPartialFiles())) return;
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

  private async hasPartialFiles(): Promise<boolean> {
    return (await aiIndex.partialStates()).length > 0;
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

  /**
   * Visit every file under `root` the indexer would read — the built-in and
   * user ignore rules, codebases (docs only, no build output), caches and
   * datasets all applied — with its stat. Shared by the crawl and the estimate.
   */
  private async walkRoot(
    root: string,
    excludes: string[],
    visit: (path: string, stat: { mtimeMs: number; size: number }) => Promise<void>,
    stop: () => boolean,
  ): Promise<void> {
    const walk = async (dir: string, depth: number, inCodebase: boolean): Promise<void> => {
      if (depth > MAX_DEPTH || stop()) return;
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
        if (stop()) return;
        const full = join(dir, dirent.name);
        if (dirent.isSymbolicLink() || this.ignore(full, excludes, root)) continue;
        if (dirent.isDirectory()) {
          // Build output inside a codebase holds only generated copies of docs.
          if (codebase && isCodebaseBuildDir(dirent.name)) continue;
          if (await this.isCacheOrDataset(full)) continue;
          await walk(full, depth + 1, codebase);
          continue;
        }
        if (!dirent.isFile() || !this.indexable(full)) continue;
        if (codebase && !isCodebaseDoc(full)) continue;
        let stat;
        try {
          stat = await fs.stat(full);
        } catch {
          continue;
        }
        await visit(full, stat);
      }
    };
    await walk(root, 0, false);
  }

  /** Walk one root: enqueue new/changed files, queue removals for vanished ones. */
  private async crawlRoot(root: string, excludes: string[]): Promise<void> {
    const states = new Map<string, IndexState>();
    for (const s of await aiIndex.statesUnder(root)) states.set(s.path, s);
    const seen = new Set<string>();
    let changed: string[] = [];

    await this.walkRoot(
      root,
      excludes,
      async (full, stat) => {
        this.scanned++;
        seen.add(full);
        if (isStale(states.get(full), stat, this.deps.model)) {
          changed.push(full);
          if (changed.length >= 500) {
            await jobs.enqueueMany(changed, 'upsert');
            changed = [];
          }
        }
        if (this.state === 'scanning' && this.scanned % 200 === 0) this.emit();
      },
      () => this.paused,
    );
    if (changed.length) await jobs.enqueueMany(changed, 'upsert');

    // Anything we had indexed under this root but didn't see is gone or now
    // excluded — queue it for removal.
    const gone = [...states.keys()].filter((p) => !seen.has(p));
    if (gone.length) await jobs.enqueueMany(gone, 'remove');
  }

  /**
   * How long indexing what's not yet indexed will take, from metadata alone:
   * the total and per folder (each root's first-level subfolders, plus the
   * files right in the root). Model time at `costs`; pacing adds to it while
   * the computer is in use.
   */
  async estimate(costs: Units): Promise<IndexEstimate> {
    const { roots, excludes, excludeExtensions } = await this.deps.config();
    this.excludeExts = new Set(excludeExtensions ?? []);
    const folders = new Map<string, { seconds: number; files: number }>();
    let seconds = 0;
    let files = 0;
    for (const root of roots) {
      const states = new Map<string, IndexState>();
      for (const st of await aiIndex.statesUnder(root)) states.set(st.path, st);
      await this.walkRoot(
        root,
        excludes,
        async (full, stat) => {
          if (!isStale(states.get(full), stat, this.deps.model)) return;
          const pages = extname(full).toLowerCase() === '.pdf' ? await pdfPageCount(this.extract, full) : undefined;
          const cost = secondsFor(unitsFor(full, stat.size, pages), costs);
          const rel = relative(root, full);
          const top = rel.includes(sep) ? join(root, rel.split(sep)[0]) : root;
          const f = folders.get(top) ?? { seconds: 0, files: 0 };
          folders.set(top, { seconds: f.seconds + cost, files: f.files + 1 });
          seconds += cost;
          files++;
        },
        () => false,
      );
    }
    return {
      seconds,
      files,
      folders: [...folders.entries()]
        .map(([path, f]) => ({ path, ...f }))
        .sort((a, b) => b.seconds - a.seconds),
    };
  }

  /**
   * Process the queue until empty or paused. Two-stage pipeline: `prepare`
   * (I/O — stat, hash, extract, chunk) runs one file ahead of `commit`
   * (embedding in the worker process + DB writes), so disk and inference
   * overlap instead of serialising. Once the queue is empty, the later pass
   * reads the rest of long files; new jobs interrupt it and go first.
   */
  private async drain(provider: AiProvider): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    this.state = 'indexing';
    this.emit(true);
    try {
      await this.startEta();
      for (;;) {
        await this.drainJobs(provider);
        if (this.paused) break;
        if ((await this.finishLongFiles(provider)) === 'done') break;
      }
    } finally {
      this.draining = false;
      this.eta = null;
    }
    this.currentFile = null;
    this.state = this.paused ? 'paused' : 'idle';
    this.emit(true);
  }

  /**
   * Wait while the gate holds indexing back, re-asking at least every minute
   * (so pausing, or a change to the hours, takes effect promptly).
   */
  private async holdForGate(): Promise<void> {
    if (!this.deps.gate) return;
    for (;;) {
      const ms = await this.deps.gate();
      if (ms <= 0 || this.paused) break;
      this.waitingUntil = Date.now() + ms;
      this.emit(true);
      await new Promise((r) => setTimeout(r, Math.min(ms, 60_000)));
    }
    if (this.waitingUntil !== undefined) {
      this.waitingUntil = undefined;
      this.emit(true);
    }
  }

  /**
   * Estimate the queued work at the start of a drain. The ETA then scales
   * what's left by how fast this run has actually gone (pacing, the machine's
   * load and all), once a few percent of it is done.
   */
  private async startEta(): Promise<void> {
    if (!this.deps.costs) return;
    const costs = await this.deps.costs();
    const perPath = new Map<string, number>();
    let total = 0;
    for (const path of await jobs.pendingPaths()) {
      const stat = await fs.stat(path).catch(() => null);
      const s = stat ? secondsFor(unitsFor(path, stat.size), costs) : 0;
      perPath.set(path, s);
      total += s;
    }
    this.eta = { perPath, total, done: 0, started: Date.now() };
  }

  private etaSeconds(): number | undefined {
    const e = this.eta;
    if (!e || e.total <= 0 || e.done < e.total * 0.03) return undefined;
    const elapsed = (Date.now() - e.started) / 1000;
    return Math.max(0, Math.round((e.total - e.done) * (elapsed / e.done)));
  }

  /** The first stage of `drain`: process queued jobs until none are left or paused. */
  private async drainJobs(provider: AiProvider): Promise<void> {
    while (!this.paused) {
      await this.holdForGate();
      if (this.paused) break;
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
          if (this.eta) this.eta.done += this.eta.perPath.get(job.path) ?? 0;
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
      const root = this.roots.find((r) => isUnder(path, r));
      if (!stat.isFile() || !this.indexable(path) || this.ignore(path, this.excludes, root)) {
        return { kind: 'remove' }; // no longer indexable
      }
      // The crawl already skips non-doc files in codebases, but jobs can arrive
      // from an older session — re-check against the file's ancestors.
      if (!isCodebaseDoc(path) && (await this.inCodebase(path))) return { kind: 'remove' };

      const modelId = this.deps.model;
      const prev = await aiIndex.getState(path);
      if (!isStale(prev, stat, modelId)) return { kind: 'done' };

      // Pictures: one embedding per file, keyword-searchable by name. No
      // content hash — the name can't change without the file moving.
      if (isImage(path)) return { kind: 'image', stat };
      // Audio/video: decoding is the expensive part and happens in commit.
      if (isMedia(path)) return { kind: 'media', stat };

      // For text files, compute a content hash and skip re-embedding when only
      // metadata changed (mtime bumped by git/sync/backup, bytes unchanged).
      // A file that can't be read for hashing errors the job like any read.
      const contentHash = await computeContentHash(path, stat);
      if (
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

      if (extname(path).toLowerCase() === '.pdf') return await this.preparePdf(path, stat, contentHash);

      const text = await this.extract.text(path);
      const { window, overlap } = await this.windowFor(text);
      const all = text === null ? [] : chunk(text, window, overlap);
      // Long documents: the first passages now, the rest in the later pass.
      const first = all.slice(0, FIRST_PASS_CHUNKS);
      const info: IndexInfo | null =
        all.length > FIRST_PASS_CHUNKS ? { chunks: all.length, chunksRead: FIRST_PASS_CHUNKS, nextChunkIx: FIRST_PASS_CHUNKS } : null;
      // Content can't be read (oversized, parse failure) or is empty — index
      // the humanized filename instead, so the file is still findable by name.
      const pieces: Piece[] = first.length
        ? first.map((c) => ({ chunkIx: c.chunkIx, text: c.text, kind: 'text' }))
        : [{ chunkIx: 0, text: nameChunkText(path), kind: 'name' }];
      const status: IndexState['status'] = text === null ? 'skipped' : info ? 'partial' : 'indexed';
      return {
        kind: 'text',
        chunks: pieces,
        // Data files and text that's mostly numbers (an export, a table of
        // readings) mean nothing to an embedding but can be looked up exactly.
        keywordOnly: text !== null && (isDataFile(path) || isMostlyNumeric(text)),
        state: { ...this.stateFor(path, stat, modelId, status, contentHash), info },
      };
    } catch (error) {
      return { kind: 'error', error };
    }
  }

  /**
   * Calibrate the chunk window for a text's token density. A 1000-char sample
   * is enough to determine chars/token; dense code or CJK runs ~2 chars/token
   * vs ~4 for English prose, so the default 2048-char window could otherwise
   * double the model's 512-token target.
   */
  private async windowFor(text: string | null): Promise<{ window: number; overlap: number }> {
    if (!text || !this.deps.countTokens) return { window: WINDOW, overlap: OVERLAP };
    const sample = text.slice(0, Math.min(text.length, 1000));
    const [sampleTokens] = await this.deps.countTokens(this.deps.model, [sample]);
    if (!(sampleTokens > 0)) return { window: WINDOW, overlap: OVERLAP };
    const window = Math.min(WINDOW, Math.max(Math.floor(TARGET_TOKENS * (sample.length / sampleTokens) * 0.85), 256));
    return { window, overlap: Math.floor(window / 8) };
  }

  /** PDFs: page-located chunks of the first pages; a long one stays 'partial' for the later pass. */
  private async preparePdf(path: string, stat: { mtimeMs: number; size: number }, contentHash: string): Promise<Prep> {
    const modelId = this.deps.model;
    const doc = await this.extract.pdfPages(path, 1, FIRST_PASS_PAGES).catch((err: unknown) => {
      // Corrupt or encrypted: still findable by name (below).
      console.warn('[fildos] PDF unreadable, indexing its name:', path, err instanceof Error ? err.message : err);
      return null;
    });
    const text = doc?.pages.map((p) => p.text).join('\n') ?? '';
    const { window, overlap } = await this.windowFor(text || null);
    const chunks = doc ? chunkPages(doc.pages, window, overlap) : [];
    const read = doc ? Math.min(doc.total, FIRST_PASS_PAGES) : 0;
    const info: IndexInfo | null =
      doc && doc.total > read ? { pages: doc.total, pagesRead: read, nextChunkIx: chunks.length } : null;
    const pieces: Piece[] = chunks.length
      ? chunks.map((c) => ({ chunkIx: c.chunkIx, text: c.text, kind: 'page', loc: c.page }))
      : [{ chunkIx: 0, text: nameChunkText(path), kind: 'name' }];
    const status: IndexState['status'] = !doc ? 'skipped' : info ? 'partial' : chunks.length ? 'indexed' : 'skipped';
    return {
      kind: 'text',
      chunks: pieces,
      keywordOnly: false,
      state: { ...this.stateFor(path, stat, modelId, status, contentHash), info },
    };
  }

  /** Embed pieces (or not, when keyword-only) as titled passages, in batches, pacing between them. */
  private async embedPieces(provider: AiProvider, path: string, pieces: Piece[], keywordOnly: boolean, pass: number) {
    const modelId = this.deps.model;
    const vectors: (Float32Array | null)[] = [];
    const title = basename(path);
    for (let i = 0; i < pieces.length; i += EMBED_BATCH) {
      const batch = pieces.slice(i, i + EMBED_BATCH);
      if (keywordOnly) {
        vectors.push(...batch.map(() => null));
        continue;
      }
      const t0 = Date.now();
      vectors.push(...(await provider.embed(modelId, batch.map((c) => c.text), 'passage', batch.map(() => title))));
      const took = Date.now() - t0;
      this.deps.recordCost?.('text', took / 1000, batch.length);
      await this.deps.pace?.(took);
    }
    return pieces.map((c, i) => ({
      chunkIx: c.chunkIx,
      text: c.text,
      embedding: vectors[i],
      modelId,
      kind: c.kind,
      loc: c.loc ?? null,
      locEnd: c.loc ?? null,
      pass,
    }));
  }

  /**
   * The later pass: read the rest of partial files, one step at a time, oldest
   * first. Each step appends its chunks and records how far it got, so
   * stopping between steps loses nothing. Returns 'interrupted' when it
   * yielded to pausing or to newly queued files (which go first).
   */
  private async finishLongFiles(provider: AiProvider): Promise<'done' | 'interrupted'> {
    for (const start of await aiIndex.partialStates()) {
      for (;;) {
        if (this.paused || (await jobs.countPending()) > 0) return 'interrupted';
        const st = await aiIndex.getState(start.path);
        if (st?.status !== 'partial' || !st.info) break;
        const stat = await fs.stat(st.path).catch(() => null);
        if (!stat || stat.mtimeMs !== st.mtime || stat.size !== st.size) {
          // Changed or gone since the first pass: index it afresh.
          await jobs.enqueueMany([st.path], stat ? 'upsert' : 'remove');
          break;
        }
        await this.holdForGate();
        if (this.paused) return 'interrupted';
        this.currentFile = st.path;
        this.emit();
        await this.ensureModel(provider, this.deps.model);
        if (await this.passStep(provider, st)) break;
        await new Promise((r) => setImmediate(r));
      }
    }
    this.currentFile = null;
    return 'done';
  }

  /** One later-pass step over a partial file. Returns true when the file is finished. */
  private async passStep(provider: AiProvider, st: IndexState): Promise<boolean> {
    const info = st.info!;
    const path = st.path;
    let pieces: Piece[];
    let next: IndexInfo;
    if (info.pages) {
      const from = (info.pagesRead ?? 0) + 1;
      const to = Math.min(info.pages, from + PASS_PAGES - 1);
      const doc = await this.extract.pdfPages(path, from, to).catch((err: unknown) => {
        console.warn('[fildos] PDF unreadable past page', from - 1, path, err instanceof Error ? err.message : err);
        return null;
      });
      if (!doc) return this.finishPartial(st); // keeps the pages read so far
      const text = doc.pages.map((p) => p.text).join('\n');
      const { window, overlap } = await this.windowFor(text || null);
      pieces = chunkPages(doc.pages, window, overlap, info.nextChunkIx ?? 0).map((c) => ({
        chunkIx: c.chunkIx,
        text: c.text,
        kind: 'page' as const,
        loc: c.page,
      }));
      next = { ...info, pagesRead: to, nextChunkIx: (info.nextChunkIx ?? 0) + pieces.length };
    } else {
      const text = await this.extract.text(path);
      if (text === null) return this.finishPartial(st);
      const { window, overlap } = await this.windowFor(text);
      const read = info.chunksRead ?? 0;
      const all = chunk(text, window, overlap);
      pieces = all.slice(read, read + FIRST_PASS_CHUNKS).map((c) => ({ chunkIx: c.chunkIx, text: c.text, kind: 'text' as const }));
      next = { ...info, chunks: all.length, chunksRead: read + pieces.length, nextChunkIx: read + pieces.length };
    }
    const rows = await this.embedPieces(provider, path, pieces, false, 2);
    await this.deps.vectorStore.append(path, rows);
    this.deps.keywordStore?.append(path, rows.map((r) => ({ chunkIx: r.chunkIx, text: r.text })));
    const finished = next.pages ? (next.pagesRead ?? 0) >= next.pages : (next.chunksRead ?? 0) >= (next.chunks ?? 0);
    if (finished || pieces.length === 0) return this.finishPartial(st);
    await aiIndex.upsertState({ ...st, info: next });
    return false;
  }

  /** Mark a partial file done (what was read stays searchable). */
  private async finishPartial(st: IndexState): Promise<true> {
    await aiIndex.upsertState({ ...st, status: 'indexed', info: null });
    return true;
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

    const modelId = this.deps.model;
    await this.ensureModel(provider, modelId);

    if (prep.kind === 'media') {
      await this.commitMedia(provider, path, prep.stat);
      return;
    }

    if (prep.kind === 'image') {
      const text = nameChunkText(path);
      const embedding = await this.embedPicture(provider, path);
      await aiIndex.upsertState(this.stateFor(path, prep.stat, modelId, embedding ? 'indexed' : 'skipped'));
      await this.deps.vectorStore.upsert(path, [
        embedding ? { chunkIx: 0, text, embedding, modelId, kind: 'image' } : { chunkIx: 0, text, embedding: null, modelId, kind: 'name' },
      ]);
      this.deps.keywordStore?.upsert(path, [{ chunkIx: 0, text }]);
      return;
    }

    await aiIndex.upsertState(prep.state);
    const rows = await this.embedPieces(provider, path, prep.chunks, prep.keywordOnly, 1);
    await this.deps.vectorStore.upsert(path, rows);
    this.deps.keywordStore?.upsert(
      path,
      rows.map((r) => ({ chunkIx: r.chunkIx, text: r.text })),
    );
  }

  /**
   * A folder the crawl never descends into: a cache tagged with CACHEDIR.TAG,
   * or a dataset (hundreds of machine-named media files). Datasets are
   * reported in progress so Settings can say what was left out.
   */
  private async isCacheOrDataset(dir: string): Promise<boolean> {
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      return false; // unreadable — the walk skips it the same way
    }
    if (names.includes('CACHEDIR.TAG')) {
      const fh = await fs.open(join(dir, 'CACHEDIR.TAG'), 'r');
      try {
        const buf = Buffer.alloc(64);
        const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
        if (isCacheDirTag(buf.subarray(0, bytesRead).toString('latin1'))) return true;
      } finally {
        await fh.close();
      }
    }
    if (looksLikeDataset(names, (n) => (isImage(n) ? 'image' : null))) {
      if (!this.datasets.includes(dir)) this.datasets.push(dir);
      return true;
    }
    return false;
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
   * A file is indexable if its text can be extracted or it's an image,
   * and its extension isn't on the user's "don't index these types" list.
   */
  private indexable(path: string): boolean {
    if (this.excludeExts.has(extname(path).slice(1).toLowerCase())) return false;
    return isExtractable(path) || isImage(path) || (isMedia(path) && this.deps.decodeMedia !== undefined);
  }

  /**
   * One picture's vector, or null when nothing on this machine can decode it
   * (HEIC without an OS decoder) — it's then kept by its name, as skipped.
   */
  private async embedPicture(provider: AiProvider, path: string): Promise<Float32Array | null> {
    const modelId = this.deps.model;
    const budget = visionBudget(path);
    const t0 = Date.now();
    let embedding: Float32Array;
    if (needsOsDecode(path)) {
      if (!this.deps.decodeImage) {
        console.warn('[fildos] no decoder for this picture format here, indexing its name only:', path);
        return null;
      }
      const img = await this.deps.decodeImage(path);
      [embedding] = await provider.embedDecoded(modelId, [{ kind: 'frame', ...img }], { budget });
    } else {
      [embedding] = await provider.embedMedia(modelId, 'image', [path], { budget });
    }
    const took = Date.now() - t0;
    this.deps.recordCost?.('image', took / 1000, 1);
    await this.deps.pace?.(took);
    return embedding;
  }

  /**
   * Audio/video: a keyword-only name chunk, one vector per distinct shot of a
   * video (frames sampled every few seconds, near-duplicates dropped), and one
   * per 30 s window of its sound (overlapping by 5 s). Frames and windows
   * carry their moment (`loc`/`locEnd`, seconds), so a hit plays from there.
   */
  private async commitMedia(provider: AiProvider, path: string, stat: { mtimeMs: number; size: number }): Promise<void> {
    const modelId = this.deps.model;
    const decoded = await this.deps.decodeMedia!(path);
    const name = nameChunkText(path);
    const rows: ChunkVector[] = [{ chunkIx: 0, text: name, embedding: null, modelId, kind: 'name' }];
    const embedBatches = async (inputs: DecodedInput[], batch: number): Promise<Float32Array[]> => {
      const out: Float32Array[] = [];
      for (let i = 0; i < inputs.length; i += batch) {
        const t0 = Date.now();
        const slice = inputs.slice(i, i + batch);
        out.push(...(await provider.embedDecoded(modelId, slice)));
        const took = Date.now() - t0;
        this.deps.recordCost?.(slice[0].kind, took / 1000, slice.length);
        await this.deps.pace?.(took);
      }
      return out;
    };
    const shots = keepShots(decoded.frames);
    const frameVecs = await embedBatches(
      shots.map((f) => ({ kind: 'frame', width: f.width, height: f.height, rgba: f.rgba })),
      MEDIA_BATCH,
    );
    shots.forEach((f, i) =>
      rows.push({ chunkIx: rows.length, text: '', embedding: frameVecs[i], modelId, kind: 'frame', loc: f.t, locEnd: f.t }),
    );
    const windows = decoded.audio ? audioWindows(decoded.audio) : [];
    const audioVecs = await embedBatches(
      windows.map((w) => ({ kind: 'audio', samples: w.samples })),
      MEDIA_BATCH,
    );
    windows.forEach((w, i) =>
      rows.push({ chunkIx: rows.length, text: '', embedding: audioVecs[i], modelId, kind: 'audio', loc: w.start, locEnd: w.end }),
    );
    // Nothing decodable: still findable by name, like an unreadable document.
    const status: IndexState['status'] = rows.length > 1 ? 'indexed' : 'skipped';
    await aiIndex.upsertState(this.stateFor(path, stat, modelId, status));
    await this.deps.vectorStore.upsert(path, rows);
    this.deps.keywordStore?.upsert(path, [{ chunkIx: 0, text: name }]);
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
