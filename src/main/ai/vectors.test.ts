import { describe, expect, it } from 'vitest';
import { assertFiniteVector, BadVectorError, rowsOf, truncateNormalize } from './vectors';

const norm = (v: ArrayLike<number>) => Math.sqrt(Array.from(v).reduce((s, x) => s + x * x, 0));

describe('assertFiniteVector', () => {
  it('accepts a finite non-zero vector', () => {
    expect(() => assertFiniteVector([0.1, -0.2, 0.3])).not.toThrow();
  });

  it.each([
    ['NaN', [0.1, Number.NaN, 0.2]],
    ['Infinity', [Number.POSITIVE_INFINITY, 0.1]],
    ['-Infinity', [0.1, Number.NEGATIVE_INFINITY]],
  ])('rejects %s', (_label, vec) => {
    expect(() => assertFiniteVector(vec)).toThrow(BadVectorError);
  });

  it('rejects an all-zero vector', () => {
    expect(() => assertFiniteVector([0, 0, 0])).toThrow(/all zeros/);
  });

  it('carries an error code for the IPC layer', () => {
    try {
      assertFiniteVector([Number.NaN]);
    } catch (err) {
      expect((err as BadVectorError).code).toBe('EBADVECTOR');
    }
  });
});

describe('truncateNormalize', () => {
  it('keeps the leading values and renormalizes to unit length', () => {
    const out = truncateNormalize([3, 4, 12], 2);
    expect(Array.from(out)).toEqual([0.6000000238418579, 0.800000011920929]);
    expect(norm(out)).toBeCloseTo(1, 6);
  });

  it('returns a unit copy at full width', () => {
    const out = truncateNormalize([1, 1], 2);
    expect(norm(out)).toBeCloseTo(1, 6);
    expect(out[0]).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('rejects widening and bad input', () => {
    expect(() => truncateNormalize([1, 2], 3)).toThrow(RangeError);
    expect(() => truncateNormalize([Number.NaN, 1], 1)).toThrow(BadVectorError);
    expect(() => truncateNormalize([0, 0, 5], 2)).toThrow(/leading 2/);
  });
});

describe('rowsOf', () => {
  it('splits a row-major buffer into unit rows', () => {
    const rows = rowsOf(new Float32Array([3, 4, 0, 0, 1, 0]), 2, 3, 2);
    expect(rows).toHaveLength(2);
    expect(Array.from(rows[0])).toEqual([0.6000000238418579, 0.800000011920929]);
    expect(Array.from(rows[1])).toEqual([0, 1]);
  });

  it('rejects a buffer of the wrong size', () => {
    expect(() => rowsOf([1, 2, 3], 2, 2, 2)).toThrow(/2×2/);
  });

  it('fails the whole batch when any row is NaN', () => {
    expect(() => rowsOf([1, 0, Number.NaN, 0], 2, 2, 2)).toThrow(BadVectorError);
  });
});
