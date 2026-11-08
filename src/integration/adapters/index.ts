import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

import type { Harness, LifecycleInput, SessionSummaryInput } from '../../memory-core/contracts.js';
import { sanitizePrivateContent } from '../../memory-core/privacy.js';
import { canonicalizeSessionSummary } from '../../memory-core/session-summaries.js';
import { resolveLocalProjectIdentity } from '../project-identity.js';

export type LifecycleIntent = 'session.enroll' | 'session.recover' | 'prompt.capture_root' | 'session.checkpoint_pre_compact' | 'session.guide_post_compact' | 'session.finalize';
const OPERATIONS: Record<LifecycleIntent, LifecycleInput['operation']> = { 'session.enroll': 'enroll', 'session.recover': 'recover', 'prompt.capture_root': 'capture_root', 'session.checkpoint_pre_compact': 'checkpoint_pre_compact', 'session.guide_post_compact': 'guide_post_compact', 'session.finalize': 'finalize' };

export interface AdapterEvent { version: 3; harness: Harness; intent: LifecycleIntent; projectKey: string; projectName: string; rootSessionKey: string; eventKey: string; content?: string; summary?: SessionSummaryInput; callerRole?: 'root' | 'delegated' }

type NativeHarness = 'opencode' | 'codex' | 'claude';
function object(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} payload is unsupported`); return value as Record<string, unknown>; }
function required(value: unknown, label: string): string { if (typeof value !== 'string' || !value.trim() || /[\r\n\0]/u.test(value)) throw new Error(`Stable native ${label} identity is required`); return value.trim(); }
function optional(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function sanitizedOptional(value: unknown): string | undefined { const normalized = optional(value); return normalized ? sanitizePrivateContent(normalized) : undefined; }
function structuredSummary(value: unknown, operation: LifecycleInput['operation'], verifiedRoot = true): SessionSummaryInput | undefined {
  if (value === undefined) return undefined;
  if (!verifiedRoot) throw new Error('A verified root identity is required to submit a structured summary');
  if (operation !== 'checkpoint_pre_compact' && operation !== 'finalize') throw new Error('Structured summaries are unsupported for this lifecycle event');
  return canonicalizeSessionSummary(value as SessionSummaryInput).input;
}
function projectFrom(directory: string, explicit?: Record<string, unknown>): LifecycleInput['project'] {
  if (directory !== 'unknown' && existsSync(directory)) return resolveLocalProjectIdentity(directory);
  const normalized = directory.replaceAll('\\', '/').replace(/\/$/, '');
  return { key: optional(explicit?.key) ?? `path:${normalized}`, name: optional(explicit?.name) ?? normalized.split('/').at(-1) ?? normalized };
}
function hashedEventKey(namespace: string, parts: unknown[]): string { return `${namespace}:${createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`; }
function codexEventKey(confidence: 'confirmed' | 'degraded', parts: unknown[]): string { return hashedEventKey(`codex:${confidence}`, parts); }
function claudeEventKey(parts: unknown[]): string { return hashedEventKey('claude', parts); }

export function normalizeAdapterEvent(event: AdapterEvent): LifecycleInput {
  if (event.version !== 3) throw new Error('Unsupported lifecycle payload version');
  if (event.callerRole === 'delegated') throw new Error('Lifecycle identity is unverified or delegated');
  if (!event.projectKey.trim() || !event.rootSessionKey.trim() || !event.eventKey.trim()) throw new Error('Stable lifecycle identity is required');
  const operation = OPERATIONS[event.intent]; if (!operation) throw new Error('Unsupported lifecycle intent');
  const content = event.content ? sanitizePrivateContent(event.content) : undefined;
  const summary = structuredSummary(event.summary, operation);
  return { operation, harness: event.harness, project: { key: event.projectKey, name: event.projectName }, rootSessionKey: event.rootSessionKey, eventKey: event.eventKey, ...(content ? { content } : {}), ...(summary ? { summary } : {}) };
}

export function normalizeNativePayload(harness: NativeHarness, value: unknown): LifecycleInput {
  const payload = object(value, harness);
  if (harness === 'opencode') {
    const event = required(payload.type, 'event'); const eventKey = required(payload.id, 'event key'); const data = object(payload.data, 'OpenCode data');
    if (data.parentID !== undefined) throw new Error('Native lifecycle identity is delegated');
    // The plugin verifies ancestry before normalizing events without parent metadata.
    const rootSessionKey = required(data.sessionID, 'root session');
    const operations: Record<string, LifecycleInput['operation']> = { 'session.created': 'enroll', 'session.compaction.ended': 'guide_post_compact', 'session.deleted': 'finalize' };
    const operation = operations[event]; if (!operation) throw new Error('Unsupported OpenCode lifecycle event');
    const location = object(payload.location ?? data.location ?? {}, 'OpenCode location');
    const directory = optional(location.directory) ?? optional(payload.directory) ?? 'unknown';
    const project = projectFrom(directory, object(payload.project ?? {}, 'OpenCode project'));
    const content = operation === 'guide_post_compact' ? sanitizedOptional(data.text) : undefined;
    return { operation, harness, project, rootSessionKey, eventKey, ...(content ? { content: content.slice(0, 20_000) } : {}), capability: { nativeEvent: event, contextInjection: false, modelConsumption: false } };
  }
  const event = required(payload.hook_event_name, 'event'); const rootSessionKey = required(payload.session_id, 'root session'); const directory = required(payload.cwd, 'project');
  if (harness === 'codex') {
    let operation: LifecycleInput['operation'];
    let stablePart: string | undefined;
    if (event === 'SessionStart') {
      const source = required(payload.source, 'session source');
      if (!['startup', 'resume', 'clear', 'compact'].includes(source)) throw new Error('Unsupported codex SessionStart source');
      operation = source === 'compact' ? 'guide_post_compact' : 'recover';
      stablePart = source;
    } else if (event === 'SessionEnd') {
      operation = 'finalize';
      stablePart = required(payload.reason, 'session end reason');
    } else {
      const operations: Record<string, LifecycleInput['operation']> = { UserPromptSubmit: 'capture_root', PreCompact: 'checkpoint_pre_compact', PostCompact: 'guide_post_compact' };
      const mapped = operations[event]; if (!mapped) throw new Error('Unsupported codex lifecycle event');
      operation = mapped;
      stablePart = optional(payload.turn_id);
    }
    const identityConfidence = stablePart ? 'confirmed' : 'degraded';
    const fallbackParts = [payload.prompt, payload.trigger, payload.transcript_path].map(sanitizedOptional);
    const content = operation === 'capture_root' ? sanitizedOptional(payload.prompt) : undefined;
    const identityPart = operation === 'capture_root' && stablePart ? [stablePart, content] : stablePart ?? fallbackParts;
    const eventKey = codexEventKey(identityConfidence, [rootSessionKey, event, operation, identityPart]);
    const summary = structuredSummary(payload.thoth_mem_summary, operation, identityConfidence === 'confirmed');
    return { operation, harness, project: projectFrom(directory), rootSessionKey, eventKey, identityConfidence, ...(content ? { content: content.slice(0, 20_000) } : {}), ...(summary ? { summary } : {}), capability: { nativeEvent: event, contextInjection: event === 'SessionStart', modelConsumption: false } };
  }
  const sessionStartOperation: LifecycleInput['operation'] = payload.source === 'compact' ? 'guide_post_compact' : 'recover';
  const operations: Record<string, LifecycleInput['operation']> = { SessionStart: sessionStartOperation, UserPromptSubmit: 'capture_root', PreCompact: 'checkpoint_pre_compact', PostCompact: 'guide_post_compact', Stop: 'finalize', SessionEnd: 'finalize' };
  const operation = operations[event]; if (!operation) throw new Error(`Unsupported ${harness} lifecycle event`);
  let content: string | undefined;
  if (operation === 'capture_root') content = sanitizedOptional(payload.prompt);
  else if (event === 'PostCompact') content = sanitizedOptional(payload.compact_summary);
  else if (event !== 'SessionStart' || payload.source !== 'compact') content = sanitizedOptional(payload.summary ?? payload.content);
  const nativeIdentity = [sanitizedOptional(payload.transcript_path), sanitizedOptional(payload.source), sanitizedOptional(payload.trigger), content];
  const eventKey = claudeEventKey([rootSessionKey, event, operation, nativeIdentity]);
  const summary = structuredSummary(payload.thoth_mem_summary, operation);
  return { operation, harness, project: projectFrom(directory), rootSessionKey, eventKey, ...(content ? { content: content.slice(0, 20_000) } : {}), ...(summary ? { summary } : {}), capability: { nativeEvent: event, contextInjection: event === 'PostCompact' || event === 'SessionStart', modelConsumption: false } };
}
