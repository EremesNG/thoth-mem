import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { scaleLinear } from 'd3-scale';

import type { VizEdge, VizNode } from '../../api/client.js';
import type { ProjectedNode } from './map-types.js';

interface ProjectionSize {
  width: number;
  height: number;
}

function nodeRadius(node: VizNode): number {
  if (node.kind === 'project') return 15;
  if (node.kind === 'session') return 13;
  if (node.kind === 'topic') return 12;
  if (node.kind === 'fact') return 8;
  return 9;
}

export function refineProjection(nodes: VizNode[], edges: VizEdge[], size: ProjectionSize): ProjectedNode[] {
  const width = Math.max(320, size.width);
  const height = Math.max(240, size.height);
  const xScale = scaleLinear()
    .domain([0, 1000])
    .range([64, width - 64]);
  const yScale = scaleLinear()
    .domain([0, 1000])
    .range([64, height - 64]);

  const projected = nodes.map((node) => ({
    ...node,
    x: xScale(Math.abs(node.seed_x) % 1000),
    y: yScale(Math.abs(node.seed_y) % 1000),
    radius: nodeRadius(node),
  }));

  const links = edges
    .filter((edge) => projected.some((node) => node.id === edge.source_id) && projected.some((node) => node.id === edge.target_id))
    .map((edge) => ({ source: edge.source_id, target: edge.target_id }));

  const simulation = forceSimulation<ProjectedNode>(projected)
    .force('charge', forceManyBody().strength(-44))
    .force('x', forceX(width / 2).strength(0.035))
    .force('y', forceY(height / 2).strength(0.035))
    .force('collide', forceCollide<ProjectedNode>().radius((node) => node.radius + 7).iterations(1))
    .force('link', forceLink<ProjectedNode, { source: string | ProjectedNode; target: string | ProjectedNode }>(links).id((node) => node.id).distance(76).strength(0.09))
    .stop();

  for (let index = 0; index < Math.min(80, 24 + projected.length); index++) {
    simulation.tick();
  }

  return projected.map((node) => ({
    ...node,
    x: Math.max(28, Math.min(width - 28, Number(node.x.toFixed(3)))),
    y: Math.max(28, Math.min(height - 28, Number(node.y.toFixed(3)))),
  }));
}
