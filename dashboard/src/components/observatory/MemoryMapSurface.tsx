import { AlertTriangle, GitBranch, Layers, Loader2, Map as MapIcon, RefreshCw } from 'lucide-react';

import type { ObservatoryFrontierState } from '../../api/client.js';
import MapCanvas from '../map/MapCanvas.js';
import type { MapData, MapSelection } from '../map/map-types.js';
import { sanitizeMapText } from '../map/map-state.js';

interface MemoryMapSurfaceProps {
  data: MapData | null;
  selection: MapSelection;
  frontier: ObservatoryFrontierState | null;
  focusNodeId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (selection: MapSelection) => void;
  onExpand: (nodeId: string) => void;
  onPivot: (nodeId: string, target: 'timeline' | 'ledger' | 'recall') => void;
  onRefresh: () => void;
}

export default function MemoryMapSurface({
  data,
  selection,
  frontier,
  focusNodeId,
  loading,
  error,
  onSelect,
  onExpand,
  onPivot,
  onRefresh,
}: MemoryMapSurfaceProps) {
  const selectedNodeId = selection?.kind === 'node' ? selection.id : focusNodeId;
  const selectedNode = selectedNodeId ? data?.nodes.find((node) => node.id === selectedNodeId) : null;

  return (
    <section className="observatory-map-surface" aria-labelledby="map-heading" data-testid="memory-map-surface">
      <div className="observatory-panel-header">
        <div>
          <span className="observatory-kicker"><MapIcon size={14} /> Memory Map</span>
          <h2 id="map-heading">Frontier neighborhood</h2>
        </div>
        <div className="map-health-strip">
          {loading ? <Loader2 className="spin-icon" size={16} /> : <Layers size={16} />}
          <span>{data ? `${data.nodes.length} nodes / ${data.edges.length} edges` : 'Loading'}</span>
        </div>
      </div>

      <div className="observatory-frontier-strip" aria-live="polite">
        <span>+{frontier?.added_node_ids.length ?? 0} new</span>
        <span>{frontier?.already_visible_node_ids.length ?? 0} already visible</span>
        <span>{frontier?.exhausted ? `Exhausted${frontier.reason ? `: ${frontier.reason}` : ''}` : 'Continuation ready'}</span>
      </div>

      <div className="observatory-map-grid">
        <main className="map-stage observatory-map-stage">
          {error && (
            <div className="map-state-banner danger">
              <AlertTriangle size={18} />
              <span>{sanitizeMapText(error)}</span>
              <button type="button" className="map-icon-button compact" onClick={onRefresh} title="Retry">
                <RefreshCw size={14} />
              </button>
            </div>
          )}
          {data && <MapCanvas nodes={data.nodes} edges={data.edges} state={data.state} selection={selection} onSelect={onSelect} />}
        </main>

        <aside className="observatory-map-inspector" aria-label="Map frontier inspector">
          {selectedNode ? (
            <>
              <span className="badge badge-primary">{selectedNode.kind}</span>
              <h3>{sanitizeMapText(selectedNode.label)}</h3>
              <p>{sanitizeMapText(selectedNode.snippet) || 'No public snippet available.'}</p>
              <dl className="map-provenance">
                <div><dt>Project</dt><dd>{selectedNode.project || 'Any'}</dd></div>
                <div><dt>Topic</dt><dd>{selectedNode.topic_key || 'None'}</dd></div>
                <div><dt>Type</dt><dd>{selectedNode.type || 'n/a'}</dd></div>
              </dl>
              <div className="map-inspector-actions">
                <button type="button" className="map-load-button" onClick={() => onExpand(selectedNode.id)} disabled={frontier?.exhausted}>
                  <GitBranch size={15} />
                  Expand
                </button>
                <button type="button" className="map-link-button" onClick={() => onPivot(selectedNode.id, 'timeline')}>Timeline</button>
                <button type="button" className="map-link-button" onClick={() => onPivot(selectedNode.id, 'ledger')}>Ledger</button>
              </div>
            </>
          ) : (
            <div className="map-inspector-empty">
              <MapIcon size={24} />
              <p>Select a node or pivot from recall to inspect frontier provenance.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
