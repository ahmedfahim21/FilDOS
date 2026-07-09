import { dirname } from 'node:path';
import type { GraphEdge } from '@shared/graphTypes';

/**
 * Temporal "worked on together" edges. Files modified within the same burst of
 * activity form a session (1-D gap clustering over mtimes: a quiet stretch
 * longer than `gapMs` splits sessions). Only cross-folder pairs become edges —
 * same-folder co-modification is what a folder already says — and each session
 * is a star around its middle file, not a clique, so one busy afternoon can't
 * flood the graph with O(n²) links. Pure; recomputed at snapshot time.
 */

export interface TemporalFile {
  path: string;
  mtime: number;
}

export const SESSION_GAP_MS = 45 * 60 * 1000;
/** Sessions larger than this are bulk operations (installs, syncs), not work. */
const MAX_SESSION = 12;
const MIN_SESSION = 2;

/** Group files into activity sessions; each returned group is mtime-sorted. */
export function sessions(files: TemporalFile[], gapMs = SESSION_GAP_MS): TemporalFile[][] {
  const sorted = [...files].sort((a, b) => a.mtime - b.mtime);
  const out: TemporalFile[][] = [];
  let current: TemporalFile[] = [];
  for (const f of sorted) {
    if (current.length > 0 && f.mtime - current[current.length - 1].mtime > gapMs) {
      out.push(current);
      current = [];
    }
    current.push(f);
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** Session groups → star-topology graph edges between cross-folder files. */
export function temporalEdges(files: TemporalFile[], gapMs = SESSION_GAP_MS): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const session of sessions(files, gapMs)) {
    if (session.length < MIN_SESSION || session.length > MAX_SESSION) continue;
    const folders = new Set(session.map((f) => dirname(f.path)));
    if (folders.size < 2) continue;
    const hub = session[Math.floor(session.length / 2)];
    for (const f of session) {
      if (f.path === hub.path) continue;
      if (dirname(f.path) === dirname(hub.path)) continue;
      edges.push({ source: `f:${hub.path}`, target: `f:${f.path}`, kind: 'temporal', weight: 1 });
    }
  }
  return edges;
}
