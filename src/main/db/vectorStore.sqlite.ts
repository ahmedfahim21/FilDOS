import { sep } from 'node:path';
import type { ChunkVector, SearchMatch } from '@shared/types';
import {
  cosine,
  decodeVector,
  encodeVector,
  type SearchOpts,
  type VectorStore,
} from '../ai/index/vectorStore';
import * as aiIndex from './aiIndex';
import { remapPaths } from './remap';
import { isUnder } from '../ai/index/ignore';

/**
 * SQLite-backed VectorStore with an in-memory read cache. Embeddings persist as
 * Float32 BLOBs in `file_chunks`; search ranks by cosine similarity in JS.
 * Brute-force cosine over a personal index is tens of milliseconds — what made
 * queries slow at ~20k files was re-reading and decoding every BLOB from SQLite
 * per query. So the vectors (path + chunkIx + modelId + Float32Array, no text)
 * are loaded once on first search and kept in sync by upsert/remove/remap/clear;
 * chunk texts are fetched from the DB only for the final top-k. Like the BM25
 * keyword store, renames applied via db/remap.ts (fs handlers) aren't seen until
 * the next indexer touch or restart — stale hits are pruned by the stat in
 * search.ts#resolveHits, which routes back through `remove`.
 */

interface CachedChunk {
  chunkIx: number;
  modelId: string;
  vec: Float32Array;
}

export class SqliteVectorStore implements VectorStore {
  /** path → its chunk vectors; null until the first search warms it. */
  private cache: Map<string, CachedChunk[]> | null = null;

  private async ensureCache(): Promise<Map<string, CachedChunk[]>> {
    if (this.cache) return this.cache;
    const cache = new Map<string, CachedChunk[]>();
    for (const row of await aiIndex.allEmbeddings()) {
      const arr = cache.get(row.path) ?? [];
      arr.push({ chunkIx: row.chunkIx, modelId: row.modelId, vec: decodeVector(row.embedding) });
      cache.set(row.path, arr);
    }
    this.cache = cache;
    return cache;
  }

  async upsert(path: string, chunks: ChunkVector[]): Promise<void> {
    await aiIndex.replaceChunks(
      path,
      chunks.map((c) => ({
        chunkIx: c.chunkIx,
        text: c.text,
        embedding: encodeVector(c.embedding),
        modelId: c.modelId,
      })),
    );
    if (this.cache) {
      if (chunks.length === 0) this.cache.delete(path);
      else {
        this.cache.set(
          path,
          chunks.map((c) => ({ chunkIx: c.chunkIx, modelId: c.modelId, vec: c.embedding })),
        );
      }
    }
  }

  async search(query: Float32Array, opts: SearchOpts = {}): Promise<SearchMatch[]> {
    const k = Math.max(0, opts.k ?? 10);
    const cache = await this.ensureCache();

    const scored: { path: string; chunkIx: number; score: number }[] = [];
    for (const [path, chunks] of cache) {
      if (opts.underPath && !isUnder(path, opts.underPath)) continue;
      if (opts.ext && !path.toLowerCase().endsWith(`.${opts.ext.toLowerCase()}`)) continue;
      for (const c of chunks) {
        if (opts.modelId && c.modelId !== opts.modelId) continue;
        scored.push({ path, chunkIx: c.chunkIx, score: cosine(query, c.vec) });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, k);

    // Texts live only in the DB — fetch them for just the winners.
    const texts = await aiIndex.chunkTexts([...new Set(top.map((m) => m.path))]);
    return top.map((m) => ({
      path: m.path,
      chunkIx: m.chunkIx,
      text: texts.get(`${m.path}\x00${m.chunkIx}`) ?? '',
      score: m.score,
    }));
  }

  async remove(paths: string[]): Promise<void> {
    await aiIndex.remove(paths);
    if (this.cache) for (const p of paths) this.cache.delete(p);
  }

  async remap(oldPath: string, newPath: string): Promise<void> {
    // remapPaths rewrites index_state; file_chunks follows via ON UPDATE CASCADE.
    remapPaths(oldPath, newPath, sep);
    if (this.cache) {
      for (const [path, chunks] of [...this.cache]) {
        if (!isUnder(path, oldPath)) continue;
        this.cache.delete(path);
        this.cache.set(newPath + path.slice(oldPath.length), chunks);
      }
    }
  }

  /** Forget the cache after the backing rows were wiped (e.g. "Clear index"). */
  clear(): void {
    this.cache = null;
  }
}
