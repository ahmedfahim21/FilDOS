/**
 * Split extracted text into overlapping windows for embedding. Embedding models
 * cap their input at ~512 tokens, so we target windows of roughly that size with
 * a small overlap to avoid cutting meaning at the seams. Until an embedder (and
 * its tokenizer) lands we approximate tokens by characters — ~4 chars/token —
 * which keeps this module dependency-free and deterministic; swap in a real
 * tokenizer here when the model is chosen.
 */

const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = 512;

/** Window size in characters (~512 tokens). */
export const WINDOW = TARGET_TOKENS * CHARS_PER_TOKEN; // 2048
/** Overlap carried between consecutive windows (~12.5%). */
export const OVERLAP = WINDOW / 8; // 256

/** A positioned slice of a file's text. */
export interface TextChunk {
  /** 0-based position within the file. */
  chunkIx: number;
  text: string;
}

/**
 * Break `text` into ~`WINDOW`-char chunks that overlap by `OVERLAP`. Returns an
 * empty array for blank input and a single chunk for anything within one window.
 */
export function chunk(text: string): TextChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= WINDOW) return [{ chunkIx: 0, text: trimmed }];

  const stride = WINDOW - OVERLAP;
  const chunks: TextChunk[] = [];
  for (let start = 0; start < trimmed.length; start += stride) {
    chunks.push({ chunkIx: chunks.length, text: trimmed.slice(start, start + WINDOW) });
    if (start + WINDOW >= trimmed.length) break;
  }
  return chunks;
}
