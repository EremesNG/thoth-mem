import { describe, expect, it } from 'vitest';

import type { SemanticAtlasPageResponse, VizEdge, VizNode, VizSliceResponse } from '../../dashboard/src/api/client.js';
import {
  mergeVizSlices,
  mergeVizSlicesWithOutcome,
  mergeSemanticAtlasPages,
  sanitizeMapText,
  selectVisibleEdges,
  semanticAtlasPageToVizSlice,
  toMapNodeUrl,
} from '../../dashboard/src/components/map/map-state.js';
import { refineProjection } from '../../dashboard/src/components/map/map-projection.js';
import { buildGraphNavigationIndex } from '../../dashboard/src/components/map/GraphNavigator.js';

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
  it('preserves semantic level identity, aggregate weights, and resets incompatible generations', () => {
    const semanticPage = (generation: string, ids: string[]): SemanticAtlasPageResponse => ({
      level: 'universe', generation,
      nodes: ids.map((id, index) => ({
        id, kind: 'community', label: id, snippet: id, project: null, session: null, topic: null, type: null,
        community_id: id, member_count: 100 + index, project_count: 2, unclustered: false, seed_x: index, seed_y: index,
      })),
      edges: ids.length > 1 ? [{ id:'aggregate:1', source_id:ids[0]!, target_id:ids[1]!, kind:'aggregate', relation:'COMMUNITY_RELATED', label:'Related', summary:'2 links', weight:2.5, evidence_count:2 }] : [],
      counts: { memory_count:200, project_count:2, community_count:2, assigned_memory_count:200, unclustered_memory_count:0, supporting_entity_count:2, relationship_count:1, raw_entity_count:500, raw_relationship_count:600 },
      coverage: { state:'fresh', projection_source:'deterministic-kg', summary_state:'missing', observations_with_kg:200, observations_without_kg:0, degraded_reasons:[] },
      facets: { projects:[], sessions:[], topics:[], types:[], relations:[] },
      navigation: { community_id:null, focus_node_id:null, depth:null, omitted_nodes:0, omitted_edges:0, raw_rich_render_safe:true, raw_rich_render_limit:5000, scope:{project:null,session:null,topic:null,type:null,relation:null} },
      continuation:null, truncated:false, health:{semantic_state:'ready',pending_jobs:0},
    });
    const first = semanticPage('g1', ['community:1']);
    const second = semanticPage('g1', ['community:1', 'community:2']);
    const merged = mergeSemanticAtlasPages(first, second);
    expect(merged.nodes.map(({ id }) => id)).toEqual(['community:1', 'community:2']);
    expect(merged.edges[0]).toMatchObject({ kind:'aggregate', weight:2.5 });
    const mapSlice = semanticAtlasPageToVizSlice(merged);
    expect(mapSlice.nodes[0]).toMatchObject({ kind:'community', member_count:100, semantic_level:'universe' });
    expect(mapSlice.edges[0]).toMatchObject({ kind:'aggregate', weight:2.5 });
    expect(() => mergeSemanticAtlasPages(merged, semanticPage('g2', ['community:3']))).toThrow(/generation/i);
  });
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

  it('keeps stable merge order and drops every edge whose endpoint is not merged', () => {
    const base = slice([node('obs:1')], [edge('dangling:base', 'obs:1', 'obs:missing')], 'next');
    const incoming = slice([node('obs:2'), node('obs:1', { label: 'Updated node' })], [
      edge('valid', 'obs:1', 'obs:2'),
      edge('dangling:incoming', 'obs:2', 'obs:future'),
    ]);

    const merged = mergeVizSlices(base, incoming);

    expect(merged.nodes.map(({ id }) => id)).toEqual(['obs:1', 'obs:2']);
    expect(merged.nodes[0].label).toBe('Updated node');
    expect(merged.edges.map(({ id }) => id)).toEqual(['valid']);
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

  it('indexes dense semantic navigation once with stable, endpoint-safe adjacency', () => {
    const nodes = Array.from({ length: 2_565 }, (_, index) => node(`obs:${index}`));
    const edges = Array.from({ length: 5_414 }, (_, index) => edge(
      `edge:${index}`,
      `obs:${index % nodes.length}`,
      `obs:${(index * 17 + 23) % nodes.length}`,
      index % 2 ? 'SUPPORTS' : 'RELATES_TO',
    ));
    edges.push(edge('edge:orphan', 'obs:1', 'obs:missing'));
    edges.push(edge('edge:self', 'obs:1', 'obs:1'));

    const index = buildGraphNavigationIndex(nodes, edges);

    expect(index.nodeIds).toEqual(nodes.map(({ id }) => id));
    expect(index.nodeById.size).toBe(nodes.length);
    expect(index.adjacency.get('obs:1')).not.toContain('obs:missing');
    expect(index.adjacency.get('obs:1')).not.toContain('obs:1');
    expect(new Set(index.adjacency.get('obs:1')).size).toBe(index.adjacency.get('obs:1')?.length);
    expect(index.adjacency.get('obs:1')).toEqual([...(index.adjacency.get('obs:1') ?? [])].sort());
    expect(index.relationByNodeId.get('obs:1')).toMatch(/SUPPORTS|RELATES_TO/);
  });

});
