import { randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';

import {
  EVIDENCE_KIND_VALUES,
  HARNESS_VALUES,
  LIFECYCLE_OPERATION_VALUES,
  MEMORY_KIND_VALUES,
  MEMORY_OUTCOME_VALUES,
  requireCanonicalValue,
  type BudgetMeasurement,
  type ContextResult,
  type EvidenceRecord,
  type LifecycleInput,
  type LifecycleResult,
  type MemoryRecord,
  type RecallItem,
  type RecallResult,
  type SaveMemoryInput,
  type SaveMemoryResult,
  type SessionEventInput,
  type SessionSummaryRecord,
  type SummaryContextItem,
} from './contracts.js';
import { renderContinuation } from './continuation.js';
import { sanitizePrivateContent } from './privacy.js';
import { canonicalizeSessionSummary, insertSessionSummaryProjection, sessionSummaryFromId } from './session-summaries.js';
import { DEFAULT_LEXICAL_QUERY_STRATEGY, buildFtsQueryPlan, surgicalSnippet, surgicalSnippetWithMetrics, type LexicalQueryStrategyId } from './sqlite/fts.js';
import { appendSessionEvent, ensureProject, ensureSession, eventForEvidence, evidenceFromRow, hashContent, hydrateMemoryRows, memoryFromRow, now, stableUuid } from './sqlite/ledger.js';
import { migrateCurrentSchema } from './sqlite/migrations.js';
import { fuseLexicalRanks } from './retrieval/rank-fusion.js';
import { ProjectionRegistry } from './retrieval/projections.js';

export type RecallDiagnosticStageKind = 'exact' | 'strict' | 'relaxed' | 'post_query';
export type RecallDiagnosticSkipReason = 'not_planned' | 'limit_satisfied' | 'empty_query' | 'project_not_found';
export interface RecallDiagnosticStage {
  kind: RecallDiagnosticStageKind;
  executed: boolean;
  elapsedMs: number;
  rows: number;
  reason?: RecallDiagnosticSkipReason;
}
export interface RecallDiagnostic {
  strategyId: LexicalQueryStrategyId;
  configHash: string | null;
  planHash: string | null;
  totalElapsedMs: number;
  stages: RecallDiagnosticStage[];
  work: {
    rankedFtsRows: number;
    fusedLexicalRows: number;
    hydratedMemoryRows: number;
    hydratedEvidenceLinks: number;
    memoryHydrationStatements: number;
    evidenceHydrationStatements: number;
    snippetTokenChecks: number;
    returnedRows: number;
    sourceChars: number;
    evidenceChars: number;
    returnedChars: number;
  };
  result: {
    requestedLimit: number;
    maxLexicalResults: number | null;
    returnedCount: number;
    budget: BudgetMeasurement;
  };
}
interface ServiceOptions { databasePath: string; readonly?: boolean; recallObserver?: (observation: RecallDiagnostic) => void }
interface RecallInput { projectKey: string; query: string; mode?: 'compact' | 'context'; history?: boolean; budgetChars?: number; limit?: number; correlationId?: string; lexicalStrategy?: LexicalQueryStrategyId }
export interface RetrievalTelemetry { stage: 'compact' | 'context' | 'full_fetch'; finalized: boolean; escalated: boolean; avoided: boolean; full_fetches: 0 | 1; avoided_full_fetches: 0 | 1 }

const MAX_CORRELATION_STATES = 1_024;

function measure(requested: number, source: number, evidence: number, returned: number): BudgetMeasurement {
  return { requestedChars: requested, returnedChars: returned, truncatedChars: Math.max(0, source - returned), sourceChars: source, evidenceChars: evidence, fullChars: source, compressionRatio: source === 0 ? 1 : returned / source, tokenBasis: 'estimated_chars_div_4' };
}
function validateEvidenceKind(value: unknown): void { requireCanonicalValue('evidence.kind', EVIDENCE_KIND_VALUES, value); }
function validateSaveTaxonomy(input: SaveMemoryInput): void {
  validateEvidenceKind(input.evidence.kind);
  if (input.session) requireCanonicalValue('session.harness', HARNESS_VALUES, input.session.harness);
  if (input.memory) {
    requireCanonicalValue('memory.kind', MEMORY_KIND_VALUES, input.memory.kind);
    if (input.memory.outcome !== undefined) requireCanonicalValue('memory.outcome', MEMORY_OUTCOME_VALUES, input.memory.outcome);
  }
}

function sessionEventDefaults(input: SaveMemoryInput): SessionEventInput | null {
  if (!input.session || input.session.harness === 'import' || input.evidence.kind === 'legacy_prompt' || input.evidence.kind === 'legacy_observation') return null;
  if (input.evidence.kind === 'root_prompt') return { actor: 'user', authority: 'root_user', retentionClass: 'session', privacyClass: 'standard' };
  if (input.evidence.kind === 'explicit_save') return { actor: 'agent', authority: 'root_user', retentionClass: 'project', privacyClass: 'standard' };
  if (input.evidence.kind === 'handoff') return { actor: 'agent', authority: 'harness', retentionClass: 'session', privacyClass: 'standard' };
  return { actor: 'agent', authority: 'root_user', retentionClass: 'session', privacyClass: 'standard' };
}
function isSummaryContextItem(item: ContextResult['items'][number]): item is SummaryContextItem {
  return 'recordType' in item && item.recordType === 'summary';
}

export class MemoryService {
  readonly projections: ProjectionRegistry;
  private readonly database: Database.Database;
  private readonly recallObserver?: (observation: RecallDiagnostic) => void;
  private readonly correlationStates = new Map<string, { finalized: boolean; fullFetches: 0 | 1 }>();

  constructor(options: ServiceOptions) {
    this.recallObserver = options.recallObserver;
    this.database = new Database(options.databasePath, options.readonly ? { readonly: true, fileMustExist: true } : undefined);
    try {
      if (!options.readonly) { this.database.pragma('journal_mode = WAL'); migrateCurrentSchema(this.database); }
    } catch (error) {
      this.database.close();
      throw error;
    }
    this.database.pragma('foreign_keys = ON');
    this.projections = new ProjectionRegistry(this.database);
  }

  close(): void { this.correlationStates.clear(); this.database.close(); }

  retrievalTelemetry(correlationId: string, stage: RetrievalTelemetry['stage'], finalizeAnswer = false): RetrievalTelemetry {
    const previous = this.correlationStates.get(correlationId) ?? { finalized: false, fullFetches: 0 as const };
    const fullFetches = stage === 'full_fetch' ? 1 : previous.fullFetches;
    const finalized = stage === 'full_fetch' || finalizeAnswer || previous.finalized;
    this.correlationStates.delete(correlationId);
    if (this.correlationStates.size >= MAX_CORRELATION_STATES) this.correlationStates.delete(this.correlationStates.keys().next().value!);
    this.correlationStates.set(correlationId, { finalized, fullFetches });
    const avoided = finalized && fullFetches === 0;
    return { stage, finalized, escalated: fullFetches === 1, avoided, full_fetches: fullFetches, avoided_full_fetches: avoided ? 1 : 0 };
  }

  listProjects(): Array<{ id: string; key: string; name: string }> {
    return (this.database.prepare('SELECT id,identity_key,display_name FROM projects ORDER BY display_name,identity_key').all() as Array<{ id: string; identity_key: string; display_name: string }>).map((row) => ({ id: row.id, key: row.identity_key, name: row.display_name }));
  }

  save(input: SaveMemoryInput): SaveMemoryResult {
    validateSaveTaxonomy(input);
    return this.database.transaction(() => {
      const projectId = ensureProject(this.database, input.project);
      const evidenceContent = sanitizePrivateContent(input.evidence.content);
      const filteredMemory = input.memory ? {
        ...input.memory,
        title: sanitizePrivateContent(input.memory.title),
        content: sanitizePrivateContent(input.memory.content),
      } : null;
      const payloadHash = hashContent(JSON.stringify({
        evidence: { ...input.evidence, content: evidenceContent },
        memory: filteredMemory,
      }));
      const sessionId = input.session ? ensureSession(this.database, projectId, input.session) : null;
      if (input.eventKey) {
        const receipt = this.database.prepare('SELECT payload_hash,evidence_id,memory_id FROM save_receipts WHERE project_id=? AND event_key=?').get(projectId, input.eventKey) as { payload_hash: string; evidence_id: string; memory_id: string | null } | undefined;
        if (receipt) {
          const evidence = evidenceFromRow(this.database.prepare('SELECT * FROM evidence WHERE id=?').get(receipt.evidence_id) as Record<string, unknown>);
          if (evidence.sessionId !== sessionId) throw new Error('Save event key was reused with a different session identity');
          if (receipt.payload_hash !== payloadHash) throw new Error('Save event key was reused with a different payload');
          const memory = receipt.memory_id ? memoryFromRow(this.database, this.database.prepare('SELECT * FROM memories WHERE id=?').get(receipt.memory_id) as Record<string, unknown>) : null;
          return { evidence, memory, event: eventForEvidence(this.database, evidence.id), projectId, sessionId: evidence.sessionId, duplicate: true };
        }
      }
      const at = input.evidence.capturedAt ?? now();
      if (!evidenceContent.trim()) throw new Error('Evidence content is required after privacy filtering');
      const evidenceId = input.eventKey ? stableUuid(`evidence:${projectId}:${input.eventKey}`) : randomUUID();
      this.database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run(evidenceId, projectId, sessionId, input.evidence.kind, evidenceContent, hashContent(evidenceContent), input.evidence.sourceRef ?? null, at, JSON.stringify(input.evidence.metadata ?? {}));
      const evidence = evidenceFromRow(this.database.prepare('SELECT * FROM evidence WHERE id=?').get(evidenceId) as Record<string, unknown>);
      const eventDefaults = sessionEventDefaults(input);
      const event = sessionId && eventDefaults ? appendSessionEvent(this.database, sessionId, evidenceId, eventDefaults) : null;
      if (!filteredMemory) { if (input.eventKey) this.database.prepare('INSERT INTO save_receipts VALUES(?,?,?,?,NULL)').run(projectId, input.eventKey, payloadHash, evidenceId); return { evidence, memory: null, event, projectId, sessionId, duplicate: false }; }
      if (!filteredMemory.title.trim() || !filteredMemory.content.trim()) throw new Error('Promoted memory title and content are required');
      let supersedesId = filteredMemory.supersedesId ?? null;
      if (!supersedesId && filteredMemory.topicKey) {
        supersedesId = (this.database.prepare("SELECT id FROM memories WHERE project_id=? AND topic_key=? AND status='current'").get(projectId, filteredMemory.topicKey) as { id: string } | undefined)?.id ?? null;
      }
      if (supersedesId) {
        const changed = this.database.prepare("UPDATE memories SET status='superseded',invalid_at=? WHERE id=? AND project_id=? AND status='current'").run(at, supersedesId, projectId);
        if (changed.changes !== 1) throw new Error('Superseded memory is not current in this project');
      }
      const memoryId = input.eventKey ? stableUuid(`memory:${projectId}:${input.eventKey}`) : randomUUID();
      this.database.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(memoryId, projectId, filteredMemory.topicKey ?? null, filteredMemory.kind, filteredMemory.title, filteredMemory.content, filteredMemory.outcome ?? 'unknown', 'current', at, null, supersedesId, at);
      this.database.prepare("INSERT INTO memory_evidence VALUES(?,?,'supports')").run(memoryId, evidenceId);
      if (input.eventKey) this.database.prepare('INSERT INTO save_receipts VALUES(?,?,?,?,?)').run(projectId, input.eventKey, payloadHash, evidenceId, memoryId);
      const memory = memoryFromRow(this.database, this.database.prepare('SELECT * FROM memories WHERE id=?').get(memoryId) as Record<string, unknown>);
      return { evidence, memory, event, projectId, sessionId, duplicate: false };
    })();
  }

  retract(input: { id: string; evidence: SaveMemoryInput['evidence'] }): MemoryRecord {
    validateEvidenceKind(input.evidence.kind);
    return this.database.transaction(() => {
      const row = this.database.prepare('SELECT * FROM memories WHERE id=?').get(input.id) as Record<string, unknown> | undefined;
      if (!row || row.status !== 'current') throw new Error('Memory is not current');
      const at = input.evidence.capturedAt ?? now(); const content = sanitizePrivateContent(input.evidence.content); if (!content.trim()) throw new Error('Evidence content is required after privacy filtering'); const evidenceId = randomUUID();
      this.database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run(evidenceId, row.project_id, null, input.evidence.kind, content, hashContent(content), input.evidence.sourceRef ?? null, at, JSON.stringify(input.evidence.metadata ?? {}));
      this.database.prepare("INSERT INTO memory_evidence VALUES(?,?,'contradicts')").run(input.id, evidenceId);
      this.database.prepare("UPDATE memories SET status='retracted',invalid_at=? WHERE id=?").run(at, input.id);
      return memoryFromRow(this.database, this.database.prepare('SELECT * FROM memories WHERE id=?').get(input.id) as Record<string, unknown>);
    })();
  }

  recall(input: RecallInput): RecallResult {
    const totalStart = performance.now();
    const strategyId = input.lexicalStrategy ?? DEFAULT_LEXICAL_QUERY_STRATEGY;
    const limit = input.limit ?? 10;
    const plan = buildFtsQueryPlan(input.query, strategyId);
    const stages: RecallDiagnosticStage[] = [];
    const exactStart = performance.now();
    const project = this.database.prepare('SELECT id FROM projects WHERE identity_key=?').get(input.projectKey) as { id: string } | undefined;
    const requested = Math.max(64, Math.min(input.budgetChars ?? (input.mode === 'context' ? 4000 : 1200), 20_000));
    const correlationId = input.correlationId ?? randomUUID();
    if (!project) {
      stages.push({ kind: 'exact', executed: true, elapsedMs: performance.now() - exactStart, rows: 0 });
      stages.push({ kind: 'strict', executed: false, elapsedMs: 0, rows: 0, reason: 'project_not_found' });
      stages.push({ kind: 'relaxed', executed: false, elapsedMs: 0, rows: 0, reason: 'project_not_found' });
      stages.push({ kind: 'post_query', executed: false, elapsedMs: 0, rows: 0, reason: 'project_not_found' });
      const result = { items: [], budget: measure(requested, 0, 0, 0), lanes: { lexical: 'ready' as const, ...this.projections.effectiveStates() }, warnings: [], correlationId };
      this.recallObserver?.({ strategyId, configHash: plan?.configHash ?? null, planHash: plan?.planHash ?? null, totalElapsedMs: performance.now() - totalStart, stages, work: { rankedFtsRows: 0, fusedLexicalRows: 0, hydratedMemoryRows: 0, hydratedEvidenceLinks: 0, memoryHydrationStatements: 0, evidenceHydrationStatements: 0, snippetTokenChecks: 0, returnedRows: 0, sourceChars: 0, evidenceChars: 0, returnedChars: 0 }, result: { requestedLimit: limit, maxLexicalResults: plan?.maxLexicalResults ?? null, returnedCount: 0, budget: result.budget } });
      return result;
    }
    const exact = this.database.prepare(`SELECT m.id,m.created_at,1000 AS raw_score,'structured' AS lane FROM memories m WHERE m.project_id=? AND (m.id=? OR m.topic_key=?) ${input.history ? '' : "AND m.status='current'"} ORDER BY m.created_at DESC,m.id ASC LIMIT ?`).all(project.id, input.query, input.query, limit) as Array<Record<string, unknown>>;
    stages.push({ kind: 'exact', executed: true, elapsedMs: performance.now() - exactStart, rows: exact.length });
    const unique = new Map<string, Record<string, unknown>>();
    for (const row of exact) {
      if (unique.size === limit) break;
      unique.set(String(row.id), row);
    }
    let rankedFtsRows = 0;
    if (plan?.fusion) {
      const exactIds = [...unique.keys()];
      const lexicalLists = new Map<'strict' | 'relaxed', Array<Record<string, unknown>>>();
      for (const kind of ['strict', 'relaxed'] as const) {
        const stage = plan.stages.find((candidate) => candidate.kind === kind);
        if (!stage) {
          stages.push({ kind, executed: false, elapsedMs: 0, rows: 0, reason: 'not_planned' });
          continue;
        }
        if (unique.size === limit) {
          stages.push({ kind, executed: false, elapsedMs: 0, rows: 0, reason: 'limit_satisfied' });
          continue;
        }
        const stageStart = performance.now();
        const exclusionSql = exactIds.length > 0 ? `AND m.id NOT IN (${exactIds.map(() => '?').join(',')})` : '';
        const stageLimit = Math.min(limit - unique.size, plan.maxStageResults ?? limit);
        const lexical = this.database.prepare(`SELECT m.id,m.created_at,-bm25(memory_fts) AS raw_score,'lexical' AS lane FROM memory_fts JOIN memories m ON m.id=memory_fts.memory_id WHERE memory_fts MATCH ? AND m.project_id=? ${input.history ? '' : "AND m.status='current'"} ${exclusionSql} ORDER BY raw_score DESC,m.created_at DESC,m.id ASC LIMIT ?`).all(stage.query, project.id, ...exactIds, stageLimit) as Array<Record<string, unknown>>;
        rankedFtsRows += lexical.length;
        lexicalLists.set(kind, lexical);
        stages.push({ kind, executed: true, elapsedMs: performance.now() - stageStart, rows: lexical.length });
      }

      const lexicalLimit = Math.min(limit - unique.size, plan.maxLexicalResults ?? limit);
      for (const row of fuseLexicalRanks(lexicalLists, plan.fusion, lexicalLimit)) unique.set(String(row.id), row);
    } else {
      for (const kind of ['strict', 'relaxed'] as const) {
        const stage = plan?.stages.find((candidate) => candidate.kind === kind);
        if (!stage) {
          stages.push({ kind, executed: false, elapsedMs: 0, rows: 0, reason: plan ? 'not_planned' : 'empty_query' });
          continue;
        }
        if (unique.size === limit) {
          stages.push({ kind, executed: false, elapsedMs: 0, rows: 0, reason: 'limit_satisfied' });
          continue;
        }
        const stageStart = performance.now();
        const excludedIds = [...unique.keys()];
        const exclusionSql = excludedIds.length > 0 ? `AND m.id NOT IN (${excludedIds.map(() => '?').join(',')})` : '';
        const stageLimit = Math.min(limit - unique.size, plan?.maxLexicalResults ?? limit);
        const lexical = this.database.prepare(`SELECT m.id,m.created_at,-bm25(memory_fts) AS raw_score,'lexical' AS lane FROM memory_fts JOIN memories m ON m.id=memory_fts.memory_id WHERE memory_fts MATCH ? AND m.project_id=? ${input.history ? '' : "AND m.status='current'"} ${exclusionSql} ORDER BY raw_score DESC,m.created_at DESC,m.id ASC LIMIT ?`).all(stage.query, project.id, ...excludedIds, stageLimit) as Array<Record<string, unknown>>;
        rankedFtsRows += lexical.length;
        stages.push({ kind, executed: true, elapsedMs: performance.now() - stageStart, rows: lexical.length });
        for (const row of lexical) {
          if (unique.size === limit) break;
          if (!unique.has(String(row.id))) unique.set(String(row.id), row);
        }
      }
    }
    const postStart = performance.now();
    const rankedRows = [...unique.values()];
    const fusedLexicalRows = rankedRows.filter((row) => row.lane === 'lexical').length;
    const selectedIds = rankedRows.map((row) => String(row.id));
    const selectedRows = selectedIds.length === 0
      ? []
      : this.database.prepare(`SELECT * FROM memories WHERE id IN (${selectedIds.map(() => '?').join(',')})`).all(...selectedIds) as Array<Record<string, unknown>>;
    const hydration = hydrateMemoryRows(this.database, selectedRows);
    const sourceChars = selectedRows.reduce((sum, row) => sum + String(row.content).length, 0);
    const evidenceChars = hydration.evidenceChars;
    let remaining = requested;
    const items: RecallItem[] = [];
    let snippetTokenChecks = 0;
    for (const row of rankedRows) {
      if (remaining < 32) break;
      const record = hydration.records.get(String(row.id));
      if (!record) throw new Error('Ranked memory disappeared during hydration');
      const allowance = Math.min(remaining, input.mode === 'context' ? 1000 : 240);
      const snippetResult = surgicalSnippetWithMetrics(record.content, input.query, allowance);
      const snippet = snippetResult.snippet;
      snippetTokenChecks += snippetResult.tokenChecks;
      remaining -= snippet.length;
      items.push({ id: record.id, title: record.title, kind: record.kind, topicKey: record.topicKey, outcome: record.outcome, status: record.status, snippet, ...(input.mode === 'context' ? { content: snippet } : {}), score: Number(row.raw_score) + (record.status === 'current' ? 1 : 0) + (record.outcome === 'failed' ? -0.25 : 0), scoreComponents: { exact: row.lane === 'structured' ? 1 : 0, lexical: Number(row.raw_score), temporal: record.status === 'current' ? 1 : 0 }, lane: row.lane as RecallItem['lane'], evidenceIds: record.evidenceIds });
    }
    const returned = items.reduce((sum, item) => sum + item.snippet.length, 0);
    const result = { items, budget: measure(requested, sourceChars, evidenceChars, returned), lanes: { lexical: 'ready' as const, ...this.projections.effectiveStates() }, warnings: returned < sourceChars ? ['payload_truncated'] : [], correlationId };
    stages.push({ kind: 'post_query', executed: true, elapsedMs: performance.now() - postStart, rows: rankedRows.length });
    this.recallObserver?.({
      strategyId,
      configHash: plan?.configHash ?? null,
      planHash: plan?.planHash ?? null,
      totalElapsedMs: performance.now() - totalStart,
      stages,
      work: { rankedFtsRows, fusedLexicalRows, hydratedMemoryRows: selectedRows.length, hydratedEvidenceLinks: hydration.evidenceLinks, memoryHydrationStatements: selectedRows.length > 0 ? 1 : 0, evidenceHydrationStatements: selectedRows.length > 0 ? 1 : 0, snippetTokenChecks, returnedRows: items.length, sourceChars, evidenceChars, returnedChars: returned },
      result: { requestedLimit: limit, maxLexicalResults: plan?.maxLexicalResults ?? null, returnedCount: items.length, budget: result.budget },
    });
    return result;
  }

  get(input: { id: string; history?: boolean }): { record: MemoryRecord | EvidenceRecord | SessionSummaryRecord; lineage: Array<MemoryRecord | SessionSummaryRecord> } {
    const summary = sessionSummaryFromId(this.database, input.id);
    if (summary) {
      const lineage: SessionSummaryRecord[] = [summary];
      if (input.history) {
        let id = summary.supersedesId;
        while (id) {
          const item = sessionSummaryFromId(this.database, id);
          if (!item) break;
          lineage.push(item);
          id = item.supersedesId;
        }
      }
      return { record: summary, lineage };
    }
    const memoryRow = this.database.prepare('SELECT * FROM memories WHERE id=?').get(input.id) as Record<string, unknown> | undefined;
    if (memoryRow) {
      const record = memoryFromRow(this.database, memoryRow); const lineage: MemoryRecord[] = [record];
      if (input.history) { let id = record.supersedesId; while (id) { const row = this.database.prepare('SELECT * FROM memories WHERE id=?').get(id) as Record<string, unknown> | undefined; if (!row) break; const item = memoryFromRow(this.database, row); lineage.push(item); id = item.supersedesId; } }
      return { record, lineage };
    }
    const evidenceRow = this.database.prepare('SELECT * FROM evidence WHERE id=?').get(input.id) as Record<string, unknown> | undefined;
    if (!evidenceRow) throw new Error('Memory record not found');
    return { record: evidenceFromRow(evidenceRow), lineage: [] };
  }

  projectSummaries(input: { projectKey: string; rootSessionKey?: string; harness?: LifecycleInput['harness']; history?: boolean; budgetChars?: number }): { items: SessionSummaryRecord[]; requestedChars: number; returnedChars: number; truncated: boolean } {
    if ((input.rootSessionKey && !input.harness) || (!input.rootSessionKey && input.harness)) throw new Error('root_session_key and harness must be supplied together');
    const requestedChars = Math.max(64, Math.min(input.budgetChars ?? 4_000, 20_000));
    const project = this.database.prepare('SELECT id FROM projects WHERE identity_key=?').get(input.projectKey) as { id: string } | undefined;
    if (!project) return { items: [], requestedChars, returnedChars: 0, truncated: false };
    let sessionId: string | null = null;
    if (input.rootSessionKey && input.harness) {
      sessionId = (this.database.prepare('SELECT id FROM sessions WHERE project_id=? AND root_session_key=? AND harness=?').get(project.id, input.rootSessionKey, input.harness) as { id: string } | undefined)?.id ?? null;
      if (!sessionId) return { items: [], requestedChars, returnedChars: 0, truncated: false };
    }
    const rows = this.database.prepare(`SELECT id FROM session_summaries WHERE project_id=? ${sessionId ? 'AND session_id=?' : ''} ${input.history ? '' : "AND status='current'"} ORDER BY source_sequence_to DESC,CASE kind WHEN 'final' THEN 0 ELSE 1 END,created_at DESC,id`).all(...(sessionId ? [project.id, sessionId] : [project.id])) as Array<{ id: string }>;
    const items: SessionSummaryRecord[] = [];
    let returnedChars = 0;
    for (const row of rows) {
      const record = sessionSummaryFromId(this.database, row.id)!;
      const size = JSON.stringify(record).length;
      if (returnedChars + size > requestedChars) break;
      items.push(record);
      returnedChars += size;
    }
    return { items, requestedChars, returnedChars, truncated: items.length < rows.length };
  }

  context(input: { projectKey: string; rootSessionKey?: string; harness?: LifecycleInput['harness']; budgetChars?: number; correlationId?: string }): ContextResult {
    if ((input.rootSessionKey && !input.harness) || (!input.rootSessionKey && input.harness)) throw new Error('root_session_key and harness must be supplied together');
    const requested = Math.max(64, Math.min(input.budgetChars ?? 4000, 20_000));
    const correlationId = input.correlationId ?? randomUUID();
    const lanes = { lexical: 'ready' as const, ...this.projections.effectiveStates() };
    const project = this.database.prepare('SELECT id FROM projects WHERE identity_key=?').get(input.projectKey) as { id: string } | undefined;
    if (!project) return { items: [], selectedSummaryIds: [], selectedMemoryIds: [], selectedRecordIds: [], budget: measure(requested, 0, 0, 0), lanes, warnings: [], correlationId };

    let sessionId: string | null = null;
    if (input.rootSessionKey && input.harness) {
      sessionId = (this.database.prepare('SELECT id FROM sessions WHERE project_id=? AND root_session_key=? AND harness=?').get(project.id, input.rootSessionKey, input.harness) as { id: string } | undefined)?.id ?? null;
    }

    const items: ContextResult['items'] = [];
    let remaining = requested;
    let sourceChars = 0;
    let evidenceChars = 0;
    if (sessionId) {
      const selected = this.database.prepare("SELECT id FROM session_summaries WHERE session_id=? AND status='current' ORDER BY source_sequence_to DESC,CASE kind WHEN 'final' THEN 0 ELSE 1 END,created_at DESC,id LIMIT 1").get(sessionId) as { id: string } | undefined;
      if (selected) {
        const record = sessionSummaryFromId(this.database, selected.id)!;
        const claimOrder = ['objective', 'completed', 'decision', 'verification', 'changed_surface', 'pending', 'blocker', 'next_action'] as const;
        const orderedClaims = record.claims.slice().sort((left, right) => claimOrder.indexOf(left.kind) - claimOrder.indexOf(right.kind));
        const nextActions = orderedClaims.filter((claim) => claim.kind === 'next_action');
        const selectedClaims: SummaryContextItem['claims'] = [];
        let claimChars = nextActions.reduce((sum, claim) => sum + [...claim.content].length, 0);
        if (claimChars <= Math.min(remaining, 700)) {
          for (const claim of orderedClaims) {
            if (claim.kind === 'next_action') continue;
            const size = [...claim.content].length;
            if (claimChars + size > Math.min(remaining, 700)) continue;
            selectedClaims.push({ kind: claim.kind, content: claim.content, ...(claim.outcome ? { outcome: claim.outcome } : {}) });
            claimChars += size;
          }
          selectedClaims.push(...nextActions.map((claim) => ({ kind: claim.kind, content: claim.content, ...(claim.outcome ? { outcome: claim.outcome } : {}) })));
        }
        const fullSummaryChars = record.claims.reduce((sum, claim) => sum + claim.content.length, 0);
        sourceChars += fullSummaryChars;
        evidenceChars += Number((this.database.prepare('SELECT length(content) AS value FROM evidence WHERE id=?').get(record.submissionEvidenceId) as { value: number }).value);
        const snippet = selectedClaims.map((claim) => `${claim.kind.replace('_', ' ')}: ${claim.content}`).join(' ');
        if (snippet && snippet.length <= remaining) {
          items.push({ recordType: 'summary', id: record.id, kind: record.kind, version: record.version, coverage: record.coverage, snippet, status: 'current', score: 200, submissionEvidenceId: record.submissionEvidenceId, claims: selectedClaims });
          remaining -= snippet.length;
        }
      }
    }

    const rows = this.database.prepare(`
      SELECT m.*,
        CASE
          WHEN kind='handoff' THEN 0
          WHEN kind IN ('decision','convention') THEN 1
          WHEN kind='failure' AND outcome IN ('failed','mixed') THEN 2
          WHEN kind='failure' THEN 3
          WHEN kind='project_structure' THEN 4
          ELSE 5
        END AS continuation_priority
      FROM memories m
      WHERE project_id=? AND status='current'
      ORDER BY continuation_priority,created_at DESC,id ASC
      LIMIT 20
    `).all(project.id) as Array<Record<string, unknown>>;
    sourceChars += rows.reduce((sum, row) => sum + String(row.content).length, 0);
    for (const row of rows) {
      if (remaining < 32) break;
      const record = memoryFromRow(this.database, row);
      const perItemLimit = record.kind === 'handoff'
        ? 1_200
        : record.kind === 'decision' || record.kind === 'convention' || record.kind === 'failure'
          ? 700
          : record.kind === 'project_structure' ? 500 : 400;
      const snippet = surgicalSnippet(record.content, '', Math.min(perItemLimit, remaining));
      remaining -= snippet.length;
      const priority = Number(row.continuation_priority);
      items.push({
        id: record.id,
        title: record.title,
        kind: record.kind,
        topicKey: record.topicKey,
        outcome: record.outcome,
        status: record.status,
        snippet,
        content: snippet,
        score: 100 - priority,
        scoreComponents: { exact: 0, lexical: 0, temporal: 1 },
        lane: 'structured',
        evidenceIds: record.evidenceIds,
      });
    }
    const returned = items.reduce((sum, item) => sum + item.snippet.length, 0);
    evidenceChars += items.reduce((sum, item) => sum + (isSummaryContextItem(item) ? 0 : Number((this.database.prepare('SELECT coalesce(sum(length(content)),0) AS value FROM evidence WHERE id IN (SELECT evidence_id FROM memory_evidence WHERE memory_id=?)').get(item.id) as { value: number }).value)), 0);
    const selectedSummaryIds = items.filter(isSummaryContextItem).map((item) => item.id);
    const selectedMemoryIds = items.filter((item): item is RecallItem => !isSummaryContextItem(item)).map((item) => item.id);
    return { items, selectedSummaryIds, selectedMemoryIds, selectedRecordIds: items.map((item) => item.id), budget: measure(requested, sourceChars, evidenceChars, returned), lanes, warnings: returned < sourceChars ? ['payload_truncated'] : [], correlationId };
  }

  lifecycle(input: LifecycleInput): LifecycleResult {
    requireCanonicalValue('operation', LIFECYCLE_OPERATION_VALUES, input.operation);
    requireCanonicalValue('harness', HARNESS_VALUES, input.harness);
    const canonicalSummary = input.summary ? canonicalizeSessionSummary(input.summary) : null;
    if (canonicalSummary && input.operation !== 'checkpoint_pre_compact' && input.operation !== 'finalize') throw new Error('Structured summaries are accepted only for checkpoint_pre_compact or finalize');
    if (canonicalSummary && ((input.operation === 'checkpoint_pre_compact' && canonicalSummary.input.kind !== 'checkpoint') || (input.operation === 'finalize' && canonicalSummary.input.kind !== 'final'))) throw new Error('Summary kind must match the lifecycle operation');
    if (canonicalSummary && input.identityConfidence === 'degraded') throw new Error('A verified root identity is required to submit a summary');
    return this.database.transaction(() => {
      const projectId = ensureProject(this.database, input.project); const sessionId = ensureSession(this.database, projectId, { rootSessionKey: input.rootSessionKey, harness: input.harness });
      const lifecycleContent = sanitizePrivateContent(input.content ?? '');
      const payloadHash = canonicalSummary ? hashContent(JSON.stringify({ content: lifecycleContent, summary: canonicalSummary.canonicalJson })) : hashContent(lifecycleContent);
      const found = this.database.prepare('SELECT payload_hash,outcome,evidence_id,summary_id FROM lifecycle_receipts WHERE harness=? AND project_id=? AND root_session_key=? AND event_key=? AND operation=?').get(input.harness, projectId, input.rootSessionKey, input.eventKey, input.operation) as { payload_hash: string; outcome: LifecycleResult['outcome']; evidence_id: string | null; summary_id: string | null } | undefined;
      const recovery = (outcome: LifecycleResult['outcome']): NonNullable<LifecycleResult['recovery']> => {
        const briefing = this.context({ projectKey: input.project.key, rootSessionKey: input.rootSessionKey, harness: input.harness });
        const rendered = renderContinuation({
          rootSessionKey: input.rootSessionKey,
          projectName: input.project.name,
          items: outcome === 'confirmed' ? briefing.items : [],
        });
        const items = rendered.selectedItems;
        return {
          context: rendered.context,
          items,
          selectedSummaryIds: rendered.selectedSummaryIds,
          selectedMemoryIds: rendered.selectedMemoryIds,
          selectedRecordIds: rendered.selectedRecordIds,
          sources: [...new Set(items.flatMap((item) => isSummaryContextItem(item) ? [item.id, item.submissionEvidenceId] : [item.id, ...item.evidenceIds]))],
          budget: briefing.budget,
          rendering: rendered.measurements,
        };
      };
      const result = (outcome: LifecycleResult['outcome'], duplicate: boolean, evidenceId: string | null, summaryId: string | null): LifecycleResult => {
        const delivered = input.operation === 'recover' || input.operation === 'guide_post_compact' ? recovery(outcome) : undefined;
        return {
          outcome,
          duplicate,
          projectId,
          sessionId,
          evidenceId,
          event: evidenceId ? eventForEvidence(this.database, evidenceId) : null,
          summaryId,
          ...(delivered ? { recovery: delivered } : {}),
          capability: { hookExecuted: true, memoryConfirmed: outcome === 'confirmed', contextDelivered: Boolean(delivered?.selectedRecordIds.length), modelConsumed: false },
        };
      };
      if (found) {
        if (found.payload_hash !== payloadHash) throw new Error('Lifecycle event key was reused with a different payload');
        return result(found.outcome, true, found.evidence_id, found.summary_id);
      }
      if (input.operation === 'guide_post_compact') {
        const state = (this.database.prepare('SELECT state FROM sessions WHERE id=?').get(sessionId) as { state: string }).state;
        if (state !== 'compacted') { this.database.prepare('INSERT INTO lifecycle_receipts(harness,project_id,root_session_key,event_key,operation,payload_hash,outcome,confirmed_at,diagnostic_code,evidence_id,summary_id) VALUES(?,?,?,?,?,?,?,?,?,?,NULL)').run(input.harness, projectId, input.rootSessionKey, input.eventKey, input.operation, hashContent(''), 'degraded', null, 'precompact_unconfirmed', null); return result('degraded', false, null, null); }
      }
      const outcome = input.identityConfidence === 'degraded' ? 'degraded' : 'confirmed';
      let evidenceId: string | null = null;
      let summaryId: string | null = null;
      if (outcome === 'confirmed' && (input.operation === 'capture_root' || input.operation === 'checkpoint_pre_compact') && lifecycleContent.trim()) {
        const checkpoint = input.operation === 'checkpoint_pre_compact';
        const saved = this.save({ project: input.project, session: { rootSessionKey: input.rootSessionKey, harness: input.harness }, eventKey: `lifecycle:${input.harness}:${input.rootSessionKey}:${input.eventKey}`, evidence: { kind: checkpoint ? 'checkpoint' : 'root_prompt', content: lifecycleContent } });
        evidenceId = saved.evidence.id;
      }
      if (canonicalSummary) {
        const submitted = this.save({
          project: input.project,
          session: { rootSessionKey: input.rootSessionKey, harness: input.harness },
          eventKey: `lifecycle:${input.harness}:${input.rootSessionKey}:${input.eventKey}:summary`,
          evidence: { kind: 'session_summary', content: canonicalSummary.canonicalJson },
        });
        const record = insertSessionSummaryProjection(this.database, { projectId, sessionId, submissionEvidenceId: submitted.evidence.id, summary: canonicalSummary.input, createdAt: submitted.evidence.capturedAt });
        summaryId = record.id;
        evidenceId ??= submitted.evidence.id;
      }
      if (input.operation === 'finalize') this.database.prepare("UPDATE sessions SET state='ended',ended_at=? WHERE id=?").run(now(), sessionId);
      if (input.operation === 'checkpoint_pre_compact') this.database.prepare("UPDATE sessions SET state='compacted' WHERE id=?").run(sessionId);
      this.database.prepare('INSERT INTO lifecycle_receipts(harness,project_id,root_session_key,event_key,operation,payload_hash,outcome,confirmed_at,diagnostic_code,evidence_id,summary_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(input.harness, projectId, input.rootSessionKey, input.eventKey, input.operation, payloadHash, outcome, outcome === 'confirmed' ? now() : null, outcome === 'degraded' ? 'identity_unconfirmed' : null, evidenceId, summaryId);
      return result(outcome, false, evidenceId, summaryId);
    })();
  }
}
