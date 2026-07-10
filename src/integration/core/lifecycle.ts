import type {
  AdapterCapabilities,
  Clock,
  EffectResult,
  LifecycleEffect,
  LifecycleFileProtection,
  LifecyclePlan,
  LifecycleResult,
  LifecycleResultState,
  NormalizedEvent,
  PromptCaptureMetadata,
  ResolvedLifecycleIdentity,
  SafeDiagnostic,
} from './types.js';
import { sanitizeRootPromptCapture } from './sanitizer.js';
import type { PromptCaptureDecision } from './sanitizer.js';
import { resolveSaveIdentity } from '../../store/identity.js';
import type { MemoryPort } from './memory-port.js';
import {
  LifecycleStateCorruptionError,
  LifecycleStateLockError,
  type EventKeyResult,
  type FileLifecycleStateStore,
  type LifecycleStateTransaction,
} from './state-store.js';

const RECALL_PROTOCOL = 'Use mem_recall in compact mode, expand with mem_recall context, then use mem_get only for selected records.';

export function resolveLifecycleIdentity(
  event: NormalizedEvent,
  rootIdentity: NormalizedEvent['identity'] = {},
): ResolvedLifecycleIdentity {
  const eventCanOwnRootIdentity = event.isRootSession && event.actor !== 'subagent';
  const cwd = rootIdentity.cwd ?? (eventCanOwnRootIdentity ? event.identity.cwd : undefined);
  const resolution = resolveSaveIdentity({
    session_id: rootIdentity.sessionId
      ?? (eventCanOwnRootIdentity ? event.identity.sessionId : undefined),
    project: rootIdentity.project
      ?? (eventCanOwnRootIdentity ? event.identity.project : undefined),
    cwd,
    requireSessionProject: true,
    source: 'fallback',
  });

  return {
    rootSessionId: resolution.session_id!,
    projectId: resolution.project_id ?? resolution.session_project,
    ...(cwd ? { cwd } : {}),
    projectSource: resolution.project_source ?? 'fallback',
    sessionSource: resolution.session_source ?? 'fallback',
    degraded: resolution.degraded,
  };
}

function planSupportedEffects(
  event: NormalizedEvent,
  capabilities: AdapterCapabilities,
  identity: ResolvedLifecycleIdentity,
  promptCapture?: PromptCaptureDecision,
): LifecycleEffect[] {
  switch (event.intent) {
    case 'enroll_session': {
      const effects: LifecycleEffect[] = [{
        kind: 'memory_call',
        tool: 'mem_session',
        input: {
          action: 'start',
          id: identity.rootSessionId,
          project: identity.projectId,
          ...(identity.cwd ? { directory: identity.cwd } : {}),
        },
        transition: 'enrollment',
      }];

      if (capabilities.recall_guidance.state === 'supported') {
        effects.push({
          kind: 'memory_call',
          tool: 'mem_context',
          input: {
            project: identity.projectId,
            session_id: identity.rootSessionId,
          },
          transition: 'recovery_context',
        });
      }

      return effects;
    }
    case 'capture_root_prompt': {
      const capture = promptCapture ?? sanitizeRootPromptCapture(event);
      if (capture.action === 'skip') {
        return [];
      }

      return [{
        kind: 'memory_call',
        tool: 'mem_save',
        input: {
          kind: 'prompt',
          content: capture.content,
          session_id: identity.rootSessionId,
          project: identity.projectId,
        },
        transition: 'prompt_capture',
      }];
    }
    case 'recall_guidance':
      return [{ kind: 'inject_protocol', text: RECALL_PROTOCOL }];
    case 'compact_session':
      return [{
        kind: 'memory_call',
        tool: 'mem_session',
        input: {
          action: 'checkpoint',
          id: identity.rootSessionId,
          project: identity.projectId,
          summary: event.content ?? 'Lifecycle checkpoint before compaction.',
        },
        transition: 'compaction',
      }];
    case 'finalize_session':
      return [{
        kind: 'memory_call',
        tool: 'mem_session',
        input: {
          action: 'summary',
          id: identity.rootSessionId,
          project: identity.projectId,
          content: event.content ?? 'Session finalized.',
        },
        transition: 'finalization',
      }];
  }
}

function promptCaptureMetadata(capture: PromptCaptureDecision): PromptCaptureMetadata {
  if (capture.action === 'persist') {
    return {
      action: capture.action,
      truncated: capture.truncated,
      privacyDegraded: capture.privacyDegraded,
    };
  }

  return {
    action: capture.action,
    reason: capture.reason,
    truncated: false,
    privacyDegraded: capture.reason === 'malformed_private_tag',
  };
}

export function planLifecycleEffects(
  event: NormalizedEvent,
  capabilities: AdapterCapabilities,
  rootIdentity: NormalizedEvent['identity'] = {},
): LifecyclePlan {
  const identity = resolveLifecycleIdentity(event, rootIdentity);
  const capability = capabilities[event.intent];
  const capture = event.intent === 'capture_root_prompt'
    ? sanitizeRootPromptCapture(event)
    : undefined;
  const promptCapture = capture ? promptCaptureMetadata(capture) : undefined;

  if (capability.state === 'unsupported') {
    return {
      capabilityState: capability.state,
      identity,
      effects: [{
        kind: 'diagnostic',
        diagnostic: {
          harness: event.harness,
          capability: event.intent,
          outcome: 'degraded',
          reason: capability.reason ?? 'No verified native trigger is available.',
        },
      }],
      ...(promptCapture ? { promptCapture } : {}),
    };
  }

  return {
    capabilityState: capability.state,
    identity,
    effects: planSupportedEffects(event, capabilities, identity, capture),
    ...(promptCapture ? { promptCapture } : {}),
  };
}

export interface MemoryIntegrationCoreOptions {
  capabilities: AdapterCapabilities;
  memoryPort: MemoryPort;
  stateStore: FileLifecycleStateStore;
  rootIdentity?: NormalizedEvent['identity'];
  clock?: Clock;
}

const lifecycleClock: Clock = {
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function safeDiagnostic(
  event: NormalizedEvent,
  outcome: 'failed' | 'degraded',
  reason: string,
  recovery?: string,
): SafeDiagnostic {
  return {
    harness: event.harness,
    capability: event.intent,
    outcome,
    reason,
    ...(recovery ? { recovery } : {}),
  };
}

function boundedResultText(text: string): string {
  return Array.from(text).slice(0, 1_000).join('');
}

function promptCaptureDegradationReason(metadata: PromptCaptureMetadata | undefined): string | undefined {
  if (!metadata) {
    return undefined;
  }
  if (metadata.action === 'skip') {
    return metadata.reason === 'malformed_private_tag'
      ? 'Prompt capture was skipped because private-tag structure was malformed.'
      : undefined;
  }

  const reasons: string[] = [];
  if (metadata.truncated) {
    reasons.push('Prompt capture was truncated to the 8,000-code-point safety bound.');
  }
  if (metadata.privacyDegraded) {
    reasons.push('Prompt capture removed an ambiguous private suffix.');
  }
  return reasons.length > 0 ? reasons.join(' ') : undefined;
}

function stateMetadata(
  transaction: LifecycleStateTransaction,
  protection: LifecycleFileProtection,
): LifecycleResultState {
  return {
    deduplication: transaction.state.dedupState,
    protection,
  };
}

function protectionDiagnostic(
  event: NormalizedEvent,
  protection: LifecycleFileProtection,
): SafeDiagnostic | undefined {
  if (protection.state === 'supported') {
    return undefined;
  }

  return safeDiagnostic(
    event,
    'degraded',
    protection.reason === 'windows_acl_not_enforced_by_node_mode'
      ? 'Event-key secret owner-only protection cannot be verified through Node mode bits on Windows.'
      : 'Event-key secret owner-only protection could not be verified.',
    'Apply an owner-restricted filesystem ACL to the thoth-mem data directory.',
  );
}

function isRetryableStateError(error: unknown): boolean {
  if (error instanceof LifecycleStateLockError) {
    return true;
  }
  if (error instanceof LifecycleStateCorruptionError) {
    return false;
  }
  if (!(error instanceof Error) || !('code' in error) || typeof error.code !== 'string') {
    return false;
  }
  return ['EAGAIN', 'EBUSY', 'EIO', 'EMFILE', 'ENFILE', 'ENOSPC'].includes(error.code);
}

export class MemoryIntegrationCore {
  private readonly clock: Clock;

  constructor(private readonly options: MemoryIntegrationCoreOptions) {
    this.clock = options.clock ?? lifecycleClock;
  }

  async handle(event: NormalizedEvent): Promise<LifecycleResult> {
    const plan = planLifecycleEffects(event, this.options.capabilities, this.options.rootIdentity);
    const planMetadata = {
      identity: plan.identity,
      ...(plan.promptCapture ? { promptCapture: plan.promptCapture } : {}),
    };
    const diagnosticEffect = plan.effects.find((effect) => effect.kind === 'diagnostic');
    if (diagnosticEffect?.kind === 'diagnostic') {
      return {
        outcome: 'degraded',
        retryable: false,
        harness: event.harness,
        intent: event.intent,
        effects: [],
        ...planMetadata,
        diagnostic: diagnosticEffect.diagnostic,
      };
    }

    if (plan.effects.length === 0) {
      const promptSafetyReason = promptCaptureDegradationReason(plan.promptCapture);
      return {
        outcome: promptSafetyReason ? 'degraded' : 'no_op',
        retryable: false,
        harness: event.harness,
        intent: event.intent,
        effects: [],
        ...planMetadata,
        ...(promptSafetyReason
          ? { diagnostic: safeDiagnostic(event, 'degraded', promptSafetyReason) }
          : {}),
      };
    }

    const promptEffect = plan.effects.find((effect) => (
      effect.kind === 'memory_call'
      && effect.tool === 'mem_save'
      && effect.input.kind === 'prompt'
    ));
    const sanitizedContent = promptEffect?.kind === 'memory_call'
      && typeof promptEffect.input.content === 'string'
      ? promptEffect.input.content
      : undefined;
    let eventKey: EventKeyResult;
    try {
      eventKey = await this.options.stateStore.createEventKey({
        intent: event.intent,
        actor: event.actor,
        nativeEventId: event.nativeEventId,
        hostTimestamp: event.hostTimestamp,
        hostSequence: event.hostSequence,
        sanitizedContent,
      });
    } catch (error) {
      return this.stateFailureResult(event, plan, error);
    }

    if (eventKey.status === 'degraded') {
      const effects = await this.executeEffects(plan.effects);
      if (effects.some((effect) => !effect.confirmed || effect.isError)) {
        return this.failedResult(event, effects, plan);
      }
      const reasons = [
        'Stable event identity is unavailable; cross-restart exactly-once handling is not confirmed.',
      ];
      const promptSafetyReason = promptCaptureDegradationReason(plan.promptCapture);
      if (promptSafetyReason) {
        reasons.push(promptSafetyReason);
      }
      if (plan.capabilityState === 'degraded') {
        reasons.push('The adapter capability completed with a declared limitation.');
      }
      return {
        outcome: 'degraded',
        retryable: false,
        harness: event.harness,
        intent: event.intent,
        effects,
        ...planMetadata,
        diagnostic: safeDiagnostic(
          event,
          'degraded',
          reasons.join(' '),
          'Use a host event id, timestamp, or sequence when the harness exposes one.',
        ),
      };
    }

    try {
      return await this.options.stateStore.runExclusive(async (transaction) => {
        const state = stateMetadata(transaction, eventKey.protection);
        const fileProtectionDiagnostic = protectionDiagnostic(event, eventKey.protection);
        if (transaction.hasConfirmedEvent(eventKey.key)) {
          return {
            outcome: 'no_op',
            retryable: false,
            harness: event.harness,
            intent: event.intent,
            effects: [],
            ...planMetadata,
            state,
            ...(fileProtectionDiagnostic ? { diagnostic: fileProtectionDiagnostic } : {}),
          };
        }

        const effects = await this.executeEffects(plan.effects);
        if (effects.some((effect) => !effect.confirmed || effect.isError)) {
          return this.failedResult(event, effects, plan, state);
        }

        const confirmedAt = this.clock.now().toISOString();
        const canonicalPromptId = effects.find((effect) => effect.reference?.kind === 'prompt')
          ?.reference?.id;
        const stateOutcome = transaction.confirmEvent({
          key: eventKey.key,
          intent: event.intent,
          confirmedAt,
          ...(canonicalPromptId !== undefined ? { canonicalPromptId } : {}),
        });
        this.confirmTransition(transaction, event.intent, confirmedAt);

        if (stateOutcome === 'duplicate') {
          return {
            outcome: 'no_op',
            retryable: false,
            harness: event.harness,
            intent: event.intent,
            effects: [],
            ...planMetadata,
            state: stateMetadata(transaction, eventKey.protection),
            ...(fileProtectionDiagnostic ? { diagnostic: fileProtectionDiagnostic } : {}),
          };
        }

        const degradationReasons: string[] = [];
        if (stateOutcome === 'degraded') {
          degradationReasons.push(
            'Lifecycle state reached a bound; cross-restart duplicate protection is degraded.',
          );
        }
        if (plan.capabilityState === 'degraded') {
          degradationReasons.push('The adapter capability completed with a declared limitation.');
        }
        const promptSafetyReason = promptCaptureDegradationReason(plan.promptCapture);
        if (promptSafetyReason) {
          degradationReasons.push(promptSafetyReason);
        }
        if (fileProtectionDiagnostic) {
          degradationReasons.push(fileProtectionDiagnostic.reason);
        }

        const committedState = stateMetadata(transaction, eventKey.protection);
        if (stateOutcome === 'degraded'
          || plan.capabilityState === 'degraded'
          || promptSafetyReason) {
          return {
            outcome: 'degraded',
            retryable: false,
            harness: event.harness,
            intent: event.intent,
            effects,
            ...planMetadata,
            state: committedState,
            diagnostic: safeDiagnostic(
              event,
              'degraded',
              degradationReasons.join(' '),
              fileProtectionDiagnostic?.recovery,
            ),
          };
        }

        return {
          outcome: 'confirmed',
          retryable: false,
          harness: event.harness,
          intent: event.intent,
          effects,
          ...planMetadata,
          state: committedState,
          ...(fileProtectionDiagnostic ? { diagnostic: fileProtectionDiagnostic } : {}),
        };
      });
    } catch (error) {
      return this.stateFailureResult(event, plan, error, eventKey.protection);
    }
  }

  private async executeEffects(effects: LifecycleEffect[]): Promise<EffectResult[]> {
    const results: EffectResult[] = [];
    for (const effect of effects) {
      if (effect.kind === 'diagnostic') {
        continue;
      }
      if (effect.kind === 'inject_protocol') {
        results.push({
          effect,
          confirmed: true,
          isError: false,
          text: effect.text,
        });
        continue;
      }

      try {
        const result = await this.options.memoryPort.call(effect.tool, effect.input);
        results.push({
          effect,
          confirmed: result.confirmed,
          isError: result.isError,
          text: boundedResultText(result.text),
          ...(result.reference ? { reference: result.reference } : {}),
        });
      } catch {
        results.push({
          effect,
          confirmed: false,
          isError: true,
          text: 'Memory operation failed before confirmation.',
        });
      }

      const latest = results.at(-1);
      if (latest && (!latest.confirmed || latest.isError)) {
        break;
      }
    }
    return results;
  }

  private stateFailureResult(
    event: NormalizedEvent,
    plan: LifecyclePlan,
    error: unknown,
    protection?: LifecycleFileProtection,
  ): LifecycleResult {
    const retryable = isRetryableStateError(error);
    const fileProtectionDiagnostic = protection
      ? protectionDiagnostic(event, protection)
      : undefined;
    const failureReason = retryable
      ? 'Lifecycle state is temporarily locked; no transition was recorded.'
      : 'Lifecycle state could not be safely updated; no transition was recorded.';
    const recovery = retryable
      ? 'Retry the same lifecycle event.'
      : 'Inspect lifecycle state before retrying.';

    return {
      outcome: 'failed',
      retryable,
      harness: event.harness,
      intent: event.intent,
      effects: [],
      identity: plan.identity,
      ...(plan.promptCapture ? { promptCapture: plan.promptCapture } : {}),
      ...(protection ? { state: { protection } } : {}),
      diagnostic: safeDiagnostic(
        event,
        'failed',
        fileProtectionDiagnostic
          ? `${failureReason} ${fileProtectionDiagnostic.reason}`
          : failureReason,
        fileProtectionDiagnostic?.recovery
          ? `${recovery} ${fileProtectionDiagnostic.recovery}`
          : recovery,
      ),
    };
  }

  private failedResult(
    event: NormalizedEvent,
    effects: EffectResult[],
    plan: LifecyclePlan,
    state?: LifecycleResultState,
  ): LifecycleResult {
    const fileProtectionDiagnostic = state
      ? protectionDiagnostic(event, state.protection)
      : undefined;
    return {
      outcome: 'failed',
      retryable: true,
      harness: event.harness,
      intent: event.intent,
      effects,
      identity: plan.identity,
      ...(plan.promptCapture ? { promptCapture: plan.promptCapture } : {}),
      ...(state ? { state } : {}),
      diagnostic: safeDiagnostic(
        event,
        'failed',
        fileProtectionDiagnostic
          ? `A memory operation was not confirmed; lifecycle state was not advanced. ${fileProtectionDiagnostic.reason}`
          : 'A memory operation was not confirmed; lifecycle state was not advanced.',
        fileProtectionDiagnostic?.recovery
          ? `Retry the same lifecycle event. ${fileProtectionDiagnostic.recovery}`
          : 'Retry the same lifecycle event.',
      ),
    };
  }

  private confirmTransition(
    transaction: LifecycleStateTransaction,
    intent: NormalizedEvent['intent'],
    confirmedAt: string,
  ): void {
    if (intent === 'enroll_session') {
      transaction.confirmEnrollment(confirmedAt);
    } else if (intent === 'finalize_session') {
      transaction.confirmTerminal(confirmedAt);
    }
  }
}
