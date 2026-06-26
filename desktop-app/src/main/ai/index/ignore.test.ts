import { sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isIgnored, isUnder } from './ignore';

// Build paths with the OS separator so the prefix logic matches on every platform.
const p = (...segs: string[]) => sep + segs.join(sep);

describe('isIgnored — built-in rules', () => {
  it('skips hidden dotfiles and dependency/cache/bundle trees', () => {
    expect(isIgnored(p('home', '.git', 'config'))).toBe(true);
    expect(isIgnored(p('home', 'proj', 'node_modules', 'react', 'index.js'))).toBe(true);
    expect(isIgnored(p('Users', 'me', 'Library', 'Caches', 'thing'))).toBe(true);
    expect(isIgnored(p('Apps', 'Calculator.app', 'Contents'))).toBe(true);
  });

  it('keeps ordinary files', () => {
    expect(isIgnored(p('home', 'docs', 'notes.md'))).toBe(false);
    expect(isIgnored(p('home', 'proj', 'src', 'main.ts'))).toBe(false);
  });
});

describe('isIgnored — user exclusions', () => {
  it('excludes a folder and everything beneath it', () => {
    const excludes = [p('home', 'private')];
    expect(isIgnored(p('home', 'private'), excludes)).toBe(true);
    expect(isIgnored(p('home', 'private', 'secret.txt'), excludes)).toBe(true);
    expect(isIgnored(p('home', 'public', 'open.txt'), excludes)).toBe(false);
  });

  it('does not treat a sibling sharing a prefix as excluded', () => {
    const excludes = [p('home', 'proj')];
    expect(isIgnored(p('home', 'projects', 'a.txt'), excludes)).toBe(false);
    expect(isIgnored(p('home', 'proj', 'a.txt'), excludes)).toBe(true);
  });
});

describe('isUnder', () => {
  it('matches self and descendants, not prefix-siblings', () => {
    expect(isUnder(p('a', 'b'), p('a', 'b'))).toBe(true);
    expect(isUnder(p('a', 'b', 'c'), p('a', 'b'))).toBe(true);
    expect(isUnder(p('a', 'bc'), p('a', 'b'))).toBe(false);
  });
});
