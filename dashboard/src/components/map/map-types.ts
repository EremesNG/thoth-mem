import type {
  ObservationType,
  VizDensityState,
  VizEdge,
  VizHealthResponse,
  VizInspectEdgeResponse,
  VizInspectNodeResponse,
  VizNode,
  VizSliceResponse,
} from '../../api/client.js';

export type MapSelection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | null;

export interface MapFilters {
  project: string;
  sessionId: string;
  topicKey: string;
  type: ObservationType | '';
  relation: string;
  query: string;
  depth: number;
  maxNodes: number;
  maxEdges: number;
  continuation?: string | null;
}

export interface MapViewport {
  width: number;
  height: number;
  zoom: number;
  x: number;
  y: number;
}

export interface ProjectedNode extends VizNode {
  x: number;
  y: number;
  radius: number;
}

export interface ProjectedEdge extends VizEdge {
  source?: ProjectedNode;
  target?: ProjectedNode;
}

export interface MapData extends VizSliceResponse {
  health: VizHealthResponse;
}

export type InspectorDetails =
  | { kind: 'node'; details: VizInspectNodeResponse }
  | { kind: 'edge'; details: VizInspectEdgeResponse }
  | null;

export type { ObservationType, VizDensityState, VizEdge, VizNode, VizSliceResponse };
