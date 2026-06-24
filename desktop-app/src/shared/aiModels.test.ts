import { describe, expect, it } from 'vitest';
import { AI_MODELS, DEFAULT_MODEL_ID, getModelDef } from './aiModels';

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
});
