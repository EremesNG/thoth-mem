import type {
  AdapterCapabilities,
  Capability,
  LifecycleIntent,
  NormalizedEvent,
} from '../core/types.js';
import {
  asRecord,
  degraded,
  dispatch,
  findIntentByTrigger,
  incomplete,
  isDelegatedPayload,
  noOp,
  normalizedIdentity,
  readSequence,
  readString,
  supported,
  unsupported,
  type AdapterEventResult,
} from './shared.js';

const CODEX_CONVENTIONAL_HOOKS: Record<string, LifecycleIntent> = {
  SessionStart: 'enroll_session',
  UserPromptSubmit: 'capture_root_prompt',
  SessionStartContext: 'recall_guidance',
  PreCompact: 'compact_session',
  Stop: 'finalize_session',
};

export interface IncompleteCodexHook {
  trigger: string;
  reason: string;
}

export interface CodexCapabilityEvidence {
  verifiedHooks?: Partial<Record<LifecycleIntent, string>>;
  incompleteHooks?: Partial<Record<LifecycleIntent, IncompleteCodexHook>>;
}

function codexCapability(
  intent: LifecycleIntent,
  evidence: CodexCapabilityEvidence,
): Capability {
  const verifiedTrigger = evidence.verifiedHooks?.[intent];
  if (verifiedTrigger) {
    return supported(verifiedTrigger);
  }
  const incompleteHook = evidence.incompleteHooks?.[intent];
  if (incompleteHook) {
    return incomplete(incompleteHook.trigger, incompleteHook.reason);
  }
  return unsupported(`No verified Codex hook is available for ${intent}.`);
}

export function createCodexCapabilities(
  evidence: CodexCapabilityEvidence = {},
): AdapterCapabilities {
  return {
    enroll_session: codexCapability('enroll_session', evidence),
    capture_root_prompt: codexCapability('capture_root_prompt', evidence),
    recall_guidance: codexCapability('recall_guidance', evidence),
    compact_session: codexCapability('compact_session', evidence),
    finalize_session: codexCapability('finalize_session', evidence),
  };
}

function eventMetadata(payload: Record<string, unknown>): Pick<
  NormalizedEvent,
  'nativeEventId' | 'hostTimestamp' | 'hostSequence'
> {
  const nativeEventId = readString(payload, 'event_id', 'hook_event_id', 'eventId', 'id');
  const hostTimestamp = readString(payload, 'timestamp', 'time');
  const hostSequence = readSequence(payload, 'sequence', 'seq');
  return {
    ...(nativeEventId ? { nativeEventId } : {}),
    ...(hostTimestamp ? { hostTimestamp } : {}),
    ...(hostSequence ? { hostSequence } : {}),
  };
}

export function normalizeCodexEvent(
  input: unknown,
  capabilities: AdapterCapabilities = createCodexCapabilities(),
): AdapterEventResult {
  const envelope = asRecord(input);
  const hook = readString(envelope, 'hook');
  const payload = asRecord(envelope?.payload);
  if (!hook || !payload) {
    return degraded(
      'codex',
      'enroll_session',
      'Codex hook name or payload evidence is missing.',
    );
  }

  const intent = findIntentByTrigger(capabilities, hook) ?? CODEX_CONVENTIONAL_HOOKS[hook];
  if (!intent) {
    return noOp(`Codex hook ${hook} has no verified lifecycle mapping.`);
  }

  const capability = capabilities[intent];
  if (capability.state === 'unsupported') {
    return degraded(
      'codex',
      intent,
      capability.reason ?? 'The Codex lifecycle hook is unsupported.',
      'Enable only after a runtime capability probe verifies the hook and payload.',
    );
  }
  if (isDelegatedPayload(payload)) {
    return noOp('Delegated Codex traffic cannot own the root lifecycle.', intent);
  }

  const sessionId = readString(payload, 'session_id', 'sessionId');
  if (!sessionId) {
    return degraded(
      'codex',
      intent,
      'Verified root-session identity is missing from the Codex payload.',
    );
  }

  const project = readString(payload, 'project', 'project_id');
  const cwd = readString(payload, 'cwd', 'directory');
  const baseEvent = {
    harness: 'codex' as const,
    intent,
    actor: 'system' as const,
    isRootSession: true,
    identity: normalizedIdentity(sessionId, project, cwd),
    ...eventMetadata(payload),
    nativeEvent: hook,
  };

  if (intent === 'capture_root_prompt') {
    if (readString(payload, 'role', 'actor') !== 'user') {
      return degraded(
        'codex',
        intent,
        'The Codex prompt hook does not prove a root-user actor.',
      );
    }
    const content = readString(payload, 'prompt', 'content');
    if (!content) {
      return degraded(
        'codex',
        intent,
        'The Codex prompt hook contains no verified user prompt text.',
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
