import { describe, expect, it } from 'vitest';
import type { Entry } from '@shared/types';
import { formatDate, formatSize, isImage, typeLabel } from './format';

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

describe('formatSize', () => {
  it('renders zero bytes', () => {
    expect(formatSize(0)).toBe('0 B');
  });

  it('keeps whole bytes without a decimal', () => {
    expect(formatSize(512)).toBe('512 B');
  });

  it('scales into KB/MB/GB with one decimal', () => {
    expect(formatSize(1024)).toBe('1 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(1024 * 1024)).toBe('1 MB');
    expect(formatSize(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('caps at the largest known unit', () => {
    expect(formatSize(Math.pow(1024, 5))).toBe('1 PB');
    // Beyond PB still reports in PB rather than an undefined unit.
    expect(formatSize(Math.pow(1024, 6))).toBe('1024 PB');
  });
});

describe('formatDate', () => {
  it('shows an em dash for a falsy timestamp', () => {
    expect(formatDate(0)).toBe('—');
  });

  it('formats a real timestamp into a non-empty string', () => {
    const out = formatDate(Date.UTC(2026, 5, 8, 12, 0, 0));
    expect(out).not.toBe('—');
    expect(out).toContain('2026');
  });
});

describe('typeLabel', () => {
  it('labels folders', () => {
    expect(typeLabel(makeEntry({ isDirectory: true }))).toBe('Folder');
  });

  it('labels symlinks as aliases', () => {
    expect(typeLabel(makeEntry({ isSymlink: true }))).toBe('Alias');
  });

  it('upper-cases the extension for files', () => {
    expect(typeLabel(makeEntry({ ext: 'pdf' }))).toBe('PDF file');
  });

  it('falls back to a plain "File" with no extension', () => {
    expect(typeLabel(makeEntry({ ext: '' }))).toBe('File');
  });
});

describe('isImage', () => {
  it('recognises known image extensions', () => {
    expect(isImage(makeEntry({ ext: 'png' }))).toBe(true);
    expect(isImage(makeEntry({ ext: 'jpeg' }))).toBe(true);
    expect(isImage(makeEntry({ ext: 'svg' }))).toBe(true);
  });

  it('rejects non-images and directories', () => {
    expect(isImage(makeEntry({ ext: 'txt' }))).toBe(false);
    expect(isImage(makeEntry({ ext: 'png', isDirectory: true }))).toBe(false);
  });
});
