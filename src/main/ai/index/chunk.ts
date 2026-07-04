/**
 * Split extracted text into overlapping windows for embedding. Embedding models
 * cap their input at ~512 tokens, so we target windows of roughly that size with
 * a small overlap to avoid cutting meaning at the seams. Until an embedder (and
 * its tokenizer) lands we approximate tokens by characters — ~4 chars/token —
 * which keeps this module dependency-free and deterministic; swap in a real
 * tokenizer here when the model is chosen.
 */

const CHARS_PER_TOKEN = 4;
export const TARGET_TOKENS = 512;

/** Default window in characters (~512 tokens at 4 chars/token for prose). */
export const WINDOW = TARGET_TOKENS * CHARS_PER_TOKEN; // 2048
/** Default overlap (~12.5% of the default window). */
export const OVERLAP = WINDOW / 8; // 256

/** A positioned slice of a file's text. */
export interface TextChunk {
  /** 0-based position within the file. */
  chunkIx: number;
  text: string;
}

/**
 * Break `text` into overlapping character windows. `window` and `overlap` default
 * to the char-based approximation (WINDOW/OVERLAP) but the indexer passes values
 * derived from the real tokenizer when the model worker supports it — so chunks
 * stay within the model's actual token limit even for dense code or non-Latin text.
 */
export function chunk(text: string, window = WINDOW, overlap = OVERLAP): TextChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= window) return [{ chunkIx: 0, text: trimmed }];

  const stride = window - overlap;
  const chunks: TextChunk[] = [];
  for (let start = 0; start < trimmed.length; start += stride) {
    chunks.push({ chunkIx: chunks.length, text: trimmed.slice(start, start + window) });
    if (start + window >= trimmed.length) break;
  }
  return chunks;
}
