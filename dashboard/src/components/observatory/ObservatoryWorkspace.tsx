import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, RotateCcw, Search } from 'lucide-react';

import { api } from '../../api/client.js';
import type {
  ObservatoryContextResponse,
  ObservatoryFrontierState,
  ObservatoryLedgerResponse,
  ObservatoryRecallResponse,
  ObservatoryScope,
  ObservatoryTimelineResponse,
  VizFiltersResponse,
  VizHealthResponse,
} from '../../api/client.js';
import type { MapData, MapSelection } from '../map/map-types.js';
import {
  applyObservatoryPivot,
  applyObservatoryScope,
  buildObservatoryUrl,
  createInitialObservatoryState,
  mergeVisibleNodeIds,
  parseObservatorySearch,
  serializeObservatoryState,
  recoverObservatoryFocus,
  type ObservatoryState,
  type ObservatorySurface,
} from './context-store.js';
import MemoryMapSurface from './MemoryMapSurface.js';
import { frontierToMapData, nodeIdToObservationId, scopeToMapParams } from './observatory-utils.js';
import InstrumentDock from './InstrumentDock.js';
import { mergeVizSlices } from '../map/map-state.js';
import { connectedNodeIds, graphCommandForKey, type GraphCommand, type GraphViewportCommand } from '../map/map-navigation.js';
import { presentStoredText } from '../safe-presentation.js';
import { normalizeScopeForFilters } from './ObservatoryScopeBar.js';
import NeuralAtlasWorkspace from './NeuralAtlasWorkspace.js';
import AtlasDock from './AtlasDock.js';
import AtlasScopePanel from './AtlasScopePanel.js';
import MemoryOverview from './MemoryOverview.js';

interface FocusCommitOptions {
  activeSurface?: ObservatorySurface;
  appendTrail?: boolean;
  trailIndex?: number;
  lens?: 'open' | 'closed' | 'preserve';
  updateState?: (current: ObservatoryState) => ObservatoryState;
}

function initialStateFromLocation(): ObservatoryState {
  const parsed = parseObservatorySearch(window.location.search);
  return {
    ...createInitialObservatoryState(),
    scope: parsed.scope,
    focusNodeId: parsed.focusNodeId,
    activeSurface: parsed.activeSurface,
    continuation: parsed.continuation,
    density: parsed.density,
  };
}

export default function ObservatoryWorkspace() {
  const [state, setState] = useState<ObservatoryState>(initialStateFromLocation);
  const [context, setContext] = useState<ObservatoryContextResponse | null>(null);
  const [recall, setRecall] = useState<ObservatoryRecallResponse | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [timeline, setTimeline] = useState<ObservatoryTimelineResponse | null>(null);
  const [ledger, setLedger] = useState<ObservatoryLedgerResponse | null>(null);
  const [health, setHealth] = useState<VizHealthResponse | null>(null);
  const [frontier, setFrontier] = useState<ObservatoryFrontierState | null>(null);
  const [availableFilters, setAvailableFilters] = useState<VizFiltersResponse | null>(null);
  const [filterLoading, setFilterLoading] = useState(true);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [validatedFilterScopeKey, setValidatedFilterScopeKey] = useState<string | null>(null);
  const [edgeSelection, setEdgeSelection] = useState<Extract<NonNullable<MapSelection>, { kind: 'edge' }> | null>(null);
  const [loading, setLoading] = useState({ context: true, recall: false, map: false, timeline: false, ledger: false });
  const [error, setError] = useState<string | null>(null);
  const [instrumentErrors, setInstrumentErrors] = useState<Partial<Record<ObservatorySurface, string>>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [filterReloadKey, setFilterReloadKey] = useState(0);
  const [graphCommand, setGraphCommand] = useState<{ id: number; type: GraphViewportCommand } | null>(null);
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [lensOpen, setLensOpen] = useState(() => initialStateFromLocation().activeSurface !== 'map');
  const sliceRequestRef = useRef(0);
  const frontierRequestRef = useRef(0);
  const frontierControllerRef = useRef<AbortController | null>(null);
  const committedMapScopeRef = useRef<string | null>(null);
  const historyRef = useRef(serializeObservatoryState(initialStateFromLocation()));
  const restoringHistoryRef = useRef<string | null>(null);
  const instrumentRequestRef = useRef({ recall: 0, timeline: 0, ledger: 0, health: 0 });
  const contextRequestRef = useRef(0);
  const filterRequestRef = useRef(0);

  const serializedState = useMemo(() => serializeObservatoryState(state), [state]);
  const selection = useMemo<MapSelection>(
    () => edgeSelection ?? (state.focusNodeId ? { kind: 'node', id: state.focusNodeId } : null),
    [edgeSelection, state.focusNodeId],
  );
  const filterScopeKey = state.scope.project ?? '';
  const filtersResolved = !filterLoading && validatedFilterScopeKey === filterScopeKey;

  const commitNodeFocus = useCallback((nodeId: string, options: FocusCommitOptions = {}) => {
    setState((current) => {
      const nextState = options.updateState?.(current) ?? current;
      let focusTrail = nextState.focusTrail;
      let focusTrailIndex = nextState.focusTrailIndex;
      if (options.appendTrail) {
        focusTrail = [...nextState.focusTrail.slice(0, nextState.focusTrailIndex + 1), nodeId].slice(-24);
        focusTrailIndex = focusTrail.length - 1;
      } else if (options.trailIndex !== undefined) {
        focusTrailIndex = options.trailIndex;
      }
      return {
        ...nextState,
        focusNodeId: nodeId,
        activeSurface: options.activeSurface ?? nextState.activeSurface,
        focusTrail,
        focusTrailIndex,
      };
    });
    setEdgeSelection(null);
    if (options.lens !== undefined && options.lens !== 'preserve') setLensOpen(options.lens === 'open');
  }, []);

  useEffect(() => {
    if (restoringHistoryRef.current !== null) {
      if (serializedState === restoringHistoryRef.current) {
        historyRef.current = serializedState;
        restoringHistoryRef.current = null;
      }
      return;
    }
    if (serializedState === historyRef.current) return;
    historyRef.current = serializedState;
    window.history.pushState(null, '', buildObservatoryUrl(state));
  }, [serializedState, state]);

  useEffect(() => {
    const restore = () => {
      const parsed = parseObservatorySearch(window.location.search);
      const restoredStateKey = serializeObservatoryState({ ...createInitialObservatoryState(), ...parsed, scope: parsed.scope });
      historyRef.current = restoredStateKey;
      restoringHistoryRef.current = restoredStateKey;
      setState((current) => ({ ...current, ...parsed, scope: parsed.scope, visibleNodeIds: [], focusTrail: parsed.focusNodeId ? [parsed.focusNodeId] : [], focusTrailIndex: parsed.focusNodeId ? 0 : -1 }));
      setEdgeSelection(null);
      setLensOpen(parsed.activeSurface !== 'map');
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++filterRequestRef.current;
    const requestScopeKey = state.scope.project ?? '';
    setFilterLoading(true);
    setFilterError(null);
    setAvailableFilters(null);
    api.getVizFilters({ project: state.scope.project }, controller.signal)
      .then((response) => {
        if (requestId !== filterRequestRef.current) return;
        setAvailableFilters(response);
        setValidatedFilterScopeKey(requestScopeKey);
        setState((current) => {
          if ((current.scope.project ?? '') !== requestScopeKey) return current;
          const normalizedScope = normalizeScopeForFilters(current.scope, response);
          if (serializeObservatoryState({ ...current, scope: normalizedScope }) === serializeObservatoryState(current)) return current;
          setEdgeSelection(null);
          setLensOpen(false);
          return {
            ...current,
            scope: normalizedScope,
            focusNodeId: null,
            visibleNodeIds: [],
            continuation: null,
            focusTrail: [],
            focusTrailIndex: -1,
          };
        });
      })
      .catch((cause: Error) => {
        if (cause.name === 'AbortError' || requestId !== filterRequestRef.current) return;
        setValidatedFilterScopeKey(requestScopeKey);
        setFilterError(cause.message || 'Filter choices are unavailable');
      })
      .finally(() => {
        if (requestId === filterRequestRef.current) setFilterLoading(false);
      });
    return () => {
      controller.abort();
      filterRequestRef.current += 1;
    };
  }, [filterReloadKey, state.scope.project]);

  useEffect(() => {
    if (!filtersResolved) return;
    const controller = new AbortController();
    const requestId = ++contextRequestRef.current;
    setLoading((current) => ({ ...current, context: true }));
    api.getObservatoryContext(state.scope, controller.signal)
      .then((response) => {
        if (requestId !== contextRequestRef.current) return;
        setContext(response);
        setState((current) => applyObservatoryScope(current, response.scope, response.context_token));
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError' && requestId === contextRequestRef.current) setError(err.message || 'Failed to load observatory context');
      })
      .finally(() => { if (requestId === contextRequestRef.current) setLoading((current) => ({ ...current, context: false })); });
    return () => { controller.abort(); contextRequestRef.current += 1; };
  }, [filtersResolved, reloadKey, state.scope.project, state.scope.session_id, state.scope.topic_key, state.scope.query, state.scope.type, state.scope.relation, state.scope.time_from, state.scope.time_to]);

  useEffect(() => {
    if (!filtersResolved) return;
    const controller = new AbortController();
    const requestId = ++sliceRequestRef.current;
    const requestScope = JSON.stringify(scopeToMapParams(state.scope));
    frontierControllerRef.current?.abort();
    frontierRequestRef.current += 1;
    const caps = state.density === 'focus' ? { max_nodes: 60, max_edges: 140 } : state.density === 'wide' ? { max_nodes: 220, max_edges: 520 } : { max_nodes: 120, max_edges: 360 };
    setLoading((current) => ({ ...current, map: true }));
    api.getVizSlice({ ...scopeToMapParams(state.scope), depth: state.density === 'wide' ? 2 : 1, ...caps }, controller.signal).then((slice) => {
      if (requestId !== sliceRequestRef.current) return;
      committedMapScopeRef.current = requestScope;
      setMapData(slice);
      setFrontier({ added_node_ids: slice.nodes.map((node) => node.id), already_visible_node_ids: [], exhausted: !slice.continuation, continuation: slice.continuation, reason: slice.continuation ? 'limit' : 'no-neighbors' });
      setState((current) => {
        if (!current.focusNodeId || slice.nodes.some((node) => node.id === current.focusNodeId)) return recoverObservatoryFocus(current, slice.nodes.map((node) => node.id));
        setEdgeSelection(null); setLensOpen(false);
        return { ...current, focusNodeId: null, visibleNodeIds: slice.nodes.map((node) => node.id), focusTrail: [], focusTrailIndex: -1 };
      });
    }).catch((cause: Error) => { if (cause.name !== 'AbortError' && requestId === sliceRequestRef.current) setError(cause.message); }).finally(() => { if (requestId === sliceRequestRef.current) setLoading((current) => ({ ...current, map: false })); });
    return () => { controller.abort(); sliceRequestRef.current += 1; };
  }, [filtersResolved, reloadKey, state.density, state.scope.project, state.scope.session_id, state.scope.topic_key, state.scope.query, state.scope.type, state.scope.relation]);

  useEffect(() => () => {
    frontierControllerRef.current?.abort();
    frontierRequestRef.current += 1;
  }, []);

  const loadRecall = useCallback((contextToken: string, signal?: AbortSignal) => {
    const requestId = ++instrumentRequestRef.current.recall;
    setLoading((current) => ({ ...current, recall: true }));
    api.getObservatoryRecall({ context_token: contextToken, lanes: state.lanes, limit: 8 }, signal)
      .then((value) => { if (requestId === instrumentRequestRef.current.recall) { setRecall(value); setInstrumentErrors((current) => ({ ...current, recall: undefined })); } })
      .catch((err: Error) => {
        if (err.name !== 'AbortError' && requestId === instrumentRequestRef.current.recall) setInstrumentErrors((current) => ({ ...current, recall: err.message || 'Failed to load recall lanes' }));
      })
      .finally(() => { if (requestId === instrumentRequestRef.current.recall) setLoading((current) => ({ ...current, recall: false })); });
  }, [state.lanes]);

  const loadMap = useCallback((contextToken: string, focusNodeId: string, visibleNodeIds: string[], continuation: string | null, signal?: AbortSignal) => {
    frontierControllerRef.current?.abort();
    const controller = new AbortController();
    frontierControllerRef.current = controller;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const requestId = ++frontierRequestRef.current;
    const requestScope = JSON.stringify(scopeToMapParams(state.scope));
    setLoading((current) => ({ ...current, map: true }));
    api.getObservatoryMapFrontier({
      context_token: contextToken,
      focus_node_id: focusNodeId,
      visible_node_ids: visibleNodeIds,
      continuation: continuation ?? undefined,
      max_nodes: 120,
      max_edges: 360,
    }, controller.signal)
      .then((response) => {
        if (requestId !== frontierRequestRef.current || committedMapScopeRef.current !== requestScope) return;
        const incoming = frontierToMapData(response);
        setMapData((current) => current ? mergeVizSlices(current, incoming) : incoming);
        setFrontier(response.frontier_state);
        setState((current) => ({
          ...mergeVisibleNodeIds(current, response.nodes.map((node) => node.id)),
          continuation: response.frontier_state.continuation,
        }));
      })
      .catch(async (err: Error) => {
        if (err.name === 'AbortError') return;
        try {
          const fallback = await api.getVizSlice({ ...scopeToMapParams(state.scope), depth: 1, max_nodes: 120, max_edges: 360 }, controller.signal);
          if (requestId !== frontierRequestRef.current || committedMapScopeRef.current !== requestScope) return;
          setMapData(fallback);
          setFrontier({
            added_node_ids: fallback.nodes.map((node) => node.id),
            already_visible_node_ids: [],
            exhausted: !fallback.continuation,
            continuation: fallback.continuation,
            reason: fallback.continuation ? 'limit' : 'no-neighbors',
          });
        } catch (fallbackError) {
          const fallbackWasAborted = fallbackError instanceof Error && fallbackError.name === 'AbortError';
          if (fallbackWasAborted || controller.signal.aborted || requestId !== frontierRequestRef.current || committedMapScopeRef.current !== requestScope) return;
          setError(err.message || 'Failed to load memory map frontier');
        }
      })
      .finally(() => {
        signal?.removeEventListener('abort', abort);
        if (requestId === frontierRequestRef.current) setLoading((current) => ({ ...current, map: false }));
      });
  }, [state.scope]);

  const loadTimeline = useCallback((contextToken: string, continuation: string | null, signal?: AbortSignal) => {
    const requestId = ++instrumentRequestRef.current.timeline;
    setLoading((current) => ({ ...current, timeline: true }));
    api.getObservatoryTimeline({ context_token: contextToken, limit: 16, continuation: continuation ?? undefined }, signal)
      .then((value) => { if (requestId === instrumentRequestRef.current.timeline) { setTimeline(value); setInstrumentErrors((current) => ({ ...current, timeline: undefined })); } })
      .catch((err: Error) => {
        if (err.name !== 'AbortError' && requestId === instrumentRequestRef.current.timeline) setInstrumentErrors((current) => ({ ...current, timeline: err.message || 'Failed to load timeline' }));
      })
      .finally(() => { if (requestId === instrumentRequestRef.current.timeline) setLoading((current) => ({ ...current, timeline: false })); });
  }, []);

  const loadLedger = useCallback((focusNodeId: string | null, signal?: AbortSignal) => {
    const requestId = ++instrumentRequestRef.current.ledger;
    const observationId = nodeIdToObservationId(focusNodeId);
    if (!observationId) {
      setLedger(null);
      setLoading((current) => ({ ...current, ledger: false }));
      setInstrumentErrors((current) => ({ ...current, ledger: undefined }));
      return;
    }
    setLoading((current) => ({ ...current, ledger: true }));
    api.getObservatoryLedger(observationId, signal)
      .then((value) => { if (requestId === instrumentRequestRef.current.ledger) { setLedger(value); setInstrumentErrors((current) => ({ ...current, ledger: undefined })); } })
      .catch((err: Error) => {
        if (err.name !== 'AbortError' && requestId === instrumentRequestRef.current.ledger) setInstrumentErrors((current) => ({ ...current, ledger: err.message || 'Failed to load ledger' }));
      })
      .finally(() => { if (requestId === instrumentRequestRef.current.ledger) setLoading((current) => ({ ...current, ledger: false })); });
  }, []);

  const loadHealth = useCallback((project?: string, signal?: AbortSignal) => {
    const requestId = ++instrumentRequestRef.current.health;
    api.getObservatoryHealth({ project }, signal)
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
    if (!state.contextToken) return;
    const controller = new AbortController();
    const instrument = state.activeSurface === 'map' ? null : state.activeSurface;
    if (instrument === 'recall') loadRecall(state.contextToken, controller.signal);
    if (instrument === 'timeline') loadTimeline(state.contextToken, null, controller.signal);
    if (instrument === 'health') loadHealth(state.scope.project, controller.signal);
    if (instrument === 'ledger') loadLedger(state.focusNodeId, controller.signal);
    if (state.focusNodeId) loadMap(state.contextToken, state.focusNodeId, state.visibleNodeIds, null, controller.signal);
    return () => {
      controller.abort();
      if (instrument) instrumentRequestRef.current[instrument] += 1;
    };
  }, [loadHealth, loadLedger, loadMap, loadRecall, loadTimeline, reloadKey, state.activeSurface, state.contextToken, state.focusNodeId, state.scope.project]);

  const retryActiveInstrument = () => {
    if (state.activeSurface === 'recall' && state.contextToken) loadRecall(state.contextToken);
    if (state.activeSurface === 'timeline' && state.contextToken) loadTimeline(state.contextToken, null);
    if (state.activeSurface === 'ledger') loadLedger(state.focusNodeId);
    if (state.activeSurface === 'health') loadHealth(state.scope.project);
  };

  const patchScope = (scope: ObservatoryScope) => {
    setEdgeSelection(null);
    setLensOpen(false);
    setState((current) => ({
      ...applyObservatoryScope(current, scope),
      focusNodeId: null,
      visibleNodeIds: [],
      continuation: null,
      focusTrail: [],
      focusTrailIndex: -1,
    }));
  };

  const pivotWithToken = async (pivotToken: string, target: ObservatorySurface) => {
    try {
      const response = await api.resolveObservatoryPivot({ pivot_token: pivotToken, target: target === 'health' ? 'map' : target });
      commitNodeFocus(response.focus_node_id, {
        activeSurface: target,
        lens: 'preserve',
        updateState: (current) => ({
          ...applyObservatoryPivot(current, {
            contextToken: response.context_token,
            focusNodeId: response.focus_node_id,
            scope: response.scope,
          }),
          visibleNodeIds: [],
          continuation: null,
        }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve pivot');
    }
  };

  const pivotWithNode = (nodeId: string, target: ObservatorySurface) => {
    commitNodeFocus(nodeId, { activeSurface: target, appendTrail: true, lens: 'open' });
  };

  const expandNode = useCallback((nodeId: string) => {
    if (!state.contextToken) return;
    loadMap(state.contextToken, nodeId, state.visibleNodeIds, state.continuation, undefined);
  }, [loadMap, state.contextToken, state.continuation, state.visibleNodeIds]);

  const runGraphCommand = useCallback((command: GraphCommand) => {
    if (command === 'clear') { setEdgeSelection(null); setState((current) => ({ ...current, focusNodeId: null })); setLensOpen(false); }
    else if (command === 'expand') { if (state.focusNodeId) expandNode(state.focusNodeId); }
    else if (command === 'next' || command === 'previous') {
      if (!mapData?.nodes.length) return;
      const ids = connectedNodeIds(state.focusNodeId, mapData.nodes, mapData.edges);
      const currentIndex = Math.max(0, ids.indexOf(state.focusNodeId ?? ids[0]));
      const nextIndex = command === 'next' ? (currentIndex + 1) % ids.length : (currentIndex - 1 + ids.length) % ids.length;
      const nextNodeId = ids[nextIndex];
      commitNodeFocus(nextNodeId, { appendTrail: true, lens: 'closed' });
    }
    else if (command === 'select') {
      if (state.focusNodeId) commitNodeFocus(state.focusNodeId, { activeSurface: 'map', lens: 'open' });
    }
    else setGraphCommand({ id: Date.now(), type: command });
  }, [commitNodeFocus, expandNode, mapData, state.focusNodeId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const command = graphCommandForKey(event.key);
      if (!command) return;
      runGraphCommand(command);
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runGraphCommand]);

  return (
    <NeuralAtlasWorkspace>
      <header className="observatory-header">
        <div>
          <span className="observatory-kicker"><Compass size={15} /> Neural Atlas</span>
          <h1>Memory universe</h1>
          <p>Follow connections between decisions, discoveries, sessions, and the ideas that shaped them.</p>
        </div>
        <div className="observatory-toolbar">
          <label className="observatory-search">
            <Search size={15} />
            <input data-semantic-query="true" aria-label="Explore memories" value={state.scope.query ?? ''} onChange={(event) => patchScope({ query: event.target.value })} placeholder="Explore memories" />
          </label>
          <button type="button" className="map-icon-button" onClick={() => { setState(createInitialObservatoryState()); setEdgeSelection(null); setLensOpen(false); }} title="Reset observatory">
            <RotateCcw size={15} />
          </button>
          <AtlasScopePanel
            scope={state.scope}
            density={state.density}
            filters={availableFilters}
            loading={!filtersResolved}
            error={filterError}
            onScopeChange={patchScope}
            onDensityChange={(density) => setState((current) => ({ ...current, density }))}
            onRetry={() => setFilterReloadKey((key) => key + 1)}
          />
        </div>
      </header>
      {state.focusNodeId && (
        <div className="active-focus-summary">
          <span>Exploring</span>
          <button type="button" onClick={() => { setEdgeSelection(null); setLensOpen(false); setState((current) => ({ ...current, focusNodeId: null })); }}>
            {presentStoredText(mapData?.nodes.find((node) => node.id === state.focusNodeId)?.label) || 'Selected memory'}
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}

      {state.focusTrail.length > 0 && (
        <div className="focus-trail" aria-label="Focus trail">
          <button
            type="button"
            disabled={state.focusTrailIndex <= 0}
            onClick={() => {
              const nextIndex = state.focusTrailIndex - 1;
              const nextNodeId = state.focusTrail[nextIndex];
              if (nextNodeId) commitNodeFocus(nextNodeId, { trailIndex: nextIndex, lens: 'preserve' });
            }}
          >
            Back
          </button>
          <span>{state.focusTrailIndex + 1} / {state.focusTrail.length}</span>
          <button
            type="button"
            disabled={state.focusTrailIndex >= state.focusTrail.length - 1}
            onClick={() => {
              const nextIndex = state.focusTrailIndex + 1;
              const nextNodeId = state.focusTrail[nextIndex];
              if (nextNodeId) commitNodeFocus(nextNodeId, { trailIndex: nextIndex, lens: 'preserve' });
            }}
          >
            Forward
          </button>
        </div>
      )}

      {error && <div className="error-container observatory-error">{error}</div>}

      <div className="observatory-context-strip" aria-live="polite">
        <span>Looking in <strong>{presentStoredText(state.scope.project) || 'all projects'}</strong></span>
        <span>Topic <strong>{presentStoredText(state.scope.topic_key) || 'any topic'}</strong></span>
        <span>Current memory <strong>{presentStoredText(mapData?.nodes.find((node) => node.id === state.focusNodeId)?.label) || 'the whole constellation'}</strong></span>
        <span>Memory sources <strong>{loading.context ? 'gathering' : context?.context_token ? 'ready' : 'using the visible map'}</strong></span>
      </div>

      <div className="observatory-grid" data-dock-open={String(lensOpen)}>
        <MemoryMapSurface
          data={mapData}
          selection={selection}
          frontier={frontier}
          focusNodeId={state.focusNodeId}
          loading={loading.map}
          error={error}
          onSelect={(nextSelection) => {
            if (nextSelection?.kind === 'node') commitNodeFocus(nextSelection.id, { activeSurface: 'map', lens: 'open' });
            else setEdgeSelection(nextSelection);
          }}
          onExpand={expandNode}
          onRefresh={() => setReloadKey((key) => key + 1)}
          command={graphCommand}
          onCommand={runGraphCommand}
          paused={paused}
          onPausedChange={setPaused}
        />
        <AtlasDock
          active={state.activeSurface}
          open={lensOpen}
          onOpen={() => setLensOpen(true)}
          onClose={() => setLensOpen(false)}
          onActiveChange={(activeSurface) => {
            setState((current) => ({ ...current, activeSurface }));
            setLensOpen(true);
          }}
          overview={(
            <MemoryOverview
              nodeId={state.focusNodeId}
              node={mapData?.nodes.find((node) => node.id === state.focusNodeId) ?? null}
              connectedNodes={state.focusNodeId && mapData
                ? connectedNodeIds(state.focusNodeId, mapData.nodes, mapData.edges)
                    .filter((id) => id !== state.focusNodeId)
                    .map((id) => mapData.nodes.find((node) => node.id === id))
                    .filter((node): node is NonNullable<typeof node> => Boolean(node))
                : []}
              knownNodes={mapData?.nodes ?? []}
              project={state.scope.project}
              onExpand={expandNode}
              onPivot={pivotWithNode}
              onConnected={(nodeId) => pivotWithNode(nodeId, 'map')}
            />
          )}
          instrument={(
            <InstrumentDock
              active={state.activeSurface}
              recall={recall}
              timeline={timeline}
              ledger={ledger}
              health={health}
              context={context}
              focusNodeId={state.focusNodeId}
              query={state.scope.query ?? ''}
              loading={loading}
              error={instrumentErrors[state.activeSurface]}
              onRetry={retryActiveInstrument}
              onQuery={(query) => patchScope({ query })}
              onRecallRefresh={() => state.contextToken && loadRecall(state.contextToken)}
              onLoadMore={() => state.contextToken && loadTimeline(state.contextToken, timeline?.continuation ?? null)}
              onPivotToken={pivotWithToken}
              onPivotNode={pivotWithNode}
            />
          )}
        />
      </div>
    </NeuralAtlasWorkspace>
  );
}
