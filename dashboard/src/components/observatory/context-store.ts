import type { ObservatoryLane, ObservatoryScope } from '../../api/client.js';

export type ObservatorySurface = 'recall' | 'map' | 'timeline' | 'ledger' | 'health';

export interface ObservatoryState {
  scope: ObservatoryScope;
  contextToken: string | null;
  focusNodeId: string | null;
  activeSurface: ObservatorySurface;
  visibleNodeIds: string[];
  continuation: string | null;
  lanes: ObservatoryLane[];
}

export const DEFAULT_OBSERVATORY_LANES: ObservatoryLane[] = ['lexical', 'sentence-vector', 'chunk-vector', 'fact-kg'];
export const DEFAULT_OBSERVATORY_SURFACE: ObservatorySurface = 'map';

export function createInitialObservatoryState(): ObservatoryState {
  return {
    scope: {},
    contextToken: null,
    focusNodeId: null,
    activeSurface: DEFAULT_OBSERVATORY_SURFACE,
    visibleNodeIds: [],
    continuation: null,
    lanes: [...DEFAULT_OBSERVATORY_LANES],
  };
}

export function applyObservatoryScope(state: ObservatoryState, scope: ObservatoryScope, contextToken?: string): ObservatoryState {
  return {
    ...state,
    scope: { ...state.scope, ...scope },
    contextToken: contextToken ?? state.contextToken,
  };
}

export function applyObservatoryPivot(state: ObservatoryState, input: { contextToken: string; focusNodeId: string; scope?: ObservatoryScope }): ObservatoryState {
  return {
    ...state,
    contextToken: input.contextToken,
    focusNodeId: input.focusNodeId,
    scope: { ...state.scope, ...(input.scope ?? {}) },
  };
}

export function mergeVisibleNodeIds(state: ObservatoryState, nodeIds: string[]): ObservatoryState {
  const ids = new Set(state.visibleNodeIds);
  for (const nodeId of nodeIds) {
    ids.add(nodeId);
  }
  return {
    ...state,
    visibleNodeIds: Array.from(ids),
  };
}

export function parseObservatorySearch(search: string): Pick<ObservatoryState, 'scope' | 'focusNodeId' | 'activeSurface' | 'continuation'> {
  const params = new URLSearchParams(search);
  const surface = parseObservatorySurface(params.get('surface'));
  const scope: ObservatoryScope = {};

  const query = params.get('q') ?? params.get('query');
  const entries: Array<[keyof ObservatoryScope, string | null | undefined]> = [
    ['project', params.get('project')],
    ['session_id', params.get('session_id')],
    ['topic_key', params.get('topic_key') ?? params.get('topic_key_exact')],
    ['query', query],
    ['type', params.get('type') as ObservatoryScope['type'] | null],
    ['relation', params.get('relation')],
    ['time_from', params.get('time_from')],
    ['time_to', params.get('time_to')],
  ];

  for (const [key, value] of entries) {
    if (value) {
      scope[key] = value as never;
    }
  }

  return {
    scope,
    focusNodeId: params.get('focus') || null,
    activeSurface: surface,
    continuation: params.get('continuation'),
  };
}

export function serializeObservatoryState(state: ObservatoryState): string {
  const params = new URLSearchParams();
  if (state.activeSurface !== DEFAULT_OBSERVATORY_SURFACE) params.set('surface', state.activeSurface);
  if (state.focusNodeId) params.set('focus', state.focusNodeId);
  if (state.scope.project) params.set('project', state.scope.project);
  if (state.scope.session_id) params.set('session_id', state.scope.session_id);
  if (state.scope.topic_key) params.set('topic_key', state.scope.topic_key);
  if (state.scope.query) params.set('q', state.scope.query);
  if (state.scope.type) params.set('type', state.scope.type);
  if (state.scope.relation) params.set('relation', state.scope.relation);
  if (state.scope.time_from) params.set('time_from', state.scope.time_from);
  if (state.scope.time_to) params.set('time_to', state.scope.time_to);
  if (state.continuation) params.set('continuation', state.continuation);
  return params.toString();
}

export function buildObservatoryUrl(state: ObservatoryState, basePath = '/observatory'): string {
  const search = serializeObservatoryState(state);
  return `${basePath}${search ? `?${search}` : ''}`;
}

export function buildObservatoryUrlFromSearch(search: string, surface: ObservatorySurface): string {
  const parsed = parseObservatorySearch(search);
  return buildObservatoryUrl({
    ...createInitialObservatoryState(),
    ...parsed,
    activeSurface: surface,
  });
}

export function parseObservatorySurface(value: string | null): ObservatorySurface {
  if (value === 'recall' || value === 'map' || value === 'timeline' || value === 'ledger' || value === 'health') {
    return value;
  }
  return DEFAULT_OBSERVATORY_SURFACE;
}
