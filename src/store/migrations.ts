import type Database from 'better-sqlite3';
import {
  OBSERVATIONS_FTS_SQL,
  OBSERVATIONS_FTS_TRIGGERS_SQL,
  SEMANTIC_METADATA_INDEXES_SQL,
  SEMANTIC_METADATA_SQL,
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

const DEFAULT_EMBEDDING_DIMENSIONS = 384;
const VECTOR_TABLES = ['vec_chunks', 'vec_sentences'] as const;

export interface SemanticMigrationOptions {
  sqliteVecReady?: boolean;
  embeddingDimensions?: number | null;
  embeddingConfigHash?: string | null;
  degradedReason?: string | null;
}

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
  runMigrationsWithSemantic(db, {});
}

function vectorTableDimension(db: SqliteDatabase, tableName: string): number | null {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { sql?: string } | undefined;
  const match = row?.sql?.match(/float\[(\d+)\]/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function recreateVectorTablesOnDimensionChange(db: SqliteDatabase, dimensions: number): boolean {
  let recreated = false;

  for (const tableName of VECTOR_TABLES) {
    const existingDimensions = vectorTableDimension(db, tableName);
    if (existingDimensions !== null && existingDimensions !== dimensions) {
      db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
      recreated = true;
    }
  }

  if (recreated) {
    db.prepare("DELETE FROM semantic_vector_rowids WHERE lane IN ('chunk','sentence')").run();
  }

  return recreated;
}

function semanticRowidsHasObservationForeignKey(db: SqliteDatabase): boolean {
  if (!tableExists(db, 'semantic_vector_rowids')) {
    return false;
  }

  const foreignKeys = db
    .prepare('PRAGMA foreign_key_list("semantic_vector_rowids")')
    .all() as Array<{ table: string; from: string }>;

  return foreignKeys.some((foreignKey) => (
    foreignKey.table === 'observations' && foreignKey.from === 'observation_id'
  ));
}

function rebuildSemanticRowidsWithoutObservationForeignKey(db: SqliteDatabase): void {
  if (!semanticRowidsHasObservationForeignKey(db)) {
    return;
  }

  db.exec('ALTER TABLE semantic_vector_rowids RENAME TO semantic_vector_rowids_old');
  db.exec(`
    CREATE TABLE semantic_vector_rowids (
      lane            TEXT NOT NULL CHECK(lane IN ('chunk','sentence')),
      source_key      TEXT NOT NULL,
      vec_rowid       INTEGER NOT NULL,
      observation_id  INTEGER NOT NULL,
      lineage_hash    TEXT NOT NULL,
      embedding_hash  TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (lane, source_key),
      UNIQUE (lane, vec_rowid)
    )
  `);
  db.exec(`
    INSERT OR IGNORE INTO semantic_vector_rowids (
      lane, source_key, vec_rowid, observation_id, lineage_hash, embedding_hash, created_at, updated_at
    )
    SELECT lane, source_key, vec_rowid, observation_id, lineage_hash, embedding_hash, created_at, updated_at
    FROM semantic_vector_rowids_old
  `);
  db.exec('DROP TABLE semantic_vector_rowids_old');
}

export function runMigrationsWithSemantic(db: SqliteDatabase, options: SemanticMigrationOptions): void {
  const migrate = db.transaction(() => {
    for (const migration of LEGACY_COLUMN_MIGRATIONS) {
      addColumnIfMissing(db, migration.tableName, migration.columnName, migration.columnDef);
    }

    db.exec(SYNC_CHUNKS_SQL);
    db.exec(SYNC_MUTATIONS_SQL);
    db.exec(SYNC_CHUNKS_INDEXES_SQL);
    db.exec(SYNC_MUTATIONS_INDEXES_SQL);
    db.exec(SEMANTIC_METADATA_SQL);
    rebuildSemanticRowidsWithoutObservationForeignKey(db);
    db.exec(SEMANTIC_METADATA_INDEXES_SQL);

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

    const sqliteVecReady = options.sqliteVecReady ?? false;
    const resolvedDimensions = options.embeddingDimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
    const dimensionsKnown = options.embeddingDimensions !== null && options.embeddingDimensions !== undefined;
    const vectorTablesRecreated = sqliteVecReady
      ? recreateVectorTablesOnDimensionChange(db, resolvedDimensions)
      : false;
    const stale = dimensionsKnown && !vectorTablesRecreated ? 0 : 1;
    const degraded = sqliteVecReady ? 0 : 1;
    const hash = options.embeddingConfigHash ?? null;
    const lanes = ['sentence', 'chunk'];

    for (const lane of lanes) {
      db.prepare(
        `INSERT INTO semantic_index_state (
          lane, embedding_config_hash, embedding_dimensions, pending, degraded, stale, last_ready_at, updated_at
        ) VALUES (?, ?, ?, 1, ?, ?, NULL, datetime('now'))
        ON CONFLICT(lane) DO UPDATE SET
          embedding_config_hash = excluded.embedding_config_hash,
          embedding_dimensions = excluded.embedding_dimensions,
          pending = CASE WHEN excluded.stale = 1 THEN 1 ELSE semantic_index_state.pending END,
          degraded = excluded.degraded,
          stale = excluded.stale,
          updated_at = datetime('now')`
      ).run(lane, hash, resolvedDimensions, degraded, stale);
    }

    if (sqliteVecReady) {
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(embedding float[${resolvedDimensions}])`);
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_sentences USING vec0(embedding float[${resolvedDimensions}])`);
    }
  });

  migrate();
}
