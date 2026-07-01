import { describe, expect, it } from 'vitest';
import type { Entry } from '@shared/types';
import { fileLogo } from './fileLogo';

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

describe('fileLogo', () => {
  it('returns the folder icon for directories', () => {
    const icon = fileLogo(makeEntry({ isDirectory: true, ext: '' }));
    expect(icon).toContain('folder');
  });

  it('maps known extensions to their type icon', () => {
    expect(fileLogo(makeEntry({ name: 'a.png', ext: 'png' }))).toContain('image');
    expect(fileLogo(makeEntry({ name: 'a.mp4', ext: 'mp4' }))).toContain('video');
    expect(fileLogo(makeEntry({ name: 'a.pdf', ext: 'pdf' }))).toContain('pdf');
    expect(fileLogo(makeEntry({ name: 'a.zip', ext: 'zip' }))).toContain('archive');
  });

  it('maps language extensions to their language icon', () => {
    expect(fileLogo(makeEntry({ name: 'a.ts', ext: 'ts' }))).toContain('lang-typescript');
    expect(fileLogo(makeEntry({ name: 'a.tsx', ext: 'tsx' }))).toContain('lang-react');
    expect(fileLogo(makeEntry({ name: 'a.py', ext: 'py' }))).toContain('lang-python');
    expect(fileLogo(makeEntry({ name: 'a.rs', ext: 'rs' }))).toContain('lang-rust');
  });

  it('recognises special extensionless filenames by name', () => {
    expect(fileLogo(makeEntry({ name: 'Dockerfile', ext: '' }))).toContain('docker');
    expect(fileLogo(makeEntry({ name: '.gitignore', ext: '' }))).toContain('git');
    expect(fileLogo(makeEntry({ name: 'yarn.lock', ext: 'lock' }))).toContain('lockfile');
    expect(fileLogo(makeEntry({ name: 'package.json', ext: 'json' }))).toContain('package');
  });

  it('treats every .env variant as an env file', () => {
    expect(fileLogo(makeEntry({ name: '.env', ext: '' }))).toContain('env');
    expect(fileLogo(makeEntry({ name: '.env.local', ext: 'local' }))).toContain('env');
    expect(fileLogo(makeEntry({ name: '.env.production', ext: 'production' }))).toContain('env');
  });

  it('falls back to "others" for unknown extensions', () => {
    expect(fileLogo(makeEntry({ name: 'a.qwerty', ext: 'qwerty' }))).toContain('others');
  });

  it('falls back to "unknown" for files with no extension', () => {
    expect(fileLogo(makeEntry({ name: 'README', ext: '' }))).toContain('unknown');
  });
});
