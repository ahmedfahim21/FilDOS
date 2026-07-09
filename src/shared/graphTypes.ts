/**
 * The knowledge graph contract shared by the main-process relationship engine
 * (src/main/ai/graph/) and the renderer's Brain view. The engine derives a
 * graph over indexed files from three signals — embedding similarity, shared
 * extracted entities, and temporal "worked on together" sessions — plus the
 * user's tags, and hands the renderer one render-ready snapshot.
 */

/** BIO entity classes emitted by the NER model (CoNLL-2003 label set). */
export type EntityType = 'PER' | 'ORG' | 'LOC' | 'MISC';

/** One extracted entity mention, aggregated from the model's BIO token tags. */
export interface EntitySpan {
  text: string;
  type: EntityType;
  score: number;
}

export type GraphNodeKind = 'file' | 'entity' | 'tag';

export interface GraphNode {
  /** 'f:<path>' | 'e:<entityId>' | 't:<tagId>' — stable across snapshots. */
  id: string;
  kind: GraphNodeKind;
  /** basename / entity name / tag name. */
  label: string;
  /** File nodes only. */
  path?: string;
  ext?: string;
  mtime?: number;
  size?: number;
  /** Entity nodes only. */
  entityType?: EntityType;
  /** Tag nodes carry their user-picked colour. */
  color?: string;
  /** Edge count in the snapshot — drives node size. */
  degree: number;
  /** Louvain community — drives colour grouping and the cluster force. */
  clusterId: number;
}

export type GraphEdgeKind = 'similar' | 'entity' | 'tag' | 'temporal';

export interface GraphEdge {
  /** GraphNode ids. */
  source: string;
  target: string;
  kind: GraphEdgeKind;
  /** similar: cosine [0,1] · entity: shared-mention strength · tag/temporal: 1. */
  weight: number;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  builtAt: number;
  stats: {
    files: number;
    entities: number;
    edges: number;
    /** True when the node cap trimmed the least-connected files. */
    truncated: boolean;
  };
}

/** Streamed over Events.graphProgress while the engine (re)builds. */
export interface GraphProgress {
  state: 'idle' | 'building';
  phase?: 'similarity' | 'entities' | 'assemble';
  done: number;
  total: number;
}
