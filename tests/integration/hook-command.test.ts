import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HOST_EVIDENCE } from '../fixtures/integration/host-evidence.js';
        import { assertResolverProducedAdapterCapabilities } from '../../src/integration/runtime/capability-evidence.js';
    import { MemoryIntegrationCore } from '../../src/integration/core/lifecycle.js';
    import type { MemoryPort } from '../../src/integration/core/memory-port.js';
    import { FileLifecycleStateStore } from '../../src/integration/core/state-store.js';
    import type {
      AdapterCapabilities,
      LifecycleResult,
      NormalizedEvent,
    } from '../../src/integration/core/types.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const runtimeModulePath = join(repositoryRoot, 'src/integration/runtime/hook-command.ts');
const integrationEventModulePath = join(
  repositoryRoot,
  'src/integration/runtime/integration-event-command.ts',
);
const canonicalRunnerPath = join(repositoryRoot, 'integrations/shared/hook-runner.mjs');
const packageVersion = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')).version as string;

function claudeRuntimeClaim(): Record<string, unknown> {
  const evidence = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
  if (!evidence) {
    throw new Error('Expected standalone Claude Code host evidence');
  }
  return {
    hostVersion: evidence.versionFamily,
    payloadMappingId: evidence.payloadMappingId,
    assetExecutionMarker: evidence.activationMarker,
    eventMappingId: evidence.activation.mappingId,
    deliveryChannel: evidence.recovery.channel,
    deliveryMappingId: evidence.recovery.mappingId,
  };
}
async function importHookCommand(): Promise<Record<string, unknown>> {
  expect(existsSync(runtimeModulePath), 'src/integration/runtime/hook-command.ts must exist').toBe(true);
  return import(`${pathToFileURL(runtimeModulePath).href}?test=${randomUUID()}`);
}

async function importIntegrationEventCommand(): Promise<Record<string, unknown>> {
  expect(
    existsSync(integrationEventModulePath),
    'src/integration/runtime/integration-event-command.ts must exist',
  ).toBe(true);
  return import(`${pathToFileURL(integrationEventModulePath).href}?test=${randomUUID()}`);
}

function fakeRuntimeSource(label: string): string {
  return `import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify({
  protocolVersion: 1,
  outcome: 'confirmed',
  retryable: false,
  label: ${JSON.stringify(label)},
  argv: process.argv.slice(2),
  input,
}));
`;
}

function writeFakeRuntime(path: string, label: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, fakeRuntimeSource(label), 'utf8');
  chmodSync(path, 0o755);
}

function runRunner(
  runnerPath: string,
  input: unknown,
  options: { env?: NodeJS.ProcessEnv; cwd?: string; args?: string[] } = {},
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [runnerPath, ...(options.args ?? [])], {
    cwd: options.cwd,
    env: options.env,
    input: JSON.stringify(input),
    encoding: 'utf8',
    shell: false,
    timeout: 5_000,
  });
}

function parseRunnerOutput(result: SpawnSyncReturns<string>): any {
  expect(result.error).toBeUndefined();
  expect(result.stdout).not.toBe('');
  return JSON.parse(result.stdout);
}

function readJsonFixture(relativePath: string): Record<string, any> {
  const content = readFileSync(join(repositoryRoot, relativePath), 'utf8');
  return JSON.parse(content) as Record<string, any>;
}

describe('portable JSON hook command', () => {
  it('normalizes an evidence-backed session start and delegates lifecycle execution', async () => {
    const runtime = await importHookCommand();
    const executeHookCommand = runtime.executeHookCommand as (
      input: string,
      executor: (event: unknown, capabilities: unknown) => Promise<any>,
    ) => Promise<any>;
    const calls: Array<{ event: any; capabilities: any }> = [];

    const response = await executeHookCommand(JSON.stringify({
      protocolVersion: 1,
      harness: 'claude',
      capabilityEvidence: claudeRuntimeClaim(),
      event: {
        hook: 'SessionStart',
        payload: {
          session_id: 'root-session',
          project: 'thoth-mem',
          source: 'startup',
          hook_event_id: 'start-1',
        },
      },
    }), async (event, capabilities) => {
      assertResolverProducedAdapterCapabilities(capabilities, 'claude');
          expect(Object.isFrozen(capabilities)).toBe(true);
          calls.push({ event, capabilities });
      return {
        outcome: 'confirmed',
        retryable: false,
        harness: 'claude',
        intent: 'enroll_session',
      };
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].event).toMatchObject({
      harness: 'claude',
      intent: 'enroll_session',
      actor: 'system',
    });
    expect(Object.keys(calls[0].capabilities)).toEqual([
      'enroll_session',
      'capture_root_prompt',
      'recall_guidance',
      'compact_session',
      'finalize_session',
    ]);
    expect(response).toEqual({
      protocolVersion: 1,
      harness: 'claude',
      intent: 'enroll_session',
      outcome: 'confirmed',
      retryable: false,
    });

    const unknownCodex = await executeHookCommand(JSON.stringify({
      protocolVersion: 1,
      harness: 'codex',
      event: { hook: 'Stop', payload: { session_id: 'root-session' } },
    }), async () => {
      throw new Error('must not execute');
    });
    expect(unknownCodex).toMatchObject({
      protocolVersion: 1,
      harness: 'codex',
      outcome: 'degraded',
      retryable: false,
    });
    expect(JSON.stringify(unknownCodex)).not.toContain('confirmed');
  });
  it('resolves bounded runtime claims before adapter execution and fails closed otherwise', async () => {
    const runtime = await importHookCommand();
    const executeHookCommand = runtime.executeHookCommand as (
      input: string,
      executor: (event: Record<string, unknown>, capabilities: Record<string, unknown>) => Promise<any>,
    ) => Promise<any>;
    const evidence = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
    if (!evidence) {
      throw new Error('Expected standalone Claude Code host evidence');
    }
    const claim = {
      hostVersion: evidence.versionFamily,
      payloadMappingId: evidence.payloadMappingId,
      assetExecutionMarker: evidence.activationMarker,
      eventMappingId: evidence.activation.mappingId,
      deliveryChannel: evidence.recovery.channel,
      deliveryMappingId: evidence.recovery.mappingId,
    };
    const request = (capabilityEvidence?: Record<string, unknown>) => JSON.stringify({
      protocolVersion: 1,
      harness: 'claude',
      ...(capabilityEvidence === undefined ? {} : { capabilityEvidence }),
      event: {
        hook: 'SessionStart',
        payload: { session_id: 'resolver-session', source: 'startup' },
      },
    });
    let rejectedExecutorCalls = 0;

    for (const [name, capabilityEvidence] of [
      ['omitted evidence', undefined],
      ['raw payload', { ...claim, rawPayload: 'SECRET-RAW-PAYLOAD' }],
      ['self-asserted supported', { ...claim, supported: true }],
      ['self-asserted verified events', { ...claim, verifiedEvents: ['SessionStart'] }],
      [
        'overlapping compaction mapping',
        {
          ...claim,
          deliveryChannel: evidence.compaction.channel,
          deliveryMappingId: evidence.compaction.mappingId,
        },
      ],
      ['unknown version', { ...claim, hostVersion: 'unknown-runtime-version' }],
      ['mismatched payload', { ...claim, payloadMappingId: 'claude-code-other-payload-v1' }],
    ] as const) {
      const result = await executeHookCommand(request(capabilityEvidence), async () => {
        rejectedExecutorCalls += 1;
        throw new Error('must not execute');
      });
      expect(result, name).toMatchObject({ outcome: 'degraded', retryable: false });
      expect(JSON.stringify(result), name).not.toContain('SECRET-RAW-PAYLOAD');
    }
    expect(rejectedExecutorCalls).toBe(0);

    let confirmedExecutorCalls = 0;
    const confirmed = await executeHookCommand(request(claim), async (event, capabilities) => {
      confirmedExecutorCalls += 1;
      expect(event).toMatchObject({ harness: 'claude', intent: 'enroll_session' });
      expect(capabilities.enroll_session).toMatchObject({ state: 'supported' });
      return {
        outcome: 'confirmed',
        retryable: false,
        harness: 'claude',
        intent: 'enroll_session',
      };
    });
    expect(confirmed).toMatchObject({ outcome: 'confirmed', retryable: false });
    expect(confirmedExecutorCalls).toBe(1);  });

  it('finalizes a verified Claude SessionEnd once through the real core and rejects Stop', async () => {
        const runtime = await importHookCommand();
        const evidence = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
        if (!evidence) {
          throw new Error('Expected standalone Claude Code host evidence');
        }
        const dataDir = mkdtempSync(join(tmpdir(), 'thoth-claude-session-end-'));
        const calls: Array<{ tool: string; input: Record<string, unknown> }> = [];
        const memoryPort: MemoryPort = {
          async call(tool, input) {
            calls.push({ tool, input });
            return { confirmed: true, isError: false, text: 'Session summary saved.' };
          },
          async close() {},
        };
        const stateStore = new FileLifecycleStateStore({
          dataDir,
          harness: 'claude',
          projectId: 'claude-terminal-project',
          rootSessionId: 'claude-terminal-session',
          capabilities: {
            enroll_session: { state: 'unsupported' },
            capture_root_prompt: { state: 'unsupported' },
            recall_guidance: { state: 'unsupported' },
            compact_session: { state: 'unsupported' },
            finalize_session: { state: 'supported', trigger: 'SessionEnd' },
          },
        });
        let core: MemoryIntegrationCore | undefined;
        const executor = async (
          event: NormalizedEvent,
          capabilities: AdapterCapabilities,
        ): Promise<LifecycleResult> => {
          if (!core) {
            core = new MemoryIntegrationCore({ capabilities, memoryPort, stateStore });
          }
          return core.handle(event);
        };
        const executeHookCommand = runtime.executeHookCommand as (
          input: string,
          callback: typeof executor,
        ) => Promise<unknown>;
        const capabilityEvidence = {
          hostVersion: evidence.versionFamily,
          payloadMappingId: evidence.payloadMappingId,
          assetExecutionMarker: evidence.activationMarker,
          eventMappingId: evidence.terminal.mappingId,
          deliveryChannel: evidence.terminal.channel,
          deliveryMappingId: evidence.terminal.mappingId,
        };
        const request = (hook: 'SessionEnd' | 'Stop', eventId: string) => JSON.stringify({
          protocolVersion: 1,
          harness: 'claude',
          capabilityEvidence,
          event: {
            hook,
            payload: {
              session_id: 'claude-terminal-session',
              project: 'claude-terminal-project',
              summary: 'Verified terminal summary.',
              hook_event_id: eventId,
            },
          },
        });
        try {
          const first = await executeHookCommand(request('SessionEnd', 'claude-end-1'), executor);
          expect(first).toMatchObject({
            harness: 'claude',
            intent: 'finalize_session',
            outcome: 'confirmed',
            retryable: false,
          });
          expect(calls).toEqual([{
            tool: 'mem_session',
            input: {
              action: 'summary',
              id: 'claude-terminal-session',
              project: 'thoth-mem',
              content: 'Session finalized.',
            },
          }]);
          const duplicate = await executeHookCommand(request('SessionEnd', 'claude-end-1'), executor);
          expect(duplicate).toMatchObject({ outcome: 'no_op', retryable: false });
          expect(calls).toHaveLength(1);
          const stop = await executeHookCommand(request('Stop', 'claude-stop-1'), executor);
          expect(stop).toMatchObject({ harness: 'claude', outcome: 'no_op', retryable: false });
          expect(stop).not.toHaveProperty('intent');
          expect(calls).toHaveLength(1);
        } finally {
          rmSync(dataDir, { recursive: true, force: true });
        }
      });
      it('returns bounded privacy-safe errors for invalid JSON and executor failure', async () => {
    const runtime = await importHookCommand();
    const executeHookCommand = runtime.executeHookCommand as (input: string, executor: (...args: any[]) => Promise<any>) => Promise<any>;

    const invalid = await executeHookCommand(
      '{"secret":"DO-NOT-ECHO"',
      async (): Promise<any> => ({}),
    );
    expect(invalid).toMatchObject({ protocolVersion: 1, outcome: 'degraded', retryable: false });
    expect(JSON.stringify(invalid)).not.toContain('DO-NOT-ECHO');
    expect(JSON.stringify(invalid).length).toBeLessThanOrEqual(1_000);

    let malformedEvidenceExecuted = false;
    const malformedEvidence = await executeHookCommand(JSON.stringify({
      protocolVersion: 1,
      harness: 'claude',
      capabilityEvidence: null,
      event: {
        hook: 'SessionStart',
        payload: { session_id: 'root-session', source: 'resume' },
      },
    }), async () => {
      malformedEvidenceExecuted = true;
      throw new Error('must not execute');
    });
    expect(malformedEvidence).toMatchObject({
      protocolVersion: 1,
      harness: 'claude',
      outcome: 'degraded',
      retryable: false,
    });
    expect(malformedEvidence.diagnostic).toContain('capability evidence');
    expect(malformedEvidenceExecuted).toBe(false);

    const failed = await executeHookCommand(JSON.stringify({
      protocolVersion: 1,
      harness: 'claude',
      capabilityEvidence: claudeRuntimeClaim(),
      event: {
        hook: 'SessionStart',
        payload: {
          session_id: 'root-session',
          source: 'startup',
          summary: 'PRIVATE-SUMMARY',
        },
      },
    }), async (): Promise<any> => {
      throw new Error('transport contains PRIVATE-SUMMARY');
    });    expect(failed).toMatchObject({
      protocolVersion: 1,
      harness: 'claude',
      intent: 'enroll_session',
      outcome: 'failed',
      retryable: true,
    });
    expect(JSON.stringify(failed)).not.toContain('PRIVATE-SUMMARY');
    expect(JSON.stringify(failed).length).toBeLessThanOrEqual(1_000);
  });

  it('fails closed for malformed capability evidence without invoking execution', async () => {
    const runtime = await importHookCommand();
    const executeHookCommand = runtime.executeHookCommand as (
      input: string,
      executor: (...args: any[]) => Promise<any>,
    ) => Promise<any>;
    const oversized = `SECRET-${'x'.repeat(700)}`;
    const malformedCases: Array<{
      name: string;
      harness: 'opencode' | 'codex' | 'claude';
      capabilityEvidence: unknown;
      event: unknown;
      context?: unknown;
    }> = [
      {
        name: 'OpenCode verifiedEvents object',
        harness: 'opencode',
        capabilityEvidence: { verifiedEvents: { secret: 'SECRET-NESTED' } },
        event: {
          type: 'session.created',
          properties: { info: { id: 'root-session' } },
        },
        context: { project: 'thoth-mem' },
      },
      {
        name: 'OpenCode verifiedEvents non-string entry',
        harness: 'opencode',
        capabilityEvidence: {
          verifiedEvents: ['session.created', { secret: 'SECRET-NON-STRING' }],
        },
        event: {
          type: 'session.created',
          properties: { info: { id: 'root-session' } },
        },
      },
      {
        name: 'OpenCode verifiedEvents oversized unknown event',
        harness: 'opencode',
        capabilityEvidence: { verifiedEvents: [oversized] },
        event: {
          type: 'session.created',
          properties: { info: { id: 'root-session' } },
        },
      },
      {
        name: 'OpenCode incompleteEvents non-array',
        harness: 'opencode',
        capabilityEvidence: { incompleteEvents: 'SECRET-NOT-ARRAY' },
        event: {
          type: 'session.created',
          properties: { info: { id: 'root-session' } },
        },
      },
      {
        name: 'Claude availableHooks non-array',
        harness: 'claude',
        capabilityEvidence: { availableHooks: 'SECRET-NOT-ARRAY' },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session', source: 'resume' },
        },
      },
      {
        name: 'Claude availableHooks non-string entry',
        harness: 'claude',
        capabilityEvidence: { availableHooks: [{ secret: 'SECRET-NON-STRING' }] },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session', source: 'resume' },
        },
      },
      {
        name: 'Claude availableHooks unknown hook',
        harness: 'claude',
        capabilityEvidence: { availableHooks: ['SECRET-FutureHook'] },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session', source: 'resume' },
        },
      },
      {
        name: 'Claude availableHooks oversized hook',
        harness: 'claude',
        capabilityEvidence: { availableHooks: [oversized] },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session', source: 'resume' },
        },
      },
      {
        name: 'Codex verifiedHooks non-object',
        harness: 'codex',
        capabilityEvidence: { verifiedHooks: 'SECRET-NOT-OBJECT' },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session' },
        },
      },
      {
        name: 'Codex verifiedHooks invalid key',
        harness: 'codex',
        capabilityEvidence: { verifiedHooks: { SECRET_future_intent: 'SessionStart' } },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session' },
        },
      },
      {
        name: 'Codex verifiedHooks non-string trigger',
        harness: 'codex',
        capabilityEvidence: { verifiedHooks: { enroll_session: { secret: 'SECRET-NON-STRING' } } },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session' },
        },
      },
      {
        name: 'Codex verifiedHooks unknown trigger',
        harness: 'codex',
        capabilityEvidence: { verifiedHooks: { enroll_session: 'SECRET-FutureStart' } },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session' },
        },
      },
      {
        name: 'Codex incompleteHooks non-object map',
        harness: 'codex',
        capabilityEvidence: { incompleteHooks: ['SECRET-NOT-OBJECT'] },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session' },
        },
      },
      {
        name: 'Codex incompleteHooks invalid key',
        harness: 'codex',
        capabilityEvidence: {
          incompleteHooks: {
            SECRET_future_intent: { trigger: 'SessionStart', reason: 'future' },
          },
        },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session' },
        },
      },
      {
        name: 'Codex incompleteHooks non-object entry',
        harness: 'codex',
        capabilityEvidence: { incompleteHooks: { enroll_session: 'SECRET-NOT-OBJECT' } },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session' },
        },
      },
      {
        name: 'Codex incompleteHooks non-string trigger',
        harness: 'codex',
        capabilityEvidence: {
          incompleteHooks: {
            enroll_session: { trigger: { secret: 'SECRET-NON-STRING' }, reason: 'partial' },
          },
        },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session' },
        },
      },
      {
        name: 'Codex incompleteHooks non-string reason',
        harness: 'codex',
        capabilityEvidence: {
          incompleteHooks: {
            enroll_session: { trigger: 'SessionStart', reason: { secret: 'SECRET-NON-STRING' } },
          },
        },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session' },
        },
      },
      {
        name: 'Codex incompleteHooks unknown trigger',
        harness: 'codex',
        capabilityEvidence: {
          incompleteHooks: {
            enroll_session: { trigger: 'SECRET-FutureStart', reason: 'partial' },
          },
        },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session' },
        },
      },
      {
        name: 'Codex incompleteHooks oversized reason',
        harness: 'codex',
        capabilityEvidence: {
          incompleteHooks: {
            enroll_session: { trigger: 'SessionStart', reason: oversized },
          },
        },
        event: {
          hook: 'SessionStart',
          payload: { session_id: 'root-session' },
        },
      },
    ];
    let executorCalls = 0;
    const settled = await Promise.allSettled(malformedCases.map((testCase) => (
      executeHookCommand(JSON.stringify({
        protocolVersion: 1,
        harness: testCase.harness,
        capabilityEvidence: testCase.capabilityEvidence,
        event: testCase.event,
        ...(testCase.context !== undefined ? { context: testCase.context } : {}),
      }), async () => {
        executorCalls += 1;
        return {
          outcome: 'confirmed',
          retryable: false,
          harness: testCase.harness,
          intent: 'enroll_session',
        };
      })
    )));

    expect(executorCalls).toBe(0);
    for (const [index, result] of settled.entries()) {
      const testCase = malformedCases[index];
      expect(result.status, testCase.name).toBe('fulfilled');
      if (result.status !== 'fulfilled') {
        continue;
      }
      expect(result.value, testCase.name).toMatchObject({
        protocolVersion: 1,
        harness: testCase.harness,
        outcome: 'degraded',
        retryable: false,
      });
      const serialized = JSON.stringify(result.value);
      expect(serialized, testCase.name).not.toContain('SECRET');
      expect(serialized.length, testCase.name).toBeLessThanOrEqual(1_000);
    }
  });

  it('rejects malformed or mismatched executor results without false success', async () => {
    const runtime = await importHookCommand();
    const executeHookCommand = runtime.executeHookCommand as (
      input: string,
      executor: (...args: any[]) => Promise<any>,
    ) => Promise<any>;
    const request = JSON.stringify({
      protocolVersion: 1,
      harness: 'claude',
      capabilityEvidence: claudeRuntimeClaim(),
      event: {
        hook: 'SessionStart',
        payload: {
          session_id: 'root-session',
          source: 'startup',
          summary: 'SECRET-EXECUTOR-PROMPT',
        },
      },
    });
    const invalidResults = [
      { name: 'null', value: null },
      { name: 'array', value: [] },
      { name: 'non-object', value: 'SECRET-NOT-OBJECT' },
      {
        name: 'unknown outcome',
        value: {
          outcome: 'SECRET-future',
          retryable: false,
          harness: 'claude',
          intent: 'enroll_session',
        },
      },
      {
        name: 'wrong harness',
        value: {
          outcome: 'confirmed',
          retryable: false,
          harness: 'codex',
          intent: 'enroll_session',
        },
      },
      {
        name: 'wrong intent',
        value: {
          outcome: 'confirmed',
          retryable: false,
          harness: 'claude',
          intent: 'finalize_session',
        },
      },
      {
        name: 'non-boolean retryable',
        value: {
          outcome: 'confirmed',
          retryable: 'SECRET-false',
          harness: 'claude',
          intent: 'enroll_session',
        },
      },
    ];

    for (const invalid of invalidResults) {
      const result = await executeHookCommand(request, async () => invalid.value);
      expect(result, invalid.name).toMatchObject({
        protocolVersion: 1,
        harness: 'claude',
        intent: 'enroll_session',
        outcome: 'failed',
        retryable: true,
      });
      const serialized = JSON.stringify(result);
      expect(result.outcome, invalid.name).not.toBe('confirmed');
      expect(serialized, invalid.name).not.toContain('SECRET');
      expect(serialized.length, invalid.name).toBeLessThanOrEqual(1_000);
    }

    const confirmed = await executeHookCommand(request, async () => ({
      outcome: 'confirmed',
      retryable: false,
      harness: 'claude',
      intent: 'enroll_session',
    }));
    expect(confirmed).toEqual({
      protocolVersion: 1,
      harness: 'claude',
      intent: 'enroll_session',
      outcome: 'confirmed',
      retryable: false,
    });
  });
});

describe('private OpenCode delivery operations', () => {
  it('accepts only the exact behavior-evidence system payload for prepare_delivery and passes its eligible mapping privately', async () => {
        const runtime = await importHookCommand();
        const executeHookCommand = runtime.executeHookCommand as (
          input: string,
          executor: (
            event: unknown,
            capabilities: unknown,
            execution: unknown,
          ) => Promise<Record<string, unknown>>,
        ) => Promise<Record<string, unknown>>;
        const openCode = HOST_EVIDENCE.find((entry) => entry.harness === 'opencode');
        if (!openCode) throw new Error('Expected OpenCode host evidence');
        const capabilityEvidence = {
          payloadMappingId: openCode.payloadMappingId,
          assetExecutionMarker: openCode.activationMarker,
          eventMappingId: openCode.activation.mappingId,
          deliveryChannel: openCode.recovery.channel,
          deliveryMappingId: openCode.recovery.mappingId,
          behaviorEvidenceMappingId: 'opencode-plugin-init-mutation-v1',
          mutableOutputChannel: 'system',
        };
        let execution: unknown;
        const response = await executeHookCommand(JSON.stringify({
          protocolVersion: 1,
          operation: 'prepare_delivery',
          harness: 'opencode',
          capabilityEvidence,
          context: { project: 'thoth-mem', directory: '/workspace/thoth-mem' },
          event: {
            type: 'experimental.chat.system.transform',
            input: {
              sessionID: 'root-session',
              model: { providerID: 'openai', modelID: 'gpt-5.6-terra' },
            },
          },
        }), async (_event, _capabilities, executionContext) => {
          execution = executionContext;
          return {
            outcome: 'confirmed',
            retryable: false,
            harness: 'opencode',
            intent: 'recall_guidance',
          };
        });

        expect(execution).toMatchObject({
          operation: 'prepare_delivery',
          mapping: {
            eventMappingId: openCode.activation.mappingId,
            deliveryChannel: openCode.recovery.channel,
            deliveryMappingId: openCode.recovery.mappingId,
          },
        });
        expect(response).toMatchObject({
          protocolVersion: 1,
          operation: 'prepare_delivery',
          harness: 'opencode',
          intent: 'recall_guidance',
          outcome: 'confirmed',
          retryable: false,
        });

        let malformedCalls = 0;
        const malformed = await executeHookCommand(JSON.stringify({
          protocolVersion: 1,
          operation: 'prepare_delivery',
          harness: 'opencode',
          capabilityEvidence,
          context: { project: 'thoth-mem', directory: '/workspace/thoth-mem' },
          event: { type: 'experimental.chat.system.transform', input: { sessionID: 'root-session' } },
        }), async () => {
          malformedCalls += 1;
          return {
            outcome: 'confirmed',
            retryable: false,
            harness: 'opencode',
            intent: 'recall_guidance',
          };
        });
        expect(malformed).toMatchObject({ outcome: 'degraded', retryable: false });
    expect(malformedCalls).toBe(0);
  });

  it('validates the official system and compacting callback shapes independently', async () => {
    const runtime = await importHookCommand();
    const executeHookCommand = runtime.executeHookCommand as (
      input: string,
      executor: (event: unknown, capabilities: unknown, execution: unknown) => Promise<Record<string, unknown>>,
    ) => Promise<Record<string, unknown>>;
    const openCode = HOST_EVIDENCE.find((entry) => entry.harness === 'opencode');
    if (!openCode) throw new Error('Expected OpenCode host evidence');
    const capabilityEvidence = {
      payloadMappingId: openCode.payloadMappingId,
      assetExecutionMarker: openCode.activationMarker,
      eventMappingId: openCode.activation.mappingId,
      deliveryChannel: openCode.recovery.channel,
      deliveryMappingId: openCode.recovery.mappingId,
      behaviorEvidenceMappingId: 'opencode-plugin-init-mutation-v1',
      mutableOutputChannel: 'system',
    };
    const systemRequest = (input: Record<string, unknown>) => JSON.stringify({
      protocolVersion: 1, operation: 'prepare_delivery', harness: 'opencode', capabilityEvidence,
      context: { project: 'thoth-mem', directory: '/workspace/thoth-mem' },
      event: { type: 'experimental.chat.system.transform', input },
    });
    let forwardedEvent: unknown;
    const realisticModel = await executeHookCommand(systemRequest({
      sessionID: 'root-session',
      model: { providerID: 'openai', modelID: 'gpt-5.6-terra', configuration: { reasoning: 'high' } },
    }), async (event) => {
      forwardedEvent = event;
      return { outcome: 'confirmed', retryable: false, harness: 'opencode', intent: 'recall_guidance' };
    });
    expect(realisticModel).toMatchObject({ outcome: 'confirmed', retryable: false });
    expect(JSON.stringify(forwardedEvent)).not.toContain('configuration');
    expect(JSON.stringify(forwardedEvent)).not.toContain('modelID');

    let missingIdentityCalls = 0;
    const noSession = await executeHookCommand(systemRequest({
      model: { providerID: 'openai', modelID: 'gpt-5.6-terra' },
    }), async () => {
      missingIdentityCalls += 1;
      return { outcome: 'confirmed', retryable: false, harness: 'opencode', intent: 'recall_guidance' };
    });
    expect(noSession).toMatchObject({
      outcome: 'degraded',
      retryable: false,
      diagnostic: expect.stringContaining('root-session identity'),
    });
    expect(missingIdentityCalls).toBe(0);

    for (const model of [{}, [], null]) {
      const malformedModel = await executeHookCommand(systemRequest({ sessionID: 'root-session', model }),
        async () => ({ outcome: 'confirmed', retryable: false, harness: 'opencode', intent: 'recall_guidance' }));
      expect(malformedModel).toMatchObject({ outcome: 'degraded', retryable: false });
    }

    const compactEvidence = { ...capabilityEvidence, eventMappingId: openCode.compaction.mappingId, deliveryMappingId: openCode.compaction.mappingId, mutableOutputChannel: 'context' };
    let compactExecution: unknown;
    const compact = await executeHookCommand(JSON.stringify({
      protocolVersion: 1, operation: 'prepare_delivery', harness: 'opencode', capabilityEvidence: compactEvidence,
      context: { project: 'thoth-mem', directory: '/workspace/thoth-mem' },
      event: { type: 'experimental.session.compacting', input: { sessionID: 'root-session' } },
    }), async (_event, _capabilities, execution) => {
      compactExecution = execution;
      return { outcome: 'confirmed', retryable: false, harness: 'opencode', intent: 'compact_session' };
    });
    expect(compact).toMatchObject({ operation: 'prepare_delivery', intent: 'compact_session', outcome: 'confirmed' });
    expect(compactExecution).toMatchObject({
      operation: 'prepare_delivery',
      prepareDeliveryAuthorization: expect.any(Object),
      mapping: { eventMappingId: openCode.compaction.mappingId, deliveryMappingId: openCode.compaction.mappingId },
    });

    let invalidCompactCalls = 0;
    for (const input of [{}, { sessionID: '' }]) {
      const invalidCompact = await executeHookCommand(JSON.stringify({
        protocolVersion: 1, operation: 'prepare_delivery', harness: 'opencode', capabilityEvidence: compactEvidence,
        event: { type: 'experimental.session.compacting', input },
      }), async () => {
        invalidCompactCalls += 1;
        return { outcome: 'confirmed', retryable: false, harness: 'opencode', intent: 'compact_session' };
      });
      expect(invalidCompact).toMatchObject({ outcome: 'degraded', retryable: false });
    }
    expect(invalidCompactCalls).toBe(0);

    let normalCalls = 0;
    const normal = await executeHookCommand(JSON.stringify({
      protocolVersion: 1, harness: 'opencode', capabilityEvidence,
      event: { type: 'experimental.chat.system.transform', input: {
        sessionID: 'root-session', model: { providerID: 'openai', modelID: 'gpt-5.6-terra' },
      } },
    }), async () => {
      normalCalls += 1;
      return { outcome: 'confirmed', retryable: false, harness: 'opencode', intent: 'recall_guidance' };
    });
    expect(normal).toMatchObject({ outcome: 'degraded', retryable: false });
    expect(normalCalls).toBe(0);
  });

  it('passes a strictly validated private confirmation to state-only execution and rejects mismatched directive facts', async () => {
    const runtime = await importHookCommand();
    const executeHookCommand = runtime.executeHookCommand as (
      input: string,
      executor: (
        event: unknown,
        capabilities: unknown,
        execution: unknown,
      ) => Promise<Record<string, unknown>>,
    ) => Promise<Record<string, unknown>>;
    const openCode = HOST_EVIDENCE.find((entry) => entry.harness === 'opencode');
    if (!openCode) throw new Error('Expected OpenCode host evidence');
    const capabilityEvidence = {
      payloadMappingId: openCode.payloadMappingId,
      assetExecutionMarker: openCode.activationMarker,
      eventMappingId: openCode.activation.mappingId,
      deliveryChannel: openCode.recovery.channel,
      deliveryMappingId: openCode.recovery.mappingId,
      behaviorEvidenceMappingId: 'opencode-plugin-init-mutation-v1',
      mutableOutputChannel: 'system',
    };
    const directive = {
      purpose: 'recovery_context',
      deliveryMappingId: openCode.recovery.mappingId,
      text: 'Recovered context',
    };
    const request = {
      protocolVersion: 1,
      operation: 'confirm_delivery',
      harness: 'opencode',
      capabilityEvidence,
      context: { project: 'thoth-mem', directory: '/workspace/thoth-mem' },
      event: {
        type: 'experimental.chat.system.transform',
        input: {
          sessionID: 'root-session',
          model: { providerID: 'openai', modelID: 'gpt-5.6-terra' },
        },
      },
      hostOutputDirective: directive,
      deliveryAttempt: `${Buffer.from('{"version":1}').toString('base64url')}.${'a'.repeat(64)}`,
    };
    let execution: unknown;
    const response = await executeHookCommand(JSON.stringify(request), async (_event, _capabilities, context) => {
      execution = context;
      return {
        outcome: 'confirmed',
        retryable: false,
        harness: 'opencode',
        intent: 'recall_guidance',
      };
    });
    expect(execution).toMatchObject({
      operation: 'confirm_delivery',
      hostOutputDirective: directive,
      deliveryAttempt: request.deliveryAttempt,
    });
    expect(response).toMatchObject({ operation: 'confirm_delivery', outcome: 'confirmed', retryable: false });

    let mismatchedCalls = 0;
    const mismatched = await executeHookCommand(JSON.stringify({
      ...request,
      hostOutputDirective: { ...directive, deliveryMappingId: openCode.compaction.mappingId },
    }), async () => {
      mismatchedCalls += 1;
      return {
        outcome: 'confirmed',
        retryable: false,
        harness: 'opencode',
        intent: 'recall_guidance',
      };
    });
    expect(mismatched).toMatchObject({ outcome: 'degraded', retryable: false });
    expect(mismatchedCalls).toBe(0);
  });
});

    describe('package-internal integration event command', () => {
  it('runs the production core through injected resources and closes the selected data-dir port', async () => {
    const runtime = await importIntegrationEventCommand();
    const executeIntegrationEvent = runtime.executeIntegrationEvent as (
      input: string,
      options: Record<string, unknown>,
    ) => Promise<{ exitCode: number; response: Record<string, unknown> }>;
    const events: string[] = [];
    let selectedDataDir: string | undefined;
    let stateOptions: Record<string, unknown> | undefined;
    const dataDir = join(tmpdir(), 'thoth integration data with spaces');
    const request = JSON.stringify({
      protocolVersion: 1,
      harness: 'claude',
      capabilityEvidence: {
            hostVersion: 'claude-code-1.x',
            payloadMappingId: 'claude-code-session-payload-v1',
            assetExecutionMarker: 'claude-code-activation-v1',
            eventMappingId: 'claude-code-session-start-v1',
            deliveryChannel: 'runner-stdout',
            deliveryMappingId: 'claude-code-recovery-injection-v1',
          },
      event: {
        hook: 'SessionStart',
        payload: {
          session_id: 'root-session',
          project: 'project-id',
          cwd: join(tmpdir(), 'project with spaces'),
          source: 'startup',
          event_id: 'native-event-1',
        },
      },
    });

    const result = await executeIntegrationEvent(request, {
      dataDir,
      dependencies: {
        resolveDataDir: (requested: string | undefined) => {
          selectedDataDir = requested;
          return requested!;
        },
        createMemoryPort: async (requested: string) => {
          events.push(`port:${requested}`);
          return {
            call: async () => ({ confirmed: true, isError: false, text: 'confirmed' }),
            close: async () => { events.push('port:closed'); },
          };
        },
        createStateStore: (options: Record<string, unknown>) => {
          stateOptions = options;
          return { marker: 'state-store' };
        },
        createCore: (options: Record<string, unknown>) => {
          expect(options).toMatchObject({
            capabilities: expect.any(Object),
            memoryPort: expect.any(Object),
            stateStore: { marker: 'state-store' },
          });
          return {
            handle: async (event: Record<string, unknown>) => {
              events.push(`core:${event.intent}`);
              return {
                outcome: 'confirmed',
                retryable: false,
                harness: event.harness,
                intent: event.intent,
                effects: [],
                hostOutputDirective: {
                  purpose: 'recovery_context',
                  text: 'Recovered integration-event guidance.',
                  deliveryMappingId: 'claude-session-start-context',
                },
              };
            },
          };
        },
      },
    });

    expect(result).toEqual({
      exitCode: 0,
      response: {
        protocolVersion: 1,
        harness: 'claude',
        intent: 'enroll_session',
        outcome: 'confirmed',
        retryable: false,
        hostOutputDirective: {
          purpose: 'recovery_context',
          text: 'Recovered integration-event guidance.',
          deliveryMappingId: 'claude-session-start-context',
        },
      },
    });
    expect(selectedDataDir).toBe(dataDir);
    expect(stateOptions).toMatchObject({
      dataDir,
      harness: 'claude',
      projectId: 'project-with-spaces',
      rootSessionId: 'root-session',
      capabilities: expect.any(Object),
    });
    expect(events).toEqual([
      `port:${dataDir}`,
      'core:enroll_session',
      'port:closed',
    ]);
  });

  it('derives prepare-delivery output from confirmed memory through the default core without test-only host output', async () => {
    const runtime = await importIntegrationEventCommand();
    const executeIntegrationEvent = runtime.executeIntegrationEvent as (
      input: string, options: Record<string, unknown>,
    ) => Promise<{ exitCode: number; response: Record<string, unknown> }>;
    const openCode = HOST_EVIDENCE.find((entry) => entry.harness === 'opencode');
    if (!openCode) throw new Error('Expected OpenCode host evidence');
    const request = (sessionID: string) => JSON.stringify({
      protocolVersion: 1, operation: 'prepare_delivery', harness: 'opencode',
      capabilityEvidence: {
        payloadMappingId: openCode.payloadMappingId, assetExecutionMarker: openCode.activationMarker,
        eventMappingId: openCode.activation.mappingId, deliveryChannel: openCode.recovery.channel,
        deliveryMappingId: openCode.recovery.mappingId, behaviorEvidenceMappingId: 'opencode-plugin-init-mutation-v1',
        mutableOutputChannel: 'system',
      },
      context: { project: 'thoth-mem', directory: '/workspace/thoth-mem' },
      event: { id: 'callback-' + sessionID, sequence: 1, type: 'experimental.chat.system.transform', input: {
        sessionID, model: { providerID: 'openai', modelID: 'gpt-5.6-terra' },
      } },
    });
    const successDataDir = mkdtempSync(join(tmpdir(), 'thoth-default-prepare-success-'));
    const failureDataDir = mkdtempSync(join(tmpdir(), 'thoth-default-prepare-failure-'));
    const successfulCalls: string[] = [];
    try {
      const success = await executeIntegrationEvent(request('default-success'), {
        dataDir: successDataDir,
        dependencies: {
          resolveDataDir: (requested: string | undefined) => requested!,
          createMemoryPort: async () => ({
            call: async (tool: string) => {
              successfulCalls.push(tool);
              return { confirmed: true, isError: false, text: tool === 'mem_context' ? 'Recovered production context.' : 'Memory confirmed.' };
            },
            close: async () => undefined,
          }),
        },
      });
      expect(success.exitCode).toBe(0);
      expect(success.response).toMatchObject({
        operation: 'prepare_delivery', outcome: 'confirmed', retryable: false,
        hostOutputDirective: { purpose: 'recovery_context', text: 'Recovered production context.', deliveryMappingId: openCode.recovery.mappingId },
        deliveryAttempt: expect.stringMatching(/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/),
        deliveryState: { activation: 'eligible', memoryConfirmation: 'confirmed', outputReadiness: 'ready', outputSupport: 'eligible', modelConsumption: 'unproven' },
      });
      expect(successfulCalls).toEqual(['mem_session', 'mem_context']);

      const failure = await executeIntegrationEvent(request('default-failure'), {
        dataDir: failureDataDir,
        dependencies: {
          resolveDataDir: (requested: string | undefined) => requested!,
          createMemoryPort: async () => ({
            call: async () => ({ confirmed: false, isError: true, text: 'Memory unavailable.' }),
            close: async () => undefined,
          }),
        },
      });
      expect(failure.response).toMatchObject({ operation: 'prepare_delivery', outcome: 'failed', retryable: true });
      expect(failure.response).not.toHaveProperty('hostOutputDirective');
      expect(failure.response).not.toHaveProperty('deliveryAttempt');
    } finally {
      rmSync(successDataDir, { recursive: true, force: true });
      rmSync(failureDataDir, { recursive: true, force: true });
    }
  });

  it('handles two distinct OpenCode compactions through the default core and leaves missing callback identity degraded', async () => {
    const runtime = await importIntegrationEventCommand();
    const executeIntegrationEvent = runtime.executeIntegrationEvent as (
      input: string, options: Record<string, unknown>,
    ) => Promise<{ exitCode: number; response: Record<string, unknown> }> ;
    const openCode = HOST_EVIDENCE.find((entry) => entry.harness === 'opencode');
    if (!openCode) throw new Error('Expected OpenCode host evidence');
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-default-compaction-callbacks-'));
    const calls: string[] = [];
    let contextNumber = 0;
    const request = (id?: string, sequence?: number) => JSON.stringify({
      protocolVersion: 1, operation: 'prepare_delivery', harness: 'opencode',
      capabilityEvidence: {
        payloadMappingId: openCode.payloadMappingId, assetExecutionMarker: openCode.activationMarker,
        eventMappingId: openCode.compaction.mappingId, deliveryChannel: openCode.compaction.channel,
        deliveryMappingId: openCode.compaction.mappingId, behaviorEvidenceMappingId: 'opencode-plugin-init-mutation-v1',
        mutableOutputChannel: 'context',
      },
      context: { project: 'thoth-mem', directory: '/workspace/thoth-mem' },
      event: { ...(id ? { id } : {}), ...(sequence ? { sequence } : {}), type: 'experimental.session.compacting', input: { sessionID: 'root-session' } },
    });
    try {
      const options = {
        dataDir,
        dependencies: {
          resolveDataDir: (requested: string | undefined) => requested!,
          createMemoryPort: async () => ({
            call: async (tool: string) => {
              calls.push(tool);
              return { confirmed: true, isError: false, text: tool === 'mem_context' ? 'Compaction context ' + (++contextNumber) : 'Checkpoint confirmed.' };
            },
            close: async () => undefined,
          }),
        },
      };
      const first = await executeIntegrationEvent(request('callback-one', 1), options);
      const second = await executeIntegrationEvent(request('callback-two', 2), options);
      expect(first.response).toMatchObject({
        operation: 'prepare_delivery', intent: 'compact_session', outcome: 'confirmed',
        hostOutputDirective: { purpose: 'post_compaction_guidance', text: 'Compaction context 1', deliveryMappingId: openCode.compaction.mappingId },
        deliveryAttempt: expect.any(String),
      });
      expect(second.response).toMatchObject({
        operation: 'prepare_delivery', intent: 'compact_session', outcome: 'confirmed',
        hostOutputDirective: { purpose: 'post_compaction_guidance', text: 'Compaction context 2', deliveryMappingId: openCode.compaction.mappingId },
        deliveryAttempt: expect.any(String),
      });
      expect(first.response.deliveryAttempt).not.toBe(second.response.deliveryAttempt);
      expect(calls).toEqual(['mem_session', 'mem_context', 'mem_session', 'mem_context']);

      const missingIdentity = await executeIntegrationEvent(request(), options);
      expect(missingIdentity.response).toMatchObject({ operation: 'prepare_delivery', outcome: 'degraded', retryable: false });
      expect(missingIdentity.response).not.toHaveProperty('deliveryAttempt');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('fails closed for malformed and oversized stdin without echoing input or creating resources', async () => {
    const runtime = await importIntegrationEventCommand();
    const executeIntegrationEvent = runtime.executeIntegrationEvent as (
      input: string,
      options?: Record<string, unknown>,
    ) => Promise<{ exitCode: number; response: Record<string, unknown> }>;
    const readIntegrationEventInput = runtime.readIntegrationEventInput as (
      stream: Readable,
      maximumBytes?: number,
    ) => Promise<string>;
    let resources = 0;
    const malformed = await executeIntegrationEvent('{"private":"SECRET-MALFORMED"', {
      dependencies: {
        resolveDataDir: () => { resources += 1; return 'unused'; },
        createMemoryPort: async () => { resources += 1; throw new Error('unused'); },
        createStateStore: () => { resources += 1; return {}; },
        createCore: () => { resources += 1; return {}; },
      },
    });
    expect(malformed.exitCode).toBe(0);
    expect(malformed.response).toMatchObject({
      protocolVersion: 1,
      outcome: 'degraded',
      retryable: false,
      diagnostic: expect.stringContaining('valid JSON'),
    });
    expect(JSON.stringify(malformed)).not.toContain('SECRET-MALFORMED');
    expect(JSON.stringify(malformed).length).toBeLessThanOrEqual(1_000);
    expect(resources).toBe(0);

    await expect(readIntegrationEventInput(
      Readable.from([Buffer.alloc(9, 'x')]),
      8,
    )).rejects.toMatchObject({ code: 'INTEGRATION_EVENT_INPUT_TOO_LARGE' });
  });

  it('runs the canonical runner through the source CLI without checkout-relative cwd or env fallback', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'thoth source route runner '));
    const pluginRoot = join(tempRoot, 'copied plugin with spaces');
    const runnerPath = join(pluginRoot, 'runners', 'hook-runner.mjs');
    const executablePath = join(tempRoot, 'installed package', 'thoth-mem-source.mjs');
    const unrelatedCwd = join(tempRoot, 'unrelated cwd');
    const dataDir = join(tempRoot, 'thoth data');
    mkdirSync(dirname(runnerPath), { recursive: true });
    mkdirSync(dirname(executablePath), { recursive: true });
    mkdirSync(unrelatedCwd, { recursive: true });
    copyFileSync(canonicalRunnerPath, runnerPath);
    const tsxImport = import.meta.resolve('tsx');
    writeFileSync(executablePath, `
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const child = spawnSync(process.execPath, [
  '--import', ${JSON.stringify(tsxImport)},
  ${JSON.stringify(join(repositoryRoot, 'src', 'index.ts'))},
  ...process.argv.slice(2),
], {
  input: readFileSync(0),
  encoding: 'utf8',
  env: process.env,
  shell: false,
});
process.stdout.write(child.stdout ?? '');
process.stderr.write(child.stderr ?? '');
process.exitCode = child.status ?? 1;
`, 'utf8');
    writeFileSync(join(pluginRoot, 'thoth-mem.installation.json'), JSON.stringify({
      schemaVersion: 1,
      packageVersion,
      executable: executablePath,
      harness: 'claude',
      scope: 'global',
      target: pluginRoot,
      configPath: join(pluginRoot, '.mcp.json'),
      assetsPath: pluginRoot,
      verified: true,
    }), 'utf8');

    try {
      const result = runRunner(runnerPath, {
        session_id: 'source-runner-root',
        project: 'source-runner-project',
        cwd: unrelatedCwd,
        source: 'startup',
        event_id: 'source-runner-event',
      }, {
        cwd: unrelatedCwd,
        args: ['--harness', 'claude', '--hook', 'SessionStart'],
        env: {
          ...process.env,
          THOTH_DATA_DIR: dataDir,
          THOTH_MEM_BIN: '',
          NODE_PATH: '',
          PATH: '',
        },
      });
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(parseRunnerOutput(result)).toEqual({});
          expect(result.stdout).not.toMatch(/unable to resolve|outcome|hostOutputDirective/i);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('portable Node hook runner', () => {
  it('uses managed metadata before THOTH_MEM_BIN from an unrelated cwd with space-containing paths', async () => {
    expect(existsSync(canonicalRunnerPath), 'integrations/shared/hook-runner.mjs must exist').toBe(true);
    const tempRoot = mkdtempSync(join(tmpdir(), 'thoth runner contract '));
    const pluginRoot = join(tempRoot, 'plugin root with spaces');
    const runnerPath = join(pluginRoot, 'runners', 'hook-runner.mjs');
    const managedRuntime = join(tempRoot, 'managed runtime with spaces', 'thoth-mem entry.mjs');
    const envRuntime = join(tempRoot, 'env runtime with spaces', 'thoth-mem env.mjs');
    const unrelatedCwd = join(tempRoot, 'unrelated cwd');
    mkdirSync(dirname(runnerPath), { recursive: true });
    mkdirSync(unrelatedCwd, { recursive: true });
    copyFileSync(canonicalRunnerPath, runnerPath);
    writeFakeRuntime(managedRuntime, 'managed');
    writeFakeRuntime(envRuntime, 'env');
    writeFileSync(join(pluginRoot, 'thoth-mem.installation.json'), JSON.stringify({
      schemaVersion: 1,
      packageVersion,
      executable: managedRuntime,
      harness: 'claude',
      scope: 'global',
      target: pluginRoot,
      configPath: join(pluginRoot, '.mcp.json'),
      assetsPath: pluginRoot,
      verified: true,
    }), 'utf8');

    try {
      const payload = {
        session_id: 'root session',
        project: 'project with spaces',
        prompt: 'literal $(not-executed) & still one JSON value',
      };
      const runnerModule = await import(`${pathToFileURL(runnerPath).href}?test=${randomUUID()}`);
      const resolvedCommand = runnerModule.resolveThothMemCommand({
        runnerPath,
        env: { ...process.env, THOTH_MEM_BIN: envRuntime, PATH: '' },
      });
      expect(resolvedCommand).toMatchObject({
        command: process.execPath,
        args: [managedRuntime],
        source: 'managed',
      });
      const direct = spawnSync(
        resolvedCommand.command,
        [...resolvedCommand.args, 'integration-event'],
        {
          input: JSON.stringify({ probe: true }),
          encoding: 'utf8',
          shell: false,
        },
      );
      expect(direct.status, direct.stderr).toBe(0);
      const result = runRunner(runnerPath, payload, {
        cwd: unrelatedCwd,
        args: ['--harness', 'claude', '--hook', 'UserPromptSubmit'],
        env: {
          ...process.env,
          THOTH_MEM_BIN: envRuntime,
          PATH: '',
        },
      });
      expect(result.status).toBe(0);
      const output = parseRunnerOutput(result);
      expect(output).toEqual({});
          expect(JSON.stringify(output)).not.toContain('managed');
      expect(existsSync(join(unrelatedCwd, 'not-executed'))).toBe(false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('falls back through THOTH_MEM_BIN and then PATH without a shell', () => {
    expect(existsSync(canonicalRunnerPath), 'integrations/shared/hook-runner.mjs must exist').toBe(true);
    const tempRoot = mkdtempSync(join(tmpdir(), 'thoth runner fallback '));
    const runnerRoot = join(tempRoot, 'runner root');
    const runnerPath = join(runnerRoot, 'runners', 'hook-runner.mjs');
    const envRuntime = join(tempRoot, 'env bin', 'thoth env.mjs');
    const pathDirectory = join(tempRoot, 'path bin with spaces');
    const pathRuntime = join(pathDirectory, process.platform === 'win32' ? 'thoth-mem' : 'thoth-mem');
    mkdirSync(dirname(runnerPath), { recursive: true });
    copyFileSync(canonicalRunnerPath, runnerPath);
    writeFakeRuntime(envRuntime, 'env');
    writeFakeRuntime(pathRuntime, 'path');

    try {
      const fromEnv = runRunner(runnerPath, { session_id: 'root' }, {
        args: ['--harness', 'codex', '--hook', 'SessionStart'],
        env: { ...process.env, THOTH_MEM_BIN: envRuntime, PATH: '' },
      });
      expect(fromEnv.status).toBe(0);
      expect(parseRunnerOutput(fromEnv)).toEqual({});

      const fromPath = runRunner(runnerPath, { session_id: 'root' }, {
        args: ['--harness', 'codex', '--hook', 'SessionStart'],
        env: {
          ...process.env,
          THOTH_MEM_BIN: '',
          PATH: [pathDirectory, process.env.PATH ?? ''].join(delimiter),
        },
      });
      expect(fromPath.status).toBe(0);
          expect(parseRunnerOutput(fromPath)).toEqual({});
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('returns a bounded degraded result when executable resolution fails', () => {
    expect(existsSync(canonicalRunnerPath), 'integrations/shared/hook-runner.mjs must exist').toBe(true);
    const tempRoot = mkdtempSync(join(tmpdir(), 'thoth runner missing '));
    const runnerPath = join(tempRoot, 'runners', 'hook-runner.mjs');
    mkdirSync(dirname(runnerPath), { recursive: true });
    copyFileSync(canonicalRunnerPath, runnerPath);

    try {
      const result = runRunner(runnerPath, { prompt: 'SECRET-RUNNER-PROMPT' }, {
        args: ['--harness', 'claude', '--hook', 'UserPromptSubmit'],
        env: { ...process.env, THOTH_MEM_BIN: '', PATH: '' },
      });
      expect(result.status).toBe(0);
      const output = parseRunnerOutput(result);
      expect(output).toEqual({});
          expect(JSON.stringify(output)).not.toContain('SECRET-RUNNER-PROMPT');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe('native plugin assets', () => {
  it('parses descriptors, resolves plugin-local paths, and keeps runner copies canonical', () => {
    const requiredFiles = [
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      'integrations/codex/.codex-plugin/plugin.json',
      'integrations/codex/.mcp.json',
      'integrations/codex/hooks/hooks.json',
      'integrations/codex/runners/hook-runner.mjs',
      'integrations/codex/skills/thoth-mem/SKILL.md',
      'integrations/claude-code/.claude-plugin/plugin.json',
      'integrations/claude-code/.mcp.json',
      'integrations/claude-code/hooks/hooks.json',
      'integrations/claude-code/runners/hook-runner.mjs',
      'integrations/claude-code/skills/thoth-mem/SKILL.md',
      'integrations/shared/hook-runner.mjs',
    ];
    for (const relativePath of requiredFiles) {
      expect(existsSync(join(repositoryRoot, relativePath)), `${relativePath} must exist`).toBe(true);
    }

    const codexMarketplace = readJsonFixture('.agents/plugins/marketplace.json');
    const claudeMarketplace = readJsonFixture('.claude-plugin/marketplace.json');
    const codexPlugin = readJsonFixture('integrations/codex/.codex-plugin/plugin.json');
    const claudePlugin = readJsonFixture('integrations/claude-code/.claude-plugin/plugin.json');
    const codexHooks = readJsonFixture('integrations/codex/hooks/hooks.json');
    const claudeHooks = readJsonFixture('integrations/claude-code/hooks/hooks.json');
    const codexMcp = readJsonFixture('integrations/codex/.mcp.json');
    const claudeMcp = readJsonFixture('integrations/claude-code/.mcp.json');

    expect(codexMarketplace.plugins[0]).toMatchObject({
      name: 'thoth-mem',
      source: { source: 'local', path: './integrations/codex' },
      policy: {
        installation: 'AVAILABLE',
        authentication: 'ON_INSTALL',
      },
    });
    expect(claudeMarketplace.plugins[0]).toMatchObject({
      name: 'thoth-mem',
      source: './integrations/claude-code',
      version: packageVersion,
    });
    expect(codexPlugin).toMatchObject({
      name: 'thoth-mem',
      version: packageVersion,
      skills: './skills/',
      hooks: './hooks/hooks.json',
      mcpServers: './.mcp.json',
      interface: {
        displayName: 'thoth-mem Persistent Memory',
        shortDescription: 'Privacy-safe root-session memory and bounded recall.',
        developerName: 'thoth-mem maintainers',
        category: 'Productivity',
      },
    });
    expect(codexPlugin).not.toHaveProperty('displayName');
    expect(codexPlugin).not.toHaveProperty('shortDescription');
    expect(codexPlugin).not.toHaveProperty('category');
    expect(claudePlugin).toMatchObject({ name: 'thoth-mem', version: packageVersion });

    const codexMarketplaceRoot = resolve(
      repositoryRoot,
      codexMarketplace.plugins[0].source.path,
    );
    const claudeMarketplaceRoot = resolve(
      repositoryRoot,
      claudeMarketplace.plugins[0].source,
    );
    expect(codexMarketplaceRoot).toBe(join(repositoryRoot, 'integrations/codex'));
    expect(claudeMarketplaceRoot).toBe(join(repositoryRoot, 'integrations/claude-code'));
    expect(existsSync(resolve(repositoryRoot, codexMarketplace.plugins[0].source.path))).toBe(true);
    expect(existsSync(resolve(repositoryRoot, claudeMarketplace.plugins[0].source))).toBe(true);
    expect(existsSync(resolve(join(repositoryRoot, 'integrations/codex'), codexPlugin.hooks))).toBe(true);
    const codexPluginRoot = join(repositoryRoot, 'integrations/codex');
    expect(existsSync(resolve(codexPluginRoot, codexPlugin.skills))).toBe(true);
    const codexMcpDescriptorPath = resolve(
      codexPluginRoot,
      String(codexPlugin.mcpServers),
    );
    const codexMcpDescriptorExists = existsSync(codexMcpDescriptorPath);
    expect(codexMcpDescriptorExists).toBe(true);

    expect(codexMcp).toEqual({
      mcpServers: {
        'thoth-mem': { command: 'thoth-mem', args: ['mcp', '--no-http'] },
      },
    });
    expect(claudeMcp).toEqual({
      mcpServers: {
        'thoth-mem': { command: 'thoth-mem', args: ['mcp', '--no-http'] },
      },
    });
    expect(JSON.stringify(codexHooks)).toContain('${PLUGIN_ROOT}/runners/hook-runner.mjs');
    expect(JSON.stringify(claudeHooks)).toContain('${CLAUDE_PLUGIN_ROOT}/runners/hook-runner.mjs');
    expect(Object.keys(claudeHooks.hooks)).toEqual([
          'SessionStart',
          'UserPromptSubmit',
          'PreCompact',
          'Stop',
          'SessionEnd',
          'SubagentStop',
        ]);
        expect(claudeHooks.hooks.SessionStart[0].matcher).toContain('compact');
        expect(claudeHooks.hooks.SessionEnd[0].hooks[0].command).toContain('--hook SessionEnd');
        expect(claudeHooks.hooks.SubagentStop[0].hooks[0].command).toContain('--hook SubagentStop');
    const codexHooksJson = JSON.stringify(codexHooks);
    const claudeHooksJson = JSON.stringify(claudeHooks);
    expect(codexHooksJson).not.toContain('outcome=confirmed');
    expect(claudeHooksJson).not.toContain('outcome=confirmed');

    const assertHookPaths = (
      hooks: any,
      pluginRoot: string,
      rootVariable: string,
      harness: 'codex' | 'claude',
    ): void => {
      for (const [hookName, groups] of Object.entries(hooks.hooks) as Array<[string, any[]]>) {
        for (const group of groups) {
          for (const hook of group.hooks) {
            expect(hook.type).toBe('command');
            expect(hook.command).toContain(`\${${rootVariable}}/runners/hook-runner.mjs`);
            expect(hook.command).toContain(`--harness ${harness}`);
            expect(hook.command).toContain(`--hook ${hookName}`);
            expect(hook.command).not.toMatch(/bash|powershell|\.sh|\.ps1|https?:\/\//i);
            const relativeRunner = hook.command.match(/\$\{[^}]+}\/([^"]+)/)?.[1];
            expect(relativeRunner).toBe('runners/hook-runner.mjs');
            expect(existsSync(resolve(pluginRoot, relativeRunner!))).toBe(true);
          }
        }
      }
    };
    assertHookPaths(
      codexHooks,
      join(repositoryRoot, 'integrations/codex'),
      'PLUGIN_ROOT',
      'codex',
    );
    assertHookPaths(
      claudeHooks,
      join(repositoryRoot, 'integrations/claude-code'),
      'CLAUDE_PLUGIN_ROOT',
      'claude',
    );

    for (const skillPath of [
      'integrations/codex/skills/thoth-mem/SKILL.md',
      'integrations/claude-code/skills/thoth-mem/SKILL.md',
    ]) {
      const skill = readFileSync(join(repositoryRoot, skillPath), 'utf8');
      for (const tool of [
        'mem_recall',
        'mem_save',
        'mem_context',
        'mem_get',
        'mem_project',
        'mem_session',
      ]) {
        expect(skill).toContain(tool);
      }
      expect(skill).not.toContain('mem_search');
      expect(skill).not.toContain('http://');
    }

    const canonicalRunner = readFileSync(canonicalRunnerPath);
    expect(readFileSync(join(repositoryRoot, 'integrations/codex/runners/hook-runner.mjs'))).toEqual(canonicalRunner);
    expect(readFileSync(join(repositoryRoot, 'integrations/claude-code/runners/hook-runner.mjs'))).toEqual(canonicalRunner);
  });

  it('executes both plugin-local runner copies through the same protocol', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'thoth native runner '));
    const installedRoot = join(tempRoot, 'installed plugin roots with spaces');
    const codexRoot = join(installedRoot, 'codex');
    const claudeRoot = join(installedRoot, 'claude-code');
    cpSync(join(repositoryRoot, 'integrations/codex'), codexRoot, { recursive: true });
    cpSync(join(repositoryRoot, 'integrations/claude-code'), claudeRoot, { recursive: true });
    const codexRunner = join(codexRoot, 'runners/hook-runner.mjs');
    const claudeRunner = join(claudeRoot, 'runners/hook-runner.mjs');
    expect(existsSync(codexRunner), 'Codex runner copy must exist').toBe(true);
    expect(existsSync(claudeRunner), 'Claude runner copy must exist').toBe(true);
    const runtimePath = join(tempRoot, 'runtime with spaces', 'thoth-mem.mjs');
    const unrelatedCwd = join(tempRoot, 'unrelated cwd');
    mkdirSync(unrelatedCwd, { recursive: true });
    writeFakeRuntime(runtimePath, 'native');

    try {
      const env = { ...process.env, THOTH_MEM_BIN: runtimePath, PATH: '' };
      const codex = parseRunnerOutput(runRunner(codexRunner, { session_id: 'root' }, {
        env,
        cwd: unrelatedCwd,
        args: ['--harness', 'codex', '--hook', 'SessionStart'],
      }));
      const claude = parseRunnerOutput(runRunner(claudeRunner, { session_id: 'root', source: 'resume' }, {
        env,
        cwd: unrelatedCwd,
        args: ['--harness', 'claude', '--hook', 'SessionStart'],
      }));

      expect(codex).toEqual({});
          expect(claude).toEqual({});
      expect(dirname(codexRunner)).not.toBe(process.cwd());
      expect(dirname(claudeRunner)).not.toBe(process.cwd());
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps unverified Codex hook events degraded without executing memory', async () => {
    const runtime = await importHookCommand();
    const executeHookCommand = runtime.executeHookCommand as (
      input: string,
      executor: (...args: any[]) => Promise<any>,
    ) => Promise<any>;
    let executorCalls = 0;
    const payloads: Record<string, Record<string, unknown>> = {
      SessionStart: { session_id: 'root-session', source: 'resume' },
      UserPromptSubmit: { session_id: 'root-session', role: 'user', prompt: 'root prompt' },
      PreCompact: { session_id: 'root-session', sequence: 1 },
      Stop: { session_id: 'root-session' },
    };

    for (const [hook, payload] of Object.entries(payloads)) {
      const result = await executeHookCommand(JSON.stringify({
        protocolVersion: 1,
        harness: 'codex',
        event: { hook, payload },
      }), async () => {
        executorCalls += 1;
        throw new Error('must not execute');
      });
      expect(result).toMatchObject({
        protocolVersion: 1,
        harness: 'codex',
        outcome: 'degraded',
        retryable: false,
      });
      expect(JSON.stringify(result)).not.toContain('confirmed');
      expect(JSON.stringify(result)).not.toContain('root prompt');
    }
    expect(executorCalls).toBe(0);
  });
});
