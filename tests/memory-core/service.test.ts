import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import type { SaveMemoryInput } from '../../src/memory-core/contracts.js';
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

  it('allocates one ordered event per new verified session write and replays duplicates first', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const input: SaveMemoryInput = {
        project: { key: 'repo:test', name: 'test' },
        session: { rootSessionKey: 'root-1', harness: 'codex' },
        eventKey: 'save-1', evidence: { kind: 'explicit_save', content: 'Public. <private>SECRET</private> Safe.' },
      };
      const first = service.save({ ...input, event: { actor: 'tool', authority: 'tool' } } as SaveMemoryInput);
      const duplicate = service.save(input);
      const second = service.save({ ...input, eventKey: 'save-2', evidence: { ...input.evidence, content: 'Second event.' } });

      expect(first.event).toMatchObject({ sequence: 1, actor: 'agent', authority: 'root_user', retentionClass: 'project', privacyClass: 'standard' });
      expect(first.evidence.content).toBe('Public.  Safe.');
      expect(duplicate).toMatchObject({ duplicate: true, event: { evidenceId: first.evidence.id, sequence: 1 } });
      expect(second.event?.sequence).toBe(2);
    } finally { service.close(); }
  });

  it('rejects duplicate save event keys that drift across root sessions without consuming sequence', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:test', name: 'test' };
    const evidence = { kind: 'explicit_save' as const, content: 'Same payload.' };
    try {
      const first = service.save({
        project,
        session: { rootSessionKey: 'root-1', harness: 'codex' },
        eventKey: 'shared-event',
        evidence,
      });
      expect(service.save({
        project,
        session: { rootSessionKey: 'root-1', harness: 'codex' },
        eventKey: 'shared-event',
        evidence,
      })).toMatchObject({ duplicate: true, sessionId: first.sessionId, event: { sequence: 1 } });

      expect(() => service.save({
        project,
        session: { rootSessionKey: 'root-2', harness: 'codex' },
        eventKey: 'shared-event',
        evidence,
      })).toThrow(/session identity/i);

      expect(service.save({
        project,
        session: { rootSessionKey: 'root-2', harness: 'codex' },
        eventKey: 'root-2-first',
        evidence: { ...evidence, content: 'Root two first event.' },
      }).event?.sequence).toBe(1);
      expect(service.save({
        project,
        session: { rootSessionKey: 'root-1', harness: 'codex' },
        eventKey: 'root-1-second',
        evidence: { ...evidence, content: 'Root one second event.' },
      }).event?.sequence).toBe(2);
    } finally { service.close(); }
  });

  it('rolls sequence allocation back with the evidence transaction and excludes project-only and legacy capture', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const scoped = { project: { key: 'repo:test', name: 'test' }, session: { rootSessionKey: 'root-1', harness: 'codex' as const } };
    try {
      expect(() => service.save({ ...scoped, eventKey: 'bad', evidence: { kind: 'explicit_save', content: 'Will roll back.' }, memory: { kind: 'decision', title: '<private>secret</private>', content: 'content' } })).toThrow(/title and content/i);
      expect(service.save({ ...scoped, eventKey: 'good', evidence: { kind: 'explicit_save', content: 'Committed.' } }).event?.sequence).toBe(1);
      expect(service.save({ project: scoped.project, evidence: { kind: 'explicit_save', content: 'Project evidence.' } }).event).toBeNull();
      expect(service.save({ ...scoped, eventKey: 'legacy', evidence: { kind: 'legacy_prompt', content: 'Imported.' } }).event).toBeNull();
    } finally { service.close(); }
  });

  it('serializes event allocation across independent connections without gaps', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-events-'));
    const path = join(root, 'memory.sqlite');
    const first = new MemoryService({ databasePath: path });
    const second = new MemoryService({ databasePath: path });
    try {
      const base = { project: { key: 'repo:test', name: 'test' }, session: { rootSessionKey: 'root-1', harness: 'codex' as const } };
      const results = [
        first.save({ ...base, eventKey: 'one', evidence: { kind: 'explicit_save', content: 'One.' } }),
        second.save({ ...base, eventKey: 'two', evidence: { kind: 'explicit_save', content: 'Two.' } }),
        first.save({ ...base, eventKey: 'three', evidence: { kind: 'explicit_save', content: 'Three.' } }),
      ];
      expect(results.map((result) => result.event?.sequence)).toEqual([1, 2, 3]);
    } finally {
      first.close(); second.close();
      const database = new Database(path, { readonly: true });
      try {
        expect(database.prepare('SELECT sequence FROM session_events ORDER BY sequence').all()).toEqual([{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }]);
        expect(database.prepare('SELECT next_event_sequence FROM sessions').get()).toEqual({ next_event_sequence: 3 });
      } finally { database.close(); }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('assigns lifecycle-owned trust metadata only to allowlisted captured content', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const base = { harness: 'codex' as const, project: { key: 'repo:test', name: 'test' }, rootSessionKey: 'root-1' };
    try {
      const root = service.lifecycle({ ...base, operation: 'capture_root', eventKey: 'root', content: 'Root request.' });
      const checkpoint = service.lifecycle({ ...base, operation: 'checkpoint_pre_compact', eventKey: 'checkpoint', content: 'Checkpoint.' });
      const recovery = service.lifecycle({ ...base, operation: 'recover', eventKey: 'recover' });
      expect(root.event).toMatchObject({ sequence: 1, actor: 'user', authority: 'root_user' });
      expect(checkpoint.event).toMatchObject({ sequence: 2, actor: 'agent', authority: 'root_user' });
      expect(recovery.event).toBeNull();
    } finally { service.close(); }
  });
});
