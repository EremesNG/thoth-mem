import { describe, expect, it } from 'vitest';

import { MemoryService } from '../../src/memory-core/service.js';

describe('MemoryService', () => {
  it('captures evidence without promotion and keeps punctuation recall safe', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const saved = service.save({ project: { key: 'repo:test', name: 'test' }, evidence: { kind: 'explicit_save', content: 'C++ parser uses foo_bar.' } });
      expect(saved.memory).toBeNull();
      expect(service.recall({ projectKey: 'repo:test', query: '!!!', mode: 'compact' }).items).toEqual([]);
      expect(service.recall({ projectKey: 'repo:test', query: 'foo_bar', mode: 'compact' }).items).toEqual([]);
    } finally {
      service.close();
    }
  });

  it('removes private blocks before durable capture', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const saved = service.save({ project: { key: 'repo:test', name: 'test' }, evidence: { kind: 'explicit_save', content: 'Public. <private>SECRET</private> Safe.' } });
      expect(service.get({ id: saved.evidence.id }).record.content).toBe('Public.  Safe.');
      expect(() => service.save({ project: { key: 'repo:test', name: 'test' }, evidence: { kind: 'explicit_save', content: '<private>ONLY SECRET</private>' } })).toThrow(/content is required/i);
    } finally { service.close(); }
  });

  it('makes explicit save event keys idempotent without time-window deduplication', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const input = { project: { key: 'repo:test', name: 'test' }, eventKey: 'caller:event:1', evidence: { kind: 'explicit_save' as const, content: 'Intentional repeated text.' } };
      const first = service.save(input); const duplicate = service.save(input);
      expect(duplicate).toMatchObject({ duplicate: true, evidence: { id: first.evidence.id } });
      const distinct = service.save({ ...input, eventKey: 'caller:event:2' });
      expect(distinct.evidence.id).not.toBe(first.evidence.id);
    } finally { service.close(); }
  });

  it('returns compact, context, briefing, and full-fetch measurements with stable IDs', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const saved = service.save({
        project: { key: 'repo:test', name: 'test' },
        evidence: { kind: 'explicit_save', content: 'The parser is strict and rejects malformed input.' },
        memory: { kind: 'architecture', title: 'Strict parser', content: 'Keep parsing strict. Reject malformed input deterministically.', topicKey: 'parser/strict' },
      });
      const compact = service.recall({ projectKey: 'repo:test', query: 'parser malformed', mode: 'compact', budgetChars: 120 });
      expect(compact.items[0]).toMatchObject({ id: saved.memory?.id, lane: 'lexical' });
      expect(compact.budget.compressionRatio).toBeGreaterThanOrEqual(0);
      const context = service.recall({ projectKey: 'repo:test', query: 'parser', mode: 'context', budgetChars: 300 });
      expect(context.items[0]?.content).toContain('strict');
      expect(service.get({ id: saved.memory!.id }).record.content).toContain('deterministically');
      expect(service.context({ projectKey: 'repo:test', budgetChars: 400 }).items[0]?.id).toBe(saved.memory?.id);
    } finally {
      service.close();
    }
  });

  it('retracts with immutable contradictory evidence instead of deleting history', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const saved = service.save({ project: { key: 'repo:test', name: 'test' }, evidence: { kind: 'explicit_save', content: 'Initial claim.' }, memory: { kind: 'discovery', title: 'Claim', content: 'Initial claim.', topicKey: 'claim' } });
      const retracted = service.retract({ id: saved.memory!.id, evidence: { kind: 'explicit_save', content: 'The claim was disproved.' } });
      expect(retracted.status).toBe('retracted');
      expect(retracted.evidenceIds).toHaveLength(2);
      expect(service.get({ id: retracted.id }).record).toMatchObject({ content: 'Initial claim.', status: 'retracted' });
    } finally { service.close(); }
  });
});
