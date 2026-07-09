import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphEdgeKind, GraphNode, GraphProgress, GraphSnapshot } from '@shared/graphTypes';
import { NER_MODEL_ID } from '@shared/aiModels';
import { useNavigation } from '@/state/navigation';
import { useIndexing } from '@/state/indexing';
import { useToast } from '@/state/toast';
import { parentOf } from '@/lib/path';
import { cn } from '@/lib/utils';
import { Icon } from '../Icon';
import { Mark } from '../Logo';
import { Page, PageChrome } from '../Page';
import {
  buildPaint,
  buildStructure,
  EDGE_COLORS,
  labelIndices,
  mtimeHistogram,
  MINT,
  MIST,
  SCOOPS,
} from './graphViz';
import { useCosmos } from './useCosmos';
import { TimeScrubber } from './TimeScrubber';

/**
 * The Canvas view: the knowledge graph rendered as a live GPU constellation
 * (cosmos.gl). File nodes are scoop-coloured by community, entities are mint
 * diamonds, tags are stars in their own colour; edge kinds match the filter
 * chips. Clicking a node opens a detail panel with the "why" behind its
 * connections; the scrubber below replays the graph through time.
 */

const ALL_KINDS: GraphEdgeKind[] = ['similar', 'entity', 'tag', 'temporal'];
const KIND_LABELS: Record<GraphEdgeKind, string> = {
  similar: 'Similar',
  entity: 'Entities',
  tag: 'Tags',
  temporal: 'Sessions',
};

export function GraphView({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  onNavigate: (path: string) => void;
}) {
  const { openPage } = useNavigation();
  const indexing = useIndexing();
  const { notifyError } = useToast();

  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [progress, setProgress] = useState<GraphProgress | null>(null);
  const [nerReady, setNerReady] = useState<boolean | null>(null);
  const [nerDismissed, setNerDismissed] = useState(false);

  const [kinds, setKinds] = useState<Set<GraphEdgeKind>>(() => new Set(ALL_KINDS));
  const [query, setQuery] = useState('');
  const [timeRange, setTimeRange] = useState<[number, number] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);
  // cosmos also reports hovers from zoom/drag/simulation ticks, which carry no
  // mouse coordinates — remember the pointer so the tooltip never jumps to 0,0.
  const lastMouse = useRef<{ x: number; y: number } | null>(null);

  const load = useCallback(async () => {
    const r = await window.graph.get();
    if (r.ok) setSnapshot(r.data);
    else notifyError(r.error);
  }, [notifyError]);

  useEffect(() => {
    load();
    window.graph.status().then((r) => r.ok && setProgress(r.data));
    window.ai.status(NER_MODEL_ID).then((r) => setNerReady(r.ok && r.data.state === 'ready'));
  }, [load]);

  // Re-fetch when a background build settles (the graph:get that kicked it
  // returned the stale snapshot).
  const wasBuilding = useRef(false);
  useEffect(
    () =>
      window.graph.onProgress((p) => {
        setProgress(p);
        if (wasBuilding.current && p.state === 'idle') load();
        wasBuilding.current = p.state === 'building';
      }),
    [load],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedId) setSelectedId(null);
      else onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, selectedId]);

  const structure = useMemo(
    () => (snapshot ? buildStructure(snapshot, kinds) : null),
    [snapshot, kinds],
  );
  const paint = useMemo(
    () => (snapshot && structure ? buildPaint(snapshot, structure, { query, timeRange, selectedId }) : null),
    [snapshot, structure, query, timeRange, selectedId],
  );
  const histogram = useMemo(() => (snapshot ? mtimeHistogram(snapshot) : null), [snapshot]);
  const nodeById = useMemo(
    () => new Map((snapshot?.nodes ?? []).map((node) => [node.id, node])),
    [snapshot],
  );

  const cosmos = useCosmos(structure, paint, {
    onClickNode: (index) => {
      if (index == null || !structure) return setSelectedId(null);
      setSelectedId((prev) => (prev === structure.ids[index] ? null : structure.ids[index]));
    },
    onHoverNode: (index, event) => {
      if (index == null || !structure) return setHover(null);
      if (event) lastMouse.current = { x: event.clientX, y: event.clientY };
      const at = lastMouse.current;
      if (!at) return; // no pointer position known yet — skip rather than misplace
      setHover({ id: structure.ids[index], x: at.x, y: at.y });
    },
  });

  const building = progress?.state === 'building';
  const empty = !snapshot || snapshot.nodes.length === 0;

  const selected = selectedId ? nodeById.get(selectedId) : null;
  const connections = useMemo(() => {
    if (!snapshot || !selectedId) return [];
    return snapshot.edges
      .filter((e) => e.source === selectedId || e.target === selectedId)
      .map((e) => ({
        node: nodeById.get(e.source === selectedId ? e.target : e.source),
        kind: e.kind,
        weight: e.weight,
      }))
      .filter((c): c is { node: GraphNode; kind: GraphEdgeKind; weight: number } => !!c.node)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 24);
  }, [snapshot, selectedId, nodeById]);

  return (
    <Page>
      <PageChrome>
        <button
          className="text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
          title="Recompute similarity edges and entities from scratch"
          onClick={async () => {
            const r = await window.graph.build();
            if (!r.ok) notifyError(r.error);
          }}
        >
          <Icon name="refresh" size={14} /> Rebuild
        </button>
      </PageChrome>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* The GPU canvas — hand cursor: the background pans, nodes get a pointer */}
        <div
          ref={cosmos.containerRef}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          data-testid="brain-canvas"
          onPointerDown={() => setHintDismissed(true)}
          onPointerMove={(e) => {
            lastMouse.current = { x: e.clientX, y: e.clientY };
          }}
        />

        <LabelsOverlay cosmos={cosmos} structure={structure} snapshot={snapshot} paintKey={paint} />

        {/* HUD: search + edge-kind chips + stats */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
          <div className="pointer-events-auto flex flex-col gap-2">
            <div className="border-border bg-card/85 flex w-56 items-center gap-2 rounded-lg border px-2.5 py-1.5 shadow-sm backdrop-blur">
              <Icon name="search" size={14} className="text-muted-foreground shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find in graph…"
                className="text-foreground placeholder:text-muted-foreground w-full border-0 bg-transparent text-xs outline-none"
              />
              {query && (
                <button className="text-muted-foreground hover:text-foreground" onClick={() => setQuery('')}>
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_KINDS.map((kind) => {
                const on = kinds.has(kind);
                return (
                  <button
                    key={kind}
                    className={cn(
                      'border-border bg-card/85 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs backdrop-blur transition-opacity',
                      on ? 'text-foreground' : 'text-muted-foreground opacity-60',
                    )}
                    title={`Toggle ${KIND_LABELS[kind].toLowerCase()} connections`}
                    onClick={() =>
                      setKinds((prev) => {
                        const next = new Set(prev);
                        if (next.has(kind)) next.delete(kind);
                        else next.add(kind);
                        return next;
                      })
                    }
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: EDGE_COLORS[kind], opacity: on ? 1 : 0.35 }}
                    />
                    {KIND_LABELS[kind]}
                  </button>
                );
              })}
            </div>
          </div>

          {snapshot && !empty && (
            <div className="pointer-events-auto border-border bg-card/85 text-muted-foreground rounded-lg border px-2.5 py-1.5 text-2xs backdrop-blur">
              {snapshot.stats.files.toLocaleString()} files ·{' '}
              {snapshot.stats.entities.toLocaleString()} entities ·{' '}
              {snapshot.stats.edges.toLocaleString()} links
              {snapshot.stats.truncated && ' · most-connected shown'}
            </div>
          )}
        </div>

        {/* Zoom cluster — the map-app pattern people already know */}
        <div
          className={cn(
            'border-border bg-card/85 absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-lg border shadow-sm backdrop-blur',
            selected && 'right-[19.5rem]', // step aside for the detail panel
          )}
        >
          <button
            className="text-muted-foreground hover:text-foreground hover:bg-accent grid size-7 place-items-center"
            title="Zoom in"
            onClick={() => cosmos.zoomBy(1.5)}
          >
            <Icon name="plus" size={14} />
          </button>
          <button
            className="text-muted-foreground hover:text-foreground hover:bg-accent border-border grid size-7 place-items-center border-y"
            title="Zoom out"
            onClick={() => cosmos.zoomBy(1 / 1.5)}
          >
            <span className="text-sm leading-none font-medium">−</span>
          </button>
          <button
            className="text-muted-foreground hover:text-foreground hover:bg-accent grid size-7 place-items-center"
            title="Fit the whole graph in view"
            onClick={cosmos.fitView}
          >
            <Icon name="minimize" size={13} />
          </button>
        </div>

        {/* First-open hint — gone at the first touch */}
        {!hintDismissed && !empty && !building && !selected && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
            <div className="border-border bg-card/90 text-muted-foreground flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-2xs shadow-sm backdrop-blur">
              Drag to explore · Scroll to zoom · Click any dot for its story
              <button
                className="hover:text-foreground pointer-events-auto ml-1"
                onClick={() => setHintDismissed(true)}
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          </div>
        )}

        {/* Entity-model hint: everything works, entities just aren't lit yet. */}
        {nerReady === false && !nerDismissed && !empty && (
          <div className="pointer-events-auto absolute bottom-3 left-3 flex max-w-sm items-center gap-2.5 rounded-lg border border-mint/30 bg-card/90 px-3 py-2 shadow-sm backdrop-blur">
            <Icon name="sparkles" size={15} className="shrink-0 text-mint" />
            <div className="text-2xs text-muted-foreground">
              Download the <span className="text-foreground">Entity Extractor</span> in Settings to
              light up people, places and organizations.
            </div>
            <button
              className="text-2xs text-mint shrink-0 font-medium hover:underline"
              onClick={() => openPage({ kind: 'settings' })}
            >
              Open
            </button>
            <button
              className="text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => setNerDismissed(true)}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        )}

        {/* Hover tooltip */}
        {hover && nodeById.get(hover.id) && (
          <HoverCard node={nodeById.get(hover.id)!} x={hover.x} y={hover.y} />
        )}

        {/* Detail panel */}
        {selected && (
          <DetailPanel
            node={selected}
            connections={connections}
            onClose={() => setSelectedId(null)}
            onSelect={(id) => setSelectedId(id)}
            onNavigate={onNavigate}
          />
        )}

        {/* First-run / empty / building states */}
        {empty && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex max-w-sm flex-col items-center gap-3 text-center">
              <Mark className={cn('size-10', building && 'animate-pulse')} />
              {building ? (
                <>
                  <div className="text-foreground text-sm font-medium">Mapping your storage…</div>
                  <BuildProgress progress={progress} />
                </>
              ) : indexing.progress?.state === 'idle' && (indexing.progress?.indexed ?? 0) === 0 ? (
                <>
                  <div className="text-foreground text-sm font-medium">The Canvas needs an index</div>
                  <p className="text-muted-foreground m-0 text-xs leading-relaxed">
                    Turn on indexing and FilDOS will map how your files relate — by meaning, by the
                    people and projects inside them, and by when you worked on them.
                  </p>
                  <button
                    className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs font-medium"
                    onClick={() => openPage({ kind: 'settings' })}
                  >
                    Open Settings
                  </button>
                </>
              ) : (
                <>
                  <div className="text-foreground text-sm font-medium">Nothing to map yet</div>
                  <p className="text-muted-foreground m-0 text-xs leading-relaxed">
                    The index is still young. Come back once a few files are indexed, or rebuild now.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Build progress pill (over an existing graph) */}
        {building && !empty && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            <div className="border-border bg-card/90 flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-sm backdrop-blur">
              <Mark className="size-3.5 animate-pulse" />
              <BuildProgress progress={progress} inline />
            </div>
          </div>
        )}
      </div>

      {/* Time scrubber */}
      {histogram && histogram.max > histogram.min && (
        <TimeScrubber
          counts={histogram.counts}
          min={histogram.min}
          max={histogram.max}
          value={timeRange}
          onChange={setTimeRange}
        />
      )}
    </Page>
  );
}

function BuildProgress({ progress, inline }: { progress: GraphProgress | null; inline?: boolean }) {
  const phase =
    progress?.phase === 'entities'
      ? 'Reading who and what is inside your files'
      : progress?.phase === 'similarity'
        ? 'Connecting files that belong together'
        : 'Assembling';
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
  return (
    <div className={cn('text-muted-foreground text-2xs', !inline && 'text-center')}>
      {phase}
      {pct != null && ` · ${pct}%`}
    </div>
  );
}

function HoverCard({ node, x, y }: { node: GraphNode; x: number; y: number }) {
  const sub =
    node.kind === 'file'
      ? node.path
      : node.kind === 'entity'
        ? { PER: 'Person', ORG: 'Organization', LOC: 'Place', MISC: 'Topic' }[node.entityType ?? 'MISC']
        : 'Tag';
  return (
    <div
      className="border-border bg-card pointer-events-none fixed z-50 max-w-xs rounded-lg border px-2.5 py-1.5 shadow-md"
      style={{ left: x + 14, top: y + 14 }}
    >
      <div className="text-foreground truncate text-xs font-medium">{node.label}</div>
      <div className="text-muted-foreground truncate text-3xs">
        {sub} · {node.degree} connection{node.degree === 1 ? '' : 's'}
      </div>
    </div>
  );
}

function DetailPanel({
  node,
  connections,
  onClose,
  onSelect,
  onNavigate,
}: {
  node: GraphNode;
  connections: { node: GraphNode; kind: GraphEdgeKind; weight: number }[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onNavigate: (path: string) => void;
}) {
  const { notifyError } = useToast();
  const why = (kind: GraphEdgeKind, weight: number): string =>
    kind === 'similar'
      ? `${Math.round(weight * 100)}% similar`
      : kind === 'entity'
        ? 'mentions it'
        : kind === 'tag'
          ? 'tagged'
          : 'same work session';

  return (
    <div className="border-border bg-card/95 absolute inset-y-3 right-3 flex w-72 flex-col overflow-hidden rounded-xl border shadow-lg backdrop-blur">
      <div className="flex items-start gap-2.5 p-3">
        <span
          className="mt-1 size-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor:
              node.kind === 'entity'
                ? MINT
                : node.kind === 'tag'
                  ? (node.color ?? MIST)
                  : SCOOPS[node.clusterId % SCOOPS.length],
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-foreground text-sm font-medium break-words">{node.label}</div>
          {node.kind === 'file' && node.path && (
            <div className="text-muted-foreground text-3xs break-all">{node.path}</div>
          )}
          {node.kind === 'entity' && (
            <div className="text-muted-foreground text-3xs">
              {{ PER: 'Person', ORG: 'Organization', LOC: 'Place', MISC: 'Topic' }[node.entityType ?? 'MISC']}
            </div>
          )}
        </div>
        <button className="text-muted-foreground hover:text-foreground" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>

      {node.kind === 'file' && node.path && (
        <div className="flex gap-1.5 px-3 pb-2.5">
          <button
            className="bg-primary text-primary-foreground flex-1 rounded-md px-2 py-1.5 text-2xs font-medium"
            onClick={async () => {
              const r = await window.fsapi.open(node.path!);
              if (!r.ok) notifyError(r.error);
            }}
          >
            Open
          </button>
          <button
            className="border-border text-foreground hover:bg-accent flex-1 rounded-md border px-2 py-1.5 text-2xs"
            onClick={() => onNavigate(parentOf(node.path!))}
          >
            Show in folder
          </button>
        </div>
      )}

      <div className="text-muted-foreground px-3 pb-1 text-3xs font-semibold tracking-wider uppercase">
        Connected
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        {connections.length === 0 && (
          <div className="text-muted-foreground px-2 py-4 text-center text-2xs">
            No visible connections
          </div>
        )}
        {connections.map((c) => (
          <button
            key={`${c.node.id}:${c.kind}`}
            className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
            onClick={() => onSelect(c.node.id)}
            title={c.node.path ?? c.node.label}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: EDGE_COLORS[c.kind] }}
            />
            <span className="text-foreground min-w-0 flex-1 truncate text-xs">{c.node.label}</span>
            <span className="text-muted-foreground shrink-0 text-3xs">{why(c.kind, c.weight)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * HTML labels for the highest-degree nodes, tracked to their GPU positions by
 * a rAF loop that writes transforms imperatively — no React re-render per
 * frame. `paintKey` retriggers the effect when dimming changes so hidden
 * nodes' labels fade with them.
 */
function LabelsOverlay({
  cosmos,
  structure,
  snapshot,
  paintKey,
}: {
  cosmos: ReturnType<typeof useCosmos>;
  structure: ReturnType<typeof buildStructure> | null;
  snapshot: GraphSnapshot | null;
  paintKey: ReturnType<typeof buildPaint> | null;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const indices = useMemo(
    () => (snapshot && structure ? labelIndices(snapshot, structure) : []),
    [snapshot, structure],
  );

  useEffect(() => {
    const graph = cosmos.graphRef.current;
    const wrap = wrapRef.current;
    if (!graph || !wrap || !structure || indices.length === 0) return;
    graph.trackPointPositionsByIndices(indices);
    let raf = 0;
    const tick = () => {
      const positions = graph.getTrackedPointPositionsMap();
      const children = wrap.children;
      for (let i = 0; i < indices.length; i++) {
        const el = children[i] as HTMLElement | undefined;
        const pos = positions.get(indices[i]);
        if (!el) continue;
        if (!pos) {
          el.style.opacity = '0';
          continue;
        }
        const [sx, sy] = graph.spaceToScreenPosition([pos[0], pos[1]]);
        el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy + 8)}px) translateX(-50%)`;
        // Follow the node's paint: a dimmed node keeps only a ghost of its label.
        const alpha = paintKey?.pointColors[indices[i] * 4 + 3] ?? 1;
        el.style.opacity = alpha < 0.5 ? '0.12' : '1';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cosmos.graphRef, structure, indices, paintKey]);

  if (!snapshot || !structure) return null;
  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      {indices.map((i) => (
        <span
          key={structure.ids[i]}
          className="text-foreground/80 absolute top-0 left-0 max-w-40 truncate text-3xs opacity-0 drop-shadow-sm"
        >
          {snapshot.nodes[i]?.label}
        </span>
      ))}
    </div>
  );
}
