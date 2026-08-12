import type { AtlasLevel, VizEdge, VizNode } from '../../api/client.js';
import { buildCosmosGraphData, type CosmosGraphData } from './cosmos-graph-data.js';

export type CosmosGraphLevel = AtlasLevel | 'raw';

export interface CosmosGraphWorkerRequest {
  requestId: number;
  level: CosmosGraphLevel;
  generation: string;
  nodes: VizNode[];
  edges: VizEdge[];
  previousCommunityAnchorIds: string[];
}

export type CosmosGraphWorkerResponse =
  | {
      requestId: number;
      level: CosmosGraphLevel;
      generation: string;
      ok: true;
      graphData: CosmosGraphData;
    }
  | {
      requestId: number;
      level: CosmosGraphLevel;
      generation: string;
      ok: false;
      error: string;
    };

interface WorkerScope {
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<CosmosGraphWorkerRequest>) => void,
  ) => void;
  postMessage: (message: CosmosGraphWorkerResponse) => void;
}

export function prepareCosmosGraphWorkerResponse(
  request: CosmosGraphWorkerRequest,
): CosmosGraphWorkerResponse {
  try {
    return {
      requestId: request.requestId,
      level: request.level,
      generation: request.generation,
      ok: true,
      graphData: buildCosmosGraphData(
        request.nodes,
        request.edges,
        null,
        request.previousCommunityAnchorIds,
      ),
    };
  } catch (error) {
    return {
      requestId: request.requestId,
      level: request.level,
      generation: request.generation,
      ok: false,
      error: error instanceof Error ? error.message : 'Graph preparation failed.',
    };
  }
}

export function responseMatchesWorkerIdentity(
  response: CosmosGraphWorkerResponse,
  expected: Pick<CosmosGraphWorkerRequest, 'requestId' | 'level' | 'generation'>,
): boolean {
  return response.requestId === expected.requestId
    && response.level === expected.level
    && response.generation === expected.generation;
}

const workerScope = typeof self === 'undefined' ? null : self as unknown as WorkerScope;
workerScope?.addEventListener('message', (event) => {
  workerScope.postMessage(prepareCosmosGraphWorkerResponse(event.data));
});
