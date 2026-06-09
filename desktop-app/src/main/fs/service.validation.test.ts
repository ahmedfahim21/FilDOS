import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertValidPath } from './service';
import { useTempDir } from './fixtures';

describe('assertValidPath', () => {
  const tmp = useTempDir();

  it('accepts and normalises an absolute path', () => {
    expect(assertValidPath(join(tmp(), 'a', '..', 'b'))).toBe(join(tmp(), 'b'));
  });

  it('rejects empty, non-string, relative, and null-byte paths', () => {
    expect(() => assertValidPath('')).toThrow();
    expect(() => assertValidPath(42 as unknown)).toThrow();
    expect(() => assertValidPath('relative/path')).toThrow();
    expect(() => assertValidPath('/has/\0/null')).toThrow();
  });
});
