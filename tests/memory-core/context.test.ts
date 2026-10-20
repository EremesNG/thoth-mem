import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { MemoryService } from '../../src/memory-core/service.js';

describe('progressive context funnel', () => {
  it('names the missing session field and explains project-only context', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      for (const { identity, message } of [
        { identity: { rootSessionKey: 'root-1' }, message: 'root_session_key supplied without harness' },
        { identity: { harness: 'codex' as const }, message: 'harness supplied without root_session_key' },
      ]) {
        const input = { projectKey: 'repo:missing', ...identity };
        expect(() => service.context(input)).toThrow(new Error(`Supply both root_session_key and harness for session context, or omit both for project context; ${message}`));
        expect(() => service.projectSummaries(input)).toThrow(new Error(message));
        expect(() => service.listObservations(input)).toThrow(new Error(message));
      }
      expect(service.context({ projectKey: 'repo:missing' }).items).toEqual([]);
      expect(service.listProjects()).toEqual([]);
    } finally { service.close(); }
  });

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

  it('requires closable handoffs, leads with only the newest open one, and drops a closed one', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:handoffs', name: 'handoffs' };
    const handoff = (topicKey: string, title: string, capturedAt: string) => service.save({ project, evidence: { kind: 'handoff', content: title, capturedAt }, memory: { kind: 'handoff', title, content: `Objective: ${title}.`, topicKey } }).memory!;
    try {
      expect(() => service.save({ project, evidence: { kind: 'handoff', content: 'Open forever.' }, memory: { kind: 'handoff', title: 'Unclosable', content: 'Open forever.' } })).toThrow('requires topic_key');
      const stale = handoff('handoff/stale', 'Stale workstream', '2026-01-01T00:00:00.000Z');
      service.save({ project, evidence: { kind: 'explicit_save', content: 'Decision.', capturedAt: '2026-01-02T00:00:00.000Z' }, memory: { kind: 'decision', title: 'Lane', content: 'Use the lexical lane.', topicKey: 'lane' } });
      const fresh = handoff('handoff/fresh', 'Fresh workstream', '2026-01-03T00:00:00.000Z');
      expect(service.context({ projectKey: project.key }).items.map((item) => item.id)).toEqual([fresh.id, expect.any(String), stale.id]);

      const closure = service.save({ project, evidence: { kind: 'explicit_save', content: 'Fresh workstream verified.' }, memory: { kind: 'decision', title: 'Fresh workstream completed', content: 'Result: verified.', topicKey: 'handoff/fresh', outcome: 'succeeded' } }).memory!;
      expect(closure.supersedesId).toBe(fresh.id);
      const ids = service.context({ projectKey: project.key }).items.map((item) => item.id);
      expect(ids[0]).toBe(stale.id);
      expect(ids).not.toContain(fresh.id);
      // The closure record stays retrievable but never occupies continuation slots.
      expect(ids).not.toContain(closure.id);
      expect(service.get({ id: closure.id }).record.status).toBe('current');
      expect(service.recall({ projectKey: project.key, query: 'Fresh workstream completed' }).items.map((item) => item.id)).toContain(closure.id);
    } finally { service.close(); }
  });

  it('selects a deterministic handoff-first continuation with failure lessons and project isolation', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const old = service.save({ project: { key: 'repo:context', name: 'context' }, evidence: { kind: 'explicit_save', content: 'Use old lane.' }, memory: { kind: 'decision', title: 'Lane', content: 'Use old lane.', topicKey: 'lane', outcome: 'failed' } }).memory!;
      const current = service.save({ project: { key: 'repo:context', name: 'context' }, evidence: { kind: 'explicit_save', content: 'RAW-EVIDENCE-SHOULD-NOT-APPEAR' }, memory: { kind: 'decision', title: 'Lane', content: 'Use current lane.', topicKey: 'lane', outcome: 'succeeded' } }).memory!;
      service.save({ project: { key: 'repo:context', name: 'context' }, evidence: { kind: 'explicit_save', content: 'Failure evidence.' }, memory: { kind: 'failure', title: 'Bun native driver', content: 'Attempted better-sqlite3 in Bun; it failed to load. Use the Node sidecar.', outcome: 'mixed' } });
      service.save({ project: { key: 'repo:context', name: 'context' }, evidence: { kind: 'explicit_save', content: 'Structure evidence.' }, memory: { kind: 'project_structure', title: 'Runtime split', content: 'Bun adapter is pure; persistence runs in Node.' } });
      service.save({ project: { key: 'repo:foreign', name: 'foreign' }, evidence: { kind: 'explicit_save', content: 'Foreign evidence.' }, memory: { kind: 'handoff', topicKey: 'handoff/test-line-28', title: 'Foreign handoff', content: 'FOREIGN-PROJECT-MARKER' } });
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

  it.each([false, true])('lazily recovers the active predecessor across harnesses (ended=%s) and refreshes duplicate recovery receipts', (ended) => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-reopened-context-'));
    const databasePath = join(root, 'memory.sqlite');
    const service = new MemoryService({ databasePath });
    const database = new Database(databasePath, { readonly: true });
    const project = { key: 'repo:previous', name: 'previous' };
    const previous = { project, harness: 'claude' as const, rootSessionKey: 'previous' };
    const current = { project, harness: 'pi' as const, rootSessionKey: 'current' };
    try {
      // Empty newer sessions, other projects, and late summary submissions are not activity.
      if (ended) {
        service.lifecycle({ ...previous, operation: 'checkpoint_pre_compact', eventKey: 'compact-empty' });
        service.lifecycle({ ...previous, operation: 'finalize', eventKey: 'end-empty' });
      }
      const first = service.save({ project, session: previous, eventKey: 'first', evidence: { kind: 'root_prompt', content: 'PREVIOUS-OBJECTIVE', capturedAt: '2026-01-02T00:00:00Z' } });
      if (ended) expect(database.prepare('SELECT state FROM sessions WHERE id=?').get(first.sessionId)).toEqual({ state: 'active' });
      service.save({ project, session: { rootSessionKey: 'older', harness: 'codex' }, eventKey: 'older', evidence: { kind: 'root_prompt', content: 'OLDER-SESSION', capturedAt: '2026-01-01T00:00:00Z' } });
      service.lifecycle({ project, harness: 'codex', rootSessionKey: 'older', operation: 'finalize', eventKey: 'older-final' });
      service.lifecycle({ project, harness: 'opencode', rootSessionKey: 'empty', operation: 'checkpoint_pre_compact', eventKey: 'empty' });
      service.save({ project: { key: 'repo:other', name: 'other' }, session: { harness: 'pi', rootSessionKey: 'foreign' }, evidence: { kind: 'root_prompt', content: 'FOREIGN-PROJECT', capturedAt: '2026-01-09T00:00:00Z' } });
      service.save({ project, session: current, eventKey: 'own', evidence: { kind: 'root_prompt', content: 'OWN-SUMMARY', capturedAt: '2026-01-10T00:00:00Z' } });
      const own = service.lifecycle({ ...current, operation: 'checkpoint_pre_compact', eventKey: 'own-checkpoint' });
      const stale = service.save({ project, evidence: { kind: 'handoff', content: 'Stale work.', capturedAt: '2026-01-01T00:00:00Z' }, memory: { kind: 'handoff', topicKey: 'handoff/stale', title: 'Stale', content: 'Stale work.' } }).memory!;
      const handoff = service.save({ project, evidence: { kind: 'handoff', content: 'Continue current work.', capturedAt: '2026-01-03T00:00:00Z' }, memory: { kind: 'handoff', topicKey: 'handoff/current', title: 'Current', content: 'Continue current work.' } }).memory!;
      const decision = service.save({ project, evidence: { kind: 'explicit_save', content: 'Keep SQLite.' }, memory: { kind: 'decision', title: 'Storage', content: 'Keep SQLite.' } }).memory!;
      const input = { ...current, operation: 'recover' as const, eventKey: 'refresh' };
      const recovered = service.lifecycle(input);
      const summaryId = recovered.recovery!.selectedSummaryIds[0]!;
      expect(recovered.recovery?.selectedRecordIds).toEqual([handoff.id, summaryId, decision.id]);
      expect(recovered.recovery?.selectedSummaryIds).toHaveLength(1);
      // The internal read seam gives connection sessions recovery selection without lifecycle authority.
      expect(service.context({ projectKey: project.key, rootSessionKey: current.rootSessionKey, harness: current.harness }, 'recovery').selectedRecordIds).toEqual([handoff.id, summaryId, decision.id, stale.id]);
      expect(service.context({ projectKey: project.key, rootSessionKey: current.rootSessionKey, harness: current.harness }).selectedSummaryIds).toEqual([own.summaryId]);
      expect(recovered.recovery?.selectedRecordIds).not.toContain(stale.id);
      expect(recovered.recovery?.selectedRecordIds).not.toContain(own.summaryId);
      expect(recovered.recovery?.context).toContain('PREVIOUS-OBJECTIVE');
      expect(recovered.recovery?.context).not.toMatch(/OWN-SUMMARY|OLDER-SESSION|FOREIGN-PROJECT/u);
      expect(service.get({ id: summaryId }).record).toMatchObject({ sessionId: first.sessionId, kind: 'checkpoint', coverage: { fromSequence: 1, toSequence: 1 } });
      expect(recovered.recovery?.sources).toEqual(expect.arrayContaining([summaryId, service.get({ id: summaryId }).record.submissionEvidenceId]));
      expect(service.lifecycle(input)).toMatchObject({ duplicate: true, recovery: { selectedSummaryIds: [summaryId] } });
      const later = service.save({ project, session: previous, eventKey: 'later', evidence: { kind: 'root_prompt', content: 'PREVIOUS-UPDATED: verify lazy summary recovery with new activity.', capturedAt: '2026-01-04T00:00:00Z' } });
      const replay = service.lifecycle(input);
      const refreshedId = replay.recovery!.selectedSummaryIds[0]!;
      expect(replay.duplicate).toBe(true);
      expect(refreshedId).not.toBe(summaryId);
      expect(replay.recovery?.context).toContain('PREVIOUS-UPDATED');
      expect(service.get({ id: refreshedId }).record).toMatchObject({ sessionId: first.sessionId, kind: 'checkpoint', version: 2, coverage: { toSequence: later.event!.sequence } });
      expect(service.lifecycle(input).recovery?.selectedSummaryIds).toEqual([refreshedId]);
      expect(service.projectSummaries({ projectKey: project.key, rootSessionKey: previous.rootSessionKey, harness: previous.harness, history: true }).items).toHaveLength(2);
      expect(replay.recovery!.rendering.totalCodePoints).toBeLessThanOrEqual(1_000);
      const guided = service.lifecycle({ ...current, operation: 'guide_post_compact', eventKey: 'post' });
      expect(guided.recovery).toEqual(replay.recovery);
    } finally { database.close(); service.close(); rmSync(root, { recursive: true, force: true }); }
  });

  it('uses activity instants with a deterministic session-ID tie and never falls through a summaryless predecessor', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:activity-tie', name: 'tie' };
    try {
      const a = service.save({ project, session: { harness: 'codex', rootSessionKey: 'a' }, evidence: { kind: 'root_prompt', content: 'Objective A.', capturedAt: '2026-01-01T01:00:00+01:00' } });
      const b = service.save({ project, session: { harness: 'pi', rootSessionKey: 'b' }, evidence: { kind: 'root_prompt', content: 'Objective B.', capturedAt: '2026-01-01T00:00:00Z' } });
      const expected = [a.sessionId!, b.sessionId!].sort()[0];
      const first = service.context({ projectKey: project.key });
      expect(first.selectedSummaryIds).toHaveLength(1);
      expect(service.get({ id: first.selectedSummaryIds[0]! }).record.sessionId).toBe(expected);
      expect(service.context({ projectKey: project.key }).selectedSummaryIds).toEqual(first.selectedSummaryIds);
      const latest = service.save({ project, session: { harness: 'mcp', rootSessionKey: 'uncitable' }, evidence: { kind: 'explicit_save', content: 'Uninterpreted evidence.', capturedAt: '2026-02-01T00:00:00Z' } });
      expect(latest.event).not.toBeNull();
      expect(service.context({ projectKey: project.key }).selectedSummaryIds).toEqual([]);
      expect(service.context({ projectKey: project.key, rootSessionKey: 'unknown', harness: 'pi' }).selectedSummaryIds).toEqual([]);
    } finally { service.close(); }
  });

  it('selects only the verified session newest summary, preferring final on a coverage tie', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:summary-context', name: 'summary-context' };
    try {
      service.save({ project, evidence: { kind: 'handoff', content: 'Fallback evidence.' }, memory: { kind: 'handoff', topicKey: 'handoff/test-line-73', title: 'Fallback', content: 'LEGACY-HANDOFF-FALLBACK' } });
      const support = service.save({ project, session: { rootSessionKey: 'root-1', harness: 'codex' }, eventKey: 'support', evidence: { kind: 'explicit_save', content: 'Session one support.', capturedAt: '2026-01-01T00:00:00.000Z' } });
      const baseSummary = { coverage: { fromSequence: 1, toSequence: 1 }, generator: { kind: 'root_agent' as const, name: 'codex' }, claims: [{ kind: 'objective' as const, content: 'SESSION-ONE-SUMMARY', supportIds: [support.evidence.id] }] };
      const checkpoint = service.lifecycle({ operation: 'checkpoint_pre_compact', harness: 'codex', project, rootSessionKey: 'root-1', eventKey: 'checkpoint', summary: { ...baseSummary, kind: 'checkpoint' } });
      const final = service.lifecycle({ operation: 'finalize', harness: 'codex', project, rootSessionKey: 'root-1', eventKey: 'final', summary: { ...baseSummary, kind: 'final' } });
      const foreignSupport = service.save({ project, session: { rootSessionKey: 'root-2', harness: 'codex' }, eventKey: 'foreign-support', evidence: { kind: 'explicit_save', content: 'Session two support.', capturedAt: '2026-01-02T00:00:00.000Z' } });
      const previousFinal = service.lifecycle({ operation: 'finalize', harness: 'codex', project, rootSessionKey: 'root-2', eventKey: 'foreign-final', summary: { kind: 'final', coverage: { fromSequence: 1, toSequence: 1 }, generator: { kind: 'root_agent', name: 'codex' }, claims: [{ kind: 'objective', content: 'FOREIGN-SESSION-SUMMARY', supportIds: [foreignSupport.evidence.id] }] } });

      const scoped = service.context({ projectKey: project.key, rootSessionKey: 'root-1', harness: 'codex', budgetChars: 2_000 });
      expect(scoped.items[0]).toMatchObject({ recordType: 'summary', id: final.summaryId, kind: 'final' });
      expect(scoped.items.map((item) => item.id)).not.toContain(checkpoint.summaryId);
      expect(JSON.stringify(scoped.items)).not.toContain('FOREIGN-SESSION-SUMMARY');
      expect(scoped.selectedSummaryIds).toEqual([final.summaryId]);
      expect(scoped.selectedRecordIds).toEqual(scoped.items.map((item) => item.id));

      const projectOnly = service.context({ projectKey: project.key, budgetChars: 2_000 });
      expect(projectOnly.items[0]).toMatchObject({ kind: 'handoff', content: 'LEGACY-HANDOFF-FALLBACK' });
      expect(projectOnly.items[1]).toMatchObject({ recordType: 'summary', id: previousFinal.summaryId });
      expect(projectOnly.selectedSummaryIds).toEqual([previousFinal.summaryId]);
      for (const budgetChars of [64, 120, 700, 1_000]) {
        const bounded = service.context({ projectKey: project.key, budgetChars });
        expect(bounded.budget.returnedChars).toBeLessThanOrEqual(budgetChars);
        expect(bounded.items.reduce((sum, item) => sum + item.snippet.length, 0)).toBeLessThanOrEqual(budgetChars);
        expect(bounded.selectedSummaryIds.every((id) => id === previousFinal.summaryId)).toBe(true);
        expect(service.context({ projectKey: project.key, budgetChars }).selectedRecordIds).toEqual(bounded.selectedRecordIds);
      }
      expect(() => service.context({ projectKey: project.key, rootSessionKey: 'root-1' })).toThrow(new Error('Supply both root_session_key and harness for session context, or omit both for project context; root_session_key supplied without harness'));
    } finally { service.close(); }
  });
});
