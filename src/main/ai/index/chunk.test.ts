import { describe, expect, it } from 'vitest';
import { chunk, OVERLAP, TARGET_TOKENS, WINDOW } from './chunk';

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

  it('accepts custom window and overlap for token-dense content', () => {
    // Simulate a dense file where 2 chars = 1 token: real window should be ~half
    // the default. With a 512-token limit and 2 chars/token the safe window is ~870
    // chars (512 * 2 * 0.85). Passing explicit params exercises that code path.
    const charsPerToken = 2;
    const narrowWindow = Math.max(Math.floor(TARGET_TOKENS * charsPerToken * 0.85), 256);
    const narrowOverlap = Math.floor(narrowWindow / 8);
    const text = 'x'.repeat(WINDOW * 2); // 4096 chars
    const standard = chunk(text);
    const narrow = chunk(text, narrowWindow, narrowOverlap);
    expect(narrow.length).toBeGreaterThan(standard.length);
    // Every non-final narrow chunk is exactly narrowWindow chars.
    for (const c of narrow.slice(0, -1)) expect(c.text.length).toBe(narrowWindow);
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
