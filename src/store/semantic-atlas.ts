import { createHash } from 'node:crypto';
import { UndirectedGraph } from 'graphology';
import louvainModule from 'graphology-communities-louvain';
import { truncateForPreview } from '../utils/content.js';
import { stripPrivateTags } from '../utils/privacy.js';
import type {
  AtlasFacetKind,
  AtlasFacetOption,
  AtlasFacetRef,
  CommunitySummarySnapshot,
  Observation,
  ObservationFact,
  SemanticAtlasEdge,
  SemanticAtlasNode,
} from './types.js';
import {
  deriveVisualizationEdgeId,
  deriveVisualizationFacetToken,
  deriveVisualizationId,
} from './visualization-identity.js';

const SUPPORT_RELATIONS = new Set(['HAS_WHAT', 'HAS_WHY', 'HAS_WHERE', 'HAS_LEARNED']);
const RAW_METADATA_RELATIONS = new Set(['IN_PROJECT', 'IN_SESSION', 'HAS_TOPIC_KEY']);

type LouvainRunner = (
  graph: UndirectedGraph<{ stableId: string }, { weight: number }>,
  options: {
    getEdgeWeight: 'weight';
    fastLocalMoves: false;
    randomWalk: false;
    resolution: number;
  },
) => Record<string, number>;

// The package is CommonJS at runtime but publishes an ESM-shaped default
// declaration. Keep the compatibility conversion bounded to this adapter.
const runLouvain = louvainModule as unknown as LouvainRunner;

type FacetValueKey = 'project' | 'session_id' | 'topic_key';

export interface AtlasFacetCatalog {
  refsByValue: Record<AtlasFacetKind, Map<string, AtlasFacetRef>>;
  valuesByToken: Map<string, { kind: AtlasFacetKind; value: string }>;
}

export interface AtlasEvidenceLink {
  source_id: string;
  target_id: string;
  weight: number;
  evidence_count: number;
  relations: string[];
}

export interface AtlasStructuralEvidence {
  observation_id: number;
  entity_key: string;
  label: string;
  relation: string;
  confidence: number;
  provenance_id: string;
}

export interface AtlasCommunityProjection {
  id: string;
  member_ids: string[];
  unclustered: boolean;
  node: SemanticAtlasNode;
}

export interface SemanticAtlasProjection {
  observations: Observation[];
  observationNodes: Map<string, SemanticAtlasNode>;
  evidenceLinks: AtlasEvidenceLink[];
  semanticEdges: SemanticAtlasEdge[];
  supportingNodes: Map<string, SemanticAtlasNode>;
  supportingEdges: SemanticAtlasEdge[];
  supportingNodeIdsByObservationId: Map<string, string[]>;
  communities: AtlasCommunityProjection[];
  communityByObservationId: Map<string, string>;
  aggregateEdges: SemanticAtlasEdge[];
  facets: {
    projects: AtlasFacetOption[];
    sessions: AtlasFacetOption[];
    topics: AtlasFacetOption[];
    types: Observation['type'][];
    relations: string[];
  };
  observationsWithKg: number;
  supportingEntityCount: number;
  rawEntityCount: number;
  rawRelationshipCount: number;
}

function safeText(value: string | null | undefined): string {
  return stripPrivateTags(value ?? '')
    .replace(/\[private\][\s\S]*?\[\/private\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fallbackCommunityPresentation(
  memberIds: string[],
  observationById: Map<string, Observation>,
  evidence: Array<{ observation_id: number; label: string }>,
): { label: string; snippet: string } {
  const memberObservationIds = new Set(memberIds.map((id) => Number.parseInt(id.slice(4), 10)));
  const evidenceCounts = new Map<string, number>();
  for (const item of evidence) {
    if (!memberObservationIds.has(item.observation_id)) continue;
    const label = safeText(item.label);
    if (!label) continue;
    evidenceCounts.set(label, (evidenceCounts.get(label) ?? 0) + 1);
  }
  const evidenceLabel = [...evidenceCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
  const projectCounts = new Map<string, number>();
  for (const memberId of memberIds) {
    const project = safeText(observationById.get(memberId)?.project);
    if (project) projectCounts.set(project, (projectCounts.get(project) ?? 0) + 1);
  }
  const projectLabel = [...projectCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
  const firstTitle = memberIds.map((id) => safeText(observationById.get(id)?.title)).find(Boolean);
  const fallbackLabel = projectLabel || firstTitle || 'Unclustered memories';
  const suffix = createHash('sha256').update(memberIds.join('\0')).digest('hex').slice(0, 5);
  const label = truncateForPreview(evidenceLabel || `${fallbackLabel} · ${suffix}`, 72);
  return {
    label,
    snippet: `${memberIds.length} ${memberIds.length === 1 ? 'memory' : 'memories'} · ${evidenceLabel ? 'shared structural evidence' : projectLabel ? 'project-guided unclustered region' : 'deterministic unclustered region'}`,
  };
}

export function enrichSemanticAtlasCommunityNodes(
  projection: SemanticAtlasProjection,
  summaries: CommunitySummarySnapshot[],
): SemanticAtlasNode[] {
  const normalizedSummaries = summaries
    .map((summary) => ({
      summary,
      safeSummary: safeText(summary.summary_text),
      sourceIds: new Set(summary.source_observation_ids.map((id) => `obs:${id}`)),
    }))
    .filter((entry) => entry.safeSummary.length > 0)
    .sort((left, right) => left.summary.community_id.localeCompare(right.summary.community_id));

  return projection.communities.map((community) => {
    const best = normalizedSummaries
      .map((entry) => ({
        ...entry,
        overlap: community.member_ids.reduce(
          (count, memberId) => count + (entry.sourceIds.has(memberId) ? 1 : 0),
          0,
        ),
      }))
      .filter((entry) => entry.overlap > 0)
      .sort((left, right) => (
        right.overlap - left.overlap
        || right.summary.confidence - left.summary.confidence
        || left.summary.community_id.localeCompare(right.summary.community_id)
      ))[0];
    if (!best) return community.node;
    return {
      ...community.node,
      label: truncateForPreview(best.safeSummary, 72),
      snippet: truncateForPreview(best.safeSummary, 180),
    };
  });
}

function seedPoint(id: string): { x: number; y: number } {
  const digest = createHash('sha256').update(id).digest();
  const x = digest.readUInt32BE(0) / 0xffffffff;
  const y = digest.readUInt32BE(4) / 0xffffffff;
  return { x: (x * 2) - 1, y: (y * 2) - 1 };
}

function facetValues(observations: Observation[], key: FacetValueKey): string[] {
  const values = new Set<string>();
  for (const observation of observations) {
    const value = observation[key];
    if (typeof value === 'string' && value.length > 0) values.add(value.normalize('NFC'));
  }
  return [...values].sort((left, right) => left.localeCompare(right));
}

function buildFacetKind(
  kind: AtlasFacetKind,
  values: string[],
  valuesByToken: AtlasFacetCatalog['valuesByToken'],
): Map<string, AtlasFacetRef> {
  const candidates = values.map((value) => {
    const token = deriveVisualizationFacetToken(kind, value);
    return { value, token, safeLabel: safeText(value) || `Untitled ${kind}` };
  });
  const labelCounts = new Map<string, number>();
  for (const candidate of candidates) {
    labelCounts.set(candidate.safeLabel, (labelCounts.get(candidate.safeLabel) ?? 0) + 1);
  }

  const refs = new Map<string, AtlasFacetRef>();
  for (const candidate of candidates) {
    const existing = valuesByToken.get(candidate.token);
    if (existing && (existing.kind !== kind || existing.value !== candidate.value)) {
      throw new Error(`Semantic atlas facet identity collision for ${kind}.`);
    }
    valuesByToken.set(candidate.token, { kind, value: candidate.value });
    refs.set(candidate.value, {
      kind,
      token: candidate.token,
      label: (labelCounts.get(candidate.safeLabel) ?? 0) > 1
        ? `${candidate.safeLabel} · ${candidate.token.slice(-6)}`
        : candidate.safeLabel,
    });
  }
  return refs;
}

export function buildAtlasFacetCatalog(observations: Observation[]): AtlasFacetCatalog {
  const valuesByToken = new Map<string, { kind: AtlasFacetKind; value: string }>();
  return {
    refsByValue: {
      project: buildFacetKind('project', facetValues(observations, 'project'), valuesByToken),
      session: buildFacetKind('session', facetValues(observations, 'session_id'), valuesByToken),
      topic: buildFacetKind('topic', facetValues(observations, 'topic_key'), valuesByToken),
    },
    valuesByToken,
  };
}

export function resolveAtlasFacetToken(
  catalog: AtlasFacetCatalog,
  kind: AtlasFacetKind,
  token: string | undefined,
): string | undefined {
  if (!token) return undefined;
  const resolved = catalog.valuesByToken.get(token);
  return resolved?.kind === kind ? resolved.value : undefined;
}

function facetRef(
  catalog: AtlasFacetCatalog,
  kind: AtlasFacetKind,
  value: string | null | undefined,
): AtlasFacetRef | null {
  if (!value) return null;
  return catalog.refsByValue[kind].get(value.normalize('NFC')) ?? null;
}

function facetOptions(
  observations: Observation[],
  key: FacetValueKey,
  kind: AtlasFacetKind,
  catalog: AtlasFacetCatalog,
): AtlasFacetOption[] {
  const counts = new Map<string, number>();
  for (const observation of observations) {
    const value = observation[key];
    if (typeof value === 'string' && value.length > 0) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ ...catalog.refsByValue[kind].get(value)!, count }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.token.localeCompare(right.token));
}

function buildEvidenceLinks(
  observations: Observation[],
  structuralEvidence: AtlasStructuralEvidence[],
  relationFilter?: string,
): {
  links: AtlasEvidenceLink[];
  observationsWithKg: Set<number>;
  supportingEntities: Set<string>;
  presentationEvidence: Array<{ observation_id: number; label: string }>;
} {
  const observationIds = new Set(observations.map((observation) => observation.id));
  const eligibleEvidence = structuralEvidence.filter((item) => (
    observationIds.has(item.observation_id)
    && (!relationFilter || item.relation === relationFilter)
  ));
  const observationsWithKg = new Set(eligibleEvidence.map((item) => item.observation_id));
  const byEntity = new Map<string, Map<number, { confidence: number; relations: Set<string>; label: string }>>();
  const supportingEntities = new Set<string>();
  for (const item of eligibleEvidence) {
    const members = byEntity.get(item.entity_key) ?? new Map();
    const current = members.get(item.observation_id) ?? {
      confidence: 0,
      relations: new Set<string>(),
      label: safeText(item.label),
    };
    current.confidence = Math.max(current.confidence, Math.min(Math.max(item.confidence, 0), 1));
    current.relations.add(item.relation);
    if (!current.label) current.label = safeText(item.label);
    members.set(item.observation_id, current);
    byEntity.set(item.entity_key, members);
  }

  const frequencyCutoff = Math.max(64, Math.ceil(observations.length * 0.01));
  const pairEvidence = new Map<string, { weight: number; evidenceCount: number; relations: Set<string> }>();
  const presentationEvidence: Array<{ observation_id: number; label: string }> = [];
  for (const [entityKey, memberMap] of [...byEntity.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const members = [...memberMap.entries()].sort(([left], [right]) => left - right);
    if (members.length < 2 || members.length > frequencyCutoff) continue;
    supportingEntities.add(entityKey);
    for (const [observationId, evidence] of members) {
      presentationEvidence.push({ observation_id: observationId, label: evidence.label });
    }
    for (let sourceIndex = 0; sourceIndex < members.length; sourceIndex += 1) {
      for (let targetIndex = sourceIndex + 1; targetIndex < members.length; targetIndex += 1) {
        const [sourceObservationId, sourceEvidence] = members[sourceIndex]!;
        const [targetObservationId, targetEvidence] = members[targetIndex]!;
        const sourceId = `obs:${sourceObservationId}`;
        const targetId = `obs:${targetObservationId}`;
        const pairKey = `${sourceId}\0${targetId}`;
        const aggregate = pairEvidence.get(pairKey) ?? { weight: 0, evidenceCount: 0, relations: new Set<string>() };
        const confidence = (sourceEvidence.confidence + targetEvidence.confidence) / 2;
        aggregate.weight += confidence / Math.max(members.length - 1, 1);
        aggregate.evidenceCount += 1;
        sourceEvidence.relations.forEach((relation) => aggregate.relations.add(relation));
        targetEvidence.relations.forEach((relation) => aggregate.relations.add(relation));
        pairEvidence.set(pairKey, aggregate);
      }
    }
  }

  return {
    links: [...pairEvidence.entries()].map(([pairKey, aggregate]) => {
      const [sourceId, targetId] = pairKey.split('\0');
      return {
        source_id: sourceId!,
        target_id: targetId!,
        weight: Number(aggregate.weight.toFixed(6)),
        evidence_count: aggregate.evidenceCount,
        relations: [...aggregate.relations].sort(),
      };
    }).sort((left, right) => (
      left.source_id.localeCompare(right.source_id) || left.target_id.localeCompare(right.target_id)
    )),
    observationsWithKg,
    supportingEntities,
    presentationEvidence,
  };
}

function connectedComponents(observationIds: string[], links: AtlasEvidenceLink[]): string[][] {
  const adjacency = new Map(observationIds.map((id) => [id, new Set<string>()]));
  for (const link of links) {
    adjacency.get(link.source_id)?.add(link.target_id);
    adjacency.get(link.target_id)?.add(link.source_id);
  }
  const visited = new Set<string>();
  const linked: string[][] = [];
  const isolates: string[] = [];
  for (const start of [...observationIds].sort()) {
    if (visited.has(start)) continue;
    if ((adjacency.get(start)?.size ?? 0) === 0) {
      visited.add(start);
      isolates.push(start);
      continue;
    }
    const component: string[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of [...(adjacency.get(current) ?? [])].sort()) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    linked.push(component.sort());
  }
  const isolateChunkSize = Math.max(1, Math.min(100, Math.ceil(Math.max(observationIds.length, 1) / 30)));
  for (let index = 0; index < isolates.length; index += isolateChunkSize) {
    linked.push(isolates.slice(index, index + isolateChunkSize));
  }
  return linked;
}

function partitionObservationCommunities(observationIds: string[], links: AtlasEvidenceLink[]): string[][] {
  const degrees = new Map(observationIds.map((id) => [id, 0]));
  for (const link of links) {
    degrees.set(link.source_id, (degrees.get(link.source_id) ?? 0) + 1);
    degrees.set(link.target_id, (degrees.get(link.target_id) ?? 0) + 1);
  }
  const sortedDegrees = [...degrees.values()].sort((left, right) => left - right);
  const p99Index = Math.max(0, Math.ceil(sortedDegrees.length * 0.99) - 1);
  const p99Degree = sortedDegrees[p99Index] ?? 0;
  const hubThreshold = Math.max(64, p99Degree);
  const hubIds = new Set(
    [...degrees.entries()]
      .filter(([, degree]) => degree > hubThreshold)
      .map(([id]) => id),
  );
  const linkedIds = observationIds
    .filter((id) => (degrees.get(id) ?? 0) > 0 && !hubIds.has(id))
    .sort();
  const graph = new UndirectedGraph<{ stableId: string }, { weight: number }>();
  for (const id of linkedIds) graph.addNode(id, { stableId: id });
  for (const link of links) {
    if (!graph.hasNode(link.source_id) || !graph.hasNode(link.target_id)) continue;
    graph.addUndirectedEdgeWithKey(
      `${link.source_id}\0${link.target_id}`,
      link.source_id,
      link.target_id,
      { weight: link.weight },
    );
  }

  const groupsByKey = new Map<string, string[]>();
  if (graph.size > 0) {
    const mapping = runLouvain(graph, {
      getEdgeWeight: 'weight',
      fastLocalMoves: false,
      randomWalk: false,
      resolution: 1,
    });
    for (const id of linkedIds) {
      const key = String(mapping[id]);
      const members = groupsByKey.get(key) ?? [];
      members.push(id);
      groupsByKey.set(key, members);
    }
  }
  let groups = [...groupsByKey.values()]
    .map((members) => members.sort())
    .sort((left, right) => left[0]!.localeCompare(right[0]!));
  const groupKeyByMember = new Map<string, string>();
  for (const group of groups) {
    const key = group[0]!;
    for (const memberId of group) groupKeyByMember.set(memberId, key);
  }
  const linksByNode = new Map<string, AtlasEvidenceLink[]>();
  for (const link of links) {
    const sourceLinks = linksByNode.get(link.source_id) ?? [];
    sourceLinks.push(link);
    linksByNode.set(link.source_id, sourceLinks);
    const targetLinks = linksByNode.get(link.target_id) ?? [];
    targetLinks.push(link);
    linksByNode.set(link.target_id, targetLinks);
  }
  const remainingIsolates = observationIds
    .filter((id) => (degrees.get(id) ?? 0) === 0 || (!hubIds.has(id) && !groupKeyByMember.has(id)))
    .sort();
  for (const hubId of [...hubIds].sort()) {
    const votes = new Map<string, number>();
    for (const link of linksByNode.get(hubId) ?? []) {
      const neighborId = link.source_id === hubId ? link.target_id : link.source_id;
      const groupKey = groupKeyByMember.get(neighborId);
      if (!groupKey) continue;
      votes.set(groupKey, (votes.get(groupKey) ?? 0) + link.weight);
    }
    const winner = [...votes.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
    if (!winner) {
      remainingIsolates.push(hubId);
      continue;
    }
    const group = groups.find((candidate) => candidate[0] === winner);
    group?.push(hubId);
    group?.sort();
    groupKeyByMember.set(hubId, winner);
  }

  const maximumCommunityCount = observationIds.length >= 150 ? 150 : 30;
  const availableIsolateGroups = Math.max(1, maximumCommunityCount - groups.length);
  const isolateChunkSize = Math.max(1, Math.ceil(remainingIsolates.length / availableIsolateGroups));
  for (let index = 0; index < remainingIsolates.length; index += isolateChunkSize) {
    groups.push(remainingIsolates.slice(index, index + isolateChunkSize).sort());
  }
  groups = groups.sort((left, right) => left[0]!.localeCompare(right[0]!));

  while (groups.length > maximumCommunityCount) {
    const candidates = groups
      .map((members, index) => ({ members, index }))
      .sort((left, right) => (
        left.members.length - right.members.length
        || left.members[0]!.localeCompare(right.members[0]!)
      ));
    const first = candidates[0];
    const second = candidates[1];
    if (!first || !second) break;
    const merged = [...first.members, ...second.members].sort();
    const remove = [first.index, second.index].sort((left, right) => right - left);
    for (const index of remove) groups.splice(index, 1);
    groups.push(merged);
    groups.sort((left, right) => left[0]!.localeCompare(right[0]!));
  }
  return groups;
}

function boundCommunities(components: string[][], observationCount: number): string[][] {
  const maximumSize = observationCount >= 150
    ? Math.max(1, Math.min(1_000, Math.floor(observationCount * 0.25)))
    : 1_000;
  const bounded = components.flatMap((component) => {
    if (component.length <= maximumSize) return [component];
    const sorted = [...component].sort((left, right) => {
      const leftHash = createHash('sha256').update(left).digest('hex');
      const rightHash = createHash('sha256').update(right).digest('hex');
      return leftHash.localeCompare(rightHash);
    });
    const chunks: string[][] = [];
    for (let index = 0; index < sorted.length; index += maximumSize) chunks.push(sorted.slice(index, index + maximumSize).sort());
    return chunks;
  });

  const minimumCount = observationCount >= 150 ? Math.min(30, observationCount) : 1;
  while (bounded.length < minimumCount) {
    const largestIndex = bounded.reduce((best, candidate, index) => (
      candidate.length > bounded[best]!.length ? index : best
    ), 0);
    const largest = bounded[largestIndex]!;
    if (largest.length < 2) break;
    const midpoint = Math.ceil(largest.length / 2);
    bounded.splice(largestIndex, 1, largest.slice(0, midpoint), largest.slice(midpoint));
  }
  return bounded
    .filter((component) => component.length > 0)
    .map((component) => [...component].sort())
    .sort((left, right) => left[0]!.localeCompare(right[0]!));
}

function observationNode(
  observation: Observation,
  communityId: string,
  catalog: AtlasFacetCatalog,
): SemanticAtlasNode {
  const id = `obs:${observation.id}`;
  const point = seedPoint(id);
  return {
    id,
    kind: 'observation',
    label: safeText(observation.title),
    snippet: truncateForPreview(safeText(observation.content), 180),
    project: facetRef(catalog, 'project', observation.project),
    session: facetRef(catalog, 'session', observation.session_id),
    topic: facetRef(catalog, 'topic', observation.topic_key),
    type: observation.type,
    community_id: communityId,
    member_count: null,
    project_count: null,
    unclustered: false,
    seed_x: point.x,
    seed_y: point.y,
  };
}

export function buildSemanticAtlasProjection(input: {
  observations: Observation[];
  facts: ObservationFact[];
  structuralEvidence: AtlasStructuralEvidence[];
  facetCatalog: AtlasFacetCatalog;
  relation?: string;
}): SemanticAtlasProjection {
  const observations = [...input.observations].sort((left, right) => left.id - right.id);
  const evidence = buildEvidenceLinks(observations, input.structuralEvidence, input.relation);
  const supportingFacts = input.facts.filter((fact) => (
    SUPPORT_RELATIONS.has(fact.relation) && fact.superseded !== true
  ));
  const components = boundCommunities(
    partitionObservationCommunities(observations.map((observation) => `obs:${observation.id}`), evidence.links),
    observations.length,
  );
  const adjacency = new Map<string, number>();
  for (const link of evidence.links) {
    adjacency.set(link.source_id, (adjacency.get(link.source_id) ?? 0) + 1);
    adjacency.set(link.target_id, (adjacency.get(link.target_id) ?? 0) + 1);
  }
  const observationById = new Map(observations.map((observation) => [`obs:${observation.id}`, observation]));
  const communityByObservationId = new Map<string, string>();
  const communities: AtlasCommunityProjection[] = components.map((memberIds) => {
    const id = deriveVisualizationId('community', memberIds.join('\0'));
    memberIds.forEach((memberId) => communityByObservationId.set(memberId, id));
    const members = memberIds.map((memberId) => observationById.get(memberId)!);
    const projectCount = new Set(members.map((member) => member.project).filter(Boolean)).size;
    const unclustered = memberIds.every((memberId) => (adjacency.get(memberId) ?? 0) === 0);
    const point = seedPoint(id);
    const presentation = fallbackCommunityPresentation(memberIds, observationById, evidence.presentationEvidence);
    return {
      id,
      member_ids: memberIds,
      unclustered,
      node: {
        id,
        kind: 'community',
        label: presentation.label,
        snippet: presentation.snippet,
        project: null,
        session: null,
        topic: null,
        type: null,
        community_id: id,
        member_count: memberIds.length,
        project_count: projectCount,
        unclustered,
        seed_x: point.x,
        seed_y: point.y,
      },
    };
  });

  const observationNodes = new Map<string, SemanticAtlasNode>();
  for (const observation of observations) {
    const id = `obs:${observation.id}`;
    observationNodes.set(id, observationNode(observation, communityByObservationId.get(id)!, input.facetCatalog));
  }

  const supportingNodes = new Map<string, SemanticAtlasNode>();
  const supportingEdges: SemanticAtlasEdge[] = [];
  const supportingNodeIdsByObservationId = new Map<string, string[]>();
  for (const fact of [...supportingFacts].sort((left, right) => (
    left.observation_id - right.observation_id
    || left.relation.localeCompare(right.relation)
    || left.object.localeCompare(right.object)
  ))) {
    const canonical = `${fact.relation}\0${fact.object.normalize('NFC')}`;
    const nodeId = deriveVisualizationId('fact', canonical);
    if (!supportingNodes.has(nodeId)) {
      const point = seedPoint(nodeId);
      supportingNodes.set(nodeId, {
        id: nodeId,
        kind: 'fact',
        label: safeText(fact.object) || 'Private supporting fact',
        snippet: `Supporting ${fact.relation.toLocaleLowerCase().replace(/_/g, ' ')}`,
        project: null,
        session: null,
        topic: null,
        type: null,
        community_id: null,
        member_count: null,
        project_count: null,
        unclustered: false,
        seed_x: point.x,
        seed_y: point.y,
      });
    }
    const observationId = `obs:${fact.observation_id}`;
    const nodeIds = supportingNodeIdsByObservationId.get(observationId) ?? [];
    if (!nodeIds.includes(nodeId)) nodeIds.push(nodeId);
    supportingNodeIdsByObservationId.set(observationId, nodeIds);
    supportingEdges.push({
      id: deriveVisualizationEdgeId(observationId, fact.relation, nodeId, 'atlas-support'),
      source_id: observationId,
      target_id: nodeId,
      kind: 'fact',
      relation: fact.relation,
      label: fact.relation,
      summary: 'Supporting evidence for this memory',
      weight: 1,
      evidence_count: 1,
    });
  }
  for (const nodeIds of supportingNodeIdsByObservationId.values()) nodeIds.sort();
  supportingEdges.sort((left, right) => left.id.localeCompare(right.id));

  const semanticEdges = evidence.links.map((link) => ({
    id: deriveVisualizationEdgeId(link.source_id, link.relations.join('+'), link.target_id, 'semantic-atlas'),
    source_id: link.source_id,
    target_id: link.target_id,
    kind: 'semantic' as const,
    relation: link.relations[0] ?? 'RELATED_MEMORY',
    label: link.relations.join(', ') || 'Related memory',
    summary: `${link.evidence_count} shared evidence ${link.evidence_count === 1 ? 'item' : 'items'}`,
    weight: link.weight,
    evidence_count: link.evidence_count,
  }));

  const aggregateByPair = new Map<string, { weight: number; evidenceCount: number; relations: Set<string> }>();
  for (const link of evidence.links) {
    const sourceCommunity = communityByObservationId.get(link.source_id)!;
    const targetCommunity = communityByObservationId.get(link.target_id)!;
    if (sourceCommunity === targetCommunity) continue;
    const [sourceId, targetId] = [sourceCommunity, targetCommunity].sort();
    const key = `${sourceId}\0${targetId}`;
    const aggregate = aggregateByPair.get(key) ?? { weight: 0, evidenceCount: 0, relations: new Set<string>() };
    aggregate.weight += link.weight;
    aggregate.evidenceCount += link.evidence_count;
    link.relations.forEach((relation) => aggregate.relations.add(relation));
    aggregateByPair.set(key, aggregate);
  }
  const aggregateEdges = [...aggregateByPair.entries()].map(([pair, aggregate]) => {
    const [sourceId, targetId] = pair.split('\0');
    const relations = [...aggregate.relations].sort();
    return {
      id: deriveVisualizationEdgeId(sourceId!, relations.join('+'), targetId!, 'atlas-aggregate'),
      source_id: sourceId!,
      target_id: targetId!,
      kind: 'aggregate' as const,
      relation: 'COMMUNITY_RELATED',
      label: 'Shared memory evidence',
      summary: `${aggregate.evidenceCount} relationships`,
      weight: Number(aggregate.weight.toFixed(6)),
      evidence_count: aggregate.evidenceCount,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));

  const types = [...new Set(observations.map((observation) => observation.type))].sort();
  const relations = [...new Set(input.structuralEvidence.map((item) => item.relation))].sort();
  const rawFacetEntities = new Set<string>();
  const rawReferenceEntities = new Set<string>();
  const rawRelationships = new Set<string>();
  for (const observation of observations) {
    if (observation.project) rawFacetEntities.add(`project\0${observation.project}`);
    rawFacetEntities.add(`session\0${observation.session_id}`);
    if (observation.topic_key) rawFacetEntities.add(`topic\0${observation.topic_key}`);
    rawRelationships.add(`obs:${observation.id}\0IN_SESSION\0session\0${observation.session_id}`);
    if (observation.project) rawRelationships.add(`obs:${observation.id}\0IN_PROJECT\0project\0${observation.project}`);
    if (observation.topic_key) rawRelationships.add(`obs:${observation.id}\0HAS_TOPIC_KEY\0topic\0${observation.topic_key}`);
  }
  for (const fact of input.facts) {
    if (fact.superseded === true || RAW_METADATA_RELATIONS.has(fact.relation)) continue;
    const reference = `${fact.relation}\0${fact.object.normalize('NFC')}`;
    rawReferenceEntities.add(reference);
    rawRelationships.add(`obs:${fact.observation_id}\0${reference}`);
  }

  return {
    observations,
    observationNodes,
    evidenceLinks: evidence.links,
    semanticEdges,
    supportingNodes,
    supportingEdges,
    supportingNodeIdsByObservationId,
    communities,
    communityByObservationId,
    aggregateEdges,
    facets: {
      projects: facetOptions(observations, 'project', 'project', input.facetCatalog),
      sessions: facetOptions(observations, 'session_id', 'session', input.facetCatalog),
      topics: facetOptions(observations, 'topic_key', 'topic', input.facetCatalog),
      types,
      relations,
    },
    observationsWithKg: evidence.observationsWithKg.size,
    supportingEntityCount: supportingNodes.size,
    rawEntityCount: observations.length + rawFacetEntities.size + rawReferenceEntities.size,
    rawRelationshipCount: rawRelationships.size,
  };
}
