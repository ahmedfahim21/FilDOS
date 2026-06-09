import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFile, createFolder, search } from './service';
import { useTempDir } from './fixtures';

describe('search', () => {
  const tmp = useTempDir();

  it('finds matches recursively, case-insensitively, with relative paths', async () => {
    await createFile(tmp(), 'Report.txt');
    const sub = await createFolder(tmp(), 'nested');
    await createFile(sub.path, 'report-2.md');
    await createFile(tmp(), 'other.txt');

    const hits = await search(tmp(), 'report');
    const rels = hits.map((h) => h.relativePath).sort();
    expect(rels).toEqual(['Report.txt', join('nested', 'report-2.md')]);
  });

  it('returns nothing for a blank query', async () => {
    await createFile(tmp(), 'anything.txt');
    expect(await search(tmp(), '   ')).toEqual([]);
  });
});
