import type { VizEdge, VizNode } from '../../api/client.js';
import { presentStoredText } from '../safe-presentation.js';
import {
  buildNeuralAtlasLayout,
  type NeuralAtlasWorldExtent,
} from './neural-atlas-layout.js';

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
  pointCommunityKeys: string[];
  pointCommunities: number[];
  communityKeys: string[];
  communityAnchorIds: string[];
  communityAnchorIndices: number[];
  extentAnchorIds: string[];
  extentAnchorIndices: number[];
  clusterCenters: number[];
  clusterStrengths: number[];
  worldExtent: NeuralAtlasWorldExtent;
  pointColors: string[];
  pointSizes: number[];
  pointShapes: number[];
  linkIds: string[];
  links: number[];
  linkColors: string[];
  linkWidths: number[];
  linkArrows: boolean[];
  quality: CosmosDenseQuality;
  focus: CosmosFocusNeighborhood | null;
}

export interface CosmosDenseQuality {
  level: 'full' | 'dense' | 'extreme';
  curvedLinkSegments: number;
  hoverSampleMs: number;
  renderArrows: boolean;
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
  previousCommunityAnchorIds: readonly string[] = [],
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
  const semanticLevel = nodes.find((node) => node.semantic_level)?.semantic_level ?? null;
  const semanticCommunityFallback = nodes.find((node) => node.community_id)?.community_id
    ?? `semantic:${semanticLevel ?? 'unknown'}`;
  const pointCommunityKeys = semanticLevel
    ? nodes.map((node) => semanticCommunityKey(node, semanticLevel, semanticCommunityFallback))
    : detectCommunities(nodes, visibleEdges, pointIndexById, pointDegrees);
  const communityKeys = [...new Set(pointCommunityKeys)].sort((left, right) => left.localeCompare(right));
  const communityIndexByKey = new Map(communityKeys.map((key, index) => [key, index]));
  const paletteIndexByKey = assignPaletteSlots(communityKeys);
  const pointCommunities = pointCommunityKeys.map((key) => communityIndexByKey.get(key)!);
  const pointColors = pointCommunityKeys.map((key) => COMMUNITY_PALETTE[paletteIndexByKey.get(key)!]);
  const { ids: communityAnchorIds, indices: communityAnchorIndices } = selectCommunityAnchors(
    nodes,
    pointCommunityKeys,
    communityKeys,
    pointDegrees,
    pointIndexById,
    previousCommunityAnchorIds,
  );
  const quality = denseQualityFor(nodes.length, visibleEdges.length);

  const links: number[] = [];
  const linkWidths: number[] = [];
  const linkColors: string[] = [];
  for (const edge of visibleEdges) {
    const sourceIndex = pointIndexById.get(edge.source_id)!;
    links.push(sourceIndex, pointIndexById.get(edge.target_id)!);
    linkWidths.push(linkWidthFor(edge, semanticLevel));
    linkColors.push(mixWithVoid(pointColors[sourceIndex], linkVoidWeightFor(edge, semanticLevel)));
  }

  const world = buildNeuralAtlasLayout(
    nodes.map((node, index) => ({
      id: node.id,
      seedX: node.seed_x,
      seedY: node.seed_y,
      community: pointCommunities[index],
      degree: pointDegrees[index],
    })),
    visibleEdges.map((edge): [number, number] => [
      pointIndexById.get(edge.source_id)!,
      pointIndexById.get(edge.target_id)!,
    ]),
    semanticLevel ?? 'raw',
  );
  const { ids: extentAnchorIds, indices: extentAnchorIndices } = selectExtentAnchors(
    nodes,
    world.positions,
  );

  return focusCosmosGraphData({
    nodes,
    edges: visibleEdges,
    pointIds: nodes.map((node) => node.id),
    pointLabels: nodes.map((node) => presentStoredText(node.label)),
    pointKinds: nodes.map((node) => node.kind),
    pointPositions: world.positions,
    pointDegrees,
    pointCommunityKeys,
    pointCommunities,
    communityKeys,
    communityAnchorIds: semanticLevel === 'universe' ? [] : communityAnchorIds,
    communityAnchorIndices: semanticLevel === 'universe' ? [] : communityAnchorIndices,
    extentAnchorIds,
    extentAnchorIndices,
    clusterCenters: world.clusterCenters,
    clusterStrengths: world.clusterStrengths,
    worldExtent: world.extent,
    pointColors,
    pointSizes: nodes.map((node, index) => pointSizeFor(node, pointDegrees[index], semanticLevel)),
    pointShapes: nodes.map(() => 0),
    linkIds: visibleEdges.map((edge) => edge.id),
    links,
    linkColors,
    linkWidths,
    linkArrows: visibleEdges.map(() => quality.renderArrows),
    quality,
    focus: null,
  }, focusId);
}

export function focusCosmosGraphData(data: CosmosGraphData, focusId: string | null): CosmosGraphData {
  if (!focusId) return data.focus === null ? data : { ...data, focus: null };
  const pointIndexById = new Map(data.pointIds.map((id, index) => [id, index]));
  const pointIndex = pointIndexById.get(focusId);
  if (pointIndex === undefined) return data.focus === null ? data : { ...data, focus: null };

  const neighborPointIndices = new Set<number>();
  const linkIndices: number[] = [];
  data.edges.forEach((edge, linkIndex) => {
    const neighborId = edge.source_id === focusId
      ? edge.target_id
      : edge.target_id === focusId
        ? edge.source_id
        : null;
    if (!neighborId) return;
    const neighborIndex = pointIndexById.get(neighborId);
    if (neighborIndex !== undefined) neighborPointIndices.add(neighborIndex);
    linkIndices.push(linkIndex);
  });

  return {
    ...data,
    focus: {
      pointIndex,
      neighborPointIndices: [...neighborPointIndices].sort((left, right) => left - right),
      linkIndices,
    },
  };
}

function selectExtentAnchors(
  nodes: VizNode[],
  pointPositions: readonly number[],
): { ids: string[]; indices: number[] } {
  if (nodes.length === 0) return { ids: [], indices: [] };

  const extremes = [
    { offset: 0, direction: 1 },
    { offset: 0, direction: -1 },
    { offset: 1, direction: 1 },
    { offset: 1, direction: -1 },
  ] as const;
  const indices: number[] = [];
  for (const { offset, direction } of extremes) {
    let candidate = 0;
    for (let index = 1; index < nodes.length; index += 1) {
      const value = pointPositions[index * 2 + offset];
      const candidateValue = pointPositions[candidate * 2 + offset];
      if (
        value * direction > candidateValue * direction
        || (value === candidateValue && nodes[index].id.localeCompare(nodes[candidate].id) < 0)
      ) {
        candidate = index;
      }
    }
    if (!indices.includes(candidate)) indices.push(candidate);
  }

  return { ids: indices.map((index) => nodes[index].id), indices };
}

function selectCommunityAnchors(
  nodes: VizNode[],
  pointCommunityKeys: string[],
  communityKeys: string[],
  pointDegrees: number[],
  pointIndexById: Map<string, number>,
  previousCommunityAnchorIds: readonly string[],
): { ids: string[]; indices: number[] } {
  const anchorIndexByKey = new Map<string, number>();
  for (const anchorId of previousCommunityAnchorIds) {
    const pointIndex = pointIndexById.get(anchorId);
    if (pointIndex === undefined) continue;
    const key = pointCommunityKeys[pointIndex];
    if (!anchorIndexByKey.has(key)) anchorIndexByKey.set(key, pointIndex);
  }

  for (const key of communityKeys) {
    if (anchorIndexByKey.has(key)) continue;
    const candidate = nodes
      .map((_node, index) => index)
      .filter((index) => pointCommunityKeys[index] === key)
      .sort((left, right) =>
        pointDegrees[right] - pointDegrees[left] || nodes[left].id.localeCompare(nodes[right].id),
      )[0];
    if (candidate !== undefined) anchorIndexByKey.set(key, candidate);
  }

  const indices = communityKeys
    .map((key) => anchorIndexByKey.get(key))
    .filter((index): index is number => index !== undefined);
  return { ids: indices.map((index) => nodes[index].id), indices };
}

function denseQualityFor(pointCount: number, linkCount: number): CosmosDenseQuality {
  const identityCount = pointCount + linkCount;
  if (identityCount >= 6_000) {
    return { level: 'extreme', curvedLinkSegments: 6, hoverSampleMs: 280, renderArrows: false };
  }
  if (identityCount >= 1_800) {
    return { level: 'dense', curvedLinkSegments: 12, hoverSampleMs: 220, renderArrows: false };
  }
  return { level: 'full', curvedLinkSegments: 24, hoverSampleMs: 180, renderArrows: true };
}

function neuronSizeForDegree(degree: number): number {
  return 3 + Math.min(5, Math.log2(Math.max(0, degree) + 1) * 1.35);
}

function semanticCommunityKey(
  node: VizNode,
  level: NonNullable<VizNode['semantic_level']>,
  fallback: string,
): string {
  if (level === 'universe') return node.community_id ?? node.id;
  return node.community_id ?? fallback;
}

function pointSizeFor(
  node: VizNode,
  degree: number,
  semanticLevel: VizNode['semantic_level'] | null,
): number {
  if (semanticLevel === 'universe') {
    const members = Math.max(1, node.member_count ?? 1);
    return 4 + Math.min(8, Math.log2(members + 1) * 0.78);
  }
  if (semanticLevel === 'community') {
    return 2.5 + Math.min(4, Math.log2(Math.max(0, degree) + 1) * 0.9);
  }
  if (semanticLevel === 'neighborhood') {
    const base = node.kind === 'fact' ? 2.25 : 2.75;
    return base + Math.min(3.75, Math.log2(Math.max(0, degree) + 1) * 0.82);
  }
  return neuronSizeForDegree(degree);
}

function linkWidthFor(edge: VizEdge, semanticLevel: VizNode['semantic_level'] | null): number {
  if (!semanticLevel) {
    return edge.kind === 'semantic' ? 1.15 : edge.kind === 'fact' ? 1 : 0.8;
  }
  if (edge.kind === 'aggregate') {
    return 1.05 + Math.min(2.65, Math.log2(Math.max(1, edge.weight ?? 1) + 1) * 0.38);
  }
  if (edge.kind === 'semantic') {
    return 1.05 + Math.min(1.15, Math.log2(Math.max(1, edge.weight ?? 1) + 1) * 0.22);
  }
  return edge.kind === 'fact' ? 0.95 : 0.72;
}

function linkVoidWeightFor(edge: VizEdge, semanticLevel: VizNode['semantic_level'] | null): number {
  if (!semanticLevel) return edge.kind === 'metadata' ? 0.44 : 0.18;
  if (edge.kind === 'aggregate') return 0.08;
  if (edge.kind === 'semantic') return 0.14;
  return edge.kind === 'fact' ? 0.22 : 0.48;
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
