import { randomUUID } from 'node:crypto';
import { constants, copyFileSync, existsSync, linkSync, mkdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import Database from 'better-sqlite3';

import { canonicalJson, hashCanonical, type FileFingerprint, type ImportPlan } from './contracts.js';
import { currentLogicalFingerprint, fileFingerprint } from './inspect.js';

export type PublicationFailurePoint = 'after-target-move' | 'after-candidate-move';

export interface ImportArtifacts {
  backupPath: string | null;
  candidatePath: string;
  recoveryBundlePath: string;
}

function assertAbsent(path: string): void {
  if (existsSync(path) || existsSync(`${path}-wal`) || existsSync(`${path}-shm`)) throw new Error(`Importer artifact path is already occupied: ${path}`);
}

export function allocateImportArtifacts(plan: ImportPlan): ImportArtifacts {
  const target = resolve(plan.target.path);
  const stem = join(dirname(target), `.${basename(target)}.thoth-import-${plan.planHash.slice(0, 12)}-${randomUUID()}`);
  const artifacts = {
    backupPath: plan.target.absent ? null : `${stem}.backup.sqlite`,
    candidatePath: `${stem}.candidate.sqlite`,
    recoveryBundlePath: `${stem}.recovery`,
  };
  if (artifacts.backupPath) assertAbsent(artifacts.backupPath);
  assertAbsent(artifacts.candidatePath);
  if (existsSync(artifacts.recoveryBundlePath)) throw new Error(`Importer recovery path is already occupied: ${artifacts.recoveryBundlePath}`);
  return artifacts;
}

function verifySqlite(path: string, expectedLogicalFingerprint: string): void {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    database.pragma('query_only = ON');
    const integrity = database.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('SQLite backup failed integrity verification');
    if ((database.pragma('foreign_key_check') as unknown[]).length !== 0) throw new Error('SQLite backup failed foreign-key verification');
    if (currentLogicalFingerprint(database) !== expectedLogicalFingerprint) throw new Error('SQLite backup does not match the target base');
  } finally { database.close(); }
}

export async function createVerifiedTargetBackup(plan: ImportPlan, artifacts: ImportArtifacts): Promise<string | null> {
  if (plan.target.absent) return null;
  const backupPath = artifacts.backupPath!;
  const target = new Database(plan.target.path, { readonly: true, fileMustExist: true });
  try {
    target.pragma('query_only = ON');
    await target.backup(backupPath);
  } catch (error) {
    if (existsSync(backupPath)) rmSync(backupPath);
    throw error;
  } finally { target.close(); }
  verifySqlite(backupPath, plan.target.logicalFingerprint);
  return currentFingerprint(backupPath);
}

export function cloneBackupToCandidate(artifacts: ImportArtifacts): void {
  if (!artifacts.backupPath) throw new Error('A target backup is required for candidate cloning');
  copyFileSync(artifacts.backupPath, artifacts.candidatePath, constants.COPYFILE_EXCL);
}

export function closeCandidateForPublication(candidatePath: string): FileFingerprint {
  const database = new Database(candidatePath, { fileMustExist: true });
  try {
    database.pragma('foreign_keys = ON');
    database.pragma('wal_checkpoint(TRUNCATE)');
    database.pragma('journal_mode = DELETE');
  } finally { database.close(); }
  if (existsSync(`${candidatePath}-wal`) || existsSync(`${candidatePath}-shm`)) throw new Error('Import candidate did not close to a single SQLite file');
  return fileFingerprint(candidatePath);
}

export function currentFingerprint(path: string): string {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try { database.pragma('query_only = ON'); return currentLogicalFingerprint(database); }
  finally { database.close(); }
}

function targetFileSet(targetPath: string): string[] {
  return [targetPath, `${targetPath}-wal`, `${targetPath}-shm`].filter((path) => existsSync(path));
}

export interface PublicationSnapshot {
  logicalFingerprint: string;
  fileFingerprint: FileFingerprint | null;
  files: string[];
}

interface CheckpointResult { busy: number; log: number; checkpointed: number }

function sameFiles(left: string[], right: string[]): boolean {
  return canonicalJson([...left].sort()) === canonicalJson([...right].sort());
}

function moveExclusive(source: string, destination: string): void {
  try {
    linkSync(source, destination);
    try { rmSync(source); }
    catch (error) {
      rmSync(destination);
      throw error;
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'EBUSY' || code === 'EACCES' || code === 'EPERM' || code === 'ETXTBSY') {
      throw new Error(`Target database is locked: ${error instanceof Error ? error.message : String(error)}`);
    }
    throw error;
  }
}

function preparePublicationSnapshot(plan: ImportPlan): PublicationSnapshot {
  if (plan.target.absent) {
    if (targetFileSet(plan.target.path).length !== 0) throw new Error('Target appeared after planning');
    return { logicalFingerprint: plan.target.logicalFingerprint, fileFingerprint: null, files: [] };
  }
  const database = new Database(plan.target.path, { fileMustExist: true, timeout: 0 });
  try {
    database.pragma('busy_timeout = 0');
    database.exec('BEGIN EXCLUSIVE');
    const logical = currentLogicalFingerprint(database);
    const files = fileFingerprint(plan.target.path);
    if (logical !== plan.target.logicalFingerprint || canonicalJson(files) !== canonicalJson(plan.target.fileFingerprint)) {
      throw new Error('Current target does not match the bound import plan at publication');
    }
    database.exec('ROLLBACK');
    const checkpoint = database.pragma('wal_checkpoint(TRUNCATE)') as CheckpointResult[];
    const status = checkpoint[0];
    if (!status || status.busy !== 0 || status.log !== status.checkpointed) {
      throw new Error(`Target database is busy: WAL checkpoint incomplete (busy=${status?.busy ?? 'unknown'}, log=${status?.log ?? 'unknown'}, checkpointed=${status?.checkpointed ?? 'unknown'})`);
    }
    database.exec('BEGIN EXCLUSIVE');
    if (currentLogicalFingerprint(database) !== plan.target.logicalFingerprint) {
      throw new Error('Current target changed while establishing the publication snapshot');
    }
    database.exec('ROLLBACK');
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK');
    if (error instanceof Error && (error.message.includes('bound import plan') || error.message.includes('publication snapshot') || error.message.includes('checkpoint incomplete'))) throw error;
    throw new Error(`Target database is locked: ${error instanceof Error ? error.message : String(error)}`);
  } finally { database.close(); }
  const files = targetFileSet(plan.target.path);
  const fingerprint = fileFingerprint(plan.target.path);
  return { logicalFingerprint: plan.target.logicalFingerprint, fileFingerprint: fingerprint, files };
}

function assertSnapshotAtTarget(plan: ImportPlan, snapshot: PublicationSnapshot): void {
  const files = targetFileSet(plan.target.path);
  if (!sameFiles(files, snapshot.files)) throw new Error('Current target file set changed before publication');
  if (!snapshot.fileFingerprint || canonicalJson(fileFingerprint(plan.target.path)) !== canonicalJson(snapshot.fileFingerprint)) {
    throw new Error('Current target changed before publication');
  }
}

function savedPath(artifacts: ImportArtifacts, targetFile: string): string {
  return join(artifacts.recoveryBundlePath, basename(targetFile));
}

function candidatePathFor(targetPath: string, candidatePath: string, targetFile: string): string {
  return `${candidatePath}${targetFile.slice(targetPath.length)}`;
}

function restoreSnapshot(plan: ImportPlan, artifacts: ImportArtifacts, snapshot: PublicationSnapshot, detachCandidate: boolean): boolean {
  if (detachCandidate) {
    for (const targetFile of targetFileSet(plan.target.path)) {
      moveExclusive(targetFile, candidatePathFor(plan.target.path, artifacts.candidatePath, targetFile));
    }
  }
  for (const targetFile of snapshot.files) {
    const saved = savedPath(artifacts, targetFile);
    if (!existsSync(saved)) continue;
    try { moveExclusive(saved, targetFile); }
    catch { throw new Error('Restoration refused to overwrite an occupied target path'); }
  }
  if (!sameFiles(targetFileSet(plan.target.path), snapshot.files)) return false;
  if (plan.target.absent) return true;
  try { verifySqlite(plan.target.path, snapshot.logicalFingerprint); return true; }
  catch { return false; }
}

function snapshotFromRecovery(plan: ImportPlan, artifacts: ImportArtifacts): PublicationSnapshot {
  if (plan.target.absent) return { logicalFingerprint: plan.target.logicalFingerprint, fileFingerprint: null, files: [] };
  const recoveredMain = savedPath(artifacts, plan.target.path);
  const files = targetFileSet(recoveredMain).map((path) => `${plan.target.path}${path.slice(recoveredMain.length)}`);
  return { logicalFingerprint: plan.target.logicalFingerprint, fileFingerprint: fileFingerprint(recoveredMain), files };
}

export interface PublicationResult { recoveryFingerprint: string; publishedFingerprint: string; priorTargetRestored: boolean; recoverySnapshot: PublicationSnapshot }

export function publishCandidate(
  plan: ImportPlan,
  artifacts: ImportArtifacts,
  injectFailure?: PublicationFailurePoint,
): PublicationResult {
  const snapshot = preparePublicationSnapshot(plan);
  mkdirSync(artifacts.recoveryBundlePath);
  const prior = snapshot.files;
  let candidatePublished = false;
  try {
    if (!plan.target.absent) assertSnapshotAtTarget(plan, snapshot);
    for (const path of prior) moveExclusive(path, savedPath(artifacts, path));
    if (!plan.target.absent) {
      const recoveredTarget = join(artifacts.recoveryBundlePath, basename(plan.target.path));
      verifySqlite(recoveredTarget, snapshot.logicalFingerprint);
      if (!snapshot.fileFingerprint || canonicalJson(fileFingerprint(recoveredTarget)) !== canonicalJson(snapshot.fileFingerprint)) {
        throw new Error('Current target changed while entering the publication recovery bundle');
      }
    }
    if (targetFileSet(plan.target.path).length !== 0) throw new Error('Target path set became occupied during publication');
    if (injectFailure === 'after-target-move') throw new Error('Injected publication failure after target move');
    moveExclusive(artifacts.candidatePath, plan.target.path);
    candidatePublished = true;
    if (injectFailure === 'after-candidate-move') throw new Error('Injected publication failure after candidate move');
    const publishedFingerprint = currentFingerprint(plan.target.path);
    const recoveryFingerprint = plan.target.absent
      ? hashCanonical([])
      : hashCanonical(fileFingerprint(join(artifacts.recoveryBundlePath, basename(plan.target.path))));
    return { recoveryFingerprint, publishedFingerprint, priorTargetRestored: false, recoverySnapshot: snapshot };
  } catch (error) {
    const restored = restoreSnapshot(plan, artifacts, snapshot, candidatePublished);
    if (!restored) throw new Error(`Publication failed and prior target restoration could not be verified: ${error instanceof Error ? error.message : String(error)}`);
    throw Object.assign(new Error(error instanceof Error ? error.message : String(error)), { priorTargetRestored: true });
  }
}

export function restorePublishedTarget(plan: ImportPlan, artifacts: ImportArtifacts, snapshot?: PublicationSnapshot): boolean {
  if (!existsSync(plan.target.path)) return false;
  if (existsSync(artifacts.candidatePath)) throw new Error('Restoration candidate path is unexpectedly occupied');
  return restoreSnapshot(plan, artifacts, snapshot ?? snapshotFromRecovery(plan, artifacts), true);
}

export function cleanupCandidate(artifacts: ImportArtifacts): boolean {
  for (const path of [artifacts.candidatePath, `${artifacts.candidatePath}-wal`, `${artifacts.candidatePath}-shm`, `${artifacts.candidatePath}.pre-v8.bak`, `${artifacts.candidatePath}.pre-v8.bak.tmp`]) {
    if (existsSync(path)) rmSync(path);
  }
  return !existsSync(artifacts.candidatePath) && !existsSync(`${artifacts.candidatePath}-wal`) && !existsSync(`${artifacts.candidatePath}-shm`);
}
