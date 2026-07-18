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
      noOp,
      normalizedIdentity,
      readSequence,
      readString,
      type AdapterEventResult,
    } from './shared.js';

    const OPENCODE_TRIGGERS = {
  enroll_session: 'session.created',
  capture_root_prompt: 'chat.message',
  recall_guidance: 'experimental.chat.system.transform',
  compact_session: 'experimental.session.compacting',
} as const satisfies Partial<Record<LifecycleIntent, string>>;

function knownIntent(nativeEvent: string): LifecycleIntent | undefined {
  return (Object.entries(OPENCODE_TRIGGERS) as Array<[LifecycleIntent, string]>)
    .find(([, trigger]) => trigger === nativeEvent)?.[0];
}

function eventMetadata(nativeEvent: Record<string, unknown>): Pick<
  NormalizedEvent,
  'nativeEventId' | 'hostTimestamp' | 'hostSequence'
> {
  const input = asRecord(nativeEvent.input);
  const output = asRecord(nativeEvent.output);
  const message = asRecord(output?.message);
  const nativeEventId = readString(nativeEvent, 'id', 'eventID', 'eventId', 'messageID')
    ?? readString(input, 'messageID')
    ?? readString(message, 'id');
  const hostTimestamp = readString(nativeEvent, 'timestamp', 'time');
  const hostSequence = readSequence(nativeEvent, 'sequence', 'seq');

  return {
    ...(nativeEventId ? { nativeEventId } : {}),
    ...(hostTimestamp ? { hostTimestamp } : {}),
    ...(hostSequence ? { hostSequence } : {}),
  };
}

function rootSessionEvidence(
  nativeEvent: Record<string, unknown>,
): { sessionId?: string; delegated: boolean } {
  const properties = asRecord(nativeEvent.properties);
  const info = asRecord(properties?.info);
  const input = asRecord(nativeEvent.input);
  const parentId = readString(info, 'parentID', 'parentId')
    ?? readString(input, 'parentID', 'parentId', 'parent_session_id');
  const title = readString(info, 'title');
  const sessionId = readString(info, 'id') ?? readString(input, 'sessionID', 'sessionId');

  return {
    sessionId,
    delegated: Boolean(parentId || title?.endsWith(' subagent)')),
  };
}

function promptContent(
  nativeEvent: Record<string, unknown>,
  rootSessionId: string,
  messageId: string,
): string | undefined {
  const output = asRecord(nativeEvent.output);
  const parts = Array.isArray(output?.parts) ? output.parts : [];
  const content = parts
    .map(asRecord)
    .filter((part): part is Record<string, unknown> => (
      part?.type === 'text'
      && part.synthetic !== true
      && part.ignored !== true
      && readString(part, 'sessionID') === rootSessionId
      && readString(part, 'messageID') === messageId
    ))
    .map((part) => readString(part, 'text') ?? '')
    .join('\n')
    .trim();
  return content.length > 0 ? content : undefined;
}

export function normalizeOpenCodeEvent(
  input: unknown,
  capabilities: ResolverProducedAdapterCapabilities,
): AdapterEventResult {
  assertResolverProducedAdapterCapabilities(capabilities, 'opencode');

  const envelope = asRecord(input);
  const nativeEvent = asRecord(envelope?.event);
  const context = asRecord(envelope?.context);
  const nativeEventName = readString(nativeEvent, 'type');

  if (!nativeEvent || !nativeEventName) {
    return degraded(
      'opencode',
      'enroll_session',
      'OpenCode event type evidence is missing or malformed.',
      'Retry with the native event type and root-session payload.',
    );
  }
  if (nativeEventName === 'session.deleted') {
    return noOp('session.deleted performs cleanup and is not a verified finalization event.');
  }

  const intent = findIntentByTrigger(capabilities, nativeEventName)
    ?? knownIntent(nativeEventName)
    ?? (capabilities.finalize_session.trigger === nativeEventName
      ? 'finalize_session'
      : undefined);
  if (!intent) {
    return noOp(`OpenCode event ${nativeEventName} has no lifecycle mapping.`);
  }

  const capability = capabilities[intent];
  if (capability.state === 'unsupported') {
    return degraded(
      'opencode',
      intent,
      capability.reason ?? 'The OpenCode lifecycle trigger is unsupported.',
    );
  }

  const root = rootSessionEvidence(nativeEvent);
  if (root.delegated) {
    return noOp('Delegated OpenCode traffic cannot own the root lifecycle.', intent);
  }
  if (!root.sessionId) {
    return degraded(
      'opencode',
      intent,
      'Verified root-session identity is missing from the OpenCode payload.',
      'Retry when OpenCode supplies input.sessionID or properties.info.id.',
    );
  }

  const project = readString(context, 'project');
  const cwd = readString(context, 'directory', 'cwd');
  const baseEvent = {
    harness: 'opencode' as const,
    intent,
    actor: 'system' as const,
    isRootSession: true,
    identity: normalizedIdentity(root.sessionId, project, cwd),
    ...eventMetadata(nativeEvent),
    nativeEvent: nativeEventName,
  };

  if (intent === 'capture_root_prompt') {
    const eventInput = asRecord(nativeEvent.input);
    const output = asRecord(nativeEvent.output);
    const message = asRecord(output?.message);
    const messageId = readString(eventInput, 'messageID');
    const explicitEventId = readString(nativeEvent, 'id');
    if (eventInput?.rootSession !== true) {
      return degraded(
        'opencode',
        intent,
        'The chat.message payload does not explicitly prove root-session ownership.',
      );
    }
    if (readString(message, 'role') !== 'user'
      || !messageId
      || readString(message, 'id') !== messageId
      || readString(message, 'sessionID') !== root.sessionId
      || readString(eventInput, 'sessionID') !== root.sessionId
      || (explicitEventId !== undefined && explicitEventId !== messageId)) {
      return degraded(
        'opencode',
        intent,
        'The chat.message payload does not prove one matching root-user message.',
      );
    }
    const content = promptContent(nativeEvent, root.sessionId, messageId);
    if (!content) {
      return degraded(
        'opencode',
        intent,
        'The chat.message payload contains no verified user text.',
      );
    }
    return dispatch({
      ...baseEvent,
      actor: 'root_user',
      content,
    });
  }

  return dispatch(baseEvent);
}
