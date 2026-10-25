import { describe, expect, it } from 'vitest';
import type { SemanticHit } from '@shared/types';
import { formatMoment, placeLabel, placeOf } from './place';

const hit = (over: Partial<SemanticHit>): SemanticHit => ({
  name: 'f',
  path: '/f',
  relativePath: 'f',
  isDirectory: false,
  isSymlink: false,
  isHidden: false,
  size: 1,
  ext: 'mp4',
  modified: 0,
  created: 0,
  score: 0.5,
  snippet: '',
  ...over,
});

describe('placeOf', () => {
  it('reads pages and moments from hits', () => {
    expect(placeOf(hit({ ext: 'pdf', segment: 'page', loc: 7 }))).toEqual({ kind: 'page', page: 7 });
    expect(placeOf(hit({ segment: 'frame', loc: 6.5 }))).toEqual({ kind: 'moment', seconds: 6.5, video: true });
    expect(placeOf(hit({ ext: 'mp3', segment: 'audio', loc: 0 }))).toEqual({ kind: 'moment', seconds: 0, video: false });
  });

  it('has no place for passages, pictures or old saved hits', () => {
    expect(placeOf(hit({ segment: 'text' }))).toBeUndefined();
    expect(placeOf(hit({ segment: 'image' }))).toBeUndefined();
    expect(placeOf(hit({}))).toBeUndefined();
  });
});

describe('formatMoment / placeLabel', () => {
  it('formats moments like a player does', () => {
    expect(formatMoment(0)).toBe('0:00');
    expect(formatMoment(65.9)).toBe('1:05');
    expect(formatMoment(3729)).toBe('1:02:09');
  });

  it('labels pages and moments', () => {
    expect(placeLabel({ kind: 'page', page: 7 })).toBe('p. 7');
    expect(placeLabel({ kind: 'moment', seconds: 25, video: false })).toBe('0:25');
  });
});
