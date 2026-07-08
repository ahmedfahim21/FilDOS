import { sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasCodebaseMarker, isCodebaseDoc, isIgnored, isUnder } from './ignore';

// Build paths with the OS separator so the prefix logic matches on every platform.
const p = (...segs: string[]) => sep + segs.join(sep);

describe('isIgnored — built-in rules', () => {
  it('skips hidden dotfiles and dependency/cache/bundle trees', () => {
    expect(isIgnored(p('home', '.git', 'config'))).toBe(true);
    expect(isIgnored(p('home', 'proj', 'node_modules', 'react', 'index.js'))).toBe(true);
    expect(isIgnored(p('Users', 'me', 'Library', 'Caches', 'thing'))).toBe(true);
    expect(isIgnored(p('Apps', 'Calculator.app', 'Contents'))).toBe(true);
  });

  it('skips system trees on every platform', () => {
    expect(isIgnored(p('Users', 'me', 'Library', 'Preferences', 'x.plist'))).toBe(true);
    expect(isIgnored(p('Windows', 'System32', 'drivers', 'etc', 'hosts'))).toBe(true);
    expect(isIgnored(p('Users', 'me', 'AppData', 'Roaming', 'x.dat'))).toBe(true);
    expect(isIgnored(p('Program Files', 'App', 'readme.txt'))).toBe(true);
    expect(isIgnored(p('Users', 'me', 'Documents', 'tmp', 'scratch.txt'))).toBe(true);
    expect(isIgnored(p('home', 'proj', '__pycache__', 'mod.pyc'))).toBe(true);
  });

  it('keeps ordinary files', () => {
    expect(isIgnored(p('home', 'docs', 'notes.md'))).toBe(false);
    expect(isIgnored(p('home', 'proj', 'src', 'main.ts'))).toBe(false);
  });
});

describe('codebase detection', () => {
  it('recognises marker files case-insensitively', () => {
    expect(hasCodebaseMarker(['src', 'package.json'])).toBe(true);
    expect(hasCodebaseMarker(['Makefile'])).toBe(true);
    expect(hasCodebaseMarker(['.git', 'README.md'])).toBe(true);
    expect(hasCodebaseMarker(['Cargo.toml'])).toBe(true);
    expect(hasCodebaseMarker(['notes.md', 'photos', 'tax.pdf'])).toBe(false);
  });

  it('keeps only documentation formats inside a codebase', () => {
    expect(isCodebaseDoc(p('proj', 'README.md'))).toBe(true);
    expect(isCodebaseDoc(p('proj', 'docs', 'guide.mdx'))).toBe(true);
    expect(isCodebaseDoc(p('proj', 'docs', 'spec.pdf'))).toBe(true);
    expect(isCodebaseDoc(p('proj', 'NOTES.TXT'))).toBe(true);
    expect(isCodebaseDoc(p('proj', 'src', 'main.ts'))).toBe(false);
    expect(isCodebaseDoc(p('proj', 'data.json'))).toBe(false);
    expect(isCodebaseDoc(p('proj', 'logo.png'))).toBe(false);
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
