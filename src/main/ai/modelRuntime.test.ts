import { describe, expect, it } from 'vitest';
import { MAX_CALL_TOKENS, tokenGroups } from './modelRuntime';

describe('tokenGroups', () => {
  it('splits so count × longest stays within the budget', () => {
    // 600-token chunks: 3 per call (1800), never 4 (2400).
    expect(tokenGroups(Array(16).fill(600), MAX_CALL_TOKENS)).toEqual([
      [0, 3], [3, 6], [6, 9], [9, 12], [12, 15], [15, 16],
    ]);
  });

  it('packs short inputs together and gives an oversized one its own call', () => {
    expect(tokenGroups([100, 100, 100, 3000, 50], 2048)).toEqual([[0, 3], [3, 4], [4, 5]]);
  });

  it('accounts for a long input arriving after short ones (padding grows)', () => {
    expect(tokenGroups([10, 10, 10, 1000, 10], 2048)).toEqual([[0, 3], [3, 5]]);
    expect(tokenGroups([10, 10, 1000], 2048)).toEqual([[0, 2], [2, 3]]);
  });

  it('handles nothing', () => {
    expect(tokenGroups([], 2048)).toEqual([]);
  });
});
