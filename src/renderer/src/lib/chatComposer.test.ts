import { describe, expect, it } from 'vitest';
import type { ChatMention } from '@shared/types';
import {
  activeToken,
  completeToken,
  parseCommand,
  pruneMentions,
  tokenBeforeCaret,
} from './chatComposer';

describe('activeToken', () => {
  it('opens an @ token at the start of the text', () => {
    expect(activeToken('@rep', 4)).toEqual({ trigger: '@', start: 0, query: 'rep' });
  });

  it('opens a # token after whitespace', () => {
    expect(activeToken('look in #Doc', 12)).toEqual({ trigger: '#', start: 8, query: 'Doc' });
  });

  it('ignores @ inside a word (emails stay plain text)', () => {
    expect(activeToken('mail me@example.com', 19)).toBeNull();
  });

  it('only treats / as a command at the very start', () => {
    expect(activeToken('/sum', 4)).toEqual({ trigger: '/', start: 0, query: 'sum' });
    expect(activeToken('a /sum', 6)).toBeNull();
  });

  it('allows spaces in the query (file names have them)', () => {
    expect(activeToken('@My Report', 10)).toEqual({ trigger: '@', start: 0, query: 'My Report' });
  });

  it('closes at a newline', () => {
    expect(activeToken('@a\nhello', 8)).toBeNull();
  });

  it('only looks before the caret', () => {
    expect(activeToken('@abc', 2)).toEqual({ trigger: '@', start: 0, query: 'a' });
  });
});

describe('completeToken', () => {
  it('replaces the token with the completion and places the caret after it', () => {
    const token = { trigger: '@' as const, start: 5, query: 'rep' };
    const out = completeToken('read @rep now', 9, token, 'report.pdf');
    expect(out.text).toBe('read @report.pdf  now');
    expect(out.caret).toBe(5 + '@report.pdf '.length);
  });
});

describe('parseCommand', () => {
  it('extracts a known command and the remaining text', () => {
    expect(parseCommand('/summarize the plan')).toEqual({ command: 'summarize', body: 'the plan' });
  });

  it('leaves unknown commands as plain text', () => {
    expect(parseCommand('/frobnicate it')).toEqual({ body: '/frobnicate it' });
  });

  it('handles a bare command', () => {
    expect(parseCommand('/find')).toEqual({ command: 'find', body: '' });
  });

  it('passes ordinary text through', () => {
    expect(parseCommand('hello there')).toEqual({ body: 'hello there' });
  });
});

describe('pruneMentions', () => {
  const file = { kind: 'file' as const, path: '/a/report.pdf', name: 'report.pdf' };
  const folder = { kind: 'folder' as const, path: '/a/Docs', name: 'Docs' };

  it('keeps mentions whose token is still in the text', () => {
    expect(pruneMentions('see @report.pdf in #Docs', [file, folder])).toEqual([file, folder]);
  });

  it('drops mentions the user deleted from the text', () => {
    expect(pruneMentions('see #Docs', [file, folder])).toEqual([folder]);
  });

  it('dedupes by path', () => {
    expect(pruneMentions('@report.pdf @report.pdf', [file, file])).toEqual([file]);
  });
});

describe('tokenBeforeCaret', () => {
  const file: ChatMention = { kind: 'file', path: '/a/My Report.pdf', name: 'My Report.pdf' };
  const folder: ChatMention = { kind: 'folder', path: '/a/Docs', name: 'Docs' };

  it('removes a whole file mention (with its trailing space) and reports it', () => {
    const text = 'summarize @My Report.pdf ';
    expect(tokenBeforeCaret(text, text.length, [file])).toEqual({
      start: 'summarize '.length,
      end: text.length,
      mention: file,
    });
  });

  it('removes a file mention even without a trailing space', () => {
    const text = 'see @My Report.pdf';
    expect(tokenBeforeCaret(text, text.length, [file])).toEqual({
      start: 'see '.length,
      end: text.length,
      mention: file,
    });
  });

  it('removes a folder mention', () => {
    const text = '#Docs';
    expect(tokenBeforeCaret(text, text.length, [folder])).toEqual({
      start: 0,
      end: 5,
      mention: folder,
    });
  });

  it('removes a leading /command (no mention)', () => {
    expect(tokenBeforeCaret('/summarize ', 11, [])).toEqual({ start: 0, end: 11 });
    expect(tokenBeforeCaret('/find', 5, [])).toEqual({ start: 0, end: 5 });
  });

  it('leaves a command alone once real text follows it', () => {
    expect(tokenBeforeCaret('/summarize the files', 20, [])).toBeNull();
  });

  it('returns null when the caret is not just after a token', () => {
    expect(tokenBeforeCaret('plain words', 11, [])).toBeNull();
    expect(tokenBeforeCaret('', 0, [])).toBeNull();
  });
});
