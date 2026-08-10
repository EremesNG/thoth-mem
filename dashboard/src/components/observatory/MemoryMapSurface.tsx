import { AlertTriangle, ChevronLeft, ChevronRight, CircleX, Eye, GitBranch, Layers, Loader2, Map as MapIcon, Maximize2, Minus, Pause, Play, Plus, RefreshCw, RotateCcw } from 'lucide-react';

import type { ObservatoryFrontierState } from '../../api/client.js';
import MapCanvas from '../map/MapCanvas.js';
import type { MapData, MapSelection } from '../map/map-types.js';
import { sanitizeMapText } from '../map/map-state.js';
import GraphNavigator from '../map/GraphNavigator.js';
import type { GraphCommand, GraphViewportCommand } from '../map/map-navigation.js';
import { deriveGraphPhase } from './resource-state.js';
import ResourceStateNotice from './ResourceStateNotice.js';

interface MemoryMapSurfaceProps {
  data: MapData | null;
  selection: MapSelection;
  frontier: ObservatoryFrontierState | null;
  focusNodeId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (selection: MapSelection) => void;
  onExpand: (nodeId: string) => void;
  onRefresh: () => void;
  command: { id: number; type: GraphViewportCommand } | null;
  onCommand: (type: GraphCommand) => void;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
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
  onRefresh,
  command,
  onCommand,
  paused,
  onPausedChange,
}: MemoryMapSurfaceProps) {
  const selectedNodeId = selection?.kind === 'node' ? selection.id : focusNodeId;
  const phase = deriveGraphPhase({ loading, hasData:Boolean(data), nodeCount:data?.nodes.length??0, dense:data?.state==='dense', truncated:Boolean(data?.truncated), exhausted:Boolean(frontier?.exhausted), degraded:data?.health.semantic_state==='degraded', error:Boolean(error) });

  return (
    <section className="observatory-map-surface" aria-labelledby="map-heading" data-testid="memory-map-surface" data-resource-phase={phase}>
      <div className="observatory-panel-header">
        <div>
          <span className="observatory-kicker"><MapIcon size={14} /> Memory Map</span>
          <h2 id="map-heading">Explore your memory universe</h2>
        </div>
        <div className="map-health-strip">
          {loading ? <Loader2 className="spin-icon" size={16} /> : <Layers size={16} />}
          <span>{data ? `${data.nodes.length} memories · ${data.edges.length} connections` : 'Gathering memories'}</span>
        </div>
      </div>

      <div className="observatory-frontier-strip" aria-live="polite" data-exhausted={String(Boolean(frontier?.exhausted))}>
        <strong>{frontier?.added_node_ids.length ? `${frontier.added_node_ids.length} new memories revealed` : 'Your current memory neighborhood'}</strong>
        <span>{frontier?.exhausted ? 'You have reached the edge of this trail' : 'More related memories are available'}</span>
      </div>
      <ResourceStateNotice phase={phase} onAction={onRefresh} />

      <div className="observatory-map-layer">
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
          {data && <MapCanvas nodes={data.nodes} edges={data.edges} state={data.state} selection={selection} onSelect={onSelect} command={command} paused={paused} onPausedChange={onPausedChange} semanticState={data.health.semantic_state} truncated={data.truncated} />}
          <div className="atlas-control-cluster" aria-label="Neural Atlas controls">
            <div className="graph-command-bar" role="toolbar" aria-label="Memory map view controls">
              <button type="button" onClick={() => onCommand('fit')} title="Fit visible nodes (0)" aria-label="Fit all memories"><Maximize2 /></button>
              <button type="button" onClick={() => onCommand('zoom-in')} title="Zoom in (+)" aria-label="Zoom in"><Plus /></button>
              <button type="button" onClick={() => onCommand('zoom-out')} title="Zoom out (-)" aria-label="Zoom out"><Minus /></button>
              <button type="button" onClick={() => onCommand('reset')} title="Reset viewport (R)" aria-label="Reset view"><RotateCcw /></button>
              <button type="button" className={paused ? 'active' : ''} onClick={() => onCommand('toggle-pause')} title="Pause or resume (P)" aria-label={paused ? 'Resume motion' : 'Pause motion'}>{paused ? <Play /> : <Pause />}</button>
            </div>
            <div className="graph-pan-pad" role="toolbar" aria-label="Move around the memory map">
              <button type="button" onClick={() => onCommand('pan-left')} title="Pan left (H)" aria-label="Move left">←</button>
              <button type="button" onClick={() => onCommand('pan-up')} title="Pan up (K)" aria-label="Move up">↑</button>
              <button type="button" onClick={() => onCommand('pan-down')} title="Pan down (J)" aria-label="Move down">↓</button>
              <button type="button" onClick={() => onCommand('pan-right')} title="Pan right (L)" aria-label="Move right">→</button>
            </div>
            <div className="graph-trail-bar" data-active={String(Boolean(selectedNodeId))} role="toolbar" aria-label="Explore the selected memory trail">
              <button type="button" onClick={() => onCommand('previous')} title="Previous connected memory (Arrow Left)"><ChevronLeft /><span>Previous</span></button>
              <button type="button" onClick={() => onCommand('next')} title="Next connected memory (Arrow Right)"><ChevronRight /><span>Next</span></button>
              <button type="button" onClick={() => onCommand('select')} disabled={!selectedNodeId} title="Open memory overview (Enter)"><Eye /><span>Details</span></button>
              <button type="button" className="primary" onClick={() => onCommand('expand')} disabled={!selectedNodeId} title="Expand selected memory (E)"><GitBranch /><span>Explore connections</span></button>
              <button type="button" onClick={() => onCommand('clear')} title="Clear focus (Escape)" aria-label="Clear selected memory"><CircleX /></button>
            </div>
          </div>
        </main>
      </div>
      {data && <GraphNavigator nodes={data.nodes} edges={data.edges} focusNodeId={selectedNodeId ?? null} onFocus={(id) => onSelect({ kind: 'node', id })} onExpand={onExpand} />}
    </section>
  );
}
