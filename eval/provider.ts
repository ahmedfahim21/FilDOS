/**
 * Bag-of-words embedding provider for the eval harness. Represents each text
 * as a normalised TF vector over a shared vocabulary so the cosine between a
 * query and a passage is high when they share many words. Good enough to test
 * the hybrid-search pipeline (RRF fusion, reranking hooks) without requiring a
 * real model download.
 */
import type { AiModelStatus } from '@shared/types';
import type { AiProvider } from '../src/main/ai/providers/types';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

function tf(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  const total = tokens.length || 1;
  for (const [k, v] of counts) counts.set(k, v / total);
  return counts;
}

function tfVec(text: string, vocab: string[]): Float32Array {
  const counts = tf(tokenize(text));
  const vec = new Float32Array(vocab.length);
  for (let i = 0; i < vocab.length; i++) vec[i] = counts.get(vocab[i]) ?? 0;
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

/**
 * Build a vocabulary from all texts that will be embedded (call once per eval
 * run). The resulting vocab is shared across embed() calls so vectors are
 * comparable. Dimensions are 0 for unseen words (safe for cosine).
 */
export function buildVocab(texts: string[]): string[] {
  const seen = new Set<string>();
  for (const t of texts) for (const tok of tokenize(t)) seen.add(tok);
  return [...seen].sort();
}

export class BowProvider implements AiProvider {
  readonly id = 'bow';
  readonly capabilities = { embed: true, generate: false, images: false };

  constructor(private readonly vocab: string[]) {}

  async status(modelId: string): Promise<AiModelStatus> {
    return { state: 'ready', modelId, dim: this.vocab.length };
  }
  async download(): Promise<void> {}

  async embed(_modelId: string, texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => tfVec(t, this.vocab));
  }

  async embedImages(_modelId: string, paths: string[]): Promise<Float32Array[]> {
    return paths.map(() => new Float32Array(this.vocab.length));
  }
}
