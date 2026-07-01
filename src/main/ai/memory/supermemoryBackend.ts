import type { SemanticHit } from '@shared/types';
import type { MemoryBackend, MemorySearchOpts } from './types';
import { enrichHits, type ScoredHit } from './enrich';

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
 * NOTE: the `/v3/search` request/response shapes below follow the published
 * docs and are pending confirmation against a live daemon (see the deferred
 * spikes in the plan). Adjust the mapping once verified.
 */

type FetchFn = typeof fetch;

export interface SupermemoryBackendDeps {
  /** Daemon base URL; defaults to the documented `http://localhost:6767`. */
  baseUrl?: string;
  /** Resolves the `sm_` bearer token (main-process only); null before ready. */
  token: () => string | null;
  /** Injectable fetch (defaults to global `fetch`) — the test seam. */
  fetch?: FetchFn;
}

/** One entry of the `/v3/search` `results` array (documented shape). */
interface SmResult {
  similarity?: number;
  /** Hybrid mode returns either an extracted `memory` or a document `chunk`. */
  memory?: string;
  chunk?: string;
  metadata?: Record<string, unknown> | null;
}

interface SmSearchResponse {
  results?: SmResult[];
}

export class SupermemoryBackend implements MemoryBackend {
  readonly id = 'supermemory';

  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;

  constructor(private readonly deps: SupermemoryBackendDeps) {
    this.baseUrl = (deps.baseUrl ?? 'http://localhost:6767').replace(/\/+$/, '');
    this.fetchFn = deps.fetch ?? fetch;
  }

  async search(query: string, opts?: MemorySearchOpts): Promise<SemanticHit[]> {
    const q = query.trim();
    if (!q) return [];

    const k = opts?.k ?? 20;
    const res = await this.fetchFn(`${this.baseUrl}/v3/search`, {
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
        return { path, score: clamp01(r.similarity ?? 0), text: r.memory ?? r.chunk ?? '' };
      })
      .filter((s): s is ScoredHit => s !== null);

    return enrichHits(scored, { rootPath: opts?.rootPath, k: opts?.k });
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const token = this.deps.token();
    if (token) headers.authorization = `Bearer ${token}`;
    return headers;
  }
}

/** Recover the absolute file path FilDOS stored on the document at ingest. */
function pathFromMetadata(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  const p = metadata.path ?? metadata.filepath;
  return typeof p === 'string' && p.length > 0 ? p : null;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
