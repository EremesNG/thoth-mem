import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, RotateCcw, Search } from 'lucide-react';

import { api } from '../../api/client.js';
import type {
  AtlasLevel,
  ObservatoryContextResponse,
  ObservatoryFrontierState,
  ObservatoryLedgerResponse,
  ObservatoryRecallResponse,
  ObservatoryScope,
  ObservatoryTimelineResponse,
  SemanticAtlasPageRequest,
  SemanticAtlasPageResponse,
  VizHealthResponse,
} from '../../api/client.js';
import type { MapData, MapSelection } from '../map/map-types.js';
import type { MapCanvasRenderCommit } from '../map/MapCanvas.js';
import { connectedNodeIds, connectedObservationIds, graphCommandForKey, type GraphCommand, type GraphViewportCommand } from '../map/map-navigation.js';
import { semanticAtlasPageToVizSlice } from '../map/map-state.js';
import { presentStoredText } from '../safe-presentation.js';
import AtlasDock from './AtlasDock.js';
import AtlasDiagnostics from './AtlasDiagnostics.js';
import AtlasScopePanel from './AtlasScopePanel.js';
import InstrumentDock from './InstrumentDock.js';
import MemoryMapSurface from './MemoryMapSurface.js';
import MemoryOverview from './MemoryOverview.js';
import RegionOverview from './RegionOverview.js';
import NeuralAtlasWorkspace from './NeuralAtlasWorkspace.js';
import {
  applyObservatoryPivot,
  applyObservatoryScope,
  buildObservatoryUrl,
  createInitialObservatoryState,
  navigateObservatoryTrail,
  observatoryScopeFromTokenScope,
  parseObservatorySearch,
  returnObservatoryToUniverse,
  serializeObservatoryState,
  type ObservatoryLocation,
  type ObservatoryState,
  type ObservatorySurface,
} from './context-store.js';
import { nodeIdToObservationId, scopeToMapParams } from './observatory-utils.js';
import { loadFullAtlas, type FullAtlasSnapshot } from './full-atlas-loader.js';
import {
  loadSemanticAtlas,
  type SemanticAtlasSnapshot,
} from './semantic-atlas-loader.js';

const INITIAL_ATLAS_SNAPSHOT: SemanticAtlasSnapshot = {
  phase: 'initial',
  data: null,
  continuation: null,
  pagesLoaded: 0,
  restartCount: 0,
  error: null,
  errorCode: null,
  recoveryLevel: null,
};

const INITIAL_RAW_SNAPSHOT: FullAtlasSnapshot = {
  phase: 'initial',
  data: null,
  continuation: null,
  pagesLoaded: 0,
  restartCount: 0,
  error: null,
  errorCode: null,
};

interface SemanticAtlasPrefetchEntry {
  controller: AbortController;
  generation: string;
  promise: Promise<SemanticAtlasPageResponse | null>;
  response?: SemanticAtlasPageResponse | null;
}

function semanticAtlasRequestCacheKey(request: SemanticAtlasPageRequest): string {
  return JSON.stringify(Object.fromEntries(
    Object.entries(request).sort(([left], [right]) => left.localeCompare(right)),
  ));
}

function initialStateFromLocation(): ObservatoryState {
  const parsed = parseObservatorySearch(window.location.search);
  return {
    ...createInitialObservatoryState(),
    ...parsed,
    scope: parsed.scope,
    locationTrail: [{
      hierarchy: parsed.hierarchy,
      level: parsed.level,
      projectId: parsed.projectId,
      communityId: parsed.communityId,
      regionId: parsed.regionId,
      focusNodeId: parsed.focusNodeId,
      pageCursor: parsed.pageCursor,
    }],
    locationTrailIndex: 0,
  };
}

function pageSizeFor(level: AtlasLevel, density: ObservatoryState['density'], hierarchy: ObservatoryState['hierarchy']): number {
  if (hierarchy === 'project') return level === 'universe' ? 24 : 150;
  if (level === 'project') return 150;
  if (level === 'neighborhood') return 180;
  if (density === 'focus') return 120;
  if (density === 'wide') return 500;
  return 250;
}

function semanticAtlasRequestForState(state: ObservatoryState): SemanticAtlasPageRequest {
  return {
    ...scopeToMapParams(state.scope),
    hierarchy: state.hierarchy,
    level: state.level,
    ...(state.projectId ? { project_id: state.projectId } : {}),
    ...(state.communityId ? { community_id: state.communityId } : {}),
    ...(state.level === 'community' ? { presentation: 'semantic-zoom' as const } : {}),
    ...(state.regionId ? { region_id: state.regionId } : {}),
    ...(state.focusNodeId ? { focus_node_id: state.focusNodeId } : {}),
    ...(state.level === 'neighborhood' ? { depth: 2 as const } : {}),
    page_size: pageSizeFor(state.level, state.density, state.hierarchy),
  };
}

function sameLocation(left: ObservatoryLocation, right: ObservatoryLocation): boolean {
  return left.hierarchy === right.hierarchy
    && left.level === right.level
    && left.projectId === right.projectId
    && left.communityId === right.communityId
    && left.regionId === right.regionId
    && left.focusNodeId === right.focusNodeId
    && left.pageCursor === right.pageCursor;
}

export default function ObservatoryWorkspace() {
  const [state, setState] = useState<ObservatoryState>(initialStateFromLocation);
  const [presentedState, setPresentedState] = useState<ObservatoryState>(initialStateFromLocation);
  const [context, setContext] = useState<ObservatoryContextResponse | null>(null);
  const [presentedContext, setPresentedContext] = useState<ObservatoryContextResponse | null>(null);
  const [recall, setRecall] = useState<ObservatoryRecallResponse | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [presentedMapData, setPresentedMapData] = useState<MapData | null>(null);
  const [timeline, setTimeline] = useState<ObservatoryTimelineResponse | null>(null);
  const [ledger, setLedger] = useState<ObservatoryLedgerResponse | null>(null);
  const [health, setHealth] = useState<VizHealthResponse | null>(null);
  const [frontier, setFrontier] = useState<ObservatoryFrontierState | null>(null);
  const [presentedFrontier, setPresentedFrontier] = useState<ObservatoryFrontierState | null>(null);
  const [localSelection, setLocalSelection] = useState<MapSelection>(null);
  const [loading, setLoading] = useState({
    context: true,
    recall: false,
    map: true,
    timeline: false,
    ledger: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [instrumentErrors, setInstrumentErrors] = useState<Partial<Record<ObservatorySurface, string>>>({});
  const [atlasRetryKey, setAtlasRetryKey] = useState(0);
  const [atlasLoad, setAtlasLoad] = useState<SemanticAtlasSnapshot>(INITIAL_ATLAS_SNAPSHOT);
  const [rendererCommit, setRendererCommit] = useState<MapCanvasRenderCommit | null>(null);
  const [rawLoad, setRawLoad] = useState<FullAtlasSnapshot>(INITIAL_RAW_SNAPSHOT);
  const [diagnosticMode, setDiagnosticMode] = useState<'semantic' | 'loading' | 'raw' | 'refused' | 'error'>('semantic');
  const [rawError, setRawError] = useState<string | null>(null);
  const [graphCommand, setGraphCommand] = useState<{ id: number; type: GraphViewportCommand } | null>(null);
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [lensOpen, setLensOpen] = useState(() => {
    const initial = initialStateFromLocation();
    return initial.activeSurface !== 'map' || initial.level === 'neighborhood';
  });
  const atlasRequestRef = useRef(0);
  const rawRequestRef = useRef(0);
  const rawControllerRef = useRef<AbortController | null>(null);
  const diagnosticModeRef = useRef(diagnosticMode);
  const contextRequestRef = useRef(0);
  const instrumentRequestRef = useRef({ recall: 0, timeline: 0, ledger: 0, health: 0 });
  const historyRef = useRef(serializeObservatoryState(initialStateFromLocation()));
  const initialUrlCanonicalizedRef = useRef(false);
  const restoringHistoryRef = useRef<string | null>(null);
  const atlasResumeRef = useRef<{
    requestKey: string;
    data: NonNullable<SemanticAtlasSnapshot['data']>;
    continuation: string;
  } | null>(null);
  const semanticAtlasPrefetchRef = useRef(new Map<string, SemanticAtlasPrefetchEntry>());
  const semanticAtlasGenerationRef = useRef<string | null>(null);
  const atlasRequestValueRef = useRef<SemanticAtlasPageRequest>({ hierarchy: 'project', level: 'universe', page_size: 24 });
  const stateRef = useRef(state);
  const presentedStateRef = useRef(presentedState);
  const mapDataRef = useRef(mapData);
  const presentedMapDataRef = useRef(presentedMapData);
  const atlasLoadRef = useRef(atlasLoad);
  const contextRef = useRef(context);
  const frontierRef = useRef(frontier);
  const pendingLensOpenRef = useRef<boolean | null>(null);

  const rendererSelection = useMemo<MapSelection>(
    () => localSelection ?? (state.focusNodeId ? { kind: 'node', id: state.focusNodeId } : null),
    [localSelection, state.focusNodeId],
  );
  const presentedSelection = useMemo<MapSelection>(
    () => localSelection ?? (presentedState.focusNodeId ? { kind: 'node', id: presentedState.focusNodeId } : null),
    [localSelection, presentedState.focusNodeId],
  );
  const selectedNodeId = presentedSelection?.kind === 'node' ? presentedSelection.id : presentedState.focusNodeId;
  const commandNodeId = rendererSelection?.kind === 'node' ? rendererSelection.id : selectedNodeId;
  const serializedState = useMemo(() => serializeObservatoryState(presentedState), [presentedState]);
  const atlasRequest = useMemo<SemanticAtlasPageRequest>(() => semanticAtlasRequestForState(state), [
    state.hierarchy,
    state.projectId,
    state.pageCursor,
    state.communityId,
    state.regionId,
    state.density,
    state.focusNodeId,
    state.level,
    state.scope.project_token,
    state.scope.query,
    state.scope.relation,
    state.scope.session_token,
    state.scope.time_from,
    state.scope.time_to,
    state.scope.topic_token,
    state.scope.type,
  ]);
  const atlasRequestKey = useMemo(() => JSON.stringify(atlasRequest), [atlasRequest]);
  atlasRequestValueRef.current = atlasRequest;
  semanticAtlasGenerationRef.current = atlasLoad.data?.generation ?? semanticAtlasGenerationRef.current;
  diagnosticModeRef.current = diagnosticMode;
  stateRef.current = state;
  presentedStateRef.current = presentedState;
  mapDataRef.current = mapData;
  presentedMapDataRef.current = presentedMapData;
  atlasLoadRef.current = atlasLoad;
  contextRef.current = context;
  frontierRef.current = frontier;

  const fetchSemanticAtlasPage = useCallback((
    request: SemanticAtlasPageRequest,
    signal: AbortSignal,
  ): Promise<SemanticAtlasPageResponse> => {
    if (!request.cursor) {
      const requestKey = semanticAtlasRequestCacheKey(request);
      const prefetched = semanticAtlasPrefetchRef.current.get(requestKey);
      if (prefetched && prefetched.generation === semanticAtlasGenerationRef.current) {
        const startedAt = performance.now();
        return prefetched.promise.then((response) => {
          if (request.level === 'neighborhood' && response) {
            document.documentElement.dataset.neighborhoodLocalResponseMs = (performance.now() - startedAt).toFixed(1);
          }
          return response ?? api.getSemanticAtlasPage(request, signal);
        });
      }
    }
    return api.getSemanticAtlasPage(request, signal);
  }, []);

  const prefetchSemanticCommunity = useCallback((communityId: string, projectId?: string | null) => {
    const generation = semanticAtlasGenerationRef.current;
    const currentRequest = atlasRequestValueRef.current;
    if (!generation || currentRequest.level !== 'universe') return;
    const request: SemanticAtlasPageRequest = {
      ...currentRequest,
      level: 'community',
      ...(projectId ? { project_id: projectId } : {}),
      community_id: communityId,
      presentation: 'semantic-zoom',
      page_size: currentRequest.hierarchy === 'project' ? 150 : 250,
    };
    const requestKey = semanticAtlasRequestCacheKey(request);
    const current = semanticAtlasPrefetchRef.current.get(requestKey);
    if (current?.generation === generation) return;
    current?.controller.abort();
    const controller = new AbortController();
    const entry: SemanticAtlasPrefetchEntry = {
      controller,
      generation,
      promise: Promise.resolve(null),
    };
    entry.promise = api.getSemanticAtlasPage(request, controller.signal)
      .then((response) => {
        entry.response = response;
        return response;
      })
      .catch(() => {
        entry.response = null;
        return null;
      });
    semanticAtlasPrefetchRef.current.set(requestKey, entry);
    if (semanticAtlasPrefetchRef.current.size > 6) {
      const oldestKey = semanticAtlasPrefetchRef.current.keys().next().value as string | undefined;
      if (oldestKey && oldestKey !== requestKey) {
        semanticAtlasPrefetchRef.current.get(oldestKey)?.controller.abort();
        semanticAtlasPrefetchRef.current.delete(oldestKey);
      }
    }
  }, []);

  const prefetchSemanticIntent = useCallback((nodeId: string) => {
    const currentRequest = atlasRequestValueRef.current;
    if (currentRequest.level === 'universe') {
      const projectId = mapDataRef.current?.nodes.find((candidate) => candidate.id === nodeId)?.owner_project_id;
      prefetchSemanticCommunity(nodeId, projectId);
      return;
    }
    if (!nodeId.startsWith('obs:') || !semanticAtlasGenerationRef.current) return;
    const node = mapDataRef.current?.nodes.find((candidate) => candidate.id === nodeId);
    const communityId = node?.community_id ?? currentRequest.community_id;
    if (!communityId) return;
    const request: SemanticAtlasPageRequest = {
      ...currentRequest,
      level: 'neighborhood',
      community_id: communityId,
      focus_node_id: nodeId,
      region_id: undefined,
      presentation: undefined,
      depth: 2,
      page_size: currentRequest.hierarchy === 'project' ? 150 : 250,
    };
    const requestKey = semanticAtlasRequestCacheKey(request);
    if (semanticAtlasPrefetchRef.current.has(requestKey)) return;
    const controller = new AbortController();
    const entry: SemanticAtlasPrefetchEntry = {
      controller,
      generation: semanticAtlasGenerationRef.current,
      promise: Promise.resolve(null),
    };
    entry.promise = api.getSemanticAtlasPage(request, controller.signal)
      .then((response) => { entry.response = response; return response; })
      .catch(() => { entry.response = null; return null; });
    semanticAtlasPrefetchRef.current.set(requestKey, entry);
  }, [prefetchSemanticCommunity]);

  useEffect(() => () => {
    for (const entry of semanticAtlasPrefetchRef.current.values()) entry.controller.abort();
    semanticAtlasPrefetchRef.current.clear();
  }, []);

  useEffect(() => {
    if (atlasLoad.phase !== 'complete' || atlasLoad.data?.level !== 'universe') return;
    const firstCommunity = atlasLoad.data.nodes.find((node) => node.kind === 'community');
    if (!firstCommunity) return;
    const timer = window.setTimeout(() => prefetchSemanticCommunity(firstCommunity.id, firstCommunity.owner_project_id), 0);
    return () => window.clearTimeout(timer);
  }, [atlasLoad.data, atlasLoad.phase, prefetchSemanticCommunity]);

  useEffect(() => {
    if (atlasLoad.phase !== 'complete' || atlasLoad.data?.level !== 'community') return;
    const firstObservation = atlasLoad.data.nodes.find((node) => node.kind === 'observation');
    if (!firstObservation) return;
    const timer = window.setTimeout(() => prefetchSemanticIntent(firstObservation.id), 0);
    return () => window.clearTimeout(timer);
  }, [atlasLoad.data, atlasLoad.phase, prefetchSemanticIntent]);

  const beginSemanticTransition = useCallback(() => {
    atlasResumeRef.current = null;
    atlasRequestRef.current += 1;
    setAtlasLoad({ ...INITIAL_ATLAS_SNAPSHOT });
    setRendererCommit(null);
    setFrontier(null);
    setLoading((current) => ({ ...current, map: true }));
    setError(null);
  }, []);

  useEffect(() => {
    if (initialUrlCanonicalizedRef.current) return;
    initialUrlCanonicalizedRef.current = true;
    const canonicalUrl = buildObservatoryUrl(presentedState);
    if (`${window.location.pathname}${window.location.search}` !== canonicalUrl) {
      window.history.replaceState(null, '', canonicalUrl);
    }
  }, [presentedState]);

  useEffect(() => {
    if (restoringHistoryRef.current !== null) {
      if (serializedState === restoringHistoryRef.current) {
        historyRef.current = serializedState;
        restoringHistoryRef.current = null;
        window.history.replaceState(null, '', buildObservatoryUrl(presentedState));
      }
      return;
    }
    if (serializedState === historyRef.current) return;
    historyRef.current = serializedState;
    window.history.pushState(null, '', buildObservatoryUrl(presentedState));
  }, [presentedState, serializedState]);

  useEffect(() => {
    const restore = () => {
      const parsed = parseObservatorySearch(window.location.search);
      const restoredStateKey = serializeObservatoryState({
        ...createInitialObservatoryState(),
        ...parsed,
        scope: parsed.scope,
      });
      historyRef.current = restoredStateKey;
      restoringHistoryRef.current = restoredStateKey;
      window.history.replaceState(null, '', buildObservatoryUrl(presentedStateRef.current));
      beginSemanticTransition();
      setState((current) => {
        const target: ObservatoryLocation = {
          hierarchy: parsed.hierarchy,
          level: parsed.level,
          projectId: parsed.projectId,
          communityId: parsed.communityId,
          regionId: parsed.regionId,
          focusNodeId: parsed.focusNodeId,
          pageCursor: parsed.pageCursor,
        };
        const restoredIndex = current.locationTrail.findIndex((location) => sameLocation(location, target));
        return {
          ...current,
          ...parsed,
          scope: parsed.scope,
          visibleNodeIds: [],
          locationTrailIndex: restoredIndex >= 0 ? restoredIndex : current.locationTrailIndex,
        };
      });
      setLocalSelection(null);
      pendingLensOpenRef.current = parsed.activeSurface !== 'map' || parsed.level === 'neighborhood';
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [beginSemanticTransition]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++contextRequestRef.current;
    setLoading((current) => ({ ...current, context: true }));
    api.getObservatoryContext(state.scope, controller.signal)
      .then((response) => {
        if (requestId !== contextRequestRef.current) return;
        setContext(response);
        if (JSON.stringify(stateRef.current.scope) === JSON.stringify(presentedStateRef.current.scope)) {
          setPresentedContext(response);
        }
        setState((current) => applyObservatoryScope(
          current,
          observatoryScopeFromTokenScope(response.scope),
          response.context_token,
        ));
      })
      .catch((cause: Error) => {
        if (cause.name !== 'AbortError' && requestId === contextRequestRef.current) {
          setError(cause.message || 'Failed to load observatory context');
        }
      })
      .finally(() => {
        if (requestId === contextRequestRef.current) {
          setLoading((current) => ({ ...current, context: false }));
        }
      });
    return () => {
      controller.abort();
      contextRequestRef.current += 1;
    };
  }, [
    state.scope.project_token,
    state.scope.query,
    state.scope.relation,
    state.scope.session_token,
    state.scope.time_from,
    state.scope.time_to,
    state.scope.topic_token,
    state.scope.type,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++atlasRequestRef.current;
    const resume = atlasResumeRef.current?.requestKey === atlasRequestKey
      ? atlasResumeRef.current
      : null;
    atlasResumeRef.current = null;
    setError(null);

    const publishSnapshot = (snapshot: SemanticAtlasSnapshot) => {
      if (requestId !== atlasRequestRef.current) return;
      setAtlasLoad(snapshot);
      if (diagnosticModeRef.current !== 'semantic') return;
      const busy = snapshot.phase === 'initial'
        || snapshot.phase === 'streaming'
        || snapshot.phase === 'restarting';
      setLoading((current) => ({ ...current, map: busy }));

      if (snapshot.phase === 'recovery') {
        const level = snapshot.recoveryLevel ?? 'universe';
        setLocalSelection(null);
        pendingLensOpenRef.current = false;
        setState((current) => applyObservatoryPivot(current, {
          hierarchy: current.hierarchy,
          level,
          projectId: level === 'universe' ? null : current.projectId,
          communityId: level === 'universe' || level === 'project' ? null : current.communityId,
          focusNodeId: null,
        }));
        return;
      }

      if (!snapshot.data) {
        if (!mapDataRef.current) {
          setMapData(null);
          setFrontier(null);
        }
        return;
      }

      snapshot.data.presentation_key = JSON.stringify({
        hierarchy: snapshot.data.hierarchy,
        level: snapshot.data.level,
        project: snapshot.data.navigation.project_id,
        pageCursor: stateRef.current.pageCursor,
        generation: snapshot.data.generation,
        region: snapshot.data.navigation.region_id,
        focus: snapshot.data.navigation.focus_node_id,
        request: atlasRequestKey,
      });
      if (snapshot.phase === 'complete') {
        const completeAt = performance.now();
        const response = { level: snapshot.data.level, generation: snapshot.data.generation, regionId: snapshot.data.navigation.region_id, focusNodeId: snapshot.data.navigation.focus_node_id, presentationKey: snapshot.data.presentation_key, completeAt };
        const history = JSON.parse(document.documentElement.dataset.atlasResponseHistory ?? '[]') as typeof response[];
        document.documentElement.dataset.atlasResponseHistory = JSON.stringify([...history.slice(-63), response]);
      }

      const mapped = semanticAtlasPageToVizSlice(snapshot.data);
      const visibleNodeIds = mapped.nodes.map((node) => node.id);
      const nextFrontier: ObservatoryFrontierState = {
        added_node_ids: visibleNodeIds,
        already_visible_node_ids: [],
        exhausted: snapshot.phase === 'complete' && !snapshot.continuation,
        continuation: snapshot.continuation,
        reason: snapshot.continuation ? 'limit' : 'no-neighbors',
      };
      setMapData(mapped);
      setFrontier(nextFrontier);
      if (
        snapshot.phase === 'streaming'
        && !presentedMapDataRef.current
        && sameLocation(presentedStateRef.current, stateRef.current)
      ) {
        setPresentedMapData(mapped);
        setPresentedFrontier(nextFrontier);
      }
      setState((current) => ({
        ...current,
        visibleNodeIds,
        continuation: snapshot.continuation,
      }));
    };

    const prefetched = !resume
      ? semanticAtlasPrefetchRef.current.get(semanticAtlasRequestCacheKey(atlasRequest))
      : null;
    if (
      prefetched?.response
      && prefetched.generation === semanticAtlasGenerationRef.current
      && !prefetched.response.continuation
    ) {
      if (atlasRequest.level === 'neighborhood') {
        document.documentElement.dataset.neighborhoodLocalResponseMs = '0.0';
      }
      publishSnapshot({
        phase: 'complete',
        data: prefetched.response,
        continuation: null,
        pagesLoaded: 1,
        restartCount: 0,
        error: null,
        errorCode: null,
        recoveryLevel: null,
      });
      return () => {
        controller.abort();
        atlasRequestRef.current += 1;
      };
    }

    void loadSemanticAtlas({
      request: atlasRequest,
      pageMode: state.hierarchy === 'project' && (state.level === 'universe' || state.level === 'project')
        ? 'single-page'
        : 'accumulate',
      signal: controller.signal,
      fetchPage: fetchSemanticAtlasPage,
      initialData: resume?.data,
      initialCursor: resume?.continuation ?? state.pageCursor,
      onSnapshot: publishSnapshot,
    }).catch((cause: Error) => {
      if (cause.name !== 'AbortError' && requestId === atlasRequestRef.current) {
        setError(cause.message || 'Failed to load semantic atlas');
      }
    });

    return () => {
      controller.abort();
      atlasRequestRef.current += 1;
    };
  }, [atlasRequest, atlasRequestKey, atlasRetryKey, fetchSemanticAtlasPage, state.hierarchy, state.level, state.pageCursor]);

  useEffect(() => () => {
    rawControllerRef.current?.abort();
    rawRequestRef.current += 1;
  }, []);

  const loadRecall = useCallback((contextToken: string, signal?: AbortSignal) => {
    const requestId = ++instrumentRequestRef.current.recall;
    setLoading((current) => ({ ...current, recall: true }));
    api.getObservatoryRecall({ context_token: contextToken, hierarchy: state.hierarchy, lanes: state.lanes, limit: 8 }, signal)
      .then((value) => {
        if (requestId !== instrumentRequestRef.current.recall) return;
        setRecall(value);
        setInstrumentErrors((current) => ({ ...current, recall: undefined }));
      })
      .catch((cause: Error) => {
        if (cause.name !== 'AbortError' && requestId === instrumentRequestRef.current.recall) {
          setInstrumentErrors((current) => ({ ...current, recall: cause.message || 'Failed to load recall lanes' }));
        }
      })
      .finally(() => {
        if (requestId === instrumentRequestRef.current.recall) {
          setLoading((current) => ({ ...current, recall: false }));
        }
      });
  }, [state.hierarchy, state.lanes]);

  const loadTimeline = useCallback((contextToken: string, continuation: string | null, signal?: AbortSignal) => {
    const requestId = ++instrumentRequestRef.current.timeline;
    setLoading((current) => ({ ...current, timeline: true }));
    api.getObservatoryTimeline({
      context_token: contextToken,
      limit: 16,
      continuation: continuation ?? undefined,
    }, signal)
      .then((value) => {
        if (requestId !== instrumentRequestRef.current.timeline) return;
        setTimeline(value);
        setInstrumentErrors((current) => ({ ...current, timeline: undefined }));
      })
      .catch((cause: Error) => {
        if (cause.name !== 'AbortError' && requestId === instrumentRequestRef.current.timeline) {
          setInstrumentErrors((current) => ({ ...current, timeline: cause.message || 'Failed to load timeline' }));
        }
      })
      .finally(() => {
        if (requestId === instrumentRequestRef.current.timeline) {
          setLoading((current) => ({ ...current, timeline: false }));
        }
      });
  }, []);

  const loadLedger = useCallback((focusNodeId: string | null, signal?: AbortSignal) => {
    const requestId = ++instrumentRequestRef.current.ledger;
    const observationId = nodeIdToObservationId(focusNodeId);
    if (!observationId) {
      setLedger(null);
      setLoading((current) => ({ ...current, ledger: false }));
      return;
    }
    setLoading((current) => ({ ...current, ledger: true }));
    api.getObservatoryLedger(observationId, signal)
      .then((value) => {
        if (requestId !== instrumentRequestRef.current.ledger) return;
        setLedger(value);
        setInstrumentErrors((current) => ({ ...current, ledger: undefined }));
      })
      .catch((cause: Error) => {
        if (cause.name !== 'AbortError' && requestId === instrumentRequestRef.current.ledger) {
          setInstrumentErrors((current) => ({ ...current, ledger: cause.message || 'Failed to load ledger' }));
        }
      })
      .finally(() => {
        if (requestId === instrumentRequestRef.current.ledger) {
          setLoading((current) => ({ ...current, ledger: false }));
        }
      });
  }, []);

  const loadHealth = useCallback((signal?: AbortSignal) => {
    const requestId = ++instrumentRequestRef.current.health;
    api.getObservatoryHealth({}, signal)
      .then((value) => {
        if (requestId !== instrumentRequestRef.current.health) return;
        setHealth(value);
        setInstrumentErrors((current) => ({ ...current, health: undefined }));
      })
      .catch((cause: Error) => {
        if (cause.name === 'AbortError' || requestId !== instrumentRequestRef.current.health) return;
        setHealth(null);
        setInstrumentErrors((current) => ({ ...current, health: cause.message || 'Health unavailable' }));
      });
  }, []);

  useEffect(() => {
    if (!state.contextToken || state.activeSurface === 'map') return;
    const controller = new AbortController();
    const instrument = state.activeSurface;
    if (instrument === 'recall') loadRecall(state.contextToken, controller.signal);
    if (instrument === 'timeline') loadTimeline(state.contextToken, null, controller.signal);
    if (instrument === 'health') loadHealth(controller.signal);
    if (instrument === 'ledger') loadLedger(state.focusNodeId, controller.signal);
    return () => {
      controller.abort();
      instrumentRequestRef.current[instrument] += 1;
    };
  }, [loadHealth, loadLedger, loadRecall, loadTimeline, state.activeSurface, state.contextToken, state.focusNodeId]);

  const commitLocation = useCallback((
    location: ObservatoryLocation,
    options: { activeSurface?: ObservatorySurface; lens?: boolean } = {},
  ) => {
    beginSemanticTransition();
    pendingLensOpenRef.current = options.lens ?? location.level === 'neighborhood';
    setLocalSelection(null);
    setState((current) => ({
      ...applyObservatoryPivot(current, {
        hierarchy: location.hierarchy,
        level: location.level,
        projectId: location.projectId,
        communityId: location.communityId,
        regionId: location.regionId,
        focusNodeId: location.focusNodeId,
        pageCursor: location.pageCursor,
      }),
      activeSurface: options.activeSurface ?? 'map',
      visibleNodeIds: [],
      continuation: null,
    }));
  }, [beginSemanticTransition]);

  const activateNode = useCallback((nodeId: string, target: ObservatorySurface = 'map') => {
    const node = presentedMapData?.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    if ((presentedState.level === 'universe' || presentedState.level === 'project') && node.kind === 'community') {
      commitLocation({
        hierarchy: presentedState.hierarchy,
        level: 'community',
        projectId: node.owner_project_id ?? presentedState.projectId,
        communityId: node.community_id ?? node.id,
        regionId: null,
        focusNodeId: null,
        pageCursor: null,
      });
      return;
    }
    if (node.kind === 'observation') {
      const communityId = node.community_id ?? presentedState.communityId;
      if (
        presentedState.level === 'neighborhood'
        && presentedState.focusNodeId === node.id
        && presentedState.communityId === communityId
      ) {
        setState((current) => current.activeSurface === target
          ? current
          : { ...current, activeSurface: target });
        setPresentedState((current) => current.activeSurface === target
          ? current
          : { ...current, activeSurface: target });
        setLocalSelection(null);
        setLensOpen(true);
        return;
      }
      commitLocation({
        hierarchy: presentedState.hierarchy,
        level: 'neighborhood',
        projectId: node.owner_project_id ?? presentedState.projectId,
        communityId,
        regionId: null,
        focusNodeId: node.id,
        pageCursor: null,
      }, { activeSurface: target, lens: true });
      return;
    }
    setLocalSelection({ kind: 'node', id: node.id });
    setLensOpen(true);
  }, [commitLocation, presentedMapData?.nodes, presentedState.communityId, presentedState.focusNodeId, presentedState.hierarchy, presentedState.level, presentedState.projectId]);

  const activateProject = useCallback((projectId: string) => {
    commitLocation({
      hierarchy: 'project',
      level: 'project',
      projectId,
      communityId: null,
      regionId: null,
      focusNodeId: null,
      pageCursor: null,
    });
  }, [commitLocation]);

  const showNextProjectPage = useCallback(() => {
    const cursor = presentedMapData?.atlas?.continuation;
    if (!cursor || presentedState.level !== 'universe') return;
    commitLocation({
      hierarchy: 'project', level: 'universe', projectId: null, communityId: null,
      regionId: null, focusNodeId: null, pageCursor: cursor,
    });
  }, [commitLocation, presentedMapData?.atlas?.continuation, presentedState.level]);

  const patchScope = (patch: ObservatoryScope) => {
    rawControllerRef.current?.abort();
    rawRequestRef.current += 1;
    diagnosticModeRef.current = 'semantic';
    setDiagnosticMode('semantic');
    setRawLoad(INITIAL_RAW_SNAPSHOT);
    beginSemanticTransition();
    pendingLensOpenRef.current = false;
    setLocalSelection(null);
    setState((current) => ({
      ...applyObservatoryScope(current, patch),
      hierarchy: 'project',
      level: 'universe',
      projectId: null,
      communityId: null,
      regionId: null,
      focusNodeId: null,
      pageCursor: null,
      visibleNodeIds: [],
      continuation: null,
      locationTrail: [{ hierarchy: 'project', level: 'universe', projectId: null, communityId: null, regionId: null, focusNodeId: null, pageCursor: null }],
      locationTrailIndex: 0,
    }));
  };

  const retryAtlas = () => {
    atlasResumeRef.current = atlasLoad.errorCode !== 'VIZ_ATLAS_GENERATION_STALE'
      && atlasLoad.data
      && atlasLoad.continuation
      ? { requestKey: atlasRequestKey, data: atlasLoad.data, continuation: atlasLoad.continuation }
      : null;
    setError(null);
    setAtlasRetryKey((value) => value + 1);
  };

  const openRawDiagnostics = () => {
    const semantic = atlasLoad.data;
    if (!semantic) return;
    if (
      !semantic.navigation.raw_rich_render_safe
      || semantic.counts.raw_entity_count > semantic.navigation.raw_rich_render_limit
    ) {
      diagnosticModeRef.current = 'refused';
      setDiagnosticMode('refused');
      return;
    }

    rawControllerRef.current?.abort();
    const controller = new AbortController();
    rawControllerRef.current = controller;
    const requestId = ++rawRequestRef.current;
    diagnosticModeRef.current = 'loading';
    setDiagnosticMode('loading');
    setRawError(null);
    setRawLoad(INITIAL_RAW_SNAPSHOT);
    void loadFullAtlas({
      request: { page_size: 250 },
      signal: controller.signal,
      fetchPage: (request, signal) => api.getVizGraphPage(request, signal),
      onSnapshot: (snapshot) => {
        if (requestId !== rawRequestRef.current) return;
        setRawLoad(snapshot);
        setLoading((current) => ({
          ...current,
          map: snapshot.phase === 'initial' || snapshot.phase === 'streaming' || snapshot.phase === 'restarting',
        }));
        if (snapshot.data) {
          diagnosticModeRef.current = 'raw';
          setDiagnosticMode('raw');
          setMapData(snapshot.data);
          const nodeIds = snapshot.data.nodes.map((node) => node.id);
          setFrontier({
            added_node_ids: nodeIds,
            already_visible_node_ids: [],
            exhausted: snapshot.phase === 'complete',
            continuation: snapshot.continuation,
            reason: snapshot.continuation ? 'limit' : 'no-neighbors',
          });
        }
        if (snapshot.phase === 'partial-error' && !snapshot.data) {
          diagnosticModeRef.current = 'error';
          setDiagnosticMode('error');
          setRawError(snapshot.error);
        }
      },
    }).catch((cause: Error) => {
      if (cause.name === 'AbortError' || requestId !== rawRequestRef.current) return;
      diagnosticModeRef.current = 'error';
      setDiagnosticMode('error');
      setRawError(cause.message || 'Raw diagnostics unavailable');
    });
  };

  const exitRawDiagnostics = () => {
    rawControllerRef.current?.abort();
    rawRequestRef.current += 1;
    diagnosticModeRef.current = 'semantic';
    setDiagnosticMode('semantic');
    setRawLoad(INITIAL_RAW_SNAPSHOT);
    setRawError(null);
    setLocalSelection(null);
    setLensOpen(presentedState.level === 'neighborhood' || presentedState.activeSurface !== 'map');
    if (atlasLoad.data) {
      const mapped = semanticAtlasPageToVizSlice(atlasLoad.data);
      setMapData(mapped);
      setFrontier({
        added_node_ids: mapped.nodes.map((node) => node.id),
        already_visible_node_ids: [],
        exhausted: atlasLoad.phase === 'complete' && !atlasLoad.continuation,
        continuation: atlasLoad.continuation,
        reason: atlasLoad.continuation ? 'limit' : 'no-neighbors',
      });
    }
  };

  const navigateUniverse = () => {
    if (diagnosticMode === 'raw') {
      exitRawDiagnostics();
      return;
    }
    beginSemanticTransition();
    pendingLensOpenRef.current = false;
    setLocalSelection(null);
    setState((current) => returnObservatoryToUniverse(current));
  };

  const retryActiveInstrument = () => {
    if (state.activeSurface === 'recall' && state.contextToken) loadRecall(state.contextToken);
    if (state.activeSurface === 'timeline' && state.contextToken) loadTimeline(state.contextToken, null);
    if (state.activeSurface === 'ledger') loadLedger(state.focusNodeId);
    if (state.activeSurface === 'health') loadHealth();
  };

  const pivotWithToken = async (pivotToken: string, target: ObservatorySurface) => {
    try {
      const response = await api.resolveObservatoryPivot({
        pivot_token: pivotToken,
        hierarchy: state.hierarchy,
        target: target === 'health' ? 'map' : target,
      });
      beginSemanticTransition();
      pendingLensOpenRef.current = true;
      setLocalSelection(null);
      setState((current) => ({
        ...applyObservatoryPivot(current, {
          contextToken: response.context_token,
          hierarchy: response.hierarchy,
          level: 'neighborhood',
          projectId: response.project_id,
          communityId: response.community_id,
          focusNodeId: response.focus_node_id,
          pageCursor: null,
          scope: observatoryScopeFromTokenScope(response.scope),
        }),
        activeSurface: target,
        visibleNodeIds: [],
        continuation: null,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to resolve pivot');
    }
  };

  const selectMap = useCallback((nextSelection: MapSelection) => {
    if (diagnosticModeRef.current === 'raw') {
      setLocalSelection(nextSelection);
      if (nextSelection?.kind === 'node') setLensOpen(true);
    } else if (nextSelection?.kind === 'node') activateNode(nextSelection.id);
    else setLocalSelection(nextSelection);
  }, [activateNode]);

  const runGraphCommand = useCallback((command: GraphCommand) => {
    if (diagnosticModeRef.current === 'raw') {
      if (command === 'clear') {
        setLocalSelection(null);
        setLensOpen(false);
      } else if (command !== 'expand' && command !== 'select' && command !== 'next' && command !== 'previous') {
        setGraphCommand({ id: Date.now(), type: command });
      }
      return;
    }
    if (command === 'clear') {
      if (presentedState.level === 'neighborhood') {
        commitLocation({ hierarchy: presentedState.hierarchy, level: 'community', projectId: presentedState.projectId, communityId: presentedState.communityId, regionId: null, focusNodeId: null, pageCursor: null });
      } else if (presentedState.level === 'community') {
        commitLocation(presentedState.hierarchy === 'project' && presentedState.projectId
          ? { hierarchy: 'project', level: 'project', projectId: presentedState.projectId, communityId: null, regionId: null, focusNodeId: null, pageCursor: null }
          : { hierarchy: presentedState.hierarchy, level: 'universe', projectId: null, communityId: null, regionId: null, focusNodeId: null, pageCursor: null });
      } else if (presentedState.level === 'project') {
        commitLocation({ hierarchy: presentedState.hierarchy, level: 'universe', projectId: null, communityId: null, regionId: null, focusNodeId: null, pageCursor: null });
      } else {
        setLocalSelection(null);
        setLensOpen(false);
      }
      return;
    }
    if (command === 'expand' || command === 'select') {
      if (commandNodeId) activateNode(commandNodeId);
      return;
    }
    if (command === 'next' || command === 'previous') {
      if (!presentedMapData?.nodes.length) return;
      const ids = presentedState.level === 'neighborhood'
        ? connectedObservationIds(selectedNodeId ?? presentedState.focusNodeId, presentedMapData.nodes, presentedMapData.edges)
        : connectedNodeIds(selectedNodeId, presentedMapData.nodes, presentedMapData.edges);
      if (ids.length === 0) return;
      const currentIndex = Math.max(0, ids.indexOf(selectedNodeId ?? ids[0]));
      const nextIndex = command === 'next'
        ? (currentIndex + 1) % ids.length
        : (currentIndex - 1 + ids.length) % ids.length;
      activateNode(ids[nextIndex]);
      return;
    }
    setGraphCommand({ id: Date.now(), type: command });
  }, [activateNode, commandNodeId, commitLocation, presentedMapData, presentedState.communityId, presentedState.focusNodeId, presentedState.hierarchy, presentedState.level, presentedState.projectId, selectedNodeId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement
        || event.target instanceof HTMLTextAreaElement
        || event.target instanceof HTMLSelectElement
        || event.target instanceof HTMLButtonElement
        || event.target instanceof HTMLAnchorElement
        || event.target instanceof HTMLDetailsElement
      ) return;
      const command = graphCommandForKey(event.key);
      if (!command) return;
      runGraphCommand(command);
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runGraphCommand]);

  const navigateTrail = (delta: -1 | 1) => {
    const next = navigateObservatoryTrail(presentedState, delta);
    if (next === presentedState) return;
    beginSemanticTransition();
    pendingLensOpenRef.current = next.level === 'neighborhood' || next.activeSurface !== 'map';
    setLocalSelection(null);
    setState(next);
  };
  const resetAtlas = () => {
    rawControllerRef.current?.abort();
    rawRequestRef.current += 1;
    diagnosticModeRef.current = 'semantic';
    setDiagnosticMode('semantic');
    setRawLoad(INITIAL_RAW_SNAPSHOT);
    beginSemanticTransition();
    pendingLensOpenRef.current = false;
    setState(createInitialObservatoryState());
    setLocalSelection(null);
  };

  const handleRendererCommit = useCallback((commit: MapCanvasRenderCommit) => {
    if (diagnosticModeRef.current !== 'semantic') {
      setRendererCommit(commit);
      return;
    }
    const targetState = stateRef.current;
    const targetData = mapDataRef.current;
    const targetLoad = atlasLoadRef.current;
    const initialStreamingPresentation = targetLoad.phase === 'streaming'
      && !presentedMapDataRef.current
      && sameLocation(presentedStateRef.current, targetState);
    if (
      (targetLoad.phase !== 'complete' && !initialStreamingPresentation)
      || !targetLoad.data
      || !targetData?.atlas
      || commit.level !== targetState.level
      || commit.generation !== targetLoad.data.generation
      || commit.generation !== targetData.atlas.generation
      || commit.focusId !== targetState.focusNodeId
      || commit.pointCount !== targetData.nodes.length
      || commit.presentationKey !== targetLoad.data.presentation_key
    ) return;
    setRendererCommit(commit);
    setPresentedState(targetState);
    setPresentedMapData(targetData);
    setPresentedContext(contextRef.current);
    setPresentedFrontier(frontierRef.current);
    if (targetLoad.phase === 'complete') {
      setLensOpen(pendingLensOpenRef.current ?? (
        targetState.regionId !== null || targetState.level === 'neighborhood' || targetState.activeSurface !== 'map'
      ));
      pendingLensOpenRef.current = null;
    }
  }, []);
  const projectLabel = presentedContext?.scope.project?.label
    ?? presentedMapData?.atlas?.navigation.scope.project?.label
    ?? 'all projects';
  const activeProjectLabel = presentedState.projectId
    ? presentStoredText(presentedMapData?.nodes.find((node) => node.owner_project_id === presentedState.projectId)?.project) || 'Project'
    : null;
  const topicLabel = presentedContext?.scope.topic?.label
    ?? presentedMapData?.atlas?.navigation.scope.topic?.label
    ?? 'any topic';
  const mapMatchesCurrentLocation = diagnosticMode === 'raw'
    || presentedMapData?.atlas?.level === presentedState.level;
  const selectedNode = mapMatchesCurrentLocation
    ? presentedMapData?.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const selectedMemoryLabel = presentStoredText(selectedNode?.label)
    || (selectedNodeId ? 'Loading selected memory' : 'the whole universe');
  const semanticRendererReady = Boolean(
    diagnosticMode !== 'semantic'
    || (
      atlasLoad.phase === 'complete'
      && atlasLoad.data
      && mapData
      && presentedMapData === mapData
      && sameLocation(presentedState, state)
      && rendererCommit
      && rendererCommit.level === state.level
      && rendererCommit.generation === atlasLoad.data.generation
      && rendererCommit.focusId === state.focusNodeId
      && rendererCommit.pointCount === mapData.nodes.length
      && rendererCommit.presentationKey === atlasLoad.data.presentation_key
    )
  );

  return (
    <NeuralAtlasWorkspace>
      <header className="observatory-header">
        <div>
          <span className="observatory-kicker"><Compass size={15} /> Neural Atlas</span>
          <h1>Memory universe</h1>
          <p>Move from projects to constellations and memories, then reveal the evidence around one remembered moment.</p>
        </div>
        <div className="observatory-toolbar">
          <label className="observatory-search">
            <Search size={15} />
            <input
              data-semantic-query="true"
              aria-label="Explore memories"
              value={state.scope.query ?? ''}
              onChange={(event) => patchScope({ query: event.target.value || undefined })}
              placeholder="Explore memories"
            />
          </label>
          <button type="button" className="map-icon-button" onClick={resetAtlas} title="Reset observatory">
            <RotateCcw size={15} />
          </button>
          <AtlasDiagnostics
            mode={diagnosticMode}
            rawEntityCount={atlasLoad.data?.counts.raw_entity_count ?? 0}
            rawRelationshipCount={atlasLoad.data?.counts.raw_relationship_count ?? 0}
            rawRichRenderLimit={atlasLoad.data?.navigation.raw_rich_render_limit ?? 5_000}
            error={rawError}
            onOpen={openRawDiagnostics}
            onExit={exitRawDiagnostics}
          />
          <AtlasScopePanel
            scope={state.scope}
            density={state.density}
            filters={atlasLoad.data?.facets ?? null}
            loading={!atlasLoad.data && loading.map}
            error={atlasLoad.phase === 'partial-error' ? atlasLoad.error : null}
            onScopeChange={patchScope}
            onDensityChange={(density) => {
              setState((current) => ({ ...current, density }));
              setPresentedState((current) => ({ ...current, density }));
            }}
            onRetry={retryAtlas}
          />
        </div>
      </header>

      {selectedNodeId && (
        <div className="active-focus-summary">
          <span>Exploring</span>
          <button type="button" onClick={() => runGraphCommand('clear')}>
            {presentStoredText(selectedNode?.label) || 'Selected memory'}
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}

      {presentedState.locationTrail.length > 1 && (
        <div className="focus-trail" aria-label="Atlas trail">
          <button type="button" disabled={presentedState.locationTrailIndex <= 0} onClick={() => navigateTrail(-1)}>Back</button>
          <span>{presentedState.locationTrailIndex + 1} / {presentedState.locationTrail.length}</span>
          <button
            type="button"
            disabled={presentedState.locationTrailIndex >= presentedState.locationTrail.length - 1}
            onClick={() => navigateTrail(1)}
          >
            Forward
          </button>
        </div>
      )}

      {error && <div className="error-container observatory-error">{presentStoredText(error, 280)}</div>}

      <div className="observatory-context-strip" aria-live="polite">
        <span>Looking in <strong>{presentStoredText(projectLabel)}</strong></span>
        <span>Topic <strong>{presentStoredText(topicLabel)}</strong></span>
        <span>Level <strong>{presentedState.level}</strong></span>
        <span>Current memory <strong>{selectedMemoryLabel}</strong></span>
        <span>Memory sources <strong>{loading.context ? 'gathering' : presentedContext?.context_token ? 'ready' : 'using the atlas'}</strong></span>
      </div>

      <div className="observatory-grid" data-dock-open={String(lensOpen)}>
        <MemoryMapSurface
          data={diagnosticMode === 'raw' ? mapData : presentedMapData}
          canvasData={mapData}
          selection={presentedSelection}
          canvasSelection={rendererSelection}
          frontier={diagnosticMode === 'raw' ? frontier : presentedFrontier}
          atlasLoad={diagnosticMode === 'raw' ? rawLoad : atlasLoad}
          focusNodeId={presentedState.focusNodeId}
          loading={loading.map}
          error={atlasLoad.error ?? error}
          onSelect={selectMap}
          onExpand={activateNode}
          onRefresh={diagnosticMode === 'raw' ? openRawDiagnostics : retryAtlas}
          command={graphCommand}
          onCommand={runGraphCommand}
          paused={paused}
          onPausedChange={setPaused}
          level={diagnosticMode === 'raw' ? 'raw' : presentedState.level}
          hierarchy={presentedState.hierarchy}
          projectId={presentedState.projectId}
          projectLabel={activeProjectLabel}
          communityId={presentedState.communityId}
          regionId={presentedState.regionId}
          onActivateRegion={(regionId) => commitLocation({
            hierarchy: presentedState.hierarchy, level: 'community', projectId: presentedState.projectId,
            communityId: presentedState.communityId, regionId, focusNodeId: null, pageCursor: null,
          }, { lens: true })}
          onNavigateUniverse={navigateUniverse}
          onNavigateProject={() => presentedState.projectId && commitLocation({ hierarchy: 'project', level: 'project', projectId: presentedState.projectId, communityId: null, regionId: null, focusNodeId: null, pageCursor: null })}
          onNavigateCommunity={() => commitLocation({ hierarchy: presentedState.hierarchy, level: 'community', projectId: presentedState.projectId, communityId: presentedState.communityId, regionId: null, focusNodeId: null, pageCursor: null })}
          onActivateProject={activateProject}
          onPreviousProjectPage={() => navigateTrail(-1)}
          onNextProjectPage={showNextProjectPage}
          hasPreviousProjectPage={presentedState.level === 'universe' && presentedState.locationTrailIndex > 0 && presentedState.pageCursor !== null}
          rendererReady={semanticRendererReady}
          onRendererCommit={handleRendererCommit}
          onPrefetchNode={prefetchSemanticIntent}
        />
        <AtlasDock
          active={presentedState.activeSurface}
          open={lensOpen}
          onOpen={() => setLensOpen(true)}
          onClose={() => setLensOpen(false)}
          onActiveChange={(activeSurface) => {
            setState((current) => ({ ...current, activeSurface }));
            setPresentedState((current) => ({ ...current, activeSurface }));
            setLensOpen(true);
          }}
          overview={presentedState.regionId && presentedMapData?.atlas?.regions
            ? (() => {
                const region = presentedMapData.atlas.regions?.find((candidate) => candidate.id === presentedState.regionId);
                return region ? <RegionOverview region={region} bridges={presentedMapData.atlas?.region_bridges ?? []} nodes={presentedMapData.nodes} onClear={() => commitLocation({ hierarchy: presentedState.hierarchy, level: 'community', projectId: presentedState.projectId, communityId: presentedState.communityId, regionId: null, focusNodeId: null, pageCursor: null })} onOpenMemory={activateNode} /> : null;
              })()
            : (
            <MemoryOverview
              nodeId={selectedNodeId}
              node={selectedNode}
              connectedNodes={selectedNodeId && presentedMapData && mapMatchesCurrentLocation
                ? connectedNodeIds(selectedNodeId, presentedMapData.nodes, presentedMapData.edges)
                    .filter((id) => id !== selectedNodeId)
                    .map((id) => presentedMapData.nodes.find((node) => node.id === id))
                    .filter((node): node is NonNullable<typeof node> => Boolean(node))
                : []}
              knownNodes={mapMatchesCurrentLocation ? presentedMapData?.nodes ?? [] : []}
              onExpand={activateNode}
              onPivot={(nodeId, target) => activateNode(nodeId, target)}
              onConnected={(nodeId) => activateNode(nodeId)}
            />
          )}
          instrument={(
            <InstrumentDock
              active={presentedState.activeSurface}
              recall={recall}
              timeline={timeline}
              ledger={ledger}
              health={health}
              context={presentedContext}
              focusNodeId={presentedState.focusNodeId}
              query={presentedState.scope.query ?? ''}
              loading={loading}
              error={instrumentErrors[presentedState.activeSurface]}
              onRetry={retryActiveInstrument}
              onQuery={(query) => patchScope({ query: query || undefined })}
              onRecallRefresh={() => state.contextToken && loadRecall(state.contextToken)}
              onLoadMore={() => state.contextToken && loadTimeline(state.contextToken, timeline?.continuation ?? null)}
              onPivotToken={pivotWithToken}
              onPivotNode={(nodeId, target) => activateNode(nodeId, target)}
            />
          )}
        />
      </div>
    </NeuralAtlasWorkspace>
  );
}
