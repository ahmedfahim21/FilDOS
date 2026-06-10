import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFile, rename } from './service';
import { namesIn, useTempDir } from './fixtures';

describe('rename', () => {
  const tmp = useTempDir();

  it('renames an entry in place', async () => {
    await createFile(tmp(), 'old.txt');
    const entry = await rename(join(tmp(), 'old.txt'), 'new.txt');
    expect(entry.name).toBe('new.txt');
    expect(await namesIn(tmp())).toEqual(['new.txt']);
  });

  it('refuses to clobber an existing entry', async () => {
    await createFile(tmp(), 'a.txt');
    await createFile(tmp(), 'b.txt');
    await expect(rename(join(tmp(), 'a.txt'), 'b.txt')).rejects.toMatchObject({ code: 'EEXIST' });
  });
});
