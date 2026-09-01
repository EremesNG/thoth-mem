import { existsSync, renameSync, rmSync } from 'node:fs';

import Database from 'better-sqlite3';

import { EVIDENCE_KIND_VALUES, MEMORY_KIND_VALUES } from '../contracts.js';
import {
  CURRENT_SCHEMA_SQL,
  IMMUTABILITY_TRIGGER_SQL,
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

export const SQLITE_SCHEMA_REVISION = 7;
const PRE_CONSTRAINT_SCHEMA_REVISION = 2;
const ORDERED_SESSION_SCHEMA_REVISION = 3;
const SESSION_PROJECTION_SCHEMA_REVISION = 4;
const PREFIX_FTS_SCHEMA_REVISION = 5;
const OBSERVATION_SCHEMA_REVISION = 6;
const REVISION_TWO_AUXILIARY_SQL = `
CREATE TABLE IF NOT EXISTS projection_source_mapping(projection_id TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES memories(id), config_hash TEXT NOT NULL, source_hash TEXT NOT NULL, projected_id TEXT NOT NULL, PRIMARY KEY(projection_id,source_id));
CREATE TABLE IF NOT EXISTS projection_jobs(job_key TEXT PRIMARY KEY, projection_id TEXT NOT NULL, config_hash TEXT NOT NULL, source_watermark INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','running','ready','failed')), attempts INTEGER NOT NULL, checkpoint_source_id TEXT, error_code TEXT);
`;

function assertSupportedKinds(database: Database.Database, table: 'evidence' | 'memories', canonical: readonly string[], mapped: readonly string[], label: string): void {
  const accepted = new Set([...canonical, ...mapped]);
  const kinds = database.prepare(`SELECT DISTINCT kind FROM ${table}`).all() as KindRow[];
  if (kinds.some((row) => !accepted.has(row.kind))) throw new Error(`Unsupported ${label} kind in SQLite revision ${PRE_CONSTRAINT_SCHEMA_REVISION}`);
}

function migrateRevisionTwo(database: Database.Database): void {
  database.transaction(() => {
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
  })();
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

function ensureRevisionThreeBackup(database: Database.Database): void {
  const databasePath = database.name;
  if (!databasePath || databasePath === ':memory:') return;
  const backupPath = preV4BackupPath(databasePath);
  if (existsSync(backupPath)) {
    verifyRevisionThreeBackup(backupPath);
    return;
  }
  const temporaryPath = `${backupPath}.tmp`;
  if (existsSync(temporaryPath)) rmSync(temporaryPath);
  try {
    database.prepare('VACUUM INTO ?').run(temporaryPath);
    verifyRevisionThreeBackup(temporaryPath);
    renameSync(temporaryPath, backupPath);
  } finally {
    if (existsSync(temporaryPath)) rmSync(temporaryPath);
  }
}

function migrateRevisionThree(database: Database.Database): void {
  ensureRevisionThreeBackup(database);
  database.transaction(() => {
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
  })();
}

function migrateRevisionFour(database: Database.Database): void {
  database.transaction(() => {
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
  })();
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

function ensureRevisionFiveBackup(database: Database.Database): void {
  const databasePath = database.name;
  if (!databasePath || databasePath === ':memory:') return;
  const backupPath = preV6BackupPath(databasePath);
  if (existsSync(backupPath)) {
    verifyRevisionFiveBackup(backupPath);
    return;
  }
  const temporaryPath = `${backupPath}.tmp`;
  if (existsSync(temporaryPath)) rmSync(temporaryPath);
  try {
    database.prepare('VACUUM INTO ?').run(temporaryPath);
    verifyRevisionFiveBackup(temporaryPath);
    renameSync(temporaryPath, backupPath);
  } finally {
    if (existsSync(temporaryPath)) rmSync(temporaryPath);
  }
}

function migrateRevisionFive(database: Database.Database): void {
  ensureRevisionFiveBackup(database);
  database.transaction(() => {
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
  })();
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

function ensureRevisionSixBackup(database: Database.Database): void {
  const databasePath = database.name;
  if (!databasePath || databasePath === ':memory:') return;
  const backupPath = preV7BackupPath(databasePath);
  if (existsSync(backupPath)) {
    verifyRevisionSixBackup(backupPath);
    return;
  }
  const temporaryPath = `${backupPath}.tmp`;
  if (existsSync(temporaryPath)) rmSync(temporaryPath);
  try {
    database.prepare('VACUUM INTO ?').run(temporaryPath);
    verifyRevisionSixBackup(temporaryPath);
    renameSync(temporaryPath, backupPath);
  } finally {
    if (existsSync(temporaryPath)) rmSync(temporaryPath);
  }
}

function migrateRevisionSix(database: Database.Database): void {
  ensureRevisionSixBackup(database);
  database.transaction(() => {
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
    database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(SQLITE_SCHEMA_REVISION, new Date().toISOString());
  })();
}

export function migrateCurrentSchema(database: Database.Database): void {
  database.pragma('foreign_keys = ON');
  const objects = database.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'").all() as NameRow[];
  if (objects.length > 0 && !objects.some((row) => row.name === 'schema_migrations')) {
    throw new Error('Database is not a clean current database; use the one-way legacy importer');
  }
  if (objects.length === 0) {
    database.transaction(() => {
      database.exec(CURRENT_SCHEMA_SQL);
      database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(SQLITE_SCHEMA_REVISION, new Date().toISOString());
    })();
    return;
  }
  const version = database.prepare('SELECT max(version) AS version FROM schema_migrations').get() as VersionRow;
  if (version.version === SQLITE_SCHEMA_REVISION) return;
  if (version.version === PRE_CONSTRAINT_SCHEMA_REVISION) {
    migrateRevisionTwo(database);
    migrateRevisionThree(database);
    migrateRevisionFour(database);
    migrateRevisionFive(database);
    migrateRevisionSix(database);
    return;
  }
  if (version.version === ORDERED_SESSION_SCHEMA_REVISION) {
    migrateRevisionThree(database);
    migrateRevisionFour(database);
    migrateRevisionFive(database);
    migrateRevisionSix(database);
    return;
  }
  if (version.version === SESSION_PROJECTION_SCHEMA_REVISION) {
    migrateRevisionFour(database);
    migrateRevisionFive(database);
    migrateRevisionSix(database);
    return;
  }
  if (version.version === PREFIX_FTS_SCHEMA_REVISION) {
    migrateRevisionFive(database);
    migrateRevisionSix(database);
    return;
  }
  if (version.version === OBSERVATION_SCHEMA_REVISION) {
    migrateRevisionSix(database);
    return;
  }
  throw new Error(`Unsupported memory SQLite schema revision: ${version.version}`);
}
