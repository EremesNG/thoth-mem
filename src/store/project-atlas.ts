import { createHash } from 'node:crypto';
import { stripPrivateTags } from '../utils/privacy.js';
import type {
  AtlasCommunityProjection,
  AtlasEvidenceLink,
  AtlasFacetCatalog,
  SemanticAtlasProjection,
} from './semantic-atlas.js';
import {
  boundSemanticAtlasCommunities,
  partitionObservationCommunities,
  seedSemanticAtlasPoint,
} from './semantic-atlas.js';
import type {
  AtlasFacetRef,
  Observation,
  SemanticAtlasEdge,
  SemanticAtlasNode,
  SemanticAtlasProjectBridge,
  SemanticAtlasProjectRegion,
  SemanticAtlasRelationshipDirection,
  SemanticAtlasRelationshipProvenance,
} from './types.js';
import { deriveVisualizationEdgeId, deriveVisualizationId } from './visualization-identity.js';

const UNASSIGNED_PROJECT_KEY = 'semantic-atlas-unassigned-project-v1';

export interface ProjectAtlasCommunity extends AtlasCommunityProjection {
  project_id: string;
}

export interface ProjectAtlasProject {
  id: string;
  canonical_project: string | null;
  label: string;
  summary: string;
  unassigned: boolean;
  communities: ProjectAtlasCommunity[];
  projection: SemanticAtlasProjection;
  region: SemanticAtlasProjectRegion;
}

export interface ProjectAtlasProjection {
  projects: ProjectAtlasProject[];
  projectById: Map<string, ProjectAtlasProject>;
  projectByObservationId: Map<string, string>;
  communityById: Map<string, ProjectAtlasCommunity>;
  communityByObservationId: Map<string, string>;
  projectBridges: SemanticAtlasProjectBridge[];
}

function safeProjectLabel(value: string | null): string {
  return stripPrivateTags(value ?? '').replace(/\s+/g, ' ').trim();
}

function projectGroupKey(observation: Observation): string {
  const value = observation.project?.normalize('NFC').trim() ?? '';
  return value && safeProjectLabel(value) ? value : UNASSIGNED_PROJECT_KEY;
}

function projectIdentity(canonicalProject: string | null): string {
  return deriveVisualizationId(
    'project',
    canonicalProject === null ? UNASSIGNED_PROJECT_KEY : `semantic-atlas-project-v1\0${canonicalProject}`,
  );
}

function communityIdentity(projectId: string, memberIds: string[]): string {
  return deriveVisualizationId(
    'community',
    `semantic-atlas-project-community-v1\0${projectId}\0${memberIds.join('\0')}`,
  );
}

function directionFor(values: Set<SemanticAtlasRelationshipDirection>): SemanticAtlasRelationshipDirection {
  if (values.size === 0) return 'unknown';
  if (values.size === 1) return [...values][0]!;
  return 'mixed';
}

function confidenceFor(evidenceCount: number): 'high' | 'medium' | 'low' {
  return evidenceCount >= 4 ? 'high' : evidenceCount >= 2 ? 'medium' : 'low';
}

function aggregateCommunityEdges(
  links: AtlasEvidenceLink[],
  communityByObservationId: Map<string, string>,
): SemanticAtlasEdge[] {
  const aggregates = new Map<string, {
    weight: number;
    evidenceCount: number;
    relations: Set<string>;
    directions: Set<SemanticAtlasRelationshipDirection>;
    provenance: Map<string, SemanticAtlasRelationshipProvenance>;
  }>();
  for (const link of links) {
    const sourceCommunity = communityByObservationId.get(link.source_id);
    const targetCommunity = communityByObservationId.get(link.target_id);
    if (!sourceCommunity || !targetCommunity || sourceCommunity === targetCommunity) continue;
    const [sourceId, targetId] = [sourceCommunity, targetCommunity].sort();
    const key = `${sourceId}\0${targetId}`;
    const aggregate = aggregates.get(key) ?? {
      weight: 0,
      evidenceCount: 0,
      relations: new Set<string>(),
      directions: new Set<SemanticAtlasRelationshipDirection>(),
      provenance: new Map<string, SemanticAtlasRelationshipProvenance>(),
    };
    aggregate.weight += link.weight;
    aggregate.evidenceCount += link.evidence_count;
    link.relations.forEach((relation) => aggregate.relations.add(relation));
    aggregate.directions.add(link.direction);
    link.provenance.forEach((item) => aggregate.provenance.set(item.source_id, item));
    aggregates.set(key, aggregate);
  }
  return [...aggregates.entries()].map(([key, aggregate]) => {
    const [sourceId, targetId] = key.split('\0') as [string, string];
    const relations = [...aggregate.relations].sort();
    return {
      id: deriveVisualizationEdgeId(sourceId, relations.join('+'), targetId, 'project-community-aggregate'),
      source_id: sourceId,
      target_id: targetId,
      kind: 'aggregate',
      relation: 'COMMUNITY_RELATED',
      label: 'Shared memory evidence',
      summary: `${aggregate.evidenceCount} relationships`,
      weight: Number(aggregate.weight.toFixed(6)),
      evidence_count: aggregate.evidenceCount,
      tier: 'representative-semantic',
      relationship_class: 'aggregate',
      direction: directionFor(aggregate.directions),
      confidence: confidenceFor(aggregate.evidenceCount),
      provenance: [...aggregate.provenance.values()]
        .sort((left, right) => left.source_id.localeCompare(right.source_id))
        .slice(0, 5),
    } satisfies SemanticAtlasEdge;
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function buildProjectProjection(input: {
  projectId: string;
  observations: Observation[];
  globalProjection: SemanticAtlasProjection;
  catalog: AtlasFacetCatalog;
}): { projection: SemanticAtlasProjection; communities: ProjectAtlasCommunity[] } {
  const observationIds = input.observations.map((observation) => `obs:${observation.id}`).sort();
  const observationIdSet = new Set(observationIds);
  const links = input.globalProjection.evidenceLinks.filter((link) => (
    observationIdSet.has(link.source_id) && observationIdSet.has(link.target_id)
  ));
  const groups = boundSemanticAtlasCommunities(
    partitionObservationCommunities(observationIds, links),
    observationIds.length,
  );
  const adjacency = new Map<string, number>();
  for (const link of links) {
    adjacency.set(link.source_id, (adjacency.get(link.source_id) ?? 0) + 1);
    adjacency.set(link.target_id, (adjacency.get(link.target_id) ?? 0) + 1);
  }
  const projectRef: AtlasFacetRef | null = input.observations[0]?.project
    ? input.catalog.refsByValue.project.get(input.observations[0].project.normalize('NFC')) ?? null
    : null;
  const communityByObservationId = new Map<string, string>();
  const communities = groups.map((memberIds, communityIndex): ProjectAtlasCommunity => {
    const id = communityIdentity(input.projectId, memberIds);
    memberIds.forEach((memberId) => communityByObservationId.set(memberId, id));
    const point = seedSemanticAtlasPoint(id);
    const unclustered = memberIds.every((memberId) => (adjacency.get(memberId) ?? 0) === 0);
    return {
      id,
      project_id: input.projectId,
      member_ids: memberIds,
      unclustered,
      node: {
        id,
        kind: 'community',
        label: `Constellation ${String(communityIndex + 1).padStart(2, '0')}`,
        snippet: `${memberIds.length} ${memberIds.length === 1 ? 'memory' : 'memories'}`,
        project: projectRef,
        session: null,
        topic: null,
        type: null,
        community_id: id,
        owner_project_id: input.projectId,
        member_count: memberIds.length,
        project_count: projectRef ? 1 : 0,
        unclustered,
        seed_x: point.x,
        seed_y: point.y,
      },
    };
  });
  const observationNodes = new Map<string, SemanticAtlasNode>();
  for (const memberId of observationIds) {
    const source = input.globalProjection.observationNodes.get(memberId)!;
    observationNodes.set(memberId, {
      ...source,
      owner_project_id: input.projectId,
      community_id: communityByObservationId.get(memberId)!,
    });
  }
  const semanticEdges = input.globalProjection.semanticEdges.filter((edge) => (
    observationIdSet.has(edge.source_id) && observationIdSet.has(edge.target_id)
  ));
  const semanticEdgesByNodeId = new Map<string, SemanticAtlasEdge[]>();
  for (const edge of semanticEdges) {
    for (const nodeId of [edge.source_id, edge.target_id]) {
      const edges = semanticEdgesByNodeId.get(nodeId) ?? [];
      edges.push(edge);
      semanticEdgesByNodeId.set(nodeId, edges);
    }
  }
  const supportingNodeIdsByObservationId = new Map<string, string[]>();
  const supportingEdgesByObservationId = new Map<string, SemanticAtlasEdge[]>();
  for (const observationId of observationIds) {
    supportingNodeIdsByObservationId.set(
      observationId,
      [...(input.globalProjection.supportingNodeIdsByObservationId.get(observationId) ?? [])],
    );
    supportingEdgesByObservationId.set(
      observationId,
      [...(input.globalProjection.supportingEdgesByObservationId.get(observationId) ?? [])],
    );
  }
  const supportingNodeIds = new Set([...supportingNodeIdsByObservationId.values()].flat());
  const supportingNodes = new Map(
    [...input.globalProjection.supportingNodes.entries()]
      .filter(([id]) => supportingNodeIds.has(id))
      .map(([id, node]) => [id, { ...node, owner_project_id: input.projectId }] as const),
  );
  const supportingEdges = [...supportingEdgesByObservationId.values()].flat();
  return {
    communities,
    projection: {
      ...input.globalProjection,
      observations: input.observations,
      observationNodes,
      evidenceLinks: links,
      semanticEdges,
      semanticEdgesByNodeId,
      supportingNodes,
      supportingEdges,
      supportingEdgesByObservationId,
      supportingNodeIdsByObservationId,
      communities,
      communityByObservationId,
      aggregateEdges: aggregateCommunityEdges(links, communityByObservationId),
      observationsWithKg: observationIds.filter((id) => (
        (input.globalProjection.supportingNodeIdsByObservationId.get(id)?.length ?? 0) > 0
      )).length,
    },
  };
}

export function buildProjectAtlasProjection(input: {
  globalProjection: SemanticAtlasProjection;
  facetCatalog: AtlasFacetCatalog;
}): ProjectAtlasProjection {
  const grouped = new Map<string, Observation[]>();
  for (const observation of input.globalProjection.observations) {
    const key = projectGroupKey(observation);
    const observations = grouped.get(key) ?? [];
    observations.push(observation);
    grouped.set(key, observations);
  }
  const projects = [...grouped.entries()].map(([key, observations]): ProjectAtlasProject => {
    const unassigned = key === UNASSIGNED_PROJECT_KEY;
    const canonicalProject = unassigned ? null : key;
    const id = projectIdentity(canonicalProject);
    const safeLabel = unassigned
      ? 'Unassigned'
      : (input.facetCatalog.refsByValue.project.get(key)?.label ?? safeProjectLabel(key)) || 'Unassigned';
    const { projection, communities } = buildProjectProjection({
      projectId: id,
      observations: [...observations].sort((left, right) => left.id - right.id),
      globalProjection: input.globalProjection,
      catalog: input.facetCatalog,
    });
    const point = seedSemanticAtlasPoint(id);
    const summary = `${observations.length} ${observations.length === 1 ? 'memory' : 'memories'} · ${communities.length} ${communities.length === 1 ? 'constellation' : 'constellations'}`;
    return {
      id,
      canonical_project: canonicalProject,
      label: safeLabel,
      summary,
      unassigned,
      communities,
      projection,
      region: {
        id,
        label: safeLabel,
        summary,
        memory_count: observations.length,
        constellation_count: communities.length,
        visible_constellation_count: 0,
        omitted_constellation_count: communities.length,
        constellation_ids: [],
        seed_x: point.x,
        seed_y: point.y,
        unassigned,
      },
    };
  }).sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
  const projectsByLabel = new Map<string, ProjectAtlasProject[]>();
  for (const project of projects) {
    const duplicates = projectsByLabel.get(project.label) ?? [];
    duplicates.push(project);
    projectsByLabel.set(project.label, duplicates);
  }
  for (const duplicates of projectsByLabel.values()) {
    if (duplicates.length < 2) continue;
    duplicates.sort((left, right) => left.id.localeCompare(right.id)).forEach((project, index) => {
      project.label = `${project.label} · ${String(index + 1).padStart(2, '0')}`;
      project.region.label = project.label;
    });
  }
  projects.sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
  const projectByObservationId = new Map<string, string>();
  const communityByObservationId = new Map<string, string>();
  const communityById = new Map<string, ProjectAtlasCommunity>();
  for (const project of projects) {
    for (const community of project.communities) {
      communityById.set(community.id, community);
      for (const memberId of community.member_ids) {
        projectByObservationId.set(memberId, project.id);
        communityByObservationId.set(memberId, community.id);
      }
    }
  }
  const projectBridgesByPair = new Map<string, {
    weight: number;
    evidenceCount: number;
    relations: Set<string>;
    directions: Set<SemanticAtlasRelationshipDirection>;
    provenance: Map<string, SemanticAtlasRelationshipProvenance>;
    edgeIds: Set<string>;
  }>();
  for (const link of input.globalProjection.evidenceLinks) {
    const sourceProject = projectByObservationId.get(link.source_id);
    const targetProject = projectByObservationId.get(link.target_id);
    if (!sourceProject || !targetProject || sourceProject === targetProject) continue;
    const [sourceId, targetId] = [sourceProject, targetProject].sort();
    const key = `${sourceId}\0${targetId}`;
    const aggregate = projectBridgesByPair.get(key) ?? {
      weight: 0,
      evidenceCount: 0,
      relations: new Set<string>(),
      directions: new Set<SemanticAtlasRelationshipDirection>(),
      provenance: new Map<string, SemanticAtlasRelationshipProvenance>(),
      edgeIds: new Set<string>(),
    };
    aggregate.weight += link.weight;
    aggregate.evidenceCount += link.evidence_count;
    link.relations.forEach((relation) => aggregate.relations.add(relation));
    aggregate.directions.add(link.direction);
    link.provenance.forEach((item) => aggregate.provenance.set(item.source_id, item));
    aggregate.edgeIds.add(deriveVisualizationEdgeId(link.source_id, link.relations.join('+'), link.target_id, 'semantic-atlas'));
    projectBridgesByPair.set(key, aggregate);
  }
  const projectBridges = [...projectBridgesByPair.entries()].map(([key, aggregate]) => {
    const [sourceId, targetId] = key.split('\0') as [string, string];
    const relations = [...aggregate.relations].sort();
    return {
      id: deriveVisualizationId('edge', `project-bridge-v1\0${sourceId}\0${targetId}\0${relations.join('\0')}`),
      source_project_id: sourceId,
      target_project_id: targetId,
      tier: 'project-aggregate',
      relationship_class: 'aggregate',
      direction: directionFor(aggregate.directions),
      weight: Number(aggregate.weight.toFixed(6)),
      evidence_count: aggregate.evidenceCount,
      relations,
      confidence: confidenceFor(aggregate.evidenceCount),
      representative_edge_ids: [...aggregate.edgeIds].sort().slice(0, 5),
      provenance: [...aggregate.provenance.values()]
        .sort((left, right) => left.source_id.localeCompare(right.source_id))
        .slice(0, 5),
    } satisfies SemanticAtlasProjectBridge;
  }).sort((left, right) => left.id.localeCompare(right.id));
  return {
    projects,
    projectById: new Map(projects.map((project) => [project.id, project])),
    projectByObservationId,
    communityById,
    communityByObservationId,
    projectBridges,
  };
}

export function projectAtlasFingerprint(projection: ProjectAtlasProjection): string {
  const hash = createHash('sha256').update('project-atlas-v1\0');
  for (const project of projection.projects) {
    hash.update(project.id);
    for (const community of project.communities) {
      hash.update(community.id);
      hash.update(community.member_ids.join('\0'));
    }
  }
  return hash.digest('hex');
}
