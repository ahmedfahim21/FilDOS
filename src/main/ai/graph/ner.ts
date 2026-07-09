import type { EntitySpan, EntityType } from '@shared/graphTypes';
import type { FileEntity } from '../../db/graphStore';

/**
 * Pure NER post-processing shared by the model worker (BIO merge, right after
 * the token-classification pipeline) and the graph builder (normalization,
 * before persisting). transformers.js does not implement an aggregation
 * strategy — the pipeline returns one BIO-tagged subword token at a time
 * ('B-PER', 'I-PER', …, 'O') with WordPiece '##' continuations — so span
 * assembly lives here where it can be unit-tested without a model.
 */

/** One subword token as the token-classification pipeline emits it. */
export interface BioToken {
  /** BIO tag, e.g. 'B-PER' | 'I-ORG' | 'O'. */
  entity: string;
  score: number;
  /** WordPiece text; continuations are prefixed with '##'. */
  word: string;
  /** Position in the tokenized sequence (used to detect gaps). */
  index: number;
}

const ENTITY_TYPES: ReadonlySet<string> = new Set(['PER', 'ORG', 'LOC', 'MISC']);

/**
 * Merge a BIO token stream into entity spans: a 'B-X' opens a span, following
 * 'I-X' tokens extend it, anything else closes it. '##' subwords glue onto the
 * previous token without a space; a span's score is the mean of its tokens.
 * A lone 'I-X' (model hiccup) starts a span too — dropping it loses recall.
 */
export function mergeBioSpans(tokens: BioToken[]): EntitySpan[] {
  const spans: EntitySpan[] = [];
  let type: EntityType | null = null;
  let words: string[] = [];
  let scores: number[] = [];
  let lastIndex = -1;

  const flush = (): void => {
    if (type && words.length > 0) {
      spans.push({
        text: words.join(' ').trim(),
        type,
        score: scores.reduce((a, b) => a + b, 0) / scores.length,
      });
    }
    type = null;
    words = [];
    scores = [];
  };

  for (const token of tokens) {
    const dash = token.entity.indexOf('-');
    const prefix = dash === -1 ? token.entity : token.entity.slice(0, dash);
    const tag = dash === -1 ? '' : token.entity.slice(dash + 1);
    if (!ENTITY_TYPES.has(tag) || (prefix !== 'B' && prefix !== 'I')) {
      flush();
      continue;
    }
    const continues =
      prefix === 'I' && type === tag && (lastIndex === -1 || token.index === lastIndex + 1);
    if (!continues) flush();
    if (token.word.startsWith('##') && words.length > 0) {
      words[words.length - 1] += token.word.slice(2);
    } else {
      words.push(token.word);
    }
    type = tag as EntityType;
    scores.push(token.score);
    lastIndex = token.index;
  }
  flush();
  return spans;
}

const MIN_SCORE = 0.7;
const MIN_LENGTH = 3;

/** Anything with no letters (numbers, dates, punctuation runs) is not a name. */
const HAS_LETTER = /\p{L}/u;
/** Leftover tokenizer artifacts: unresolved subwords or [UNK]-style markers. */
const ARTIFACT = /##|\[\w+\]/;

/**
 * Aggregate raw spans (across all of a file's excerpts) into the per-file
 * entity list: drop low-confidence and junk spans, dedupe case-insensitively
 * per (name, type), keep the casing seen most often, and count mentions.
 */
export function normalizeEntities(spans: EntitySpan[]): FileEntity[] {
  const byKey = new Map<string, { casings: Map<string, number>; type: EntityType; count: number }>();
  for (const span of spans) {
    const text = span.text.trim();
    if (span.score < MIN_SCORE) continue;
    if (text.length < MIN_LENGTH || text.length > 80) continue;
    if (!HAS_LETTER.test(text) || ARTIFACT.test(text)) continue;
    const key = `${text.toLowerCase()}\x00${span.type}`;
    const entry = byKey.get(key) ?? { casings: new Map(), type: span.type, count: 0 };
    entry.casings.set(text, (entry.casings.get(text) ?? 0) + 1);
    entry.count += 1;
    byKey.set(key, entry);
  }
  return [...byKey.values()].map((e) => {
    let name = '';
    let best = 0;
    for (const [casing, n] of e.casings) {
      if (n > best) {
        name = casing;
        best = n;
      }
    }
    return { name, type: e.type, count: e.count };
  });
}
