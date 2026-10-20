import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { EVIDENCE_KIND_VALUES, HARNESS_VALUES, type LifecycleInput } from '../../src/memory-core/contracts.js';
import { MemoryService } from '../../src/memory-core/service.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'thoth-lazy-session-'));
  roots.push(root);
  const databasePath = join(root, 'memory.sqlite');
  const service = new MemoryService({ databasePath });
  const database = new Database(databasePath, { readonly: true });
  return { service, database };
}

const noOpInputs: Array<Pick<LifecycleInput, 'operation' | 'content'>> = [
  { operation: 'enroll' },
  { operation: 'recover' },
  { operation: 'finalize' },
  { operation: 'capture_root' },
  { operation: 'capture_root', content: ' \n\t ' },
  { operation: 'capture_root', content: '<private>Only private content.</private>' },
];

describe('stateless session activity', () => {
  it('keeps summary evidence outside the activity watermark', () => {
    const { service, database } = fixture();
    const base = { harness: 'pi' as const, project: { key: 'repo:summary-only', name: 'summary-only' }, rootSessionKey: 'root' };
    try {
      service.lifecycle({ ...base, operation: 'capture_root', eventKey: 'first', content: 'First root prompt.' });
      const final = service.lifecycle({ ...base, operation: 'finalize', eventKey: 'final' });
      const identity = database.prepare('SELECT id,project_id,root_session_key,harness,started_at FROM sessions WHERE id=?').get(final.sessionId);
      const submission = service.get({ id: final.evidenceId! }).record;
      const saved = service.save({ project: base.project, session: base, evidence: { kind: 'session_summary', content: submission.content } });
      expect(saved.event).not.toBeNull();
      expect(database.prepare('SELECT id,project_id,root_session_key,harness,started_at FROM sessions WHERE id=?').get(final.sessionId)).toEqual(identity);
      const checkpoint = service.deriveAndPersistSessionSummary(final.sessionId);
      expect(checkpoint).toMatchObject({ coverage: { toSequence: 1 } });
      expect(database.prepare('SELECT id,project_id,root_session_key,harness,started_at FROM sessions WHERE id=?').get(final.sessionId)).toEqual(identity);
    } finally { database.close(); service.close(); }
  });

  it('keeps lifecycle no-ops, retries and project-only evidence outside session activity', () => {
    const { service, database } = fixture();
    const base = { harness: 'codex' as const, project: { key: 'repo:no-op-activity', name: 'no-op-activity' }, rootSessionKey: 'root' };
    const promptInput = { ...base, operation: 'capture_root' as const, eventKey: 'first', content: 'First root prompt.' };
    const saveInput = { project: base.project, session: base, eventKey: 'saved', evidence: { kind: 'explicit_save' as const, content: 'Saved evidence.' } };
    const checkpointInput = { ...base, operation: 'checkpoint_pre_compact' as const, eventKey: 'checkpoint', content: 'Checkpoint evidence.' };
    const finalInput = { ...base, operation: 'finalize' as const, eventKey: 'final' };
    try {
      const prompt = service.lifecycle(promptInput);
      const saved = service.save(saveInput);
      const checkpoint = service.lifecycle(checkpointInput);
      const final = service.lifecycle(finalInput);
      const identity = database.prepare('SELECT id,project_id,root_session_key,harness,started_at FROM sessions WHERE id=?').get(final.sessionId);
      const evidenceCount = database.prepare('SELECT count(*) AS count FROM evidence').get();
      expect(service.lifecycle(promptInput)).toMatchObject({ duplicate: true, evidenceId: prompt.evidenceId });
      expect(service.save(saveInput)).toMatchObject({ duplicate: true, evidence: { id: saved.evidence.id } });
      expect(service.lifecycle(checkpointInput)).toMatchObject({ duplicate: true, summaryId: checkpoint.summaryId });
      expect(service.lifecycle(finalInput)).toMatchObject({ duplicate: true, summaryId: final.summaryId });
      for (const [index, input] of noOpInputs.entries()) {
        if (input.operation === 'finalize') continue;
        expect(service.lifecycle({ ...base, ...input, eventKey: `no-op-${index}` })).toMatchObject({ evidenceId: null, summaryId: null });
        expect(database.prepare('SELECT id,project_id,root_session_key,harness,started_at FROM sessions WHERE id=?').get(final.sessionId)).toEqual(identity);
      }
      expect(database.prepare('SELECT count(*) AS count FROM evidence').get()).toEqual(evidenceCount);
      service.save({ project: base.project, evidence: { kind: 'explicit_save', content: 'Project-only evidence.' } });
      expect(database.prepare('SELECT id,project_id,root_session_key,harness,started_at FROM sessions WHERE id=?').get(final.sessionId)).toEqual(identity);
    } finally { database.close(); service.close(); }
  });

  it('rolls back event allocation when the evidence save fails later in the same transaction', () => {
    const { service, database } = fixture();
    const base = { harness: 'pi' as const, project: { key: 'repo:atomic-activity', name: 'atomic' }, rootSessionKey: 'root' };
    try {
      service.lifecycle({ ...base, operation: 'capture_root', eventKey: 'first', content: 'First root prompt.' });
      const final = service.lifecycle({ ...base, operation: 'finalize', eventKey: 'final' });
      const session = database.prepare('SELECT * FROM sessions WHERE id=?').get(final.sessionId);
      const evidenceCount = database.prepare('SELECT count(*) AS count FROM evidence').get();
      expect(() => service.save({ project: base.project, session: base, evidence: { kind: 'explicit_save', content: 'New activity.' }, memory: { kind: 'handoff', title: 'Invalid handoff', content: 'Missing its topic key.' } })).toThrow('requires topic_key');
      expect(database.prepare('SELECT * FROM sessions WHERE id=?').get(final.sessionId)).toEqual(session);
      expect(database.prepare('SELECT count(*) AS count FROM evidence').get()).toEqual(evidenceCount);
    } finally { database.close(); service.close(); }
  });

  it('stores and parses host text without pre-compaction and renders project recovery', () => {
    const { service, database } = fixture();
    const base = { harness: 'pi' as const, project: { key: 'repo:guide', name: 'guide' }, rootSessionKey: 'root' };
    try {
      const memory = service.save({ project: base.project, evidence: { kind: 'explicit_save', content: 'Keep SQLite.' }, memory: { kind: 'decision', title: 'Storage', content: 'Keep SQLite.' } }).memory!;
      const input = { ...base, operation: 'guide_post_compact' as const, eventKey: 'guide', content: '## Goal\nContinue after compaction.' };
      const guide = service.lifecycle(input);
      expect(guide).toMatchObject({ outcome: 'confirmed', evidenceId: expect.any(String), summaryId: expect.any(String), event: { sequence: 1 } });
      expect(service.get({ id: guide.evidenceId! }).record).toMatchObject({ kind: 'checkpoint', metadata: { source: 'host_compaction' } });
      expect(service.get({ id: guide.summaryId! }).record).toMatchObject({ claims: [expect.objectContaining({ kind: 'objective', content: 'Continue after compaction.', supportIds: [guide.evidenceId] })] });
      expect(guide.recovery?.selectedMemoryIds).toEqual([memory.id]);
      expect(guide.recovery?.selectedSummaryIds).toEqual([]);
      expect(service.lifecycle(input)).toMatchObject({ duplicate: true, evidenceId: guide.evidenceId, summaryId: guide.summaryId });
    } finally { database.close(); service.close(); }
  });

  it('lazily derives a checkpoint after a degraded finalize without later activity', () => {
    const { service, database } = fixture();
    const base = { harness: 'codex' as const, project: { key: 'repo:lazy-after-finalize', name: 'lazy' }, rootSessionKey: 'root' };
    try {
      service.lifecycle({ ...base, operation: 'capture_root', eventKey: 'first', content: 'Retain the session objective after finalize.' });
      const final = service.lifecycle({ ...base, operation: 'finalize', eventKey: 'final', identityConfidence: 'degraded' });
      expect(final.summaryId).toBeNull();
      const identity = database.prepare('SELECT id,project_id,root_session_key,harness,started_at FROM sessions WHERE id=?').get(final.sessionId);
      expect(service.projectSummaries({ projectKey: base.project.key }).items).toEqual([]);
      const context = service.context({ projectKey: base.project.key, rootSessionKey: 'next', harness: 'pi' }, 'recovery');
      expect(context.selectedSummaryIds).toHaveLength(1);
      expect(service.get({ id: context.selectedSummaryIds[0]! }).record).toMatchObject({ sessionId: final.sessionId, coverage: { toSequence: 1 } });
      expect(database.prepare('SELECT id,project_id,root_session_key,harness,started_at FROM sessions WHERE id=?').get(final.sessionId)).toEqual(identity);
    } finally { database.close(); service.close(); }
  });

  it.each(EVIDENCE_KIND_VALUES.filter((kind) => kind !== 'session_summary'))('accepts a direct %s save after finalization', (kind) => {
    const { service, database } = fixture();
    const base = { harness: 'pi' as const, project: { key: 'repo:saved-activity', name: 'saved' }, rootSessionKey: 'root' };
    try {
      service.lifecycle({ ...base, operation: 'capture_root', eventKey: 'first', content: 'First root prompt.' });
      const final = service.lifecycle({ ...base, operation: 'finalize', eventKey: 'final' });
      const saved = service.save({ project: base.project, session: base, evidence: { kind, content: 'New session-attributed evidence.' } });
      expect(saved.sessionId).toBe(final.sessionId);
      expect(service.get({ id: saved.evidence.id }).record).toMatchObject({ sessionId: final.sessionId });
    } finally { database.close(); service.close(); }
  });

  it('accepts activity after import finalization without fabricating an ordered event', () => {
    const { service, database } = fixture();
    const base = { harness: 'import' as const, project: { key: 'repo:unordered-activity', name: 'unordered' }, rootSessionKey: 'root' };
    try {
      service.save({ project: base.project, session: base, evidence: { kind: 'explicit_save', content: 'First evidence.' } });
      const final = service.lifecycle({ ...base, operation: 'finalize', eventKey: 'final' });
      const saved = service.save({ project: base.project, session: base, evidence: { kind: 'explicit_save', content: 'New session-attributed evidence.' } });
      expect(saved.event).toBeNull();
      expect(service.get({ id: saved.evidence.id }).record).toMatchObject({ sessionId: final.sessionId });
    } finally { database.close(); service.close(); }
  });

  it.each(['codex', 'pi'] as const)('derives a new final version after a resumed %s root prompt', (harness) => {
    const { service, database } = fixture();
    const base = { harness, project: { key: 'repo:resumed', name: 'resumed' }, rootSessionKey: 'root' };
    try {
      service.lifecycle({ ...base, operation: 'capture_root', eventKey: 'first', content: 'First root prompt.' });
      const final = service.lifecycle({ ...base, operation: 'finalize', eventKey: 'final' });
      expect(database.prepare("SELECT name FROM pragma_table_info('sessions') WHERE name IN ('state','ended_at')").all()).toEqual([]);
      const resumed = service.lifecycle({ ...base, operation: 'capture_root', eventKey: 'resumed', content: 'Continue the root session with a new substantive objective.' });
      expect(resumed).toMatchObject({ duplicate: false, evidenceId: expect.any(String), sessionId: final.sessionId });
      const next = service.lifecycle({ ...base, operation: 'finalize', eventKey: 'final-resumed' });
      expect(next.summaryId).not.toBe(final.summaryId);
      expect(service.get({ id: next.summaryId! }).record).toMatchObject({ version: 2, supersedesId: final.summaryId, coverage: { toSequence: resumed.event!.sequence }, claims: expect.arrayContaining([expect.objectContaining({ supportIds: [resumed.evidenceId] })]) });
    } finally { database.close(); service.close(); }
  });
});

describe('lazy session lifecycle', () => {
  describe.each(HARNESS_VALUES)('%s harness', (harness) => {
    describe.each(['confirmed', 'degraded'] as const)('%s identity', (identityConfidence) => {
      it.each(noOpInputs)('leaves no trace for untouched $operation ($content)', (input) => {
        const { service, database } = fixture();
        const base = { harness, identityConfidence, project: { key: 'repo:untouched', name: 'untouched' }, rootSessionKey: 'root', eventKey: 'untouched' };
        try {
          const first = service.lifecycle({ ...base, ...input });
          expect(first).toMatchObject({
            outcome: identityConfidence, duplicate: false, sessionId: expect.any(String),
            evidenceId: null, summaryId: null, event: null,
            capability: { memoryConfirmed: identityConfidence === 'confirmed', contextDelivered: false, modelConsumed: false },
          });
          expect(service.lifecycle({ ...base, ...input })).toMatchObject({ duplicate: false, sessionId: first.sessionId });
          for (const table of ['sessions', 'lifecycle_receipts', 'session_summaries', 'evidence']) {
            expect(database.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
          }
          if (input.operation === 'recover') {
            expect(first.recovery).toMatchObject({ selectedRecordIds: [], sources: [] });
            expect(first.recovery?.context).toContain('root_session_id=root; project_key=repo:untouched');
          } else expect(first.recovery).toBeUndefined();
          const saved = service.save({ project: base.project, session: base, evidence: { kind: 'explicit_save', content: 'First real activity.' } });
          expect(saved.sessionId).toBe(first.sessionId);
          expect(database.prepare('SELECT count(*) AS count FROM sessions').get()).toEqual({ count: 1 });
          const existing = service.lifecycle({ ...base, ...input });
          expect(existing).toMatchObject({ outcome: identityConfidence, duplicate: false, sessionId: first.sessionId });
          expect(service.lifecycle({ ...base, ...input })).toMatchObject({ duplicate: true, evidenceId: existing.evidenceId, summaryId: existing.summaryId });
          expect(() => service.lifecycle({ ...base, ...input, content: 'Changed payload.' })).toThrow(/reused with different content\/summary/u);
        } finally { database.close(); service.close(); }
      });

      it.each(['capture_root', 'checkpoint_pre_compact', 'guide_post_compact'] as const)('creates one session on first %s activity', (operation) => {
        const { service, database } = fixture();
        const input = { operation, harness, identityConfidence, project: { key: 'repo:activity', name: 'activity' }, rootSessionKey: 'root', eventKey: 'activity', ...(operation === 'capture_root' ? { content: 'First root prompt.' } : {}) };
        try {
          const result = service.lifecycle(input);
          expect(result).toMatchObject({ outcome: identityConfidence, duplicate: false });
          expect(database.prepare('SELECT id FROM sessions').all()).toEqual([{ id: result.sessionId }]);
          expect(database.prepare('SELECT diagnostic_code FROM lifecycle_receipts').all()).toEqual([{ diagnostic_code: identityConfidence === 'degraded' ? 'identity_unconfirmed' : null }]);
          expect(service.lifecycle(input)).toMatchObject({ duplicate: true, sessionId: result.sessionId, evidenceId: result.evidenceId, summaryId: result.summaryId });
          expect(database.prepare('SELECT count(*) AS count FROM sessions').get()).toEqual({ count: 1 });
        } finally { database.close(); service.close(); }
      });
    });
  });

  it.each(['confirmed', 'degraded'] as const)('recovers without a current session and derives predecessor context only for %s identity', (identityConfidence) => {
    const { service, database } = fixture();
    const project = { key: 'repo:predecessor', name: 'predecessor' };
    try {
      const previous = service.save({ project, session: { harness: 'claude', rootSessionKey: 'previous' }, evidence: { kind: 'root_prompt', content: 'Continue the predecessor investigation.' } });
      expect(database.prepare('SELECT count(*) AS count FROM session_summaries').get()).toEqual({ count: 0 });
      const result = service.lifecycle({ operation: 'recover', harness: 'pi', rootSessionKey: 'current', eventKey: 'recover', project, identityConfidence });
      expect(result).toMatchObject({ outcome: identityConfidence, duplicate: false, evidenceId: null, summaryId: null, event: null, capability: { memoryConfirmed: identityConfidence === 'confirmed', contextDelivered: identityConfidence === 'confirmed' } });
      expect(database.prepare('SELECT id FROM sessions').all()).toEqual([{ id: previous.sessionId }]);
      expect(database.prepare('SELECT count(*) AS count FROM lifecycle_receipts').get()).toEqual({ count: 0 });
      if (identityConfidence === 'confirmed') {
        expect(result.recovery?.context).toContain('Continue the predecessor investigation.');
        expect(service.get({ id: result.recovery!.selectedSummaryIds[0]! }).record).toMatchObject({ sessionId: previous.sessionId });
      } else {
        expect(result.recovery).toMatchObject({ selectedRecordIds: [], sources: [] });
        expect(database.prepare('SELECT count(*) AS count FROM session_summaries').get()).toEqual({ count: 0 });
        expect(database.prepare('SELECT count(*) AS count FROM evidence').get()).toEqual({ count: 1 });
      }
    } finally { database.close(); service.close(); }
  });
});
