import type { Graph } from '@cosmos.gl/graph';

import type { MapSelection } from './map-types.js';
import type { GraphViewportCommand } from './map-navigation.js';
import type {
  CosmosFocusNeighborhood,
  CosmosGraphData,
  CosmosMotionConfig,
} from './cosmos-graph-data.js';
import { preserveNeuralAtlasPositions } from './neural-atlas-layout.js';

type MotionPhase = 'idle' | 'settling' | 'activating' | 'transitioning';
type GraphTransition = 'initial' | 'focus' | 'expansion' | 'filter' | 'none';

export interface CosmosRuntimeSnapshot {
  status: 'loading' | 'ready' | 'failed' | 'disposed';
  motionPhase: MotionPhase;
  initialSettled: boolean;
  finalFitSettled: boolean;
  motionDiagnosticsEpoch: number;
  datasetVersion: number;
  lastTransition: GraphTransition;
  lastCommand: GraphViewportCommand | null;
  focusId: string | null;
  paused: boolean;
  reducedMotion: boolean;
  ambientStarts: number;
  simulationStarts: number;
  simulationEnds: number;
  maximumTickGapMs: number;
  maximumStepPx: number;
  userCameraInteracted: boolean;
  error: string | null;
  worldWidth: number;
  worldHeight: number;
  worldAspect: number;
  simulatedWorldWidth: number;
  simulatedWorldHeight: number;
  simulatedWorldAspect: number;
  screenFieldWidth: number;
  screenFieldHeight: number;
  screenFieldAspect: number;
  cameraZoom: number;
}

export interface CosmosNodeOverlay {
  id: string;
  label: string;
  x: number;
  y: number;
  diameter: number;
  color: string;
  role: 'focus' | 'neighbor' | 'region';
  labelX: number;
  labelY: number;
  labelWidth: number;
  labelHeight: number;
  labelVisible: boolean;
}

export interface CosmosMotionProbe {
  x: number;
  y: number;
  tick: number;
}

type UnplacedCosmosNodeOverlay = Omit<
  CosmosNodeOverlay,
  'labelX' | 'labelY' | 'labelWidth' | 'labelHeight' | 'labelVisible'
>;

interface OverlayLabelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const LABEL_VIEWPORT_INSET = 8;
const LABEL_COLLISION_GAP = 6;
const AMBIENT_START_ALPHA = 0.00135;
const SEMANTIC_DATA_TRANSITION_MS = 96;
const SEMANTIC_FINAL_FIT_MS = 64;
const SEMANTIC_AMBIENT_MAX_DELTA_MS = 34;
const AMBIENT_SIMULATION_CONFIG = {
  simulationDecay: 25_000_000,
  simulationGravity: 0,
  simulationCenter: 0,
  simulationRepulsion: 0,
  simulationLinkSpring: 0.015,
  simulationFriction: 0.02,
  simulationCluster: 0.008,
  simulationCollision: 0.2,
} as const;

function stableMotionPhase(value: string, index: number): number {
  let hash = 2_166_136_261 ^ index;
  for (let offset = 0; offset < value.length; offset += 1) {
    hash ^= value.charCodeAt(offset);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

function nextMainThreadSlice(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function recordHostMaximum(host: HTMLElement, name: string, durationMs: number): void {
  const attribute = `maximum${name[0]?.toUpperCase() ?? ''}${name.slice(1)}Ms`;
  const previous = Number(host.dataset[attribute] ?? 0);
  host.dataset[attribute] = Math.max(previous, durationMs).toFixed(1);
}

interface IncrementalProgramModule {
  create?: () => void;
  initPrograms: () => void;
}

interface IncrementalCommandPlaceholder {
  setAttributes: () => void;
  setBindings: () => void;
  setVertexCount: () => void;
}

const POINT_PROGRAMS = [
  'updatePositionCommand',
  'dragPointCommand',
  'drawCommand',
  'drawCoreCommand',
  'findPointsInRectCommand',
  'findPointsInPolygonCommand',
  'fillPickingBufferCommand',
  'fillSampledPointsFboCommand',
  'drawHighlightedCommand',
  'trackPointsCommand',
] as const;

interface IncrementalPointsModule extends IncrementalProgramModule {
  updatePositionCommand?: unknown;
  dragPointCommand?: unknown;
  drawCommand?: unknown;
  drawCoreCommand?: unknown;
  findPointsInRectCommand?: unknown;
  findPointsInPolygonCommand?: unknown;
  fillPickingBufferCommand?: unknown;
  fillSampledPointsFboCommand?: unknown;
  drawHighlightedCommand?: unknown;
  trackPointsCommand?: unknown;
}

// The lockfile-resolved Cosmos 3.4 build initializes every GPU program in one
// synchronous render. Yield between its modules and fail fast if that seam changes.
interface IncrementalGraphInternals {
  graph?: { update: () => void; pointsNumber?: number; linksNumber?: number };
  store?: { pointsTextureSize: number; linksTextureSize: number };
  points?: IncrementalPointsModule;
  lines?: IncrementalProgramModule;
  forceGravity?: IncrementalProgramModule;
  forceManyBody?: { destroy: () => void };
  forceCenter?: IncrementalProgramModule;
  forceLinkIncoming?: IncrementalProgramModule;
  forceLinkOutgoing?: IncrementalProgramModule;
  forceMouse?: IncrementalProgramModule;
  forceCollision?: IncrementalProgramModule;
  clusters?: IncrementalProgramModule;
  isForceCollisionReady?: boolean;
}

async function prewarmPointPrograms(
  host: HTMLDivElement,
  module: IncrementalPointsModule,
): Promise<void> {
  const placeholder: IncrementalCommandPlaceholder = {
    setAttributes: () => undefined,
    setBindings: () => undefined,
    setVertexCount: () => undefined,
  };
  const prepareStage = (target: (typeof POINT_PROGRAMS)[number] | null) => {
    const masked = POINT_PROGRAMS.filter((name) => name !== target && !module[name]);
    for (const name of masked) module[name] = placeholder;
    const startedAt = performance.now();
    try {
      module.initPrograms();
      const duration = performance.now() - startedAt;
      recordHostMaximum(host, 'prewarmPoints', duration);
      recordHostMaximum(host, target ? `prewarmPoints${target}` : 'prewarmPointResources', duration);
    } finally {
      for (const name of masked) module[name] = undefined;
    }
  };

  prepareStage(null);
  await nextMainThreadSlice();
  for (const target of POINT_PROGRAMS) {
    prepareStage(target);
    await nextMainThreadSlice();
  }
}

async function prewarmCosmosGraph(host: HTMLDivElement, graph: Graph): Promise<void> {
  const invisible = new Float32Array([
    0.08, 0.12, 0.18, 0,
    0.10, 0.18, 0.24, 0,
    0.12, 0.22, 0.28, 0,
  ]);
  graph.setPointPositions(new Float32Array([-32, -18, 0, 24, 34, -12]));
  graph.setPointColors(invisible);
  graph.setPointSizes(new Float32Array([0, 0, 0]));
  graph.setPointShapes(new Float32Array([0, 0, 0]));
  graph.setLinks(new Float32Array([0, 1, 1, 2, 2, 0]));
  graph.setLinkColors(invisible);
  graph.setLinkWidths(new Float32Array([0, 0, 0]));
  graph.setLinkStyles(new Float32Array([0, 1, 2]));
  graph.setLinkArrows([true, false, true]);
  graph.setPointClusters([0, 0, 1]);
  graph.setClusterPositions([0, 0, 34, -12]);
  graph.setPointClusterStrength(new Float32Array([0.2, 0.2, 0.2]));
  graph.setPinnedPoints([0]);

  const internals = graph as unknown as IncrementalGraphInternals;
  if (!internals.graph || !internals.store || !internals.forceCollision) {
    throw new Error('This cosmos.gl build does not expose the incremental preparation contract.');
  }
  let startedAt = performance.now();
  internals.graph.update();
  internals.store.pointsTextureSize = Math.ceil(Math.sqrt(internals.graph.pointsNumber ?? 0));
  internals.store.linksTextureSize = Math.ceil(Math.sqrt((internals.graph.linksNumber ?? 0) * 2));
  graph.create();
  // The semantic atlas already owns stable community placement and extent. Cosmos'
  // many-body near-field shader adds negligible motion here, while its cold driver
  // compilation can monopolize the main thread for more than 200 ms. Link, cluster,
  // and collision forces retain the living layout without that redundant pipeline.
  internals.forceManyBody?.destroy();
  internals.forceManyBody = undefined;
  recordHostMaximum(host, 'prewarmData', performance.now() - startedAt);
  await nextMainThreadSlice();

  if (!internals.points) {
    throw new Error('This cosmos.gl build does not expose the incremental point preparation contract.');
  }
  await prewarmPointPrograms(host, internals.points);

  const programStages: Array<[string, IncrementalProgramModule | undefined]> = [
    ['prewarmLines', internals.lines],
    ['prewarmGravity', internals.forceGravity],
    ['prewarmCenter', internals.forceCenter],
    ['prewarmIncomingLinks', internals.forceLinkIncoming],
    ['prewarmOutgoingLinks', internals.forceLinkOutgoing],
    ['prewarmMouse', internals.forceMouse],
    ['prewarmClusters', internals.clusters],
  ];
  if (programStages.some(([, module]) => !module)) {
    throw new Error('This cosmos.gl build does not expose the incremental preparation contract.');
  }
  for (const [name, module] of programStages) {
    startedAt = performance.now();
    module?.initPrograms();
    recordHostMaximum(host, name, performance.now() - startedAt);
    await nextMainThreadSlice();
  }
  startedAt = performance.now();
  internals.forceCollision.create?.();
  recordHostMaximum(host, 'prewarmCollisionData', performance.now() - startedAt);
  await nextMainThreadSlice();

  startedAt = performance.now();
  internals.forceCollision.initPrograms();
  internals.isForceCollisionReady = true;
  recordHostMaximum(host, 'prewarmCollision', performance.now() - startedAt);
  await nextMainThreadSlice();

  startedAt = performance.now();
  graph.render(0, 0);
  recordHostMaximum(host, 'prewarmRender', performance.now() - startedAt);
  graph.pause();
  await nextMainThreadSlice();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function labelRectsOverlap(left: OverlayLabelRect, right: OverlayLabelRect): boolean {
  return left.left < right.left + right.width + LABEL_COLLISION_GAP
    && left.left + left.width + LABEL_COLLISION_GAP > right.left
    && left.top < right.top + right.height + LABEL_COLLISION_GAP
    && left.top + left.height + LABEL_COLLISION_GAP > right.top;
}

function labelCandidates(
  overlay: UnplacedCosmosNodeOverlay,
  labelWidth: number,
  labelHeight: number,
  neighborIndex: number,
): OverlayLabelRect[] {
  const auraScale = overlay.role === 'focus' ? 2.8 : overlay.role === 'region' ? 1.35 : 1.9;
  const auraSize = Math.max(overlay.role === 'region' ? 18 : 30, overlay.diameter * auraScale);
  const radius = auraSize / 2;
  const distance = radius + 9;
  const directions: Array<[number, number]> = [
    [0, 1], [1, 0], [-1, 0], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1],
  ];
  const rotation = overlay.role === 'focus' ? 0 : (neighborIndex * 2) % directions.length;
  const orderedDirections = [...directions.slice(rotation), ...directions.slice(0, rotation)];
  const seen = new Set<string>();
  return orderedDirections.flatMap(([horizontal, vertical]) => {
    const rawLeft = horizontal < 0
      ? overlay.x - distance - labelWidth
      : horizontal > 0
        ? overlay.x + distance
        : overlay.x - labelWidth / 2;
    const rawTop = vertical < 0
      ? overlay.y - distance - labelHeight
      : vertical > 0
        ? overlay.y + distance
        : overlay.y - labelHeight / 2;
    const rect = {
      left: rawLeft,
      top: rawTop,
      width: labelWidth,
      height: labelHeight,
    };
    const key = `${Math.round(rect.left)}:${Math.round(rect.top)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [rect];
  });
}

export function placeCosmosNodeLabels(
  overlays: UnplacedCosmosNodeOverlay[],
  viewportWidth: number,
  viewportHeight: number,
): CosmosNodeOverlay[] {
  const occupied: OverlayLabelRect[] = [];
  return overlays.map((overlay, index) => {
    const labelWidth = Math.min(
      190,
      Math.max(
        overlay.role === 'focus' ? 104 : overlay.role === 'region' ? 76 : 88,
        overlay.label.length * (overlay.role === 'focus' ? 7.2 : overlay.role === 'region' ? 6.2 : 6.8) + 20,
      ),
      Math.max(72, viewportWidth - LABEL_VIEWPORT_INSET * 2),
    );
    const labelHeight = overlay.role === 'focus' ? 32 : overlay.role === 'region' ? 24 : 28;
    const candidates = labelCandidates(overlay, labelWidth, labelHeight, index).map((candidate) => ({
      ...candidate,
      left: clamp(candidate.left, LABEL_VIEWPORT_INSET, viewportWidth - candidate.width - LABEL_VIEWPORT_INSET),
      top: clamp(candidate.top, LABEL_VIEWPORT_INSET, viewportHeight - candidate.height - LABEL_VIEWPORT_INSET),
    }));
    const available = candidates.find((candidate) => occupied.every((placed) => !labelRectsOverlap(candidate, placed)));
    const chosen = available ?? candidates[0] ?? {
      left: LABEL_VIEWPORT_INSET,
      top: LABEL_VIEWPORT_INSET,
      width: labelWidth,
      height: labelHeight,
    };
    const labelVisible = overlay.role === 'focus' || Boolean(available);
    if (labelVisible) occupied.push(chosen);
    return {
      ...overlay,
      labelX: chosen.left,
      labelY: chosen.top,
      labelWidth,
      labelHeight,
      labelVisible,
    };
  });
}

export interface CosmosGraphRuntimeCallbacks {
  onSelect: (selection: MapSelection) => void;
  onHover: (hover: { id: string; label: string; x: number; y: number } | null) => void;
  onNodeOverlays: (overlays: CosmosNodeOverlay[]) => void;
  onMotionProbe: (probe: CosmosMotionProbe | null) => void;
  onSnapshot: (snapshot: CosmosRuntimeSnapshot) => void;
}

interface CreateCosmosRuntimeOptions {
  reducedMotion: boolean;
  paused: boolean;
  motion: CosmosMotionConfig;
}

const INITIAL_SNAPSHOT: CosmosRuntimeSnapshot = {
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

export class CosmosGraphRuntime {
  private snapshot: CosmosRuntimeSnapshot;
  private data: CosmosGraphData | null = null;
  private previousPointIds = new Set<string>();
  private previousLinkIds = new Set<string>();
  private activationGeneration = 0;
  private activationTimers = new Set<number>();
  private settleTimer: number | null = null;
  private finalFitTimer: number | null = null;
  private datasetCompleteRequested = false;
  private ambientActive = false;
  private semanticAmbientFrame: number | null = null;
  private semanticAmbientBase: Float32Array | null = null;
  private semanticAmbientPhases: Float32Array | null = null;
  private semanticAmbientElapsedMs = 0;
  private semanticAmbientLastFrameAt = 0;
  private semanticAmbientPinnedIndices = new Set<number>();
  private pointerProbeTimer: number | null = null;
  private overlayFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private overlayFocus: CosmosFocusNeighborhood | null = null;
  private overlayIncludesNeighbors = false;
  private destroyed = false;
  private canvas: HTMLCanvasElement | null = null;
  private simulationTick = 0;
  private lastMotionProbeAt = 0;
  private lastSimulationTickAt = 0;
  private lastProbePosition: [number, number] | null = null;
  private maximumTickGapMs = 0;
  private maximumStepPx = 0;
  private lastOverlayPublishAt = 0;
  private completedDatasetVersion = 0;
  private simulationRunning = false;
  private motionProbePointIndex = 0;
  private readonly contextLostHandler = (event: Event) => {
    event.preventDefault();
    this.fail('The rich memory constellation lost its graphics context.');
  };
  private readonly visibilityHandler = () => {
    if (document.hidden) {
      this.cancelSemanticAmbientFrame();
      this.graph.pause();
      this.lastSimulationTickAt = 0;
      return;
    }
    this.startAmbientMotion();
  };

  private constructor(
    private readonly host: HTMLDivElement,
    private readonly graph: Graph,
    private readonly callbacks: CosmosGraphRuntimeCallbacks,
    private motion: CosmosMotionConfig,
    options: CreateCosmosRuntimeOptions,
  ) {
    this.snapshot = {
      ...INITIAL_SNAPSHOT,
      paused: options.paused,
      reducedMotion: options.reducedMotion,
    };
  }

  static async create(
    host: HTMLDivElement,
    callbacks: CosmosGraphRuntimeCallbacks,
    options: CreateCosmosRuntimeOptions,
  ): Promise<CosmosGraphRuntime> {
    if (!document.createElement('canvas').getContext('webgl2')) {
      throw new Error('WebGL2 is unavailable on this device.');
    }

    const { Graph } = await import('@cosmos.gl/graph');
    let runtime: CosmosGraphRuntime | null = null;
    const graph = new Graph(host, {
      backgroundColor: '#020610',
      spaceSize: 4_096,
      pointDefaultColor: '#36c8ff',
      pointDefaultShape: 0,
      pointGreyoutColor: '#315b78',
      pointGreyoutOpacity: 0.42,
      pointDefaultSize: 4,
      pointOpacity: 1,
      pointSizeScale: 1,
      scalePointsOnZoom: false,
      renderHoveredPointRing: true,
      hoveredPointRingColor: '#f2fbff',
      focusedPointRingColor: [0.72, 0.92, 1, 0.72],
      outlinedPointRingColor: [0.45, 0.78, 1, 0.42],
      linkDefaultColor: '#3f789e',
      linkOpacity: 0.92,
      linkGreyoutOpacity: 0.28,
      linkDefaultWidth: 0.8,
      linkBlending: false,
      linkColorInterpolateFromEndpoints: true,
      curvedLinks: true,
      curvedLinkSegments: 24,
      curvedLinkWeight: 0.32,
      curvedLinkControlPointDistance: 0.14,
      linkDefaultArrows: true,
      linkArrowsSizeScale: 0.44,
      linkDashLength: 6,
      linkDashGap: 5,
      transitionDuration: options.motion.transitionDuration,
      simulationDecay: 2_600,
      simulationGravity: 0,
      simulationCenter: 0,
      simulationRepulsion: 0,
      simulationLinkSpring: 0.015,
      simulationLinkDistance: 80,
      simulationFriction: 0.02,
      simulationCluster: 0.008,
      simulationCollision: 0.2,
      simulationCollisionPadding: 2,
      enableDrag: true,
      enableZoom: true,
      enableSimulation: true,
      enableSimulationDuringZoom: false,
      fitViewOnInit: false,
      fitViewDelay: options.reducedMotion ? 0 : 160,
      fitViewDuration: options.motion.transitionDuration,
      fitViewPadding: 0.12,
      rescalePositions: false,
      randomSeed: 'thoth-memory-constellation',
      attribution: '',
      onPointClick: (index) => runtime?.selectPoint(index),
      onLinkClick: (index) => runtime?.selectLink(index),
      onBackgroundClick: () => callbacks.onSelect(null),
      onPointMouseOver: (index, _position, event) => runtime?.hoverPoint(index, event),
      onPointMouseOut: () => callbacks.onHover(null),
      onSimulationStart: () => runtime?.handleSimulationStart(),
      onSimulationTick: () => runtime?.handleSimulationTick(),
      onSimulationEnd: () => runtime?.handleSimulationEnd(),
      onZoom: (_event, userDriven) => runtime?.handleZoom(userDriven),
    });

    try {
      await graph.ready;
      await prewarmCosmosGraph(host, graph);
    } catch (error) {
      graph.destroy();
      throw error;
    }

    runtime = new CosmosGraphRuntime(host, graph, callbacks, options.motion, options);
    runtime.canvas = host.querySelector('canvas');
    if (runtime.canvas) {
      runtime.canvas.dataset.engine = 'cosmos-gl';
      runtime.canvas.tabIndex = 0;
      runtime.canvas.setAttribute('aria-label', 'Animated memory constellation');
      runtime.canvas.setAttribute('aria-describedby', 'graph-keyboard-help');
      runtime.canvas.addEventListener('webglcontextlost', runtime.contextLostHandler);
    }
    if (typeof ResizeObserver !== 'undefined') {
      runtime.resizeObserver = new ResizeObserver(() => runtime?.handleResize());
      runtime.resizeObserver.observe(host);
    }
    document.addEventListener('visibilitychange', runtime.visibilityHandler);
    runtime.emit({ status: 'ready' });
    runtime.setPaused(options.paused);
    return runtime;
  }

  setData(data: CosmosGraphData): void {
    if (this.destroyed) return;
    const previousData = this.data;
    const previousPositions = previousData ? Array.from(this.graph.getPointPositions()) : [];
    const pointIds = new Set(data.pointIds);
    const linkIds = new Set(data.linkIds);
    const unchanged =
      this.data !== null &&
      data.pointIds.length === this.data.pointIds.length &&
      data.linkIds.length === this.data.linkIds.length &&
      data.pointIds.every((id, index) => this.data?.pointIds[index] === id) &&
      data.linkIds.every((id, index) => this.data?.linkIds[index] === id);
    if (unchanged) {
      this.data = data;
      return;
    }

    this.cancelFinalFit();
    this.cancelSemanticAmbientFrame();
    this.datasetCompleteRequested = false;
    const isInitial = this.data === null;
    const isExpansion =
      !isInitial &&
      [...this.previousPointIds].every((id) => pointIds.has(id)) &&
      [...this.previousLinkIds].every((id) => linkIds.has(id));
    const initialStillSettling = isExpansion && !this.snapshot.initialSettled;
    const completesInitialSettle = isInitial || (!isExpansion && !this.snapshot.initialSettled);
    this.cancelActivation();
    if (!initialStillSettling) this.cancelSettle();
    const transition: GraphTransition = isInitial ? 'initial' : isExpansion ? 'expansion' : 'filter';
    const semantic = this.isSemanticData(data);
    const duration = this.snapshot.reducedMotion || this.snapshot.paused
      ? 0
      : semantic
        ? Math.min(SEMANTIC_DATA_TRANSITION_MS, this.motion.transitionDuration)
        : this.motion.transitionDuration;
    const pointPositions = isExpansion && previousData
      ? preserveNeuralAtlasPositions(
          previousData.pointIds,
          previousPositions,
          data.pointIds,
          data.pointPositions,
        )
      : data.pointPositions;

    this.data = data;
    this.previousPointIds = pointIds;
    this.previousLinkIds = linkIds;
    let stageStartedAt = performance.now();
    this.graph.setConfigPartial({
      curvedLinkSegments: data.quality.curvedLinkSegments,
      simulationDecay: isInitial || initialStillSettling ? 2_600 : 25_000_000,
      ...(semantic ? {
        simulationGravity: 0,
        simulationCenter: 0,
        simulationRepulsion: 0,
        simulationLinkSpring: 0,
        simulationCluster: 0,
        simulationCollision: 0,
      } : AMBIENT_SIMULATION_CONFIG),
    });
    this.graph.setPointPositions(new Float32Array(pointPositions));
    this.recordDataStage('positions', stageStartedAt);
    stageStartedAt = performance.now();
    this.graph.setPointClusters(data.pointCommunities);
    this.graph.setClusterPositions(data.clusterCenters);
    this.graph.setPointClusterStrength(new Float32Array(data.clusterStrengths));
    const pinnedPointIndices = [
      ...new Set([
        ...data.communityAnchorIndices,
        ...data.extentAnchorIndices,
        ...selectExtentAnchorIndices(pointPositions),
      ]),
    ];
    this.graph.setPinnedPoints(pinnedPointIndices);
    this.semanticAmbientBase = semantic ? new Float32Array(pointPositions) : null;
    this.semanticAmbientPhases = semantic
      ? new Float32Array(data.pointIds.map((id, index) => stableMotionPhase(id, index)))
      : null;
    this.semanticAmbientPinnedIndices = semantic ? new Set(pinnedPointIndices) : new Set();
    this.semanticAmbientElapsedMs = 0;
    this.semanticAmbientLastFrameAt = 0;
    const pinnedPointIndexSet = new Set(pinnedPointIndices);
    let nextMotionProbePointIndex = -1;
    for (let index = 0; index < data.pointIds.length; index += 1) {
      if (pinnedPointIndexSet.has(index)) continue;
      if (
        nextMotionProbePointIndex < 0
        || data.pointDegrees[index] > data.pointDegrees[nextMotionProbePointIndex]
        || (
          data.pointDegrees[index] === data.pointDegrees[nextMotionProbePointIndex]
          && data.pointIds[index].localeCompare(data.pointIds[nextMotionProbePointIndex]) < 0
        )
      ) {
        nextMotionProbePointIndex = index;
      }
    }
    if (nextMotionProbePointIndex >= 0 && nextMotionProbePointIndex !== this.motionProbePointIndex) {
      this.motionProbePointIndex = nextMotionProbePointIndex;
      this.lastMotionProbeAt = 0;
      this.lastProbePosition = null;
    }
    this.recordDataStage('clusters', stageStartedAt);
    stageStartedAt = performance.now();
    this.graph.setPointColors(colorsToFloat32(data.pointColors));
    this.graph.setPointSizes(new Float32Array(data.pointSizes));
    this.graph.setPointShapes(new Float32Array(data.pointShapes));
    this.recordDataStage('points', stageStartedAt);
    stageStartedAt = performance.now();
    this.graph.setLinks(new Float32Array(data.links));
    this.graph.setLinkColors(colorsToFloat32(data.linkColors));
    this.graph.setLinkWidths(new Float32Array(data.linkWidths));
    this.graph.setLinkStyles(new Float32Array(data.edges.map((edge) => edge.kind === 'metadata' ? 1 : 0)));
    this.graph.setLinkArrows(data.linkArrows);
    this.recordDataStage('links', stageStartedAt);
    stageStartedAt = performance.now();
    if (!semantic && !this.snapshot.paused && !this.snapshot.reducedMotion) this.graph.unpause();
    else this.graph.pause();
    this.recordDataStage('unpause', stageStartedAt);
    stageStartedAt = performance.now();
    this.graph.render(semantic ? 0 : isInitial ? 0.22 : isExpansion ? 0.025 : 0.012, duration);
    this.recordDataStage('graphRender', stageStartedAt);
    stageStartedAt = performance.now();
    if (!semantic && !this.snapshot.paused && !this.snapshot.reducedMotion) {
      if (isInitial) this.startSimulation(0.18);
      else if (!isExpansion) this.startSimulation(0.006);
    }
    this.recordDataStage('simulationStart', stageStartedAt);
    stageStartedAt = performance.now();
    if (isInitial) {
      this.graph.fitViewByPointPositions(
        pointPositions,
        duration,
        0.08,
        !this.snapshot.paused && !this.snapshot.reducedMotion,
      );
    }
    this.recordDataStage('fit', stageStartedAt);

    this.emit({
      datasetVersion: this.snapshot.datasetVersion + 1,
      lastTransition: transition,
      motionPhase: completesInitialSettle || initialStillSettling
        ? 'settling'
        : isExpansion
          ? 'idle'
          : duration > 0
            ? 'transitioning'
            : 'idle',
      initialSettled: isInitial && duration === 0 ? true : this.snapshot.initialSettled,
      finalFitSettled: false,
      worldWidth: data.worldExtent.width,
      worldHeight: data.worldExtent.height,
      worldAspect: data.worldExtent.width / data.worldExtent.height,
      ...this.measureLiveExtent(this.graph.getPointPositions()),
    });

    if (isExpansion) {
      this.startAmbientMotion();
      return;
    }

    const settleDelay = isInitial ? this.motion.initialSettleMs : duration;
    if (settleDelay === 0) {
      this.finishMotion(completesInitialSettle, !this.snapshot.userCameraInteracted);
    } else {
      this.scheduleSettle(
        () => this.finishMotion(completesInitialSettle, !this.snapshot.userCameraInteracted),
        settleDelay,
      );
    }
  }

  focus(focusId: string | null, focus: CosmosFocusNeighborhood | null): void {
    if (this.destroyed || !this.data) return;
    const focusChanged = focusId !== this.snapshot.focusId;
    if (focusId && focus && !focusChanged) {
      this.cancelActivation();
      this.overlayFocus = focus;
      this.overlayIncludesNeighbors = true;
      this.graph.setConfigPartial({
        focusedPointIndex: focus.pointIndex,
        highlightedPointIndices: [focus.pointIndex, ...focus.neighborPointIndices],
        outlinedPointIndices: focus.neighborPointIndices,
        highlightedLinkIndices: focus.linkIndices,
      });
      this.graph.setPointSizes(new Float32Array(this.focusedPointSizes(focus)));
      this.graph.render(undefined, 0);
      this.requestOverlayLayout();
      this.emit({ motionPhase: 'idle', lastTransition: 'focus' });
      this.startAmbientMotion();
      return;
    }
    this.cancelActivation();
    this.graph.pause();
    if (!focusId || !focus) {
      const initialStillSettling = !this.snapshot.initialSettled && this.snapshot.motionPhase === 'settling';
      this.overlayFocus = null;
      this.overlayIncludesNeighbors = false;
      this.callbacks.onNodeOverlays([]);
      this.graph.setConfigPartial({
        focusedPointIndex: undefined,
        highlightedPointIndices: undefined,
        outlinedPointIndices: undefined,
        highlightedLinkIndices: undefined,
      });
      this.graph.setPointSizes(new Float32Array(this.data.pointSizes));
      this.graph.render(
        undefined,
        this.snapshot.reducedMotion || this.snapshot.paused ? 0 : this.motion.transitionDuration,
      );
      this.emit({ focusId: null, motionPhase: initialStillSettling ? 'settling' : 'idle' });
      if (initialStillSettling && !this.snapshot.paused && !this.snapshot.reducedMotion) this.graph.unpause();
      else this.startAmbientMotion();
      return;
    }

    const generation = ++this.activationGeneration;
    const duration = this.snapshot.reducedMotion || this.snapshot.paused ? 0 : this.motion.transitionDuration;
    const activateNeighbors = () => {
      if (this.destroyed || generation !== this.activationGeneration) return;
      this.overlayIncludesNeighbors = true;
      this.graph.setConfigPartial({
        focusedPointIndex: focus.pointIndex,
        highlightedPointIndices: [focus.pointIndex, ...focus.neighborPointIndices],
        outlinedPointIndices: focus.neighborPointIndices,
        highlightedLinkIndices: focus.linkIndices,
      });
      this.graph.setPointSizes(new Float32Array(this.focusedPointSizes(focus)));
      this.graph.render(undefined, duration);
      this.requestOverlayLayout();
    };

    this.overlayFocus = focus;
    this.overlayIncludesNeighbors = false;
    this.graph.setConfigPartial({
      focusedPointIndex: focus.pointIndex,
      highlightedPointIndices: [focus.pointIndex],
      outlinedPointIndices: [],
      highlightedLinkIndices: [],
    });
    this.graph.setPointSizes(new Float32Array(this.focusedPointSizes({
      ...focus,
      neighborPointIndices: [],
    })));
    this.graph.render(undefined, duration);
    this.requestOverlayLayout();
    if (focusChanged) {
      if (this.finalFitTimer !== null) {
        this.cancelFinalFit();
        this.settleFinalFit();
      }
      this.fitFocusNeighborhood(focus, duration);
    }
    this.emit({
      focusId,
      lastTransition: focusChanged ? 'focus' : this.snapshot.lastTransition,
      motionPhase: duration > 0 ? 'activating' : 'idle',
      userCameraInteracted: this.snapshot.userCameraInteracted || focusChanged,
    });

    if (this.motion.activationStepMs === 0) activateNeighbors();
    else this.scheduleActivation(activateNeighbors, this.motion.activationStepMs);

    if (duration === 0) this.finishMotion(false);
    else this.scheduleActivation(() => {
      if (generation === this.activationGeneration) this.finishMotion(false);
    }, duration + this.motion.activationStepMs);
  }

  prepareDataTransition(): void {
    if (this.destroyed || !this.data) return;
    this.cancelSemanticAmbientFrame();
    this.graph.pause();
    this.callbacks.onHover(null);
    this.callbacks.onNodeOverlays([]);
    this.emit({ motionPhase: 'transitioning', finalFitSettled: false });
  }

  command(command: GraphViewportCommand): void {
    if (this.destroyed) return;
    if (this.finalFitTimer !== null) {
      this.cancelFinalFit();
      this.settleFinalFit();
    }
    const duration = this.snapshot.reducedMotion || this.snapshot.paused ? 0 : this.motion.transitionDuration;
    const simulation = false;
    if (command === 'fit') this.fitAll(duration);
    if (command === 'zoom-in') this.graph.setZoomLevel(Math.min(8, this.graph.getZoomLevel() * 1.25), duration, simulation);
    if (command === 'zoom-out') this.graph.setZoomLevel(Math.max(0.15, this.graph.getZoomLevel() * 0.8), duration, simulation);
    if (command === 'reset') this.fitAll(duration);
    if (command.startsWith('pan-')) {
      const shift = command === 'pan-left' ? [120, 0] : command === 'pan-right' ? [-120, 0] : command === 'pan-up' ? [0, 120] : [0, -120];
      const positions = this.graph.getPointPositions().map((value, index) => value + shift[index % 2]);
      this.graph.setZoomTransformByPointPositions(new Float32Array(positions), duration, this.graph.getZoomLevel(), 0, simulation);
    }
    this.requestOverlayLayout();
    this.emit({ lastCommand: command, userCameraInteracted: true });
  }

  completeDataset(): void {
    if (this.destroyed || !this.data) return;
    this.datasetCompleteRequested = true;
    if (!this.snapshot.initialSettled) {
      if (this.settleTimer === null) {
        this.finishMotion(true, !this.snapshot.userCameraInteracted);
      }
      return;
    }
    if (
      this.completedDatasetVersion === this.snapshot.datasetVersion
      && (this.snapshot.finalFitSettled || this.finalFitTimer !== null)
    ) return;

    this.completedDatasetVersion = this.snapshot.datasetVersion;
    this.cancelFinalFit();
    if (this.snapshot.userCameraInteracted) {
      this.settleFinalFit();
      return;
    }
    if (this.isSemanticData()) {
      this.emit({ finalFitSettled: false });
      this.fitAll(0);
      this.settleFinalFit();
      return;
    }
    const duration = this.snapshot.reducedMotion || this.snapshot.paused
      ? 0
      : this.isSemanticData()
        ? Math.min(SEMANTIC_FINAL_FIT_MS, this.motion.transitionDuration)
        : this.motion.transitionDuration;
    this.emit({ finalFitSettled: false });
    this.fitAll(duration);
    if (duration === 0) {
      this.settleFinalFit();
    } else {
      this.finalFitTimer = window.setTimeout(() => {
        this.finalFitTimer = null;
        this.settleFinalFit();
      }, duration + 64);
    }
  }

  setPaused(paused: boolean): void {
    if (this.destroyed) return;
    if (paused && this.finalFitTimer !== null) {
      this.cancelFinalFit();
      this.fitAll(0);
      this.settleFinalFit();
    }
    this.emit({ paused });
    if (paused || this.snapshot.reducedMotion) {
      this.cancelSemanticAmbientFrame();
      this.graph.pause();
      this.lastSimulationTickAt = 0;
    } else {
      this.startAmbientMotion();
    }
    if (paused) this.schedulePointerProbe();
    else this.clearPointerProbe();
  }

  setReducedMotion(reducedMotion: boolean, motion: CosmosMotionConfig): void {
    if (this.destroyed) return;
    this.motion = motion;
    this.graph.setConfigPartial({
      transitionDuration: motion.transitionDuration,
      fitViewDelay: reducedMotion ? 0 : 160,
      fitViewDuration: motion.transitionDuration,
    });
    if (reducedMotion) {
      this.cancelActivation();
      this.cancelSettle();
      if (this.finalFitTimer !== null) {
        this.cancelFinalFit();
        this.fitAll(0);
        this.settleFinalFit();
      }
      this.graph.pause();
      this.cancelSemanticAmbientFrame();
      this.lastSimulationTickAt = 0;
      this.emit({ reducedMotion: true, motionPhase: 'idle', initialSettled: true });
    } else {
      this.emit({ reducedMotion: false });
      this.startAmbientMotion();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelActivation();
    this.cancelSettle();
    this.cancelFinalFit();
    this.cancelSemanticAmbientFrame();
    this.ambientActive = false;
    this.cancelOverlayFrame();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.canvas?.removeEventListener('webglcontextlost', this.contextLostHandler);
    this.clearPointerProbe();
    this.callbacks.onHover(null);
    this.callbacks.onNodeOverlays([]);
    this.callbacks.onMotionProbe(null);
    this.graph.destroy();
    this.snapshot = { ...this.snapshot, status: 'disposed', motionPhase: 'idle' };
    this.callbacks.onSnapshot({ ...this.snapshot });
  }

  private selectPoint(index: number): void {
    const id = this.data?.pointIds[index];
    if (id) this.callbacks.onSelect({ kind: 'node', id });
  }

  private selectLink(index: number): void {
    const id = this.data?.linkIds[index];
    if (id) this.callbacks.onSelect({ kind: 'edge', id });
  }

  private hoverPoint(index: number, event?: MouseEvent): void {
    const id = this.data?.pointIds[index];
    const label = this.data?.pointLabels[index];
    if (!id || !label) return;
    if (event) {
      const bounds = this.host.getBoundingClientRect();
      this.callbacks.onHover({ id, label, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
      return;
    }
    const positions = this.graph.getPointPositions();
    const [x, y] = this.graph.spaceToScreenPosition([positions[index * 2], positions[index * 2 + 1]]);
    this.callbacks.onHover({ id, label, x, y });
  }

  private focusedPointSizes(focus: CosmosFocusNeighborhood): number[] {
    if (!this.data) return [];
    const neighbors = new Set(focus.neighborPointIndices);
    return this.data.pointSizes.map((size, index) => {
      if (index === focus.pointIndex) return Math.min(10, size * 1.16);
      if (neighbors.has(index)) return Math.min(9, size * 1.04);
      return size;
    });
  }

  private requestOverlayLayout(): void {
    if (this.destroyed || this.overlayFrame !== null) return;
    this.overlayFrame = window.requestAnimationFrame(() => {
      this.overlayFrame = null;
      this.publishOverlayLayout();
    });
  }

  private handleSimulationTick(): void {
    if (this.destroyed) return;
    this.publishMotionTick(this.graph.getPointPositions(), performance.now());
  }

  private publishMotionTick(positions: ArrayLike<number>, now: number): void {
    this.simulationTick += 1;
    if (now - this.lastOverlayPublishAt >= 80) {
      this.lastOverlayPublishAt = now;
      this.requestOverlayLayout();
    }
    if (this.lastSimulationTickAt > 0) {
      this.maximumTickGapMs = Math.max(this.maximumTickGapMs, now - this.lastSimulationTickAt);
    }
    this.lastSimulationTickAt = now;
    if (!this.data?.pointIds.length || now - this.lastMotionProbeAt < this.data.quality.hoverSampleMs) return;
    this.lastMotionProbeAt = now;
    const probeOffset = this.motionProbePointIndex * 2;
    const [x, y] = this.graph.spaceToScreenPosition([
      positions[probeOffset],
      positions[probeOffset + 1],
    ]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (this.lastProbePosition) {
      this.maximumStepPx = Math.max(
        this.maximumStepPx,
        Math.hypot(x - this.lastProbePosition[0], y - this.lastProbePosition[1]),
      );
    }
    this.lastProbePosition = [x, y];
    this.callbacks.onMotionProbe({ x, y, tick: this.simulationTick });
    this.emit({
      maximumTickGapMs: this.maximumTickGapMs,
      maximumStepPx: this.maximumStepPx,
      ...this.measureLiveExtent(positions),
    });
  }

  private handleSimulationStart(): void {
    if (this.destroyed) return;
    this.markSimulationStarted();
  }

  private handleSimulationEnd(): void {
    if (this.destroyed) return;
    this.simulationRunning = false;
    this.ambientActive = false;
    this.lastSimulationTickAt = 0;
    this.emit({ simulationEnds: this.snapshot.simulationEnds + 1 });
  }

  private handleZoom(userDriven: boolean): void {
    if (this.destroyed) return;
    this.requestOverlayLayout();
    if (this.data) this.emit(this.measureLiveExtent(this.graph.getPointPositions()));
    if (userDriven) {
      if (this.finalFitTimer !== null) {
        this.cancelFinalFit();
        this.settleFinalFit();
      }
      if (!this.snapshot.userCameraInteracted) this.emit({ userCameraInteracted: true });
    }
  }

  private handleResize(): void {
    if (this.destroyed) return;
    if (this.overlayFocus) this.fitFocusNeighborhood(this.overlayFocus, 0);
    this.requestOverlayLayout();
    if (this.data) this.emit(this.measureLiveExtent(this.graph.getPointPositions()));
  }

  private fitAll(duration: number): void {
    if (!this.data) return;
    const positions = Array.from(this.graph.getPointPositions());
    this.graph.fitViewByPointPositions(positions, duration, 0.08, false);
  }

  private fitFocusNeighborhood(focus: CosmosFocusNeighborhood, duration: number): void {
    const positions = this.graph.getPointPositions();
    const neighborhoodPositions = [focus.pointIndex, ...focus.neighborPointIndices].flatMap((pointIndex) => [
      positions[pointIndex * 2],
      positions[pointIndex * 2 + 1],
    ]);
    this.graph.setZoomTransformByPointPositions(
      new Float32Array(neighborhoodPositions),
      duration,
      undefined,
      0.2,
      false,
    );
  }

  private publishOverlayLayout(): void {
    if (!this.data) {
      this.callbacks.onNodeOverlays([]);
      return;
    }
    const positions = this.graph.getPointPositions();
    if (!this.overlayFocus) {
      this.callbacks.onNodeOverlays(placeCosmosNodeLabels(
        this.universeRegionOverlays(positions),
        this.host.clientWidth,
        this.host.clientHeight,
      ));
      return;
    }
    const focus = this.overlayFocus;
    const neighborIndices = this.overlayIncludesNeighbors
      ? [...focus.neighborPointIndices]
          .sort((left, right) =>
            this.data!.pointDegrees[right] - this.data!.pointDegrees[left] || left - right,
          )
          .slice(0, 6)
      : [];
    const overlays = [focus.pointIndex, ...neighborIndices]
      .map((pointIndex): UnplacedCosmosNodeOverlay | null => {
        const position: [number, number] = [positions[pointIndex * 2], positions[pointIndex * 2 + 1]];
        const [x, y] = this.graph.spaceToScreenPosition(position);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        if (x < -48 || x > this.host.clientWidth + 48 || y < -48 || y > this.host.clientHeight + 48) {
          return null;
        }
        const role = pointIndex === focus.pointIndex ? 'focus' : 'neighbor';
        const scale = role === 'focus' ? 1.34 : 1.08;
        return {
          id: this.data!.pointIds[pointIndex],
          label: this.data!.pointLabels[pointIndex],
          x,
          y,
          diameter: this.data!.pointSizes[pointIndex] * scale,
          color: this.data!.pointColors[pointIndex],
          role,
        };
      })
      .filter((overlay): overlay is UnplacedCosmosNodeOverlay => overlay !== null);
    this.callbacks.onNodeOverlays(placeCosmosNodeLabels(overlays, this.host.clientWidth, this.host.clientHeight));
  }

  private universeRegionOverlays(positions: ArrayLike<number>): UnplacedCosmosNodeOverlay[] {
    if (!this.data || this.data.nodes[0]?.semantic_level !== 'universe') return [];
    const limit = this.host.clientWidth <= 480 ? 6 : this.host.clientWidth <= 900 ? 9 : 14;
    return this.data.nodes
      .map((_node, index) => index)
      .sort((left, right) =>
        (this.data!.nodes[right].member_count ?? 0) - (this.data!.nodes[left].member_count ?? 0)
        || this.data!.pointDegrees[right] - this.data!.pointDegrees[left]
        || this.data!.pointIds[left].localeCompare(this.data!.pointIds[right]),
      )
      .slice(0, limit)
      .map((pointIndex): UnplacedCosmosNodeOverlay | null => {
        const [x, y] = this.graph.spaceToScreenPosition([
          positions[pointIndex * 2],
          positions[pointIndex * 2 + 1],
        ]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        if (x < -32 || x > this.host.clientWidth + 32 || y < -32 || y > this.host.clientHeight + 32) return null;
        return {
          id: this.data!.pointIds[pointIndex],
          label: this.data!.pointLabels[pointIndex],
          x,
          y,
          diameter: this.data!.pointSizes[pointIndex],
          color: this.data!.pointColors[pointIndex],
          role: 'region',
        };
      })
      .filter((overlay): overlay is UnplacedCosmosNodeOverlay => overlay !== null);
  }

  private cancelOverlayFrame(): void {
    if (this.overlayFrame === null) return;
    window.cancelAnimationFrame(this.overlayFrame);
    this.overlayFrame = null;
  }

  private publishPointerProbe(): void {
    if (!this.data) return;
    const positions = this.graph.getPointPositions();
    const toScreen = (pointIndex: number): [number, number] => this.graph.spaceToScreenPosition([
      positions[pointIndex * 2],
      positions[pointIndex * 2 + 1],
    ]);
    const inset = Math.min(48, this.host.clientWidth / 5, this.host.clientHeight / 5);
    const visiblePointIndices = this.graph
      .findPointsInRect([[inset, inset], [this.host.clientWidth - inset, this.host.clientHeight - inset]])
      .sort((left, right) => {
        const [leftX, leftY] = toScreen(left);
        const [rightX, rightY] = toScreen(right);
        const centerX = this.host.clientWidth / 2;
        const centerY = this.host.clientHeight / 2;
        const leftDistance = Math.hypot(leftX - centerX, leftY - centerY);
        const rightDistance = Math.hypot(rightX - centerX, rightY - centerY);
        return leftDistance - rightDistance || (this.data?.pointSizes[right] ?? 0) - (this.data?.pointSizes[left] ?? 0);
      });
    const pointIndex = visiblePointIndices[0];
    if (pointIndex === undefined) return;
    const [x, y] = toScreen(pointIndex);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.host.dataset.pointerProbeX = String(x);
    this.host.dataset.pointerProbeY = String(y);
  }

  private schedulePointerProbe(): void {
    this.clearPointerProbe();
    this.pointerProbeTimer = window.setTimeout(() => {
      this.pointerProbeTimer = null;
      this.publishPointerProbe();
    }, this.snapshot.reducedMotion ? 32 : this.motion.transitionDuration + 64);
  }

  private clearPointerProbe(): void {
    if (this.pointerProbeTimer !== null) {
      window.clearTimeout(this.pointerProbeTimer);
      this.pointerProbeTimer = null;
    }
    delete this.host.dataset.pointerProbeX;
    delete this.host.dataset.pointerProbeY;
  }

  private finishMotion(initial: boolean, fitInitial = true): void {
    if (this.destroyed) return;
    this.graph.stop();
    this.cancelSemanticAmbientFrame();
    if (initial) {
      if (fitInitial) this.fitAll(0);
      this.lastMotionProbeAt = 0;
      this.lastSimulationTickAt = 0;
      this.lastProbePosition = null;
      this.callbacks.onMotionProbe(null);
    }
    this.graph.setConfigPartial(AMBIENT_SIMULATION_CONFIG);
    this.requestOverlayLayout();
    this.emit({ motionPhase: 'idle', initialSettled: initial ? true : this.snapshot.initialSettled });
    this.startAmbientMotion();
    if (initial && this.datasetCompleteRequested) this.completeDataset();
  }

  private startAmbientMotion(): void {
    if (
      this.destroyed
      || !this.data?.pointIds.length
      || this.snapshot.status !== 'ready'
      || this.snapshot.paused
      || this.snapshot.reducedMotion
      || document.hidden
    ) {
      this.graph.pause();
      this.cancelSemanticAmbientFrame();
      this.lastSimulationTickAt = 0;
      return;
    }
    if (this.isSemanticData()) {
      this.startSemanticAmbientMotion();
      return;
    }
    if (!this.snapshot.initialSettled && this.snapshot.motionPhase === 'settling') {
      this.graph.unpause();
      return;
    }
    this.graph.setConfigPartial(AMBIENT_SIMULATION_CONFIG);
    this.graph.unpause();
    if (this.ambientActive) return;
    this.ambientActive = true;
    this.startSimulation(AMBIENT_START_ALPHA);
    this.emit({ ambientStarts: this.snapshot.ambientStarts + 1 });
  }

  private startSimulation(alpha: number): void {
    this.markSimulationStarted();
    this.graph.start(alpha);
  }

  private startSemanticAmbientMotion(): void {
    if (!this.semanticAmbientBase || !this.semanticAmbientPhases || this.semanticAmbientFrame !== null) return;
    this.graph.pause();
    if (!this.ambientActive) {
      this.ambientActive = true;
      this.markSimulationStarted();
      this.emit({ ambientStarts: this.snapshot.ambientStarts + 1 });
    }
    this.semanticAmbientLastFrameAt = performance.now();
    const tick = (now: number) => {
      this.semanticAmbientFrame = null;
      if (
        this.destroyed
        || this.snapshot.status !== 'ready'
        || this.snapshot.paused
        || this.snapshot.reducedMotion
        || document.hidden
        || !this.semanticAmbientBase
        || !this.semanticAmbientPhases
      ) {
        this.semanticAmbientLastFrameAt = 0;
        return;
      }
      const elapsed = Math.min(
        SEMANTIC_AMBIENT_MAX_DELTA_MS,
        Math.max(0, now - this.semanticAmbientLastFrameAt),
      );
      this.semanticAmbientLastFrameAt = now;
      this.semanticAmbientElapsedMs += elapsed;
      const positions = new Float32Array(this.semanticAmbientBase.length);
      for (let index = 0; index < this.semanticAmbientBase.length / 2; index += 1) {
        const offset = index * 2;
        const baseX = this.semanticAmbientBase[offset];
        const baseY = this.semanticAmbientBase[offset + 1];
        if (this.semanticAmbientPinnedIndices.has(index)) {
          positions[offset] = baseX;
          positions[offset + 1] = baseY;
          continue;
        }
        const phase = this.semanticAmbientPhases[index];
        const amplitude = 2.4 + (phase % 1) * 2.2;
        const time = this.semanticAmbientElapsedMs;
        positions[offset] = baseX + Math.sin(time * 0.00072 + phase * Math.PI * 2) * amplitude;
        positions[offset + 1] = baseY + Math.cos(time * 0.00059 + phase * Math.PI * 2) * amplitude * 0.82;
      }
      this.graph.setPointPositions(positions);
      this.graph.render(undefined, 0);
      this.publishMotionTick(positions, now);
      this.semanticAmbientFrame = window.requestAnimationFrame(tick);
    };
    this.semanticAmbientFrame = window.requestAnimationFrame(tick);
  }

  private cancelSemanticAmbientFrame(): void {
    if (this.semanticAmbientFrame !== null) {
      window.cancelAnimationFrame(this.semanticAmbientFrame);
      this.semanticAmbientFrame = null;
    }
    this.semanticAmbientLastFrameAt = 0;
  }

  private isSemanticData(data: CosmosGraphData | null = this.data): boolean {
    return Boolean(data?.nodes.some((node) => node.semantic_level));
  }

  private markSimulationStarted(): void {
    if (this.simulationRunning) return;
    this.simulationRunning = true;
    this.emit({ simulationStarts: this.snapshot.simulationStarts + 1 });
  }

  private measureLiveExtent(positions: ArrayLike<number>): Partial<CosmosRuntimeSnapshot> {
    if (positions.length < 2) {
      return {
        simulatedWorldWidth: 0,
        simulatedWorldHeight: 0,
        simulatedWorldAspect: 1,
        screenFieldWidth: 0,
        screenFieldHeight: 0,
        screenFieldAspect: 1,
        cameraZoom: this.graph.getZoomLevel(),
      };
    }

    let minimumX = positions[0];
    let maximumX = positions[0];
    let minimumY = positions[1];
    let maximumY = positions[1];
    for (let index = 2; index < positions.length; index += 2) {
      minimumX = Math.min(minimumX, positions[index]);
      maximumX = Math.max(maximumX, positions[index]);
      minimumY = Math.min(minimumY, positions[index + 1]);
      maximumY = Math.max(maximumY, positions[index + 1]);
    }
    const worldWidth = Math.max(0, maximumX - minimumX);
    const worldHeight = Math.max(0, maximumY - minimumY);
    const [screenMinimumX, screenMinimumY] = this.graph.spaceToScreenPosition([minimumX, minimumY]);
    const [screenMaximumX, screenMaximumY] = this.graph.spaceToScreenPosition([maximumX, maximumY]);
    const screenWidth = Math.abs(screenMaximumX - screenMinimumX);
    const screenHeight = Math.abs(screenMaximumY - screenMinimumY);

    return {
      simulatedWorldWidth: worldWidth,
      simulatedWorldHeight: worldHeight,
      simulatedWorldAspect: worldHeight > 0 ? worldWidth / worldHeight : 1,
      screenFieldWidth: screenWidth,
      screenFieldHeight: screenHeight,
      screenFieldAspect: screenHeight > 0 ? screenWidth / screenHeight : 1,
      cameraZoom: this.graph.getZoomLevel(),
    };
  }

  private settleFinalFit(): void {
    if (this.destroyed || !this.data || this.snapshot.finalFitSettled) return;
    this.maximumTickGapMs = 0;
    this.maximumStepPx = 0;
    this.lastMotionProbeAt = 0;
    this.lastSimulationTickAt = performance.now();
    this.lastProbePosition = null;
    this.callbacks.onMotionProbe(null);
    this.emit({
      finalFitSettled: true,
      motionDiagnosticsEpoch: this.snapshot.motionDiagnosticsEpoch + 1,
      maximumTickGapMs: 0,
      maximumStepPx: 0,
      ...this.measureLiveExtent(this.graph.getPointPositions()),
    });
  }

  private recordDataStage(name: string, startedAt: number): void {
    recordHostMaximum(this.host, name, performance.now() - startedAt);
  }

  private fail(message: string): void {
    if (this.destroyed) return;
    this.cancelActivation();
    this.cancelSettle();
    this.cancelFinalFit();
    this.cancelSemanticAmbientFrame();
    this.ambientActive = false;
    this.lastSimulationTickAt = 0;
    this.graph.pause();
    this.emit({ status: 'failed', motionPhase: 'idle', error: message });
  }

  private scheduleActivation(callback: () => void, delay: number): void {
    const timer = window.setTimeout(() => {
      this.activationTimers.delete(timer);
      callback();
    }, delay);
    this.activationTimers.add(timer);
  }

  private scheduleSettle(callback: () => void, delay: number): void {
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = null;
      callback();
    }, delay);
  }

  private cancelActivation(): void {
    this.activationGeneration += 1;
    for (const timer of this.activationTimers) window.clearTimeout(timer);
    this.activationTimers.clear();
  }

  private cancelSettle(): void {
    if (this.settleTimer === null) return;
    window.clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }

  private cancelFinalFit(): void {
    if (this.finalFitTimer === null) return;
    window.clearTimeout(this.finalFitTimer);
    this.finalFitTimer = null;
  }

  private emit(patch: Partial<CosmosRuntimeSnapshot>): void {
    if (this.destroyed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.callbacks.onSnapshot({ ...this.snapshot });
  }
}

function selectExtentAnchorIndices(positions: readonly number[]): number[] {
  if (positions.length < 2) return [];
  const pointCount = Math.floor(positions.length / 2);
  const indices: number[] = [];
  for (const [offset, direction] of [[0, 1], [0, -1], [1, 1], [1, -1]] as const) {
    let candidate = 0;
    for (let index = 1; index < pointCount; index += 1) {
      const value = positions[index * 2 + offset];
      const candidateValue = positions[candidate * 2 + offset];
      if (value * direction > candidateValue * direction) candidate = index;
    }
    if (!indices.includes(candidate)) indices.push(candidate);
  }
  return indices;
}

function colorsToFloat32(colors: string[]): Float32Array {
  return new Float32Array(colors.flatMap((color) => hexToRgba(color)));
}

function hexToRgba(color: string): [number, number, number, number] {
  const value = color.startsWith('#') ? color.slice(1) : color;
  const normalized = value.length === 3 ? value.split('').map((part) => `${part}${part}`).join('') : value;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return [1, 1, 1, 1];
  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
    1,
  ];
}
