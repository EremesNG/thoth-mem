import { describe, expect, it } from 'vitest';

import type { VizEdge, VizNode, VizSliceResponse } from '../../dashboard/src/api/client.js';
import {
  mergeVizSlices,
  mergeVizSlicesWithOutcome,
  sanitizeMapText,
  selectVisibleEdges,
  toMapNodeUrl,
} from '../../dashboard/src/components/map/map-state.js';
import { refineProjection } from '../../dashboard/src/components/map/map-projection.js';

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
  it('distinguishes added, overlapping, continuation, and exhausted repeated expansions', () => {
    const base=slice([node('obs:1')],[]);
    const added=mergeVizSlicesWithOutcome(base,slice([node('obs:1'),node('obs:2')],[edge('e1','obs:1','obs:2')],'next'));
    expect(added).toMatchObject({addedNodeIds:['obs:2'],alreadyVisibleNodeIds:['obs:1'],continuation:'next',exhausted:false});
    const overlap=mergeVizSlicesWithOutcome(added.slice,slice([node('obs:2')],[edge('e1','obs:1','obs:2')]));
    expect(overlap).toMatchObject({addedNodeIds:[],alreadyVisibleNodeIds:['obs:2'],exhausted:true});
    const third=mergeVizSlicesWithOutcome(overlap.slice,slice([node('obs:3')],[edge('e2','obs:2','obs:3')]));
    expect(third.slice.nodes.map((item)=>item.id)).toEqual(['obs:1','obs:2','obs:3']);
    expect(new Set(third.slice.edges.map((item)=>item.id)).size).toBe(2);
  });

  it('builds drilldown links for observation nodes only', () => {
    expect(toMapNodeUrl(node('obs:42'))).toBe('/observatory?surface=ledger&focus=obs%3A42');
    expect(toMapNodeUrl(node('topic:visual', { kind: 'topic', topic_key: null }))).toBe('/observatory?surface=map&topic_key=visual');
    expect(toMapNodeUrl(node('project:thoth-mem', { kind: 'project', project: 'thoth-mem' }))).toBe('/observatory?project=thoth-mem');
  });

});
