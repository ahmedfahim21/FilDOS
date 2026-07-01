import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFile, createFolder, getInfo, listDir } from './service';
import { useTempDir } from './fixtures';

describe('listDir', () => {
  const tmp = useTempDir();

  it('returns folders first, then files, each sorted case-insensitively', async () => {
    await createFolder(tmp(), 'Zeta');
    await createFolder(tmp(), 'alpha');
    await createFile(tmp(), 'b.txt');
    await createFile(tmp(), 'A.txt');

    const entries = await listDir(tmp());
    expect(entries.map((e) => e.name)).toEqual(['alpha', 'Zeta', 'A.txt', 'b.txt']);
    expect(entries.slice(0, 2).every((e) => e.isDirectory)).toBe(true);
  });

  it('flags dotfiles as hidden', async () => {
    await createFile(tmp(), '.secret');
    const [entry] = await listDir(tmp());
    expect(entry.isHidden).toBe(true);
  });
});

describe('getInfo', () => {
  const tmp = useTempDir();

  it('returns detailed metadata including permissions', async () => {
    await createFile(tmp(), 'a.txt');
    const info = await getInfo(join(tmp(), 'a.txt'));
    expect(info.name).toBe('a.txt');
    expect(info.permissions).toMatch(/^[rwx-]{9}$/);
    expect(info.realPath).toBeNull();
  });
});
