import type Database from 'better-sqlite3';

import {
  MEMORY_OUTCOME_VALUES,
  SESSION_SUMMARY_CLAIM_KIND_VALUES,
  SESSION_SUMMARY_GENERATOR_KIND_VALUES,
  SESSION_SUMMARY_KIND_VALUES,
  SESSION_SUMMARY_LIMITS,
  requireCanonicalValue,
  type SessionSummaryClaimRecord,
  type SessionSummaryInput,
  type SessionSummaryRecord,
} from './contracts.js';
import { sanitizePrivateContent } from './privacy.js';
import { stableUuid } from './sqlite/ledger.js';
import { SESSION_PROJECTION_TRIGGER_SQL } from './sqlite/schema.js';

const SUMMARY_EVIDENCE_SCHEMA = 'thoth-mem.session-summary.v1';
const SUMMARY_TRIGGER_NAMES = [
  'session_event_scope_guard', 'session_event_immutable_update', 'session_event_immutable_delete',
  'session_summary_scope_guard', 'session_summary_immutable_update', 'session_summary_immutable_delete',
  'session_summary_claim_immutable_update', 'session_summary_claim_immutable_delete',
  'session_summary_support_immutable_update', 'session_summary_support_immutable_delete',
] as const;

interface CanonicalSummary {
  input: SessionSummaryInput;
  canonicalJson: string;
}

interface InsertSummaryInput {
  projectId: string;
  sessionId: string;
  submissionEvidenceId: string;
  summary: SessionSummaryInput;
  createdAt: string;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${label} contains unknown field: ${unknown[0]}`);
}

function text(value: unknown, label: string, maxCodePoints: number): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const sanitized = sanitizePrivateContent(value).normalize('NFC').trim();
  if (!sanitized) throw new Error(`${label} is required after privacy filtering`);
  if ([...sanitized].length > maxCodePoints) throw new Error(`${label} exceeds ${maxCodePoints} code points`);
  return sanitized;
}

function optionalText(value: unknown, label: string, maxCodePoints: number): string | undefined {
  if (value === undefined) return undefined;
  return text(value, label, maxCodePoints);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`${label} must be a positive integer`);
  return Number(value);
}

export function canonicalizeSessionSummary(value: SessionSummaryInput): CanonicalSummary {
  const input = object(value, 'summary');
  exactKeys(input, ['kind', 'coverage', 'generator', 'claims'], 'summary');
  const kind = requireCanonicalValue('summary.kind', SESSION_SUMMARY_KIND_VALUES, input.kind);

  const coverageInput = object(input.coverage, 'summary.coverage');
  exactKeys(coverageInput, ['fromSequence', 'toSequence'], 'summary.coverage');
  const fromSequence = positiveInteger(coverageInput.fromSequence, 'summary.coverage.fromSequence');
  const toSequence = positiveInteger(coverageInput.toSequence, 'summary.coverage.toSequence');
  if (fromSequence !== 1) throw new Error('summary coverage must start at sequence 1');
  if (toSequence < fromSequence) throw new Error('summary coverage must not regress');

  const generatorInput = object(input.generator, 'summary.generator');
  exactKeys(generatorInput, ['kind', 'name', 'version', 'configHash'], 'summary.generator');
  const generatorKind = requireCanonicalValue('summary.generator.kind', SESSION_SUMMARY_GENERATOR_KIND_VALUES, generatorInput.kind);
  const generatorName = text(generatorInput.name, 'summary.generator.name', 200);
  const generatorVersion = optionalText(generatorInput.version, 'summary.generator.version', 200);
  const generatorConfigHash = generatorInput.configHash === undefined ? undefined : text(generatorInput.configHash, 'summary.generator.configHash', 64);
  if (generatorConfigHash !== undefined && !/^[0-9a-f]{64}$/u.test(generatorConfigHash)) throw new Error('summary generator config hash must be lowercase SHA-256');

  if (!Array.isArray(input.claims) || input.claims.length < SESSION_SUMMARY_LIMITS.minClaims || input.claims.length > SESSION_SUMMARY_LIMITS.maxClaims) {
    throw new Error(`summary claims must contain ${SESSION_SUMMARY_LIMITS.minClaims}-${SESSION_SUMMARY_LIMITS.maxClaims} items`);
  }
  const claims = input.claims.map((value, ordinal) => {
    const claim = object(value, `summary.claims[${ordinal}]`);
    exactKeys(claim, ['kind', 'content', 'outcome', 'supportIds'], `summary.claims[${ordinal}]`);
    const claimKind = requireCanonicalValue(`summary.claims[${ordinal}].kind`, SESSION_SUMMARY_CLAIM_KIND_VALUES, claim.kind);
    const content = text(claim.content, `summary.claims[${ordinal}].content`, SESSION_SUMMARY_LIMITS.maxClaimCodePoints);
    const outcome = claim.outcome === undefined ? undefined : requireCanonicalValue(`summary.claims[${ordinal}].outcome`, MEMORY_OUTCOME_VALUES, claim.outcome);
    if (!Array.isArray(claim.supportIds) || claim.supportIds.length < SESSION_SUMMARY_LIMITS.minSupportsPerClaim || claim.supportIds.length > SESSION_SUMMARY_LIMITS.maxSupportsPerClaim) {
      throw new Error(`summary.claims[${ordinal}].supportIds must contain ${SESSION_SUMMARY_LIMITS.minSupportsPerClaim}-${SESSION_SUMMARY_LIMITS.maxSupportsPerClaim} items`);
    }
    const supportIds = claim.supportIds.map((supportId, index) => text(supportId, `summary.claims[${ordinal}].supportIds[${index}]`, 200));
    if (new Set(supportIds).size !== supportIds.length) throw new Error(`summary.claims[${ordinal}] contains a duplicate support ID`);
    supportIds.sort();
    return { kind: claimKind, content, ...(outcome ? { outcome } : {}), supportIds };
  });

  const sanitized: SessionSummaryInput = {
    kind,
    coverage: { fromSequence, toSequence },
    generator: {
      kind: generatorKind,
      name: generatorName,
      ...(generatorVersion ? { version: generatorVersion } : {}),
      ...(generatorConfigHash ? { configHash: generatorConfigHash } : {}),
    },
    claims,
  };
  const canonicalJson = JSON.stringify({ schema: SUMMARY_EVIDENCE_SCHEMA, summary: sanitized });
  if (canonicalJson.length > SESSION_SUMMARY_LIMITS.maxCanonicalUtf16Units) throw new Error(`summary canonical submission exceeds ${SESSION_SUMMARY_LIMITS.maxCanonicalUtf16Units} UTF-16 units`);
  return { input: sanitized, canonicalJson };
}

function parseSummaryEvidence(content: string): SessionSummaryInput {
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('Session summary evidence is not valid JSON'); }
  const envelope = object(parsed, 'summary evidence');
  exactKeys(envelope, ['schema', 'summary'], 'summary evidence');
  if (envelope.schema !== SUMMARY_EVIDENCE_SCHEMA) throw new Error('Session summary evidence has an unsupported schema');
  return canonicalizeSessionSummary(envelope.summary as SessionSummaryInput).input;
}

export function sessionSummaryFromId(database: Database.Database, id: string): SessionSummaryRecord | null {
  const row = database.prepare('SELECT * FROM session_summaries WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const claims = (database.prepare('SELECT * FROM session_summary_claims WHERE summary_id=? ORDER BY ordinal').all(id) as Array<Record<string, unknown>>).map((claim): SessionSummaryClaimRecord => ({
    id: String(claim.id),
    ordinal: Number(claim.ordinal),
    kind: claim.kind as SessionSummaryClaimRecord['kind'],
    content: String(claim.content),
    outcome: claim.outcome === null ? null : claim.outcome as SessionSummaryClaimRecord['outcome'],
    supportIds: (database.prepare('SELECT evidence_id FROM session_summary_claim_supports WHERE claim_id=? ORDER BY evidence_id').all(claim.id) as Array<{ evidence_id: string }>).map((support) => support.evidence_id),
  }));
  return {
    recordType: 'summary',
    id: String(row.id),
    projectId: String(row.project_id),
    sessionId: String(row.session_id),
    submissionEvidenceId: String(row.submission_evidence_id),
    kind: row.kind as SessionSummaryRecord['kind'],
    version: Number(row.version),
    status: row.status as SessionSummaryRecord['status'],
    coverage: { fromSequence: Number(row.source_sequence_from), toSequence: Number(row.source_sequence_to) },
    generator: {
      kind: row.generator_kind as SessionSummaryRecord['generator']['kind'],
      name: String(row.generator_name),
      ...(row.generator_version === null ? {} : { version: String(row.generator_version) }),
      ...(row.generator_config_hash === null ? {} : { configHash: String(row.generator_config_hash) }),
    },
    supersedesId: row.supersedes_id === null ? null : String(row.supersedes_id),
    createdAt: String(row.created_at),
    claims,
  };
}

export function insertSessionSummaryProjection(database: Database.Database, input: InsertSummaryInput): SessionSummaryRecord {
  const canonical = canonicalizeSessionSummary(input.summary).input;
  const session = database.prepare('SELECT project_id FROM sessions WHERE id=?').get(input.sessionId) as { project_id: string } | undefined;
  if (!session || session.project_id !== input.projectId) throw new Error('Summary requires a verified session in the same project');

  const supportIds = [...new Set(canonical.claims.flatMap((claim) => claim.supportIds))];
  const placeholders = supportIds.map(() => '?').join(',');
  const supports = database.prepare(`SELECT e.id,e.project_id,e.session_id,se.sequence FROM evidence e JOIN session_events se ON se.evidence_id=e.id WHERE e.id IN (${placeholders})`).all(...supportIds) as Array<{ id: string; project_id: string; session_id: string; sequence: number }>;
  if (supports.length !== supportIds.length || supports.some((support) => support.project_id !== input.projectId || support.session_id !== input.sessionId)) {
    throw new Error('Every summary support must belong to the same project and session');
  }
  if (supports.some((support) => support.sequence < canonical.coverage.fromSequence || support.sequence > canonical.coverage.toSequence)) {
    throw new Error('Every summary support must be inside the covered event range');
  }

  const current = database.prepare("SELECT id,version,source_sequence_to FROM session_summaries WHERE session_id=? AND kind=? AND status='current'").get(input.sessionId, canonical.kind) as { id: string; version: number; source_sequence_to: number } | undefined;
  if (current && canonical.coverage.toSequence <= current.source_sequence_to) throw new Error('Summary coverage must strictly advance the current summary');
  const version = (current?.version ?? 0) + 1;
  const id = stableUuid(`session-summary:${input.submissionEvidenceId}`);
  if (current) database.prepare("UPDATE session_summaries SET status='superseded' WHERE id=?").run(current.id);
  database.prepare('INSERT INTO session_summaries(id,project_id,session_id,submission_evidence_id,kind,version,status,source_sequence_from,source_sequence_to,generator_kind,generator_name,generator_version,generator_config_hash,supersedes_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    id, input.projectId, input.sessionId, input.submissionEvidenceId, canonical.kind, version, 'current', canonical.coverage.fromSequence, canonical.coverage.toSequence,
    canonical.generator.kind, canonical.generator.name, canonical.generator.version ?? null, canonical.generator.configHash ?? null, current?.id ?? null, input.createdAt,
  );
  canonical.claims.forEach((claim, ordinal) => {
    const claimId = stableUuid(`session-summary-claim:${id}:${ordinal}`);
    database.prepare('INSERT INTO session_summary_claims(id,summary_id,ordinal,kind,content,outcome) VALUES(?,?,?,?,?,?)').run(claimId, id, ordinal, claim.kind, claim.content, claim.outcome ?? null);
    for (const supportId of claim.supportIds) database.prepare("INSERT INTO session_summary_claim_supports(claim_id,evidence_id,relation) VALUES(?,?,'supports')").run(claimId, supportId);
  });
  return sessionSummaryFromId(database, id)!;
}

export function rebuildSessionSummaryProjection(database: Database.Database): { summaries: number; claims: number; supports: number } {
  return database.transaction(() => {
    const receiptLinks = database.prepare('SELECT rowid,summary_id FROM lifecycle_receipts WHERE summary_id IS NOT NULL').all() as Array<{ rowid: number; summary_id: string }>;
    database.prepare('UPDATE lifecycle_receipts SET summary_id=NULL WHERE summary_id IS NOT NULL').run();
    for (const trigger of SUMMARY_TRIGGER_NAMES) database.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    database.exec('DELETE FROM session_summary_claim_supports; DELETE FROM session_summary_claims; DELETE FROM session_summaries;');
    const submissions = database.prepare("SELECT e.id,e.project_id,e.session_id,e.content,e.captured_at FROM evidence e JOIN session_events se ON se.evidence_id=e.id WHERE e.kind='session_summary' ORDER BY se.session_id,se.sequence,e.id").all() as Array<{ id: string; project_id: string; session_id: string; content: string; captured_at: string }>;
    for (const submission of submissions) {
      insertSessionSummaryProjection(database, {
        projectId: submission.project_id,
        sessionId: submission.session_id,
        submissionEvidenceId: submission.id,
        summary: parseSummaryEvidence(submission.content),
        createdAt: submission.captured_at,
      });
    }
    database.exec(SESSION_PROJECTION_TRIGGER_SQL);
    for (const link of receiptLinks) database.prepare('UPDATE lifecycle_receipts SET summary_id=? WHERE rowid=?').run(link.summary_id, link.rowid);
    return {
      summaries: Number((database.prepare('SELECT count(*) AS count FROM session_summaries').get() as { count: number }).count),
      claims: Number((database.prepare('SELECT count(*) AS count FROM session_summary_claims').get() as { count: number }).count),
      supports: Number((database.prepare('SELECT count(*) AS count FROM session_summary_claim_supports').get() as { count: number }).count),
    };
  })();
}
