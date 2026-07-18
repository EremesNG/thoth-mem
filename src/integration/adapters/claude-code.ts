import type { LifecycleIntent, NormalizedEvent } from '../core/types.js';
    import {
      assertResolverProducedAdapterCapabilities,
      assertResolverProducedRuntimeCapabilityResolution,
      type ResolverProducedAdapterCapabilities,
      type RuntimeCapabilityResolution,
    } from '../runtime/capability-evidence.js';
    import {
      asRecord,
      degraded,
      dispatch,
      isDelegatedPayload,
      noOp,
      normalizedIdentity,
      readSequence,
      readString,
      type AdapterEventResult,
    } from './shared.js';

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
    default:
      return undefined;
  }
}

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

    const CLAUDE_SUBAGENT_STOP_PASSIVE_MAPPING_ID = 'claude-subagent-stop-passive-v1';
    const CLAUDE_SUBAGENT_STOP_FORWARDABLE_FIELDS = [
      'session_id', 'cwd', 'hook_event_name', 'permission_mode', 'stop_hook_active',
      'agent_id', 'agent_type', 'last_assistant_message',
    ] as const;
    const CLAUDE_SUBAGENT_STOP_OPTIONAL_FIELDS = [
      'prompt_id', 'effort', 'background_tasks', 'session_crons',
    ] as const;
    const CLAUDE_SUBAGENT_STOP_OFFICIAL_FIELDS = [
      ...CLAUDE_SUBAGENT_STOP_FORWARDABLE_FIELDS, 'transcript_path', 'agent_transcript_path',
      ...CLAUDE_SUBAGENT_STOP_OPTIONAL_FIELDS,
    ] as const;
    const MAX_SUBAGENT_OPTIONAL_METADATA_ITEMS = 100;
    const MAX_SUBAGENT_OPTIONAL_METADATA_CODE_POINTS = 1_000;
    const BACKGROUND_TASK_FIELDS = new Set([
      'id', 'type', 'status', 'description', 'command', 'agent_type', 'server', 'tool', 'name',
    ]);

    function isBoundedSubagentMetadataString(value: unknown): value is string {
      return typeof value === 'string'
        && Array.from(value).length > 0
        && Array.from(value).length <= MAX_SUBAGENT_OPTIONAL_METADATA_CODE_POINTS;
    }

    function isUuid(value: unknown): value is string {
      return typeof value === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    }

    function isEffort(value: unknown): boolean {
      const record = asRecord(value);
      return record !== null
        && Object.keys(record).length === 1
        && ['low', 'medium', 'high', 'xhigh', 'max'].includes(record.level as string);
    }

    function isBackgroundTask(value: unknown): boolean {
      const record = asRecord(value);
      return record !== null
        && Object.keys(record).length > 0
        && Object.keys(record).every((key) => BACKGROUND_TASK_FIELDS.has(key))
        && Object.entries(record).every(([key, entry]) => (key === 'description' || key === 'command')
          ? isBoundedSubagentMetadataString(entry)
          : isBoundedSubagentMetadataString(entry));
    }

    function isSessionCron(value: unknown): boolean {
      const record = asRecord(value);
      return record !== null
        && Object.keys(record).length === 4
        && ['id', 'schedule', 'recurring', 'prompt'].every((key) => Object.hasOwn(record, key))
        && isBoundedSubagentMetadataString(record.id)
        && isBoundedSubagentMetadataString(record.schedule)
        && typeof record.recurring === 'boolean'
        && isBoundedSubagentMetadataString(record.prompt);
    }

    function hasValidSubagentStopOptionalMetadata(payload: Record<string, unknown>): boolean {
      return (payload.prompt_id === undefined || isUuid(payload.prompt_id))
        && (payload.effort === undefined || isEffort(payload.effort))
        && (payload.background_tasks === undefined || (
          Array.isArray(payload.background_tasks)
          && payload.background_tasks.length <= MAX_SUBAGENT_OPTIONAL_METADATA_ITEMS
          && payload.background_tasks.every(isBackgroundTask)
        ))
        && (payload.session_crons === undefined || (
          Array.isArray(payload.session_crons)
          && payload.session_crons.length <= MAX_SUBAGENT_OPTIONAL_METADATA_ITEMS
          && payload.session_crons.every(isSessionCron)
        ));
    }

    function hasExactFields(payload: Record<string, unknown>, fields: readonly string[]): boolean {
      return Object.keys(payload).length === fields.length
        && fields.every((field) => Object.hasOwn(payload, field));
    }

    function hasValidSubagentStopPayload(payload: Record<string, unknown>): boolean {
      const isForwarded = hasExactFields(payload, CLAUDE_SUBAGENT_STOP_FORWARDABLE_FIELDS);
      const officialRequiredFields = [
        ...CLAUDE_SUBAGENT_STOP_FORWARDABLE_FIELDS, 'transcript_path', 'agent_transcript_path',
      ];
      const isOfficial = officialRequiredFields.every((field) => Object.hasOwn(payload, field))
        && Object.keys(payload).every((field) => (CLAUDE_SUBAGENT_STOP_OFFICIAL_FIELDS as readonly string[]).includes(field));
      if ((!isForwarded && !isOfficial)
        || payload.hook_event_name !== 'SubagentStop'
        || payload.stop_hook_active !== false
        || !readString(payload, 'session_id', 'cwd', 'permission_mode', 'agent_id', 'agent_type', 'last_assistant_message')) {
        return false;
      }
      return (!isOfficial || (
        (typeof payload.transcript_path === 'string' || payload.transcript_path === null)
        && (typeof payload.agent_transcript_path === 'string' || payload.agent_transcript_path === null)
      )) && hasValidSubagentStopOptionalMetadata(payload);
    }

    function eventMetadata(payload: Record<string, unknown>, envelope?: Record<string, unknown> | null): Pick<
  NormalizedEvent,
  'nativeEventId' | 'hostTimestamp' | 'hostSequence'
> {
  const nativeEventId = readString(envelope ?? null, 'id')
    ?? readString(payload, 'hook_event_id', 'event_id', 'eventId', 'id');
  const hostTimestamp = readString(payload, 'timestamp', 'time');
  const hostSequence = readSequence(payload, 'sequence', 'seq');
  return {
    ...(nativeEventId ? { nativeEventId } : {}),
    ...(hostTimestamp ? { hostTimestamp } : {}),
    ...(hostSequence ? { hostSequence } : {}),
  };
}

function normalizeClaudeSubagentStop(
  envelope: Record<string, unknown>,
  payload: Record<string, unknown>,
  resolution: RuntimeCapabilityResolution | undefined,
): AdapterEventResult {
  try {
    assertResolverProducedRuntimeCapabilityResolution(resolution, 'claude');
  } catch {
    return degraded('claude', 'capture_passive_learning', 'Claude SubagentStop requires resolver-produced passive-learning evidence.');
  }
  if (resolution.status !== 'supported'
    || resolution.mapping.eventMappingId !== CLAUDE_SUBAGENT_STOP_PASSIVE_MAPPING_ID
    || resolution.mapping.deliveryChannel !== 'runner-stdout'
    || resolution.mapping.deliveryMappingId !== CLAUDE_SUBAGENT_STOP_PASSIVE_MAPPING_ID
    || resolution.runtimeCapabilities.passiveLearning.state !== 'supported'
    || resolution.runtimeCapabilities.passiveLearning.mappingId !== CLAUDE_SUBAGENT_STOP_PASSIVE_MAPPING_ID) {
    return degraded('claude', 'capture_passive_learning', 'Claude SubagentStop passive-learning mapping is not verified for this runtime claim.');
  }
  if (!hasValidSubagentStopPayload(payload)) {
    return degraded('claude', 'capture_passive_learning', 'Claude SubagentStop payload is incomplete, unsafe, or not the validated official shape.');
  }
  const nativeEventId = eventMetadata(payload, envelope).nativeEventId;
  if (!nativeEventId) {
    return degraded('claude', 'capture_passive_learning', 'Claude SubagentStop lacks stable native event evidence.');
  }
  return dispatch({
    harness: 'claude',
    intent: 'capture_passive_learning',
    actor: 'subagent',
    isRootSession: true,
    identity: normalizedIdentity(readString(payload, 'session_id')!, undefined, readString(payload, 'cwd')),
    nativeEventId,
    nativeEvent: 'SubagentStop',
    content: readString(payload, 'last_assistant_message')!,
    passiveLearningEvidence: {
      terminalMappingId: CLAUDE_SUBAGENT_STOP_PASSIVE_MAPPING_ID,
      verifiedTerminalOutput: true,
    },
  });
}

export function normalizeClaudeCodeEvent(
  input: unknown,
  capabilities: ResolverProducedAdapterCapabilities,
  resolution?: RuntimeCapabilityResolution,
): AdapterEventResult {
  assertResolverProducedAdapterCapabilities(capabilities, 'claude');

  const envelope = asRecord(input);
  const hook = readString(envelope, 'hook');
  const payload = asRecord(envelope?.payload);
  if (!envelope || !hook || !payload) {
    return degraded(
      'claude',
      'enroll_session',
      'Claude Code hook name or payload evidence is missing.',
    );
  }
  if (hook === 'SubagentStop') {
        return normalizeClaudeSubagentStop(envelope, payload, resolution);
      }
      if (hook === 'Stop' || hook === 'SessionEnd') {
        return noOp(`${hook} does not own the agent's semantic session summary.`);
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

  const cwd = readString(payload, 'cwd');
      const baseEvent = {
        harness: 'claude' as const,
        intent,
        actor: 'system' as const,
        isRootSession: true,
        identity: normalizedIdentity(sessionId, undefined, cwd),
        ...eventMetadata(payload, envelope),
        nativeEvent: hook,
            ...(compactionGateFor(hook, intent, payload) ? { compactionGate: compactionGateFor(hook, intent, payload) } : {}),
      };

      if (intent === 'capture_root_prompt') {
        const content = readString(payload, 'prompt');
        if (!content) {
          return degraded(
            'claude',
            intent,
            'UserPromptSubmit contains no verified root-user prompt text.',
          );
        }
        return dispatch({ ...baseEvent, actor: 'root_user', content });
      }

      return dispatch(baseEvent);

}
