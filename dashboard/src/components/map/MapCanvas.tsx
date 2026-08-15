import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';

import type { AtlasLevel, SemanticAtlasRegion, SemanticAtlasRegionBridge, VizDensityState, VizEdge, VizNode, VizSemanticState } from '../../api/client.js';
import {
  buildCosmosGraphData,
  cosmosMotionConfig,
  focusCosmosGraphData,
  focusRegionCosmosGraphData,
  semanticLayoutIdentityFromPresentation,
  type CosmosGraphData,
} from './cosmos-graph-data.js';
import type {
  CosmosGraphLevel,
  CosmosGraphWorkerRequest,
  CosmosGraphWorkerResponse,
} from './cosmos-graph-worker.js';
import { responseMatchesWorkerIdentity } from './cosmos-graph-worker.js';
import {
  CosmosGraphRuntime,
  type CosmosMotionProbe,
  type CosmosNodeOverlay,
  type CosmosRegionScreenGroup,
  type CosmosRuntimeSnapshot,
  type SemanticRelationshipClassFilter,
} from './cosmos-graph-runtime.js';
import type { GraphViewportCommand } from './map-navigation.js';
import type { MapSelection } from './map-types.js';
import { buildSemanticRegionOverlays, type SemanticRegionOverlayBounds } from './semantic-region-overlay.js';

interface MapCanvasProps {
  nodes: VizNode[];
  edges: VizEdge[];
  state: VizDensityState;
  selection: MapSelection;
  onSelect: (selection: MapSelection) => void;
  command?: { id: number; type: GraphViewportCommand } | null;
  paused?: boolean;
  onPausedChange?: (paused: boolean) => void;
  semanticState?: VizSemanticState;
  truncated?: boolean;
  complete?: boolean;
  atlasLevel?: AtlasLevel | 'raw';
  atlasGeneration?: string;
  presentationKey?: string;
  onRenderCommit?: (commit: MapCanvasRenderCommit) => void;
  presentationReady?: boolean;
  presentedLevel?: AtlasLevel | 'raw';
  presentedGeneration?: string;
  presentedFocusId?: string | null;
  presentedPointCount?: number;
  presentedLinkCount?: number;
  onIntent?: (nodeId: string) => void;
  regions?: SemanticAtlasRegion[];
  regionBridges?: SemanticAtlasRegionBridge[];
  regionId?: string | null;
  onRegionSelect?: (regionId: string) => void;
  relationshipClasses?: SemanticRelationshipClassFilter[];
}

export interface MapCanvasRenderCommit {
  level: CosmosGraphLevel;
  generation: string;
  focusId: string | null;
  pointCount: number;
  presentationKey: string;
}

function semanticLevelFromLayoutIdentity(identity: string): CosmosGraphLevel {
  if (identity.startsWith('project-universe:')) return 'universe';
  if (identity.startsWith('universe:')) return 'universe';
  if (identity.startsWith('project:')) return 'project';
  if (identity.startsWith('community:')) return 'community';
  if (identity.startsWith('neighborhood:')) return 'neighborhood';
  if (identity === 'universe') return 'universe';
  return 'raw';
}

interface GraphRenderInput {
  level: CosmosGraphLevel;
  generation: string;
  layoutIdentity: string;
  nodes: VizNode[];
  edges: VizEdge[];
}

interface PendingGraphData {
  data: CosmosGraphData;
  identity: Pick<GraphRenderInput, 'level' | 'generation' | 'layoutIdentity'> | null;
}

const PROGRESSIVE_GRAPH_COMMIT_INTERVAL_MS = 1_800;
const EMPTY_GRAPH_DATA = buildCosmosGraphData([], [], null);

function sameGraphNode(left: VizNode, right: VizNode | undefined): boolean {
  return Boolean(
    right
    && left.id === right.id
    && left.kind === right.kind
    && left.label === right.label
    && left.snippet === right.snippet
    && left.project === right.project
    && left.session_id === right.session_id
    && left.topic_key === right.topic_key
    && left.type === right.type
    && left.seed_x === right.seed_x
    && left.seed_y === right.seed_y
    && left.semantic_level === right.semantic_level
    && left.community_id === right.community_id
    && left.owner_project_id === right.owner_project_id
    && left.member_count === right.member_count
    && left.project_count === right.project_count
    && left.unclustered === right.unclustered
  );
}

function sameGraphEdge(left: VizEdge, right: VizEdge | undefined): boolean {
  return Boolean(
    right
    && left.id === right.id
    && left.source_id === right.source_id
    && left.target_id === right.target_id
    && left.relation === right.relation
    && left.kind === right.kind
    && left.label === right.label
    && left.summary === right.summary
    && left.weight === right.weight
    && left.evidence_count === right.evidence_count
  );
}

function graphInputRemainsCompatible(candidate: GraphRenderInput, current: GraphRenderInput): boolean {
  if (
    candidate.level !== current.level
    || candidate.generation !== current.generation
    || candidate.layoutIdentity !== current.layoutIdentity
  ) return false;
  if (candidate.nodes.length === 0 && current.nodes.length > 0) return false;
  const currentNodes = new Map(current.nodes.map((node) => [node.id, node]));
  const currentEdges = new Map(current.edges.map((edge) => [edge.id, edge]));
  return candidate.nodes.every((node) => sameGraphNode(node, currentNodes.get(node.id)))
    && candidate.edges.every((edge) => sameGraphEdge(edge, currentEdges.get(edge.id)));
}

const initialRuntimeSnapshot: CosmosRuntimeSnapshot = {
  status: 'loading',
  motionPhase: 'idle',
  initialSettled: false,
  finalFitSettled: false,
  fitEpoch: 0,
  finalFitEpoch: -1,
  motionDiagnosticsEpoch: 0,
  datasetVersion: 0,
  lastTransition: 'none',
  lastCommand: null,
  focusId: null,
  paused: false,
  reducedMotion: false,
  zoomBand: 'overview',
  ambientStarts: 0,
  simulationStarts: 0,
  simulationEnds: 0,
  maximumTickGapMs: 0,
  maximumStepPx: 0,
  userCameraInteracted: false,
  error: null,
  worldWidth: 0,
  worldHeight: 0,
  worldAspect: 1,
  simulatedWorldWidth: 0,
  simulatedWorldHeight: 0,
  simulatedWorldAspect: 1,
  screenFieldWidth: 0,
  screenFieldHeight: 0,
  screenFieldAspect: 1,
  cameraZoom: 1,
};

function graphStatusMessage(snapshot: CosmosRuntimeSnapshot): string {
  if (snapshot.status === 'loading') return 'Gathering memories';
  if (snapshot.status === 'failed') return 'Rich view unavailable';
  if (snapshot.paused) return 'Memory map paused';
  if (snapshot.reducedMotion) return 'Calm motion mode';
  if (snapshot.motionPhase === 'settling') return 'Memories finding their place';
  if (snapshot.motionPhase === 'activating') return 'Following nearby memories';
  if (snapshot.motionPhase === 'transitioning') return 'Revealing new connections';
  return snapshot.focusId ? 'Related memories in focus' : 'Ready to explore memories';
}

export default function MapCanvas({
  nodes,
  edges,
  state,
  selection,
  onSelect,
  command,
  paused = false,
  onPausedChange,
  semanticState = 'ready',
  truncated = false,
  complete = false,
  atlasLevel,
  atlasGeneration,
  presentationKey = 'raw',
  onRenderCommit,
  presentationReady = true,
  presentedLevel = atlasLevel,
  presentedGeneration = atlasGeneration,
  presentedFocusId = null,
  presentedPointCount = nodes.length,
  presentedLinkCount = edges.length,
  onIntent,
  regions = [],
  regionBridges = [],
  regionId = null,
  onRegionSelect,
  relationshipClasses,
}: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<CosmosGraphRuntime | null>(null);
  const lifecycleGenerationRef = useRef(0);
  const onSelectRef = useRef(onSelect);
  const onPausedChangeRef = useRef(onPausedChange);
  const onRenderCommitRef = useRef(onRenderCommit);
  const onIntentRef = useRef(onIntent);
  const pausedRef = useRef(paused);
  const completeRef = useRef(complete);
  const commandRef = useRef(command);
  const handledCommandIdRef = useRef<number | null>(null);
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [graphWorkerReady, setGraphWorkerReady] = useState(false);
  const [snapshot, setSnapshot] = useState<CosmosRuntimeSnapshot>({
    ...initialRuntimeSnapshot,
    paused,
  });
  const snapshotRef = useRef(snapshot);
  const [hover, setHover] = useState<{ id: string; label: string; x: number; y: number } | null>(null);
  const [nodeOverlays, setNodeOverlays] = useState<CosmosNodeOverlay[]>([]);
  const [regionScreenLayout, setRegionScreenLayout] = useState<{
    width: number;
    height: number;
    kind: CosmosGraphData['regionKind'];
    fitEpoch: number;
    visualViewportGeneration: number;
    exclusions: SemanticRegionOverlayBounds[];
    regions: CosmosRegionScreenGroup[];
  }>({ width: 1, height: 1, kind: null, fitEpoch: -1, visualViewportGeneration: 0, exclusions: [], regions: [] });
  const [visualViewportGeneration, setVisualViewportGeneration] = useState(0);
  const visualViewportGenerationRef = useRef(0);
  const [visualViewportSynchronized, setVisualViewportSynchronized] = useState(false);
  const visualViewportFrameRef = useRef<number | null>(null);
  const [motionProbe, setMotionProbe] = useState<CosmosMotionProbe | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const reducedMotionRef = useRef(reducedMotion);
  const communityAnchorIdsRef = useRef<string[]>([]);
  const graphDataWorkerRef = useRef<Worker | null>(null);
  const graphDataRequestGenerationRef = useRef(0);
  const graphDataRequestInputsRef = useRef(new Map<number, GraphRenderInput>());
  const pendingGraphDataRef = useRef<PendingGraphData[]>([]);
  const graphDataFrameRef = useRef<number | null>(null);
  const graphDataDrainActiveRef = useRef(false);
  const appliedFocusIdRef = useRef<string | null>(null);
  const focusId = selection?.kind === 'node' ? selection.id : null;
  const focusIdRef = useRef<string | null>(focusId);
  const directlyAppliedGraphDataRef = useRef<{
    base: CosmosGraphData;
    focusId: string | null;
    regionId: string | null;
  } | null>(null);
  const renderLevel: CosmosGraphLevel = atlasLevel
    ?? nodes.find((node) => node.semantic_level)?.semantic_level
    ?? 'raw';
  const renderGeneration = atlasGeneration ?? `${renderLevel}:local`;
  const renderLayoutIdentity = semanticLayoutIdentityFromPresentation(renderLevel, presentationKey);
  const [graphRenderInput, setGraphRenderInput] = useState<GraphRenderInput>(
    () => ({ level: renderLevel, generation: renderGeneration, layoutIdentity: renderLayoutIdentity, nodes, edges }),
  );
  const rawGraphWorkerReady = graphRenderInput.level === 'raw' && graphWorkerReady;
  const graphRenderInputRef = useRef(graphRenderInput);
  const desiredGraphInputRef = useRef<GraphRenderInput>(graphRenderInput);
  const preparedGraphIdentityRef = useRef<Pick<GraphRenderInput, 'level' | 'generation' | 'layoutIdentity'> | null>(null);
  const pendingGraphRenderInputRef = useRef<GraphRenderInput | null>(null);
  const graphRenderInputTimerRef = useRef<number | null>(null);
  const lastGraphRenderCommitAtRef = useRef(performance.now());
  const lastPresentationCommitKeyRef = useRef<string | null>(null);
  const [preparedGraphData, setPreparedGraphData] = useState<CosmosGraphData>(EMPTY_GRAPH_DATA);
  const [dataApplyEpoch, setDataApplyEpoch] = useState(0);
  const graphData = useMemo(
    () => focusCosmosGraphData(focusRegionCosmosGraphData(preparedGraphData, regionId), focusId),
    [focusId, preparedGraphData, regionId],
  );
  const graphDataRef = useRef(graphData);
  const communityColors = useMemo(
    () => [...new Set(graphData.pointColors)].slice(0, 5),
    [graphData.pointColors],
  );
  const visibleRegionLabelIds = useMemo(() => {
    const limit = regionScreenLayout.width <= 480 ? 6 : regionScreenLayout.width <= 900 ? 9 : 12;
    return new Set([...regions]
      .sort((left, right) => Number(right.id === regionId) - Number(left.id === regionId)
        || right.member_count - left.member_count
        || left.id.localeCompare(right.id))
      .slice(0, limit)
      .map((region) => region.id));
  }, [regionId, regionScreenLayout.width, regions]);
  const regionOverlays = useMemo(() => {
    const width = Math.max(regionScreenLayout.width, 1);
    const height = Math.max(regionScreenLayout.height, 1);
    const screenGroups = new Map(regionScreenLayout.regions.map((region) => [region.id, region]));
    return buildSemanticRegionOverlays(regions.map((region, index) => ({
      id: region.id, label: region.label, memberCount: region.member_count,
      color: screenGroups.get(region.id)?.color
        ?? communityColors[index % Math.max(communityColors.length, 1)]
        ?? '#67e8f9',
      focused: region.id === regionId,
      points: screenGroups.get(region.id)?.points ?? [],
      cameraBound: regionScreenLayout.kind === 'project',
      labelVisible: visibleRegionLabelIds.has(region.id),
    })), { width, height }, regionScreenLayout.exclusions);
  }, [communityColors, regionId, regionScreenLayout, regions, visibleRegionLabelIds]);
  const pointSizeSummary = useMemo(() => {
    const sorted = [...graphData.pointSizes].sort((left, right) => left - right);
    return {
      minimum: sorted[0] ?? 0,
      median: sorted[Math.floor(sorted.length / 2)] ?? 0,
      maximum: sorted[sorted.length - 1] ?? 0,
    };
  }, [graphData.pointSizes]);
  const regionOverlayById = useMemo(
    () => new Map(regionOverlays.map((overlay) => [overlay.id, overlay])),
    [regionOverlays],
  );
  const nodeLabelById = useMemo(
    () => new Map(graphData.pointIds.map((id, index) => [id, graphData.pointLabels[index] ?? id])),
    [graphData.pointIds, graphData.pointLabels],
  );
  const persistentLabelNodeIds = useMemo(
    () => new Set(nodeOverlays.filter((overlay) => overlay.labelVisible).map((overlay) => overlay.id)),
    [nodeOverlays],
  );
  const visibleRegionBridges = useMemo(() => {
    if (regionId) return [];
    const diagonal = Math.hypot(regionScreenLayout.width, regionScreenLayout.height) || 1;
    return regionBridges.flatMap((bridge) => {
      const source = regionOverlayById.get(bridge.source_region_id);
      const target = regionOverlayById.get(bridge.target_region_id);
      if (!source || !target) return [];
      const distance = Math.hypot(
        source.bounds.x + source.bounds.width / 2 - target.bounds.x - target.bounds.width / 2,
        source.bounds.y + source.bounds.height / 2 - target.bounds.y - target.bounds.height / 2,
      );
      if (distance > diagonal * 0.27) return [];
      return [{ bridge, distance }];
    }).sort((left, right) => Number(right.bridge.confidence === 'high') - Number(left.bridge.confidence === 'high')
      || left.distance - right.distance
      || right.bridge.weight - left.bridge.weight
      || left.bridge.id.localeCompare(right.bridge.id))
      .slice(0, 4)
      .map(({ bridge }) => bridge);
  }, [regionBridges, regionId, regionOverlayById, regionScreenLayout.height, regionScreenLayout.width]);
  const projectUniverse = renderLevel === 'universe' && regions.length > 0;
  const regionSourcesReady = regions.length > 0
    && regionScreenLayout.kind !== null
    && regionOverlays.length === regions.length
    && regionOverlays.every((overlay) => overlay.sourcePointCount > 0);
  const inside = (bounds: SemanticRegionOverlayBounds) => (
    bounds.x >= -1
    && bounds.y >= -1
    && bounds.x + bounds.width <= regionScreenLayout.width + 1
    && bounds.y + bounds.height <= regionScreenLayout.height + 1
  );
  const intersects = (left: SemanticRegionOverlayBounds, right: SemanticRegionOverlayBounds) => (
    left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
  );
  const projectGeometryReady = regionScreenLayout.kind !== 'project' || regionOverlays.every((overlay) => (
    inside(overlay.bounds)
    && overlay.sourcePoints.every((point) => (
      point.x >= overlay.bounds.x - 1
      && point.x <= overlay.bounds.x + overlay.bounds.width + 1
      && point.y >= overlay.bounds.y - 1
      && point.y <= overlay.bounds.y + overlay.bounds.height + 1
    ))
    && (!overlay.labelVisible || (
      inside(overlay.labelBounds)
      && regionScreenLayout.exclusions.every((excluded) => !intersects(overlay.labelBounds, excluded))
    ))
  ));
  const projectFitReady = regionScreenLayout.kind !== 'project' || (
    visualViewportSynchronized
    && snapshot.finalFitSettled
    && snapshot.finalFitEpoch === snapshot.fitEpoch
    && regionScreenLayout.fitEpoch === snapshot.finalFitEpoch
    && regionScreenLayout.visualViewportGeneration === visualViewportGeneration
  );
  const regionScreenReady = regionSourcesReady && projectGeometryReady && projectFitReady;
  const finalFitPresentationSettled = snapshot.finalFitSettled
    && (regionScreenLayout.kind !== 'project' || regionScreenReady);
  const runtimePresentationReady = presentationReady
    && snapshot.datasetVersion > 0
    && snapshot.focusId === focusId;
  const linkWidthSummary = useMemo(() => ({
    minimum: graphData.linkWidths.length ? Math.min(...graphData.linkWidths) : 0,
    maximum: graphData.linkWidths.length ? Math.max(...graphData.linkWidths) : 0,
  }), [graphData.linkWidths]);
  graphDataRef.current = graphData;
  desiredGraphInputRef.current = {
    level: renderLevel,
    generation: renderGeneration,
    layoutIdentity: renderLayoutIdentity,
    nodes,
    edges,
  };
  onSelectRef.current = onSelect;
  onPausedChangeRef.current = onPausedChange;
  onRenderCommitRef.current = onRenderCommit;
  onIntentRef.current = onIntent;
  pausedRef.current = paused;
  completeRef.current = complete;
  commandRef.current = command;
  reducedMotionRef.current = reducedMotion;
  snapshotRef.current = snapshot;
  focusIdRef.current = focusId;

  const enqueueGraphData = (
    data: CosmosGraphData,
    identity = preparedGraphIdentityRef.current,
  ) => {
    pendingGraphDataRef.current = [{ data, identity }];
  };

  const commitPendingGraphRenderInput = () => {
    if (graphRenderInputTimerRef.current !== null) {
      window.clearTimeout(graphRenderInputTimerRef.current);
      graphRenderInputTimerRef.current = null;
    }
    const next = pendingGraphRenderInputRef.current;
    if (!next) return;
    pendingGraphRenderInputRef.current = null;
    graphRenderInputRef.current = next;
    lastGraphRenderCommitAtRef.current = performance.now();
    setGraphRenderInput(next);
  };

  const applyGraphDataNow = (
    runtime: CosmosGraphRuntime,
    next: PendingGraphData,
  ) => {
    const applyStartedAt = performance.now();
    runtime.setData(next.data);
    setDataApplyEpoch((current) => current + 1);
    if (hostRef.current) {
      const duration = performance.now() - applyStartedAt;
      const previousMaximum = Number(hostRef.current.dataset.maximumDataApplyMs ?? 0);
      hostRef.current.dataset.lastDataApplyMs = String(duration);
      hostRef.current.dataset.maximumDataApplyMs = String(Math.max(previousMaximum, duration));
      hostRef.current.dataset.workerAppliedPoints = String(next.data.pointIds.length);
    }
    const nextFocusId = next.data.focus ? next.data.pointIds[next.data.focus.pointIndex] : null;
    if (nextFocusId !== null || appliedFocusIdRef.current !== null) {
      runtime.focus(nextFocusId, next.data.focus);
      appliedFocusIdRef.current = nextFocusId;
    }
    if (next.identity && !next.data.nodes.some((node) => node.semantic_level)) {
      const commitAt = performance.now();
      if (hostRef.current) hostRef.current.dataset.lastRenderCommitAt = String(commitAt);
      if (typeof document !== 'undefined') {
        const commit = { level: atlasLevel, generation: atlasGeneration, regionId, focusId, presentationKey, commitAt };
        const history = JSON.parse(document.documentElement.dataset.atlasRenderCommitHistory ?? '[]') as typeof commit[];
        document.documentElement.dataset.atlasRenderCommitHistory = JSON.stringify([...history.slice(-31), commit]);
      }
      onRenderCommitRef.current?.({
        ...next.identity,
        focusId: nextFocusId,
        pointCount: next.data.pointIds.length,
        presentationKey,
      });
    }
  };

  const publishFallbackCommit = () => {
    const current = graphRenderInputRef.current;
    onRenderCommitRef.current?.({
      level: current.level,
      generation: current.generation,
      focusId: focusIdRef.current,
      pointCount: current.nodes.length,
      presentationKey,
    });
  };

  useLayoutEffect(() => {
    const runtimeIdentity = runtimeRef.current?.getDataIdentity() ?? null;
    const runtimeLevel = runtimeIdentity
      ? semanticLevelFromLayoutIdentity(runtimeIdentity.layoutIdentity)
      : null;
    const desiredPointIds = regionId
      ? graphDataRef.current.pointIds
      : nodes.map((node) => node.id);
    const pointIdentityMatches = runtimeIdentity?.pointIds.length === desiredPointIds.length
      && runtimeIdentity.pointIds.every((id, index) => id === desiredPointIds[index]);
    const blocker = !complete ? 'incomplete'
      : presentationKey === 'raw' ? 'raw'
        : lastPresentationCommitKeyRef.current === presentationKey ? 'already-committed'
          : !runtimeIdentity ? 'missing-runtime-data'
            : runtimeIdentity.layoutIdentity !== renderLayoutIdentity ? 'layout-identity'
              : runtimeLevel !== atlasLevel ? `runtime-level:${runtimeLevel ?? 'none'}->${atlasLevel}`
                : !pointIdentityMatches ? 'point-identity'
                  : snapshot.status !== 'ready' ? 'status'
                    : !snapshot.finalFitSettled ? 'final-fit'
                      : snapshot.focusId !== focusId ? 'focus'
                        : null;
    if (blocker) {
      if (hostRef.current) hostRef.current.dataset.semanticCommitBlocker = blocker;
      return;
    }
    const commitAt = performance.now();
    if (hostRef.current) {
      delete hostRef.current.dataset.semanticCommitBlocker;
      hostRef.current.dataset.lastRenderCommitAt = String(commitAt);
    }
    const committedLevel = runtimeLevel!;
    const committedGeneration = atlasGeneration!;
    const commit = { level: committedLevel, generation: committedGeneration, regionId, focusId, presentationKey, commitAt };
    const history = JSON.parse(document.documentElement.dataset.atlasRenderCommitHistory ?? '[]') as typeof commit[];
    document.documentElement.dataset.atlasRenderCommitHistory = JSON.stringify([...history.slice(-31), commit]);
    lastPresentationCommitKeyRef.current = presentationKey;
    onRenderCommitRef.current?.({
      level: committedLevel,
      generation: committedGeneration,
      focusId,
      pointCount: runtimeIdentity!.pointIds.length,
      presentationKey,
    });
  }, [atlasGeneration, atlasLevel, complete, dataApplyEpoch, focusId, graphData.pointIds.length, nodes.length, presentationKey, regionId, renderLayoutIdentity, snapshot.finalFitSettled, snapshot.focusId, snapshot.status]);

  const drainGraphData = (runtime: CosmosGraphRuntime, generation: number) => {
    if (graphDataDrainActiveRef.current) return;
    graphDataDrainActiveRef.current = true;

    const applyNext = () => {
      graphDataFrameRef.current = null;
      if (generation !== lifecycleGenerationRef.current || runtimeRef.current !== runtime) {
        graphDataDrainActiveRef.current = false;
        return;
      }
      const next = pendingGraphDataRef.current.shift();
      if (!next) {
        graphDataDrainActiveRef.current = false;
        if (completeRef.current) runtime.completeDataset();
        return;
      }

      applyGraphDataNow(runtime, next);

      if (pendingGraphDataRef.current.length > 0) {
        graphDataFrameRef.current = requestAnimationFrame(applyNext);
      } else {
        graphDataDrainActiveRef.current = false;
        if (completeRef.current) runtime.completeDataset();
      }
    };

    graphDataFrameRef.current = requestAnimationFrame(applyNext);
  };

  const acceptPreparedGraphResponse = (response: CosmosGraphWorkerResponse) => {
    const requestInput = graphDataRequestInputsRef.current.get(response.requestId);
    graphDataRequestInputsRef.current.delete(response.requestId);
    const compatible = Boolean(
      requestInput
      && responseMatchesWorkerIdentity(response, {
        requestId: response.requestId,
        level: requestInput.level,
        generation: requestInput.generation,
        layoutIdentity: requestInput.layoutIdentity,
      })
      && graphInputRemainsCompatible(requestInput, desiredGraphInputRef.current),
    );
    if (!requestInput || !compatible) return;
    if (!response.ok) {
      if (response.requestId !== graphDataRequestGenerationRef.current) return;
      setSnapshot((current) => ({
        ...current,
        status: 'failed',
        motionPhase: 'idle',
        error: response.error,
      }));
      return;
    }

    communityAnchorIdsRef.current = response.graphData.communityAnchorIds;
    const identity = {
      level: response.level,
      generation: response.generation,
      layoutIdentity: response.layoutIdentity,
    };
    preparedGraphIdentityRef.current = identity;
    const preparedFocusId = focusIdRef.current;
    const focusedGraphData = focusCosmosGraphData(focusRegionCosmosGraphData(response.graphData, regionId), preparedFocusId);
    graphDataRef.current = focusedGraphData;
    setPreparedGraphData(response.graphData);

    const runtime = runtimeRef.current;
    if (!runtime) {
      if (snapshotRef.current.status === 'failed') publishFallbackCommit();
      return;
    }
    if (graphDataFrameRef.current !== null) cancelAnimationFrame(graphDataFrameRef.current);
    graphDataFrameRef.current = null;
    graphDataDrainActiveRef.current = false;
    pendingGraphDataRef.current = [];
    const shouldYieldSemanticReplacement = response.level === 'neighborhood'
      || (response.level === 'community' && regionId !== null);
    if (shouldYieldSemanticReplacement) {
      enqueueGraphData(focusedGraphData, identity);
      drainGraphData(runtime, lifecycleGenerationRef.current);
    } else {
      applyGraphDataNow(runtime, { data: focusedGraphData, identity });
      if (completeRef.current) runtime.completeDataset();
    }
    directlyAppliedGraphDataRef.current = {
      base: response.graphData,
      focusId: preparedFocusId,
      regionId,
    };
  };

  useEffect(() => {
    const worker = new Worker(new URL('./cosmos-graph-worker.ts', import.meta.url), { type: 'module' });
    graphDataWorkerRef.current = worker;
    setGraphWorkerReady(true);
    const handleMessage = (event: MessageEvent<CosmosGraphWorkerResponse>) => {
      acceptPreparedGraphResponse(event.data);
    };
    const handleError = () => {
      graphDataRequestInputsRef.current.clear();
      publishFallbackCommit();
      setSnapshot((current) => ({
        ...current,
        status: 'failed',
        motionPhase: 'idle',
        error: 'The memory constellation could not be prepared.',
      }));
    };
    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    return () => {
      graphDataRequestGenerationRef.current += 1;
      graphDataRequestInputsRef.current.clear();
      graphDataWorkerRef.current = null;
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.terminate();
    };
  }, []);

  useLayoutEffect(() => {
    const worker = graphDataWorkerRef.current;
    if (!worker && graphRenderInput.level === 'raw') return;
    runtimeRef.current?.prepareDataTransition();
    const requestId = ++graphDataRequestGenerationRef.current;
    graphDataRequestInputsRef.current.set(requestId, graphRenderInput);
    const request: CosmosGraphWorkerRequest = {
      requestId,
      level: graphRenderInput.level,
      generation: graphRenderInput.generation,
      layoutIdentity: graphRenderInput.layoutIdentity,
      nodes: graphRenderInput.nodes,
      edges: graphRenderInput.edges,
      previousCommunityAnchorIds: communityAnchorIdsRef.current,
    };
    if (graphRenderInput.level !== 'raw' && graphRenderInput.nodes.length <= 300) {
      acceptPreparedGraphResponse({
        requestId,
        level: graphRenderInput.level,
        generation: graphRenderInput.generation,
        layoutIdentity: graphRenderInput.layoutIdentity,
        ok: true,
        graphData: buildCosmosGraphData(
          graphRenderInput.nodes,
          graphRenderInput.edges,
          null,
          communityAnchorIdsRef.current,
          graphRenderInput.layoutIdentity,
        ),
      });
      return;
    }
    worker!.postMessage(request);
  }, [graphRenderInput, rawGraphWorkerReady]);

  useLayoutEffect(() => {
    const current = graphRenderInputRef.current;
    if (
      current.nodes === nodes
      && current.edges === edges
      && current.level === renderLevel
      && current.generation === renderGeneration
      && current.layoutIdentity === renderLayoutIdentity
    ) return;
    pendingGraphRenderInputRef.current = {
      level: renderLevel,
      generation: renderGeneration,
      layoutIdentity: renderLayoutIdentity,
      nodes,
      edges,
    };
    const semanticIdentityChanged = current.level !== renderLevel
      || current.generation !== renderGeneration
      || current.layoutIdentity !== renderLayoutIdentity;
    const firstIdentityChanged = current.nodes[0]?.id !== nodes[0]?.id;
    const lastIdentityChanged = current.nodes[current.nodes.length - 1]?.id !== nodes[nodes.length - 1]?.id;
    const shouldCommitImmediately = semanticIdentityChanged
      || complete
      || (current.nodes.length === 0 && nodes.length > 0)
      || nodes.length < current.nodes.length
      || edges.length < current.edges.length
      || (nodes.length === current.nodes.length && (firstIdentityChanged || lastIdentityChanged));

    if (shouldCommitImmediately) {
      commitPendingGraphRenderInput();
      return;
    }
    if (graphRenderInputTimerRef.current !== null) return;
    const elapsed = performance.now() - lastGraphRenderCommitAtRef.current;
    const delay = Math.max(0, PROGRESSIVE_GRAPH_COMMIT_INTERVAL_MS - elapsed);
    graphRenderInputTimerRef.current = window.setTimeout(commitPendingGraphRenderInput, delay);
  }, [complete, edges, nodes, renderGeneration, renderLayoutIdentity, renderLevel]);

  useEffect(() => () => {
    if (graphRenderInputTimerRef.current !== null) {
      window.clearTimeout(graphRenderInputTimerRef.current);
      graphRenderInputTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    const workspace = hostRef.current?.closest<HTMLElement>('[data-testid="neural-atlas-workspace"]');
    const generation = Number(workspace?.dataset.visualViewportGeneration ?? 0);
    const synchronizedGeneration = Number.isFinite(generation) && generation >= 0 ? generation : 0;
    visualViewportGenerationRef.current = synchronizedGeneration;
    setVisualViewportGeneration(synchronizedGeneration);
    setVisualViewportSynchronized(true);
  }, []);

  useEffect(() => {
    const eventGeneration = (event: Event) => {
      const detail = (event as CustomEvent<{ generation?: unknown }>).detail;
      return typeof detail?.generation === 'number' && Number.isFinite(detail.generation)
        ? detail.generation
        : null;
    };
    const handleViewportWillChange = (event: Event) => {
      const generation = eventGeneration(event);
      if (generation === null || generation <= visualViewportGenerationRef.current) return;
      if (!runtimeRef.current) {
        visualViewportGenerationRef.current = generation;
        setVisualViewportGeneration(generation);
        return;
      }
      flushSync(() => {
        visualViewportGenerationRef.current = generation;
        setVisualViewportGeneration(generation);
        runtimeRef.current?.beginVisualViewportChange();
      });
    };
    const handleViewportChange = (event: Event) => {
      const generation = eventGeneration(event);
      if (generation === null || generation !== visualViewportGenerationRef.current) return;
      if (visualViewportFrameRef.current !== null) cancelAnimationFrame(visualViewportFrameRef.current);
      visualViewportFrameRef.current = requestAnimationFrame(() => {
        visualViewportFrameRef.current = null;
        if (generation !== visualViewportGenerationRef.current) return;
        runtimeRef.current?.completeVisualViewportChange();
      });
    };
    window.addEventListener('thoth:visual-viewport-will-change', handleViewportWillChange);
    window.addEventListener('thoth:visual-viewport-change', handleViewportChange);
    const workspace = hostRef.current?.closest<HTMLElement>('[data-testid="neural-atlas-workspace"]');
    const mountedGeneration = Number(workspace?.dataset.visualViewportGeneration ?? 0);
    if (Number.isFinite(mountedGeneration) && mountedGeneration > visualViewportGenerationRef.current) {
      visualViewportGenerationRef.current = mountedGeneration;
      setVisualViewportGeneration(mountedGeneration);
    }
    return () => {
      window.removeEventListener('thoth:visual-viewport-will-change', handleViewportWillChange);
      window.removeEventListener('thoth:visual-viewport-change', handleViewportChange);
      if (visualViewportFrameRef.current !== null) cancelAnimationFrame(visualViewportFrameRef.current);
      visualViewportFrameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const generation = ++lifecycleGenerationRef.current;
    let cancelled = false;
    setSnapshot({ ...initialRuntimeSnapshot, paused, reducedMotion });
    setHover(null);
    setNodeOverlays([]);
    setRegionScreenLayout({
      width: host.clientWidth,
      height: host.clientHeight,
      kind: null,
      fitEpoch: -1,
      visualViewportGeneration: visualViewportGenerationRef.current,
      exclusions: [],
      regions: [],
    });
    setMotionProbe(null);

    CosmosGraphRuntime.create(
      host,
      {
        onSelect: (nextSelection) => onSelectRef.current(nextSelection),
        onHover: (nextHover) => {
          setHover(nextHover);
          if (nextHover) onIntentRef.current?.(nextHover.id);
        },
        onNodeOverlays: (nextOverlays) => {
          if (!cancelled && generation === lifecycleGenerationRef.current) setNodeOverlays(nextOverlays);
        },
        onRegionPoints: (nextLayout) => {
          if (!cancelled && generation === lifecycleGenerationRef.current) {
            const hostBounds = host.getBoundingClientRect();
            const scaleX = nextLayout.width / Math.max(1, hostBounds.width);
            const scaleY = nextLayout.height / Math.max(1, hostBounds.height);
            const exclusions = (nextLayout.kind === 'project'
              ? [...document.querySelectorAll('.map-health-strip, .observatory-frontier-strip, .atlas-breadcrumbs')]
              : []).flatMap((element) => {
              const bounds = element.getBoundingClientRect();
              const left = Math.max(hostBounds.left, bounds.left);
              const top = Math.max(hostBounds.top, bounds.top);
              const right = Math.min(hostBounds.right, bounds.right);
              const bottom = Math.min(hostBounds.bottom, bounds.bottom);
              return right > left && bottom > top
                ? [{
                    x: (left - hostBounds.left) * scaleX,
                    y: (top - hostBounds.top) * scaleY,
                    width: (right - left) * scaleX,
                    height: (bottom - top) * scaleY,
                  }]
                : [];
            });
            setRegionScreenLayout({
              ...nextLayout,
              visualViewportGeneration: visualViewportGenerationRef.current,
              exclusions,
            });
          }
        },
        onMotionProbe: (nextProbe) => {
          if (!cancelled && generation === lifecycleGenerationRef.current) setMotionProbe(nextProbe);
        },
        onSnapshot: (nextSnapshot) => {
          if (!cancelled && generation === lifecycleGenerationRef.current) {
            if (nextSnapshot.status === 'failed') publishFallbackCommit();
            setSnapshot(nextSnapshot);
          }
        },
      },
      {
        reducedMotion,
        paused,
        motion: cosmosMotionConfig(reducedMotion),
      },
    )
      .then((runtime) => {
        if (cancelled || generation !== lifecycleGenerationRef.current) {
          runtime.destroy();
          return;
        }
        runtimeRef.current = runtime;
        const currentReducedMotion = reducedMotionRef.current;
        runtime.setReducedMotion(currentReducedMotion, cosmosMotionConfig(currentReducedMotion));
        runtime.setPaused(pausedRef.current);
        const pendingCommand = commandRef.current;
        if (
          pendingCommand
          && pendingCommand.type !== 'toggle-pause'
          && handledCommandIdRef.current !== pendingCommand.id
        ) {
          handledCommandIdRef.current = pendingCommand.id;
          runtime.command(pendingCommand.type);
        }
        if (pendingGraphDataRef.current.length === 0) {
          enqueueGraphData(graphDataRef.current, {
            level: graphRenderInputRef.current.level,
            generation: graphRenderInputRef.current.generation,
            layoutIdentity: graphRenderInputRef.current.layoutIdentity,
          });
        }
        drainGraphData(runtime, generation);
      })
      .catch((cause: unknown) => {
        if (cancelled || generation !== lifecycleGenerationRef.current) return;
        const message = cause instanceof Error ? cause.message : 'The rich memory constellation could not start.';
        publishFallbackCommit();
        setSnapshot((current) => ({ ...current, status: 'failed', error: message, motionPhase: 'idle' }));
      });

    return () => {
      cancelled = true;
      lifecycleGenerationRef.current += 1;
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      if (graphDataFrameRef.current !== null) cancelAnimationFrame(graphDataFrameRef.current);
      graphDataFrameRef.current = null;
      graphDataDrainActiveRef.current = false;
      pendingGraphDataRef.current = [];
      preparedGraphIdentityRef.current = null;
      appliedFocusIdRef.current = null;
      runtime?.destroy();
      host.replaceChildren();
    };
  }, [runtimeKey]);

  useEffect(() => {
    const desired = desiredGraphInputRef.current;
    if (
      semanticLevelFromLayoutIdentity(graphData.layoutIdentity) !== desired.level
      || graphData.pointIds.length !== desired.nodes.length
      || graphData.pointIds.some((id, index) => id !== desired.nodes[index]?.id)
    ) return;
    const direct = directlyAppliedGraphDataRef.current;
    if (direct?.base === preparedGraphData && direct.focusId === focusId && direct.regionId === regionId) return;
    directlyAppliedGraphDataRef.current = {
      base: preparedGraphData,
      focusId,
      regionId,
    };
    enqueueGraphData(graphData);
    const runtime = runtimeRef.current;
    if (runtime) drainGraphData(runtime, lifecycleGenerationRef.current);
  }, [graphData]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (
      complete
      && graphRenderInput.nodes === nodes
      && graphRenderInput.edges === edges
      && runtime
      && !graphDataDrainActiveRef.current
      && pendingGraphDataRef.current.length === 0
    ) {
      runtime.completeDataset();
    }
  }, [complete, edges, graphRenderInput, nodes]);

  useEffect(() => {
    runtimeRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    runtimeRef.current?.setReducedMotion(reducedMotion, cosmosMotionConfig(reducedMotion));
  }, [reducedMotion]);

  useEffect(() => {
    runtimeRef.current?.setRelationshipClasses(relationshipClasses ?? ['semantic', 'fact', 'metadata']);
  }, [relationshipClasses]);

  useEffect(() => {
    if (!command) return;
    if (handledCommandIdRef.current === command.id) return;
    if (command.type === 'toggle-pause') {
      handledCommandIdRef.current = command.id;
      onPausedChangeRef.current?.(!pausedRef.current);
      return;
    }
    const runtime = runtimeRef.current;
    if (!runtime) return;
    handledCommandIdRef.current = command.id;
    runtime.command(command.type);
  }, [command]);

  return (
    <div
      className="map-canvas-shell"
      data-testid="map-canvas-shell"
      data-renderer="cosmos"
      data-graph-preparation={graphRenderInput.level !== 'raw' && graphRenderInput.nodes.length <= 300 ? 'inline' : 'worker'}
      data-atlas-level={presentationReady ? graphRenderInput.level : presentedLevel}
      data-atlas-generation={presentationReady ? graphRenderInput.generation : presentedGeneration}
      data-presentation-ready={String(presentationReady)}
      data-visual-language="organic-neural"
      data-point-shape="circle"
      data-curved-links="true"
      data-community-count={communityColors.length}
      data-renderer-status={snapshot.status === 'ready' && !runtimePresentationReady ? 'loading' : snapshot.status}
      data-renderer-error={snapshot.error ?? ''}
      data-motion-phase={snapshot.motionPhase}
      data-initial-settled={String(snapshot.initialSettled)}
      data-final-fit-settled={String(finalFitPresentationSettled)}
      data-fit-epoch={snapshot.fitEpoch}
      data-final-fit-epoch={snapshot.finalFitEpoch}
      data-region-fit-epoch={regionScreenLayout.fitEpoch}
      data-visual-viewport-generation={visualViewportGeneration}
      data-visual-viewport-synchronized={String(visualViewportSynchronized)}
      data-region-visual-viewport-generation={regionScreenLayout.visualViewportGeneration}
      data-motion-diagnostics-epoch={snapshot.motionDiagnosticsEpoch}
      data-dataset-version={snapshot.datasetVersion}
      data-last-transition={snapshot.lastTransition}
      data-last-command={snapshot.lastCommand ?? ''}
      data-focus-id={(runtimePresentationReady ? snapshot.focusId : presentedFocusId) ?? ''}
      data-paused={String(snapshot.paused)}
      data-reduced-motion={String(reducedMotion)}
      data-ambient-starts={snapshot.ambientStarts}
      data-simulation-starts={snapshot.simulationStarts}
      data-simulation-ends={snapshot.simulationEnds}
      data-maximum-tick-gap={snapshot.maximumTickGapMs}
      data-maximum-step={snapshot.maximumStepPx}
      data-user-camera-interacted={String(snapshot.userCameraInteracted)}
      data-quality={graphData.quality.level}
      data-point-count={presentationReady ? graphData.pointIds.length : presentedPointCount}
      data-link-count={presentationReady ? graphData.linkIds.length : presentedLinkCount}
      data-region-count={regions.length}
      data-region-bridge-count={regionBridges.length}
      data-region-kind={regionScreenLayout.kind ?? 'none'}
      data-region-screen-ready={String(regionScreenReady)}
      data-region-host-width={regionScreenLayout.width}
      data-region-host-height={regionScreenLayout.height}
      data-rendered-internal-link-count={snapshot.zoomBand === 'exploration' ? graphData.linkIds.length : 0}
      data-zoom-band={snapshot.zoomBand}
      data-complete={String(complete)}
      data-transition-duration={cosmosMotionConfig(reducedMotion).transitionDuration}
      data-world-width={snapshot.worldWidth}
      data-world-height={snapshot.worldHeight}
      data-world-aspect={snapshot.worldAspect}
      data-simulated-world-width={snapshot.simulatedWorldWidth}
      data-simulated-world-height={snapshot.simulatedWorldHeight}
      data-simulated-world-aspect={snapshot.simulatedWorldAspect}
      data-screen-field-width={snapshot.screenFieldWidth}
      data-screen-field-height={snapshot.screenFieldHeight}
      data-screen-field-aspect={snapshot.screenFieldAspect}
      data-camera-zoom={snapshot.cameraZoom}
      data-point-min={pointSizeSummary.minimum}
      data-point-median={pointSizeSummary.median}
      data-point-max={pointSizeSummary.maximum}
      data-link-min={linkWidthSummary.minimum}
      data-link-max={linkWidthSummary.maximum}
      data-motion-probe={motionProbe ? JSON.stringify(motionProbe) : undefined}
      data-density={state}
      data-semantic-state={semanticState}
      data-truncated={String(truncated)}
    >
      {!projectUniverse ? (
        <div className="cosmos-nebula-field" aria-hidden="true">
          {communityColors.map((color, index) => (
            <span
              key={`${color}-${index}`}
              style={{ '--nebula-color': color, '--nebula-index': index } as CSSProperties}
            />
          ))}
        </div>
      ) : null}
      <div
        ref={hostRef}
        className="map-canvas cosmos-graph-host"
        data-testid="map-canvas"
        role="group"
        aria-label="Memory constellation"
        aria-describedby="graph-keyboard-help"
      />
      {regionOverlays.length > 0 ? (
        <svg className="semantic-region-layer" viewBox={`0 0 ${Math.max(regionScreenLayout.width, 1)} ${Math.max(regionScreenLayout.height, 1)}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="region-flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 1 1 L 9 5 L 1 9 Z" />
            </marker>
          </defs>
          {visibleRegionBridges.map((bridge) => {
            const source = regionOverlayById.get(bridge.source_region_id);
            const target = regionOverlayById.get(bridge.target_region_id);
            if (!source || !target) return null;
            const sourceX = source.bounds.x + source.bounds.width / 2;
            const sourceY = source.bounds.y + source.bounds.height / 2;
            const targetX = target.bounds.x + target.bounds.width / 2;
            const targetY = target.bounds.y + target.bounds.height / 2;
            const dx = targetX - sourceX;
            const dy = targetY - sourceY;
            const distance = Math.max(1, Math.hypot(dx, dy));
            const bend = Math.min(42, Math.max(12, distance * 0.09));
            const controlX = (sourceX + targetX) / 2 - (dy / distance) * bend;
            const controlY = (sourceY + targetY) / 2 + (dx / distance) * bend;
            const bridgeStyle = {
              '--bridge-width': `${Math.min(2.2, 0.7 + Math.log2(Math.max(1, bridge.weight) + 1) * 0.28)}px`,
              '--bridge-opacity': bridge.confidence === 'high' ? 0.48 : bridge.confidence === 'medium' ? 0.34 : bridge.confidence === 'low' ? 0.22 : 0.16,
            } as CSSProperties;
            return (
              <path
                key={bridge.id}
                className="semantic-region-bridge"
                d={`M ${sourceX.toFixed(2)} ${sourceY.toFixed(2)} Q ${controlX.toFixed(2)} ${controlY.toFixed(2)} ${targetX.toFixed(2)} ${targetY.toFixed(2)}`}
                data-bridge-id={bridge.id}
                data-confidence={bridge.confidence}
                data-direction={bridge.direction}
                style={bridgeStyle}
                markerEnd={bridge.direction === 'directed' || bridge.direction === 'mixed' ? 'url(#region-flow-arrow)' : undefined}
              />
            );
          })}
          {regionOverlays.map((overlay) => (
            <g
              key={overlay.id}
              data-region-id={overlay.id}
              data-region-kind={regionScreenLayout.kind ?? 'none'}
              data-focused={String(overlay.focused)}
              data-label-visible={String(overlay.labelVisible)}
              data-source-point-count={overlay.sourcePointCount}
              data-source-points={JSON.stringify(overlay.sourcePoints)}
              data-region-bounds={JSON.stringify(overlay.bounds)}
              data-label-bounds={JSON.stringify(overlay.labelBounds)}
              style={{ '--region-color': overlay.color } as CSSProperties}
            >
              <path
                d={overlay.path}
                data-role="region-contour"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onRegionSelect?.(overlay.id);
                }}
              />
              {overlay.labelVisible ? (
                <text
                  x={overlay.labelAnchor.x}
                  y={overlay.labelAnchor.y}
                  data-role="region-label"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onRegionSelect?.(overlay.id);
                  }}
                >
                  {overlay.label} · {overlay.memberCount}
                </text>
              ) : null}
              {overlay.sourcePoints.map((point) => {
                const nodeId = point.id;
                if (!nodeId) return null;
                return (
                  <circle
                    key={nodeId}
                    className="semantic-node-hit-target"
                    cx={point.x}
                    cy={point.y}
                    r={12}
                    data-node-id={nodeId}
                    data-persistent-label={String(persistentLabelNodeIds.has(nodeId))}
                    onPointerEnter={() => {
                      const label = nodeLabelById.get(nodeId);
                      if (!label) return;
                      setHover({ id: nodeId, label, x: point.x, y: point.y });
                      onIntentRef.current?.(nodeId);
                    }}
                    onPointerLeave={() => {
                      setHover((current) => current?.id === nodeId ? null : current);
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onSelectRef.current({ kind: 'node', id: nodeId });
                    }}
                  />
                );
              })}
            </g>
          ))}
        </svg>
      ) : null}
      <div className="cosmos-focus-layer">
        {focusId && !nodeOverlays.some((overlay) => overlay.role === 'focus') ? (() => {
          const node = nodes.find((candidate) => candidate.id === focusId);
          if (!node) return null;
          return (
            <div className="cosmos-node-overlay" data-role="focus" style={{ left: '50%', top: '50%', '--node-color': '#67e8f9', '--node-aura-size': '34px' } as CSSProperties}>
              <span className="cosmos-node-aura" data-role="focus" aria-hidden="true" />
              <span className="cosmos-node-label" data-role="focus">{node.label}</span>
            </div>
          );
        })() : null}
        {focusId && !nodeOverlays.some((overlay) => overlay.role === 'neighbor')
          ? edges.flatMap((edge) => edge.source_id === focusId ? [edge.target_id] : edge.target_id === focusId ? [edge.source_id] : [])
              .filter((id, index, ids) => ids.indexOf(id) === index).slice(0, 3).map((id, index) => {
                const node = nodes.find((candidate) => candidate.id === id);
                if (!node) return null;
                return (
                  <div key={`fallback-neighbor:${id}`} className="cosmos-node-overlay" data-role="neighbor" style={{ left: `${58 + index * 10}%`, top: `${42 + index * 14}%`, '--node-color': '#80bfff', '--node-aura-size': '22px' } as CSSProperties}>
                    <span className="cosmos-node-aura" data-role="neighbor" aria-hidden="true" />
                    <span className="cosmos-node-label" data-role="neighbor">{node.label}</span>
                  </div>
                );
              })
          : null}
        {nodeOverlays.map((overlay) => {
          const auraScale = overlay.role === 'focus' ? 2.8 : overlay.role === 'region' ? 1.35 : 1.9;
          const auraSize = Math.max(overlay.role === 'region' ? 18 : 30, overlay.diameter * auraScale);
          const sharedStyle = {
            '--node-color': overlay.color,
            '--node-aura-size': `${auraSize}px`,
            left: overlay.x,
            top: overlay.y,
          } as CSSProperties;
          return (
            <div
              key={overlay.id}
              className="cosmos-node-overlay"
              data-role={overlay.role}
              style={sharedStyle}
            >
              <span className="cosmos-node-aura" data-role={overlay.role} aria-hidden="true" />
              {overlay.labelVisible ? (
                <span
                  className="cosmos-node-label"
                  data-role={overlay.role}
                  style={{
                    left: overlay.labelX - overlay.x,
                    top: overlay.labelY - overlay.y,
                    width: overlay.labelWidth,
                    height: overlay.labelHeight,
                  }}
                >
                  {overlay.label}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <span id="graph-keyboard-help" className="sr-only">
        Interactive memory map. Use the labeled controls or semantic navigator; plus and minus zoom,
        zero fits, P pauses, Escape clears focus.
      </span>
      {renderLevel === 'neighborhood' && (
        <p className="sr-only" aria-label={`All ${edges.length} supporting relationships in this neighborhood`}>
          {edges.map((edge) => `${edge.source_id} to ${edge.target_id}; ${edge.relation}; confidence ${edge.confidence}; weight ${edge.weight}; ${edge.evidence_count} evidence items`).join('. ')}
        </p>
      )}
      {snapshot.status === 'loading' ? (
        <div className="cosmos-renderer-status" role="status">Preparing the memory constellation…</div>
      ) : null}
      {snapshot.status === 'failed' ? (
        <div className="cosmos-renderer-fallback" role="status">
          <strong>Rich constellation unavailable</strong>
          <span>{snapshot.error}</span>
          <button type="button" onClick={() => setRuntimeKey((key) => key + 1)}>Retry rich view</button>
        </div>
      ) : null}
      {hover ? (
        <div className="cosmos-point-tooltip" style={{ left: hover.x, top: hover.y }}>
          {hover.label}
        </div>
      ) : null}
      <div className="cosmos-camera-status" role="status" aria-live="polite" aria-atomic="true">
        <span aria-hidden="true" />
        {graphStatusMessage(snapshot)}
      </div>
    </div>
  );
}
