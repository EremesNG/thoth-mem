import {
  LIFECYCLE_INTENTS,
  type AdapterCapabilities,
  type HarnessId,
  type LifecycleIntent,
  type LifecycleOutcome,
  type NormalizedEvent,
} from '../core/types.js';
import {
  createClaudeCodeCapabilities,
  normalizeClaudeCodeEvent,
  type ClaudeCodeCapabilityEvidence,
} from '../adapters/claude-code.js';
import {
  createCodexCapabilities,
  normalizeCodexEvent,
  type CodexCapabilityEvidence,
} from '../adapters/codex.js';
import {
  createOpenCodeCapabilities,
  normalizeOpenCodeEvent,
  type OpenCodeCapabilityEvidence,
} from '../adapters/opencode.js';
import type { AdapterEventResult } from '../adapters/shared.js';

export const HOOK_PROTOCOL_VERSION = 1;
const MAX_HOOK_INPUT_LENGTH = 1_048_576;
const MAX_DIAGNOSTIC_CODE_POINTS = 600;
const MAX_EVIDENCE_ITEMS = 16;
const MAX_EVIDENCE_TOKEN_CODE_POINTS = 128;
const MAX_EVIDENCE_REASON_CODE_POINTS = 400;

const OPENCODE_EVENTS = [
  'session.created',
  'chat.message',
  'experimental.chat.system.transform',
  'experimental.session.compacting',
] as const;
const CLAUDE_HOOKS = ['SessionStart', 'UserPromptSubmit', 'PreCompact', 'Stop'] as const;
const CODEX_HOOKS: Record<LifecycleIntent, string> = {
  enroll_session: 'SessionStart',
  capture_root_prompt: 'UserPromptSubmit',
  recall_guidance: 'SessionStartContext',
  compact_session: 'PreCompact',
  finalize_session: 'Stop',
};

export interface HookCommandRequest {
  protocolVersion: 1;
  harness: HarnessId;
  event: unknown;
  context?: unknown;
  capabilityEvidence?: unknown;
}

export interface HookExecutionResult {
  outcome: LifecycleOutcome;
  retryable: boolean;
  harness: HarnessId;
  intent: LifecycleIntent;
}

export type HookEventExecutor = (
  event: NormalizedEvent,
  capabilities: AdapterCapabilities,
) => Promise<HookExecutionResult>;

export interface HookCommandResponse {
  protocolVersion: 1;
  harness?: HarnessId;
  intent?: LifecycleIntent;
  outcome: LifecycleOutcome;
  retryable: boolean;
  diagnostic?: string;
}

function boundedDiagnostic(message: string): string {
  return Array.from(message).slice(0, MAX_DIAGNOSTIC_CODE_POINTS).join('');
}

function degradedResponse(
  diagnostic: string,
  harness?: HarnessId,
  intent?: LifecycleIntent,
): HookCommandResponse {
  return {
    protocolVersion: HOOK_PROTOCOL_VERSION,
    ...(harness ? { harness } : {}),
    ...(intent ? { intent } : {}),
    outcome: 'degraded',
    retryable: false,
    diagnostic: boundedDiagnostic(diagnostic),
  };
}

function failedResponse(harness: HarnessId, intent: LifecycleIntent): HookCommandResponse {
  return {
    protocolVersion: HOOK_PROTOCOL_VERSION,
    harness,
    intent,
    outcome: 'failed',
    retryable: true,
    diagnostic: 'Lifecycle execution failed before memory success was confirmed. Retry the same event.',
  };
}

function isHarnessId(value: unknown): value is HarnessId {
  return value === 'opencode' || value === 'codex' || value === 'claude';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function isBoundedString(value: unknown, maximumCodePoints: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && Array.from(value).length <= maximumCodePoints;
}

function parseAllowlistedArray(
  value: unknown,
  allowed: ReadonlySet<string>,
): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE_ITEMS) {
    return null;
  }
  const parsed: string[] = [];
  for (const entry of value) {
    if (!isBoundedString(entry, MAX_EVIDENCE_TOKEN_CODE_POINTS) || !allowed.has(entry)) {
      return null;
    }
    parsed.push(entry);
  }
  return parsed;
}

function parseOpenCodeEvidence(value: unknown): OpenCodeCapabilityEvidence | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'hostVersion',
    'verifiedEvents',
    'incompleteEvents',
  ])) {
    return null;
  }
  if (value.hostVersion !== undefined
    && !isBoundedString(value.hostVersion, MAX_EVIDENCE_TOKEN_CODE_POINTS)) {
    return null;
  }

  const allowedEvents = new Set<string>(OPENCODE_EVENTS);
  const verifiedEvents = value.verifiedEvents === undefined
    ? []
    : parseAllowlistedArray(value.verifiedEvents, allowedEvents);
  const incompleteEvents = value.incompleteEvents === undefined
    ? []
    : parseAllowlistedArray(value.incompleteEvents, allowedEvents);
  if (!verifiedEvents || !incompleteEvents) {
    return null;
  }
  if (verifiedEvents.some((event) => incompleteEvents.includes(event))) {
    return null;
  }

  return {
    ...(value.hostVersion !== undefined ? { hostVersion: value.hostVersion } : {}),
    ...(value.verifiedEvents !== undefined ? { verifiedEvents } : {}),
    ...(value.incompleteEvents !== undefined ? { incompleteEvents } : {}),
  };
}

function parseClaudeEvidence(value: unknown): ClaudeCodeCapabilityEvidence | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['availableHooks'])) {
    return null;
  }
  if (value.availableHooks === undefined) {
    return {};
  }
  const availableHooks = parseAllowlistedArray(
    value.availableHooks,
    new Set<string>(CLAUDE_HOOKS),
  );
  return availableHooks
    ? { availableHooks: availableHooks as ClaudeCodeCapabilityEvidence['availableHooks'] }
    : null;
}

function parseCodexVerifiedHooks(value: unknown): CodexCapabilityEvidence['verifiedHooks'] | null {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value) || !hasOnlyKeys(value, LIFECYCLE_INTENTS)) {
    return null;
  }

  const parsed: NonNullable<CodexCapabilityEvidence['verifiedHooks']> = {};
  for (const intent of LIFECYCLE_INTENTS) {
    const trigger = value[intent];
    if (trigger === undefined) {
      continue;
    }
    if (!isBoundedString(trigger, MAX_EVIDENCE_TOKEN_CODE_POINTS)
      || trigger !== CODEX_HOOKS[intent]) {
      return null;
    }
    parsed[intent] = trigger;
  }
  return parsed;
}

function parseCodexIncompleteHooks(
  value: unknown,
): CodexCapabilityEvidence['incompleteHooks'] | null {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value) || !hasOnlyKeys(value, LIFECYCLE_INTENTS)) {
    return null;
  }

  const parsed: NonNullable<CodexCapabilityEvidence['incompleteHooks']> = {};
  for (const intent of LIFECYCLE_INTENTS) {
    const entry = value[intent];
    if (entry === undefined) {
      continue;
    }
    if (!isRecord(entry)
      || !hasOnlyKeys(entry, ['trigger', 'reason'])
      || !isBoundedString(entry.trigger, MAX_EVIDENCE_TOKEN_CODE_POINTS)
      || entry.trigger !== CODEX_HOOKS[intent]
      || !isBoundedString(entry.reason, MAX_EVIDENCE_REASON_CODE_POINTS)) {
      return null;
    }
    parsed[intent] = { trigger: entry.trigger, reason: entry.reason };
  }
  return parsed;
}

function parseCodexEvidence(value: unknown): CodexCapabilityEvidence | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['verifiedHooks', 'incompleteHooks'])) {
    return null;
  }
  const verifiedHooks = parseCodexVerifiedHooks(value.verifiedHooks);
  const incompleteHooks = parseCodexIncompleteHooks(value.incompleteHooks);
  if (!verifiedHooks || !incompleteHooks) {
    return null;
  }
  for (const intent of LIFECYCLE_INTENTS) {
    if (verifiedHooks[intent] !== undefined && incompleteHooks[intent] !== undefined) {
      return null;
    }
  }
  return {
    ...(value.verifiedHooks !== undefined ? { verifiedHooks } : {}),
    ...(value.incompleteHooks !== undefined ? { incompleteHooks } : {}),
  };
}

type ParsedCapabilityEvidence =
  | OpenCodeCapabilityEvidence
  | CodexCapabilityEvidence
  | ClaudeCodeCapabilityEvidence;

function parseCapabilityEvidence(request: HookCommandRequest): ParsedCapabilityEvidence | null {
  const evidence = request.capabilityEvidence ?? {};
  switch (request.harness) {
    case 'opencode':
      return parseOpenCodeEvidence(evidence);
    case 'codex':
      return parseCodexEvidence(evidence);
    case 'claude':
      return parseClaudeEvidence(evidence);
  }
}

function isLifecycleOutcome(value: unknown): value is LifecycleOutcome {
  return value === 'confirmed'
    || value === 'failed'
    || value === 'degraded'
    || value === 'no_op';
}

function isValidExecutionResult(
  value: unknown,
  event: NormalizedEvent,
): value is HookExecutionResult {
  if (!isRecord(value)) {
    return false;
  }
  return isLifecycleOutcome(value.outcome)
    && typeof value.retryable === 'boolean'
    && value.harness === event.harness
    && value.intent === event.intent;
}

function parseRequest(input: string): HookCommandRequest | HookCommandResponse {
  if (input.length > MAX_HOOK_INPUT_LENGTH) {
    return degradedResponse('Hook request exceeded the bounded JSON input limit.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return degradedResponse('Hook request is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return degradedResponse('Hook request must be a JSON object.');
  }

  const request = parsed as Record<string, unknown>;
  if (request.protocolVersion !== HOOK_PROTOCOL_VERSION) {
    return degradedResponse('Hook protocol version is unsupported.');
  }
  if (!isHarnessId(request.harness)) {
    return degradedResponse('Hook request harness is missing or unsupported.');
  }
  if (!Object.hasOwn(request, 'event')) {
    return degradedResponse('Hook request event payload is missing.', request.harness);
  }
  if (Object.hasOwn(request, 'capabilityEvidence')
    && (typeof request.capabilityEvidence !== 'object'
      || request.capabilityEvidence === null
      || Array.isArray(request.capabilityEvidence))) {
    return degradedResponse(
      'Hook request capability evidence must be a JSON object when provided.',
      request.harness,
    );
  }

  return {
    protocolVersion: HOOK_PROTOCOL_VERSION,
    harness: request.harness,
    event: request.event,
    ...(Object.hasOwn(request, 'context') ? { context: request.context } : {}),
    ...(Object.hasOwn(request, 'capabilityEvidence')
      ? { capabilityEvidence: request.capabilityEvidence }
      : {}),
  };
}

function normalizeRequest(
  request: HookCommandRequest,
  evidence: ParsedCapabilityEvidence,
): {
  capabilities: AdapterCapabilities;
  result: AdapterEventResult;
} {
  switch (request.harness) {
    case 'opencode': {
      const capabilities = createOpenCodeCapabilities(
        evidence as OpenCodeCapabilityEvidence,
      );
      return {
        capabilities,
        result: normalizeOpenCodeEvent({
          event: request.event,
          ...(request.context !== undefined ? { context: request.context } : {}),
        }, capabilities),
      };
    }
    case 'codex': {
      const capabilities = createCodexCapabilities(
        evidence as CodexCapabilityEvidence,
      );
      return {
        capabilities,
        result: normalizeCodexEvent(request.event, capabilities),
      };
    }
    case 'claude': {
      const capabilities = createClaudeCodeCapabilities(
        evidence as ClaudeCodeCapabilityEvidence,
      );
      return {
        capabilities,
        result: normalizeClaudeCodeEvent(request.event, capabilities),
      };
    }
  }
}

function adapterResponse(
  harness: HarnessId,
  result: Extract<AdapterEventResult, { action: 'return' }>,
): HookCommandResponse {
  return {
    protocolVersion: HOOK_PROTOCOL_VERSION,
    harness,
    ...(result.intent ? { intent: result.intent } : {}),
    outcome: result.outcome,
    retryable: result.retryable,
    ...(result.outcome === 'degraded'
      ? { diagnostic: boundedDiagnostic(result.diagnostic?.reason ?? result.reason) }
      : {}),
  };
}

export async function executeHookCommand(
  input: string,
  executor: HookEventExecutor,
): Promise<HookCommandResponse> {
  const request = parseRequest(input);
  if (!('event' in request)) {
    return request;
  }

  let normalized: ReturnType<typeof normalizeRequest>;
  try {
    const evidence = parseCapabilityEvidence(request);
    if (!evidence) {
      return degradedResponse(
        'Hook capability evidence is malformed or unsupported.',
        request.harness,
      );
    }
    normalized = normalizeRequest(request, evidence);
  } catch {
    return degradedResponse(
      'Hook capability evidence or event payload could not be normalized safely.',
      request.harness,
    );
  }
  if (normalized.result.action === 'return') {
    return adapterResponse(request.harness, normalized.result);
  }

  const { event } = normalized.result;
  try {
    const result = await executor(event, normalized.capabilities);
    if (!isValidExecutionResult(result, event)) {
      return failedResponse(request.harness, event.intent);
    }
    return {
      protocolVersion: HOOK_PROTOCOL_VERSION,
      harness: request.harness,
      intent: event.intent,
      outcome: result.outcome,
      retryable: result.retryable,
    };
  } catch {
    return failedResponse(request.harness, event.intent);
  }
}
