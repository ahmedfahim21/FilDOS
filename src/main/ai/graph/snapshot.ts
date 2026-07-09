import { basename, extname } from 'node:path';
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import type { GraphEdge, GraphNode, GraphSnapshot } from '@shared/graphTypes';
import type { MentionRow, SimilarityEdge } from '../../db/graphStore';
import { temporalEdges, type TemporalFile } from './temporal';

/**
 * Assemble the render-ready GraphSnapshot from stored signals. Pure — callers
 * fetch the rows; this fuses them, derives the cheap edge kinds (entity, tag,
 * temporal), caps the node count, and colours communities with Louvain.
 */

export interface SnapshotInputs {
  /** Indexed files (index_state rows with status 'indexed'). */
  files: { path: string; mtime: number; size: number }[];
  /** Cached kNN similarity edges (graph_edges rows). */
  similar: SimilarityEdge[];
  /** Entity mentions joined with their entities. */
  mentions: MentionRow[];
  tags: { id: number; name: string; color: string }[];
  fileTags: { path: string; tagId: number }[];
  builtAt: number;
  maxNodes?: number;
}

export const MAX_NODES = 4000;
/** An entity mentioned by a single file relates nothing — noise, skip it. */
const MIN_ENTITY_FILES = 2;
/** Entities that appear practically everywhere separate nothing either. */
const MAX_ENTITY_SHARE = 0.5;

export function assembleSnapshot(inputs: SnapshotInputs): GraphSnapshot {
  const maxNodes = inputs.maxNodes ?? MAX_NODES;
  const fileIds = new Set(inputs.files.map((f) => `f:${f.path}`));

  // --- Collect candidate edges (only between nodes that exist). -------------
  const edges: GraphEdge[] = [];
  for (const e of inputs.similar) {
    const source = `f:${e.src}`;
    const target = `f:${e.dst}`;
    if (fileIds.has(source) && fileIds.has(target)) {
      edges.push({ source, target, kind: 'similar', weight: e.weight });
    }
  }

  const entityFiles = new Map<number, MentionRow[]>();
  for (const m of inputs.mentions) {
    if (!fileIds.has(`f:${m.path}`)) continue;
    const list = entityFiles.get(m.entityId) ?? [];
    list.push(m);
    entityFiles.set(m.entityId, list);
  }
  const entityNodes: GraphNode[] = [];
  const maxFiles = Math.max(MIN_ENTITY_FILES, Math.floor(inputs.files.length * MAX_ENTITY_SHARE));
  for (const [entityId, rows] of entityFiles) {
    if (rows.length < MIN_ENTITY_FILES || rows.length > maxFiles) continue;
    const id = `e:${entityId}`;
    entityNodes.push({
      id,
      kind: 'entity',
      label: rows[0].name,
      entityType: rows[0].type,
      degree: 0,
      clusterId: 0,
    });
    for (const m of rows) {
      // More mentions → a stronger pull, saturating quickly.
      edges.push({
        source: id,
        target: `f:${m.path}`,
        kind: 'entity',
        weight: Math.min(1, 0.4 + m.count * 0.15),
      });
    }
  }

  const tagById = new Map(inputs.tags.map((t) => [t.id, t]));
  const tagNodes = new Map<number, GraphNode>();
  for (const ft of inputs.fileTags) {
    const tag = tagById.get(ft.tagId);
    if (!tag || !fileIds.has(`f:${ft.path}`)) continue;
    if (!tagNodes.has(tag.id)) {
      tagNodes.set(tag.id, {
        id: `t:${tag.id}`,
        kind: 'tag',
        label: tag.name,
        color: tag.color,
        degree: 0,
        clusterId: 0,
      });
    }
    edges.push({ source: `t:${tag.id}`, target: `f:${ft.path}`, kind: 'tag', weight: 1 });
  }

  const temporal: TemporalFile[] = inputs.files.map((f) => ({ path: f.path, mtime: f.mtime }));
  edges.push(...temporalEdges(temporal));

  // --- Cap: keep the most-connected files, then the most recent. ------------
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  let files = inputs.files;
  const budget = maxNodes - entityNodes.length - tagNodes.size;
  const truncated = files.length > budget;
  if (truncated) {
    files = [...files]
      .sort(
        (a, b) =>
          (degree.get(`f:${b.path}`) ?? 0) - (degree.get(`f:${a.path}`) ?? 0) ||
          b.mtime - a.mtime,
      )
      .slice(0, Math.max(0, budget));
  }

  const nodes = new Map<string, GraphNode>();
  for (const f of files) {
    nodes.set(`f:${f.path}`, {
      id: `f:${f.path}`,
      kind: 'file',
      label: basename(f.path),
      path: f.path,
      ext: extname(f.path).slice(1).toLowerCase(),
      mtime: f.mtime,
      size: f.size,
      degree: 0,
      clusterId: 0,
    });
  }
  for (const n of entityNodes) nodes.set(n.id, n);
  for (const n of tagNodes.values()) nodes.set(n.id, n);

  const kept = edges.filter((e) => nodes.has(e.source) && nodes.has(e.target));
  for (const e of kept) {
    nodes.get(e.source)!.degree++;
    nodes.get(e.target)!.degree++;
  }
  // Entities/tags left connecting nothing (their files got capped away) go too.
  for (const [id, n] of nodes) {
    if (n.kind !== 'file' && n.degree < 2) nodes.delete(id);
  }
  const finalEdges = kept.filter((e) => nodes.has(e.source) && nodes.has(e.target));

  assignCommunities(nodes, finalEdges);

  return {
    nodes: [...nodes.values()],
    edges: finalEdges,
    builtAt: inputs.builtAt,
    stats: {
      files: [...nodes.values()].filter((n) => n.kind === 'file').length,
      entities: [...nodes.values()].filter((n) => n.kind === 'entity').length,
      edges: finalEdges.length,
      truncated,
    },
  };
}

/** Deterministic PRNG so Louvain's tie-breaking is stable across rebuilds. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Louvain communities over the fused graph → clusterId per node. */
function assignCommunities(nodes: Map<string, GraphNode>, edges: GraphEdge[]): void {
  if (nodes.size === 0) return;
  const g = new Graph({ type: 'undirected', multi: false });
  for (const id of nodes.keys()) g.addNode(id);
  for (const e of edges) {
    if (g.hasEdge(e.source, e.target)) {
      g.updateEdgeAttribute(e.source, e.target, 'weight', (w) => (w as number) + e.weight);
    } else {
      g.addEdge(e.source, e.target, { weight: e.weight });
    }
  }
  if (g.size === 0) return;
  const communities = louvain(g, { rng: mulberry32(42), getEdgeWeight: 'weight' });
  // Re-number communities by size so cluster 0 is the largest — colours stay
  // roughly stable as the graph grows.
  const sizes = new Map<number, number>();
  for (const c of Object.values(communities)) sizes.set(c, (sizes.get(c) ?? 0) + 1);
  const order = [...sizes.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const renumber = new Map(order.map((c, i) => [c, i]));
  for (const [id, community] of Object.entries(communities)) {
    const node = nodes.get(id);
    if (node) node.clusterId = renumber.get(community) ?? 0;
  }
}
