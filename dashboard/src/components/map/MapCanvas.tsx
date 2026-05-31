import { useEffect, useMemo, useRef, useState } from 'react';
import { zoom, zoomIdentity, type D3ZoomEvent } from 'd3-zoom';
import { select } from 'd3-selection';

import type { VizDensityState, VizEdge, VizNode } from '../../api/client.js';
import type { MapSelection, MapViewport } from './map-types.js';
import { refineProjection } from './map-projection.js';
import { hitTestEdge, hitTestNode, renderMap } from './map-renderer.js';

interface MapCanvasProps {
  nodes: VizNode[];
  edges: VizEdge[];
  state: VizDensityState;
  selection: MapSelection;
  onSelect: (selection: MapSelection) => void;
}

const defaultViewport: MapViewport = { width: 900, height: 600, zoom: 1, x: 0, y: 0 };

export default function MapCanvas({ nodes, edges, state, selection, onSelect }: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const [viewport, setViewport] = useState<MapViewport>(defaultViewport);

  useEffect(() => {
    if (!wrapRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect;
      setSize({ width: Math.max(320, next.width), height: Math.max(320, next.height) });
    });
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, []);

  const projectedNodes = useMemo(() => refineProjection(nodes, edges, size), [nodes, edges, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    renderMap({
      context,
      nodes: projectedNodes,
      edges,
      viewport: { ...viewport, width: size.width, height: size.height },
      state,
      selection,
    });
  }, [edges, projectedNodes, selection, size, state, viewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const behavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.22, 4])
      .on('zoom', (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        setViewport({
          width: size.width,
          height: size.height,
          zoom: event.transform.k,
          x: event.transform.x,
          y: event.transform.y,
        });
      });

    select(canvas).call(behavior).call(behavior.transform, zoomIdentity);
    return () => {
      select(canvas).on('.zoom', null);
    };
  }, [size.height, size.width]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const node = hitTestNode(projectedNodes, point, viewport);
    if (node) {
      onSelect({ kind: 'node', id: node.id });
      return;
    }

    const edge = hitTestEdge(edges, projectedNodes, point, viewport, state);
    onSelect(edge ? { kind: 'edge', id: edge.id } : null);
  };

  return (
    <div ref={wrapRef} className="map-canvas-shell">
      <canvas
        ref={canvasRef}
        className="map-canvas"
        aria-label="Memory relationship map"
        data-testid="map-canvas"
        onClick={handleClick}
      />
      <div className="map-legend" aria-hidden="true">
        <span><i className="legend-dot legend-observation" />Memory</span>
        <span><i className="legend-dot legend-topic" />Topic</span>
        <span><i className="legend-dot legend-project" />Project</span>
      </div>
    </div>
  );
}
