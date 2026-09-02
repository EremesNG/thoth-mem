import Database from 'better-sqlite3';

import { sanitizeLegacyImportContent } from '../privacy.js';
import { hashContent, stableUuid } from '../sqlite/ledger.js';
import { SQLITE_SCHEMA_REVISION } from '../sqlite/migrations.js';
import { canonicalJson, classifyLegacyMemory, hashCanonical, legacyObservationVersion, type EntityDispositionCounts, type ImportPlan, type ImportReport, type LegacyEntity, type ProjectMapping, type RowDisposition, type RowReason } from './contracts.js';
import { currentBaselineManifest, inspectLegacyForApply, type LegacyDataset } from './inspect.js';

const ENTITIES: LegacyEntity[] = ['session', 'prompt', 'session_summary', 'observation_version', 'observation'];
const KEY_SEPARATOR = '\u0000';
const COUNT_TABLES = { projects: 'projects', sessions: 'sessions', evidence: 'evidence', memories: 'memories', memoryEvidence: 'memory_evidence', fts: 'memory_fts', receipts: 'legacy_import_rows' } as const;
export type ImportRowDelta = ImportReport['rowDelta'];

function tableCount(database: Database.Database, table: string): number {
  const exists = database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type IN ('table','view') AND name=?").get(table) as { count: number };
  if (!exists.count) return 0;
  return Number((database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count);
}

export function databaseCounts(database: Database.Database): ImportRowDelta {
  return Object.fromEntries(Object.entries(COUNT_TABLES).map(([key, table]) => [key, tableCount(database, table)])) as unknown as ImportRowDelta;
}

export function subtractCounts(after: ImportRowDelta, before: ImportRowDelta): ImportRowDelta {
  return Object.fromEntries(Object.keys(after).map((key) => [key, after[key as keyof ImportRowDelta] - before[key as keyof ImportRowDelta]])) as unknown as ImportRowDelta;
}

function emptyCounts(): EntityDispositionCounts { return { imported: 0, linked: 0, skipped: 0, quarantined: 0 }; }
function importedMemoryIds(database: Database.Database, importId: string): Set<string> {
  const rows = database.prepare("SELECT memory_id FROM legacy_import_rows WHERE import_id=? AND disposition='imported' AND memory_id IS NOT NULL").all(importId) as Array<{ memory_id: string }>;
  return new Set(rows.map((row) => row.memory_id));
}

export function receiptSummary(database: Database.Database, importId: string): { dispositions: Record<LegacyEntity, EntityDispositionCounts>; reasons: Record<string, number>; rows: number; projects: number } {
  const dispositions = Object.fromEntries(ENTITIES.map((entity) => [entity, emptyCounts()])) as Record<LegacyEntity, EntityDispositionCounts>;
  for (const row of database.prepare('SELECT source_entity AS entity,disposition,count(*) AS count FROM legacy_import_rows WHERE import_id=? GROUP BY source_entity,disposition').all(importId) as Array<{ entity: LegacyEntity; disposition: keyof EntityDispositionCounts; count: number }>) dispositions[row.entity][row.disposition] = row.count;
  const reasons = Object.fromEntries((database.prepare('SELECT reason,count(*) AS count FROM legacy_import_rows WHERE import_id=? GROUP BY reason ORDER BY reason').all(importId) as Array<{ reason: string; count: number }>).map((row) => [row.reason, row.count]));
  return { dispositions, reasons, rows: tableCountWhere(database, 'legacy_import_rows', importId), projects: tableCountWhere(database, 'legacy_project_mappings', importId) };
}

function tableCountWhere(database: Database.Database, table: string, importId: string): number {
  return Number((database.prepare(`SELECT count(*) AS count FROM ${table} WHERE import_id=?`).get(importId) as { count: number }).count);
}

interface ExpectedReceipt {
  sourceHash: string;
  transformedHash: string | null;
  disposition: RowDisposition;
  reason: RowReason;
  projectId: string | null;
  sessionId: string | null;
  evidenceId: string | null;
  memoryId: string | null;
  capturedAt: string;
  evidence?: { kind: 'legacy_prompt' | 'legacy_observation'; content: string; legacyKind?: string };
  memory?: { kind: string; title: string; content: string; topicKey: string | null; outcome: string };
  session?: { rootKey: string; startedAt: string; endedAt: string | null };
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.normalize('NFC').trim() || null;
}

function sourceProject(row: Record<string, unknown>): string | null { return text(row.project) ?? text(row.directory); }
function importedSessionId(sourceFingerprint: string, projectId: string, sourceKey: string): string {
  return stableUuid(`session:${sourceFingerprint}:${projectId}:import:${sourceKey}`);
}
function importedSessionRootKey(sourceFingerprint: string, sourceKey: string): string {
  return `${sourceFingerprint}:${sourceKey}`;
}
function quarantineReason(mapping: ProjectMapping | null): RowReason {
  if (mapping?.basis === 'ambiguous_identity' || mapping?.basis === 'project_conflict' || mapping?.basis === 'placeholder_identity') return mapping.basis;
  return 'placeholder_identity';
}

function expectedReceipts(plan: ImportPlan, dataset: LegacyDataset, importedAt: string, baseline: Record<string, unknown[]>): Map<string, ExpectedReceipt> {
  const receipts = new Map<string, ExpectedReceipt>();
  const mappings = new Map(plan.projectMappings.map((mapping) => [mapping.sourceProject, mapping]));
  const sessionMappings = new Map<string, ProjectMapping | null>();
  const sessionIds = new Map<string, string>();
  const observations = new Map(dataset.observations.map((row) => [String(row.id), row]));
  const exactExistingMemory = (projectId: string, memory: NonNullable<ExpectedReceipt['memory']>, importedId: string): string | null => {
    const matches = (baseline.memories ?? []).filter((row) => {
      const candidate = row as Record<string, unknown>;
      return candidate.id !== importedId && candidate.project_id === projectId && candidate.kind === memory.kind && candidate.outcome === memory.outcome && candidate.status === 'current'
        && candidate.topic_key === memory.topicKey && text(candidate.title) === memory.title && text(candidate.content) === memory.content;
    }) as Array<Record<string, unknown>>;
    matches.sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)) || String(left.id).localeCompare(String(right.id)));
    return matches.length ? String(matches[0]!.id) : null;
  };
  const resolveRow = (row: Record<string, unknown>, inheritedSessionKey?: string): { mapping: ProjectMapping | null; conflict: boolean; projectId: string | null; sessionId: string | null } => {
    const directProject = sourceProject(row);
    const direct = directProject ? mappings.get(directProject) ?? null : null;
    const inherited = inheritedSessionKey ? sessionMappings.get(inheritedSessionKey) ?? null : null;
    const conflict = Boolean(direct && inherited && direct.sourceProjectHash !== inherited.sourceProjectHash);
    const mapping = direct ?? inherited;
    return {
      mapping,
      conflict,
      projectId: !conflict && mapping?.disposition !== 'quarantined' ? mapping?.resolvedProjectId ?? null : null,
      sessionId: inheritedSessionKey ? sessionIds.get(inheritedSessionKey) ?? null : null,
    };
  };
  const materialized = (input: {
    entity: LegacyEntity;
    sourceKey: string;
    sourceVersion: number;
    sourceHash: string;
    capturedAt: string;
    projectId: string;
    sessionId: string | null;
    evidence: NonNullable<ExpectedReceipt['evidence']>;
    memory?: NonNullable<ExpectedReceipt['memory']>;
  }): ExpectedReceipt => {
    const evidenceId = stableUuid(`legacy-evidence:${plan.source.logicalFingerprint}:${input.entity}:${input.sourceKey}:${input.sourceVersion}:${input.projectId}`);
    if (!input.memory) return {
      sourceHash: input.sourceHash, transformedHash: hashCanonical({ content: input.evidence.content }), disposition: 'imported', reason: 'imported',
      projectId: input.projectId, sessionId: input.sessionId, evidenceId, memoryId: null, capturedAt: input.capturedAt, evidence: input.evidence,
    };
    const importedId = stableUuid(`legacy-memory:${plan.source.logicalFingerprint}:${input.entity}:${input.sourceKey}:${input.sourceVersion}:${input.projectId}`);
    const existingId = exactExistingMemory(input.projectId, input.memory, importedId);
    const memoryId = existingId ?? importedId;
    return {
      sourceHash: input.sourceHash, transformedHash: hashCanonical(input.memory), disposition: existingId ? 'linked' : 'imported', reason: existingId ? 'exact_existing' : 'imported',
      projectId: input.projectId, sessionId: input.sessionId, evidenceId, memoryId, capturedAt: input.capturedAt, evidence: input.evidence, memory: input.memory,
    };
  };
  for (const row of dataset.sessions) {
    const sourceKey = String(row.id);
    const project = sourceProject(row);
    const mapping = project ? mappings.get(project) ?? null : null;
    sessionMappings.set(sourceKey, mapping);
    const startedAt = text(row.started_at) ?? importedAt;
    const projectId = mapping?.disposition !== 'quarantined' ? mapping?.resolvedProjectId ?? null : null;
    const sessionId = projectId ? importedSessionId(plan.source.logicalFingerprint, projectId, sourceKey) : null;
    if (sessionId) sessionIds.set(sourceKey, sessionId);
    const endedAt = text(row.ended_at);
    receipts.set(['session', sourceKey, '0'].join(KEY_SEPARATOR), projectId && sessionId ? {
      sourceHash: hashCanonical(row), transformedHash: hashCanonical({ projectId, sessionId, startedAt, endedAt }), disposition: 'imported', reason: 'imported', projectId, sessionId,
      evidenceId: null, memoryId: null, capturedAt: startedAt, session: { rootKey: importedSessionRootKey(plan.source.logicalFingerprint, sourceKey), startedAt, endedAt },
    } : { sourceHash: hashCanonical(row), transformedHash: null, disposition: 'quarantined', reason: quarantineReason(mapping), projectId: null, sessionId: null, evidenceId: null, memoryId: null, capturedAt: startedAt });
    if (typeof row.summary === 'string' && row.summary.trim()) {
      const sanitized = sanitizeLegacyImportContent(row.summary);
      const sourceHash = hashCanonical({ session_id: sourceKey, summary: row.summary });
      const capturedAt = endedAt ?? startedAt;
      const key = ['session_summary', sourceKey, '0'].join(KEY_SEPARATOR);
      if (!projectId) receipts.set(key, { sourceHash, transformedHash: null, disposition: 'quarantined', reason: quarantineReason(mapping), projectId: null, sessionId: null, evidenceId: null, memoryId: null, capturedAt });
      else if (sanitized.disposition === 'quarantined') receipts.set(key, { sourceHash, transformedHash: null, disposition: 'quarantined', reason: sanitized.reason, projectId, sessionId, evidenceId: null, memoryId: null, capturedAt });
      else receipts.set(key, materialized({ entity: 'session_summary', sourceKey, sourceVersion: 0, sourceHash, capturedAt, projectId, sessionId, evidence: { kind: 'legacy_observation', content: sanitized.value }, memory: { kind: 'handoff', title: 'Legacy session summary', content: sanitized.value, topicKey: null, outcome: 'unknown' } }));
    }
  }
  for (const row of dataset.prompts) {
    const sourceKey = String(row.id);
    const resolved = resolveRow(row, String(row.session_id ?? ''));
    const sanitized = sanitizeLegacyImportContent(row.content);
    const base = { sourceHash: hashCanonical(row), transformedHash: null, projectId: resolved.projectId, sessionId: resolved.sessionId, evidenceId: null, memoryId: null, capturedAt: text(row.created_at) ?? importedAt };
    const key = ['prompt', sourceKey, '0'].join(KEY_SEPARATOR);
    if (resolved.conflict) receipts.set(key, { ...base, projectId: null, disposition: 'quarantined', reason: 'project_conflict' });
    else if (!resolved.projectId) receipts.set(key, { ...base, projectId: null, disposition: 'quarantined', reason: quarantineReason(resolved.mapping) });
    else if (sanitized.disposition === 'quarantined') receipts.set(key, { ...base, disposition: 'quarantined', reason: sanitized.reason });
    else receipts.set(key, materialized({ entity: 'prompt', sourceKey, sourceVersion: 0, sourceHash: base.sourceHash, capturedAt: base.capturedAt, projectId: resolved.projectId, sessionId: resolved.sessionId, evidence: { kind: 'legacy_prompt', content: sanitized.value } }));
  }
  const observationExpected = (entity: 'observation_version' | 'observation', row: Record<string, unknown>, parent: Record<string, unknown>): ExpectedReceipt => {
    const sourceKey = String(entity === 'observation' ? row.id : row.observation_id);
    const sourceVersion = entity === 'observation' ? Math.max(1, Number(row.revision_count) || 1) : legacyObservationVersion(row);
    const resolved = resolveRow(row, String(parent.session_id ?? ''));
    const title = sanitizeLegacyImportContent(row.title);
    const content = sanitizeLegacyImportContent(row.content);
    const capturedAt = entity === 'observation' && Number(parent.revision_count) > 1
      ? text(parent.updated_at) ?? text(parent.created_at) ?? importedAt
      : text(row.created_at) ?? importedAt;
    const classification = classifyLegacyMemory(parent.type);
    const base = { sourceHash: hashCanonical(row), transformedHash: null, projectId: resolved.projectId, sessionId: resolved.sessionId, evidenceId: null, memoryId: null, capturedAt };
    if (parent.deleted_at !== null && parent.deleted_at !== undefined) return { ...base, disposition: 'skipped', reason: 'deleted' };
    if (resolved.conflict) return { ...base, projectId: null, disposition: 'quarantined', reason: 'project_conflict' };
    if (!resolved.projectId) return { ...base, projectId: null, disposition: 'quarantined', reason: quarantineReason(resolved.mapping) };
    if (!classification) return { ...base, disposition: 'quarantined', reason: 'unsupported_kind' };
    if (title.disposition === 'quarantined') return { ...base, disposition: 'quarantined', reason: title.reason };
    if (content.disposition === 'quarantined') return { ...base, disposition: 'quarantined', reason: content.reason };
    return materialized({
      entity, sourceKey, sourceVersion, sourceHash: base.sourceHash, capturedAt, projectId: resolved.projectId, sessionId: resolved.sessionId,
      evidence: { kind: 'legacy_observation', content: content.value, legacyKind: classification.legacyKind },
      memory: { kind: classification.kind, title: title.value, content: content.value, topicKey: text(parent.topic_key), outcome: classification.outcome },
    });
  };
  for (const row of dataset.observationVersions) {
    const parent = observations.get(String(row.observation_id));
    receipts.set(['observation_version', String(row.observation_id), String(legacyObservationVersion(row))].join(KEY_SEPARATOR), parent
      ? observationExpected('observation_version', row, parent)
      : { sourceHash: hashCanonical(row), transformedHash: null, disposition: 'quarantined', reason: 'unsupported_kind', projectId: null, sessionId: null, evidenceId: null, memoryId: null, capturedAt: text(row.created_at) ?? importedAt });
  }
  for (const row of dataset.observations) receipts.set(
    ['observation', String(row.id), String(Math.max(1, Number(row.revision_count) || 1))].join(KEY_SEPARATOR),
    observationExpected('observation', row, row),
  );
  return receipts;
}

function verifyTemporalLineage(database: Database.Database, importId: string): boolean {
  const memories = database.prepare('SELECT id,project_id,topic_key,status,valid_from,invalid_at,supersedes_id FROM memories').all() as Array<{ id: string; project_id: string; topic_key: string | null; status: string; valid_from: string; invalid_at: string | null; supersedes_id: string | null }>;
  const byId = new Map(memories.map((memory) => [memory.id, memory]));
  const imported = importedMemoryIds(database, importId);
  const successors = new Map<string, typeof memories>();
  for (const memory of memories) if (memory.supersedes_id) successors.set(memory.supersedes_id, [...(successors.get(memory.supersedes_id) ?? []), memory]);
  if ([...successors.values()].some((items) => items.length > 1)) return false;
  for (const memory of memories) {
    const seen = new Set<string>();
    let cursor: typeof memory | undefined = memory;
    while (cursor?.supersedes_id) {
      if (seen.has(cursor.id)) return false;
      seen.add(cursor.id);
      const predecessor = byId.get(cursor.supersedes_id);
      const importedTopicChanged = predecessor && imported.has(cursor.id) && imported.has(predecessor.id) && predecessor.topic_key !== cursor.topic_key;
      if (!predecessor || predecessor.project_id !== cursor.project_id || importedTopicChanged
        || predecessor.valid_from > cursor.valid_from || predecessor.invalid_at !== cursor.valid_from || predecessor.status !== 'superseded') return false;
      cursor = predecessor;
    }
    if (memory.status === 'current' && memory.invalid_at !== null) return false;
    if (memory.status === 'superseded') {
      const next = successors.get(memory.id);
      if (memory.invalid_at === null || next?.length !== 1 || next[0]!.valid_from !== memory.invalid_at) return false;
    }
    if (memory.status === 'historical' && memory.invalid_at === null) return false;
  }
  const topicGroups = new Map<string, number>();
  for (const memory of memories.filter((item) => item.topic_key !== null && item.status === 'current')) {
    const key = `${memory.project_id}${KEY_SEPARATOR}${memory.topic_key}`;
    topicGroups.set(key, (topicGroups.get(key) ?? 0) + 1);
  }
  return [...topicGroups.values()].every((count) => count === 1);
}

function baselinePreserved(database: Database.Database, baseline: Record<string, unknown[]>): boolean {
  const current = currentBaselineManifest(database);
  return Object.entries(baseline).every(([table, rows]) => {
    const currentRows = new Set((current[table] ?? []).map((row) => canonicalJson(row)));
    return rows.every((row) => currentRows.has(canonicalJson(row)));
  });
}

function verifyImportCohorts(database: Database.Database, importId: string): boolean {
  const importCount = Number((database.prepare('SELECT count(*) AS count FROM legacy_imports').get() as { count: number }).count);
  const cohorts = database.prepare('SELECT import_id,cohort_sequence FROM legacy_import_cohorts ORDER BY cohort_sequence,import_id').all() as Array<{ import_id: string; cohort_sequence: number }>;
  if (cohorts.length !== importCount
    || cohorts.filter((row) => row.import_id === importId).length !== 1
    || cohorts.some((row, index) => row.cohort_sequence !== index + 1)
    || new Set(cohorts.map((row) => row.import_id)).size !== cohorts.length) return false;

  const importedMembership = database.prepare(`
    SELECT lir.memory_id,min(lic.cohort_sequence) AS cohort_sequence
    FROM legacy_import_rows lir
    JOIN legacy_import_cohorts lic ON lic.import_id=lir.import_id
    WHERE lir.disposition='imported' AND lir.memory_id IS NOT NULL
    GROUP BY lir.memory_id
  `).all() as Array<{ memory_id: string; cohort_sequence: number }>;
  const importedIds = new Set(importedMembership.map((row) => row.memory_id));
  const expectedImportedIds = new Set((database.prepare("SELECT DISTINCT memory_id FROM legacy_import_rows WHERE disposition='imported' AND memory_id IS NOT NULL").all() as Array<{ memory_id: string }>).map((row) => row.memory_id));
  return importedMembership.every((row) => Number.isInteger(row.cohort_sequence) && row.cohort_sequence > 0)
    && importedIds.size === expectedImportedIds.size
    && [...expectedImportedIds].every((memoryId) => importedIds.has(memoryId));
}

export interface CandidateVerification {
  integrity: ImportReport['integrity'];
  dispositions: Record<LegacyEntity, EntityDispositionCounts>;
  reasonCounts: Record<string, number>;
  rowDelta: ImportRowDelta;
}

export function verifyImportedDatabase(options: {
  path: string;
  plan: ImportPlan;
  importId: string;
  baseline: Record<string, unknown[]>;
  baseCounts: ImportRowDelta;
  replay?: boolean;
}): CandidateVerification {
  const database = new Database(options.path, { readonly: true, fileMustExist: true });
  try {
    database.pragma('query_only = ON');
    const revision = Number((database.prepare('SELECT max(version) AS version FROM schema_migrations').get() as { version: number }).version);
    const sqlite = (database.pragma('integrity_check') as Array<{ integrity_check: string }>).every((row) => row.integrity_check === 'ok');
    const foreignKeys = (database.pragma('foreign_key_check') as unknown[]).length === 0;
    const summary = receiptSummary(database, options.importId);
    const source = inspectLegacyForApply(options.plan.source.path);
    const receiptRows = database.prepare('SELECT source_entity,source_key,source_version,source_hash,transformed_hash,disposition,reason,project_id,session_id,evidence_id,memory_id,captured_at FROM legacy_import_rows WHERE import_id=? ORDER BY source_entity,source_key,source_version').all(options.importId) as Array<{ source_entity: LegacyEntity; source_key: string; source_version: number; source_hash: string; transformed_hash: string | null; disposition: string; reason: string; project_id: string | null; session_id: string | null; evidence_id: string | null; memory_id: string | null; captured_at: string }>;
    const importBoundary = database.prepare('SELECT created_at FROM legacy_imports WHERE id=?').get(options.importId) as { created_at: string };
    const expected = expectedReceipts(options.plan, source.dataset, importBoundary.created_at, options.baseline);
    const receiptHashesAndIds = receiptRows.every((row) => {
      const key = [row.source_entity, row.source_key, String(row.source_version)].join(KEY_SEPARATOR);
      const sourceRow = expected.get(key);
      if (!sourceRow || canonicalJson({
        sourceHash: row.source_hash,
        transformedHash: row.transformed_hash,
        disposition: row.disposition,
        reason: row.reason,
        projectId: row.project_id,
        sessionId: row.session_id,
        evidenceId: row.evidence_id,
        memoryId: row.memory_id,
        capturedAt: row.captured_at,
      }) !== canonicalJson({
        sourceHash: sourceRow.sourceHash,
        transformedHash: sourceRow.transformedHash,
        disposition: sourceRow.disposition,
        reason: sourceRow.reason,
        projectId: sourceRow.projectId,
        sessionId: sourceRow.sessionId,
        evidenceId: sourceRow.evidenceId,
        memoryId: sourceRow.memoryId,
        capturedAt: sourceRow.capturedAt,
      })) return false;
      if (row.evidence_id !== null && row.evidence_id !== stableUuid(`legacy-evidence:${options.plan.source.logicalFingerprint}:${row.source_entity}:${row.source_key}:${row.source_version}:${row.project_id}`)) return false;
      if (row.disposition === 'imported' && row.memory_id !== null && row.memory_id !== stableUuid(`legacy-memory:${options.plan.source.logicalFingerprint}:${row.source_entity}:${row.source_key}:${row.source_version}:${row.project_id}`)) return false;
      if (row.source_entity === 'session' && row.disposition === 'imported' && row.session_id !== importedSessionId(options.plan.source.logicalFingerprint, row.project_id!, row.source_key)) return false;
      if ((row.disposition === 'skipped' || row.disposition === 'quarantined') && (row.transformed_hash !== null || row.evidence_id !== null || row.memory_id !== null)) return false;
      if (row.disposition === 'imported') {
        if (row.source_entity === 'session' && (row.session_id === null || row.evidence_id !== null || row.memory_id !== null)) return false;
        if (row.source_entity === 'prompt' && (row.evidence_id === null || row.memory_id !== null)) return false;
        if (row.source_entity !== 'session' && row.source_entity !== 'prompt' && (row.evidence_id === null || row.memory_id === null)) return false;
      }
      if (row.disposition === 'linked' && (row.evidence_id === null || row.memory_id === null || row.source_entity === 'session' || row.source_entity === 'prompt')) return false;
      if (row.source_entity === 'session' && row.disposition === 'imported') {
        const session = database.prepare('SELECT project_id,root_session_key,harness,state,started_at,ended_at,next_event_sequence FROM sessions WHERE id=?').get(row.session_id) as Record<string, unknown> | undefined;
        const expectedSession = { project_id: row.project_id, root_session_key: sourceRow.session!.rootKey, harness: 'import', state: sourceRow.session!.endedAt ? 'ended' : 'active', started_at: sourceRow.session!.startedAt, ended_at: sourceRow.session!.endedAt, next_event_sequence: 0 };
        if (canonicalJson(session) !== canonicalJson(expectedSession)
          || row.transformed_hash !== hashCanonical({ projectId: row.project_id, sessionId: row.session_id, startedAt: sourceRow.session!.startedAt, endedAt: sourceRow.session!.endedAt })) return false;
      }
      if (row.evidence_id !== null) {
        const evidence = database.prepare('SELECT project_id,session_id,kind,content,content_hash,source_ref,captured_at,metadata_json FROM evidence WHERE id=?').get(row.evidence_id) as Record<string, unknown> | undefined;
        const expectedEvidence = sourceRow.evidence;
        if (!expectedEvidence || canonicalJson(evidence) !== canonicalJson({
          project_id: row.project_id, session_id: row.session_id, kind: expectedEvidence.kind, content: expectedEvidence.content,
          content_hash: hashContent(expectedEvidence.content), source_ref: `${row.source_entity}:${row.source_key}:${row.source_version}`,
          captured_at: row.captured_at,
          metadata_json: canonicalJson({
            schema: 'thoth-mem.legacy-import-evidence.v1', import_id: options.importId, source_entity: row.source_entity,
            source_key: row.source_key, source_version: row.source_version,
            ...(expectedEvidence.legacyKind ? { legacy_kind: expectedEvidence.legacyKind } : {}),
          }),
        })) return false;
      }
      if (row.memory_id !== null) {
        const memory = database.prepare('SELECT project_id,topic_key,kind,title,content,outcome,status,valid_from,invalid_at,supersedes_id,created_at FROM memories WHERE id=?').get(row.memory_id) as Record<string, unknown> | undefined;
        if (!sourceRow.memory || !memory || memory.project_id !== row.project_id || memory.topic_key !== sourceRow.memory.topicKey || memory.kind !== sourceRow.memory.kind
          || memory.title !== sourceRow.memory.title || memory.content !== sourceRow.memory.content || memory.outcome !== sourceRow.memory.outcome) return false;
        if (row.disposition === 'imported' && (memory.valid_from !== row.captured_at || memory.created_at !== row.captured_at)) return false;
        if (row.transformed_hash !== hashCanonical(sourceRow.memory)) return false;
        if (row.evidence_id === null) return false;
        const support = database.prepare("SELECT count(*) AS count FROM memory_evidence WHERE memory_id=? AND evidence_id=? AND relation='supports'").get(row.memory_id, row.evidence_id) as { count: number };
        if (support.count !== 1) return false;
      } else if (row.source_entity === 'prompt' && row.disposition === 'imported') {
        if (!sourceRow.evidence || row.transformed_hash !== hashCanonical({ content: sourceRow.evidence.content })) return false;
      }
      return true;
    });
    const receiptKeys = receiptRows.map((row) => [row.source_entity, row.source_key, String(row.source_version)].join(KEY_SEPARATOR)).sort();
    const mappingRows = database.prepare('SELECT source_project_hash,source_project,disposition,basis,project_id AS resolvedProjectId FROM legacy_project_mappings WHERE import_id=? ORDER BY source_project_hash').all(options.importId);
    const expectedMappings = options.plan.projectMappings.map((mapping) => ({ source_project_hash: mapping.sourceProjectHash, source_project: mapping.sourceProject, disposition: mapping.disposition, basis: mapping.basis, resolvedProjectId: mapping.resolvedProjectId }));
    const importRow = database.prepare('SELECT id,source_fingerprint,source_file_fingerprint,target_base_fingerprint,plan_hash,mapping_hash,policy_hash,source_schema,status,created_at FROM legacy_imports WHERE id=?').get(options.importId);
    const expectedImportRow = { id: options.importId, source_fingerprint: options.plan.source.logicalFingerprint, source_file_fingerprint: canonicalJson(options.plan.source.fileFingerprint), target_base_fingerprint: options.plan.target.logicalFingerprint, plan_hash: options.plan.planHash, mapping_hash: options.plan.mappingHash, policy_hash: options.plan.policy.policyHash, source_schema: options.plan.source.schema, status: 'committed', created_at: importBoundary.created_at };
    const actualDelta = subtractCounts(databaseCounts(database), options.baseCounts);
    const unique = (values: Array<string | null>): number => new Set(values.filter((value): value is string => value !== null)).size;
    const expectedDelta: ImportRowDelta = {
      projects: options.plan.projectMappings.filter((mapping) => mapping.disposition === 'isolated').length,
      sessions: receiptRows.filter((row) => row.source_entity === 'session' && row.disposition === 'imported').length,
      evidence: unique(receiptRows.map((row) => row.evidence_id)),
      memories: unique(receiptRows.filter((row) => row.disposition === 'imported').map((row) => row.memory_id)),
      memoryEvidence: unique(receiptRows.filter((row) => row.evidence_id !== null && row.memory_id !== null).map((row) => `${row.memory_id}${KEY_SEPARATOR}${row.evidence_id}`)),
      fts: unique(receiptRows.filter((row) => row.disposition === 'imported').map((row) => row.memory_id)),
      receipts: options.plan.integrityExpectations.receiptCount,
    };
    const receiptClosure = canonicalJson(receiptKeys) === canonicalJson([...expected.keys()].sort())
      && receiptHashesAndIds
      && verifyImportCohorts(database, options.importId)
      && canonicalJson(importRow) === canonicalJson(expectedImportRow)
      && canonicalJson(summary.dispositions) === canonicalJson(options.plan.plannedDispositions)
      && canonicalJson(summary.reasons) === canonicalJson(options.plan.reasonCounts)
      && canonicalJson(mappingRows) === canonicalJson(expectedMappings)
      && summary.rows === options.plan.integrityExpectations.receiptCount
      && (options.replay || canonicalJson(actualDelta) === canonicalJson(expectedDelta));
    const provenance = receiptHashesAndIds;
    const temporalLineage = verifyTemporalLineage(database, options.importId);
    const memoriesForFts = database.prepare("SELECT id AS memory_id,project_id,title,content,coalesce(topic_key,'') AS topic_key FROM memories ORDER BY id").all();
    const ftsRows = database.prepare('SELECT memory_id,project_id,title,content,topic_key FROM memory_fts ORDER BY memory_id').all();
    const fts = canonicalJson(memoriesForFts) === canonicalJson(ftsRows);
    const baselineIsPreserved = baselinePreserved(database, options.baseline);
    const integrity = {
      schemaRevision: revision === SQLITE_SCHEMA_REVISION,
      baselinePreserved: baselineIsPreserved,
      receiptClosure,
      temporalLineage,
      provenance,
      foreignKeys,
      sqlite,
      fts,
      sourceUnchanged: source.logicalFingerprint === options.plan.source.logicalFingerprint && canonicalJson(source.fileFingerprint) === canonicalJson(options.plan.source.fileFingerprint),
      targetBaseUnchanged: baselineIsPreserved,
    };
    if (Object.values(integrity).some((value) => !value)) throw Object.assign(new Error(`Import integrity verification failed: ${Object.entries(integrity).filter(([, value]) => !value).map(([key]) => key).join(',')}`), { integrity });
    return { integrity, dispositions: summary.dispositions, reasonCounts: summary.reasons, rowDelta: actualDelta };
  } finally { database.close(); }
}

export function verifyCommittedReplay(path: string, plan: ImportPlan, importId: string): CandidateVerification {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  let counts: ImportRowDelta;
  let baseline: Record<string, unknown[]>;
  try {
    counts = databaseCounts(database);
    baseline = currentBaselineManifest(database);
    const imported = importedMemoryIds(database, importId);
    baseline.memories = (baseline.memories ?? []).filter((row) => !imported.has(String((row as Record<string, unknown>).id)));
  }
  finally { database.close(); }
  const verified = verifyImportedDatabase({ path, plan, importId, baseline, baseCounts: counts, replay: true });
  return { ...verified, rowDelta: { projects: 0, sessions: 0, evidence: 0, memories: 0, memoryEvidence: 0, fts: 0, receipts: 0 } };
}
