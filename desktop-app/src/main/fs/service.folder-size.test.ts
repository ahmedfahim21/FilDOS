import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFolder, folderSize } from './service';
import { useTempDir } from './fixtures';

describe('folderSize', () => {
  const tmp = useTempDir();

  it('sums file sizes recursively, ignoring directory entries', async () => {
    await fs.writeFile(join(tmp(), 'a.txt'), 'hello'); // 5 bytes
    const sub = await createFolder(tmp(), 'sub');
    await fs.writeFile(join(sub.path, 'b.txt'), 'world!'); // 6 bytes
    expect(await folderSize(tmp())).toBe(11);
  });

  it('returns zero for an unreadable / missing path', async () => {
    expect(await folderSize(join(tmp(), 'does-not-exist'))).toBe(0);
  });
});
