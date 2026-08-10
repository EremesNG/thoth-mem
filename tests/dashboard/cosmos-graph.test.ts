import { describe, expect, it } from 'vitest';

import type { VizEdge, VizNode } from '../../dashboard/src/api/client.js';
import {
  buildCosmosGraphData,
  cosmosMotionConfig,
} from '../../dashboard/src/components/map/cosmos-graph-data.js';

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
    expect(graph.worldExtent).toMatchObject({ nodeCount: 3, communityCount: 1 });
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
