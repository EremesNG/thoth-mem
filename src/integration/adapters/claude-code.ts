import type {
  AdapterCapabilities,
  LifecycleIntent,
  NormalizedEvent,
} from '../core/types.js';
import {
  asRecord,
  degraded,
  dispatch,
  isDelegatedPayload,
  noOp,
  normalizedIdentity,
  readSequence,
  readString,
  supported,
  unsupported,
  type AdapterEventResult,
} from './shared.js';

const CLAUDE_HOOKS = ['SessionStart', 'UserPromptSubmit', 'PreCompact', 'Stop'] as const;
type ClaudeHook = typeof CLAUDE_HOOKS[number];

export interface ClaudeCodeCapabilityEvidence {
  availableHooks?: readonly ClaudeHook[];
}

export function createClaudeCodeCapabilities(
  evidence: ClaudeCodeCapabilityEvidence = {},
): AdapterCapabilities {
  const availableHooks = new Set<ClaudeHook>(evidence.availableHooks ?? CLAUDE_HOOKS);
  const hookCapability = (hook: ClaudeHook) => availableHooks.has(hook)
    ? supported(hook)
    : unsupported(`Claude Code hook ${hook} is unavailable.`);

  return {
    enroll_session: hookCapability('SessionStart'),
    capture_root_prompt: hookCapability('UserPromptSubmit'),
    recall_guidance: hookCapability('SessionStart'),
    compact_session: hookCapability('PreCompact'),
    finalize_session: hookCapability('Stop'),
  };
}

function intentForClaudeHook(
  hook: string,
  payload: Record<string, unknown>,
): LifecycleIntent | undefined {
  switch (hook) {
    case 'SessionStart':
      return readString(payload, 'source') === 'compact'
        ? 'recall_guidance'
        : 'enroll_session';
    case 'UserPromptSubmit':
      return 'capture_root_prompt';
    case 'PreCompact':
      return 'compact_session';
    case 'Stop':
      return 'finalize_session';
    default:
      return undefined;
  }
}

function eventMetadata(payload: Record<string, unknown>): Pick<
  NormalizedEvent,
  'nativeEventId' | 'hostTimestamp' | 'hostSequence'
> {
  const nativeEventId = readString(payload, 'hook_event_id', 'event_id', 'eventId', 'id');
  const hostTimestamp = readString(payload, 'timestamp', 'time');
  const hostSequence = readSequence(payload, 'sequence', 'seq');
  return {
    ...(nativeEventId ? { nativeEventId } : {}),
    ...(hostTimestamp ? { hostTimestamp } : {}),
    ...(hostSequence ? { hostSequence } : {}),
  };
}

export function normalizeClaudeCodeEvent(
  input: unknown,
  capabilities: AdapterCapabilities = createClaudeCodeCapabilities(),
): AdapterEventResult {
  const envelope = asRecord(input);
  const hook = readString(envelope, 'hook');
  const payload = asRecord(envelope?.payload);
  if (!hook || !payload) {
    return degraded(
      'claude',
      'enroll_session',
      'Claude Code hook name or payload evidence is missing.',
    );
  }
  if (hook === 'SubagentStop') {
    return noOp('SubagentStop is explicitly excluded from root finalization.');
  }

  const intent = intentForClaudeHook(hook, payload);
  if (!intent) {
    return noOp(`Claude Code hook ${hook} has no lifecycle mapping.`);
  }
  const capability = capabilities[intent];
  if (capability.state === 'unsupported') {
    return degraded(
      'claude',
      intent,
      capability.reason ?? 'The Claude Code lifecycle hook is unsupported.',
    );
  }
  if (isDelegatedPayload(payload)) {
    return noOp('Delegated Claude Code traffic cannot own the root lifecycle.', intent);
  }

  const sessionId = readString(payload, 'session_id', 'sessionId');
  if (!sessionId) {
    return degraded(
      'claude',
      intent,
      'Verified root-session identity is missing from the Claude Code payload.',
    );
  }

  if (hook === 'SessionStart') {
    const source = readString(payload, 'source');
    if (!source || !['startup', 'resume', 'clear', 'compact'].includes(source)) {
      return degraded(
        'claude',
        intent,
        'SessionStart source is missing or is not a verified lifecycle source.',
      );
    }
  }

  const project = readString(payload, 'project', 'project_id');
  const cwd = readString(payload, 'cwd', 'directory');
  const baseEvent = {
    harness: 'claude' as const,
    intent,
    actor: 'system' as const,
    isRootSession: true,
    identity: normalizedIdentity(sessionId, project, cwd),
    ...eventMetadata(payload),
    nativeEvent: hook,
  };

  if (intent === 'capture_root_prompt') {
    const content = readString(payload, 'prompt', 'content');
    if (!content) {
      return degraded(
        'claude',
        intent,
        'UserPromptSubmit contains no verified root-user prompt text.',
      );
    }
    return dispatch({ ...baseEvent, actor: 'root_user', content });
  }

  const content = readString(payload, 'summary', 'content');
  return dispatch({
    ...baseEvent,
    ...(content ? { content } : {}),
  });
}
