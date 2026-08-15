import './sqlite-uri-runtime.js';

import { createHash } from 'node:crypto';
import {
  accessSync,
  closeSync,
  constants,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  statfsSync,
  statSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import Database from 'better-sqlite3';

import type {
  DatabaseCheckpointResult,
  DatabaseCompactionMetrics,
  DatabaseCompactionPreview,
  DatabaseCompactionResult,
  DatabaseSidecarState,
} from './types.js';

type CapacityPhase = 'preview' | 'no-op-validation' | 'before-checkpoint' | 'after-checkpoint' | 'after-vacuum';

export interface DatabaseCompactionRuntime {
  filesystemFreeBytes?: (databasePath: string, phase: CapacityPhase) => number;
  beforeCheckpoint?: () => void;
  afterCheckpoint?: () => void;
  beforeNoOpValidation?: () => void;
  beforeVacuum?: () => void;
  vacuum?: () => void;
  afterVacuum?: () => void;
  afterReopen?: () => void;
}

interface FileSnapshot {
  entries: string[];
  files: Record<string, { bytes: number; identity: string; sha256: string; volatileShm?: Buffer }>;
}

function snapshotsMatch(before: FileSnapshot, after: FileSnapshot, databasePath: string): boolean {
  if (JSON.stringify(before.entries) !== JSON.stringify(after.entries)) return false;
  const shmPath = `${databasePath}-shm`;
  return Object.entries(before.files).every(([path, file]) => {
    const next = after.files[path];
    if (!next || next.bytes !== file.bytes || next.identity !== file.identity) return false;
    if (path !== shmPath) return next.sha256 === file.sha256;
    const previousShm = file.volatileShm;
    const nextShm = next.volatileShm;
    if (!previousShm || !nextShm || previousShm.byteLength !== nextShm.byteLength) return false;
    // SQLite may update one of the five WAL read marks in the first wal-index header.
    for (let index = 0; index < previousShm.byteLength; index += 1) {
      if (previousShm[index] !== nextShm[index] && (index < 100 || index >= 120)) return false;
    }
    return true;
  });
}

interface ValidationSnapshot {
  integrityOk: boolean;
  foreignKeyViolations: number;
  schemaIdentity: string;
  tableCounts: Record<string, number>;
}

function fileSha256(path: string): string {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const handle = openSync(path, 'r');
  try {
    let bytesRead: number;
    do {
      bytesRead = readSync(handle, buffer, 0, buffer.byteLength, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
    return hash.digest('hex');
  } finally {
    closeSync(handle);
  }
}

function readDatabaseHeader(path: string): Buffer {
  const header = Buffer.alloc(20);
  const handle = openSync(path, 'r');
  try {
    readSync(handle, header, 0, header.byteLength, 0);
    return header;
  } finally {
    closeSync(handle);
  }
}

function boundedError(phase: string, error: unknown): Error {
  const detail = (error instanceof Error ? error.message : String(error))
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300);
  return new Error(`Database compaction ${phase} failed: ${detail}`);
}

function requireExistingDatabase(databasePath: string): string {
  const absolutePath = resolve(databasePath);
  let stats;
  try {
    stats = lstatSync(absolutePath);
  } catch {
    throw new Error(`Database compaction target is missing: ${absolutePath}`);
  }
  if (!stats.isFile()) {
    throw new Error(`Database compaction target is not a regular file: ${absolutePath}`);
  }
  try {
    accessSync(absolutePath, constants.R_OK);
  } catch {
    throw new Error(`Database compaction target is not readable: ${absolutePath}`);
  }
  return realpathSync.native(absolutePath);
}

function readableRegularFile(path: string, label: string): number | null {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    throw boundedError(`${label} inspection`, error);
  }
  if (!stats.isFile()) throw new Error(`Database compaction ${label} sidecar is not a regular file`);
  try {
    accessSync(path, constants.R_OK);
  } catch {
    throw new Error(`Database compaction ${label} sidecar is not readable`);
  }
  return stats.size;
}

function classifySidecars(databasePath: string): DatabaseSidecarState {
  const walBytes = readableRegularFile(`${databasePath}-wal`, 'WAL');
  const shmBytes = readableRegularFile(`${databasePath}-shm`, 'SHM');
  if (walBytes === null && shmBytes === null) return 'none';
  if (walBytes !== null && shmBytes !== null) return 'wal-and-shm';
  throw new Error('Database compaction requires either no sidecars or a complete readable WAL/SHM pair');
}

function snapshotFiles(databasePath: string, state: DatabaseSidecarState): FileSnapshot {
  const paths = state === 'none'
    ? [databasePath]
    : [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];
  return {
    entries: readdirSync(dirname(databasePath)).sort(),
    files: Object.fromEntries(paths.map((path) => {
      const stats = statSync(path, { bigint: true });
      return [path, {
        bytes: Number(stats.size),
        identity: `${stats.dev}:${stats.ino}`,
        sha256: fileSha256(path),
        ...(path.endsWith('-shm') ? { volatileShm: readFileSync(path) } : {}),
      }];
    })),
  };
}

function filesystemFreeBytes(databasePath: string): number {
  const stats = statfsSync(dirname(databasePath), { bigint: true });
  const bytes = stats.bavail * stats.bsize;
  return bytes > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(bytes);
}

function numericPragma(db: Database.Database, pragma: string): number {
  return Number(db.pragma(pragma, { simple: true }));
}

function stringPragma(db: Database.Database, pragma: string): string {
  return String(db.pragma(pragma, { simple: true })).toLowerCase();
}

function collectMetrics(
  db: Database.Database,
  databasePath: string,
  state: DatabaseSidecarState,
  phase: CapacityPhase,
  runtime: DatabaseCompactionRuntime,
): DatabaseCompactionMetrics {
  const databaseBytes = statSync(databasePath).size;
  const walBytes = state === 'wal-and-shm' ? statSync(`${databasePath}-wal`).size : 0;
  const shmBytes = state === 'wal-and-shm' ? statSync(`${databasePath}-shm`).size : 0;
  const pageSize = numericPragma(db, 'page_size');
  const pageCount = numericPragma(db, 'page_count');
  const freelistCount = numericPragma(db, 'freelist_count');
  const logicalDatabaseBytes = pageSize * pageCount;
  const reclaimableBytes = pageSize * freelistCount;
  const availableBytes = runtime.filesystemFreeBytes?.(databasePath, phase)
    ?? filesystemFreeBytes(databasePath);
  const header = state === 'none' ? readDatabaseHeader(databasePath) : null;
  const persistedJournalMode = header && header.byteLength >= 20 && header[18] === 2 && header[19] === 2
    ? 'wal'
    : stringPragma(db, 'journal_mode');
  return {
    database_path: databasePath,
    database_bytes: databaseBytes,
    logical_database_bytes: logicalDatabaseBytes,
    wal_bytes: walBytes,
    shm_bytes: shmBytes,
    page_size: pageSize,
    page_count: pageCount,
    freelist_count: freelistCount,
    reclaimable_bytes: reclaimableBytes,
    estimated_compacted_bytes: Math.max(pageSize, logicalDatabaseBytes - reclaimableBytes),
    filesystem_free_bytes: availableBytes,
    required_free_bytes: 2 * Math.max(databaseBytes, logicalDatabaseBytes),
    journal_mode: persistedJournalMode,
    wal_present: state === 'wal-and-shm',
    shm_present: state === 'wal-and-shm',
    sidecar_state: state,
  };
}

function openPreviewDatabase(databasePath: string, state: DatabaseSidecarState): Database.Database {
  if (state === 'wal-and-shm') {
    return new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 0 });
  }

  const immutableUri = `${pathToFileURL(databasePath).href}?immutable=1`;
  let db: Database.Database;
  try {
    db = new Database(immutableUri, { readonly: true, fileMustExist: true, timeout: 0 });
  } catch (error) {
    throw boundedError('URI runtime unavailable', error);
  }
  try {
    const rows = db.pragma('database_list') as Array<{ name: string; file: string }>;
    const main = rows.find((row) => row.name === 'main');
    if (!main?.file || realpathSync.native(main.file) !== databasePath) {
      throw new Error('immutable URI resolved to a different database target');
    }
    return db;
  } catch (error) {
    db.close();
    throw boundedError('URI runtime unavailable', error);
  }
}

export function previewDatabaseCompaction(
  targetPath: string,
  runtime: DatabaseCompactionRuntime = {},
): DatabaseCompactionPreview {
  const databasePath = requireExistingDatabase(targetPath);
  const state = classifySidecars(databasePath);
  const before = snapshotFiles(databasePath, state);
  const db = openPreviewDatabase(databasePath, state);
  let metrics: DatabaseCompactionMetrics;
  try {
    metrics = collectMetrics(db, databasePath, state, 'preview', runtime);
  } catch (error) {
    throw boundedError('preview', error);
  } finally {
    db.close();
  }
  const after = snapshotFiles(databasePath, state);
  if (!snapshotsMatch(before, after, databasePath)) {
    throw new Error('Database compaction preview zero-write audit failed');
  }
  const noOp = metrics.freelist_count === 0;
  return {
    dry_run: true,
    can_compact: !noOp && metrics.filesystem_free_bytes >= metrics.required_free_bytes,
    no_op_reason: noOp ? 'no-reclaimable-pages' : null,
    metrics,
  };
}

function requireCapacity(metrics: DatabaseCompactionMetrics, phase: string): void {
  if (metrics.filesystem_free_bytes < metrics.required_free_bytes) {
    throw new Error(
      `Database compaction ${phase} capacity is insufficient: requires ${metrics.required_free_bytes} bytes, has ${metrics.filesystem_free_bytes}`,
    );
  }
}

function schemaIdentity(db: Database.Database): string {
  const rows = db.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_schema
    ORDER BY type, name, tbl_name, COALESCE(sql, '')
  `).all();
  return createHash('sha256').update(JSON.stringify({
    application_id: numericPragma(db, 'application_id'),
    user_version: numericPragma(db, 'user_version'),
    rows,
  })).digest('hex');
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function durableTableCounts(db: Database.Database): Record<string, number> {
  const definitions = db.prepare(`
    SELECT name, sql
    FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string; sql: string | null }>;
  const virtualRoots = definitions
    .filter((row) => /^CREATE\s+VIRTUAL\s+TABLE/i.test(row.sql ?? ''))
    .map((row) => row.name);
  const applicationTables = definitions.filter((row) => !virtualRoots.some(
    (root) => row.name === root || row.name.startsWith(`${root}_`),
  ));
  return Object.fromEntries(applicationTables.map(({ name }) => {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`).get() as { count: number | bigint };
    return [name, Number(row.count)];
  }));
}

function validationSnapshot(db: Database.Database, phase: string): ValidationSnapshot {
  const integrityRows = db.pragma('integrity_check') as Array<Record<string, unknown>>;
  const integrityOk = integrityRows.length === 1
    && String(Object.values(integrityRows[0] ?? {})[0]).toLowerCase() === 'ok';
  if (!integrityOk) throw new Error(`Database compaction ${phase} integrity check failed`);
  const foreignKeyViolations = (db.pragma('foreign_key_check') as unknown[]).length;
  if (foreignKeyViolations > 0) {
    throw new Error(`Database compaction ${phase} foreign-key check found ${foreignKeyViolations} violations`);
  }
  return {
    integrityOk,
    foreignKeyViolations,
    schemaIdentity: schemaIdentity(db),
    tableCounts: durableTableCounts(db),
  };
}

function validateNoOpDatabase(
  databasePath: string,
  state: DatabaseSidecarState,
  runtime: DatabaseCompactionRuntime,
): { validation: ValidationSnapshot; metrics: DatabaseCompactionMetrics } {
  const before = snapshotFiles(databasePath, state);
  const db = openPreviewDatabase(databasePath, state);
  try {
    const validation = validationSnapshot(db, 'no-op');
    const metrics = collectMetrics(db, databasePath, state, 'no-op-validation', runtime);
    if (metrics.freelist_count !== 0) {
      throw new Error(`Database compaction no-op validation freelist contains ${metrics.freelist_count} pages`);
    }
    return { validation, metrics };
  } finally {
    db.close();
    const after = snapshotFiles(databasePath, state);
    if (!snapshotsMatch(before, after, databasePath)) {
      throw new Error('Database compaction no-op validation zero-write audit failed');
    }
  }
}

function checkpoint(db: Database.Database): DatabaseCheckpointResult {
  const result = (db.pragma('wal_checkpoint(TRUNCATE)') as DatabaseCheckpointResult[])[0];
  if (!result || result.busy !== 0) {
    throw new Error(`Database compaction checkpoint is busy (${result?.busy ?? 'unknown'})`);
  }
  return result;
}

function currentWritableState(databasePath: string): DatabaseSidecarState {
  return classifySidecars(databasePath);
}

export function applyDatabaseCompaction(
  targetPath: string,
  runtime: DatabaseCompactionRuntime = {},
): DatabaseCompactionResult {
  const startedAt = Date.now();
  const preview = previewDatabaseCompaction(targetPath, runtime);
  const databasePath = preview.metrics.database_path;
  if (preview.metrics.freelist_count === 0) {
    runtime.beforeNoOpValidation?.();
    const currentState = currentWritableState(databasePath);
    const { validation, metrics } = validateNoOpDatabase(databasePath, currentState, runtime);
    return {
      dry_run: false,
      skipped: true,
      skip_reason: 'no-reclaimable-pages',
      before: metrics,
      after: metrics,
      reclaimed_bytes: 0,
      duration_ms: Date.now() - startedAt,
      checkpoint: { busy: 0, log: 0, checkpointed: 0 },
      checks: {
        pre_integrity_ok: validation.integrityOk,
        post_integrity_ok: validation.integrityOk,
        pre_foreign_key_violations: validation.foreignKeyViolations,
        post_foreign_key_violations: validation.foreignKeyViolations,
        schema_identity_preserved: true,
        durable_counts_preserved: true,
        final_journal_mode: metrics.journal_mode,
      },
    };
  }

  let db: Database.Database | null = null;
  let before: DatabaseCompactionMetrics;
  let checkpointResult: DatabaseCheckpointResult;
  let preValidation: ValidationSnapshot;
  try {
    db = new Database(databasePath, { fileMustExist: true, timeout: 1_000 });
    db.pragma('foreign_keys = ON');
    const initialState = currentWritableState(databasePath);
    const initialMetrics = collectMetrics(db, databasePath, initialState, 'before-checkpoint', runtime);
    requireCapacity(initialMetrics, 'before-checkpoint');
    runtime.beforeCheckpoint?.();
    checkpointResult = checkpoint(db);
    runtime.afterCheckpoint?.();
    const checkpointState = currentWritableState(databasePath);
    before = collectMetrics(db, databasePath, checkpointState, 'after-checkpoint', runtime);
    requireCapacity(before, 'after-checkpoint');
    preValidation = validationSnapshot(db, 'pre-VACUUM');
    runtime.beforeVacuum?.();
    runtime.vacuum?.();
    db.exec('VACUUM');
    runtime.afterVacuum?.();
  } catch (error) {
    throw boundedError('apply', error);
  } finally {
    db?.close();
  }

  let reopened: Database.Database | null = null;
  try {
    reopened = new Database(databasePath, { fileMustExist: true, timeout: 1_000 });
    reopened.pragma('foreign_keys = ON');
    const finalJournalMode = stringPragma(reopened, 'journal_mode = WAL');
    checkpoint(reopened);
    runtime.afterReopen?.();
    const postValidation = validationSnapshot(reopened, 'post-VACUUM');
    if (postValidation.schemaIdentity !== preValidation.schemaIdentity) {
      throw new Error('Database compaction post-VACUUM schema identity changed');
    }
    if (JSON.stringify(postValidation.tableCounts) !== JSON.stringify(preValidation.tableCounts)) {
      throw new Error('Database compaction post-VACUUM durable table counts changed');
    }
    const finalState = currentWritableState(databasePath);
    const after = collectMetrics(reopened, databasePath, finalState, 'after-vacuum', runtime);
    if (after.freelist_count !== 0) {
      throw new Error(`Database compaction post-VACUUM freelist contains ${after.freelist_count} pages`);
    }
    if (finalJournalMode !== 'wal' || after.journal_mode !== 'wal') {
      throw new Error(`Database compaction post-VACUUM journal mode is ${after.journal_mode}`);
    }
    return {
      dry_run: false,
      skipped: false,
      skip_reason: null,
      before,
      after,
      reclaimed_bytes: Math.max(0, before.database_bytes - after.database_bytes),
      duration_ms: Date.now() - startedAt,
      checkpoint: checkpointResult,
      checks: {
        pre_integrity_ok: preValidation.integrityOk,
        post_integrity_ok: postValidation.integrityOk,
        pre_foreign_key_violations: preValidation.foreignKeyViolations,
        post_foreign_key_violations: postValidation.foreignKeyViolations,
        schema_identity_preserved: true,
        durable_counts_preserved: true,
        final_journal_mode: finalJournalMode,
      },
    };
  } catch (error) {
    throw boundedError('post-commit verification', error);
  } finally {
    reopened?.close();
  }
}
