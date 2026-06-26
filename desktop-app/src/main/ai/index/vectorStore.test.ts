import { describe, expect, it } from 'vitest';
import { cosine, decodeVector, encodeVector } from './vectorStore';

describe('vector codec', () => {
  it('round-trips a Float32 vector through a BLOB', () => {
    const v = new Float32Array([0, 1, -1, 0.5, 3.14159, -2.5]);
    const decoded = decodeVector(encodeVector(v));
    expect(Array.from(decoded)).toEqual(Array.from(v));
  });

  it('encodes 4 little-endian bytes per element', () => {
    const buf = encodeVector(new Float32Array([1, 2]));
    expect(buf.byteLength).toBe(8);
    expect(buf.readFloatLE(0)).toBe(1);
    expect(buf.readFloatLE(4)).toBe(2);
  });

  it('decodes from a buffer sitting at a non-zero offset', () => {
    // Buffer.subarray shares memory at an offset Float32Array can't view directly.
    const backing = Buffer.alloc(12);
    backing.writeFloatLE(7, 4);
    backing.writeFloatLE(8, 8);
    const decoded = decodeVector(backing.subarray(4));
    expect(Array.from(decoded)).toEqual([7, 8]);
  });
});

describe('cosine', () => {
  it('is 1 for identical direction and -1 for opposite', () => {
    const a = new Float32Array([1, 2, 3]);
    expect(cosine(a, a)).toBeCloseTo(1, 6);
    expect(cosine(a, new Float32Array([2, 4, 6]))).toBeCloseTo(1, 6); // same direction
    expect(cosine(a, new Float32Array([-1, -2, -3]))).toBeCloseTo(-1, 6);
  });

  it('is ~0 for orthogonal vectors', () => {
    expect(cosine(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0, 6);
  });

  it('returns 0 for a zero vector or mismatched lengths', () => {
    expect(cosine(new Float32Array([0, 0]), new Float32Array([1, 1]))).toBe(0);
    expect(cosine(new Float32Array([1]), new Float32Array([1, 2]))).toBe(0);
  });
});
