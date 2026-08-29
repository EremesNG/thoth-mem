import {
  EVIDENCE_KIND_VALUES,
  EVENT_ACTOR_VALUES,
  EVENT_AUTHORITY_VALUES,
  HARNESS_VALUES,
  MEMORY_KIND_VALUES,
  MEMORY_OUTCOME_VALUES,
  MEMORY_STATUS_VALUES,
  OBSERVATION_GENERATOR_KIND_VALUES,
  OBSERVATION_KIND_VALUES,
  OBSERVATION_REVIEW_BASIS_VALUES,
  OBSERVATION_REVIEW_VERDICT_VALUES,
  OBSERVATION_SCOPE_VALUES,
  OBSERVATION_SUPPORT_RELATION_VALUES,
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

export const REVISION_FIVE_SCHEMA_SQL = `
${SHARED_SCHEMA_PREFIX}
CREATE TABLE sessions(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), root_session_key TEXT NOT NULL, harness TEXT NOT NULL CHECK(harness IN (${sqlValues(HARNESS_VALUES)})), state TEXT NOT NULL CHECK(state IN ('active','compacted','ended','degraded')), started_at TEXT NOT NULL, ended_at TEXT, next_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK(next_event_sequence >= 0), UNIQUE(project_id, root_session_key, harness));
${sharedSchemaSuffix(', summary_id TEXT REFERENCES session_summaries(id)', ", prefix='2 3 4 5 6 7 8 9 10 11 12'")}
${SESSION_PROJECTION_SCHEMA_SQL}
${taxonomyGuardSql([...REVISION_THREE_EVIDENCE_KIND_VALUES, 'session_summary'])}
${IMMUTABILITY_TRIGGER_SQL}
`;

export const OBSERVATION_PROJECTION_SCHEMA_SQL = `
CREATE TABLE observations(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  session_id TEXT REFERENCES sessions(id),
  submission_evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence(id),
  predecessor_id TEXT UNIQUE REFERENCES observations(id),
  scope TEXT NOT NULL CHECK(scope IN (${sqlValues(OBSERVATION_SCOPE_VALUES)})),
  source_sequence_from INTEGER CHECK(source_sequence_from IS NULL OR source_sequence_from > 0),
  source_sequence_to INTEGER CHECK(source_sequence_to IS NULL OR source_sequence_to >= source_sequence_from),
  kind TEXT NOT NULL CHECK(kind IN (${sqlValues(OBSERVATION_KIND_VALUES)})),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 500),
  claim TEXT NOT NULL CHECK(length(claim) BETWEEN 1 AND 4000),
  proposed_memory_kind TEXT NOT NULL CHECK(proposed_memory_kind IN (${sqlValues(MEMORY_KIND_VALUES)})),
  proposed_memory_title TEXT NOT NULL CHECK(length(proposed_memory_title) BETWEEN 1 AND 500),
  proposed_memory_content TEXT NOT NULL CHECK(length(proposed_memory_content) BETWEEN 1 AND 8000),
  proposed_topic_key TEXT,
  proposed_outcome TEXT NOT NULL CHECK(proposed_outcome IN (${sqlValues(MEMORY_OUTCOME_VALUES)})),
  generator_kind TEXT NOT NULL CHECK(generator_kind IN (${sqlValues(OBSERVATION_GENERATOR_KIND_VALUES)})),
  generator_name TEXT NOT NULL CHECK(length(generator_name) BETWEEN 1 AND 200),
  generator_version TEXT CHECK(generator_version IS NULL OR length(generator_version) BETWEEN 1 AND 200),
  generator_config_hash TEXT CHECK(generator_config_hash IS NULL OR generator_config_hash GLOB '[0-9a-f]*' AND length(generator_config_hash)=64),
  created_at TEXT NOT NULL,
  CHECK((scope='session' AND session_id IS NOT NULL AND source_sequence_from IS NOT NULL AND source_sequence_to IS NOT NULL) OR (scope='project' AND source_sequence_from IS NULL AND source_sequence_to IS NULL))
);
CREATE INDEX observations_queue ON observations(project_id,created_at,id);
CREATE INDEX observations_session ON observations(session_id,created_at,id);
CREATE TABLE observation_facets(
  observation_id TEXT NOT NULL REFERENCES observations(id),
  facet_type TEXT NOT NULL CHECK(facet_type IN ('concept','file')),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 500),
  PRIMARY KEY(observation_id,facet_type,ordinal),
  UNIQUE(observation_id,facet_type,value)
);
CREATE TABLE observation_supports(
  observation_id TEXT NOT NULL REFERENCES observations(id),
  evidence_id TEXT NOT NULL REFERENCES evidence(id),
  relation TEXT NOT NULL CHECK(relation IN (${sqlValues(OBSERVATION_SUPPORT_RELATION_VALUES)})),
  PRIMARY KEY(observation_id,evidence_id)
);
CREATE TABLE observation_reviews(
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL UNIQUE REFERENCES observations(id),
  review_evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence(id),
  reviewer_session_id TEXT NOT NULL REFERENCES sessions(id),
  actor TEXT NOT NULL CHECK(actor='agent'),
  authority TEXT NOT NULL CHECK(authority='root_user'),
  verdict TEXT NOT NULL CHECK(verdict IN (${sqlValues(OBSERVATION_REVIEW_VERDICT_VALUES)})),
  basis TEXT NOT NULL CHECK(basis IN (${sqlValues(OBSERVATION_REVIEW_BASIS_VALUES)})),
  policy_id TEXT NOT NULL CHECK(length(policy_id) BETWEEN 1 AND 200),
  policy_version TEXT NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 200),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL
);
CREATE TABLE observation_review_supports(
  review_id TEXT NOT NULL REFERENCES observation_reviews(id),
  evidence_id TEXT NOT NULL REFERENCES evidence(id),
  relation TEXT NOT NULL CHECK(relation IN (${sqlValues(OBSERVATION_SUPPORT_RELATION_VALUES)})),
  PRIMARY KEY(review_id,evidence_id)
);
CREATE TABLE observation_promotions(
  observation_id TEXT PRIMARY KEY REFERENCES observations(id),
  promotion_evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence(id),
  memory_id TEXT NOT NULL UNIQUE REFERENCES memories(id),
  created_at TEXT NOT NULL
);
CREATE TABLE observation_receipts(
  project_id TEXT NOT NULL REFERENCES projects(id),
  operation TEXT NOT NULL CHECK(operation IN ('candidate','review','promotion')),
  event_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  operation_evidence_id TEXT NOT NULL REFERENCES evidence(id),
  observation_id TEXT NOT NULL REFERENCES observations(id),
  review_id TEXT REFERENCES observation_reviews(id),
  memory_id TEXT REFERENCES memories(id),
  PRIMARY KEY(project_id,operation,event_key)
);
CREATE TRIGGER observation_scope_guard BEFORE INSERT ON observations
WHEN NOT EXISTS (
  SELECT 1 FROM evidence e
  WHERE e.id=new.submission_evidence_id AND e.project_id=new.project_id AND e.kind='observation'
    AND ((new.scope='session' AND e.session_id=new.session_id) OR (new.scope='project'))
) OR (new.predecessor_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM observations p JOIN evidence pe ON pe.id=p.submission_evidence_id JOIN evidence ne ON ne.id=new.submission_evidence_id
  WHERE p.id=new.predecessor_id AND p.project_id=new.project_id AND pe.rowid<ne.rowid
))
BEGIN SELECT RAISE(ABORT, 'observation scope or predecessor mismatch'); END;
CREATE TRIGGER observation_support_scope_guard BEFORE INSERT ON observation_supports
WHEN NOT EXISTS (
  SELECT 1 FROM observations o JOIN evidence e ON e.id=new.evidence_id
  LEFT JOIN session_events se ON se.evidence_id=e.id
  WHERE o.id=new.observation_id AND e.project_id=o.project_id AND e.id<>o.submission_evidence_id
    AND (o.scope='project' OR (e.session_id=o.session_id AND se.sequence BETWEEN o.source_sequence_from AND o.source_sequence_to))
)
BEGIN SELECT RAISE(ABORT, 'observation support scope mismatch'); END;
CREATE TRIGGER observation_review_scope_guard BEFORE INSERT ON observation_reviews
WHEN NOT EXISTS (
  SELECT 1 FROM observations o JOIN evidence e ON e.id=new.review_evidence_id JOIN sessions s ON s.id=new.reviewer_session_id
  WHERE o.id=new.observation_id AND e.project_id=o.project_id AND e.session_id=new.reviewer_session_id
    AND e.kind='observation_review' AND s.project_id=o.project_id AND s.harness<>'import'
)
BEGIN SELECT RAISE(ABORT, 'observation review scope mismatch'); END;
CREATE TRIGGER observation_review_support_scope_guard BEFORE INSERT ON observation_review_supports
WHEN NOT EXISTS (
  SELECT 1 FROM observation_reviews r JOIN observations o ON o.id=r.observation_id JOIN evidence e ON e.id=new.evidence_id
  JOIN evidence re ON re.id=r.review_evidence_id
  WHERE r.id=new.review_id AND e.project_id=o.project_id AND e.id<>r.review_evidence_id AND e.id<>o.submission_evidence_id AND e.rowid<re.rowid
)
BEGIN SELECT RAISE(ABORT, 'observation review support scope mismatch'); END;
CREATE TRIGGER observation_promotion_scope_guard BEFORE INSERT ON observation_promotions
WHEN NOT EXISTS (
  SELECT 1 FROM observations o JOIN observation_reviews r ON r.observation_id=o.id
  JOIN evidence e ON e.id=new.promotion_evidence_id JOIN memories m ON m.id=new.memory_id
  WHERE o.id=new.observation_id AND r.verdict='accepted' AND e.project_id=o.project_id
    AND e.kind='observation_promotion' AND m.project_id=o.project_id
)
BEGIN SELECT RAISE(ABORT, 'observation promotion scope mismatch'); END;
CREATE TRIGGER observation_immutable_update BEFORE UPDATE ON observations BEGIN SELECT RAISE(ABORT, 'observation is immutable'); END;
CREATE TRIGGER observation_immutable_delete BEFORE DELETE ON observations BEGIN SELECT RAISE(ABORT, 'observation is immutable'); END;
CREATE TRIGGER observation_facet_immutable_update BEFORE UPDATE ON observation_facets BEGIN SELECT RAISE(ABORT, 'observation facet is immutable'); END;
CREATE TRIGGER observation_facet_immutable_delete BEFORE DELETE ON observation_facets BEGIN SELECT RAISE(ABORT, 'observation facet is immutable'); END;
CREATE TRIGGER observation_support_immutable_update BEFORE UPDATE ON observation_supports BEGIN SELECT RAISE(ABORT, 'observation support is immutable'); END;
CREATE TRIGGER observation_support_immutable_delete BEFORE DELETE ON observation_supports BEGIN SELECT RAISE(ABORT, 'observation support is immutable'); END;
CREATE TRIGGER observation_review_immutable_update BEFORE UPDATE ON observation_reviews BEGIN SELECT RAISE(ABORT, 'observation review is immutable'); END;
CREATE TRIGGER observation_review_immutable_delete BEFORE DELETE ON observation_reviews BEGIN SELECT RAISE(ABORT, 'observation review is immutable'); END;
CREATE TRIGGER observation_review_support_immutable_update BEFORE UPDATE ON observation_review_supports BEGIN SELECT RAISE(ABORT, 'observation review support is immutable'); END;
CREATE TRIGGER observation_review_support_immutable_delete BEFORE DELETE ON observation_review_supports BEGIN SELECT RAISE(ABORT, 'observation review support is immutable'); END;
CREATE TRIGGER observation_promotion_immutable_update BEFORE UPDATE ON observation_promotions BEGIN SELECT RAISE(ABORT, 'observation promotion is immutable'); END;
CREATE TRIGGER observation_promotion_immutable_delete BEFORE DELETE ON observation_promotions BEGIN SELECT RAISE(ABORT, 'observation promotion is immutable'); END;
CREATE TRIGGER observation_receipt_immutable_update BEFORE UPDATE ON observation_receipts BEGIN SELECT RAISE(ABORT, 'observation receipt is immutable'); END;
CREATE TRIGGER observation_receipt_immutable_delete BEFORE DELETE ON observation_receipts BEGIN SELECT RAISE(ABORT, 'observation receipt is immutable'); END;
`;

export const CURRENT_SCHEMA_SQL = `
${SHARED_SCHEMA_PREFIX}
CREATE TABLE sessions(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), root_session_key TEXT NOT NULL, harness TEXT NOT NULL CHECK(harness IN (${sqlValues(HARNESS_VALUES)})), state TEXT NOT NULL CHECK(state IN ('active','compacted','ended','degraded')), started_at TEXT NOT NULL, ended_at TEXT, next_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK(next_event_sequence >= 0), UNIQUE(project_id, root_session_key, harness));
${sharedSchemaSuffix(', summary_id TEXT REFERENCES session_summaries(id)', ", prefix='2 3 4 5 6 7 8 9 10 11 12'")}
${SESSION_PROJECTION_SCHEMA_SQL}
${OBSERVATION_PROJECTION_SCHEMA_SQL}
${TAXONOMY_GUARD_SQL}
${IMMUTABILITY_TRIGGER_SQL}
`;
