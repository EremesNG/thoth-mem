import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { HARNESS_VALUES, type LifecycleInput } from '../../src/memory-core/contracts.js';
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
          const prematureGuide = operation === 'guide_post_compact';
          expect(result).toMatchObject({ outcome: prematureGuide ? 'degraded' : identityConfidence, duplicate: false });
          expect(database.prepare('SELECT id,state FROM sessions').all()).toEqual([{ id: result.sessionId, state: operation === 'checkpoint_pre_compact' ? 'compacted' : 'active' }]);
          expect(database.prepare('SELECT diagnostic_code FROM lifecycle_receipts').all()).toEqual([{ diagnostic_code: prematureGuide ? 'precompact_unconfirmed' : identityConfidence === 'degraded' ? 'identity_unconfirmed' : null }]);
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
        expect(service.get({ id: result.recovery!.selectedSummaryIds[0]! }).record).toMatchObject({ sessionId: previous.sessionId, kind: 'checkpoint' });
      } else {
        expect(result.recovery).toMatchObject({ selectedRecordIds: [], sources: [] });
        expect(database.prepare('SELECT count(*) AS count FROM session_summaries').get()).toEqual({ count: 0 });
        expect(database.prepare('SELECT count(*) AS count FROM evidence').get()).toEqual({ count: 1 });
      }
    } finally { database.close(); service.close(); }
  });
});
