import {
  ApiError,
  type AtlasLevel,
  type SemanticAtlasPageRequest,
  type SemanticAtlasPageResponse,
} from '../../api/client.js';
import { mergeSemanticAtlasPages } from '../map/map-state.js';

export type SemanticAtlasLoadPhase =
  | 'initial'
  | 'streaming'
  | 'restarting'
  | 'complete'
  | 'recovery'
  | 'partial-error';

export interface SemanticAtlasSnapshot {
  phase: SemanticAtlasLoadPhase;
  data: SemanticAtlasPageResponse | null;
  continuation: string | null;
  pagesLoaded: number;
  restartCount: number;
  error: string | null;
  errorCode: string | null;
  recoveryLevel: AtlasLevel | null;
}

interface LoadSemanticAtlasOptions {
  request: Omit<SemanticAtlasPageRequest, 'cursor'>;
  signal: AbortSignal;
  fetchPage: (
    request: SemanticAtlasPageRequest,
    signal: AbortSignal,
  ) => Promise<SemanticAtlasPageResponse>;
  onSnapshot: (snapshot: SemanticAtlasSnapshot) => void;
  initialData?: SemanticAtlasPageResponse | null;
  initialCursor?: string | null;
  maxAutomaticRestarts?: number;
  yieldControl?: () => Promise<void>;
}

type FrameHandle = number | ReturnType<typeof setTimeout>;

function createFramePublisher(onSnapshot: (snapshot: SemanticAtlasSnapshot) => void) {
  let frame: FrameHandle | null = null;
  let pending: SemanticAtlasSnapshot | null = null;
  const cancel = () => {
    if (frame === null) return;
    if (typeof cancelAnimationFrame === 'function' && typeof frame === 'number') cancelAnimationFrame(frame);
    else clearTimeout(frame);
    frame = null;
  };
  const deliver = () => {
    frame = null;
    const snapshot = pending;
    pending = null;
    if (snapshot) onSnapshot(snapshot);
  };
  return {
    schedule(snapshot: SemanticAtlasSnapshot) {
      pending = snapshot;
      if (frame !== null) return;
      frame = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(deliver)
        : setTimeout(deliver, 0);
    },
    flush(snapshot: SemanticAtlasSnapshot) {
      cancel();
      pending = null;
      onSnapshot(snapshot);
    },
    dispose() {
      cancel();
      pending = null;
    },
  };
}

function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== 'object') return null;
  const code = (error.body as Record<string, unknown>).code;
  return typeof code === 'string' ? code : null;
}

function apiRecoveryLevel(error: unknown): AtlasLevel | null {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== 'object') return null;
  const level = (error.body as Record<string, unknown>).recover_to_level;
  return level === 'universe' || level === 'community' || level === 'neighborhood' ? level : null;
}

function isStaleGeneration(error: unknown): boolean {
  return error instanceof ApiError
    && error.status === 409
    && apiErrorCode(error) === 'VIZ_ATLAS_GENERATION_STALE';
}

function isRecoverableLocation(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const code = apiErrorCode(error);
  return code === 'VIZ_ATLAS_COMMUNITY_GONE' || code === 'VIZ_ATLAS_FOCUS_INVALID';
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Semantic atlas loading was aborted', 'AbortError');
}

async function yieldToBrowser(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) await scheduler.yield();
  else await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (typeof requestAnimationFrame === 'function') {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function makeSnapshot(
  phase: SemanticAtlasLoadPhase,
  data: SemanticAtlasPageResponse | null,
  continuation: string | null,
  pagesLoaded: number,
  restartCount: number,
  error: string | null = null,
  errorCode: string | null = null,
  recoveryLevel: AtlasLevel | null = null,
): SemanticAtlasSnapshot {
  return { phase, data, continuation, pagesLoaded, restartCount, error, errorCode, recoveryLevel };
}

export async function loadSemanticAtlas(options: LoadSemanticAtlasOptions): Promise<SemanticAtlasSnapshot> {
  const maxAutomaticRestarts = options.maxAutomaticRestarts ?? 2;
  const yieldControl = options.yieldControl ?? yieldToBrowser;
  const publisher = createFramePublisher(options.onSnapshot);
  let accumulator = options.initialData ?? null;
  let continuation = options.initialCursor ?? null;
  let pagesLoaded = 0;
  let restartCount = 0;
  publisher.flush(makeSnapshot('initial', accumulator, continuation, pagesLoaded, restartCount));

  try {
    for (;;) {
      const seenCursors = new Set<string>();
      if (continuation) seenCursors.add(continuation);
      try {
        for (;;) {
          throwIfAborted(options.signal);
          const response = await options.fetchPage({
            ...options.request,
            ...(continuation ? { cursor: continuation } : {}),
          }, options.signal);
          throwIfAborted(options.signal);
          accumulator = accumulator ? mergeSemanticAtlasPages(accumulator, response) : response;
          pagesLoaded += 1;
          continuation = response.continuation;
          if (continuation && seenCursors.has(continuation)) {
            throw new Error('Atlas pagination repeated a cursor');
          }
          if (continuation) seenCursors.add(continuation);

          const neighborhoodCapReached = accumulator.level === 'neighborhood'
            && accumulator.nodes.length >= 180;
          const semanticCommunityReady = response.level === 'community'
            && response.presentation === 'semantic-zoom';
          if (!continuation || neighborhoodCapReached || semanticCommunityReady) {
            const complete = makeSnapshot('complete', accumulator, continuation, pagesLoaded, restartCount);
            publisher.flush(complete);
            return complete;
          }
          const streaming = makeSnapshot('streaming', accumulator, continuation, pagesLoaded, restartCount);
          if (pagesLoaded === 1 && !options.initialData) publisher.flush(streaming);
          else publisher.schedule(streaming);
          await yieldControl();
        }
      } catch (error) {
        throwIfAborted(options.signal);
        if (isStaleGeneration(error) && restartCount < maxAutomaticRestarts) {
          restartCount += 1;
          accumulator = null;
          continuation = null;
          pagesLoaded = 0;
          publisher.flush(makeSnapshot('restarting', null, null, pagesLoaded, restartCount));
          await yieldControl();
          continue;
        }
        if (isRecoverableLocation(error)) {
          const recovery = makeSnapshot(
            'recovery',
            null,
            null,
            pagesLoaded,
            restartCount,
            error instanceof Error ? error.message : 'This constellation is no longer current',
            apiErrorCode(error),
            apiRecoveryLevel(error) ?? 'universe',
          );
          publisher.flush(recovery);
          return recovery;
        }
        const stale = isStaleGeneration(error);
        const failed = makeSnapshot(
          'partial-error',
          stale ? null : accumulator,
          stale ? null : continuation,
          pagesLoaded,
          restartCount,
          error instanceof Error ? error.message : 'Failed to load the semantic atlas',
          apiErrorCode(error),
        );
        publisher.flush(failed);
        return failed;
      }
    }
  } finally {
    publisher.dispose();
  }
}
