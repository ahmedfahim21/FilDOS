import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFile, duplicate } from './service';
import { namesIn, useTempDir } from './fixtures';

describe('duplicate', () => {
  const tmp = useTempDir();

  it('copies an entry beside itself with a " copy" suffix', async () => {
    await createFile(tmp(), 'file.txt');
    const dup = await duplicate(join(tmp(), 'file.txt'));
    expect(dup.name).toBe('file copy.txt');
    expect(await namesIn(tmp())).toEqual(['file copy.txt', 'file.txt']);
  });
});
