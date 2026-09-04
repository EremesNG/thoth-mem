import { createHash } from 'node:crypto';

import type { LifecycleInput, ProjectIdentityInput } from '../../memory-core/contracts.js';
import { sanitizePrivateContent } from '../../memory-core/privacy.js';
import { resolveLocalProjectIdentity } from '../project-identity.js';

const MAX_IDENTIFIER_CODE_POINTS = 200;

export interface PiSessionManagerIdentity {
  getSessionId(): string;
  getLeafId(): string | undefined;
}

export interface PiLifecycleContext {
  cwd: string;
  sessionManager: PiSessionManagerIdentity;
}

export interface PiLifecycleState {
  directory: string;
  rootSessionKey: string;
  project: ProjectIdentityInput;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || Array.from(value).length > MAX_IDENTIFIER_CODE_POINTS || /[\r\n\0]/u.test(value)) throw new Error(`Pi ${label} identity is invalid`);
  return value.trim();
}

function eventKey(kind: string, parts: unknown[]): string {
  return `pi:${kind}:${createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`;
}

function base(state: PiLifecycleState, operation: LifecycleInput['operation'], key: string): LifecycleInput {
  return { operation, harness: 'pi', project: state.project, rootSessionKey: state.rootSessionKey, eventKey: key, capability: { nativeEvent: kindFor(operation), contextInjection: operation === 'recover' || operation === 'guide_post_compact', modelConsumption: false } };
}

function kindFor(operation: LifecycleInput['operation']): string {
  const values: Record<LifecycleInput['operation'], string> = {
    enroll: 'session_start', recover: 'session_start', capture_root: 'input', checkpoint_pre_compact: 'session_before_compact', guide_post_compact: 'session_compact', finalize: 'session_shutdown',
  };
  return values[operation];
}

export function createPiLifecycleState(context: PiLifecycleContext): PiLifecycleState {
  const directory = identifier(context.cwd, 'working directory');
  const rootSessionKey = identifier(context.sessionManager.getSessionId(), 'root session');
  return { directory, rootSessionKey, project: resolveLocalProjectIdentity(directory) };
}

export function piSessionStartInput(state: PiLifecycleState, reason: string): LifecycleInput {
  const stableReason = identifier(reason, 'session start reason');
  return base(state, 'enroll', eventKey('start', [state.rootSessionKey, stableReason]));
}

export function piRecoveryInput(state: PiLifecycleState, phase: 'start' | 'context' | 'post_compact'): LifecycleInput {
  return base(state, phase === 'post_compact' ? 'guide_post_compact' : 'recover', eventKey('recovery', [state.rootSessionKey, phase]));
}

export function piInputCapture(state: PiLifecycleState, context: PiLifecycleContext, event: { text: string; source: string; streamingBehavior?: string }): LifecycleInput | undefined {
  if (event.source !== 'interactive' && event.source !== 'rpc') return undefined;
  const content = sanitizePrivateContent(event.text.trim());
  if (!content) return undefined;
  const leafId = identifier(context.sessionManager.getLeafId(), 'leaf');
  const streamingBehavior = typeof event.streamingBehavior === 'string' ? event.streamingBehavior.slice(0, 80) : '';
  return { ...base(state, 'capture_root', eventKey('input', [state.rootSessionKey, leafId, event.source, streamingBehavior, content])), content: content.slice(0, 20_000) };
}

export function piPreCompactInput(state: PiLifecycleState, event: { firstKeptEntryId?: string; reason: string; isRetry?: boolean }): LifecycleInput {
  return base(state, 'checkpoint_pre_compact', eventKey('pre-compact', [state.rootSessionKey, event.firstKeptEntryId ?? '', event.reason, event.isRetry === true]));
}

export function piPostCompactInput(state: PiLifecycleState, event: { compactionEntryId?: string; reason: string; isRetry?: boolean }): LifecycleInput {
  return base(state, 'guide_post_compact', eventKey('post-compact', [state.rootSessionKey, event.compactionEntryId ?? '', event.reason, event.isRetry === true]));
}

export function piShutdownInput(state: PiLifecycleState, event: { reason: string; sessionFile?: string }): LifecycleInput | undefined {
  if (event.reason === 'reload') return undefined;
  return base(state, 'finalize', eventKey('shutdown', [state.rootSessionKey, event.reason, event.sessionFile ?? '']));
}

