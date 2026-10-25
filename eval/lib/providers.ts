/**
 * Embedding providers for the eval harness:
 *  - `RuntimeProvider` runs the app's real model runtime (`modelRuntime.ts`)
 *    in-process, so evals measure the models users actually get.
 *  - `BowProvider` is a bag-of-words stand-in (normalised TF vectors over a
 *    shared vocabulary): no download, deterministic — the CI smoke mode that
 *    keeps the pipeline wiring honest without measuring model quality.
 */
import type { AiModelStatus } from '@shared/types';
import type { EmbedRole } from '@shared/aiModels';
import type { EntitySpan } from '@shared/graphTypes';
import type { AiProvider } from '../../src/main/ai/providers/types';
import { handle } from '../../src/main/ai/modelRuntime';

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

/** The app's model runtime, called directly instead of through a utilityProcess. */
export class RuntimeProvider implements AiProvider {
  readonly id = 'embedded';
  readonly capabilities = { embed: true, generate: false, images: true };

  status(modelId: string): Promise<AiModelStatus> {
    return handle('status', modelId) as Promise<AiModelStatus>;
  }

  async download(modelId: string): Promise<void> {
    await handle('download', modelId);
  }

  async embed(modelId: string, texts: string[], role: EmbedRole = 'passage'): Promise<Float32Array[]> {
    const rows = (await handle('embed', modelId, texts, undefined, role)) as number[][];
    return rows.map((row) => Float32Array.from(row));
  }

  async embedImages(modelId: string, paths: string[]): Promise<Float32Array[]> {
    const rows = (await handle('embedImages', modelId, undefined, paths)) as number[][];
    return rows.map((row) => Float32Array.from(row));
  }

  countTokens(modelId: string, texts: string[]): Promise<number[]> {
    return handle('countTokens', modelId, texts) as Promise<number[]>;
  }

  rerank(modelId: string, query: string, passages: string[]): Promise<number[]> {
    return handle('rerank', modelId, undefined, undefined, undefined, query, passages) as Promise<number[]>;
  }

  extractEntities(modelId: string, texts: string[]): Promise<EntitySpan[][]> {
    return handle('extractEntities', modelId, texts) as Promise<EntitySpan[][]>;
  }
}
