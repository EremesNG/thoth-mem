import { describe, expect, it } from 'vitest';

import type { VizEdge, VizNode } from '../../dashboard/src/api/client.js';
import {
  buildCosmosGraphData,
  cosmosMotionConfig,
  focusCosmosGraphData,
  focusRegionCosmosGraphData,
  semanticLayoutIdentityFromPresentation,
} from '../../dashboard/src/components/map/cosmos-graph-data.js';
import {
  prepareCosmosGraphWorkerResponse,
  responseMatchesWorkerIdentity,
} from '../../dashboard/src/components/map/cosmos-graph-worker.js';
import {
  isSemanticCameraSnapshotRestorable,
  semanticZoomBand,
  visibleSemanticRelationshipIndices,
} from '../../dashboard/src/components/map/cosmos-graph-runtime.js';
import { buildGraphNavigationIndex } from '../../dashboard/src/components/map/GraphNavigator.js';

const nodes: VizNode[] = [
  {
    id: 'obs:7',
    kind: 'observation',
    label: 'Visible <private>hidden memory</private>',
    snippet: 'A useful memory',
    project: 'thoth-mem',
    topic_key: 'dashboard/ux',
    type: 'decision',
    seed_x: 0.2,
    seed_y: 0.4,
  },
  {
    id: 'topic:dashboard/ux',
    kind: 'topic',
    label: 'Dashboard UX',
    snippet: '',
    project: 'thoth-mem',
    topic_key: 'dashboard/ux',
    type: null,
    seed_x: 0.55,
    seed_y: 0.2,
  },
  {
    id: 'project:thoth-mem',
    kind: 'project',
    label: 'thoth-mem',
    snippet: '',
    project: 'thoth-mem',
    topic_key: null,
    type: null,
    seed_x: 0.8,
    seed_y: 0.65,
  },
];

describe('semantic zoom bands', () => {
  it('keeps relationship class, direction, confidence, evidence, and provenance in accessible navigation', () => {
    const edge: VizEdge = {
      id: 'edge:semantic', source_id: 'obs:7', target_id: 'topic:dashboard/ux', relation: 'USES',
      kind: 'semantic', label: 'Uses', summary: 'Evidence', weight: 1, evidence_count: 3,
      tier: 'representative-semantic', relationship_class: 'semantic', direction: 'directed',
      confidence: 'high', provenance: [{ source_kind: 'kg-triple', source_id: 'evidence:uses', relation: 'USES', evidence_count: 3, confidence: 'high' }],
    };
    expect(buildGraphNavigationIndex(nodes, [edge]).relationByNodeId.get('obs:7')).toContain(
      'semantic relationship, directed direction, high confidence, 3 evidence items, provenance kg-triple',
    );
  });
  it('progressively discloses a bounded relevance-ranked relationship subset', () => {
    const denseEdges = Array.from({ length: 384 }, (_, index): VizEdge => ({
      id: `edge:${index}`, source_id: 'obs:7', target_id: 'topic:dashboard/ux', relation: 'USES',
      kind: 'semantic', label: 'Related', summary: 'Evidence', weight: 384 - index,
      evidence_count: 1 + (index % 5), tier: index < 20 ? 'representative-backbone' : 'representative-semantic',
      relationship_class: 'semantic', direction: 'undirected', confidence: index % 4 === 0 ? 'high' : 'medium', provenance: [],
    }));
    const overview = visibleSemanticRelationshipIndices({ edges: denseEdges }, 'community', 'overview');
    const exploration = visibleSemanticRelationshipIndices({ edges: denseEdges }, 'community', 'exploration');
    const neighborhood = visibleSemanticRelationshipIndices({ edges: denseEdges }, 'neighborhood', 'exploration');
    expect(overview).toHaveLength(10);
    expect(exploration.length).toBeGreaterThan(overview.length);
    expect(exploration.length).toBeLessThan(384);
    expect(exploration).toHaveLength(14);
    expect(neighborhood).toHaveLength(5);
  });
  it('keeps inter-region evidence in the model while painting only short local community currents', () => {
    const semanticNodes = [
      { ...nodes[0]!, region_id: 'region:a' },
      { ...nodes[1]!, region_id: 'region:a' },
      { ...nodes[2]!, region_id: 'region:b' },
    ];
    const local = { ...edges[0]!, id: 'local', source_id: semanticNodes[0]!.id, target_id: semanticNodes[1]!.id, tier: 'representative-backbone' as const };
    const crossing = { ...edges[0]!, id: 'crossing', source_id: semanticNodes[0]!.id, target_id: semanticNodes[2]!.id, tier: 'representative-backbone' as const };
    expect(visibleSemanticRelationshipIndices({ nodes: semanticNodes, edges: [local, crossing] }, 'community', 'exploration')).toEqual([0]);
  });
  it('uses 1.55 enter and 1.35 exit hysteresis without flicker', () => {
    expect(semanticZoomBand('overview', 1.54)).toBe('overview');
    expect(semanticZoomBand('overview', 1.55)).toBe('exploration');
    expect(semanticZoomBand('exploration', 1.4)).toBe('exploration');
    expect(semanticZoomBand('exploration', 1.34)).toBe('overview');
  });
});

const edges: VizEdge[] = [
  {
    id: 'edge:topic',
    source_id: 'obs:7',
    target_id: 'topic:dashboard/ux',
    relation: 'HAS_TOPIC_KEY',
    kind: 'metadata',
    label: 'HAS_TOPIC_KEY',
    summary: 'Memory belongs to topic',
  },
  {
    id: 'edge:project',
    source_id: 'obs:7',
    target_id: 'project:thoth-mem',
    relation: 'IN_PROJECT',
    kind: 'semantic',
    label: 'IN_PROJECT',
    summary: 'Memory belongs to project',
  },
  {
    id: 'edge:orphan',
    source_id: 'obs:missing',
    target_id: 'obs:7',
    relation: 'SUPPORTS',
    kind: 'semantic',
    label: 'SUPPORTS',
    summary: 'Missing endpoint',
  },
];

describe('Cosmos graph data boundary', () => {
  it('builds stable semantic arrays and a deterministic focus neighborhood', () => {
    const graph = buildCosmosGraphData(nodes, edges, 'obs:7');

    expect(graph.pointIds).toEqual(['obs:7', 'topic:dashboard/ux', 'project:thoth-mem']);
    expect(graph.pointLabels).toEqual(['Visible', 'Dashboard UX', 'thoth-mem']);
    expect(graph.pointKinds).toEqual(['observation', 'topic', 'project']);
    expect(graph.pointPositions).toHaveLength(6);
    expect(graph.pointPositions.every(Number.isFinite)).toBe(true);
    expect(graph.pointDegrees).toEqual([2, 1, 1]);
    expect(graph.pointShapes).toEqual([0, 0, 0]);
    expect(graph.linkIds).toEqual(['edge:topic', 'edge:project']);
    expect(graph.links).toEqual([0, 1, 0, 2]);
    expect(graph.linkArrows).toEqual([true, true]);
    expect(graph.focus).toEqual({
      pointIndex: 0,
      neighborPointIndices: [1, 2],
      linkIndices: [0, 1],
    });
    expect(new Set(graph.pointCommunities).size).toBe(1);
    expect(new Set(graph.pointColors).size).toBe(1);
    expect(graph.pointSizes[0]).toBeGreaterThan(graph.pointSizes[1]);
    expect(graph.linkWidths).toEqual([0.8, 1.15]);
    expect(graph.pointSizes.every((size) => size >= 3 && size <= 8)).toBe(true);
    expect(graph.clusterCenters).toHaveLength(2);
    expect(graph.clusterStrengths).toHaveLength(nodes.length);
    expect(graph.communityAnchorIds).toEqual(['obs:7']);
    expect(graph.communityAnchorIndices).toEqual([0]);
    expect(graph.extentAnchorIds.length).toBeGreaterThanOrEqual(2);
    expect(graph.extentAnchorIds.length).toBeLessThanOrEqual(4);
    expect(graph.extentAnchorIndices.map((index) => graph.pointIds[index])).toEqual(graph.extentAnchorIds);
    expect(graph.worldExtent).toMatchObject({ nodeCount: 3, communityCount: 1 });
  });

  it('projects focus without rebuilding prepared graph geometry', () => {
    const prepared = buildCosmosGraphData(nodes, edges, null);
    const focused = focusCosmosGraphData(prepared, 'obs:7');

    expect(focused).not.toBe(prepared);
    expect(focused.pointPositions).toBe(prepared.pointPositions);
    expect(focused.pointCommunities).toBe(prepared.pointCommunities);
    expect(focused.links).toBe(prepared.links);
    expect(focused.focus).toEqual({
      pointIndex: 0,
      neighborPointIndices: [1, 2],
      linkIndices: [0, 1],
    });
    expect(focusCosmosGraphData(focused, null).focus).toBeNull();
  });

  it('creates deterministic visual communities and scales neuron size by connectivity', () => {
    const communityNodes: VizNode[] = [
      ...nodes,
      { ...nodes[0], id: 'obs:8', label: 'Second cluster memory', topic_key: 'second', seed_x: 0.15 },
      { ...nodes[1], id: 'topic:second', label: 'Second cluster', topic_key: 'second', seed_x: 0.25 },
      { ...nodes[0], id: 'obs:isolated', label: 'Isolated memory', topic_key: null, seed_x: 0.95 },
    ];
    const communityEdges: VizEdge[] = [
      ...edges.slice(0, 2),
      { ...edges[0], id: 'edge:second', source_id: 'obs:8', target_id: 'topic:second' },
    ];

    const first = buildCosmosGraphData(communityNodes, communityEdges, null);
    const second = buildCosmosGraphData(communityNodes, communityEdges, null);

    expect(first.pointCommunities).toEqual(second.pointCommunities);
    expect(first.pointColors).toEqual(second.pointColors);
    expect(first.pointCommunities[0]).toBe(first.pointCommunities[1]);
    expect(first.pointCommunities[3]).toBe(first.pointCommunities[4]);
    expect(first.pointCommunities[0]).not.toBe(first.pointCommunities[3]);
    expect(first.pointCommunities[3]).not.toBe(first.pointCommunities[5]);
    expect(first.pointSizes[0]).toBeGreaterThan(first.pointSizes[3]);
    expect(first.pointSizes[3]).toBeGreaterThan(first.pointSizes[5]);
  });

  it('keeps hubs at stellar scale while retaining a bounded connectivity hierarchy', () => {
    const hub = { ...nodes[0], id: 'obs:hub', label: 'Hub memory', seed_x: 0 };
    const leaves = Array.from({ length: 64 }, (_, index): VizNode => ({
      ...nodes[0],
      id: `obs:leaf:${index}`,
      label: `Leaf ${index}`,
      seed_x: index + 1,
      seed_y: (index % 7) - 3,
    }));
    const hubEdges = leaves.map((leaf, index): VizEdge => ({
      ...edges[1],
      id: `edge:hub:${index}`,
      source_id: hub.id,
      target_id: leaf.id,
    }));

    const graph = buildCosmosGraphData([hub, ...leaves], hubEdges, hub.id);
    const sorted = [...graph.pointSizes].sort((left, right) => left - right);
    const median = sorted[Math.floor(sorted.length / 2)];

    expect(median).toBeLessThanOrEqual(8);
    expect(Math.max(...graph.pointSizes)).toBeLessThanOrEqual(8);
    expect(graph.pointSizes[0]).toBeGreaterThan(graph.pointSizes[1]);
    expect(graph.pointLabels.join(' ')).not.toContain('hidden memory');
    expect(graph.worldExtent.width / graph.worldExtent.height).toBeGreaterThan(2);
  });

  it('keeps each pinned community anchor stable as incremental page prefixes change degree rankings', () => {
    const prefixNodes: VizNode[] = [
      { ...nodes[0], id: 'obs:anchor', label: 'Original anchor', topic_key: 'stable-community' },
      { ...nodes[0], id: 'obs:leaf', label: 'First leaf', topic_key: 'stable-community' },
    ];
    const prefixEdges: VizEdge[] = [{
      ...edges[1],
      id: 'edge:prefix',
      source_id: 'obs:anchor',
      target_id: 'obs:leaf',
    }];
    const prefix = buildCosmosGraphData(prefixNodes, prefixEdges, null);
    const expandedNodes: VizNode[] = [
      ...prefixNodes,
      { ...nodes[0], id: 'obs:new-hub', label: 'Later high-degree memory', topic_key: 'stable-community' },
      ...Array.from({ length: 8 }, (_, index): VizNode => ({
        ...nodes[0],
        id: `obs:new-leaf:${index}`,
        label: `Later leaf ${index}`,
        topic_key: 'stable-community',
      })),
    ];
    const expandedEdges: VizEdge[] = [
      ...prefixEdges,
      ...Array.from({ length: 8 }, (_, index): VizEdge => ({
        ...edges[1],
        id: `edge:later:${index}`,
        source_id: 'obs:new-hub',
        target_id: `obs:new-leaf:${index}`,
      })),
    ];

    const withoutHistory = buildCosmosGraphData(expandedNodes, expandedEdges, null);
    const withHistory = buildCosmosGraphData(
      expandedNodes,
      expandedEdges,
      null,
      prefix.communityAnchorIds,
    );

    expect(prefix.communityAnchorIds).toEqual(['obs:anchor']);
    expect(withoutHistory.communityAnchorIds).toEqual(['obs:new-hub']);
    expect(withHistory.communityAnchorIds).toEqual(prefix.communityAnchorIds);
    expect(withHistory.pointIds[withHistory.communityAnchorIndices[0]]).toBe('obs:anchor');
  });

  it('selects a bounded deterministic set of anchors on every world edge', () => {
    const prefixNodes = nodes.slice(0, 2);
    const prefixEdges = edges.slice(0, 1);
    const prefix = buildCosmosGraphData(prefixNodes, prefixEdges, null);
    const repeatedPrefix = buildCosmosGraphData(prefixNodes, prefixEdges, null);
    const first = buildCosmosGraphData(nodes, edges, null);
    const second = buildCosmosGraphData(nodes, edges, null);
    const coordinates = first.extentAnchorIndices.map((index) => ({
      x: first.pointPositions[index * 2],
      y: first.pointPositions[index * 2 + 1],
    }));
    const xs = first.pointPositions.filter((_value, index) => index % 2 === 0);
    const ys = first.pointPositions.filter((_value, index) => index % 2 === 1);

    expect(prefix.extentAnchorIds).toEqual(repeatedPrefix.extentAnchorIds);
    expect(prefix.extentAnchorIndices).toEqual(repeatedPrefix.extentAnchorIndices);
    expect(first.extentAnchorIds).toEqual(second.extentAnchorIds);
    expect(first.extentAnchorIds.length).toBeGreaterThanOrEqual(2);
    expect(first.extentAnchorIds.length).toBeLessThanOrEqual(4);
    expect(coordinates.some(({ x }) => x === Math.min(...xs))).toBe(true);
    expect(coordinates.some(({ x }) => x === Math.max(...xs))).toBe(true);
    expect(coordinates.some(({ y }) => y === Math.min(...ys))).toBe(true);
    expect(coordinates.some(({ y }) => y === Math.max(...ys))).toBe(true);
  });

  it('retains every dense point and link identity without visual thinning', () => {
    const denseNodes = Array.from({ length: 512 }, (_, index): VizNode => ({
      ...nodes[0],
      id: `obs:dense:${index}`,
      label: `Dense memory ${index}`,
      topic_key: `dense/community-${index % 12}`,
      seed_x: index % 64,
      seed_y: Math.floor(index / 64),
    }));
    const denseEdges = Array.from({ length: 1_024 }, (_, index): VizEdge => ({
      ...edges[1],
      id: `edge:dense:${index}`,
      source_id: denseNodes[index % denseNodes.length].id,
      target_id: denseNodes[(index * 17 + 23) % denseNodes.length].id,
    }));

    const graph = buildCosmosGraphData(denseNodes, denseEdges, null);

    expect(graph.pointIds).toEqual(denseNodes.map((node) => node.id));
    expect(graph.linkIds).toEqual(denseEdges.map((edge) => edge.id));
    expect(graph.links).toHaveLength(denseEdges.length * 2);
    expect(graph.communityAnchorIds).toHaveLength(12);
  });

  it('preserves server-owned galaxies and scales semantic marks by level evidence', () => {
    const universeNodes: VizNode[] = [
      {
        ...nodes[0],
        id: 'community:small',
        kind: 'community',
        label: 'Small constellation',
        semantic_level: 'universe',
        community_id: 'community:small',
        member_count: 100,
        project_count: 3,
        project: null,
        topic_key: null,
      },
      {
        ...nodes[0],
        id: 'community:large',
        kind: 'community',
        label: 'Large constellation',
        semantic_level: 'universe',
        community_id: 'community:large',
        member_count: 1_000,
        project_count: 12,
        project: null,
        topic_key: null,
      },
    ];
    const universeEdges: VizEdge[] = [{
      ...edges[1],
      id: 'aggregate:small-large',
      source_id: 'community:small',
      target_id: 'community:large',
      kind: 'aggregate',
      relation: 'RELATED_COMMUNITIES',
      label: 'Related constellations',
      weight: 64,
      evidence_count: 64,
    }];

    const first = buildCosmosGraphData(universeNodes, universeEdges, 'community:small');
    const repeated = buildCosmosGraphData(universeNodes, universeEdges, 'community:small');

    expect(first.pointCommunityKeys).toEqual(['community:small', 'community:large']);
    expect(first.pointCommunities[0]).not.toBe(first.pointCommunities[1]);
    expect(first.pointSizes[1]).toBeGreaterThan(first.pointSizes[0]);
    expect(first.pointSizes.every((size) => size >= 4 && size <= 12)).toBe(true);
    expect(first.linkWidths[0]).toBeGreaterThan(1.15);
    expect(first.focus?.pointIndex).toBe(0);
    expect(first.pointCommunityKeys).toEqual(repeated.pointCommunityKeys);
    expect(first.pointSizes).toEqual(repeated.pointSizes);
    expect(first.linkWidths).toEqual(repeated.linkWidths);
    expect(first.regionKind).toBeNull();
  });

  it('keys semantic camera preservation to the exact project-owned location', () => {
    const projectUniverse = buildCosmosGraphData([
      { ...nodes[0], id: 'community:a', kind: 'community', semantic_level: 'universe', community_id: 'community:a', owner_project_id: 'project:alpha' },
      { ...nodes[0], id: 'community:b', kind: 'community', semantic_level: 'universe', community_id: 'community:b', owner_project_id: 'project:beta' },
    ], [], null);
    const pageAIdentity = semanticLayoutIdentityFromPresentation('project', JSON.stringify({
      hierarchy: 'project', level: 'project', project: 'project:alpha', pageCursor: null,
      generation: 'g1', region: null, focus: null,
      request: JSON.stringify({ hierarchy: 'project', level: 'project', project_id: 'project:alpha', page_size: 150 }),
    }));
    const pageBIdentity = semanticLayoutIdentityFromPresentation('project', JSON.stringify({
      hierarchy: 'project', level: 'project', project: 'project:alpha', pageCursor: 'cursor:b',
      generation: 'g2', region: null, focus: null,
      request: JSON.stringify({ hierarchy: 'project', level: 'project', project_id: 'project:alpha', page_size: 150, cursor: 'cursor:b' }),
    }));
    const regionIdentity = semanticLayoutIdentityFromPresentation('community', JSON.stringify({
      hierarchy: 'project', level: 'community', project: 'project:alpha', pageCursor: null,
      generation: 'g1', region: 'region:a', focus: null,
      request: JSON.stringify({ hierarchy: 'project', level: 'community', project_id: 'project:alpha', community_id: 'community:a', region_id: 'region:a' }),
    }));
    const baseCommunityIdentity = semanticLayoutIdentityFromPresentation('community', JSON.stringify({
      hierarchy: 'project', level: 'community', project: 'project:alpha', pageCursor: null,
      generation: 'g2', region: null, focus: null,
      request: JSON.stringify({ hierarchy: 'project', level: 'community', project_id: 'project:alpha', community_id: 'community:a' }),
    }));
    const alpha = buildCosmosGraphData([
      { ...nodes[0], id: 'community:a', kind: 'community', semantic_level: 'project', community_id: 'community:a', owner_project_id: 'project:alpha' },
    ], [], null, [], pageAIdentity);
    const alphaPageB = buildCosmosGraphData([
      { ...nodes[0], id: 'community:a2', kind: 'community', semantic_level: 'project', community_id: 'community:a2', owner_project_id: 'project:alpha' },
    ], [], null, [], pageBIdentity);
    const beta = buildCosmosGraphData([
      { ...nodes[0], id: 'community:b', kind: 'community', semantic_level: 'project', community_id: 'community:b', owner_project_id: 'project:beta' },
    ], [], null);
    const focusedRegion = focusRegionCosmosGraphData(buildCosmosGraphData([
      { ...nodes[0], id: 'obs:a', semantic_level: 'community', community_id: 'community:a', region_id: 'region:a' },
      { ...nodes[0], id: 'obs:b', semantic_level: 'community', community_id: 'community:a', region_id: 'region:b' },
    ], [], null, [], baseCommunityIdentity), 'region:a');

    expect(projectUniverse.pointCommunityKeys).toEqual(['project:alpha', 'project:beta']);
    expect(projectUniverse.regionKind).toBe('project');
    expect(projectUniverse.pointColors[0]).not.toBe(projectUniverse.pointColors[1]);
    expect(alpha.layoutIdentity).not.toBe(beta.layoutIdentity);
    expect(decodeURIComponent(alpha.layoutIdentity)).toContain('project:alpha');
    expect(alpha.layoutIdentity).not.toBe(alphaPageB.layoutIdentity);
    expect(regionIdentity).toBe(baseCommunityIdentity);
    expect(focusedRegion.layoutIdentity).toBe(baseCommunityIdentity);
    expect(focusedRegion.preserveReplacementPositions).toBe(false);
    expect(focusedRegion.regionKind).toBe('community');
  });

  it('restores only finite intersecting semantic camera snapshots owned by the exact location', () => {
    const snapshot = {
      layoutIdentity: 'community:location:a',
      centerX: 0,
      centerY: 0,
      zoom: 2,
      worldExtent: { minX: -100, minY: -100, maxX: 100, maxY: 100, width: 200, height: 200 },
      userCameraInteracted: true,
    };
    const nextExtent = { ...snapshot.worldExtent, nodeCount: 2, communityCount: 1 };

    expect(isSemanticCameraSnapshotRestorable(snapshot, 'community:location:a', nextExtent, { width: 100, height: 80 })).toBe(true);
    expect(isSemanticCameraSnapshotRestorable(snapshot, 'community:location:b', nextExtent, { width: 100, height: 80 })).toBe(false);
    expect(isSemanticCameraSnapshotRestorable({ ...snapshot, centerX: Number.NaN }, 'community:location:a', nextExtent, { width: 100, height: 80 })).toBe(false);
    expect(isSemanticCameraSnapshotRestorable({ ...snapshot, centerX: 1_000 }, 'community:location:a', nextExtent, { width: 100, height: 80 })).toBe(false);
  });

  it('echoes semantic level generations through deterministic worker preparation', () => {
    const request = {
      requestId: 12,
      level: 'universe' as const,
      generation: 'atlas-generation-a',
      layoutIdentity: 'universe:page:a',
      nodes: [{
        ...nodes[0],
        id: 'community:one',
        kind: 'community' as const,
        semantic_level: 'universe' as const,
        community_id: 'community:one',
        member_count: 320,
      }],
      edges: [],
      previousCommunityAnchorIds: [],
    };

    const first = prepareCosmosGraphWorkerResponse(request);
    const repeated = prepareCosmosGraphWorkerResponse(request);

    expect(first).toEqual(repeated);
    expect(first).toMatchObject({
      requestId: 12,
      level: 'universe',
      generation: 'atlas-generation-a',
      layoutIdentity: 'universe:page:a',
      ok: true,
    });
    expect(responseMatchesWorkerIdentity(first, request)).toBe(true);
    expect(responseMatchesWorkerIdentity(first, {
      ...request,
      generation: 'atlas-generation-b',
    })).toBe(false);
    expect(responseMatchesWorkerIdentity(first, {
      ...request,
      level: 'community',
    })).toBe(false);
    expect(responseMatchesWorkerIdentity(first, {
      ...request,
      layoutIdentity: 'universe:page:b',
    })).toBe(false);
  });

  it('carries Community region anchors and relationship tiers through the worker boundary', () => {
    const response = prepareCosmosGraphWorkerResponse({
      requestId: 13, level: 'community', generation: 'semantic-region-generation',
      layoutIdentity: 'community:one',
      nodes: [
        { ...nodes[0], id: 'obs:1', semantic_level: 'community', community_id: 'community:one', region_id: 'region:a' },
        { ...nodes[0], id: 'obs:2', semantic_level: 'community', community_id: 'community:one', region_id: 'region:b' },
      ],
      edges: [{ id: 'edge:region', source_id: 'obs:1', target_id: 'obs:2', relation: 'USES', kind: 'semantic', label: 'Related', summary: 'Safe', tier: 'representative-semantic', relationship_class: 'semantic', direction: 'undirected', confidence: 'high', evidence_count: 2, provenance: [] }],
      previousCommunityAnchorIds: [],
    });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.graphData.pointCommunityKeys).toEqual(['region:a', 'region:b']);
    expect(response.graphData.edges[0]).toMatchObject({ tier: 'representative-semantic', confidence: 'high' });
    expect(JSON.stringify(response)).not.toMatch(/private|canonical facet/i);
  });

  it('removes activation timing when reduced motion is requested', () => {
    expect(cosmosMotionConfig(false)).toEqual({
      transitionDuration: 640,
      activationStepMs: 80,
      initialSettleMs: 900,
    });
    expect(cosmosMotionConfig(true)).toEqual({
      transitionDuration: 0,
      activationStepMs: 0,
      initialSettleMs: 0,
    });
  });
});
