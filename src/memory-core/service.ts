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
  type EvidenceRecord,
  type LifecycleInput,
  type LifecycleResult,
  type MemoryRecord,
  type RecallItem,
  type RecallResult,
  type SaveMemoryInput,
  type SaveMemoryResult,
} from './contracts.js';
import { renderContinuation } from './continuation.js';
import { sanitizePrivateContent } from './privacy.js';
import { buildFtsQuery, surgicalSnippet } from './sqlite/fts.js';
import { ensureProject, ensureSession, evidenceFromRow, hashContent, memoryFromRow, now, stableUuid } from './sqlite/ledger.js';
import { migrateCurrentSchema } from './sqlite/migrations.js';
import { ProjectionRegistry } from './retrieval/projections.js';

interface ServiceOptions { databasePath: string; readonly?: boolean }
interface RecallInput { projectKey: string; query: string; mode?: 'compact' | 'context'; history?: boolean; budgetChars?: number; limit?: number; correlationId?: string }
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

export class MemoryService {
  readonly projections: ProjectionRegistry;
  private readonly database: Database.Database;
  private readonly correlationStates = new Map<string, { finalized: boolean; fullFetches: 0 | 1 }>();

  constructor(options: ServiceOptions) {
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
      if (input.eventKey) {
        const receipt = this.database.prepare('SELECT payload_hash,evidence_id,memory_id FROM save_receipts WHERE project_id=? AND event_key=?').get(projectId, input.eventKey) as { payload_hash: string; evidence_id: string; memory_id: string | null } | undefined;
        if (receipt) {
          if (receipt.payload_hash !== payloadHash) throw new Error('Save event key was reused with a different payload');
          const evidence = evidenceFromRow(this.database.prepare('SELECT * FROM evidence WHERE id=?').get(receipt.evidence_id) as Record<string, unknown>);
          const memory = receipt.memory_id ? memoryFromRow(this.database, this.database.prepare('SELECT * FROM memories WHERE id=?').get(receipt.memory_id) as Record<string, unknown>) : null;
          return { evidence, memory, projectId, sessionId: evidence.sessionId, duplicate: true };
        }
      }
      const sessionId = input.session ? ensureSession(this.database, projectId, input.session) : null;
      const at = input.evidence.capturedAt ?? now();
      if (!evidenceContent.trim()) throw new Error('Evidence content is required after privacy filtering');
      const evidenceId = input.eventKey ? stableUuid(`evidence:${projectId}:${input.eventKey}`) : randomUUID();
      this.database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run(evidenceId, projectId, sessionId, input.evidence.kind, evidenceContent, hashContent(evidenceContent), input.evidence.sourceRef ?? null, at, JSON.stringify(input.evidence.metadata ?? {}));
      const evidence = evidenceFromRow(this.database.prepare('SELECT * FROM evidence WHERE id=?').get(evidenceId) as Record<string, unknown>);
      if (!filteredMemory) { if (input.eventKey) this.database.prepare('INSERT INTO save_receipts VALUES(?,?,?,?,NULL)').run(projectId, input.eventKey, payloadHash, evidenceId); return { evidence, memory: null, projectId, sessionId, duplicate: false }; }
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
      return { evidence, memory, projectId, sessionId, duplicate: false };
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
    const project = this.database.prepare('SELECT id FROM projects WHERE identity_key=?').get(input.projectKey) as { id: string } | undefined;
    const requested = Math.max(64, Math.min(input.budgetChars ?? (input.mode === 'context' ? 4000 : 1200), 20_000));
    const correlationId = input.correlationId ?? randomUUID();
    if (!project) return { items: [], budget: measure(requested, 0, 0, 0), lanes: { lexical: 'ready', ...this.projections.effectiveStates() }, warnings: [], correlationId };
    const fts = buildFtsQuery(input.query);
    const exact = this.database.prepare(`SELECT m.*, 1000 AS raw_score, 'structured' AS lane FROM memories m WHERE m.project_id=? AND (m.id=? OR m.topic_key=?) ${input.history ? '' : "AND m.status='current'"} ORDER BY m.created_at DESC LIMIT ?`).all(project.id, input.query, input.query, input.limit ?? 10) as Array<Record<string, unknown>>;
    const lexical = fts ? this.database.prepare(`SELECT m.*, -bm25(memory_fts) AS raw_score, 'lexical' AS lane FROM memory_fts JOIN memories m ON m.id=memory_fts.memory_id WHERE memory_fts MATCH ? AND m.project_id=? ${input.history ? '' : "AND m.status='current'"} ORDER BY raw_score DESC,m.created_at DESC,m.id ASC LIMIT ?`).all(fts, project.id, input.limit ?? 10) as Array<Record<string, unknown>> : [];
    const unique = new Map<string, Record<string, unknown>>();
    for (const row of [...exact, ...lexical]) if (!unique.has(String(row.id))) unique.set(String(row.id), row);
    const rows = [...unique.values()].sort((a, b) => Number(b.raw_score) - Number(a.raw_score) || String(b.created_at).localeCompare(String(a.created_at)) || String(a.id).localeCompare(String(b.id))).slice(0, input.limit ?? 10);
    const sourceChars = rows.reduce((sum, row) => sum + String(row.content).length, 0);
    const evidenceChars = rows.reduce((sum, row) => sum + Number((this.database.prepare('SELECT coalesce(sum(length(e.content)),0) AS value FROM memory_evidence me JOIN evidence e ON e.id=me.evidence_id WHERE me.memory_id=?').get(row.id) as { value: number }).value), 0);
    let remaining = requested;
    const items: RecallItem[] = [];
    for (const row of rows) {
      if (remaining < 32) break;
      const record = memoryFromRow(this.database, row);
      const allowance = Math.min(remaining, input.mode === 'context' ? 1000 : 240);
      const snippet = surgicalSnippet(record.content, input.query, allowance);
      remaining -= snippet.length;
      items.push({ id: record.id, title: record.title, kind: record.kind, topicKey: record.topicKey, outcome: record.outcome, status: record.status, snippet, ...(input.mode === 'context' ? { content: snippet } : {}), score: Number(row.raw_score) + (record.status === 'current' ? 1 : 0) + (record.outcome === 'failed' ? -0.25 : 0), scoreComponents: { exact: row.lane === 'structured' ? 1 : 0, lexical: Number(row.raw_score), temporal: record.status === 'current' ? 1 : 0 }, lane: row.lane as RecallItem['lane'], evidenceIds: record.evidenceIds });
    }
    const returned = items.reduce((sum, item) => sum + item.snippet.length, 0);
    return { items, budget: measure(requested, sourceChars, evidenceChars, returned), lanes: { lexical: 'ready', ...this.projections.effectiveStates() }, warnings: returned < sourceChars ? ['payload_truncated'] : [], correlationId };
  }

  get(input: { id: string; history?: boolean }): { record: MemoryRecord | EvidenceRecord; lineage: MemoryRecord[] } {
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

  context(input: { projectKey: string; budgetChars?: number; correlationId?: string }): Pick<RecallResult, 'items' | 'budget' | 'lanes' | 'warnings' | 'correlationId'> {
    const requested = Math.max(64, Math.min(input.budgetChars ?? 4000, 20_000));
    const correlationId = input.correlationId ?? randomUUID();
    const lanes = { lexical: 'ready' as const, ...this.projections.effectiveStates() };
    const project = this.database.prepare('SELECT id FROM projects WHERE identity_key=?').get(input.projectKey) as { id: string } | undefined;
    if (!project) return { items: [], budget: measure(requested, 0, 0, 0), lanes, warnings: [], correlationId };

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
    const sourceChars = rows.reduce((sum, row) => sum + String(row.content).length, 0);
    let remaining = requested;
    const items: RecallItem[] = [];
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
    const evidenceChars = items.reduce((sum, item) => sum + Number((this.database.prepare('SELECT coalesce(sum(length(content)),0) AS value FROM evidence WHERE id IN (SELECT evidence_id FROM memory_evidence WHERE memory_id=?)').get(item.id) as { value: number }).value), 0);
    return { items, budget: measure(requested, sourceChars, evidenceChars, returned), lanes, warnings: returned < sourceChars ? ['payload_truncated'] : [], correlationId };
  }

  lifecycle(input: LifecycleInput): LifecycleResult {
    requireCanonicalValue('operation', LIFECYCLE_OPERATION_VALUES, input.operation);
    requireCanonicalValue('harness', HARNESS_VALUES, input.harness);
    return this.database.transaction(() => {
      const projectId = ensureProject(this.database, input.project); const sessionId = ensureSession(this.database, projectId, { rootSessionKey: input.rootSessionKey, harness: input.harness });
      const lifecycleContent = sanitizePrivateContent(input.content ?? '');
      const found = this.database.prepare('SELECT outcome,evidence_id FROM lifecycle_receipts WHERE harness=? AND project_id=? AND root_session_key=? AND event_key=? AND operation=?').get(input.harness, projectId, input.rootSessionKey, input.eventKey, input.operation) as { outcome: LifecycleResult['outcome']; evidence_id: string | null } | undefined;
      const recovery = (outcome: LifecycleResult['outcome']): NonNullable<LifecycleResult['recovery']> => {
        const briefing = this.context({ projectKey: input.project.key });
        const rendered = renderContinuation({
          rootSessionKey: input.rootSessionKey,
          projectName: input.project.name,
          items: outcome === 'confirmed' ? briefing.items : [],
        });
        const items = rendered.selectedItems;
        return {
          context: rendered.context,
          items,
          selectedMemoryIds: rendered.selectedMemoryIds,
          sources: [...new Set(items.flatMap((item) => [item.id, ...item.evidenceIds]))],
          budget: briefing.budget,
          rendering: rendered.measurements,
        };
      };
      const result = (outcome: LifecycleResult['outcome'], duplicate: boolean, evidenceId: string | null): LifecycleResult => {
        const delivered = input.operation === 'recover' || input.operation === 'guide_post_compact' ? recovery(outcome) : undefined;
        return {
          outcome,
          duplicate,
          projectId,
          sessionId,
          evidenceId,
          ...(delivered ? { recovery: delivered } : {}),
          capability: { hookExecuted: true, memoryConfirmed: outcome === 'confirmed', contextDelivered: Boolean(delivered?.selectedMemoryIds.length), modelConsumed: false },
        };
      };
      if (found) return result(found.outcome, true, found.evidence_id);
      if (input.operation === 'guide_post_compact') {
        const state = (this.database.prepare('SELECT state FROM sessions WHERE id=?').get(sessionId) as { state: string }).state;
        if (state !== 'compacted') { this.database.prepare('INSERT INTO lifecycle_receipts VALUES(?,?,?,?,?,?,?,?,?,?)').run(input.harness, projectId, input.rootSessionKey, input.eventKey, input.operation, hashContent(''), 'degraded', null, 'precompact_unconfirmed', null); return result('degraded', false, null); }
      }
      const outcome = input.identityConfidence === 'degraded' ? 'degraded' : 'confirmed';
      let evidenceId: string | null = null;
      if (outcome === 'confirmed' && (input.operation === 'capture_root' || input.operation === 'checkpoint_pre_compact') && lifecycleContent.trim()) { const checkpoint = input.operation === 'checkpoint_pre_compact'; const saved = this.save({ project: input.project, session: { rootSessionKey: input.rootSessionKey, harness: input.harness }, eventKey: `lifecycle:${input.harness}:${input.rootSessionKey}:${input.eventKey}`, evidence: { kind: checkpoint ? 'checkpoint' : 'root_prompt', content: lifecycleContent }, ...(checkpoint ? { memory: { kind: 'handoff', title: 'Pre-compaction checkpoint', content: lifecycleContent, topicKey: `session/${sessionId}/checkpoint` } } : {}) }); evidenceId = saved.evidence.id; }
      if (input.operation === 'finalize') this.database.prepare("UPDATE sessions SET state='ended',ended_at=? WHERE id=?").run(now(), sessionId);
      if (input.operation === 'checkpoint_pre_compact') this.database.prepare("UPDATE sessions SET state='compacted' WHERE id=?").run(sessionId);
      this.database.prepare('INSERT INTO lifecycle_receipts VALUES(?,?,?,?,?,?,?,?,?,?)').run(input.harness, projectId, input.rootSessionKey, input.eventKey, input.operation, hashContent(lifecycleContent), outcome, outcome === 'confirmed' ? now() : null, outcome === 'degraded' ? 'identity_unconfirmed' : null, evidenceId);
      return result(outcome, false, evidenceId);
    })();
  }
}
