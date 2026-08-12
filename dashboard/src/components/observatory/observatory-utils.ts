import type { ObservatoryScope, VizSliceResponse } from '../../api/client.js';
import type { MapData } from '../map/map-types.js';

export function nodeIdToObservationId(nodeId: string | null): number | null {
  if (!nodeId) return null;
  const match = nodeId.match(/^obs:(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function scopeToMapParams(scope: ObservatoryScope): {
  project_token?: string;
  session_token?: string;
  topic_token?: string;
  type?: ObservatoryScope['type'];
  relation?: string;
  query?: string;
} {
  return {
    project_token: scope.project_token,
    session_token: scope.session_token,
    topic_token: scope.topic_token,
    type: scope.type ?? scope.observation_type,
    relation: scope.relation,
    query: scope.query,
  };
}

export function frontierToMapData(response: {
  nodes: VizSliceResponse['nodes'];
  edges: VizSliceResponse['edges'];
  health: VizSliceResponse['health'];
}): MapData {
  return {
    nodes: response.nodes,
    edges: response.edges,
    state: response.nodes.length === 0 ? 'empty' : response.nodes.length > 30 ? 'dense' : 'sparse',
    continuation: null,
    truncated: false,
    health: response.health,
  };
}

export function formatShortDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function readableLane(value: string): string {
  const labels: Record<string, string> = {
    lexical: 'Same words',
    'sentence-vector': 'Similar meaning',
    'chunk-vector': 'Related passages',
    'fact-kg': 'Connected facts',
  };
  return labels[value] ?? value.replace(/-/g, ' ');
}
