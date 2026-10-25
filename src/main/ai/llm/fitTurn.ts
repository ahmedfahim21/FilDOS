import type { ChatTurn } from '@shared/types';

/**
 * Fit one chat turn into the model's context window, counted with the model's
 * own tokenizer. llama.cpp can only make room by dropping earlier history; when
 * the system prompt plus the current message alone don't fit, generation fails
 * ("the default context shift strategy did not return a history that fits").
 * Its check: the rendered context (system prompt, tool definitions, history,
 * the current message and the answer so far) must stay within the window minus
 * a context-shift reserve (a tenth of the window by default). So before
 * prompting, the worker budgets the window explicitly:
 *
 *   the rendered base (system + tool definitions + question, measured with
 *   the model's chat template), the answer, the shift reserve and room for
 *   tool results are fixed; the attached material (file contents, search
 *   results, folder listings) gets what's left, trimmed by tokens; earlier
 *   turns fill any remainder, newest first.
 *
 * The question itself is never trimmed: when even it doesn't fit, the turn
 * fails with a message pointing at the setting that fixes it.
 */

/** Slack for chat-template tokens around messages, and rounding in the counts. */
export const SAFETY_TOKENS = 96;
/** Chat-template tokens around each message (role markers, separators). */
export const PER_MESSAGE_TOKENS = 8;
/** Share of the window llama.cpp keeps free for context shifts (its default). */
export const CONTEXT_SHIFT_SHARE = 0.1;
/** Share of the window one tool result may take. */
export const TOOL_RESULT_SHARE = 0.15;
/** Tool results the turn keeps room for (more push older history out). */
export const TOOL_RESULTS_RESERVED = 2;
/** Material is never trimmed to less than this many tokens when any is attached. */
export const MIN_MATERIAL_TOKENS = 64;
/** Appended where material was cut. */
export const TRIM_MARK = '\n[…trimmed to fit the model’s context window]';

export interface FitInput {
  /** The context window llama.cpp actually allocated, in tokens. */
  window: number;
  /** Tokens reserved for the answer (the max-tokens setting). */
  answer: number;
  /**
   * The system prompt, tool definitions and the question (the user's words and
   * the command's instruction, never trimmed), rendered by the model's chat
   * template and tokenized — exactly what llama.cpp will count.
   */
  baseTokens: number;
  /** Tools are offered: keep room for their results. */
  tools: boolean;
  /** File contents, search results, folder listings attached to the message. */
  material: string;
  history: ChatTurn[];
  count: (text: string) => number;
}

export interface FitResult {
  material: string;
  history: ChatTurn[];
  /** Tokens of room each tool result may use (0 without tools). */
  toolResultTokens: number;
  trimmedMaterial: boolean;
  droppedTurns: number;
}

export class ContextTooSmallError extends Error {
  readonly code = 'ECONTEXT';
}

/** The longest prefix of `text` within `budget` tokens (binary search over characters). */
export function trimToTokens(text: string, budget: number, count: (t: string) => number): string {
  if (count(text) <= budget) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (count(text.slice(0, mid)) <= budget) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo);
}

export function fitTurn(input: FitInput): FitResult {
  const { window, answer, baseTokens, tools, material, history, count } = input;
  const shiftReserve = Math.floor(window * CONTEXT_SHIFT_SHARE);
  const core = baseTokens + answer + shiftReserve + SAFETY_TOKENS;
  if (core > window) {
    throw new ContextTooSmallError(
      `This message needs about ${core.toLocaleString()} tokens, but the model’s context window is ${window.toLocaleString()}. ` +
        'Raise the context size or lower max tokens in Settings → Assistant, or shorten the custom instructions.',
    );
  }
  const available = window - core;
  // Tool results get their share of the window, but never more than half of
  // what's left: a small window still chats (with shorter tool results)
  // instead of refusing every message.
  const toolRoom = tools ? Math.min(TOOL_RESULTS_RESERVED * Math.floor(window * TOOL_RESULT_SHARE), Math.floor(available / 2)) : 0;
  const toolResultTokens = tools ? Math.floor(toolRoom / TOOL_RESULTS_RESERVED) : 0;
  let room = available - toolRoom;

  // The material the user attached now comes first.
  let fittedMaterial = '';
  let trimmedMaterial = false;
  if (material) {
    const need = count(material) + PER_MESSAGE_TOKENS;
    if (need <= room) {
      fittedMaterial = material;
      room -= need;
    } else {
      const budget = room - count(TRIM_MARK) - PER_MESSAGE_TOKENS;
      if (budget < MIN_MATERIAL_TOKENS) {
        throw new ContextTooSmallError(
          `There’s no room left for the attached files in the model’s ${window.toLocaleString()}-token context window. ` +
            'Raise the context size or lower max tokens in Settings → Assistant.',
        );
      }
      fittedMaterial = trimToTokens(material, budget, count).trimEnd() + TRIM_MARK;
      trimmedMaterial = true;
      room = 0;
    }
  }

  // Earlier turns fill what's left, newest first, whole turns only.
  const kept: ChatTurn[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const cost = count(history[i].content) + PER_MESSAGE_TOKENS;
    if (cost > room) break;
    kept.unshift(history[i]);
    room -= cost;
  }
  // History must open on a user turn for chat templates that alternate strictly.
  while (kept.length && kept[0].role !== 'user') kept.shift();

  return { material: fittedMaterial, history: kept, toolResultTokens, trimmedMaterial, droppedTurns: history.length - kept.length };
}

/**
 * Shrink a tool result until it fits `budget` tokens as JSON: the longest
 * string inside is halved (marked as cut) until it does. Structure stays
 * intact, so the model still sees `ok`, paths and names.
 */
export function capToolResult(result: unknown, budget: number, count: (t: string) => number): unknown {
  let value = result;
  for (let i = 0; i < 12 && count(JSON.stringify(value) ?? '') > budget; i++) {
    const next = halveLongestString(value);
    if (next === value) break;
    value = next;
  }
  return value;
}

function halveLongestString(value: unknown): unknown {
  let longest: { path: (string | number)[]; text: string } | null = null;
  const walk = (v: unknown, path: (string | number)[]) => {
    if (typeof v === 'string') {
      if (!longest || v.length > longest.text.length) longest = { path, text: v };
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, i]));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, [...path, k]);
  };
  walk(value, []);
  const found = longest as { path: (string | number)[]; text: string } | null;
  if (!found || found.text.length < 64) return value;
  const cut = `${found.text.slice(0, Math.floor(found.text.length / 2))}[…truncated]`;
  if (!found.path.length) return cut;
  const copy = structuredClone(value) as Record<string | number, unknown>;
  let at: Record<string | number, unknown> = copy;
  for (const key of found.path.slice(0, -1)) at = at[key] as Record<string | number, unknown>;
  at[found.path[found.path.length - 1]] = cut;
  return copy;
}
