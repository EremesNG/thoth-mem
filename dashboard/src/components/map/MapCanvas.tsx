import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import type { VizDensityState, VizEdge, VizNode, VizSemanticState } from '../../api/client.js';
import { buildCosmosGraphData, cosmosMotionConfig } from './cosmos-graph-data.js';
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
}

const initialRuntimeSnapshot: CosmosRuntimeSnapshot = {
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
  worldWidth: 0,
  worldHeight: 0,
  worldAspect: 1,
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
}: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<CosmosGraphRuntime | null>(null);
  const lifecycleGenerationRef = useRef(0);
  const onSelectRef = useRef(onSelect);
  const onPausedChangeRef = useRef(onPausedChange);
  const pausedRef = useRef(paused);
  const handledCommandIdRef = useRef<number | null>(null);
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [snapshot, setSnapshot] = useState<CosmosRuntimeSnapshot>({
    ...initialRuntimeSnapshot,
    paused,
  });
  const [hover, setHover] = useState<{ label: string; x: number; y: number } | null>(null);
  const [nodeOverlays, setNodeOverlays] = useState<CosmosNodeOverlay[]>([]);
  const [motionProbe, setMotionProbe] = useState<CosmosMotionProbe | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const reducedMotionRef = useRef(reducedMotion);
  const focusId = selection?.kind === 'node' ? selection.id : null;
  const graphData = useMemo(
    () => buildCosmosGraphData(nodes, edges, focusId),
    [edges, focusId, nodes],
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
  pausedRef.current = paused;
  reducedMotionRef.current = reducedMotion;

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
        onHover: setHover,
        onNodeOverlays: (nextOverlays) => {
          if (!cancelled && generation === lifecycleGenerationRef.current) setNodeOverlays(nextOverlays);
        },
        onMotionProbe: (nextProbe) => {
          if (!cancelled && generation === lifecycleGenerationRef.current) setMotionProbe(nextProbe);
        },
        onSnapshot: (nextSnapshot) => {
          if (!cancelled && generation === lifecycleGenerationRef.current) setSnapshot(nextSnapshot);
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
        const currentData = graphDataRef.current;
        runtime.setData(currentData);
        runtime.focus(
          currentData.focus ? currentData.pointIds[currentData.focus.pointIndex] : null,
          currentData.focus,
        );
      })
      .catch((cause: unknown) => {
        if (cancelled || generation !== lifecycleGenerationRef.current) return;
        const message = cause instanceof Error ? cause.message : 'The rich memory constellation could not start.';
        setSnapshot((current) => ({ ...current, status: 'failed', error: message, motionPhase: 'idle' }));
      });

    return () => {
      cancelled = true;
      lifecycleGenerationRef.current += 1;
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      runtime?.destroy();
      host.replaceChildren();
    };
  }, [runtimeKey]);

  useEffect(() => {
    runtimeRef.current?.setData(graphData);
  }, [graphData]);

  useEffect(() => {
    runtimeRef.current?.focus(focusId, graphData.focus);
  }, [focusId, graphData.focus]);

  useEffect(() => {
    runtimeRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    runtimeRef.current?.setReducedMotion(reducedMotion, cosmosMotionConfig(reducedMotion));
  }, [reducedMotion]);

  useEffect(() => {
    if (!command) return;
    if (handledCommandIdRef.current === command.id) return;
    handledCommandIdRef.current = command.id;
    if (command.type === 'toggle-pause') {
      onPausedChangeRef.current?.(!pausedRef.current);
      return;
    }
    runtimeRef.current?.command(command.type);
  }, [command]);

  return (
    <div
      className="map-canvas-shell"
      data-testid="map-canvas-shell"
      data-renderer="cosmos"
      data-visual-language="organic-neural"
      data-point-shape="circle"
      data-curved-links="true"
      data-community-count={communityColors.length}
      data-renderer-status={snapshot.status}
      data-motion-phase={snapshot.motionPhase}
      data-initial-settled={String(snapshot.initialSettled)}
      data-dataset-version={snapshot.datasetVersion}
      data-last-transition={snapshot.lastTransition}
      data-last-command={snapshot.lastCommand ?? ''}
      data-focus-id={snapshot.focusId ?? ''}
      data-paused={String(snapshot.paused)}
      data-reduced-motion={String(reducedMotion)}
      data-transition-duration={cosmosMotionConfig(reducedMotion).transitionDuration}
      data-world-width={snapshot.worldWidth}
      data-world-height={snapshot.worldHeight}
      data-world-aspect={snapshot.worldAspect}
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
          const auraSize = Math.max(30, overlay.diameter * (overlay.role === 'focus' ? 2.8 : 1.9));
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
                <button
                  type="button"
                  className="cosmos-node-label"
                  data-role={overlay.role}
                  style={{
                    left: overlay.labelX - overlay.x,
                    top: overlay.labelY - overlay.y,
                    width: overlay.labelWidth,
                    height: overlay.labelHeight,
                  }}
                  onClick={() => onSelectRef.current({ kind: 'node', id: overlay.id })}
                >
                  {overlay.label}
                </button>
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
