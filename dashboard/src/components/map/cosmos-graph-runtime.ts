import type { Graph } from '@cosmos.gl/graph';

import type { MapSelection } from './map-types.js';
import type { GraphViewportCommand } from './map-navigation.js';
import type {
  CosmosFocusNeighborhood,
  CosmosGraphData,
  CosmosMotionConfig,
} from './cosmos-graph-data.js';

type MotionPhase = 'idle' | 'settling' | 'activating' | 'transitioning';
type GraphTransition = 'initial' | 'focus' | 'expansion' | 'filter' | 'none';

export interface CosmosRuntimeSnapshot {
  status: 'loading' | 'ready' | 'failed' | 'disposed';
  motionPhase: MotionPhase;
  initialSettled: boolean;
  datasetVersion: number;
  lastTransition: GraphTransition;
  lastCommand: GraphViewportCommand | null;
  focusId: string | null;
  paused: boolean;
  reducedMotion: boolean;
  error: string | null;
}

export interface CosmosNodeOverlay {
  id: string;
  label: string;
  x: number;
  y: number;
  diameter: number;
  color: string;
  role: 'focus' | 'neighbor';
  labelX: number;
  labelY: number;
  labelWidth: number;
  labelHeight: number;
  labelVisible: boolean;
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
  const auraSize = Math.max(30, overlay.diameter * (overlay.role === 'focus' ? 2.8 : 1.9));
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
      Math.max(overlay.role === 'focus' ? 104 : 88, overlay.label.length * (overlay.role === 'focus' ? 7.2 : 6.8) + 20),
      Math.max(72, viewportWidth - LABEL_VIEWPORT_INSET * 2),
    );
    const labelHeight = overlay.role === 'focus' ? 32 : 28;
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
  onHover: (hover: { label: string; x: number; y: number } | null) => void;
  onNodeOverlays: (overlays: CosmosNodeOverlay[]) => void;
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
  datasetVersion: 0,
  lastTransition: 'none',
  lastCommand: null,
  focusId: null,
  paused: false,
  reducedMotion: false,
  error: null,
};

export class CosmosGraphRuntime {
  private snapshot: CosmosRuntimeSnapshot;
  private data: CosmosGraphData | null = null;
  private previousPointIds = new Set<string>();
  private previousLinkIds = new Set<string>();
  private activationGeneration = 0;
  private activationTimers = new Set<number>();
  private settleTimer: number | null = null;
  private pointerProbeTimer: number | null = null;
  private overlayFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private overlayFocus: CosmosFocusNeighborhood | null = null;
  private overlayIncludesNeighbors = false;
  private destroyed = false;
  private canvas: HTMLCanvasElement | null = null;
  private readonly contextLostHandler = (event: Event) => {
    event.preventDefault();
    this.fail('The rich memory constellation lost its graphics context.');
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
      backgroundColor: '#030915',
      pointDefaultColor: '#36c8ff',
      pointDefaultShape: 0,
      pointGreyoutColor: '#10243a',
      pointGreyoutOpacity: 0.08,
      pointDefaultSize: 12,
      pointOpacity: 0.92,
      pointSizeScale: 1,
      renderHoveredPointRing: true,
      hoveredPointRingColor: '#f2fbff',
      focusedPointRingColor: [0.72, 0.92, 1, 0.72],
      outlinedPointRingColor: [0.45, 0.78, 1, 0.42],
      linkDefaultColor: '#225979',
      linkOpacity: 0.62,
      linkGreyoutOpacity: 0.045,
      linkDefaultWidth: 0.72,
      linkColorInterpolateFromEndpoints: true,
      curvedLinks: true,
      curvedLinkSegments: 24,
      curvedLinkWeight: 0.72,
      curvedLinkControlPointDistance: 0.32,
      linkDefaultArrows: true,
      linkArrowsSizeScale: 0.62,
      linkDashLength: 6,
      linkDashGap: 5,
      transitionDuration: options.motion.transitionDuration,
      simulationDecay: 2_600,
      simulationGravity: 0.08,
      simulationCenter: 0.12,
      simulationRepulsion: 0.46,
      simulationLinkSpring: 0.42,
      simulationLinkDistance: 2.8,
      simulationFriction: 0.86,
      simulationCluster: 0,
      simulationCollision: 1,
      simulationCollisionPadding: 7,
      enableDrag: true,
      enableZoom: true,
      enableSimulation: true,
      enableSimulationDuringZoom: false,
      fitViewOnInit: true,
      fitViewDelay: options.reducedMotion ? 0 : 160,
      fitViewDuration: options.motion.transitionDuration,
      fitViewPadding: 0.12,
      randomSeed: 'thoth-memory-constellation',
      attribution: '',
      onPointClick: (index) => runtime?.selectPoint(index),
      onLinkClick: (index) => runtime?.selectLink(index),
      onBackgroundClick: () => callbacks.onSelect(null),
      onPointMouseOver: (index, _position, event) => runtime?.hoverPoint(index, event),
      onPointMouseOut: () => callbacks.onHover(null),
      onSimulationTick: () => runtime?.requestOverlayLayout(),
      onZoom: () => runtime?.requestOverlayLayout(),
    });

    try {
      await graph.ready;
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
    runtime.emit({ status: 'ready' });
    runtime.setPaused(options.paused);
    return runtime;
  }

  setData(data: CosmosGraphData): void {
    if (this.destroyed) return;
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

    this.cancelActivation();
    this.cancelSettle();

    const isInitial = this.data === null;
    const isExpansion =
      !isInitial &&
      [...this.previousPointIds].every((id) => pointIds.has(id)) &&
      [...this.previousLinkIds].every((id) => linkIds.has(id));
    const transition: GraphTransition = isInitial ? 'initial' : isExpansion ? 'expansion' : 'filter';
    const duration = this.snapshot.reducedMotion ? 0 : this.motion.transitionDuration;

    this.data = data;
    this.previousPointIds = pointIds;
    this.previousLinkIds = linkIds;
    this.graph.setPointPositions(new Float32Array(data.pointPositions));
    this.graph.setPointColors(colorsToFloat32(data.pointColors));
    this.graph.setPointSizes(new Float32Array(data.pointSizes));
    this.graph.setPointShapes(new Float32Array(data.pointShapes));
    this.graph.setLinks(new Float32Array(data.links));
    this.graph.setLinkColors(colorsToFloat32(data.linkColors));
    this.graph.setLinkWidths(new Float32Array(data.linkWidths));
    this.graph.setLinkStyles(new Float32Array(data.edges.map((edge) => edge.kind === 'metadata' ? 1 : 0)));
    this.graph.setLinkArrows(data.linkArrows);
    if (!this.snapshot.paused && !this.snapshot.reducedMotion) this.graph.unpause();
    this.graph.render(isInitial ? 0.86 : 0.5, duration);
    if (isInitial) this.graph.fitView(duration, 0.12, !this.snapshot.paused && !this.snapshot.reducedMotion);

    this.emit({
      datasetVersion: this.snapshot.datasetVersion + 1,
      lastTransition: transition,
      motionPhase: isInitial ? 'settling' : duration > 0 ? 'transitioning' : 'idle',
      initialSettled: isInitial && duration === 0 ? true : this.snapshot.initialSettled,
    });

    const settleDelay = isInitial ? this.motion.initialSettleMs : duration;
    if (settleDelay === 0) {
      this.finishMotion(isInitial);
    } else {
      this.scheduleSettle(() => this.finishMotion(isInitial), settleDelay);
    }
  }

  focus(focusId: string | null, focus: CosmosFocusNeighborhood | null): void {
    if (this.destroyed || !this.data) return;
    this.cancelActivation();
    this.graph.pause();
    if (!focusId || !focus) {
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
      this.graph.render(undefined, this.snapshot.reducedMotion ? 0 : this.motion.transitionDuration);
      this.emit({ focusId: null, motionPhase: 'idle' });
      return;
    }

    const generation = ++this.activationGeneration;
    const focusChanged = focusId !== this.snapshot.focusId;
    const duration = this.snapshot.reducedMotion ? 0 : this.motion.transitionDuration;
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
      this.fitFocusNeighborhood(focus, duration);
    }
    this.emit({
      focusId,
      lastTransition: focusChanged ? 'focus' : this.snapshot.lastTransition,
      motionPhase: duration > 0 ? 'activating' : 'idle',
    });

    if (this.motion.activationStepMs === 0) activateNeighbors();
    else this.scheduleActivation(activateNeighbors, this.motion.activationStepMs);

    if (duration === 0) this.finishMotion(false);
    else this.scheduleActivation(() => {
      if (generation === this.activationGeneration) this.finishMotion(false);
    }, duration + this.motion.activationStepMs);
  }

  command(command: GraphViewportCommand): void {
    if (this.destroyed) return;
    const duration = this.snapshot.reducedMotion ? 0 : this.motion.transitionDuration;
    const simulation = false;
    if (command === 'fit') this.graph.fitView(duration, 0.12, simulation);
    if (command === 'zoom-in') this.graph.setZoomLevel(Math.min(8, this.graph.getZoomLevel() * 1.25), duration, simulation);
    if (command === 'zoom-out') this.graph.setZoomLevel(Math.max(0.15, this.graph.getZoomLevel() * 0.8), duration, simulation);
    if (command === 'reset') this.graph.fitView(duration, 0.12, simulation);
    if (command.startsWith('pan-')) {
      const shift = command === 'pan-left' ? [120, 0] : command === 'pan-right' ? [-120, 0] : command === 'pan-up' ? [0, 120] : [0, -120];
      const positions = this.graph.getPointPositions().map((value, index) => value + shift[index % 2]);
      this.graph.setZoomTransformByPointPositions(new Float32Array(positions), duration, this.graph.getZoomLevel(), 0, simulation);
    }
    this.requestOverlayLayout();
    this.emit({ lastCommand: command });
  }

  setPaused(paused: boolean): void {
    if (this.destroyed) return;
    if (paused || this.snapshot.reducedMotion) this.graph.pause();
    else this.graph.unpause();
    if (paused) this.schedulePointerProbe();
    else this.clearPointerProbe();
    this.emit({ paused });
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
      this.graph.pause();
      this.emit({ reducedMotion: true, motionPhase: 'idle', initialSettled: true });
    } else {
      this.emit({ reducedMotion: false });
      if (!this.snapshot.paused) this.graph.unpause();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelActivation();
    this.cancelSettle();
    this.cancelOverlayFrame();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.canvas?.removeEventListener('webglcontextlost', this.contextLostHandler);
    this.clearPointerProbe();
    this.callbacks.onHover(null);
    this.callbacks.onNodeOverlays([]);
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
    const label = this.data?.pointLabels[index];
    if (!label) return;
    if (event) {
      const bounds = this.host.getBoundingClientRect();
      this.callbacks.onHover({ label, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
      return;
    }
    const positions = this.graph.getPointPositions();
    const [x, y] = this.graph.spaceToScreenPosition([positions[index * 2], positions[index * 2 + 1]]);
    this.callbacks.onHover({ label, x, y });
  }

  private focusedPointSizes(focus: CosmosFocusNeighborhood): number[] {
    if (!this.data) return [];
    const neighbors = new Set(focus.neighborPointIndices);
    return this.data.pointSizes.map((size, index) => {
      if (index === focus.pointIndex) return size * 1.34;
      if (neighbors.has(index)) return size * 1.08;
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

  private handleResize(): void {
    if (this.destroyed) return;
    if (this.overlayFocus) this.fitFocusNeighborhood(this.overlayFocus, 0);
    this.requestOverlayLayout();
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
    if (!this.data || !this.overlayFocus) {
      this.callbacks.onNodeOverlays([]);
      return;
    }
    const focus = this.overlayFocus;
    const positions = this.graph.getPointPositions();
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

  private finishMotion(initial: boolean): void {
    if (this.destroyed) return;
    this.graph.pause();
    if (initial) this.graph.fitView(0, 0.12, false);
    this.requestOverlayLayout();
    this.emit({ motionPhase: 'idle', initialSettled: initial ? true : this.snapshot.initialSettled });
  }

  private fail(message: string): void {
    if (this.destroyed) return;
    this.cancelActivation();
    this.cancelSettle();
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

  private emit(patch: Partial<CosmosRuntimeSnapshot>): void {
    if (this.destroyed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.callbacks.onSnapshot({ ...this.snapshot });
  }
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
