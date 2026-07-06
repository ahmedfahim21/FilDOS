import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, initDb } from './index';
import {
  appendMessage,
  createSession,
  listMessages,
  listSessions,
  MAX_TITLE,
  removeSession,
  renameSession,
  titleFor,
  touchSession,
} from './chats';

beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());

describe('titleFor', () => {
  it('uses the prompt, collapsing whitespace', () => {
    expect(titleFor('what   is\nthis?')).toBe('what is this?');
  });

  it('prefixes the slash command', () => {
    expect(titleFor('tax form', 'find')).toBe('/find tax form');
  });

  it('falls back for empty prompts and truncates long ones', () => {
    expect(titleFor('')).toBe('New conversation');
    expect(titleFor('x'.repeat(200)).length).toBe(MAX_TITLE);
  });
});

describe('sessions', () => {
  it('creates, lists newest-first, and counts messages', async () => {
    await createSession('s1', 'first', 'llama-3.2-1b');
    await createSession('s2', 'second');
    await appendMessage('s1', { role: 'user', content: 'hi' });
    await appendMessage('s1', { role: 'assistant', content: 'hello' });
    await touchSession('s1');

    const sessions = await listSessions();
    expect(sessions.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(sessions[0]).toMatchObject({ title: 'first', modelId: 'llama-3.2-1b', messageCount: 2 });
    expect(sessions[1].messageCount).toBe(0);
  });

  it('round-trips messages with mentions and sources', async () => {
    await createSession('s1', 't');
    const mentions = [{ kind: 'file' as const, path: '/a/b.txt', name: 'b.txt' }];
    await appendMessage('s1', { role: 'user', content: 'summarize', command: 'summarize', mentions });
    await appendMessage('s1', { role: 'assistant', content: 'It says…' });

    const messages = await listMessages('s1');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', command: 'summarize', mentions });
    expect(messages[1]).toMatchObject({ role: 'assistant', content: 'It says…' });
    expect(messages[1].mentions).toBeUndefined();
  });

  it('renames and deletes (messages cascade)', async () => {
    await createSession('s1', 'old');
    await appendMessage('s1', { role: 'user', content: 'hi' });
    await renameSession('s1', 'new title');
    expect((await listSessions())[0].title).toBe('new title');

    await removeSession('s1');
    expect(await listSessions()).toEqual([]);
    expect(await listMessages('s1')).toEqual([]);
  });

  it('touchSession records the model and bumps recency', async () => {
    await createSession('s1', 'a');
    await createSession('s2', 'b');
    await touchSession('s1', 'gemma-2-2b');
    const sessions = await listSessions();
    expect(sessions[0]).toMatchObject({ id: 's1', modelId: 'gemma-2-2b' });
  });
});
