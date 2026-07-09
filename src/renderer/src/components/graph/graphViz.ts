import type { GraphEdgeKind, GraphSnapshot } from '@shared/graphTypes';

/**
 * Pure helpers that turn a GraphSnapshot into the typed-array attributes
 * cosmos.gl consumes. Split in two so interaction stays cheap:
 *  - structure (nodes, links, sizes, shapes, seeded positions) changes only
 *    when the snapshot or the edge-kind filters change;
 *  - paint (colors) changes on every hover-free interaction — search dimming,
 *    the time scrubber — without touching the running simulation.
 * No cosmos import here: everything is testable under plain vitest.
 */

/** The six scoop accents, in brand order (see .claude/brand-guidelines.md). */
export const SCOOPS = ['#f26d6d', '#f286b4', '#f9a85c', '#6e9bee', '#4fc9b8', '#a585e0'];
export const MINT = '#4fc9b8';
export const MIST = '#8a8f9c';

/** Edge kind → scoop, matching the filter chips (one scoop, one meaning). */
export const EDGE_COLORS: Record<GraphEdgeKind, string> = {
  similar: '#6e9bee', // blueberry
  entity: MINT,
  tag: '#a585e0', // grape
  temporal: '#f9a85c', // mango
};

/** cosmos.gl PointShape values. */
const SHAPE_CIRCLE = 0;
const SHAPE_DIAMOND = 3;
const SHAPE_STAR = 6;

/**
 * The simulation space is [0, SPACE_SIZE]² and gravity pulls toward its
 * center — seeds must sit around that center or the whole layout drifts away
 * from the initial camera fit. useCosmos passes this as `spaceSize`.
 */
export const SPACE_SIZE = 4096;

export interface GraphStructure {
  /** point index → node id; positions/sizes/… are parallel to this. */
  ids: string[];
  indexOf: Map<string, number>;
  positions: Float32Array;
  sizes: Float32Array;
  shapes: Float32Array;
  clusters: number[];
  /** links as point-index pairs, parallel to `linkKinds`/`linkWeights`. */
  links: Float32Array;
  linkKinds: GraphEdgeKind[];
  linkWeights: number[];
  /** endpoint ids per link (for the detail panel / paint pass). */
  linkNodes: [number, number][];
}

export interface GraphPaint {
  pointColors: Float32Array;
  linkColors: Float32Array;
  linkWidths: Float32Array;
}

export function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(
    h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0'),
    16,
  );
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, alpha];
}

/** Deterministic hash → [0, 1), so layout seeds are stable across opens. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

/** Node size: gently sub-linear in degree so hubs read without dominating. */
export function nodeSize(kind: string, degree: number): number {
  const base = kind === 'file' ? 3.2 : 5;
  return base + Math.min(9, Math.sqrt(degree) * 1.4);
}

/**
 * The structural attributes for a snapshot with the given edge kinds enabled.
 * Positions are seeded per cluster (a ring of cluster blobs plus per-node
 * jitter) so the simulation unfurls from a meaningful arrangement instead of
 * exploding out of a random cloud.
 */
export function buildStructure(
  snapshot: GraphSnapshot,
  kinds: ReadonlySet<GraphEdgeKind>,
): GraphStructure {
  const n = snapshot.nodes.length;
  const ids = new Array<string>(n);
  const indexOf = new Map<string, number>();
  const positions = new Float32Array(n * 2);
  const sizes = new Float32Array(n);
  const shapes = new Float32Array(n);
  const clusters = new Array<number>(n);

  const clusterCount = 1 + Math.max(0, ...snapshot.nodes.map((node) => node.clusterId));
  const ringR = 900;
  const center = SPACE_SIZE / 2;
  for (let i = 0; i < n; i++) {
    const node = snapshot.nodes[i];
    ids[i] = node.id;
    indexOf.set(node.id, i);
    const angle = (2 * Math.PI * node.clusterId) / clusterCount;
    const jitterA = hash01(node.id) * 2 * Math.PI;
    const jitterR = hash01(node.id + '§') * 320;
    positions[i * 2] = center + Math.cos(angle) * ringR + Math.cos(jitterA) * jitterR;
    positions[i * 2 + 1] = center + Math.sin(angle) * ringR + Math.sin(jitterA) * jitterR;
    sizes[i] = nodeSize(node.kind, node.degree);
    shapes[i] =
      node.kind === 'entity' ? SHAPE_DIAMOND : node.kind === 'tag' ? SHAPE_STAR : SHAPE_CIRCLE;
    clusters[i] = node.clusterId;
  }

  const linkPairs: number[] = [];
  const linkKinds: GraphEdgeKind[] = [];
  const linkWeights: number[] = [];
  const linkNodes: [number, number][] = [];
  for (const edge of snapshot.edges) {
    if (!kinds.has(edge.kind)) continue;
    const a = indexOf.get(edge.source);
    const b = indexOf.get(edge.target);
    if (a == null || b == null) continue;
    linkPairs.push(a, b);
    linkKinds.push(edge.kind);
    linkWeights.push(edge.weight);
    linkNodes.push([a, b]);
  }

  return {
    ids,
    indexOf,
    positions,
    sizes,
    shapes,
    clusters,
    links: Float32Array.from(linkPairs),
    linkKinds,
    linkWeights,
    linkNodes,
  };
}

export interface PaintOptions {
  /** Case-insensitive label filter; non-matching nodes are dimmed. */
  query?: string;
  /** [from, to] mtime window; file nodes outside it are dimmed. */
  timeRange?: [number, number] | null;
  /** Extra emphasis: the selected node and its neighbours stay lit. */
  selectedId?: string | null;
}

const DIM = 0.08;

/** Per-node/per-link RGBA + widths for the current interaction state. */
export function buildPaint(
  snapshot: GraphSnapshot,
  structure: GraphStructure,
  opts: PaintOptions = {},
): GraphPaint {
  const n = structure.ids.length;
  const query = opts.query?.trim().toLowerCase() ?? '';
  const selected = opts.selectedId ? structure.indexOf.get(opts.selectedId) : undefined;

  const neighbours = new Set<number>();
  if (selected != null) {
    neighbours.add(selected);
    for (const [a, b] of structure.linkNodes) {
      if (a === selected) neighbours.add(b);
      if (b === selected) neighbours.add(a);
    }
  }

  const active = new Array<boolean>(n);
  for (let i = 0; i < n; i++) {
    const node = snapshot.nodes[i];
    let on = true;
    if (query) on = node.label.toLowerCase().includes(query);
    if (on && opts.timeRange && node.kind === 'file') {
      const t = node.mtime ?? 0;
      on = t >= opts.timeRange[0] && t <= opts.timeRange[1];
    }
    if (on && selected != null) on = neighbours.has(i);
    active[i] = on;
  }

  const pointColors = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const node = snapshot.nodes[i];
    const hex =
      node.kind === 'entity'
        ? MINT
        : node.kind === 'tag'
          ? (node.color ?? MIST)
          : SCOOPS[node.clusterId % SCOOPS.length];
    const [r, g, b] = hexToRgba(hex, 1);
    pointColors[i * 4] = r;
    pointColors[i * 4 + 1] = g;
    pointColors[i * 4 + 2] = b;
    pointColors[i * 4 + 3] = active[i] ? 0.96 : DIM;
  }

  const m = structure.linkKinds.length;
  const linkColors = new Float32Array(m * 4);
  const linkWidths = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const kind = structure.linkKinds[i];
    const [a, b] = structure.linkNodes[i];
    const on = active[a] && active[b];
    const baseAlpha =
      kind === 'similar' ? 0.12 + 0.3 * Math.max(0, structure.linkWeights[i]) : 0.22;
    const [r, g, bl] = hexToRgba(EDGE_COLORS[kind], 1);
    linkColors[i * 4] = r;
    linkColors[i * 4 + 1] = g;
    linkColors[i * 4 + 2] = bl;
    linkColors[i * 4 + 3] = on ? baseAlpha : 0.02;
    linkWidths[i] = kind === 'similar' ? 0.6 + structure.linkWeights[i] : 0.8;
  }

  return { pointColors, linkColors, linkWidths };
}

/** Histogram of file mtimes for the time scrubber (empty-safe). */
export function mtimeHistogram(
  snapshot: GraphSnapshot,
  bins = 48,
): { counts: number[]; min: number; max: number } {
  const times = snapshot.nodes
    .filter((node) => node.kind === 'file' && node.mtime != null)
    .map((node) => node.mtime as number);
  if (times.length === 0) return { counts: new Array(bins).fill(0), min: 0, max: 0 };
  let min = Infinity;
  let max = -Infinity;
  for (const t of times) {
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const counts = new Array<number>(bins).fill(0);
  const span = Math.max(1, max - min);
  for (const t of times) {
    const ix = Math.min(bins - 1, Math.floor(((t - min) / span) * bins));
    counts[ix]++;
  }
  return { counts, min, max };
}

/** The point indices worth labelling: the highest-degree nodes, capped. */
export function labelIndices(snapshot: GraphSnapshot, structure: GraphStructure, cap = 36): number[] {
  return snapshot.nodes
    .map((node, i) => ({ i, degree: node.degree, entity: node.kind !== 'file' }))
    .sort((a, b) => Number(b.entity) - Number(a.entity) || b.degree - a.degree)
    .slice(0, cap)
    .map((x) => x.i)
    .filter((i) => structure.ids[i] != null);
}
