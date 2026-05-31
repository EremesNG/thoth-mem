import { quadtree } from 'd3-quadtree';

import type { VizDensityState, VizEdge } from '../../api/client.js';
import type { MapSelection, MapViewport, ProjectedNode } from './map-types.js';
import { sanitizeMapText, selectVisibleEdges } from './map-state.js';

interface RenderInput {
  context: CanvasRenderingContext2D;
  nodes: ProjectedNode[];
  edges: VizEdge[];
  viewport: MapViewport;
  state: VizDensityState;
  selection: MapSelection;
}

const nodeColors: Record<ProjectedNode['kind'], string> = {
  observation: '#38bdf8',
  fact: '#a78bfa',
  session: '#fb7185',
  topic: '#34d399',
  project: '#f59e0b',
};

export function renderMap(input: RenderInput) {
  const { context, nodes, edges, viewport, state, selection } = input;
  const width = context.canvas.width / window.devicePixelRatio;
  const height = context.canvas.height / window.devicePixelRatio;
  const visibleEdges = selectVisibleEdges(edges, viewport.zoom, state);
  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));

  context.save();
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#0c0d11';
  context.fillRect(0, 0, width, height);

  context.translate(viewport.x, viewport.y);
  context.scale(viewport.zoom, viewport.zoom);

  context.lineCap = 'round';
  for (const edge of visibleEdges) {
    const source = nodeLookup.get(edge.source_id);
    const target = nodeLookup.get(edge.target_id);
    if (!source || !target) continue;

    const selected = selection?.kind === 'edge' && selection.id === edge.id;
    context.strokeStyle = selected ? '#f59e0b' : 'rgba(148, 163, 184, 0.28)';
    context.lineWidth = selected ? 2.8 / viewport.zoom : 1.2 / viewport.zoom;
    context.beginPath();
    context.moveTo(source.x, source.y);
    context.lineTo(target.x, target.y);
    context.stroke();
  }

  for (const node of nodes) {
    const selected = selection?.kind === 'node' && selection.id === node.id;
    context.beginPath();
    context.fillStyle = nodeColors[node.kind];
    context.strokeStyle = selected ? '#ffffff' : 'rgba(255, 255, 255, 0.2)';
    context.lineWidth = selected ? 3 / viewport.zoom : 1 / viewport.zoom;
    context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    if (viewport.zoom > 0.55 || selected || state !== 'dense') {
      const label = sanitizeMapText(node.label);
      context.font = `${Math.max(10, 12 / viewport.zoom)}px ui-sans-serif, system-ui`;
      context.fillStyle = selected ? '#ffffff' : 'rgba(244, 244, 245, 0.82)';
      context.fillText(label.slice(0, 34), node.x + node.radius + 5, node.y + 4);
    }
  }

  context.restore();
}

export function hitTestNode(nodes: ProjectedNode[], point: { x: number; y: number }, viewport: MapViewport): ProjectedNode | null {
  const worldX = (point.x - viewport.x) / viewport.zoom;
  const worldY = (point.y - viewport.y) / viewport.zoom;
  const tree = quadtree<ProjectedNode>()
    .x((node) => node.x)
    .y((node) => node.y)
    .addAll(nodes);
  const found = tree.find(worldX, worldY, 24 / viewport.zoom);
  if (!found) return null;
  const distance = Math.hypot(found.x - worldX, found.y - worldY);
  return distance <= found.radius + 12 / viewport.zoom ? found : null;
}

export function hitTestEdge(
  edges: VizEdge[],
  nodes: ProjectedNode[],
  point: { x: number; y: number },
  viewport: MapViewport,
  state: VizDensityState,
): VizEdge | null {
  const worldX = (point.x - viewport.x) / viewport.zoom;
  const worldY = (point.y - viewport.y) / viewport.zoom;
  const threshold = 10 / viewport.zoom;
  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
  let nearest: { edge: VizEdge; distance: number } | null = null;

  for (const edge of selectVisibleEdges(edges, viewport.zoom, state)) {
    const source = nodeLookup.get(edge.source_id);
    const target = nodeLookup.get(edge.target_id);
    if (!source || !target) continue;

    const distance = distanceToSegment(worldX, worldY, source.x, source.y, target.x, target.y);
    if (distance <= threshold && (!nearest || distance < nearest.distance)) {
      nearest = { edge, distance };
    }
  }

  return nearest?.edge ?? null;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const projectionX = ax + t * dx;
  const projectionY = ay + t * dy;
  return Math.hypot(px - projectionX, py - projectionY);
}
