import type { ChunkVector, SearchMatch } from '@shared/types';

/**
 * The vector store abstraction the indexing phase searches against. The default
 * implementation (db/vectorStore.sqlite.ts) keeps Float32 embeddings as BLOBs
 * and scans them with brute-force cosine similarity; the interface exists so an
 * ANN or remote backend can replace it later without touching callers. This
 * module also holds the pure helpers — the BLOB codec and `cosine` — so they're
 * trivially unit-testable and shared by any implementation.
 */
export interface VectorStore {
  /** Persist the embedded chunks for a file, replacing any previous set. */
  upsert(path: string, chunks: ChunkVector[]): Promise<void>;
  /** Nearest chunks to `query` by cosine similarity, highest score first. */
  search(query: Float32Array, opts?: SearchOpts): Promise<SearchMatch[]>;
  /** Forget the given paths entirely. */
  remove(paths: string[]): Promise<void>;
  /** Carry a file's vectors to a new path after a rename/move. */
  remap(oldPath: string, newPath: string): Promise<void>;
}

export interface SearchOpts {
  /** How many matches to return (default 10). */
  k?: number;
  /** Restrict to a file or everything beneath a folder. */
  underPath?: string;
  /** Restrict to a file extension (without the dot), e.g. "md". */
  ext?: string;
}

/**
 * Pack a Float32 vector into a little-endian BLOB. All supported platforms
 * (x64/arm64) are little-endian, so the bytes are portable across them. Copies
 * so the stored buffer is independent of the caller's array.
 */
export function encodeVector(v: Float32Array): Buffer {
  return Buffer.from(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
}

/** Unpack a little-endian BLOB back into a Float32 vector. */
export function decodeVector(buf: Buffer): Float32Array {
  // Copy into a fresh, 4-byte-aligned buffer — pooled Node Buffers may sit at an
  // offset that Float32Array can't view directly.
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return new Float32Array(copy.buffer);
}

/**
 * Cosine similarity of two equal-length vectors, in [-1, 1]. Returns 0 when
 * either vector is all-zeros (undefined direction) or lengths differ.
 */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
