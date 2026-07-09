import { describe, expect, it } from 'vitest';
import { assembleSnapshot, type SnapshotInputs } from './snapshot';
import type { MentionRow } from '../../db/graphStore';

const file = (path: string, mtime = 0) => ({ path, mtime, size: 10 });
const mention = (path: string, entityId: number, name = 'Acme', count = 1): MentionRow => ({
  path,
  entityId,
  name,
  type: 'ORG',
  count,
});

const base = (over: Partial<SnapshotInputs> = {}): SnapshotInputs => ({
  files: [],
  similar: [],
  mentions: [],
  tags: [],
  fileTags: [],
  builtAt: 123,
  ...over,
});

describe('assembleSnapshot', () => {
  it('builds file nodes with label/ext and carries similarity edges', () => {
    const snap = assembleSnapshot(
      base({
        files: [file('/docs/Report Final.pdf'), file('/docs/notes.md')],
        similar: [{ src: '/docs/Report Final.pdf', dst: '/docs/notes.md', weight: 0.8 }],
      }),
    );
    expect(snap.nodes).toHaveLength(2);
    const report = snap.nodes.find((n) => n.path === '/docs/Report Final.pdf')!;
    expect(report.label).toBe('Report Final.pdf');
    expect(report.ext).toBe('pdf');
    expect(report.degree).toBe(1);
    expect(snap.edges).toEqual([
      { source: 'f:/docs/Report Final.pdf', target: 'f:/docs/notes.md', kind: 'similar', weight: 0.8 },
    ]);
    expect(snap.builtAt).toBe(123);
  });

  it('entity nodes need at least two files and not "practically all" files', () => {
    const files = [file('/a'), file('/b'), file('/c'), file('/d'), file('/e'), file('/f')];
    const snap = assembleSnapshot(
      base({
        files,
        mentions: [
          mention('/a', 1, 'Solo'), // 1 file → dropped
          mention('/a', 2, 'Pair'),
          mention('/b', 2, 'Pair'), // 2 files → kept
          ...files.map((f) => mention(f.path, 3, 'Everywhere')), // all files → dropped
        ],
      }),
    );
    const entityLabels = snap.nodes.filter((n) => n.kind === 'entity').map((n) => n.label);
    expect(entityLabels).toEqual(['Pair']);
    expect(snap.stats.entities).toBe(1);
  });

  it('edges pointing at unindexed paths are dropped', () => {
    const snap = assembleSnapshot(
      base({
        files: [file('/a')],
        similar: [{ src: '/a', dst: '/gone', weight: 0.9 }],
      }),
    );
    expect(snap.edges).toEqual([]);
  });

  it('caps to the most-connected files and flags truncation', () => {
    const files = [file('/hub'), file('/x1'), file('/x2'), file('/lonely', 999)];
    const snap = assembleSnapshot(
      base({
        files,
        similar: [
          { src: '/hub', dst: '/x1', weight: 0.9 },
          { src: '/hub', dst: '/x2', weight: 0.9 },
        ],
        maxNodes: 3,
      }),
    );
    expect(snap.stats.truncated).toBe(true);
    expect(snap.nodes.map((n) => n.path)).not.toContain('/lonely');
    expect(snap.nodes.find((n) => n.path === '/hub')).toBeTruthy();
  });

  it('tags become star nodes; a tag left with one file is dropped as noise', () => {
    const snap = assembleSnapshot(
      base({
        files: [file('/a'), file('/b')],
        tags: [
          { id: 1, name: 'work', color: '#f26d6d' },
          { id: 2, name: 'once', color: '#6e9bee' },
        ],
        fileTags: [
          { path: '/a', tagId: 1 },
          { path: '/b', tagId: 1 },
          { path: '/a', tagId: 2 },
        ],
      }),
    );
    const tagNodes = snap.nodes.filter((n) => n.kind === 'tag');
    expect(tagNodes.map((n) => n.label)).toEqual(['work']);
    expect(tagNodes[0].color).toBe('#f26d6d');
  });

  it('louvain separates well-cut communities deterministically', () => {
    const files = ['/a1', '/a2', '/a3', '/b1', '/b2', '/b3'].map((p) => file(p));
    const clique = (ps: string[]) =>
      ps.flatMap((p, i) => ps.slice(i + 1).map((q) => ({ src: p, dst: q, weight: 0.95 })));
    const inputs = base({
      files,
      similar: [...clique(['/a1', '/a2', '/a3']), ...clique(['/b1', '/b2', '/b3'])],
    });
    const snap = assembleSnapshot(inputs);
    const cluster = (p: string) => snap.nodes.find((n) => n.path === p)!.clusterId;
    expect(cluster('/a1')).toBe(cluster('/a2'));
    expect(cluster('/b1')).toBe(cluster('/b2'));
    expect(cluster('/a1')).not.toBe(cluster('/b1'));
    // Deterministic across runs (seeded rng).
    const again = assembleSnapshot(inputs);
    expect(again.nodes.map((n) => n.clusterId)).toEqual(snap.nodes.map((n) => n.clusterId));
  });

  it('temporal edges surface cross-folder work sessions', () => {
    const snap = assembleSnapshot(
      base({
        files: [file('/proj/a.md', 1000), file('/refs/b.pdf', 61_000)],
      }),
    );
    expect(snap.edges.some((e) => e.kind === 'temporal')).toBe(true);
  });
});
