import {
  EVIDENCE_KIND_VALUES,
  EVENT_ACTOR_VALUES,
  EVENT_AUTHORITY_VALUES,
  HARNESS_VALUES,
  MEMORY_KIND_VALUES,
  MEMORY_OUTCOME_VALUES,
  MEMORY_STATUS_VALUES,
  PRIVACY_CLASS_VALUES,
  RETENTION_CLASS_VALUES,
  SESSION_SUMMARY_CLAIM_KIND_VALUES,
  SESSION_SUMMARY_GENERATOR_KIND_VALUES,
  SESSION_SUMMARY_KIND_VALUES,
  SESSION_SUMMARY_STATUS_VALUES,
  SESSION_SUMMARY_SUPPORT_RELATION_VALUES,
} from '../contracts.js';

const REVISION_THREE_EVIDENCE_KIND_VALUES = [
  'root_prompt', 'explicit_save', 'checkpoint', 'handoff', 'legacy_prompt', 'legacy_observation',
] as const;

function sqlValues(values: readonly string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(',');
}

function taxonomyGuardSql(evidenceKinds: readonly string[]): string {
  return `
CREATE TRIGGER evidence_kind_insert_guard BEFORE INSERT ON evidence WHEN new.kind NOT IN (${sqlValues(evidenceKinds)}) BEGIN SELECT RAISE(ABORT, 'invalid evidence kind'); END;
CREATE TRIGGER memory_kind_insert_guard BEFORE INSERT ON memories WHEN new.kind NOT IN (${sqlValues(MEMORY_KIND_VALUES)}) BEGIN SELECT RAISE(ABORT, 'invalid memory kind'); END;
`;
}

export const TAXONOMY_GUARD_SQL = taxonomyGuardSql(EVIDENCE_KIND_VALUES);
export const REVISION_THREE_TAXONOMY_GUARD_SQL = taxonomyGuardSql(REVISION_THREE_EVIDENCE_KIND_VALUES);

export const IMMUTABILITY_TRIGGER_SQL = `
CREATE TRIGGER evidence_immutable_update BEFORE UPDATE ON evidence BEGIN SELECT RAISE(ABORT, 'evidence is immutable'); END;
CREATE TRIGGER evidence_immutable_delete BEFORE DELETE ON evidence BEGIN SELECT RAISE(ABORT, 'evidence is immutable'); END;
CREATE TRIGGER memory_content_immutable BEFORE UPDATE OF title,content,kind,project_id,topic_key,created_at,valid_from ON memories BEGIN SELECT RAISE(ABORT, 'memory content is immutable'); END;
`;

export const SESSION_PROJECTION_TRIGGER_SQL = `
CREATE TRIGGER session_event_scope_guard BEFORE INSERT ON session_events
WHEN NOT EXISTS (SELECT 1 FROM evidence WHERE id=new.evidence_id AND session_id=new.session_id)
BEGIN SELECT RAISE(ABORT, 'session event evidence scope mismatch'); END;
CREATE TRIGGER session_event_immutable_update BEFORE UPDATE ON session_events BEGIN SELECT RAISE(ABORT, 'session event is immutable'); END;
CREATE TRIGGER session_event_immutable_delete BEFORE DELETE ON session_events BEGIN SELECT RAISE(ABORT, 'session event is immutable'); END;
CREATE TRIGGER session_summary_scope_guard BEFORE INSERT ON session_summaries
WHEN NOT EXISTS (SELECT 1 FROM evidence WHERE id=new.submission_evidence_id AND project_id=new.project_id AND session_id=new.session_id AND kind='session_summary')
BEGIN SELECT RAISE(ABORT, 'session summary evidence scope mismatch'); END;
CREATE TRIGGER session_summary_immutable_update BEFORE UPDATE ON session_summaries
WHEN new.id IS NOT old.id OR new.project_id IS NOT old.project_id OR new.session_id IS NOT old.session_id
  OR new.submission_evidence_id IS NOT old.submission_evidence_id OR new.kind IS NOT old.kind
  OR new.version IS NOT old.version OR new.source_sequence_from IS NOT old.source_sequence_from
  OR new.source_sequence_to IS NOT old.source_sequence_to OR new.generator_kind IS NOT old.generator_kind
  OR new.generator_name IS NOT old.generator_name OR new.generator_version IS NOT old.generator_version
  OR new.generator_config_hash IS NOT old.generator_config_hash OR new.supersedes_id IS NOT old.supersedes_id
  OR new.created_at IS NOT old.created_at OR NOT (old.status='current' AND new.status='superseded')
BEGIN SELECT RAISE(ABORT, 'session summary content is immutable'); END;
CREATE TRIGGER session_summary_immutable_delete BEFORE DELETE ON session_summaries BEGIN SELECT RAISE(ABORT, 'session summary is immutable'); END;
CREATE TRIGGER session_summary_claim_immutable_update BEFORE UPDATE ON session_summary_claims BEGIN SELECT RAISE(ABORT, 'session summary claim is immutable'); END;
CREATE TRIGGER session_summary_claim_immutable_delete BEFORE DELETE ON session_summary_claims BEGIN SELECT RAISE(ABORT, 'session summary claim is immutable'); END;
CREATE TRIGGER session_summary_support_immutable_update BEFORE UPDATE ON session_summary_claim_supports BEGIN SELECT RAISE(ABORT, 'session summary support is immutable'); END;
CREATE TRIGGER session_summary_support_immutable_delete BEFORE DELETE ON session_summary_claim_supports BEGIN SELECT RAISE(ABORT, 'session summary support is immutable'); END;
`;

const SHARED_SCHEMA_PREFIX = `
CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE projects(id TEXT PRIMARY KEY, identity_key TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, root_hint TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
`;

function memoryFtsSchemaSql(ftsOptions = ''): string {
  return `
CREATE VIRTUAL TABLE memory_fts USING fts5(memory_id UNINDEXED, project_id UNINDEXED, title, content, topic_key, tokenize='unicode61 tokenchars _'${ftsOptions});
CREATE TRIGGER memory_fts_insert AFTER INSERT ON memories BEGIN INSERT INTO memory_fts(memory_id,project_id,title,content,topic_key) VALUES(new.id,new.project_id,new.title,new.content,coalesce(new.topic_key,'')); INSERT INTO change_watermark(source_id,changed_at) VALUES(new.id,new.created_at); END;
CREATE TRIGGER memory_fts_delete AFTER DELETE ON memories BEGIN DELETE FROM memory_fts WHERE memory_id=old.id; END;
`;
}

export const REVISION_FIVE_FTS_SCHEMA_SQL = memoryFtsSchemaSql(", prefix='2 3 4 5 6 7 8 9 10 11 12'");

function sharedSchemaSuffix(lifecycleSummaryColumn: string, ftsOptions = ''): string {
  return `
CREATE TABLE evidence(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), session_id TEXT REFERENCES sessions(id), kind TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL, source_ref TEXT, captured_at TEXT NOT NULL, metadata_json TEXT NOT NULL);
CREATE TABLE memories(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), topic_key TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, outcome TEXT NOT NULL CHECK(outcome IN (${sqlValues(MEMORY_OUTCOME_VALUES)})), status TEXT NOT NULL CHECK(status IN (${sqlValues(MEMORY_STATUS_VALUES)})), valid_from TEXT NOT NULL, invalid_at TEXT, supersedes_id TEXT REFERENCES memories(id), created_at TEXT NOT NULL);
CREATE UNIQUE INDEX memories_current_topic ON memories(project_id, topic_key) WHERE topic_key IS NOT NULL AND status='current';
CREATE INDEX memories_project_status ON memories(project_id,status,outcome,valid_from);
CREATE TABLE memory_evidence(memory_id TEXT NOT NULL REFERENCES memories(id), evidence_id TEXT NOT NULL REFERENCES evidence(id), relation TEXT NOT NULL CHECK(relation IN ('supports','contradicts','outcome_of','derived_from')), PRIMARY KEY(memory_id,evidence_id));
CREATE TABLE lifecycle_receipts(harness TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), root_session_key TEXT NOT NULL, event_key TEXT NOT NULL, operation TEXT NOT NULL, payload_hash TEXT NOT NULL, outcome TEXT NOT NULL, confirmed_at TEXT, diagnostic_code TEXT, evidence_id TEXT REFERENCES evidence(id)${lifecycleSummaryColumn}, PRIMARY KEY(harness,project_id,root_session_key,event_key,operation));
CREATE TABLE save_receipts(project_id TEXT NOT NULL REFERENCES projects(id), event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, evidence_id TEXT NOT NULL REFERENCES evidence(id), memory_id TEXT REFERENCES memories(id), PRIMARY KEY(project_id,event_key));
CREATE TABLE projection_state(projection_id TEXT PRIMARY KEY, config_hash TEXT NOT NULL, source_watermark INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('disabled','pending','ready','stale','rebuilding','degraded')), updated_at TEXT NOT NULL, last_error_code TEXT);
CREATE TABLE projection_source_mapping(projection_id TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES memories(id), config_hash TEXT NOT NULL, source_hash TEXT NOT NULL, projected_id TEXT NOT NULL, PRIMARY KEY(projection_id,source_id));
CREATE TABLE projection_jobs(job_key TEXT PRIMARY KEY, projection_id TEXT NOT NULL, config_hash TEXT NOT NULL, source_watermark INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','running','ready','failed')), attempts INTEGER NOT NULL, checkpoint_source_id TEXT, error_code TEXT);
CREATE TABLE change_watermark(id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL, changed_at TEXT NOT NULL);
${memoryFtsSchemaSql(ftsOptions)}
`;
}

export const REVISION_THREE_SCHEMA_SQL = `
${SHARED_SCHEMA_PREFIX}
CREATE TABLE sessions(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), root_session_key TEXT NOT NULL, harness TEXT NOT NULL CHECK(harness IN (${sqlValues(HARNESS_VALUES)})), state TEXT NOT NULL CHECK(state IN ('active','compacted','ended','degraded')), started_at TEXT NOT NULL, ended_at TEXT, UNIQUE(project_id, root_session_key, harness));
${sharedSchemaSuffix('')}
${REVISION_THREE_TAXONOMY_GUARD_SQL}
${IMMUTABILITY_TRIGGER_SQL}
`;

export const SESSION_PROJECTION_SCHEMA_SQL = `
CREATE TABLE session_events(evidence_id TEXT PRIMARY KEY REFERENCES evidence(id), session_id TEXT NOT NULL REFERENCES sessions(id), sequence INTEGER NOT NULL CHECK(sequence > 0), actor TEXT NOT NULL CHECK(actor IN (${sqlValues(EVENT_ACTOR_VALUES)})), authority TEXT NOT NULL CHECK(authority IN (${sqlValues(EVENT_AUTHORITY_VALUES)})), retention_class TEXT NOT NULL CHECK(retention_class IN (${sqlValues(RETENTION_CLASS_VALUES)})), privacy_class TEXT NOT NULL CHECK(privacy_class IN (${sqlValues(PRIVACY_CLASS_VALUES)})), UNIQUE(session_id, sequence));
CREATE INDEX session_events_session_sequence ON session_events(session_id,sequence);
CREATE TABLE session_summaries(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), session_id TEXT NOT NULL REFERENCES sessions(id), submission_evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence(id), kind TEXT NOT NULL CHECK(kind IN (${sqlValues(SESSION_SUMMARY_KIND_VALUES)})), version INTEGER NOT NULL CHECK(version > 0), status TEXT NOT NULL CHECK(status IN (${sqlValues(SESSION_SUMMARY_STATUS_VALUES)})), source_sequence_from INTEGER NOT NULL CHECK(source_sequence_from > 0), source_sequence_to INTEGER NOT NULL CHECK(source_sequence_to >= source_sequence_from), generator_kind TEXT NOT NULL CHECK(generator_kind IN (${sqlValues(SESSION_SUMMARY_GENERATOR_KIND_VALUES)})), generator_name TEXT NOT NULL CHECK(length(generator_name) BETWEEN 1 AND 200), generator_version TEXT CHECK(generator_version IS NULL OR length(generator_version) BETWEEN 1 AND 200), generator_config_hash TEXT CHECK(generator_config_hash IS NULL OR generator_config_hash GLOB '[0-9a-f]*' AND length(generator_config_hash)=64), supersedes_id TEXT REFERENCES session_summaries(id), created_at TEXT NOT NULL, UNIQUE(session_id,kind,version));
CREATE UNIQUE INDEX session_summaries_current_kind ON session_summaries(session_id,kind) WHERE status='current';
CREATE INDEX session_summaries_selection ON session_summaries(session_id,status,source_sequence_to DESC,kind,created_at DESC,id);
CREATE TABLE session_summary_claims(id TEXT PRIMARY KEY, summary_id TEXT NOT NULL REFERENCES session_summaries(id), ordinal INTEGER NOT NULL CHECK(ordinal >= 0), kind TEXT NOT NULL CHECK(kind IN (${sqlValues(SESSION_SUMMARY_CLAIM_KIND_VALUES)})), content TEXT NOT NULL CHECK(length(content) > 0), outcome TEXT CHECK(outcome IS NULL OR outcome IN (${sqlValues(MEMORY_OUTCOME_VALUES)})), UNIQUE(summary_id,ordinal));
CREATE TABLE session_summary_claim_supports(claim_id TEXT NOT NULL REFERENCES session_summary_claims(id), evidence_id TEXT NOT NULL REFERENCES evidence(id), relation TEXT NOT NULL CHECK(relation IN (${sqlValues(SESSION_SUMMARY_SUPPORT_RELATION_VALUES)})), PRIMARY KEY(claim_id,evidence_id));
${SESSION_PROJECTION_TRIGGER_SQL}
`;

export const REVISION_FOUR_SCHEMA_SQL = `
${SHARED_SCHEMA_PREFIX}
CREATE TABLE sessions(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), root_session_key TEXT NOT NULL, harness TEXT NOT NULL CHECK(harness IN (${sqlValues(HARNESS_VALUES)})), state TEXT NOT NULL CHECK(state IN ('active','compacted','ended','degraded')), started_at TEXT NOT NULL, ended_at TEXT, next_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK(next_event_sequence >= 0), UNIQUE(project_id, root_session_key, harness));
${sharedSchemaSuffix(', summary_id TEXT REFERENCES session_summaries(id)')}
${SESSION_PROJECTION_SCHEMA_SQL}
${TAXONOMY_GUARD_SQL}
${IMMUTABILITY_TRIGGER_SQL}
`;

export const CURRENT_SCHEMA_SQL = `
${SHARED_SCHEMA_PREFIX}
CREATE TABLE sessions(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), root_session_key TEXT NOT NULL, harness TEXT NOT NULL CHECK(harness IN (${sqlValues(HARNESS_VALUES)})), state TEXT NOT NULL CHECK(state IN ('active','compacted','ended','degraded')), started_at TEXT NOT NULL, ended_at TEXT, next_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK(next_event_sequence >= 0), UNIQUE(project_id, root_session_key, harness));
${sharedSchemaSuffix(', summary_id TEXT REFERENCES session_summaries(id)', ", prefix='2 3 4 5 6 7 8 9 10 11 12'")}
${SESSION_PROJECTION_SCHEMA_SQL}
${TAXONOMY_GUARD_SQL}
${IMMUTABILITY_TRIGGER_SQL}
`;
