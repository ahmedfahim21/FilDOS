/**
 * Graph eval: the Canvas similarity graph over the indexed testbed, against
 * the labelled topical groups in `testbed/manifest.ts#GROUPS`.
 *
 *  - neighbour recall: share of grouped files with at least one kNN neighbour
 *    from their own group
 *  - neighbour precision: share of a grouped file's neighbours from its group
 *  - cross-modal links: edges joining a picture to a text file of its group
 *  - cohesion: per group, the share of its files in its majority cluster
 *  - purity: over clusters holding grouped files, the share of members from
 *    the cluster's dominant group (files without any edge are left out of
 *    both: an isolated node is a trivially "pure" cluster of one)
 *  - build time of the similarity stage
 *
 * Builds the graph with the same functions `GraphBuilder` uses. Temporal
 * edges are neutralised (every testbed file is written in one burst, which
 * would otherwise read as a single work session) so the score reflects
 * meaning only.
 */
import { afterAll, beforeAll, describe, it } from 'vitest';
import * as aiIndex from '../src/main/db/aiIndex';
import { decodeVector } from '../src/main/ai/index/vectorStore';
import { isImage } from '../src/main/ai/index/extract';
import { centroids, knnEdges } from '../src/main/ai/graph/similarity';
import { assembleSnapshot } from '../src/main/ai/graph/snapshot';
import { closeTestbed, indexTestbed, type Indexed } from './lib/harness';
import { pct, table, writeResults } from './lib/report';
import { GROUPS } from './testbed/manifest';

let ix: Indexed;

beforeAll(async () => {
  ix = await indexTestbed();
}, 1_800_000);

afterAll(() => closeTestbed());

describe('graph eval', () => {
  it('measures neighbour recall/precision and cluster purity', async () => {
    const started = performance.now();
    const rows = await aiIndex.allEmbeddings();
    const points = centroids(rows.map((r) => ({ path: r.path, modelId: r.modelId, vec: decodeVector(r.embedding) })));
    const edges = await knnEdges(points);
    const buildMs = performance.now() - started;

    const states = (await aiIndex.statesUnder()).filter((s) => s.status === 'indexed');
    const DAY = 86_400_000;
    const snapshot = assembleSnapshot({
      files: states.map((s, i) => ({ path: s.path, mtime: i * 30 * DAY, size: s.size })),
      similar: edges,
      mentions: [],
      tags: [],
      fileTags: [],
      builtAt: Date.now(),
    });

    const groupOf = new Map<string, string>();
    for (const [group, paths] of Object.entries(GROUPS)) for (const p of paths) groupOf.set(p, group);
    const neighbours = new Map<string, string[]>();
    for (const e of edges) {
      const a = ix.rel(e.src);
      const b = ix.rel(e.dst);
      neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
      neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
    }
    // Only files with at least one similarity edge are clustered by meaning.
    const cluster = new Map(
      snapshot.nodes.filter((n) => n.path && neighbours.has(ix.rel(n.path))).map((n) => [ix.rel(n.path!), n.clusterId]),
    );
    const clusterGroups = new Map<number, Map<string, number>>();
    for (const [p, c] of cluster) {
      const g = groupOf.get(p);
      if (!g) continue;
      const counts = clusterGroups.get(c) ?? new Map<string, number>();
      counts.set(g, (counts.get(g) ?? 0) + 1);
      clusterGroups.set(c, counts);
    }
    const clustered = [...clusterGroups.values()].reduce((s, m) => s + [...m.values()].reduce((a, b) => a + b, 0), 0);
    const purity = clustered
      ? [...clusterGroups.values()].reduce((s, m) => s + Math.max(...m.values()), 0) / clustered
      : 0;

    const perGroup = Object.entries(GROUPS).map(([group, paths]) => {
      const withSameGroupNeighbour = paths.filter((p) => (neighbours.get(p) ?? []).some((q) => groupOf.get(q) === group));
      const all = paths.flatMap((p) => neighbours.get(p) ?? []);
      const same = all.filter((q) => groupOf.get(q) === group);
      const counts = new Map<number, number>();
      for (const p of paths) {
        const c = cluster.get(p);
        if (c !== undefined) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      const majority = Math.max(0, ...counts.values());
      const crossModal = paths
        .filter((p) => isImage(p))
        .filter((p) => (neighbours.get(p) ?? []).some((q) => groupOf.get(q) === group && !isImage(q))).length;
      return {
        group,
        files: paths.length,
        recall: withSameGroupNeighbour.length / paths.length,
        precision: all.length ? same.length / all.length : 0,
        cohesion: majority / paths.length,
        crossModal,
        images: paths.filter((p) => isImage(p)).length,
        unplaced: paths.filter((p) => !cluster.has(p)),
      };
    });
    const mean = (k: 'recall' | 'precision' | 'cohesion') => perGroup.reduce((s, g) => s + g[k], 0) / perGroup.length;

    console.log(`\nGraph eval — provider ${ix.kind}: ${points.length} files, ${edges.length} similarity edges, ${buildMs.toFixed(0)} ms`);
    console.log(
      table(
        ['group', 'files', 'recall', 'precision', 'cohesion', 'picture↔text'],
        [
          ...perGroup.map((g) => [g.group, g.files, pct(g.recall), pct(g.precision), pct(g.cohesion), `${g.crossModal}/${g.images}`]),
          ['mean', '', pct(mean('recall')), pct(mean('precision')), pct(mean('cohesion')), ''],
        ],
      ),
    );
    console.log(`\nCluster purity: ${pct(purity)} over ${clustered} clustered grouped files`);
    const unplaced = perGroup.flatMap((g) => g.unplaced);
    if (unplaced.length) console.log(`\nNo similarity edge: ${unplaced.join(', ')}`);

    const file = await writeResults('graph', ix.kind, {
      files: points.length,
      edges: edges.length,
      buildMs,
      mean: { recall: mean('recall'), precision: mean('precision'), cohesion: mean('cohesion') },
      purity,
      clustered,
      perGroup,
    });
    console.log(`\nWrote ${file}`);
  }, 1_800_000);
});
