import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { executeIntegrationEvent } from '../../src/integration/runtime/integration-event-command.js';
import type { MemoryPort } from '../../src/integration/core/memory-port.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const canonicalRunnerPath = join(repositoryRoot, 'integrations/shared/hook-runner.mjs');
const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

type NativeHarness = 'codex' | 'claude';
type NativeHook = 'SessionStart' | 'UserPromptSubmit' | 'PreCompact' | 'Stop' | 'SubagentStop' | 'SessionEnd';

interface Mapping {
  eventMappingId: string;
  deliveryMappingId: string;
}

const mappings: Record<NativeHarness, Partial<Record<NativeHook, Mapping>>> = {
  codex: {
    SessionStart: { eventMappingId: 'codex-session-start-v1', deliveryMappingId: 'codex-recovery-injection-v1' },
    UserPromptSubmit: { eventMappingId: 'codex-user-prompt-v1', deliveryMappingId: 'codex-user-prompt-injection-v1' },
    PreCompact: { eventMappingId: 'codex-compaction-v1', deliveryMappingId: 'codex-compaction-v1' },
  },
  claude: {
    SessionStart: { eventMappingId: 'claude-code-session-start-v1', deliveryMappingId: 'claude-code-recovery-injection-v1' },
    UserPromptSubmit: { eventMappingId: 'claude-code-user-prompt-v1', deliveryMappingId: 'claude-code-user-prompt-injection-v1' },
    PreCompact: { eventMappingId: 'claude-code-compaction-v1', deliveryMappingId: 'claude-code-compaction-v1' },
    SubagentStop: { eventMappingId: 'claude-subagent-stop-passive-v1', deliveryMappingId: 'claude-subagent-stop-passive-v1' },
  },
};

function codexCommon(hook: NativeHook): Record<string, unknown> {
  return {
    session_id: 'codex-session',
    transcript_path: null,
    cwd: '/workspace/thoth-mem',
    hook_event_name: hook,
    model: 'gpt-5.6-codex',
  };
}

function claudeCommon(hook: NativeHook): Record<string, unknown> {
  return {
    session_id: 'claude-session',
    transcript_path: '/tmp/claude.jsonl',
    cwd: '/workspace/thoth-mem',
    hook_event_name: hook,
  };
}

function officialPayloads(): Array<{ harness: NativeHarness; hook: NativeHook; payload: Record<string, unknown> }> {
  return [
    { harness: 'codex', hook: 'SessionStart', payload: { ...codexCommon('SessionStart'), permission_mode: 'default', source: 'compact' } },
    { harness: 'codex', hook: 'UserPromptSubmit', payload: { ...codexCommon('UserPromptSubmit'), permission_mode: 'default', turn_id: 'codex-turn', prompt: 'Codex prompt' } },
    { harness: 'codex', hook: 'PreCompact', payload: { ...codexCommon('PreCompact'), turn_id: 'codex-turn', trigger: 'auto' } },
    { harness: 'codex', hook: 'Stop', payload: { ...codexCommon('Stop'), permission_mode: 'default', turn_id: 'codex-turn', stop_hook_active: false, last_assistant_message: 'Finished.' } },
    { harness: 'codex', hook: 'SubagentStop', payload: { ...codexCommon('SubagentStop'), permission_mode: 'default', turn_id: 'codex-turn', agent_id: 'codex-agent', agent_type: 'worker', agent_transcript_path: null, stop_hook_active: false, last_assistant_message: 'Subagent finished.' } },
    { harness: 'claude', hook: 'SessionStart', payload: { ...claudeCommon('SessionStart'), source: 'compact' } },
    { harness: 'claude', hook: 'SessionStart', payload: { ...claudeCommon('SessionStart'), source: 'startup', model: 'claude-sonnet-5', agent_type: 'reviewer', session_title: 'Thoth work' } },
    { harness: 'claude', hook: 'UserPromptSubmit', payload: { ...claudeCommon('UserPromptSubmit'), permission_mode: 'default', prompt_id: 'prompt-1', prompt: 'Claude prompt' } },
    { harness: 'claude', hook: 'PreCompact', payload: { ...claudeCommon('PreCompact'), trigger: 'auto', custom_instructions: '' } },
    { harness: 'claude', hook: 'Stop', payload: { ...claudeCommon('Stop'), permission_mode: 'default', stop_hook_active: false, last_assistant_message: 'Finished.' } },
    { harness: 'claude', hook: 'SubagentStop', payload: { ...claudeCommon('SubagentStop'), permission_mode: 'default', prompt_id: '123e4567-e89b-42d3-a456-426614174000', stop_hook_active: false, agent_id: 'claude-agent', agent_type: 'Explore', agent_transcript_path: '/tmp/claude-agent.jsonl', last_assistant_message: 'Subagent finished.', effort: { level: 'high' }, background_tasks: [{ id: 'task-1', type: 'agent', status: 'running', description: 'SUBAGENT-OPTIONAL-DESCRIPTION', command: 'SUBAGENT-OPTIONAL-COMMAND', agent_type: 'Explore', server: 'local', tool: 'Task', name: 'review' }], session_crons: [{ id: 'cron-1', schedule: 'SUBAGENT-OPTIONAL-SCHEDULE', recurring: true, prompt: 'SUBAGENT-OPTIONAL-CRON-PROMPT' }] } },
    { harness: 'claude', hook: 'SessionEnd', payload: { ...claudeCommon('SessionEnd'), reason: 'clear' } },
  ];
}

function expectedIntent(harness: NativeHarness, hook: NativeHook, payload: Record<string, unknown>): string {
  if (harness === 'claude' && hook === 'SubagentStop') return 'capture_passive_learning';
  if (hook === 'UserPromptSubmit') return 'capture_root_prompt';
  if (hook === 'PreCompact') return 'compact_session';
  if ((harness === 'codex' || harness === 'claude') && hook === 'SessionStart' && payload.source === 'compact') return 'recall_guidance';
  return 'enroll_session';
}

function readyDeliveryState() {
  return {
    activation: 'unproven',
    memoryConfirmation: 'confirmed',
    outputReadiness: 'ready',
    localEmission: 'not_emitted',
    modelConsumption: 'unproven',
  };
}

function actualChildResponse(
  harness: NativeHarness,
  hook: NativeHook,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const mapping = mappings[harness][hook];
  const response: Record<string, unknown> = {
    protocolVersion: 1,
    harness,
    intent: expectedIntent(harness, hook, payload),
    outcome: 'degraded',
    retryable: false,
  };
  if (hook === 'SessionStart' && mapping) {
    response.hostOutputDirective = {
      purpose: 'recovery_context',
      text: harness + ' recovered context.',
      deliveryMappingId: mapping.deliveryMappingId,
    };
    response.deliveryState = readyDeliveryState();
  }
  if (hook === 'PreCompact' && mapping) {
    response.hostOutputDirective = {
      purpose: 'post_compaction_guidance',
      text: harness + ' post-compaction context.',
      deliveryMappingId: mapping.deliveryMappingId,
    };
    response.deliveryState = readyDeliveryState();
  }
  return response;
}

function writeFakeRuntime(root: string, response: Record<string, unknown>, capturePath: string): string {
  const runtimePath = join(root, 'runtime', 'thoth-mem.mjs');
  mkdirSync(dirname(runtimePath), { recursive: true });
  writeFileSync(runtimePath, [
    "import { readFileSync, writeFileSync } from 'node:fs';",
    "const input = readFileSync(0, 'utf8');",
    'writeFileSync(' + JSON.stringify(capturePath) + ', input);',
    'process.stdout.write(' + JSON.stringify(JSON.stringify(response)) + ');',
  ].join('\n'), 'utf8');
  return runtimePath;
}

function runRunner(
  harness: NativeHarness,
  hook: NativeHook,
  payload: unknown,
  response: Record<string, unknown>,
): { output: Record<string, unknown>; request: Record<string, unknown> } {
  const root = mkdtempSync(join(tmpdir(), 'thoth-native-hook-'));
  temporaryRoots.push(root);
  const capturePath = join(root, 'request.json');
  const runtimePath = writeFakeRuntime(root, response, capturePath);
  const result: SpawnSyncReturns<string> = spawnSync(process.execPath, [canonicalRunnerPath, '--harness', harness, '--hook', hook], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    shell: false,
    timeout: 5_000,
    env: { ...process.env, THOTH_MEM_BIN: runtimePath, PATH: '' },
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return {
    output: JSON.parse(result.stdout) as Record<string, unknown>,
    request: JSON.parse(readFileSync(capturePath, 'utf8')) as Record<string, unknown>,
  };
}

describe('native Codex and Claude hook stdout', () => {
  it('accepts only official hook schemas and forwards bounded eligibility claims without invented facts', () => {
    for (const entry of officialPayloads().filter((candidate) => (
      candidate.hook !== 'Stop' && candidate.hook !== 'SessionEnd'
    ))) {
      const { output, request } = runRunner(
        entry.harness,
        entry.hook,
        entry.payload,
        actualChildResponse(entry.harness, entry.hook, entry.payload),
      );
      const mapping = mappings[entry.harness][entry.hook];
      const expectedPayload = entry.harness === 'claude' && entry.hook === 'SubagentStop'
        ? Object.fromEntries(Object.entries(entry.payload).filter(([key]) => (
          key !== 'transcript_path' && key !== 'agent_transcript_path'
          && key !== 'prompt_id' && key !== 'effort'
          && key !== 'background_tasks' && key !== 'session_crons'
        )))
        : entry.payload;
      expect(request.event).toEqual(expect.objectContaining({
        hook: entry.hook,
        id: expect.any(String),
        timestamp: expect.any(String),
        payload: expectedPayload,
      }));
      if (entry.harness === 'claude' && entry.hook === 'SubagentStop') {
        expect(request.event.payload).not.toHaveProperty('transcript_path');
        expect(request.event.payload).not.toHaveProperty('agent_transcript_path');
        expect(request.event.payload).not.toHaveProperty('prompt_id');
        expect(request.event.payload).not.toHaveProperty('effort');
        expect(request.event.payload).not.toHaveProperty('background_tasks');
        expect(request.event.payload).not.toHaveProperty('session_crons');
      }
      expect(request.event.payload).not.toHaveProperty('project');
      expect(request.event.payload).not.toHaveProperty('summary');
      expect(request.event.payload).not.toHaveProperty('role');
      if (mapping) {
        expect(request.capabilityEvidence).toEqual({
          payloadMappingId: entry.harness === 'codex' ? 'codex-session-payload-v1' : 'claude-code-session-payload-v1',
          assetExecutionMarker: entry.harness === 'codex' ? 'codex-activation-v1' : 'claude-code-activation-v1',
          eventMappingId: mapping.eventMappingId,
          deliveryChannel: 'runner-stdout',
          deliveryMappingId: mapping.deliveryMappingId,
          behaviorEvidenceMappingId: entry.harness === 'codex'
            ? 'codex-command-hook-payload-v1'
            : 'claude-code-command-hook-payload-v1',
        });
        expect(request.capabilityEvidence).not.toHaveProperty('hostVersion');
        expect(request.capabilityEvidence).not.toHaveProperty('supported');
      } else {
        expect(request.capabilityEvidence).toBeUndefined();
      }

      expect(output).toEqual(entry.hook === 'SessionStart'
        ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: entry.harness + ' recovered context.' } }
        : {});
    }
  });

  it('does not spawn memory work for semantic agent-owned terminal hooks', () => {
    for (const entry of officialPayloads().filter((candidate) => (
      candidate.hook === 'Stop' || candidate.hook === 'SessionEnd'
    ))) {
      const root = mkdtempSync(join(tmpdir(), 'thoth-native-hook-terminal-'));
      temporaryRoots.push(root);
      const capturePath = join(root, 'request.json');
      const runtimePath = writeFakeRuntime(
        root,
        actualChildResponse(entry.harness, entry.hook, entry.payload),
        capturePath,
      );
      const result = spawnSync(
        process.execPath,
        [canonicalRunnerPath, '--harness', entry.harness, '--hook', entry.hook],
        {
          input: JSON.stringify(entry.payload),
          encoding: 'utf8',
          shell: false,
          timeout: 5_000,
          env: { ...process.env, THOTH_MEM_BIN: runtimePath, PATH: '' },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({});
      expect(existsSync(capturePath)).toBe(false);
    }
  });

  it('rejects cross-hook, synthetic, and undocumented host fields before spawning the child command', () => {
    const cases: Array<{ harness: NativeHarness; hook: NativeHook; payload: Record<string, unknown> }> = [
      { harness: 'codex', hook: 'SessionStart', payload: { ...officialPayloads()[0].payload, trigger: 'startup' } },
      { harness: 'codex', hook: 'SessionStart', payload: { ...officialPayloads()[0].payload, turn_id: 'codex-turn' } },
      { harness: 'codex', hook: 'PreCompact', payload: { ...officialPayloads()[2].payload, permission_mode: 'plan' } },
      { harness: 'codex', hook: 'PreCompact', payload: { ...officialPayloads()[2].payload, last_assistant_message: 'wrong hook' } },
      { harness: 'claude', hook: 'UserPromptSubmit', payload: { ...officialPayloads()[7].payload, model: 'not-documented-here' } },
      { harness: 'claude', hook: 'PreCompact', payload: { ...officialPayloads()[8].payload, model: 'not-documented-here' } },
      { harness: 'claude', hook: 'Stop', payload: { ...officialPayloads()[9].payload, reason: 'not-a-stop-field' } },
      { harness: 'claude', hook: 'SubagentStop', payload: { ...officialPayloads()[10].payload, reason: 'not-a-subagent-stop-field' } },
      { harness: 'claude', hook: 'SubagentStop', payload: { ...officialPayloads()[10].payload, stop_hook_active: true } },
      { harness: 'claude', hook: 'SubagentStop', payload: { ...officialPayloads()[10].payload, agent_id: '' } },
      { harness: 'claude', hook: 'SubagentStop', payload: { ...officialPayloads()[10].payload, undocumented_metadata: 'not-an-official-field' } },
      { harness: 'claude', hook: 'SubagentStop', payload: { ...officialPayloads()[10].payload, prompt_id: 'not-a-uuid' } },
      { harness: 'claude', hook: 'SubagentStop', payload: { ...officialPayloads()[10].payload, effort: { level: 'turbo' } } },
      { harness: 'claude', hook: 'SubagentStop', payload: { ...officialPayloads()[10].payload, effort: { level: 'high', extra: 'not-allowed' } } },
      { harness: 'claude', hook: 'SubagentStop', payload: { ...officialPayloads()[10].payload, background_tasks: [{ id: 'task', description: 'd'.repeat(1_001) }] } },
      { harness: 'claude', hook: 'SubagentStop', payload: { ...officialPayloads()[10].payload, background_tasks: [{ id: 'task', command: 'c'.repeat(1_001) }] } },
      { harness: 'claude', hook: 'SubagentStop', payload: { ...officialPayloads()[10].payload, background_tasks: Array.from({ length: 101 }, (_, index) => ({ id: 'task-' + index })) } },
      { harness: 'claude', hook: 'SubagentStop', payload: { ...officialPayloads()[10].payload, session_crons: [{ id: 'cron', schedule: 'daily', recurring: true, prompt: 'p'.repeat(1_001) }] } },
      { harness: 'claude', hook: 'SubagentStop', payload: { ...officialPayloads()[10].payload, session_crons: [{ id: 'cron', schedule: 's'.repeat(1_001), recurring: true, prompt: 'ok' }] } },
      { harness: 'claude', hook: 'SubagentStop', payload: { ...officialPayloads()[10].payload, session_crons: [{ id: 'cron', schedule: 'daily', recurring: 'true', prompt: 'ok' }] } },
      { harness: 'claude', hook: 'SubagentStop', payload: { ...officialPayloads()[10].payload, session_crons: Array.from({ length: 101 }, (_, index) => ({ id: 'cron-' + index, schedule: 'daily', recurring: true, prompt: 'ok' })) } },
      { harness: 'claude', hook: 'SessionStart', payload: { ...officialPayloads()[5].payload, project: 'invented' } },
      { harness: 'claude', hook: 'SessionStart', payload: { ...officialPayloads()[5].payload, hook_event_name: 'Stop' } },
    ];
    for (const entry of cases) {
      const root = mkdtempSync(join(tmpdir(), 'thoth-native-hook-rejected-'));
      temporaryRoots.push(root);
      const capturePath = join(root, 'request.json');
      const runtimePath = writeFakeRuntime(root, actualChildResponse(entry.harness, entry.hook, entry.payload), capturePath);
      const result = spawnSync(process.execPath, [canonicalRunnerPath, '--harness', entry.harness, '--hook', entry.hook], {
        input: JSON.stringify(entry.payload),
        encoding: 'utf8',
        shell: false,
        timeout: 5_000,
        env: { ...process.env, THOTH_MEM_BIN: runtimePath, PATH: '' },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({});
      expect(existsSync(capturePath)).toBe(false);
    }
  });

  it('renders only a ready matching SessionStart directive from the actual eligible native response shape', () => {
    const payload = officialPayloads().find((entry) => entry.harness === 'claude' && entry.hook === 'SessionStart' && entry.payload.source === 'compact')!;
    const valid = actualChildResponse(payload.harness, payload.hook, payload.payload);
    const variants = [
      { ...valid, extra: 'no raw response fields' },
      { ...valid, deliveryAttempt: 'must-not-appear-on-normal-responses' },
      { ...valid, harness: 'codex' },
      { ...valid, intent: 'capture_root_prompt' },
      { ...valid, outcome: 'failed' },
      { ...valid, hostOutputDirective: undefined },
      { ...valid, deliveryState: { ...readyDeliveryState(), memoryConfirmation: 'unconfirmed' } },
      { ...valid, deliveryState: { ...readyDeliveryState(), outputReadiness: 'not_ready' } },
      { ...valid, hostOutputDirective: { ...(valid.hostOutputDirective as Record<string, unknown>), deliveryMappingId: 'wrong-mapping' } },
    ];

    const rendered = runRunner(payload.harness, payload.hook, payload.payload, valid);
    expect(rendered.output).toEqual({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'claude recovered context.' },
    });
    for (const response of variants) {
      expect(runRunner(payload.harness, payload.hook, payload.payload, response).output).toEqual({});
    }
  });

  it('never renders PreCompact output even when its memory-backed directive is ready', () => {
    for (const entry of officialPayloads().filter((candidate) => candidate.hook === 'PreCompact')) {
      const result = runRunner(
        entry.harness,
        entry.hook,
        entry.payload,
        actualChildResponse(entry.harness, entry.hook, entry.payload),
      );
      expect(result.output).toEqual({});
      expect(result.request.event.payload).toEqual(entry.payload);
    }
  });

  it('rejects private, prompt, handoff, tool, and memory-trace Claude SubagentStop content without any memory call', async () => {
    const entry = officialPayloads().find((candidate) => candidate.harness === 'claude' && candidate.hook === 'SubagentStop');
    if (!entry) throw new Error('Expected official Claude SubagentStop payload');
    const unsafeContent = [
      '<private>private subagent content</private>',
      'prompt: generated subagent prompt',
      'handoff: generated handoff',
      'tool result: generated tool output',
      'memory trace: generated recursive memory',
    ];
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-subagent-stop-unsafe-'));
    temporaryRoots.push(dataDir);
    const calls: Array<{ tool: string; input: Record<string, unknown> }> = [];
    const memoryPort: MemoryPort = {
      async call(tool, input) {
        calls.push({ tool, input });
        return { confirmed: true, isError: false, text: 'must not persist' };
      },
      async close() {},
    };

    for (const content of unsafeContent) {
      const runner = runRunner(entry.harness, entry.hook, {
        ...entry.payload,
        last_assistant_message: content,
      }, {
        protocolVersion: 1,
        harness: 'claude',
        intent: 'capture_passive_learning',
        outcome: 'confirmed',
        retryable: false,
      });
      expect(runner.output).toEqual({});
      expect(runner.request).toMatchObject({
        capabilityEvidence: { eventMappingId: 'claude-subagent-stop-passive-v1' },
      });
      const result = await executeIntegrationEvent(JSON.stringify(runner.request), {
        dataDir,
        dependencies: {
          resolveDataDir: (requested) => {
            if (!requested) throw new Error('Expected test data directory.');
            return requested;
          },
          createMemoryPort: async () => memoryPort,
        },
      });
      expect(result.response).toMatchObject({
        intent: 'capture_passive_learning',
        outcome: 'degraded',
        retryable: false,
      });
      expect(JSON.stringify(result.response)).not.toContain(content);
    }
    expect(calls).toHaveLength(0);
  });

  it('persists only an eligible Claude SubagentStop through runner, resolver, adapter, and core without finalization or native context output', async () => {
    const entry = officialPayloads().find((candidate) => candidate.harness === 'claude' && candidate.hook === 'SubagentStop');
    if (!entry) throw new Error('Expected official Claude SubagentStop payload');
    const childResponse = {
      protocolVersion: 1,
      harness: 'claude',
      intent: 'capture_passive_learning',
      outcome: 'confirmed',
      retryable: false,
    };
    const runner = runRunner(entry.harness, entry.hook, entry.payload, childResponse);
    const expectedNativeEventId = 'claude-subagent-stop-' + createHash('sha256')
      .update('claude-session\u0000claude-agent', 'utf8')
      .digest('hex')
      .slice(0, 48);
    expect(runner.output).toEqual({});
    expect(runner.request).toMatchObject({
      capabilityEvidence: {
        eventMappingId: 'claude-subagent-stop-passive-v1',
        deliveryMappingId: 'claude-subagent-stop-passive-v1',
      },
      event: { id: expectedNativeEventId, hook: 'SubagentStop' },
    });
    expect(JSON.stringify(runner.request)).not.toContain('claude-agent.jsonl');
    for (const secret of ['123e4567-e89b-42d3-a456-426614174000', 'SUBAGENT-OPTIONAL-DESCRIPTION', 'SUBAGENT-OPTIONAL-COMMAND', 'SUBAGENT-OPTIONAL-SCHEDULE', 'SUBAGENT-OPTIONAL-CRON-PROMPT']) {
      expect(JSON.stringify(runner.request)).not.toContain(secret);
      expect(expectedNativeEventId).not.toContain(secret);
      expect(JSON.stringify(runner.output)).not.toContain(secret);
    }

    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-subagent-stop-e2e-'));
    temporaryRoots.push(dataDir);
    const calls: Array<{ tool: string; input: Record<string, unknown> }> = [];
    let firstAttempt = true;
    const memoryPort: MemoryPort = {
      async call(tool, input) {
        calls.push({ tool, input });
        if (firstAttempt) {
          firstAttempt = false;
          return { confirmed: false, isError: true, text: 'Temporary observation failure.' };
        }
        return { confirmed: true, isError: false, text: 'Observation saved.' };
      },
      async close() {},
    };
    const run = () => executeIntegrationEvent(JSON.stringify(runner.request), {
      dataDir,
      dependencies: {
        resolveDataDir: (requested) => {
          if (!requested) throw new Error('Expected test data directory.');
          return requested;
        },
        createMemoryPort: async () => memoryPort,
      },
    });

    const failed = await run();
    expect(failed.response).toMatchObject({
      intent: 'capture_passive_learning',
      outcome: 'failed',
      retryable: true,
    });
    const saved = await run();
    expect(['confirmed', 'degraded']).toContain(saved.response.outcome);
    expect(saved.response).toMatchObject({ intent: 'capture_passive_learning', retryable: false });
    const duplicate = await run();
    expect(duplicate.response).toMatchObject({ intent: 'capture_passive_learning', outcome: 'no_op', retryable: false });

    expect(calls).toHaveLength(2);
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tool: 'mem_save',
        input: expect.objectContaining({
          kind: 'observation',
          type: 'learning',
          scope: 'project',
          session_id: 'claude-session',
          project: 'thoth-mem',
          content: 'Subagent finished.',
        }),
      }),
    ]));
    for (const secret of ['123e4567-e89b-42d3-a456-426614174000', 'SUBAGENT-OPTIONAL-DESCRIPTION', 'SUBAGENT-OPTIONAL-COMMAND', 'SUBAGENT-OPTIONAL-SCHEDULE', 'SUBAGENT-OPTIONAL-CRON-PROMPT']) {
      expect(JSON.stringify(calls)).not.toContain(secret);
      expect(JSON.stringify(saved.response)).not.toContain(secret);
    }
    expect(calls.some((call) => call.tool === 'mem_session')).toBe(false);
    expect(calls.some((call) => call.input.kind === 'prompt')).toBe(false);
    expect(saved.response).not.toHaveProperty('hostOutputDirective');
    expect(saved.response).not.toHaveProperty('deliveryState');
  });
});
