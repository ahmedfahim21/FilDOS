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

/**
 * SQLite-backed VectorStore. Embeddings live as Float32 BLOBs in `file_chunks`;
 * search decodes the candidate set and ranks it by cosine similarity in JS.
 * Brute force is fine for v1 — the `underPath`/`ext` pre-filters (applied in
 * SQL by aiIndex.searchCandidates) keep the scanned set small; an ANN index is
 * a later concern. Persistence and remap are delegated to aiIndex / remapPaths
 * so there's a single source of truth for how index rows move.
 */
export class SqliteVectorStore implements VectorStore {
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
  }

  async search(query: Float32Array, opts: SearchOpts = {}): Promise<SearchMatch[]> {
    const k = opts.k ?? 10;
    const candidates = await aiIndex.searchCandidates({
      underPath: opts.underPath,
      ext: opts.ext,
      modelId: opts.modelId,
    });

    return candidates
      .map((c) => ({
        path: c.path,
        chunkIx: c.chunkIx,
        text: c.text,
        score: cosine(query, decodeVector(c.embedding)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, k));
  }

  remove(paths: string[]): Promise<void> {
    return aiIndex.remove(paths);
  }

  async remap(oldPath: string, newPath: string): Promise<void> {
    // remapPaths rewrites index_state; file_chunks follows via ON UPDATE CASCADE.
    remapPaths(oldPath, newPath, sep);
  }
}
