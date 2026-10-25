import { describe, expect, it } from 'vitest';
import { insideHours, msUntilAllowed, parseHours } from './hours';

const at = (h: number, m = 0) => new Date(2026, 9, 25, h, m, 0);

describe('insideHours', () => {
  it('handles a window within the day', () => {
    const night = { start: 60, end: 420 };
    expect(insideHours(night, at(0, 59))).toBe(false);
    expect(insideHours(night, at(1))).toBe(true);
    expect(insideHours(night, at(6, 59))).toBe(true);
    expect(insideHours(night, at(7))).toBe(false);
  });

  it('handles a window across midnight', () => {
    const late = { start: 22 * 60, end: 6 * 60 };
    expect(insideHours(late, at(23))).toBe(true);
    expect(insideHours(late, at(3))).toBe(true);
    expect(insideHours(late, at(12))).toBe(false);
  });

  it('treats equal start and end as all day', () => {
    expect(insideHours({ start: 300, end: 300 }, at(14))).toBe(true);
  });
});

describe('msUntilAllowed', () => {
  it('is zero inside the hours or without any', () => {
    expect(msUntilAllowed({ start: 60, end: 420 }, at(2))).toBe(0);
    expect(msUntilAllowed(null, at(2))).toBe(0);
  });

  it('waits for the next start, today or tomorrow', () => {
    expect(msUntilAllowed({ start: 60, end: 420 }, at(0, 30))).toBe(30 * 60_000);
    expect(msUntilAllowed({ start: 60, end: 420 }, at(8))).toBe(17 * 3_600_000);
    expect(msUntilAllowed({ start: 22 * 60, end: 6 * 60 }, at(12))).toBe(10 * 3_600_000);
  });
});

describe('parseHours', () => {
  it('accepts whole minutes within a day only', () => {
    expect(parseHours({ start: 60, end: 420 })).toEqual({ start: 60, end: 420 });
    expect(parseHours({ start: -1, end: 420 })).toBeNull();
    expect(parseHours({ start: 60, end: 1440 })).toBeNull();
    expect(parseHours({ start: 1.5, end: 2 })).toBeNull();
    expect(parseHours(null)).toBeNull();
    expect(parseHours('01:00')).toBeNull();
  });
});
