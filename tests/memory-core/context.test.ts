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

  it('keeps project recovery separate, deterministic, temporal, and usable after compaction', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const old = service.save({ project: { key: 'repo:context', name: 'context' }, evidence: { kind: 'explicit_save', content: 'Use old lane.' }, memory: { kind: 'decision', title: 'Lane', content: 'Use old lane.', topicKey: 'lane', outcome: 'failed' } }).memory!;
      const current = service.save({ project: { key: 'repo:context', name: 'context' }, evidence: { kind: 'explicit_save', content: 'Use current lane.' }, memory: { kind: 'decision', title: 'Lane', content: 'Use current lane.', topicKey: 'lane', outcome: 'succeeded' } }).memory!;
      service.lifecycle({ operation: 'checkpoint_pre_compact', harness: 'codex', project: { key: 'repo:context', name: 'context' }, rootSessionKey: 'root', eventKey: 'compact', content: 'Continue with the current lane.' });
      const briefing = service.context({ projectKey: 'repo:context', budgetChars: 500 });
      expect(briefing.items[0]?.id).toBe(current.id); expect(briefing.items.map((item) => item.id)).not.toContain(old.id);
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
      const checkpoint = service.lifecycle({ ...base, operation: 'checkpoint_pre_compact', eventKey: 'pre', content: 'Resume the verified migration at task T055.' });
      const recovery = service.lifecycle({ ...base, operation: 'recover', eventKey: 'recover' });
      expect(recovery.recovery?.items[0]).toMatchObject({ kind: 'handoff', evidenceIds: [checkpoint.evidenceId] });
      expect(recovery.recovery?.sources).toContain(checkpoint.evidenceId);
      expect(recovery.capability).toMatchObject({ hookExecuted: true, memoryConfirmed: true, contextDelivered: true, modelConsumed: false });
    } finally { service.close(); }
  });
});
