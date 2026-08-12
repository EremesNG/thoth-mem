import type { AtlasLevel, AtlasTokenScope, ObservatoryLane, ObservatoryScope } from '../../api/client.js';

export type ObservatorySurface = 'recall' | 'map' | 'timeline' | 'ledger' | 'health';

export interface ObservatoryLocation {
  level: AtlasLevel;
  communityId: string | null;
  focusNodeId: string | null;
}

export interface ObservatoryState {
  scope: ObservatoryScope;
  contextToken: string | null;
  level: AtlasLevel;
  communityId: string | null;
  focusNodeId: string | null;
  activeSurface: ObservatorySurface;
  visibleNodeIds: string[];
  continuation: string | null;
  lanes: ObservatoryLane[];
  density: 'focus' | 'balanced' | 'wide';
  focusTrail: string[];
  focusTrailIndex: number;
  locationTrail: ObservatoryLocation[];
  locationTrailIndex: number;
}

export const DEFAULT_OBSERVATORY_LANES: ObservatoryLane[] = ['lexical', 'sentence-vector', 'chunk-vector', 'fact-kg'];
export const DEFAULT_OBSERVATORY_SURFACE: ObservatorySurface = 'map';

export function createInitialObservatoryState(): ObservatoryState {
  return {
    scope: {},
    contextToken: null,
    level: 'universe',
    communityId: null,
    focusNodeId: null,
    activeSurface: DEFAULT_OBSERVATORY_SURFACE,
    visibleNodeIds: [],
    continuation: null,
    lanes: [...DEFAULT_OBSERVATORY_LANES],
    density: 'balanced',
    focusTrail: [],
    focusTrailIndex: -1,
    locationTrail: [],
    locationTrailIndex: -1,
  };
}

export function applyObservatoryScope(state: ObservatoryState, scope: ObservatoryScope, contextToken?: string): ObservatoryState {
  return {
    ...state,
    scope: { ...state.scope, ...scope },
    contextToken: contextToken ?? state.contextToken,
  };
}

export function applyObservatoryPivot(state: ObservatoryState, input: {
  contextToken?: string | null;
  level: AtlasLevel;
  communityId: string | null;
  focusNodeId: string | null;
  scope?: ObservatoryScope;
}): ObservatoryState {
  const location: ObservatoryLocation = input.level === 'universe'
    ? { level: 'universe', communityId: null, focusNodeId: null }
    : input.level === 'community'
      ? { level: 'community', communityId: input.communityId, focusNodeId: null }
      : { level: 'neighborhood', communityId: input.communityId, focusNodeId: input.focusNodeId };
  const currentLocation: ObservatoryLocation = {
    level: state.level,
    communityId: state.communityId,
    focusNodeId: state.focusNodeId,
  };
  const priorLocations = state.locationTrail.length > 0
    ? state.locationTrail.slice(0, state.locationTrailIndex + 1)
    : [currentLocation];
  const last = priorLocations[priorLocations.length - 1];
  const appendLocation = !last
    || last.level !== location.level
    || last.communityId !== location.communityId
    || last.focusNodeId !== location.focusNodeId;
  const locationTrail = (appendLocation ? [...priorLocations, location] : priorLocations).slice(-24);
  const nextFocusTrail = input.focusNodeId
    ? [...state.focusTrail.slice(0, state.focusTrailIndex + 1), input.focusNodeId].slice(-24)
    : state.focusTrail;
  return {
    ...state,
    contextToken: input.contextToken ?? state.contextToken,
    level: location.level,
    communityId: location.communityId,
    focusNodeId: location.focusNodeId,
    scope: { ...state.scope, ...(input.scope ?? {}) },
    focusTrail: nextFocusTrail,
    focusTrailIndex: input.focusNodeId ? nextFocusTrail.length - 1 : state.focusTrailIndex,
    locationTrail,
    locationTrailIndex: locationTrail.length - 1,
  };
}

export function observatoryScopeFromTokenScope(scope: AtlasTokenScope): ObservatoryScope {
  return {
    project_token: scope.project?.token,
    session_token: scope.session?.token,
    topic_token: scope.topic?.token,
    type: scope.type ?? undefined,
    relation: scope.relation ?? undefined,
    query: scope.query ?? undefined,
    time_from: scope.time_from ?? undefined,
    time_to: scope.time_to ?? undefined,
  };
}

export function navigateObservatoryTrail(state: ObservatoryState, delta: -1 | 1): ObservatoryState {
  const nextIndex = Math.max(0, Math.min(state.locationTrail.length - 1, state.locationTrailIndex + delta));
  const location = state.locationTrail[nextIndex];
  if (!location || nextIndex === state.locationTrailIndex) return state;
  return {
    ...state,
    ...location,
    locationTrailIndex: nextIndex,
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

export function parseObservatorySearch(search: string): Pick<ObservatoryState, 'scope' | 'level' | 'communityId' | 'focusNodeId' | 'activeSurface' | 'continuation' | 'density'> {
  const params = new URLSearchParams(search);
  const surface = parseObservatorySurface(params.get('surface'));
  const scope: ObservatoryScope = {};
  const hasRawFacet = params.has('project') || params.has('session_id') || params.has('topic_key') || params.has('topic_key_exact');

  const query = params.get('q') ?? params.get('query');
  const entries: Array<[keyof ObservatoryScope, string | null | undefined]> = [
    ['project_token', params.get('project_token')],
    ['session_token', params.get('session_token')],
    ['topic_token', params.get('topic_token')],
    ['query', query],
    ['type', params.get('type') as ObservatoryScope['type'] | null],
    ['relation', params.get('relation')],
    ['time_from', params.get('time_from')],
    ['time_to', params.get('time_to')],
  ];

  for (const [key, value] of entries) {
    if (value && !hasRawFacet) {
      scope[key] = value as never;
    }
  }

  const requestedLevel = params.get('level');
  const requestedCommunity = params.get('community');
  const requestedFocus = params.get('focus');
  const validCommunity = typeof requestedCommunity === 'string' && requestedCommunity.startsWith('community:');
  const validFocus = typeof requestedFocus === 'string' && /^obs:\d+$/.test(requestedFocus);
  const level: AtlasLevel = !hasRawFacet && requestedLevel === 'community' && validCommunity
    ? 'community'
    : !hasRawFacet && requestedLevel === 'neighborhood' && validCommunity && validFocus
      ? 'neighborhood'
      : 'universe';

  return {
    scope,
    level,
    communityId: level === 'universe' ? null : requestedCommunity,
    focusNodeId: level === 'neighborhood' ? requestedFocus : null,
    activeSurface: surface,
    continuation: params.get('continuation'),
    density: params.get('density') === 'focus' || params.get('density') === 'wide' ? params.get('density') as 'focus' | 'wide' : 'balanced',
  };
}

export function serializeObservatoryState(state: ObservatoryState): string {
  const params = new URLSearchParams();
  if (state.activeSurface !== DEFAULT_OBSERVATORY_SURFACE) params.set('surface', state.activeSurface);
  if (state.level !== 'universe') params.set('level', state.level);
  if (state.communityId) params.set('community', state.communityId);
  if (state.level === 'neighborhood' && state.focusNodeId) params.set('focus', state.focusNodeId);
  if (state.scope.project_token) params.set('project_token', state.scope.project_token);
  if (state.scope.session_token) params.set('session_token', state.scope.session_token);
  if (state.scope.topic_token) params.set('topic_token', state.scope.topic_token);
  if (state.scope.query) params.set('q', state.scope.query);
  if (state.scope.type) params.set('type', state.scope.type);
  if (state.scope.relation) params.set('relation', state.scope.relation);
  if (state.scope.time_from) params.set('time_from', state.scope.time_from);
  if (state.scope.time_to) params.set('time_to', state.scope.time_to);
  if (state.continuation) params.set('continuation', state.continuation);
  if (state.density !== 'balanced') params.set('density', state.density);
  return params.toString();
}

export function buildObservatoryUrl(state: ObservatoryState, basePath = '/'): string {
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

export function recoverObservatoryFocus(state: ObservatoryState, visibleNodeIds: string[]): ObservatoryState {
  if (!state.focusNodeId || visibleNodeIds.includes(state.focusNodeId)) return { ...state, visibleNodeIds };
  return {
    ...state,
    level: 'universe',
    communityId: null,
    focusNodeId: null,
    visibleNodeIds,
    focusTrail: [],
    focusTrailIndex: -1,
    locationTrail: [],
    locationTrailIndex: -1,
  };
}

export type InstrumentCache<T> = Record<Exclude<ObservatorySurface, 'map'>, T | null>;
export function createInstrumentCache<T>(): InstrumentCache<T> { return { recall: null, timeline: null, ledger: null, health: null }; }
export function retainInstrumentState<T>(cache: InstrumentCache<T>, surface: Exclude<ObservatorySurface, 'map'>, value: T): InstrumentCache<T> { return { ...cache, [surface]: value }; }
