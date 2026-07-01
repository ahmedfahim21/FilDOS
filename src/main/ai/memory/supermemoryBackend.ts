import { promises as fs } from 'node:fs';
import { basename } from 'node:path';
import type { IndexState, SemanticHit } from '@shared/types';
import * as aiIndex from '../../db/aiIndex';
import type { MemoryBackend, MemorySearchOpts } from './types';
import { enrichHits, type ScoredHit } from './enrich';
import { stableId } from './stableId';

/** Change-detection fingerprint stored in `index_state.modelId` for supermemory. */
const FINGERPRINT = 'supermemory';

/**
 * The bundled self-hosted supermemory daemon behind the `MemoryBackend` seam
 * (issue #39). Search forwards to `POST /v3/search` on the local daemon and maps
 * the response back to `SemanticHit`s via the shared `enrichHits` helper — so
 * supermemory results are collapsed/scoped/enriched identically to the local
 * backend and the renderer can't tell which answered.
 *
 * The file path is recovered from each result's `metadata` (FilDOS stashes the
 * absolute path there at ingest, since supermemory keys documents by an opaque
 * `customId = hash(path)`). Everything is dependency-injected — base URL, a
 * token resolver (the `sm_` bearer stays in the main process), and `fetch` — so
 * tests drive it with a stubbed fetch and no daemon.
 *
 * The `/v3/search` request/response shapes below were confirmed against a live
 * daemon (v0.0.3): each result carries a top-level `score`, the file path in
 * `metadata`, and the matching text in a `chunks[]` array.
 */

type FetchFn = typeof fetch;

export interface SupermemoryBackendDeps {
  /**
   * Daemon base URL. May be a resolver, since the daemon picks its port at
   * start — the `SupermemoryDaemon`'s `baseUrl()` is passed here, returning null
   * until it's running. A plain string (tests) or omission (defaults to the
   * documented `http://localhost:6767`) also work.
   */
  baseUrl?: string | (() => string | null);
  /** Resolves the `sm_` bearer token (main-process only); null before ready. */
  token: () => string | null;
  /** Injectable fetch (defaults to global `fetch`) — the test seam. */
  fetch?: FetchFn;
}

/** A matching chunk within a search result. */
interface SmChunk {
  content?: string;
  isRelevant?: boolean;
  score?: number;
}

/** One entry of the `/v3/search` `results` array (confirmed live shape). */
interface SmResult {
  /** Best-chunk relevance for the document, in [0, 1]. */
  score?: number;
  /** The matching chunks; the snippet is drawn from the most relevant one. */
  chunks?: SmChunk[];
  /** Echoes the JSON FilDOS supplied at ingest — the real path lives here. */
  metadata?: Record<string, unknown> | null;
}

interface SmSearchResponse {
  results?: SmResult[];
}

export class SupermemoryBackend implements MemoryBackend {
  readonly id = 'supermemory';

  private readonly fetchFn: FetchFn;

  constructor(private readonly deps: SupermemoryBackendDeps) {
    this.fetchFn = deps.fetch ?? fetch;
  }

  async search(query: string, opts?: MemorySearchOpts): Promise<SemanticHit[]> {
    const q = query.trim();
    if (!q) return [];

    const k = opts?.k ?? 20;
    const res = await this.fetchFn(`${this.resolveBaseUrl()}/v3/search`, {
      method: 'POST',
      headers: this.headers(),
      // Over-fetch; `enrichHits` collapses to one hit per file and caps at k.
      body: JSON.stringify({ q, limit: k * 3 }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw Object.assign(
        new Error(`supermemory search failed (${res.status})${detail ? `: ${detail}` : ''}`),
        { code: res.status === 401 ? 'EACCES' : 'EUNKNOWN' },
      );
    }

    const data = (await res.json()) as SmSearchResponse;
    const scored: ScoredHit[] = (data.results ?? [])
      .map((r): ScoredHit | null => {
        const path = pathFromMetadata(r.metadata);
        if (!path) return null;
        return { path, score: clamp01(r.score ?? 0), text: bestChunkText(r.chunks) };
      })
      .filter((s): s is ScoredHit => s !== null);

    return enrichHits(scored, { rootPath: opts?.rootPath, k: opts?.k });
  }

  fingerprint(_path: string): string {
    return FINGERPRINT; // constant — switching to/from supermemory re-indexes
  }

  async ingest(path: string): Promise<void> {
    let stat;
    try {
      stat = await fs.stat(path);
    } catch {
      await this.remove([path]); // vanished since it was queued
      return;
    }

    // Already uploaded and unchanged — re-run is a no-op (matches local backend).
    const prev = await aiIndex.getState(path);
    if (prev && prev.status !== 'error' && prev.mtime === stat.mtimeMs && prev.size === stat.size && prev.modelId === FINGERPRINT) {
      return;
    }

    // Upload the raw file; supermemory does its own extraction/chunking/embedding.
    // `customId = hash(path)` upserts on re-ingest (confirmed live); the real path
    // rides along in `metadata` so search can map results back to the file.
    const bytes = await fs.readFile(path);
    const form = new FormData();
    form.append('file', new Blob([bytes]), basename(path));
    form.append('customId', stableId(path));
    form.append('metadata', JSON.stringify({ path }));
    form.append('filepath', path);

    const res = await this.fetchFn(`${this.resolveBaseUrl()}/v3/documents/file`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw Object.assign(
        new Error(`supermemory ingest failed (${res.status})${detail ? `: ${detail}` : ''}`),
        { code: res.status === 401 ? 'EACCES' : 'EUNKNOWN' },
      );
    }

    await aiIndex.upsertState(stateFor(path, stat, FINGERPRINT, 'indexed'));
  }

  async remove(paths: string[]): Promise<void> {
    for (const path of paths) {
      const res = await this.fetchFn(
        `${this.resolveBaseUrl()}/v3/documents/${encodeURIComponent(stableId(path))}`,
        { method: 'DELETE', headers: this.authHeaders() },
      );
      // 404 = already gone; anything else non-ok is surfaced.
      if (!res.ok && res.status !== 404) {
        const detail = await res.text().catch(() => '');
        throw Object.assign(
          new Error(`supermemory delete failed (${res.status})${detail ? `: ${detail}` : ''}`),
          { code: res.status === 401 ? 'EACCES' : 'EUNKNOWN' },
        );
      }
    }
    if (paths.length) await aiIndex.remove(paths); // drop local bookkeeping
  }

  private resolveBaseUrl(): string {
    const raw = typeof this.deps.baseUrl === 'function' ? this.deps.baseUrl() : this.deps.baseUrl;
    if (raw === null) {
      throw Object.assign(new Error('The supermemory daemon is not running.'), { code: 'EUNKNOWN' });
    }
    return (raw ?? 'http://localhost:6767').replace(/\/+$/, '');
  }

  private headers(): Record<string, string> {
    return { 'content-type': 'application/json', ...this.authHeaders() };
  }

  /** Auth only — for multipart uploads, where fetch sets its own content-type. */
  private authHeaders(): Record<string, string> {
    const token = this.deps.token();
    return token ? { authorization: `Bearer ${token}` } : {};
  }
}

function stateFor(
  path: string,
  stat: { mtimeMs: number; size: number },
  modelId: string,
  status: IndexState['status'],
): IndexState {
  return { path, mtime: stat.mtimeMs, size: stat.size, contentHash: null, modelId, indexedAt: Date.now(), status };
}

/** Recover the absolute file path FilDOS stored on the document at ingest. */
function pathFromMetadata(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  const p = metadata.path ?? metadata.filepath;
  return typeof p === 'string' && p.length > 0 ? p : null;
}

/** The snippet text: the highest-scoring relevant chunk (falling back sensibly). */
function bestChunkText(chunks: SmChunk[] | undefined): string {
  if (!chunks?.length) return '';
  const relevant = chunks.filter((c) => c.isRelevant !== false && c.content);
  const pool = relevant.length ? relevant : chunks;
  const best = pool.reduce((a, b) => ((b.score ?? 0) > (a.score ?? 0) ? b : a));
  return best.content ?? '';
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
