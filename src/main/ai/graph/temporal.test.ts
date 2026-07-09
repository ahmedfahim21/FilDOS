import { describe, expect, it } from 'vitest';
import { sessions, temporalEdges, SESSION_GAP_MS } from './temporal';

const MIN = 60 * 1000;
const f = (path: string, mtime: number) => ({ path, mtime });

describe('sessions', () => {
  it('splits on gaps longer than gapMs', () => {
    const out = sessions(
      [f('/a/1', 0), f('/a/2', 10 * MIN), f('/b/3', 10 * MIN + SESSION_GAP_MS + 1)],
    );
    expect(out.map((s) => s.length)).toEqual([2, 1]);
  });

  it('sorts input by mtime first', () => {
    const out = sessions([f('/a/2', 5 * MIN), f('/a/1', 0)]);
    expect(out[0].map((x) => x.path)).toEqual(['/a/1', '/a/2']);
  });
});

describe('temporalEdges', () => {
  it('links cross-folder files of one session as a star around the middle file', () => {
    const edges = temporalEdges([
      f('/proj/notes.md', 0),
      f('/proj/draft.md', 1 * MIN),
      f('/downloads/ref.pdf', 2 * MIN),
    ]);
    // hub = middle by mtime (/proj/draft.md); same-folder spokes are skipped.
    expect(edges).toEqual([
      { source: 'f:/proj/draft.md', target: 'f:/downloads/ref.pdf', kind: 'temporal', weight: 1 },
    ]);
  });

  it('single-folder sessions produce nothing', () => {
    expect(temporalEdges([f('/a/1', 0), f('/a/2', MIN)])).toEqual([]);
  });

  it('bulk sessions (installs, syncs) are ignored', () => {
    const files = Array.from({ length: 20 }, (_, i) => f(`/d${i % 4}/x${i}`, i * 1000));
    expect(temporalEdges(files)).toEqual([]);
  });
});
