import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { PRAGMAS, SCHEMA_SQL } from './schema.js';
import { runMigrationsWithSemantic } from './migrations.js';
import { ThothConfig } from '../config.js';
import { loadSqliteVec } from '../retrieval/sqlite-vec.js';
import type {
  ContextInput,
  DeleteProjectResult,
  ExportData,
  ImportResult,
  MigrateProjectResult,
  Observation,
  ObservationFact,
  ObservationFactsInput,
  OperationTrace,
  OperationTraceListResult,
  ObservationVersion,
  RebuildObservationFactsInput,
  RebuildObservationFactsResult,
  SaveOperationTraceInput,
  SaveObservationInput,
  SaveResult,
  SearchInput,
  SearchResult,
  Session,
  SyncChunkV2,
  SyncChunkRecord,
  SyncChunkStatus,
  SyncEntityType,
  SyncMutation,
  SyncOperation,
  StatsResult,
  TimelineInput,
  TimelineResult,
  TopicKeySummary,
  UpdateObservationInput,
  UserPrompt,
  ObservatoryContextResponse,
  ObservatoryFrontierState,
  ObservatoryLane,
  ObservatoryLaneStateReason,
  ObservatoryLedgerResponse,
  ObservatoryMapFrontierResponse,
  ObservatoryPivotTarget,
  ObservatoryRecallHit,
  ObservatoryRecallResponse,
  ObservatoryScope,
  ObservatoryTimelineResponse,
  VizExpandRequest,
  VizFiltersResponse,
  VizHealthResponse,
  VizInspectEdgeResponse,
  VizInspectNodeResponse,
  VizNode,
  VizSliceRequest,
  VizSliceResponse,
  ListOperationTracesInput,
} from './types.js';
import { stripPrivateTags } from '../utils/privacy.js';
import { sanitizeTracePayload, sanitizeTraceText } from '../utils/trace-sanitize.js';
import { sanitizeFTS, sanitizeFTSPrefix } from '../utils/sanitize.js';
import { checkDuplicate, computeHash, incrementDuplicate } from '../utils/dedup.js';
import { formatObservationMarkdown, formatSearchResults, truncateForPreview, validateContentLength } from '../utils/content.js';
import { prepareHydeSemanticInputs } from '../retrieval/hyde.js';
import type { HydeGenerator, SemanticInput } from '../retrieval/hyde.js';
import { DEFAULT_RETRIEVAL_DEFAULTS, resolveRetrievalDefaults, scoreFromDistance, vectorToBuffer } from '../retrieval/sqlite-vec.js';
import {
  DEFAULT_LANE_ORDER,
  fuseCandidates,
  type FusionOptions,
  type HybridHit,
  type LaneCandidate,
  type RetrievalLane,
} from '../retrieval/ranking.js';
import { processNextSemanticJob, processSemanticJobs } from '../indexing/jobs.js';
import { extractKnowledgeTriples } from '../indexing/kg-extractor.js';
import type { KgLlmExtractor } from '../indexing/kg-llm-generator.js';
import type { EmbeddingProviderAdapter } from '../retrieval/providers.js';

type ObservationRow = Observation;
type OperationTraceRow = Omit<OperationTrace, 'request_truncated' | 'response_truncated'> & {
  request_truncated: number;
  response_truncated: number;
};

type SearchRow = ObservationRow & { rank: number };
type SemanticLaneName = 'chunk' | 'sentence';
type RetrievalCandidateFilters = {
  project?: string;
  session_id?: string;
  scope?: Observation['scope'];
  topic_key?: string;
  type?: Observation['type'];
  time_from?: string;
  time_to?: string;
};
type SemanticLaneReadiness = Record<SemanticLaneName, {
  pending: boolean;
  degraded: boolean;
  stale: boolean;
  ready: boolean;
}>;
type VizEdgeRow = {
  observation_id: number;
  session_id: string;
  title: string;
  type: Observation['type'];
  project: string | null;
  topic_key: string | null;
  content: string;
  relation: string;
  object: string;
};

export interface SemanticIndexProgress {
  lanes: Array<{
    lane: string;
    pending: boolean;
    degraded: boolean;
    stale: boolean;
    embeddingConfigHash: string | null;
    embeddingDimensions: number | null;
    lastReadyAt: string | null;
    updatedAt: string | null;
  }>;
  jobs: Array<{
    state: string;
    kind: string;
    count: number;
  }>;
  byKind: Array<{
    kind: string;
    total: number;
    pending: number;
    running: number;
    done: number;
    failed: number;
    oldestPendingAt: string | null;
    oldestPendingAgeMs: number | null;
  }>;
  oldestPendingAt: string | null;
  queueLagMs: number | null;
  totals: {
    total: number;
    pending: number;
    running: number;
    done: number;
    failed: number;
  };
  coverage: {
    observations: number;
    chunks: number;
    sentences: number;
    chunkVectors: number;
    sentenceVectors: number;
  };
  recentErrors: Array<{
    id: number;
    jobKey: string;
    kind: string;
    state: string;
    attemptCount: number;
    lastError: string | null;
  }>;
}

const STRUCTURED_FACT_RELATIONS = {
  what: 'HAS_WHAT',
  why: 'HAS_WHY',
  where: 'HAS_WHERE',
  learned: 'HAS_LEARNED',
} as const;

type StructuredFactKey = keyof typeof STRUCTURED_FACT_RELATIONS;

const DEFAULT_CONFIG: ThothConfig = {
  dataDir: '',
  dbPath: ':memory:',
  maxContentLength: 100_000,
  maxContextResults: 20,
  maxSearchResults: 20,
  dedupeWindowMinutes: 15,
  previewLength: 300,
  httpPort: 7438,
  httpDisabled: false,
  retrievalDefaults: DEFAULT_RETRIEVAL_DEFAULTS,
  hyde: {
    enabled: true,
    provider: 'transformers_local',
    model: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct',
    baseUrl: null,
    timeoutMs: 4000,
  },
  kgLlm: {
    enabled: false,
    provider: 'ollama',
    model: 'qwen2.5:7b-instruct',
    baseUrl: 'http://127.0.0.1:11434',
    timeoutMs: 8000,
    minContentChars: 12_000,
  },
};

const RETRIEVAL_QUERY_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'before',
  'by',
  'can',
  'do',
  'does',
  'for',
  'from',
  'how',
  'in',
  'into',
  'is',
  'it',
  'keep',
  'of',
  'on',
  'or',
  'the',
  'this',
  'to',
  'under',
  'what',
  'when',
  'where',
  'while',
  'with',
  'without',
]);

const VIZ_LIMITS = {
  maxNodesHard: 1200,
  maxEdgesHard: 3600,
  maxNodesDefault: 300,
  maxEdgesDefault: 900,
};

const OBSERVATORY_CONTEXT_TTL_MS = 1000 * 60 * 30;
const OBSERVATORY_PIVOT_TTL_MS = 1000 * 60 * 10;

export class Store {
  private db: Database.Database;
  public readonly config: ThothConfig;
  private semanticRuntime = {
    pending: true,
    degraded: false,
    stale: true,
    degradedReason: null as string | null,
  };

  constructor(dbPath: string, config?: Partial<ThothConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config, dbPath };
    this.db = new Database(dbPath);

    for (const pragma of PRAGMAS) {
      this.db.exec(pragma);
    }

    this.db.exec(SCHEMA_SQL);
    const sqliteVec = loadSqliteVec(this.db);
    const dimensions = this.config.embedding?.dimensions ?? null;
    this.semanticRuntime = {
      pending: true,
      degraded: !sqliteVec.available,
      stale: dimensions === null,
      degradedReason: sqliteVec.degradedReason,
    };
    runMigrationsWithSemantic(this.db, {
      sqliteVecReady: sqliteVec.available,
      embeddingDimensions: dimensions,
      embeddingConfigHash: this.config.embedding?.configHash ?? null,
      degradedReason: sqliteVec.degradedReason,
    });
    this.enqueueRebuildOnConfigMismatch();
    this.enqueueRebuildOnMissingSemanticCoverage();
  }

  getSemanticIndexState(): {
    pending: boolean;
    degraded: boolean;
    stale: boolean;
    degradedReason: string | null;
  } {
    return { ...this.semanticRuntime };
  }

  getSemanticIndexProgress(input: { project?: string } = {}): SemanticIndexProgress {
    const project = input.project?.trim();
    const jobWhere = project
      ? `WHERE j.observation_id IN (SELECT id FROM observations WHERE project = ? AND deleted_at IS NULL)`
      : '';
    const coverageWhere = project ? 'WHERE project = ?' : '';
    const observationWhere = project ? 'WHERE project = ? AND deleted_at IS NULL' : 'WHERE deleted_at IS NULL';
    const params = project ? [project] : [];

    const lanes = this.db.prepare(
      `SELECT lane, pending, degraded, stale, embedding_config_hash, embedding_dimensions, last_ready_at, updated_at
       FROM semantic_index_state
       ORDER BY lane`
    ).all() as Array<{
      lane: string;
      pending: number;
      degraded: number;
      stale: number;
      embedding_config_hash: string | null;
      embedding_dimensions: number | null;
      last_ready_at: string | null;
      updated_at: string | null;
    }>;

    const jobs = this.db.prepare(
      `SELECT j.state, j.kind, COUNT(*) AS count
       FROM semantic_jobs j
       ${jobWhere}
       GROUP BY j.state, j.kind
       ORDER BY j.state, j.kind`
    ).all(...params) as Array<{ state: string; kind: string; count: number }>;

    const jobKinds = this.db.prepare(
      `SELECT
         j.kind,
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN j.state = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
         COALESCE(SUM(CASE WHEN j.state = 'running' THEN 1 ELSE 0 END), 0) AS running,
         COALESCE(SUM(CASE WHEN j.state = 'done' THEN 1 ELSE 0 END), 0) AS done,
         COALESCE(SUM(CASE WHEN j.state = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
         MIN(CASE WHEN j.state = 'pending' THEN j.available_at END) AS oldest_pending_at,
         MAX(CASE WHEN j.state = 'pending' THEN CAST((julianday('now') - julianday(j.available_at)) * 86400000 AS INTEGER) END) AS oldest_pending_age_ms
       FROM semantic_jobs j
       ${jobWhere}
       GROUP BY j.kind
       ORDER BY j.kind`
    ).all(...params) as Array<{
      kind: string;
      total: number;
      pending: number;
      running: number;
      done: number;
      failed: number;
      oldest_pending_at: string | null;
      oldest_pending_age_ms: number | null;
    }>;

    const normalizeAge = (ageMs: number | null): number | null => (
      ageMs === null ? null : Math.max(0, Math.round(ageMs))
    );
    const byKind = jobKinds.map((job) => ({
      kind: job.kind,
      total: job.total,
      pending: job.pending,
      running: job.running,
      done: job.done,
      failed: job.failed,
      oldestPendingAt: job.oldest_pending_at,
      oldestPendingAgeMs: normalizeAge(job.oldest_pending_age_ms),
    }));
    const pendingKinds = byKind.filter((job) => job.oldestPendingAt !== null);
    const oldestPendingAt = pendingKinds
      .map((job) => job.oldestPendingAt)
      .filter((value): value is string => value !== null)
      .sort()[0] ?? null;
    const queueLagMs = byKind.reduce<number | null>((max, job) => {
      if (job.oldestPendingAgeMs === null) {
        return max;
      }

      return max === null ? job.oldestPendingAgeMs : Math.max(max, job.oldestPendingAgeMs);
    }, null);

    const jobCount = (state: string): number => jobs
      .filter((job) => job.state === state)
      .reduce((sum, job) => sum + job.count, 0);

    const countOne = (sql: string, values: unknown[] = []): number =>
      (this.db.prepare(sql).get(...values) as { count: number }).count;

    const recentErrors = this.db.prepare(
      `SELECT j.id, j.job_key, j.kind, j.state, j.attempt_count, j.last_error
       FROM semantic_jobs j
       ${project ? `${jobWhere} AND j.last_error IS NOT NULL` : "WHERE j.last_error IS NOT NULL"}
       ORDER BY j.updated_at DESC
       LIMIT 10`
    ).all(...params) as Array<{
      id: number;
      job_key: string;
      kind: string;
      state: string;
      attempt_count: number;
      last_error: string | null;
    }>;

    return {
      lanes: lanes.map((lane) => ({
        lane: lane.lane,
        pending: lane.pending === 1,
        degraded: lane.degraded === 1,
        stale: lane.stale === 1,
        embeddingConfigHash: lane.embedding_config_hash,
        embeddingDimensions: lane.embedding_dimensions,
        lastReadyAt: lane.last_ready_at,
        updatedAt: lane.updated_at,
      })),
      jobs,
      byKind,
      oldestPendingAt,
      queueLagMs,
      totals: {
        total: jobs.reduce((sum, job) => sum + job.count, 0),
        pending: jobCount('pending'),
        running: jobCount('running'),
        done: jobCount('done'),
        failed: jobCount('failed'),
      },
      coverage: {
        observations: countOne(`SELECT COUNT(*) AS count FROM observations ${observationWhere}`, params),
        chunks: countOne(`SELECT COUNT(*) AS count FROM semantic_chunks ${coverageWhere}`, params),
        sentences: countOne(`SELECT COUNT(*) AS count FROM semantic_sentences ${coverageWhere}`, params),
        chunkVectors: countOne(
          project
            ? `SELECT COUNT(*) AS count FROM semantic_vector_rowids v
               JOIN semantic_chunks c ON c.chunk_key = v.source_key
               WHERE v.lane = 'chunk' AND c.project = ?`
            : "SELECT COUNT(*) AS count FROM semantic_vector_rowids WHERE lane = 'chunk'",
          params,
        ),
        sentenceVectors: countOne(
          project
            ? `SELECT COUNT(*) AS count FROM semantic_vector_rowids v
               JOIN semantic_sentences s ON s.sentence_key = v.source_key
               WHERE v.lane = 'sentence' AND s.project = ?`
            : "SELECT COUNT(*) AS count FROM semantic_vector_rowids WHERE lane = 'sentence'",
          params,
        ),
      },
      recentErrors: recentErrors.map((job) => ({
        id: job.id,
        jobKey: job.job_key,
        kind: job.kind,
        state: job.state,
        attemptCount: job.attempt_count,
        lastError: job.last_error,
      })),
    };
  }

  requestSemanticRebuild(input: { reason: string }): { dedupeKey: string } {
    const dedupeKey = `rebuild:${input.reason}`;
    this.db.prepare(
      `INSERT INTO semantic_jobs (job_key, kind, state, priority)
       VALUES (?, 'rebuild_semantic', 'pending', 10)
       ON CONFLICT(job_key) DO NOTHING`
    ).run(dedupeKey);
    this.db.prepare(
      "UPDATE semantic_index_state SET pending = 1, updated_at = datetime('now') WHERE lane IN ('chunk','sentence')"
    ).run();
    this.semanticRuntime.pending = true;
    this.semanticRuntime.stale = true;
    return { dedupeKey };
  }

  enqueueManualSemanticRebuild(input: { scope?: string; reason?: string }): { dedupeKey: string } {
    const scope = input.scope?.trim() || 'global';
    const reason = input.reason?.trim() || 'manual';
    return this.requestSemanticRebuild({ reason: `${reason}:${scope}` });
  }

  planSemanticJobsForObservation(input: { observationId: number; content: string }): Array<{ kind: 'chunk' | 'sentence' }> {
    const observationExists = this.db.prepare('SELECT 1 as ok FROM observations WHERE id = ?').get(input.observationId) as { ok: number } | undefined;
    const observationId = observationExists ? input.observationId : null;
    const sourceKey = `observation:${input.observationId}`;
    this.db.prepare(
      `INSERT INTO semantic_jobs (job_key, kind, state, priority, observation_id, source_key)
       VALUES (?, 'chunk', 'pending', 50, ?, ?)
       ON CONFLICT(job_key) DO UPDATE SET
         state = 'pending',
         priority = excluded.priority,
         observation_id = excluded.observation_id,
         source_key = excluded.source_key,
         attempt_count = 0,
         last_error = NULL,
         available_at = datetime('now'),
         started_at = NULL,
         finished_at = NULL,
         updated_at = datetime('now')`
    ).run(`chunk:${input.observationId}`, observationId, sourceKey);
    this.db.prepare(
      `INSERT INTO semantic_jobs (job_key, kind, state, priority, observation_id, source_key)
       VALUES (?, 'sentence', 'pending', 60, ?, ?)
       ON CONFLICT(job_key) DO UPDATE SET
         state = 'pending',
         priority = excluded.priority,
         observation_id = excluded.observation_id,
         source_key = excluded.source_key,
         attempt_count = 0,
         last_error = NULL,
         available_at = datetime('now'),
         started_at = NULL,
         finished_at = NULL,
         updated_at = datetime('now')`
    ).run(`sentence:${input.observationId}`, observationId, sourceKey);
    this.db.prepare(
      `INSERT INTO semantic_jobs (job_key, kind, state, priority, observation_id, source_key)
       VALUES (?, 'extract_kg', 'pending', 70, ?, ?)
       ON CONFLICT(job_key) DO UPDATE SET
         state = 'pending',
         priority = excluded.priority,
         observation_id = excluded.observation_id,
         source_key = excluded.source_key,
         attempt_count = 0,
         last_error = NULL,
         available_at = datetime('now'),
         started_at = NULL,
         finished_at = NULL,
         updated_at = datetime('now')`
    ).run(`kg:${input.observationId}`, observationId, sourceKey);
    this.db.prepare(
      "UPDATE semantic_index_state SET pending = 1, updated_at = datetime('now') WHERE lane IN ('chunk','sentence')"
    ).run();
    this.semanticRuntime.pending = true;
    return [{ kind: 'chunk' }, { kind: 'sentence' }];
  }

  extractKnowledgeTriples(input: { content: string }): {
    taxonomy: { entityTypes: string[]; relationTypes: string[] };
    triples: Array<{ provenance: string; confidence: number }>;
    dedupeKey: string;
  } {
    return extractKnowledgeTriples({ content: input.content, provenance: 'store.extractKnowledgeTriples' });
  }

  async processNextSemanticJob(
    input?: { embeddingProvider?: EmbeddingProviderAdapter | null; kgLlmExtractor?: KgLlmExtractor | null }
  ): Promise<{ processed: boolean; kind?: string }> {
    const result = await processNextSemanticJob(this, input);
    this.refreshSemanticRuntimeFromState();
    return result;
  }

  async processSemanticJobs(
    input?: { embeddingProvider?: EmbeddingProviderAdapter | null; kgLlmExtractor?: KgLlmExtractor | null; limit?: number }
  ): Promise<number> {
    const processed = await processSemanticJobs(this, input);
    this.refreshSemanticRuntimeFromState();
    return processed;
  }

  assembleHybridEvidence(input: {
    sentenceHit?: { text: string; score: number };
    parentChunk?: { text: string; id: string };
    threshold?: number;
  }): {
    primary: { text: string; score: number; kind: 'sentence' };
    promotedParent?: { text: string; id: string };
  } | null {
    if (!input.sentenceHit) {
      return null;
    }

    const threshold = input.threshold ?? 0.3;
    return {
      primary: { text: input.sentenceHit.text, score: input.sentenceHit.score, kind: 'sentence' },
      promotedParent: input.sentenceHit.score >= threshold ? input.parentChunk : undefined,
    };
  }

  private refreshSemanticRuntimeFromState(): void {
    const rows = this.db.prepare(
      "SELECT pending, degraded, stale FROM semantic_index_state WHERE lane IN ('chunk','sentence')"
    ).all() as Array<{ pending: number; degraded: number; stale: number }>;
    if (rows.length === 0) return;
    this.semanticRuntime.pending = rows.some((row) => row.pending === 1);
    this.semanticRuntime.degraded = rows.some((row) => row.degraded === 1);
    this.semanticRuntime.stale = rows.some((row) => row.stale === 1);
  }

  private getSemanticLaneReadiness(): SemanticLaneReadiness {
    const rows = this.db.prepare(
      "SELECT lane, pending, degraded, stale FROM semantic_index_state WHERE lane IN ('chunk','sentence')"
    ).all() as Array<{ lane: SemanticLaneName; pending: number; degraded: number; stale: number }>;
    const defaultState = { pending: true, degraded: false, stale: true, ready: false };
    const readiness: SemanticLaneReadiness = {
      chunk: { ...defaultState },
      sentence: { ...defaultState },
    };

    for (const row of rows) {
      const pending = row.pending === 1;
      const degraded = row.degraded === 1;
      const stale = row.stale === 1;
      readiness[row.lane] = {
        pending,
        degraded,
        stale,
        ready: !pending && !degraded && !stale,
      };
    }

    return readiness;
  }

  private enqueueRebuildOnConfigMismatch(): void {
    const hash = this.config.embedding?.configHash ?? null;
    if (!hash) {
      return;
    }

    const rows = this.db.prepare(
      "SELECT lane, embedding_config_hash FROM semantic_index_state WHERE lane IN ('chunk','sentence')"
    ).all() as Array<{ lane: string; embedding_config_hash: string | null }>;

    const mismatch = rows.some((row) => row.embedding_config_hash !== hash);
    if (!mismatch) {
      return;
    }

    this.requestSemanticRebuild({ reason: `config-hash-mismatch:${hash}` });
    this.db.prepare(
      "UPDATE semantic_index_state SET stale = 1, pending = 1, updated_at = datetime('now') WHERE lane IN ('chunk','sentence')"
    ).run();
    this.db.prepare(
      "UPDATE semantic_index_state SET embedding_config_hash = ?, updated_at = datetime('now') WHERE lane IN ('chunk','sentence')"
    ).run(hash);
  }

  private enqueueRebuildOnMissingSemanticCoverage(): void {
    const activeObservations = (this.db.prepare(
      'SELECT COUNT(*) AS count FROM observations WHERE deleted_at IS NULL'
    ).get() as { count: number }).count;
    if (activeObservations === 0) {
      return;
    }

    const activeJobs = (this.db.prepare(
      `SELECT COUNT(*) AS count
       FROM semantic_jobs
       WHERE kind IN ('chunk','sentence','rebuild_semantic')
         AND state IN ('pending','running')`
    ).get() as { count: number }).count;
    if (activeJobs > 0) {
      return;
    }

    const coverage = this.db.prepare(
      `SELECT
         (SELECT COUNT(DISTINCT c.observation_id)
          FROM semantic_chunks c
          JOIN observations o ON o.id = c.observation_id
          WHERE o.deleted_at IS NULL) AS chunked,
         (SELECT COUNT(DISTINCT s.observation_id)
          FROM semantic_sentences s
          JOIN observations o ON o.id = s.observation_id
          WHERE o.deleted_at IS NULL) AS sentenced,
         (SELECT COUNT(DISTINCT v.observation_id)
          FROM semantic_vector_rowids v
          JOIN observations o ON o.id = v.observation_id
          WHERE v.lane = 'chunk' AND o.deleted_at IS NULL) AS chunk_vectors,
         (SELECT COUNT(DISTINCT v.observation_id)
          FROM semantic_vector_rowids v
          JOIN observations o ON o.id = v.observation_id
          WHERE v.lane = 'sentence' AND o.deleted_at IS NULL) AS sentence_vectors`
    ).get() as {
      chunked: number;
      sentenced: number;
      chunk_vectors: number;
      sentence_vectors: number;
    };
    const missingStructuralCoverage = coverage.chunked < activeObservations
      || coverage.sentenced < activeObservations;
    const missingVectorCoverage = this.config.embedding !== undefined && (
      coverage.chunk_vectors < activeObservations
      || coverage.sentence_vectors < activeObservations
    );

    if (!missingStructuralCoverage && !missingVectorCoverage) {
      return;
    }

    this.requestSemanticRebuild({ reason: 'missing-semantic-coverage' });
  }

  private mapObservationRow(row: ObservationRow | undefined): Observation | null {
    if (!row) {
      return null;
    }

    return row;
  }

  private mapObservationRows(rows: ObservationRow[]): Observation[] {
    return rows
      .map((row) => this.mapObservationRow(row))
      .filter((row): row is Observation => row !== null);
  }

  private recordMutation(
    operation: SyncOperation,
    entityType: SyncEntityType,
    entityId: number,
    syncId: string | null,
    project: string | null = null
  ): void {
    try {
      this.db.prepare(
        'INSERT INTO sync_mutations (operation, entity_type, entity_id, sync_id, project) VALUES (?, ?, ?, ?, ?)'
      ).run(operation, entityType, entityId, syncId, project);
    } catch (error) {
      process.stderr.write(
        `[store] Failed to record sync mutation (${operation} ${entityType}#${entityId}): ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
  }

  private mapOperationTraceRow(row: OperationTraceRow | undefined): OperationTrace | null {
    if (!row) {
      return null;
    }

    return {
      ...row,
      request_truncated: row.request_truncated === 1,
      response_truncated: row.response_truncated === 1,
    };
  }

  saveOperationTrace(input: SaveOperationTraceInput): OperationTrace {
    const now = new Date().toISOString();
    const startedAt = input.started_at ?? now;
    const finishedAt = input.finished_at ?? now;
    const fallbackDuration = Date.parse(finishedAt) - Date.parse(startedAt);
    const durationMs = Math.max(0, Math.round(
      input.duration_ms ?? (Number.isFinite(fallbackDuration) ? fallbackDuration : 0)
    ));
    const request = sanitizeTracePayload(input.request, { maxChars: input.max_payload_chars });
    const response = input.response === undefined
      ? { json: null, truncated: false }
      : sanitizeTracePayload(input.response, { maxChars: input.max_payload_chars });
    const error = input.error ? sanitizeTraceText(input.error, { maxChars: input.max_payload_chars }).json : null;
    const result = this.db.prepare(
      `INSERT INTO operation_traces (
        trace_id, origin, target, status, project, session_id, started_at, finished_at,
        duration_ms, request_json, response_json, error, request_truncated, response_truncated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.trace_id?.trim() || randomUUID(),
      input.origin,
      input.target,
      input.status,
      input.project?.trim() || null,
      input.session_id?.trim() || null,
      startedAt,
      finishedAt,
      durationMs,
      request.json,
      response.json,
      error,
      request.truncated ? 1 : 0,
      response.truncated ? 1 : 0,
    );

    const row = this.db.prepare('SELECT * FROM operation_traces WHERE id = ?')
      .get(result.lastInsertRowid) as OperationTraceRow | undefined;
    const trace = this.mapOperationTraceRow(row);
    if (!trace) {
      throw new Error('Failed to load saved operation trace');
    }
    return trace;
  }

  listOperationTraces(input: ListOperationTracesInput = {}): OperationTraceListResult {
    const where: string[] = [];
    const params: unknown[] = [];

    if (input.origin) {
      where.push('origin = ?');
      params.push(input.origin);
    }
    if (input.target) {
      where.push('target LIKE ?');
      params.push(`%${input.target}%`);
    }
    if (input.status) {
      where.push('status = ?');
      params.push(input.status);
    }
    if (input.project) {
      where.push('project = ?');
      params.push(input.project);
    }
    if (input.session_id) {
      where.push('session_id = ?');
      params.push(input.session_id);
    }
    if (input.since) {
      where.push('started_at >= ?');
      params.push(input.since);
    }
    if (input.until) {
      where.push('started_at <= ?');
      params.push(input.until);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const offset = Math.max(input.offset ?? 0, 0);
    const total = (this.db.prepare(`SELECT COUNT(*) AS count FROM operation_traces ${whereSql}`)
      .get(...params) as { count: number }).count;
    const rows = this.db.prepare(
      `SELECT *
       FROM operation_traces
       ${whereSql}
       ORDER BY started_at DESC, id DESC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as OperationTraceRow[];

    return {
      total,
      traces: rows
        .map((row) => this.mapOperationTraceRow(row))
        .filter((row): row is OperationTrace => row !== null),
    };
  }

  getOperationTrace(traceIdOrId: string | number): OperationTrace | null {
    const row = typeof traceIdOrId === 'number'
      ? this.db.prepare('SELECT * FROM operation_traces WHERE id = ?').get(traceIdOrId) as OperationTraceRow | undefined
      : this.db.prepare('SELECT * FROM operation_traces WHERE trace_id = ?').get(traceIdOrId) as OperationTraceRow | undefined;
    return this.mapOperationTraceRow(row);
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  async prepareSemanticInputs(input: {
    query: string;
    hyde?: {
      enabled?: boolean;
      mode?: 'success' | 'timeout' | 'failure';
      answer?: string;
    };
    hydeGenerator?: HydeGenerator | null;
  }): Promise<{ inputs: SemanticInput[]; degradedReason?: string }> {
    const hydeConfig = {
      enabled: input.hyde?.enabled ?? this.config.hyde?.enabled ?? false,
      provider: this.config.hyde?.provider ?? 'transformers_local' as const,
      model: this.config.hyde?.model ?? null,
      baseUrl: this.config.hyde?.baseUrl ?? null,
      timeoutMs: input.hyde?.mode === 'timeout'
        ? 1
        : this.config.hyde?.timeoutMs ?? 4000,
    };

    const mode = input.hyde?.mode;
    const generator = mode
      ? {
          generate: async (): Promise<string> => {
            if (mode === 'failure') {
              throw new Error('HyDE generation failed');
            }

            if (mode === 'timeout') {
              await new Promise((resolve) => setTimeout(resolve, 20));
              return input.hyde?.answer ?? `Hypothetical answer for ${input.query}`;
            }

            return input.hyde?.answer ?? `Hypothetical answer for ${input.query}`;
          },
        }
      : input.hydeGenerator ?? undefined;

    return prepareHydeSemanticInputs(input.query, hydeConfig, generator);
  }

  /**
   * Ensure a session exists. Idempotent — creates if new, enriches missing fields if existing.
   * Replaces empty/unknown project and null/empty directory with provided values.
   */
  ensureSession(sessionId: string, project: string, directory?: string): void {
    // Check if session already exists
    const existing = this.db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(sessionId);
    const isNew = !existing;

    this.db
      .prepare(
        `INSERT INTO sessions (id, project, directory) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           project   = CASE WHEN sessions.project = '' OR sessions.project = 'unknown' THEN excluded.project ELSE sessions.project END,
           directory = CASE WHEN sessions.directory IS NULL OR sessions.directory = '' THEN excluded.directory ELSE sessions.directory END`
      )
      .run(sessionId, project, directory ?? null);

    // Record mutation only for new sessions
    if (isNew) {
      this.recordMutation('create', 'session', 0, sessionId, project);
    }
  }

  startSession(id: string, project: string, directory?: string): Session {
    const existing = this.db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(id);
    const isNew = !existing;

    const result = this.db
      .prepare(
        `INSERT INTO sessions (id, project, directory) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            project   = CASE WHEN sessions.project = '' OR sessions.project = 'unknown' THEN excluded.project ELSE sessions.project END,
            directory = CASE WHEN sessions.directory IS NULL OR sessions.directory = '' THEN excluded.directory ELSE sessions.directory END`
      )
      .run(id, project, directory ?? null);

    // Record mutation only for newly created sessions.
    if (isNew && result.changes > 0) {
      this.recordMutation('create', 'session', 0, id, project);
    }

    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session;
  }

  endSession(id: string, summary?: string): Session | null {
    const result = this.db
      .prepare("UPDATE sessions SET ended_at = datetime('now'), summary = ? WHERE id = ? AND ended_at IS NULL")
      .run(summary ?? null, id);

    if (result.changes === 0) {
      return null;
    }

    const session = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session;

    // Record mutation for session update
    this.recordMutation('update', 'session', 0, id, session.project);

    return session;
  }

  private extractStructuredFacts(content: string): Array<{ relation: string; object: string }> {
    const facts: Array<{ relation: string; object: string }> = [];
    let currentKey: StructuredFactKey | null = null;
    let currentValue: string[] = [];

    const flush = (): void => {
      if (!currentKey) {
        return;
      }

      const object = currentValue.join('\n').trim();

      if (object.length > 0) {
        facts.push({ relation: STRUCTURED_FACT_RELATIONS[currentKey], object });
      }
    };

    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^(?:\*\*(What|Why|Where|Learned)\*\*|(What|Why|Where|Learned)):\s*(.*)$/i);

      if (match) {
        flush();
        currentKey = (match[1] ?? match[2]).toLowerCase() as StructuredFactKey;
        currentValue = [match[3] ?? ''];
        continue;
      }

      if (currentKey) {
        currentValue.push(line);
      }
    }

    flush();

    return facts;
  }

  private buildObservationFacts(observation: Observation): Array<{ relation: string; object: string }> {
    return [
      { relation: 'HAS_TYPE', object: observation.type },
      ...(observation.project ? [{ relation: 'IN_PROJECT', object: observation.project }] : []),
      ...(observation.topic_key ? [{ relation: 'HAS_TOPIC_KEY', object: observation.topic_key }] : []),
      ...this.extractStructuredFacts(observation.content),
    ];
  }

  private replaceObservationFacts(observation: Observation): { deleted: number; created: number } {
    const insert = this.db.prepare(
      `INSERT INTO observation_facts (observation_id, subject, relation, object, project, topic_key, type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const facts = this.buildObservationFacts(observation);

    return this.db.transaction(() => {
      const deleteResult = this.db.prepare('DELETE FROM observation_facts WHERE observation_id = ?').run(observation.id);

      for (const fact of facts) {
        insert.run(
          observation.id,
          observation.title,
          fact.relation,
          fact.object,
          observation.project,
          observation.topic_key,
          observation.type
        );
      }

      return { deleted: deleteResult.changes, created: facts.length };
    })();
  }

  private refreshObservationFacts(observation: Observation): void {
    this.replaceObservationFacts(observation);
  }

  private deleteSemanticArtifactsForObservation(observationId: number): void {
    const rows = this.db.prepare(
      "SELECT lane, vec_rowid FROM semantic_vector_rowids WHERE observation_id = ?"
    ).all(observationId) as Array<{ lane: SemanticLaneName; vec_rowid: number }>;
    const deleteChunkVec = this.db.prepare('DELETE FROM vec_chunks WHERE rowid = ?');
    const deleteSentenceVec = this.db.prepare('DELETE FROM vec_sentences WHERE rowid = ?');

    for (const row of rows) {
      if (row.lane === 'chunk') {
        deleteChunkVec.run(BigInt(row.vec_rowid));
      } else {
        deleteSentenceVec.run(BigInt(row.vec_rowid));
      }
    }

    this.db.prepare('DELETE FROM semantic_vector_rowids WHERE observation_id = ?').run(observationId);
    this.db.prepare('DELETE FROM semantic_sentences WHERE observation_id = ?').run(observationId);
    this.db.prepare('DELETE FROM semantic_chunks WHERE observation_id = ?').run(observationId);
  }

  private deleteKnowledgeArtifactsForObservation(observationId: number): void {
    this.db.prepare("DELETE FROM kg_triples WHERE source_type = 'observation' AND source_id = ?").run(observationId);
    this.db.prepare('DELETE FROM observation_facts WHERE observation_id = ?').run(observationId);
  }

  checkpointSession(id: string, summary?: string): Session | null {
    const result = this.db
      .prepare("UPDATE sessions SET ended_at = datetime('now'), summary = ? WHERE id = ?")
      .run(summary ?? null, id);

    if (result.changes === 0) {
      return null;
    }

    const session = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session;

    this.recordMutation('update', 'session', 0, id, session.project);

    return session;
  }

  getSession(id: string): Session | null {
    return (this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined) ?? null;
  }

  recentSessions(limit: number = 5, sessionId?: string): Session[] {
    const sql = [
      'SELECT s.*',
      'FROM sessions s',
      'WHERE EXISTS (',
      '  SELECT 1',
      '  FROM observations o',
      '  WHERE o.session_id = s.id AND o.deleted_at IS NULL',
      ')',
    ];
    const params: Array<string | number> = [];

    if (sessionId) {
      sql.push('AND s.id = ?');
      params.push(sessionId);
    }

    sql.push('ORDER BY s.started_at DESC LIMIT ?');
    params.push(limit);

    return this.db.prepare(sql.join(' ')).all(...params) as Session[];
  }

  allSessions(): Session[] {
    return this.db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all() as Session[];
  }

  getContext(input: ContextInput): string {
    const recentSessions = this.recentSessions(5, input.session_id);
    const recentPrompts = this.recentPrompts(10, input.project, input.session_id);
    const limit = input.limit || this.config.maxContextResults;

    const observationsSql = [
      'SELECT * FROM observations WHERE deleted_at IS NULL',
    ];
    const params: Array<string | number> = [];

    if (input.project) {
      observationsSql.push('AND project = ?');
      params.push(input.project);
    }

    if (input.scope) {
      observationsSql.push('AND scope = ?');
      params.push(input.scope);
    }

    if (input.session_id) {
      observationsSql.push('AND session_id = ?');
      params.push(input.session_id);
    }

    observationsSql.push('ORDER BY created_at DESC LIMIT ?');
    params.push(limit);

    const observationRows = this.db.prepare(observationsSql.join(' ')).all(...params) as ObservationRow[];
    const observations = this.mapObservationRows(observationRows);

    const sessionLines = recentSessions.map((session) => {
      const count = this.db.prepare(
        'SELECT COUNT(*) as count FROM observations WHERE session_id = ? AND deleted_at IS NULL'
      ).get(session.id) as { count: number };

      return `- **${session.project}** (${session.started_at})${session.ended_at ? ' [ended]' : ''} [${count.count} observations]`;
    }).join('\n');

    const promptLines = recentPrompts
      .map((prompt) => `- ${prompt.created_at}: ${truncateForPreview(prompt.content, 100)}`)
      .join('\n');

    const observationBlocks = observations.map((obs) => formatObservationMarkdown(obs)).join('\n\n');

    const totalSessions = this.db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
    const totalObs = this.db.prepare('SELECT COUNT(*) as count FROM observations WHERE deleted_at IS NULL').get() as { count: number };
    const projects = this.db.prepare(
      `SELECT DISTINCT project
       FROM (
         SELECT project FROM sessions WHERE project IS NOT NULL
         UNION
         SELECT project FROM observations WHERE project IS NOT NULL AND deleted_at IS NULL
       )
       WHERE project IS NOT NULL
       ORDER BY project`
    ).all() as Array<{ project: string }>;

    return [
      '## Memory from Previous Sessions',
      '',
      '### Recent Sessions',
      sessionLines || '- None',
      '',
      '### Recent Prompts',
      promptLines || '- None',
      '',
      '### Recent Observations',
      observationBlocks || 'No recent observations.',
      '',
      '---',
      `Memory stats: ${totalSessions.count} sessions, ${totalObs.count} observations across projects: ${projects.map((p) => p.project).join(', ')}`,
    ].join('\n');
  }

  getTimeline(input: TimelineInput): TimelineResult {
    const focusRow = this.db
      .prepare('SELECT * FROM observations WHERE id = ? AND deleted_at IS NULL')
      .get(input.observation_id) as ObservationRow | undefined;
    const focus = this.mapObservationRow(focusRow);

    if (!focus) {
      return { before: [], focus: null, after: [] };
    }

    const beforeLimit = input.before ?? 5;
    const afterLimit = input.after ?? 5;

    const beforeRows = (this.db.prepare(
      'SELECT * FROM observations WHERE session_id = ? AND id < ? AND deleted_at IS NULL ORDER BY id DESC LIMIT ?'
    ).all(focus.session_id, focus.id, beforeLimit) as ObservationRow[]).reverse();

    const afterRows = this.db.prepare(
      'SELECT * FROM observations WHERE session_id = ? AND id > ? AND deleted_at IS NULL ORDER BY id ASC LIMIT ?'
    ).all(focus.session_id, focus.id, afterLimit) as ObservationRow[];

    const before = this.mapObservationRows(beforeRows);
    const after = this.mapObservationRows(afterRows);

    return { before, focus, after };
  }

  savePrompt(sessionId: string, content: string, project?: string): UserPrompt {
    this.ensureSession(sessionId, project || 'unknown');

    const contentHash = computeHash(content);
    const recentPrompts = this.db.prepare(
      `SELECT *
       FROM user_prompts
       WHERE session_id = ?
         AND created_at > datetime('now', '-30 seconds')
       ORDER BY created_at DESC`
    ).all(sessionId) as UserPrompt[];

    const duplicatePrompt = recentPrompts.find((prompt) => computeHash(prompt.content) === contentHash);

    if (duplicatePrompt) {
      return duplicatePrompt;
    }

    const syncId = randomUUID();
    const result = this.db.prepare(
      'INSERT INTO user_prompts (session_id, content, project, sync_id) VALUES (?, ?, ?, ?)'
    ).run(sessionId, content, project ?? null, syncId);

    const prompt = this.db.prepare('SELECT * FROM user_prompts WHERE id = ?').get(Number(result.lastInsertRowid)) as UserPrompt | undefined;

    if (!prompt) {
      throw new Error('Failed to load created prompt');
    }

    this.recordMutation('create', 'prompt', prompt.id, prompt.sync_id, prompt.project);

    return prompt;
  }

  recentPrompts(limit: number = 10, project?: string, sessionId?: string): UserPrompt[] {
    const sql = ['SELECT * FROM user_prompts'];
    const params: Array<string | number> = [];

    if (project) {
      sql.push('WHERE project = ?');
      params.push(project);
    }

    if (sessionId) {
      sql.push(project ? 'AND session_id = ?' : 'WHERE session_id = ?');
      params.push(sessionId);
    }

    sql.push('ORDER BY created_at DESC LIMIT ?');
    params.push(limit);

    return this.db.prepare(sql.join(' ')).all(...params) as UserPrompt[];
  }

  getStats(): StatsResult {
    const totalSessions = (this.db.prepare('SELECT COUNT(*) as count FROM sessions').get() as any).count;
    const totalObservations = (this.db.prepare('SELECT COUNT(*) as count FROM observations WHERE deleted_at IS NULL').get() as any).count;
    const totalPrompts = (this.db.prepare('SELECT COUNT(*) as count FROM user_prompts').get() as any).count;
    const projectRows = this.db.prepare('SELECT DISTINCT project FROM observations WHERE project IS NOT NULL AND deleted_at IS NULL ORDER BY project').all() as { project: string }[];
    return {
      total_sessions: totalSessions,
      total_observations: totalObservations,
      total_prompts: totalPrompts,
      projects: projectRows.map(r => r.project),
    };
  }

  saveObservation(input: SaveObservationInput): SaveResult {
    const strippedTitle = stripPrivateTags(input.title);
    const strippedContent = stripPrivateTags(input.content);
    const validation = validateContentLength(strippedContent, this.config.maxContentLength);

    if (validation.warning) {
      process.stderr.write(`${validation.warning}\n`);
    }

    const sessionId = input.session_id || `manual-save-${input.project || 'unknown'}`;
    const project = input.project || 'unknown';
    const type = input.type || 'manual';
    const scope = input.scope || 'project';
    const hash = computeHash(strippedContent);

    this.ensureSession(sessionId, project);

    const duplicate = checkDuplicate(
      this.db,
      hash,
      input.project ?? null,
      scope,
      type,
      strippedTitle,
      this.config.dedupeWindowMinutes
    );

    if (duplicate.isDuplicate && duplicate.existingId !== undefined) {
      incrementDuplicate(this.db, duplicate.existingId);
      const observation = this.getObservation(duplicate.existingId);

      if (!observation) {
        throw new Error(`Failed to load deduplicated observation ${duplicate.existingId}`);
      }

      this.recordMutation('update', 'observation', observation.id, observation.sync_id, observation.project);

      return { observation, action: 'deduplicated' };
    }

    if (input.topic_key) {
      const existingRow = this.db.prepare(
        `SELECT *
         FROM observations
         WHERE topic_key = ?
           AND (project IS ? OR (project IS NULL AND ? IS NULL))
           AND scope = ?
           AND deleted_at IS NULL
         ORDER BY updated_at DESC
          LIMIT 1`
      ).get(input.topic_key, input.project ?? null, input.project ?? null, scope) as ObservationRow | undefined;

      const existing = this.mapObservationRow(existingRow);

      if (existing) {
        this.db.prepare(
          'INSERT INTO observation_versions (observation_id, title, content, type, version_number) VALUES (?, ?, ?, ?, ?)'
        ).run(existing.id, existing.title, existing.content, existing.type, existing.revision_count);

        this.db.prepare(
          "UPDATE observations SET title = ?, content = ?, type = ?, normalized_hash = ?, revision_count = revision_count + 1, updated_at = datetime('now') WHERE id = ?"
        ).run(strippedTitle, strippedContent, type, hash, existing.id);

        const observation = this.getObservation(existing.id);

        if (!observation) {
          throw new Error(`Failed to load upserted observation ${existing.id}`);
        }

        this.recordMutation('update', 'observation', observation.id, observation.sync_id, observation.project);
        this.refreshObservationFacts(observation);
        this.planSemanticJobsForObservation({ observationId: observation.id, content: observation.content });

        return { observation, action: 'upserted' };
      }
    }

    const syncId = randomUUID();
    const result = this.db.prepare(
      `INSERT INTO observations (session_id, type, title, content, project, scope, topic_key, normalized_hash, sync_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sessionId,
      type,
      strippedTitle,
      strippedContent,
      input.project ?? null,
      scope,
      input.topic_key ?? null,
      hash,
      syncId
    );

    const observation = this.getObservation(Number(result.lastInsertRowid));

    if (!observation) {
      throw new Error('Failed to load created observation');
    }

    this.recordMutation('create', 'observation', observation.id, observation.sync_id, observation.project);
    this.refreshObservationFacts(observation);
    this.planSemanticJobsForObservation({ observationId: observation.id, content: observation.content });

    return { observation, action: 'created' };
  }

  async saveObservationWithIndex(
    input: SaveObservationInput,
    options: { embeddingProvider?: EmbeddingProviderAdapter | null } = {},
  ): Promise<SaveResult> {
    const result = this.saveObservation(input);
    if (result.action !== 'deduplicated') {
      void options.embeddingProvider;
      this.refreshSemanticRuntimeFromState();
    }
    return result;
  }

  getObservation(id: number): Observation | null {
    const row = this.db.prepare('SELECT * FROM observations WHERE id = ? AND deleted_at IS NULL').get(id) as ObservationRow | undefined;
    return this.mapObservationRow(row);
  }

  deleteObservation(id: number, hardDelete: boolean = false): boolean {
    if (hardDelete) {
      const existing = this.db.prepare(
        'SELECT sync_id, project FROM observations WHERE id = ?'
      ).get(id) as { sync_id: string | null; project: string | null } | undefined;

      if (!existing) {
        return false;
      }

      const result = this.db.transaction(() => {
        this.deleteSemanticArtifactsForObservation(id);
        this.deleteKnowledgeArtifactsForObservation(id);
        this.db.prepare('DELETE FROM observation_versions WHERE observation_id = ?').run(id);
        return this.db.prepare('DELETE FROM observations WHERE id = ?').run(id);
      })();

      if (result.changes > 0) {
        this.recordMutation('delete', 'observation', id, existing?.sync_id ?? null, existing?.project ?? null);
      }

      return result.changes > 0;
    }

    const existing = this.db.prepare(
      'SELECT sync_id, project FROM observations WHERE id = ? AND deleted_at IS NULL'
    ).get(id) as { sync_id: string | null; project: string | null } | undefined;

    const result = this.db.prepare("UPDATE observations SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(id);

    if (result.changes > 0) {
      this.recordMutation('delete', 'observation', id, existing?.sync_id ?? null, existing?.project ?? null);
    }

    return result.changes > 0;
  }

  updateObservation(input: UpdateObservationInput): Observation | null {
    const current = this.getObservation(input.id);

    if (!current) {
      return null;
    }

    this.db.prepare(
      'INSERT INTO observation_versions (observation_id, title, content, type, version_number) VALUES (?, ?, ?, ?, ?)'
    ).run(current.id, current.title, current.content, current.type, current.revision_count);

    const setClauses = ['revision_count = revision_count + 1', "updated_at = datetime('now')"];
    const params: Array<string | number | null> = [];

    if (input.title !== undefined) {
      setClauses.push('title = ?');
      params.push(input.title);
    }

    if (input.content !== undefined) {
      setClauses.push('content = ?');
      params.push(input.content);
      setClauses.push('normalized_hash = ?');
      params.push(computeHash(input.content));
    }

    if (input.type !== undefined) {
      setClauses.push('type = ?');
      params.push(input.type);
    }

    if (input.project !== undefined) {
      setClauses.push('project = ?');
      params.push(input.project);
    }

    if (input.scope !== undefined) {
      setClauses.push('scope = ?');
      params.push(input.scope);
    }

    if (input.topic_key !== undefined) {
      setClauses.push('topic_key = ?');
      params.push(input.topic_key);
    }

    params.push(input.id);

    this.db.prepare(`UPDATE observations SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

    const updated = this.getObservation(input.id);

    if (updated) {
      this.recordMutation('update', 'observation', updated.id, updated.sync_id, updated.project);
      this.refreshObservationFacts(updated);
      this.planSemanticJobsForObservation({ observationId: updated.id, content: updated.content });
    }

    return updated;
  }

  private appendObservationFilters(
    sql: string[],
    params: Array<string | number | Buffer>,
    filters: RetrievalCandidateFilters = {},
    alias = 'o',
  ): void {
    if (filters.project) {
      sql.push(`AND ${alias}.project = ?`);
      params.push(filters.project);
    }
    if (filters.session_id) {
      sql.push(`AND ${alias}.session_id = ?`);
      params.push(filters.session_id);
    }
    if (filters.scope) {
      sql.push(`AND ${alias}.scope = ?`);
      params.push(filters.scope);
    }
    if (filters.topic_key) {
      sql.push(`AND ${alias}.topic_key = ?`);
      params.push(filters.topic_key);
    }
    if (filters.type) {
      sql.push(`AND ${alias}.type = ?`);
      params.push(filters.type);
    }
    if (filters.time_from) {
      sql.push(`AND ${alias}.created_at >= ?`);
      params.push(filters.time_from);
    }
    if (filters.time_to) {
      sql.push(`AND ${alias}.created_at <= ?`);
      params.push(filters.time_to);
    }
  }

  async hybridRetrieve(input: {
    query: string;
    limit?: number;
    project?: string;
    session_id?: string;
    scope?: Observation['scope'];
    topic_key?: string;
    type?: Observation['type'];
    time_from?: string;
    time_to?: string;
    laneOrder?: RetrievalLane[];
    laneWeights?: Partial<Record<RetrievalLane, number>>;
    embeddingProvider?: EmbeddingProviderAdapter | null;
    hydeGenerator?: HydeGenerator | null;
    hyde?: { enabled?: boolean; mode?: 'success' | 'timeout' | 'failure'; answer?: string };
  }): Promise<{
    defaults: typeof DEFAULT_RETRIEVAL_DEFAULTS;
    laneOrder: RetrievalLane[];
    degradedFallback: string[];
    lexicalQuery: string;
    scoreFromDistance: (distance: number) => number;
    semanticInputs: SemanticInput[];
    results: HybridHit[];
    pending: boolean;
  }> {
    const defaults = resolveRetrievalDefaults(this.config.retrievalDefaults);
    const lexicalQuery = this.buildPrefixQueryFromTerms(this.getQueryTerms(input.query));
    const degradedFallback: string[] = [];
    const filters: RetrievalCandidateFilters = {
      project: input.project,
      session_id: input.session_id,
      scope: input.scope,
      topic_key: input.topic_key,
      type: input.type,
      time_from: input.time_from,
      time_to: input.time_to,
    };
    const semanticInputsResult = await this.prepareSemanticInputs({
      query: input.query,
      hyde: input.hyde,
      hydeGenerator: input.hydeGenerator,
    });
    const semanticInputs = semanticInputsResult.inputs;
    const semanticCandidates: LaneCandidate[] = [];
    const semanticReadiness = this.getSemanticLaneReadiness();
    const canRunSentenceSemantic = semanticReadiness.sentence.ready;
    const canRunChunkSemantic = semanticReadiness.chunk.ready;

    if ((canRunSentenceSemantic || canRunChunkSemantic) && input.embeddingProvider && semanticInputs.length > 0) {
      const embeddings = await input.embeddingProvider.embed(semanticInputs.map((item) => item.text), 'query');
      for (let i = 0; i < semanticInputs.length; i += 1) {
        const semanticInput = semanticInputs[i];
        const vector = embeddings[i];
        if (!vector || vector.length === 0) continue;
        if (canRunSentenceSemantic) {
          semanticCandidates.push(...this.querySentenceLane({
            vector,
            source: semanticInput.source,
            topK: defaults.sentenceTopK,
            minSemanticScore: defaults.minSemanticScore,
            l2DistanceScale: defaults.l2DistanceScale,
            filters,
          }));
        }
        if (canRunChunkSemantic) {
          semanticCandidates.push(...this.queryChunkLane({
            vector,
            source: semanticInput.source,
            topK: defaults.chunkTopK,
            minSemanticScore: defaults.minSemanticScore,
            l2DistanceScale: defaults.l2DistanceScale,
            filters,
          }));
        }
      }
    } else {
      degradedFallback.push('lexical');
    }

    const lexicalCandidates = this.queryLexicalLane({ query: input.query, lexicalLimit: defaults.lexicalLimit, filters });
    const graphRankingCandidates = this.queryKnowledgeLane({
      query: input.query,
      filters,
      includeUnmatched: false,
    });
    const coreCandidates = [...semanticCandidates, ...graphRankingCandidates, ...lexicalCandidates];
    const observationIds = Array.from(new Set(coreCandidates.map((candidate) => candidate.observationId)));
    const observationRows = observationIds.length > 0
      ? this.db.prepare(
          `SELECT * FROM observations
           WHERE deleted_at IS NULL
           AND id IN (${observationIds.map(() => '?').join(',')})`
        ).all(...observationIds) as ObservationRow[]
      : [];
    const observations = new Map(observationRows.map((row) => [row.id, row]));
    const fusionOptions: FusionOptions = {
      laneOrder: input.laneOrder,
      laneWeights: input.laneWeights,
    };
    const fusedLimit = input.limit ?? defaults.lexicalLimit;
    const fused = fuseCandidates(observations, coreCandidates, fusionOptions).slice(0, fusedLimit);
    const effectiveLaneOrder = this.resolveEffectiveLaneOrder(input.laneOrder);
    const parentPromotionThreshold = defaults.minSemanticScore;
    const graphEnrichmentCandidates = this.queryKnowledgeLane({
      query: input.query,
      filters,
      observationIds: fused.map((hit) => hit.observation.id),
      includeUnmatched: true,
    });
    const graphByObservation = new Map<number, LaneCandidate[]>();
    graphEnrichmentCandidates.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.source !== b.source) return a.source === 'observation_facts' ? -1 : 1;
      return a.observationId - b.observationId;
    });
    for (const candidate of graphEnrichmentCandidates) {
      const list = graphByObservation.get(candidate.observationId) ?? [];
      if (list.length < 5) {
        list.push(candidate);
        graphByObservation.set(candidate.observationId, list);
      }
    }

    for (const hit of fused) {
      const graphEvidence = graphByObservation.get(hit.observation.id);
      if (graphEvidence && graphEvidence.length > 0) {
        const existing = hit.evidence.byLane.kg ?? [];
        const merged = [...existing];
        for (const candidate of graphEvidence) {
          const duplicate = merged.some((item) => (
            item.source === candidate.source
            && item.text === candidate.text
            && item.observationId === candidate.observationId
          ));
          if (!duplicate) {
            merged.push(candidate);
          }
        }
        hit.evidence.byLane.kg = merged.slice(0, 5);
        hit.lanes = Array.from(new Set([...hit.lanes, 'kg' as const]));
      }
      const bestSentence = hit.evidence.byLane.sentence?.reduce((best, candidate) => (
        candidate.score > best.score ? candidate : best
      ));
      const sentenceChunkKey = bestSentence?.chunkKey;
      if (!sentenceChunkKey) continue;
      if (bestSentence.score < parentPromotionThreshold) continue;
      const parent = this.db.prepare(
        'SELECT chunk_key, content FROM semantic_chunks WHERE chunk_key = ? LIMIT 1'
      ).get(sentenceChunkKey) as { chunk_key: string; content: string } | undefined;
      if (parent) {
        hit.evidence.promotedParent = { chunkKey: parent.chunk_key, text: parent.content };
      }
    }

    return {
      defaults,
      laneOrder: effectiveLaneOrder,
      degradedFallback,
      lexicalQuery,
      scoreFromDistance: (distance: number) => scoreFromDistance(distance, defaults.l2DistanceScale),
      semanticInputs,
      results: fused,
      pending: this.semanticRuntime.pending,
    };
  }

  private querySentenceLane(input: {
    vector: number[];
    source: 'raw_query' | 'hyde_answer';
    topK: number;
    minSemanticScore: number;
    l2DistanceScale: number;
    filters?: RetrievalCandidateFilters;
  }): LaneCandidate[] {
    const params: Array<string | number | Buffer> = [vectorToBuffer(input.vector), input.topK];
    const sql = [
      'SELECT s.observation_id, s.chunk_key, s.sentence_key, s.content, v.distance',
      'FROM vec_sentences v',
      'JOIN semantic_vector_rowids m ON m.vec_rowid = v.rowid AND m.lane = \'sentence\'',
      'JOIN semantic_sentences s ON s.sentence_key = m.source_key',
      'JOIN observations o ON o.id = s.observation_id',
      'WHERE v.embedding MATCH ? AND k = ?',
      'AND o.deleted_at IS NULL',
    ];
    this.appendObservationFilters(sql, params, input.filters);
    sql.push('ORDER BY v.distance ASC');
    const rows = this.db.prepare(sql.join(' ')).all(...params) as Array<{
      observation_id: number; chunk_key: string; sentence_key: string; content: string; distance: number;
    }>;
    return rows
      .map((row) => ({ row, score: scoreFromDistance(row.distance, input.l2DistanceScale) }))
      .filter((entry) => entry.score >= input.minSemanticScore)
      .map((entry) => ({
        lane: 'sentence' as const,
        observationId: entry.row.observation_id,
        score: entry.score,
        source: input.source,
        text: entry.row.content,
        chunkKey: entry.row.chunk_key,
        sentenceKey: entry.row.sentence_key,
        distance: entry.row.distance,
      }));
  }

  private queryChunkLane(input: {
    vector: number[];
    source: 'raw_query' | 'hyde_answer';
    topK: number;
    minSemanticScore: number;
    l2DistanceScale: number;
    filters?: RetrievalCandidateFilters;
  }): LaneCandidate[] {
    const params: Array<string | number | Buffer> = [vectorToBuffer(input.vector), input.topK];
    const sql = [
      'SELECT c.observation_id, c.chunk_key, c.content, v.distance',
      'FROM vec_chunks v',
      'JOIN semantic_vector_rowids m ON m.vec_rowid = v.rowid AND m.lane = \'chunk\'',
      'JOIN semantic_chunks c ON c.chunk_key = m.source_key',
      'JOIN observations o ON o.id = c.observation_id',
      'WHERE v.embedding MATCH ? AND k = ?',
      'AND o.deleted_at IS NULL',
    ];
    this.appendObservationFilters(sql, params, input.filters);
    sql.push('ORDER BY v.distance ASC');
    const rows = this.db.prepare(sql.join(' ')).all(...params) as Array<{
      observation_id: number; chunk_key: string; content: string; distance: number;
    }>;
    return rows
      .map((row) => ({ row, score: scoreFromDistance(row.distance, input.l2DistanceScale) }))
      .filter((entry) => entry.score >= input.minSemanticScore)
      .map((entry) => ({
        lane: 'chunk' as const,
        observationId: entry.row.observation_id,
        score: entry.score,
        source: input.source,
        text: entry.row.content,
        chunkKey: entry.row.chunk_key,
        distance: entry.row.distance,
      }));
  }

  private getQueryTerms(query: string): string[] {
    return query
      .toLowerCase()
      .split(/[^a-z0-9_./:-]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3 && !RETRIEVAL_QUERY_STOPWORDS.has(term));
  }

  private buildPrefixQueryFromTerms(terms: string[]): string {
    const uniqueTerms = Array.from(new Set(terms));
    if (uniqueTerms.length === 0) return '';
    return uniqueTerms.map((term) => `"${term.replace(/"/g, '""')}"*`).join(' OR ');
  }

  private splitEvidenceSentences(content: string): string[] {
    const normalized = stripPrivateTags(content).replace(/\r\n?/g, '\n').trim();
    if (normalized.length === 0) {
      return [];
    }

    return normalized
      .replace(/\n+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 5);
  }

  private sentenceMatchesTerms(sentence: string, terms: string[]): boolean {
    return this.countMatchingTerms(sentence, terms) > 0;
  }

  private countMatchingTerms(text: string, terms: string[]): number {
    const words = text
      .toLowerCase()
      .split(/[^a-z0-9_./:-]+/)
      .filter(Boolean);

    return terms.filter((term) => words.some((word) => word.startsWith(term) || word.includes(term))).length;
  }

  private buildLexicalEvidenceText(observationId: number, content: string, terms: string[]): string {
    const indexedSentences = this.db.prepare(
      'SELECT content FROM semantic_sentences WHERE observation_id = ? ORDER BY sentence_index ASC'
    ).all(observationId) as Array<{ content: string }>;
    const sentences = indexedSentences.length > 0
      ? indexedSentences.map((row) => stripPrivateTags(row.content).trim()).filter((sentence) => sentence.length >= 5)
      : this.splitEvidenceSentences(content);
    const matchingSentences = sentences.filter((sentence) => this.sentenceMatchesTerms(sentence, terms));
    const selected = matchingSentences.length > 0 ? matchingSentences : sentences.slice(0, 3);

    return selected.join(' ').trim() || truncateForPreview(stripPrivateTags(content).trim(), this.config.previewLength);
  }

  private queryLexicalLane(input: { query: string; lexicalLimit: number; filters?: RetrievalCandidateFilters }): LaneCandidate[] {
    const terms = this.getQueryTerms(input.query);
    const prefixQuery = this.buildPrefixQueryFromTerms(terms);
    if (prefixQuery === '') return [];
    const params: Array<string | number | Buffer> = [prefixQuery];
    const sql = [
      'SELECT o.id as observation_id, o.title, o.content, fts.rank',
      'FROM observations_fts fts',
      'JOIN observations o ON o.id = fts.rowid',
      'WHERE observations_fts MATCH ?',
      'AND o.deleted_at IS NULL',
    ];
    this.appendObservationFilters(sql, params, input.filters);
    sql.push('ORDER BY fts.rank ASC LIMIT ?');
    params.push(input.lexicalLimit);
    const rows = this.db.prepare(sql.join(' ')).all(...params) as Array<{ observation_id: number; title: string; content: string; rank: number }>;
    const singleTermPenalty = terms.length <= 1 ? 0.65 : 1;
    return rows.map((row) => {
      const matchedTerms = this.countMatchingTerms(`${row.title} ${row.content}`, terms);
      const matchRatio = terms.length > 0 ? matchedTerms / terms.length : 0;
      const baseScore = 1 / (1 + Math.abs(row.rank));
      const score = (matchedTerms > 0 ? baseScore * Math.pow(matchRatio, 1.5) : baseScore * 0.05) * singleTermPenalty;
      return {
        lane: 'lexical' as const,
        observationId: row.observation_id,
        score,
        source: 'lexical_prefix' as const,
        text: this.buildLexicalEvidenceText(row.observation_id, row.content, terms),
      };
    });
  }

  private queryKnowledgeLane(input: {
    query: string;
    filters?: RetrievalCandidateFilters;
    observationIds?: number[];
    includeUnmatched?: boolean;
  }): LaneCandidate[] {
    if (input.observationIds && input.observationIds.length === 0) return [];
    const sanitized = sanitizeFTS(input.query).replaceAll('"', '').trim().toLowerCase();
    const terms = this.getQueryTerms(sanitized);
    if (terms.length === 0 && !input.includeUnmatched) return [];
    const queryText = ` ${terms.join(' ')} `;
    const entityMatches = (name: string): number => {
      const entityTerms = this.getQueryTerms(name);
      if (entityTerms.length === 0) return 0;
      const exactPhrase = queryText.includes(` ${entityTerms.join(' ')} `) ? 1 : 0;
      const tokenMatches = entityTerms.filter((term) => terms.some((queryTerm) => term.startsWith(queryTerm) || queryTerm.startsWith(term))).length;
      return exactPhrase + tokenMatches;
    };

    const kgParams: Array<string | number | Buffer> = [];
    const kgSql = [
      'SELECT t.source_id as observation_id, t.provenance, t.confidence, t.source_type, se.canonical_name as subject_name,',
      '       oe.canonical_name as object_name, t.relation',
      'FROM kg_triples t',
      'JOIN kg_entities se ON se.id = t.subject_entity_id',
      'JOIN kg_entities oe ON oe.id = t.object_entity_id',
      'JOIN observations o ON o.id = t.source_id',
      'WHERE o.deleted_at IS NULL',
    ];
    this.appendObservationFilters(kgSql, kgParams, input.filters);
    if (input.observationIds && input.observationIds.length > 0) {
      kgSql.push(`AND o.id IN (${input.observationIds.map(() => '?').join(',')})`);
      kgParams.push(...input.observationIds);
    }
    const rows = this.db.prepare(kgSql.join(' ')).all(...kgParams) as Array<{
      observation_id: number; provenance: string; confidence: number; source_type: string;
      subject_name: string; object_name: string; relation: string;
    }>;
    const tripleCandidates = rows.flatMap((row) => {
      const subjectMatches = entityMatches(row.subject_name);
      const objectMatches = entityMatches(row.object_name);
      const relationTerms = this.getQueryTerms(row.relation);
      const relationMatches = relationTerms.filter((term) => terms.includes(term)).length;
      const matches = subjectMatches + objectMatches + relationMatches;
      if (matches === 0 && !input.includeUnmatched) return [];
      const score = matches > 0
        ? Math.min(1, row.confidence + Math.min(matches / Math.max(terms.length, 1), 1) * 0.5)
        : row.confidence * 0.2;
      return [{
        lane: 'kg' as const,
        observationId: row.observation_id,
        score,
        source: 'kg_triples' as const,
        text: `${row.subject_name} ${row.relation} ${row.object_name}`,
        kg: { provenance: row.provenance, confidence: row.confidence, sourceType: row.source_type },
      }];
    });

    const fallbackParams: Array<string | number | Buffer> = [];
    const fallbackSql = [
      'SELECT f.observation_id, f.subject, f.relation, f.object',
      'FROM observation_facts f',
      'JOIN observations o ON o.id = f.observation_id',
      'WHERE o.deleted_at IS NULL',
    ];
    this.appendObservationFilters(fallbackSql, fallbackParams, input.filters);
    if (input.observationIds && input.observationIds.length > 0) {
      fallbackSql.push(`AND o.id IN (${input.observationIds.map(() => '?').join(',')})`);
      fallbackParams.push(...input.observationIds);
    }
    const fallbackRows = this.db.prepare(fallbackSql.join(' ')).all(...fallbackParams) as Array<{
      observation_id: number; subject: string; relation: string; object: string;
    }>;
    const factCandidates = fallbackRows.flatMap((row) => {
      const factText = `${row.subject} ${row.relation} ${row.object}`.toLowerCase();
      const matches = terms.filter((term) => factText.includes(term)).length;
      if (matches === 0) return [];
      return [{
        lane: 'kg' as const,
        observationId: row.observation_id,
        score: 0.35,
        source: 'observation_facts' as const,
        text: `${row.subject} ${row.relation} ${row.object}`,
      }];
    });
    return [...tripleCandidates, ...factCandidates];
  }

  private resolveEffectiveLaneOrder(laneOrder?: RetrievalLane[]): RetrievalLane[] {
    const provided = laneOrder ?? DEFAULT_LANE_ORDER;
    const seen = new Set<RetrievalLane>();
    const resolved: RetrievalLane[] = [];
    for (const lane of provided) {
      if (seen.has(lane)) continue;
      seen.add(lane);
      resolved.push(lane);
    }
    for (const lane of DEFAULT_LANE_ORDER) {
      if (seen.has(lane)) continue;
      seen.add(lane);
      resolved.push(lane);
    }
    return resolved;
  }

  searchObservations(input: SearchInput): SearchResult[] {
    const limit = Math.min(input.limit ?? this.config.maxSearchResults, 20);
    let rows: SearchRow[];

    if (input.topic_key_exact !== undefined) {
      const sql = [
        'SELECT o.*, 0 as rank',
        'FROM observations o',
        'WHERE o.topic_key = ?',
        'AND o.deleted_at IS NULL',
      ];
      const params: Array<string | number> = [input.topic_key_exact];

      if (input.type) {
        sql.push('AND o.type = ?');
        params.push(input.type);
      }

      if (input.project) {
        sql.push('AND o.project = ?');
        params.push(input.project);
      }

      if (input.session_id) {
        sql.push('AND o.session_id = ?');
        params.push(input.session_id);
      }

      if (input.scope) {
        sql.push('AND o.scope = ?');
        params.push(input.scope);
      }

      sql.push('ORDER BY o.updated_at DESC, o.id DESC');
      sql.push('LIMIT ?');
      params.push(limit);

      rows = this.db.prepare(sql.join(' ')).all(...params) as SearchRow[];
    } else {
      const buildFtsQuery = (matchQuery: string, rowLimit: number): { sql: string; params: Array<string | number> } => {
        const sql = [
          'SELECT o.*, fts.rank',
          'FROM observations_fts fts',
          'JOIN observations o ON o.id = fts.rowid',
          'WHERE observations_fts MATCH ?',
          'AND o.deleted_at IS NULL',
        ];
        const params: Array<string | number> = [matchQuery];

        if (input.type) {
          sql.push('AND o.type = ?');
          params.push(input.type);
        }

        if (input.project) {
          sql.push('AND o.project = ?');
          params.push(input.project);
        }

        if (input.session_id) {
          sql.push('AND o.session_id = ?');
          params.push(input.session_id);
        }

        if (input.scope) {
          sql.push('AND o.scope = ?');
          params.push(input.scope);
        }

        sql.push('ORDER BY fts.rank');
        sql.push('LIMIT ?');
        params.push(rowLimit);

        return { sql: sql.join(' '), params };
      };

      const sanitizedQuery = sanitizeFTS(input.query);

      if (sanitizedQuery === '') {
        return [];
      }

      const exact = buildFtsQuery(sanitizedQuery, limit);
      rows = this.db.prepare(exact.sql).all(...exact.params) as SearchRow[];

      if (rows.length < limit) {
        const prefixQuery = sanitizeFTSPrefix(input.query);

        if (prefixQuery !== '') {
          const prefix = buildFtsQuery(prefixQuery, limit);
          const prefixRows = this.db.prepare(prefix.sql).all(...prefix.params) as SearchRow[];
          const seen = new Set(rows.map((row) => row.id));

          for (const row of prefixRows) {
            if (!seen.has(row.id)) {
              rows.push(row);
              seen.add(row.id);
            }

            if (rows.length >= limit) {
              break;
            }
          }
        }
      }
    }

    return rows.map((row) => {
      const observation = this.mapObservationRow(row);

      if (!observation) {
        throw new Error('Failed to map search result observation');
      }

      return {
        ...observation,
        rank: row.rank,
        preview: truncateForPreview(observation.content, this.config.previewLength),
      };
    });
  }

  searchObservationsFormatted(input: SearchInput): string {
    const observations = this.searchObservations(input);
    return formatSearchResults(observations, input.mode ?? 'compact', this.config.previewLength, input.max_chars);
  }

  listTopicKeys(project?: string): TopicKeySummary[] {
    const sql = [
      'SELECT',
      '  o.topic_key,',
      '  o.project,',
      '  o.title,',
      '  o.type,',
      '  COUNT(*) as observation_count,',
      '  MAX(o.updated_at) as updated_at',
      'FROM observations o',
      'WHERE o.topic_key IS NOT NULL',
      "AND o.topic_key != ''",
      'AND o.deleted_at IS NULL',
    ];
    const params: string[] = [];

    if (project) {
      sql.push('AND o.project = ?');
      params.push(project);
    }

    sql.push('GROUP BY o.topic_key, o.project');
    sql.push('ORDER BY o.project ASC, o.topic_key ASC');

    return this.db.prepare(sql.join(' ')).all(...params) as TopicKeySummary[];
  }

  getVisualizationHealth(input: { project?: string } = {}): VizHealthResponse {
    const progress = this.getSemanticIndexProgress({ project: input.project });
    const pendingJobs = progress.totals.pending + progress.totals.running;
    const runtime = this.getSemanticIndexState();
    const laneStale = progress.lanes.some((lane) => lane.stale);
    const lanePending = progress.lanes.some((lane) => lane.pending);
    const laneDegraded = progress.lanes.some((lane) => lane.degraded);
    let semanticState: VizHealthResponse['semantic_state'] = 'ready';
    if (laneDegraded || runtime.degraded) semanticState = 'degraded';
    else if (laneStale && pendingJobs > 0) semanticState = 'rebuilding';
    else if (lanePending || runtime.pending || pendingJobs > 0) semanticState = 'pending';
    const ratio = (count: number, total: number): number => (
      total === 0 ? 0 : Number((count / total).toFixed(3))
    );
    return {
      semantic_state: semanticState,
      pending_jobs: pendingJobs,
      semantic: {
        lanes: progress.lanes.map((lane) => ({
          lane: lane.lane,
          pending: lane.pending,
          degraded: lane.degraded,
          stale: lane.stale,
          last_ready_at: lane.lastReadyAt,
          updated_at: lane.updatedAt,
        })),
        jobs: {
          ...progress.totals,
          oldest_pending_at: progress.oldestPendingAt,
          queue_lag_ms: progress.queueLagMs,
          by_kind: progress.byKind.map((job) => ({
            kind: job.kind,
            total: job.total,
            pending: job.pending,
            running: job.running,
            done: job.done,
            failed: job.failed,
            oldest_pending_at: job.oldestPendingAt,
            oldest_pending_age_ms: job.oldestPendingAgeMs,
          })),
        },
        coverage: {
          observations: progress.coverage.observations,
          chunks: progress.coverage.chunks,
          sentences: progress.coverage.sentences,
          chunk_vectors: progress.coverage.chunkVectors,
          sentence_vectors: progress.coverage.sentenceVectors,
          chunk_coverage: ratio(progress.coverage.chunkVectors, progress.coverage.chunks),
          sentence_coverage: ratio(progress.coverage.sentenceVectors, progress.coverage.sentences),
        },
        recent_errors: progress.recentErrors.map((error) => ({
          id: error.id,
          job_key: error.jobKey,
          kind: error.kind,
          state: error.state,
          attempt_count: error.attemptCount,
          last_error: error.lastError,
        })),
      },
    };
  }

  getObservatoryContext(input: ObservatoryScope = {}): ObservatoryContextResponse {
    const scope = this.normalizeObservatoryScope(input);
    return {
      scope,
      context_token: this.encodeScopedToken('context', { scope }, OBSERVATORY_CONTEXT_TTL_MS),
      health: this.getVisualizationHealth({ project: scope.project }),
      capabilities: {
        viz_fallback_available: true,
        observatory_routes_available: true,
      },
    };
  }

  async getObservatoryRecall(input: {
    context_token: string;
    lanes?: ObservatoryLane[];
    limit?: number;
    embeddingProvider?: EmbeddingProviderAdapter | null;
    hydeGenerator?: HydeGenerator | null;
  }): Promise<ObservatoryRecallResponse> {
    const parsed = this.decodeScopedToken<{ scope: ObservatoryScope }>('context', input.context_token);
    const scope = this.normalizeObservatoryScope(parsed.scope);
    const lanes = input.lanes && input.lanes.length > 0
      ? input.lanes
      : ['lexical', 'sentence-vector', 'chunk-vector', 'fact-kg'] as ObservatoryLane[];
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const query = scope.query?.trim() ?? '';
    const laneHits = new Map<ObservatoryLane, ObservatoryRecallHit[]>();
    const laneStates: NonNullable<ObservatoryRecallResponse['lane_states']> = {};
    const semanticReadiness = this.getSemanticLaneReadiness();
    const semanticLaneState = (lane: SemanticLaneName): { status: 'pending' | 'degraded' | 'unavailable'; reason: ObservatoryLaneStateReason } => {
      const state = semanticReadiness[lane];
      if (state.degraded) return { status: 'degraded', reason: 'semantic-degraded' };
      if (state.pending) return { status: 'pending', reason: 'semantic-pending' };
      if (state.stale) return { status: 'pending', reason: 'semantic-stale' };
      return { status: 'unavailable', reason: 'unsupported-sync' };
    };
    const toRecallHit = (observation: Observation, lane: ObservatoryLane): ObservatoryRecallHit => ({
      observation_id: observation.id,
      title: stripPrivateTags(observation.title).trim(),
      preview: truncateForPreview(stripPrivateTags(observation.content).trim(), this.config.previewLength),
      type: observation.type,
      project: observation.project,
      session_id: observation.session_id,
      topic_key: observation.topic_key,
      created_at: observation.created_at,
      lane,
      pivot_token: this.encodeScopedToken('pivot', {
        scope,
        target: 'recall' as ObservatoryPivotTarget,
        focus_node_id: `obs:${observation.id}`,
      }, OBSERVATORY_PIVOT_TTL_MS),
    });

    for (const lane of lanes) {
      laneHits.set(lane, []);
    }

    if (query.length > 0) {
      const retrieval = await this.hybridRetrieve({
        query,
        limit,
        project: scope.project,
        session_id: scope.session_id,
        topic_key: scope.topic_key,
        type: scope.type ?? scope.observation_type,
        time_from: scope.time_from,
        time_to: scope.time_to,
        embeddingProvider: input.embeddingProvider,
        hydeGenerator: input.hydeGenerator,
      });
      const laneByCandidate: Record<RetrievalLane, ObservatoryLane> = {
        lexical: 'lexical',
        sentence: 'sentence-vector',
        chunk: 'chunk-vector',
        kg: 'fact-kg',
      };
      const seenByLane = new Map<ObservatoryLane, Set<number>>();

      for (const hit of retrieval.results) {
        for (const [candidateLane, candidates] of Object.entries(hit.evidence.byLane) as Array<[RetrievalLane, LaneCandidate[] | undefined]>) {
          const observatoryLane = laneByCandidate[candidateLane];
          if (!lanes.includes(observatoryLane) || !candidates || candidates.length === 0) continue;
          const hits = laneHits.get(observatoryLane) ?? [];
          const seen = seenByLane.get(observatoryLane) ?? new Set<number>();
          if (seen.has(hit.observation.id) || hits.length >= limit) continue;
          seen.add(hit.observation.id);
          seenByLane.set(observatoryLane, seen);
          hits.push(toRecallHit(hit.observation, observatoryLane));
          laneHits.set(observatoryLane, hits);
        }
      }
    }

    for (const lane of lanes) {
      const hits = laneHits.get(lane) ?? [];
      if (query.length === 0) {
        laneStates[lane] = { status: 'unavailable', reason: 'no-query' };
      } else if (hits.length > 0) {
        laneStates[lane] = { status: 'ready', reason: 'ok' };
      } else if (lane === 'sentence-vector') {
        laneStates[lane] = semanticReadiness.sentence.ready && input.embeddingProvider
          ? { status: 'unavailable', reason: 'no-evidence' }
          : semanticLaneState('sentence');
      } else if (lane === 'chunk-vector') {
        laneStates[lane] = semanticReadiness.chunk.ready && input.embeddingProvider
          ? { status: 'unavailable', reason: 'no-evidence' }
          : semanticLaneState('chunk');
      } else if (lane === 'fact-kg') {
        laneStates[lane] = { status: 'unavailable', reason: 'kg-no-match' };
      } else {
        laneStates[lane] = { status: 'unavailable', reason: 'no-evidence' };
      }
    }
    return {
      context_token: input.context_token,
      lanes: {
        lexical: laneHits.get('lexical') ?? [],
        'sentence-vector': laneHits.get('sentence-vector') ?? [],
        'chunk-vector': laneHits.get('chunk-vector') ?? [],
        'fact-kg': laneHits.get('fact-kg') ?? [],
      },
      lane_states: laneStates,
    };
  }

  getObservatoryMapFrontier(input: {
    context_token: string;
    focus_node_id: string;
    visible_node_ids?: string[];
    max_nodes?: number;
    max_edges?: number;
    continuation?: string;
  }): ObservatoryMapFrontierResponse {
    const parsed = this.decodeScopedToken<{ scope: ObservatoryScope }>('context', input.context_token);
    const scope = this.normalizeObservatoryScope(parsed.scope);
    const maxNodes = Math.min(Math.max(input.max_nodes ?? 50, 1), VIZ_LIMITS.maxNodesHard);
    const maxEdges = Math.min(Math.max(input.max_edges ?? 150, 1), VIZ_LIMITS.maxEdgesHard);
    const slice = this.expandVisualizationNode({
      node_id: input.focus_node_id,
      project: scope.project,
      session_id: scope.session_id,
      topic_key: scope.topic_key,
      type: scope.type,
      observation_type: scope.observation_type,
      relation: scope.relation,
      query: scope.query,
      max_nodes: Math.min(maxNodes * 3, VIZ_LIMITS.maxNodesHard),
      max_edges: Math.min(maxEdges * 3, VIZ_LIMITS.maxEdgesHard),
    });
    const visibleSet = new Set(input.visible_node_ids ?? []);
    const continuationOffset = this.decodeFrontierContinuation(input.continuation);
    const candidates = slice.nodes.filter((node) => node.id !== input.focus_node_id);
    const addedCandidates = candidates.filter((node) => !visibleSet.has(node.id));
    const page = addedCandidates.slice(continuationOffset, continuationOffset + maxNodes);
    const pageIdSet = new Set(page.map((node) => node.id));
    const frontierState: ObservatoryFrontierState = {
      added_node_ids: page.map((node) => node.id),
      already_visible_node_ids: candidates.filter((node) => visibleSet.has(node.id)).slice(0, maxNodes).map((node) => node.id),
      exhausted: continuationOffset + maxNodes >= addedCandidates.length,
      continuation: continuationOffset + maxNodes < addedCandidates.length
        ? `frontier:${continuationOffset + maxNodes}`
        : null,
    };
    if (addedCandidates.length === 0) {
      frontierState.reason = candidates.length === 0 ? 'no-neighbors' : 'scope-filtered';
    } else if (frontierState.continuation) {
      frontierState.reason = 'limit';
    }
    return {
      nodes: slice.nodes.filter((node) => node.id === input.focus_node_id || pageIdSet.has(node.id)).slice(0, maxNodes + 1),
      edges: slice.edges.filter((edge) => pageIdSet.has(edge.source_id) || pageIdSet.has(edge.target_id)).slice(0, maxEdges),
      frontier_state: frontierState,
      health: this.getVisualizationHealth({ project: scope.project }),
    };
  }

  getObservatoryLedgerDetail(input: { observation_id: number }): ObservatoryLedgerResponse | null {
    const observation = this.getObservation(input.observation_id);
    if (!observation) return null;
    const facts = this.getObservationFacts({ observation_id: input.observation_id });
    const extract = (relation: string) => facts.filter((fact) => fact.relation === relation).map((fact) => stripPrivateTags(fact.object).trim());
    return {
      observation_id: observation.id,
      title: stripPrivateTags(observation.title).trim(),
      type: observation.type,
      what: extract('HAS_WHAT'),
      why: extract('HAS_WHY'),
      where: extract('HAS_WHERE'),
      learned: extract('HAS_LEARNED'),
      facts,
      provenance: {
        session_id: observation.session_id,
        project: observation.project,
        topic_key: observation.topic_key,
        created_at: observation.created_at,
      },
    };
  }

  getObservatoryTimeline(input: { context_token: string; limit?: number; continuation?: string }): ObservatoryTimelineResponse {
    const parsed = this.decodeScopedToken<{ scope: ObservatoryScope }>('context', input.context_token);
    const scope = this.normalizeObservatoryScope(parsed.scope);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const offset = this.decodeFrontierContinuation(input.continuation);
    const sql = ['SELECT * FROM observations WHERE deleted_at IS NULL'];
    const params: Array<string | number> = [];
    if (scope.project) {
      sql.push('AND project = ?');
      params.push(scope.project);
    }
    if (scope.session_id) {
      sql.push('AND session_id = ?');
      params.push(scope.session_id);
    }
    if (scope.topic_key) {
      sql.push('AND topic_key = ?');
      params.push(scope.topic_key);
    }
    sql.push('ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?');
    params.push(limit, offset);
    const events = this.mapObservationRows(this.db.prepare(sql.join(' ')).all(...params) as ObservationRow[]);
    return {
      context_token: input.context_token,
      events,
      continuation: events.length < limit ? null : `frontier:${offset + events.length}`,
    };
  }

  resolveObservatoryPivot(input: { pivot_token: string; target: ObservatoryPivotTarget }): {
    context_token: string;
    scope: ObservatoryScope;
    focus_node_id: string;
    target: ObservatoryPivotTarget;
  } {
    const parsed = this.decodeScopedToken<{ scope: ObservatoryScope; target: ObservatoryPivotTarget; focus_node_id: string }>('pivot', input.pivot_token);
    return {
      context_token: this.encodeScopedToken('context', { scope: parsed.scope }, OBSERVATORY_CONTEXT_TTL_MS),
      scope: this.normalizeObservatoryScope(parsed.scope),
      focus_node_id: parsed.focus_node_id,
      target: input.target,
    };
  }

  getVisualizationSlice(input: VizSliceRequest = {}): VizSliceResponse {
    const maxNodes = Math.min(Math.max(input.max_nodes ?? VIZ_LIMITS.maxNodesDefault, 1), VIZ_LIMITS.maxNodesHard);
    const maxEdges = Math.min(Math.max(input.max_edges ?? VIZ_LIMITS.maxEdgesDefault, 1), VIZ_LIMITS.maxEdgesHard);
    const rows = this.getVisualizationRows(input, maxEdges);
    const nodesMap = new Map<string, VizNode>();
    const edges = this.buildVisualizationEdges(rows, maxEdges, nodesMap, input);
    const nodes = Array.from(nodesMap.values()).slice(0, maxNodes);
    const state = this.computeVizState(nodes.length, maxNodes);
    const truncated = edges.length >= maxEdges || nodesMap.size > maxNodes;
    return {
      nodes,
      edges,
      state,
      continuation: truncated ? `nodes:${nodes.length}:edges:${edges.length}` : null,
      truncated,
      health: this.getVisualizationHealth({ project: input.project }),
    };
  }

  expandVisualizationNode(input: VizExpandRequest): VizSliceResponse {
    const maxNodes = Math.min(Math.max(input.max_nodes ?? VIZ_LIMITS.maxNodesDefault, 1), VIZ_LIMITS.maxNodesHard);
    const maxEdges = Math.min(Math.max(input.max_edges ?? VIZ_LIMITS.maxEdgesDefault, 1), VIZ_LIMITS.maxEdgesHard);
    const idMatch = input.node_id.match(/^obs:(\d+)$/);
    if (!idMatch) {
      return {
        nodes: [],
        edges: [],
        state: 'empty',
        continuation: null,
        truncated: false,
        health: this.getVisualizationHealth({ project: input.project }),
      };
    }
    const observationId = Number.parseInt(idMatch[1], 10);
    const rows = this.getVisualizationRows({ ...input }, maxEdges * 2).filter((row) => row.observation_id === observationId);
    const fallbackRows = rows.length > 0 ? rows : this.getVisualizationRows({ ...input, max_edges: maxEdges }, maxEdges).slice(0, maxEdges);
    const nodesMap = new Map<string, VizNode>();
    const edges = this.buildVisualizationEdges(fallbackRows, maxEdges, nodesMap, input);
    const nodes = Array.from(nodesMap.values()).slice(0, maxNodes);
    return {
      nodes,
      edges,
      state: this.computeVizState(nodes.length, maxNodes),
      continuation: edges.length >= maxEdges ? `expand:${input.node_id}:${edges.length}` : null,
      truncated: edges.length >= maxEdges,
      health: this.getVisualizationHealth({ project: input.project }),
    };
  }

  inspectVisualizationNode(nodeId: string, input: { project?: string } = {}): VizInspectNodeResponse | null {
    const idMatch = nodeId.match(/^obs:(\d+)$/);
    if (!idMatch) return null;
    const observation = this.getObservation(Number.parseInt(idMatch[1], 10));
    if (!observation) return null;
    if (input.project && observation.project !== input.project) return null;
    return {
      id: nodeId,
      kind: 'observation',
      label: stripPrivateTags(observation.title).trim(),
      snippet: truncateForPreview(stripPrivateTags(observation.content).trim(), 220),
      links: [observation.session_id, observation.topic_key ?? ''].filter((item) => item.length > 0),
      metadata: {
        project: observation.project,
        topic_key: observation.topic_key,
        type: observation.type,
        created_at: observation.created_at,
      },
    };
  }

  inspectVisualizationEdge(edgeId: string, _input: { project?: string } = {}): VizInspectEdgeResponse | null {
    const [sourceId, relation, targetId] = edgeId.split('|');
    if (!sourceId || !relation || !targetId) return null;
    return {
      id: edgeId,
      source_id: sourceId,
      target_id: targetId,
      relation,
      label: relation,
      summary: `Relationship ${relation}`,
    };
  }

  getVisualizationFilters(input: { project?: string } = {}): VizFiltersResponse {
    const projectRows = this.db.prepare(
      `SELECT DISTINCT project FROM observations WHERE deleted_at IS NULL AND project IS NOT NULL ORDER BY project ASC`
    ).all() as Array<{ project: string | null }>;
    const topicRows = this.db.prepare(
      `SELECT DISTINCT topic_key FROM observations
       WHERE deleted_at IS NULL AND topic_key IS NOT NULL AND topic_key != ''
       ${input.project ? 'AND project = ?' : ''}
       ORDER BY topic_key ASC LIMIT 500`
    ).all(...(input.project ? [input.project] : [])) as Array<{ topic_key: string | null }>;
    const typeRows = this.db.prepare(
      `SELECT DISTINCT type FROM observations WHERE deleted_at IS NULL ${input.project ? 'AND project = ?' : ''} ORDER BY type ASC`
    ).all(...(input.project ? [input.project] : [])) as Array<{ type: Observation['type'] }>;
    const sessionRows = this.db.prepare(
      `SELECT DISTINCT session_id FROM observations WHERE deleted_at IS NULL ${input.project ? 'AND project = ?' : ''} ORDER BY session_id ASC LIMIT 500`
    ).all(...(input.project ? [input.project] : [])) as Array<{ session_id: string }>;
    const relationRows = this.db.prepare(
      `SELECT DISTINCT f.relation
       FROM observation_facts f
       JOIN observations o ON o.id = f.observation_id
       WHERE o.deleted_at IS NULL
       ${input.project ? 'AND o.project = ?' : ''}
       ORDER BY f.relation ASC LIMIT 500`
    ).all(...(input.project ? [input.project] : [])) as Array<{ relation: string }>;
    return {
      projects: projectRows.map((row) => row.project).filter((value): value is string => Boolean(value)),
      sessions: sessionRows.map((row) => row.session_id).filter((value): value is string => Boolean(value)),
      topic_keys: topicRows.map((row) => row.topic_key).filter((value): value is string => Boolean(value)),
      types: typeRows.map((row) => row.type),
      relations: relationRows.map((row) => row.relation).filter((value): value is string => Boolean(value)),
    };
  }

  private getVisualizationRows(input: VizSliceRequest, limit: number): VizEdgeRow[] {
    const params: Array<string | number> = [];
    const sql = [
      'SELECT o.id as observation_id, o.session_id, o.title, o.type, o.project, o.topic_key, o.content, f.relation, f.object',
      'FROM observation_facts f',
      'JOIN observations o ON o.id = f.observation_id',
      'WHERE o.deleted_at IS NULL',
    ];
    if (input.project) {
      sql.push('AND o.project = ?');
      params.push(input.project);
    }
    if (input.topic_key) {
      sql.push('AND o.topic_key = ?');
      params.push(input.topic_key);
    }
    if (input.type) {
      sql.push('AND o.type = ?');
      params.push(input.type);
    }
    if (input.observation_type) {
      sql.push('AND o.type = ?');
      params.push(input.observation_type);
    }
    if (input.session_id) {
      sql.push('AND o.session_id = ?');
      params.push(input.session_id);
    }
    if (input.relation) {
      sql.push('AND f.relation = ?');
      params.push(input.relation);
    }
    if (input.query) {
      const search = `%${sanitizeFTS(input.query).replaceAll('"', '').trim().toLowerCase()}%`;
      sql.push('AND (lower(o.title) LIKE ? OR lower(o.content) LIKE ? OR lower(f.object) LIKE ?)');
      params.push(search, search, search);
    }
    sql.push('ORDER BY o.id ASC, f.id ASC LIMIT ?');
    params.push(limit);
    return this.db.prepare(sql.join(' ')).all(...params) as VizEdgeRow[];
  }

  private buildVisualizationEdges(
    rows: VizEdgeRow[],
    maxEdges: number,
    nodesMap: Map<string, VizNode>,
    input: { project?: string; session_id?: string; topic_key?: string }
  ) {
    const edges: Array<{
      id: string; source_id: string; target_id: string; relation: string; kind: 'semantic' | 'metadata' | 'fact'; label: string; summary: string;
    }> = [];
    const relationTargets = new Map<string, string>();
    for (const row of rows) {
      if (edges.length >= maxEdges) break;
      const sourceId = `obs:${row.observation_id}`;
      const source = this.buildVizNode(sourceId, row, input);
      if (!nodesMap.has(source.id)) nodesMap.set(source.id, source);
      const sessionId = `session:${Buffer.from(row.session_id).toString('base64url').slice(0, 16)}`;
      if (!nodesMap.has(sessionId)) {
        nodesMap.set(sessionId, this.buildSessionNode(sessionId, row, input));
      }
      const projectId = `project:${Buffer.from(row.project ?? 'none').toString('base64url').slice(0, 16)}`;
      if (!nodesMap.has(projectId)) {
        nodesMap.set(projectId, this.buildProjectNode(projectId, row, input));
      }
      if (row.topic_key) {
        const topicId = `topic:${Buffer.from(row.topic_key).toString('base64url').slice(0, 16)}`;
        if (!nodesMap.has(topicId)) {
          nodesMap.set(topicId, this.buildTopicNode(topicId, row, input));
        }
      }
      const targetId = `ref:${row.relation}:${Buffer.from(stripPrivateTags(row.object)).toString('base64url').slice(0, 16)}`;
      if (!nodesMap.has(targetId)) {
        nodesMap.set(targetId, this.buildRefNode(targetId, row.object, row, input));
      }
      const edgeId = `${sourceId}|${row.relation}|${targetId}`;
      if (relationTargets.has(edgeId)) continue;
      relationTargets.set(edgeId, edgeId);
      edges.push({
        id: edgeId,
        source_id: sourceId,
        target_id: targetId,
        relation: row.relation,
        kind: 'fact',
        label: row.relation,
        summary: truncateForPreview(stripPrivateTags(row.object).trim(), 180),
      });
      const obsSessionEdge = `${sourceId}|IN_SESSION|${sessionId}`;
      if (!relationTargets.has(obsSessionEdge) && edges.length < maxEdges) {
        relationTargets.set(obsSessionEdge, obsSessionEdge);
        edges.push({
          id: obsSessionEdge,
          source_id: sourceId,
          target_id: sessionId,
          relation: 'IN_SESSION',
          kind: 'metadata',
          label: 'IN_SESSION',
          summary: 'Observation belongs to session',
        });
      }
      const obsProjectEdge = `${sourceId}|IN_PROJECT|${projectId}`;
      if (!relationTargets.has(obsProjectEdge) && edges.length < maxEdges) {
        relationTargets.set(obsProjectEdge, obsProjectEdge);
        edges.push({
          id: obsProjectEdge,
          source_id: sourceId,
          target_id: projectId,
          relation: 'IN_PROJECT',
          kind: 'metadata',
          label: 'IN_PROJECT',
          summary: 'Observation belongs to project',
        });
      }
    }
    return edges;
  }

  private buildVizNode(nodeId: string, row: VizEdgeRow, input: { project?: string; session_id?: string; topic_key?: string }): VizNode {
    const seed = `${row.observation_id}|${row.project ?? ''}|${row.session_id}|${input.project ?? ''}|${input.session_id ?? ''}|${input.topic_key ?? ''}`;
    const { x, y } = this.computeSeedPoint(seed);
    return {
      id: nodeId,
      kind: 'observation',
      label: stripPrivateTags(row.title).trim(),
      snippet: truncateForPreview(stripPrivateTags(row.content).trim(), 140),
      project: row.project,
      session_id: row.session_id,
      topic_key: row.topic_key,
      type: row.type,
      seed_x: x,
      seed_y: y,
    };
  }

  private buildRefNode(nodeId: string, objectText: string, row: VizEdgeRow, input: { project?: string; session_id?: string; topic_key?: string }): VizNode {
    const clean = stripPrivateTags(objectText).trim();
    const seed = `${nodeId}|${row.project ?? ''}|${input.project ?? ''}|${input.topic_key ?? ''}`;
    const { x, y } = this.computeSeedPoint(seed);
    return {
      id: nodeId,
      kind: 'topic',
      label: truncateForPreview(clean, 80),
      snippet: truncateForPreview(clean, 120),
      project: row.project,
      session_id: row.session_id,
      topic_key: row.topic_key,
      type: null,
      seed_x: x,
      seed_y: y,
    };
  }

  private buildSessionNode(nodeId: string, row: VizEdgeRow, input: { project?: string; session_id?: string; topic_key?: string }): VizNode {
    const seed = `${nodeId}|${row.session_id}|${row.project ?? ''}|${input.session_id ?? ''}`;
    const { x, y } = this.computeSeedPoint(seed);
    return {
      id: nodeId,
      kind: 'session',
      label: row.session_id,
      snippet: `Session ${row.session_id}`,
      project: row.project,
      session_id: row.session_id,
      topic_key: row.topic_key,
      type: null,
      seed_x: x,
      seed_y: y,
    };
  }

  private buildProjectNode(nodeId: string, row: VizEdgeRow, input: { project?: string; session_id?: string; topic_key?: string }): VizNode {
    const seed = `${nodeId}|${row.project ?? 'none'}|${input.project ?? ''}`;
    const { x, y } = this.computeSeedPoint(seed);
    const label = row.project ?? 'unknown-project';
    return {
      id: nodeId,
      kind: 'project',
      label,
      snippet: `Project ${label}`,
      project: row.project,
      session_id: row.session_id,
      topic_key: row.topic_key,
      type: null,
      seed_x: x,
      seed_y: y,
    };
  }

  private buildTopicNode(nodeId: string, row: VizEdgeRow, input: { project?: string; session_id?: string; topic_key?: string }): VizNode {
    const seed = `${nodeId}|${row.topic_key ?? ''}|${input.topic_key ?? ''}`;
    const { x, y } = this.computeSeedPoint(seed);
    const label = row.topic_key ?? 'unknown-topic';
    return {
      id: nodeId,
      kind: 'topic',
      label,
      snippet: `Topic ${label}`,
      project: row.project,
      session_id: row.session_id,
      topic_key: row.topic_key,
      type: null,
      seed_x: x,
      seed_y: y,
    };
  }

  private computeSeedPoint(seed: string): { x: number; y: number } {
    let hashA = 2166136261;
    let hashB = 16777619;
    for (let i = 0; i < seed.length; i += 1) {
      const code = seed.charCodeAt(i);
      hashA ^= code;
      hashA = Math.imul(hashA, 16777619);
      hashB ^= code + i;
      hashB = Math.imul(hashB, 2246822519);
    }
    const x = ((hashA >>> 0) % 2000) / 1000 - 1;
    const y = ((hashB >>> 0) % 2000) / 1000 - 1;
    return { x, y };
  }

  private computeVizState(nodes: number, maxNodes: number): 'empty' | 'sparse' | 'dense' {
    if (nodes === 0) return 'empty';
    if (nodes >= Math.max(Math.floor(maxNodes * 0.7), 1)) return 'dense';
    return 'sparse';
  }

  private normalizeObservatoryScope(scope: ObservatoryScope): ObservatoryScope {
    const normalize = (value: string | undefined): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };
    return {
      project: normalize(scope.project),
      session_id: normalize(scope.session_id),
      topic_key: normalize(scope.topic_key),
      query: normalize(scope.query),
      type: scope.type,
      observation_type: scope.observation_type,
      relation: normalize(scope.relation),
      time_from: normalize(scope.time_from),
      time_to: normalize(scope.time_to),
    };
  }

  private encodeScopedToken(kind: 'context' | 'pivot', payload: Record<string, unknown>, ttlMs: number): string {
    const body = JSON.stringify({
      v: 1,
      kind,
      exp: Date.now() + ttlMs,
      ...payload,
    });
    return Buffer.from(body, 'utf-8').toString('base64url');
  }

  private decodeScopedToken<T extends Record<string, unknown>>(expectedKind: 'context' | 'pivot', token: string): T {
    let raw = '';
    try {
      raw = Buffer.from(token, 'base64url').toString('utf-8');
    } catch {
      throw new Error('Invalid token encoding');
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error('Malformed token payload');
    }
    if (parsed.kind !== expectedKind) {
      throw new Error('Invalid token scope');
    }
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      throw new Error('Expired token');
    }
    return parsed as T;
  }

  private decodeFrontierContinuation(token: string | undefined): number {
    if (!token) return 0;
    const match = token.match(/^frontier:(\d+)$/);
    if (!match) {
      throw new Error('Invalid continuation token');
    }
    return Number.parseInt(match[1], 10);
  }

  getObservationFacts(input: ObservationFactsInput = {}): ObservationFact[] {
    const sql = [
      'SELECT f.*',
      'FROM observation_facts f',
      'JOIN observations o ON o.id = f.observation_id',
      'WHERE o.deleted_at IS NULL',
    ];
    const params: Array<string | number> = [];

    if (input.observation_id !== undefined) {
      sql.push('AND f.observation_id = ?');
      params.push(input.observation_id);
    }

    if (input.project) {
      sql.push('AND f.project = ?');
      params.push(input.project);
    }

    if (input.topic_key) {
      sql.push('AND f.topic_key = ?');
      params.push(input.topic_key);
    }

    sql.push('ORDER BY f.id ASC');

    return this.db.prepare(sql.join(' ')).all(...params) as ObservationFact[];
  }

  rebuildObservationFacts(input: RebuildObservationFactsInput = {}): RebuildObservationFactsResult {
    const sql = [
      'SELECT * FROM observations',
      'WHERE deleted_at IS NULL',
    ];
    const params: string[] = [];

    if (input.project) {
      sql.push('AND project = ?');
      params.push(input.project);
    }

    sql.push('ORDER BY id ASC');

    const observations = this.mapObservationRows(
      this.db.prepare(sql.join(' ')).all(...params) as ObservationRow[]
    );
    let factsDeleted = 0;
    let factsCreated = 0;

    for (const observation of observations) {
      const result = this.replaceObservationFacts(observation);
      factsDeleted += result.deleted;
      factsCreated += result.created;
    }

    return {
      project: input.project ?? null,
      observations_scanned: observations.length,
      facts_deleted: factsDeleted,
      facts_created: factsCreated,
    };
  }

  getObservationVersions(observationId: number): ObservationVersion[] {
    return this.db
      .prepare('SELECT * FROM observation_versions WHERE observation_id = ? ORDER BY version_number DESC')
      .all(observationId) as ObservationVersion[];
  }

  // ── Project Migration ──

  migrateProject(oldProject: string, newProject: string): MigrateProjectResult {
    const migrate = this.db.transaction(() => {
      const sessions = this.db.prepare(
        'UPDATE sessions SET project = ? WHERE project = ?'
      ).run(newProject, oldProject);

      const observations = this.db.prepare(
        "UPDATE observations SET project = ?, updated_at = datetime('now') WHERE project = ?"
      ).run(newProject, oldProject);

      const prompts = this.db.prepare(
        'UPDATE user_prompts SET project = ? WHERE project = ?'
      ).run(newProject, oldProject);

      return {
        old_project: oldProject,
        new_project: newProject,
        sessions_updated: sessions.changes,
        observations_updated: observations.changes,
        prompts_updated: prompts.changes,
      };
    });

    return migrate();
  }

  deleteProject(project: string): DeleteProjectResult {
    const deleteProjectTxn = this.db.transaction((targetProject: string): DeleteProjectResult => {
      const sessions = this.db.prepare(
        'SELECT id FROM sessions WHERE project = ? ORDER BY id'
      ).all(targetProject) as Array<{ id: string }>;
      const sessionIds = sessions.map((session) => session.id);

      if (sessionIds.length > 0) {
        const placeholders = sessionIds.map(() => '?').join(', ');
        const sharedObservation = this.db.prepare(
          `SELECT session_id, project
           FROM observations
           WHERE session_id IN (${placeholders})
             AND (project IS NULL OR project != ?)
           LIMIT 1`
        ).get(...sessionIds, targetProject) as { session_id: string; project: string | null } | undefined;

        if (sharedObservation) {
          const foreignProject = sharedObservation.project ?? 'unknown';
          throw new Error(
            `Cannot delete project ${targetProject}: shared session ${sharedObservation.session_id} contains cross-project observation data (${foreignProject})`
          );
        }

        const sharedPrompt = this.db.prepare(
          `SELECT session_id, project
           FROM user_prompts
           WHERE session_id IN (${placeholders})
             AND (project IS NULL OR project != ?)
           LIMIT 1`
        ).get(...sessionIds, targetProject) as { session_id: string; project: string | null } | undefined;

        if (sharedPrompt) {
          const foreignProject = sharedPrompt.project ?? 'unknown';
          throw new Error(
            `Cannot delete project ${targetProject}: shared session ${sharedPrompt.session_id} contains cross-project prompt data (${foreignProject})`
          );
        }
      }

      const observations = this.db.prepare(
        'SELECT id, sync_id FROM observations WHERE project = ? ORDER BY id'
      ).all(targetProject) as Array<{ id: number; sync_id: string | null }>;
      const prompts = this.db.prepare(
        'SELECT id, sync_id FROM user_prompts WHERE project = ? ORDER BY id'
      ).all(targetProject) as Array<{ id: number; sync_id: string | null }>;

      const observationVersionsDeleted = (this.db.prepare(
        `SELECT COUNT(*) as count
         FROM observation_versions ov
         JOIN observations o ON o.id = ov.observation_id
         WHERE o.project = ?`
      ).get(targetProject) as { count: number }).count;

      for (const observation of observations) {
        this.recordMutation('delete', 'observation', observation.id, observation.sync_id, targetProject);
      }

      for (const prompt of prompts) {
        this.recordMutation('delete', 'prompt', prompt.id, prompt.sync_id, targetProject);
      }

      for (const session of sessions) {
        this.recordMutation('delete', 'session', 0, session.id, targetProject);
      }

      const deletedObservations = this.db.prepare(
        'DELETE FROM observations WHERE project = ?'
      ).run(targetProject);
      const deletedPrompts = this.db.prepare(
        'DELETE FROM user_prompts WHERE project = ?'
      ).run(targetProject);
      const deletedSessions = this.db.prepare(
        'DELETE FROM sessions WHERE project = ?'
      ).run(targetProject);

      return {
        project: targetProject,
        observations_deleted: deletedObservations.changes,
        observation_versions_deleted: observationVersionsDeleted,
        prompts_deleted: deletedPrompts.changes,
        sessions_deleted: deletedSessions.changes,
      };
    });

    return deleteProjectTxn(project);
  }

  // ── JSON Export/Import ──

  exportData(project?: string): ExportData {
    let sessions: Session[];
    let observationRows: ObservationRow[];
    let prompts: UserPrompt[];

    if (project) {
      sessions = this.db.prepare(
        'SELECT * FROM sessions WHERE project = ? ORDER BY started_at'
      ).all(project) as Session[];
      observationRows = this.db.prepare(
        'SELECT * FROM observations WHERE project = ? AND deleted_at IS NULL ORDER BY id'
      ).all(project) as ObservationRow[];
      prompts = this.db.prepare(
        'SELECT * FROM user_prompts WHERE project = ? ORDER BY id'
      ).all(project) as UserPrompt[];
    } else {
      sessions = this.db.prepare(
        'SELECT * FROM sessions ORDER BY started_at'
      ).all() as Session[];
      observationRows = this.db.prepare(
        'SELECT * FROM observations WHERE deleted_at IS NULL ORDER BY id'
      ).all() as ObservationRow[];
      prompts = this.db.prepare(
        'SELECT * FROM user_prompts ORDER BY id'
      ).all() as UserPrompt[];
    }

    const observations = this.mapObservationRows(observationRows);

    return {
      version: 1,
      exported_at: new Date().toISOString(),
      project,
      sessions,
      observations,
      prompts,
    };
  }

  importData(data: ExportData): ImportResult {
    let sessionsImported = 0;
    let observationsImported = 0;
    let promptsImported = 0;
    let skipped = 0;

    const doImport = this.db.transaction(() => {
      // Import sessions (skip if already exists)
      for (const session of data.sessions) {
        const result = this.db.prepare(
          `INSERT INTO sessions (id, project, directory, started_at, ended_at, summary)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`
        ).run(session.id, session.project, session.directory, session.started_at, session.ended_at, session.summary);
        if (result.changes > 0) sessionsImported++;
      }

      // Import observations (skip if sync_id already exists)
      for (const obs of data.observations) {
        if (obs.sync_id) {
          const existing = this.db.prepare(
            'SELECT id FROM observations WHERE sync_id = ?'
          ).get(obs.sync_id);
          if (existing) {
            skipped++;
            continue;
          }
        }

        this.ensureSession(obs.session_id, obs.project || 'unknown');

        this.db.prepare(
          `INSERT INTO observations (session_id, type, title, content, tool_name, project, scope, topic_key, normalized_hash, sync_id, revision_count, duplicate_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          obs.session_id, obs.type, obs.title, obs.content, obs.tool_name,
          obs.project, obs.scope, obs.topic_key, obs.normalized_hash,
          obs.sync_id || randomUUID(),
          obs.revision_count, obs.duplicate_count,
          obs.created_at, obs.updated_at
        );
        observationsImported++;
      }

      // Import prompts (skip if sync_id already exists)
      for (const prompt of data.prompts) {
        if (prompt.sync_id) {
          const existing = this.db.prepare(
            'SELECT id FROM user_prompts WHERE sync_id = ?'
          ).get(prompt.sync_id);
          if (existing) {
            skipped++;
            continue;
          }
        }

        this.ensureSession(prompt.session_id, prompt.project || 'unknown');

        this.db.prepare(
          `INSERT INTO user_prompts (session_id, content, project, sync_id, created_at)
           VALUES (?, ?, ?, ?, ?)`
        ).run(
          prompt.session_id, prompt.content, prompt.project,
          prompt.sync_id || randomUUID(),
          prompt.created_at
        );
        promptsImported++;
      }
    });

    doImport();

    return { sessions_imported: sessionsImported, observations_imported: observationsImported, prompts_imported: promptsImported, skipped };
  }

  applyV2Chunk(chunk: SyncChunkV2): { applied: number; skipped: number; deleted: number } {
    let applied = 0;
    let skipped = 0;
    let deleted = 0;

    const isRecord = (value: unknown): value is Record<string, unknown> => {
      return typeof value === 'object' && value !== null;
    };

    const asNullableString = (value: unknown): string | null => {
      if (value === null || value === undefined) {
        return null;
      }

      return typeof value === 'string' ? value : null;
    };

    const asPositiveInteger = (value: unknown, fallback: number): number => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        return fallback;
      }

      return value;
    };

    const isObservationType = (value: unknown): value is Observation['type'] => {
      return value === 'decision'
        || value === 'architecture'
        || value === 'bugfix'
        || value === 'pattern'
        || value === 'config'
        || value === 'discovery'
        || value === 'learning'
        || value === 'session_summary'
        || value === 'manual';
    };

    const isObservationScope = (value: unknown): value is Observation['scope'] => {
      return value === 'project' || value === 'personal';
    };

    const applyChunk = this.db.transaction((mutations: SyncChunkV2['mutations']) => {
      for (const mutation of mutations) {
        const syncId = mutation.sync_id;

        if (!syncId) {
          skipped++;
          continue;
        }

        if (mutation.operation === 'delete') {
          if (mutation.entity_type !== 'observation') {
            skipped++;
            continue;
          }

          const result = this.db.prepare(
            "UPDATE observations SET deleted_at = datetime('now') WHERE sync_id = ? AND deleted_at IS NULL"
          ).run(syncId);

          if (result.changes > 0) {
            applied++;
            deleted++;
          } else {
            skipped++;
          }

          continue;
        }

        if (!isRecord(mutation.data)) {
          skipped++;
          continue;
        }

        const data = mutation.data;

        if (mutation.operation === 'create') {
          if (mutation.entity_type === 'observation') {
            const existingObservation = this.db.prepare(
              'SELECT id FROM observations WHERE sync_id = ? LIMIT 1'
            ).get(syncId) as { id: number } | undefined;

            if (existingObservation) {
              skipped++;
              continue;
            }

            const sessionId = asNullableString(data.session_id);
            const typeValue = data.type;
            const title = asNullableString(data.title);
            const content = asNullableString(data.content);

            if (!sessionId || !title || !content || !isObservationType(typeValue)) {
              skipped++;
              continue;
            }

            const project = asNullableString(data.project);
            const scopeValue = data.scope;
            const scope = isObservationScope(scopeValue) ? scopeValue : 'project';
            const normalizedHash = asNullableString(data.normalized_hash) ?? computeHash(content);

            this.ensureSession(sessionId, project || 'unknown');

            this.db.prepare(
              `INSERT INTO observations (
                 session_id,
                 type,
                 title,
                 content,
                 tool_name,
                 project,
                 scope,
                 topic_key,
                 normalized_hash,
                 sync_id,
                 revision_count,
                 duplicate_count,
                 last_seen_at,
                 created_at,
                 updated_at,
                 deleted_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')), ?)`
            ).run(
              sessionId,
              typeValue,
              title,
              content,
              asNullableString(data.tool_name),
              project,
              scope,
              asNullableString(data.topic_key),
              normalizedHash,
              syncId,
              asPositiveInteger(data.revision_count, 1),
              asPositiveInteger(data.duplicate_count, 1),
              asNullableString(data.last_seen_at),
              asNullableString(data.created_at),
              asNullableString(data.updated_at),
              asNullableString(data.deleted_at)
            );

            applied++;
            continue;
          }

          if (mutation.entity_type === 'prompt') {
            const existingPrompt = this.db.prepare(
              'SELECT id FROM user_prompts WHERE sync_id = ? LIMIT 1'
            ).get(syncId) as { id: number } | undefined;

            if (existingPrompt) {
              skipped++;
              continue;
            }

            const sessionId = asNullableString(data.session_id);
            const content = asNullableString(data.content);

            if (!sessionId || !content) {
              skipped++;
              continue;
            }

            const project = asNullableString(data.project);
            this.ensureSession(sessionId, project || 'unknown');

            this.db.prepare(
              `INSERT INTO user_prompts (session_id, content, project, sync_id, created_at)
               VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))`
            ).run(
              sessionId,
              content,
              project,
              syncId,
              asNullableString(data.created_at)
            );

            applied++;
            continue;
          }

          if (mutation.entity_type === 'session') {
            const existingSession = this.db.prepare(
              'SELECT id FROM sessions WHERE id = ? LIMIT 1'
            ).get(syncId) as { id: string } | undefined;

            if (existingSession) {
              skipped++;
              continue;
            }

            const project = asNullableString(data.project) ?? 'unknown';

            this.db.prepare(
              `INSERT INTO sessions (id, project, directory, started_at, ended_at, summary)
               VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?, ?)`
            ).run(
              syncId,
              project,
              asNullableString(data.directory),
              asNullableString(data.started_at),
              asNullableString(data.ended_at),
              asNullableString(data.summary)
            );

            applied++;
            continue;
          }

          skipped++;
          continue;
        }

        if (mutation.operation === 'update') {
          if (mutation.entity_type === 'observation') {
            const existingObservation = this.db.prepare(
              'SELECT id FROM observations WHERE sync_id = ? AND deleted_at IS NULL LIMIT 1'
            ).get(syncId) as { id: number } | undefined;

            if (!existingObservation) {
              skipped++;
              continue;
            }

            const setClauses: string[] = [];
            const params: Array<string | number | null> = [];
            const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(data, key);

            if (has('session_id')) {
              const sessionId = asNullableString(data.session_id);
              if (!sessionId) {
                skipped++;
                continue;
              }

              const projectForSession = has('project') ? asNullableString(data.project) : null;
              this.ensureSession(sessionId, projectForSession || 'unknown');

              setClauses.push('session_id = ?');
              params.push(sessionId);
            }

            if (has('type')) {
              const typeValue = data.type;
              if (!isObservationType(typeValue)) {
                skipped++;
                continue;
              }
              setClauses.push('type = ?');
              params.push(typeValue);
            }

            if (has('title')) {
              const title = asNullableString(data.title);
              if (!title) {
                skipped++;
                continue;
              }
              setClauses.push('title = ?');
              params.push(title);
            }

            if (has('content')) {
              const content = asNullableString(data.content);
              if (!content) {
                skipped++;
                continue;
              }
              setClauses.push('content = ?');
              params.push(content);

              if (!has('normalized_hash')) {
                setClauses.push('normalized_hash = ?');
                params.push(computeHash(content));
              }
            }

            if (has('tool_name')) {
              setClauses.push('tool_name = ?');
              params.push(asNullableString(data.tool_name));
            }

            if (has('project')) {
              setClauses.push('project = ?');
              params.push(asNullableString(data.project));
            }

            if (has('scope')) {
              const scopeValue = data.scope;
              if (!isObservationScope(scopeValue)) {
                skipped++;
                continue;
              }
              setClauses.push('scope = ?');
              params.push(scopeValue);
            }

            if (has('topic_key')) {
              setClauses.push('topic_key = ?');
              params.push(asNullableString(data.topic_key));
            }

            if (has('normalized_hash')) {
              setClauses.push('normalized_hash = ?');
              params.push(asNullableString(data.normalized_hash));
            }

            if (has('revision_count')) {
              setClauses.push('revision_count = ?');
              params.push(asPositiveInteger(data.revision_count, 1));
            }

            if (has('duplicate_count')) {
              setClauses.push('duplicate_count = ?');
              params.push(asPositiveInteger(data.duplicate_count, 1));
            }

            if (has('last_seen_at')) {
              setClauses.push('last_seen_at = ?');
              params.push(asNullableString(data.last_seen_at));
            }

            if (has('created_at')) {
              const createdAt = asNullableString(data.created_at);
              if (!createdAt) {
                skipped++;
                continue;
              }
              setClauses.push('created_at = ?');
              params.push(createdAt);
            }

            if (has('updated_at')) {
              const updatedAt = asNullableString(data.updated_at);
              if (!updatedAt) {
                skipped++;
                continue;
              }
              setClauses.push('updated_at = ?');
              params.push(updatedAt);
            } else {
              setClauses.push("updated_at = datetime('now')");
            }

            if (setClauses.length === 0) {
              skipped++;
              continue;
            }

            params.push(existingObservation.id);
            const result = this.db.prepare(
              `UPDATE observations SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
            ).run(...params);

            if (result.changes > 0) {
              applied++;
            } else {
              skipped++;
            }

            continue;
          }

          if (mutation.entity_type === 'prompt') {
            const existingPrompt = this.db.prepare(
              'SELECT id FROM user_prompts WHERE sync_id = ? LIMIT 1'
            ).get(syncId) as { id: number } | undefined;

            if (!existingPrompt) {
              skipped++;
              continue;
            }

            const setClauses: string[] = [];
            const params: Array<string | null> = [];
            const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(data, key);

            if (has('session_id')) {
              const sessionId = asNullableString(data.session_id);
              if (!sessionId) {
                skipped++;
                continue;
              }

              const projectForSession = has('project') ? asNullableString(data.project) : null;
              this.ensureSession(sessionId, projectForSession || 'unknown');

              setClauses.push('session_id = ?');
              params.push(sessionId);
            }

            if (has('content')) {
              const content = asNullableString(data.content);
              if (!content) {
                skipped++;
                continue;
              }
              setClauses.push('content = ?');
              params.push(content);
            }

            if (has('project')) {
              setClauses.push('project = ?');
              params.push(asNullableString(data.project));
            }

            if (has('created_at')) {
              const createdAt = asNullableString(data.created_at);
              if (!createdAt) {
                skipped++;
                continue;
              }
              setClauses.push('created_at = ?');
              params.push(createdAt);
            }

            if (setClauses.length === 0) {
              skipped++;
              continue;
            }

            params.push(String(existingPrompt.id));
            const result = this.db.prepare(`UPDATE user_prompts SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

            if (result.changes > 0) {
              applied++;
            } else {
              skipped++;
            }

            continue;
          }

          if (mutation.entity_type === 'session') {
            const existingSession = this.db.prepare(
              'SELECT id FROM sessions WHERE id = ? LIMIT 1'
            ).get(syncId) as { id: string } | undefined;

            if (!existingSession) {
              skipped++;
              continue;
            }

            const setClauses: string[] = [];
            const params: Array<string | null> = [];
            const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(data, key);

            if (has('project')) {
              const project = asNullableString(data.project);
              if (!project) {
                skipped++;
                continue;
              }
              setClauses.push('project = ?');
              params.push(project);
            }

            if (has('directory')) {
              setClauses.push('directory = ?');
              params.push(asNullableString(data.directory));
            }

            if (has('started_at')) {
              const startedAt = asNullableString(data.started_at);
              if (!startedAt) {
                skipped++;
                continue;
              }
              setClauses.push('started_at = ?');
              params.push(startedAt);
            }

            if (has('ended_at')) {
              setClauses.push('ended_at = ?');
              params.push(asNullableString(data.ended_at));
            }

            if (has('summary')) {
              setClauses.push('summary = ?');
              params.push(asNullableString(data.summary));
            }

            if (setClauses.length === 0) {
              skipped++;
              continue;
            }

            params.push(syncId);
            const result = this.db.prepare(`UPDATE sessions SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

            if (result.changes > 0) {
              applied++;
            } else {
              skipped++;
            }

            continue;
          }

          skipped++;
          continue;
        }

        skipped++;
      }
    });

    applyChunk(chunk.mutations);

    return { applied, skipped, deleted };
  }

  isChunkImported(chunkId: string): boolean {
    const row = this.db.prepare(
      "SELECT 1 as imported FROM sync_chunks WHERE chunk_id = ? AND status = 'applied' LIMIT 1"
    ).get(chunkId) as { imported: number } | undefined;

    return row !== undefined;
  }

  recordSyncChunk(record: {
    chunk_id: string;
    payload_hash?: string;
    status: SyncChunkStatus;
    from_mutation_id?: number;
    to_mutation_id?: number;
    chunk_version?: number;
  }): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO sync_chunks (
         chunk_id,
         payload_hash,
         status,
         from_mutation_id,
         to_mutation_id,
         chunk_version
       ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      record.chunk_id,
      record.payload_hash ?? null,
      record.status,
      record.from_mutation_id ?? null,
      record.to_mutation_id ?? null,
      record.chunk_version ?? 1
    );
  }

  getExportWatermark(): number {
    const row = this.db.prepare(
      "SELECT MAX(to_mutation_id) as watermark FROM sync_chunks WHERE status = 'applied' AND chunk_version = 2"
    ).get() as { watermark: number | null };

    return row.watermark ?? 0;
  }

  getMutationsSince(fromId: number): SyncMutation[] {
    return this.db.prepare(
      'SELECT * FROM sync_mutations WHERE id > ? ORDER BY id ASC'
    ).all(fromId) as SyncMutation[];
  }

  getSyncChunks(): SyncChunkRecord[] {
    return this.db.prepare(
      'SELECT * FROM sync_chunks ORDER BY created_at ASC'
    ).all() as SyncChunkRecord[];
  }

  /**
   * Expose the raw database for use by utility functions (e.g., dedup checks).
   * This is the single owner of the DB connection,
   * but utility functions may need direct access for specific queries.
   */
  getDb(): Database.Database {
    return this.db;
  }
}
