import { createHash } from 'node:crypto';
import { UndirectedGraph } from 'graphology';
import louvainModule from 'graphology-communities-louvain';
import { truncateForPreview } from '../utils/content.js';
import { stripPrivateTags } from '../utils/privacy.js';
import type { AtlasCommunityProjection, AtlasEvidenceLink } from './semantic-atlas.js';
import type {
  Observation,
  SemanticAtlasEdge,
  SemanticAtlasNode,
  SemanticAtlasRegion,
  SemanticAtlasRegionBridge,
  SemanticAtlasRelationshipConfidence,
  SemanticAtlasRepresentativeSignal,
} from './types.js';

const REGION_ALGORITHM = 'semantic-region-v1';
const SIGNAL_ORDER: SemanticAtlasRepresentativeSignal[] = [
  'structural', 'bridge', 'recency', 'confidence', 'diversity',
];

interface PresentationEvidence { observation_id: number; label: string }

type LouvainRunner = (
  graph: UndirectedGraph,
  options: { getEdgeWeight: 'weight'; fastLocalMoves: false; randomWalk: false; resolution: number },
) => Record<string, number>;

const runLouvain = louvainModule as unknown as LouvainRunner;

export interface SemanticAtlasCommunityViewInput {
  community: AtlasCommunityProjection;
  observations: Observation[];
  observationNodes: Map<string, SemanticAtlasNode>;
  evidenceLinks: AtlasEvidenceLink[];
  presentationEvidence: PresentationEvidence[];
  regionId?: string;
}

export interface SemanticAtlasCommunityView {
  nodes: SemanticAtlasNode[];
  edges: SemanticAtlasEdge[];
  regions: SemanticAtlasRegion[];
  region_bridges: SemanticAtlasRegionBridge[];
  source_memory_count: number;
  source_relationship_count: number;
  visible_memory_count: number;
  visible_relationship_count: number;
  represented_source_relationship_count: number;
  omitted_memory_count: number;
  omitted_relationship_count: number;
  region_id: string | null;
}

function safeText(value: string): string {
  return stripPrivateTags(value)
    .replace(/\[private\][\s\S]*?\[\/private\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashId(prefix: string, parts: string[]): string {
  return `${prefix}:${createHash('sha256').update(parts.join('\0')).digest('hex')}`;
}

function seed(id: string): { x: number; y: number } {
  const digest = createHash('sha256').update(id).digest();
  return {
    x: ((digest.readUInt32BE(0) / 0xffffffff) * 2) - 1,
    y: ((digest.readUInt32BE(4) / 0xffffffff) * 2) - 1,
  };
}

function desiredRegionCount(memberCount: number): number {
  if (memberCount < 24) return Math.max(1, Math.min(6, Math.ceil(memberCount / 6)));
  return Math.max(6, Math.min(12, Math.round(Math.sqrt(memberCount / 4))));
}

function linksByNode(ids: string[], links: AtlasEvidenceLink[]): Map<string, AtlasEvidenceLink[]> {
  const result = new Map(ids.map((id) => [id, [] as AtlasEvidenceLink[]]));
  for (const link of links) {
    result.get(link.source_id)?.push(link);
    result.get(link.target_id)?.push(link);
  }
  for (const nodeLinks of result.values()) {
    nodeLinks.sort((left, right) => left.source_id.localeCompare(right.source_id)
      || left.target_id.localeCompare(right.target_id));
  }
  return result;
}

function weightedDistances(start: string, members: Set<string>, adjacency: Map<string, AtlasEvidenceLink[]>): Map<string, number> {
  const distances = new Map<string, number>([[start, 0]]);
  const pending = new Set(members);
  while (pending.size > 0) {
    const current = [...pending].sort((left, right) => (
      (distances.get(left) ?? Number.POSITIVE_INFINITY) - (distances.get(right) ?? Number.POSITIVE_INFINITY)
      || left.localeCompare(right)
    ))[0]!;
    pending.delete(current);
    const currentDistance = distances.get(current);
    if (currentDistance === undefined) break;
    for (const link of adjacency.get(current) ?? []) {
      const neighbor = link.source_id === current ? link.target_id : link.source_id;
      if (!pending.has(neighbor)) continue;
      const candidate = currentDistance + 1 / Math.max(link.weight, 0.000001);
      if (candidate < (distances.get(neighbor) ?? Number.POSITIVE_INFINITY)) distances.set(neighbor, candidate);
    }
  }
  return distances;
}

function topologySplit(group: string[], adjacency: Map<string, AtlasEvidenceLink[]>): string[][] {
  if (group.length < 2) return [group];
  const members = new Set(group);
  const firstSeed = [...group].sort((left, right) => (
    (adjacency.get(right)?.filter((link) => members.has(link.source_id) && members.has(link.target_id))
      .reduce((sum, link) => sum + link.weight, 0) ?? 0)
    - (adjacency.get(left)?.filter((link) => members.has(link.source_id) && members.has(link.target_id))
      .reduce((sum, link) => sum + link.weight, 0) ?? 0)
    || left.localeCompare(right)
  ))[0]!;
  const firstDistances = weightedDistances(firstSeed, members, adjacency);
  const secondSeed = [...group].sort((left, right) => (
    (firstDistances.get(right) ?? Number.POSITIVE_INFINITY) - (firstDistances.get(left) ?? Number.POSITIVE_INFINITY)
    || left.localeCompare(right)
  ))[0]!;
  const secondDistances = weightedDistances(secondSeed, members, adjacency);
  const halves: [string[], string[]] = [[], []];
  for (const id of [...group].sort()) {
    const first = firstDistances.get(id) ?? Number.POSITIVE_INFINITY;
    const second = secondDistances.get(id) ?? Number.POSITIVE_INFINITY;
    const side = first === second ? (halves[0].length <= halves[1].length ? 0 : 1) : first < second ? 0 : 1;
    halves[side].push(id);
  }
  if (halves[0].length === 0 || halves[1].length === 0) {
    const ordered = [...group].sort((left, right) => {
      const leftHash = createHash('sha256').update(left).digest('hex');
      const rightHash = createHash('sha256').update(right).digest('hex');
      return leftHash.localeCompare(rightHash);
    });
    const midpoint = Math.ceil(ordered.length / 2);
    return [ordered.slice(0, midpoint).sort(), ordered.slice(midpoint).sort()];
  }
  return halves.sort((left, right) => left[0]!.localeCompare(right[0]!));
}

function groupAffinity(left: string[], right: string[], adjacency: Map<string, AtlasEvidenceLink[]>): number {
  const rightSet = new Set(right);
  let affinity = 0;
  for (const id of left) {
    for (const link of adjacency.get(id) ?? []) {
      const neighbor = link.source_id === id ? link.target_id : link.source_id;
      if (rightSet.has(neighbor)) affinity += link.weight;
    }
  }
  return affinity;
}

function partitionMembers(ids: string[], links: AtlasEvidenceLink[]): string[][] {
  if (ids.length === 0) return [];
  const adjacency = linksByNode(ids, links);
  const weightedDegree = new Map(ids.map((id) => [id, (adjacency.get(id) ?? []).reduce((sum, link) => sum + link.weight, 0)]));
  const sortedDegrees = [...weightedDegree.values()].sort((left, right) => left - right);
  const hubThreshold = Math.max(64, sortedDegrees[Math.max(0, Math.ceil(sortedDegrees.length * 0.99) - 1)] ?? 0);
  const hubs = new Set(ids.filter((id) => (adjacency.get(id)?.length ?? 0) > hubThreshold));
  const linked = ids.filter((id) => (adjacency.get(id)?.length ?? 0) > 0 && !hubs.has(id)).sort();
  const graph = new UndirectedGraph();
  for (const id of linked) graph.addNode(id);
  for (const link of links) {
    if (!graph.hasNode(link.source_id) || !graph.hasNode(link.target_id)) continue;
    graph.addUndirectedEdgeWithKey(`${link.source_id}\0${link.target_id}`, link.source_id, link.target_id, { weight: link.weight });
  }
  const grouped = new Map<string, string[]>();
  if (graph.size > 0) {
    const resolution = ids.length >= 600 ? 1.35 : ids.length >= 180 ? 1.15 : 1;
    const mapping = runLouvain(graph, { getEdgeWeight: 'weight', fastLocalMoves: false, randomWalk: false, resolution });
    for (const id of linked) {
      const key = String(mapping[id]);
      const group = grouped.get(key) ?? [];
      group.push(id);
      grouped.set(key, group);
    }
  }
  let groups = [...grouped.values()].map((group) => group.sort());
  const groupByMember = new Map<string, string[]>();
  for (const group of groups) for (const id of group) groupByMember.set(id, group);
  const unattached = ids.filter((id) => !groupByMember.has(id)).sort();
  for (const id of unattached) {
    const votes = new Map<string[], number>();
    for (const link of adjacency.get(id) ?? []) {
      const neighbor = link.source_id === id ? link.target_id : link.source_id;
      const group = groupByMember.get(neighbor);
      if (group) votes.set(group, (votes.get(group) ?? 0) + link.weight);
    }
    const winner = [...votes].sort((left, right) => right[1] - left[1] || left[0][0]!.localeCompare(right[0][0]!))[0]?.[0];
    if (winner && ((adjacency.get(id)?.length ?? 0) > 0 || hubs.has(id))) {
      winner.push(id);
      winner.sort();
      groupByMember.set(id, winner);
    }
  }
  const isolates = unattached.filter((id) => !groupByMember.has(id));
  const target = desiredRegionCount(ids.length);
  if (isolates.length > 0) {
    const slots = Math.max(1, Math.min(target - groups.length, Math.ceil(isolates.length / Math.max(1, Math.ceil(ids.length * 0.12)))));
    const isolateGroups = Array.from({ length: slots }, () => [] as string[]);
    [...isolates].sort((left, right) => createHash('sha256').update(left).digest('hex')
      .localeCompare(createHash('sha256').update(right).digest('hex')))
      .forEach((id, index) => isolateGroups[index % slots]!.push(id));
    groups.push(...isolateGroups.filter((group) => group.length > 0).map((group) => group.sort()));
  }
  const maximumSize = ids.length >= 24 ? Math.min(250, Math.max(1, Math.floor(ids.length * 0.35))) : 250;
  for (;;) {
    const index = groups.findIndex((group) => group.length > maximumSize);
    if (index < 0) break;
    const [left, right] = topologySplit(groups[index]!, adjacency);
    if (!right || right.length === 0) break;
    groups.splice(index, 1, left, right);
  }
  while (groups.length < target) {
    const candidate = groups.map((group, index) => ({ group, index }))
      .filter(({ group }) => group.length > 1)
      .sort((left, right) => right.group.length - left.group.length || left.group[0]!.localeCompare(right.group[0]!))[0];
    if (!candidate) break;
    const [left, right] = topologySplit(candidate.group, adjacency);
    groups.splice(candidate.index, 1, left, right!);
  }
  while (groups.length > 12) {
    const smallest = groups.map((group, index) => ({ group, index }))
      .sort((left, right) => left.group.length - right.group.length || left.group[0]!.localeCompare(right.group[0]!))[0]!;
    const targetGroup = groups.map((group, index) => ({ group, index, affinity: index === smallest.index ? -1 : groupAffinity(smallest.group, group, adjacency) }))
      .filter(({ index }) => index !== smallest.index)
      .sort((left, right) => right.affinity - left.affinity || left.group.length - right.group.length || left.group[0]!.localeCompare(right.group[0]!))[0]!;
    const merged = [...smallest.group, ...targetGroup.group].sort();
    for (const index of [smallest.index, targetGroup.index].sort((left, right) => right - left)) groups.splice(index, 1);
    groups.push(merged);
  }
  return groups.sort((left, right) => left[0]!.localeCompare(right[0]!));
}

function confidence(evidenceCount: number): SemanticAtlasRelationshipConfidence {
  if (evidenceCount >= 4) return 'high';
  if (evidenceCount >= 2) return 'medium';
  if (evidenceCount >= 1) return 'low';
  return 'unknown';
}

function reasonFor(signals: SemanticAtlasRepresentativeSignal[]): string {
  const labels: Record<SemanticAtlasRepresentativeSignal, string> = {
    structural: 'strong local structure',
    bridge: 'cross-region connection',
    recency: 'recent activity',
    confidence: 'well-supported evidence',
    diversity: 'distinct regional coverage',
  };
  return truncateForPreview(`Representative because of ${signals.map((signal) => labels[signal]).join(' and ')}.`, 120);
}

function boundedFacetOptions(
  nodeIds: string[],
  nodes: Map<string, SemanticAtlasNode>,
  kind: 'project' | 'session' | 'topic',
): Array<{ kind: 'project' | 'session' | 'topic'; token: string; label: string; count: number }> {
  const counts = new Map<string, { kind: 'project' | 'session' | 'topic'; token: string; label: string; count: number }>();
  for (const id of nodeIds) {
    const facet = nodes.get(id)?.[kind];
    if (!facet) continue;
    const current = counts.get(facet.token) ?? { ...facet, count: 0 };
    current.count += 1;
    counts.set(facet.token, current);
  }
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label) || left.token.localeCompare(right.token))
    .slice(0, 8);
}

function normalize(values: Map<string, number>, id: string): number {
  const maximum = Math.max(0, ...values.values());
  return maximum > 0 ? (values.get(id) ?? 0) / maximum : 0;
}

function maximumSpanningBackbone(
  nodeIds: Set<string>,
  links: AtlasEvidenceLink[],
  regionByNode: Map<string, string>,
): Set<string> {
  const parent = new Map([...nodeIds].map((id) => [id, id]));
  const find = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current)!;
    let cursor = id;
    while (parent.get(cursor) !== current) {
      const next = parent.get(cursor)!;
      parent.set(cursor, current);
      cursor = next;
    }
    return current;
  };
  const backbone = new Set<string>();
  for (const link of [...links].sort((left, right) => right.weight - left.weight
    || right.evidence_count - left.evidence_count
    || left.source_id.localeCompare(right.source_id)
    || left.target_id.localeCompare(right.target_id))) {
    if (regionByNode.get(link.source_id) !== regionByNode.get(link.target_id)) continue;
    const sourceRoot = find(link.source_id);
    const targetRoot = find(link.target_id);
    if (sourceRoot === targetRoot) continue;
    parent.set(targetRoot, sourceRoot);
    backbone.add(`${link.source_id}\0${link.target_id}`);
  }
  return backbone;
}

export function buildSemanticAtlasCommunityView(input: SemanticAtlasCommunityViewInput): SemanticAtlasCommunityView {
  const memberIds = [...input.community.member_ids].sort();
  const memberSet = new Set(memberIds);
  const links = input.evidenceLinks
    .filter((link) => memberSet.has(link.source_id) && memberSet.has(link.target_id))
    .sort((left, right) => left.source_id.localeCompare(right.source_id) || left.target_id.localeCompare(right.target_id));
  const groups = partitionMembers(memberIds, links);
  const observationById = new Map(input.observations.map((observation) => [`obs:${observation.id}`, observation]));
  const evidenceByObservation = new Map<number, string[]>();
  const evidenceFrequency = new Map<string, number>();
  for (const item of input.presentationEvidence) {
    if (!memberSet.has(`obs:${item.observation_id}`)) continue;
    const label = safeText(item.label);
    if (!label) continue;
    const labels = evidenceByObservation.get(item.observation_id) ?? [];
    if (!labels.includes(label)) labels.push(label);
    evidenceByObservation.set(item.observation_id, labels);
    evidenceFrequency.set(label, (evidenceFrequency.get(label) ?? 0) + 1);
  }
  const regionByNode = new Map<string, string>();
  const regions = groups.map((group, regionIndex): SemanticAtlasRegion => {
    const id = hashId('region', [REGION_ALGORITHM, ...group]);
    group.forEach((nodeId) => regionByNode.set(nodeId, id));
    const members = group.map((nodeId) => observationById.get(nodeId)!).filter(Boolean);
    const concepts = new Map<string, number>();
    for (const member of members) {
      for (const label of evidenceByObservation.get(member.id) ?? []) {
        if ((evidenceFrequency.get(label) ?? 0) > Math.max(3, Math.ceil(memberIds.length * 0.2))) continue;
        concepts.set(label, (concepts.get(label) ?? 0) + 1);
      }
    }
    const conceptEntries = [...concepts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 5).map(([label, count]) => ({ label, count }));
    const projectCounts = new Map<string, number>();
    const typeCounts = new Map<Observation['type'], number>();
    for (const member of members) {
      if (member.project) projectCounts.set(member.project, (projectCounts.get(member.project) ?? 0) + 1);
      typeCounts.set(member.type, (typeCounts.get(member.type) ?? 0) + 1);
    }
    const point = seed(id);
    return {
      id, community_id: input.community.id,
      label: conceptEntries[0]?.label ?? `Memory region ${String(regionIndex + 1).padStart(2, '0')}`,
      summary: `${group.length} memories in a deterministic semantic region.`,
      member_count: group.length, project_count: projectCounts.size,
      time_from: members.map((member) => member.created_at).sort()[0] ?? null,
      time_to: members.map((member) => member.updated_at).sort().at(-1) ?? null,
      concepts: conceptEntries,
      facets: {
        projects: boundedFacetOptions(group, input.observationNodes, 'project'),
        sessions: boundedFacetOptions(group, input.observationNodes, 'session'),
        topics: boundedFacetOptions(group, input.observationNodes, 'topic'),
        types: [...typeCounts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, 8).map(([value, count]) => ({ value, count })),
      },
      representatives: [], seed_x: point.x, seed_y: point.y,
      unclustered: group.every((nodeId) => !links.some((link) => link.source_id === nodeId || link.target_id === nodeId)),
    };
  });
  const labelCounts = new Map<string, number>();
  for (const region of regions) labelCounts.set(region.label, (labelCounts.get(region.label) ?? 0) + 1);
  const labelOrdinals = new Map<string, number>();
  for (const region of regions) {
    if ((labelCounts.get(region.label) ?? 0) < 2) continue;
    const ordinal = (labelOrdinals.get(region.label) ?? 0) + 1;
    labelOrdinals.set(region.label, ordinal);
    region.label = `${region.label} · ${String(ordinal).padStart(2, '0')}`;
  }
  const regionMembers = new Map(regions.map((region, index) => [region.id, groups[index]!]));
  const degree = new Map(memberIds.map((id) => [id, 0]));
  const bridge = new Map(memberIds.map((id) => [id, 0]));
  const evidenceQuality = new Map(memberIds.map((id) => [id, 0]));
  for (const link of links) {
    degree.set(link.source_id, (degree.get(link.source_id) ?? 0) + link.weight);
    degree.set(link.target_id, (degree.get(link.target_id) ?? 0) + link.weight);
    const quality = Math.min(1, link.weight) * Math.log2(link.evidence_count + 1);
    evidenceQuality.set(link.source_id, (evidenceQuality.get(link.source_id) ?? 0) + quality);
    evidenceQuality.set(link.target_id, (evidenceQuality.get(link.target_id) ?? 0) + quality);
    if (regionByNode.get(link.source_id) !== regionByNode.get(link.target_id)) {
      bridge.set(link.source_id, (bridge.get(link.source_id) ?? 0) + link.weight);
      bridge.set(link.target_id, (bridge.get(link.target_id) ?? 0) + link.weight);
    }
  }
  const timestamps = new Map(memberIds.map((id) => [id, Date.parse(observationById.get(id)?.updated_at ?? '') || 0]));
  const minimumTime = Math.min(...timestamps.values());
  const maximumTime = Math.max(...timestamps.values());
  const recency = new Map(memberIds.map((id) => [id, maximumTime > minimumTime
    ? ((timestamps.get(id) ?? minimumTime) - minimumTime) / (maximumTime - minimumTime)
    : 1]));
  const facetFrequency = new Map<string, number>();
  for (const id of memberIds) {
    const observation = observationById.get(id);
    for (const value of [observation?.project, observation?.session_id, observation?.type, observation?.topic_key]) {
      if (value) facetFrequency.set(value, (facetFrequency.get(value) ?? 0) + 1);
    }
  }
  const diversity = new Map(memberIds.map((id) => {
    const observation = observationById.get(id);
    const values = [observation?.project, observation?.session_id, observation?.type, observation?.topic_key].filter(Boolean) as string[];
    return [id, values.length > 0
      ? values.reduce((sum, value) => sum + 1 / Math.max(1, facetFrequency.get(value) ?? 1), 0) / values.length
      : 0];
  }));
  const contributions = new Map(memberIds.map((id) => [id, new Map<SemanticAtlasRepresentativeSignal, number>([
    ['structural', normalize(degree, id) * 0.35],
    ['bridge', normalize(bridge, id) * 0.25],
    ['recency', (recency.get(id) ?? 0) * 0.15],
    ['confidence', normalize(evidenceQuality, id) * 0.15],
    ['diversity', normalize(diversity, id) * 0.10],
  ])]));
  const representativeScore = (id: string): number => [...contributions.get(id)!.values()].reduce((sum, value) => sum + value, 0);
  const rankCandidates = (ids: string[]): string[] => [...ids].sort((left, right) => (
    representativeScore(right) - representativeScore(left) || left.localeCompare(right)
  ));
  const targetCount = memberIds.length <= 180 ? memberIds.length : Math.min(180, Math.max(80, Math.round(Math.sqrt(memberIds.length) * 6)));
  const selected: string[] = [];
  const selectionRegions = input.regionId
    ? [...regions].sort((left, right) => Number(right.id === input.regionId) - Number(left.id === input.regionId) || left.id.localeCompare(right.id))
    : regions;
  if (input.regionId) {
    const focusedMembers = regionMembers.get(input.regionId) ?? [];
    const focusedTarget = Math.min(focusedMembers.length, Math.ceil(targetCount * 0.6));
    selected.push(...rankCandidates(focusedMembers).slice(0, focusedTarget));
  }
  while (selected.length < targetCount) {
    let progressed = false;
    for (const region of selectionRegions) {
      const candidates = rankCandidates(regionMembers.get(region.id)!.filter((id) => !selected.includes(id)));
      const candidate = candidates[0];
      if (!candidate) continue;
      selected.push(candidate);
      progressed = true;
      if (selected.length >= targetCount) break;
    }
    if (!progressed) break;
  }
  const selectedSet = new Set(selected);
  for (const region of regions) {
    const regionSelected = selected.filter((id) => regionByNode.get(id) === region.id);
    region.representatives = regionSelected.map((nodeId, index) => {
      const signalScores = contributions.get(nodeId)!;
      const ordered = SIGNAL_ORDER.filter((signal) => (signalScores.get(signal) ?? 0) > 0)
        .sort((left, right) => (signalScores.get(right)! - signalScores.get(left)!) || SIGNAL_ORDER.indexOf(left) - SIGNAL_ORDER.indexOf(right))
        .slice(0, 3);
      return { node_id: nodeId, reason: reasonFor(ordered), signals: ordered, rank: index + 1 };
    });
  }
  const preparedLinks = links.filter((link) => selectedSet.has(link.source_id) && selectedSet.has(link.target_id));
  const backboneIds = maximumSpanningBackbone(selectedSet, preparedLinks, regionByNode);
  const aggregatePairs = new Map<string, { weight: number; evidence: number; relations: Set<string>; orientations: Set<'forward' | 'reverse' | 'undirected' | 'unknown' | 'mixed'>; provenance: Map<string, SemanticAtlasEdge['provenance'][number]>; edgeIds: string[] }>();
  for (const link of links) {
    const sourceRegion = regionByNode.get(link.source_id)!;
    const targetRegion = regionByNode.get(link.target_id)!;
    if (sourceRegion === targetRegion) continue;
    const [source, target] = [sourceRegion, targetRegion].sort();
    const key = `${source}\0${target}`;
    const aggregate = aggregatePairs.get(key) ?? { weight: 0, evidence: 0, relations: new Set<string>(), orientations: new Set<'forward' | 'reverse' | 'undirected' | 'unknown' | 'mixed'>(), provenance: new Map<string, SemanticAtlasEdge['provenance'][number]>(), edgeIds: [] };
    aggregate.weight += link.weight; aggregate.evidence += link.evidence_count;
    link.relations.forEach((relation) => aggregate.relations.add(relation));
    aggregate.orientations.add(link.direction === 'directed'
      ? sourceRegion === source ? 'forward' : 'reverse'
      : link.direction);
    link.provenance.forEach((item) => aggregate.provenance.set(item.source_id, item));
    if (selectedSet.has(link.source_id) && selectedSet.has(link.target_id)) aggregate.edgeIds.push(hashId('edge', [link.source_id, link.target_id]));
    aggregatePairs.set(key, aggregate);
  }
  const region_bridges = [...aggregatePairs].map(([key, aggregate]): SemanticAtlasRegionBridge => {
    const [source, target] = key.split('\0') as [string, string];
    const relations = [...aggregate.relations].sort();
    const hasForward = aggregate.orientations.has('forward');
    const hasReverse = aggregate.orientations.has('reverse');
    const nonDirectional = aggregate.orientations.has('undirected');
    const mixed = aggregate.orientations.has('mixed') || (hasForward && hasReverse) || ((hasForward || hasReverse) && nonDirectional);
    const reverse = hasReverse && !hasForward && !nonDirectional && !mixed;
    const orientedSource = reverse ? target : source;
    const orientedTarget = reverse ? source : target;
    return {
      id: hashId('region-edge', [orientedSource, orientedTarget, ...relations]), source_region_id: orientedSource, target_region_id: orientedTarget,
      tier: 'region-aggregate', relationship_class: 'aggregate',
      direction: mixed ? 'mixed' : hasForward || hasReverse ? 'directed' : nonDirectional ? 'undirected' : 'unknown',
      weight: Number(aggregate.weight.toFixed(6)), evidence_count: aggregate.evidence, relations,
      confidence: confidence(aggregate.evidence), representative_edge_ids: aggregate.edgeIds.sort().slice(0, 5),
      provenance: [...aggregate.provenance.values()].sort((left, right) => left.source_id.localeCompare(right.source_id)).slice(0, 5),
    };
  }).sort((left, right) => left.id.localeCompare(right.id)).slice(0, 66);
  const edges = preparedLinks.sort((left, right) => right.weight - left.weight || left.source_id.localeCompare(right.source_id))
    .slice(0, Math.max(0, 450 - region_bridges.length)).map((link): SemanticAtlasEdge => ({
      id: hashId('edge', [link.source_id, link.target_id, ...link.relations]), source_id: link.source_id, target_id: link.target_id,
      kind: 'semantic', relation: link.relations[0] ?? 'RELATED_MEMORY', label: 'Related memory',
      summary: `${link.evidence_count} shared evidence ${link.evidence_count === 1 ? 'item' : 'items'}`,
      weight: link.weight, evidence_count: link.evidence_count,
      tier: backboneIds.has(`${link.source_id}\0${link.target_id}`) ? 'representative-backbone' : 'representative-semantic',
      relationship_class: 'semantic', direction: link.direction, confidence: confidence(link.evidence_count),
      provenance: link.provenance.slice(0, 5),
    }));
  const sourceRelationshipIds = new Set(links.map((link) => `${link.source_id}\0${link.target_id}`));
  const representedSourceRelationships = new Set<string>();
  for (const link of links) {
    if (selectedSet.has(link.source_id) && selectedSet.has(link.target_id)) representedSourceRelationships.add(`${link.source_id}\0${link.target_id}`);
    else if (regionByNode.get(link.source_id) !== regionByNode.get(link.target_id)) representedSourceRelationships.add(`${link.source_id}\0${link.target_id}`);
  }
  return {
    nodes: selected.sort().map((id) => ({ ...input.observationNodes.get(id)!, region_id: regionByNode.get(id)! })),
    edges, regions, region_bridges,
    source_memory_count: memberIds.length, source_relationship_count: sourceRelationshipIds.size,
    visible_memory_count: selected.length, visible_relationship_count: edges.length + region_bridges.length,
    represented_source_relationship_count: representedSourceRelationships.size,
    omitted_memory_count: memberIds.length - selected.length,
    omitted_relationship_count: sourceRelationshipIds.size - representedSourceRelationships.size,
    region_id: input.regionId ?? null,
  };
}
