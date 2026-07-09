import { describe, expect, it } from 'vitest';
import { centroids, defaultMinCosine, knnEdges, type FileCentroid } from './similarity';

const vec = (...v: number[]) => Float32Array.from(v);

/** A unit vector at `angle` radians in 2-D — easy cosine reasoning. */
const unit = (angle: number) => vec(Math.cos(angle), Math.sin(angle));

describe('centroids', () => {
  it('means and re-normalizes per (path, modelId)', () => {
    const out = centroids([
      { path: '/a', modelId: 'm', vec: vec(1, 0) },
      { path: '/a', modelId: 'm', vec: vec(0, 1) },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].vec[0]).toBeCloseTo(Math.SQRT1_2);
    expect(out[0].vec[1]).toBeCloseTo(Math.SQRT1_2);
  });

  it('keeps model spaces separate', () => {
    const out = centroids([
      { path: '/a', modelId: 'text', vec: vec(1, 0) },
      { path: '/a', modelId: 'clip', vec: vec(0, 1) },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('knnEdges', () => {
  const points: FileCentroid[] = [
    { path: '/a', modelId: 'm', vec: unit(0) },
    { path: '/b', modelId: 'm', vec: unit(0.1) }, // cos ≈ 0.995 with /a
    { path: '/c', modelId: 'm', vec: unit(Math.PI / 2) }, // orthogonal
  ];

  it('links similar files, skips dissimilar ones, in canonical order', async () => {
    const edges = await knnEdges(points, { minCosine: () => 0.9 });
    expect(edges).toHaveLength(1);
    expect(edges[0].src).toBe('/a');
    expect(edges[0].dst).toBe('/b');
    expect(edges[0].weight).toBeGreaterThan(0.99);
  });

  it('never crosses model spaces', async () => {
    const edges = await knnEdges(
      [
        { path: '/a', modelId: 'm1', vec: unit(0) },
        { path: '/b', modelId: 'm2', vec: unit(0) },
      ],
      { minCosine: () => 0.5 },
    );
    expect(edges).toEqual([]);
  });

  it('caps neighbours at k', async () => {
    const many: FileCentroid[] = Array.from({ length: 10 }, (_, i) => ({
      path: `/p${i}`,
      modelId: 'm',
      vec: unit(i * 0.01),
    }));
    const edges = await knnEdges(many, { k: 2, minCosine: () => 0.9 });
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.src, (degree.get(e.src) ?? 0) + 1);
      degree.set(e.dst, (degree.get(e.dst) ?? 0) + 1);
    }
    // Undirected dedupe means degree can exceed k, but the total edge count
    // stays well under the clique size.
    expect(edges.length).toBeLessThanOrEqual(10 * 2);
  });

  it('onlyFor limits fresh scans but candidates span all files', async () => {
    const edges = await knnEdges(points, { minCosine: () => 0.9, onlyFor: new Set(['/b']) });
    expect(edges).toHaveLength(1);
    expect([edges[0].src, edges[0].dst].sort()).toEqual(['/a', '/b']);
  });

  it('partitioned path (large groups) agrees with the exact path on clusters', async () => {
    // Two tight, well-separated clusters of 1200 points each: every point's
    // nearest neighbours are inside its own cluster, so cell-probing loses
    // nothing and cross-cluster edges must not appear.
    const many: FileCentroid[] = [];
    for (let i = 0; i < 1200; i++) {
      many.push({ path: `/l${i}`, modelId: 'm', vec: unit(0 + (i % 60) * 0.0005) });
      many.push({ path: `/r${i}`, modelId: 'm', vec: unit(Math.PI / 2 + (i % 60) * 0.0005) });
    }
    const edges = await knnEdges(many, { k: 2, minCosine: () => 0.9 });
    expect(edges.length).toBeGreaterThan(0);
    for (const e of edges) {
      expect(e.src[1]).toBe(e.dst[1]); // both /l… or both /r…
    }
  });

  it('default floors are stricter for CLIP than for text models', () => {
    expect(defaultMinCosine('Xenova/clip-vit-base-patch32')).toBeGreaterThan(
      defaultMinCosine('Xenova/bge-base-en-v1.5'),
    );
  });
});
