import type Database from 'better-sqlite3';
import {
  OBSERVATIONS_FTS_SQL,
  OBSERVATIONS_FTS_TRIGGERS_SQL,
  SYNC_CHUNKS_INDEXES_SQL,
  SYNC_CHUNKS_SQL,
  SYNC_MUTATIONS_INDEXES_SQL,
  SYNC_MUTATIONS_SQL,
} from './schema.js';

type SqliteDatabase = Database.Database;

interface TableInfoRow {
  name: string;
}

const OBSERVATIONS_FTS_TABLE_NAME = 'observations_fts';
const OBSERVATIONS_FTS_TOPIC_KEY_COLUMN = 'topic_key';
const OBSERVATIONS_FTS_TRIGGER_NAMES = [
  'obs_fts_insert',
  'obs_fts_delete',
  'obs_fts_update',
] as const;

const LEGACY_COLUMN_MIGRATIONS = [
  { tableName: 'observations', columnName: 'sync_id', columnDef: 'TEXT' },
  { tableName: 'user_prompts', columnName: 'sync_id', columnDef: 'TEXT' },
] as const;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function parseFtsColumns(createFtsSql: string): string[] {
  const match = /using\s+fts5\s*\(([\s\S]*?)\)\s*;/i.exec(createFtsSql);

  if (!match) {
    return [];
  }

  return match[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry) => !entry.includes('='))
    .map((entry) => entry.replace(/^['"`]+|['"`]+$/g, ''));
}

const OBSERVATIONS_FTS_REQUIRED_COLUMNS = parseFtsColumns(OBSERVATIONS_FTS_SQL);

export function tableExists(db: SqliteDatabase, tableName: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as Record<string, unknown> | undefined;

  return row !== undefined;
}

export function columnExists(db: SqliteDatabase, tableName: string, columnName: string): boolean {
  if (!tableExists(db, tableName)) {
    return false;
  }

  const columns = db
    .prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    .all() as TableInfoRow[];

  return columns.some((column) => column.name === columnName);
}

export function triggerExists(db: SqliteDatabase, triggerName: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = ? LIMIT 1")
    .get(triggerName) as Record<string, unknown> | undefined;

  return row !== undefined;
}

export function ftsHasColumn(db: SqliteDatabase, ftsTableName: string, columnName: string): boolean {
  if (!tableExists(db, ftsTableName)) {
    return false;
  }

  const columns = db
    .prepare(`PRAGMA table_info(${quoteIdentifier(ftsTableName)})`)
    .all() as TableInfoRow[];

  return columns.some((column) => column.name === columnName);
}

export function addColumnIfMissing(
  db: SqliteDatabase,
  tableName: string,
  columnName: string,
  columnDef: string
): void {
  if (!tableExists(db, tableName)) {
    throw new Error(`Cannot add column to missing table: ${tableName}`);
  }

  if (columnExists(db, tableName, columnName)) {
    return;
  }

  db.exec(
    `ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${columnDef}`
  );
}

export function rebuildObservationsFts(db: SqliteDatabase): void {
  const rebuild = db.transaction(() => {
    for (const triggerName of OBSERVATIONS_FTS_TRIGGER_NAMES) {
      db.exec(`DROP TRIGGER IF EXISTS ${quoteIdentifier(triggerName)}`);
    }

    db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(OBSERVATIONS_FTS_TABLE_NAME)}`);
    db.exec(OBSERVATIONS_FTS_SQL);
    db.exec(OBSERVATIONS_FTS_TRIGGERS_SQL);
    db.exec(
      `INSERT INTO ${quoteIdentifier(OBSERVATIONS_FTS_TABLE_NAME)}(${quoteIdentifier(OBSERVATIONS_FTS_TABLE_NAME)}) VALUES ('rebuild')`
    );
  });

  rebuild();
}

export function runMigrations(db: SqliteDatabase): void {
  const migrate = db.transaction(() => {
    for (const migration of LEGACY_COLUMN_MIGRATIONS) {
      addColumnIfMissing(db, migration.tableName, migration.columnName, migration.columnDef);
    }

    db.exec(SYNC_CHUNKS_SQL);
    db.exec(SYNC_MUTATIONS_SQL);
    db.exec(SYNC_CHUNKS_INDEXES_SQL);
    db.exec(SYNC_MUTATIONS_INDEXES_SQL);

    const missingFtsTable = !tableExists(db, OBSERVATIONS_FTS_TABLE_NAME);
    const missingTopicKeyFtsColumn = !ftsHasColumn(
      db,
      OBSERVATIONS_FTS_TABLE_NAME,
      OBSERVATIONS_FTS_TOPIC_KEY_COLUMN
    );
    const missingFtsColumn = OBSERVATIONS_FTS_REQUIRED_COLUMNS.some(
      (columnName) => !ftsHasColumn(db, OBSERVATIONS_FTS_TABLE_NAME, columnName)
    );
    const missingFtsTrigger = OBSERVATIONS_FTS_TRIGGER_NAMES.some(
      (triggerName) => !triggerExists(db, triggerName)
    );

    if (missingFtsTable || missingTopicKeyFtsColumn || missingFtsColumn || missingFtsTrigger) {
      rebuildObservationsFts(db);
    }
  });

  migrate();
}
