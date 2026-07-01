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
  project     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const SYNC_MUTATIONS_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_sync_mutations_entity ON sync_mutations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_mutations_created_at ON sync_mutations(created_at);
`;

export const OPERATION_TRACES_SQL = `
CREATE TABLE IF NOT EXISTS operation_traces (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id           TEXT NOT NULL UNIQUE,
  origin             TEXT NOT NULL CHECK(origin IN ('mcp','http','cli','system')),
  target             TEXT NOT NULL,
  status             TEXT NOT NULL CHECK(status IN ('ok','error')),
  project            TEXT,
  session_id         TEXT,
  started_at         TEXT NOT NULL,
  finished_at        TEXT NOT NULL,
  duration_ms        INTEGER NOT NULL DEFAULT 0,
  request_json       TEXT NOT NULL,
  response_json      TEXT,
  error              TEXT,
  request_truncated  INTEGER NOT NULL DEFAULT 0,
  response_truncated INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const OPERATION_TRACES_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_operation_traces_origin ON operation_traces(origin);
CREATE INDEX IF NOT EXISTS idx_operation_traces_target ON operation_traces(target);
CREATE INDEX IF NOT EXISTS idx_operation_traces_status ON operation_traces(status);
CREATE INDEX IF NOT EXISTS idx_operation_traces_project ON operation_traces(project);
CREATE INDEX IF NOT EXISTS idx_operation_traces_session ON operation_traces(session_id);
CREATE INDEX IF NOT EXISTS idx_operation_traces_started ON operation_traces(started_at, id);
`;

export const SEMANTIC_METADATA_SQL = `
CREATE TABLE IF NOT EXISTS semantic_index_state (
  lane                 TEXT PRIMARY KEY,
  embedding_config_hash TEXT,
  embedding_dimensions INTEGER,
  pending              INTEGER NOT NULL DEFAULT 0,
  degraded             INTEGER NOT NULL DEFAULT 0,
  stale                INTEGER NOT NULL DEFAULT 0,
  last_ready_at        TEXT,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS semantic_chunks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_id INTEGER NOT NULL,
  chunk_key      TEXT NOT NULL UNIQUE,
  chunk_index    INTEGER NOT NULL,
  content        TEXT NOT NULL,
  project        TEXT,
  topic_key      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS semantic_sentences (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_id INTEGER NOT NULL,
  chunk_key      TEXT NOT NULL,
  sentence_key   TEXT NOT NULL UNIQUE,
  sentence_index INTEGER NOT NULL,
  content        TEXT NOT NULL,
  project        TEXT,
  topic_key      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS semantic_vector_rowids (
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
);

CREATE TABLE IF NOT EXISTS semantic_jobs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  job_key         TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL CHECK(kind IN ('chunk','sentence','rebuild_semantic','extract_kg')),
  state           TEXT NOT NULL CHECK(state IN ('pending','running','done','failed')) DEFAULT 'pending',
  priority        INTEGER NOT NULL DEFAULT 100,
  observation_id  INTEGER,
  source_key      TEXT,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  last_error      TEXT,
  available_at    TEXT NOT NULL DEFAULT (datetime('now')),
  started_at      TEXT,
  finished_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kg_taxonomy_metadata (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  taxonomy_version  TEXT NOT NULL,
  entity_types_json TEXT NOT NULL,
  relation_types_json TEXT NOT NULL,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kg_entities (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_key     TEXT NOT NULL UNIQUE,
  entity_type    TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  aliases_json   TEXT,
  metadata_json  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kg_triples (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_entity_id INTEGER NOT NULL,
  relation         TEXT NOT NULL,
  object_entity_id INTEGER NOT NULL,
  source_type      TEXT NOT NULL CHECK(source_type IN ('observation','prompt','session_summary','unknown')),
  source_id        INTEGER,
  source_sync_id   TEXT,
  project          TEXT,
  topic_key        TEXT,
  provenance       TEXT NOT NULL,
  confidence       REAL NOT NULL DEFAULT 0.0,
  triple_hash      TEXT NOT NULL UNIQUE,
  extractor_version TEXT,
  superseded_by_triple_id INTEGER,
  superseded_at    TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (subject_entity_id) REFERENCES kg_entities(id) ON DELETE CASCADE,
  FOREIGN KEY (object_entity_id) REFERENCES kg_entities(id) ON DELETE CASCADE
);
`;

export const SEMANTIC_METADATA_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_observation ON semantic_chunks(observation_id);
CREATE INDEX IF NOT EXISTS idx_semantic_sentences_observation ON semantic_sentences(observation_id);
CREATE INDEX IF NOT EXISTS idx_semantic_sentences_chunk_key ON semantic_sentences(chunk_key);
CREATE INDEX IF NOT EXISTS idx_semantic_rowids_observation ON semantic_vector_rowids(observation_id);
CREATE INDEX IF NOT EXISTS idx_semantic_jobs_state_priority ON semantic_jobs(state, priority, available_at, id);
CREATE INDEX IF NOT EXISTS idx_semantic_jobs_observation ON semantic_jobs(observation_id);
CREATE INDEX IF NOT EXISTS idx_kg_entities_type ON kg_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_kg_triples_subject ON kg_triples(subject_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_triples_object ON kg_triples(object_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_triples_relation ON kg_triples(relation);
CREATE INDEX IF NOT EXISTS idx_kg_triples_project ON kg_triples(project);
CREATE INDEX IF NOT EXISTS idx_kg_triples_topic ON kg_triples(topic_key);
CREATE INDEX IF NOT EXISTS idx_kg_triples_superseded ON kg_triples(superseded_by_triple_id);
CREATE INDEX IF NOT EXISTS idx_kg_triples_slot_superseded ON kg_triples(source_id, subject_entity_id, relation, superseded_at);
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

-- Operation traces for MCP, HTTP, CLI, and background activity
${OPERATION_TRACES_SQL}

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
${OPERATION_TRACES_INDEXES_SQL}
${SEMANTIC_METADATA_SQL}
${SEMANTIC_METADATA_INDEXES_SQL}
`;

/**
 * Idempotent migrations for schema evolution on existing databases.
 * Each statement is wrapped in try/catch at runtime — safe to re-run on every startup.
 */
export const MIGRATIONS_SQL = [
  'ALTER TABLE observations ADD COLUMN sync_id TEXT',
  'ALTER TABLE user_prompts ADD COLUMN sync_id TEXT',
  'ALTER TABLE sync_mutations ADD COLUMN project TEXT',
];
