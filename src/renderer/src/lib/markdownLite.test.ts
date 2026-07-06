import { describe, expect, it } from 'vitest';
import { parseBlocks, parseInline } from './markdownLite';

describe('parseBlocks', () => {
  it('keeps plain text as one paragraph with soft breaks', () => {
    expect(parseBlocks('line one\nline two')).toEqual([
      { kind: 'paragraph', text: 'line one\nline two' },
    ]);
  });

  it('splits paragraphs on blank lines', () => {
    expect(parseBlocks('first\n\nsecond')).toEqual([
      { kind: 'paragraph', text: 'first' },
      { kind: 'paragraph', text: 'second' },
    ]);
  });

  it('groups consecutive bullets into one list', () => {
    expect(parseBlocks('- a\n- b\n* c')).toEqual([
      { kind: 'list', ordered: false, items: ['a', 'b', 'c'] },
    ]);
  });

  it('parses numbered lists separately from bullets', () => {
    expect(parseBlocks('1. one\n2) two\n- bullet')).toEqual([
      { kind: 'list', ordered: true, items: ['one', 'two'] },
      { kind: 'list', ordered: false, items: ['bullet'] },
    ]);
  });

  it('parses headings and separates them from prose', () => {
    expect(parseBlocks('## Title\nbody')).toEqual([
      { kind: 'heading', text: 'Title' },
      { kind: 'paragraph', text: 'body' },
    ]);
  });

  it('mixes prose and lists in order', () => {
    expect(parseBlocks('intro\n- a\noutro')).toEqual([
      { kind: 'paragraph', text: 'intro' },
      { kind: 'list', ordered: false, items: ['a'] },
      { kind: 'paragraph', text: 'outro' },
    ]);
  });
});

describe('parseInline', () => {
  it('passes plain text through', () => {
    expect(parseInline('hello')).toEqual([{ kind: 'text', text: 'hello' }]);
  });

  it('extracts bold and code runs', () => {
    expect(parseInline('a **b** and `c`')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'bold', text: 'b' },
      { kind: 'text', text: ' and ' },
      { kind: 'code', text: 'c' },
    ]);
  });

  it('leaves unclosed markers literal (streaming safety)', () => {
    expect(parseInline('starts **bol')).toEqual([{ kind: 'text', text: 'starts **bol' }]);
    expect(parseInline('tick `code')).toEqual([{ kind: 'text', text: 'tick `code' }]);
  });

  it('keeps bold markers inside code literal', () => {
    expect(parseInline('`a ** b`')).toEqual([{ kind: 'code', text: 'a ** b' }]);
  });
});
