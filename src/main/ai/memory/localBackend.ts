import type { SemanticHit } from '@shared/types';
import type { AiProvider } from '../providers/types';
import type { VectorStore } from '../index/vectorStore';
import { semanticSearch, type SearchModels } from '../index/search';
import type { MemoryBackend, MemorySearchOpts } from './types';

/**
 * The on-device memory backend: FilDOS's original pipeline behind the
 * `MemoryBackend` seam. Search delegates to `semanticSearch` over the SQLite
 * vector store; the `AiProvider` (embeddings) is now just an injected
 * dependency of this backend rather than something handlers reach for directly.
 *
 * Dependencies are injected (provider resolver, models, vector store) so tests
 * drive it with a fake provider and an in-memory store — no Electron.
 */
export interface LocalBackendDeps {
  /** Resolves the active embedding provider (may be null if none configured). */
  provider: () => Promise<AiProvider | null>;
  /** The text + image model ids used for query embedding. */
  models: SearchModels;
  vectorStore: VectorStore;
}

export class LocalBackend implements MemoryBackend {
  readonly id = 'local';

  constructor(private readonly deps: LocalBackendDeps) {}

  async search(query: string, opts?: MemorySearchOpts): Promise<SemanticHit[]> {
    const provider = await this.deps.provider();
    if (!provider) {
      throw Object.assign(new Error('No AI provider is configured.'), { code: 'EINVAL' });
    }
    return semanticSearch(provider, this.deps.models, this.deps.vectorStore, query, {
      rootPath: opts?.rootPath,
      k: opts?.k,
    });
  }
}
