import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CACHEDIR_SIGNATURE,
  DATASET_MIN_FILES,
  hasCodebaseMarker,
  isCacheDirTag,
  isCodebaseDoc,
  isIgnored,
  isMachineName,
  isScreenshot,
  isSecretFile,
  isUnder,
  looksLikeDataset,
  PHOTO_BUDGET,
  SCREENSHOT_BUDGET,
  visionBudget,
} from './ignore';

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

describe('isIgnored — rules scoped below the root', () => {
  const j = (...p: string[]) => p.join(sep);

  it('still crawls a root that itself sits under an ignored segment', () => {
    const root = j('', 'tmp', 'my-files');
    expect(isIgnored(j(root, 'notes.md'), [], root)).toBe(false);
    // …but filters what's inside it.
    expect(isIgnored(j(root, 'node_modules', 'x.md'), [], root)).toBe(true);
    expect(isIgnored(j(root, '.cache', 'x.md'), [], root)).toBe(true);
  });

  it('checks every segment when no root is given', () => {
    expect(isIgnored(j('', 'tmp', 'my-files', 'notes.md'))).toBe(true);
  });

  it('ignores a root that does not contain the path', () => {
    expect(isIgnored(j('', 'tmp', 'a.md'), [], j('', 'home', 'me'))).toBe(true);
  });
});

describe('secret files', () => {
  it.each([
    'prod.env', '.env', '.env.local', 'server.pem', 'tls.key', 'cert.p12', 'store.jks', 'vault.kdbx',
    'id_rsa', 'id_ed25519.pub', 'credentials.json', 'client_secret.json', '.netrc', 'service-account.json',
  ])('never reads %s', (name) => {
    expect(isSecretFile(join('/home/me/project', name))).toBe(true);
    expect(isIgnored(join('/home/me/project', name), [], '/home/me')).toBe(true);
  });

  it.each(['environment.md', 'keynote-notes.txt', 'credentials-howto.md', 'envelope.pdf', 'report.pdf'])(
    'reads ordinary %s',
    (name) => {
      expect(isSecretFile(join('/home/me', name))).toBe(false);
    },
  );
});

describe('cache and dataset folders', () => {
  it('recognises the exact CACHEDIR.TAG signature', () => {
    expect(isCacheDirTag(`${CACHEDIR_SIGNATURE}\n# This file is a cache directory tag.`)).toBe(true);
    expect(isCacheDirTag('Signature: something else')).toBe(false);
    expect(isCacheDirTag('')).toBe(false);
  });

  it.each(['frame_00042.png', 'clip-0123.jpg', '00042.png', '3f9a1c0e-1b2c-4d5e-8f90-123456789abc.jpg', 'a3f9c0e1b2c4d5e6f7a8.png'])(
    'treats %s as machine-named',
    (name) => expect(isMachineName(name)).toBe(true),
  );

  it.each(['IMG_1234.jpg', 'DSC01234.JPG', 'PXL_20261021_143022.jpg', '20261021_143022.jpg', '2026-10-21 14.30.22.png', 'beach.png'])(
    'treats %s as a person’s photo',
    (name) => expect(isMachineName(name)).toBe(false),
  );

  const kind = (n: string) => (/\.(png|jpg)$/.test(n) ? 'image' : null);

  it('flags a folder of hundreds of machine-named pictures as a dataset', () => {
    const names = Array.from({ length: DATASET_MIN_FILES }, (_, i) => `frame_${String(i).padStart(5, '0')}.png`);
    expect(looksLikeDataset(names, kind)).toBe(true);
    expect(looksLikeDataset(names.slice(1), kind)).toBe(false);
  });

  it('never flags a camera roll, however large', () => {
    const names = Array.from({ length: 1000 }, (_, i) => `IMG_${1000 + i}.jpg`);
    expect(looksLikeDataset(names, kind)).toBe(false);
  });
});

describe('screenshots', () => {
  it.each(['Screenshot 2026-10-01 at 14.22.10.png', 'Screen Shot 2019-01-01.png', 'Bildschirmfoto 2026.png', 'スクリーンショット 2026.png'])(
    'recognises %s',
    (name) => {
      expect(isScreenshot(join('/home/me/Desktop', name))).toBe(true);
      expect(visionBudget(join('/home/me/Desktop', name))).toBe(SCREENSHOT_BUDGET);
    },
  );

  it('gives photos the smaller budget', () => {
    expect(isScreenshot('/home/me/Pictures/beach.jpg')).toBe(false);
    expect(visionBudget('/home/me/Pictures/beach.jpg')).toBe(PHOTO_BUDGET);
    expect(SCREENSHOT_BUDGET).toBeGreaterThan(PHOTO_BUDGET);
  });
});
