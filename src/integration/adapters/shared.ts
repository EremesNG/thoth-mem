import type {
      AdapterCapabilities,
      Capability,
      HarnessId,
      IntegrationIntent,
      LifecycleIntent,
      NormalizedEvent,
    } from '../core/types.js';

    export interface AdapterDiagnostic {
      harness: HarnessId;
      capability: IntegrationIntent;
      outcome: 'degraded';
      reason: string;
      recovery?: string;
    }

    export type AdapterEventResult =
      | { action: 'dispatch'; event: NormalizedEvent }
      | {
        action: 'return';
        outcome: 'degraded' | 'no_op';
        retryable: false;
        intent?: IntegrationIntent;
        reason: string;
        diagnostic?: AdapterDiagnostic;
      };

    export function asRecord(value: unknown): Record<string, unknown> | null {
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
    }

    export function readString(
      record: Record<string, unknown> | null,
      ...keys: string[]
    ): string | undefined {
      if (!record) return undefined;
      for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.length > 0) return value;
      }
      return undefined;
    }

    export function readSequence(
      record: Record<string, unknown> | null,
      ...keys: string[]
    ): string | undefined {
      if (!record) return undefined;
      for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.length > 0) return value;
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      }
      return undefined;
    }

    export function normalizedIdentity(
      sessionId: string,
      project?: string,
      cwd?: string,
    ): NormalizedEvent['identity'] {
      return {
        sessionId,
        ...(project ? { project } : {}),
        ...(cwd ? { cwd } : {}),
      };
    }

    export function dispatch(event: NormalizedEvent): AdapterEventResult {
      return { action: 'dispatch', event };
    }

    export function noOp(reason: string, intent?: IntegrationIntent): AdapterEventResult {
      return {
        action: 'return',
        outcome: 'no_op',
        retryable: false,
        ...(intent ? { intent } : {}),
        reason,
      };
    }

    export function degraded(
      harness: HarnessId,
      intent: IntegrationIntent,
      reason: string,
      recovery?: string,
    ): AdapterEventResult {
      const boundedReason = Array.from(reason).slice(0, 400).join('');
      const boundedRecovery = recovery
        ? Array.from(recovery).slice(0, 300).join('')
        : undefined;
      return {
        action: 'return',
        outcome: 'degraded',
        retryable: false,
        intent,
        reason: boundedReason,
        diagnostic: {
          harness,
          capability: intent,
          outcome: 'degraded',
          reason: boundedReason,
          ...(boundedRecovery ? { recovery: boundedRecovery } : {}),
        },
      };
    }

    export function findIntentByTrigger(
      capabilities: AdapterCapabilities,
      trigger: string,
    ): LifecycleIntent | undefined {
      return (Object.entries(capabilities) as Array<[LifecycleIntent, Capability]>)
        .find(([, capability]) => capability.trigger === trigger)?.[0];
    }

    export function isDelegatedPayload(record: Record<string, unknown> | null): boolean {
      return Boolean(readString(
        record,
        'parent_session_id',
        'parentSessionId',
        'parent_id',
        'parentID',
        'subagent_id',
      ));
    }
