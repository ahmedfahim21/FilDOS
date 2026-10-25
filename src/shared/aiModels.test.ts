import { describe, expect, it } from 'vitest';
import {
  AI_MODELS,
  EMBED_DIMS,
  EMBED_MODEL_ID,
  getModelDef,
  indexFingerprint,
  INDEX_MODEL_IDS,
  relevanceOf,
} from './aiModels';
import { documentText, PROMPTS_VERSION, promptedText, queryText } from './embeddingPrompts';

describe('AI model catalog', () => {
  it('has a unique id per model', () => {
    const ids = AI_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('indexes with EmbeddingGemma 2 only', () => {
    expect(INDEX_MODEL_IDS).toEqual([EMBED_MODEL_ID]);
    const def = getModelDef(EMBED_MODEL_ID)!;
    expect(def.kind).toBe('multimodal');
    expect(EMBED_DIMS).toContain(def.dim);
    expect(def.components?.map((c) => c.session)).toEqual(['model', 'vision_encoder']);
    expect(def.sizeMb).toBe(def.components!.reduce((s, c) => s + c.sizeMb, 0));
  });

  it('never loads float16 weights (EmbeddingGemma 2 overflows fp16)', () => {
    for (const m of AI_MODELS) {
      expect(['q8', 'fp32']).toContain(m.dtype);
      expect(m.dtype).not.toMatch(/16/);
    }
  });

  it('allows only the Matryoshka dims the model is good at', () => {
    expect([...EMBED_DIMS]).toEqual([768, 512, 256]);
  });

  it('declares a valid kind for every model, and positive dim for embedding models', () => {
    for (const m of AI_MODELS) {
      expect(['multimodal', 'reranker', 'ner']).toContain(m.kind);
      if (m.kind === 'multimodal') expect(m.dim).toBeGreaterThan(0);
      else expect(m.dim).toBe(0);
    }
  });

  it('returns undefined for unknown ids', () => {
    expect(getModelDef('not/a-model')).toBeUndefined();
  });

  it('maps cosine to a [0,1] relevance using the model calibration', () => {
    const { floor, ceil } = getModelDef(EMBED_MODEL_ID)!.relevance!;
    expect(relevanceOf(EMBED_MODEL_ID, floor)).toBeCloseTo(0, 5);
    expect(relevanceOf(EMBED_MODEL_ID, ceil)).toBeCloseTo(1, 5);
    expect(relevanceOf(EMBED_MODEL_ID, floor - 0.1)).toBe(0);
    expect(relevanceOf(EMBED_MODEL_ID, ceil + 0.1)).toBe(1);
    // Uncalibrated model → cosine passes through.
    expect(relevanceOf('nope', 0.42)).toBe(0.42);
  });

  it('fingerprints model, precision, dimension and prompt version', () => {
    expect(indexFingerprint(PROMPTS_VERSION)).toBe(`${EMBED_MODEL_ID}|q8|768|prompts${PROMPTS_VERSION}`);
    expect(indexFingerprint(PROMPTS_VERSION + 1)).not.toBe(indexFingerprint(PROMPTS_VERSION));
  });
});

describe('embedding prompts', () => {
  it('prefixes search queries and questions with their task', () => {
    expect(queryText('red lentil soup')).toBe('task: search result | query: red lentil soup');
    expect(queryText('when is tax due?', 'question')).toBe('task: question answering | query: when is tax due?');
  });

  it('titles documents by file name, or none', () => {
    expect(documentText('Mix flour.', 'sourdough.md')).toBe('title: sourdough.md | text: Mix flour.');
    expect(documentText('Mix flour.')).toBe('title: none | text: Mix flour.');
    expect(documentText('Mix flour.', '  ')).toBe('title: none | text: Mix flour.');
    expect(documentText('x', 'Budget\n2026.docx')).toBe('title: Budget 2026.docx | text: x');
  });

  it('routes by role', () => {
    expect(promptedText('a', 'passage', 'f.txt')).toBe('title: f.txt | text: a');
    expect(promptedText('a', 'query', 'ignored')).toBe('task: search result | query: a');
    expect(promptedText('a', 'question')).toBe('task: question answering | query: a');
  });
});
