import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { VizEdge, VizNode, VizSliceResponse } from '../../dashboard/src/api/client.js';
import {
  mergeVizSlices,
  sanitizeMapText,
  selectVisibleEdges,
  toMapNodeUrl,
} from '../../dashboard/src/components/map/map-state.js';
import { refineProjection } from '../../dashboard/src/components/map/map-projection.js';
import { hitTestEdge } from '../../dashboard/src/components/map/map-renderer.js';
import type { MapViewport, ProjectedNode } from '../../dashboard/src/components/map/map-types.js';

function node(id: string, overrides: Partial<VizNode> = {}): VizNode {
  return {
    id,
    kind: 'observation',
    label: `Node ${id}`,
    snippet: `Snippet ${id}`,
    project: 'thoth-mem',
    topic_key: 'topic',
    type: 'decision',
    seed_x: id.charCodeAt(id.length - 1) * 13,
    seed_y: id.charCodeAt(0) * 17,
    ...overrides,
  };
}

function edge(id: string, sourceId: string, targetId: string, relation = 'HAS_TOPIC_KEY'): VizEdge {
  return {
    id,
    source_id: sourceId,
    target_id: targetId,
    relation,
    label: relation,
    summary: `Summary ${id}`,
  };
}

function projectedNode(id: string, x: number, y: number, overrides: Partial<VizNode> = {}): ProjectedNode {
  return {
    ...node(id, overrides),
    x,
    y,
    radius: 8,
  };
}

function slice(nodes: VizNode[], edges: VizEdge[], continuation: string | null = null): VizSliceResponse {
  return {
    nodes,
    edges,
    state: nodes.length === 0 ? 'empty' : nodes.length > 30 ? 'dense' : 'sparse',
    continuation,
    truncated: continuation !== null,
    health: { semantic_state: 'ready', pending_jobs: 0 },
  };
}

describe('map workspace behavior helpers', () => {
  it('sanitizes private tags from labels, snippets, and inspector summaries', () => {
    expect(sanitizeMapText('visible <private>secret token</private> tail')).toBe('visible tail');
    expect(sanitizeMapText('visible [private]secret token[/private] tail')).toBe('visible tail');
    expect(sanitizeMapText('visible <PRIVATE>secret token</PRIVATE> tail')).toBe('visible tail');
  });

  it('refines seed projection deterministically without mutating API nodes', () => {
    const nodes = [node('obs:1'), node('obs:2'), node('topic:a', { kind: 'topic' })];
    const edges = [edge('e1', 'obs:1', 'topic:a'), edge('e2', 'obs:2', 'topic:a')];

    const first = refineProjection(nodes, edges, { width: 800, height: 500 });
    const second = refineProjection(nodes, edges, { width: 800, height: 500 });

    expect(first).toEqual(second);
    expect(first.every((item) => Number.isFinite(item.x) && Number.isFinite(item.y))).toBe(true);
    expect(nodes[0]).not.toHaveProperty('x');
  });

  it('thins dense edges when zoomed out but keeps sparse graphs readable', () => {
    const nodes = Array.from({ length: 40 }, (_, index) => node(`obs:${index}`));
    const denseEdges = Array.from({ length: 120 }, (_, index) => edge(`edge:${index}`, `obs:${index % 40}`, `obs:${(index + 3) % 40}`));

    expect(selectVisibleEdges(denseEdges, 0.35, 'dense').length).toBeLessThan(denseEdges.length);
    expect(selectVisibleEdges(denseEdges.slice(0, 8), 0.35, 'sparse').length).toBe(8);
  });

  it('hit-tests the nearest edge using screen coordinates and viewport transform', () => {
    const nodes = [
      projectedNode('obs:a', 0, 0),
      projectedNode('obs:b', 100, 0),
      projectedNode('obs:c', 0, 80),
      projectedNode('obs:d', 100, 80),
    ];
    const edges = [edge('edge:near', 'obs:a', 'obs:b'), edge('edge:far', 'obs:c', 'obs:d')];
    const viewport: MapViewport = { width: 300, height: 180, zoom: 2, x: 20, y: 30 };

    expect(hitTestEdge(edges, nodes, { x: 120, y: 35 }, viewport, 'sparse')?.id).toBe('edge:near');
    expect(hitTestEdge(edges, nodes, { x: 120, y: 52 }, viewport, 'sparse')).toBeNull();
  });

  it('hit-tests only visible dense edges after zoom-based thinning', () => {
    const nodes = [
      projectedNode('obs:visible-a', 0, 0),
      projectedNode('obs:visible-b', 100, 0),
      projectedNode('obs:hidden-a', 0, 40),
      projectedNode('obs:hidden-b', 100, 40),
      ...Array.from({ length: 82 }, (_, index) => projectedNode(`obs:filler-${index}`, 300 + index * 2, 300)),
    ];
    const edges = [
      edge('edge:visible', 'obs:visible-a', 'obs:visible-b'),
      edge('edge:hidden', 'obs:hidden-a', 'obs:hidden-b'),
      ...Array.from({ length: 82 }, (_, index) => edge(`edge:filler-${index}`, `obs:filler-${index}`, `obs:filler-${(index + 1) % 82}`)),
    ];
    const viewport: MapViewport = { width: 500, height: 500, zoom: 0.35, x: 0, y: 0 };

    expect(hitTestEdge(edges, nodes, { x: 18, y: 0 }, viewport, 'dense')?.id).toBe('edge:visible');
    expect(hitTestEdge(edges, nodes, { x: 18, y: 14 }, viewport, 'dense')).toBeNull();
  });

  it('merges neighbor expansion slices without duplicating existing nodes or edges', () => {
    const base = slice([node('obs:1'), node('topic:a', { kind: 'topic' })], [edge('e1', 'obs:1', 'topic:a')], 'next');
    const expansion = slice([node('obs:1'), node('obs:2'), node('topic:a', { kind: 'topic' })], [
      edge('e1', 'obs:1', 'topic:a'),
      edge('e2', 'obs:2', 'topic:a'),
    ]);

    const merged = mergeVizSlices(base, expansion);

    expect(merged.nodes.map((item) => item.id)).toEqual(['obs:1', 'topic:a', 'obs:2']);
    expect(merged.edges.map((item) => item.id)).toEqual(['e1', 'e2']);
    expect(merged.continuation).toBeNull();
  });

  it('builds drilldown links for observation nodes only', () => {
    expect(toMapNodeUrl(node('obs:42'))).toBe('/observatory?surface=ledger&focus=obs%3A42');
    expect(toMapNodeUrl(node('topic:visual', { kind: 'topic', topic_key: null }))).toBe('/observatory?surface=map&topic_key=visual');
    expect(toMapNodeUrl(node('project:thoth-mem', { kind: 'project', project: 'thoth-mem' }))).toBe('/observatory?project=thoth-mem');
  });

  it('ships the connected operations console surfaces and reduced-motion guard', () => {
    const css = readFileSync('dashboard/src/index.css', 'utf8');
    const app = readFileSync('dashboard/src/App.tsx', 'utf8');

    expect(app).toContain('motion/react');
    expect(app).toContain('RetrievalWorkspace');
    expect(app).toContain('OperationsWorkspace');
    expect(app).toContain('TracesWorkspace');
    expect(app).toContain('IndexingWorkspace');
    expect(app).toContain('GraphWorkspace');
    expect(app).toContain('getOperationTraces');
    expect(app).toContain('rebuildIndex');
    expect(app).toContain('rebuildGraph');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('button:focus-visible');
    expect(css).toContain('.rail-nav');
    expect(css).toContain('.trace-row.active');
    expect(css).toContain('.graph-stage');
  });
});
