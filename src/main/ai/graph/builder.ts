import type { GraphProgress, GraphSnapshot } from '@shared/graphTypes';
import type { IndexState, Prefs } from '@shared/types';
import * as aiIndex from '../../db/aiIndex';
import * as graphStore from '../../db/graphStore';
import { listTags } from '../../db/tags';
import { decodeVector } from '../index/vectorStore';
import type { AiProvider } from '../providers/types';
import { centroids, knnEdges, type FileCentroid } from './similarity';
import { normalizeEntities } from './ner';
import { assembleSnapshot } from './snapshot';

/**
 * The relationship engine's orchestrator. Lazy + incremental by design: nothing
 * runs until the Brain view asks (`ensureBuilt`), results persist in SQLite
 * (graph_edges / entities / entity_state), and a rebuild touches only files
 * whose `index_state.indexed_at` moved past the stored watermark — so opening
 * the view after a quiet week costs one comparison, not a recompute.
 *
 * Provider/emit/pace are injected (mirroring IndexerDeps) so tests drive a
 * build with a fake provider and an in-memory db, no Electron. Entity
 * extraction is gated on the NER model already being downloaded — a build
 * never triggers a download, matching the reranker/CLIP lanes.
 */

export interface GraphBuilderDeps {
  provider: () => Promise<AiProvider | null>;
  /** NER model id (must be 'ready' before the entity stage runs). */
  nerModel: string;
  /** The image-embedding model id, whose chunks NER must skip. */
  imageModel: string;
  emit: (progress: GraphProgress) => void;
  /** Cooperative duty-cycle: rest proportionally to the elapsed work. */
  pace?: (elapsedMs: number) => Promise<void>;
  prefs: {
    get: () => Promise<Prefs>;
    set: (patch: Prefs) => Promise<void>;
  };
}

/** Files whose extracted text is shorter than this are filename-fallbacks. */
const MIN_NER_TEXT = 80;
/** Cap the text NER sees per file — entities live in the front matter. */
const MAX_NER_TEXT = 4000;
/** Files per extractEntities round-trip to the worker. */
const NER_BATCH = 8;

export class GraphBuilder {
  private running: Promise<void> | null = null;
  private stopped = false;
  private progress: GraphProgress = { state: 'idle', done: 0, total: 0 };

  constructor(private readonly deps: GraphBuilderDeps) {}

  status(): GraphProgress {
    return this.progress;
  }

  /** Stop after the current batch; entity work already persisted is kept. */
  stop(): void {
    this.stopped = true;
  }

  /** True when the index moved past what the last build saw. */
  async isDirty(): Promise<boolean> {
    const meta = (await this.deps.prefs.get()).graph;
    if (!meta?.builtAt) return true;
    const states = await this.indexedStates();
    return this.watermarkOf(states) !== meta.watermark || states.length !== (meta.files ?? -1);
  }

  /** Build if never built or stale; coalesces concurrent callers. */
  async ensureBuilt(): Promise<void> {
    if (this.running) return this.running;
    if (await this.isDirty()) return this.build(false);
  }

  /** Run a build. `full` recomputes every file's edges and entities. */
  build(full: boolean): Promise<void> {
    if (this.running) return this.running;
    this.stopped = false;
    this.running = this.run(full).finally(() => {
      this.running = null;
      this.progress = { state: 'idle', done: 0, total: 0 };
      this.deps.emit(this.progress);
    });
    return this.running;
  }

  /** The current snapshot from stored rows (no building — callers ensureBuilt). */
  async snapshot(opts?: { maxNodes?: number }): Promise<GraphSnapshot> {
    const states = await this.indexedStates();
    const builtAt = (await this.deps.prefs.get()).graph?.builtAt ?? 0;
    return assembleSnapshot({
      files: states.map((s) => ({ path: s.path, mtime: s.mtime, size: s.size })),
      similar: await graphStore.allEdges(),
      mentions: await graphStore.allMentions(),
      tags: await listTags(),
      fileTags: await graphStore.allFileTags(),
      builtAt,
      maxNodes: opts?.maxNodes,
    });
  }

  /** Wipe the stored graph and the watermark (used by "Clear index"). */
  async clear(): Promise<void> {
    await graphStore.clearAll();
    await this.deps.prefs.set({ graph: {} });
  }

  private async indexedStates(): Promise<IndexState[]> {
    return (await aiIndex.statesUnder()).filter((s) => s.status === 'indexed');
  }

  private watermarkOf(states: IndexState[]): number {
    let max = 0;
    for (const s of states) if (s.indexedAt > max) max = s.indexedAt;
    return max;
  }

  private emit(progress: GraphProgress): void {
    this.progress = progress;
    this.deps.emit(progress);
  }

  private async run(full: boolean): Promise<void> {
    const states = await this.indexedStates();
    const meta = (await this.deps.prefs.get()).graph;
    const since = full ? 0 : (meta?.watermark ?? 0);
    const changed = new Set(states.filter((s) => s.indexedAt > since).map((s) => s.path));

    await this.buildSimilarity(states, full ? null : changed);
    if (this.stopped) return;
    await this.buildEntities(states, full);
    if (this.stopped) return;

    await this.deps.prefs.set({
      graph: { builtAt: Date.now(), watermark: this.watermarkOf(states), files: states.length },
    });
  }

  private async buildSimilarity(states: IndexState[], changed: Set<string> | null): Promise<void> {
    if (changed && changed.size === 0) return;
    this.emit({ state: 'building', phase: 'similarity', done: 0, total: changed?.size ?? states.length });

    const started = Date.now();
    const indexed = new Set(states.map((s) => s.path));
    const rows = await aiIndex.allEmbeddings();
    const vectors: { path: string; modelId: string; vec: Float32Array }[] = [];
    for (const r of rows) {
      if (indexed.has(r.path)) {
        vectors.push({ path: r.path, modelId: r.modelId, vec: decodeVector(r.embedding) });
      }
    }
    const points: FileCentroid[] = centroids(vectors);
    const pace = this.deps.pace;
    const edges = await knnEdges(points, {
      onlyFor: changed ?? undefined,
      pace: pace ? () => pace(50) : undefined,
    });

    if (changed) {
      await graphStore.replaceEdgesFor([...changed], edges);
    } else {
      await graphStore.replaceAllEdges(edges);
    }
    this.emit({
      state: 'building',
      phase: 'similarity',
      done: changed?.size ?? states.length,
      total: changed?.size ?? states.length,
    });
    if (pace) await pace(Date.now() - started);
  }

  private async buildEntities(states: IndexState[], full: boolean): Promise<void> {
    const provider = await this.deps.provider();
    if (!provider?.extractEntities) return;
    const status = await provider.status(this.deps.nerModel).catch(() => null);
    if (status?.state !== 'ready') return; // opt-in: never trigger a download

    const done = full ? new Map<string, number>() : await graphStore.entityStates();
    const stale = states.filter((s) => done.get(s.path) !== s.indexedAt);
    if (stale.length === 0) return;
    this.emit({ state: 'building', phase: 'entities', done: 0, total: stale.length });

    let processed = 0;
    for (let i = 0; i < stale.length && !this.stopped; i += NER_BATCH) {
      const batch = stale.slice(i, i + NER_BATCH);
      const started = Date.now();
      const texts = await graphStore.nerTexts(batch.map((s) => s.path), this.deps.imageModel);

      const jobs: { state: IndexState; text: string }[] = [];
      for (const s of batch) {
        const text = texts.get(s.path)?.slice(0, MAX_NER_TEXT) ?? '';
        if (text.length >= MIN_NER_TEXT) {
          jobs.push({ state: s, text });
        } else {
          // Nothing worth mining (image / filename-fallback) — mark it done so
          // the staleness diff doesn't retry it every build.
          await graphStore.replaceFileEntities(s.path, [], s.indexedAt);
        }
      }
      if (jobs.length > 0) {
        try {
          const spans = await provider.extractEntities(
            this.deps.nerModel,
            jobs.map((j) => j.text),
          );
          for (let j = 0; j < jobs.length; j++) {
            const found = normalizeEntities(spans[j] ?? []);
            await graphStore.replaceFileEntities(jobs[j].state.path, found, jobs[j].state.indexedAt);
          }
        } catch {
          // A failed batch (worker restart, corrupt text) is skipped, not fatal;
          // entity_state stays stale so the next build retries these files.
        }
      }
      processed += batch.length;
      this.emit({ state: 'building', phase: 'entities', done: processed, total: stale.length });
      if (this.deps.pace) await this.deps.pace(Date.now() - started);
    }
    await graphStore.pruneOrphanEntities();
  }
}
