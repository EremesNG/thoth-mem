import { ApiError } from '../../api/client.js';
import type { SemanticAtlasPageResponse, VizDensityState, VizEdge, VizNode, VizSliceResponse } from '../../api/client.js';
import type { MapFilters } from './map-types.js';
import { presentStoredText } from '../safe-presentation.js';

export const DEFAULT_MAP_FILTERS: MapFilters = {
  project: '',
  sessionId: '',
  topicKey: '',
  type: '',
  relation: '',
  query: '',
  depth: 1,
  maxNodes: 120,
  maxEdges: 360,
  continuation: null,
};

export function isWorkspaceRoute(path: string): boolean {
  return path === '/' || path === '/observatory';
}

export function sanitizeMapText(value: string | null | undefined): string {
  return presentStoredText(value);
}

export function parseMapFilters(search: string): MapFilters {
  const params = new URLSearchParams(search);
  const numberParam = (key: string, fallback: number, min: number, max: number) => {
    const parsed = Number(params.get(key));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.round(parsed)));
  };

  return {
    ...DEFAULT_MAP_FILTERS,
    project: params.get('project') ?? '',
    sessionId: params.get('session_id') ?? '',
    topicKey: params.get('topic_key') ?? '',
    type: (params.get('type') as MapFilters['type']) ?? '',
    relation: params.get('relation') ?? '',
    query: params.get('q') ?? '',
    depth: numberParam('depth', DEFAULT_MAP_FILTERS.depth, 0, 4),
    maxNodes: numberParam('max_nodes', DEFAULT_MAP_FILTERS.maxNodes, 20, 500),
    maxEdges: numberParam('max_edges', DEFAULT_MAP_FILTERS.maxEdges, 20, 2000),
  };
}

export function serializeMapFilters(filters: MapFilters): string {
  const params = new URLSearchParams();
  if (filters.project) params.set('project', filters.project);
  if (filters.sessionId) params.set('session_id', filters.sessionId);
  if (filters.topicKey) params.set('topic_key', filters.topicKey);
  if (filters.type) params.set('type', filters.type);
  if (filters.relation) params.set('relation', filters.relation);
  if (filters.query) params.set('q', filters.query);
  if (filters.depth !== DEFAULT_MAP_FILTERS.depth) params.set('depth', String(filters.depth));
  params.set('max_nodes', String(filters.maxNodes));
  params.set('max_edges', String(filters.maxEdges));
  return params.toString();
}

export function mergeVizSlices(base: VizSliceResponse, incoming: VizSliceResponse): VizSliceResponse {
  const nodes = new Map<string, VizNode>();
  const edges = new Map<string, VizEdge>();

  for (const item of base.nodes) nodes.set(item.id, item);
  for (const item of incoming.nodes) nodes.set(item.id, item);
  for (const item of base.edges) edges.set(item.id, item);
  for (const item of incoming.edges) edges.set(item.id, item);

  const nodeIds = new Set(nodes.keys());

  return {
    ...incoming,
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()).filter((edge) => (
      nodeIds.has(edge.source_id) && nodeIds.has(edge.target_id)
    )),
  };
}

export function mergeSemanticAtlasPages(
  base: SemanticAtlasPageResponse,
  incoming: SemanticAtlasPageResponse,
): SemanticAtlasPageResponse {
  if (base.level !== incoming.level || base.generation !== incoming.generation) {
    throw new ApiError(409, 'Atlas generation changed', {
      code: 'VIZ_ATLAS_GENERATION_STALE',
      retryable: true,
    });
  }
  const nodes = new Map(base.nodes.map((node) => [node.id, node]));
  const edges = new Map(base.edges.map((edge) => [edge.id, edge]));
  incoming.nodes.forEach((node) => nodes.set(node.id, node));
  incoming.edges.forEach((edge) => edges.set(edge.id, edge));
  const nodeIds = new Set(nodes.keys());
  return {
    ...incoming,
    nodes: [...nodes.values()],
    edges: [...edges.values()].filter((edge) => (
      nodeIds.has(edge.source_id) && nodeIds.has(edge.target_id)
    )),
  };
}

export function semanticAtlasPageToVizSlice(
  page: SemanticAtlasPageResponse,
): VizSliceResponse & { atlas: Omit<SemanticAtlasPageResponse, 'nodes' | 'edges' | 'health'> } {
  const nodes: VizNode[] = page.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    label: sanitizeMapText(node.label),
    snippet: sanitizeMapText(node.snippet),
    project: node.project?.label ?? null,
    session_id: node.session?.label ?? null,
    topic_key: node.topic?.label ?? null,
    type: node.type,
    seed_x: node.seed_x,
    seed_y: node.seed_y,
    semantic_level: page.level,
    community_id: node.community_id,
    member_count: node.member_count,
    project_count: node.project_count,
    unclustered: node.unclustered,
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: VizEdge[] = page.edges
    .filter((edge) => nodeIds.has(edge.source_id) && nodeIds.has(edge.target_id))
    .map((edge) => ({
      id: edge.id,
      source_id: edge.source_id,
      target_id: edge.target_id,
      relation: edge.relation,
      kind: edge.kind,
      label: sanitizeMapText(edge.label),
      summary: sanitizeMapText(edge.summary),
      weight: edge.weight,
      evidence_count: edge.evidence_count,
    }));
  return {
    nodes,
    edges,
    state: nodes.length === 0 ? 'empty' : nodes.length >= 30 ? 'dense' : 'sparse',
    continuation: page.continuation,
    truncated: page.truncated,
    health: page.health,
    atlas: {
      level: page.level,
      generation: page.generation,
      counts: page.counts,
      coverage: page.coverage,
      facets: page.facets,
      navigation: page.navigation,
      continuation: page.continuation,
      truncated: page.truncated,
    },
  };
}

export function mergeVizSlicesWithOutcome(base: VizSliceResponse, incoming: VizSliceResponse) {
  const visibleNodes = new Set(base.nodes.map((node) => node.id));
  const addedNodeIds = incoming.nodes.filter((node) => !visibleNodes.has(node.id)).map((node) => node.id);
  const alreadyVisibleNodeIds = incoming.nodes.filter((node) => visibleNodes.has(node.id)).map((node) => node.id);
  return { slice: mergeVizSlices(base, incoming), addedNodeIds, alreadyVisibleNodeIds, continuation: incoming.continuation, exhausted: !incoming.continuation && addedNodeIds.length === 0 };
}

export function selectVisibleEdges(edges: VizEdge[], zoom: number, state: VizDensityState): VizEdge[] {
  if (state !== 'dense' || zoom >= 0.7 || edges.length <= 80) return edges;
  const stride = zoom < 0.4 ? 5 : 3;
  return edges.filter((edge, index) => index % stride === 0 || edge.kind === 'metadata');
}

export function toMapNodeUrl(node: VizNode): string | null {
  if (node.kind === 'observation') {
    const match = node.id.match(/(\d+)$/);
    return match ? `/observatory?surface=ledger&focus=obs%3A${match[1]}` : null;
  }
  if (node.kind === 'topic') {
    const topic = node.topic_key ?? node.id.replace(/^topic:/, '') ?? node.label;
    return topic ? `/observatory?surface=map&topic_key=${encodeURIComponent(topic)}` : '/observatory';
  }
  if (node.kind === 'session') {
    return `/observatory?surface=timeline&session_id=${encodeURIComponent(node.session_id ?? node.id.replace(/^session:/, ''))}`;
  }
  if (node.kind === 'project' && node.project) {
    return `/observatory?project=${encodeURIComponent(node.project)}`;
  }
  return null;
}
