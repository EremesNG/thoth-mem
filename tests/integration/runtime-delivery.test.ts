import { mkdtempSync, rmSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';

    import { describe, expect, it } from 'vitest';

    import { HOST_EVIDENCE } from '../fixtures/integration/host-evidence.js';
    import { MemoryIntegrationCore } from '../../src/integration/core/lifecycle.js';
    import type { MemoryPort } from '../../src/integration/core/memory-port.js';
    import { FileLifecycleStateStore } from '../../src/integration/core/state-store.js';
    import type {
      AdapterCapabilities,
      LifecycleResult,
      NormalizedEvent,
    } from '../../src/integration/core/types.js';
    import { executeHookCommand } from '../../src/integration/runtime/hook-command.js';
import { executeIntegrationEvent } from '../../src/integration/runtime/integration-event-command.js';

    const claudeEvidence = HOST_EVIDENCE.find((evidence) => evidence.harness === 'claude-code');
    if (!claudeEvidence) {
      throw new Error('Expected standalone Claude Code host evidence fixture');
    }

    function supportedCapabilities(): AdapterCapabilities {
      return {
        enroll_session: { state: 'supported', trigger: 'fixture.start' },
        capture_root_prompt: { state: 'supported', trigger: 'fixture.prompt' },
        recall_guidance: { state: 'supported', trigger: 'fixture.recovery' },
        compact_session: { state: 'supported', trigger: 'fixture.compact' },
        finalize_session: { state: 'unsupported', reason: 'Terminal handling is not exercised here.' },
      };
    }

    function event(intent: 'enroll_session' | 'compact_session', nativeEventId: string): NormalizedEvent {
      return {
        harness: 'claude',
        intent,
        actor: 'system',
        isRootSession: true,
        identity: {
          sessionId: 'runtime-delivery-session',
          project: 'runtime-delivery-project',
        },
        nativeEventId,
        content: intent === 'compact_session' ? 'Checkpoint summary.' : undefined,
        nativeEvent: intent === 'compact_session' ? 'PreCompact' : 'SessionStart',
      };
    }

    function hostOutputDirective(result: LifecycleResult): unknown {
      return Object.getOwnPropertyDescriptor(result, 'hostOutputDirective')?.value;
    }

    function deliveryState(result: LifecycleResult): unknown {
      return Object.getOwnPropertyDescriptor(result, 'deliveryState')?.value;
    }

    describe('runtime delivery contracts', () => {
      it('returns bounded recovery output only after enrollment and context confirmation', async () => {
        const dataDir = mkdtempSync(join(tmpdir(), 'thoth-runtime-delivery-'));
        const capabilities = supportedCapabilities();
        const calls: Array<{ tool: string; input: Record<string, unknown> }> = [];
        const memoryPort: MemoryPort = {
          async call(tool, input) {
            calls.push({ tool, input });
            return {
              confirmed: true,
              isError: false,
              text: tool === 'mem_context' ? 'Recovered fixture guidance.' : 'Memory effect confirmed.',
            };
          },
          async close() {},
        };
        const stateStore = new FileLifecycleStateStore({
          dataDir,
          harness: 'claude',
          projectId: 'runtime-delivery-project',
          rootSessionId: 'runtime-delivery-session',
          capabilities,
        });
        const options = { capabilities, memoryPort, stateStore };
        Object.assign(options, {
          hostOutput: {
            recovery: {
              mappingId: claudeEvidence.recovery.mappingId,
              verifiedMappingId: claudeEvidence.recovery.mappingId,
              ready: true,
            },
          },
        });
        const core = new MemoryIntegrationCore(options);

        try {
          const result = await core.handle(event('enroll_session', 'delivery-enrollment'));

          expect(calls.map((call) => call.tool)).toEqual(['mem_session', 'mem_context']);
          expect(result.outcome).toBe('confirmed');
          expect(hostOutputDirective(result)).toEqual({
            purpose: 'recovery_context',
            text: 'Recovered fixture guidance.',
            deliveryMappingId: claudeEvidence.recovery.mappingId,
          });
          expect(deliveryState(result)).toEqual({
            activation: 'unproven',
            memoryConfirmation: 'confirmed',
            outputReadiness: 'ready',
            localEmission: 'not_emitted',
            modelConsumption: 'unproven',
          });
        } finally {
          rmSync(dataDir, { recursive: true, force: true });
        }
      });

      it('keeps a failed checkpoint retryable and emits no post-compaction guidance', async () => {
        const dataDir = mkdtempSync(join(tmpdir(), 'thoth-runtime-delivery-failure-'));
        const capabilities = supportedCapabilities();
        const calls: string[] = [];
        const memoryPort: MemoryPort = {
          async call(tool) {
            calls.push(tool);
            return {
              confirmed: false,
              isError: true,
              text: 'Checkpoint was not confirmed.',
            };
          },
          async close() {},
        };
        const stateStore = new FileLifecycleStateStore({
          dataDir,
          harness: 'claude',
          projectId: 'runtime-delivery-project',
          rootSessionId: 'runtime-delivery-session',
          capabilities,
        });
        const options = { capabilities, memoryPort, stateStore };
        Object.assign(options, {
          hostOutput: {
            postCompaction: {
              mappingId: claudeEvidence.compaction.mappingId,
              verifiedMappingId: claudeEvidence.compaction.mappingId,
              ready: true,
            },
          },
        });
        const core = new MemoryIntegrationCore(options);

        try {
          const result = await core.handle(event('compact_session', 'delivery-compaction-failed'));

          expect(calls).toEqual(['mem_session']);
          expect(result).toMatchObject({ outcome: 'failed', retryable: true });
          expect(hostOutputDirective(result)).toBeUndefined();
          expect(deliveryState(result)).toEqual({
            activation: 'unproven',
            memoryConfirmation: 'unconfirmed',
            outputReadiness: 'not_ready',
            localEmission: 'not_emitted',
            modelConsumption: 'unproven',
          });
        } finally {
          rmSync(dataDir, { recursive: true, force: true });
        }
      });

      it('fails closed for a mismatched delivery mapping without erasing confirmed memory', async () => {
        const dataDir = mkdtempSync(join(tmpdir(), 'thoth-runtime-delivery-mismatch-'));
        const capabilities = supportedCapabilities();
        const memoryPort: MemoryPort = {
          async call(tool) {
            return {
              confirmed: true,
              isError: false,
              text: tool === 'mem_context' ? 'Recovered fixture guidance.' : 'Memory effect confirmed.',
            };
          },
          async close() {},
        };
        const stateStore = new FileLifecycleStateStore({
          dataDir,
          harness: 'claude',
          projectId: 'runtime-delivery-project',
          rootSessionId: 'runtime-delivery-session',
          capabilities,
        });
        const options = { capabilities, memoryPort, stateStore };
        Object.assign(options, {
          hostOutput: {
            recovery: {
              mappingId: 'unknown-delivery-mapping',
              verifiedMappingId: claudeEvidence.recovery.mappingId,
              ready: true,
            },
          },
        });
        const core = new MemoryIntegrationCore(options);

        try {
          const result = await core.handle(event('enroll_session', 'delivery-mismatch'));

          expect(result.outcome).toBe('confirmed');
          expect(result.effects.every((effect) => effect.confirmed && !effect.isError)).toBe(true);
          expect(hostOutputDirective(result)).toBeUndefined();
          expect(deliveryState(result)).toMatchObject({
            memoryConfirmation: 'confirmed',
            outputReadiness: 'unavailable',
            localEmission: 'not_emitted',
            modelConsumption: 'unproven',
          });
        } finally {
          rmSync(dataDir, { recursive: true, force: true });
        }
      });

      it('preserves a validated neutral directive through the hook command response', async () => {
        const response = await executeHookCommand(JSON.stringify({
          protocolVersion: 1,
          harness: 'claude',
          capabilityEvidence: {
            hostVersion: claudeEvidence.versionFamily,
            payloadMappingId: claudeEvidence.payloadMappingId,
            assetExecutionMarker: claudeEvidence.activationMarker,
            eventMappingId: claudeEvidence.activation.mappingId,
            deliveryChannel: claudeEvidence.recovery.channel,
            deliveryMappingId: claudeEvidence.recovery.mappingId,
          },
          event: {
            hook: 'SessionStart',
            payload: {
              session_id: 'runtime-delivery-session',
              project: 'runtime-delivery-project',
              source: 'startup',
              hook_event_id: 'delivery-hook',
            },
          },
        }), async (normalizedEvent) => ({
          outcome: 'confirmed',
          retryable: false,
          harness: normalizedEvent.harness,
          intent: normalizedEvent.intent,
          hostOutputDirective: {
            purpose: 'recovery_context',
            text: 'Recovered fixture guidance.',
            deliveryMappingId: claudeEvidence.recovery.mappingId,
          },
        }));

        expect(Object.getOwnPropertyDescriptor(response, 'hostOutputDirective')?.value).toEqual({
          purpose: 'recovery_context',
          text: 'Recovered fixture guidance.',
          deliveryMappingId: claudeEvidence.recovery.mappingId,
        });
      });


          it('rejects a compact start after a failed checkpoint before it can request guidance', async () => {
                const dataDir = mkdtempSync(join(tmpdir(), 'thoth-compact-gate-failed-checkpoint-'));
                const calls: string[] = [];
                const request = (hook: 'PreCompact' | 'SessionStart', source?: 'compact') => JSON.stringify({
                  protocolVersion: 1,
                  harness: 'claude',
                  capabilityEvidence: {
                    payloadMappingId: claudeEvidence.payloadMappingId,
                    assetExecutionMarker: claudeEvidence.activationMarker,
                    eventMappingId: hook === 'PreCompact' ? claudeEvidence.compaction.mappingId : claudeEvidence.activation.mappingId,
                    deliveryChannel: 'runner-stdout',
                    deliveryMappingId: hook === 'PreCompact' ? claudeEvidence.compaction.mappingId : claudeEvidence.recovery.mappingId,
                    behaviorEvidenceMappingId: 'claude-code-command-hook-payload-v1',
                  },
                  event: {
                    hook,
                    id: 'failed-checkpoint-' + hook,
                    timestamp: '2026-07-16T00:00:00.000Z',
                    payload: hook === 'PreCompact'
                      ? { session_id: 'compact-gate-session', transcript_path: '/private/thread-a.jsonl', cwd: '/workspace/thoth-mem', hook_event_name: hook, trigger: 'auto', custom_instructions: '' }
                      : { session_id: 'compact-gate-session', transcript_path: '/private/thread-a.jsonl', cwd: '/workspace/thoth-mem', hook_event_name: hook, source },
                  },
                });
                try {
                  const failedCheckpoint = await executeIntegrationEvent(request('PreCompact'), {
                    dataDir,
                    dependencies: {
                      resolveDataDir: (requested) => requested!,
                      createMemoryPort: async () => ({
                        call: async (tool) => {
                          calls.push(tool);
                          return { confirmed: false, isError: true, text: 'Checkpoint failed.' };
                        },
                        close: async () => undefined,
                      }),
                    },
                  });
                  expect(failedCheckpoint.response).toMatchObject({ outcome: 'failed', retryable: true });
                  expect(calls).toEqual(['mem_session']);
                  calls.length = 0;

                  const compactStart = await executeIntegrationEvent(request('SessionStart', 'compact'), {
                    dataDir,
                    dependencies: {
                      resolveDataDir: (requested) => requested!,
                      createMemoryPort: async () => ({
                        call: async (tool) => {
                          calls.push(tool);
                          return { confirmed: true, isError: false, text: 'Guidance must not be requested.' };
                        },
                        close: async () => undefined,
                      }),
                    },
                  });
                  expect(compactStart.response).toMatchObject({ outcome: 'degraded' });
                  expect(compactStart.response).not.toHaveProperty('hostOutputDirective');
                  expect(calls).toEqual([]);
                } finally {
                  rmSync(dataDir, { recursive: true, force: true });
                }
              });

      it('maps Codex compact start to gated recovery context after a confirmed checkpoint', async () => {
            const dataDir = mkdtempSync(join(tmpdir(), 'thoth-codex-compact-gate-'));
            const evidence = HOST_EVIDENCE.find((entry) => entry.harness === 'codex');
            if (!evidence) throw new Error('Expected Codex host evidence');
            const calls: string[] = [];
            const request = (hook: 'PreCompact' | 'SessionStart', source?: 'compact') => JSON.stringify({
              protocolVersion: 1,
              harness: 'codex',
              capabilityEvidence: {
                payloadMappingId: evidence.payloadMappingId,
                assetExecutionMarker: evidence.activationMarker,
                eventMappingId: hook === 'PreCompact' ? evidence.compaction.mappingId : evidence.activation.mappingId,
                deliveryChannel: 'runner-stdout',
                deliveryMappingId: hook === 'PreCompact' ? evidence.compaction.mappingId : evidence.recovery.mappingId,
                behaviorEvidenceMappingId: 'codex-command-hook-payload-v1',
              },
              event: {
                hook,
                id: 'codex-compact-' + hook,
                timestamp: '2026-07-16T00:00:00.000Z',
                payload: hook === 'PreCompact'
                  ? { session_id: 'codex-compact-session', transcript_path: null, cwd: '/workspace/thoth-mem', hook_event_name: hook, model: 'fixture', turn_id: 'turn-1', trigger: 'auto' }
                  : { session_id: 'codex-compact-session', transcript_path: null, cwd: '/workspace/thoth-mem', hook_event_name: hook, model: 'fixture', permission_mode: 'default', source },
              },
            });
            const options = {
              dataDir,
              dependencies: {
                resolveDataDir: (requested: string | undefined) => requested!,
                createMemoryPort: async () => ({
                  call: async (tool: string) => {
                    calls.push(tool);
                    return { confirmed: true, isError: false, text: tool === 'mem_context' ? 'Recovered Codex compact guidance.' : 'Checkpoint confirmed.' };
                  },
                  close: async () => undefined,
                }),
              },
            };

            try {
              await expect(executeIntegrationEvent(request('PreCompact'), options)).resolves.toMatchObject({ response: { outcome: 'degraded', retryable: false } });
              const resumed = await executeIntegrationEvent(request('SessionStart', 'compact'), options);
              expect(resumed.response).toMatchObject({
                harness: 'codex',
                intent: 'recall_guidance',
                outcome: 'degraded',
                retryable: false,
                hostOutputDirective: {
                  purpose: 'recovery_context',
                  text: 'Recovered Codex compact guidance.',
                },
                deliveryState: { modelConsumption: 'unproven' },
              });
              expect(calls).toEqual(['mem_session', 'mem_context']);
            } finally {
              rmSync(dataDir, { recursive: true, force: true });
            }
          });

          it('releases a confirmed compaction gate after failed context so compact start can retry without consuming it', async () => {
            const dataDir = mkdtempSync(join(tmpdir(), 'thoth-compact-gate-context-retry-'));
            const capabilities = supportedCapabilities();
            const calls: string[] = [];
            let contextAttempts = 0;
            const memoryPort: MemoryPort = {
              async call(tool) {
                calls.push(tool);
                if (tool === 'mem_context' && contextAttempts++ === 0) {
                  return { confirmed: false, isError: true, text: 'Context retry is required.' };
                }
                return { confirmed: true, isError: false, text: tool === 'mem_context' ? 'Recovered compact guidance.' : 'Checkpoint confirmed.' };
              },
              async close() {},
            };
            const stateStore = new FileLifecycleStateStore({
              dataDir,
              harness: 'claude',
              projectId: 'runtime-delivery-project',
              rootSessionId: 'runtime-delivery-session',
              capabilities,
            });
            const core = new MemoryIntegrationCore({
              capabilities,
              memoryPort,
              stateStore,
              hostOutput: {
                recovery: {
                  mappingId: claudeEvidence.recovery.mappingId,
                  verifiedMappingId: claudeEvidence.recovery.mappingId,
                  ready: true,
                },
              },
            });
            const checkpoint: NormalizedEvent = {
              ...event('compact_session', 'context-retry-checkpoint'),
              compactionGate: { phase: 'checkpoint', sourceIdentity: 'thread-a' },
            };
            const compactStart = (nativeEventId: string): NormalizedEvent => ({
              harness: 'claude',
              intent: 'recall_guidance',
              actor: 'system',
              isRootSession: true,
              identity: { sessionId: 'runtime-delivery-session', project: 'runtime-delivery-project' },
              nativeEventId,
              nativeEvent: 'SessionStart',
              compactionGate: { phase: 'resume', sourceIdentity: 'thread-a' },
            });

            try {
              await expect(core.handle(checkpoint)).resolves.toMatchObject({ outcome: 'confirmed' });
              await expect(core.handle(compactStart('context-retry-first'))).resolves.toMatchObject({ outcome: 'failed', retryable: true });
              expect((await stateStore.read()).compactionGate).toMatchObject({ status: 'confirmed' });
              await expect(core.handle(compactStart('context-retry-second'))).resolves.toMatchObject({
                outcome: 'confirmed',
                hostOutputDirective: { purpose: 'recovery_context' },
              });
              expect((await stateStore.read()).compactionGate).toBeUndefined();
              expect(calls).toEqual(['mem_session', 'mem_context', 'mem_context']);
            } finally {
              rmSync(dataDir, { recursive: true, force: true });
            }
          });

          it('expires a stale confirmed checkpoint gate before compact start can call mem_context', async () => {
            const dataDir = mkdtempSync(join(tmpdir(), 'thoth-compact-gate-expired-'));
            const capabilities = supportedCapabilities();
            let currentTime = Date.parse('2026-07-16T00:00:00.000Z');
            const clock = {
              now: () => new Date(currentTime),
              sleep: async () => undefined,
            };
            const calls: string[] = [];
            const memoryPort: MemoryPort = {
              async call(tool) {
                calls.push(tool);
                return { confirmed: true, isError: false, text: 'Confirmed.' };
              },
              async close() {},
            };
            const stateStore = new FileLifecycleStateStore({
              dataDir,
              harness: 'claude',
              projectId: 'runtime-delivery-project',
              rootSessionId: 'runtime-delivery-session',
              capabilities,
              clock,
            });
            const core = new MemoryIntegrationCore({ capabilities, memoryPort, stateStore, clock });
            const checkpoint: NormalizedEvent = {
              ...event('compact_session', 'expired-checkpoint'),
              compactionGate: { phase: 'checkpoint', sourceIdentity: 'thread-a' },
            };
            const compactStart: NormalizedEvent = {
              harness: 'claude',
              intent: 'recall_guidance',
              actor: 'system',
              isRootSession: true,
              identity: { sessionId: 'runtime-delivery-session', project: 'runtime-delivery-project' },
              nativeEventId: 'expired-compact-start',
              nativeEvent: 'SessionStart',
              compactionGate: { phase: 'resume', sourceIdentity: 'thread-a' },
            };

            try {
              await expect(core.handle(checkpoint)).resolves.toMatchObject({ outcome: 'confirmed' });
              currentTime += 5 * 60 * 1_000 + 1;
              await expect(core.handle(compactStart)).resolves.toMatchObject({ outcome: 'degraded', retryable: false });
              expect(calls).toEqual(['mem_session']);
              expect((await stateStore.read()).compactionGate).toBeUndefined();
            } finally {
              rmSync(dataDir, { recursive: true, force: true });
            }
          });

          it('invalidates a prior gate before a second failed checkpoint and blocks compact-start guidance', async () => {
            const dataDir = mkdtempSync(join(tmpdir(), 'thoth-compact-gate-second-failure-'));
            const capabilities = supportedCapabilities();
            const calls: string[] = [];
            let checkpoints = 0;
            const memoryPort: MemoryPort = {
              async call(tool) {
                calls.push(tool);
                if (tool === 'mem_session' && ++checkpoints === 2) {
                  return { confirmed: false, isError: true, text: 'Second checkpoint failed.' };
                }
                return { confirmed: true, isError: false, text: 'Confirmed.' };
              },
              async close() {},
            };
            const stateStore = new FileLifecycleStateStore({
              dataDir,
              harness: 'claude',
              projectId: 'runtime-delivery-project',
              rootSessionId: 'runtime-delivery-session',
              capabilities,
            });
            const core = new MemoryIntegrationCore({ capabilities, memoryPort, stateStore });
            const checkpoint = (nativeEventId: string): NormalizedEvent => ({
              ...event('compact_session', nativeEventId),
              compactionGate: { phase: 'checkpoint', sourceIdentity: 'thread-a' },
            });
            const compactStart: NormalizedEvent = {
              harness: 'claude',
              intent: 'recall_guidance',
              actor: 'system',
              isRootSession: true,
              identity: { sessionId: 'runtime-delivery-session', project: 'runtime-delivery-project' },
              nativeEventId: 'second-failure-compact-start',
              nativeEvent: 'SessionStart',
              compactionGate: { phase: 'resume', sourceIdentity: 'thread-a' },
            };

            try {
              await expect(core.handle(checkpoint('first-checkpoint'))).resolves.toMatchObject({ outcome: 'confirmed' });
              await expect(core.handle(checkpoint('second-checkpoint'))).resolves.toMatchObject({ outcome: 'failed', retryable: true });
              calls.length = 0;
              await expect(core.handle(compactStart)).resolves.toMatchObject({ outcome: 'degraded', retryable: false });
              expect(calls).toEqual([]);
              expect((await stateStore.read()).compactionGate).toBeUndefined();
            } finally {
              rmSync(dataDir, { recursive: true, force: true });
            }
          });

                  it('keeps a confirmed checkpoint across a new FileLifecycleStateStore instance, rejects transcript mismatch and replay, consumes after guidance, and makes no consumption claim', async () => {
                const dataDir = mkdtempSync(join(tmpdir(), 'thoth-compact-gate-restart-'));
                const calls: string[] = [];
                const run = async (hook: 'PreCompact' | 'SessionStart', transcript: string, eventId: string) => executeIntegrationEvent(JSON.stringify({
                  protocolVersion: 1,
                  harness: 'claude',
                  capabilityEvidence: {
                    payloadMappingId: claudeEvidence.payloadMappingId,
                    assetExecutionMarker: claudeEvidence.activationMarker,
                    eventMappingId: hook === 'PreCompact' ? claudeEvidence.compaction.mappingId : claudeEvidence.activation.mappingId,
                    deliveryChannel: 'runner-stdout',
                    deliveryMappingId: hook === 'PreCompact' ? claudeEvidence.compaction.mappingId : claudeEvidence.recovery.mappingId,
                    behaviorEvidenceMappingId: 'claude-code-command-hook-payload-v1',
                  },
                  event: {
                    hook,
                    id: eventId,
                    timestamp: '2026-07-16T00:00:00.000Z',
                    payload: hook === 'PreCompact'
                      ? { session_id: 'compact-gate-session', transcript_path: transcript, cwd: '/workspace/thoth-mem', hook_event_name: hook, trigger: 'auto', custom_instructions: '' }
                      : { session_id: 'compact-gate-session', transcript_path: transcript, cwd: '/workspace/thoth-mem', hook_event_name: hook, source: 'compact' },
                  },
                }), {
                  dataDir,
                  dependencies: {
                    resolveDataDir: (requested) => requested!,
                    createMemoryPort: async () => ({
                      call: async (tool) => {
                        calls.push(tool);
                        return { confirmed: true, isError: false, text: tool === 'mem_context' ? 'Recovered compact guidance.' : 'Checkpoint confirmed.' };
                      },
                      close: async () => undefined,
                    }),
                  },
                });
                try {
                  const preCompact = await run('PreCompact', '/private/thread-a.jsonl', 'precompact-one');
                  expect(preCompact.response.outcome).toMatch(/^(confirmed|degraded)$/);
                  expect(preCompact.response).not.toHaveProperty('hostOutputDirective');
                  const persisted = await new FileLifecycleStateStore({
                    dataDir,
                    harness: 'claude',
                    projectId: 'thoth-mem',
                    rootSessionId: 'compact-gate-session',
                    capabilities: supportedCapabilities(),
                  }).read();
                  expect(persisted.compactionGate).toMatchObject({ status: 'confirmed' });
                  expect(JSON.stringify(persisted)).not.toContain('/private/thread-a.jsonl');
                  expect(calls).toEqual(['mem_session']);
                  calls.length = 0;

                  const mismatched = await run('SessionStart', '/private/thread-b.jsonl', 'compact-mismatch');
                  expect(mismatched.response).toMatchObject({ outcome: 'degraded' });
                  expect(mismatched.response).not.toHaveProperty('hostOutputDirective');
                  expect(calls).toEqual([]);

                  const resumed = await run('SessionStart', '/private/thread-a.jsonl', 'compact-resume');
                  expect(resumed.response.outcome).toMatch(/^(confirmed|degraded)$/);
                      expect(resumed.response.deliveryState?.modelConsumption).toBe('unproven');
                  expect(resumed.response).toMatchObject({
                    intent: 'recall_guidance',
                    hostOutputDirective: {
                      purpose: 'recovery_context',
                      text: 'Recovered compact guidance.',
                    },
                  });
                  expect(calls).toEqual(['mem_context']);
                  calls.length = 0;

                  const replay = await run('SessionStart', '/private/thread-a.jsonl', 'compact-replay');
                  expect(replay.response).toMatchObject({ outcome: 'degraded' });
                  expect(replay.response).not.toHaveProperty('hostOutputDirective');
                  expect(calls).toEqual([]);
                } finally {
                  rmSync(dataDir, { recursive: true, force: true });
                }
              });

              it('fails closed for Claude SessionStart source=compact without a matching checkpoint gate', async () => {
            const dataDir = mkdtempSync(join(tmpdir(), 'thoth-claude-compact-recovery-'));
            const calls: Array<{ tool: string; input: Record<string, unknown> }> = [];
            try {
              const result = await executeIntegrationEvent(JSON.stringify({
                protocolVersion: 1,
                harness: 'claude',
                capabilityEvidence: {
                  payloadMappingId: claudeEvidence.payloadMappingId,
                  assetExecutionMarker: claudeEvidence.activationMarker,
                  eventMappingId: claudeEvidence.activation.mappingId,
                  deliveryChannel: claudeEvidence.recovery.channel,
                  deliveryMappingId: claudeEvidence.recovery.mappingId,
                  behaviorEvidenceMappingId: 'claude-code-command-hook-payload-v1',
                },
                event: {
                  hook: 'SessionStart',
                  id: 'claude-compact-event',
                  timestamp: '2026-07-16T00:00:00.000Z',
                  payload: {
                    session_id: 'claude-compact-session',
                    transcript_path: null,
                    cwd: '/workspace/thoth-mem',
                    hook_event_name: 'SessionStart',
                    model: 'host-model',
                    source: 'compact',
                  },
                },
              }), {
                dataDir,
                dependencies: {
                  resolveDataDir: (requested) => requested!,
                  createMemoryPort: async () => ({
                    call: async (tool, input) => {
                      calls.push({ tool, input });
                      return { confirmed: true, isError: false, text: 'Recovered compact-session context.' };
                    },
                    close: async () => undefined,
                  }),
                },
              });
              expect(calls.map((call) => call.tool)).toEqual([]);
              expect(result.response).toMatchObject({
                harness: 'claude',
                intent: 'recall_guidance',
                outcome: 'degraded',
                retryable: false,
              });
            } finally {
              rmSync(dataDir, { recursive: true, force: true });
            }
          });
    });
