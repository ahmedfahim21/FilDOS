import type { ChatMention } from '@shared/types';
import { CHAT_COMMANDS, type ChatCommandId } from '@shared/llmModels';

/**
 * Pure text logic behind the Assistant composer: which @/#// token the caret
 * is inside (drives the autocomplete popup), the slash command a message runs
 * with, and which recorded mentions are still present at send time. Kept free
 * of React so it's unit-testable.
 */

export interface ComposerToken {
  /** '@' = file mention, '#' = folder mention, '/' = command. */
  trigger: '@' | '#' | '/';
  /** Index of the trigger character in the text. */
  start: number;
  /** What the user has typed after the trigger, up to the caret. */
  query: string;
}

/** Longest query the popup will still filter on. */
const MAX_QUERY = 64;

/**
 * The mention/command token the caret currently sits in, or null. `@` and `#`
 * open a token when preceded by start-of-text or whitespace; `/` only counts
 * at the very start of the message. Queries may contain spaces (file names do)
 * — the popup closes itself when nothing matches instead.
 */
export function activeToken(text: string, caret: number): ComposerToken | null {
  const upto = text.slice(0, caret);
  for (let i = upto.length - 1; i >= 0; i--) {
    const ch = upto[i];
    if (ch === '\n') return null;
    if (ch === '@' || ch === '#' || ch === '/') {
      const before = i === 0 ? '' : upto[i - 1];
      if (ch === '/' && i !== 0) continue;
      if (before !== '' && !/\s/.test(before)) continue;
      const query = upto.slice(i + 1);
      if (query.length > MAX_QUERY) return null;
      return { trigger: ch, start: i, query };
    }
  }
  return null;
}

/** Replace the active token with the chosen completion, returning the new text and caret. */
export function completeToken(
  text: string,
  caret: number,
  token: ComposerToken,
  completion: string,
): { text: string; caret: number } {
  const inserted = token.trigger + completion + ' ';
  const next = text.slice(0, token.start) + inserted + text.slice(caret);
  return { text: next, caret: token.start + inserted.length };
}

/** The slash command a message starts with (if any) and the text after it. */
export function parseCommand(text: string): { command?: ChatCommandId; body: string } {
  const match = /^\/(\S+)\s*/.exec(text);
  if (!match) return { body: text };
  const command = CHAT_COMMANDS.find((c) => c.id === match[1].toLowerCase())?.id;
  if (!command) return { body: text };
  return { command, body: text.slice(match[0].length) };
}

/**
 * Mentions recorded while composing, minus any whose token the user has since
 * deleted from the text — what actually gets sent.
 */
export function pruneMentions(text: string, mentions: ChatMention[]): ChatMention[] {
  const seen = new Set<string>();
  return mentions.filter((m) => {
    const token = (m.kind === 'file' ? '@' : '#') + m.name;
    if (!text.includes(token)) return false;
    if (seen.has(m.path)) return false;
    seen.add(m.path);
    return true;
  });
}
