/**
 * SQLite pragmas for optimal performance and reliability.
 * Must be executed one per statement (not as a batch).
 */
export const PRAGMAS_SQL = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA busy_timeout = 5000',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA foreign_keys = ON',
] as const;

export const PRAGMAS = PRAGMAS_SQL;

export const OBSERVATIONS_FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
  title, content, tool_name, type, project, topic_key,
  content='observations',
  content_rowid='id'
);
`;

export const OBSERVATIONS_FTS_TRIGGERS_SQL = `
CREATE TRIGGER IF NOT EXISTS obs_fts_insert AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, title, content, tool_name, type, project, topic_key)
  VALUES (new.id, new.title, new.content, new.tool_name, new.type, new.project, new.topic_key);
END;

CREATE TRIGGER IF NOT EXISTS obs_fts_delete AFTER DELETE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, title, content, tool_name, type, project, topic_key)
  VALUES ('delete', old.id, old.title, old.content, old.tool_name, old.type, old.project, old.topic_key);
END;

CREATE TRIGGER IF NOT EXISTS obs_fts_update AFTER UPDATE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, title, content, tool_name, type, project, topic_key)
  VALUES ('delete', old.id, old.title, old.content, old.tool_name, old.type, old.project, old.topic_key);
  INSERT INTO observations_fts(rowid, title, content, tool_name, type, project, topic_key)
  VALUES (new.id, new.title, new.content, new.tool_name, new.type, new.project, new.topic_key);
END;
`;

export const SYNC_CHUNKS_SQL = `
CREATE TABLE IF NOT EXISTS sync_chunks (
  id               INTEGER PRIMARY KEY,
  chunk_id         TEXT NOT NULL UNIQUE,
  payload_hash     TEXT,
  status           TEXT NOT NULL CHECK(status IN ('applied', 'skipped', 'failed')),
  from_mutation_id INTEGER,
  to_mutation_id   INTEGER,
  chunk_version    INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const SYNC_CHUNKS_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_sync_chunks_chunk_id ON sync_chunks(chunk_id);
`;

export const SYNC_MUTATIONS_SQL = `
CREATE TABLE IF NOT EXISTS sync_mutations (
  id          INTEGER PRIMARY KEY,
  operation   TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete')),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('observation', 'prompt', 'session')),
  entity_id   INTEGER NOT NULL,
  sync_id     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const SYNC_MUTATIONS_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_sync_mutations_entity ON sync_mutations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_mutations_created_at ON sync_mutations(created_at);
`;

/**
 * Complete database schema — uses CREATE TABLE/INDEX/TRIGGER IF NOT EXISTS
 * for idempotent setup. Safe to run on every startup.
 */
export const SCHEMA_SQL = `
-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  project    TEXT NOT NULL,
  directory  TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at   TEXT,
  summary    TEXT
);

-- Observations table (core data store) with strict type taxonomy
CREATE TABLE IF NOT EXISTS observations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_id         TEXT,
  session_id      TEXT NOT NULL,
  type            TEXT NOT NULL CHECK(type IN ('decision','architecture','bugfix','pattern','config','discovery','learning','session_summary','manual')),
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  tool_name       TEXT,
  project         TEXT,
  scope           TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('project','personal')),
  topic_key       TEXT,
  normalized_hash TEXT,
  revision_count  INTEGER NOT NULL DEFAULT 1,
  duplicate_count INTEGER NOT NULL DEFAULT 1,
  last_seen_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Observation versions (stores previous versions on topic_key upsert or update)
CREATE TABLE IF NOT EXISTS observation_versions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_id   INTEGER NOT NULL,
  title            TEXT NOT NULL,
  content          TEXT NOT NULL,
  type             TEXT NOT NULL,
  version_number   INTEGER NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE
);

-- FTS5 virtual table for full-text search on observations
${OBSERVATIONS_FTS_SQL}

-- User prompts table
CREATE TABLE IF NOT EXISTS user_prompts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_id    TEXT,
  session_id TEXT NOT NULL,
  content    TEXT NOT NULL,
  project    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sync chunk state
${SYNC_CHUNKS_SQL}

-- Sync mutation journal
${SYNC_MUTATIONS_SQL}

-- FTS5 virtual table for prompt search
CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
  content, project,
  content='user_prompts',
  content_rowid='id'
);

-- ── FTS5 Sync Triggers (observations) ──

${OBSERVATIONS_FTS_TRIGGERS_SQL}

-- ── FTS5 Sync Triggers (prompts) ──

CREATE TRIGGER IF NOT EXISTS prompt_fts_insert AFTER INSERT ON user_prompts BEGIN
  INSERT INTO prompts_fts(rowid, content, project)
  VALUES (new.id, new.content, new.project);
END;

CREATE TRIGGER IF NOT EXISTS prompt_fts_delete AFTER DELETE ON user_prompts BEGIN
  INSERT INTO prompts_fts(prompts_fts, rowid, content, project)
  VALUES ('delete', old.id, old.content, old.project);
END;

-- ── Indexes ──

CREATE INDEX IF NOT EXISTS idx_obs_session ON observations(session_id);
CREATE INDEX IF NOT EXISTS idx_obs_type ON observations(type);
CREATE INDEX IF NOT EXISTS idx_obs_project ON observations(project);
CREATE INDEX IF NOT EXISTS idx_obs_created ON observations(created_at);
CREATE INDEX IF NOT EXISTS idx_obs_scope ON observations(scope);
CREATE INDEX IF NOT EXISTS idx_obs_topic ON observations(topic_key);
CREATE INDEX IF NOT EXISTS idx_obs_deleted ON observations(deleted_at);
CREATE INDEX IF NOT EXISTS idx_obs_dedupe ON observations(normalized_hash, project, scope, type, title, created_at);
CREATE INDEX IF NOT EXISTS idx_obs_versions_obs ON observation_versions(observation_id);
CREATE INDEX IF NOT EXISTS idx_prompts_session ON user_prompts(session_id);
CREATE INDEX IF NOT EXISTS idx_prompts_project ON user_prompts(project);
CREATE INDEX IF NOT EXISTS idx_obs_sync_id ON observations(sync_id);
CREATE INDEX IF NOT EXISTS idx_prompts_sync_id ON user_prompts(sync_id);
${SYNC_CHUNKS_INDEXES_SQL}
${SYNC_MUTATIONS_INDEXES_SQL}
`;

/**
 * Idempotent migrations for schema evolution on existing databases.
 * Each statement is wrapped in try/catch at runtime — safe to re-run on every startup.
 */
export const MIGRATIONS_SQL = [
  'ALTER TABLE observations ADD COLUMN sync_id TEXT',
  'ALTER TABLE user_prompts ADD COLUMN sync_id TEXT',
];
