import { describe, expect, it } from 'vitest';
import type { Entry } from '@shared/types';
import { sortEntries } from './sortEntries';

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    name: 'file.txt',
    path: '/tmp/file.txt',
    isDirectory: false,
    isSymlink: false,
    isHidden: false,
    size: 0,
    ext: 'txt',
    modified: 0,
    created: 0,
    ...overrides,
  };
}

const file = (name: string, rest: Partial<Entry> = {}) =>
  makeEntry({ name, path: `/tmp/${name}`, ext: name.split('.').pop() ?? '', ...rest });
const folder = (name: string) =>
  makeEntry({ name, path: `/tmp/${name}`, isDirectory: true, ext: '' });

describe('sortEntries', () => {
  it('keeps folders ahead of files regardless of direction', () => {
    const input = [file('b.txt'), folder('a'), file('a.txt'), folder('z')];
    const asc = sortEntries(input, { key: 'name', dir: 'asc' }).map((e) => e.name);
    expect(asc).toEqual(['a', 'z', 'a.txt', 'b.txt']);

    const desc = sortEntries(input, { key: 'name', dir: 'desc' }).map((e) => e.name);
    // Folders still lead; only the within-group order flips.
    expect(desc).toEqual(['z', 'a', 'b.txt', 'a.txt']);
  });

  it('sorts by name case-insensitively', () => {
    const input = [file('Banana.txt'), file('apple.txt')];
    expect(sortEntries(input, { key: 'name', dir: 'asc' }).map((e) => e.name)).toEqual([
      'apple.txt',
      'Banana.txt',
    ]);
  });

  it('sorts by size, modified and type', () => {
    const bySize = sortEntries(
      [file('big', { size: 100 }), file('small', { size: 1 })],
      { key: 'size', dir: 'asc' },
    ).map((e) => e.name);
    expect(bySize).toEqual(['small', 'big']);

    const byModified = sortEntries(
      [file('new', { modified: 200 }), file('old', { modified: 100 })],
      { key: 'modified', dir: 'desc' },
    ).map((e) => e.name);
    expect(byModified).toEqual(['new', 'old']);

    const byType = sortEntries(
      [file('a.zip'), file('b.doc')],
      { key: 'type', dir: 'asc' },
    ).map((e) => e.name);
    expect(byType).toEqual(['b.doc', 'a.zip']);
  });

  it('does not mutate the input array', () => {
    const input = [file('b.txt'), file('a.txt')];
    const copy = [...input];
    sortEntries(input, { key: 'name', dir: 'asc' });
    expect(input).toEqual(copy);
  });
});
