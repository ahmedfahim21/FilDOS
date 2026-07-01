import { describe, expect, it } from 'vitest';
import { createFile, createFolder } from './service';
import { namesIn, useTempDir } from './fixtures';

describe('createFolder / createFile', () => {
  const tmp = useTempDir();

  it('creates a folder and reports it', async () => {
    const entry = await createFolder(tmp(), 'docs');
    expect(entry.isDirectory).toBe(true);
    expect(entry.name).toBe('docs');
    expect(await namesIn(tmp())).toEqual(['docs']);
  });

  it('creates an empty file with a parsed extension', async () => {
    const entry = await createFile(tmp(), 'notes.txt');
    expect(entry.isDirectory).toBe(false);
    expect(entry.ext).toBe('txt');
    expect(entry.size).toBe(0);
  });

  it('rejects invalid names', async () => {
    await expect(createFolder(tmp(), '')).rejects.toThrow();
    await expect(createFolder(tmp(), '..')).rejects.toThrow();
    await expect(createFile(tmp(), 'a/b')).rejects.toThrow();
  });

  it('surfaces EEXIST on a name collision', async () => {
    await createFolder(tmp(), 'dup');
    await expect(createFolder(tmp(), 'dup')).rejects.toMatchObject({ code: 'EEXIST' });
  });
});
