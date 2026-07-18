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
    import type { AdapterCapabilities } from '../../src/integration/core/types.js';
    import * as adapterShared from '../../src/integration/adapters/shared.js';
    import { resolveRuntimeCapabilityEvidence } from '../../src/integration/runtime/capability-evidence.js';
    import {
      HOST_EVIDENCE,
      type CapabilityEvidence,
      type HostEvidence,
      type HostHarness,
    } from '../fixtures/integration/host-evidence.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

async function importRequiredModule(relativePath: string): Promise<Record<string, unknown>> {
  const absolutePath = join(repositoryRoot, relativePath);
  expect(existsSync(absolutePath), `${relativePath} must exist`).toBe(true);
  return import(`${pathToFileURL(absolutePath).href}?test=${randomUUID()}`);
}

function claimFor(
      evidence: HostEvidence,
      eventMapping: CapabilityEvidence = evidence.activation,
      deliveryMapping: CapabilityEvidence = evidence.recovery,
    ): Record<string, unknown> {
      return {
        hostVersion: evidence.versionFamily,
        payloadMappingId: evidence.payloadMappingId,
        assetExecutionMarker: evidence.activationMarker,
        eventMappingId: eventMapping.mappingId,
        deliveryChannel: deliveryMapping.channel,
        deliveryMappingId: deliveryMapping.mappingId,
      };
    }

    function runtimeHarness(harness: HostHarness): 'opencode' | 'codex' | 'claude' {
      return harness === 'claude-code' ? 'claude' : harness;
    }

    function resolvedCapabilities(
      evidence: HostEvidence,
      eventMapping: CapabilityEvidence = evidence.activation,
      deliveryMapping: CapabilityEvidence = evidence.recovery,
    ): any {
      const resolution = resolveRuntimeCapabilityEvidence(
        runtimeHarness(evidence.harness),
        claimFor(evidence, eventMapping, deliveryMapping),
      );
      if (resolution.status !== 'supported') {
        throw new Error('Expected fixture claim to resolve for ' + evidence.harness);
      }
      return resolution;
    }

    function resolvedOpenCodeNormalCapabilities(
      eventMappingId: string,
      deliveryMappingId: string,
    ): any {
      const evidence = HOST_EVIDENCE.find((entry) => entry.harness === 'opencode');
      if (!evidence) throw new Error('Expected OpenCode evidence');
      const resolution = resolveRuntimeCapabilityEvidence('opencode', {
        hostVersion: evidence.versionFamily,
        payloadMappingId: evidence.payloadMappingId,
        assetExecutionMarker: evidence.activationMarker,
        eventMappingId,
        deliveryChannel: 'none',
        deliveryMappingId,
      });
      if (resolution.status !== 'supported') throw new Error('Expected supported OpenCode normal mapping');
      return resolution;
    }

    function resolvedOpenCodePromptCapabilities(): any {
      return resolvedOpenCodeNormalCapabilities(
        'opencode-user-prompt-v1',
        'opencode-user-prompt-side-effect-v1',
      );
    }

    describe('resolver authority API', () => {
      it('exposes no adapter resolver, registrar, or mint from shared', () => {
        expect(adapterShared).not.toHaveProperty('resolveAdapterCapabilities');
        expect(Object.keys(adapterShared).join(',')).not.toMatch(/registrar|mint|resolverproduced/i);
      });

      it('does not let an arbitrary supported matrix become acceptable through an exported function', async () => {
        const openCode = await importRequiredModule('src/integration/adapters/opencode.ts');
        const handcrafted = {
          enroll_session: { state: 'supported', trigger: 'session.created' },
          capture_root_prompt: { state: 'supported', trigger: 'chat.message' },
          recall_guidance: { state: 'supported', trigger: 'experimental.chat.system.transform' },
          compact_session: { state: 'supported', trigger: 'experimental.session.compacting' },
          finalize_session: { state: 'supported', trigger: 'SessionEnd' },
        } as unknown as AdapterCapabilities;
        expect(() => (openCode.normalizeOpenCodeEvent as (input: unknown, caps: AdapterCapabilities) => unknown)(
          { event: { type: 'session.created', properties: { info: { id: 'root' } } } },
          handcrafted,
        )).toThrow(/resolver-produced.*opencode/i);
      });

      it('rejects a valid Claude resolver matrix at OpenCode and Codex boundaries', async () => {
        const [openCode, codex] = await Promise.all([
          importRequiredModule('src/integration/adapters/opencode.ts'),
          importRequiredModule('src/integration/adapters/codex.ts'),
        ]);
        const claudeEvidence = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
        if (!claudeEvidence) throw new Error('Expected Claude evidence');
        const claude = resolvedCapabilities(claudeEvidence);

        expect(() => (openCode.normalizeOpenCodeEvent as (input: unknown, caps: unknown) => unknown)(
          { event: { type: 'session.created', properties: { info: { id: 'root' } } } },
          claude.adapterCapabilities,
        )).toThrow(/opencode/i);
        expect(() => (codex.normalizeCodexEvent as (input: unknown, caps: unknown) => unknown)(
          { hook: 'SessionStart', payload: { session_id: 'root' } },
          claude.adapterCapabilities,
        )).toThrow(/codex/i);
      });

      it('returns distinct deeply frozen final adapter and runtime matrices for identical claims', () => {
        const evidence = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
        if (!evidence) throw new Error('Expected Claude evidence');
        const first = resolvedCapabilities(evidence);
        const later = resolvedCapabilities(evidence);

        expect(first.adapterCapabilities).not.toBe(later.adapterCapabilities);
        expect(first.runtimeCapabilities).not.toBe(later.runtimeCapabilities);
        expect(Object.isFrozen(first.adapterCapabilities)).toBe(true);
        expect(Object.isFrozen(first.runtimeCapabilities)).toBe(true);
        expect(Object.isFrozen(first.runtimeCapabilities.activation)).toBe(true);
      });

      it('normalizes each verified native root-session identity without sharing a native field name', async () => {
        const [openCode, codex, claude] = await Promise.all([
          importRequiredModule('src/integration/adapters/opencode.ts'),
          importRequiredModule('src/integration/adapters/codex.ts'),
          importRequiredModule('src/integration/adapters/claude-code.ts'),
        ]);
        const openCodeEvidence = HOST_EVIDENCE.find((entry) => entry.harness === 'opencode');
        const codexEvidence = HOST_EVIDENCE.find((entry) => entry.harness === 'codex');
        const claudeEvidence = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
        if (!openCodeEvidence || !codexEvidence || !claudeEvidence) throw new Error('Expected host evidence');

        const normalized = [
          (openCode.normalizeOpenCodeEvent as (input: unknown, caps: unknown) => any)(
            {
              event: { type: 'session.created', properties: { info: { id: 'opencode-root' } } },
              context: { project: 'identity-project' },
            },
            resolvedOpenCodeNormalCapabilities(
              'opencode-session-created-v1',
              'opencode-session-side-effect-v1',
            ).adapterCapabilities,
          ),
          (codex.normalizeCodexEvent as (input: unknown, caps: unknown) => any)(
            { hook: 'SessionStart', payload: { session_id: 'codex-root', source: 'startup' } },
            resolvedCapabilities(codexEvidence).adapterCapabilities,
          ),
          (claude.normalizeClaudeCodeEvent as (input: unknown, caps: unknown) => any)(
            { hook: 'SessionStart', payload: { session_id: 'claude-root', source: 'startup' } },
            resolvedCapabilities(claudeEvidence).adapterCapabilities,
          ),
        ];

        expect(normalized.map((result) => result.event.identity.sessionId)).toEqual([
          'opencode-root',
          'codex-root',
          'claude-root',
        ]);
        for (const result of normalized) {
          expect(result).toMatchObject({ action: 'dispatch', event: { isRootSession: true } });
          expect(result.event.identity).not.toHaveProperty('rootId');
        }
      });

      it('normalizes Codex and Claude compact starts as gated recall guidance while ordinary starts remain enrollment', async () => {
        const [openCode, codex, claude] = await Promise.all([
          importRequiredModule('src/integration/adapters/opencode.ts'),
          importRequiredModule('src/integration/adapters/codex.ts'),
          importRequiredModule('src/integration/adapters/claude-code.ts'),
        ]);
        const openCodeEvidence = HOST_EVIDENCE.find((entry) => entry.harness === 'opencode');
        const codexEvidence = HOST_EVIDENCE.find((entry) => entry.harness === 'codex');
        const claudeEvidence = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
        if (!openCodeEvidence || !codexEvidence || !claudeEvidence) throw new Error('Expected host evidence');

        expect((openCode.normalizeOpenCodeEvent as (input: unknown, caps: unknown) => any)(
          { event: { type: 'session.created', properties: { info: { id: 'root' } } } },
          resolvedOpenCodeNormalCapabilities(
            'opencode-session-created-v1',
            'opencode-session-side-effect-v1',
          ).adapterCapabilities,
        )).toMatchObject({ action: 'dispatch', event: { intent: 'enroll_session' } });
        expect((codex.normalizeCodexEvent as (input: unknown, caps: unknown) => any)(
          { hook: 'SessionStart', payload: { session_id: 'root' } },
          resolvedCapabilities(codexEvidence).adapterCapabilities,
        )).toMatchObject({ action: 'dispatch', event: { intent: 'enroll_session' } });
        expect((codex.normalizeCodexEvent as (input: unknown, caps: unknown) => any)(
              {
                hook: 'SessionStart',
                payload: {
                  session_id: 'root',
                  source: 'compact',
                  transcript_path: '/private/transcript.jsonl',
                },
              },
              resolvedCapabilities(codexEvidence).adapterCapabilities,
            )).toMatchObject({
              action: 'dispatch',
              event: {
                intent: 'recall_guidance',
                compactionGate: { phase: 'resume' },
              },
            });
            expect((claude.normalizeClaudeCodeEvent as (input: unknown, caps: unknown) => any)(
              {
                hook: 'SessionStart',
                payload: {
                  session_id: 'root',
                  source: 'compact',
                  transcript_path: '/private/transcript.jsonl',
                },
              },
              resolvedCapabilities(claudeEvidence).adapterCapabilities,
            )).toMatchObject({
              action: 'dispatch',
              event: { intent: 'recall_guidance', compactionGate: { phase: 'resume' } },
            });
            expect((claude.normalizeClaudeCodeEvent as (input: unknown, caps: unknown) => any)(
              { hook: 'SessionStart', payload: { session_id: 'root', source: 'startup' } },
              resolvedCapabilities(claudeEvidence).adapterCapabilities,
            )).toMatchObject({ action: 'dispatch', event: { intent: 'enroll_session' } });
        expect((claude.normalizeClaudeCodeEvent as (input: unknown, caps: unknown) => any)(
          { hook: 'SessionEnd', payload: { session_id: 'root' } },
          resolvedCapabilities(claudeEvidence).adapterCapabilities,
        )).toMatchObject({ action: 'return', outcome: 'no_op' });
        expect((claude.normalizeClaudeCodeEvent as (input: unknown, caps: unknown) => any)(
          { hook: 'Stop', payload: { session_id: 'root' } },
          resolvedCapabilities(claudeEvidence).adapterCapabilities,
        )).toMatchObject({ action: 'return', outcome: 'no_op' });
      });

      it('normalizes only trusted root OpenCode text parts and never falls back to summaries', async () => {
        const openCode = await importRequiredModule('src/integration/adapters/opencode.ts');
        const capabilities = resolvedOpenCodePromptCapabilities().adapterCapabilities;
        const normalize = openCode.normalizeOpenCodeEvent as (input: unknown, caps: unknown) => any;
        const event = {
          type: 'chat.message',
          id: 'message-1',
          input: { sessionID: 'root-session', messageID: 'message-1', rootSession: true },
          output: {
            message: {
              id: 'message-1',
              sessionID: 'root-session',
              role: 'user',
              summary: { title: 'DERIVED SUMMARY', body: 'MUST NOT PERSIST' },
            },
            parts: [
              { id: 'part-1', sessionID: 'root-session', messageID: 'message-1', type: 'text', text: 'hazlo' },
              { id: 'part-2', sessionID: 'root-session', messageID: 'message-1', type: 'text', text: 'SYNTHETIC', synthetic: true },
              { id: 'part-3', sessionID: 'root-session', messageID: 'message-1', type: 'text', text: 'IGNORED', ignored: true },
              { id: 'part-4', sessionID: 'root-session', messageID: 'other-message', type: 'text', text: 'MISMATCHED' },
            ],
          },
        };

        expect(normalize({ event, context: { project: 'thoth-mem', directory: '/workspace/thoth-mem' } }, capabilities))
          .toMatchObject({
            action: 'dispatch',
            event: {
              intent: 'capture_root_prompt',
              actor: 'root_user',
              isRootSession: true,
              nativeEventId: 'message-1',
              content: 'hazlo',
            },
          });
        expect(normalize({
          event: {
            ...event,
            input: { sessionID: 'root-session', messageID: 'message-1' },
          },
        }, capabilities)).toMatchObject({ action: 'return', outcome: 'degraded' });
        expect(normalize({
          event: {
            ...event,
            output: {
              message: event.output.message,
              parts: [],
            },
          },
        }, capabilities)).toMatchObject({ action: 'return', outcome: 'degraded' });
      });
      it('maps only resolver-proven Claude SubagentStop output to passive learning without finalizing the root session', async () => {
        const claude = await importRequiredModule('src/integration/adapters/claude-code.ts');
        const evidence = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
        if (!evidence) throw new Error('Expected Claude evidence');
        const passiveResolution = resolvedCapabilities(evidence, evidence.passiveLearning, evidence.passiveLearning);
        const nonPassiveResolution = resolvedCapabilities(evidence);
        const input = {
          hook: 'SubagentStop',
          id: 'claude-subagent-stop-stable-id',
          payload: {
            session_id: 'root-session',
            cwd: '/workspace/thoth-mem',
            hook_event_name: 'SubagentStop',
            permission_mode: 'default',
            prompt_id: '123e4567-e89b-42d3-a456-426614174000',
            effort: { level: 'high' },
            background_tasks: [{ id: 'task-1', description: 'ADAPTER-OPTIONAL-DESCRIPTION', command: 'ADAPTER-OPTIONAL-COMMAND' }],
            session_crons: [{ id: 'cron-1', schedule: 'ADAPTER-OPTIONAL-SCHEDULE', recurring: true, prompt: 'ADAPTER-OPTIONAL-PROMPT' }],
            stop_hook_active: false,
            agent_id: 'agent-42',
            agent_type: 'Explore',
            transcript_path: '/tmp/root.jsonl',
            agent_transcript_path: '/tmp/agent.jsonl',
            last_assistant_message: 'A reusable implementation insight.',
          },
        };
        const normalize = claude.normalizeClaudeCodeEvent as (...args: unknown[]) => any;

        expect(normalize(input, passiveResolution.adapterCapabilities, passiveResolution)).toMatchObject({
          action: 'dispatch',
          event: {
            intent: 'capture_passive_learning',
            actor: 'subagent',
            isRootSession: true,
            nativeEventId: 'claude-subagent-stop-stable-id',
            content: 'A reusable implementation insight.',
            nativeEvent: 'SubagentStop',
            passiveLearningEvidence: {
              terminalMappingId: 'claude-subagent-stop-passive-v1',
              verifiedTerminalOutput: true,
            },
          },
        });
        const projected = normalize(input, passiveResolution.adapterCapabilities, passiveResolution);
        for (const secret of ['123e4567-e89b-42d3-a456-426614174000', 'ADAPTER-OPTIONAL-DESCRIPTION', 'ADAPTER-OPTIONAL-COMMAND', 'ADAPTER-OPTIONAL-SCHEDULE', 'ADAPTER-OPTIONAL-PROMPT']) {
          expect(JSON.stringify(projected)).not.toContain(secret);
        }
        expect(normalize(input, nonPassiveResolution.adapterCapabilities, nonPassiveResolution)).toMatchObject({
          action: 'return',
          outcome: 'degraded',
          intent: 'capture_passive_learning',
        });
        expect(normalize({
          ...input,
          payload: { ...input.payload, stop_hook_active: true },
        }, passiveResolution.adapterCapabilities, passiveResolution)).toMatchObject({
          action: 'return',
          outcome: 'degraded',
          intent: 'capture_passive_learning',
        });
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
          if ((request as { operation?: string }).operation === 'prepare_delivery') {
            const eventType = (request as { event?: { type?: string } }).event?.type;
            const compacting = eventType === 'experimental.session.compacting';
            return {
              protocolVersion: 1,
              operation: 'prepare_delivery',
              outcome: 'confirmed',
              retryable: false,
              deliveryAttempt: `${Buffer.from('{"version":1}').toString('base64url')}.${'a'.repeat(64)}`,
              hostOutputDirective: {
                purpose: compacting ? 'post_compaction_guidance' : 'recovery_context',
                text: 'Recovered copied-install context.',
                deliveryMappingId: compacting
                  ? 'opencode-compaction-v1'
                  : 'opencode-recovery-injection-v1',
              },
            };
          }
          if ((request as { operation?: string }).operation === 'confirm_delivery') {
            return { protocolVersion: 1, operation: 'confirm_delivery', outcome: 'confirmed', retryable: false };
          }
          const eventType = (request as { event?: { type?: string } }).event?.type;
          return {
            protocolVersion: 1,
            harness: 'opencode',
            intent: eventType === 'session.created' ? 'enroll_session' : 'capture_root_prompt',
            outcome: 'confirmed',
            retryable: false,
          };
        },
      });
      const hooks = await plugin({
        directory: '/unrelated working directory',
        project: { id: 'project-1', worktree: '/workspace/thoth-mem' },
        client: {
          app: { log: async () => undefined },
          session: {
            get: async () => ({ data: { id: 'root-session' } }),
          },
        },
      });

      await hooks.event({
        event: {
          type: 'session.created',
          id: 'session-created-event',
          properties: { info: { id: 'root-session' } },
        },
      });
      await hooks['chat.message'](
        { sessionID: 'root-session', messageID: 'message-1' },
        {
          message: { id: 'message-1', sessionID: 'root-session', role: 'user' },
          parts: [{
            id: 'part-1',
            sessionID: 'root-session',
            messageID: 'message-1',
            type: 'text',
            text: 'Root prompt',
          }],
        },
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

      expect(emitted).toHaveLength(4);
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({ protocolVersion: 1, harness: 'opencode' }),
      ]));
      expect(emitted.filter((entry: any) => !entry.operation).map((entry: any) => entry.event.type)).toEqual([
        'session.created',
        'chat.message',
      ]);
      expect(emitted.filter((entry: any) => entry.operation).map((entry: any) => entry.operation)).toEqual([
        'prepare_delivery',
        'confirm_delivery',
      ]);
      for (const entry of emitted as any[]) {
        expect(entry).toMatchObject({
          protocolVersion: 1,
          harness: 'opencode',
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
        { sessionID: 'root-session', model: { providerID: 'openai', modelID: 'gpt-5.6-terra' } },
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
