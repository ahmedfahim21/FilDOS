import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFile, createFolder, move } from './service';
import { namesIn, useTempDir } from './fixtures';

describe('move', () => {
  const tmp = useTempDir();

  it('moves an entry into another directory', async () => {
    await createFile(tmp(), 'file.txt');
    const dest = await createFolder(tmp(), 'dest');
    const [moved] = await move([join(tmp(), 'file.txt')], dest.path);
    expect(moved.path).toBe(join(dest.path, 'file.txt'));
    expect(await namesIn(tmp())).toEqual(['dest']); // original gone
  });

  it('is a no-op when the destination is the current directory', async () => {
    await createFile(tmp(), 'file.txt');
    const [moved] = await move([join(tmp(), 'file.txt')], tmp());
    expect(moved.name).toBe('file.txt');
    expect(await namesIn(tmp())).toEqual(['file.txt']);
  });

  it('auto-renames on collision in the destination', async () => {
    const dest = await createFolder(tmp(), 'dest');
    await createFile(dest.path, 'file.txt');
    await createFile(tmp(), 'file.txt');
    const [moved] = await move([join(tmp(), 'file.txt')], dest.path);
    expect(moved.name).toBe('file copy.txt');
  });
});
