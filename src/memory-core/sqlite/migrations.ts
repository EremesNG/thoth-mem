import type Database from 'better-sqlite3';

import { EVIDENCE_KIND_VALUES, MEMORY_KIND_VALUES } from '../contracts.js';
import { CURRENT_SCHEMA_SQL, IMMUTABILITY_TRIGGER_SQL, TAXONOMY_GUARD_SQL } from './schema.js';

interface NameRow { name: string }
interface VersionRow { version: number | null }
interface KindRow { kind: string }

export const SQLITE_SCHEMA_REVISION = 3;
const PRE_CONSTRAINT_SCHEMA_REVISION = 2;
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
    database.exec(TAXONOMY_GUARD_SQL);
    database.exec(IMMUTABILITY_TRIGGER_SQL);
    const foreignKeyFailures = database.pragma('foreign_key_check') as unknown[];
    if (foreignKeyFailures.length > 0) throw new Error('SQLite revision 3 migration failed foreign-key verification');
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
    return;
  }
  throw new Error(`Unsupported memory SQLite schema revision: ${version.version}`);
}
