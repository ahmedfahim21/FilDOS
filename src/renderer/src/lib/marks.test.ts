import { describe, expect, it } from 'vitest';
import { markedWords, markWords, splitMarks } from './marks';

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

describe('markWords', () => {
  it('marks every occurrence, ignoring case, keeping the text as written', () => {
    expect(markWords('The Kestrel nests; kestrels hunt.', ['kestrel'])).toEqual([
      { text: 'The ', marked: false },
      { text: 'Kestrel', marked: true },
      { text: ' nests; ', marked: false },
      { text: 'kestrel', marked: true },
      { text: 's hunt.', marked: false },
    ]);
  });

  it('prefers the longest word where two overlap', () => {
    expect(markWords('kestrels', ['kestrel', 'kestrels'])).toEqual([{ text: 'kestrels', marked: true }]);
  });

  it('treats words literally, not as patterns', () => {
    expect(markWords('cost (net) is 3.5', ['(net)', '3.5'])).toEqual([
      { text: 'cost ', marked: false },
      { text: '(net)', marked: true },
      { text: ' is ', marked: false },
      { text: '3.5', marked: true },
    ]);
  });

  it('returns the text whole without words, and nothing for empty text', () => {
    expect(markWords('plain', [])).toEqual([{ text: 'plain', marked: false }]);
    expect(markWords('plain', ['  '])).toEqual([{ text: 'plain', marked: false }]);
    expect(markWords('', ['x'])).toEqual([]);
  });
});
