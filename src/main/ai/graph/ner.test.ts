import { describe, expect, it } from 'vitest';
import { mergeBioSpans, normalizeEntities, type BioToken } from './ner';

const tok = (entity: string, word: string, index: number, score = 0.99): BioToken => ({
  entity,
  word,
  index,
  score,
});

describe('mergeBioSpans', () => {
  it('merges B/I runs into one span', () => {
    const spans = mergeBioSpans([
      tok('B-PER', 'Ada', 1),
      tok('I-PER', 'Lovelace', 2),
      tok('O', 'wrote', 3),
    ]);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ text: 'Ada Lovelace', type: 'PER' });
  });

  it('glues ## subwords onto the previous token without a space', () => {
    const spans = mergeBioSpans([
      tok('B-ORG', 'Anthro', 1),
      tok('I-ORG', '##pic', 2),
    ]);
    expect(spans[0].text).toBe('Anthropic');
  });

  it('a new B- tag closes the previous span', () => {
    const spans = mergeBioSpans([
      tok('B-LOC', 'Paris', 1),
      tok('B-LOC', 'Berlin', 2),
    ]);
    expect(spans.map((s) => s.text)).toEqual(['Paris', 'Berlin']);
  });

  it('an I- with a different type or an index gap starts a fresh span', () => {
    const spans = mergeBioSpans([
      tok('B-PER', 'Marie', 1),
      tok('I-ORG', 'Curie', 2), // type flip
      tok('I-PER', 'Skłodowska', 9), // orphan I- after a gap
    ]);
    expect(spans.map((s) => [s.text, s.type])).toEqual([
      ['Marie', 'PER'],
      ['Curie', 'ORG'],
      ['Skłodowska', 'PER'],
    ]);
  });

  it('averages token scores and ignores O/unknown tags', () => {
    const spans = mergeBioSpans([
      tok('B-MISC', 'Rust', 1, 0.8),
      tok('I-MISC', '2024', 2, 0.6),
      tok('B-WAT', 'nope', 3),
    ]);
    expect(spans).toHaveLength(1);
    expect(spans[0].score).toBeCloseTo(0.7);
  });
});

describe('normalizeEntities', () => {
  it('aggregates case-insensitively, keeping the most common casing', () => {
    const out = normalizeEntities([
      { text: 'ACME Corp', type: 'ORG', score: 0.9 },
      { text: 'Acme Corp', type: 'ORG', score: 0.9 },
      { text: 'Acme Corp', type: 'ORG', score: 0.9 },
    ]);
    expect(out).toEqual([{ name: 'Acme Corp', type: 'ORG', count: 3 }]);
  });

  it('the same name under different types stays separate', () => {
    const out = normalizeEntities([
      { text: 'Amazon', type: 'ORG', score: 0.9 },
      { text: 'Amazon', type: 'LOC', score: 0.9 },
    ]);
    expect(out).toHaveLength(2);
  });

  it('drops low-confidence, short, letterless and artifact spans', () => {
    const out = normalizeEntities([
      { text: 'Maybe Person', type: 'PER', score: 0.5 }, // low score
      { text: 'Al', type: 'PER', score: 0.99 }, // too short
      { text: '2024', type: 'MISC', score: 0.99 }, // no letters
      { text: '##pic', type: 'ORG', score: 0.99 }, // subword artifact
      { text: 'Kept One', type: 'PER', score: 0.9 },
    ]);
    expect(out).toEqual([{ name: 'Kept One', type: 'PER', count: 1 }]);
  });
});
