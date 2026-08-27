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
    expect(() => canonicalizeSessionSummary({ ...input, claims: [] })).toThrow(/claims/i);
    expect(() => canonicalizeSessionSummary({ ...input, claims: [{ ...input.claims[0]!, content: 'x'.repeat(2_001) }] })).toThrow(/2000 code points/i);
    expect(() => canonicalizeSessionSummary({ ...input, generator: { ...input.generator, configHash: 'NOT-A-HASH' } })).toThrow(/config hash/i);
    expect(() => canonicalizeSessionSummary({ ...input, claims: [{ ...input.claims[0]!, supportIds: ['same', 'same'] }] })).toThrow(/duplicate support/i);
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
      expect(() => service.lifecycle({ ...lifecycle, operation: 'checkpoint_pre_compact', eventKey: 'late', summary: summary([firstSupport.evidence.id], 2) })).toThrow(/advance/i);
      const foreign = service.save({ project: { key: 'repo:foreign', name: 'foreign' }, session: { rootSessionKey: 'foreign', harness: 'codex' }, eventKey: 'foreign', evidence: { kind: 'explicit_save', content: 'Foreign.' } });
      expect(() => service.lifecycle({ ...lifecycle, operation: 'checkpoint_pre_compact', eventKey: 'foreign-summary', summary: summary([foreign.evidence.id], 99) })).toThrow(/same project and session/i);
      expect(projectionCounts(path)).toEqual({ ...beforeInvalid, evidence: beforeInvalid.evidence + 1, session_events: beforeInvalid.session_events + 1 });
    } finally { service.close(); }

    const database = new Database(path);
    try {
      const rows = database.prepare('SELECT id,status,version FROM session_summaries ORDER BY version').all();
      expect(rows).toEqual([{ id: expect.any(String), status: 'superseded', version: 1 }, { id: expect.any(String), status: 'current', version: 2 }]);
      expect(database.prepare('SELECT count(*) AS count FROM memories').get()).toEqual({ count: 0 });
    } finally { database.close(); }
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
