import type { VizDensityState, VizEdge, VizNode, VizSliceResponse } from '../../api/client.js';
import type { MapFilters } from './map-types.js';

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
  if (!value) return '';

  return value
    .replace(/<private>[\s\S]*?<\/private>/gi, ' ')
    .replace(/\[private\][\s\S]*?\[\/private\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

  return {
    ...incoming,
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
  };
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
