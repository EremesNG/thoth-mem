export { planLegacyImport } from './inspect.js';
export type { PlanLegacyImportOptions } from './inspect.js';
export { writeLegacyImportCandidate } from './writer.js';
export type { LegacyCandidateWriteResult, WriteLegacyImportCandidateOptions } from './writer.js';
export { parseImportPlan, parseMappingManifest } from './contracts.js';
export type { ImportPlan, MappingManifest } from './contracts.js';

import { existsSync } from 'node:fs';

import Database from 'better-sqlite3';

import { migrateCurrentSchema } from '../sqlite/migrations.js';
import {
  allocateImportArtifacts,
  cleanupCandidate,
  cloneBackupToCandidate,
  closeCandidateForPublication,
  createVerifiedTargetBackup,
  currentFingerprint,
  publishCandidate,
  restorePublishedTarget,
  type ImportArtifacts,
  type PublicationFailurePoint,
} from './backup.js';
import {
  canonicalJson,
  parseImportPlan as parsePlan,
  type ImportFailureCode,
  type ImportPlan,
  type ImportReport,
} from './contracts.js';
import { currentBaselineManifest, currentLogicalFingerprint, fileFingerprint, inspectLegacyForApply } from './inspect.js';
import { databaseCounts, verifyCommittedReplay, verifyImportedDatabase, type ImportRowDelta } from './verify.js';
import { writeLegacyImportCandidate as writeCandidate } from './writer.js';

const ZERO_DELTA: ImportRowDelta = { projects: 0, sessions: 0, evidence: 0, memories: 0, memoryEvidence: 0, fts: 0, receipts: 0 };
const ZERO_INTEGRITY: ImportReport['integrity'] = { schemaRevision: false, baselinePreserved: false, receiptClosure: false, temporalLineage: false, provenance: false, foreignKeys: false, sqlite: false, fts: false, sourceUnchanged: false, targetBaseUnchanged: false };

export interface ApplyLegacyImportOptions {
  plan: unknown;
  startedAt?: string;
  injectFailure?: PublicationFailurePoint | 'before-reopen-verification';
}

export class LegacyImportFailure extends Error {
  readonly code: ImportFailureCode;
  readonly report: ImportReport;
  constructor(code: ImportFailureCode, message: string, report: ImportReport) {
    super(message);
    this.name = 'LegacyImportFailure';
    this.code = code;
    this.report = report;
  }
}

function boundedMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n\t]+/gu, ' ').slice(0, 400);
}

function emptyReport(plan: ImportPlan, startedAt: string): ImportReport {
  return {
    schema: 'thoth-mem.import.report.v3', version: 3, importId: null, planHash: plan.planHash,
    committed: false, duplicate: false, startedAt, finishedAt: startedAt,
    fingerprints: { source: plan.source.logicalFingerprint, targetBase: plan.target.logicalFingerprint, backup: null, candidate: null, published: null },
    artifacts: { backupPath: null, recoveryBundlePath: null, recoveryBundleFingerprint: null, candidateCleaned: true },
    dispositions: plan.plannedDispositions, reasonCounts: plan.reasonCounts,
    receipts: { imports: 0, projects: 0, rows: 0, importId: null }, rowDelta: ZERO_DELTA,
    integrity: { ...ZERO_INTEGRITY }, failure: null,
  };
}

function invalidPlanReport(planHash: string, startedAt: string, message: string): ImportReport {
  const counts = { imported: 0, linked: 0, skipped: 0, quarantined: 0 };
  return {
    schema: 'thoth-mem.import.report.v3', version: 3, importId: null, planHash,
    committed: false, duplicate: false, startedAt, finishedAt: startedAt,
    fingerprints: { source: '0'.repeat(64), targetBase: '0'.repeat(64), backup: null, candidate: null, published: null },
    artifacts: { backupPath: null, recoveryBundlePath: null, recoveryBundleFingerprint: null, candidateCleaned: true },
    dispositions: { session: { ...counts }, prompt: { ...counts }, session_summary: { ...counts }, observation_version: { ...counts }, observation: { ...counts } },
    reasonCounts: {}, receipts: { imports: 0, projects: 0, rows: 0, importId: null }, rowDelta: ZERO_DELTA,
    integrity: { ...ZERO_INTEGRITY }, failure: { code: 'PLAN_INVALID', message, priorTargetRestored: false },
  };
}

function targetState(plan: ImportPlan): { logical: string; file: ReturnType<typeof fileFingerprint> } | null {
  if (!existsSync(plan.target.path)) return null;
  const database = new Database(plan.target.path, { readonly: true, fileMustExist: true, timeout: 0 });
  try { database.pragma('query_only = ON'); return { logical: currentLogicalFingerprint(database), file: fileFingerprint(plan.target.path) }; }
  finally { database.close(); }
}

function committedImport(plan: ImportPlan): { id: string; plan_hash: string; source_fingerprint: string } | null {
  if (!existsSync(plan.target.path)) return null;
  const database = new Database(plan.target.path, { readonly: true, fileMustExist: true, timeout: 0 });
  try {
    const table = database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='legacy_imports'").get() as { count: number };
    if (!table.count) return null;
    return database.prepare('SELECT id,plan_hash,source_fingerprint FROM legacy_imports WHERE source_fingerprint=?').get(plan.source.logicalFingerprint) as { id: string; plan_hash: string; source_fingerprint: string } | undefined ?? null;
  } finally { database.close(); }
}

function assertSourceBound(plan: ImportPlan): void {
  const source = inspectLegacyForApply(plan.source.path);
  if (source.logicalFingerprint !== plan.source.logicalFingerprint || canonicalJson(source.fileFingerprint) !== canonicalJson(plan.source.fileFingerprint)) throw new Error('Legacy source does not match the bound import plan');
}

function assertTargetBound(plan: ImportPlan): void {
  const target = targetState(plan);
  if (plan.target.absent) {
    if (target) throw new Error('Current target appeared after planning');
    return;
  }
  if (!target || target.logical !== plan.target.logicalFingerprint || canonicalJson(target.file) !== canonicalJson(plan.target.fileFingerprint)) throw new Error('Current target does not match the bound import plan');
}

function failureCode(phase: string, error: unknown): ImportFailureCode {
  const message = boundedMessage(error).toLocaleLowerCase();
  if (message.includes('locked') || message.includes('busy')) return 'TARGET_LOCKED';
  if (phase === 'source') return 'SOURCE_CHANGED';
  if (phase === 'target') return 'TARGET_CHANGED';
  if (phase === 'backup' || phase === 'allocate') return 'BACKUP_FAILED';
  if (phase === 'verify') return 'INTEGRITY_FAILED';
  if (phase === 'publication' || message.includes('publication')) return message.includes('locked') ? 'TARGET_LOCKED' : 'PUBLICATION_FAILED';
  if (phase === 'replay') return 'PLAN_STALE';
  return 'IMPORT_FAILED';
}

export async function applyLegacyImport(options: ApplyLegacyImportOptions): Promise<ImportReport> {
  let plan: ImportPlan;
  try { plan = parsePlan(options.plan); }
  catch (error) {
    const startedAt = options.startedAt ?? new Date().toISOString();
    const suppliedHash = typeof (options.plan as { planHash?: unknown })?.planHash === 'string' ? (options.plan as { planHash: string }).planHash : '0'.repeat(64);
    const message = boundedMessage(error);
    const placeholder = invalidPlanReport(suppliedHash, startedAt, message);
    throw new LegacyImportFailure('PLAN_INVALID', message, placeholder);
  }
  const startedAt = options.startedAt ?? new Date().toISOString();
  const report = emptyReport(plan, startedAt);
  let artifacts: ImportArtifacts | null = null;
  let published = false;
  let phase = 'source';
  try {
    assertSourceBound(plan);
    phase = 'target';
    const existing = committedImport(plan);
    if (existing) {
      phase = 'replay';
      if (existing.plan_hash !== plan.planHash) throw new Error('Committed source is bound to a different plan, mapping, or policy');
      const replay = verifyCommittedReplay(plan.target.path, plan, existing.id);
      const publishedFingerprint = currentFingerprint(plan.target.path);
      return {
        ...report, importId: existing.id, committed: true, duplicate: true, finishedAt: new Date().toISOString(),
        fingerprints: { ...report.fingerprints, candidate: publishedFingerprint, published: publishedFingerprint },
        dispositions: replay.dispositions, reasonCounts: replay.reasonCounts,
        receipts: { imports: 1, projects: plan.projectMappings.length, rows: plan.integrityExpectations.receiptCount, importId: existing.id },
        rowDelta: ZERO_DELTA, integrity: replay.integrity,
      };
    }
    phase = 'target';
    assertTargetBound(plan);
    let baseline: Record<string, unknown[]>;
    let baseCounts: ImportRowDelta;
    if (plan.target.absent) {
      baseline = {};
      baseCounts = ZERO_DELTA;
    } else {
      const target = new Database(plan.target.path, { readonly: true, fileMustExist: true });
      try { baseline = currentBaselineManifest(target); baseCounts = databaseCounts(target); }
      finally { target.close(); }
    }
    phase = 'allocate';
    artifacts = allocateImportArtifacts(plan);
    report.artifacts.backupPath = artifacts.backupPath;
    phase = 'backup';
    report.fingerprints.backup = await createVerifiedTargetBackup(plan, artifacts);
    if (plan.target.absent) {
      const candidate = new Database(artifacts.candidatePath);
      try { migrateCurrentSchema(candidate); }
      finally { candidate.close(); }
      const candidateBase = new Database(artifacts.candidatePath, { readonly: true });
      try { baseline = currentBaselineManifest(candidateBase); baseCounts = databaseCounts(candidateBase); }
      finally { candidateBase.close(); }
    } else {
      cloneBackupToCandidate(artifacts);
      const candidate = new Database(artifacts.candidatePath, { fileMustExist: true });
      try { migrateCurrentSchema(candidate); }
      finally { candidate.close(); }
    }
    phase = 'write';
    const written = writeCandidate({ candidatePath: artifacts.candidatePath, plan, importedAt: startedAt });
    closeCandidateForPublication(artifacts.candidatePath);
    report.fingerprints.candidate = currentFingerprint(artifacts.candidatePath);
    phase = 'target';
    assertSourceBound(plan);
    assertTargetBound(plan);
    phase = 'verify';
    const verified = verifyImportedDatabase({ path: artifacts.candidatePath, plan, importId: written.importId, baseline, baseCounts });
    report.importId = written.importId;
    report.dispositions = verified.dispositions;
    report.reasonCounts = verified.reasonCounts;
    report.receipts = { imports: 1, projects: plan.projectMappings.length, rows: written.receipts, importId: written.importId };
    report.rowDelta = verified.rowDelta;
    report.integrity = verified.integrity;
    phase = 'publication';
    const publication = publishCandidate(plan, artifacts, options.injectFailure === 'after-target-move' || options.injectFailure === 'after-candidate-move' ? options.injectFailure : undefined);
    published = true;
    report.artifacts.recoveryBundlePath = artifacts.recoveryBundlePath;
    report.artifacts.recoveryBundleFingerprint = publication.recoveryFingerprint;
    report.fingerprints.published = publication.publishedFingerprint;
    phase = 'verify';
    if (options.injectFailure === 'before-reopen-verification') throw new Error('Injected failure before published database reopen verification');
    const reopened = verifyImportedDatabase({ path: plan.target.path, plan, importId: written.importId, baseline, baseCounts });
    report.integrity = reopened.integrity;
    report.committed = true;
    report.artifacts.candidateCleaned = cleanupCandidate(artifacts);
    report.finishedAt = new Date().toISOString();
    return report;
  } catch (error) {
    let priorTargetRestored = Boolean((error as { priorTargetRestored?: boolean })?.priorTargetRestored);
    if (published && artifacts) {
      try { priorTargetRestored = restorePublishedTarget(plan, artifacts); }
      catch (restoreError) { error = restoreError; priorTargetRestored = false; }
    }
    const code = failureCode(phase, error);
    if (artifacts) {
      report.artifacts.backupPath = artifacts.backupPath && existsSync(artifacts.backupPath) ? artifacts.backupPath : null;
      report.artifacts.recoveryBundlePath = existsSync(artifacts.recoveryBundlePath) ? artifacts.recoveryBundlePath : null;
      report.artifacts.candidateCleaned = cleanupCandidate(artifacts);
    }
    report.finishedAt = new Date().toISOString();
    report.failure = { code, message: boundedMessage(error), priorTargetRestored };
    throw new LegacyImportFailure(code, report.failure.message, report);
  }
}
