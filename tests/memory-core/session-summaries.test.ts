import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import type { SessionSummaryInput } from '../../src/memory-core/contracts.js';
import { MemoryService } from '../../src/memory-core/service.js';
import {
  canonicalizeSessionSummary,
  rebuildSessionSummaryProjection,
  sessionSummaryFromId,
} from '../../src/memory-core/session-summaries.js';

const roots: string[] = [];

function databasePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'thoth-summaries-'));
  roots.push(root);
  return join(root, 'memory.sqlite');
}

function summary(supportIds: string[], toSequence = supportIds.length): SessionSummaryInput {
  return {
    kind: 'checkpoint',
    coverage: { fromSequence: 1, toSequence },
    generator: { kind: 'root_agent', name: ' codex ', version: ' 1 ', configHash: 'a'.repeat(64) },
    claims: [
      { kind: 'objective', content: ' Ship <private>secret</private> safely. ', supportIds },
      { kind: 'next_action', content: 'Continue.', supportIds: [supportIds.at(-1)!] },
    ],
  };
}

function projectionCounts(path: string): Record<string, number> {
  const database = new Database(path, { readonly: true });
  try {
    return Object.fromEntries(['evidence', 'session_events', 'session_summaries', 'session_summary_claims', 'session_summary_claim_supports', 'lifecycle_receipts', 'change_watermark'].map((table) => [table, Number((database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count)]));
  } finally { database.close(); }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('session summaries', () => {
  it('canonicalizes only the closed, privacy-filtered, bounded submission contract', () => {
    const input = summary(['evidence-b', 'evidence-a'], 2);
    const first = canonicalizeSessionSummary(input);
    const second = canonicalizeSessionSummary({ ...input, claims: input.claims.map((claim) => ({ ...claim, supportIds: claim.supportIds.slice().reverse() })) });
    expect(first.canonicalJson).toBe(second.canonicalJson);
    expect(first.input.generator).toMatchObject({ name: 'codex', version: '1' });
    expect(first.input.claims[0]).toMatchObject({ content: 'Ship  safely.', supportIds: ['evidence-a', 'evidence-b'] });
    expect(first.canonicalJson).not.toContain('secret');
    expect(() => canonicalizeSessionSummary({ ...input, claims: [] })).toThrow(new Error('summary.claims must contain 1-32 items; send bounded atomic claims'));
    expect(() => canonicalizeSessionSummary({ ...input, claims: [{ ...input.claims[0]!, content: 'x'.repeat(2_001) }] })).toThrow(new Error('summary.claims[0].content exceeds 2000 code points; send a shorter value'));
    expect(() => canonicalizeSessionSummary({ ...input, generator: { ...input.generator, configHash: 'NOT-A-HASH' } })).toThrow(new Error('summary.generator.config_hash must be a lowercase SHA-256 hash; send 64 lowercase hexadecimal characters'));
    expect(() => canonicalizeSessionSummary({ ...input, claims: [{ ...input.claims[0]!, supportIds: ['same', ' same '] }] })).toThrow(new Error('summary.claims[0].support_ids contains duplicate support id "same"; send each evidence id once'));
    expect(() => canonicalizeSessionSummary({ ...input, claims: [{ ...input.claims[0]!, supportIds: [] }] })).toThrow(new Error('summary.claims[0].support_ids must contain 1-16 evidence ids'));
    expect(() => canonicalizeSessionSummary({ ...input, coverage: { fromSequence: 2, toSequence: 2 } })).toThrow(new Error('summary.coverage.from_sequence must start at 1; received 2'));
    expect(() => canonicalizeSessionSummary({ ...input, coverage: { fromSequence: 1, toSequence: 0 } })).toThrow(new Error('summary.coverage.to_sequence must be a positive integer >= summary.coverage.from_sequence (1)'));
    expect(() => canonicalizeSessionSummary({ ...input, claims: Array.from({ length: 10 }, () => ({ ...input.claims[0]!, content: 'x'.repeat(2_000) })) })).toThrow(new Error('summary exceeds the 20000 UTF-16 unit canonical submission limit; send fewer or shorter summary.claims'));
  });

  it('persists supported versions atomically, rejects late or foreign support, and never promotes a checkpoint', () => {
    const path = databasePath();
    const service = new MemoryService({ databasePath: path });
    const lifecycle = { harness: 'codex' as const, project: { key: 'repo:test', name: 'test' }, rootSessionKey: 'root-1' };
    try {
      const firstSupport = service.save({ project: lifecycle.project, session: { rootSessionKey: lifecycle.rootSessionKey, harness: lifecycle.harness }, eventKey: 'support-1', evidence: { kind: 'explicit_save', content: 'First support.' } });
      const secondSupport = service.save({ project: lifecycle.project, session: { rootSessionKey: lifecycle.rootSessionKey, harness: lifecycle.harness }, eventKey: 'support-2', evidence: { kind: 'explicit_save', content: 'Second support.' } });
      const firstSummary = summary([firstSupport.evidence.id, secondSupport.evidence.id], 2);
      const submitted = service.lifecycle({ ...lifecycle, operation: 'checkpoint_pre_compact', eventKey: 'summary-1', summary: firstSummary });
      expect(submitted).toMatchObject({ outcome: 'confirmed', duplicate: false, summaryId: expect.any(String) });
      const duplicate = service.lifecycle({ ...lifecycle, operation: 'checkpoint_pre_compact', eventKey: 'summary-1', summary: { ...firstSummary, claims: firstSummary.claims.map((claim, index) => index === 0 ? { ...claim, supportIds: claim.supportIds.slice().reverse() } : claim) } });
      expect(duplicate).toMatchObject({ duplicate: true, summaryId: submitted.summaryId });

      const thirdSupport = service.save({ project: lifecycle.project, session: { rootSessionKey: lifecycle.rootSessionKey, harness: lifecycle.harness }, eventKey: 'support-3', evidence: { kind: 'explicit_save', content: 'Third support.' } });
      const next = service.lifecycle({ ...lifecycle, operation: 'checkpoint_pre_compact', eventKey: 'summary-2', summary: summary([thirdSupport.evidence.id], thirdSupport.event!.sequence) });
      expect(next.summaryId).not.toBe(submitted.summaryId);

      const beforeInvalid = projectionCounts(path);
      expect(() => service.lifecycle({ ...lifecycle, operation: 'checkpoint_pre_compact', eventKey: 'late', summary: summary([firstSupport.evidence.id], 2) })).toThrow(new Error('summary.coverage.to_sequence must exceed the current summary\'s ending sequence 4 for this session and kind="checkpoint"; received 2'));
      const foreign = service.save({ project: { key: 'repo:foreign', name: 'foreign' }, session: { rootSessionKey: 'foreign', harness: 'codex' }, eventKey: 'foreign', evidence: { kind: 'explicit_save', content: 'Foreign.' } });
      expect(() => service.lifecycle({ ...lifecycle, operation: 'checkpoint_pre_compact', eventKey: 'foreign-summary', summary: summary([foreign.evidence.id], 99) })).toThrow(new Error(`summary.claims[0].support_ids: support id "${foreign.evidence.id}" must reference evidence from this project_key + root_session_key/harness session within summary.coverage (1-99)`));
      expect(projectionCounts(path)).toEqual({ ...beforeInvalid, evidence: beforeInvalid.evidence + 1, session_events: beforeInvalid.session_events + 1 });
    } finally { service.close(); }

    const database = new Database(path);
    try {
      const rows = database.prepare('SELECT id,status,version FROM session_summaries ORDER BY version').all();
      expect(rows).toEqual([{ id: expect.any(String), status: 'superseded', version: 1 }, { id: expect.any(String), status: 'current', version: 2 }]);
      expect(database.prepare('SELECT count(*) AS count FROM memories').get()).toEqual({ count: 0 });
    } finally { database.close(); }
  });

  it('identifies the offending claim and support for missing, foreign, unordered, or out-of-range evidence', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:support-errors', name: 'support-errors' };
    const session = { rootSessionKey: 'root-1', harness: 'codex' as const };
    const evidence = { kind: 'explicit_save' as const, content: 'Support.' };
    try {
      const valid = service.save({ project, session, eventKey: 'valid', evidence });
      const outsideCoverage = service.save({ project, session, eventKey: 'outside', evidence });
      const foreignProject = service.save({ project: { key: 'repo:foreign', name: 'foreign' }, session, eventKey: 'foreign-project', evidence });
      const foreignRoot = service.save({ project, session: { ...session, rootSessionKey: 'root-2' }, eventKey: 'foreign-root', evidence });
      const foreignHarness = service.save({ project, session: { ...session, harness: 'claude' }, eventKey: 'foreign-harness', evidence });
      const projectOnly = service.save({ project, eventKey: 'project-only', evidence });
      for (const supportId of ['missing-evidence', foreignProject.evidence.id, foreignRoot.evidence.id, foreignHarness.evidence.id, projectOnly.evidence.id, outsideCoverage.evidence.id]) {
        const input = summary([valid.evidence.id], 1);
        input.claims[1]!.supportIds = [supportId];
        expect(() => service.lifecycle({ harness: session.harness, project, rootSessionKey: session.rootSessionKey, operation: 'checkpoint_pre_compact', eventKey: `invalid:${supportId}`, summary: input })).toThrow(new Error(`summary.claims[1].support_ids: support id "${supportId}" must reference evidence from this project_key + root_session_key/harness session within summary.coverage (1-1)`));
      }
      expect(service.projectSummaries({ projectKey: project.key }).items).toEqual([]);
      expect(service.save({ project, session, eventKey: 'after-errors', evidence }).event?.sequence).toBe(3);
    } finally { service.close(); }
  });

  it('rebuilds byte-stable summary projections from immutable submission evidence without a model or network', () => {
    const path = databasePath();
    const service = new MemoryService({ databasePath: path });
    let summaryId = '';
    try {
      const support = service.save({ project: { key: 'repo:test', name: 'test' }, session: { rootSessionKey: 'root-1', harness: 'codex' }, eventKey: 'support', evidence: { kind: 'explicit_save', content: 'Support.' } });
      summaryId = service.lifecycle({ harness: 'codex', project: { key: 'repo:test', name: 'test' }, rootSessionKey: 'root-1', operation: 'finalize', eventKey: 'final', summary: { ...summary([support.evidence.id], 1), kind: 'final' } }).summaryId!;
    } finally { service.close(); }

    const database = new Database(path);
    try {
      const before = sessionSummaryFromId(database, summaryId);
      const rebuilt = rebuildSessionSummaryProjection(database);
      expect(rebuilt).toEqual({ summaries: 1, claims: 2, supports: 2 });
      expect(sessionSummaryFromId(database, summaryId)).toEqual(before);
      expect(database.pragma('foreign_key_check')).toEqual([]);
    } finally { database.close(); }
  });
});
