import { describe, expect, it } from 'vitest';
import {
  folderPathAt,
  initialNavState,
  reducer,
  type NavLocation,
  type NavState,
} from './navigation';

/** A starting state rooted at `/home`. */
const start = () => initialNavState('/home');

/** The current location of a state. */
const current = (s: NavState): NavLocation => s.history[s.index];

describe('reducer — folder navigation (unchanged behavior)', () => {
  it('navigate pushes a folder and truncates forward history', () => {
    let s = start();
    s = reducer(s, { type: 'navigate', path: '/home/docs' });
    s = reducer(s, { type: 'navigate', path: '/home/docs/sub' });
    expect(s.history).toEqual([
      { kind: 'folder', path: '/home' },
      { kind: 'folder', path: '/home/docs' },
      { kind: 'folder', path: '/home/docs/sub' },
    ]);
    expect(s.index).toBe(2);

    // Going back then navigating elsewhere drops the truncated forward entry.
    s = reducer(s, { type: 'back' });
    s = reducer(s, { type: 'navigate', path: '/home/pics' });
    expect(s.history.map((l) => (l.kind === 'folder' ? l.path : l.kind))).toEqual([
      '/home',
      '/home/docs',
      '/home/pics',
    ]);
  });

  it('navigate to the current folder is a no-op', () => {
    const s = start();
    expect(reducer(s, { type: 'navigate', path: '/home' })).toBe(s);
  });

  it('up pushes the parent folder', () => {
    let s = reducer(start(), { type: 'navigate', path: '/home/docs/sub' });
    s = reducer(s, { type: 'up' });
    expect(current(s)).toEqual({ kind: 'folder', path: '/home/docs' });
  });
});

describe('reducer — pages as history entries', () => {
  it('openPage pushes a page and back/forward traverse it', () => {
    let s = reducer(start(), { type: 'openPage', page: { kind: 'recents' } });
    expect(current(s)).toEqual({ kind: 'recents' });
    expect(s.index).toBe(1);

    // Back returns to the folder the page was opened from.
    s = reducer(s, { type: 'back' });
    expect(current(s)).toEqual({ kind: 'folder', path: '/home' });

    // Forward re-opens the page.
    s = reducer(s, { type: 'forward' });
    expect(current(s)).toEqual({ kind: 'recents' });
  });

  it('openPage de-dupes the same page (no duplicate history entry)', () => {
    let s = reducer(start(), { type: 'openPage', page: { kind: 'trash' } });
    const before = s;
    s = reducer(s, { type: 'openPage', page: { kind: 'trash' } });
    expect(s).toBe(before);
    expect(s.history).toHaveLength(2);
  });

  it('openPage de-dupes a tag page only when the tagId matches', () => {
    let s = reducer(start(), { type: 'openPage', page: { kind: 'tag', tagId: 1 } });
    s = reducer(s, { type: 'openPage', page: { kind: 'tag', tagId: 1 } });
    expect(s.history).toHaveLength(2); // same tag → no push

    s = reducer(s, { type: 'openPage', page: { kind: 'tag', tagId: 2 } });
    expect(s.history).toHaveLength(3); // different tag → pushed
    expect(current(s)).toEqual({ kind: 'tag', tagId: 2 });
  });

  it('navigating from a page keeps it in the back-stack (Back returns to it)', () => {
    let s = reducer(start(), { type: 'openPage', page: { kind: 'recents' } });
    s = reducer(s, { type: 'navigate', path: '/home/docs' });
    expect(s.history).toEqual([
      { kind: 'folder', path: '/home' },
      { kind: 'recents' },
      { kind: 'folder', path: '/home/docs' },
    ]);
    s = reducer(s, { type: 'back' });
    expect(current(s)).toEqual({ kind: 'recents' });
  });

  it('up from a page acts on the folder behind it', () => {
    let s = reducer(start(), { type: 'navigate', path: '/home/docs' });
    s = reducer(s, { type: 'openPage', page: { kind: 'trash' } });
    s = reducer(s, { type: 'up' });
    expect(current(s)).toEqual({ kind: 'folder', path: '/home' });
  });
});

describe('folderPathAt — the folder backing the current location', () => {
  const history: NavLocation[] = [
    { kind: 'folder', path: '/home' },
    { kind: 'folder', path: '/home/docs' },
    { kind: 'recents' },
    { kind: 'tag', tagId: 7 },
  ];

  it('returns a folder location’s own path', () => {
    expect(folderPathAt(history, 1)).toBe('/home/docs');
  });

  it('borrows the nearest folder behind a page', () => {
    expect(folderPathAt(history, 2)).toBe('/home/docs'); // recents
    expect(folderPathAt(history, 3)).toBe('/home/docs'); // tag, scanning back past recents
  });
});
