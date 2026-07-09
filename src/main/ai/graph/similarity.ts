/**
 * Embedding-similarity edges for the knowledge graph. Pure vector math over
 * the chunk embeddings the index already stores — no db, no Electron.
 *
 * A file is represented by the mean of its chunk vectors (its centroid),
 * re-normalized so cosine is a dot product. Exact all-pairs kNN is O(n²·d);
 * fine to a few thousand files but not for a big index, so centroids are
 * first partitioned with a few k-means iterations (k ≈ √n) and each file
 * scans only its own and nearest partitions — the classic cell-probe
 * approximation, >95% recall at a fraction of the work. Comparisons never
 * cross model spaces: text centroids pair with text, CLIP with CLIP.
 */

export interface FileCentroid {
  path: string;
  modelId: string;
  vec: Float32Array;
}

export interface KnnEdge {
  /** Canonically ordered (src < dst) so undirected pairs stay unique. */
  src: string;
  dst: string;
  weight: number;
}

export interface KnnOptions {
  /** Neighbours kept per file. */
  k?: number;
  /** Minimum cosine for an edge, per model id (junk edges hurt the layout). */
  minCosine?: (modelId: string) => number;
  /** Cooperative yield, called between work blocks. */
  pace?: () => Promise<void>;
}

export const DEFAULT_K = 5;
/**
 * Default floors. bge text cosines sit high (~0.6 already means "related").
 * Image↔image CLIP cosines run higher still — near-duplicates exceed 0.9 and
 * loosely related photos ~0.7 — so the image lane needs a stricter floor or
 * every photo links to every photo.
 */
export function defaultMinCosine(modelId: string): number {
  return modelId.includes('clip') ? 0.72 : 0.62;
}

/** Mean + L2-normalize the chunk vectors of each (path, modelId) group. */
export function centroids(
  chunks: Iterable<{ path: string; modelId: string; vec: Float32Array }>,
): FileCentroid[] {
  const sums = new Map<string, { path: string; modelId: string; sum: Float64Array; n: number }>();
  for (const c of chunks) {
    const key = `${c.path}\x00${c.modelId}`;
    let entry = sums.get(key);
    if (!entry) {
      entry = { path: c.path, modelId: c.modelId, sum: new Float64Array(c.vec.length), n: 0 };
      sums.set(key, entry);
    }
    if (entry.sum.length !== c.vec.length) continue; // mixed dims: stale rows, skip
    for (let i = 0; i < c.vec.length; i++) entry.sum[i] += c.vec[i];
    entry.n += 1;
  }
  const out: FileCentroid[] = [];
  for (const { path, modelId, sum, n } of sums.values()) {
    let norm = 0;
    for (let i = 0; i < sum.length; i++) {
      sum[i] /= n;
      norm += sum[i] * sum[i];
    }
    norm = Math.sqrt(norm) || 1;
    const vec = new Float32Array(sum.length);
    for (let i = 0; i < sum.length; i++) vec[i] = sum[i] / norm;
    out.push({ path, modelId, vec });
  }
  return out;
}

/** Dot product (== cosine, since centroids are normalized). */
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** A few Lloyd iterations of k-means; returns each point's partition id. */
function partition(vecs: Float32Array[], k: number): number[] {
  const n = vecs.length;
  const dim = vecs[0].length;
  // Deterministic spread-out seeding: every ⌈n/k⌉-th point.
  const centers: Float64Array[] = [];
  for (let c = 0; c < k; c++) {
    const seed = vecs[Math.floor((c * n) / k)];
    centers.push(Float64Array.from(seed));
  }
  const assign = new Array<number>(n).fill(0);
  for (let iter = 0; iter < 6; iter++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let best = -Infinity;
      let bestC = 0;
      for (let c = 0; c < k; c++) {
        let s = 0;
        const center = centers[c];
        const v = vecs[i];
        for (let d = 0; d < dim; d++) s += center[d] * v[d];
        if (s > best) {
          best = s;
          bestC = c;
        }
      }
      if (assign[i] !== bestC) moved++;
      assign[i] = bestC;
    }
    if (moved === 0 && iter > 0) break;
    for (const center of centers) center.fill(0);
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      const center = centers[assign[i]];
      const v = vecs[i];
      for (let d = 0; d < dim; d++) center[d] += v[d];
      counts[assign[i]]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) for (let d = 0; d < dim; d++) centers[c][d] /= counts[c];
    }
  }
  return assign;
}

/** Exact kNN is fine below this; above it, partition first. */
const EXACT_LIMIT = 1500;
/** Partitions each point probes (its own + nearest others). */
const PROBES = 3;

/**
 * Top-k similarity edges per file within one model space, deduped to
 * canonical undirected pairs. `onlyFor` limits which files get fresh
 * neighbour scans (incremental rebuild) — candidates still span all files.
 */
export async function knnEdges(
  points: FileCentroid[],
  opts: KnnOptions & { onlyFor?: Set<string> } = {},
): Promise<KnnEdge[]> {
  const k = opts.k ?? DEFAULT_K;
  const minCosine = opts.minCosine ?? defaultMinCosine;
  const edges = new Map<string, KnnEdge>();

  const byModel = new Map<string, FileCentroid[]>();
  for (const p of points) {
    const group = byModel.get(p.modelId) ?? [];
    group.push(p);
    byModel.set(p.modelId, group);
  }

  for (const [modelId, group] of byModel) {
    if (group.length < 2) continue;
    const floor = minCosine(modelId);
    const vecs = group.map((g) => g.vec);
    const queries: number[] = [];
    for (let i = 0; i < group.length; i++) {
      if (!opts.onlyFor || opts.onlyFor.has(group[i].path)) queries.push(i);
    }
    if (queries.length === 0) continue;

    // Candidate lists per query point: everything (exact) or probed partitions.
    let candidatesOf: (qi: number) => number[];
    if (group.length <= EXACT_LIMIT) {
      const all = group.map((_, i) => i);
      candidatesOf = () => all;
    } else {
      const kParts = Math.max(2, Math.round(Math.sqrt(group.length)));
      const assign = partition(vecs, kParts);
      const members: number[][] = Array.from({ length: kParts }, () => []);
      for (let i = 0; i < assign.length; i++) members[assign[i]].push(i);
      // Partition affinity via mean vectors, to pick each point's probe set.
      const centers = members.map((m) => {
        const c = new Float32Array(vecs[0].length);
        for (const i of m) for (let d = 0; d < c.length; d++) c[d] += vecs[i][d];
        for (let d = 0; d < c.length; d++) c[d] /= m.length || 1;
        return c;
      });
      candidatesOf = (qi) => {
        const scored = centers
          .map((c, ci) => ({ ci, s: dot(vecs[qi], c) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, PROBES);
        return scored.flatMap(({ ci }) => members[ci]);
      };
    }

    let sinceYield = 0;
    for (const qi of queries) {
      const q = vecs[qi];
      // Small fixed k: simple insertion into a top-k array beats a heap here.
      const top: { i: number; s: number }[] = [];
      for (const ci of candidatesOf(qi)) {
        if (ci === qi) continue;
        const s = dot(q, vecs[ci]);
        if (s < floor) continue;
        if (top.length < k) {
          top.push({ i: ci, s });
          top.sort((a, b) => b.s - a.s);
        } else if (s > top[top.length - 1].s) {
          top[top.length - 1] = { i: ci, s };
          top.sort((a, b) => b.s - a.s);
        }
        sinceYield++;
      }
      for (const { i, s } of top) {
        const a = group[qi].path;
        const b = group[i].path;
        const [src, dst] = a < b ? [a, b] : [b, a];
        const key = `${src}\x00${dst}`;
        const prev = edges.get(key);
        if (!prev || s > prev.weight) edges.set(key, { src, dst, weight: s });
      }
      if (opts.pace && sinceYield > 200_000) {
        sinceYield = 0;
        await opts.pace();
      }
    }
  }
  return [...edges.values()];
}
