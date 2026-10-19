import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { normalizeNativePayload } from '../../src/integration/adapters/index.js';
import { LifecycleRuntime } from '../../src/integration/core/lifecycle.js';
import { MAX_HOST_OUTPUT_CODE_POINTS, RECOVERY_TAG_END, RECOVERY_TAG_START } from '../../src/memory-core/continuation.js';
import { MemoryService } from '../../src/memory-core/service.js';

describe('host-neutral lifecycle', () => {
  it('stores sanitized host compaction evidence and cited claims, reusing only the newest parsed host sections', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const base = { harness: 'pi' as const, project: { key: 'repo:host-compaction', name: 'host' }, rootSessionKey: 'root' };
    try {
      service.lifecycle({ ...base, operation: 'checkpoint_pre_compact', eventKey: 'pre' });
      const input = { ...base, operation: 'guide_post_compact' as const, eventKey: 'host-1', content: '## Goal\nRestore continuity. <private>secret</private>\n## Done\nParser added.\n## Next Steps\nRun tests.' };
      const guided = service.lifecycle(input);
      expect(guided).toMatchObject({ outcome: 'confirmed', evidenceId: expect.any(String), summaryId: expect.any(String), event: { sequence: 1 } });
      expect(service.get({ id: guided.evidenceId! }).record).toMatchObject({ kind: 'checkpoint', content: '## Goal\nRestore continuity. \n## Done\nParser added.\n## Next Steps\nRun tests.' });
      expect(service.get({ id: guided.summaryId! }).record).toMatchObject({ kind: 'checkpoint', coverage: { fromSequence: 1, toSequence: 1 }, generator: { kind: 'harness' }, claims: expect.arrayContaining([
        expect.objectContaining({ kind: 'objective', content: 'Restore continuity.', supportIds: [guided.evidenceId] }),
        expect.objectContaining({ kind: 'completed', content: 'Parser added.', supportIds: [guided.evidenceId] }),
        expect.objectContaining({ kind: 'next_action', content: 'Run tests.', supportIds: [guided.evidenceId] }),
      ]) });
      service.lifecycle({ ...base, operation: 'capture_root', eventKey: 'prompt', content: 'A later objective.' });
      expect(service.lifecycle(input)).toMatchObject({ duplicate: true, summaryId: guided.summaryId, evidenceId: guided.evidenceId, event: guided.event });
      expect(() => service.lifecycle({ ...input, content: '## Goal\nChanged.' })).toThrow(/reused with different content\/summary/u);
      service.lifecycle({ ...base, operation: 'checkpoint_pre_compact', eventKey: 'pre-2' });
      const newer = service.lifecycle({ ...base, operation: 'guide_post_compact', eventKey: 'host-2', content: '## Goal\nNew host objective.\n## Next Steps\nFinish adapters.' });
      const unrecognized = service.lifecycle({ ...base, operation: 'guide_post_compact', eventKey: 'unrecognized', content: 'Unstructured host text.' });
      expect(unrecognized).toMatchObject({ evidenceId: expect.any(String), summaryId: null });
      expect(service.get({ id: unrecognized.evidenceId! }).record).toMatchObject({ kind: 'checkpoint', content: 'Unstructured host text.' });
      const final = service.lifecycle({ ...base, operation: 'finalize', eventKey: 'final' });
      const record = service.get({ id: final.summaryId! }).record;
      expect(record).toMatchObject({ claims: expect.arrayContaining([
        expect.objectContaining({ kind: 'objective', content: 'A later objective.' }),
        expect.objectContaining({ kind: 'objective', content: 'New host objective.', supportIds: [newer.evidenceId] }),
        expect.objectContaining({ kind: 'next_action', content: 'Finish adapters.', supportIds: [newer.evidenceId] }),
      ]) });
      expect(JSON.stringify(record)).not.toContain('Run tests.');
      expect(JSON.stringify(record)).not.toContain('Unstructured host text.');
      expect(JSON.stringify(record)).not.toContain('secret');
      expect(service.context({ projectKey: base.project.key })).toMatchObject({ selectedMemoryIds: [], selectedSummaryIds: [final.summaryId] });
      expect(service.listObservations({ projectKey: base.project.key }).items).toEqual([]);
    } finally { service.close(); }
  });

  it('keeps host text without an ordered session event as evidence only', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const base = { harness: 'import' as const, project: { key: 'repo:unordered-host', name: 'unordered' }, rootSessionKey: 'root' };
    try {
      service.lifecycle({ ...base, operation: 'checkpoint_pre_compact', eventKey: 'pre' });
      const receipt = service.lifecycle({ ...base, operation: 'guide_post_compact', eventKey: 'post', content: '## Goal\nNot ordered session support.' });
      expect(receipt).toMatchObject({ evidenceId: expect.any(String), event: null, summaryId: null });
      expect(service.projectSummaries({ projectKey: base.project.key }).items).toEqual([]);
    } finally { service.close(); }
  });

  it('keeps premature and degraded host text fail-closed and binds retries to sanitized content', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const base = { harness: 'claude' as const, project: { key: 'repo:host-closed', name: 'closed' }, rootSessionKey: 'root' };
    try {
      service.save({ project: base.project, session: { harness: 'pi', rootSessionKey: 'previous' }, evidence: { kind: 'root_prompt', content: 'Previous objective.' } });
      service.save({ project: base.project, evidence: { kind: 'handoff', content: 'Project work.' }, memory: { kind: 'handoff', title: 'Continue', content: 'Project work.', topicKey: 'handoff/current' } });
      const input = { ...base, operation: 'guide_post_compact' as const, eventKey: 'early', content: '## Goal\nPremature text.' };
      expect(service.lifecycle(input)).toMatchObject({ outcome: 'degraded', evidenceId: null, summaryId: null, recovery: { selectedRecordIds: [], sources: [] }, capability: { contextDelivered: false } });
      service.lifecycle({ ...base, operation: 'checkpoint_pre_compact', eventKey: 'pre' });
      expect(service.lifecycle(input)).toMatchObject({ outcome: 'degraded', duplicate: true, evidenceId: null, summaryId: null });
      expect(() => service.lifecycle({ ...input, content: 'Different text.' })).toThrow(/reused with different content\/summary/u);
      const degraded = service.lifecycle({ ...base, operation: 'guide_post_compact', eventKey: 'degraded', identityConfidence: 'degraded', content: '## Goal\nUnverified text.' });
      expect(degraded).toMatchObject({ outcome: 'degraded', evidenceId: null, summaryId: null, recovery: { selectedRecordIds: [], sources: [] }, capability: { contextDelivered: false } });
      expect(service.projectSummaries({ projectKey: base.project.key }).items).toEqual([]);
    } finally { service.close(); }
  });

  it('derives checkpoint and final summaries when omitted, preserving original receipts after newer evidence', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const base = { harness: 'pi' as const, project: { key: 'repo:derived-lifecycle', name: 'derived' }, rootSessionKey: 'root' };
    try {
      const empty = service.lifecycle({ ...base, rootSessionKey: 'empty', operation: 'finalize', eventKey: 'empty-final' });
      expect(empty.summaryId).toBeNull();
      const prompt = service.lifecycle({ ...base, operation: 'capture_root', eventKey: 'prompt', content: 'Implement summaries.' });
      const checkpointInput = { ...base, operation: 'checkpoint_pre_compact' as const, eventKey: 'checkpoint' };
      const checkpoint = service.lifecycle(checkpointInput);
      expect(checkpoint.summaryId).toEqual(expect.any(String));
      expect(service.get({ id: checkpoint.summaryId! }).record).toMatchObject({ kind: 'checkpoint', coverage: { fromSequence: 1, toSequence: 1 }, generator: { kind: 'harness' }, claims: [expect.objectContaining({ kind: 'objective', content: 'Implement summaries.', supportIds: [prompt.evidenceId] })] });
      const finalInput = { ...base, operation: 'finalize' as const, eventKey: 'final' };
      const final = service.lifecycle(finalInput);
      expect(final.summaryId).toEqual(expect.any(String));
      expect(service.get({ id: final.summaryId! }).record).toMatchObject({ kind: 'final', coverage: { fromSequence: 1, toSequence: 1 } });
      service.lifecycle({ ...base, operation: 'capture_root', eventKey: 'later', content: 'New evidence after those receipts.' });
      expect(service.lifecycle(checkpointInput)).toMatchObject({ duplicate: true, summaryId: checkpoint.summaryId, evidenceId: checkpoint.evidenceId });
      expect(service.lifecycle(finalInput)).toMatchObject({ duplicate: true, summaryId: final.summaryId, evidenceId: final.evidenceId });
      expect(service.projectSummaries({ projectKey: base.project.key, history: true }).items).toHaveLength(2);
      const next = service.lifecycle({ ...base, operation: 'checkpoint_pre_compact', eventKey: 'checkpoint-2' });
      expect(service.get({ id: next.summaryId! }).record).toMatchObject({ version: 2, coverage: { fromSequence: 1, toSequence: 4 } });
      expect(() => service.lifecycle({ ...checkpointInput, content: 'Changed content.' })).toThrow(/reused with different content\/summary/u);
      const degraded = service.lifecycle({ ...base, operation: 'finalize', eventKey: 'degraded-final', identityConfidence: 'degraded' });
      expect(degraded).toMatchObject({ outcome: 'degraded', summaryId: null, evidenceId: null });
    } finally { service.close(); }
  });

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
      expect(service.context({ projectKey: 'repo:life' })).toMatchObject({ selectedMemoryIds: [], selectedSummaryIds: [expect.any(String)] });
      service.close();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('captures distinct Codex steers in one turn and deduplicates an exact retry', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const payload = {
        hook_event_name: 'UserPromptSubmit',
        session_id: 'root-steered-prompts',
        turn_id: 'turn-in-progress',
        cwd: 'C:\\fixture\\codex-steered-prompts',
      };
      const firstInput = normalizeNativePayload('codex', { ...payload, prompt: 'First steer.' });
      const secondInput = normalizeNativePayload('codex', { ...payload, prompt: 'Second steer.' });

      const first = service.lifecycle(firstInput);
      const second = service.lifecycle(secondInput);
      const retry = service.lifecycle(firstInput);

      expect(first).toMatchObject({ outcome: 'confirmed', duplicate: false, event: { sequence: 1 } });
      expect(second).toMatchObject({ outcome: 'confirmed', duplicate: false, event: { sequence: 2 } });
      expect(retry).toMatchObject({ duplicate: true, evidenceId: first.evidenceId, event: { sequence: 1 } });
    } finally { service.close(); }
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
      expect(service.listObservations({ projectKey: 'repo:passive' }).items).toEqual([]);
    } finally { service.close(); }
  });

  it('keeps root prompts and checkpoint content as filtered evidence without automatic promotion', () => {
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
      expect(service.context({ projectKey: 'repo:layers' }).selectedMemoryIds).toEqual([]);

      const checkpointInput = {
        ...base,
        operation: 'checkpoint_pre_compact' as const,
        eventKey: 'checkpoint-1',
        content: 'Objective: restore continuity. First pending action: implement the selector.',
      };
      const checkpoint = service.lifecycle(checkpointInput);
      const replay = service.lifecycle(checkpointInput);
      expect(replay).toMatchObject({ duplicate: true, evidenceId: checkpoint.evidenceId });
      expect(service.get({ id: checkpoint.evidenceId! }).record).toMatchObject({ kind: 'checkpoint', content: checkpointInput.content });
      expect(service.context({ projectKey: 'repo:layers' }).selectedMemoryIds).toEqual([]);
      expect(service.recall({ projectKey: 'repo:layers', query: 'continuity' }).items).toEqual([]);
      expect(service.listObservations({ projectKey: 'repo:layers' }).items).toEqual([]);
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
      for (const content of [promptRecord.content, checkpointRecord.content]) {
        expect(content).not.toContain(credential);
        expect(content).toContain('[REDACTED]');
      }
      expect(promptRecord.content).toContain('Keep this request');
      expect(checkpointRecord.content).toContain('Objective: continue safely');
      expect(checkpointReplay).toMatchObject({ duplicate: true, evidenceId: checkpoint.evidenceId });
      const context = service.context({ projectKey: base.project.key });
      expect(context.selectedMemoryIds).toEqual([]);
      expect(JSON.stringify(context.items)).not.toContain(credential);
    } finally { service.close(); }
  });

  it('recovers Codex-seeded source attribution and stable IDs from OpenCode through one database', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-cross-host-'));
    const databasePath = join(root, 'memory.sqlite');
    const project = { key: 'path:C:/fixture/cross-host', name: 'cross-host' };
    const handoffContent = `Objective: continue the SQLite-first native plugin. Completed: automatic context delivery is verified. ${'Relevant cross-host detail. '.repeat(14)}First pending action: HIDDEN-CROSS-HOST-ACTION. Blockers: none. Key files/checks: continuation renderer and lifecycle smoke.`;
    let service: MemoryService | undefined;
    try {
      service = new MemoryService({ databasePath });
      const seeded = service.save({
        project,
        session: { harness: 'codex', rootSessionKey: 'codex-root' },
        eventKey: 'codex:handoff:stable',
        evidence: { kind: 'handoff', content: handoffContent, sourceRef: 'codex:handoff' },
        memory: { kind: 'handoff', title: 'Cross-host native handoff', content: handoffContent, topicKey: 'handoff/native-plugin' },
      });
      service.save({
        project,
        evidence: { kind: 'explicit_save', content: 'Older SQLite decision evidence.' },
        memory: { kind: 'decision', title: 'Older SQLite decision', content: `SQLite remains authoritative. ${'Decision detail. '.repeat(120)}` },
      });
      service.save({
        project,
        evidence: { kind: 'explicit_save', content: 'Older failed runtime evidence.' },
        memory: { kind: 'failure', title: 'Older failed runtime', content: `A direct Bun SQLite load failed. ${'Failure detail. '.repeat(120)}`, outcome: 'failed' },
      });
      service.close();

      service = new MemoryService({ databasePath });
      const recovered = service.lifecycle({ operation: 'recover', harness: 'opencode', project, rootSessionKey: 'opencode-root', eventKey: 'opencode:start' });
      expect(recovered.recovery?.items[0]).toEqual(expect.objectContaining({ id: seeded.memory!.id, evidenceIds: [seeded.evidence.id], content: handoffContent }));
      expect(recovered.recovery?.context).toContain(handoffContent);
      expect(recovered.recovery?.context).toContain('First pending action: HIDDEN-CROSS-HOST-ACTION.');
      expect(recovered.recovery?.context).toContain(`(memory:${seeded.memory!.id})`);
      expect(recovered.recovery?.context).not.toContain(seeded.evidence.id);
      expect(recovered.recovery?.selectedMemoryIds[0]).toBe(seeded.memory!.id);
      expect(recovered.recovery?.rendering).toMatchObject({ maxCodePoints: MAX_HOST_OUTPUT_CODE_POINTS, contentCodePoints: expect.any(Number), usefulContentRatio: expect.any(Number) });
      expect(recovered.recovery?.sources).toEqual(expect.arrayContaining([seeded.memory!.id, seeded.evidence.id]));
      expect(recovered.capability.contextDelivered).toBe(true);
      const replay = service.lifecycle({ operation: 'recover', harness: 'opencode', project, rootSessionKey: 'opencode-root', eventKey: 'opencode:start' });
      expect(replay).toMatchObject({ duplicate: false, sessionId: recovered.sessionId, recovery: { context: recovered.recovery?.context, selectedMemoryIds: recovered.recovery?.selectedMemoryIds } });
      expect(service.get({ id: seeded.evidence.id }).record).toMatchObject({ id: seeded.evidence.id, sourceRef: 'codex:handoff' });
      expect(service.get({ id: seeded.memory!.id }).record).toMatchObject({ id: seeded.memory!.id, evidenceIds: [seeded.evidence.id] });
    } finally {
      service?.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports identity-only truth when candidates exist but no useful item can fit', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      service.save({
        project: { key: 'repo:no-fit', name: 'no-fit' },
        evidence: { kind: 'handoff', content: 'Useful continuation evidence.' },
        memory: { kind: 'handoff', topicKey: 'handoff/test-line-223', title: 'title '.repeat(300), content: 'Useful continuation content.' },
      });
      const recovered = service.lifecycle({ operation: 'recover', harness: 'codex', project: { key: 'repo:no-fit', name: 'no-fit' }, rootSessionKey: 'root-no-fit', eventKey: 'recover-no-fit' });
      expect(recovered.recovery).toMatchObject({ items: [], selectedMemoryIds: [], sources: [] });
      expect(recovered.recovery?.context.startsWith(`${RECOVERY_TAG_START}\nthoth-mem verified identity:`)).toBe(true);
      expect(recovered.recovery?.context.endsWith(`\n${RECOVERY_TAG_END}`)).toBe(true);
      expect(recovered.recovery?.context.split('\n')[2]).toBe('No memory was recovered; this does not show the project has none. Use mem_recall before relying on prior context.');
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
        memory: { kind: 'handoff', topicKey: 'handoff/test-line-240', title: 'Project continuation', content: 'Sensitive project continuation.' },
      });
      const recovered = service.lifecycle({ operation: 'recover', harness: 'codex', project: { key: 'repo:degraded-recovery', name: 'degraded-recovery' }, rootSessionKey: 'root-degraded', eventKey: 'recover-degraded', identityConfidence: 'degraded' });
      expect(recovered).toMatchObject({ outcome: 'degraded', recovery: { items: [], selectedMemoryIds: [], sources: [] }, capability: { memoryConfirmed: false, contextDelivered: false, modelConsumed: false } });
      expect(recovered.recovery?.context).not.toContain(saved.memory!.id);
      expect(recovered.recovery?.context.split('\n')[2]).toBe('No memory was recovered; this does not show the project has none. Use mem_recall before relying on prior context.');
    } finally { service.close(); }
  });

  it('excludes its own checkpoint and final summaries from automatic recovery but preserves explicit reads', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const base = { harness: 'codex' as const, project: { key: 'repo:summary-lifecycle', name: 'summary-lifecycle' }, rootSessionKey: 'root-summary' };
    try {
      const memory = service.save({ project: base.project, evidence: { kind: 'explicit_save', content: 'Project decision.' }, memory: { kind: 'decision', title: 'Recovery', content: 'Keep project recovery after compaction.' } }).memory!;
      const prompt = service.lifecycle({ ...base, operation: 'capture_root', eventKey: 'prompt', content: 'Implement supported session summaries.' });
      const checkpoint = service.lifecycle({
        ...base, operation: 'checkpoint_pre_compact', eventKey: 'checkpoint',
        summary: { kind: 'checkpoint', coverage: { fromSequence: 1, toSequence: 1 }, generator: { kind: 'root_agent', name: 'codex' }, claims: [{ kind: 'objective', content: 'OWN-CHECKPOINT-SUMMARY', supportIds: [prompt.evidenceId!] }] },
      });
      const guided = service.lifecycle({ ...base, operation: 'guide_post_compact', eventKey: 'post' });
      const ordinary = service.lifecycle({ ...base, operation: 'recover', eventKey: 'recover' });
      for (const receipt of [guided, ordinary]) {
        expect(receipt.recovery).toMatchObject({ selectedSummaryIds: [], selectedMemoryIds: [memory.id], selectedRecordIds: [memory.id] });
        expect(receipt.recovery?.context).not.toContain('OWN-CHECKPOINT-SUMMARY');
        expect(receipt.recovery?.context).toContain('Keep project recovery after compaction.');
      }
      expect(guided.recovery).toEqual(ordinary.recovery);
      expect(service.context({ projectKey: base.project.key, rootSessionKey: base.rootSessionKey, harness: base.harness }).selectedSummaryIds).toEqual([checkpoint.summaryId]);
      const final = service.lifecycle({ ...base, operation: 'finalize', eventKey: 'final' });
      const input = { ...base, operation: 'recover' as const, eventKey: 'recover-final' };
      for (const receipt of [service.lifecycle(input), service.lifecycle(input)]) {
        expect(receipt.recovery?.selectedSummaryIds).toEqual([]);
        expect(receipt.recovery?.selectedMemoryIds).toEqual([memory.id]);
        expect(receipt.capability).toMatchObject({ contextDelivered: true, modelConsumed: false });
      }
      expect(service.context({ projectKey: base.project.key, rootSessionKey: base.rootSessionKey, harness: base.harness }).selectedSummaryIds).toEqual([final.summaryId]);
    } finally { service.close(); }
  });
  it.each(['codex', 'opencode', 'claude', 'pi'] as const)('renders the same project recovery after %s compaction, excluding its own summary', (harness) => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: `repo:compact-${harness}`, name: `compact-${harness}` };
    try {
      const unrelated = service.save({
        project,
        evidence: { kind: 'handoff', content: 'UNRELATED-PROJECT-HANDOFF' },
        memory: { kind: 'handoff', topicKey: 'handoff/test-line-283', title: 'Unrelated project handoff', content: 'UNRELATED-PROJECT-HANDOFF' },
      });
      const foreignPrompt = service.lifecycle({
        operation: 'capture_root', harness, project, rootSessionKey: 'foreign-root', eventKey: 'foreign-prompt', content: 'Foreign work.',
      });
      const previousSummary = service.lifecycle({
        operation: 'checkpoint_pre_compact', harness, project, rootSessionKey: 'foreign-root', eventKey: 'foreign-checkpoint',
        summary: { kind: 'checkpoint', coverage: { fromSequence: 1, toSequence: 1 }, generator: { kind: 'root_agent', name: harness }, claims: [{ kind: 'objective', content: 'FOREIGN-SESSION-SUMMARY', supportIds: [foreignPrompt.evidenceId!] }] },
      });

      service.lifecycle({ operation: 'checkpoint_pre_compact', harness, project, rootSessionKey: 'summaryless-root', eventKey: 'summaryless-checkpoint' });
      const summaryless = service.lifecycle({ operation: 'guide_post_compact', harness, project, rootSessionKey: 'summaryless-root', eventKey: 'summaryless-guide' });
      expect(summaryless.recovery).toMatchObject({ selectedSummaryIds: [previousSummary.summaryId], selectedMemoryIds: [unrelated.memory!.id], selectedRecordIds: [unrelated.memory!.id, previousSummary.summaryId] });
      expect(summaryless.recovery?.context).toContain('UNRELATED-PROJECT-HANDOFF');
      expect(summaryless.recovery?.context).toContain('FOREIGN-SESSION-SUMMARY');
      expect(summaryless.capability).toMatchObject({ contextDelivered: true, modelConsumed: false });

      const ordinary = service.lifecycle({ operation: 'recover', harness, project, rootSessionKey: 'summaryless-root', eventKey: 'ordinary-recover' });
      expect(ordinary.recovery).toEqual(summaryless.recovery);
      expect(ordinary.recovery?.context).toContain('UNRELATED-PROJECT-HANDOFF');
      expect(ordinary.capability).toMatchObject({ contextDelivered: true, modelConsumed: false });

      const exactPrompt = service.lifecycle({
        operation: 'capture_root', harness, project, rootSessionKey: 'exact-root', eventKey: 'exact-prompt', content: 'Exact work.',
      });
      const checkpoint = service.lifecycle({
        operation: 'checkpoint_pre_compact', harness, project, rootSessionKey: 'exact-root', eventKey: 'exact-checkpoint',
        summary: { kind: 'checkpoint', coverage: { fromSequence: 1, toSequence: 1 }, generator: { kind: 'root_agent', name: harness }, claims: [{ kind: 'next_action', content: 'EXACT-SESSION-NEXT-ACTION', supportIds: [exactPrompt.evidenceId!] }] },
      });
      const exact = service.lifecycle({ operation: 'guide_post_compact', harness, project, rootSessionKey: 'exact-root', eventKey: 'exact-guide' });
      expect(exact.recovery).toMatchObject({ selectedSummaryIds: [previousSummary.summaryId], selectedMemoryIds: [unrelated.memory!.id], selectedRecordIds: [unrelated.memory!.id, previousSummary.summaryId] });
      expect(exact.recovery?.selectedSummaryIds).not.toContain(checkpoint.summaryId);
      expect(exact.recovery?.context).not.toContain('EXACT-SESSION-NEXT-ACTION');
      expect(exact.recovery?.context).toContain('UNRELATED-PROJECT-HANDOFF');
      expect(exact.capability).toMatchObject({ contextDelivered: true, modelConsumed: false });
    } finally { service.close(); }
  });
});
