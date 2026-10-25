import { describe, expect, it } from 'vitest';
import { fileKinds, isLookup, kindHints, queryTerms } from './query';

describe('queryTerms', () => {
  it('keeps content words, lowercased and deduplicated', () => {
    expect(queryTerms('How hot should the Oven be for sourdough? oven!')).toEqual(['hot', 'oven', 'sourdough']);
  });

  it('drops kind words and filler — they say how to look, not what for', () => {
    expect(queryTerms('find the screenshot of an invoice table')).toEqual(['invoice', 'table']);
  });

  it('splits codes like the keyword index does', () => {
    expect(queryTerms('ORD-48151623')).toEqual(['ord', '48151623']);
    expect(queryTerms('ERR_K7Q2LM')).toEqual(['err', 'k7q2lm']);
  });

  it('keeps non-Latin words', () => {
    expect(queryTerms('মসুর ডাল')).toEqual(['মসুর', 'ডাল']);
  });
});

describe('isLookup', () => {
  it.each(['ORD-48151623', 'INV-20431', 'ERR_K7Q2LM', '48151623', 'K7Q2LM TRX50'])('treats %s as a lookup', (q) => {
    expect(isLookup(q)).toBe(true);
  });

  it.each(['budget 2026', 'red lentil soup', '42', 'the clause about pets'])('treats %s as a meaning query', (q) => {
    expect(isLookup(q)).toBe(false);
  });
});

describe('kindHints / fileKinds', () => {
  it('reads the kind a query names', () => {
    expect([...kindHints('screenshot of an invoice')].sort()).toEqual(['image', 'screenshot']);
    expect([...kindHints('photos from the beach')]).toEqual(['image']);
    expect([...kindHints('the PDF about leases')]).toEqual(['pdf']);
    expect(kindHints('red lentil soup').size).toBe(0);
    expect([...kindHints('the clip with the turtle')]).toEqual(['video']);
    expect([...kindHints('podcast about sleep')]).toEqual(['audio']);
  });

  it('classifies files', () => {
    expect([...fileKinds('/a/Screenshot 2026.png')].sort()).toEqual(['image', 'screenshot']);
    expect([...fileKinds('/a/cat.jpg')]).toEqual(['image']);
    expect([...fileKinds('/a/lease.PDF')].sort()).toEqual(['doc', 'pdf']);
    expect([...fileKinds('/a/notes.md')]).toEqual(['doc']);
    expect([...fileKinds('/a/trip.MOV')]).toEqual(['video']);
    expect([...fileKinds('/a/talk.m4a')]).toEqual(['audio']);
  });
});
