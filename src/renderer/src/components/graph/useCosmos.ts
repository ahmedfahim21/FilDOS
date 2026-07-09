import { useEffect, useRef, type MutableRefObject } from 'react';
import { Graph } from '@cosmos.gl/graph';
import { SPACE_SIZE, type GraphPaint, type GraphStructure } from './graphViz';

/**
 * Thin imperative bridge to cosmos.gl (GPU force layout + rendering). One
 * Graph instance per mounted container; structure and paint apply as separate
 * effects so search/scrubber interactions never reheat the simulation.
 * Event callbacks land through refs — cosmos config is set once at creation.
 */
export interface CosmosHandlers {
  onClickNode: (index: number | undefined) => void;
  onHoverNode: (index: number | null, event?: MouseEvent) => void;
}

export interface CosmosApi {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  graphRef: MutableRefObject<Graph | null>;
  fitView: () => void;
  /** Multiply the zoom level (e.g. 1.5 to zoom in, 1/1.5 to zoom out). */
  zoomBy: (factor: number) => void;
}

/** Resolve a CSS custom property on <html> (the theme tokens). */
function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function useCosmos(
  structure: GraphStructure | null,
  paint: GraphPaint | null,
  handlers: CosmosHandlers,
): CosmosApi {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  // Which structure the live instance currently holds (positions must be
  // seeded exactly once per structure or every repaint would reset the layout).
  const appliedStructure = useRef<GraphStructure | null>(null);
  const fittedOnce = useRef(false);
  // Once the user pans/zooms themselves, the camera is theirs — no auto-fits.
  const userDrove = useRef(false);

  useEffect(() => {
    const div = containerRef.current;
    if (!div) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const graph = new Graph(div, {
      backgroundColor: [0, 0, 0, 0], // the page supplies the themed backdrop
      enableDrag: true,
      fitViewOnInit: false,
      spaceSize: SPACE_SIZE,
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      scalePointsOnZoom: true,
      hoveredPointCursor: 'pointer',
      renderHoveredPointRing: true,
      hoveredPointRingColor: cssVar('--foreground', '#0f1117'),
      simulationGravity: 0.14,
      simulationCenter: 0.3,
      simulationRepulsion: 1.1,
      simulationLinkSpring: 0.9,
      simulationLinkDistance: 14,
      simulationCluster: 0.16,
      simulationFriction: 0.85,
      simulationDecay: reducedMotion ? 200 : 3500,
      onClick: (index) => handlersRef.current.onClickNode(index),
      onPointMouseOver: (index, _pos, event) =>
        handlersRef.current.onHoverNode(index, event instanceof MouseEvent ? event : undefined),
      onPointMouseOut: () => handlersRef.current.onHoverNode(null),
      onZoomStart: (_e, userDriven) => {
        if (userDriven) userDrove.current = true;
      },
      // The layout contracts a lot while settling; the t=0 fit is long stale
      // by then. Re-frame when the simulation cools, unless the camera is
      // already the user's.
      onSimulationEnd: () => {
        if (!userDrove.current) graphRef.current?.fitView(600, 0.15);
      },
    });
    graphRef.current = graph;
    appliedStructure.current = null;
    fittedOnce.current = false;
    userDrove.current = false;
    return () => {
      graph.destroy();
      graphRef.current = null;
    };
  }, []);

  // Apply data in ONE pass per change. cosmos silently falls back to default
  // colors/shapes whenever a staged attribute array's length disagrees with
  // the point count at processing time — so structure and paint must always
  // be staged together before a render(). Paint-only changes take a cheap
  // path (process + upload just the color/width attributes) instead of
  // render()'s full O(N+E) re-ingest, which made search/replay crawl.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !structure || !paint) return;
    // A transient render can pair an old paint with a new structure; skip it —
    // the matching pair arrives in the same commit.
    if (paint.pointColors.length !== structure.ids.length * 4) return;

    graph.setPointColors(paint.pointColors);
    graph.setLinkColors(paint.linkColors);
    graph.setLinkWidths(paint.linkWidths);

    if (appliedStructure.current !== structure) {
      const sameShape =
        appliedStructure.current &&
        appliedStructure.current.ids.length === structure.ids.length &&
        appliedStructure.current.ids.every((id, i) => structure.ids[i] === id);
      // Same nodes with different links (an edge-kind toggle): keep the layout
      // the simulation reached instead of re-seeding.
      const positions = sameShape
        ? Float32Array.from(graph.getPointPositions())
        : structure.positions;
      graph.setPointPositions(positions, !!sameShape);
      graph.setPointSizes(structure.sizes);
      graph.setPointShapes(structure.shapes);
      graph.setPointClusters(structure.clusters);
      graph.setLinks(structure.links);
      appliedStructure.current = structure;
      // render() ingests the staged data and starts the frame loop; start()
      // actually runs the simulation (render alone leaves the layout frozen).
      graph.render();
      graph.start(sameShape ? 0.15 : 0.9);
      if (!fittedOnce.current && structure.ids.length > 0) {
        fittedOnce.current = true;
        graph.fitView(600, 0.15);
      }
    } else {
      // Paint-only: process just the colour/width inputs, upload, done.
      graph.graph.updatePointColor();
      graph.graph.updateLinkColor();
      graph.graph.updateLinkWidth();
      graph.create();
    }
  }, [structure, paint]);

  return {
    containerRef,
    graphRef,
    fitView: () => graphRef.current?.fitView(500, 0.15),
    zoomBy: (factor: number) => {
      const graph = graphRef.current;
      if (!graph) return;
      userDrove.current = true; // a chosen zoom level must survive auto-fits
      graph.setZoomLevel(graph.getZoomLevel() * factor, 250);
    },
  };
}
