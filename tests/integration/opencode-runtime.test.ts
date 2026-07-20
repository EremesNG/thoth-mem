import { randomUUID } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { MemoryPort } from '../../src/integration/core/memory-port.js';
import { executeIntegrationEvent } from '../../src/integration/runtime/integration-event-command.js';
import { HOST_EVIDENCE } from '../fixtures/integration/host-evidence.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const pluginPath = join(repositoryRoot, 'integrations/opencode/plugin.mjs');
const memoryProtocol = readFileSync(join(repositoryRoot, 'integrations/opencode/memory-protocol.md'), 'utf8');
const openCode = HOST_EVIDENCE.find((entry) => entry.harness === 'opencode');
if (!openCode) throw new Error('Expected OpenCode host evidence');

type DirectivePurpose = 'recovery_context' | 'post_compaction_guidance';
interface HookResponse {
  protocolVersion: 1;
  operation?: 'prepare_delivery' | 'confirm_delivery';
  harness?: 'opencode';
  intent?: 'enroll_session' | 'capture_root_prompt' | 'recall_guidance' | 'compact_session';
  outcome: 'confirmed' | 'no_op' | 'failed' | 'degraded';
  retryable: boolean;
  diagnostic?: string;
  hostOutputDirective?: { purpose: DirectivePurpose; text: string; deliveryMappingId: string };
  deliveryAttempt?: string;
}
interface OpenCodeToolContext {
  sessionID: string;
  messageID: string;
  agent: string;
  directory: string;
  worktree: string;
}
interface OpenCodeToolDefinition {
  description: string;
  args: Record<string, never>;
  execute(args: Record<string, never>, context: OpenCodeToolContext): Promise<string>;
}
interface OpenCodeHooks {
  tool: { thoth_mem_root_identity: OpenCodeToolDefinition };
  config(config: OpenCodeConfig): Promise<void>;
  event(input: { event: Record<string, unknown> }): Promise<void>;
  'chat.message'(input: Record<string, unknown>, output: Record<string, unknown>): Promise<void>;
  'experimental.chat.system.transform'(input: { sessionID?: string; model?: unknown }, output: { system: string[] }): Promise<void>;
  'experimental.session.compacting'(input: { sessionID?: string }, output: { context: string[]; prompt?: string }): Promise<void>;
}
interface OpenCodeConfig {
  skills?: {
    paths?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
type Dispatch = (request: unknown) => Promise<HookResponse>;
type PluginFactory = (options?: { dispatch?: Dispatch }) => (context: unknown) => Promise<OpenCodeHooks>;

async function loadPlugin(path = pluginPath): Promise<PluginFactory> {
  const module = await import(`${pathToFileURL(path).href}?test=${randomUUID()}`);
  return module.createOpenCodePlugin as PluginFactory;
}

function response(purpose: DirectivePurpose, deliveryMappingId: string, text: string): HookResponse {
  return {
    protocolVersion: 1,
    operation: 'prepare_delivery',
    outcome: 'confirmed',
    retryable: false,
    deliveryAttempt: `${Buffer.from('{"version":1}').toString('base64url')}.${'a'.repeat(64)}`,
    hostOutputDirective: { purpose, deliveryMappingId, text },
  };
}

function modelInput(sessionID = 'root-session'): { sessionID: string; model: { providerID: string; modelID: string } } {
  return { sessionID, model: { providerID: 'openai', modelID: 'gpt-5.6-terra' } };
}

function occurrences(text: string, fragment: string): number {
  return text.split(fragment).length - 1;
}

function sessionInfo(id: string, parentID?: string): Record<string, unknown> {
  return {
    id,
    projectID: 'project-1',
    directory: 'C:\\workspace\\thoth-mem',
    ...(parentID ? { parentID } : {}),
    title: parentID ? 'Explore subagent' : 'Root session',
    version: '1.18.3',
    time: { created: 1, updated: 1 },
  };
}

function pluginContext(
  sessions: Map<string, Record<string, unknown>> = new Map(),
  logs: unknown[] = [],
): Record<string, unknown> {
  return {
    directory: 'C:\\workspace\\thoth-mem',
    worktree: 'C:\\workspace\\thoth-mem',
    project: {
      id: 'project-1',
      worktree: 'C:\\workspace\\thoth-mem',
      time: { created: 1 },
    },
    serverUrl: new URL('http://127.0.0.1:4096'),
    $: () => undefined,
    client: {
      app: { log: async (entry: unknown) => { logs.push(entry); } },
      session: {
        get: async ({ path }: { path: { id: string } }) => ({ data: sessions.get(path.id) }),
      },
    },
  };
}

function userMessage(
  sessionID: string,
  messageID: string,
  parts: Array<Record<string, unknown>>,
): { input: Record<string, unknown>; output: Record<string, unknown> } {
  return {
    input: {
      sessionID,
      messageID,
      agent: 'orchestrator',
      model: { providerID: 'openai', modelID: 'gpt-5.6-terra' },
      variant: 'default',
    },
    output: {
      message: {
        id: messageID,
        sessionID,
        role: 'user',
        time: { created: 1 },
        agent: 'orchestrator',
        model: { providerID: 'openai', modelID: 'gpt-5.6-terra' },
      },
      parts,
    },
  };
}

function textPart(
  sessionID: string,
  messageID: string,
  id: string,
  text: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { id, sessionID, messageID, type: 'text', text, ...extra };
}

describe('OpenCode root identity tool', () => {
  it('returns verified v1 identity for the invoking root without dispatching lifecycle work', async () => {
    const requests: unknown[] = [];
    const root = sessionInfo('root-session');
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        requests.push(request);
        throw new Error('identity tool must not dispatch');
      },
    })(pluginContext(new Map([['root-session', root]])));

    expect(Object.keys(hooks.tool)).toEqual(['thoth_mem_root_identity']);
    expect(hooks.tool.thoth_mem_root_identity.args).toEqual({});

    const output = await hooks.tool.thoth_mem_root_identity.execute({}, {
      sessionID: 'root-session',
      messageID: 'message-1',
      agent: 'orchestrator',
      directory: 'C:\\workspace\\thoth-mem',
      worktree: 'C:\\workspace\\thoth-mem',
    });

    expect(JSON.parse(output)).toEqual({
      schema: 'thoth-mem.opencode.identity.v1',
      status: 'verified',
      root_session_id: 'root-session',
      caller_session_id: 'root-session',
      caller_role: 'root',
      project: 'thoth-mem',
      authorization: 'root_lifecycle',
    });
    expect(requests).toEqual([]);
  });

  it('resolves the terminal root for a nested delegated caller without granting authority', async () => {
    const requests: unknown[] = [];
    const sessions = new Map([
      ['root-session', sessionInfo('root-session')],
      ['parent-session', sessionInfo('parent-session', 'root-session')],
      ['child-session', sessionInfo('child-session', 'parent-session')],
    ]);
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        requests.push(request);
        throw new Error('identity tool must not dispatch');
      },
    })(pluginContext(sessions));

    const output = await hooks.tool.thoth_mem_root_identity.execute({}, {
      sessionID: 'child-session',
      messageID: 'message-2',
      agent: 'explorer',
      directory: 'C:\\workspace\\thoth-mem',
      worktree: 'C:\\workspace\\thoth-mem',
    });

    expect(JSON.parse(output)).toEqual({
      schema: 'thoth-mem.opencode.identity.v1',
      status: 'verified',
      root_session_id: 'root-session',
      caller_session_id: 'child-session',
      caller_role: 'delegated',
      project: 'thoth-mem',
      authorization: 'none',
    });
    expect(requests).toEqual([]);
  });

  it('returns bounded degraded v1 output for every unprovable identity chain', async () => {
    const root = sessionInfo('root-session');
    const cycleSessions = new Map([
      ['cycle-a', sessionInfo('cycle-a', 'cycle-b')],
      ['cycle-b', sessionInfo('cycle-b', 'cycle-a')],
    ]);
    const deepSessions = new Map<string, Record<string, unknown>>();
    for (let index = 0; index <= 16; index += 1) {
      const id = 'deep-' + index;
      deepSessions.set(id, sessionInfo(id, index < 16 ? 'deep-' + (index + 1) : undefined));
    }
    const noProjectContext = {
      client: {
        app: { log: async () => undefined },
        session: {
          get: async ({ path }: { path: { id: string } }) => ({
            data: path.id === 'root-session' ? root : undefined,
          }),
        },
      },
    };
    const lookupFailureContext = {
      directory: 'C:\\workspace\\thoth-mem',
      worktree: 'C:\\workspace\\thoth-mem',
      project: { worktree: 'C:\\workspace\\thoth-mem' },
      client: {
        app: { log: async () => undefined },
        session: { get: async () => { throw new Error('private host failure'); } },
      },
    };
    const cases: Array<{
      name: string;
      context: Record<string, unknown>;
      sessionID: string;
      directory?: string;
      reason: string;
    }> = [
      {
        name: 'invalid caller session',
        context: pluginContext(new Map()),
        sessionID: '',
        reason: 'invalid_caller_session',
      },
      {
        name: 'lookup unavailable',
        context: {
          directory: 'C:\\workspace\\thoth-mem',
          worktree: 'C:\\workspace\\thoth-mem',
          project: { worktree: 'C:\\workspace\\thoth-mem' },
        },
        sessionID: 'root-session',
        reason: 'session_lookup_unavailable',
      },
      {
        name: 'lookup failure',
        context: lookupFailureContext,
        sessionID: 'root-session',
        reason: 'session_lookup_failed',
      },
      {
        name: 'missing session',
        context: pluginContext(new Map()),
        sessionID: 'missing-session',
        reason: 'session_not_found',
      },
      {
        name: 'mismatched session',
        context: pluginContext(new Map([['root-session', sessionInfo('other-session')]])),
        sessionID: 'root-session',
        reason: 'session_id_mismatch',
      },
      {
        name: 'malformed parent',
        context: pluginContext(new Map([
          ['child-session', { ...sessionInfo('child-session'), parentID: '' }],
        ])),
        sessionID: 'child-session',
        reason: 'parent_id_invalid',
      },
      {
        name: 'broken parent link',
        context: pluginContext(new Map([
          ['child-session', sessionInfo('child-session', 'missing-parent')],
        ])),
        sessionID: 'child-session',
        reason: 'session_not_found',
      },
      {
        name: 'parent cycle',
        context: pluginContext(cycleSessions),
        sessionID: 'cycle-a',
        reason: 'parent_cycle',
      },
      {
        name: 'parent depth overflow',
        context: pluginContext(deepSessions),
        sessionID: 'deep-0',
        reason: 'parent_depth_exceeded',
      },
      {
        name: 'project unavailable',
        context: noProjectContext,
        sessionID: 'root-session',
        directory: '',
        reason: 'project_unavailable',
      },
    ];
    const createOpenCodePlugin = await loadPlugin();

    for (const testCase of cases) {
      const hooks = await createOpenCodePlugin({
        dispatch: async () => { throw new Error('identity tool must not dispatch'); },
      })(testCase.context);
      const output = await hooks.tool.thoth_mem_root_identity.execute({}, {
        sessionID: testCase.sessionID,
        messageID: 'message-' + testCase.name,
        agent: 'orchestrator',
        directory: testCase.directory ?? 'C:\\workspace\\thoth-mem',
        worktree: testCase.directory ?? 'C:\\workspace\\thoth-mem',
      });
      const parsed = JSON.parse(output);

      expect(parsed, testCase.name).toEqual({
        schema: 'thoth-mem.opencode.identity.v1',
        status: 'degraded',
        reason: testCase.reason,
        authorization: 'none',
      });
      expect(parsed, testCase.name).not.toHaveProperty('root_session_id');
    }
  });
});

describe('OpenCode bundled skill registration', () => {
  it('registers the copied native skill parent once while preserving existing paths', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth opencode plugin with spaces '));
    const assetRoot = join(root, 'copied installation with spaces');
    const copiedPluginPath = join(assetRoot, 'opencode', 'plugin.mjs');
    const bundledSkillsPath = join(assetRoot, 'opencode', 'skills');
    try {
      mkdirSync(join(assetRoot, 'opencode'), { recursive: true });
      mkdirSync(join(assetRoot, 'shared'), { recursive: true });
      cpSync(pluginPath, copiedPluginPath);
      cpSync(
        join(repositoryRoot, 'integrations', 'opencode', 'memory-protocol.md'),
        join(assetRoot, 'opencode', 'memory-protocol.md'),
      );
      cpSync(
        join(repositoryRoot, 'integrations', 'shared', 'hook-runner.mjs'),
        join(assetRoot, 'shared', 'hook-runner.mjs'),
      );
      cpSync(
        join(repositoryRoot, 'plugin', 'skills', 'thoth-mem'),
        join(bundledSkillsPath, 'thoth-mem'),
        { recursive: true },
      );
      const createOpenCodePlugin = await loadPlugin(copiedPluginPath);
      const hooks = await createOpenCodePlugin()({});

      const emptyConfig: OpenCodeConfig = {};
      await hooks.config(emptyConfig);
      expect(emptyConfig).toEqual({ skills: { paths: [bundledSkillsPath] } });

      const existingConfig: OpenCodeConfig = {
        skills: {
          paths: ['./user-skills'],
          urls: ['https://example.test/skills/'],
        },
      };
      await hooks.config(existingConfig);
      await hooks.config(existingConfig);

      expect(isAbsolute(bundledSkillsPath)).toBe(true);
      expect(existingConfig).toEqual({
        skills: {
          paths: ['./user-skills', bundledSkillsPath],
          urls: ['https://example.test/skills/'],
        },
      });
      expect(readFileSync(join(bundledSkillsPath, 'thoth-mem', 'SKILL.md'), 'utf8'))
        .toMatch(/^---\r?\nname: thoth-mem\r?\n/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('OpenCode normal lifecycle side effects', () => {
  it('persists start then root prompt once through plugin, resolver, adapter, and core', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-opencode-prompt-'));
    const calls: Array<{ tool: string; input: Record<string, unknown> }> = [];
    const requests: Record<string, unknown>[] = [];
    const memoryPort: MemoryPort = {
      async call(tool, input) {
        calls.push({ tool, input });
        return tool === 'mem_save'
          ? { confirmed: true, isError: false, text: 'Prompt saved.', reference: { kind: 'prompt', id: 41 } }
          : { confirmed: true, isError: false, text: 'Session started.' };
      },
      async close() {},
    };

    try {
      const createOpenCodePlugin = await loadPlugin();
      const root = sessionInfo('root-session');
      const hooks = await createOpenCodePlugin({
        dispatch: async (request) => {
          requests.push(request as Record<string, unknown>);
          const result = await executeIntegrationEvent(JSON.stringify(request), {
            dataDir,
            dependencies: {
              resolveDataDir: () => dataDir,
              createMemoryPort: async () => memoryPort,
            },
          });
          return result.response as HookResponse;
        },
      })(pluginContext(new Map([['root-session', root]])));

      await hooks.event({ event: { type: 'session.created', properties: { info: root } } });
      const message = userMessage('root-session', 'message-1', [
        textPart('root-session', 'message-1', 'part-1', 'hazlo'),
      ]);
      const original = structuredClone(message.output);
      await hooks['chat.message'](message.input, message.output);
      await hooks['chat.message'](message.input, message.output);

      expect(message.output).toEqual(original);
      expect(calls).toEqual([
        {
          tool: 'mem_session',
          input: {
            action: 'start',
            id: 'root-session',
            project: 'thoth-mem',
            directory: 'C:\\workspace\\thoth-mem',
          },
        },
        {
          tool: 'mem_save',
          input: {
            kind: 'prompt',
            content: 'hazlo',
            session_id: 'root-session',
            project: 'thoth-mem',
          },
        },
      ]);
      expect(requests.map((request) => (request.event as { type?: string }).type))
        .toEqual(['session.created', 'chat.message', 'chat.message']);
      expect(requests[0]).toMatchObject({
        capabilityEvidence: {
          eventMappingId: 'opencode-session-created-v1',
          deliveryChannel: 'none',
          deliveryMappingId: 'opencode-session-side-effect-v1',
          behaviorEvidenceMappingId: 'opencode-plugin-init-side-effect-v1',
        },
        context: { project: 'thoth-mem', directory: 'C:\\workspace\\thoth-mem' },
      });
      expect(requests[1]).toMatchObject({
        event: {
          type: 'chat.message',
          id: 'message-1',
          input: { sessionID: 'root-session', messageID: 'message-1', rootSession: true },
        },
        capabilityEvidence: {
          eventMappingId: 'opencode-user-prompt-v1',
          deliveryChannel: 'none',
          deliveryMappingId: 'opencode-user-prompt-side-effect-v1',
        },
      });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('recovers root classification, skips delegated and generated text, and projects only trusted parts', async () => {
    const requests: Record<string, unknown>[] = [];
    const logs: unknown[] = [];
    const sessions = new Map([
      ['root-session', sessionInfo('root-session')],
      ['child-session', sessionInfo('child-session', 'root-session')],
    ]);
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        requests.push(request as Record<string, unknown>);
        const type = ((request as { event?: { type?: string } }).event?.type);
        return {
          protocolVersion: 1,
          harness: 'opencode',
          intent: type === 'session.created' ? 'enroll_session' : 'capture_root_prompt',
          outcome: 'confirmed',
          retryable: false,
        };
      },
    })(pluginContext(sessions, logs));

    const generated = userMessage('root-session', 'generated-1', [
      textPart('root-session', 'generated-1', 'generated-part', 'GENERATED', { synthetic: true }),
    ]);
    await hooks['chat.message'](generated.input, generated.output);

    const child = userMessage('child-session', 'child-1', [
      textPart('child-session', 'child-1', 'child-part', 'delegated prompt'),
    ]);
    await hooks['chat.message'](child.input, child.output);

    const root = userMessage('root-session', 'root-1', [
      textPart('root-session', 'root-1', 'trusted', 'sí'),
      textPart('root-session', 'root-1', 'synthetic', 'SYNTHETIC', { synthetic: true }),
      textPart('root-session', 'root-1', 'ignored', 'IGNORED', { ignored: true }),
      textPart('root-session', 'other-message', 'mismatch', 'MISMATCH'),
    ]);
    await hooks['chat.message'](root.input, root.output);

    expect(requests.map((request) => (request.event as { type?: string }).type))
      .toEqual(['session.created', 'chat.message']);
    expect(requests[1]).toMatchObject({
      event: {
        id: 'root-1',
        output: {
          message: { id: 'root-1', sessionID: 'root-session', role: 'user' },
          parts: [{
            id: 'trusted',
            sessionID: 'root-session',
            messageID: 'root-1',
            type: 'text',
            text: 'sí',
          }],
        },
      },
    });
    expect(JSON.stringify(requests)).not.toMatch(/GENERATED|delegated prompt|SYNTHETIC|IGNORED|MISMATCH/);
  });

  it('fails open and retries enrollment after an unconfirmed dispatch', async () => {
    const attempts: string[] = [];
    const logs: unknown[] = [];
    const root = sessionInfo('root-session');
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        attempts.push(((request as { event?: { type?: string } }).event?.type) ?? 'unknown');
        throw new Error('memory unavailable');
      },
    })(pluginContext(new Map([['root-session', root]]), logs));

    await expect(hooks.event({ event: { type: 'session.created', properties: { info: root } } }))
      .resolves.toBeUndefined();
    const message = userMessage('root-session', 'message-1', [
      textPart('root-session', 'message-1', 'part-1', 'retry me'),
    ]);
    await expect(hooks['chat.message'](message.input, message.output)).resolves.toBeUndefined();

    expect(attempts).toEqual(['session.created', 'session.created']);
    expect(JSON.stringify(logs)).toContain('opencode_memory_effect_degraded');
  });
});

describe('OpenCode runtime behavior-evidence binding', () => {
  it('omits unavailable hostVersion and awaits structured initialization and emission logs', async () => {
    const requests: Record<string, unknown>[] = [];
    const logs: unknown[] = [];
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        requests.push(request as Record<string, unknown>);
        return response('recovery_context', openCode.recovery.mappingId, 'Recovered context');
      },
    })({
      directory: '/workspace',
      project: 'thoth-mem',
      client: { app: { log: async (entry: unknown) => { await Promise.resolve(); logs.push(entry); } } },
    });
    const system = ['Existing system instructions'];
    const output = { system };

    expect(await hooks['experimental.chat.system.transform'](modelInput(), output)).toBeUndefined();
    expect(output.system).toBe(system);
    expect(output.system).toHaveLength(1);
    expect(output.system[0]).toContain(memoryProtocol);
    expect(output.system[0]).toContain('Recovered context');
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      protocolVersion: 1,
      operation: 'prepare_delivery',
      harness: 'opencode',
      event: { type: 'experimental.chat.system.transform', input: modelInput() },
      capabilityEvidence: {
        payloadMappingId: openCode.payloadMappingId,
        assetExecutionMarker: openCode.activationMarker,
        eventMappingId: openCode.activation.mappingId,
        deliveryChannel: openCode.recovery.channel,
        deliveryMappingId: openCode.recovery.mappingId,
        behaviorEvidenceMappingId: 'opencode-plugin-init-mutation-v1',
      },
    });
    expect((requests[0].capabilityEvidence as Record<string, unknown>)).not.toHaveProperty('hostVersion');
    expect(logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ body: expect.objectContaining({ message: 'opencode_behavior_evidence_initialized' }) }),
      expect.objectContaining({ body: expect.objectContaining({ message: 'emitted_via_verified_channel' }) }),
    ]));
  });

  it('accepts a nonempty plain model with additional fields but rejects empty, array, and null models', async () => {
    const requests: Record<string, unknown>[] = [];
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        requests.push(request as Record<string, unknown>);
        return response('recovery_context', openCode.recovery.mappingId, 'Recovered context');
      },
    })({ client: { app: { log: async () => undefined } } });
    const output = { system: ['base'] };

    await hooks['experimental.chat.system.transform']({
      sessionID: 'root-session',
      model: { providerID: 'openai', modelID: 'gpt-5.6-terra', reasoning: { effort: 'high' } },
    }, output);
    expect(output.system.join('\n')).toContain('Recovered context');
    expect(requests).toHaveLength(2);

    for (const model of [{}, [], null]) {
      await hooks['experimental.chat.system.transform']({ sessionID: 'invalid-model', model }, { system: ['base'] });
    }
    expect(requests).toHaveLength(2);
  });

  it('merges the final system entry or pushes an empty channel without duplicate protocol or recovery text', async () => {
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async () => response('recovery_context', openCode.recovery.mappingId, 'Recovered context'),
    })({ client: { app: { log: async () => undefined } } });
    const nonEmpty = { system: ['Base'] };
    const existingArray = nonEmpty.system;

    await hooks['experimental.chat.system.transform'](modelInput(), nonEmpty);
    await hooks['experimental.chat.system.transform'](modelInput(), nonEmpty);
    expect(nonEmpty.system).toBe(existingArray);
    expect(nonEmpty.system).toHaveLength(1);
    expect(occurrences(nonEmpty.system[0], memoryProtocol)).toBe(1);
    expect(occurrences(nonEmpty.system[0], 'Recovered context')).toBe(1);

    const empty = { system: [] as string[] };
    const emptyArray = empty.system;
    await hooks['experimental.chat.system.transform'](modelInput(), empty);
    expect(empty.system).toBe(emptyArray);
    expect(empty.system).toHaveLength(1);
  });

  it('appends compacting output.context in place and never sets a replacement prompt', async () => {
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async () => response('post_compaction_guidance', openCode.compaction.mappingId, 'Continue after compaction'),
    })({ client: { app: { log: async () => undefined } } });
    const context = ['Existing compaction context'];
    const output = { context };

    expect(await hooks['experimental.session.compacting']({ sessionID: 'root-session' }, output)).toBeUndefined();
    expect(output.context).toBe(context);
    expect(output.context).toEqual(['Existing compaction context', 'Continue after compaction']);
    expect(output).not.toHaveProperty('prompt');
  });

  it('fails closed with no directive mutation for missing marker, malformed payload, or mismatched channel', async () => {
    const createOpenCodePlugin = await loadPlugin();
    const noMarker = await createOpenCodePlugin({
      dispatch: async () => response('recovery_context', openCode.recovery.mappingId, 'Recovered context'),
    })({});
    const markerOutput = { system: ['Base'] };
    await noMarker['experimental.chat.system.transform']({ sessionID: 'root-session' }, markerOutput);
    expect(markerOutput.system).toEqual(['Base']);

    const mismatched = await createOpenCodePlugin({
      dispatch: async () => response('recovery_context', openCode.compaction.mappingId, 'Wrong channel'),
    })({ client: { app: { log: async () => undefined } } });
    const malformedOutput = { system: ['Base'] };
    await mismatched['experimental.chat.system.transform']({}, malformedOutput);
    expect(malformedOutput.system).toEqual(['Base']);
    const channelOutput = { system: ['Base'] };
    await mismatched['experimental.chat.system.transform'](modelInput(), channelOutput);
    expect(channelOutput.system).toEqual(['Base']);
  });
});
describe('OpenCode private delivery preparation', () => {
  it('sends only an eligible private prepare request for the exact v1.17.19 system callback and consumes a bounded tokenized directive', async () => {
    const requests: Record<string, unknown>[] = [];
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        requests.push(request as Record<string, unknown>);
        return response('recovery_context', openCode.recovery.mappingId, 'Recovered context');
      },
    })({ client: { app: { log: async () => undefined } } });
    const output = { system: [] as string[] };

    await hooks['experimental.chat.system.transform']({ sessionID: 'root', model: { providerID: 'openai', modelID: 'gpt' } } as never, output);

    expect(requests[0]).toMatchObject({
      operation: 'prepare_delivery',
      capabilityEvidence: expect.not.objectContaining({ hostVersion: expect.anything() }),
      event: { type: 'experimental.chat.system.transform', input: { sessionID: 'root', model: { providerID: 'openai', modelID: 'gpt' } } },
    });
    expect(output.system.join('\n')).toContain('Recovered context');
  });

  it('uses the official compacting payload with no model and completes prepare then confirmation', async () => {
    const operations: string[] = [];
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        const operation = (request as Record<string, unknown>).operation as string;
        operations.push(operation);
        return operation === 'prepare_delivery'
          ? response('post_compaction_guidance', openCode.compaction.mappingId, 'Continue after compaction')
          : { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'confirmed', retryable: false };
      },
    })({ client: { app: { log: async () => undefined } } });
    const context = ['Existing context'];

    await hooks['experimental.session.compacting']({ sessionID: 'root-session' }, { context });

    expect(context).toEqual(['Existing context', 'Continue after compaction']);
    expect(operations).toEqual(['prepare_delivery', 'confirm_delivery']);
  });

  it('uses one generated callback nonce and sequence through retries, then creates fresh evidence for the next compaction', async () => {
    const prepares: Array<{ id: unknown; sequence: unknown }> = [];
    const confirmations: Array<{ id: unknown; sequence: unknown }> = [];
    let confirmationCount = 0;
    const createOpenCodePlugin = await loadPlugin();
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        const record = request as { operation?: string; event?: Record<string, unknown> };
        if (record.operation === 'prepare_delivery') {
          prepares.push({ id: record.event?.id, sequence: record.event?.sequence });
          return response('post_compaction_guidance', openCode.compaction.mappingId, 'Guidance ' + prepares.length);
        }
        confirmations.push({ id: record.event?.id, sequence: record.event?.sequence });
        confirmationCount += 1;
        return confirmationCount === 1
          ? { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'failed', retryable: true }
          : { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'confirmed', retryable: false };
      },
    })({ client: { app: { log: async () => undefined } } });

    await hooks['experimental.session.compacting']({ sessionID: 'root-session' }, { context: [] });
    await hooks['experimental.session.compacting']({ sessionID: 'root-session' }, { context: [] });

    expect(prepares).toEqual([
      { id: expect.stringMatching(/^[0-9a-f-]{36}$/i), sequence: 1 },
      { id: expect.stringMatching(/^[0-9a-f-]{36}$/i), sequence: 2 },
    ]);
    expect(prepares[0].id).not.toBe(prepares[1].id);
    expect(confirmations).toEqual([prepares[0], prepares[0], prepares[1]]);
  });

  it('fails closed for an absent model or a 1001-code-point astral directive without replacing the original array', async () => {
    const createOpenCodePlugin = await loadPlugin();
    const tooLong = '😀'.repeat(1001);
    const hooks = await createOpenCodePlugin({
      dispatch: async () => response('recovery_context', openCode.recovery.mappingId, tooLong),
    })({ client: { app: { log: async () => undefined } } });
    const output = { system: ['base'] };
    const identity = output.system;

    await hooks['experimental.chat.system.transform'](modelInput('root'), output);
    expect(output.system).toBe(identity);
    expect(output.system).toEqual(['base']);
  });

  it('accepts one and 1000 astral code points but rejects 1001 without confirmation', async () => {
    const createOpenCodePlugin = await loadPlugin();
    const confirmed: string[] = [];
    let directive = '😀';
    const hooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        const operation = (request as Record<string, unknown>).operation;
        if (operation === 'prepare_delivery') {
          return response('recovery_context', openCode.recovery.mappingId, directive);
        }
        confirmed.push((request as Record<string, unknown>).deliveryAttempt as string);
        return { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'confirmed', retryable: false };
      },
    })({ client: { app: { log: async () => undefined } } });

    const one = { system: ['base'] };
    await hooks['experimental.chat.system.transform'](modelInput('one'), one);
    expect(one.system.join('\n')).toContain('😀');

    directive = '😀'.repeat(1000);
    const atBound = { system: ['base'] };
    await hooks['experimental.chat.system.transform'](modelInput('bound'), atBound);
    expect(atBound.system.join('\n')).toContain(directive);

    directive = '😀'.repeat(1001);
    const overBound = { system: ['base'] };
    const identity = overBound.system;
    await hooks['experimental.chat.system.transform'](modelInput('over'), overBound);
    expect(overBound.system).toBe(identity);
    expect(overBound.system).toEqual(['base']);
    expect(confirmed).toHaveLength(2);
  });

  it('globally deduplicates output arrays, rolls back on log failure, and retries confirmation with the same token', async () => {
    const createOpenCodePlugin = await loadPlugin();
    const duplicateHooks = await createOpenCodePlugin({
      dispatch: async (request) => (request as Record<string, unknown>).operation === 'prepare_delivery'
        ? response('recovery_context', openCode.recovery.mappingId, 'Recovered context')
        : { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'confirmed', retryable: false },
    })({ client: { app: { log: async () => undefined } } });
    const system = [memoryProtocol, 'Recovered context', 'Tail'];
    await duplicateHooks['experimental.chat.system.transform'](modelInput(), { system });
    expect(system).toEqual([memoryProtocol, 'Recovered context', 'Tail']);

    const rollbackHooks = await createOpenCodePlugin({
      dispatch: async () => response('recovery_context', openCode.recovery.mappingId, 'Recovered context'),
    })({ client: { app: { log: async (entry: unknown) => {
      if ((entry as { body?: { message?: string } }).body?.message === 'emitted_via_verified_channel') {
        throw new Error('log failure');
      }
    } } } });
    const rollback = { system: ['base'] };
    await rollbackHooks['experimental.chat.system.transform'](modelInput(), rollback);
    expect(rollback.system).toEqual(['base']);

    const sequence: string[] = [];
    const attempts: string[] = [];
    let confirmations = 0;
    const retryHooks = await createOpenCodePlugin({
      dispatch: async (request) => {
        const operation = (request as Record<string, unknown>).operation as string;
        sequence.push(operation);
        if (operation === 'prepare_delivery') {
          return response('recovery_context', openCode.recovery.mappingId, 'Recovered context');
        }
        attempts.push((request as Record<string, unknown>).deliveryAttempt as string);
        confirmations += 1;
        return confirmations === 1
          ? { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'failed', retryable: true }
          : { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'confirmed', retryable: false };
      },
    })({ client: { app: { log: async () => { sequence.push('log'); } } } });
    await retryHooks['experimental.chat.system.transform'](modelInput(), { system: ['base'] });
    expect(sequence.slice(-4)).toEqual(['prepare_delivery', 'log', 'confirm_delivery', 'confirm_delivery']);
    expect(new Set(attempts)).toEqual(new Set([attempts[0]]));
  });
});
