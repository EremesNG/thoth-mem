import { ApiError } from '../../api/client.js';
import type {
  VizGraphPageRequest,
  VizGraphPageResponse,
} from '../../api/client.js';
import { mergeVizSlices } from '../map/map-state.js';

export type FullAtlasLoadPhase = 'initial' | 'streaming' | 'restarting' | 'complete' | 'partial-error';

export interface FullAtlasSnapshot {
  phase: FullAtlasLoadPhase;
  data: VizGraphPageResponse | null;
  continuation: string | null;
  pagesLoaded: number;
  restartCount: number;
  error: string | null;
  errorCode: string | null;
}

interface LoadFullAtlasOptions {
  request: Omit<VizGraphPageRequest, 'cursor'>;
  signal: AbortSignal;
  fetchPage: (request: VizGraphPageRequest, signal: AbortSignal) => Promise<VizGraphPageResponse>;
  onSnapshot: (snapshot: FullAtlasSnapshot) => void;
  initialData?: VizGraphPageResponse | null;
  initialCursor?: string | null;
  maxAutomaticRestarts?: number;
  yieldControl?: () => Promise<void>;
}

type FrameHandle = number | ReturnType<typeof setTimeout>;

function createFramePublisher(onSnapshot: (snapshot: FullAtlasSnapshot) => void) {
  let frame: FrameHandle | null = null;
  let pending: FullAtlasSnapshot | null = null;

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
    schedule(snapshot: FullAtlasSnapshot) {
      pending = snapshot;
      if (frame !== null) return;
      frame = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(deliver)
        : setTimeout(deliver, 0);
    },
    flush(snapshot: FullAtlasSnapshot) {
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

function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== 'object') return null;
  const code = (error.body as Record<string, unknown>).code;
  return typeof code === 'string' ? code : null;
}

function isStaleGeneration(error: unknown): boolean {
  return error instanceof ApiError
    && error.status === 409
    && errorCode(error) === 'VIZ_GRAPH_GENERATION_STALE';
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Atlas loading was aborted', 'AbortError');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal);
}

async function yieldToBrowser(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & {
    scheduler?: { yield?: () => Promise<void> };
  }).scheduler;
  if (scheduler?.yield) {
    await scheduler.yield();
  } else {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (typeof requestAnimationFrame === 'function') {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function snapshot(
  phase: FullAtlasLoadPhase,
  data: VizGraphPageResponse | null,
  continuation: string | null,
  pagesLoaded: number,
  restartCount: number,
  error: string | null = null,
  code: string | null = null,
): FullAtlasSnapshot {
  return { phase, data, continuation, pagesLoaded, restartCount, error, errorCode: code };
}

export async function loadFullAtlas(options: LoadFullAtlasOptions): Promise<FullAtlasSnapshot> {
  const maxAutomaticRestarts = options.maxAutomaticRestarts ?? 2;
  const yieldControl = options.yieldControl ?? yieldToBrowser;
  const publisher = createFramePublisher(options.onSnapshot);
  let restartCount = 0;
  let accumulator = options.initialData ?? null;
  let continuation = options.initialCursor ?? null;
  let pagesLoaded = 0;

  publisher.flush(snapshot('initial', accumulator, continuation, pagesLoaded, restartCount));

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

          accumulator = accumulator ? mergeVizSlices(accumulator, response) : response;
          pagesLoaded += 1;
          continuation = response.continuation;

          if (continuation && seenCursors.has(continuation)) {
            throw new Error('Atlas pagination repeated a cursor');
          }
          if (continuation) seenCursors.add(continuation);

          if (!continuation) {
            const complete = snapshot('complete', accumulator, null, pagesLoaded, restartCount);
            publisher.flush(complete);
            return complete;
          }

          const streaming = snapshot('streaming', accumulator, continuation, pagesLoaded, restartCount);
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
          publisher.flush(snapshot('restarting', null, null, pagesLoaded, restartCount));
          await yieldControl();
          continue;
        }

        const failed = snapshot(
          'partial-error',
          isStaleGeneration(error) ? null : accumulator,
          isStaleGeneration(error) ? null : continuation,
          pagesLoaded,
          restartCount,
          error instanceof Error ? error.message : 'Failed to load the full atlas',
          errorCode(error),
        );
        publisher.flush(failed);
        return failed;
      }
    }
  } finally {
    publisher.dispose();
  }
}
