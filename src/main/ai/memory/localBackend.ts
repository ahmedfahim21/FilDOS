import { promises as fs } from 'node:fs';
import { basename } from 'node:path';
import type { IndexState, SemanticHit } from '@shared/types';
import type { AiProvider } from '../providers/types';
import type { VectorStore } from '../index/vectorStore';
import { semanticSearch, type SearchModels } from '../index/search';
import { extractText, isImage } from '../index/extract';
import { chunk } from '../index/chunk';
import * as aiIndex from '../../db/aiIndex';
import type { MemoryBackend, MemorySearchOpts } from './types';

/**
 * The on-device memory backend: FilDOS's original pipeline behind the
 * `MemoryBackend` seam. It owns the extract → chunk → embed → store tail (and
 * the matching `index_state` bookkeeping) that used to live inside the indexer,
 * so the indexer is now backend-agnostic and this is just another backend
 * alongside supermemory. The `AiProvider` (embeddings) is an injected dependency
 * of this backend rather than something handlers reach for directly.
 *
 * Dependencies are injected (provider resolver, models, vector store) so tests
 * drive it with a fake provider and an in-memory store — no Electron.
 */
export interface LocalBackendDeps {
  /** Resolves the active embedding provider (may be null if none configured). */
  provider: () => Promise<AiProvider | null>;
  /** The text + image model ids used for query embedding and ingestion. */
  models: SearchModels;
  vectorStore: VectorStore;
}

export class LocalBackend implements MemoryBackend {
  readonly id = 'local';

  /** Models confirmed downloaded this session (avoids repeat download calls). */
  private readonly ensured = new Set<string>();

  constructor(private readonly deps: LocalBackendDeps) {}

  /** CLIP for images, the text model otherwise — also the change-detection key. */
  fingerprint(path: string): string {
    return isImage(path) ? this.deps.models.image : this.deps.models.text;
  }

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

  async remove(paths: string[]): Promise<void> {
    if (paths.length) await aiIndex.remove(paths); // file_chunks cascade via FK
  }

  async ingest(path: string): Promise<void> {
    const provider = await this.deps.provider();
    if (!provider) {
      throw Object.assign(new Error('No AI provider is configured.'), { code: 'EINVAL' });
    }

    let stat;
    try {
      stat = await fs.stat(path);
    } catch {
      await aiIndex.remove([path]); // vanished since it was queued
      return;
    }

    const modelId = this.fingerprint(path);
    // Already current under the right model — re-run is a no-op.
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

    await this.ensureModel(provider, modelId);

    // Images: one CLIP embedding per file, labelled by its name (the snippet).
    if (isImage(path)) {
      const [embedding] = await provider.embedImages(modelId, [path]);
      await aiIndex.upsertState(stateFor(path, stat, modelId, embedding ? 'indexed' : 'skipped'));
      await this.deps.vectorStore.upsert(
        path,
        embedding ? [{ chunkIx: 0, text: basename(path), embedding, modelId }] : [],
      );
      return;
    }

    const text = await extractText(path);
    await aiIndex.upsertState(stateFor(path, stat, modelId, text === null ? 'skipped' : 'indexed'));

    const chunks = text === null ? [] : chunk(text);
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

  /** Make sure a model is downloaded before we embed with it (idempotent). */
  private async ensureModel(provider: AiProvider, modelId: string): Promise<void> {
    if (this.ensured.has(modelId)) return;
    await provider.download(modelId);
    this.ensured.add(modelId);
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
