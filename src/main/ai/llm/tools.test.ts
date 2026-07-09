import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { namesIn, useTempDir } from '../../fs/fixtures';
import { executeChatTool, READ_CAP, type ChatToolDeps } from './tools';

/**
 * Integration tests for the Assistant's file tools: real files in a temp
 * sandbox, fake environment deps (Trash, remap, index, extraction) so we can
 * assert the side effects the executor is responsible for triggering.
 */

interface FakeDeps extends ChatToolDeps {
  trashed: string[];
  remapped: [string, string][];
  dropped: string[];
  searched: [string, number][];
}

function fakeDeps(home: string): FakeDeps {
  const deps: FakeDeps = {
    trashed: [],
    remapped: [],
    dropped: [],
    searched: [],
    trashItem: async (p) => {
      deps.trashed.push(p);
      await fs.rm(p, { recursive: true, force: true });
    },
    remap: (a, b) => deps.remapped.push([a, b]),
    dropIndex: async (p) => {
      deps.dropped.push(p);
    },
    extract: (p) => fs.readFile(p, 'utf8').catch(() => null),
    search: async (query, k) => {
      deps.searched.push([query, k]);
      return [
        {
          name: 'report.md',
          path: join(home, 'report.md'),
          relativePath: 'report.md',
          isDirectory: false,
          isSymlink: false,
          isHidden: false,
          size: 12,
          ext: 'md',
          modified: 0,
          created: 0,
          score: 0.9,
          snippet: 'quarterly   revenue\tsummary',
        },
      ];
    },
    home: () => home,
  };
  return deps;
}

describe('executeChatTool', () => {
  const tmp = useTempDir();

  it('creates a text file in the current folder', async () => {
    const { call, result } = await executeChatTool(
      'create_file',
      { folder: null, name: 'notes.md', content: '# hello' },
      tmp(),
      fakeDeps(tmp()),
    );
    expect(call.ok).toBe(true);
    expect(call.summary).toContain('notes.md');
    expect(result).toMatchObject({ ok: true, path: join(tmp(), 'notes.md') });
    expect(await fs.readFile(join(tmp(), 'notes.md'), 'utf8')).toBe('# hello');
  });

  it('never overwrites — a taken name gets a copy suffix', async () => {
    await fs.writeFile(join(tmp(), 'notes.md'), 'original');
    const { call } = await executeChatTool(
      'create_file',
      { folder: null, name: 'notes.md', content: 'new' },
      tmp(),
      fakeDeps(tmp()),
    );
    expect(call.ok).toBe(true);
    expect(await fs.readFile(join(tmp(), 'notes.md'), 'utf8')).toBe('original');
    expect(await namesIn(tmp())).toEqual(['notes copy.md', 'notes.md']);
  });

  it('creates folders and resolves relative paths against cwd', async () => {
    const { call } = await executeChatTool(
      'create_folder',
      { folder: null, name: 'projects' },
      tmp(),
      fakeDeps(tmp()),
    );
    expect(call.ok).toBe(true);
    const nested = await executeChatTool(
      'create_file',
      { folder: 'projects', name: 'a.txt', content: 'x' },
      tmp(),
      fakeDeps(tmp()),
    );
    expect(nested.call.ok).toBe(true);
    expect(await namesIn(join(tmp(), 'projects'))).toEqual(['a.txt']);
  });

  it('expands ~ against the injected home', async () => {
    const home = join(tmp(), 'home');
    await fs.mkdir(home);
    const { call } = await executeChatTool(
      'create_file',
      { folder: '~', name: 'in-home.txt', content: '' },
      undefined,
      fakeDeps(home),
    );
    expect(call.ok).toBe(true);
    expect(await namesIn(home)).toEqual(['in-home.txt']);
  });

  it('moves files and remaps their DB rows', async () => {
    await fs.writeFile(join(tmp(), 'a.txt'), 'a');
    await fs.mkdir(join(tmp(), 'dest'));
    const deps = fakeDeps(tmp());
    const { call } = await executeChatTool(
      'move_files',
      { paths: ['a.txt'], destination: 'dest' },
      tmp(),
      deps,
    );
    expect(call.ok).toBe(true);
    expect(await namesIn(join(tmp(), 'dest'))).toEqual(['a.txt']);
    expect(deps.remapped).toEqual([[join(tmp(), 'a.txt'), join(tmp(), 'dest', 'a.txt')]]);
  });

  it('renames and remaps', async () => {
    await fs.writeFile(join(tmp(), 'old.txt'), 'x');
    const deps = fakeDeps(tmp());
    const { call } = await executeChatTool(
      'rename_file',
      { path: 'old.txt', new_name: 'new.txt' },
      tmp(),
      deps,
    );
    expect(call.ok).toBe(true);
    expect(await namesIn(tmp())).toEqual(['new.txt']);
    expect(deps.remapped).toEqual([[join(tmp(), 'old.txt'), join(tmp(), 'new.txt')]]);
  });

  it('deletes via the injected Trash and drops index rows', async () => {
    await fs.writeFile(join(tmp(), 'gone.txt'), 'x');
    const deps = fakeDeps(tmp());
    const { call } = await executeChatTool('delete_files', { paths: ['gone.txt'] }, tmp(), deps);
    expect(call.ok).toBe(true);
    expect(call.summary).toContain('Trash');
    expect(deps.trashed).toEqual([join(tmp(), 'gone.txt')]);
    expect(deps.dropped).toEqual([join(tmp(), 'gone.txt')]);
    expect(await namesIn(tmp())).toEqual([]);
  });

  it('lists a folder without hidden entries', async () => {
    await fs.writeFile(join(tmp(), 'seen.txt'), 'x');
    await fs.writeFile(join(tmp(), '.hidden'), 'x');
    await fs.mkdir(join(tmp(), 'sub'));
    const { result } = await executeChatTool('list_folder', { path: null }, tmp(), fakeDeps(tmp()));
    expect(result).toMatchObject({
      ok: true,
      entries: [
        { name: 'sub', kind: 'folder' },
        { name: 'seen.txt', kind: 'file' },
      ],
    });
  });

  it('reads a file with a truncation cap', async () => {
    await fs.writeFile(join(tmp(), 'big.txt'), 'y'.repeat(READ_CAP + 100));
    const { result } = await executeChatTool('read_file', { path: 'big.txt' }, tmp(), fakeDeps(tmp()));
    const content = (result as { content: string }).content;
    expect(content).toContain('[…truncated]');
    expect(content.length).toBeLessThan(READ_CAP + 50);
  });

  it('copies multiple files with a count summary', async () => {
    await fs.writeFile(join(tmp(), 'a.txt'), 'a');
    await fs.writeFile(join(tmp(), 'b.txt'), 'b');
    await fs.mkdir(join(tmp(), 'dest'));
    const { call } = await executeChatTool(
      'copy_files',
      { paths: ['a.txt', 'b.txt'], destination: 'dest' },
      tmp(),
      fakeDeps(tmp()),
    );
    expect(call.ok).toBe(true);
    expect(call.summary).toContain('2 items');
    expect(await namesIn(join(tmp(), 'dest'))).toEqual(['a.txt', 'b.txt']);
  });

  it('fails softly instead of throwing', async () => {
    const missing = await executeChatTool(
      'read_file',
      { path: 'nope.txt' },
      tmp(),
      fakeDeps(tmp()),
    );
    expect(missing.call.ok).toBe(false);
    expect(missing.result).toMatchObject({ ok: false });

    const unknown = await executeChatTool('explode', {}, tmp(), fakeDeps(tmp()));
    expect(unknown.call.ok).toBe(false);
    expect(unknown.call.summary).toContain('explode');
  });

  it('searches the index and normalizes snippet whitespace', async () => {
    const deps = fakeDeps(tmp());
    const { call, result } = await executeChatTool('search_index', { query: 'revenue', k: 4 }, tmp(), deps);
    expect(call.ok).toBe(true);
    expect(call.summary).toContain('1 result');
    expect(deps.searched).toEqual([['revenue', 4]]);
    expect(result).toMatchObject({
      ok: true,
      results: [{ name: 'report.md', snippet: 'quarterly revenue summary' }],
    });
  });

  it('defaults and caps the search result count', async () => {
    const deps = fakeDeps(tmp());
    await executeChatTool('search_index', { query: 'x' }, tmp(), deps); // k omitted → 8
    await executeChatTool('search_index', { query: 'y', k: 100 }, tmp(), deps); // clamped → 16
    expect(deps.searched).toEqual([['x', 8], ['y', 16]]);
  });

  it('rejects relative paths when no folder is open', async () => {
    const { call } = await executeChatTool(
      'read_file',
      { path: 'rel.txt' },
      undefined,
      fakeDeps(tmp()),
    );
    expect(call.ok).toBe(false);
  });
});
