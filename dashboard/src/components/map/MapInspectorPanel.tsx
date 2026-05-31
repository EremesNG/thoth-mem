import { ExternalLink, GitBranch, Info, Loader2, Network, X } from 'lucide-react';

import type { MapData, MapSelection, InspectorDetails } from './map-types.js';
import { sanitizeMapText, toMapNodeUrl } from './map-state.js';

interface MapInspectorPanelProps {
  data: MapData | null;
  selection: MapSelection;
  details: InspectorDetails;
  loading: boolean;
  onClose: () => void;
  onExpand: (nodeId: string) => void;
}

export default function MapInspectorPanel({ data, selection, details, loading, onClose, onExpand }: MapInspectorPanelProps) {
  const selectedNode = selection?.kind === 'node' ? data?.nodes.find((node) => node.id === selection.id) : null;
  const selectedEdge = selection?.kind === 'edge' ? data?.edges.find((edge) => edge.id === selection.id) : null;
  const nodeUrl = selectedNode ? toMapNodeUrl(selectedNode) : null;

  return (
    <aside className={`map-inspector ${selection ? 'open' : ''}`} aria-label="Map inspector">
      <div className="map-panel-heading">
        <Info size={16} />
        <span>Inspector</span>
        {selection && (
          <button type="button" className="map-icon-button compact" onClick={onClose} title="Close inspector">
            <X size={14} />
          </button>
        )}
      </div>

      {!selection && (
        <div className="map-inspector-empty">
          <Network size={24} />
          <p>Select a node to inspect provenance, snippets, and related memory.</p>
        </div>
      )}

      {selection && loading && (
        <div className="map-inspector-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading provenance...</p>
        </div>
      )}

      {selectedNode && !loading && (
        <div className="map-inspector-body">
          <span className="badge badge-primary">{selectedNode.kind}</span>
          <h2>{sanitizeMapText(details?.kind === 'node' ? details.details.label : selectedNode.label)}</h2>
          <p>{sanitizeMapText(details?.kind === 'node' ? details.details.snippet : selectedNode.snippet) || 'No public snippet available.'}</p>

          <dl className="map-provenance">
            <div><dt>Project</dt><dd>{selectedNode.project || 'Any'}</dd></div>
            <div><dt>Topic</dt><dd>{selectedNode.topic_key || 'None'}</dd></div>
            <div><dt>Type</dt><dd>{selectedNode.type || 'n/a'}</dd></div>
          </dl>

          <div className="map-inspector-actions">
            <button type="button" className="map-load-button" onClick={() => onExpand(selectedNode.id)}>
              <GitBranch size={15} />
              Expand neighbors
            </button>
            {nodeUrl && (
              <a className="map-link-button" href={nodeUrl}>
                <ExternalLink size={15} />
                Open source
              </a>
            )}
          </div>
        </div>
      )}

      {selectedEdge && !loading && (
        <div className="map-inspector-body">
          <span className="badge badge-warning">{selectedEdge.relation}</span>
          <h2>{sanitizeMapText(details?.kind === 'edge' ? details.details.label : selectedEdge.label)}</h2>
          <p>{sanitizeMapText(details?.kind === 'edge' ? details.details.summary : selectedEdge.summary) || 'No public summary available.'}</p>
          <dl className="map-provenance">
            <div><dt>Source</dt><dd>{selectedEdge.source_id}</dd></div>
            <div><dt>Target</dt><dd>{selectedEdge.target_id}</dd></div>
          </dl>
        </div>
      )}
    </aside>
  );
}
