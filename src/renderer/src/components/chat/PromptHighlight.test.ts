import { describe, expect, it } from 'vitest';
import type { ChatMention } from '@shared/types';
import { highlightSegments } from './PromptHighlight';

const file = (name: string): ChatMention => ({ kind: 'file', path: `/x/${name}`, name });

describe('highlightSegments', () => {
  it('leaves plain text uncolored', () => {
    expect(highlightSegments('just words', [])).toEqual([{ text: 'just words', kind: null }]);
  });

  it('colors a leading /command', () => {
    expect(highlightSegments('/find taxes', [])).toEqual([
      { text: '/find', kind: 'command' },
      { text: ' taxes', kind: null },
    ]);
  });

  it('colors a confirmed file mention including spaces in its name', () => {
    const segs = highlightSegments('see @My Notes.md please', [file('My Notes.md')]);
    expect(segs).toEqual([
      { text: 'see ', kind: null },
      { text: '@My Notes.md', kind: 'file' },
      { text: ' please', kind: null },
    ]);
  });

  it('colors an in-progress # trigger before selection', () => {
    expect(highlightSegments('look in #Doc', [])).toEqual([
      { text: 'look in ', kind: null },
      { text: '#Doc', kind: 'folder' },
    ]);
  });

  it('does not double-count a mention that also matches the bare-trigger scan', () => {
    const segs = highlightSegments('@report', [file('report')]);
    expect(segs).toEqual([{ text: '@report', kind: 'file' }]);
  });
});
