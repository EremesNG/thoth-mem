import { resolve } from 'node:path';

import Database from 'better-sqlite3';

import type { MemoryKind, MemoryOutcome, MemoryStatus } from '../contracts.js';
import { sanitizeLegacyImportContent } from '../privacy.js';
import { hashContent, stableUuid } from '../sqlite/ledger.js';
import { SQLITE_SCHEMA_REVISION } from '../sqlite/migrations.js';
import {
  type EntityDispositionCounts,
  type ImportPlan,
  type LegacyEntity,
  type ProjectMapping,
  type RowDisposition,
  type RowReason,
  canonicalJson,
  classifyLegacyMemory,
  hashCanonical,
  legacyObservationVersion,
  parseImportPlan,
} from './contracts.js';
import { currentBaselineManifest, currentLogicalFingerprint, inspectLegacyForApply } from './inspect.js';

const ENTITIES: LegacyEntity[] = ['session', 'prompt', 'session_summary', 'observation_version', 'observation'];

export interface WriteLegacyImportCandidateOptions {
  candidatePath: string;
  plan: ImportPlan;
  importedAt: string;
}

export interface LegacyCandidateWriteResult {
  importId: string;
  dispositions: Record<LegacyEntity, EntityDispositionCounts>;
  reasonCounts: Record<string, number>;
  receipts: number;
}

interface ResolvedRow {
  mapping: ProjectMapping | null;
  conflict: boolean;
  projectId: string | null;
  sessionId: string | null;
}

interface MemoryCandidate {
  entity: 'session_summary' | 'observation_version' | 'observation';
  sourceKey: string;
  sourceVersion: number;
  sourceHash: string;
  projectId: string;
  sessionId: string | null;
  kind: MemoryKind;
  outcome: MemoryOutcome;
  legacyKind?: string;
  title: string;
  content: string;
  topicKey: string | null;
  capturedAt: string;
  chainKey: string;
}

function emptyCounts(): EntityDispositionCounts { return { imported: 0, linked: 0, skipped: 0, quarantined: 0 }; }
function normalizedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC').trim();
  return normalized || null;
}
function sourceProject(row: Record<string, unknown>): string | null { return normalizedText(row.project) ?? normalizedText(row.directory); }
function timestamp(value: unknown, fallback: string): string { return normalizedText(value) ?? fallback; }
function topicKey(value: unknown): string | null { return normalizedText(value); }
function quarantineReason(mapping: ProjectMapping | null): RowReason {
  if (mapping?.basis === 'ambiguous_identity' || mapping?.basis === 'project_conflict' || mapping?.basis === 'placeholder_identity') return mapping.basis;
  return 'placeholder_identity';
}
function transformedHash(value: unknown): string { return hashCanonical(value); }
function importedSessionId(sourceFingerprint: string, projectId: string, sourceKey: string): string {
  return stableUuid(`session:${sourceFingerprint}:${projectId}:import:${sourceKey}`);
}
function importedSessionRootKey(sourceFingerprint: string, sourceKey: string): string {
  return `${sourceFingerprint}:${sourceKey}`;
}

export function writeLegacyImportCandidate(options: WriteLegacyImportCandidateOptions): LegacyCandidateWriteResult {
  const plan = parseImportPlan(options.plan);
  const candidatePath = resolve(options.candidatePath);
  if (candidatePath.toLocaleLowerCase() === resolve(plan.target.path).toLocaleLowerCase()
    || candidatePath.toLocaleLowerCase() === resolve(plan.source.path).toLocaleLowerCase()) {
    throw new Error('Import candidate must be distinct from the active target and legacy source');
  }
  if (!normalizedText(options.importedAt)) throw new Error('Import boundary timestamp is required');
  const inspected = inspectLegacyForApply(plan.source.path);
  if (inspected.logicalFingerprint !== plan.source.logicalFingerprint) throw new Error('Legacy source does not match the bound import plan');

  const database = new Database(candidatePath, { fileMustExist: true });
  try {
    database.pragma('foreign_keys = ON');
    const revision = Number((database.prepare('SELECT max(version) AS value FROM schema_migrations').get() as { value: number | null }).value);
    if (revision !== SQLITE_SCHEMA_REVISION) throw new Error('Import candidate schema revision is unsupported');
    const candidateMatchesBase = plan.target.absent
      ? Object.values(currentBaselineManifest(database)).every((rows) => rows.length === 0)
      : currentLogicalFingerprint(database) === plan.target.logicalFingerprint;
    if (!candidateMatchesBase) throw new Error('Import candidate does not match the target base');
    return database.transaction(() => writeCandidateTransaction(database, plan, inspected.dataset, options.importedAt))();
  } finally {
    database.close();
  }
}

function writeCandidateTransaction(
  database: Database.Database,
  plan: ImportPlan,
  dataset: ReturnType<typeof inspectLegacyForApply>['dataset'],
  importedAt: string,
): LegacyCandidateWriteResult {
  const importId = stableUuid(`legacy-import:${plan.planHash}`);
  const dispositions = Object.fromEntries(ENTITIES.map((entity) => [entity, emptyCounts()])) as Record<LegacyEntity, EntityDispositionCounts>;
  const reasonCounts: Record<string, number> = {};
  let receiptCount = 0;
  const mappings = new Map(plan.projectMappings.map((mapping) => [mapping.sourceProject, mapping]));
  const sessionMappings = new Map<string, ProjectMapping | null>();
  const sessionIds = new Map<string, string>();
  const targetCurrentTopics = new Set((database.prepare("SELECT project_id,topic_key FROM memories WHERE status='current' AND topic_key IS NOT NULL").all() as Array<{ project_id: string; topic_key: string }>).map((row) => `${row.project_id}\u0000${row.topic_key}`));

  for (const mapping of plan.projectMappings) {
    if (mapping.disposition !== 'isolated') continue;
    if (!mapping.resolvedProjectId || !mapping.destinationSelector) throw new Error('Isolated project mapping is incomplete');
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run(mapping.resolvedProjectId, mapping.destinationSelector, mapping.sourceProject, null, importedAt, importedAt);
  }
  database.prepare('INSERT INTO legacy_imports VALUES(?,?,?,?,?,?,?,?,?,?)').run(
    importId,
    plan.source.logicalFingerprint,
    canonicalJson(plan.source.fileFingerprint),
    plan.target.logicalFingerprint,
    plan.planHash,
    plan.mappingHash,
    plan.policy.policyHash,
    plan.source.schema,
    'committed',
    importedAt,
  );
  const cohortSequence = Number((database.prepare('SELECT coalesce(max(cohort_sequence),0)+1 AS value FROM legacy_import_cohorts').get() as { value: number }).value);
  database.prepare('INSERT INTO legacy_import_cohorts(import_id,cohort_sequence) VALUES(?,?)').run(importId, cohortSequence);
  for (const mapping of plan.projectMappings) {
    database.prepare('INSERT INTO legacy_project_mappings VALUES(?,?,?,?,?,?)').run(
      importId, mapping.sourceProjectHash, mapping.sourceProject, mapping.disposition, mapping.basis, mapping.resolvedProjectId,
    );
  }

  const recordReceipt = (input: {
    entity: LegacyEntity;
    sourceKey: string;
    sourceVersion: number;
    sourceHash: string;
    transformedHash: string | null;
    disposition: RowDisposition;
    reason: RowReason;
    projectId: string | null;
    sessionId: string | null;
    evidenceId: string | null;
    memoryId: string | null;
    capturedAt: string;
  }): void => {
    database.prepare('INSERT INTO legacy_import_rows VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      importId, input.entity, input.sourceKey, input.sourceVersion, input.sourceHash, input.transformedHash,
      input.disposition, input.reason, input.projectId, input.sessionId, input.evidenceId, input.memoryId, input.capturedAt,
    );
    dispositions[input.entity][input.disposition]++;
    reasonCounts[input.reason] = (reasonCounts[input.reason] ?? 0) + 1;
    receiptCount++;
  };

  const resolveRow = (row: Record<string, unknown>, inheritedSessionKey?: string): ResolvedRow => {
    const direct = sourceProject(row) ? mappings.get(sourceProject(row)!) ?? null : null;
    const inherited = inheritedSessionKey ? sessionMappings.get(inheritedSessionKey) ?? null : null;
    const conflict = Boolean(direct && inherited && direct.sourceProjectHash !== inherited.sourceProjectHash);
    const mapping = direct ?? inherited;
    const projectId = !conflict && mapping?.disposition !== 'quarantined' ? mapping?.resolvedProjectId ?? null : null;
    return { mapping, conflict, projectId, sessionId: inheritedSessionKey ? sessionIds.get(inheritedSessionKey) ?? null : null };
  };

  const insertEvidence = (candidate: { entity: LegacyEntity; sourceKey: string; sourceVersion: number; projectId: string; sessionId: string | null; content: string; capturedAt: string; legacyKind?: string }, kind: 'legacy_prompt' | 'legacy_observation'): string => {
    const evidenceId = stableUuid(`legacy-evidence:${plan.source.logicalFingerprint}:${candidate.entity}:${candidate.sourceKey}:${candidate.sourceVersion}:${candidate.projectId}`);
    const sourceRef = `${candidate.entity}:${candidate.sourceKey}:${candidate.sourceVersion}`;
    const metadata = canonicalJson({
      schema: 'thoth-mem.legacy-import-evidence.v1', import_id: importId, source_entity: candidate.entity,
      source_key: candidate.sourceKey, source_version: candidate.sourceVersion,
      ...(candidate.legacyKind ? { legacy_kind: candidate.legacyKind } : {}),
    });
    database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run(
      evidenceId, candidate.projectId, candidate.sessionId, kind, candidate.content, hashContent(candidate.content), sourceRef, candidate.capturedAt, metadata,
    );
    return evidenceId;
  };

  const memoryCandidates: MemoryCandidate[] = [];
  for (const row of dataset.sessions) {
    const sourceKey = String(row.id);
    const mapping = sourceProject(row) ? mappings.get(sourceProject(row)!) ?? null : null;
    sessionMappings.set(sourceKey, mapping);
    const capturedAt = timestamp(row.started_at, importedAt);
    const sourceHash = hashCanonical(row);
    let sessionId: string | null = null;
    const projectId = mapping?.disposition !== 'quarantined' ? mapping?.resolvedProjectId ?? null : null;
    if (!projectId) {
      recordReceipt({ entity: 'session', sourceKey, sourceVersion: 0, sourceHash, transformedHash: null, disposition: 'quarantined', reason: quarantineReason(mapping), projectId: null, sessionId: null, evidenceId: null, memoryId: null, capturedAt });
    } else {
      sessionId = importedSessionId(plan.source.logicalFingerprint, projectId, sourceKey);
      const endedAt = normalizedText(row.ended_at);
      database.prepare('INSERT INTO sessions(id,project_id,root_session_key,harness,state,started_at,ended_at,next_event_sequence) VALUES(?,?,?,\'import\',?,?,?,0)').run(
        sessionId, projectId, importedSessionRootKey(plan.source.logicalFingerprint, sourceKey), endedAt ? 'ended' : 'active', capturedAt, endedAt,
      );
      sessionIds.set(sourceKey, sessionId);
      recordReceipt({ entity: 'session', sourceKey, sourceVersion: 0, sourceHash, transformedHash: transformedHash({ projectId, sessionId, startedAt: capturedAt, endedAt }), disposition: 'imported', reason: 'imported', projectId, sessionId, evidenceId: null, memoryId: null, capturedAt });
    }
    if (typeof row.summary === 'string' && row.summary.trim()) {
      const summaryHash = hashCanonical({ session_id: sourceKey, summary: row.summary });
      const summaryCapturedAt = normalizedText(row.ended_at) ?? capturedAt;
      if (!projectId) {
        recordReceipt({ entity: 'session_summary', sourceKey, sourceVersion: 0, sourceHash: summaryHash, transformedHash: null, disposition: 'quarantined', reason: quarantineReason(mapping), projectId: null, sessionId: null, evidenceId: null, memoryId: null, capturedAt: summaryCapturedAt });
        continue;
      }
      const privacy = sanitizeLegacyImportContent(row.summary);
      if (privacy.disposition === 'quarantined') {
        recordReceipt({ entity: 'session_summary', sourceKey, sourceVersion: 0, sourceHash: summaryHash, transformedHash: null, disposition: 'quarantined', reason: privacy.reason, projectId, sessionId, evidenceId: null, memoryId: null, capturedAt: summaryCapturedAt });
      } else {
        memoryCandidates.push({ entity: 'session_summary', sourceKey, sourceVersion: 0, sourceHash: summaryHash, projectId, sessionId, kind: 'handoff', outcome: 'unknown', title: 'Legacy session summary', content: privacy.value, topicKey: null, capturedAt: summaryCapturedAt, chainKey: `session-summary:${sourceKey}` });
      }
    }
  }

  for (const row of dataset.prompts) {
    const sourceKey = String(row.id);
    const inheritedKey = String(row.session_id ?? '');
    const resolved = resolveRow(row, inheritedKey);
    const capturedAt = timestamp(row.created_at, importedAt);
    const sourceHash = hashCanonical(row);
    if (resolved.conflict) {
      recordReceipt({ entity: 'prompt', sourceKey, sourceVersion: 0, sourceHash, transformedHash: null, disposition: 'quarantined', reason: 'project_conflict', projectId: null, sessionId: resolved.sessionId, evidenceId: null, memoryId: null, capturedAt });
      continue;
    }
    if (!resolved.projectId) {
      recordReceipt({ entity: 'prompt', sourceKey, sourceVersion: 0, sourceHash, transformedHash: null, disposition: 'quarantined', reason: quarantineReason(resolved.mapping), projectId: null, sessionId: resolved.sessionId, evidenceId: null, memoryId: null, capturedAt });
      continue;
    }
    const privacy = sanitizeLegacyImportContent(row.content);
    if (privacy.disposition === 'quarantined') {
      recordReceipt({ entity: 'prompt', sourceKey, sourceVersion: 0, sourceHash, transformedHash: null, disposition: 'quarantined', reason: privacy.reason, projectId: resolved.projectId, sessionId: resolved.sessionId, evidenceId: null, memoryId: null, capturedAt });
      continue;
    }
    const evidenceId = insertEvidence({ entity: 'prompt', sourceKey, sourceVersion: 0, projectId: resolved.projectId, sessionId: resolved.sessionId, content: privacy.value, capturedAt }, 'legacy_prompt');
    recordReceipt({ entity: 'prompt', sourceKey, sourceVersion: 0, sourceHash, transformedHash: transformedHash({ content: privacy.value }), disposition: 'imported', reason: 'imported', projectId: resolved.projectId, sessionId: resolved.sessionId, evidenceId, memoryId: null, capturedAt });
  }

  const observations = new Map(dataset.observations.map((row) => [String(row.id), row]));
  const addObservationCandidate = (entity: 'observation_version' | 'observation', row: Record<string, unknown>, parent: Record<string, unknown>): void => {
    const sourceKey = String(entity === 'observation' ? row.id : row.observation_id);
    const sourceVersion = entity === 'observation' ? Math.max(1, Number(row.revision_count) || 1) : legacyObservationVersion(row);
    const inheritedKey = String(parent.session_id ?? '');
    const resolved = resolveRow(row, inheritedKey);
    const capturedAt = entity === 'observation' && Number(parent.revision_count) > 1
      ? timestamp(parent.updated_at, timestamp(parent.created_at, importedAt))
      : timestamp(row.created_at, importedAt);
    const sourceHash = hashCanonical(row);
    const receiptBase = { entity, sourceKey, sourceVersion, sourceHash, transformedHash: null, projectId: resolved.projectId, sessionId: resolved.sessionId, evidenceId: null, memoryId: null, capturedAt } as const;
    if (parent.deleted_at !== null && parent.deleted_at !== undefined) { recordReceipt({ ...receiptBase, disposition: 'skipped', reason: 'deleted' }); return; }
    if (resolved.conflict) { recordReceipt({ ...receiptBase, projectId: null, disposition: 'quarantined', reason: 'project_conflict' }); return; }
    if (!resolved.projectId) { recordReceipt({ ...receiptBase, projectId: null, disposition: 'quarantined', reason: quarantineReason(resolved.mapping) }); return; }
    const classification = classifyLegacyMemory(parent.type);
    if (!classification) { recordReceipt({ ...receiptBase, disposition: 'quarantined', reason: 'unsupported_kind' }); return; }
    const title = sanitizeLegacyImportContent(row.title);
    const content = sanitizeLegacyImportContent(row.content);
    if (title.disposition === 'quarantined') { recordReceipt({ ...receiptBase, disposition: 'quarantined', reason: title.reason }); return; }
    if (content.disposition === 'quarantined') { recordReceipt({ ...receiptBase, disposition: 'quarantined', reason: content.reason }); return; }
    memoryCandidates.push({
      entity, sourceKey, sourceVersion, sourceHash, projectId: resolved.projectId, sessionId: resolved.sessionId,
      kind: classification.kind, outcome: classification.outcome, legacyKind: classification.legacyKind,
      title: title.value, content: content.value, topicKey: topicKey(parent.topic_key), capturedAt,
      chainKey: topicKey(parent.topic_key) ? `topic:${topicKey(parent.topic_key)}` : `observation:${sourceKey}`,
    });
  };
  for (const row of dataset.observationVersions) {
    const parent = observations.get(String(row.observation_id));
    if (parent) addObservationCandidate('observation_version', row, parent);
    else {
      const sourceKey = String(row.observation_id);
      recordReceipt({ entity: 'observation_version', sourceKey, sourceVersion: legacyObservationVersion(row), sourceHash: hashCanonical(row), transformedHash: null, disposition: 'quarantined', reason: 'unsupported_kind', projectId: null, sessionId: null, evidenceId: null, memoryId: null, capturedAt: timestamp(row.created_at, importedAt) });
    }
  }
  for (const row of dataset.observations) addObservationCandidate('observation', row, row);

  const imported = new Map<string, { candidate: MemoryCandidate; evidenceId: string; memoryId: string }[]>();
  for (const candidate of memoryCandidates) {
    const evidenceId = insertEvidence(candidate, 'legacy_observation');
    const exactRows = database.prepare(`SELECT * FROM memories WHERE project_id=? AND kind=? AND outcome=? AND status='current' AND ${candidate.topicKey === null ? 'topic_key IS NULL' : 'topic_key=?'} ORDER BY created_at DESC,id`).all(
      ...(candidate.topicKey === null ? [candidate.projectId, candidate.kind, candidate.outcome] : [candidate.projectId, candidate.kind, candidate.outcome, candidate.topicKey]),
    ) as Array<Record<string, unknown>>;
    const exact = exactRows.find((row) => normalizedText(row.title) === candidate.title && normalizedText(row.content) === candidate.content);
    if (exact) {
      const memoryId = String(exact.id);
      database.prepare("INSERT OR IGNORE INTO memory_evidence VALUES(?,?,'supports')").run(memoryId, evidenceId);
      recordReceipt({ ...candidate, transformedHash: transformedHash({ kind: candidate.kind, title: candidate.title, content: candidate.content, topicKey: candidate.topicKey, outcome: candidate.outcome }), disposition: 'linked', reason: 'exact_existing', evidenceId, memoryId });
      continue;
    }
    const memoryId = stableUuid(`legacy-memory:${plan.source.logicalFingerprint}:${candidate.entity}:${candidate.sourceKey}:${candidate.sourceVersion}:${candidate.projectId}`);
    const groupKey = `${candidate.projectId}\u0000${candidate.chainKey}`;
    const values = imported.get(groupKey) ?? [];
    values.push({ candidate, evidenceId, memoryId });
    imported.set(groupKey, values);
  }

  for (const values of imported.values()) {
    values.sort((left, right) => left.candidate.capturedAt.localeCompare(right.candidate.capturedAt)
      || left.candidate.sourceVersion - right.candidate.sourceVersion
      || left.candidate.sourceKey.localeCompare(right.candidate.sourceKey)
      || left.candidate.entity.localeCompare(right.candidate.entity));
    const first = values[0]!;
    const collides = first.candidate.topicKey !== null && targetCurrentTopics.has(`${first.candidate.projectId}\u0000${first.candidate.topicKey}`);
    let predecessorId: string | null = null;
    for (let index = 0; index < values.length; index++) {
      const value = values[index]!;
      const next = values[index + 1];
      const last = !next;
      const status: MemoryStatus = last ? (collides ? 'historical' : 'current') : 'superseded';
      const invalidAt = next?.candidate.capturedAt ?? (collides ? importedAt : null);
      database.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(
        value.memoryId, value.candidate.projectId, value.candidate.topicKey, value.candidate.kind, value.candidate.title,
        value.candidate.content, value.candidate.outcome, status, value.candidate.capturedAt, invalidAt, predecessorId, value.candidate.capturedAt,
      );
      database.prepare("INSERT INTO memory_evidence VALUES(?,?,'supports')").run(value.memoryId, value.evidenceId);
      recordReceipt({ ...value.candidate, transformedHash: transformedHash({ kind: value.candidate.kind, title: value.candidate.title, content: value.candidate.content, topicKey: value.candidate.topicKey, outcome: value.candidate.outcome }), disposition: 'imported', reason: 'imported', evidenceId: value.evidenceId, memoryId: value.memoryId });
      predecessorId = value.memoryId;
    }
  }

  const orderedReasons = Object.fromEntries(Object.entries(reasonCounts).sort(([left], [right]) => left.localeCompare(right)));
  if (canonicalJson(dispositions) !== canonicalJson(plan.plannedDispositions)
    || canonicalJson(orderedReasons) !== canonicalJson(plan.reasonCounts)
    || receiptCount !== plan.integrityExpectations.receiptCount) {
    throw new Error('Candidate row dispositions do not reconcile with the bound import plan');
  }
  return { importId, dispositions, reasonCounts: orderedReasons, receipts: receiptCount };
}
