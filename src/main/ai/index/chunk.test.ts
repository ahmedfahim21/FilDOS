import { describe, expect, it } from 'vitest';
import { chunk, OVERLAP, WINDOW } from './chunk';

describe('chunk', () => {
  it('returns nothing for blank input', () => {
    expect(chunk('')).toEqual([]);
    expect(chunk('   \n\t  ')).toEqual([]);
  });

  it('returns a single trimmed chunk for short text', () => {
    expect(chunk('  hello world  ')).toEqual([{ chunkIx: 0, text: 'hello world' }]);
  });

  it('splits long text into overlapping windows with contiguous indices', () => {
    const text = 'a'.repeat(WINDOW * 2 + 100);
    const chunks = chunk(text);

    expect(chunks.length).toBeGreaterThan(1);
    // Indices are 0,1,2,… with no gaps.
    expect(chunks.map((c) => c.chunkIx)).toEqual(chunks.map((_, i) => i));
    // Every non-final window is exactly WINDOW chars.
    for (const c of chunks.slice(0, -1)) expect(c.text.length).toBe(WINDOW);
    // The whole text is covered (last window reaches the end).
    expect(chunks.at(-1)!.text.length).toBeLessThanOrEqual(WINDOW);
  });

  it('overlaps consecutive windows by OVERLAP characters', () => {
    // Distinct characters so we can see the seam.
    const text = Array.from({ length: WINDOW * 2 }, (_, i) => String.fromCharCode(33 + (i % 90))).join('');
    const [first, second] = chunk(text);
    const stride = WINDOW - OVERLAP;
    // The tail of chunk 0 equals the head of chunk 1.
    expect(first.text.slice(stride)).toBe(second.text.slice(0, OVERLAP));
  });
});
