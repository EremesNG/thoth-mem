import { describe, expect, it } from 'vitest';

import { normalizeAdapterEvent, normalizeNativePayload } from '../../src/integration/adapters/index.js';

describe('native adapters', () => {
  it('maps each host to one host-neutral lifecycle contract and denies delegation', () => {
    for (const harness of ['opencode', 'codex', 'claude'] as const) expect(normalizeAdapterEvent({ version: 3, harness, intent: 'session.enroll', projectKey: 'repo:x', projectName: 'x', rootSessionKey: 'root', eventKey: `${harness}:1`, callerRole: 'root' })).toMatchObject({ operation: 'enroll', harness, project: { key: 'repo:x' } });
    expect(() => normalizeAdapterEvent({ version: 3, harness: 'opencode', intent: 'prompt.capture_root', projectKey: 'repo:x', projectName: 'x', rootSessionKey: 'child', eventKey: 'e', callerRole: 'delegated', content: 'not root intent' })).toThrow(/delegated/i);
  });

  it('maps every versioned intent identically across hosts, including pre-MCP lifecycle', () => {
    const intents = ['session.enroll','session.recover','prompt.capture_root','session.checkpoint_pre_compact','session.guide_post_compact','session.finalize'] as const;
    const expected = ['enroll','recover','capture_root','checkpoint_pre_compact','guide_post_compact','finalize'];
    for (const harness of ['opencode','codex','claude'] as const) expect(intents.map((intent) => normalizeAdapterEvent({ version: 3, harness, intent, projectKey: 'repo:x', projectName: 'x', rootSessionKey: 'root', eventKey: `${harness}:${intent}`, callerRole: 'root' }).operation)).toEqual(expected);
  });

  it('fails closed for unsupported versions, intents, and missing identity', () => {
    const base = { version: 3 as const, harness: 'codex' as const, intent: 'session.enroll' as const, projectKey: 'repo:x', projectName: 'x', rootSessionKey: 'root', eventKey: 'event' };
    expect(() => normalizeAdapterEvent({ ...base, version: 2 as 3 })).toThrow(/version/i);
    expect(() => normalizeAdapterEvent({ ...base, intent: 'session.unknown' as typeof base.intent })).toThrow(/intent/i);
    expect(() => normalizeAdapterEvent({ ...base, rootSessionKey: '' })).toThrow(/identity/i);
  });

  it('translates documented Codex lifecycle payloads without an invented event id', () => {
    const codex = (hook_event_name: string, extra: Record<string, unknown>) => normalizeNativePayload('codex', {
      hook_event_name,
      session_id: 'root',
      transcript_path: 'C:/repo/.codex/rollout.jsonl',
      cwd: 'C:/repo',
      ...extra,
    });

    for (const source of ['startup', 'resume', 'clear'] as const) {
      expect(codex('SessionStart', { source })).toMatchObject({
        operation: 'recover',
        identityConfidence: 'confirmed',
        capability: { contextInjection: true },
      });
    }
    expect(codex('SessionStart', { source: 'compact' })).toMatchObject({
      operation: 'guide_post_compact',
      identityConfidence: 'confirmed',
      capability: { contextInjection: true },
    });
    expect(codex('UserPromptSubmit', { turn_id: 'turn-1', prompt: 'root request' })).toMatchObject({ operation: 'capture_root', content: 'root request', identityConfidence: 'confirmed' });
    expect(codex('PreCompact', { turn_id: 'turn-1', trigger: 'auto' })).toMatchObject({ operation: 'checkpoint_pre_compact', identityConfidence: 'confirmed' });
    expect(codex('PostCompact', { turn_id: 'turn-1', trigger: 'auto' })).toMatchObject({ operation: 'guide_post_compact', identityConfidence: 'confirmed' });
    expect(codex('SessionEnd', { reason: 'other' })).toMatchObject({ operation: 'finalize', identityConfidence: 'confirmed' });
    expect(() => codex('Stop', { turn_id: 'turn-1', stop_hook_active: false })).toThrow(/unsupported/i);

    expect(normalizeNativePayload('claude', { hook_event_name: 'UserPromptSubmit', session_id: 'root', cwd: '/repo', prompt: 'root request', event_id: 'claude:prompt' })).toMatchObject({ operation: 'capture_root', harness: 'claude', content: 'root request' });
    expect(normalizeNativePayload('claude', { hook_event_name: 'SessionStart', session_id: 'root', cwd: '/repo', source: 'compact', event_id: 'claude:compact' })).toMatchObject({
      operation: 'guide_post_compact',
      harness: 'claude',
      capability: { contextInjection: true },
    });
    expect(normalizeNativePayload('opencode', { event: 'chat.message', eventId: 'open:prompt', project: { key: 'repo:open', name: 'open' }, properties: { info: { id: 'root' }, message: { role: 'user', sessionID: 'root', content: 'root request' } } })).toMatchObject({ operation: 'capture_root', harness: 'opencode', content: 'root request' });
  });

  it('derives retry-stable Codex identity and degrades missing turn identity', () => {
    const base = { hook_event_name: 'UserPromptSubmit', session_id: 'root', transcript_path: null, cwd: 'C:/repo', prompt: 'same request' };
    const first = normalizeNativePayload('codex', { ...base, turn_id: 'turn-1' });
    const retry = normalizeNativePayload('codex', { ...base, turn_id: 'turn-1' });
    const nextTurn = normalizeNativePayload('codex', { ...base, turn_id: 'turn-2' });
    const degraded = normalizeNativePayload('codex', base);

    expect(retry.eventKey).toBe(first.eventKey);
    expect(nextTurn.eventKey).not.toBe(first.eventKey);
    expect(first.identityConfidence).toBe('confirmed');
    expect(degraded).toMatchObject({ operation: 'capture_root', identityConfidence: 'degraded' });
    expect(degraded.eventKey).toMatch(/^codex:degraded:/);

    const firstCredential = normalizeNativePayload('codex', { ...base, prompt: `same request github_pat_${'a'.repeat(40)}` });
    const rotatedCredential = normalizeNativePayload('codex', { ...base, prompt: `same request github_pat_${'b'.repeat(40)}` });
    expect(rotatedCredential.eventKey).toBe(firstCredential.eventKey);
    expect(firstCredential.content).toBe('same request [REDACTED]');
    expect(rotatedCredential.content).toBe(firstCredential.content);
  });

  it.each(['codex', 'claude'] as const)('derives content-aware sanitized %s prompt keys', (harness) => {
    const base = {
      hook_event_name: 'UserPromptSubmit',
      session_id: `${harness}-root`,
      transcript_path: `C:/repo/.${harness}/transcript.jsonl`,
      cwd: 'C:/repo',
      ...(harness === 'codex' ? { turn_id: 'turn-in-progress' } : {}),
    };
    const first = normalizeNativePayload(harness, { ...base, prompt: 'First steer.' });
    const retry = normalizeNativePayload(harness, { ...base, prompt: 'First steer.' });
    const second = normalizeNativePayload(harness, { ...base, prompt: 'Second steer.' });
    const privateFirst = normalizeNativePayload(harness, { ...base, prompt: 'Keep this. <private>secret one</private>' });
    const privateSecond = normalizeNativePayload(harness, { ...base, prompt: 'Keep this. <private>secret two</private>' });

    expect(retry.eventKey).toBe(first.eventKey);
    expect(second.eventKey).not.toBe(first.eventKey);
    expect(privateSecond.eventKey).toBe(privateFirst.eventKey);
    expect(privateFirst.content).toBe('Keep this. ');
    expect(privateFirst.eventKey).not.toContain('secret');
  });

  it('degrades unsupported capabilities and rejects delegated or inconsistent native identity', () => {
    expect(() => normalizeNativePayload('codex', { hook_event_name: 'Unknown', session_id: 'root', cwd: '/repo' })).toThrow(/unsupported/i);
    expect(() => normalizeNativePayload('opencode', { event: 'chat.message', eventId: 'child', project: { key: 'repo:x', name: 'x' }, properties: { info: { id: 'child', parentID: 'root' }, message: { role: 'user', sessionID: 'child', content: 'child' } } })).toThrow(/delegated/i);
    expect(() => normalizeNativePayload('claude', { hook_event_name: 'UserPromptSubmit', session_id: '', cwd: '/repo', prompt: 'x', event_id: 'bad' })).toThrow(/identity/i);
    expect(() => normalizeNativePayload('claude', { hook_event_name: 'UserPromptSubmit', session_id: 'root\ninjected', cwd: '/repo', prompt: 'x', event_id: 'bad-line' })).toThrow(/identity/i);
  });

  it('normalizes one identical root-owned structured summary across all three native hosts', () => {
    const structured = { kind: 'checkpoint', coverage: { fromSequence: 1, toSequence: 1 }, generator: { kind: 'harness', name: 'fixture' }, claims: [{ kind: 'objective', content: 'Resume safely.', supportIds: ['evidence-1'] }] };
    const normalized = [
      normalizeNativePayload('opencode', { event: 'experimental.session.compacting', eventId: 'open:summary', project: { key: 'repo:x', name: 'x' }, properties: { info: { id: 'root' }, thothMemSummary: structured } }),
      normalizeNativePayload('codex', { hook_event_name: 'PreCompact', session_id: 'root', cwd: '/repo', turn_id: 'turn-1', thoth_mem_summary: structured }),
      normalizeNativePayload('claude', { hook_event_name: 'PreCompact', session_id: 'root', cwd: '/repo', event_id: 'claude:summary', thoth_mem_summary: structured }),
    ];
    expect(normalized.map((item) => item.summary)).toEqual([structured, structured, structured]);
    expect(() => normalizeNativePayload('codex', { hook_event_name: 'PreCompact', session_id: 'root', cwd: '/repo', thoth_mem_summary: structured })).toThrow(/verified root/i);
    expect(() => normalizeAdapterEvent({ version: 3, harness: 'codex', intent: 'session.checkpoint_pre_compact', projectKey: 'repo:x', projectName: 'x', rootSessionKey: 'child', eventKey: 'child', callerRole: 'delegated', summary: structured })).toThrow(/delegated/i);
  });
});
