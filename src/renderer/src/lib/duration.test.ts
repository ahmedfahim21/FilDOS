import { describe, expect, it } from 'vitest';
import { formatDuration } from './duration';

describe('formatDuration', () => {
  it.each([
    [0, 'under a minute'],
    [59, 'under a minute'],
    [60, '1 min'],
    [12.4 * 60, '12 min'],
    [3600, '1 h'],
    [2 * 3600 + 5 * 60, '2 h 5 min'],
    [3 * 86400, '3 days'],
    [Number.NaN, 'under a minute'],
  ])('%s s → %s', (s, out) => {
    expect(formatDuration(s)).toBe(out);
  });
});
