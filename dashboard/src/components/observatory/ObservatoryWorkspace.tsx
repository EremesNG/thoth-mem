import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';

import { api } from '../../api/client.js';
import type {
  ObservatoryContextResponse,
  ObservatoryFrontierState,
  ObservatoryLedgerResponse,
  ObservatoryRecallResponse,
  ObservatoryScope,
  ObservatoryTimelineResponse,
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
  type ObservatoryState,
  type ObservatorySurface,
} from './context-store.js';
import HealthIndexingSurface from './HealthIndexingSurface.js';
import KnowledgeLedgerSurface from './KnowledgeLedgerSurface.js';
import MemoryMapSurface from './MemoryMapSurface.js';
import { frontierToMapData, nodeIdToObservationId, scopeToMapParams } from './observatory-utils.js';
import RecallWorkspace from './RecallWorkspace.js';
import TimelineSurface from './TimelineSurface.js';

const surfaces: Array<{ id: ObservatorySurface; label: string }> = [
  { id: 'map', label: 'Map' },
  { id: 'recall', label: 'Recall' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'health', label: 'Health' },
];

function initialStateFromLocation(): ObservatoryState {
  const parsed = parseObservatorySearch(window.location.search);
  return {
    ...createInitialObservatoryState(),
    scope: parsed.scope,
    focusNodeId: parsed.focusNodeId,
    activeSurface: parsed.activeSurface,
    continuation: parsed.continuation,
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
  const [selection, setSelection] = useState<MapSelection>(null);
  const [loading, setLoading] = useState({ context: true, recall: false, map: false, timeline: false, ledger: false });
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const focusTargetRef = useRef<HTMLDivElement | null>(null);

  const serializedState = useMemo(() => serializeObservatoryState(state), [state]);

  useEffect(() => {
    window.history.replaceState(null, '', buildObservatoryUrl(state));
  }, [serializedState, state]);

  useEffect(() => {
    focusTargetRef.current?.focus();
  }, [state.activeSurface, state.focusNodeId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading((current) => ({ ...current, context: true }));
    api.getObservatoryContext(state.scope, controller.signal)
      .then((response) => {
        setContext(response);
        setState((current) => applyObservatoryScope(current, response.scope, response.context_token));
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message || 'Failed to load observatory context');
      })
      .finally(() => setLoading((current) => ({ ...current, context: false })));
    return () => controller.abort();
  }, [reloadKey, state.scope.project, state.scope.session_id, state.scope.topic_key, state.scope.query, state.scope.type, state.scope.relation, state.scope.time_from, state.scope.time_to]);

  const loadRecall = useCallback((contextToken: string, signal?: AbortSignal) => {
    setLoading((current) => ({ ...current, recall: true }));
    api.getObservatoryRecall({ context_token: contextToken, lanes: state.lanes, limit: 8 }, signal)
      .then(setRecall)
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message || 'Failed to load recall lanes');
      })
      .finally(() => setLoading((current) => ({ ...current, recall: false })));
  }, [state.lanes]);

  const loadMap = useCallback((contextToken: string, focusNodeId: string, visibleNodeIds: string[], continuation: string | null, signal?: AbortSignal) => {
    setLoading((current) => ({ ...current, map: true }));
    api.getObservatoryMapFrontier({
      context_token: contextToken,
      focus_node_id: focusNodeId,
      visible_node_ids: visibleNodeIds,
      continuation: continuation ?? undefined,
      max_nodes: 120,
      max_edges: 360,
    }, signal)
      .then((response) => {
        setMapData(frontierToMapData(response));
        setFrontier(response.frontier_state);
        setState((current) => ({
          ...mergeVisibleNodeIds(current, response.nodes.map((node) => node.id)),
          continuation: response.frontier_state.continuation,
        }));
      })
      .catch(async (err: Error) => {
        if (err.name === 'AbortError') return;
        try {
          const fallback = await api.getVizSlice({ ...scopeToMapParams(state.scope), depth: 1, max_nodes: 120, max_edges: 360 }, signal);
          setMapData(fallback);
          setFrontier({
            added_node_ids: fallback.nodes.map((node) => node.id),
            already_visible_node_ids: [],
            exhausted: !fallback.continuation,
            continuation: fallback.continuation,
            reason: fallback.continuation ? 'limit' : 'no-neighbors',
          });
        } catch {
          setError(err.message || 'Failed to load memory map frontier');
        }
      })
      .finally(() => setLoading((current) => ({ ...current, map: false })));
  }, [state.scope]);

  const loadTimeline = useCallback((contextToken: string, continuation: string | null, signal?: AbortSignal) => {
    setLoading((current) => ({ ...current, timeline: true }));
    api.getObservatoryTimeline({ context_token: contextToken, limit: 16, continuation: continuation ?? undefined }, signal)
      .then(setTimeline)
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message || 'Failed to load timeline');
      })
      .finally(() => setLoading((current) => ({ ...current, timeline: false })));
  }, []);

  const loadLedger = useCallback((focusNodeId: string | null, signal?: AbortSignal) => {
    const observationId = nodeIdToObservationId(focusNodeId);
    if (!observationId) return;
    setLoading((current) => ({ ...current, ledger: true }));
    api.getObservatoryLedger(observationId, signal)
      .then(setLedger)
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message || 'Failed to load ledger');
      })
      .finally(() => setLoading((current) => ({ ...current, ledger: false })));
  }, []);

  useEffect(() => {
    if (!state.contextToken) return;
    const controller = new AbortController();
    loadRecall(state.contextToken, controller.signal);
    loadTimeline(state.contextToken, null, controller.signal);
    api.getObservatoryHealth({ project: state.scope.project }, controller.signal).then(setHealth).catch(() => setHealth(null));
    const focus = state.focusNodeId ?? 'root';
    loadMap(state.contextToken, focus, state.visibleNodeIds, null, controller.signal);
    loadLedger(state.focusNodeId, controller.signal);
    return () => controller.abort();
  }, [loadLedger, loadMap, loadRecall, loadTimeline, reloadKey, state.contextToken, state.focusNodeId, state.scope.project]);

  const patchScope = (scope: ObservatoryScope) => {
    setState((current) => ({ ...applyObservatoryScope(current, scope), visibleNodeIds: [], continuation: null }));
  };

  const pivotWithToken = async (pivotToken: string, target: ObservatorySurface) => {
    try {
      const response = await api.resolveObservatoryPivot({ pivot_token: pivotToken, target: target === 'health' ? 'map' : target });
      setState((current) => ({
        ...applyObservatoryPivot(current, {
          contextToken: response.context_token,
          focusNodeId: response.focus_node_id,
          scope: response.scope,
        }),
        activeSurface: target,
        visibleNodeIds: [],
        continuation: null,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve pivot');
    }
  };

  const pivotWithNode = (nodeId: string, target: ObservatorySurface) => {
    setState((current) => ({
      ...current,
      focusNodeId: nodeId,
      activeSurface: target,
      visibleNodeIds: target === 'map' ? [] : current.visibleNodeIds,
      continuation: target === 'map' ? null : current.continuation,
    }));
    setSelection({ kind: 'node', id: nodeId });
  };

  const expandNode = (nodeId: string) => {
    if (!state.contextToken) return;
    loadMap(state.contextToken, nodeId, state.visibleNodeIds, state.continuation, undefined);
  };

  return (
    <section className="observatory-workspace" data-testid="observatory-workspace">
      <header className="observatory-header">
        <div>
          <span className="observatory-kicker"><Compass size={15} /> Memory Observatory</span>
          <h1>Memory Observatory</h1>
        </div>
        <div className="observatory-toolbar">
          <label className="observatory-search">
            <Search size={15} />
            <input value={state.scope.query ?? ''} onChange={(event) => patchScope({ query: event.target.value })} placeholder="Filter workspace" />
          </label>
          <button type="button" className="map-icon-button" onClick={() => setState(createInitialObservatoryState())} title="Reset observatory">
            <RotateCcw size={15} />
          </button>
          <button type="button" className="map-icon-button" onClick={() => setReloadKey((key) => key + 1)} title="Refresh observatory">
            <SlidersHorizontal size={15} />
          </button>
        </div>
      </header>

      <nav className="observatory-tabs" aria-label="Observatory surfaces">
        {surfaces.map((surface) => (
          <button
            key={surface.id}
            type="button"
            className={state.activeSurface === surface.id ? 'active' : ''}
            onClick={() => setState((current) => ({ ...current, activeSurface: surface.id }))}
          >
            {surface.label}
          </button>
        ))}
      </nav>

      {error && <div className="error-container observatory-error">{error}</div>}

      <div className="observatory-context-strip" aria-live="polite">
        <span>Project: <strong>{state.scope.project || 'All'}</strong></span>
        <span>Topic: <strong>{state.scope.topic_key || 'All'}</strong></span>
        <span>Focus: <strong>{state.focusNodeId || 'Frontier root'}</strong></span>
        <span>Context: <strong>{loading.context ? 'resolving' : context?.context_token ? 'ready' : 'fallback'}</strong></span>
      </div>

      <div ref={focusTargetRef} tabIndex={-1} className="observatory-focus-target" aria-label={`Active ${state.activeSurface} surface`} />

      <div className="observatory-grid">
        <MemoryMapSurface
          data={mapData}
          selection={selection}
          frontier={frontier}
          focusNodeId={state.focusNodeId}
          loading={loading.map}
          error={error}
          onSelect={(nextSelection) => {
            setSelection(nextSelection);
            if (nextSelection?.kind === 'node') {
              setState((current) => ({ ...current, focusNodeId: nextSelection.id }));
            }
          }}
          onExpand={expandNode}
          onPivot={pivotWithNode}
          onRefresh={() => setReloadKey((key) => key + 1)}
        />

        <div className="observatory-side-stack">
          <RecallWorkspace
            recall={recall}
            lanes={state.lanes}
            query={state.scope.query ?? ''}
            loading={loading.recall}
            onQueryChange={(query) => patchScope({ query })}
            onRefresh={() => state.contextToken && loadRecall(state.contextToken)}
            onPivot={pivotWithToken}
          />
          <TimelineSurface
            timeline={timeline}
            focusNodeId={state.focusNodeId}
            loading={loading.timeline}
            onLoadMore={() => state.contextToken && loadTimeline(state.contextToken, timeline?.continuation ?? null)}
            onPivot={pivotWithNode}
          />
          <KnowledgeLedgerSurface
            ledger={ledger}
            loading={loading.ledger}
            onPivotToMap={(nodeId) => pivotWithNode(nodeId, 'map')}
          />
          <HealthIndexingSurface health={health} contextHealth={context?.health ?? null} />
        </div>
      </div>
    </section>
  );
}
