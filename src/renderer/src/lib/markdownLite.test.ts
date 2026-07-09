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
      { kind: 'list', ordered: true, items: ['one', 'two'], start: 1 },
      { kind: 'list', ordered: false, items: ['bullet'] },
    ]);
  });

  it('records each ordered run\'s real starting number (blank-line splits)', () => {
    // The model often blank-line-separates items; each becomes its own list,
    // so the rendered number must come from the marker, not the position.
    expect(parseBlocks('1. first\n\n2. second\n\n3. third')).toEqual([
      { kind: 'list', ordered: true, items: ['first'], start: 1 },
      { kind: 'list', ordered: true, items: ['second'], start: 2 },
      { kind: 'list', ordered: true, items: ['third'], start: 3 },
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

  it('parses a fenced code block with its language', () => {
    expect(parseBlocks('```ts\nconst a = 1;\nconst b = 2;\n```')).toEqual([
      { kind: 'code', lang: 'ts', text: 'const a = 1;\nconst b = 2;' },
    ]);
  });

  it('keeps prose separate from a following code fence', () => {
    expect(parseBlocks('before\n```\ncode\n```\nafter')).toEqual([
      { kind: 'paragraph', text: 'before' },
      { kind: 'code', lang: '', text: 'code' },
      { kind: 'paragraph', text: 'after' },
    ]);
  });

  it('renders an unclosed fence as a code block (streaming safety)', () => {
    expect(parseBlocks('```py\nprint(1)')).toEqual([
      { kind: 'code', lang: 'py', text: 'print(1)' },
    ]);
  });

  it('does not treat list markers inside a fence as lists', () => {
    expect(parseBlocks('```\n- not a bullet\n```')).toEqual([
      { kind: 'code', lang: '', text: '- not a bullet' },
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
