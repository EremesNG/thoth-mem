import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tool, type Hooks, type Plugin } from '@opencode-ai/plugin';

import type { RuntimeConfigOptions } from '../../config/runtime.js';
import type { LifecycleResult } from '../../memory-core/contracts.js';
import {
  MAX_HOST_OUTPUT_CODE_POINTS,
  RECOVERY_TAG_END,
  RECOVERY_TAG_START,
  renderContinuation,
} from '../../memory-core/continuation.js';
import { sanitizePrivateContent } from '../../memory-core/privacy.js';
import { resolveLocalProjectIdentity } from '../project-identity.js';
import {
  dispatchOpenCodeLifecycleThroughNode,
  type OpenCodeLifecycleDispatchInput,
} from './node-lifecycle-client.js';

export { RECOVERY_TAG_END, RECOVERY_TAG_START };
const IDENTITY_SCHEMA = 'thoth-mem.opencode.identity.v2';
const MAX_IDENTITY_CODE_POINTS = 128;
const MAX_IDENTITY_PARENT_DEPTH = 16;
const UNSAFE_IDENTITY_HEADER_CHARACTERS = /[;=\p{Cc}\p{Zl}\p{Zp}]/u;

interface SessionState {
  directory: string;
  root: boolean;
}

export interface ThothMemPluginOptions {
  runtimeConfig?: RuntimeConfigOptions;
  runtimeEntry?: string;
  lifecycleDispatch?: (input: OpenCodeLifecycleDispatchInput) => Promise<LifecycleResult | undefined>;
}

function defaultRuntimeEntry(): string {
  const modulePath = fileURLToPath(import.meta.url);
  const moduleDirectory = dirname(modulePath);
  return basename(moduleDirectory) === 'dist'
    ? join(moduleDirectory, 'index.js')
    : resolve(moduleDirectory, '../../../dist/index.js');
}

function isSessionInfo(value: unknown): value is { id: string; directory: string; parentID?: string } {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.directory === 'string' && (record.parentID === undefined || typeof record.parentID === 'string');
}

function isBoundedIdentifier(value: unknown): value is string {
  return typeof value === 'string'
    && Array.from(value).length > 0
    && Array.from(value).length <= MAX_IDENTITY_CODE_POINTS
    && /^[a-z0-9][a-z0-9._-]*$/iu.test(value);
}

function identityResult(value: Record<string, unknown>): string {
  return JSON.stringify({ schema: IDENTITY_SCHEMA, ...value });
}

function degradedIdentity(reason: string): string {
  return identityResult({ status: 'degraded', reason, authorization: 'none' });
}

function projectName(directory: string): string | undefined {
  const normalized = directory.replace(/[\\/]+$/u, '');
  const name = normalized.split(/[\\/]/u).filter(Boolean).at(-1);
  return name
    && name === name.trim()
    && Array.from(name).length <= MAX_IDENTITY_CODE_POINTS
    && !UNSAFE_IDENTITY_HEADER_CHARACTERS.test(name)
    ? name
    : undefined;
}

function stableLifecycleEventKey(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function identityOnlyRecovery(rootSessionKey: string, directory: string): string | undefined {
  let project;
  try { project = resolveLocalProjectIdentity(directory); } catch { return undefined; }
  if (!isBoundedIdentifier(rootSessionKey)) return undefined;
  try {
    return renderContinuation({ rootSessionKey, projectKey: project.key, projectName: project.name, items: [] }).context;
  } catch {
    return undefined;
  }
}

function verifiedRecovery(result: LifecycleResult | undefined, rootSessionKey: string, directory: string): string | undefined {
  const fallback = identityOnlyRecovery(rootSessionKey, directory);
  let localProject;
  try { localProject = resolveLocalProjectIdentity(directory); } catch { return fallback; }
  const recovery = result?.recovery;
  if (!fallback || !recovery || result.projectKey !== localProject.key || !projectName(result.projectName)) return fallback;
  const context = recovery.context;
  const codePointLength = Array.from(context).length;
  const selectedIds = recovery.items.map((item) => item.id);
  const selectedSummaryIds = recovery.items.filter((item) => 'recordType' in item && item.recordType === 'summary').map((item) => item.id);
  const selectedMemoryIds = recovery.items.filter((item) => !('recordType' in item && item.recordType === 'summary')).map((item) => item.id);
  const identity = `thoth-mem verified identity: root_session_id=${rootSessionKey}; project_key=${result.projectKey}; project_name=${result.projectName}`;
  if (
    !isOwnedRecoveryBlock(context) ||
    context.split(RECOVERY_TAG_START).length !== 2 ||
    context.split(RECOVERY_TAG_END).length !== 2 ||
    context.split('\n')[1] !== identity ||
    codePointLength > MAX_HOST_OUTPUT_CODE_POINTS ||
    recovery.rendering.maxCodePoints !== MAX_HOST_OUTPUT_CODE_POINTS ||
    recovery.rendering.totalCodePoints !== codePointLength ||
    selectedIds.length > 3 ||
    JSON.stringify(selectedIds) !== JSON.stringify(recovery.selectedRecordIds) ||
    JSON.stringify(selectedSummaryIds) !== JSON.stringify(recovery.selectedSummaryIds) ||
    JSON.stringify(selectedMemoryIds) !== JSON.stringify(recovery.selectedMemoryIds) ||
    result.capability.contextDelivered !== (selectedIds.length > 0) ||
    recovery.items.some((item) => !context.includes(`(${'recordType' in item && item.recordType === 'summary' ? 'summary' : 'memory'}:${item.id})`)) ||
    recovery.items.some((item) => 'recordType' in item && item.recordType === 'summary' ? context.includes(item.submissionEvidenceId) : 'evidenceIds' in item && item.evidenceIds.some((id) => context.includes(id)))
  ) return fallback;
  return context;
}

function isOwnedRecoveryBlock(value: string): boolean {
  return value.startsWith(`${RECOVERY_TAG_START}\n`) && value.endsWith(`\n${RECOVERY_TAG_END}`);
}

export function createThothMemPlugin(options: ThothMemPluginOptions = {}): Plugin {
  return async ({ client, directory }) => {
    const sessions = new Map<string, SessionState>();
    const runtimeEntry = options.runtimeEntry ?? defaultRuntimeEntry();
    const reportDiagnostic = (code: string): void => {
      const message = `OpenCode lifecycle degraded: ${code}`;
      try {
        void client.app.log({ body: { service: 'thoth-mem', level: 'warn', message } })
          .catch(() => console.error(`[thoth-mem] WARN: ${message}`));
      } catch {
        console.error(`[thoth-mem] WARN: ${message}`);
      }
    };
    const lifecycleDispatch = options.lifecycleDispatch ?? ((input: OpenCodeLifecycleDispatchInput) => dispatchOpenCodeLifecycleThroughNode(input, {
      runtimeEntry,
      runtimeConfig: options.runtimeConfig,
      onDiagnostic: reportDiagnostic,
    }));
    const dispatch = async (input: OpenCodeLifecycleDispatchInput): Promise<LifecycleResult | undefined> => {
      try {
        return await lifecycleDispatch(input);
      } catch {
        reportDiagnostic('node_lifecycle_unexpected_failure');
        return undefined;
      }
    };
    const resolveRootSession = async (callerSessionID: string, sessionDirectory: string): Promise<{ rootSessionID: string } | { reason: string }> => {
      const visited = new Set<string>();
      let sessionID = callerSessionID;
      for (let depth = 0; depth <= MAX_IDENTITY_PARENT_DEPTH; depth += 1) {
        if (visited.has(sessionID)) return { reason: 'parent_cycle' };
        visited.add(sessionID);
        let response: Awaited<ReturnType<typeof client.session.get>>;
        try {
          response = await client.session.get({ path: { id: sessionID }, query: { directory: sessionDirectory } });
        } catch {
          return { reason: 'session_lookup_failed' };
        }
        if (!isSessionInfo(response.data)) return { reason: 'session_not_found' };
        if (response.data.id !== sessionID) return { reason: 'session_id_mismatch' };
        if (response.data.parentID === undefined) return { rootSessionID: sessionID };
        if (!isBoundedIdentifier(response.data.parentID)) return { reason: 'parent_id_invalid' };
        sessionID = response.data.parentID;
      }
      return { reason: 'parent_depth_exceeded' };
    };

    const hooks: Hooks = {
      tool: {
        thoth_mem_root_identity: tool({
          description: 'Return the verified OpenCode root session identity as versioned JSON.',
          args: {},
          execute: async (_args, context) => {
            if (!isBoundedIdentifier(context.sessionID)) return degradedIdentity('invalid_caller_session');
            const resolution = await resolveRootSession(context.sessionID, context.directory);
            if ('reason' in resolution) return degradedIdentity(resolution.reason);
            let project;
            try { project = resolveLocalProjectIdentity(context.worktree || context.directory); } catch { return degradedIdentity('project_unavailable'); }
            const callerIsRoot = resolution.rootSessionID === context.sessionID;
            return identityResult({ status: 'verified', root_session_id: resolution.rootSessionID, caller_session_id: context.sessionID, caller_role: callerIsRoot ? 'root' : 'delegated', project_key: project.key, project_name_hint: project.name, authorization: callerIsRoot ? 'root_lifecycle' : 'none' });
          },
        }),
      },
      config: async (config) => {
        config.mcp = {
          ...config.mcp,
          'thoth-mem': {
            type: 'local',
            command: ['node', runtimeEntry, 'mcp', '--no-http'],
          },
        };
      },
      event: async ({ event }) => {
        if (event.type === 'session.created' || event.type === 'session.updated') {
          if (!isSessionInfo(event.properties.info)) return;
          const info = event.properties.info;
          const state = { directory: info.directory, root: !info.parentID };
          sessions.set(info.id, state);
          if (event.type === 'session.created' && state.root) {
            await dispatch({ operation: 'enroll', directory: state.directory, rootSessionKey: info.id, eventKey: `session-created:${info.id}` });
          }
          return;
        }
        if (event.type === 'session.compacted') {
          const state = sessions.get(event.properties.sessionID);
          if (state?.root) await dispatch({ operation: 'guide_post_compact', directory: state.directory, rootSessionKey: event.properties.sessionID, eventKey: `session-compacted:${event.properties.sessionID}` });
          return;
        }
        if (event.type === 'session.deleted') {
          if (!isSessionInfo(event.properties.info)) return;
          const info = event.properties.info;
          const state = sessions.get(info.id) ?? { directory: info.directory, root: !info.parentID };
          if (state.root) await dispatch({ operation: 'finalize', directory: state.directory, rootSessionKey: info.id, eventKey: `session-deleted:${info.id}` });
          sessions.delete(info.id);
        }
      },
      'chat.message': async (_input, output) => {
        const state = sessions.get(output.message.sessionID);
        if (!state?.root || output.message.role !== 'user') return;
        const content = sanitizePrivateContent(output.parts
          .filter((part): part is Extract<(typeof output.parts)[number], { type: 'text' }> => part.type === 'text' && !part.synthetic && !part.ignored)
          .map((part) => part.text)
          .join('\n')
          .trim());
        if (!content) return;
        await dispatch({ operation: 'capture_root', directory: state.directory, rootSessionKey: output.message.sessionID, eventKey: `message:${output.message.id}`, content });
      },
      'experimental.session.compacting': async ({ sessionID }, output) => {
        const state = sessions.get(sessionID);
        if (!state?.root) return;
        const content = sanitizePrivateContent(output.context.join('\n').trim());
        await dispatch({
          operation: 'checkpoint_pre_compact',
          directory: state.directory,
          rootSessionKey: sessionID,
          eventKey: `compacting:${stableLifecycleEventKey([sessionID, content])}`,
          ...(content ? { content } : {}),
        });
      },
      'experimental.chat.system.transform': async ({ sessionID }, output) => {
        if (!sessionID) return;
        const state = sessions.get(sessionID);
        if (!state?.root) return;
        const stablePrefix = output.system.filter((entry) => !isOwnedRecoveryBlock(entry));
        const result = await dispatch({ operation: 'recover', directory: state.directory, rootSessionKey: sessionID, eventKey: `system-recovery:${sessionID}` });
        const recovery = verifiedRecovery(result, sessionID, state.directory);
        output.system.splice(0, output.system.length, ...stablePrefix, ...(recovery ? [recovery] : []));
      },
    };

    return hooks;
  };
}
