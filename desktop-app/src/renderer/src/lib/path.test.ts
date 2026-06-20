import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseName, parentOf, segments, sep } from './path';

/** Pretend the preload bridge reported a given OS separator. */
function withSep(separator: string): void {
  vi.stubGlobal('platform', { sep: separator, os: separator === '\\' ? 'win32' : 'linux' });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sep', () => {
  it('reads the separator from the preload-provided platform info', () => {
    withSep('\\');
    expect(sep()).toBe('\\');
  });

  it('defaults to POSIX when platform is unavailable', () => {
    vi.stubGlobal('platform', undefined);
    expect(sep()).toBe('/');
  });
});

describe('parentOf (POSIX)', () => {
  it('returns the containing directory', () => {
    withSep('/');
    expect(parentOf('/home/user/file.txt')).toBe('/home/user');
  });

  it('ignores a single trailing separator', () => {
    withSep('/');
    expect(parentOf('/home/user/')).toBe('/home');
  });

  it('stays at the root', () => {
    withSep('/');
    expect(parentOf('/')).toBe('/');
    expect(parentOf('/file')).toBe('/');
  });
});

describe('parentOf (Windows)', () => {
  it('walks up a backslash path', () => {
    withSep('\\');
    expect(parentOf('C:\\Users\\me\\notes.txt')).toBe('C:\\Users\\me');
  });

  it('returns the drive root when going up one level from it', () => {
    withSep('\\');
    expect(parentOf('C:\\Users')).toBe('C:\\');
  });

  it('keeps a drive root as its own (absolute) parent', () => {
    withSep('\\');
    // Must stay "C:\\" — returning "C:" would not be an absolute path and would
    // break the "navigate up" guard (parent === current) at the root.
    expect(parentOf('C:\\')).toBe('C:\\');
  });
});

describe('baseName', () => {
  it('returns the last component (POSIX)', () => {
    withSep('/');
    expect(baseName('/home/user/file.txt')).toBe('file.txt');
  });

  it('ignores a trailing separator', () => {
    withSep('/');
    expect(baseName('/home/user/')).toBe('user');
  });

  it('returns the last component (Windows)', () => {
    withSep('\\');
    expect(baseName('C:\\Users\\me\\notes.txt')).toBe('notes.txt');
  });
});

describe('segments (POSIX)', () => {
  it('builds cumulative breadcrumb paths from root', () => {
    withSep('/');
    expect(segments('/home/user')).toEqual([
      { label: '/', path: '/' },
      { label: 'home', path: '/home' },
      { label: 'user', path: '/home/user' },
    ]);
  });

  it('yields just the root for "/"', () => {
    withSep('/');
    expect(segments('/')).toEqual([{ label: '/', path: '/' }]);
  });
});

describe('segments (Windows)', () => {
  it('builds drive-rooted breadcrumb paths', () => {
    withSep('\\');
    expect(segments('C:\\Users\\me')).toEqual([
      { label: 'C:', path: 'C:\\' },
      { label: 'Users', path: 'C:\\Users' },
      { label: 'me', path: 'C:\\Users\\me' },
    ]);
  });
});

describe('remote URIs', () => {
  it('parentOf strips the last path component', () => {
    withSep('/');
    expect(parentOf('gdrive://acc123/folderA/folderB')).toBe('gdrive://acc123/folderA');
  });

  it('parentOf reaches the account root for a single component', () => {
    withSep('/');
    expect(parentOf('gdrive://acc123/folderA')).toBe('gdrive://acc123/');
  });

  it('parentOf stays at the account root', () => {
    withSep('/');
    expect(parentOf('gdrive://acc123/')).toBe('gdrive://acc123/');
    expect(parentOf('gdrive://acc123')).toBe('gdrive://acc123/');
  });

  it('baseName returns the last path component', () => {
    withSep('/');
    expect(baseName('gdrive://acc123/folderA/folderB')).toBe('folderB');
    expect(baseName('gdrive://acc123/folderA')).toBe('folderA');
  });

  it('baseName returns the accountId at the root', () => {
    withSep('/');
    expect(baseName('gdrive://acc123/')).toBe('acc123');
  });

  it('segments returns shallow breadcrumbs', () => {
    withSep('/');
    expect(segments('gdrive://acc123/')).toEqual([{ label: 'acc123', path: 'gdrive://acc123/' }]);
    expect(segments('gdrive://acc123/folderA')).toEqual([
      { label: 'acc123', path: 'gdrive://acc123/' },
      { label: 'folderA', path: 'gdrive://acc123/folderA' },
    ]);
  });

  it('segments always shows only 2 levels for deeply nested remote paths', () => {
    withSep('/');
    expect(segments('dropbox://acc456/a/b/c')).toEqual([
      { label: 'acc456', path: 'dropbox://acc456/' },
      { label: 'c', path: 'dropbox://acc456/a/b/c' },
    ]);
  });

  // name|driveId encoding — the |id suffix is stripped for display
  it('baseName strips the |id suffix from a name-encoded segment', () => {
    withSep('/');
    expect(baseName('gdrive://acc/Documents|1BxiM')).toBe('Documents');
    expect(baseName('gdrive://acc/Documents|1BxiM/report.pdf|2CyiN')).toBe('report.pdf');
  });

  it('parentOf works correctly with name|id encoded segments', () => {
    withSep('/');
    expect(parentOf('gdrive://acc/Documents|1BxiM/report.pdf|2CyiN')).toBe(
      'gdrive://acc/Documents|1BxiM',
    );
    expect(parentOf('gdrive://acc/Documents|1BxiM')).toBe('gdrive://acc/');
  });

  it('segments shows human names (strips |id) in breadcrumb labels', () => {
    withSep('/');
    expect(segments('gdrive://acc/Documents|1BxiM/report.pdf|2CyiN')).toEqual([
      { label: 'acc', path: 'gdrive://acc/' },
      { label: 'report.pdf', path: 'gdrive://acc/Documents|1BxiM/report.pdf|2CyiN' },
    ]);
  });
});
