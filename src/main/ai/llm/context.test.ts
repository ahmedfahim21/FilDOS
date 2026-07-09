import { describe, expect, it } from 'vitest';
import type { ChatSendPayload, Entry, SemanticHit } from '@shared/types';
import {
  buildChat,
  CONTENT_BUDGET,
  MAX_FOLDER_ENTRIES,
  RESEARCH_BUDGETS,
  type ChatContextDeps,
} from './context';

/** Minimal Entry factory for folder listings. */
function entry(name: string, overrides: Partial<Entry> = {}): Entry {
  return {
    name,
    path: `/tmp/dir/${name}`,
    isDirectory: false,
    isSymlink: false,
    isHidden: false,
    size: 1024,
    ext: name.includes('.') ? name.split('.').pop()! : '',
    modified: Date.UTC(2026, 0, 15),
    created: Date.UTC(2026, 0, 1),
    ...overrides,
  };
}

function hit(name: string, snippet: string): SemanticHit {
  return {
    ...entry(name),
    path: `/docs/${name}`,
    relativePath: name,
    score: 0.9,
    snippet,
  };
}

function payload(overrides: Partial<ChatSendPayload> = {}): ChatSendPayload {
  return {
    requestId: 'r1',
    prompt: 'What is this?',
    history: [],
    mentions: [],
    ...overrides,
  };
}

function deps(overrides: Partial<ChatContextDeps> = {}): ChatContextDeps {
  return {
    extract: async () => 'file text',
    list: async () => [entry('a.txt'), entry('sub', { isDirectory: true })],
    ...overrides,
  };
}

describe('buildChat', () => {
  it('inlines a mentioned file with its name and content', async () => {
    const built = await buildChat(
      payload({ mentions: [{ kind: 'file', path: '/tmp/notes.md', name: 'notes.md' }] }),
      deps({ extract: async () => 'meeting notes body' }),
    );
    expect(built.prompt).toContain('File: notes.md (/tmp/notes.md)');
    expect(built.prompt).toContain('meeting notes body');
    expect(built.prompt).toContain('What is this?');
  });

  it('truncates oversized file content to the budget', async () => {
    const built = await buildChat(
      payload({ mentions: [{ kind: 'file', path: '/tmp/big.txt', name: 'big.txt' }] }),
      deps({ extract: async () => 'x'.repeat(CONTENT_BUDGET * 2) }),
    );
    expect(built.prompt).toContain('[…truncated]');
    expect(built.prompt.length).toBeLessThan(CONTENT_BUDGET + 2_000);
  });

  it('splits the budget across multiple mentioned files', async () => {
    const mentions = [
      { kind: 'file' as const, path: '/tmp/a.txt', name: 'a.txt' },
      { kind: 'file' as const, path: '/tmp/b.txt', name: 'b.txt' },
    ];
    const built = await buildChat(
      payload({ mentions }),
      deps({ extract: async () => 'y'.repeat(CONTENT_BUDGET) }),
    );
    // Each file was cut to roughly half the budget.
    expect(built.prompt.length).toBeLessThan(CONTENT_BUDGET + 3_000);
    expect(built.prompt).toContain('File: a.txt');
    expect(built.prompt).toContain('File: b.txt');
  });

  it('research mode keeps content the chat budget would truncate', async () => {
    // Sized between the two budgets: truncated in chat, intact in research.
    const text = 'z'.repeat(CONTENT_BUDGET + 5_000);
    const mentions = [{ kind: 'file' as const, path: '/tmp/big.txt', name: 'big.txt' }];
    const chat = await buildChat(payload({ mentions }), deps({ extract: async () => text }));
    const research = await buildChat(
      payload({ mentions, mode: 'research' }),
      deps({ extract: async () => text }),
    );
    expect(chat.prompt).toContain('[…truncated]');
    expect(research.prompt).not.toContain('[…truncated]');
    expect(research.prompt.length).toBeGreaterThan(chat.prompt.length);
    expect(research.prompt.length).toBeLessThan(RESEARCH_BUDGETS.content + 3_000);
  });

  it('research mode fetches more /find hits', async () => {
    let requested = 0;
    await buildChat(
      payload({ command: 'find', prompt: 'q', mode: 'research' }),
      deps({
        search: async (_q, k) => {
          requested = k;
          return [];
        },
      }),
    );
    expect(requested).toBe(RESEARCH_BUDGETS.findHits);
  });

  it('marks binary files as unreadable instead of failing', async () => {
    const built = await buildChat(
      payload({ mentions: [{ kind: 'file', path: '/tmp/pic.png', name: 'pic.png' }] }),
      deps({ extract: async () => null }),
    );
    expect(built.prompt).toContain('not readable as text');
  });

  it('marks cloud files as unavailable without touching extract', async () => {
    const built = await buildChat(
      payload({ mentions: [{ kind: 'file', path: 'gdrive://acc1/report.pdf', name: 'report.pdf' }] }),
      deps({
        extract: async () => {
          throw new Error('should not be called');
        },
      }),
    );
    expect(built.prompt).toContain('Cloud file');
  });

  it('renders a folder mention as a capped listing without hidden entries', async () => {
    const many = Array.from({ length: MAX_FOLDER_ENTRIES + 5 }, (_, i) => entry(`f${i}.txt`));
    const listing = [entry('sub', { isDirectory: true }), entry('.secret', { isHidden: true }), ...many];
    const built = await buildChat(
      payload({ mentions: [{ kind: 'folder', path: '/tmp/dir', name: 'dir' }] }),
      deps({ list: async () => listing }),
    );
    expect(built.prompt).toContain('Folder: dir (/tmp/dir)');
    expect(built.prompt).toContain('sub/ (folder)');
    expect(built.prompt).not.toContain('.secret');
    expect(built.prompt).toContain('more entries');
  });

  it('falls back to the current folder for a subject command with no mentions', async () => {
    const built = await buildChat(
      payload({ command: 'summarize', cwd: '/home/me/docs', prompt: '' }),
      deps({ list: async () => [entry('a.txt')] }),
    );
    expect(built.prompt).toContain('Folder: docs (/home/me/docs)');
    expect(built.prompt).toContain('Summarize');
  });

  it('adds the command instruction for mentioned-file commands', async () => {
    const built = await buildChat(
      payload({ command: 'compare', mentions: [
        { kind: 'file', path: '/tmp/a.txt', name: 'a.txt' },
        { kind: 'file', path: '/tmp/b.txt', name: 'b.txt' },
      ] }),
      deps(),
    );
    expect(built.prompt).toContain('Compare the files above');
  });

  it('/find searches first and returns the hits for the UI', async () => {
    const hits = [hit('taxes-2025.pdf', 'total tax due'), hit('receipt.pdf', 'amount paid')];
    const built = await buildChat(
      payload({ command: 'find', prompt: 'last year tax form' }),
      deps({ search: async () => hits }),
    );
    expect(built.hits).toEqual(hits);
    expect(built.prompt).toContain('Search results (best first)');
    expect(built.prompt).toContain('taxes-2025.pdf');
    expect(built.prompt).toContain('last year tax form');
  });

  it('/find without a search backend fails with EUNSUPPORTED', async () => {
    await expect(
      buildChat(payload({ command: 'find' }), deps({ search: undefined })),
    ).rejects.toMatchObject({ code: 'EUNSUPPORTED' });
  });

  it('/find with no hits says the index had nothing', async () => {
    const built = await buildChat(
      payload({ command: 'find', prompt: 'nothing' }),
      deps({ search: async () => [] }),
    );
    expect(built.prompt).toContain('none — nothing in the index matched');
  });
});
