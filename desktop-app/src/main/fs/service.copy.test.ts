import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copy, createFile, createFolder } from './service';
import { namesIn, useTempDir } from './fixtures';

describe('copy', () => {
  const tmp = useTempDir();

  it('auto-renames with a " copy" suffix on collision', async () => {
    await createFile(tmp(), 'file.txt');
    const [first] = await copy([join(tmp(), 'file.txt')], tmp());
    expect(first.name).toBe('file copy.txt');

    const [second] = await copy([join(tmp(), 'file.txt')], tmp());
    expect(second.name).toBe('file copy 2.txt');
  });

  it('copies into a different directory keeping the original name', async () => {
    await createFile(tmp(), 'file.txt');
    const dest = await createFolder(tmp(), 'dest');
    const [copied] = await copy([join(tmp(), 'file.txt')], dest.path);
    expect(copied.name).toBe('file.txt');
    expect(await namesIn(tmp())).toContain('file.txt'); // original untouched
  });

  it('copies a folder recursively', async () => {
    const src = await createFolder(tmp(), 'src');
    await createFile(src.path, 'inner.txt');
    const dest = await createFolder(tmp(), 'dest');
    const [copied] = await copy([src.path], dest.path);
    expect(await namesIn(copied.path)).toEqual(['inner.txt']);
  });
});
