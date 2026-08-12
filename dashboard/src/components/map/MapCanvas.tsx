import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import type { AtlasLevel, VizDensityState, VizEdge, VizNode, VizSemanticState } from '../../api/client.js';
import {
  buildCosmosGraphData,
  cosmosMotionConfig,
  focusCosmosGraphData,
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
  type CosmosRuntimeSnapshot,
} from './cosmos-graph-runtime.js';
import type { GraphViewportCommand } from './map-navigation.js';
import type { MapSelection } from './map-types.js';

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
  onRenderCommit?: (commit: MapCanvasRenderCommit) => void;
  presentationReady?: boolean;
  presentedLevel?: AtlasLevel | 'raw';
  presentedGeneration?: string;
  presentedFocusId?: string | null;
  presentedPointCount?: number;
  presentedLinkCount?: number;
  onIntent?: (nodeId: string) => void;
}

export interface MapCanvasRenderCommit {
  level: CosmosGraphLevel;
  generation: string;
  focusId: string | null;
  pointCount: number;
}

interface GraphRenderInput {
  level: CosmosGraphLevel;
  generation: string;
  nodes: VizNode[];
  edges: VizEdge[];
}

interface PendingGraphData {
  data: CosmosGraphData;
  identity: Pick<GraphRenderInput, 'level' | 'generation'> | null;
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
  if (candidate.level !== current.level || candidate.generation !== current.generation) return false;
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
  motionDiagnosticsEpoch: 0,
  datasetVersion: 0,
  lastTransition: 'none',
  lastCommand: null,
  focusId: null,
  paused: false,
  reducedMotion: false,
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
  onRenderCommit,
  presentationReady = true,
  presentedLevel = atlasLevel,
  presentedGeneration = atlasGeneration,
  presentedFocusId = null,
  presentedPointCount = nodes.length,
  presentedLinkCount = edges.length,
  onIntent,
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
  } | null>(null);
  const renderLevel: CosmosGraphLevel = atlasLevel
    ?? nodes.find((node) => node.semantic_level)?.semantic_level
    ?? 'raw';
  const renderGeneration = atlasGeneration ?? `${renderLevel}:local`;
  const [graphRenderInput, setGraphRenderInput] = useState<GraphRenderInput>(
    () => ({ level: renderLevel, generation: renderGeneration, nodes, edges }),
  );
  const rawGraphWorkerReady = graphRenderInput.level === 'raw' && graphWorkerReady;
  const graphRenderInputRef = useRef(graphRenderInput);
  const preparedGraphIdentityRef = useRef<Pick<GraphRenderInput, 'level' | 'generation'> | null>(null);
  const pendingGraphRenderInputRef = useRef<GraphRenderInput | null>(null);
  const graphRenderInputTimerRef = useRef<number | null>(null);
  const lastGraphRenderCommitAtRef = useRef(performance.now());
  const [preparedGraphData, setPreparedGraphData] = useState<CosmosGraphData>(EMPTY_GRAPH_DATA);
  const graphData = useMemo(
    () => focusCosmosGraphData(preparedGraphData, focusId),
    [focusId, preparedGraphData],
  );
  const graphDataRef = useRef(graphData);
  const communityColors = useMemo(
    () => [...new Set(graphData.pointColors)].slice(0, 5),
    [graphData.pointColors],
  );
  const pointSizeSummary = useMemo(() => {
    const sorted = [...graphData.pointSizes].sort((left, right) => left - right);
    return {
      minimum: sorted[0] ?? 0,
      median: sorted[Math.floor(sorted.length / 2)] ?? 0,
      maximum: sorted[sorted.length - 1] ?? 0,
    };
  }, [graphData.pointSizes]);
  const linkWidthSummary = useMemo(() => ({
    minimum: graphData.linkWidths.length ? Math.min(...graphData.linkWidths) : 0,
    maximum: graphData.linkWidths.length ? Math.max(...graphData.linkWidths) : 0,
  }), [graphData.linkWidths]);
  graphDataRef.current = graphData;
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
    if (next.identity) {
      if (hostRef.current) hostRef.current.dataset.lastRenderCommitAt = String(performance.now());
      onRenderCommitRef.current?.({
        ...next.identity,
        focusId: nextFocusId,
        pointCount: next.data.pointIds.length,
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
    });
  };

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
      })
      && graphInputRemainsCompatible(requestInput, graphRenderInputRef.current),
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
    };
    preparedGraphIdentityRef.current = identity;
    const preparedFocusId = focusIdRef.current;
    const focusedGraphData = focusCosmosGraphData(response.graphData, preparedFocusId);
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
    applyGraphDataNow(runtime, { data: focusedGraphData, identity });
    directlyAppliedGraphDataRef.current = {
      base: response.graphData,
      focusId: preparedFocusId,
    };
    if (completeRef.current) runtime.completeDataset();
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
      nodes: graphRenderInput.nodes,
      edges: graphRenderInput.edges,
      previousCommunityAnchorIds: communityAnchorIdsRef.current,
    };
    if (graphRenderInput.level !== 'raw' && graphRenderInput.nodes.length <= 300) {
      acceptPreparedGraphResponse({
        requestId,
        level: graphRenderInput.level,
        generation: graphRenderInput.generation,
        ok: true,
        graphData: buildCosmosGraphData(
          graphRenderInput.nodes,
          graphRenderInput.edges,
          null,
          communityAnchorIdsRef.current,
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
    ) return;
    pendingGraphRenderInputRef.current = {
      level: renderLevel,
      generation: renderGeneration,
      nodes,
      edges,
    };
    const semanticIdentityChanged = current.level !== renderLevel
      || current.generation !== renderGeneration;
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
  }, [complete, edges, nodes, renderGeneration, renderLevel]);

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

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const generation = ++lifecycleGenerationRef.current;
    let cancelled = false;
    setSnapshot({ ...initialRuntimeSnapshot, paused, reducedMotion });
    setHover(null);
    setNodeOverlays([]);
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
    const direct = directlyAppliedGraphDataRef.current;
    if (direct?.base === preparedGraphData && direct.focusId === focusId) return;
    directlyAppliedGraphDataRef.current = {
      base: preparedGraphData,
      focusId,
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
      data-renderer-status={snapshot.status === 'ready' && !presentationReady ? 'loading' : snapshot.status}
      data-renderer-error={snapshot.error ?? ''}
      data-motion-phase={snapshot.motionPhase}
      data-initial-settled={String(snapshot.initialSettled)}
      data-final-fit-settled={String(snapshot.finalFitSettled)}
      data-motion-diagnostics-epoch={snapshot.motionDiagnosticsEpoch}
      data-dataset-version={snapshot.datasetVersion}
      data-last-transition={snapshot.lastTransition}
      data-last-command={snapshot.lastCommand ?? ''}
      data-focus-id={(presentationReady ? snapshot.focusId : presentedFocusId) ?? ''}
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
      <div className="cosmos-nebula-field" aria-hidden="true">
        {communityColors.map((color, index) => (
          <span
            key={`${color}-${index}`}
            style={{ '--nebula-color': color, '--nebula-index': index } as CSSProperties}
          />
        ))}
      </div>
      <div
        ref={hostRef}
        className="map-canvas cosmos-graph-host"
        data-testid="map-canvas"
        role="group"
        aria-label="Memory constellation"
        aria-describedby="graph-keyboard-help"
      />
      <div className="cosmos-focus-layer">
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
