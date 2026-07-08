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

  it('does not descend into junk trees, but still matches their names', async () => {
    const deps = await createFolder(tmp(), 'node_modules');
    await createFile(deps.path, 'react-dom.js');
    const proj = await createFolder(tmp(), 'projects');
    await createFile(proj.path, 'dom-notes.md');

    const rels = (await search(tmp(), 'dom')).map((h) => h.relativePath);
    expect(rels).toContain(join('projects', 'dom-notes.md'));
    expect(rels).not.toContain(join('node_modules', 'react-dom.js'));

    // The junk folder itself is still findable by name.
    const dirs = (await search(tmp(), 'node_mod')).map((h) => h.relativePath);
    expect(dirs).toEqual(['node_modules']);
  });

  it('matches multi-word queries against separator-joined filenames', async () => {
    await createFile(tmp(), 'Modern_Angular_Also_covers_signals,_standalone,_SSR.pdf');
    await createFile(tmp(), 'unrelated.pdf');

    const byWords = await search(tmp(), 'modern angular');
    expect(byWords.map((h) => h.name)).toEqual([
      'Modern_Angular_Also_covers_signals,_standalone,_SSR.pdf',
    ]);

    // The full literal filename works too.
    const byFullName = await search(tmp(), 'Modern_Angular_Also_covers_signals,_standalone,_SSR.pdf');
    expect(byFullName).toHaveLength(1);
  });

  it('ranks exact name matches above prefix and substring matches', async () => {
    await createFile(tmp(), 'old-report.txt'); // substring
    await createFile(tmp(), 'report.txt'); // exact
    await createFile(tmp(), 'report.txt.bak'); // prefix

    const names = (await search(tmp(), 'report.txt')).map((h) => h.name);
    expect(names).toEqual(['report.txt', 'report.txt.bak', 'old-report.txt']);
  });
});
