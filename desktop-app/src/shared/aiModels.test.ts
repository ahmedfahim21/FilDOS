import { describe, expect, it } from 'vitest';
import { AI_MODELS, DEFAULT_MODEL_ID, getModelDef, promptFor } from './aiModels';

describe('AI model catalog', () => {
  it('has a unique id per model', () => {
    const ids = AI_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the default model', () => {
    expect(getModelDef(DEFAULT_MODEL_ID)).toBeDefined();
  });

  it('declares a positive dimension and a load kind for every model', () => {
    for (const m of AI_MODELS) {
      expect(m.dim).toBeGreaterThan(0);
      expect(['feature-extraction', 'clip']).toContain(m.kind);
    }
  });

  it('returns undefined for unknown ids', () => {
    expect(getModelDef('not/a-model')).toBeUndefined();
  });

  it('applies query/passage prompts for asymmetric models only', () => {
    expect(promptFor('Xenova/bge-small-en-v1.5', 'query')).toMatch(/Represent this sentence/);
    expect(promptFor('Xenova/bge-small-en-v1.5', 'passage')).toBe('');
    expect(promptFor('Xenova/multilingual-e5-small', 'query')).toBe('query: ');
    expect(promptFor('Xenova/multilingual-e5-small', 'passage')).toBe('passage: ');
    // Symmetric models (and unknown ids) need no prefix.
    expect(promptFor('Xenova/all-MiniLM-L6-v2', 'query')).toBe('');
    expect(promptFor('Xenova/gte-small', 'query')).toBe('');
    expect(promptFor('nope', 'query')).toBe('');
  });
});
