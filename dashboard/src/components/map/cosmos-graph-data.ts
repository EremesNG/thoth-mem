import type { VizEdge, VizNode } from '../../api/client.js';
import { presentStoredText } from '../safe-presentation.js';

const COMMUNITY_PALETTE = [
  '#36c8ff',
  '#8b6cff',
  '#f2aa3b',
  '#ff6b78',
  '#45d6ad',
  '#5d8dff',
  '#cf70e8',
  '#70c48f',
] as const;

const COMMUNITY_PROPAGATION_STEPS = 6;

export interface CosmosFocusNeighborhood {
  pointIndex: number;
  neighborPointIndices: number[];
  linkIndices: number[];
}

export interface CosmosGraphData {
  nodes: VizNode[];
  edges: VizEdge[];
  pointIds: string[];
  pointLabels: string[];
  pointKinds: VizNode['kind'][];
  pointPositions: number[];
  pointDegrees: number[];
  pointCommunities: number[];
  pointColors: string[];
  pointSizes: number[];
  pointShapes: number[];
  linkIds: string[];
  links: number[];
  linkColors: string[];
  linkWidths: number[];
  linkArrows: boolean[];
  focus: CosmosFocusNeighborhood | null;
}

export interface CosmosMotionConfig {
  transitionDuration: number;
  activationStepMs: number;
  initialSettleMs: number;
}

export function cosmosMotionConfig(reducedMotion: boolean): CosmosMotionConfig {
  if (reducedMotion) {
    return { transitionDuration: 0, activationStepMs: 0, initialSettleMs: 0 };
  }

  return { transitionDuration: 640, activationStepMs: 80, initialSettleMs: 900 };
}

export function buildCosmosGraphData(
  nodes: VizNode[],
  edges: VizEdge[],
  focusId: string | null,
): CosmosGraphData {
  const pointIndexById = new Map(nodes.map((node, index) => [node.id, index]));
  const visibleEdges = edges.filter(
    (edge) => pointIndexById.has(edge.source_id) && pointIndexById.has(edge.target_id),
  );
  const pointDegrees = Array.from({ length: nodes.length }, () => 0);
  for (const edge of visibleEdges) {
    pointDegrees[pointIndexById.get(edge.source_id)!] += 1;
    pointDegrees[pointIndexById.get(edge.target_id)!] += 1;
  }
  const pointCommunityKeys = detectCommunities(nodes, visibleEdges, pointIndexById, pointDegrees);
  const communityKeys = [...new Set(pointCommunityKeys)].sort((left, right) => left.localeCompare(right));
  const communityIndexByKey = new Map(communityKeys.map((key, index) => [key, index]));
  const paletteIndexByKey = assignPaletteSlots(communityKeys);
  const pointCommunities = pointCommunityKeys.map((key) => communityIndexByKey.get(key)!);
  const pointColors = pointCommunityKeys.map((key) => COMMUNITY_PALETTE[paletteIndexByKey.get(key)!]);

  const links: number[] = [];
  const linkWidths: number[] = [];
  const linkColors: string[] = [];
  for (const edge of visibleEdges) {
    const sourceIndex = pointIndexById.get(edge.source_id)!;
    links.push(sourceIndex, pointIndexById.get(edge.target_id)!);
    linkWidths.push(edge.kind === 'semantic' ? 1.7 : edge.kind === 'fact' ? 1.25 : 0.72);
    linkColors.push(mixWithVoid(pointColors[sourceIndex], edge.kind === 'metadata' ? 0.62 : 0.38));
  }

  const focusPointIndex = focusId ? pointIndexById.get(focusId) : undefined;
  let focus: CosmosFocusNeighborhood | null = null;
  if (focusPointIndex !== undefined) {
    const neighborPointIndices = new Set<number>();
    const linkIndices: number[] = [];
    visibleEdges.forEach((edge, linkIndex) => {
      if (edge.source_id === focusId) {
        neighborPointIndices.add(pointIndexById.get(edge.target_id)!);
        linkIndices.push(linkIndex);
      } else if (edge.target_id === focusId) {
        neighborPointIndices.add(pointIndexById.get(edge.source_id)!);
        linkIndices.push(linkIndex);
      }
    });
    focus = {
      pointIndex: focusPointIndex,
      neighborPointIndices: [...neighborPointIndices].sort((left, right) => left - right),
      linkIndices,
    };
  }

  return {
    nodes,
    edges: visibleEdges,
    pointIds: nodes.map((node) => node.id),
    pointLabels: nodes.map((node) => presentStoredText(node.label)),
    pointKinds: nodes.map((node) => node.kind),
    pointPositions: nodes.flatMap((node) => [node.seed_x, node.seed_y]),
    pointDegrees,
    pointCommunities,
    pointColors,
    pointSizes: pointDegrees.map(neuronSizeForDegree),
    pointShapes: nodes.map(() => 0),
    linkIds: visibleEdges.map((edge) => edge.id),
    links,
    linkColors,
    linkWidths,
    linkArrows: visibleEdges.map(() => true),
    focus,
  };
}

function neuronSizeForDegree(degree: number): number {
  return 9 + Math.min(25, Math.sqrt(degree) * 6.5);
}

function detectCommunities(
  nodes: VizNode[],
  edges: VizEdge[],
  pointIndexById: Map<string, number>,
  degrees: number[],
): string[] {
  const adjacency = nodes.map(() => [] as Array<{ index: number; weight: number }>);
  for (const edge of edges) {
    const source = pointIndexById.get(edge.source_id)!;
    const target = pointIndexById.get(edge.target_id)!;
    const weight = edge.kind === 'semantic' ? 1.8 : edge.kind === 'fact' ? 1.35 : 1;
    adjacency[source].push({ index: target, weight });
    adjacency[target].push({ index: source, weight });
  }

  const anchored = nodes.map((node) => Boolean(node.topic_key) || node.kind === 'topic');
  let labels = nodes.map(communitySeed);
  for (let step = 0; step < COMMUNITY_PROPAGATION_STEPS; step += 1) {
    const next = [...labels];
    nodes.forEach((_node, index) => {
      if (anchored[index] || adjacency[index].length === 0) return;
      const votes = new Map<string, number>([[labels[index], 0.65]]);
      for (const neighbor of adjacency[index]) {
        const contribution = neighbor.weight / Math.sqrt(Math.max(1, degrees[neighbor.index]));
        votes.set(labels[neighbor.index], (votes.get(labels[neighbor.index]) ?? 0) + contribution);
      }
      next[index] = [...votes]
        .sort(([leftLabel, leftVote], [rightLabel, rightVote]) =>
          rightVote - leftVote || leftLabel.localeCompare(rightLabel),
        )[0][0];
    });
    if (next.every((label, index) => label === labels[index])) break;
    labels = next;
  }
  return labels;
}

function communitySeed(node: VizNode): string {
  if (node.topic_key) return `topic:${node.topic_key}`;
  if (node.kind === 'topic') return node.id.startsWith('topic:') ? node.id : `topic:${node.label}`;
  if (node.kind === 'session') return node.session_id ? `session:${node.session_id}` : node.id;
  if (node.kind === 'project') return node.project ? `project:${node.project}` : node.id;
  return `node:${node.id}`;
}

function assignPaletteSlots(keys: string[]): Map<string, number> {
  const assigned = new Map<string, number>();
  const occupied = new Set<number>();
  for (const key of keys) {
    let slot = stableHash(key) % COMMUNITY_PALETTE.length;
    while (occupied.has(slot) && occupied.size < COMMUNITY_PALETTE.length) {
      slot = (slot + 1) % COMMUNITY_PALETTE.length;
    }
    assigned.set(key, slot);
    occupied.add(slot);
  }
  return assigned;
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function mixWithVoid(color: string, voidWeight: number): string {
  const rgb = [1, 3, 9];
  const value = color.slice(1);
  const mixed = [0, 2, 4].map((offset, channel) => {
    const source = Number.parseInt(value.slice(offset, offset + 2), 16);
    return Math.round(source * (1 - voidWeight) + rgb[channel] * voidWeight)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${mixed.join('')}`;
}
