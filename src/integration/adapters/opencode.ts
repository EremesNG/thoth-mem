import type {
  AdapterCapabilities,
  LifecycleIntent,
  NormalizedEvent,
} from '../core/types.js';
import {
  asRecord,
  degraded,
  dispatch,
  findIntentByTrigger,
  incomplete,
  noOp,
  normalizedIdentity,
  readSequence,
  readString,
  supported,
  unsupported,
  type AdapterEventResult,
} from './shared.js';

const OPENCODE_TRIGGERS = {
  enroll_session: 'session.created',
  capture_root_prompt: 'chat.message',
  recall_guidance: 'experimental.chat.system.transform',
  compact_session: 'experimental.session.compacting',
} as const satisfies Partial<Record<LifecycleIntent, string>>;

export interface OpenCodeCapabilityEvidence {
  hostVersion?: string;
  verifiedEvents?: readonly string[];
  incompleteEvents?: readonly string[];
  verifiedFinalizationTrigger?: string;
  incompleteFinalizationTrigger?: string;
}

function eventCapability(
  trigger: string,
  verifiedEvents: ReadonlySet<string>,
  incompleteEvents: ReadonlySet<string>,
): ReturnType<typeof supported | typeof incomplete | typeof unsupported> {
  if (verifiedEvents.has(trigger)) {
    return supported(trigger);
  }
  if (incompleteEvents.has(trigger)) {
    return incomplete(
      trigger,
      `The ${trigger} trigger is present, but its required payload fields are not verified.`,
    );
  }
  return unsupported(`No verified OpenCode ${trigger} trigger is available.`);
}

export function createOpenCodeCapabilities(
  evidence: OpenCodeCapabilityEvidence = {},
): AdapterCapabilities {
  const verifiedEvents = new Set(evidence.verifiedEvents ?? []);
  const incompleteEvents = new Set(evidence.incompleteEvents ?? []);

  return {
    enroll_session: eventCapability(
      OPENCODE_TRIGGERS.enroll_session,
      verifiedEvents,
      incompleteEvents,
    ),
    capture_root_prompt: eventCapability(
      OPENCODE_TRIGGERS.capture_root_prompt,
      verifiedEvents,
      incompleteEvents,
    ),
    recall_guidance: eventCapability(
      OPENCODE_TRIGGERS.recall_guidance,
      verifiedEvents,
      incompleteEvents,
    ),
    compact_session: eventCapability(
      OPENCODE_TRIGGERS.compact_session,
      verifiedEvents,
      incompleteEvents,
    ),
    finalize_session: evidence.verifiedFinalizationTrigger
      ? supported(evidence.verifiedFinalizationTrigger)
      : evidence.incompleteFinalizationTrigger
        ? incomplete(
          evidence.incompleteFinalizationTrigger,
          'A possible terminal trigger exists, but terminal payload evidence is incomplete.',
        )
        : unsupported('No verified terminal OpenCode event is available; session.deleted is cleanup only.'),
  };
}

function knownIntent(nativeEvent: string): LifecycleIntent | undefined {
  return (Object.entries(OPENCODE_TRIGGERS) as Array<[LifecycleIntent, string]>)
    .find(([, trigger]) => trigger === nativeEvent)?.[0];
}

function eventMetadata(nativeEvent: Record<string, unknown>): Pick<
  NormalizedEvent,
  'nativeEventId' | 'hostTimestamp' | 'hostSequence'
> {
  const nativeEventId = readString(nativeEvent, 'id', 'eventID', 'eventId', 'messageID');
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

function promptContent(nativeEvent: Record<string, unknown>): string | undefined {
  const output = asRecord(nativeEvent.output);
  const parts = Array.isArray(output?.parts) ? output.parts : [];
  const content = parts
    .map(asRecord)
    .filter((part): part is Record<string, unknown> => part?.type === 'text')
    .map((part) => readString(part, 'text') ?? '')
    .join('\n')
    .trim();

  if (content.length > 0) {
    return content;
  }

  const message = asRecord(output?.message);
  const summary = asRecord(message?.summary);
  const fallback = [readString(summary, 'title'), readString(summary, 'body')]
    .filter((value): value is string => Boolean(value))
    .join('\n')
    .trim();
  return fallback.length > 0 ? fallback : undefined;
}

export function normalizeOpenCodeEvent(
  input: unknown,
  capabilities: AdapterCapabilities = createOpenCodeCapabilities(),
): AdapterEventResult {
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
    const output = asRecord(nativeEvent.output);
    const message = asRecord(output?.message);
    if (readString(message, 'role') !== 'user') {
      return degraded(
        'opencode',
        intent,
        'The chat.message payload does not prove a root-user actor.',
      );
    }
    const content = promptContent(nativeEvent);
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
