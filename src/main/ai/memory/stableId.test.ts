import { describe, expect, it } from 'vitest';
import { stableId } from './stableId';

describe('stableId', () => {
  it('is deterministic for the same path', () => {
    expect(stableId('/Users/x/notes.txt')).toBe(stableId('/Users/x/notes.txt'));
  });

  it('differs for different paths', () => {
    expect(stableId('/Users/x/a.txt')).not.toBe(stableId('/Users/x/b.txt'));
  });

  it('is within supermemory customId limits (<=100 chars, [A-Za-z0-9_-:])', () => {
    const id = stableId('/Users/x/a file with spaces & únïcode.txt');
    expect(id.length).toBeLessThanOrEqual(100);
    expect(id).toMatch(/^[A-Za-z0-9_:-]+$/);
  });
});
