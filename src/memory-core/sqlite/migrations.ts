import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, linkSync, openSync, rmSync } from 'node:fs';

import Database from 'better-sqlite3';

import { EVIDENCE_KIND_VALUES, HARNESS_VALUES, MEMORY_KIND_VALUES } from '../contracts.js';
import {
  CURRENT_SCHEMA_SQL,
  IMMUTABILITY_TRIGGER_SQL,
  LEGACY_IMPORT_AUDIT_SCHEMA_SQL,
  LEGACY_IMPORT_COHORT_SCHEMA_SQL,
  OBSERVATION_PROJECTION_SCHEMA_SQL,
  PROJECT_ALIAS_SCHEMA_SQL,
  REVISION_THREE_TAXONOMY_GUARD_SQL,
  REVISION_FIVE_FTS_SCHEMA_SQL,
  SESSION_PROJECTION_SCHEMA_SQL,
  TAXONOMY_GUARD_SQL,
} from './schema.js';

interface NameRow { name: string }
interface VersionRow { version: number | null }
interface KindRow { kind: string }

/** A retained file backup successfully created or verified by this migration run. */
export interface MigrationBackup {
  path: string;
  status: 'created' | 'verified';
}

/**
 * Work performed by one migration run. Current and newly initialized databases
 * report the current revision for both endpoints, no backups, and zero removals.
 * In-memory migrations have no file backups. Counts include only committed cleanup.
 */
export interface MigrationReport {
  fromRevision: number;
  toRevision: number;
  backups: MigrationBackup[];
  removedSessions: number;
  removedReceipts: number;
}

interface SessionCleanupResult {
  backup: MigrationBackup | null;
  removedSessions: number;
  removedReceipts: number;
}

export const SQLITE_SCHEMA_REVISION = 11;
const PRE_CONSTRAINT_SCHEMA_REVISION = 2;
const ORDERED_SESSION_SCHEMA_REVISION = 3;
const SESSION_PROJECTION_SCHEMA_REVISION = 4;
const PREFIX_FTS_SCHEMA_REVISION = 5;
const OBSERVATION_SCHEMA_REVISION = 6;
const PROJECT_ALIAS_SCHEMA_REVISION = 7;
const LEGACY_IMPORT_AUDIT_SCHEMA_REVISION = 8;
const LEGACY_IMPORT_COHORT_SCHEMA_REVISION = 9;
const PI_HARNESS_SCHEMA_REVISION = 10;
const LAZY_SESSION_SCHEMA_REVISION = 11;
const REVISION_TWO_AUXILIARY_SQL = `
CREATE TABLE IF NOT EXISTS projection_source_mapping(projection_id TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES memories(id), config_hash TEXT NOT NULL, source_hash TEXT NOT NULL, projected_id TEXT NOT NULL, PRIMARY KEY(projection_id,source_id));
CREATE TABLE IF NOT EXISTS projection_jobs(job_key TEXT PRIMARY KEY, projection_id TEXT NOT NULL, config_hash TEXT NOT NULL, source_watermark INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','running','ready','failed')), attempts INTEGER NOT NULL, checkpoint_source_id TEXT, error_code TEXT);
`;

function currentRevision(database: Database.Database): number {
  return (database.prepare('SELECT max(version) AS version FROM schema_migrations').get() as VersionRow).version ?? 0;
}

export class MigrationError extends Error {
  constructor(readonly fromRevision: number, readonly toRevision: number, cause: unknown) {
    const prefix = `SQLite migration revision ${fromRevision}→${toRevision} failed: `;
    const suffix = '. Run `thoth-mem migrate` to complete migrations without host timeouts.';
    const locked = cause instanceof Error && 'code' in cause && /^SQLITE_(?:BUSY|LOCKED)(?:_|$)/u.test(String(cause.code));
    const observed = locked ? 'database is locked by another process' : cause instanceof Error ? cause.message : String(cause);
    // Keep the recommendation intact even through hosts' existing 500-UTF-16-unit caps.
    const detail = observed.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').slice(0, 500 - prefix.length - suffix.length).replace(/[\uD800-\uDBFF]$/u, '');
    super(`${prefix}${detail}${suffix}`, { cause });
    this.name = 'MigrationError';
  }
}

function migrationStep<T>(targetRevision: number, migrate: () => T): T {
  try { return migrate(); }
  catch (error) { throw new MigrationError(targetRevision - 1, targetRevision, error); }
}

function assertSupportedKinds(database: Database.Database, table: 'evidence' | 'memories', canonical: readonly string[], mapped: readonly string[], label: string): void {
  const accepted = new Set([...canonical, ...mapped]);
  const kinds = database.prepare(`SELECT DISTINCT kind FROM ${table}`).all() as KindRow[];
  if (kinds.some((row) => !accepted.has(row.kind))) throw new Error(`Unsupported ${label} kind in SQLite revision ${PRE_CONSTRAINT_SCHEMA_REVISION}`);
}

function migrateRevisionTwo(database: Database.Database): void {
  database.transaction(() => {
    if (currentRevision(database) >= ORDERED_SESSION_SCHEMA_REVISION) return;
    assertSupportedKinds(database, 'evidence', EVIDENCE_KIND_VALUES, ['certification', 'verification'], 'evidence');
    assertSupportedKinds(database, 'memories', MEMORY_KIND_VALUES, ['learning'], 'memory');
    database.exec(`
      DROP TRIGGER IF EXISTS evidence_kind_insert_guard;
      DROP TRIGGER IF EXISTS memory_kind_insert_guard;
      DROP TRIGGER IF EXISTS evidence_immutable_update;
      DROP TRIGGER IF EXISTS evidence_immutable_delete;
      DROP TRIGGER IF EXISTS memory_content_immutable;
    `);
    database.prepare("UPDATE evidence SET kind='explicit_save' WHERE kind IN ('certification','verification')").run();
    database.prepare("UPDATE memories SET kind='convention' WHERE kind='learning'").run();
    database.exec(REVISION_TWO_AUXILIARY_SQL);
    database.exec(REVISION_THREE_TAXONOMY_GUARD_SQL);
    database.exec(IMMUTABILITY_TRIGGER_SQL);
    const foreignKeyFailures = database.pragma('foreign_key_check') as unknown[];
    if (foreignKeyFailures.length > 0) throw new Error('SQLite revision 3 migration failed foreign-key verification');
    database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(ORDERED_SESSION_SCHEMA_REVISION, new Date().toISOString());
  }).immediate();
}

export function preV4BackupPath(databasePath: string): string {
  return `${databasePath}.pre-v4.bak`;
}

function verifyRevisionThreeBackup(path: string): void {
  const backup = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = backup.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('SQLite pre-v4 backup failed integrity verification');
    if ((backup.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite pre-v4 backup failed foreign-key verification');
    const version = backup.prepare('SELECT max(version) AS version FROM schema_migrations').get() as VersionRow;
    if (version.version !== ORDERED_SESSION_SCHEMA_REVISION) throw new Error('SQLite pre-v4 backup has an unexpected schema revision');
  } finally {
    backup.close();
  }
}

function ensureBackup(database: Database.Database, backupPath: string, verify: (path: string) => void): MigrationBackup | null {
  if (!database.name || database.name === ':memory:') return null;
  if (existsSync(backupPath)) {
    verify(backupPath);
    return { path: backupPath, status: 'verified' };
  }
  const temporaryPath = `${backupPath}.${process.pid}.${randomUUID()}.tmp`;
  // Reserve ownership before VACUUM (which accepts an existing empty file).
  // A name collision must not let cleanup remove somebody else's candidate.
  const descriptor = openSync(temporaryPath, 'wx', 0o600);
  try {
    closeSync(descriptor);
    try {
      database.prepare('VACUUM INTO ?').run(temporaryPath);
      verify(temporaryPath);
    } catch (error) {
      // A winner may commit before our VACUUM snapshot, making it too new for
      // this step's verifier. Only a verified published backup can replace it.
      if (!existsSync(backupPath)) throw error;
      verify(backupPath);
      return { path: backupPath, status: 'verified' };
    }
    try {
      linkSync(temporaryPath, backupPath);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') {
        throw new Error('SQLite migration backup cannot be published atomically (hard link required)');
      }
      verify(backupPath);
      return { path: backupPath, status: 'verified' };
    }
    return { path: backupPath, status: 'created' };
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function ensureRevisionThreeBackup(database: Database.Database): MigrationBackup | null {
  return ensureBackup(database, preV4BackupPath(database.name), verifyRevisionThreeBackup);
}

function migrateRevisionThree(database: Database.Database): MigrationBackup | null {
  const backup = ensureRevisionThreeBackup(database);
  database.transaction(() => {
    if (currentRevision(database) >= SESSION_PROJECTION_SCHEMA_REVISION) return;
    database.exec(`
      DROP TRIGGER IF EXISTS evidence_kind_insert_guard;
      DROP TRIGGER IF EXISTS memory_kind_insert_guard;
      DROP TRIGGER IF EXISTS evidence_immutable_update;
      DROP TRIGGER IF EXISTS evidence_immutable_delete;
      DROP TRIGGER IF EXISTS memory_content_immutable;
      ALTER TABLE sessions ADD COLUMN next_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK(next_event_sequence >= 0);
    `);
    database.exec(SESSION_PROJECTION_SCHEMA_SQL);
    database.exec('ALTER TABLE lifecycle_receipts ADD COLUMN summary_id TEXT REFERENCES session_summaries(id)');
    database.exec(TAXONOMY_GUARD_SQL);
    database.exec(IMMUTABILITY_TRIGGER_SQL);
    const foreignKeyFailures = database.pragma('foreign_key_check') as unknown[];
    if (foreignKeyFailures.length > 0) throw new Error('SQLite revision 4 migration failed foreign-key verification');
    database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(SESSION_PROJECTION_SCHEMA_REVISION, new Date().toISOString());
  }).immediate();
  return backup;
}

function migrateRevisionFour(database: Database.Database): void {
  database.transaction(() => {
    if (currentRevision(database) >= PREFIX_FTS_SCHEMA_REVISION) return;
    database.exec(`
      DROP TRIGGER IF EXISTS memory_fts_insert;
      DROP TRIGGER IF EXISTS memory_fts_delete;
      DROP TABLE memory_fts;
    `);
    database.exec(REVISION_FIVE_FTS_SCHEMA_SQL);
    database.prepare("INSERT INTO memory_fts(memory_id,project_id,title,content,topic_key) SELECT id,project_id,title,content,coalesce(topic_key,'') FROM memories ORDER BY created_at,id").run();
    const memoryCount = database.prepare('SELECT count(*) AS count FROM memories').get() as { count: number };
    const ftsCount = database.prepare('SELECT count(*) AS count FROM memory_fts').get() as { count: number };
    if (memoryCount.count !== ftsCount.count) throw new Error('SQLite revision 5 migration failed FTS row verification');
    if ((database.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite revision 5 migration failed foreign-key verification');
    database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(PREFIX_FTS_SCHEMA_REVISION, new Date().toISOString());
  }).immediate();
}

export function preV6BackupPath(databasePath: string): string {
  return `${databasePath}.pre-v6.bak`;
}

function verifyRevisionFiveBackup(path: string): void {
  const backup = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = backup.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('SQLite pre-v6 backup failed integrity verification');
    if ((backup.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite pre-v6 backup failed foreign-key verification');
    const version = backup.prepare('SELECT max(version) AS version FROM schema_migrations').get() as VersionRow;
    if (version.version !== PREFIX_FTS_SCHEMA_REVISION) throw new Error('SQLite pre-v6 backup has an unexpected schema revision');
  } finally { backup.close(); }
}

function ensureRevisionFiveBackup(database: Database.Database): MigrationBackup | null {
  return ensureBackup(database, preV6BackupPath(database.name), verifyRevisionFiveBackup);
}

function migrateRevisionFive(database: Database.Database): MigrationBackup | null {
  const backup = ensureRevisionFiveBackup(database);
  database.transaction(() => {
    if (currentRevision(database) >= OBSERVATION_SCHEMA_REVISION) return;
    database.exec('DROP TRIGGER IF EXISTS evidence_kind_insert_guard; DROP TRIGGER IF EXISTS memory_kind_insert_guard;');
    database.exec(OBSERVATION_PROJECTION_SCHEMA_SQL);
    database.exec(TAXONOMY_GUARD_SQL);
    const memoryCount = database.prepare('SELECT count(*) AS count FROM memories').get() as { count: number };
    const ftsCount = database.prepare('SELECT count(*) AS count FROM memory_fts').get() as { count: number };
    if (memoryCount.count !== ftsCount.count) throw new Error('SQLite revision 6 migration failed FTS row verification');
    const observationCount = database.prepare('SELECT count(*) AS count FROM observations').get() as { count: number };
    if (observationCount.count !== 0) throw new Error('SQLite revision 6 migration inferred observation history');
    if ((database.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite revision 6 migration failed foreign-key verification');
    database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(OBSERVATION_SCHEMA_REVISION, new Date().toISOString());
  }).immediate();
  return backup;
}

export function preV7BackupPath(databasePath: string): string {
  return `${databasePath}.pre-v7.bak`;
}

function verifyRevisionSixBackup(path: string): void {
  const backup = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = backup.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('SQLite pre-v7 backup failed integrity verification');
    if ((backup.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite pre-v7 backup failed foreign-key verification');
    const version = backup.prepare('SELECT max(version) AS version FROM schema_migrations').get() as VersionRow;
    if (version.version !== OBSERVATION_SCHEMA_REVISION) throw new Error('SQLite pre-v7 backup has an unexpected schema revision');
  } finally { backup.close(); }
}

function ensureRevisionSixBackup(database: Database.Database): MigrationBackup | null {
  return ensureBackup(database, preV7BackupPath(database.name), verifyRevisionSixBackup);
}

function migrateRevisionSix(database: Database.Database): MigrationBackup | null {
  const backup = ensureRevisionSixBackup(database);
  database.transaction(() => {
    if (currentRevision(database) >= PROJECT_ALIAS_SCHEMA_REVISION) return;
    const projectCount = database.prepare('SELECT count(*) AS count FROM projects').get() as { count: number };
    const evidenceCount = database.prepare('SELECT count(*) AS count FROM evidence').get() as { count: number };
    const memoryCount = database.prepare('SELECT count(*) AS count FROM memories').get() as { count: number };
    const ftsCount = database.prepare('SELECT count(*) AS count FROM memory_fts').get() as { count: number };
    database.exec(PROJECT_ALIAS_SCHEMA_SQL);
    if ((database.prepare('SELECT count(*) AS count FROM projects').get() as { count: number }).count !== projectCount.count
      || (database.prepare('SELECT count(*) AS count FROM evidence').get() as { count: number }).count !== evidenceCount.count
      || (database.prepare('SELECT count(*) AS count FROM memories').get() as { count: number }).count !== memoryCount.count
      || (database.prepare('SELECT count(*) AS count FROM memory_fts').get() as { count: number }).count !== ftsCount.count) {
      throw new Error('SQLite revision 7 migration changed authoritative rows');
    }
    if ((database.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite revision 7 migration failed foreign-key verification');
    database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(PROJECT_ALIAS_SCHEMA_REVISION, new Date().toISOString());
  }).immediate();
  return backup;
}

export function preV8BackupPath(databasePath: string): string {
  return `${databasePath}.pre-v8.bak`;
}

function verifyRevisionSevenBackup(path: string): void {
  const backup = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = backup.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('SQLite pre-v8 backup failed integrity verification');
    if ((backup.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite pre-v8 backup failed foreign-key verification');
    const version = backup.prepare('SELECT max(version) AS version FROM schema_migrations').get() as VersionRow;
    if (version.version !== PROJECT_ALIAS_SCHEMA_REVISION) throw new Error('SQLite pre-v8 backup has an unexpected schema revision');
  } finally { backup.close(); }
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function revisionSevenState(database: Database.Database): string {
  const tables = (database.prepare("SELECT name FROM pragma_table_list WHERE schema='main' AND type IN ('table','virtual') AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name").all() as NameRow[])
    .map((row) => row.name);
  const state = tables.map((table) => {
    const rows = database.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all() as Array<Record<string, unknown>>;
    return [table, rows.map((row) => JSON.stringify(row)).sort()] as const;
  });
  return JSON.stringify(state);
}

function assertRevisionSevenBackupMatches(database: Database.Database, backupPath: string): void {
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    backup.pragma('query_only = ON');
    if (revisionSevenState(backup) !== revisionSevenState(database)) {
      throw new Error('SQLite pre-v8 backup does not match the current revision 7 state');
    }
  } finally { backup.close(); }
}

function ensureRevisionSevenBackup(database: Database.Database): MigrationBackup | null {
  return ensureBackup(database, preV8BackupPath(database.name), verifyRevisionSevenBackup);
}

export interface MigrationHooks {
  afterRevisionSevenBackupVerified?: () => void;
  afterRevisionEightBackupVerified?: () => void;
  afterRevisionNineBackupVerified?: () => void;
  afterRevisionNineTableRebuilt?: () => void;
  afterRevisionTenBackupVerified?: () => void;
}

function migrateRevisionSeven(database: Database.Database, hooks: MigrationHooks): MigrationBackup | null {
  const backup = ensureRevisionSevenBackup(database);
  database.transaction(() => {
    if (currentRevision(database) >= LEGACY_IMPORT_AUDIT_SCHEMA_REVISION) return;
    if (backup) assertRevisionSevenBackupMatches(database, backup.path);
    hooks.afterRevisionSevenBackupVerified?.();
    const baseline = database.prepare('SELECT (SELECT count(*) FROM projects) AS projects,(SELECT count(*) FROM evidence) AS evidence,(SELECT count(*) FROM memories) AS memories,(SELECT count(*) FROM memory_fts) AS fts').get() as Record<string, number>;
    database.exec(LEGACY_IMPORT_AUDIT_SCHEMA_SQL);
    const after = database.prepare('SELECT (SELECT count(*) FROM projects) AS projects,(SELECT count(*) FROM evidence) AS evidence,(SELECT count(*) FROM memories) AS memories,(SELECT count(*) FROM memory_fts) AS fts').get() as Record<string, number>;
    if (JSON.stringify(after) !== JSON.stringify(baseline)) throw new Error('SQLite revision 8 migration changed authoritative rows');
    if ((database.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite revision 8 migration failed foreign-key verification');
    database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(LEGACY_IMPORT_AUDIT_SCHEMA_REVISION, new Date().toISOString());
  }).immediate();
  return backup;
}

export function preV9BackupPath(databasePath: string): string {
  return `${databasePath}.pre-v9.bak`;
}

function verifyRevisionEightBackup(path: string): void {
  const backup = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = backup.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('SQLite pre-v9 backup failed integrity verification');
    if ((backup.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite pre-v9 backup failed foreign-key verification');
    const version = backup.prepare('SELECT max(version) AS version FROM schema_migrations').get() as VersionRow;
    if (version.version !== LEGACY_IMPORT_AUDIT_SCHEMA_REVISION) throw new Error('SQLite pre-v9 backup has an unexpected schema revision');
  } finally { backup.close(); }
}

function ensureRevisionEightBackup(database: Database.Database): MigrationBackup | null {
  return ensureBackup(database, preV9BackupPath(database.name), verifyRevisionEightBackup);
}

function migrateRevisionEight(database: Database.Database, hooks: MigrationHooks): MigrationBackup | null {
  const backup = ensureRevisionEightBackup(database);
  database.transaction(() => {
    if (currentRevision(database) >= LEGACY_IMPORT_COHORT_SCHEMA_REVISION) return;
    if (backup) assertRevisionSevenBackupMatches(database, backup.path);
    hooks.afterRevisionEightBackupVerified?.();
    const baseline = database.prepare('SELECT (SELECT count(*) FROM memories) AS memories,(SELECT count(*) FROM memory_fts) AS fts,(SELECT count(*) FROM legacy_imports) AS imports').get() as Record<string, number>;
    database.exec(LEGACY_IMPORT_COHORT_SCHEMA_SQL);
    const imports = database.prepare('SELECT id FROM legacy_imports ORDER BY created_at,id').all() as Array<{ id: string }>;
    const insert = database.prepare('INSERT INTO legacy_import_cohorts(import_id,cohort_sequence) VALUES(?,?)');
    imports.forEach((row, index) => insert.run(row.id, index + 1));
    const after = database.prepare('SELECT (SELECT count(*) FROM memories) AS memories,(SELECT count(*) FROM memory_fts) AS fts,(SELECT count(*) FROM legacy_imports) AS imports,(SELECT count(*) FROM legacy_import_cohorts) AS cohorts').get() as Record<string, number>;
    if (after.memories !== baseline.memories || after.fts !== baseline.fts || after.imports !== baseline.imports || after.cohorts !== baseline.imports) throw new Error('SQLite revision 9 migration changed authoritative rows');
    if ((database.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite revision 9 migration failed foreign-key verification');
    database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(LEGACY_IMPORT_COHORT_SCHEMA_REVISION, new Date().toISOString());
  }).immediate();
  return backup;
}

export function preV10BackupPath(databasePath: string): string {
  return `${databasePath}.pre-v10.bak`;
}

function verifyRevisionNineBackup(path: string): void {
  const backup = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = backup.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('SQLite pre-v10 backup failed integrity verification');
    if ((backup.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite pre-v10 backup failed foreign-key verification');
    const version = backup.prepare('SELECT max(version) AS version FROM schema_migrations').get() as VersionRow;
    if (version.version !== LEGACY_IMPORT_COHORT_SCHEMA_REVISION) throw new Error('SQLite pre-v10 backup has an unexpected schema revision');
  } finally { backup.close(); }
}

function ensureRevisionNineBackup(database: Database.Database): MigrationBackup | null {
  return ensureBackup(database, preV10BackupPath(database.name), verifyRevisionNineBackup);
}

function logicalState(database: Database.Database): string {
  const tables = (database.prepare("SELECT name FROM pragma_table_list WHERE schema='main' AND type IN ('table','virtual') AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name").all() as NameRow[])
    .map((row) => row.name);
  return JSON.stringify(tables.map((table) => {
    const rows = database.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all() as Array<Record<string, unknown>>;
    return [table, rows.map((row) => JSON.stringify(row)).sort()];
  }));
}

function assertRevisionNineBackupMatches(database: Database.Database, backupPath: string): void {
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    backup.pragma('query_only = ON');
    if (logicalState(database) !== logicalState(backup)) throw new Error('SQLite pre-v10 backup does not match the locked revision 9 source');
  } finally { backup.close(); }
}

function migrateRevisionNine(database: Database.Database, hooks: MigrationHooks): MigrationBackup | null {
  const backup = ensureRevisionNineBackup(database);
  hooks.afterRevisionNineBackupVerified?.();
  database.pragma('foreign_keys = OFF');
  database.pragma('legacy_alter_table = ON');
  try {
    database.transaction(() => {
      if (currentRevision(database) >= PI_HARNESS_SCHEMA_REVISION) return;
      if (backup) assertRevisionNineBackupMatches(database, backup.path);
      const beforeState = logicalState(database);
      const harnessSql = HARNESS_VALUES.map((value) => `'${value.replaceAll("'", "''")}'`).join(',');
      database.exec(`
        ALTER TABLE sessions RENAME TO sessions_v9;
        CREATE TABLE sessions(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), root_session_key TEXT NOT NULL, harness TEXT NOT NULL CHECK(harness IN (${harnessSql})), state TEXT NOT NULL CHECK(state IN ('active','compacted','ended','degraded')), started_at TEXT NOT NULL, ended_at TEXT, next_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK(next_event_sequence >= 0), UNIQUE(project_id, root_session_key, harness));
        INSERT INTO sessions(id,project_id,root_session_key,harness,state,started_at,ended_at,next_event_sequence)
          SELECT id,project_id,root_session_key,harness,state,started_at,ended_at,next_event_sequence FROM sessions_v9;
        DROP TABLE sessions_v9;
      `);
      hooks.afterRevisionNineTableRebuilt?.();
      if (logicalState(database) !== beforeState) throw new Error('SQLite revision 10 migration changed authoritative row state');
      const targetSql = (database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'").get() as { sql: string }).sql;
      for (const harness of HARNESS_VALUES) if (!targetSql.includes(`'${harness}'`)) throw new Error('SQLite revision 10 sessions constraint verification failed');
      const integrity = database.pragma('integrity_check') as Array<{ integrity_check: string }>;
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('SQLite revision 10 migration failed integrity verification');
      if ((database.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite revision 10 migration failed foreign-key verification');
      database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(PI_HARNESS_SCHEMA_REVISION, new Date().toISOString());
    }).immediate();
  } finally {
    database.pragma('legacy_alter_table = OFF');
    database.pragma('foreign_keys = ON');
  }
  if ((database.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite revision 10 migration failed foreign-key verification');
  return backup;
}

export function preV11BackupPath(databasePath: string): string {
  return `${databasePath}.pre-v11.bak`;
}

function verifyRevisionTenBackup(path: string): void {
  const backup = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = backup.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('SQLite pre-v11 backup failed integrity verification');
    if ((backup.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite pre-v11 backup failed foreign-key verification');
    const version = backup.prepare('SELECT max(version) AS version FROM schema_migrations').get() as VersionRow;
    if (version.version !== PI_HARNESS_SCHEMA_REVISION) throw new Error('SQLite pre-v11 backup has an unexpected schema revision');
  } finally { backup.close(); }
}

function ensureRevisionTenBackup(database: Database.Database): MigrationBackup | null {
  return ensureBackup(database, preV11BackupPath(database.name), verifyRevisionTenBackup);
}

/** Internal candidate-selection seam for deterministic query-plan verification. */
export const REVISION_ELEVEN_EMPTY_SESSIONS_SQL = `
  WITH referenced_sessions(id) AS MATERIALIZED (
    SELECT session_id FROM evidence WHERE session_id IS NOT NULL
    UNION SELECT session_id FROM session_events WHERE session_id IS NOT NULL
    UNION SELECT session_id FROM session_summaries WHERE session_id IS NOT NULL
    UNION SELECT session_id FROM observations WHERE session_id IS NOT NULL
    UNION SELECT reviewer_session_id FROM observation_reviews WHERE reviewer_session_id IS NOT NULL
    UNION SELECT session_id FROM legacy_import_rows WHERE session_id IS NOT NULL
  )
  SELECT s.id,s.harness,s.project_id,s.root_session_key FROM sessions s
  WHERE s.harness<>'import'
    AND s.id NOT IN (SELECT id FROM referenced_sessions)
    AND NOT EXISTS (
      SELECT 1 FROM lifecycle_receipts r
      WHERE r.harness=s.harness AND r.project_id=s.project_id AND r.root_session_key=s.root_session_key
        AND (r.evidence_id IS NOT NULL OR r.summary_id IS NOT NULL)
    )
`;

function migrateRevisionTen(database: Database.Database, hooks: MigrationHooks): SessionCleanupResult {
  const backup = ensureRevisionTenBackup(database);
  let removedSessions = 0;
  let removedReceipts = 0;
  database.pragma('foreign_keys = OFF');
  try {
    database.transaction(() => {
      if (currentRevision(database) >= LAZY_SESSION_SCHEMA_REVISION) return;
      if (backup) {
        const backupDatabase = new Database(backup.path, { readonly: true, fileMustExist: true });
        try {
          backupDatabase.pragma('query_only = ON');
          if (logicalState(database) !== logicalState(backupDatabase)) throw new Error('SQLite pre-v11 backup does not match the locked revision 10 source');
        } finally { backupDatabase.close(); }
      }
      hooks.afterRevisionTenBackupVerified?.();
      // Materialize candidates once, before either deletion changes their receipt identity.
      // Indirect memory/save references retain sessions through evidence.
      database.exec(`CREATE TEMP TABLE revision_eleven_empty_sessions AS ${REVISION_ELEVEN_EMPTY_SESSIONS_SQL}`);
      removedReceipts = database.prepare(`
        DELETE FROM lifecycle_receipts
        WHERE (harness,project_id,root_session_key) IN (
          SELECT harness,project_id,root_session_key FROM temp.revision_eleven_empty_sessions
        ) AND evidence_id IS NULL AND summary_id IS NULL
      `).run().changes;
      removedSessions = database.prepare('DELETE FROM sessions WHERE id IN (SELECT id FROM temp.revision_eleven_empty_sessions)').run().changes;
      database.exec('DROP TABLE temp.revision_eleven_empty_sessions');
      const integrity = database.pragma('integrity_check') as Array<{ integrity_check: string }>;
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('SQLite revision 11 migration failed integrity verification');
      if ((database.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite revision 11 migration failed foreign-key verification');
      database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(LAZY_SESSION_SCHEMA_REVISION, new Date().toISOString());
    }).immediate();
  } finally {
    database.pragma('foreign_keys = ON');
  }
  if ((database.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('SQLite revision 11 migration failed foreign-key verification');
  return { backup, removedSessions, removedReceipts };
}

export function migrateCurrentSchema(database: Database.Database, hooks: MigrationHooks = {}): MigrationReport {
  database.pragma('foreign_keys = ON');
  const report: MigrationReport = { fromRevision: SQLITE_SCHEMA_REVISION, toRevision: SQLITE_SCHEMA_REVISION, backups: [], removedSessions: 0, removedReceipts: 0 };
  const objects = database.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'").all() as NameRow[];
  if (objects.length > 0 && !objects.some((row) => row.name === 'schema_migrations')) {
    throw new Error('Database is not a clean current database; use the one-way legacy importer');
  }
  if (objects.length === 0) {
    database.transaction(() => {
      database.exec(CURRENT_SCHEMA_SQL);
      database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(SQLITE_SCHEMA_REVISION, new Date().toISOString());
    })();
    return report;
  }
  const version = database.prepare('SELECT max(version) AS version FROM schema_migrations').get() as VersionRow;
  if (version.version === SQLITE_SCHEMA_REVISION) return report;
  if (version.version === null || !Number.isInteger(version.version) || version.version < PRE_CONSTRAINT_SCHEMA_REVISION || version.version > SQLITE_SCHEMA_REVISION) {
    throw new Error(`Unsupported memory SQLite schema revision: ${version.version}`);
  }
  report.fromRevision = version.version;
  const steps: Array<[number, () => MigrationBackup | null | void]> = [
    [ORDERED_SESSION_SCHEMA_REVISION, () => migrateRevisionTwo(database)],
    [SESSION_PROJECTION_SCHEMA_REVISION, () => migrateRevisionThree(database)],
    [PREFIX_FTS_SCHEMA_REVISION, () => migrateRevisionFour(database)],
    [OBSERVATION_SCHEMA_REVISION, () => migrateRevisionFive(database)],
    [PROJECT_ALIAS_SCHEMA_REVISION, () => migrateRevisionSix(database)],
    [LEGACY_IMPORT_AUDIT_SCHEMA_REVISION, () => migrateRevisionSeven(database, hooks)],
    [LEGACY_IMPORT_COHORT_SCHEMA_REVISION, () => migrateRevisionEight(database, hooks)],
    [PI_HARNESS_SCHEMA_REVISION, () => migrateRevisionNine(database, hooks)],
  ];
  for (const [targetRevision, migrate] of steps) {
    if (targetRevision <= currentRevision(database)) continue;
    const backup = migrationStep(targetRevision, migrate);
    if (backup) report.backups.push(backup);
  }
  if (currentRevision(database) >= LAZY_SESSION_SCHEMA_REVISION) return report;
  const cleanup = migrationStep(LAZY_SESSION_SCHEMA_REVISION, () => migrateRevisionTen(database, hooks));
  if (cleanup.backup) report.backups.push(cleanup.backup);
  report.removedSessions = cleanup.removedSessions;
  report.removedReceipts = cleanup.removedReceipts;
  return report;
}
