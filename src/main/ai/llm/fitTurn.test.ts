import { describe, expect, it } from 'vitest';
import type { ChatTurn } from '@shared/types';
import {
  capToolResult,
  CONTEXT_SHIFT_SHARE,
  ContextTooSmallError,
  fitTurn,
  PER_MESSAGE_TOKENS,
  SAFETY_TOKENS,
  TOOL_RESULT_SHARE,
  TOOL_RESULTS_RESERVED,
  TRIM_MARK,
  trimToTokens,
  type FitInput,
} from './fitTurn';

/** One token per whitespace-separated word: easy to reason about. */
const count = (t: string) => t.split(/\s+/).filter(Boolean).length;
const words = (n: number, w = 'w') => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');

function input(over: Partial<FitInput> = {}): FitInput {
  return { window: 1000, answer: 100, baseTokens: 36, tools: false, material: '', history: [], count, ...over };
}

/** Tokens fitTurn spends before material and history (tools off): base, answer, shift reserve, slack. */
const FIXED = 36 + 100 + 1000 * CONTEXT_SHIFT_SHARE + SAFETY_TOKENS;

describe('fitTurn', () => {
  it('passes everything through when it fits', () => {
    const history: ChatTurn[] = [
      { role: 'user', content: words(20) },
      { role: 'assistant', content: words(20) },
    ];
    const r = fitTurn(input({ material: words(100), history }));
    expect(r).toEqual({ material: words(100), history, toolResultTokens: 0, trimmedMaterial: false, droppedTurns: 0 });
  });

  it('trims the material by tokens to the room left, marking the cut, and drops all history', () => {
    const history: ChatTurn[] = [{ role: 'user', content: words(5) }];
    const r = fitTurn(input({ material: words(5000), history }));
    const budget = 1000 - FIXED - count(TRIM_MARK) - PER_MESSAGE_TOKENS;
    expect(r.trimmedMaterial).toBe(true);
    expect(r.material).toBe(words(budget) + TRIM_MARK);
    expect(r.history).toEqual([]);
    expect(r.droppedTurns).toBe(1);
  });

  it('keeps the newest turns that fit, opening on a user turn', () => {
    const history: ChatTurn[] = [
      { role: 'user', content: words(300, 'a') },
      { role: 'assistant', content: words(300, 'b') },
      { role: 'user', content: words(200, 'c') },
      { role: 'assistant', content: words(200, 'd') },
    ];
    // Room after the fixed part: 1000 - FIXED = 668 → the last two (2 × 208) fit, the third (308) doesn't.
    const r = fitTurn(input({ history }));
    expect(r.history).toEqual(history.slice(2));
    expect(r.droppedTurns).toBe(2);
  });

  it('never starts the replayed history on an assistant turn', () => {
    const history: ChatTurn[] = [
      // The assistant turn (58) fits the 668 of room; the user turn before it (728) then doesn't.
      { role: 'user', content: words(720, 'a') },
      { role: 'assistant', content: words(50, 'b') },
    ];
    const r = fitTurn(input({ history }));
    expect(r.history).toEqual([]);
  });

  it('reserves room for tool definitions and tool results', () => {
    const r = fitTurn(input({ window: 4096, baseTokens: 500, tools: true, material: words(10_000) }));
    const toolResultTokens = Math.floor(4096 * TOOL_RESULT_SHARE);
    expect(r.toolResultTokens).toBe(toolResultTokens);
    const fixed = 500 + 100 + Math.floor(4096 * CONTEXT_SHIFT_SHARE) + TOOL_RESULTS_RESERVED * toolResultTokens + SAFETY_TOKENS;
    expect(count(r.material)).toBe(4096 - fixed - PER_MESSAGE_TOKENS);
  });

  it('shrinks the tool-result room to fit a small window instead of refusing', () => {
    // 2048 window, 950-token base (tool definitions are large), 512 answer: 286 tokens remain after the core.
    const r = fitTurn(input({ window: 2048, baseTokens: 950, answer: 512, tools: true, material: words(5000) }));
    const available = 2048 - (950 + 512 + Math.floor(2048 * CONTEXT_SHIFT_SHARE) + SAFETY_TOKENS);
    expect(r.toolResultTokens).toBe(Math.floor(Math.floor(available / 2) / TOOL_RESULTS_RESERVED));
    expect(r.trimmedMaterial).toBe(true);
    expect(count(r.material)).toBe(available - Math.floor(available / 2) - PER_MESSAGE_TOKENS);
  });

  it('fails with ECONTEXT, naming the setting, when even the question does not fit', () => {
    const run = () => fitTurn(input({ window: 200, baseTokens: 150 }));
    expect(run).toThrow(ContextTooSmallError);
    expect(run).toThrow(/Settings → Assistant/);
    try {
      run();
    } catch (err) {
      expect((err as ContextTooSmallError).code).toBe('ECONTEXT');
    }
  });

  it('fails rather than attaching a sliver of the files', () => {
    // A 650-token base leaves 54 tokens of room: too little to attach anything meaningful.
    expect(() => fitTurn(input({ baseTokens: 650, material: words(500) }))).toThrow(/no room left for the attached files/);
  });
});

describe('trimToTokens', () => {
  it('returns the longest prefix within the budget', () => {
    expect(trimToTokens('a b c d e', 3, count)).toBe('a b c ');
    expect(trimToTokens('a b', 5, count)).toBe('a b');
    expect(trimToTokens('a b', 0, count)).toBe('');
  });
});

describe('capToolResult', () => {
  const chars = (t: string) => t.length; // count characters as tokens here

  it('leaves a result that fits alone', () => {
    const result = { ok: true, path: '/a.txt', content: 'short' };
    expect(capToolResult(result, 1000, chars)).toBe(result);
  });

  it('halves the longest string until the JSON fits, keeping the other fields', () => {
    const result = { ok: true, path: '/docs/a.txt', content: 'x'.repeat(4000) };
    const capped = capToolResult(result, 600, chars) as typeof result;
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(600);
    expect(capped.ok).toBe(true);
    expect(capped.path).toBe('/docs/a.txt');
    expect(capped.content.endsWith('[…truncated]')).toBe(true);
    expect(result.content.length).toBe(4000); // the original is untouched
  });

  it('reaches strings inside arrays (search results)', () => {
    const result = { ok: true, hits: [{ name: 'a.pdf', passage: 'p'.repeat(3000) }, { name: 'b.pdf', passage: 'q'.repeat(100) }] };
    const capped = capToolResult(result, 800, chars) as typeof result;
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(800);
    expect(capped.hits.map((h) => h.name)).toEqual(['a.pdf', 'b.pdf']);
  });
});
