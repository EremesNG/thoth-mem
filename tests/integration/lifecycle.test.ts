import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';




import {
  CAPABILITY_STATES,
  LIFECYCLE_INTENTS,
  LIFECYCLE_OUTCOMES,
  type AdapterCapabilities,
  type HarnessId,
  type LifecycleIntent,
  type NormalizedEvent,
  type Clock,
} from '../../src/integration/core/types.js';
import {
  MemoryIntegrationCore,
  planLifecycleEffects,
} from '../../src/integration/core/lifecycle.js';
import {
  MAX_PASSIVE_LEARNING_CODE_POINTS,
  sanitizePassiveLearning,
  sanitizeRootPromptCapture,
} from '../../src/integration/core/sanitizer.js';
import {
  MEMORY_TOOL_NAMES,
  callMemoryTool,
  type MemoryCallResult,
  type MemoryPort,
  type MemoryToolName,
} from '../../src/integration/core/memory-port.js';
import { McpMemoryPort } from '../../src/integration/core/mcp-memory-port.js';
import {
  DEFAULT_LIFECYCLE_STATE_LIMITS,
  FileLifecycleStateStore,
  LifecycleStateCorruptionError,
  LifecycleStateLockError,
  type LifecycleLockMetadataPort,
} from '../../src/integration/core/state-store.js';
import { Store } from '../../src/store/index.js';
import { HOST_EVIDENCE } from '../fixtures/integration/host-evidence.js';

const harnesses: HarnessId[] = ['opencode', 'codex', 'claude'];

function supportedCapabilities(harness: HarnessId): AdapterCapabilities {
  return {
    enroll_session: { state: 'supported', trigger: `${harness}.start` },
    capture_root_prompt: { state: 'supported', trigger: `${harness}.prompt` },
    recall_guidance: { state: 'supported', trigger: `${harness}.instructions` },
    compact_session: { state: 'supported', trigger: `${harness}.compact` },
    finalize_session: { state: 'supported', trigger: `${harness}.stop` },
  };
}

function enrollmentEvent(harness: HarnessId): NormalizedEvent {
  return {
    harness,
    intent: 'enroll_session',
    actor: 'system',
    isRootSession: true,
    identity: {
      sessionId: 'root-session',
      project: 'host-neutral-project',
      cwd: '/workspace/host-neutral-project',
    },
    nativeEventId: `${harness}-native-event`,
    nativeEvent: `${harness}.session.created`,
  };
}

function eventForIntent(harness: HarnessId, intent: LifecycleIntent): NormalizedEvent {
  return {
    ...enrollmentEvent(harness),
    intent,
    actor: intent === 'capture_root_prompt' ? 'root_user' : 'system',
    content: intent === 'capture_root_prompt'
      ? 'Remember the lifecycle contract.'
      : intent === 'compact_session'
        ? 'Checkpoint before compaction.'
        : intent === 'finalize_session'
          ? 'Final session summary.'
          : undefined,
  };
}

describe('native integration lifecycle core', () => {
  it('packaged protocol guidance', async () => {
    const projectRoot = process.cwd();
    const protocolPath = join(projectRoot, 'src', 'integration', 'core', 'protocol.ts');
    const protocolSource = existsSync(protocolPath)
      ? readFileSync(protocolPath, 'utf8')
      : '';

    expect.soft(protocolSource).toContain('export const SERVER_MEMORY_PROTOCOL_INSTRUCTIONS');
    expect.soft(protocolSource).toContain('export function createMemoryProtocol');
    if (!protocolSource) {
      return;
    }

    const protocol = await import('../../src/integration/core/protocol.js');
    const serverSource = readFileSync(join(projectRoot, 'src', 'server.ts'), 'utf8');
    expect.soft(serverSource).toContain(
      'import { SERVER_MEMORY_PROTOCOL_INSTRUCTIONS } from "./integration/core/protocol.js";',
    );
    expect.soft(serverSource).toContain('instructions: SERVER_MEMORY_PROTOCOL_INSTRUCTIONS');
    expect.soft(serverSource).not.toContain('const SERVER_INSTRUCTIONS = `');

    const artifacts = new Map<string, string>([
      ['server', protocol.SERVER_MEMORY_PROTOCOL_INSTRUCTIONS],
      ['root skill', readFileSync(join(projectRoot, 'skills', 'thoth-mem', 'SKILL.md'), 'utf8')],
      [
        'OpenCode protocol',
        readFileSync(join(projectRoot, 'integrations', 'opencode', 'memory-protocol.md'), 'utf8'),
      ],
      [
        'Codex skill',
        readFileSync(
          join(projectRoot, 'integrations', 'codex', 'skills', 'thoth-mem', 'SKILL.md'),
          'utf8',
        ),
      ],
      [
        'Claude Code skill',
        readFileSync(
          join(projectRoot, 'integrations', 'claude-code', 'skills', 'thoth-mem', 'SKILL.md'),
          'utf8',
        ),
      ],
    ]);
    const expectedTools = [...MEMORY_TOOL_NAMES].sort();
    const semanticMarkers = [
      /root(?: session|\/orchestrator).*owns/i,
      /sub-?agents?.*(?:must not|never|exclude)/i,
      /real root-user intent/i,
      /generated prompts?.*(?:must not|never|do not)/i,
      /<private>/i,
      /stable root session ID.*project name/is,
      /native field.*runtime label/is,
      /project name.*(?:repository|workspace).*directory/is,
      /mem_session.*id.*root session ID/is,
      /session_id.*same root session ID/is,
      /supported.*degraded.*unsupported/i,
      /confirmed MCP success/i,
      /compaction.*retry-safe/i,
      /native enrollment.*prompt capture.*do not repeat/is,
      /semantic session summary.*agent-owned/is,
      /without waiting for a terminal hook/i,
      /duplicate event.*30-second.*canonical prompt row/is,
      /manual.*(?:degraded|unsupported)/i,
    ];

    for (const [name, guidance] of artifacts) {
      const tools = [...new Set(guidance.match(/\bmem_[a-z_]+\b/g) ?? [])].sort();
      expect.soft(tools, `${name} tool vocabulary`).toEqual(expectedTools);
      for (const marker of semanticMarkers) {
        expect.soft(guidance, `${name} must match ${marker}`).toMatch(marker);
      }
      expect.soft(guidance, `${name} must not introduce a root_id protocol`)
        .not.toMatch(/\broot_id\b/);
      expect.soft(guidance, `${name} must not introduce an injected identity declaration`)
        .not.toContain('THOTH_MEMORY_IDENTITY');
      expect.soft(guidance, `${name} must not require a terminal hook for semantic summary`)
        .not.toMatch(/summarize only (?:on|for) a verified root terminal event/i);
    }

    expect(artifacts.get('root skill')).toBe(artifacts.get('Codex skill'));
    expect(artifacts.get('root skill')).toBe(artifacts.get('Claude Code skill'));

    const memoryProtocol = protocol.createMemoryProtocol(supportedCapabilities('codex'));
    expect(memoryProtocol.systemInstructions()).toBe(protocol.SERVER_MEMORY_PROTOCOL_INSTRUCTIONS);
    expect(memoryProtocol.recallNudge({
      sessionId: 'root-session',
      project: 'project',
      cwd: '/project',
      source: 'explicit',
      degraded: false,
    })).toContain('mem_recall(mode="compact")');
    expect(memoryProtocol.compactionInstruction({
      sessionId: 'root-session',
      project: 'project',
      cwd: '/project',
      source: 'explicit',
      degraded: false,
    })).toContain('confirmed MCP success');
  });

  it('plans host-neutral lifecycle effects', () => {
    const plansByIntent = Object.fromEntries(LIFECYCLE_INTENTS.map((intent) => [
      intent,
      harnesses.map((harness) => planLifecycleEffects(
        eventForIntent(harness, intent),
        supportedCapabilities(harness),
      )),
    ])) as Record<LifecycleIntent, ReturnType<typeof planLifecycleEffects>[]>;
    const plans = plansByIntent.enroll_session;

    expect(plans.map((plan) => plan.effects)).toEqual([
      plans[0].effects,
      plans[0].effects,
      plans[0].effects,
    ]);
    expect(plans[0].effects).toEqual([
      {
        kind: 'memory_call',
        tool: 'mem_session',
        input: {
          action: 'start',
          id: 'root-session',
          project: 'host-neutral-project',
          directory: '/workspace/host-neutral-project',
        },
        transition: 'enrollment',
      },
      {
        kind: 'memory_call',
        tool: 'mem_context',
        input: {
          project: 'host-neutral-project',
          session_id: 'root-session',
        },
        transition: 'recovery_context',
      },
    ]);

    expect(plansByIntent.capture_root_prompt[0].effects).toEqual([{
      kind: 'memory_call',
      tool: 'mem_save',
      input: {
        kind: 'prompt',
        content: 'Remember the lifecycle contract.',
        session_id: 'root-session',
        project: 'host-neutral-project',
      },
      transition: 'prompt_capture',
    }]);
    expect(plansByIntent.recall_guidance[0].effects).toEqual([{
          kind: 'memory_call',
          tool: 'mem_context',
          input: {
            project: 'host-neutral-project',
            session_id: 'root-session',
          },
          transition: 'recovery_context',
        }]);
    expect(plansByIntent.compact_session[0].effects).toEqual([{
      kind: 'memory_call',
      tool: 'mem_session',
      input: {
        action: 'checkpoint',
        id: 'root-session',
        project: 'host-neutral-project',
        summary: 'Checkpoint before compaction.',
      },
      transition: 'compaction',
    }, {
      kind: 'memory_call',
      tool: 'mem_context',
      input: {
        project: 'host-neutral-project',
        session_id: 'root-session',
      },
      transition: 'recovery_context',
    }]);
    expect(plansByIntent.finalize_session[0].effects).toEqual([{
      kind: 'memory_call',
      tool: 'mem_session',
      input: {
        action: 'summary',
        id: 'root-session',
        project: 'host-neutral-project',
        content: 'Final session summary.',
      },
      transition: 'finalization',
    }]);

    for (const plansForIntent of Object.values(plansByIntent)) {
      expect(plansForIntent.map((plan) => plan.effects)).toEqual([
        plansForIntent[0].effects,
        plansForIntent[0].effects,
        plansForIntent[0].effects,
      ]);
    }

    const serializedEffects = JSON.stringify(plansByIntent);
    for (const harness of harnesses) {
      expect(serializedEffects).not.toContain(harness);
    }

    expect(CAPABILITY_STATES).toEqual(['supported', 'degraded', 'unsupported']);
    expect(LIFECYCLE_OUTCOMES).toEqual(['confirmed', 'failed', 'degraded', 'no_op']);
    expect(LIFECYCLE_INTENTS).toEqual([
      'enroll_session',
      'capture_root_prompt',
      'recall_guidance',
      'compact_session',
      'finalize_session',
    ]);
  });

it('keeps unproven terminal finalization degraded without disabling independent lifecycle capabilities', () => {
  const capabilities = supportedCapabilities('codex');
  capabilities.finalize_session = {
    state: 'degraded',
    reason: 'No verified terminal trigger for this host version.',
  };

  const finalization = planLifecycleEffects(
    eventForIntent('codex', 'finalize_session'),
    capabilities,
  );
  expect(finalization).toMatchObject({
    capabilityState: 'degraded',
    effects: [{
      kind: 'diagnostic',
      diagnostic: {
        capability: 'finalize_session',
        outcome: 'degraded',
        reason: 'No verified terminal trigger for this host version.',
      },
    }],
  });
  expect(finalization.effects.some((effect) => effect.kind === 'memory_call')).toBe(false);

  expect(planLifecycleEffects(
    eventForIntent('codex', 'enroll_session'),
    capabilities,
  ).effects.some((effect) => effect.kind === 'memory_call')).toBe(true);
  expect(planLifecycleEffects(
    eventForIntent('codex', 'compact_session'),
    capabilities,
  ).effects.some((effect) => effect.kind === 'memory_call')).toBe(true);
  expect(planLifecycleEffects(
    {
      ...eventForIntent('codex', 'capture_passive_learning'),
      actor: 'subagent',
      content: 'Independent passive learning.',
      passiveLearningEvidence: {
        terminalMappingId: 'codex-terminal-learning-v1',
        verifiedTerminalOutput: true,
      },
    },
    capabilities,
  ).effects.some((effect) => effect.kind === 'memory_call')).toBe(true);
});



  it('sanitizes root prompt capture', () => {
    const rootPrompt = (content: string): NormalizedEvent => ({
      ...eventForIntent('codex', 'capture_root_prompt'),
      content,
    });

    expect(sanitizeRootPromptCapture(rootPrompt('Public request.'))).toEqual({
      action: 'persist',
      content: 'Public request.',
      truncated: false,
      privacyDegraded: false,
    });
    expect(sanitizeRootPromptCapture({
      ...rootPrompt('delegated prompt'),
      actor: 'subagent',
    })).toEqual({ action: 'skip', reason: 'not_root_user' });
    expect(sanitizeRootPromptCapture({
      ...rootPrompt('generated handoff'),
      actor: 'system',
    })).toEqual({ action: 'skip', reason: 'not_root_user' });
    expect(sanitizeRootPromptCapture({
      ...rootPrompt('assistant output'),
      actor: 'assistant',
    })).toEqual({ action: 'skip', reason: 'not_root_user' });
    expect(sanitizeRootPromptCapture({
      ...rootPrompt('tool scaffold'),
      actor: 'tool',
    })).toEqual({ action: 'skip', reason: 'not_root_user' });
    expect(sanitizeRootPromptCapture({
      ...rootPrompt('child-session input'),
      isRootSession: false,
    })).toEqual({ action: 'skip', reason: 'not_root_session' });

    expect(sanitizeRootPromptCapture(rootPrompt(
      'Keep this. <private>never persist this</private> Keep that.',
    ))).toEqual({
      action: 'persist',
      content: 'Keep this.  Keep that.',
      truncated: false,
      privacyDegraded: false,
    });
    expect(sanitizeRootPromptCapture(rootPrompt(
      'Retain this prefix.<private>drop this ambiguous suffix',
    ))).toEqual({
      action: 'persist',
      content: 'Retain this prefix.',
      truncated: false,
      privacyDegraded: true,
    });
    expect(sanitizeRootPromptCapture(rootPrompt(
      'Ambiguous close </private> must reject everything.',
    ))).toEqual({ action: 'skip', reason: 'malformed_private_tag' });
    expect(sanitizeRootPromptCapture(rootPrompt(
      '<private>entirely secret</private>',
    ))).toEqual({ action: 'skip', reason: 'private_only' });

    const unicodePrompt = `${'😀'.repeat(7_999)}éZ`;
    const unicodeResult = sanitizeRootPromptCapture(rootPrompt(unicodePrompt));
    expect(unicodeResult).toMatchObject({ action: 'persist', truncated: true });
    if (unicodeResult.action !== 'persist') {
      throw new Error('Expected Unicode prompt to remain persistable');
    }
    expect(Array.from(unicodeResult.content)).toHaveLength(8_000);
    expect(unicodeResult.content.endsWith('é')).toBe(true);
    expect(unicodeResult.content).not.toContain('Z');

    expect(sanitizeRootPromptCapture(rootPrompt('line one\r\nline two\rline three'))).toMatchObject({
      action: 'persist',
      content: 'line one\nline two\nline three',
    });

    const sanitizedPlan = planLifecycleEffects(
      rootPrompt('Public <private>secret</private> request.'),
      supportedCapabilities('codex'),
    );
    expect(sanitizedPlan.effects).toEqual([{
      kind: 'memory_call',
      tool: 'mem_save',
      input: {
        kind: 'prompt',
        content: 'Public  request.',
        session_id: 'root-session',
        project: 'host-neutral-project',
      },
      transition: 'prompt_capture',
    }]);
    expect(planLifecycleEffects(
      { ...rootPrompt('generated handoff'), actor: 'subagent' },
      supportedCapabilities('codex'),
    ).effects).toEqual([]);
  });

  it('sanitizes root prompt capture safety metadata through final outcomes', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-prompt-safety-'));
    const capabilities = supportedCapabilities('codex');
    const stateStore = new FileLifecycleStateStore({
      dataDir,
      harness: 'codex',
      projectId: 'prompt-safety-project',
      rootSessionId: 'prompt-safety-session',
      capabilities,
    });
    const memoryPort: MemoryPort = {
      async call() {
        return {
          confirmed: true,
          isError: false,
          text: 'Prompt saved (prompt ID: 71).',
          reference: { kind: 'prompt', id: 71 },
        };
      },
      async close() {},
    };
    const core = new MemoryIntegrationCore({ capabilities, memoryPort, stateStore });
    const promptEvent = (content: string, nativeEventId: string): NormalizedEvent => ({
      harness: 'codex',
      intent: 'capture_root_prompt',
      actor: 'root_user',
      isRootSession: true,
      identity: {
        sessionId: 'prompt-safety-session',
        project: 'prompt-safety-project',
        cwd: dataDir,
      },
      nativeEventId,
      content,
      nativeEvent: 'user.prompt',
    });

    try {
      const truncatedEvent = promptEvent(`${'😀'.repeat(8_000)}Z`, 'truncated-prompt');
      expect(planLifecycleEffects(truncatedEvent, capabilities)).toMatchObject({
        promptCapture: {
          action: 'persist',
          truncated: true,
          privacyDegraded: false,
        },
      });
      const truncatedResult = await core.handle(truncatedEvent);
      expect(truncatedResult).toMatchObject({
        outcome: 'degraded',
        promptCapture: {
          action: 'persist',
          truncated: true,
          privacyDegraded: false,
        },
        diagnostic: { outcome: 'degraded' },
      });
      expect(truncatedResult.diagnostic?.reason.toLowerCase()).toContain('truncat');

      const partialPrivateEvent = promptEvent(
        'Retain this.<private>SECRET_SUFFIX',
        'partial-private-prompt',
      );
      const partialResult = await core.handle(partialPrivateEvent);
      expect(partialResult).toMatchObject({
        outcome: 'degraded',
        promptCapture: {
          action: 'persist',
          truncated: false,
          privacyDegraded: true,
        },
      });
      expect(partialResult.diagnostic?.reason.toLowerCase()).toContain('private');
      expect(partialResult.diagnostic?.reason).not.toContain('SECRET_SUFFIX');

      const rejectedEvent = promptEvent(
        'Public prefix </private> REJECTED_SECRET',
        'rejected-private-prompt',
      );
      expect(planLifecycleEffects(rejectedEvent, capabilities)).toMatchObject({
        promptCapture: {
          action: 'skip',
          reason: 'malformed_private_tag',
          truncated: false,
          privacyDegraded: true,
        },
        effects: [],
      });
      const rejectedResult = await core.handle(rejectedEvent);
      expect(rejectedResult).toMatchObject({
        outcome: 'degraded',
        effects: [],
        promptCapture: {
          action: 'skip',
          reason: 'malformed_private_tag',
        },
        diagnostic: { outcome: 'degraded' },
      });
      expect(rejectedResult.diagnostic?.reason).not.toContain('REJECTED_SECRET');
    } finally {
      await memoryPort.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('uses only the six-tool MemoryPort', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-linked-memory-port-'));
    const port = await McpMemoryPort.create({ dataDir });

    try {
      expect(MEMORY_TOOL_NAMES).toEqual([
        'mem_save',
        'mem_recall',
        'mem_context',
        'mem_get',
        'mem_project',
        'mem_session',
      ]);

      const start = await port.call('mem_session', {
        action: 'start',
        id: 'linked-root-session',
        project: 'linked-project',
        directory: dataDir,
      });
      expect(start).toMatchObject({ confirmed: true, isError: false });

      const saved = await port.call('mem_save', {
        kind: 'prompt',
        content: 'Linked public MCP prompt.',
        session_id: 'linked-root-session',
        project: 'linked-project',
      });
      expect(saved).toMatchObject({
        confirmed: true,
        isError: false,
        reference: { kind: 'prompt', id: expect.any(Number) },
      });
      if (!saved.reference) {
        throw new Error('Expected linked mem_save to return a prompt reference');
      }

      expect(await port.call('mem_get', {
        kind: 'prompt',
        id: saved.reference.id,
      })).toMatchObject({ confirmed: true, isError: false });
      expect(await port.call('mem_context', {
        project: 'linked-project',
        session_id: 'linked-root-session',
      })).toMatchObject({ confirmed: true, isError: false });
      expect(await port.call('mem_recall', {
        query: 'linked public MCP prompt',
        mode: 'compact',
        project: 'linked-project',
        limit: 1,
      })).toMatchObject({ confirmed: true, isError: false });
      expect(await port.call('mem_project', {
        action: 'list',
      })).toMatchObject({ confirmed: true, isError: false });

      await expect(callMemoryTool(port, 'mem_admin', {})).rejects.toThrow(
        'Memory tool is not allowlisted: mem_admin',
      );
    } finally {
      await port.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('recovers bounded lifecycle state', async () => {
    class AdvancingClock implements Clock {
      constructor(private current = new Date('2026-07-09T12:00:00.000Z')) {}

      now(): Date {
        return new Date(this.current);
      }

      async sleep(ms: number): Promise<void> {
        this.current = new Date(this.current.getTime() + ms);
      }
    }

    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-lifecycle-state-'));
    const clock = new AdvancingClock();
    const options = {
      dataDir,
      harness: 'codex' as const,
      projectId: 'bounded-project',
      rootSessionId: 'bounded-root-session',
      capabilities: supportedCapabilities('codex'),
      clock,
    };
    const store = new FileLifecycleStateStore(options);

    try {
      expect(DEFAULT_LIFECYCLE_STATE_LIMITS).toEqual({
        maxEventKeys: 16_384,
        maxStateBytes: 1_048_576,
        lockTimeoutMs: 2_000,
        lockPollMs: 25,
        finalizedRetentionMs: 30 * 24 * 60 * 60 * 1_000,
      });

      const eventKey = await store.createEventKey({
        intent: 'capture_root_prompt',
        actor: 'root_user',
        nativeEventId: 'native-message-1',
        sanitizedContent: 'content that must never enter lifecycle state',
      });
      expect(eventKey).toMatchObject({ status: 'stable', key: expect.stringMatching(/^[a-f0-9]{64}$/) });
      const repeatedKey = await store.createEventKey({
        intent: 'capture_root_prompt',
        actor: 'root_user',
        nativeEventId: 'native-message-1',
        sanitizedContent: 'content that must never enter lifecycle state',
      });
      expect(repeatedKey).toEqual(eventKey);
      if (eventKey.status !== 'stable') {
        throw new Error('Expected native message identity to produce a stable HMAC key');
      }

      const firstOutcome = await store.runExclusive(async (transaction) => {
        transaction.confirmEnrollment(clock.now().toISOString());
        return transaction.confirmEvent({
          key: eventKey.key,
          intent: 'capture_root_prompt',
          confirmedAt: clock.now().toISOString(),
          canonicalPromptId: 41,
        });
      });
      expect(firstOutcome).toBe('confirmed');

      const restartedStore = new FileLifecycleStateStore(options);
      const recovered = await restartedStore.read();
      expect(recovered).toMatchObject({
        schemaVersion: 1,
        harness: 'codex',
        projectId: 'bounded-project',
        rootSessionId: 'bounded-root-session',
        enrollment: { status: 'confirmed' },
        confirmedEvents: [{
          key: eventKey.key,
          intent: 'capture_root_prompt',
          canonicalPromptId: 41,
        }],
        terminal: { status: 'open' },
        dedupState: 'supported',
      });
      expect(JSON.stringify(recovered)).not.toContain('content that must never enter lifecycle state');

      expect(await restartedStore.runExclusive(async (transaction) => transaction.confirmEvent({
        key: eventKey.key,
        intent: 'capture_root_prompt',
        confirmedAt: clock.now().toISOString(),
        canonicalPromptId: 41,
      }))).toBe('duplicate');
      expect((await restartedStore.read()).confirmedEvents).toHaveLength(1);

      expect(await store.createEventKey({
        intent: 'capture_root_prompt',
        actor: 'root_user',
        sanitizedContent: 'unstable evidence',
      })).toEqual({
        status: 'degraded',
        reason: 'missing_stable_event_evidence',
      });

      let releaseLock: (() => void) | undefined;
      let announceLock: (() => void) | undefined;
      const lockHeld = new Promise<void>((resolve) => { announceLock = resolve; });
      const release = new Promise<void>((resolve) => { releaseLock = resolve; });
      const holder = store.runExclusive(async () => {
        announceLock?.();
        await release;
      });
      await lockHeld;
      await expect(store.runExclusive(async () => undefined)).rejects.toBeInstanceOf(LifecycleStateLockError);
      releaseLock?.();
      await holder;

      const boundedStore = new FileLifecycleStateStore({
        ...options,
        rootSessionId: 'bounded-eviction-session',
        limits: { maxEventKeys: 2, maxStateBytes: 2_048, lockTimeoutMs: 50, lockPollMs: 5 },
      });
      const boundedKeys = await Promise.all([1, 2, 3].map(async (index) => {
        const result = await boundedStore.createEventKey({
          intent: 'capture_root_prompt',
          actor: 'root_user',
          nativeEventId: `bounded-${index}`,
        });
        if (result.status !== 'stable') {
          throw new Error('Expected bounded fixture to have stable event identity');
        }
        return result.key;
      }));
      const boundedOutcomes: string[] = [];
      for (const key of boundedKeys) {
        boundedOutcomes.push(await boundedStore.runExclusive(async (transaction) => transaction.confirmEvent({
          key,
          intent: 'capture_root_prompt',
          confirmedAt: clock.now().toISOString(),
        })));
      }
      expect(boundedOutcomes).toEqual(['confirmed', 'confirmed', 'degraded']);
      const boundedState = await boundedStore.read();
      expect(boundedState.dedupState).toBe('degraded');
      expect(boundedState.confirmedEvents).toHaveLength(2);
      expect(boundedState.confirmedEvents.map((entry) => entry.key)).toEqual(boundedKeys.slice(1));
      expect(Buffer.byteLength(JSON.stringify(boundedState), 'utf8')).toBeLessThanOrEqual(2_048);

      const boundedStateDirectory = join(dataDir, 'integrations', 'state', 'codex');
      const boundedStateFile = readdirSync(boundedStateDirectory).find((name) => {
        if (!name.endsWith('.json')) {
          return false;
        }
        const candidate = JSON.parse(
          readFileSync(join(boundedStateDirectory, name), 'utf8'),
        ) as { rootSessionId?: string };
        return candidate.rootSessionId === 'bounded-eviction-session';
      });
      if (!boundedStateFile) {
        throw new Error('Expected bounded lifecycle state file');
      }
      const boundedStatePath = join(boundedStateDirectory, boundedStateFile);
      const persistedDegradedState = JSON.parse(
        readFileSync(boundedStatePath, 'utf8'),
      ) as { confirmedEvents: unknown[] };
      persistedDegradedState.confirmedEvents = persistedDegradedState.confirmedEvents.slice(1);
      writeFileSync(boundedStatePath, JSON.stringify(persistedDegradedState));

      const fourthKeyResult = await boundedStore.createEventKey({
        intent: 'capture_root_prompt',
        actor: 'root_user',
        nativeEventId: 'bounded-4',
      });
      if (fourthKeyResult.status !== 'stable') {
        throw new Error('Expected fourth bounded fixture to have stable event identity');
      }
      expect(await boundedStore.runExclusive(async (transaction) => transaction.confirmEvent({
        key: fourthKeyResult.key,
        intent: 'capture_root_prompt',
        confirmedAt: clock.now().toISOString(),
      }))).toBe('degraded');
      expect((await boundedStore.read()).dedupState).toBe('degraded');

      if (eventKey.status === 'stable') {
        if (process.platform === 'win32') {
          expect(eventKey.protection).toEqual({
            state: 'degraded',
            reason: 'windows_acl_not_enforced_by_node_mode',
          });
        } else {
          expect(eventKey.protection).toEqual({ state: 'supported' });
          const secretPath = join(dataDir, 'integrations', 'state', '.event-key-secret');
          expect(statSync(secretPath).mode & 0o077).toBe(0);
        }
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('recovers bounded lifecycle state from dead and partial lock owners', async () => {
    class LockClock implements Clock {
      constructor(private current = new Date('2026-07-09T13:00:00.000Z')) {}

      now(): Date {
        return new Date(this.current);
      }

      async sleep(ms: number): Promise<void> {
        this.current = new Date(this.current.getTime() + ms);
      }
    }

    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-stale-lock-'));
    const clock = new LockClock();
    const store = new FileLifecycleStateStore({
      dataDir,
      harness: 'codex',
      projectId: 'stale-lock-project',
      rootSessionId: 'stale-lock-session',
      capabilities: supportedCapabilities('codex'),
      clock,
      limits: { lockTimeoutMs: 25, lockPollMs: 5 },
    });

    try {
      const key = await store.createEventKey({
        intent: 'enroll_session',
        actor: 'system',
        nativeEventId: 'seed-state',
      });
      if (key.status !== 'stable') {
        throw new Error('Expected seed event identity');
      }
      await store.runExclusive(async (transaction) => transaction.confirmEvent({
        key: key.key,
        intent: 'enroll_session',
        confirmedAt: clock.now().toISOString(),
      }));
      const stateDirectory = join(dataDir, 'integrations', 'state', 'codex');
      const stateFile = readdirSync(stateDirectory).find((name) => name.endsWith('.json'));
      if (!stateFile) {
        throw new Error('Expected persisted lifecycle state fixture');
      }
      const lockPath = join(stateDirectory, `${stateFile}.lock`);

      writeFileSync(lockPath, JSON.stringify({
        schemaVersion: 1,
        pid: 2_147_483_647,
        ownerToken: randomUUID(),
        createdAt: clock.now().toISOString(),
      }));
      await expect(store.runExclusive(async () => 'dead-owner-recovered')).resolves.toBe('dead-owner-recovered');
      expect(existsSync(lockPath)).toBe(false);

      writeFileSync(lockPath, '{"schemaVersion":1');
      await expect(store.runExclusive(async () => 'partial-lock-recovered')).resolves.toBe('partial-lock-recovered');
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('recovers bounded lifecycle state after lock metadata persistence fails', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-lock-write-failure-'));
    const lockMetadataPort: LifecycleLockMetadataPort = {
      async persist(file, metadata) {
        await file.writeFile(JSON.stringify(metadata));
        throw new Error('simulated lock metadata sync failure');
      },
    };
    const options = {
      dataDir,
      harness: 'codex' as const,
      projectId: 'lock-write-project',
      rootSessionId: 'lock-write-session',
      capabilities: supportedCapabilities('codex'),
    };
    const failingStore = new FileLifecycleStateStore({ ...options, lockMetadataPort });

    try {
      await expect(failingStore.runExclusive(async () => undefined)).rejects.toThrow(
        'simulated lock metadata sync failure',
      );
      const stateDirectory = join(dataDir, 'integrations', 'state', 'codex');
      expect(readdirSync(stateDirectory).filter((name) => name.endsWith('.lock'))).toEqual([]);

      const healthyStore = new FileLifecycleStateStore(options);
      await expect(healthyStore.runExclusive(async () => 'healthy')).resolves.toBe('healthy');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('recovers bounded lifecycle state by rejecting malformed nested state and mapping secret errors', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-corrupt-state-'));
    const capabilities = supportedCapabilities('codex');
    const options = {
      dataDir,
      harness: 'codex' as const,
      projectId: 'corrupt-project',
      rootSessionId: 'corrupt-session',
      capabilities,
    };
    const store = new FileLifecycleStateStore(options);
    const memoryPort: MemoryPort = {
      async call() {
        return { confirmed: true, isError: false, text: 'confirmed' };
      },
      async close() {},
    };

    try {
      const key = await store.createEventKey({
        intent: 'enroll_session',
        actor: 'system',
        nativeEventId: 'corrupt-state-seed',
      });
      if (key.status !== 'stable') {
        throw new Error('Expected corruption fixture event identity');
      }
      await store.runExclusive(async (transaction) => transaction.confirmEvent({
        key: key.key,
        intent: 'enroll_session',
        confirmedAt: new Date().toISOString(),
      }));
      const stateDirectory = join(dataDir, 'integrations', 'state', 'codex');
      const stateFile = readdirSync(stateDirectory).find((name) => name.endsWith('.json'));
      if (!stateFile) {
        throw new Error('Expected corruption state file');
      }
      const statePath = join(stateDirectory, stateFile);
      const malformedState = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>;
      malformedState.confirmedEvents = [{
        key: 'not-an-hmac',
        intent: 'not-an-intent',
        confirmedAt: 'not-a-timestamp',
        canonicalPromptId: -1,
      }];
      writeFileSync(statePath, JSON.stringify(malformedState));
      await expect(store.read()).rejects.toBeInstanceOf(LifecycleStateCorruptionError);

      const secretDataDir = join(dataDir, 'secret-error');
      const secretStore = new FileLifecycleStateStore({
        ...options,
        dataDir: secretDataDir,
        rootSessionId: 'secret-error-session',
      });
      await secretStore.createEventKey({
        intent: 'capture_root_prompt',
        actor: 'root_user',
        nativeEventId: 'create-secret',
      });
      writeFileSync(
        join(secretDataDir, 'integrations', 'state', '.event-key-secret'),
        'CORRUPT_SECRET_WITH_PRIVATE_MARKER',
      );
      const core = new MemoryIntegrationCore({
        capabilities,
        memoryPort,
        stateStore: secretStore,
      });
      const result = await core.handle({
        harness: 'codex',
        intent: 'capture_root_prompt',
        actor: 'root_user',
        isRootSession: true,
        identity: {
          sessionId: 'secret-error-session',
          project: 'corrupt-project',
          cwd: secretDataDir,
        },
        nativeEventId: 'secret-error-event',
        content: 'Public <private>RAW_PRIVATE_CONTENT</private> request.',
        nativeEvent: 'user.prompt',
      });
      expect(result).toMatchObject({
        outcome: 'failed',
        retryable: false,
        effects: [],
        identity: {
          rootSessionId: 'secret-error-session',
          projectId: 'corrupt-project',
        },
        diagnostic: { outcome: 'failed' },
      });
      expect(JSON.stringify(result)).not.toContain('RAW_PRIVATE_CONTENT');
      expect(JSON.stringify(result)).not.toContain('CORRUPT_SECRET_WITH_PRIVATE_MARKER');
    } finally {
      await memoryPort.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('confirms canonical prompt persistence', async () => {
    class ScriptedMemoryPort implements MemoryPort {
      readonly calls: Array<{ tool: MemoryToolName; input: Record<string, unknown> }> = [];

      constructor(private readonly results: MemoryCallResult[]) {}

      async call(tool: MemoryToolName, input: Record<string, unknown>): Promise<MemoryCallResult> {
        this.calls.push({ tool, input });
        return this.results.shift() ?? { confirmed: true, isError: false, text: 'confirmed' };
      }

      async close(): Promise<void> {}
    }

    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-confirmed-lifecycle-'));
    const retryCapabilities = supportedCapabilities('codex');
    retryCapabilities.recall_guidance = {
      state: 'unsupported',
      reason: 'No injected recovery context in this fixture.',
    };
    const retryState = new FileLifecycleStateStore({
      dataDir,
      harness: 'codex',
      projectId: 'retry-project',
      rootSessionId: 'retry-root-session',
      capabilities: retryCapabilities,
    });
    const scriptedPort = new ScriptedMemoryPort([
      { confirmed: false, isError: true, text: 'simulated transport failure' },
      { confirmed: true, isError: false, text: 'Session started: retry-root-session (retry-project)' },
    ]);
    const retryCore = new MemoryIntegrationCore({
      capabilities: retryCapabilities,
      memoryPort: scriptedPort,
      stateStore: retryState,
    });
    const retryEvent: NormalizedEvent = {
      harness: 'codex',
      intent: 'enroll_session',
      actor: 'system',
      isRootSession: true,
      identity: {
        sessionId: 'retry-root-session',
        project: 'retry-project',
        cwd: dataDir,
      },
      nativeEventId: 'retry-start-event',
      nativeEvent: 'session.start',
    };

    try {
      expect(await retryCore.handle(retryEvent)).toMatchObject({
        outcome: 'failed',
        retryable: true,
      });
      expect(await retryState.read()).toMatchObject({
        enrollment: { status: 'pending' },
        confirmedEvents: [],
      });

      expect(await retryCore.handle(retryEvent)).toMatchObject({
        outcome: 'confirmed',
        retryable: false,
      });
      expect(await retryState.read()).toMatchObject({
        enrollment: { status: 'confirmed' },
        confirmedEvents: [{ intent: 'enroll_session' }],
      });

      expect(await retryCore.handle(retryEvent)).toMatchObject({
        outcome: 'no_op',
        retryable: false,
        effects: [],
      });
      expect(scriptedPort.calls).toHaveLength(2);

      const linkedDataDir = join(dataDir, 'linked');
      const linkedPort = await McpMemoryPort.create({ dataDir: linkedDataDir });
      const linkedCapabilities = supportedCapabilities('codex');
      const linkedState = new FileLifecycleStateStore({
        dataDir: linkedDataDir,
        harness: 'codex',
        projectId: 'canonical-project',
        rootSessionId: 'canonical-root-session',
        capabilities: linkedCapabilities,
      });
      const linkedCore = new MemoryIntegrationCore({
        capabilities: linkedCapabilities,
        memoryPort: linkedPort,
        stateStore: linkedState,
      });
      const promptEvent = (nativeEventId: string): NormalizedEvent => ({
        harness: 'codex',
        intent: 'capture_root_prompt',
        actor: 'root_user',
        isRootSession: true,
        identity: {
          sessionId: 'canonical-root-session',
          project: 'canonical-project',
          cwd: linkedDataDir,
        },
        nativeEventId,
        content: 'Byte-identical intentional prompt.',
        nativeEvent: 'user.prompt',
      });

      try {
        const first = await linkedCore.handle(promptEvent('prompt-event-1'));
        const second = await linkedCore.handle(promptEvent('prompt-event-2'));
        expect(first).toMatchObject({
          outcome: 'confirmed',
          effects: [{ reference: { kind: 'prompt', id: expect.any(Number) } }],
        });
        expect(second).toMatchObject({
          outcome: 'confirmed',
          effects: [{ reference: { kind: 'prompt', id: expect.any(Number) } }],
        });
        if (process.platform === 'win32') {
          expect(first).toMatchObject({
            state: {
              protection: {
                state: 'degraded',
                reason: 'windows_acl_not_enforced_by_node_mode',
              },
            },
            diagnostic: {
              outcome: 'degraded',
              reason: expect.stringContaining('cannot be verified'),
              recovery: expect.stringContaining('filesystem ACL'),
            },
          });
        } else {
          expect(first.state?.protection).toEqual({ state: 'supported' });
          expect(first.diagnostic).toBeUndefined();
          const secretPath = join(linkedDataDir, 'integrations', 'state', '.event-key-secret');
          expect(statSync(secretPath).mode & 0o077).toBe(0);
        }
        expect(second.effects[0].reference?.id).toBe(first.effects[0].reference?.id);

        const persistedState = await linkedState.read();
        expect(persistedState.confirmedEvents).toHaveLength(2);
        expect(persistedState.confirmedEvents.map((event) => event.canonicalPromptId)).toEqual([
          first.effects[0].reference?.id,
          first.effects[0].reference?.id,
        ]);

        const duplicate = await linkedCore.handle(promptEvent('prompt-event-1'));
        expect(duplicate).toMatchObject({
          outcome: 'no_op',
          effects: [],
          state: { protection: first.state?.protection },
        });
        if (process.platform === 'win32') {
          expect(duplicate.diagnostic?.recovery).toContain('filesystem ACL');
        }
        expect((await linkedState.read()).confirmedEvents).toHaveLength(2);
      } finally {
        await linkedPort.close();
      }
    } finally {
      await scriptedPort.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('preserves canonical prompt and retrieval behavior', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-fixed-retrieval-parity-'));
    const databasePath = join(dataDir, 'thoth.db');
    const fixtureStore = new Store(databasePath);
    const savedFixture = fixtureStore.saveObservation({
      title: 'Fixed retrieval parity',
      content: 'Fixed adapter-independent retrieval evidence.',
      type: 'decision',
      session_id: 'fixed-parity-session',
      project: 'fixed-parity-project',
      scope: 'project',
      topic_key: 'fixed/parity',
    });
    fixtureStore.close();

    const fixtureDatabase = new Database(databasePath);
    try {
      fixtureDatabase.prepare(
        "UPDATE sessions SET started_at = '2026-07-09 12:00:00' WHERE id = ?",
      ).run('fixed-parity-session');
      fixtureDatabase.prepare(
        "UPDATE observations SET created_at = '2026-07-09 12:00:01', updated_at = '2026-07-09 12:00:01' WHERE id = ?",
      ).run(savedFixture.observation.id);
    } finally {
      fixtureDatabase.close();
    }

    const linkedPort = await McpMemoryPort.create({ dataDir });
    const fixedRequests: Array<{
      input: Record<string, unknown>;
      name: 'context' | 'get' | 'project' | 'recall';
      tool: MemoryToolName;
    }> = [
      {
        name: 'recall',
        tool: 'mem_recall',
        input: {
          query: 'adapter independent retrieval evidence',
          mode: 'compact',
          project: 'fixed-parity-project',
          limit: 5,
          hyde: false,
        },
      },
      {
        name: 'context',
        tool: 'mem_context',
        input: {
          project: 'fixed-parity-project',
          session_id: 'fixed-parity-session',
          limit: 5,
          max_chars: 4000,
        },
      },
      {
        name: 'get',
        tool: 'mem_get',
        input: { kind: 'observation', id: savedFixture.observation.id },
      },
      {
        name: 'project',
        tool: 'mem_project',
        input: {
          action: 'summary',
          project: 'fixed-parity-project',
          limit: 5,
          max_chars: 4000,
        },
      },
    ];
    const readFixedOutputs = async (): Promise<Record<string, MemoryCallResult>> => {
      const output: Record<string, MemoryCallResult> = {};
      for (const request of fixedRequests) {
        output[request.name] = await linkedPort.call(request.tool, request.input);
      }
      return output;
    };

    try {
      const beforeEnablement = await readFixedOutputs();
      const promptCapabilities: AdapterCapabilities = {
            enroll_session: { state: 'unsupported', reason: 'Not exercised by this contract test.' },
            capture_root_prompt: { state: 'supported', trigger: 'UserPromptSubmit' },
            recall_guidance: { state: 'unsupported', reason: 'Not exercised by this contract test.' },
            compact_session: { state: 'unsupported', reason: 'Not exercised by this contract test.' },
            finalize_session: { state: 'unsupported', reason: 'Not exercised by this contract test.' },
          };
          const afterEnablement = await readFixedOutputs();

      expect(JSON.stringify(afterEnablement)).toBe(JSON.stringify(beforeEnablement));

      let promptSaveCalls = 0;
      const countingPort: MemoryPort = {
        async call(tool, input) {
          if (tool === 'mem_save' && input.kind === 'prompt') {
            promptSaveCalls += 1;
          }
          return linkedPort.call(tool, input);
        },
        async close() {},
      };
      const lifecycleState = new FileLifecycleStateStore({
        dataDir: join(dataDir, 'lifecycle-state'),
        harness: 'codex',
        projectId: 'canonical-parity-project',
        rootSessionId: 'canonical-parity-session',
        capabilities: promptCapabilities,
      });
      const core = new MemoryIntegrationCore({
        capabilities: promptCapabilities,
        memoryPort: countingPort,
        stateStore: lifecycleState,
      });
      const promptEvent = (nativeEventId: string): NormalizedEvent => ({
        harness: 'codex',
        intent: 'capture_root_prompt',
        actor: 'root_user',
        isRootSession: true,
        identity: {
          sessionId: 'canonical-parity-session',
          project: 'canonical-parity-project',
          cwd: dataDir,
        },
        nativeEventId,
        content: 'Byte-identical parity prompt.',
        nativeEvent: 'UserPromptSubmit',
      });

      const first = await core.handle(promptEvent('parity-event-1'));
      const duplicate = await core.handle(promptEvent('parity-event-1'));
      const distinct = await core.handle(promptEvent('parity-event-2'));

      expect(first).toMatchObject({
        outcome: 'confirmed',
        effects: [{ reference: { kind: 'prompt', id: expect.any(Number) } }],
      });
      expect(duplicate).toMatchObject({ outcome: 'no_op', effects: [] });
      expect(distinct).toMatchObject({
        outcome: 'confirmed',
        effects: [{ reference: { kind: 'prompt', id: first.effects[0].reference?.id } }],
      });
      expect(promptSaveCalls).toBe(2);
    } finally {
      await linkedPort.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('rejects multi-harness contract expansion', () => {
    const projectRoot = process.cwd();
    const integrationRoot = join(projectRoot, 'src', 'integration');
    const pendingDirectories = [integrationRoot];
    const integrationFiles: string[] = [];

    while (pendingDirectories.length > 0) {
      const directory = pendingDirectories.pop();
      if (!directory) {
        continue;
      }
      for (const entry of readdirSync(directory)) {
        const entryPath = join(directory, entry);
        const stat = statSync(entryPath);
        if (stat.isDirectory()) {
          pendingDirectories.push(entryPath);
        } else if (entry.endsWith('.ts')) {
          integrationFiles.push(entryPath);
        }
      }
    }

    const hasDirectStoreAccess = (source: string): boolean => {
      const imports = [...source.matchAll(
        /(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g,
      )].map((match) => match[1].replaceAll('\\', '/'));
      const importsStoreClassModule = imports.some((specifier) => (
        /(?:^|\/)store\/index(?:\.js)?$/.test(specifier)
      ));
      const importsStoreBinding = /\bimport(?:\s+type)?\s+(?:Store\b|\*\s+as\s+Store\b|\{[^}]*\bStore\b[^}]*\})\s+from\s+['"][^'"]+['"]/.test(source);
      return importsStoreClassModule
        || importsStoreBinding
        || /\bnew\s+Store\s*\(|\bStore\s*\./.test(source);
    };
    const directStoreAccess: string[] = [];
    for (const filePath of integrationFiles.sort()) {
      const source = readFileSync(filePath, 'utf8');
      if (hasDirectStoreAccess(source)) {
        directStoreAccess.push(filePath.slice(projectRoot.length + 1).replaceAll('\\', '/'));
      }
    }

    expect(directStoreAccess).toEqual([]);
    expect(hasDirectStoreAccess(
      "import { Store } from '../../store/index.js';\nconst store = new Store(':memory:');",
    )).toBe(true);
    expect(hasDirectStoreAccess(
      "import type { Store } from '../../store/index.js';\nlet store: Store;",
    )).toBe(true);
    expect(hasDirectStoreAccess(
      "import { Store as MemoryStore } from '../../store/custom.js';",
    )).toBe(true);
    expect(hasDirectStoreAccess(
      "import { resolveSaveIdentity } from '../../store/identity.js';",
    )).toBe(false);
  });

  it('confirms canonical prompt persistence while surfacing sticky degraded state', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-sticky-degraded-core-'));
    const capabilities = supportedCapabilities('codex');
    const stateStore = new FileLifecycleStateStore({
      dataDir,
      harness: 'codex',
      projectId: 'sticky-project',
      rootSessionId: 'sticky-session',
      capabilities,
      limits: { maxEventKeys: 2 },
    });
    const memoryPort: MemoryPort = {
      async call() {
        return {
          confirmed: true,
          isError: false,
          text: 'Prompt saved (prompt ID: 91).',
          reference: { kind: 'prompt', id: 91 },
        };
      },
      async close() {},
    };

    try {
      for (const index of [1, 2, 3]) {
        const key = await stateStore.createEventKey({
          intent: 'capture_root_prompt',
          actor: 'root_user',
          nativeEventId: `sticky-seed-${index}`,
        });
        if (key.status !== 'stable') {
          throw new Error('Expected sticky seed identity');
        }
        await stateStore.runExclusive(async (transaction) => transaction.confirmEvent({
          key: key.key,
          intent: 'capture_root_prompt',
          confirmedAt: new Date().toISOString(),
          canonicalPromptId: 90,
        }));
      }

      const stateDirectory = join(dataDir, 'integrations', 'state', 'codex');
      const stateFile = readdirSync(stateDirectory).find((name) => name.endsWith('.json'));
      if (!stateFile) {
        throw new Error('Expected sticky state file');
      }
      const statePath = join(stateDirectory, stateFile);
      const state = JSON.parse(readFileSync(statePath, 'utf8')) as { confirmedEvents: unknown[] };
      state.confirmedEvents = state.confirmedEvents.slice(1);
      writeFileSync(statePath, JSON.stringify(state));

      const core = new MemoryIntegrationCore({ capabilities, memoryPort, stateStore });
      const result = await core.handle({
        harness: 'codex',
        intent: 'capture_root_prompt',
        actor: 'root_user',
        isRootSession: true,
        identity: {
          sessionId: 'sticky-session',
          project: 'sticky-project',
          cwd: dataDir,
        },
        nativeEventId: 'sticky-post-eviction',
        content: 'Canonical prompt after degradation.',
        nativeEvent: 'user.prompt',
      });
      expect(result).toMatchObject({
        outcome: 'degraded',
        effects: [{
          confirmed: true,
          reference: { kind: 'prompt', id: 91 },
        }],
        state: { deduplication: 'degraded' },
      });
      expect(result.diagnostic?.reason.toLowerCase()).toContain('duplicate protection');
    } finally {
      await memoryPort.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('persists verified terminal subagent learning only as an observation and handles replay safely', async () => {
    expect(typeof sanitizePassiveLearning).toBe('function');

    const evidence = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
    if (!evidence) {
      throw new Error('Expected standalone Claude Code host evidence');
    }
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-passive-learning-'));
    const capabilities = supportedCapabilities('claude');
    const calls: Array<{ tool: string; input: Record<string, unknown> }> = [];
    const memoryPort: MemoryPort = {
      async call(tool, input) {
        calls.push({ tool, input });
        return { confirmed: true, isError: false, text: 'Observation saved.' };
      },
      async close() {},
    };
    const stateStore = new FileLifecycleStateStore({
      dataDir,
      harness: 'claude',
      projectId: 'passive-learning-project',
      rootSessionId: 'passive-learning-session',
      capabilities,
    });
        const publicPrefix = 'Reusable terminal learning. ';
        const expectedContent = publicPrefix + 'x'.repeat(
          MAX_PASSIVE_LEARNING_CODE_POINTS - Array.from(publicPrefix).length,
        );
        const core = new MemoryIntegrationCore({ capabilities, memoryPort, stateStore });
        const passiveEvent: NormalizedEvent = {
          harness: 'claude',
          intent: 'capture_passive_learning',
          actor: 'subagent',
          isRootSession: true,
          identity: {
            sessionId: 'passive-learning-session',
            project: 'passive-learning-project',
          },
          nativeEventId: 'terminal-subagent-output-1',
          content: publicPrefix + '<private>PRIVATE-TERMINAL-SECRET</private>'
            + 'x'.repeat(MAX_PASSIVE_LEARNING_CODE_POINTS),
          nativeEvent: 'SessionEnd',
          passiveLearningEvidence: {
            terminalMappingId: evidence.terminal.mappingId,
            verifiedTerminalOutput: true,
          },
        };

        try {
          expect(sanitizePassiveLearning(passiveEvent)).toEqual({
            action: 'persist',
            content: expectedContent,
            truncated: true,
            privacyDegraded: false,
          });

          const first = await core.handle(passiveEvent);
          expect(first).toMatchObject({ outcome: 'degraded', intent: 'capture_passive_learning' });
          expect(calls).toEqual([{
            tool: 'mem_save',
            input: expect.objectContaining({
              kind: 'observation',
              type: 'learning',
              session_id: 'passive-learning-session',
              project: 'passive-learning-project',
              scope: 'project',
              content: expectedContent,
            }),
          }]);
          expect(calls[0]?.input.kind).not.toBe('prompt');
          expect(JSON.stringify(calls)).not.toContain('PRIVATE-TERMINAL-SECRET');

          const replay = await core.handle(passiveEvent);
          expect(replay).toMatchObject({ outcome: 'no_op', retryable: false });
          expect(calls).toHaveLength(1);

          const { nativeEventId: _nativeEventId, ...missingStableEvent } = passiveEvent;
          const missingStable = await core.handle(missingStableEvent);
          expect(missingStable).toMatchObject({ outcome: 'degraded', retryable: false });
          expect(missingStable.diagnostic?.reason).toContain('Stable event identity');
          expect(calls).toHaveLength(2);
        } finally {
          rmSync(dataDir, { recursive: true, force: true });
        }
      });

  it('retries a failed passive observation save before confirming the same event once', async () => {
    const evidence = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
    if (!evidence) {
      throw new Error('Expected standalone Claude Code host evidence');
    }
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-passive-retry-'));
    const capabilities = supportedCapabilities('claude');
    let attempts = 0;
    const memoryPort: MemoryPort = {
      async call() {
        attempts += 1;
        return attempts === 1
          ? { confirmed: false, isError: true, text: 'Temporary memory failure.' }
          : { confirmed: true, isError: false, text: 'Observation saved.' };
      },
      async close() {},
    };
    const stateStore = new FileLifecycleStateStore({
      dataDir,
      harness: 'claude',
      projectId: 'passive-retry-project',
      rootSessionId: 'passive-retry-session',
      capabilities,
    });
    const core = new MemoryIntegrationCore({ capabilities, memoryPort, stateStore });
    const event: NormalizedEvent = {
      harness: 'claude',
      intent: 'capture_passive_learning',
      actor: 'subagent',
      isRootSession: true,
      identity: { sessionId: 'passive-retry-session', project: 'passive-retry-project' },
      nativeEventId: 'passive-retry-event',
      content: 'Retryable terminal learning.',
      nativeEvent: 'SessionEnd',
      passiveLearningEvidence: {
        terminalMappingId: evidence.terminal.mappingId,
        verifiedTerminalOutput: true,
      },
    };

    try {
      await expect(core.handle(event)).resolves.toMatchObject({ outcome: 'failed', retryable: true });
      await expect(core.handle(event)).resolves.toMatchObject({ outcome: 'confirmed', retryable: false });
      await expect(core.handle(event)).resolves.toMatchObject({ outcome: 'no_op', retryable: false });
      expect(attempts).toBe(2);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });


  it('issues a private delivery attempt only after confirmed recovery memory and never after a memory failure', async () => {
        const dataDir = mkdtempSync(join(tmpdir(), 'thoth-delivery-prepare-'));
        const capabilities = supportedCapabilities('opencode');
        const stateStore = new FileLifecycleStateStore({
          dataDir,
          harness: 'opencode',
          projectId: 'host-neutral-project',
          rootSessionId: 'root-session',
          capabilities,
        });
        const memoryPort: MemoryPort = {
          async call(tool) {
            return {
              confirmed: true,
              isError: false,
              text: tool === 'mem_context' ? 'Recovered context for delivery.' : 'Session enrolled.',
            };
          },
          async close() {},
        };
        const core = new MemoryIntegrationCore({
          capabilities,
          memoryPort,
          stateStore,
          hostOutput: {
            recovery: {
              mappingId: 'opencode-recovery-injection-v1',
              verifiedMappingId: 'opencode-recovery-injection-v1',
              ready: true,
            },
          },
        });
        const prepareDelivery = Reflect.get(core, 'prepareDelivery');
        expect(prepareDelivery).toBeTypeOf('function');
        if (typeof prepareDelivery !== 'function') {
          rmSync(dataDir, { recursive: true, force: true });
          return;
        }
        const binding = {
          eventMappingId: 'opencode-session-start-v1',
          deliveryChannel: 'opencode-protocol-output',
          deliveryMappingId: 'opencode-recovery-injection-v1',
        };

        try {
      const prepare = prepareDelivery.bind(core) as (
        event: NormalizedEvent,
        binding: typeof binding,
      ) => Promise<LifecycleResult & { deliveryAttempt?: string }>;
      const prepared = await prepare(enrollmentEvent('opencode'), binding);
      expect(prepared).toMatchObject({
            outcome: 'confirmed',
            hostOutputDirective: {
              purpose: 'recovery_context',
              text: 'Recovered context for delivery.',
              deliveryMappingId: binding.deliveryMappingId,
            },
            deliveryAttempt: expect.any(String),
            deliveryState: expect.objectContaining({
              memoryConfirmation: 'confirmed',
              outputReadiness: 'ready',
              modelConsumption: 'unproven',
            }),
          });
          expect(JSON.stringify(await stateStore.read())).not.toContain('Recovered context for delivery.');

          const failedCore = new MemoryIntegrationCore({
            capabilities,
            memoryPort: {
              async call() { return { confirmed: false, isError: true, text: 'Temporary memory failure.' }; },
              async close() {},
            },
            stateStore,
            hostOutput: {
              recovery: {
                mappingId: binding.deliveryMappingId,
                verifiedMappingId: binding.deliveryMappingId,
                ready: true,
              },
            },
          });
      const failedPrepare = Reflect.get(failedCore, 'prepareDelivery');
      expect(failedPrepare).toBeTypeOf('function');
      if (typeof failedPrepare !== 'function') {
        return;
      }
      const prepareFailure = failedPrepare.bind(failedCore) as (
        event: NormalizedEvent,
        binding: typeof binding,
      ) => Promise<LifecycleResult & { deliveryAttempt?: string }>;
      const failed = await prepareFailure({
        ...enrollmentEvent('opencode'),
        nativeEventId: 'opencode-memory-failure',
      }, binding);
          expect(failed).toMatchObject({ outcome: 'failed', retryable: true });
          expect(failed).not.toHaveProperty('hostOutputDirective');
          expect(failed).not.toHaveProperty('deliveryAttempt');
        } finally {
          rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('confirms a signed delivery attempt once and rejects mismatched, expired, cross-session, and locked confirmations', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-delivery-confirm-'));
    const capabilities = supportedCapabilities('opencode');
    let currentTime = Date.parse('2026-07-16T12:00:00.000Z');
    const clock: Clock = {
      now: () => new Date(currentTime),
      sleep: async () => {},
    };
    const options = {
      dataDir,
      harness: 'opencode' as const,
      projectId: 'delivery-project',
      rootSessionId: 'delivery-session',
      capabilities,
      clock,
    };
    const store = new FileLifecycleStateStore(options);
    const binding = {
      eventMappingId: 'opencode-session-start-v1',
      deliveryChannel: 'opencode-protocol-output' as const,
      deliveryMappingId: 'opencode-recovery-injection-v1',
    };
    const issue = {
      ...binding,
      purpose: 'recovery_context' as const,
      directiveText: 'Recovered context for confirmation.',
    };

    try {
      const deliveryAttempt = await store.issueDeliveryAttempt(issue);
      const confirmation = { ...issue, deliveryAttempt };
      await expect(store.confirmDeliveryAttempt(confirmation)).resolves.toEqual({
        outcome: 'confirmed',
        retryable: false,
      });
      await expect(store.confirmDeliveryAttempt(confirmation)).resolves.toEqual({
        outcome: 'no_op',
        retryable: false,
      });
      await expect(store.confirmDeliveryAttempt({ ...confirmation, directiveText: 'wrong directive' }))
        .resolves.toMatchObject({ outcome: 'failed', retryable: false });

      const crossSessionStore = new FileLifecycleStateStore({
        ...options,
        rootSessionId: 'different-root-session',
      });
      await expect(crossSessionStore.confirmDeliveryAttempt(confirmation))
        .resolves.toMatchObject({ outcome: 'failed', retryable: false });

      const expiringAttempt = await store.issueDeliveryAttempt(issue);
      currentTime += 5 * 60 * 1_000;
      await expect(store.confirmDeliveryAttempt({ ...issue, deliveryAttempt: expiringAttempt }))
        .resolves.toMatchObject({ outcome: 'failed', retryable: false });

      let releaseLock: (() => void) | undefined;
      const lockReleased = new Promise<void>((resolve) => { releaseLock = resolve; });
      let lockStarted: (() => void) | undefined;
      const lockStartedPromise = new Promise<void>((resolve) => { lockStarted = resolve; });
      const lockedStore = new FileLifecycleStateStore({
        ...options,
        rootSessionId: 'locked-session',
        clock: {
          now: () => new Date(),
          sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
        },
        limits: { lockTimeoutMs: 1, lockPollMs: 1 },
        lockMetadataPort: {
          async persist(file, metadata) {
            await file.writeFile(JSON.stringify(metadata));
            await file.sync();
            lockStarted?.();
          },
        } satisfies LifecycleLockMetadataPort,
      });
      const lockedAttempt = await lockedStore.issueDeliveryAttempt(issue);
      const heldLock = lockedStore.runExclusive(async () => { await lockReleased; });
      await lockStartedPromise;
      await expect(lockedStore.confirmDeliveryAttempt({ ...issue, deliveryAttempt: lockedAttempt }))
        .resolves.toMatchObject({ outcome: 'failed', retryable: true });
      releaseLock?.();
      await heldLock;
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

});
