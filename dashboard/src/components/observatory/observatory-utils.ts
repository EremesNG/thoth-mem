import type { ObservatoryScope, VizSliceResponse } from '../../api/client.js';
import type { MapData } from '../map/map-types.js';

export function nodeIdToObservationId(nodeId: string | null): number | null {
  if (!nodeId) return null;
  const match = nodeId.match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function scopeToMapParams(scope: ObservatoryScope): {
  project?: string;
  session_id?: string;
  topic_key?: string;
  type?: ObservatoryScope['type'];
  relation?: string;
  query?: string;
} {
  return {
    project: scope.project,
    session_id: scope.session_id,
    topic_key: scope.topic_key,
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
  return value.replace(/-/g, ' ');
}
