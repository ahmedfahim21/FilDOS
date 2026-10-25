import { describe, expect, it } from 'vitest';
import { markedWords, splitMarks } from './marks';

describe('splitMarks', () => {
  it('splits marked runs from plain text', () => {
    expect(splitMarks('bake at «250°C» until «brown»')).toEqual([
      { text: 'bake at ', marked: false },
      { text: '250°C', marked: true },
      { text: ' until ', marked: false },
      { text: 'brown', marked: true },
    ]);
  });

  it('keeps unbalanced marks as plain text', () => {
    expect(splitMarks('a « b')).toEqual([{ text: 'a « b', marked: false }]);
    expect(splitMarks('')).toEqual([]);
  });
});

describe('markedWords', () => {
  it('returns the distinct marked words, lowercased', () => {
    expect(markedWords('«Invoice» total; «invoice» «Due»')).toEqual(['invoice', 'due']);
  });
});
