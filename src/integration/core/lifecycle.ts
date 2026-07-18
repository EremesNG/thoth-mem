import type {
  AdapterCapabilities,
  Clock,
  EffectResult,
  HostOutputDeliveryState,
  HostOutputMapping,
  HostOutputReadiness,
  IntegrationIntent,
  LifecycleEffect,
  LifecycleFileProtection,
  LifecyclePlan,
  LifecycleResult,
  LifecycleResultState,
  NormalizedEvent,
  PassiveLearningCaptureMetadata,
  PromptCaptureMetadata,
  ResolvedLifecycleIdentity,
  SafeDiagnostic,
} from './types.js';
import { sanitizePassiveLearning, sanitizeRootPromptCapture } from './sanitizer.js';
import type { PromptCaptureDecision } from './sanitizer.js';
import { createHostOutputDirective } from '../runtime/host-output.js';
import { resolveSaveIdentity } from '../../store/identity.js';
import type { MemoryPort } from './memory-port.js';
import {
  LifecycleStateCorruptionError,
  LifecycleStateLockError,
  type EventKeyResult,
  type FileLifecycleStateStore,
  type LifecycleStateTransaction,
} from './state-store.js';
import type { DeliveryAttemptBinding } from './state-store.js';



export function resolveLifecycleIdentity(
  event: NormalizedEvent,
  rootIdentity: NormalizedEvent['identity'] = {},
): ResolvedLifecycleIdentity {
  const eventCanOwnRootIdentity = event.isRootSession && (
        event.actor !== 'subagent' || event.intent === 'capture_passive_learning'
      );
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
  passiveLearning?: PassiveLearningCaptureMetadata,
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

      if (capabilities.recall_guidance.state !== 'unsupported') {
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
    case 'capture_passive_learning': {
          if (!passiveLearning || passiveLearning.action === 'skip') {
            return [];
          }
          const terminalMappingId = event.passiveLearningEvidence?.terminalMappingId;
          if (!terminalMappingId) {
            return [];
          }
          return [{
            kind: 'memory_call',
            tool: 'mem_save',
            input: {
              kind: 'observation',
              type: 'learning',
              title: 'Passive learning: ' + event.harness + ':' + terminalMappingId,
              content: passiveLearning.content,
              session_id: identity.rootSessionId,
              project: identity.projectId,
              scope: 'project',
            },
            transition: 'passive_learning',
          }];
        }
        case 'recall_guidance':
          return [{
            kind: 'memory_call',
            tool: 'mem_context',
            input: {
              project: identity.projectId,
              session_id: identity.rootSessionId,
            },
            transition: 'recovery_context',
          }];
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
          }, {
            kind: 'memory_call',
            tool: 'mem_context',
            input: {
              project: identity.projectId,
              session_id: identity.rootSessionId,
            },
            transition: 'recovery_context',
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
  const capability = event.intent === 'capture_passive_learning'
    ? { state: 'supported' as const }
    : capabilities[event.intent];
  const capture = event.intent === 'capture_root_prompt'
    ? sanitizeRootPromptCapture(event)
    : undefined;
  const promptCapture = capture ? promptCaptureMetadata(capture) : undefined;
  const passiveLearning = event.intent === 'capture_passive_learning'
    ? sanitizePassiveLearning(event)
    : undefined;

  if (capability.state === 'unsupported' || (event.intent === 'finalize_session' && capability.state !== 'supported')) {
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
      ...(passiveLearning ? { passiveLearning } : {}),
    };
  }

  return {
    capabilityState: capability.state,
    identity,
    effects: planSupportedEffects(event, capabilities, identity, capture, passiveLearning),
    ...(promptCapture ? { promptCapture } : {}),
    ...(passiveLearning ? { passiveLearning } : {}),
  };
}

export interface MemoryIntegrationCoreOptions {
  capabilities: AdapterCapabilities;
  memoryPort: MemoryPort;
  stateStore: FileLifecycleStateStore;
  hostOutput?: HostOutputReadiness;
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

function passiveLearningDegradationReason(
  metadata: PassiveLearningCaptureMetadata | undefined,
): string | undefined {
  if (!metadata) {
    return undefined;
  }
  if (metadata.action === 'skip') {
    return 'Passive learning was skipped because its terminal subagent evidence or content was unsafe.';
  }
  return metadata.truncated
    ? 'Passive learning was truncated to the 4,000-code-point safety bound.'
    : undefined;
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
    ...(plan.passiveLearning ? { passiveLearning: plan.passiveLearning } : {}),
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
    const safetyReason = promptCaptureDegradationReason(plan.promptCapture)
      ?? passiveLearningDegradationReason(plan.passiveLearning);
    return {
      outcome: safetyReason ? 'degraded' : 'no_op',
      retryable: false,
      harness: event.harness,
      intent: event.intent,
      effects: [],
      ...planMetadata,
      ...(safetyReason
        ? { diagnostic: safeDiagnostic(event, 'degraded', safetyReason) }
        : {}),
    };
  }

  const persistedEffect = plan.effects.find((effect) => (
    effect.kind === 'memory_call'
    && effect.tool === 'mem_save'
    && typeof effect.input.content === 'string'
  ));
  const sanitizedContent = persistedEffect?.kind === 'memory_call'
    && typeof persistedEffect.input.content === 'string'
    ? persistedEffect.input.content
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

  if (event.intent === 'compact_session' && event.compactionGate?.phase === 'checkpoint') {
        if (eventKey.status === 'degraded') {
          return this.compactionGateDegradedResult(
            event,
            plan,
            'Compaction checkpoint evidence is missing; post-compaction guidance is unavailable.',
          );
        }
        return this.handleCompactionCheckpoint(event, plan, eventKey);
      }

      if (event.intent === 'recall_guidance' && event.compactionGate?.phase === 'resume') {
        if (eventKey.status === 'degraded') {
          return this.compactionGateDegradedResult(
            event,
            plan,
            'Compact-start evidence is missing; post-compaction guidance is unavailable.',
          );
        }
        return this.handleCompactionResume(event, plan, eventKey);
      }

      if (eventKey.status === 'degraded') {
    const effects = await this.executeEffects(plan.effects);
    if (effects.some((effect) => !effect.confirmed || effect.isError)) {
      return this.failedResult(event, effects, plan);
    }
    const reasons = [
      'Stable event identity is unavailable; cross-restart exactly-once handling is not confirmed.',
    ];
    const safetyReason = promptCaptureDegradationReason(plan.promptCapture)
      ?? passiveLearningDegradationReason(plan.passiveLearning);
    if (safetyReason) {
      reasons.push(safetyReason);
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
      ...this.hostOutputFor(event, effects, true),
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
      const safetyReason = promptCaptureDegradationReason(plan.promptCapture)
        ?? passiveLearningDegradationReason(plan.passiveLearning);
      if (safetyReason) {
        degradationReasons.push(safetyReason);
      }
      if (fileProtectionDiagnostic) {
        degradationReasons.push(fileProtectionDiagnostic.reason);
      }

      const committedState = stateMetadata(transaction, eventKey.protection);
      const hostOutput = this.hostOutputFor(event, effects, true);
      if (stateOutcome === 'degraded'
        || plan.capabilityState === 'degraded'
        || safetyReason) {
        return {
          outcome: 'degraded',
          retryable: false,
          harness: event.harness,
          intent: event.intent,
          effects,
          ...planMetadata,
          ...hostOutput,
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
        ...hostOutput,
        state: committedState,
        ...(fileProtectionDiagnostic ? { diagnostic: fileProtectionDiagnostic } : {}),
      };
    });
  } catch (error) {
    return this.stateFailureResult(event, plan, error, eventKey.protection);
  }
}

  private compactionGateDegradedResult(
        event: NormalizedEvent,
        plan: LifecyclePlan,
        reason: string,
        state?: LifecycleResultState,
      ): LifecycleResult {
        return {
          outcome: 'degraded',
          retryable: false,
          harness: event.harness,
          intent: event.intent,
          effects: [],
          identity: plan.identity,
          ...(state ? { state } : {}),
          diagnostic: safeDiagnostic(event, 'degraded', reason, 'Run a verified compaction checkpoint before retrying compact start.'),
        };
      }

      private async handleCompactionCheckpoint(
        event: NormalizedEvent,
        plan: LifecyclePlan,
        eventKey: Extract<EventKeyResult, { status: 'stable' }>,
      ): Promise<LifecycleResult> {
        const checkpoint = plan.effects.find((effect) => effect.kind === 'memory_call'
          && effect.transition === 'compaction');
        if (!checkpoint || checkpoint.kind !== 'memory_call') {
          return this.compactionGateDegradedResult(event, plan, 'Verified compaction has no checkpoint effect.');
        }

        let authority;
        try {
          authority = await this.options.stateStore.createCompactionGateAuthority(
            eventKey.key,
            event.compactionGate?.sourceIdentity,
          );
        } catch (error) {
          return this.stateFailureResult(event, plan, error, eventKey.protection);
        }

        let beginState: LifecycleResultState;
        try {
          const begin = await this.options.stateStore.runExclusive(async (transaction) => {
            const state = stateMetadata(transaction, eventKey.protection);
            if (transaction.hasConfirmedEvent(eventKey.key)) {
              return { duplicate: true, state };
            }
            transaction.invalidateCompactionGate(this.clock.now().toISOString());
            return { duplicate: false, state: stateMetadata(transaction, eventKey.protection) };
          });
          if (begin.duplicate) {
            return {
              outcome: 'no_op',
              retryable: false,
              harness: event.harness,
              intent: event.intent,
              effects: [],
              identity: plan.identity,
              state: begin.state,
            };
          }
          beginState = begin.state;
        } catch (error) {
          return this.stateFailureResult(event, plan, error, eventKey.protection);
        }

        const effects = await this.executeEffects([checkpoint]);
        if (effects.some((effect) => !effect.confirmed || effect.isError)) {
          return this.failedResult(event, effects, plan, beginState);
        }

        try {
          const committed = await this.options.stateStore.runExclusive(async (transaction) => {
            if (transaction.hasConfirmedEvent(eventKey.key)) {
              return { duplicate: true, state: stateMetadata(transaction, eventKey.protection), outcome: 'duplicate' as const };
            }
            const confirmedAt = this.clock.now().toISOString();
            transaction.confirmCompactionGate(authority, confirmedAt);
            const outcome = transaction.confirmEvent({
              key: eventKey.key,
              intent: event.intent,
              confirmedAt,
            });
            return { duplicate: false, state: stateMetadata(transaction, eventKey.protection), outcome };
          });
          if (committed.duplicate) {
            return {
              outcome: 'no_op',
              retryable: false,
              harness: event.harness,
              intent: event.intent,
              effects: [],
              identity: plan.identity,
              state: committed.state,
            };
          }
          const degraded = committed.outcome === 'degraded' || plan.capabilityState === 'degraded';
          return {
            outcome: degraded ? 'degraded' : 'confirmed',
            retryable: false,
            harness: event.harness,
            intent: event.intent,
            effects,
            identity: plan.identity,
            state: committed.state,
            ...(degraded ? {
              diagnostic: safeDiagnostic(event, 'degraded', 'Compaction checkpoint was confirmed with bounded lifecycle limitations.'),
            } : {}),
          };
        } catch (error) {
          return this.stateFailureResult(event, plan, error, eventKey.protection);
        }
      }

      private async handleCompactionResume(
        event: NormalizedEvent,
        plan: LifecyclePlan,
        eventKey: Extract<EventKeyResult, { status: 'stable' }>,
      ): Promise<LifecycleResult> {
        let authority;
        try {
          authority = await this.options.stateStore.createCompactionGateAuthority(
            eventKey.key,
            event.compactionGate?.sourceIdentity,
          );
        } catch (error) {
          return this.stateFailureResult(event, plan, error, eventKey.protection);
        }

        let reservation!: { status: 'reserved'; reservationId: string };
        let reservedState: LifecycleResultState | undefined;
        try {
          const reserved = await this.options.stateStore.runExclusive(async (transaction) => ({
            reservation: transaction.reserveCompactionGate(authority.sourceIdentity, this.clock.now().toISOString()),
            state: stateMetadata(transaction, eventKey.protection),
          }));
          reservedState = reserved.state;
          if (reserved.reservation.status !== 'reserved') {
            return this.compactionGateDegradedResult(
              event,
              plan,
              'Compact-start guidance requires one matching, unexpired confirmed checkpoint gate.',
              reserved.state,
            );
          }
          reservation = reserved.reservation;
        } catch (error) {
          return this.stateFailureResult(event, plan, error, eventKey.protection);
        }

        const effects = await this.executeEffects(plan.effects);
        if (effects.some((effect) => !effect.confirmed || effect.isError)) {
          try {
            await this.options.stateStore.runExclusive(async (transaction) => {
              transaction.releaseCompactionGate(reservation.reservationId, this.clock.now().toISOString());
            });
          } catch {
            // The bounded reservation remains retryable until its short-lived gate expires.
          }
          return this.failedResult(event, effects, plan, reservedState);
        }

        const hostOutput = this.hostOutputFor(event, effects, true);
        if (!hostOutput.hostOutputDirective) {
          try {
            await this.options.stateStore.runExclusive(async (transaction) => {
              transaction.releaseCompactionGate(reservation.reservationId, this.clock.now().toISOString());
            });
          } catch {
            // The bounded reservation remains retryable until its short-lived gate expires.
          }
          return {
            outcome: 'degraded',
            retryable: true,
            harness: event.harness,
            intent: event.intent,
            effects,
            identity: plan.identity,
            ...hostOutput,
            ...(reservedState ? { state: reservedState } : {}),
            diagnostic: safeDiagnostic(event, 'degraded', 'Compact-start guidance could not be prepared for the verified output channel.', 'Retry compact start after the host output channel is available.'),
          };
        }

        try {
          const committed = await this.options.stateStore.runExclusive(async (transaction) => {
            if (!transaction.consumeCompactionGate(reservation.reservationId, this.clock.now().toISOString())) {
              return { consumed: false, state: stateMetadata(transaction, eventKey.protection), outcome: 'duplicate' as const };
            }
            const confirmedAt = this.clock.now().toISOString();
            const outcome = transaction.confirmEvent({
              key: eventKey.key,
              intent: event.intent,
              confirmedAt,
            });
            return { consumed: true, state: stateMetadata(transaction, eventKey.protection), outcome };
          });
          if (!committed.consumed || committed.outcome === 'duplicate') {
            return this.compactionGateDegradedResult(
              event,
              plan,
              'Compact-start checkpoint evidence was already consumed or could not be matched uniquely.',
              committed.state,
            );
          }
          const degraded = committed.outcome === 'degraded' || plan.capabilityState === 'degraded';
          return {
            outcome: degraded ? 'degraded' : 'confirmed',
            retryable: false,
            harness: event.harness,
            intent: event.intent,
            effects,
            identity: plan.identity,
            ...hostOutput,
            state: committed.state,
            ...(degraded ? {
              diagnostic: safeDiagnostic(event, 'degraded', 'Compact-start guidance was prepared with bounded lifecycle limitations.'),
            } : {}),
          };
        } catch (error) {
          return this.stateFailureResult(event, plan, error, eventKey.protection);
        }
      }

  async prepareDelivery(
    event: NormalizedEvent,
    binding: DeliveryAttemptBinding,
  ): Promise<LifecycleResult> {
    const handled = await this.handle(event);
    const result: LifecycleResult = { ...handled, intent: event.intent };
    const directive = result.hostOutputDirective;
    if (result.outcome !== 'confirmed' || !directive || result.deliveryState?.memoryConfirmation !== 'confirmed'
      || result.deliveryState.outputReadiness !== 'ready'
      || directive.deliveryMappingId !== binding.deliveryMappingId) {
      return result;
    }

    try {
      const deliveryAttempt = await this.options.stateStore.issueDeliveryAttempt({
        ...binding,
        purpose: directive.purpose,
        directiveText: directive.text,
      });
      return {
        ...result,
        deliveryAttempt,
        deliveryState: {
          ...result.deliveryState,
          activation: 'eligible',
          outputSupport: 'eligible',
        },
      };
    } catch (error) {
      return {
        ...result,
        outcome: 'failed',
        retryable: isRetryableStateError(error),
        hostOutputDirective: undefined,
        deliveryAttempt: undefined,
        deliveryState: { ...result.deliveryState, outputReadiness: 'unavailable' },
        diagnostic: safeDiagnostic(
          event,
          'failed',
          'Delivery preparation could not be signed safely; no directive was emitted.',
          'Retry the same lifecycle event.',
        ),
      };
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
    ...(plan.passiveLearning ? { passiveLearning: plan.passiveLearning } : {}),
    ...(protection ? { state: { protection } } : {}),
    diagnostic: safeDiagnostic(
      event,
      'failed',
      fileProtectionDiagnostic
        ? failureReason + ' ' + fileProtectionDiagnostic.reason
        : failureReason,
      fileProtectionDiagnostic?.recovery
        ? recovery + ' ' + fileProtectionDiagnostic.recovery
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
    ...(plan.passiveLearning ? { passiveLearning: plan.passiveLearning } : {}),
    ...this.hostOutputFor(event, effects, false),
    ...(state ? { state } : {}),
    diagnostic: safeDiagnostic(
      event,
      'failed',
      fileProtectionDiagnostic
        ? 'A memory operation was not confirmed; lifecycle state was not advanced. '
          + fileProtectionDiagnostic.reason
        : 'A memory operation was not confirmed; lifecycle state was not advanced.',
      fileProtectionDiagnostic?.recovery
        ? 'Retry the same lifecycle event. ' + fileProtectionDiagnostic.recovery
        : 'Retry the same lifecycle event.',
    ),
  };
}

private outputMappingFor(event: NormalizedEvent): {
  purpose: 'recovery_context' | 'post_compaction_guidance';
  mapping: HostOutputMapping;
} | undefined {
  if (event.intent === 'enroll_session' || event.intent === 'recall_guidance') {
    return this.options.hostOutput?.recovery
      ? { purpose: 'recovery_context', mapping: this.options.hostOutput.recovery }
      : undefined;
  }
  if (event.intent === 'compact_session') {
    return this.options.hostOutput?.postCompaction
      ? { purpose: 'post_compaction_guidance', mapping: this.options.hostOutput.postCompaction }
      : undefined;
  }
  return undefined;
}

private hostOutputFor(
  event: NormalizedEvent,
  effects: EffectResult[],
  memoryConfirmed: boolean,
): Pick<LifecycleResult, 'hostOutputDirective' | 'deliveryState'> {
  const output = this.outputMappingFor(event);
  if (!output) {
    return {};
  }

  const state = (
    memoryConfirmation: HostOutputDeliveryState['memoryConfirmation'],
    outputReadiness: HostOutputDeliveryState['outputReadiness'],
  ): HostOutputDeliveryState => ({
    activation: 'unproven',
    memoryConfirmation,
    outputReadiness,
    localEmission: 'not_emitted',
    modelConsumption: 'unproven',
  });

  if (!memoryConfirmed) {
    return { deliveryState: state('unconfirmed', 'not_ready') };
  }
  if (!output.mapping.ready) {
    return { deliveryState: state('confirmed', 'not_ready') };
  }
  if (output.mapping.mappingId !== output.mapping.verifiedMappingId) {
    return { deliveryState: state('confirmed', 'unavailable') };
  }

  const context = effects.find((effect) => (
    effect.effect.kind === 'memory_call'
    && effect.effect.transition === 'recovery_context'
    && effect.confirmed
    && !effect.isError
  ));
  if (!context) {
    return { deliveryState: state('confirmed', 'not_ready') };
  }

  const directive = createHostOutputDirective(output.purpose, context.text, output.mapping);
  return directive
    ? { hostOutputDirective: directive, deliveryState: state('confirmed', 'ready') }
    : { deliveryState: state('confirmed', 'unavailable') };
}

  private confirmTransition(
    transaction: LifecycleStateTransaction,
    intent: IntegrationIntent,
    confirmedAt: string,
  ): void {
    if (intent === 'enroll_session') {
      transaction.confirmEnrollment(confirmedAt);
    } else if (intent === 'finalize_session') {
      transaction.confirmTerminal(confirmedAt);
    }
  }
}
