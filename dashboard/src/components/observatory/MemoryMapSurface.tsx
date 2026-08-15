import { AlertTriangle, ChevronLeft, ChevronRight, CircleX, Eye, GitBranch, Layers, Loader2, Map as MapIcon, Maximize2, Minus, Pause, Play, Plus, RefreshCw, RotateCcw } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { AtlasHierarchy, AtlasLevel, ObservatoryFrontierState, SemanticAtlasRegion, SemanticAtlasRegionBridge } from '../../api/client.js';
import MapCanvas from '../map/MapCanvas.js';
import type { MapCanvasRenderCommit } from '../map/MapCanvas.js';
import type { MapData, MapSelection } from '../map/map-types.js';
import { sanitizeMapText } from '../map/map-state.js';
import GraphNavigator from '../map/GraphNavigator.js';
import type { GraphCommand, GraphViewportCommand } from '../map/map-navigation.js';
import type { SemanticRelationshipClassFilter } from '../map/cosmos-graph-runtime.js';
import { deriveGraphPhase } from './resource-state.js';
import { FullAtlasStateNotice, SemanticAtlasStateNotice } from './ResourceStateNotice.js';
import type { FullAtlasSnapshot } from './full-atlas-loader.js';
import type { SemanticAtlasSnapshot } from './semantic-atlas-loader.js';

interface MemoryMapSurfaceProps {
  data: MapData | null;
  canvasData: MapData | null;
  selection: MapSelection;
  canvasSelection: MapSelection;
  frontier: ObservatoryFrontierState | null;
  atlasLoad: SemanticAtlasSnapshot | FullAtlasSnapshot;
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
  level: AtlasLevel | 'raw';
  hierarchy: AtlasHierarchy;
  projectId: string | null;
  projectLabel: string | null;
  communityId: string | null;
  onNavigateUniverse: () => void;
  onNavigateProject: () => void;
  onNavigateCommunity: () => void;
  onActivateProject: (projectId: string) => void;
  onPreviousProjectPage: () => void;
  onNextProjectPage: () => void;
  hasPreviousProjectPage: boolean;
  rendererReady: boolean;
  onRendererCommit: (commit: MapCanvasRenderCommit) => void;
  onPrefetchNode: (nodeId: string) => void;
  regionId: string | null;
  onActivateRegion: (regionId: string) => void;
}

export default function MemoryMapSurface({
  data,
  canvasData,
  selection,
  canvasSelection,
  frontier,
  atlasLoad,
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
  level,
  hierarchy,
  projectId,
  projectLabel,
  communityId,
  onNavigateUniverse,
  onNavigateProject,
  onNavigateCommunity,
  onActivateProject,
  onPreviousProjectPage,
  onNextProjectPage,
  hasPreviousProjectPage,
  rendererReady,
  onRendererCommit,
  onPrefetchNode,
  regionId,
  onActivateRegion,
}: MemoryMapSurfaceProps) {
  const [relationshipClasses, setRelationshipClasses] = useState<SemanticRelationshipClassFilter[]>(['semantic', 'fact', 'metadata']);
  const toggleRelationshipClass = (relationshipClass: SemanticRelationshipClassFilter) => {
    setRelationshipClasses((current) => current.includes(relationshipClass)
      ? current.filter((candidate) => candidate !== relationshipClass)
      : [...current, relationshipClass]);
  };
  const selectedNodeId = selection?.kind === 'node' ? selection.id : focusNodeId;
  const phase = deriveGraphPhase({ loading, hasData:Boolean(data), nodeCount:data?.nodes.length??0, dense:data?.state==='dense', truncated:Boolean(data?.truncated), exhausted:Boolean(frontier?.exhausted), degraded:data?.health.semantic_state==='degraded', error:Boolean(error) });
  const presentedAtlasPhase = level !== 'raw' && atlasLoad.phase === 'complete' && !rendererReady
    ? 'streaming'
    : atlasLoad.phase;
  const atlasBusy = presentedAtlasPhase === 'initial' || presentedAtlasPhase === 'streaming' || presentedAtlasPhase === 'restarting';
  const counts = data?.atlas?.counts;
  const levelTitle = level === 'universe'
    ? hierarchy === 'project' ? 'Explore your project nebulae' : 'Survey your memory universe'
    : level === 'project'
      ? 'Explore this project’s constellations'
    : level === 'community'
      ? 'Explore this constellation'
      : level === 'neighborhood'
        ? 'Follow this memory’s synapses'
        : 'Inspect the Raw graph';
  const countSummary = level === 'raw'
    ? `${data?.nodes.length.toLocaleString() ?? 0} graph entities · ${data?.edges.length.toLocaleString() ?? 0} relationships`
    : counts
    ? level === 'universe' && data?.atlas?.hierarchy === 'project'
      ? `${data.atlas.navigation.visible_project_count.toLocaleString()} of ${data.atlas.navigation.source_project_count.toLocaleString()} projects · ${data.atlas.navigation.visible_constellation_count.toLocaleString()} visible constellations · ${data.atlas.navigation.omitted_projects.toLocaleString()} projects on later pages`
      : level === 'project' && data?.atlas
        ? `${data.atlas.navigation.source_memory_count.toLocaleString()} memories · ${data.atlas.navigation.visible_constellation_count.toLocaleString()} of ${data.atlas.navigation.source_constellation_count.toLocaleString()} constellations`
      : level === 'community' && data?.atlas
      ? `${(data.atlas.navigation.source_memory_count ?? counts.memory_count).toLocaleString()} source memories · ${(data.atlas.regions?.length ?? 0).toLocaleString()} regions · ${(data.atlas.navigation.visible_memory_count ?? data.nodes.length).toLocaleString()} visible`
      : `${counts.memory_count.toLocaleString()} memories · ${counts.project_count.toLocaleString()} projects · ${counts.community_count.toLocaleString()} constellations`
    : 'Mapping memories';
  const focusFromNavigator = useCallback((nodeId: string) => {
    onSelect({ kind: 'node', id: nodeId });
  }, [onSelect]);
  const useProjectOverlays = level === 'universe' && data?.atlas?.hierarchy === 'project';
  const overlayRegions: SemanticAtlasRegion[] = useProjectOverlays
    ? (canvasData?.atlas?.project_regions ?? []).map((project) => ({
        id: project.id,
        community_id: project.id,
        label: project.label,
        summary: project.summary,
        member_count: project.memory_count,
        project_count: 1,
        time_from: null,
        time_to: null,
        concepts: [],
        facets: { projects: [], sessions: [], topics: [], types: [] },
        representatives: project.constellation_ids.map((nodeId, rank) => ({ node_id: nodeId, reason: 'Project constellation', signals: ['structural'], rank })),
        seed_x: project.seed_x,
        seed_y: project.seed_y,
        unclustered: project.unassigned,
      }))
    : canvasData?.atlas?.regions ?? [];
  const overlayBridges: SemanticAtlasRegionBridge[] = useProjectOverlays
    ? (canvasData?.atlas?.project_bridges ?? []).map((bridge) => ({
        ...bridge,
        source_region_id: bridge.source_project_id,
        target_region_id: bridge.target_project_id,
        tier: 'region-aggregate',
      }))
    : canvasData?.atlas?.region_bridges ?? [];

  return (
    <section
      className="observatory-map-surface"
      aria-labelledby="map-heading"
      data-testid="memory-map-surface"
      data-resource-phase={phase}
      data-atlas-load-state={presentedAtlasPhase}
      data-node-count={data?.nodes.length ?? 0}
      data-edge-count={data?.edges.length ?? 0}
      data-atlas-level={level}
      data-atlas-hierarchy={hierarchy}
      data-project-id={projectId ?? ''}
      data-community-id={communityId ?? ''}
      data-region-id={regionId ?? ''}
    >
      <div className="observatory-panel-header">
        <div>
          <span className="observatory-kicker"><MapIcon size={14} /> Semantic atlas</span>
          <h2 id="map-heading">{levelTitle}</h2>
        </div>
        <div className="map-health-strip">
          {atlasBusy ? <Loader2 className="spin-icon" size={16} /> : <Layers size={16} />}
          <span>{countSummary}</span>
        </div>
      </div>

      <nav className="atlas-breadcrumbs" aria-label="Atlas level">
        <button type="button" aria-current={level === 'universe' ? 'page' : undefined} onClick={onNavigateUniverse}>Universe</button>
        {hierarchy === 'project' && level !== 'universe' && (
          <>
            <span aria-hidden="true">/</span>
            <button type="button" aria-current={level === 'project' ? 'page' : undefined} onClick={onNavigateProject}>{projectLabel ?? 'Project'}</button>
          </>
        )}
        {(level === 'community' || level === 'neighborhood') && (
          <>
            <span aria-hidden="true">/</span>
            <button type="button" aria-current={level === 'community' ? 'page' : undefined} onClick={onNavigateCommunity}>Constellation</button>
          </>
        )}
        {level === 'neighborhood' && <><span aria-hidden="true">/</span><span aria-current="page">Neighborhood</span></>}
        {level === 'raw' && <><span aria-hidden="true">/</span><span aria-current="page">Raw diagnostics</span></>}
      </nav>

      <div className="observatory-frontier-strip" aria-live="polite" data-exhausted={String(Boolean(frontier?.exhausted))}>
        <strong>{countSummary}</strong>
        <span>{level === 'raw'
          ? 'Diagnostic entities are shown as graph entities, never as memory totals'
          : level === 'universe'
          ? hierarchy === 'project'
            ? `${data?.atlas?.navigation.visible_project_count ?? 0} project nebulae and ${data?.atlas?.navigation.visible_constellation_count ?? 0} constellation cores on this bounded page`
            : `${data?.nodes.length ?? 0} constellations summarize the complete scope`
          : level === 'project'
            ? `${data?.atlas?.navigation.visible_constellation_count ?? data?.nodes.length ?? 0} constellations belong to this project`
          : level === 'community'
            ? `${data?.atlas?.navigation.omitted_nodes ?? 0} memories omitted from this bounded working set · ${data?.atlas?.navigation.visible_relationship_count ?? data?.edges.length ?? 0} prepared relationships`
            : `${data?.nodes.length ?? 0} local memories and supporting identities`}</span>
      </div>
      {level === 'raw'
        ? <FullAtlasStateNotice phase={atlasLoad.phase === 'recovery' ? 'partial-error' : atlasLoad.phase} onRetry={onRefresh} />
        : <SemanticAtlasStateNotice phase={presentedAtlasPhase} level={level} onRetry={onRefresh} />}

      <div className="observatory-map-layer">
        <main className="map-stage observatory-map-stage">
          {error && atlasLoad.phase !== 'partial-error' && (
            <div className="map-state-banner danger">
              <AlertTriangle size={18} />
              <span>{sanitizeMapText(error)}</span>
              <button type="button" className="map-icon-button compact" onClick={onRefresh} title="Retry">
                <RefreshCw size={14} />
              </button>
            </div>
          )}
          {canvasData && <MapCanvas nodes={canvasData.nodes} edges={canvasData.edges} state={canvasData.state} selection={canvasSelection} onSelect={onSelect} command={command} paused={paused} onPausedChange={onPausedChange} semanticState={canvasData.health.semantic_state} truncated={canvasData.truncated} complete={atlasLoad.phase === 'complete'} atlasLevel={canvasData.atlas?.level ?? 'raw'} atlasGeneration={canvasData.atlas?.generation ?? 'raw'} presentationKey={canvasData.atlas?.presentation_key ?? 'raw'} onRenderCommit={onRendererCommit} presentationReady={rendererReady} presentedLevel={level} presentedGeneration={data?.atlas?.generation ?? 'pending'} presentedFocusId={selectedNodeId ?? null} presentedPointCount={data?.nodes.length ?? 0} presentedLinkCount={data?.edges.length ?? 0} onIntent={onPrefetchNode} regions={overlayRegions} regionBridges={overlayBridges} regionId={useProjectOverlays ? null : regionId} onRegionSelect={useProjectOverlays ? onActivateProject : onActivateRegion} relationshipClasses={relationshipClasses} />}
          {(data?.atlas?.region_bridges?.length ?? 0) > 0 && (
            <ul className="visually-hidden" aria-label="Aggregate region relationships">
              {data!.atlas!.region_bridges!.map((bridge) => {
                const source = data!.atlas!.regions?.find((region) => region.id === bridge.source_region_id)?.label ?? 'Region';
                const target = data!.atlas!.regions?.find((region) => region.id === bridge.target_region_id)?.label ?? 'Region';
                const provenance = bridge.provenance.map((item) => `${item.source_kind} ${item.relation}`).join(', ');
                return (
                  <li key={bridge.id}>
                    {source} to {target}: {bridge.direction}, {bridge.confidence} confidence, weight {bridge.weight.toFixed(2)}, {bridge.evidence_count} evidence items, provenance {provenance || 'unknown'}.
                  </li>
                );
              })}
            </ul>
          )}
          {(data?.atlas?.project_bridges?.length ?? 0) > 0 && (
            <ul className="visually-hidden" aria-label="Aggregate project relationships">
              {data!.atlas!.project_bridges!.map((bridge) => {
                const source = data!.atlas!.project_regions?.find((project) => project.id === bridge.source_project_id)?.label ?? 'Project';
                const target = data!.atlas!.project_regions?.find((project) => project.id === bridge.target_project_id)?.label ?? 'Project';
                const provenance = bridge.provenance.map((item) => `${item.source_kind} ${item.relation}`).join(', ');
                return (
                  <li key={bridge.id}>
                    {source} to {target}: {bridge.direction}, {bridge.confidence} confidence, weight {bridge.weight.toFixed(2)}, {bridge.evidence_count} evidence items, provenance {provenance || 'unknown'}.
                  </li>
                );
              })}
            </ul>
          )}
          {(level === 'community' || level === 'neighborhood') && (
            <div className="relationship-legend" role="group" aria-label={`${level} relationship legend and filters`}>
              <span className="relationship-legend-title">Relations</span>
              <button type="button" className="semantic" aria-pressed={relationshipClasses.includes('semantic')} onClick={() => toggleRelationshipClass('semantic')} title="Solid cyan or mint; semantic evidence, dashed when lower confidence">Semantic</button>
              <button type="button" className="fact" aria-pressed={relationshipClasses.includes('fact')} onClick={() => toggleRelationshipClass('fact')} title="Amber; directed supporting fact and provenance">Support</button>
              <button type="button" className="metadata" aria-pressed={relationshipClasses.includes('metadata')} onClick={() => toggleRelationshipClass('metadata')} title="Violet dotted; metadata context">Context</button>
              <span className="relationship-legend-help">width = weight · opacity/dash = confidence · arrow = direction · details include provenance</span>
            </div>
          )}
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
      {data && <GraphNavigator nodes={data.nodes} edges={data.edges} focusNodeId={selectedNodeId ?? null} onFocus={focusFromNavigator} onExpand={onExpand} onIntent={onPrefetchNode} level={level} regions={data.atlas?.regions ?? []} regionId={regionId} onRegionFocus={onActivateRegion} projectRegions={data.atlas?.project_regions ?? []} onProjectFocus={onActivateProject} onPreviousPage={onPreviousProjectPage} onNextPage={onNextProjectPage} hasPreviousPage={hasPreviousProjectPage} hasNextPage={Boolean(data.atlas?.continuation)} />}
    </section>
  );
}
