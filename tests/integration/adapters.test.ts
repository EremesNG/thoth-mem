import { randomUUID } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LIFECYCLE_INTENTS } from '../../src/integration/core/types.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

async function importRequiredModule(relativePath: string): Promise<Record<string, unknown>> {
  const absolutePath = join(repositoryRoot, relativePath);
  expect(existsSync(absolutePath), `${relativePath} must exist`).toBe(true);
  return import(`${pathToFileURL(absolutePath).href}?test=${randomUUID()}`);
}

function expectExactCapabilityKeys(capabilities: Record<string, unknown>): void {
  expect(Object.keys(capabilities)).toEqual([...LIFECYCLE_INTENTS]);
}

describe('OpenCode adapter', () => {
  it('publishes the exact five-entry evidence-backed capability matrix', async () => {
    const adapter = await importRequiredModule('src/integration/adapters/opencode.ts');
    const createOpenCodeCapabilities = adapter.createOpenCodeCapabilities as (input?: unknown) => Record<string, any>;

    const supported = createOpenCodeCapabilities({
      hostVersion: 'verified-fixture',
      verifiedEvents: [
        'session.created',
        'chat.message',
        'experimental.chat.system.transform',
        'experimental.session.compacting',
      ],
    });

    expectExactCapabilityKeys(supported);
    expect(supported).toEqual({
      enroll_session: { state: 'supported', trigger: 'session.created' },
      capture_root_prompt: { state: 'supported', trigger: 'chat.message' },
      recall_guidance: { state: 'supported', trigger: 'experimental.chat.system.transform' },
      compact_session: { state: 'supported', trigger: 'experimental.session.compacting' },
      finalize_session: {
        state: 'unsupported',
        reason: expect.stringContaining('verified terminal'),
      },
    });

    const partial = createOpenCodeCapabilities({
      hostVersion: 'partial-fixture',
      verifiedEvents: [
        'session.created',
        'chat.message',
        'experimental.chat.system.transform',
      ],
      incompleteEvents: ['experimental.session.compacting'],
    });
    expect(partial.compact_session).toEqual({
      state: 'degraded',
      trigger: 'experimental.session.compacting',
      reason: expect.stringContaining('payload'),
    });

    const unknown = createOpenCodeCapabilities({ hostVersion: 'unknown-future-version' });
    expectExactCapabilityKeys(unknown);
    expect(Object.values(unknown).every((capability) => capability.state === 'unsupported')).toBe(true);
  });

  it('normalizes verified root events and excludes sub-agent or cleanup traffic', async () => {
    const adapter = await importRequiredModule('src/integration/adapters/opencode.ts');
    const createOpenCodeCapabilities = adapter.createOpenCodeCapabilities as (input?: unknown) => Record<string, any>;
    const normalizeOpenCodeEvent = adapter.normalizeOpenCodeEvent as (input: unknown, capabilities: unknown) => any;
    const capabilities = createOpenCodeCapabilities({
      verifiedEvents: [
        'session.created',
        'chat.message',
        'experimental.chat.system.transform',
        'experimental.session.compacting',
      ],
    });

    expect(normalizeOpenCodeEvent({
      event: {
        type: 'session.created',
        id: 'event-start',
        timestamp: '2026-07-09T12:00:00.000Z',
        properties: { info: { id: 'root-session', title: 'Root session' } },
      },
      context: { project: 'thoth-mem', directory: 'C:/work tree/thoth-mem' },
    }, capabilities)).toEqual({
      action: 'dispatch',
      event: {
        harness: 'opencode',
        intent: 'enroll_session',
        actor: 'system',
        isRootSession: true,
        identity: {
          sessionId: 'root-session',
          project: 'thoth-mem',
          cwd: 'C:/work tree/thoth-mem',
        },
        nativeEventId: 'event-start',
        hostTimestamp: '2026-07-09T12:00:00.000Z',
        nativeEvent: 'session.created',
      },
    });

    const prompt = normalizeOpenCodeEvent({
      event: {
        type: 'chat.message',
        id: 'message-7',
        timestamp: '2026-07-09T12:01:00.000Z',
        input: { sessionID: 'root-session' },
        output: {
          message: { role: 'user' },
          parts: [
            { type: 'text', text: 'Preserve ' },
            { type: 'tool', text: 'ignored' },
            { type: 'text', text: 'root intent.' },
          ],
        },
      },
      context: { project: 'thoth-mem', directory: '/workspace/thoth mem' },
    }, capabilities);
    expect(prompt.action).toBe('dispatch');
    expect(prompt.event).toMatchObject({
      harness: 'opencode',
      intent: 'capture_root_prompt',
      actor: 'root_user',
      isRootSession: true,
      identity: { sessionId: 'root-session', project: 'thoth-mem' },
      nativeEventId: 'message-7',
      content: 'Preserve \nroot intent.',
      nativeEvent: 'chat.message',
    });

    expect(normalizeOpenCodeEvent({
      event: {
        type: 'experimental.session.compacting',
        sequence: 9,
        input: { sessionID: 'root-session' },
      },
      context: { project: 'thoth-mem' },
    }, capabilities)).toMatchObject({
      action: 'dispatch',
      event: {
        intent: 'compact_session',
        hostSequence: '9',
        nativeEvent: 'experimental.session.compacting',
      },
    });

    const delegated = normalizeOpenCodeEvent({
      event: {
        type: 'session.created',
        properties: { info: { id: 'child-session', parentID: 'root-session' } },
      },
      context: { project: 'thoth-mem' },
    }, capabilities);
    expect(delegated).toMatchObject({ action: 'return', outcome: 'no_op', retryable: false });

    const cleanup = normalizeOpenCodeEvent({
      event: { type: 'session.deleted', properties: { info: { id: 'root-session' } } },
    }, capabilities);
    expect(cleanup).toMatchObject({ action: 'return', outcome: 'no_op', retryable: false });
    expect(JSON.stringify(cleanup)).not.toContain('confirmed');
  });

  it('degrades incomplete or unsupported events without echoing prompt content', async () => {
    const adapter = await importRequiredModule('src/integration/adapters/opencode.ts');
    const createOpenCodeCapabilities = adapter.createOpenCodeCapabilities as (input?: unknown) => Record<string, any>;
    const normalizeOpenCodeEvent = adapter.normalizeOpenCodeEvent as (input: unknown, capabilities: unknown) => any;
    const capabilities = createOpenCodeCapabilities({
      incompleteEvents: ['chat.message'],
    });
    const result = normalizeOpenCodeEvent({
      event: {
        type: 'chat.message',
        output: { message: { role: 'user' }, parts: [{ type: 'text', text: 'SECRET-PROMPT' }] },
      },
    }, capabilities);

    expect(result).toMatchObject({ action: 'return', outcome: 'degraded', retryable: false });
    expect(JSON.stringify(result)).not.toContain('SECRET-PROMPT');
    expect(JSON.stringify(result)).not.toContain('confirmed');
  });
});

describe('Codex adapter', () => {
  it('supports only verified hook evidence and fails closed for partial or unknown hooks', async () => {
    const adapter = await importRequiredModule('src/integration/adapters/codex.ts');
    const createCodexCapabilities = adapter.createCodexCapabilities as (input?: unknown) => Record<string, any>;

    const capabilities = createCodexCapabilities({
      verifiedHooks: {
        enroll_session: 'SessionStart',
        capture_root_prompt: 'UserPromptSubmit',
        recall_guidance: 'SessionStartContext',
      },
      incompleteHooks: {
        compact_session: {
          trigger: 'PreCompact',
          reason: 'Compact payload identity is not proven.',
        },
      },
    });

    expectExactCapabilityKeys(capabilities);
    expect(capabilities).toEqual({
      enroll_session: { state: 'supported', trigger: 'SessionStart' },
      capture_root_prompt: { state: 'supported', trigger: 'UserPromptSubmit' },
      recall_guidance: { state: 'supported', trigger: 'SessionStartContext' },
      compact_session: {
        state: 'degraded',
        trigger: 'PreCompact',
        reason: 'Compact payload identity is not proven.',
      },
      finalize_session: {
        state: 'unsupported',
        reason: expect.stringContaining('verified'),
      },
    });

    const unknown = createCodexCapabilities();
    expectExactCapabilityKeys(unknown);
    expect(Object.values(unknown).every((capability) => capability.state === 'unsupported')).toBe(true);
  });

  it('normalizes only complete evidence-backed root payloads', async () => {
    const adapter = await importRequiredModule('src/integration/adapters/codex.ts');
    const createCodexCapabilities = adapter.createCodexCapabilities as (input?: unknown) => Record<string, any>;
    const normalizeCodexEvent = adapter.normalizeCodexEvent as (input: unknown, capabilities: unknown) => any;
    const capabilities = createCodexCapabilities({
      verifiedHooks: {
        enroll_session: 'SessionStart',
        capture_root_prompt: 'UserPromptSubmit',
        recall_guidance: 'SessionStartContext',
      },
      incompleteHooks: {
        compact_session: { trigger: 'PreCompact', reason: 'Summary evidence is partial.' },
        finalize_session: { trigger: 'Stop', reason: 'Terminal evidence is partial.' },
      },
    });

    const prompt = normalizeCodexEvent({
      hook: 'UserPromptSubmit',
      payload: {
        session_id: 'codex-root',
        project: 'thoth-mem',
        cwd: 'C:/Codex Projects/thoth mem',
        role: 'user',
        prompt: 'Capture only verified root intent.',
        event_id: 'codex-message-1',
        timestamp: '2026-07-09T12:00:00.000Z',
      },
    }, capabilities);
    expect(prompt).toEqual({
      action: 'dispatch',
      event: {
        harness: 'codex',
        intent: 'capture_root_prompt',
        actor: 'root_user',
        isRootSession: true,
        identity: {
          sessionId: 'codex-root',
          project: 'thoth-mem',
          cwd: 'C:/Codex Projects/thoth mem',
        },
        nativeEventId: 'codex-message-1',
        hostTimestamp: '2026-07-09T12:00:00.000Z',
        content: 'Capture only verified root intent.',
        nativeEvent: 'UserPromptSubmit',
      },
    });

    const incomplete = normalizeCodexEvent({
      hook: 'PreCompact',
      payload: { session_id: 'codex-root', sequence: 3 },
    }, capabilities);
    expect(incomplete).toMatchObject({
      action: 'dispatch',
      event: { intent: 'compact_session', hostSequence: '3' },
    });

    const missingRole = normalizeCodexEvent({
      hook: 'UserPromptSubmit',
      payload: { session_id: 'codex-root', prompt: 'DO-NOT-ECHO' },
    }, capabilities);
    expect(missingRole).toMatchObject({ action: 'return', outcome: 'degraded', retryable: false });
    expect(JSON.stringify(missingRole)).not.toContain('DO-NOT-ECHO');

    const unsupported = normalizeCodexEvent({ hook: 'FutureTerminalEvent', payload: {} }, capabilities);
    expect(unsupported).toMatchObject({ action: 'return', outcome: 'no_op', retryable: false });
    expect(JSON.stringify(unsupported)).not.toContain('confirmed');
  });
});

describe('Claude Code adapter', () => {
  it('maps the exact five capabilities to documented root hooks', async () => {
    const adapter = await importRequiredModule('src/integration/adapters/claude-code.ts');
    const createClaudeCodeCapabilities = adapter.createClaudeCodeCapabilities as (input?: unknown) => Record<string, any>;
    const capabilities = createClaudeCodeCapabilities();

    expectExactCapabilityKeys(capabilities);
    expect(capabilities).toEqual({
      enroll_session: { state: 'supported', trigger: 'SessionStart' },
      capture_root_prompt: { state: 'supported', trigger: 'UserPromptSubmit' },
      recall_guidance: { state: 'supported', trigger: 'SessionStart' },
      compact_session: { state: 'supported', trigger: 'PreCompact' },
      finalize_session: { state: 'supported', trigger: 'Stop' },
    });

    const partial = createClaudeCodeCapabilities({ availableHooks: ['SessionStart', 'UserPromptSubmit'] });
    expect(partial.compact_session.state).toBe('unsupported');
    expect(partial.finalize_session.state).toBe('unsupported');
  });

  it('normalizes SessionStart, UserPromptSubmit, compact, and Stop while excluding SubagentStop', async () => {
    const adapter = await importRequiredModule('src/integration/adapters/claude-code.ts');
    const normalizeClaudeCodeEvent = adapter.normalizeClaudeCodeEvent as (input: unknown, capabilities?: unknown) => any;

    expect(normalizeClaudeCodeEvent({
      hook: 'SessionStart',
      payload: {
        session_id: 'claude-root',
        project: 'thoth-mem',
        cwd: '/workspace/Claude Projects/thoth mem',
        source: 'resume',
        hook_event_id: 'claude-start-1',
      },
    })).toMatchObject({
      action: 'dispatch',
      event: {
        harness: 'claude',
        intent: 'enroll_session',
        actor: 'system',
        isRootSession: true,
        identity: { sessionId: 'claude-root', project: 'thoth-mem' },
        nativeEventId: 'claude-start-1',
        nativeEvent: 'SessionStart',
      },
    });

    expect(normalizeClaudeCodeEvent({
      hook: 'UserPromptSubmit',
      payload: {
        session_id: 'claude-root',
        project: 'thoth-mem',
        prompt: 'Claude root intent.',
        hook_event_id: 'claude-prompt-1',
      },
    })).toMatchObject({
      action: 'dispatch',
      event: {
        intent: 'capture_root_prompt',
        actor: 'root_user',
        content: 'Claude root intent.',
      },
    });

    expect(normalizeClaudeCodeEvent({
      hook: 'PreCompact',
      payload: { session_id: 'claude-root', project: 'thoth-mem', trigger: 'auto', sequence: 4 },
    })).toMatchObject({
      action: 'dispatch',
      event: { intent: 'compact_session', hostSequence: '4', nativeEvent: 'PreCompact' },
    });

    expect(normalizeClaudeCodeEvent({
      hook: 'SessionStart',
      payload: { session_id: 'claude-root', project: 'thoth-mem', source: 'compact', sequence: 5 },
    })).toMatchObject({
      action: 'dispatch',
      event: { intent: 'recall_guidance', hostSequence: '5' },
    });

    expect(normalizeClaudeCodeEvent({
      hook: 'Stop',
      payload: { session_id: 'claude-root', project: 'thoth-mem', hook_event_id: 'claude-stop-1' },
    })).toMatchObject({
      action: 'dispatch',
      event: { intent: 'finalize_session', nativeEvent: 'Stop' },
    });

    const subagentStop = normalizeClaudeCodeEvent({
      hook: 'SubagentStop',
      payload: { session_id: 'child', parent_session_id: 'claude-root' },
    });
    expect(subagentStop).toMatchObject({ action: 'return', outcome: 'no_op', retryable: false });
    expect(JSON.stringify(subagentStop)).not.toContain('confirmed');

    const delegatedPrompt = normalizeClaudeCodeEvent({
      hook: 'UserPromptSubmit',
      payload: {
        session_id: 'child',
        parent_session_id: 'claude-root',
        prompt: 'GENERATED-HANDOFF',
      },
    });
    expect(delegatedPrompt).toMatchObject({ action: 'return', outcome: 'no_op', retryable: false });
    expect(JSON.stringify(delegatedPrompt)).not.toContain('GENERATED-HANDOFF');
  });
});

describe('packaged OpenCode plugin asset', () => {
  it('loads from a copied installation and emits only the shared JSON protocol', async () => {
    const pluginPath = join(repositoryRoot, 'integrations/opencode/plugin.mjs');
    const protocolPath = join(repositoryRoot, 'integrations/opencode/memory-protocol.md');
    const runnerPath = join(repositoryRoot, 'integrations/shared/hook-runner.mjs');
    expect(existsSync(pluginPath), 'integrations/opencode/plugin.mjs must exist').toBe(true);
    expect(existsSync(protocolPath), 'integrations/opencode/memory-protocol.md must exist').toBe(true);
    expect(existsSync(runnerPath), 'integrations/shared/hook-runner.mjs must exist').toBe(true);

    const tempRoot = mkdtempSync(join(tmpdir(), 'thoth installed asset '));
    const copiedIntegrations = join(tempRoot, 'package root with spaces', 'integrations');
    cpSync(join(repositoryRoot, 'integrations'), copiedIntegrations, { recursive: true });

    try {
      const copiedPlugin = join(copiedIntegrations, 'opencode', 'plugin.mjs');
      const module = await import(`${pathToFileURL(copiedPlugin).href}?test=${randomUUID()}`);
      const emitted: unknown[] = [];
      const createOpenCodePlugin = module.createOpenCodePlugin as (options: unknown) => (context: unknown) => Promise<any>;
      const plugin = createOpenCodePlugin({
        dispatch: async (request: unknown) => {
          emitted.push(request);
          return { protocolVersion: 1, outcome: 'no_op', retryable: false };
        },
      });
      const hooks = await plugin({ directory: '/unrelated working directory', project: 'thoth-mem' });

      await hooks.event({
        event: {
          type: 'session.created',
          properties: { info: { id: 'root-session' } },
        },
      });
      await hooks['chat.message'](
        { sessionID: 'root-session' },
        { message: { role: 'user' }, parts: [{ type: 'text', text: 'Root prompt' }] },
      );
      await hooks['experimental.session.compacting'](
        { sessionID: 'root-session' },
        { context: [] },
      );
      await hooks.event({
        event: {
          type: 'session.deleted',
          properties: { info: { id: 'root-session' } },
        },
      });

      expect(emitted).toHaveLength(3);
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({ protocolVersion: 1, harness: 'opencode' }),
      ]));
      expect(emitted.map((entry: any) => entry.event.type)).toEqual([
        'session.created',
        'chat.message',
        'experimental.session.compacting',
      ]);
      for (const entry of emitted as any[]) {
        expect(entry).toMatchObject({
          protocolVersion: 1,
          harness: 'opencode',
          capabilityEvidence: {
            verifiedEvents: [
              'session.created',
              'chat.message',
              'experimental.chat.system.transform',
              'experimental.session.compacting',
            ],
          },
          context: {
            project: 'thoth-mem',
            directory: '/unrelated working directory',
          },
        });
        expect(entry.event).not.toHaveProperty('intent');
        expect(entry.event).not.toHaveProperty('outcome');
      }

      const systemOutput = { system: [] as string[] };
      await hooks['experimental.chat.system.transform'](
        { sessionID: 'root-session' },
        systemOutput,
      );
      expect(systemOutput.system.join('\n')).toContain('mem_recall');
      expect(systemOutput.system.join('\n')).toContain('mem_session');
      expect(systemOutput.system.join('\n')).not.toContain('mem_search');
      expect(systemOutput.system.join('\n')).not.toContain('http://');

      const pluginSource = readFileSync(copiedPlugin, 'utf8');
      expect(pluginSource).not.toContain('MemoryIntegrationCore');
      expect(pluginSource).not.toContain('mem_save(');
      expect(pluginSource).not.toContain('fetch(');
      expect(pluginSource).not.toContain('http://');
      expect(pluginSource).not.toContain('shell:');
      expect(dirname(copiedPlugin)).not.toBe(process.cwd());
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
