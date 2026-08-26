import {
  EVIDENCE_KIND_VALUES,
  HARNESS_VALUES,
  MEMORY_KIND_VALUES,
  MEMORY_OUTCOME_VALUES,
  MEMORY_STATUS_VALUES,
} from '../contracts.js';

function sqlValues(values: readonly string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(',');
}

export const TAXONOMY_GUARD_SQL = `
CREATE TRIGGER evidence_kind_insert_guard BEFORE INSERT ON evidence WHEN new.kind NOT IN (${sqlValues(EVIDENCE_KIND_VALUES)}) BEGIN SELECT RAISE(ABORT, 'invalid evidence kind'); END;
CREATE TRIGGER memory_kind_insert_guard BEFORE INSERT ON memories WHEN new.kind NOT IN (${sqlValues(MEMORY_KIND_VALUES)}) BEGIN SELECT RAISE(ABORT, 'invalid memory kind'); END;
`;

export const IMMUTABILITY_TRIGGER_SQL = `
CREATE TRIGGER evidence_immutable_update BEFORE UPDATE ON evidence BEGIN SELECT RAISE(ABORT, 'evidence is immutable'); END;
CREATE TRIGGER evidence_immutable_delete BEFORE DELETE ON evidence BEGIN SELECT RAISE(ABORT, 'evidence is immutable'); END;
CREATE TRIGGER memory_content_immutable BEFORE UPDATE OF title,content,kind,project_id,topic_key,created_at,valid_from ON memories BEGIN SELECT RAISE(ABORT, 'memory content is immutable'); END;
`;

export const CURRENT_SCHEMA_SQL = `
CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE projects(id TEXT PRIMARY KEY, identity_key TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, root_hint TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE sessions(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), root_session_key TEXT NOT NULL, harness TEXT NOT NULL CHECK(harness IN (${sqlValues(HARNESS_VALUES)})), state TEXT NOT NULL CHECK(state IN ('active','compacted','ended','degraded')), started_at TEXT NOT NULL, ended_at TEXT, UNIQUE(project_id, root_session_key, harness));
CREATE TABLE evidence(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), session_id TEXT REFERENCES sessions(id), kind TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL, source_ref TEXT, captured_at TEXT NOT NULL, metadata_json TEXT NOT NULL);
CREATE TABLE memories(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), topic_key TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, outcome TEXT NOT NULL CHECK(outcome IN (${sqlValues(MEMORY_OUTCOME_VALUES)})), status TEXT NOT NULL CHECK(status IN (${sqlValues(MEMORY_STATUS_VALUES)})), valid_from TEXT NOT NULL, invalid_at TEXT, supersedes_id TEXT REFERENCES memories(id), created_at TEXT NOT NULL);
CREATE UNIQUE INDEX memories_current_topic ON memories(project_id, topic_key) WHERE topic_key IS NOT NULL AND status='current';
CREATE INDEX memories_project_status ON memories(project_id,status,outcome,valid_from);
CREATE TABLE memory_evidence(memory_id TEXT NOT NULL REFERENCES memories(id), evidence_id TEXT NOT NULL REFERENCES evidence(id), relation TEXT NOT NULL CHECK(relation IN ('supports','contradicts','outcome_of','derived_from')), PRIMARY KEY(memory_id,evidence_id));
CREATE TABLE lifecycle_receipts(harness TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), root_session_key TEXT NOT NULL, event_key TEXT NOT NULL, operation TEXT NOT NULL, payload_hash TEXT NOT NULL, outcome TEXT NOT NULL, confirmed_at TEXT, diagnostic_code TEXT, evidence_id TEXT REFERENCES evidence(id), PRIMARY KEY(harness,project_id,root_session_key,event_key,operation));
CREATE TABLE save_receipts(project_id TEXT NOT NULL REFERENCES projects(id), event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, evidence_id TEXT NOT NULL REFERENCES evidence(id), memory_id TEXT REFERENCES memories(id), PRIMARY KEY(project_id,event_key));
CREATE TABLE projection_state(projection_id TEXT PRIMARY KEY, config_hash TEXT NOT NULL, source_watermark INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('disabled','pending','ready','stale','rebuilding','degraded')), updated_at TEXT NOT NULL, last_error_code TEXT);
CREATE TABLE projection_source_mapping(projection_id TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES memories(id), config_hash TEXT NOT NULL, source_hash TEXT NOT NULL, projected_id TEXT NOT NULL, PRIMARY KEY(projection_id,source_id));
CREATE TABLE projection_jobs(job_key TEXT PRIMARY KEY, projection_id TEXT NOT NULL, config_hash TEXT NOT NULL, source_watermark INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','running','ready','failed')), attempts INTEGER NOT NULL, checkpoint_source_id TEXT, error_code TEXT);
CREATE TABLE change_watermark(id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL, changed_at TEXT NOT NULL);
CREATE VIRTUAL TABLE memory_fts USING fts5(memory_id UNINDEXED, project_id UNINDEXED, title, content, topic_key, tokenize='unicode61 tokenchars _');
CREATE TRIGGER memory_fts_insert AFTER INSERT ON memories BEGIN INSERT INTO memory_fts(memory_id,project_id,title,content,topic_key) VALUES(new.id,new.project_id,new.title,new.content,coalesce(new.topic_key,'')); INSERT INTO change_watermark(source_id,changed_at) VALUES(new.id,new.created_at); END;
CREATE TRIGGER memory_fts_delete AFTER DELETE ON memories BEGIN DELETE FROM memory_fts WHERE memory_id=old.id; END;
${TAXONOMY_GUARD_SQL}
${IMMUTABILITY_TRIGGER_SQL}
`;
