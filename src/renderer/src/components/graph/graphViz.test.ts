import { describe, expect, it } from 'vitest';
import type { GraphSnapshot } from '@shared/graphTypes';
import {
  buildPaint,
  buildStructure,
  hexToRgba,
  labelIndices,
  mtimeHistogram,
  nodeSize,
} from './graphViz';

const snap = (over: Partial<GraphSnapshot> = {}): GraphSnapshot => ({
  nodes: [
    { id: 'f:/a', kind: 'file', label: 'a.md', path: '/a', mtime: 1000, degree: 2, clusterId: 0 },
    { id: 'f:/b', kind: 'file', label: 'b.md', path: '/b', mtime: 2000, degree: 1, clusterId: 1 },
    { id: 'e:1', kind: 'entity', label: 'Acme', entityType: 'ORG', degree: 2, clusterId: 0 },
  ],
  edges: [
    { source: 'f:/a', target: 'f:/b', kind: 'similar', weight: 0.8 },
    { source: 'e:1', target: 'f:/a', kind: 'entity', weight: 0.5 },
  ],
  builtAt: 0,
  stats: { files: 2, entities: 1, edges: 2, truncated: false },
  ...over,
});

describe('hexToRgba', () => {
  it('decodes 6-digit hex to 0–1 channels', () => {
    const [r, g, b, a] = hexToRgba('#f26d6d', 0.5);
    expect(r).toBeCloseTo(242 / 255);
    expect(g).toBeCloseTo(109 / 255);
    expect(b).toBeCloseTo(109 / 255);
    expect(a).toBe(0.5);
  });
  it('expands 3-digit hex', () => {
    expect(hexToRgba('#fff', 1)).toEqual([1, 1, 1, 1]);
  });
});

describe('buildStructure', () => {
  it('maps nodes to indices and filters links by kind', () => {
    const s = buildStructure(snap(), new Set(['similar']));
    expect(s.ids).toEqual(['f:/a', 'f:/b', 'e:1']);
    expect(s.indexOf.get('e:1')).toBe(2);
    expect(s.links).toHaveLength(2); // one link = one index pair
    expect(s.linkKinds).toEqual(['similar']);
  });

  it('positions are deterministic and finite', () => {
    const a = buildStructure(snap(), new Set(['similar', 'entity']));
    const b = buildStructure(snap(), new Set(['similar', 'entity']));
    expect(a.positions).toEqual(b.positions);
    for (const v of a.positions) expect(Number.isFinite(v)).toBe(true);
  });

  it('entities render as diamonds, files as circles', () => {
    const s = buildStructure(snap(), new Set(['similar']));
    expect(s.shapes[0]).toBe(0);
    expect(s.shapes[2]).toBe(3);
  });
});

describe('buildPaint', () => {
  const structure = buildStructure(snap(), new Set(['similar', 'entity']));

  it('everything lit by default; entity nodes are mint', () => {
    const p = buildPaint(snap(), structure);
    expect(p.pointColors[3]).toBeCloseTo(0.96); // alpha of node 0
    expect(p.pointColors[2 * 4]).toBeCloseTo(hexToRgba('#4fc9b8', 1)[0]); // entity r
  });

  it('a query dims non-matching nodes and their links', () => {
    const p = buildPaint(snap(), structure, { query: 'b.md' });
    expect(p.pointColors[1 * 4 + 3]).toBeCloseTo(0.96); // b.md lit
    expect(p.pointColors[0 * 4 + 3]).toBeLessThan(0.2); // a.md dimmed
    expect(p.linkColors[1 * 4 + 3]).toBeLessThan(0.05); // entity link (both dim ends)
  });

  it('a time range dims file nodes outside it but not entities', () => {
    const p = buildPaint(snap(), structure, { timeRange: [1500, 3000] });
    expect(p.pointColors[0 * 4 + 3]).toBeLessThan(0.2); // mtime 1000 → out
    expect(p.pointColors[1 * 4 + 3]).toBeCloseTo(0.96); // mtime 2000 → in
    expect(p.pointColors[2 * 4 + 3]).toBeCloseTo(0.96); // entity unaffected
  });

  it('selection keeps only the node and its neighbours lit', () => {
    const p = buildPaint(snap(), structure, { selectedId: 'e:1' });
    expect(p.pointColors[0 * 4 + 3]).toBeCloseTo(0.96); // /a is a neighbour
    expect(p.pointColors[1 * 4 + 3]).toBeLessThan(0.2); // /b is not
  });
});

describe('mtimeHistogram', () => {
  it('bins file mtimes and reports the span', () => {
    const h = mtimeHistogram(snap(), 4);
    expect(h.min).toBe(1000);
    expect(h.max).toBe(2000);
    expect(h.counts).toHaveLength(4);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(2);
    expect(h.counts[0]).toBe(1);
    expect(h.counts[3]).toBe(1);
  });

  it('is empty-safe', () => {
    const h = mtimeHistogram(snap({ nodes: [] }), 4);
    expect(h.counts).toEqual([0, 0, 0, 0]);
    expect(h.max).toBe(0);
  });
});

describe('labelIndices', () => {
  it('prefers entities, then degree, and caps the count', () => {
    const structure = buildStructure(snap(), new Set(['similar', 'entity']));
    expect(labelIndices(snap(), structure, 2)).toEqual([2, 0]);
  });
});

describe('nodeSize', () => {
  it('grows sub-linearly with degree and keeps non-files larger', () => {
    expect(nodeSize('file', 100)).toBeLessThan(nodeSize('file', 1) + 10);
    expect(nodeSize('entity', 2)).toBeGreaterThan(nodeSize('file', 2));
  });
});
