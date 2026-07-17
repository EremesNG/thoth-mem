import {
          type AdapterCapabilities,
          type HarnessId,
          type HostOutputDeliveryState,
          type HostOutputDirective,
          type IntegrationIntent,
          type LifecycleIntent,
          type LifecycleOutcome,
          type NormalizedEvent,
        } from '../core/types.js';
        import { normalizeClaudeCodeEvent } from '../adapters/claude-code.js';
        import { normalizeCodexEvent } from '../adapters/codex.js';
        import { normalizeOpenCodeEvent } from '../adapters/opencode.js';
        import type { AdapterEventResult } from '../adapters/shared.js';
        import {
          authorizePrivatePrepareDelivery,
          resolveRuntimeCapabilityEvidence,
          type PrivatePrepareDeliveryAuthorization,
          type ResolvedRuntimeMapping,
          type ResolverProducedAdapterCapabilities,
          type RuntimeCapabilityResolution,
        } from './capability-evidence.js';
        import { validateHostOutputDirective } from './host-output.js';

        export const HOOK_PROTOCOL_VERSION = 1;
        export const HOOK_COMMAND_OPERATIONS = ['normal', 'prepare_delivery', 'confirm_delivery'] as const;
        export type HookCommandOperation = typeof HOOK_COMMAND_OPERATIONS[number];

        export interface HookCommandRequest {
          protocolVersion: 1;
          operation: HookCommandOperation;
          harness: HarnessId;
      event: unknown;
      context?: unknown;
      capabilityEvidence?: unknown;
      hostOutputDirective?: unknown;
      deliveryAttempt?: unknown;
        }

        export interface HookExecutionContext {
          operation: HookCommandOperation;
          mapping: ResolvedRuntimeMapping;
          hostOutputDirective?: HostOutputDirective;
          deliveryAttempt?: string;
          prepareDeliveryAuthorization?: PrivatePrepareDeliveryAuthorization;
              behaviorEligible?: boolean;
        }

        export interface HookExecutionResult {
          outcome: LifecycleOutcome;
          retryable: boolean;
          harness: HarnessId;
          intent: IntegrationIntent;
          hostOutputDirective?: HostOutputDirective;
          deliveryState?: HostOutputDeliveryState;
          deliveryAttempt?: string;
        }

        export type HookEventExecutor = (
          event: NormalizedEvent,
          capabilities: AdapterCapabilities,
          execution: HookExecutionContext,
        ) => Promise<HookExecutionResult>;

        export interface HookCommandResponse {
          protocolVersion: 1;
          operation?: Exclude<HookCommandOperation, 'normal'>;
          harness?: HarnessId;
          intent?: IntegrationIntent;
          outcome: LifecycleOutcome;
          retryable: boolean;
          diagnostic?: string;
          hostOutputDirective?: HostOutputDirective;
          deliveryState?: HostOutputDeliveryState;
          deliveryAttempt?: string;
        }

    const MAX_HOOK_INPUT_LENGTH = 1_048_576;
    const MAX_DIAGNOSTIC_CODE_POINTS = 600;
    const MAX_OPENCODE_MODEL_IDENTIFIER_CODE_POINTS = 128;
    const MAX_DELIVERY_ATTEMPT_CODE_POINTS = 4_096;

        function boundedDiagnostic(message: string): string {
          return Array.from(message).slice(0, MAX_DIAGNOSTIC_CODE_POINTS).join('');
        }

        function degradedResponse(diagnostic: string, harness?: HarnessId, intent?: LifecycleIntent): HookCommandResponse {
          return {
            protocolVersion: HOOK_PROTOCOL_VERSION,
            ...(harness ? { harness } : {}),
            ...(intent ? { intent } : {}),
            outcome: 'degraded',
            retryable: false,
            diagnostic: boundedDiagnostic(diagnostic),
          };
        }

        function failedResponse(harness: HarnessId, intent: IntegrationIntent): HookCommandResponse {
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

        function isLifecycleOutcome(value: unknown): value is LifecycleOutcome {
          return value === 'confirmed' || value === 'failed' || value === 'degraded' || value === 'no_op';
        }

        function isOperation(value: unknown): value is HookCommandOperation {
          return value === 'normal' || value === 'prepare_delivery' || value === 'confirm_delivery';
        }

        function isBoundedModelIdentifier(value: unknown): value is string {
          return typeof value === 'string'
            && Array.from(value).length > 0
            && Array.from(value).length <= MAX_OPENCODE_MODEL_IDENTIFIER_CODE_POINTS
            && /^[a-z0-9][a-z0-9._-]*$/i.test(value);
        }

    function isNonemptyPlainRecord(value: unknown): value is Record<string, unknown> {
      if (!isRecord(value) || Object.keys(value).length === 0) return false;
      const prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    }

    function hasExactOpenCodeSystemPayload(request: HookCommandRequest): boolean {
      if (request.harness !== 'opencode' || !isRecord(request.event)
        || request.event.type !== 'experimental.chat.system.transform' || !isRecord(request.event.input)) return false;
      const input = request.event.input;
      return Object.hasOwn(input, 'model')
        && Object.keys(input).length === (Object.hasOwn(input, 'sessionID') ? 2 : 1)
        && (!Object.hasOwn(input, 'sessionID') || isBoundedModelIdentifier(input.sessionID))
        && isNonemptyPlainRecord(input.model);
    }

    function hasExactOpenCodeCompactingPayload(request: HookCommandRequest): boolean {
      if (request.harness !== 'opencode' || !isRecord(request.event)
        || request.event.type !== 'experimental.session.compacting' || !isRecord(request.event.input)) return false;
      const input = request.event.input;
      return Object.keys(input).length === 1 && Object.hasOwn(input, 'sessionID')
        && isBoundedModelIdentifier(input.sessionID);
    }

    function hasExactOpenCodePrivatePayload(request: HookCommandRequest): boolean {
      return hasExactOpenCodeSystemPayload(request) || hasExactOpenCodeCompactingPayload(request);
    }

    function isDeliveryAttempt(value: unknown): value is string {
      return typeof value === 'string'
        && Array.from(value).length > 0
        && Array.from(value).length <= MAX_DELIVERY_ATTEMPT_CODE_POINTS
        && /^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(value);
    }

        function isValidExecutionResult(value: unknown, event: NormalizedEvent): value is HookExecutionResult {
          return isRecord(value)
            && isLifecycleOutcome(value.outcome)
            && typeof value.retryable === 'boolean'
            && value.harness === event.harness
            && value.intent === event.intent;
        }

        function parseRequest(input: string): HookCommandRequest | HookCommandResponse {
          if (input.length > MAX_HOOK_INPUT_LENGTH) return degradedResponse('Hook request exceeded the bounded JSON input limit.');
          let parsed: unknown;
          try { parsed = JSON.parse(input); } catch { return degradedResponse('Hook request is not valid JSON.'); }
          if (!isRecord(parsed)) return degradedResponse('Hook request must be a JSON object.');
          const request = parsed;
          if (request.protocolVersion !== HOOK_PROTOCOL_VERSION) return degradedResponse('Hook protocol version is unsupported.');
          if (!isHarnessId(request.harness)) return degradedResponse('Hook request harness is missing or unsupported.');
          const operation = request.operation === undefined ? 'normal' : request.operation;
          if (!isOperation(operation)) return degradedResponse('Hook request operation is missing or unsupported.', request.harness);
          if (!Object.hasOwn(request, 'event')) return degradedResponse('Hook request event payload is missing.', request.harness);
          if (Object.hasOwn(request, 'capabilityEvidence') && !isRecord(request.capabilityEvidence)) {
            return degradedResponse('Hook request capability evidence must be a JSON object when provided.', request.harness);
          }
          return {
            protocolVersion: HOOK_PROTOCOL_VERSION,
            operation,
            harness: request.harness,
            event: request.event,
        ...(Object.hasOwn(request, 'context') ? { context: request.context } : {}),
        ...(Object.hasOwn(request, 'capabilityEvidence') ? { capabilityEvidence: request.capabilityEvidence } : {}),
        ...(Object.hasOwn(request, 'hostOutputDirective')
          ? { hostOutputDirective: request.hostOutputDirective }
          : {}),
        ...(Object.hasOwn(request, 'deliveryAttempt') ? { deliveryAttempt: request.deliveryAttempt } : {}),
          };
        }

        function withoutOpenCodeModel(value: unknown): unknown {
          if (!isRecord(value) || !isRecord(value.input) || !Object.hasOwn(value.input, 'model')) {
            return value;
          }
          const input = { ...value.input };
          delete input.model;
          return { ...value, input };
        }

        function eventWithLocalMetadata(value: unknown): unknown {
              if (!isRecord(value) || !isRecord(value.payload)) return value;
              const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : undefined;
              const timestamp = typeof value.timestamp === 'string' && value.timestamp.length > 0 ? value.timestamp : undefined;
              if (!id && !timestamp) return value;
              return {
                ...value,
                payload: {
                  ...value.payload,
                  ...(id && !Object.hasOwn(value.payload, 'hook_event_id') ? { hook_event_id: id } : {}),
                  ...(timestamp && !Object.hasOwn(value.payload, 'timestamp') ? { timestamp } : {}),
                },
              };
            }

            function normalizeRequest(
          request: HookCommandRequest,
          capabilities: ResolverProducedAdapterCapabilities,
          resolution: RuntimeCapabilityResolution,
        ): { capabilities: AdapterCapabilities; result: AdapterEventResult } {
          switch (request.harness) {
            case 'opencode':
              return {
                capabilities,
                result: normalizeOpenCodeEvent({
                  event: withoutOpenCodeModel(request.event),
                  ...(request.context !== undefined ? { context: request.context } : {}),
                }, capabilities),
              };
            case 'codex': return { capabilities, result: normalizeCodexEvent(eventWithLocalMetadata(request.event), capabilities) };
            case 'claude': return {
              capabilities,
              result: normalizeClaudeCodeEvent(request.event, capabilities, resolution),
            };
          }
        }

        function adapterResponse(harness: HarnessId, result: Extract<AdapterEventResult, { action: 'return' }>): HookCommandResponse {
          return {
            protocolVersion: HOOK_PROTOCOL_VERSION,
            harness,
            ...(result.intent ? { intent: result.intent } : {}),
            outcome: result.outcome,
            retryable: result.retryable,
            ...(result.outcome === 'degraded' ? { diagnostic: boundedDiagnostic(result.diagnostic?.reason ?? result.reason) } : {}),
          };
        }

        export async function executeHookCommand(input: string, executor: HookEventExecutor): Promise<HookCommandResponse> {
          const request = parseRequest(input);
          if (!('event' in request)) return request;
      if (request.operation !== 'normal' && !hasExactOpenCodePrivatePayload(request)) {
        return degradedResponse('OpenCode private delivery requires an exact bounded v1.17.19 callback payload.', request.harness);
      }
          let normalized: ReturnType<typeof normalizeRequest>;
          let mapping: ResolvedRuntimeMapping;
          let prepareDeliveryAuthorization: PrivatePrepareDeliveryAuthorization | undefined;
          let nativeBehaviorEligible = false;
          try {
            const resolution = resolveRuntimeCapabilityEvidence(request.harness, request.capabilityEvidence);
            if (resolution.status === 'degraded') return degradedResponse(resolution.reason, request.harness);
                nativeBehaviorEligible = request.operation === 'normal'
                  && resolution.status === 'eligible'
                  && (request.harness === 'codex' || request.harness === 'claude');
                if (request.operation === 'normal' && resolution.status !== 'supported' && !nativeBehaviorEligible) {
                  return degradedResponse('OpenCode behavior evidence is eligible only for private delivery preparation.', request.harness);
                }
                if (request.operation !== 'normal' && resolution.status !== 'eligible') {
              return degradedResponse('Private delivery operations require exact eligible OpenCode behavior evidence.', request.harness);
            }
            const authorizedPreparation = request.operation !== 'normal'
              ? authorizePrivatePrepareDelivery(request.harness, resolution)
              : undefined;
            prepareDeliveryAuthorization = authorizedPreparation?.authorization;
            const adapterCapabilities = request.operation === 'normal'
              ? resolution.adapterCapabilities
              : authorizedPreparation?.capabilities;
            if (!adapterCapabilities || (request.operation !== 'normal' && !prepareDeliveryAuthorization)) {
              return degradedResponse('Private delivery authorization is unavailable for this resolved OpenCode behavior mapping.', request.harness);
            }
            mapping = resolution.mapping;
            normalized = normalizeRequest(request, adapterCapabilities, resolution);
          } catch {
            return degradedResponse('Runtime capability evidence or event payload could not be normalized safely.', request.harness);
      }
      if (normalized.result.action === 'return') return adapterResponse(request.harness, normalized.result);
      const confirmedDirective = request.operation === 'confirm_delivery'
        ? validateHostOutputDirective(request.hostOutputDirective, mapping.deliveryMappingId)
        : undefined;
      if (request.operation === 'confirm_delivery' && (!confirmedDirective || !isDeliveryAttempt(request.deliveryAttempt))) {
        return degradedResponse(
          'OpenCode confirm_delivery requires the exact bounded directive, mapping, and delivery attempt.',
          request.harness,
        );
      }
      const { event } = normalized.result;
      try {
        const result = await executor(event, normalized.capabilities, {
          operation: request.operation,
          mapping,
          ...(prepareDeliveryAuthorization ? { prepareDeliveryAuthorization } : {}),
              ...(nativeBehaviorEligible ? { behaviorEligible: true } : {}),
              ...(confirmedDirective ? { hostOutputDirective: confirmedDirective } : {}),
          ...(isDeliveryAttempt(request.deliveryAttempt) ? { deliveryAttempt: request.deliveryAttempt } : {}),
        });
            if (!isValidExecutionResult(result, event)) return failedResponse(request.harness, event.intent);
            const hostOutputDirective = result.hostOutputDirective === undefined
              ? undefined
              : validateHostOutputDirective(result.hostOutputDirective);
            return {
              protocolVersion: HOOK_PROTOCOL_VERSION,
              ...(request.operation === 'normal' ? {} : { operation: request.operation }),
              harness: request.harness,
              intent: event.intent,
              outcome: result.outcome,
              retryable: result.retryable,
              ...(hostOutputDirective ? { hostOutputDirective } : {}),
              ...(result.deliveryState ? { deliveryState: result.deliveryState } : {}),
              ...(request.operation === 'prepare_delivery' && typeof result.deliveryAttempt === 'string'
                    ? { deliveryAttempt: result.deliveryAttempt }
                    : {}),
            };
          } catch {
            return failedResponse(request.harness, event.intent);
          }
        }
