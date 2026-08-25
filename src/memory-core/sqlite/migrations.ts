import type Database from 'better-sqlite3';

import { MEMORY_SCHEMA_VERSION } from '../contracts.js';
import { V2_SCHEMA_SQL } from './schema.js';

interface NameRow { name: string }
interface VersionRow { version: number }

export function migrateV2(database: Database.Database): void {
  database.pragma('foreign_keys = ON');
  const objects = database.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'").all() as NameRow[];
  if (objects.length > 0 && !objects.some((row) => row.name === 'schema_migrations')) {
    throw new Error('Database is not a clean v2 database; use the one-way legacy importer');
  }
  if (objects.length === 0) {
    database.transaction(() => {
      database.exec(V2_SCHEMA_SQL);
      database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(MEMORY_SCHEMA_VERSION, new Date().toISOString());
    })();
    return;
  }
  const version = database.prepare('SELECT max(version) AS version FROM schema_migrations').get() as VersionRow;
  if (version.version !== MEMORY_SCHEMA_VERSION) throw new Error(`Unsupported memory schema version: ${version.version}`);
  database.exec(`CREATE TABLE IF NOT EXISTS projection_source_mapping(projection_id TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES memories(id), config_hash TEXT NOT NULL, source_hash TEXT NOT NULL, projected_id TEXT NOT NULL, PRIMARY KEY(projection_id,source_id)); CREATE TABLE IF NOT EXISTS projection_jobs(job_key TEXT PRIMARY KEY, projection_id TEXT NOT NULL, config_hash TEXT NOT NULL, source_watermark INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','running','ready','failed')), attempts INTEGER NOT NULL, checkpoint_source_id TEXT, error_code TEXT);`);
}
