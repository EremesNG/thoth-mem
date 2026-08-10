import type { ObservationType } from '../../api/client.js';

export interface CreateObservationInput { title: string; content: string; type: ObservationType; project?: string; sessionId?: string; topicKey?: string }
export function buildCreateObservationPayload(input: CreateObservationInput) {
  return { title: input.title, content: input.content, type: input.type, project: input.project || undefined, session_id: input.sessionId || undefined, topic_key: input.topicKey || undefined };
}

export type CommandPhase = 'idle' | 'confirming' | 'pending' | 'success' | 'failure';
export interface CommandState { phase: CommandPhase; result: unknown; error: string | null }
export function transitionCommand(state: CommandState, event: 'review' | 'confirm' | 'success' | 'failure' | 'cancel', evidence?: unknown): CommandState {
  if (event === 'review' && state.phase === 'idle') return { ...state, phase: 'confirming' };
  if (event === 'confirm' && state.phase === 'confirming') return { ...state, phase: 'pending' };
  if (event === 'success' && state.phase === 'pending') return { phase: 'success', result: evidence, error: null };
  if (event === 'failure' && state.phase === 'pending') return { phase: 'failure', result: null, error: String(evidence ?? 'Command failed').slice(0, 320) };
  if (event === 'cancel' && state.phase === 'confirming') return { phase: 'idle', result: null, error: null };
  return state;
}
