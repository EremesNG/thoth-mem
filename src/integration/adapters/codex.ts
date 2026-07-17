import type { LifecycleIntent, NormalizedEvent } from '../core/types.js';
    import {
      assertResolverProducedAdapterCapabilities,
      type ResolverProducedAdapterCapabilities,
    } from '../runtime/capability-evidence.js';
    import {
      asRecord,
      degraded,
      dispatch,
      findIntentByTrigger,
      isDelegatedPayload,
      noOp,
      normalizedIdentity,
      readSequence,
      readString,
      type AdapterEventResult,
    } from './shared.js';

    const CODEX_CONVENTIONAL_HOOKS: Record<string, LifecycleIntent> = {
  SessionStart: 'enroll_session',
  UserPromptSubmit: 'capture_root_prompt',
  SessionStartContext: 'recall_guidance',
  PreCompact: 'compact_session',
  Stop: 'finalize_session',
};

function compactionGateFor(
      hook: string,
      intent: LifecycleIntent,
      payload: Record<string, unknown>,
    ): NormalizedEvent['compactionGate'] | undefined {
      const sourceIdentity = readString(payload, 'transcript_path', 'thread_id', 'threadId');
      if (hook === 'PreCompact' && intent === 'compact_session') {
        return { phase: 'checkpoint', ...(sourceIdentity ? { sourceIdentity } : {}) };
      }
      if (hook === 'SessionStart' && intent === 'recall_guidance' && readString(payload, 'source') === 'compact') {
        return { phase: 'resume', ...(sourceIdentity ? { sourceIdentity } : {}) };
      }
      return undefined;
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
  capabilities: ResolverProducedAdapterCapabilities,
): AdapterEventResult {
  assertResolverProducedAdapterCapabilities(capabilities, 'codex');

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

  const intent = hook === 'SessionStart' && readString(payload, 'source') === 'compact'
        ? 'recall_guidance'
        : findIntentByTrigger(capabilities, hook) ?? CODEX_CONVENTIONAL_HOOKS[hook];
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

  if (hook === 'SessionStart') {
        const source = readString(payload, 'source');
        if (source && !['startup', 'resume', 'clear', 'compact'].includes(source)) {
          return degraded(
            'codex',
            intent,
            'SessionStart source is missing or is not a verified lifecycle source.',
          );
        }
      }

      const cwd = readString(payload, 'cwd');
      const baseEvent = {
        harness: 'codex' as const,
        intent,
        actor: 'system' as const,
        isRootSession: true,
        identity: normalizedIdentity(sessionId, undefined, cwd),
        ...eventMetadata(payload),
        nativeEvent: hook,
            ...(compactionGateFor(hook, intent, payload) ? { compactionGate: compactionGateFor(hook, intent, payload) } : {}),
      };

      if (intent === 'capture_root_prompt') {
        const content = readString(payload, 'prompt');
        if (!content) {
          return degraded(
            'codex',
            intent,
            'The Codex prompt hook contains no verified user prompt text.',
          );
        }
        return dispatch({ ...baseEvent, actor: 'root_user', content });
      }

      return dispatch(baseEvent);

}
