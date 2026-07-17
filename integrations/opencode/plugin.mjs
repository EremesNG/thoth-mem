import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

    import { dispatchHookRequest } from '../shared/hook-runner.mjs';

    const MEMORY_PROTOCOL_URL = new URL('./memory-protocol.md', import.meta.url);
    const BEHAVIOR_EVIDENCE_MAPPING_ID = 'opencode-plugin-init-mutation-v1';
    const MAX_IDENTIFIER_CODE_POINTS = 128;
    const MAX_DIRECTIVE_CODE_POINTS = 1_000;
    const MAX_OUTPUT_ENTRIES = 128;
    const MAX_CONFIRM_ATTEMPTS = 3;
    const MAPPINGS = Object.freeze({
      'experimental.chat.system.transform': Object.freeze({
        eventMappingId: 'opencode-session-start-v1',
        deliveryMappingId: 'opencode-recovery-injection-v1',
        mutableOutputChannel: 'system',
      }),
      'experimental.session.compacting': Object.freeze({
        eventMappingId: 'opencode-compaction-v1',
        deliveryMappingId: 'opencode-compaction-v1',
        mutableOutputChannel: 'context',
      }),
    });

    function isRecord(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    function isBoundedIdentifier(value) {
      return typeof value === 'string'
        && Array.from(value).length > 0
        && Array.from(value).length <= MAX_IDENTIFIER_CODE_POINTS
        && /^[a-z0-9][a-z0-9._-]*$/i.test(value);
    }

function isNonemptyPlainRecord(value) {
  if (!isRecord(value) || Object.keys(value).length === 0) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactSystemInput(input) {
      return isRecord(input) && Object.hasOwn(input, 'model')
        && Object.keys(input).length === (Object.hasOwn(input, 'sessionID') ? 2 : 1)
        && (!Object.hasOwn(input, 'sessionID') || isBoundedIdentifier(input.sessionID))
        && isNonemptyPlainRecord(input.model);
}

function hasExactCompactingInput(input) {
  return isRecord(input) && Object.keys(input).length === 1
    && Object.hasOwn(input, 'sessionID') && isBoundedIdentifier(input.sessionID);
}

function hasExactInput(type, input) {
  return type === 'experimental.chat.system.transform'
    ? hasExactSystemInput(input)
    : type === 'experimental.session.compacting' && hasExactCompactingInput(input);
}

    function logger(context) {
      const log = context?.client?.app?.log;
      return typeof log === 'function' ? log.bind(context.client.app) : undefined;
    }

    async function writeMarker(log, message, extra) {
      if (!log) return false;
      try {
        await log({ body: { service: 'thoth-mem', level: 'info', message, extra } });
        return true;
      } catch {
        return false;
      }
    }

    function request(type, payload, context, mapping, operation, delivery, callbackEvidence) {
      return {
        protocolVersion: 1,
        ...(operation ? { operation } : {}),
        harness: 'opencode',
        ...(mapping ? { capabilityEvidence: {
          payloadMappingId: 'opencode-session-payload-v1',
          assetExecutionMarker: 'opencode-activation-v1',
          eventMappingId: mapping.eventMappingId,
          deliveryChannel: 'opencode-protocol-output',
          deliveryMappingId: mapping.deliveryMappingId,
          behaviorEvidenceMappingId: BEHAVIOR_EVIDENCE_MAPPING_ID,
          mutableOutputChannel: mapping.mutableOutputChannel,
        } } : {}),
        event: { type, ...payload, ...(callbackEvidence ?? {}) },
        context: {
          ...(context.project ? { project: context.project } : {}),
          ...(context.directory ? { directory: context.directory } : {}),
        },
        ...(delivery ? {
          hostOutputDirective: delivery.directive,
          deliveryAttempt: delivery.attempt,
        } : {}),
      };
    }

    function preparedDelivery(response, purpose, mapping) {
      const directive = response?.hostOutputDirective;
      const attempt = response?.deliveryAttempt;
      if (!isRecord(response) || response.operation !== 'prepare_delivery'
        || response.outcome !== 'confirmed' || response.retryable !== false
        || !isRecord(directive) || directive.purpose !== purpose
        || directive.deliveryMappingId !== mapping.deliveryMappingId
        || typeof directive.text !== 'string'
        || Array.from(directive.text).length === 0
        || Array.from(directive.text).length > MAX_DIRECTIVE_CODE_POINTS
        || typeof attempt !== 'string' || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(attempt)) return undefined;
      return {
        directive: {
          purpose: directive.purpose,
          deliveryMappingId: directive.deliveryMappingId,
          text: directive.text,
        },
        attempt,
      };
    }

    function isStringArray(value) {
      return Array.isArray(value)
        && value.length <= MAX_OUTPUT_ENTRIES
        && value.every((entry) => typeof entry === 'string');
    }

    function mutateSystem(output, protocol, text) {
      if (!isRecord(output) || !isStringArray(output.system)) return undefined;
      const system = output.system;
      const has = (fragment) => system.some((entry) => entry.includes(fragment));
      const additions = [protocol, text].filter((fragment) => !has(fragment));
      if (additions.length === 0) return undefined;
      const index = system.length - 1;
      const previous = index >= 0 ? system[index] : undefined;
      const merged = [previous, ...additions].filter(Boolean).join('\\n\\n');
      if (index >= 0) {
        system[index] = merged;
        return () => { system[index] = previous; };
      }
      system.push(merged);
      return () => { system.pop(); };
    }

    function mutateContext(output, text) {
      if (!isRecord(output) || !isStringArray(output.context) || output.context.some((entry) => entry.includes(text))) return undefined;
      output.context.push(text);
      return () => { output.context.pop(); };
    }

    async function confirmDelivery(dispatch, type, input, context, mapping, delivery, callbackEvidence) {
      for (let attempt = 0; attempt < MAX_CONFIRM_ATTEMPTS; attempt += 1) {
        let response;
        try {
          response = await dispatch(request(type, { input }, context, mapping, 'confirm_delivery', delivery, callbackEvidence));
        } catch {
          continue;
        }
        if (!isRecord(response) || response.operation !== 'confirm_delivery') return false;
        if ((response.outcome === 'confirmed' || response.outcome === 'no_op') && response.retryable === false) return true;
        if (response.outcome !== 'failed' || response.retryable !== true) return false;
      }
      return false;
    }

    export function createOpenCodePlugin(options = {}) {
      const dispatch = options.dispatch ?? dispatchHookRequest;

      return async function ThothMemory(context) {
        const protocol = await readFile(MEMORY_PROTOCOL_URL, 'utf8');
        const log = logger(context);
        const initialized = await writeMarker(log, 'opencode_behavior_evidence_initialized', {
          behaviorEvidenceMappingId: BEHAVIOR_EVIDENCE_MAPPING_ID,
        });
    const emit = async (type, payload = {}) => { await dispatch(request(type, payload, context)); };
    let deliverySequence = 0;
    const emitDirective = async (type, input, output, purpose, mutate) => {
      const mapping = MAPPINGS[type];
      if (!initialized || !mapping || deliverySequence >= Number.MAX_SAFE_INTEGER) return;
      if (!hasExactInput(type, input)) return;
      const callbackEvidence = { id: randomUUID(), sequence: ++deliverySequence };
          let response;
          try {
            response = await dispatch(request(type, { input }, context, mapping, 'prepare_delivery', undefined, callbackEvidence));
          } catch {
            return;
          }
          const delivery = preparedDelivery(response, purpose, mapping);
          if (!delivery) return;
          const rollback = mutate(output, delivery.directive.text);
          if (!rollback) return;
          const logged = await writeMarker(log, 'emitted_via_verified_channel', {
            eventMappingId: mapping.eventMappingId,
            deliveryMappingId: mapping.deliveryMappingId,
            mutableOutputChannel: mapping.mutableOutputChannel,
          });
          if (!logged) {
            rollback();
            return;
          }
          await confirmDelivery(dispatch, type, input, context, mapping, delivery, callbackEvidence);
        };

        return {
          event: async ({ event }) => {
            if (event?.type === 'session.created') await emit('session.created', event);
          },
          'chat.message': async (input, output) => { await emit('chat.message', { input, output }); },
          'experimental.chat.system.transform': async (input, output) => {
            await emitDirective('experimental.chat.system.transform', input, output, 'recovery_context',
              (target, text) => mutateSystem(target, protocol, text));
          },
          'experimental.session.compacting': async (input, output) => {
            await emitDirective('experimental.session.compacting', input, output, 'post_compaction_guidance', mutateContext);
          },
        };
      };
    }

    export const ThothMemory = createOpenCodePlugin();
    export default ThothMemory;
