import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

    import { dispatchHookRequest } from '../shared/hook-runner.mjs';

    const MEMORY_PROTOCOL_URL = new URL('./memory-protocol.md', import.meta.url);
    const BUNDLED_SKILLS_PATH = fileURLToPath(new URL('./skills', import.meta.url));
    const PRIVATE_BEHAVIOR_EVIDENCE_MAPPING_ID = 'opencode-plugin-init-mutation-v1';
    const SIDE_EFFECT_BEHAVIOR_EVIDENCE_MAPPING_ID = 'opencode-plugin-init-side-effect-v1';
    const MAX_IDENTIFIER_CODE_POINTS = 128;
    const MAX_DIRECTIVE_CODE_POINTS = 1_000;
    const MAX_OUTPUT_ENTRIES = 128;
    const MAX_CONFIRM_ATTEMPTS = 3;
    const MAX_PROMPT_PARTS = 128;
    const IDENTITY_SCHEMA = 'thoth-mem.opencode.identity.v1';
    const MAX_IDENTITY_PARENT_DEPTH = 16;
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
    const SIDE_EFFECT_MAPPINGS = Object.freeze({
      'session.created': Object.freeze({
        eventMappingId: 'opencode-session-created-v1',
        deliveryMappingId: 'opencode-session-side-effect-v1',
        intent: 'enroll_session',
      }),
      'chat.message': Object.freeze({
        eventMappingId: 'opencode-user-prompt-v1',
        deliveryMappingId: 'opencode-user-prompt-side-effect-v1',
        intent: 'capture_root_prompt',
      }),
    });

    function isRecord(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    function registerBundledSkillPath(config) {
      if (!isRecord(config)) return;
      if (config.skills === undefined) {
        config.skills = { paths: [BUNDLED_SKILLS_PATH] };
        return;
      }
      if (!isRecord(config.skills)) return;
      if (config.skills.paths === undefined) {
        config.skills.paths = [BUNDLED_SKILLS_PATH];
        return;
      }
      if (!Array.isArray(config.skills.paths)
        || config.skills.paths.includes(BUNDLED_SKILLS_PATH)) return;
      config.skills.paths.push(BUNDLED_SKILLS_PATH);
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

    function projectName(context) {
      if (typeof context?.project === 'string' && !/[\\/]/.test(context.project)) {
        return context.project;
      }
      const project = isRecord(context?.project) ? context.project : undefined;
      const candidates = [project?.worktree, context?.worktree, context?.directory, context?.project];
      for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;
        const normalized = candidate.replace(/[\\/]+$/, '');
        const name = normalized.split(/[\\/]/).filter(Boolean).at(-1);
        if (name) return name;
      }
      return undefined;
    }

    function isBoundedProjectName(value) {
      return typeof value === 'string'
        && Array.from(value).length > 0
        && Array.from(value).length <= MAX_IDENTIFIER_CODE_POINTS;
    }

    function identityResult(payload) {
      return JSON.stringify({ schema: IDENTITY_SCHEMA, ...payload });
    }

    function degradedIdentity(reason) {
      return identityResult({ status: 'degraded', reason, authorization: 'none' });
    }

    function verifiedIdentity(rootSessionID, callerSessionID, project) {
      const callerIsRoot = rootSessionID === callerSessionID;
      return identityResult({
        status: 'verified',
        root_session_id: rootSessionID,
        caller_session_id: callerSessionID,
        caller_role: callerIsRoot ? 'root' : 'delegated',
        project,
        authorization: callerIsRoot ? 'root_lifecycle' : 'none',
      });
    }

    function requestContext(context) {
      const project = projectName(context);
      return {
        ...(project ? { project } : {}),
        ...(typeof context?.directory === 'string' ? { directory: context.directory } : {}),
      };
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
          behaviorEvidenceMappingId: PRIVATE_BEHAVIOR_EVIDENCE_MAPPING_ID,
          mutableOutputChannel: mapping.mutableOutputChannel,
        } } : {}),
        event: { type, ...payload, ...(callbackEvidence ?? {}) },
        context: requestContext(context),
        ...(delivery ? {
          hostOutputDirective: delivery.directive,
          deliveryAttempt: delivery.attempt,
        } : {}),
      };
    }

    function sideEffectRequest(event, context, mapping) {
      return {
        protocolVersion: 1,
        harness: 'opencode',
        capabilityEvidence: {
          payloadMappingId: 'opencode-session-payload-v1',
          assetExecutionMarker: 'opencode-activation-v1',
          eventMappingId: mapping.eventMappingId,
          deliveryChannel: 'none',
          deliveryMappingId: mapping.deliveryMappingId,
          behaviorEvidenceMappingId: SIDE_EFFECT_BEHAVIOR_EVIDENCE_MAPPING_ID,
        },
        event,
        context: requestContext(context),
      };
    }

    function confirmedEffect(response, intent) {
      return isRecord(response)
        && response.protocolVersion === 1
        && response.harness === 'opencode'
        && response.intent === intent
        && (response.outcome === 'confirmed' || response.outcome === 'no_op')
        && response.retryable === false;
    }

    function classifySessionInfo(info, expectedId) {
      if (!isRecord(info) || !isBoundedIdentifier(info.id)
        || (expectedId !== undefined && info.id !== expectedId)) return undefined;
      if (!Object.hasOwn(info, 'parentID')) return 'root';
      return isBoundedIdentifier(info.parentID) ? 'delegated' : undefined;
    }

    function projectedUserMessage(input, output) {
      if (!isRecord(input) || !isRecord(output)
        || !isBoundedIdentifier(input.sessionID)
        || !isBoundedIdentifier(input.messageID)
        || !isRecord(output.message)
        || output.message.role !== 'user'
        || output.message.id !== input.messageID
        || output.message.sessionID !== input.sessionID
        || !Array.isArray(output.parts)
        || output.parts.length > MAX_PROMPT_PARTS) return undefined;
      const parts = output.parts.flatMap((part) => {
        if (!isRecord(part)
          || part.type !== 'text'
          || part.synthetic === true
          || part.ignored === true
          || !isBoundedIdentifier(part.id)
          || part.sessionID !== input.sessionID
          || part.messageID !== input.messageID
          || typeof part.text !== 'string'
          || Array.from(part.text).length === 0) return [];
        return [{
          id: part.id,
          sessionID: input.sessionID,
          messageID: input.messageID,
          type: 'text',
          text: part.text,
        }];
      });
      if (parts.length === 0) return undefined;
      return {
        sessionID: input.sessionID,
        event: {
          type: 'chat.message',
          id: input.messageID,
          input: {
            sessionID: input.sessionID,
            messageID: input.messageID,
            rootSession: true,
          },
          output: {
            message: {
              id: input.messageID,
              sessionID: input.sessionID,
              role: 'user',
            },
            parts,
          },
        },
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
          behaviorEvidenceMappingId: PRIVATE_BEHAVIOR_EVIDENCE_MAPPING_ID,
          sideEffectBehaviorEvidenceMappingId: SIDE_EFFECT_BEHAVIOR_EVIDENCE_MAPPING_ID,
        });
        const sessionKinds = new Map();
        const enrolledSessions = new Set();
        const enrollmentAttempts = new Map();
        const emitEffect = async (event, mapping) => {
          let response;
          try {
            response = await dispatch(sideEffectRequest(event, context, mapping));
          } catch {
            response = undefined;
          }
          if (confirmedEffect(response, mapping.intent)) return true;
          await writeMarker(log, 'opencode_memory_effect_degraded', {
            intent: mapping.intent,
            eventMappingId: mapping.eventMappingId,
          });
          return false;
        };
        const ensureEnrollment = async (sessionID) => {
          if (enrolledSessions.has(sessionID)) return true;
          const existing = enrollmentAttempts.get(sessionID);
          if (existing) return existing;
          const attempt = (async () => {
            const confirmed = await emitEffect({
              type: 'session.created',
              id: sessionID,
              properties: { info: { id: sessionID } },
            }, SIDE_EFFECT_MAPPINGS['session.created']);
            if (confirmed) enrolledSessions.add(sessionID);
            return confirmed;
          })();
          enrollmentAttempts.set(sessionID, attempt);
          try {
            return await attempt;
          } finally {
            enrollmentAttempts.delete(sessionID);
          }
        };
        const resolveRootSession = async (callerSessionID, directory) => {
          const get = context?.client?.session?.get;
          if (typeof get !== 'function') return { reason: 'session_lookup_unavailable' };
          const visited = new Set();
          let sessionID = callerSessionID;
          for (let depth = 0; depth < MAX_IDENTITY_PARENT_DEPTH; depth += 1) {
            if (visited.has(sessionID)) return { reason: 'parent_cycle' };
            visited.add(sessionID);
            let response;
            try {
              response = await get.call(context.client.session, {
                path: { id: sessionID },
                ...(typeof directory === 'string' ? { query: { directory } } : {}),
              });
            } catch {
              return { reason: 'session_lookup_failed' };
            }
            const info = isRecord(response) ? response.data : undefined;
            if (!isRecord(info)) return { reason: 'session_not_found' };
            if (info.id !== sessionID) return { reason: 'session_id_mismatch' };
            if (!Object.hasOwn(info, 'parentID')) return { rootSessionID: sessionID };
            if (!isBoundedIdentifier(info.parentID)) return { reason: 'parent_id_invalid' };
            sessionID = info.parentID;
          }
          return { reason: 'parent_depth_exceeded' };
        };
        const resolveSessionKind = async (sessionID) => {
          const known = sessionKinds.get(sessionID);
          if (known) return known;
          const get = context?.client?.session?.get;
          if (typeof get !== 'function') return undefined;
          let response;
          try {
            response = await get.call(context.client.session, {
              path: { id: sessionID },
              ...(typeof context.directory === 'string'
                ? { query: { directory: context.directory } }
                : {}),
            });
          } catch {
            await writeMarker(log, 'opencode_memory_effect_degraded', {
              intent: 'classify_root_session',
            });
            return undefined;
          }
          const info = isRecord(response) ? response.data : undefined;
          const kind = classifySessionInfo(info, sessionID);
          if (kind) sessionKinds.set(sessionID, kind);
          return kind;
        };
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
          tool: {
            thoth_mem_root_identity: {
              description: 'Return the verified OpenCode root session identity as versioned JSON.',
              args: {},
              execute: async (_args, toolContext) => {
                const sessionID = isRecord(toolContext) && isBoundedIdentifier(toolContext.sessionID)
                  ? toolContext.sessionID
                  : undefined;
                if (!sessionID) return degradedIdentity('invalid_caller_session');
                const directory = typeof toolContext.directory === 'string'
                  ? toolContext.directory
                  : context?.directory;
                const resolution = await resolveRootSession(sessionID, directory);
                if (resolution.reason) return degradedIdentity(resolution.reason);
                const rootSessionID = resolution.rootSessionID;
                const project = projectName({
                  ...(isRecord(context) ? context : {}),
                  ...(typeof toolContext.directory === 'string'
                    ? { directory: toolContext.directory }
                    : {}),
                  ...(typeof toolContext.worktree === 'string'
                    ? { worktree: toolContext.worktree }
                    : {}),
                });
                if (!isBoundedProjectName(project)) return degradedIdentity('project_unavailable');
                return verifiedIdentity(rootSessionID, sessionID, project);
              },
            },
          },
          config: async (config) => {
            registerBundledSkillPath(config);
          },
          event: async ({ event }) => {
            if (!isRecord(event)) return;
            const properties = isRecord(event.properties) ? event.properties : undefined;
            const info = isRecord(properties?.info) ? properties.info : undefined;
            const sessionID = isBoundedIdentifier(info?.id) ? info.id : undefined;
            if (event.type === 'session.deleted') {
              if (sessionID) {
                sessionKinds.delete(sessionID);
                enrolledSessions.delete(sessionID);
                enrollmentAttempts.delete(sessionID);
              }
              return;
            }
            if (event.type !== 'session.created' || !sessionID) return;
            const kind = classifySessionInfo(info, sessionID);
            if (!kind) return;
            sessionKinds.set(sessionID, kind);
            if (kind === 'root') await ensureEnrollment(sessionID);
          },
          'chat.message': async (input, output) => {
            const projected = projectedUserMessage(input, output);
            if (!projected) return;
            if (await resolveSessionKind(projected.sessionID) !== 'root') return;
            if (!await ensureEnrollment(projected.sessionID)) return;
            await emitEffect(projected.event, SIDE_EFFECT_MAPPINGS['chat.message']);
          },
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
