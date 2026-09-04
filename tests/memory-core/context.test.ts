import { describe, expect, it } from 'vitest';

import { MemoryService } from '../../src/memory-core/service.js';

describe('progressive context funnel', () => {
  it('moves compact to context to full fetch with stable IDs and explicit measurements', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const content = `Critical parser decision. ${'Supporting detail '.repeat(80)}`;
      const saved = service.save({ project: { key: 'repo:context', name: 'context' }, evidence: { kind: 'explicit_save', content }, memory: { kind: 'architecture', title: 'Parser decision', content, topicKey: 'parser/decision' } });
      const compact = service.recall({ projectKey: 'repo:context', query: 'parser decision', mode: 'compact', budgetChars: 120 });
      const context = service.recall({ projectKey: 'repo:context', query: 'parser decision', mode: 'context', budgetChars: 300, correlationId: compact.correlationId });
      const full = service.get({ id: saved.memory!.id });
      expect(compact.items[0]?.id).toBe(saved.memory!.id); expect(context.items[0]?.id).toBe(saved.memory!.id);
      expect(compact.budget).toMatchObject({ tokenBasis: 'estimated_chars_div_4', requestedChars: 120 });
      expect(context.budget.compressionRatio).toBeLessThan(1); expect(full.record.content).toBe(content);
      expect(context.correlationId).toBe(compact.correlationId);
    } finally { service.close(); }
  });

  it('selects a deterministic handoff-first continuation with failure lessons and project isolation', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const old = service.save({ project: { key: 'repo:context', name: 'context' }, evidence: { kind: 'explicit_save', content: 'Use old lane.' }, memory: { kind: 'decision', title: 'Lane', content: 'Use old lane.', topicKey: 'lane', outcome: 'failed' } }).memory!;
      const current = service.save({ project: { key: 'repo:context', name: 'context' }, evidence: { kind: 'explicit_save', content: 'RAW-EVIDENCE-SHOULD-NOT-APPEAR' }, memory: { kind: 'decision', title: 'Lane', content: 'Use current lane.', topicKey: 'lane', outcome: 'succeeded' } }).memory!;
      service.save({ project: { key: 'repo:context', name: 'context' }, evidence: { kind: 'explicit_save', content: 'Failure evidence.' }, memory: { kind: 'failure', title: 'Bun native driver', content: 'Attempted better-sqlite3 in Bun; it failed to load. Use the Node sidecar.', outcome: 'mixed' } });
      service.save({ project: { key: 'repo:context', name: 'context' }, evidence: { kind: 'explicit_save', content: 'Structure evidence.' }, memory: { kind: 'project_structure', title: 'Runtime split', content: 'Bun adapter is pure; persistence runs in Node.' } });
      service.save({ project: { key: 'repo:foreign', name: 'foreign' }, evidence: { kind: 'explicit_save', content: 'Foreign evidence.' }, memory: { kind: 'handoff', title: 'Foreign handoff', content: 'FOREIGN-PROJECT-MARKER' } });
      const handoffContent = 'Objective: MEMORY-OPERATING-MODEL. Completed: research and Skill contract. Archive path: openspec/changes/archive/memory-operating-model. First pending action: IMPLEMENT-CONTINUATION-SELECTOR. Blockers: none. Key files/checks: src/memory-core/service.ts.';
      const checkpoint = service.save({ project: { key: 'repo:context', name: 'context' }, evidence: { kind: 'handoff', content: handoffContent }, memory: { kind: 'handoff', title: 'Legacy continuation', content: handoffContent, topicKey: 'session/root/checkpoint' } });
      const briefing = service.context({ projectKey: 'repo:context', budgetChars: 1_400 });
      const repeated = service.context({ projectKey: 'repo:context', budgetChars: 1_400 });
      expect(briefing.items[0]).toMatchObject({ kind: 'handoff', evidenceIds: [checkpoint.evidence.id] });
      expect(briefing.items[0]?.content).toContain('MEMORY-OPERATING-MODEL');
      expect(briefing.items[0]?.content).toContain('openspec/changes/archive/memory-operating-model');
      expect(briefing.items[0]?.content).toContain('IMPLEMENT-CONTINUATION-SELECTOR');
      expect(briefing.items.findIndex((item) => item.kind === 'failure')).toBeLessThan(briefing.items.findIndex((item) => item.kind === 'project_structure'));
      expect(briefing.items.map((item) => item.id)).not.toContain(old.id);
      expect(briefing.items.map((item) => item.id)).toContain(current.id);
      expect(briefing.items.map((item) => item.id)).toEqual(repeated.items.map((item) => item.id));
      expect(briefing.items.map((item) => item.content)).toEqual(repeated.items.map((item) => item.content));
      expect(briefing.items.map((item) => item.content).join('\n')).not.toContain('RAW-EVIDENCE-SHOULD-NOT-APPEAR');
      expect(briefing.items.map((item) => item.content).join('\n')).not.toContain('FOREIGN-PROJECT-MARKER');
      expect(briefing.budget.returnedChars).toBeLessThanOrEqual(1_400);
      const history = service.recall({ projectKey: 'repo:context', query: 'lane', history: true }).items;
      expect(history.map((item) => item.id)).toEqual(expect.arrayContaining([old.id, current.id]));
      expect(service.get({ id: current.id, history: true }).lineage.map((item) => item.id)).toEqual([current.id, old.id]);
    } finally { service.close(); }
  });

  it('enforces one aggregate recovery budget and returns checkpoint provenance after compaction', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      for (let index = 0; index < 3; index++) service.save({ project: { key: 'repo:budget', name: 'budget' }, evidence: { kind: 'explicit_save', content: `Decision ${index} ${'detail '.repeat(30)}` }, memory: { kind: 'decision', title: `Decision ${index}`, content: `Decision ${index} ${'detail '.repeat(30)}` } });
      const bounded = service.context({ projectKey: 'repo:budget', budgetChars: 100 });
      expect(bounded.items.reduce((sum, item) => sum + item.snippet.length, 0)).toBeLessThanOrEqual(100);
      expect(bounded.budget).toMatchObject({ requestedChars: 100, returnedChars: expect.any(Number), tokenBasis: 'estimated_chars_div_4' });
      expect(bounded.budget.returnedChars).toBeLessThanOrEqual(100);

      const base = { harness: 'codex' as const, project: { key: 'repo:recover', name: 'recover' }, rootSessionKey: 'root' };
      const checkpoint = service.save({ project: base.project, session: { rootSessionKey: base.rootSessionKey, harness: base.harness }, eventKey: 'legacy-handoff', evidence: { kind: 'handoff', content: 'Resume the verified migration at task T055.' }, memory: { kind: 'handoff', title: 'Legacy checkpoint', content: 'Resume the verified migration at task T055.', topicKey: 'session/root/checkpoint' } });
      const recovery = service.lifecycle({ ...base, operation: 'recover', eventKey: 'recover' });
      expect(recovery.recovery?.items[0]).toMatchObject({ kind: 'handoff', evidenceIds: [checkpoint.evidence.id] });
      expect(recovery.recovery?.sources).toContain(checkpoint.evidence.id);
      expect(recovery.capability).toMatchObject({ hookExecuted: true, memoryConfirmed: true, contextDelivered: true, modelConsumed: false });
    } finally { service.close(); }
  });

  it('selects only the verified session newest summary, preferring final on a coverage tie', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:summary-context', name: 'summary-context' };
    try {
      service.save({ project, evidence: { kind: 'handoff', content: 'Fallback evidence.' }, memory: { kind: 'handoff', title: 'Fallback', content: 'LEGACY-HANDOFF-FALLBACK' } });
      const support = service.save({ project, session: { rootSessionKey: 'root-1', harness: 'codex' }, eventKey: 'support', evidence: { kind: 'explicit_save', content: 'Session one support.' } });
      const baseSummary = { coverage: { fromSequence: 1, toSequence: 1 }, generator: { kind: 'root_agent' as const, name: 'codex' }, claims: [{ kind: 'objective' as const, content: 'SESSION-ONE-SUMMARY', supportIds: [support.evidence.id] }] };
      const checkpoint = service.lifecycle({ operation: 'checkpoint_pre_compact', harness: 'codex', project, rootSessionKey: 'root-1', eventKey: 'checkpoint', summary: { ...baseSummary, kind: 'checkpoint' } });
      const final = service.lifecycle({ operation: 'finalize', harness: 'codex', project, rootSessionKey: 'root-1', eventKey: 'final', summary: { ...baseSummary, kind: 'final' } });
      const foreignSupport = service.save({ project, session: { rootSessionKey: 'root-2', harness: 'codex' }, eventKey: 'foreign-support', evidence: { kind: 'explicit_save', content: 'Session two support.' } });
      service.lifecycle({ operation: 'finalize', harness: 'codex', project, rootSessionKey: 'root-2', eventKey: 'foreign-final', summary: { kind: 'final', coverage: { fromSequence: 1, toSequence: 1 }, generator: { kind: 'root_agent', name: 'codex' }, claims: [{ kind: 'objective', content: 'FOREIGN-SESSION-SUMMARY', supportIds: [foreignSupport.evidence.id] }] } });

      const scoped = service.context({ projectKey: project.key, rootSessionKey: 'root-1', harness: 'codex', budgetChars: 2_000 });
      expect(scoped.items[0]).toMatchObject({ recordType: 'summary', id: final.summaryId, kind: 'final' });
      expect(scoped.items.map((item) => item.id)).not.toContain(checkpoint.summaryId);
      expect(JSON.stringify(scoped.items)).not.toContain('FOREIGN-SESSION-SUMMARY');
      expect(scoped.selectedSummaryIds).toEqual([final.summaryId]);
      expect(scoped.selectedRecordIds).toEqual(scoped.items.map((item) => item.id));

      const projectOnly = service.context({ projectKey: project.key, budgetChars: 2_000 });
      expect(projectOnly.items[0]).toMatchObject({ kind: 'handoff', content: 'LEGACY-HANDOFF-FALLBACK' });
      expect(projectOnly.selectedSummaryIds).toEqual([]);
      expect(() => service.context({ projectKey: project.key, rootSessionKey: 'root-1' })).toThrow(/supplied together/i);
    } finally { service.close(); }
  });
});
