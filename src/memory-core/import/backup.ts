import { randomUUID } from 'node:crypto';
import { constants, copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
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

function assertStoppedTarget(plan: ImportPlan): void {
  if (plan.target.absent) {
    if (targetFileSet(plan.target.path).length !== 0) throw new Error('Target appeared after planning');
    return;
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
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK');
    if (error instanceof Error && error.message.includes('bound import plan')) throw error;
    throw new Error(`Target database is locked: ${error instanceof Error ? error.message : String(error)}`);
  } finally { database.close(); }
}

export interface PublicationResult { recoveryFingerprint: string; publishedFingerprint: string; priorTargetRestored: boolean }

export function publishCandidate(
  plan: ImportPlan,
  artifacts: ImportArtifacts,
  injectFailure?: PublicationFailurePoint,
): PublicationResult {
  assertStoppedTarget(plan);
  mkdirSync(artifacts.recoveryBundlePath);
  const prior = targetFileSet(plan.target.path);
  let candidatePublished = false;
  try {
    for (const path of prior) renameSync(path, join(artifacts.recoveryBundlePath, basename(path)));
    if (!plan.target.absent) {
      const recoveredTarget = join(artifacts.recoveryBundlePath, basename(plan.target.path));
      verifySqlite(recoveredTarget, plan.target.logicalFingerprint);
      if (canonicalJson(fileFingerprint(recoveredTarget)) !== canonicalJson(plan.target.fileFingerprint)) {
        throw new Error('Current target changed while entering the publication recovery bundle');
      }
    }
    if (injectFailure === 'after-target-move') throw new Error('Injected publication failure after target move');
    if (existsSync(plan.target.path)) throw new Error('Target path became occupied during publication');
    renameSync(artifacts.candidatePath, plan.target.path);
    candidatePublished = true;
    if (injectFailure === 'after-candidate-move') throw new Error('Injected publication failure after candidate move');
    const publishedFingerprint = currentFingerprint(plan.target.path);
    const recoveryFingerprint = plan.target.absent
      ? hashCanonical([])
      : hashCanonical(fileFingerprint(join(artifacts.recoveryBundlePath, basename(plan.target.path))));
    return { recoveryFingerprint, publishedFingerprint, priorTargetRestored: false };
  } catch (error) {
    if (candidatePublished && existsSync(plan.target.path)) renameSync(plan.target.path, artifacts.candidatePath);
    for (const path of prior) {
      const saved = join(artifacts.recoveryBundlePath, basename(path));
      if (existsSync(saved)) {
        if (existsSync(path)) throw new Error('Publication restoration refused to overwrite an occupied target path');
        renameSync(saved, path);
      }
    }
    const restored = plan.target.absent ? !existsSync(plan.target.path) : canonicalJson(fileFingerprint(plan.target.path)) === canonicalJson(plan.target.fileFingerprint);
    if (!restored) throw new Error(`Publication failed and prior target restoration could not be verified: ${error instanceof Error ? error.message : String(error)}`);
    throw Object.assign(new Error(error instanceof Error ? error.message : String(error)), { priorTargetRestored: true });
  }
}

export function restorePublishedTarget(plan: ImportPlan, artifacts: ImportArtifacts): boolean {
  if (!existsSync(plan.target.path)) return false;
  if (existsSync(artifacts.candidatePath)) throw new Error('Restoration candidate path is unexpectedly occupied');
  renameSync(plan.target.path, artifacts.candidatePath);
  for (const suffix of ['', '-wal', '-shm']) {
    const targetFile = `${plan.target.path}${suffix}`;
    const saved = join(artifacts.recoveryBundlePath, basename(targetFile));
    if (existsSync(saved)) {
      if (existsSync(targetFile)) throw new Error('Restoration refused to overwrite an occupied target path');
      renameSync(saved, targetFile);
    }
  }
  return plan.target.absent
    ? !existsSync(plan.target.path)
    : existsSync(plan.target.path) && canonicalJson(fileFingerprint(plan.target.path)) === canonicalJson(plan.target.fileFingerprint);
}

export function cleanupCandidate(artifacts: ImportArtifacts): boolean {
  for (const path of [artifacts.candidatePath, `${artifacts.candidatePath}-wal`, `${artifacts.candidatePath}-shm`, `${artifacts.candidatePath}.pre-v8.bak`, `${artifacts.candidatePath}.pre-v8.bak.tmp`]) {
    if (existsSync(path)) rmSync(path);
  }
  return !existsSync(artifacts.candidatePath) && !existsSync(`${artifacts.candidatePath}-wal`) && !existsSync(`${artifacts.candidatePath}-shm`);
}
