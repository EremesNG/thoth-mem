export type ResourcePhase = 'idle' | 'loading' | 'refreshing' | 'empty' | 'sparse' | 'dense' | 'truncated' | 'exhausted' | 'degraded' | 'aborted' | 'failed-inspection' | 'retry' | 'error';

export interface ResourceState<T> { phase: ResourcePhase; data: T | null; error: string | null; requestId: number }

export function createResourceState<T>(): ResourceState<T> { return { phase: 'idle', data: null, error: null, requestId: 0 }; }
export function beginRequest<T>(state: ResourceState<T>): ResourceState<T> { return { ...state, phase: state.data ? 'refreshing' : 'loading', error: null, requestId: state.requestId + 1 }; }
export function canCommitRequest<T>(state: ResourceState<T>, requestId: number): boolean { return state.requestId === requestId; }
export function boundedError(error: unknown): string { const message = error instanceof Error ? error.message : String(error); return message.slice(0, 320); }

export function deriveGraphPhase(input: { loading:boolean; hasData:boolean; nodeCount:number; dense:boolean; truncated:boolean; exhausted:boolean; degraded:boolean; error:boolean }): ResourcePhase {
  if (input.error && !input.hasData) return 'error';
  if (input.loading) return input.hasData ? 'refreshing' : 'loading';
  if (input.degraded) return 'degraded';
  if (!input.hasData || input.nodeCount === 0) return 'empty';
  if (input.truncated) return 'truncated';
  if (input.exhausted) return 'exhausted';
  return input.dense ? 'dense' : 'sparse';
}
