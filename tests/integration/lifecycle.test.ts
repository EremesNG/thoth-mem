import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LifecycleRuntime } from '../../src/integration/core/lifecycle.js';
import { MAX_HOST_OUTPUT_CODE_POINTS, RECOVERY_TAG_END, RECOVERY_TAG_START } from '../../src/memory-core/continuation.js';
import { MemoryService } from '../../src/memory-core/service.js';

describe('host-neutral lifecycle', () => {
  it('covers enroll, recover, one prompt, checkpoint, guidance, and finalize receipts', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const runtime = new LifecycleRuntime(service);
      const base = { harness: 'claude' as const, project: { key: 'repo:matrix', name: 'matrix' }, rootSessionKey: 'root-matrix' };
      expect(runtime.handle({ ...base, operation: 'enroll', eventKey: 'enroll' })).toMatchObject({ outcome: 'confirmed', duplicate: false });
      expect(runtime.handle({ ...base, operation: 'recover', eventKey: 'recover' }).outcome).toBe('confirmed');
      const prompt = runtime.handle({ ...base, operation: 'capture_root', eventKey: 'prompt', content: 'One root prompt.' });
      expect(runtime.handle({ ...base, operation: 'capture_root', eventKey: 'prompt', content: 'One root prompt.' })).toMatchObject({ duplicate: true, evidenceId: prompt.evidenceId });
      expect(runtime.handle({ ...base, operation: 'guide_post_compact', eventKey: 'early' }).outcome).toBe('degraded');
      expect(runtime.handle({ ...base, operation: 'checkpoint_pre_compact', eventKey: 'pre', content: 'Checkpoint.' }).outcome).toBe('confirmed');
      expect(runtime.handle({ ...base, operation: 'guide_post_compact', eventKey: 'post' }).outcome).toBe('confirmed');
      expect(runtime.handle({ ...base, operation: 'finalize', eventKey: 'finish' }).outcome).toBe('confirmed');
    } finally { service.close(); }
  });

  it('confirms one root prompt across duplicate delivery and restart', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-lifecycle-')); const path = join(root, 'memory.sqlite');
    const input = { operation: 'capture_root' as const, harness: 'codex' as const, project: { key: 'repo:life', name: 'life' }, rootSessionKey: 'root-1', eventKey: 'event-1', content: 'private-safe root request' };
    try {
      let service = new MemoryService({ databasePath: path }); const first = service.lifecycle(input); service.close();
      service = new MemoryService({ databasePath: path }); const duplicate = service.lifecycle(input);
      expect(first).toMatchObject({ outcome: 'confirmed', duplicate: false });
      expect(duplicate).toMatchObject({ outcome: 'confirmed', duplicate: true, evidenceId: first.evidenceId });
      expect(service.context({ projectKey: 'repo:life' }).items).toEqual([]);
      service.close();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('persists and returns degraded identity confidence across retries', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-lifecycle-degraded-')); const path = join(root, 'memory.sqlite');
    const input = { operation: 'capture_root' as const, harness: 'codex' as const, project: { key: 'repo:degraded', name: 'degraded' }, rootSessionKey: 'root-1', eventKey: 'codex:degraded:fallback', identityConfidence: 'degraded' as const, content: 'same prompt without a stable turn id' };
    let service: MemoryService | undefined;
    try {
      service = new MemoryService({ databasePath: path }); const first = service.lifecycle(input); service.close();
      service = new MemoryService({ databasePath: path }); const duplicate = service.lifecycle(input);
      expect(first).toMatchObject({ outcome: 'degraded', duplicate: false, evidenceId: null, capability: { memoryConfirmed: false } });
      expect(duplicate).toMatchObject({ outcome: 'degraded', duplicate: true, evidenceId: null, capability: { memoryConfirmed: false } });
      expect(service.recall({ projectKey: 'repo:degraded', query: 'stable turn' }).items).toEqual([]);
    } finally { service?.close(); rmSync(root, { recursive: true, force: true }); }
  });

  it('orders checkpoint before guidance and finalizes idempotently', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const base = { harness: 'opencode' as const, project: { key: 'repo:life', name: 'life' }, rootSessionKey: 'root-1' };
      expect(service.lifecycle({ ...base, operation: 'guide_post_compact', eventKey: 'too-early' })).toMatchObject({ outcome: 'degraded' });
      expect(service.lifecycle({ ...base, operation: 'checkpoint_pre_compact', eventKey: 'pre', content: 'handoff' }).outcome).toBe('confirmed');
      expect(service.lifecycle({ ...base, operation: 'guide_post_compact', eventKey: 'post' }).outcome).toBe('confirmed');
      expect(service.lifecycle({ ...base, operation: 'finalize', eventKey: 'end' }).outcome).toBe('confirmed');
      expect(service.lifecycle({ ...base, operation: 'finalize', eventKey: 'end' }).duplicate).toBe(true);
    } finally { service.close(); }
  });

  it('does not auto-capture passive tool or subagent streams', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      service.lifecycle({ operation: 'enroll', harness: 'codex', project: { key: 'repo:passive', name: 'passive' }, rootSessionKey: 'root', eventKey: 'enroll' });
      expect(service.context({ projectKey: 'repo:passive' }).items).toEqual([]);
      expect(service.recall({ projectKey: 'repo:passive', query: 'tool subagent' }).items).toEqual([]);
    } finally { service.close(); }
  });

  it('keeps root prompts as filtered evidence and promotes one idempotent checkpoint handoff', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const base = { harness: 'opencode' as const, project: { key: 'repo:layers', name: 'layers' }, rootSessionKey: 'root-layers' };
      const prompt = service.lifecycle({
        ...base,
        operation: 'capture_root',
        eventKey: 'prompt-1',
        content: 'Keep the public request. <private>never persist this secret</private>',
      });
      expect(prompt.evidenceId).toEqual(expect.any(String));
      expect(service.get({ id: prompt.evidenceId! }).record).toMatchObject({
        kind: 'root_prompt',
        content: 'Keep the public request. ',
      });
      expect(service.context({ projectKey: 'repo:layers' }).items).toEqual([]);

      const checkpointInput = {
        ...base,
        operation: 'checkpoint_pre_compact' as const,
        eventKey: 'checkpoint-1',
        content: 'Objective: restore continuity. First pending action: implement the selector.',
      };
      const checkpoint = service.lifecycle(checkpointInput);
      const replay = service.lifecycle(checkpointInput);
      expect(replay).toMatchObject({ duplicate: true, evidenceId: checkpoint.evidenceId });
      expect(service.context({ projectKey: 'repo:layers' }).items).toEqual([
        expect.objectContaining({
          kind: 'handoff',
          content: checkpointInput.content,
          evidenceIds: [checkpoint.evidenceId],
        }),
      ]);
    } finally { service.close(); }
  });

  it('redacts recognizable credentials from automatically captured evidence and handoffs', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const credential = `github_pat_${'a'.repeat(40)}`;
    try {
      const base = { harness: 'opencode' as const, project: { key: 'repo:credentials', name: 'credentials' }, rootSessionKey: 'root-credentials' };
      const prompt = service.lifecycle({
        ...base,
        operation: 'capture_root',
        eventKey: 'prompt-with-credential',
        content: `Keep this request, but remove ${credential} before persistence.`,
      });
      const checkpoint = service.lifecycle({
        ...base,
        operation: 'checkpoint_pre_compact',
        eventKey: 'checkpoint-with-credential',
        content: `Objective: continue safely. First pending action: rotate ${credential}.`,
      });
      const rotatedCredential = `github_pat_${'b'.repeat(40)}`;
      const checkpointReplay = service.lifecycle({
        ...base,
        operation: 'checkpoint_pre_compact',
        eventKey: 'checkpoint-with-credential',
        content: `Objective: continue safely. First pending action: rotate ${rotatedCredential}.`,
      });

      const promptRecord = service.get({ id: prompt.evidenceId! }).record;
      const checkpointRecord = service.get({ id: checkpoint.evidenceId! }).record;
      const handoff = service.context({ projectKey: base.project.key }).items[0]!;
      for (const content of [promptRecord.content, checkpointRecord.content, handoff.content!]) {
        expect(content).not.toContain(credential);
        expect(content).toContain('[REDACTED]');
      }
      expect(promptRecord.content).toContain('Keep this request');
      expect(handoff.content).toContain('Objective: continue safely');
      expect(checkpointReplay).toMatchObject({ duplicate: true, evidenceId: checkpoint.evidenceId });
      expect(service.context({ projectKey: base.project.key }).items).toHaveLength(1);
    } finally { service.close(); }
  });

  it('recovers Codex-seeded source attribution and stable IDs from OpenCode through one database', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-cross-host-'));
    const databasePath = join(root, 'memory.sqlite');
    const project = { key: 'path:C:/fixture/cross-host', name: 'cross-host' };
    try {
      let service = new MemoryService({ databasePath });
      const seeded = service.save({
        project,
        session: { harness: 'codex', rootSessionKey: 'codex-root' },
        eventKey: 'codex:handoff:stable',
        evidence: { kind: 'handoff', content: 'Continue with the SQLite-first native plugin.', sourceRef: 'codex:handoff' },
        memory: { kind: 'handoff', title: 'Cross-host native handoff', content: 'Continue with the SQLite-first native plugin.', topicKey: 'handoff/native-plugin' },
      });
      service.close();

      service = new MemoryService({ databasePath });
      const recovered = service.lifecycle({ operation: 'recover', harness: 'opencode', project, rootSessionKey: 'opencode-root', eventKey: 'opencode:start' });
      expect(recovered.recovery?.items).toEqual([
        expect.objectContaining({ id: seeded.memory!.id, evidenceIds: [seeded.evidence.id], content: 'Continue with the SQLite-first native plugin.' }),
      ]);
      expect(recovered.recovery?.context).toContain('Continue with the SQLite-first native plugin.');
      expect(recovered.recovery?.context).toContain(`(memory:${seeded.memory!.id})`);
      expect(recovered.recovery?.context).not.toContain(seeded.evidence.id);
      expect(recovered.recovery?.selectedMemoryIds).toEqual([seeded.memory!.id]);
      expect(recovered.recovery?.rendering).toMatchObject({ maxCodePoints: MAX_HOST_OUTPUT_CODE_POINTS, contentCodePoints: expect.any(Number), usefulContentRatio: expect.any(Number) });
      expect(recovered.recovery?.sources).toEqual([seeded.memory!.id, seeded.evidence.id]);
      expect(recovered.capability.contextDelivered).toBe(true);
      const replay = service.lifecycle({ operation: 'recover', harness: 'opencode', project, rootSessionKey: 'opencode-root', eventKey: 'opencode:start' });
      expect(replay).toMatchObject({ duplicate: true, recovery: { context: recovered.recovery?.context, selectedMemoryIds: [seeded.memory!.id] } });
      expect(service.get({ id: seeded.evidence.id }).record).toMatchObject({ id: seeded.evidence.id, sourceRef: 'codex:handoff' });
      expect(service.get({ id: seeded.memory!.id }).record).toMatchObject({ id: seeded.memory!.id, evidenceIds: [seeded.evidence.id] });
      service.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports identity-only truth when candidates exist but no useful item can fit', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      service.save({
        project: { key: 'repo:no-fit', name: 'no-fit' },
        evidence: { kind: 'handoff', content: 'Useful continuation evidence.' },
        memory: { kind: 'handoff', title: 'title '.repeat(300), content: 'Useful continuation content.' },
      });
      const recovered = service.lifecycle({ operation: 'recover', harness: 'codex', project: { key: 'repo:no-fit', name: 'no-fit' }, rootSessionKey: 'root-no-fit', eventKey: 'recover-no-fit' });
      expect(recovered.recovery).toMatchObject({ items: [], selectedMemoryIds: [], sources: [] });
      expect(recovered.recovery?.context.startsWith(`${RECOVERY_TAG_START}\nthoth-mem verified identity:`)).toBe(true);
      expect(recovered.recovery?.context.endsWith(`\n${RECOVERY_TAG_END}`)).toBe(true);
      expect(Array.from(recovered.recovery?.context ?? '')).toHaveLength(recovered.recovery?.rendering.totalCodePoints ?? -1);
      expect(recovered.capability).toMatchObject({ contextDelivered: false, modelConsumed: false });
    } finally { service.close(); }
  });

  it('does not deliver project memories through a degraded lifecycle identity', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const saved = service.save({
        project: { key: 'repo:degraded-recovery', name: 'degraded-recovery' },
        evidence: { kind: 'handoff', content: 'Sensitive project continuation.' },
        memory: { kind: 'handoff', title: 'Project continuation', content: 'Sensitive project continuation.' },
      });
      const recovered = service.lifecycle({ operation: 'recover', harness: 'codex', project: { key: 'repo:degraded-recovery', name: 'degraded-recovery' }, rootSessionKey: 'root-degraded', eventKey: 'recover-degraded', identityConfidence: 'degraded' });
      expect(recovered).toMatchObject({ outcome: 'degraded', recovery: { items: [], selectedMemoryIds: [], sources: [] }, capability: { memoryConfirmed: false, contextDelivered: false, modelConsumed: false } });
      expect(recovered.recovery?.context).not.toContain(saved.memory!.id);
    } finally { service.close(); }
  });
});
