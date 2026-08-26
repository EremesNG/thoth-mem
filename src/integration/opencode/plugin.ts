import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tool, type Hooks, type Plugin } from '@opencode-ai/plugin';

import type { RuntimeConfigOptions } from '../../config/runtime.js';
import type { LifecycleResult } from '../../memory-core/contracts.js';
import {
  dispatchOpenCodeLifecycleThroughNode,
  type OpenCodeLifecycleDispatchInput,
} from './node-lifecycle-client.js';

export const RECOVERY_TAG_START = '<!-- thoth-mem:recovery:start -->';
export const RECOVERY_TAG_END = '<!-- thoth-mem:recovery:end -->';
const IDENTITY_SCHEMA = 'thoth-mem.opencode.identity.v1';
const MAX_IDENTITY_CODE_POINTS = 128;
const MAX_IDENTITY_PARENT_DEPTH = 16;
const MAX_HOST_OUTPUT_CODE_POINTS = 1_000;
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

function renderRecovery(result: LifecycleResult | undefined, rootSessionKey: string, directory: string): string | undefined {
  const project = projectName(directory);
  if (!isBoundedIdentifier(rootSessionKey) || !project) return undefined;
  const identity = `thoth-mem verified identity: root_session_id=${rootSessionKey}; project=${project}`;
  const items = result?.recovery?.items ?? [];
  const prefix = `${RECOVERY_TAG_START}\n${identity}`;
  const suffix = `\n${RECOVERY_TAG_END}`;
  const required = `${prefix}${suffix}`;
  if (Array.from(required).length > MAX_HOST_OUTPUT_CODE_POINTS) return undefined;
  if (items.length === 0) return required;
  const contextBudget = MAX_HOST_OUTPUT_CODE_POINTS - Array.from(required).length - 2;
  if (contextBudget <= 0) return required;
  const heading = Array.from('## thoth-mem recovered context');
  const candidates = items.map((item) => ({
    prefix: Array.from(`- [${item.kind}] ${item.title}: `),
    content: Array.from(item.content ?? item.snippet),
    suffix: Array.from(` (memory:${item.id}; evidence:${item.evidenceIds.join(',') || 'none'})`),
  }));
  const selected: typeof candidates = [];
  let reservedCodePoints = heading.length;
  for (const candidate of candidates) {
    const fixedItemCodePoints = 1 + candidate.prefix.length + candidate.suffix.length;
    const minimumContentCodePoints = Math.min(1, candidate.content.length);
    if (reservedCodePoints + fixedItemCodePoints + minimumContentCodePoints > contextBudget) continue;
    selected.push(candidate);
    reservedCodePoints += fixedItemCodePoints + minimumContentCodePoints;
  }
  if (selected.length === 0) return required;

  const allocations = selected.map(() => 0);
  const fixedCodePoints = heading.length + selected.reduce((sum, item) => sum + 1 + item.prefix.length + item.suffix.length, 0);
  let remainingCodePoints = contextBudget - fixedCodePoints;
  while (remainingCodePoints > 0) {
    let allocated = false;
    for (const [index, item] of selected.entries()) {
      if (allocations[index]! >= item.content.length) continue;
      allocations[index]! += 1;
      remainingCodePoints -= 1;
      allocated = true;
      if (remainingCodePoints === 0) break;
    }
    if (!allocated) break;
  }

  const lines = selected.map((item, index) => {
    const allowance = allocations[index]!;
    const content = item.content.slice(0, allowance);
    if (allowance > 0 && allowance < item.content.length) content[allowance - 1] = '…';
    return [...item.prefix, ...content, ...item.suffix].join('');
  });
  const context = [heading.join(''), ...lines].join('\n');
  return `${prefix}\n\n${context}${suffix}`;
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
            const project = projectName(context.worktree || context.directory);
            if (!project) return degradedIdentity('project_unavailable');
            const callerIsRoot = resolution.rootSessionID === context.sessionID;
            return identityResult({ status: 'verified', root_session_id: resolution.rootSessionID, caller_session_id: context.sessionID, caller_role: callerIsRoot ? 'root' : 'delegated', project, authorization: callerIsRoot ? 'root_lifecycle' : 'none' });
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
        const content = output.parts
          .filter((part): part is Extract<(typeof output.parts)[number], { type: 'text' }> => part.type === 'text' && !part.synthetic && !part.ignored)
          .map((part) => part.text)
          .join('\n')
          .trim();
        if (!content) return;
        await dispatch({ operation: 'capture_root', directory: state.directory, rootSessionKey: output.message.sessionID, eventKey: `message:${output.message.id}`, content });
      },
      'experimental.session.compacting': async ({ sessionID }, output) => {
        const state = sessions.get(sessionID);
        if (!state?.root) return;
        const content = output.context.join('\n').trim();
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
        const recovery = renderRecovery(result, sessionID, state.directory);
        output.system.splice(0, output.system.length, ...stablePrefix, ...(recovery ? [recovery] : []));
      },
    };

    return hooks;
  };
}
