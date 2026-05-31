import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Layers, Loader2, Map as MapIcon, RefreshCw } from 'lucide-react';

import { api } from '../../api/client.js';
import type { ObservationType, VizFiltersResponse } from '../../api/client.js';
import MapCanvas from './MapCanvas.js';
import MapFiltersPanel from './MapFiltersPanel.js';
import MapInspectorPanel from './MapInspectorPanel.js';
import type { InspectorDetails, MapData, MapFilters, MapSelection } from './map-types.js';
import { mergeVizSlices, parseMapFilters, sanitizeMapText, serializeMapFilters } from './map-state.js';

type ExtendedSliceParams = {
  project?: string;
  session_id?: string;
  topic_key?: string;
  type?: ObservationType;
  relation?: string;
  query?: string;
  depth?: number;
  max_nodes?: number;
  max_edges?: number;
  cursor?: string;
};

function buildSliceParams(filters: MapFilters): ExtendedSliceParams {
  return {
    project: filters.project || undefined,
    session_id: filters.sessionId || undefined,
    topic_key: filters.topicKey || undefined,
    type: filters.type || undefined,
    relation: filters.relation || undefined,
    query: filters.query || undefined,
    depth: filters.depth,
    max_nodes: filters.maxNodes,
    max_edges: filters.maxEdges,
    cursor: filters.continuation || undefined,
  };
}

export default function MapWorkspace() {
  const [filters, setFilters] = useState<MapFilters>(() => parseMapFilters(window.location.search));
  const [data, setData] = useState<MapData | null>(null);
  const [availableFilters, setAvailableFilters] = useState<VizFiltersResponse | null>(null);
  const [selection, setSelection] = useState<MapSelection>(null);
  const [details, setDetails] = useState<InspectorDetails>(null);
  const [loading, setLoading] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const queryString = useMemo(() => serializeMapFilters(filters), [filters]);

  useEffect(() => {
    window.history.replaceState(null, '', `/${queryString ? `?${queryString}` : ''}`);
  }, [queryString]);

  const loadSlice = useCallback(async (nextFilters: MapFilters, merge = false, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getVizSlice(buildSliceParams(nextFilters), signal);
      setData((current) => merge && current ? mergeVizSlices(current, response) : response);
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message || 'Failed to load memory map');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadSlice(filters, Boolean(filters.continuation), controller.signal);
    return () => controller.abort();
  }, [filters, loadSlice, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    api.getVizFilters({ project: filters.project || undefined, session_id: filters.sessionId || undefined }, controller.signal)
      .then(setAvailableFilters)
      .catch(() => setAvailableFilters(null));
    return () => controller.abort();
  }, [filters.project, filters.sessionId]);

  useEffect(() => {
    if (!selection) {
      setDetails(null);
      return;
    }
    const controller = new AbortController();
    setInspecting(true);
    const request = selection.kind === 'node'
      ? api.inspectVizNode(selection.id, { project: filters.project || undefined }, controller.signal)
        .then((result) => setDetails({ kind: 'node', details: result }))
      : api.inspectVizEdge(selection.id, { project: filters.project || undefined }, controller.signal)
        .then((result) => setDetails({ kind: 'edge', details: result }));

    request.catch((err: any) => {
      if (err.name !== 'AbortError') setDetails(null);
    }).finally(() => setInspecting(false));
    return () => controller.abort();
  }, [filters.project, selection]);

  const handleLoadMore = () => {
    if (!data?.continuation) return;
    setFilters((current) => ({ ...current, continuation: data.continuation }));
  };

  const handleExpand = async (nodeId: string) => {
    setLoading(true);
    try {
      const response = await api.expandVizNode({
        ...buildSliceParams(filters),
        node_id: nodeId,
      });
      setData((current) => current ? mergeVizSlices(current, response) : response);
    } catch (err: any) {
      setError(err.message || 'Failed to expand neighbors');
    } finally {
      setLoading(false);
    }
  };

  const countLabel = data ? `${data.nodes.length} nodes / ${data.edges.length} edges` : 'Loading map';
  const state = data?.state ?? 'empty';

  return (
    <section className="map-workspace" data-testid="map-workspace">
      <header className="map-topbar">
        <div>
          <div className="map-kicker"><MapIcon size={16} /> Memory Map</div>
          <h1>Memory Map</h1>
        </div>
        <div className="map-health-strip">
          {loading ? <Loader2 className="spin-icon" size={16} /> : <Layers size={16} />}
          <span>{countLabel}</span>
          {data?.health && <span>{data.health.semantic_state}</span>}
        </div>
      </header>

      <div className="map-shell">
        <MapFiltersPanel
          filters={filters}
          availableFilters={availableFilters}
          loading={loading}
          hasContinuation={Boolean(data?.continuation)}
          onChange={setFilters}
          onReload={() => setReloadKey((key) => key + 1)}
          onLoadMore={handleLoadMore}
        />

        <main className="map-stage">
          {error && (
            <div className="map-state-banner danger">
              <AlertTriangle size={18} />
              <span>{sanitizeMapText(error)}</span>
              <button type="button" className="map-icon-button compact" onClick={() => setReloadKey((key) => key + 1)} title="Retry">
                <RefreshCw size={14} />
              </button>
            </div>
          )}

          {!loading && data && data.nodes.length === 0 && (
            <div className="map-empty-layer">
              <MapIcon size={28} />
              <h2>No public map nodes found</h2>
              <p>Relax filters or choose another project/topic to inspect the visual memory graph.</p>
            </div>
          )}

          {data && (
            <MapCanvas nodes={data.nodes} edges={data.edges} state={state} selection={selection} onSelect={setSelection} />
          )}
        </main>

        <MapInspectorPanel
          data={data}
          selection={selection}
          details={details}
          loading={inspecting}
          onClose={() => setSelection(null)}
          onExpand={handleExpand}
        />
      </div>
    </section>
  );
}
