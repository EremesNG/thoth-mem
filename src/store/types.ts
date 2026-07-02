/**
 * Strict observation type taxonomy — matches CHECK constraint in SQL schema.
 */
export const OBSERVATION_TYPES = [
  'decision', 'architecture', 'bugfix', 'pattern',
  'config', 'discovery', 'learning', 'session_summary', 'manual'
] as const;

export type ObservationType = typeof OBSERVATION_TYPES[number];

export type ObservationScope = 'project' | 'personal';
export type SearchMode = 'compact' | 'preview' | 'context';
export type VizDensityState = 'empty' | 'sparse' | 'dense';
export type VizSemanticState = 'ready' | 'pending' | 'degraded' | 'rebuilding';
export type OperationTraceOrigin = 'mcp' | 'http' | 'cli' | 'system';
export type OperationTraceStatus = 'ok' | 'error';

// ── Database Entities ──

export interface Session {
  id: string;
  project: string;
  directory: string | null;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
}

export interface Observation {
  id: number;
  sync_id: string | null;
  session_id: string;
  type: ObservationType;
  title: string;
  content: string;
  tool_name: string | null;
  project: string | null;
  scope: ObservationScope;
  topic_key: string | null;
  normalized_hash: string | null;
  revision_count: number;
  duplicate_count: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ObservationVersion {
  id: number;
  observation_id: number;
  title: string;
  content: string;
  type: ObservationType;
  version_number: number;
  created_at: string;
}

export interface UserPrompt {
  id: number;
  sync_id: string | null;
  session_id: string;
  content: string;
  project: string | null;
  created_at: string;
}

export interface OperationTrace {
  id: number;
  trace_id: string;
  origin: OperationTraceOrigin;
  target: string;
  status: OperationTraceStatus;
  project: string | null;
  session_id: string | null;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  request_json: string;
  response_json: string | null;
  error: string | null;
  request_truncated: boolean;
  response_truncated: boolean;
  created_at: string;
}

export interface SearchResult extends Observation {
  rank: number;
  preview: string;
}

export interface ObservationFact {
  id: number;
  observation_id: number;
  subject: string;
  relation: string;
  object: string;
  project: string | null;
  topic_key: string | null;
  type: ObservationType;
  created_at: string;
  superseded?: boolean;
}

export interface TopicKeySummary {
  topic_key: string;
  project: string | null;
  title: string;
  type: ObservationType;
  observation_count: number;
  updated_at: string;
}

// ── Operation Inputs ──

export interface SaveObservationInput {
  title: string;
  content: string;
  type?: ObservationType;
  session_id?: string;
  project?: string;
  scope?: ObservationScope;
  topic_key?: string;
}

export interface SearchInput {
  query: string;
  type?: ObservationType;
  project?: string;
  session_id?: string;
  scope?: ObservationScope;
  limit?: number;
  mode?: SearchMode;
  max_chars?: number;
  topic_key_exact?: string;
}

export interface ObservationFactsInput {
  observation_id?: number;
  project?: string;
  topic_key?: string;
  include_superseded?: boolean;
}

export interface RebuildObservationFactsInput {
  project?: string;
}

export interface ContextInput {
  project?: string;
  session_id?: string;
  scope?: ObservationScope;
  limit?: number;
  maxOutputChars?: number;
}

export interface TimelineInput {
  observation_id: number;
  before?: number;
  after?: number;
}

export interface UpdateObservationInput {
  id: number;
  title?: string;
  content?: string;
  type?: ObservationType;
  project?: string;
  scope?: ObservationScope;
  topic_key?: string;
}

export interface SaveOperationTraceInput {
  trace_id?: string;
  origin: OperationTraceOrigin;
  target: string;
  status: OperationTraceStatus;
  project?: string | null;
  session_id?: string | null;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  request: unknown;
  response?: unknown;
  error?: string | null;
  max_payload_chars?: number;
}

export interface ListOperationTracesInput {
  origin?: OperationTraceOrigin;
  target?: string;
  status?: OperationTraceStatus;
  project?: string;
  session_id?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

// ── Sync Mutation Types ──

export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncEntityType = 'observation' | 'prompt' | 'session';

export interface SyncMutation {
  id: number;
  operation: SyncOperation;
  entity_type: SyncEntityType;
  entity_id: number;
  sync_id: string | null;
  project: string | null;
  created_at: string;
}

// ── Sync Chunk Tracking Types ──

export type SyncChunkStatus = 'applied' | 'skipped' | 'failed';

export interface SyncChunkRecord {
  id: number;
  chunk_id: string;
  payload_hash: string | null;
  status: SyncChunkStatus;
  from_mutation_id: number | null;
  to_mutation_id: number | null;
  chunk_version: number;
  created_at: string;
}

// ── V2 Chunk Format Types ──

export interface SyncMutationEnvelopeV2 {
  operation: SyncOperation;
  entity_type: SyncEntityType;
  entity_id: number;
  sync_id: string | null;
  data: Record<string, unknown> | null;
}

export interface SyncChunkV2 {
  version: 2;
  chunk_id: string;
  from_mutation_id: number;
  to_mutation_id: number;
  created_at: string;
  mutations: SyncMutationEnvelopeV2[];
}

export interface SyncChunkV1 {
  version?: 1;
  sessions: unknown[];
  observations: unknown[];
  prompts: unknown[];
}

export type SyncChunk = SyncChunkV1 | SyncChunkV2;

// ── Operation Results ──

export interface SaveResult {
  observation: Observation;
  action: 'created' | 'deduplicated' | 'upserted';
}

export interface PaginatedContent {
  content: string;
  total_length: number;
  returned_from: number;
  returned_to: number;
  has_more: boolean;
}

export interface StatsResult {
  total_sessions: number;
  total_observations: number;
  total_prompts: number;
  projects: string[];
}

export interface CaptureResult {
  extracted: number;
  saved: number;
  duplicates: number;
}

export interface TimelineResult {
  before: Observation[];
  focus: Observation | null;
  after: Observation[];
}

export interface OperationTraceListResult {
  traces: OperationTrace[];
  total: number;
}

// ── Export/Import/Migration Results ──

export interface ExportData {
  version: number;
  exported_at: string;
  project?: string;
  sessions: Session[];
  observations: Observation[];
  prompts: UserPrompt[];
}

export interface ImportResult {
  sessions_imported: number;
  observations_imported: number;
  prompts_imported: number;
  skipped: number;
}

export interface MigrateProjectResult {
  old_project: string;
  new_project: string;
  sessions_updated: number;
  observations_updated: number;
  prompts_updated: number;
}

export interface DeleteProjectResult {
  project: string;
  observations_deleted: number;
  observation_versions_deleted: number;
  prompts_deleted: number;
  sessions_deleted: number;
}

export interface RebuildObservationFactsResult {
  project: string | null;
  observations_scanned: number;
  facts_deleted: number;
  facts_created: number;
}

export interface PruneSupersededTriplesInput {
  project?: string;
  dryRun?: boolean;
}

export interface PruneSupersededTriplesResult {
  project: string | null;
  dry_run: boolean;
  slots_scanned: number;
  triples_pruned: number;
  entities_pruned: number;
  dangling_refs_nulled: number;
  superseded_before: number;
  superseded_after: number;
}

export type CommunityState = 'disabled' | 'missing' | 'fresh' | 'stale' | 'rebuilding' | 'failed' | 'empty' | 'degraded';
export type CommunityRunStatus = 'running' | 'committed' | 'failed';
export type CommunityAlgorithmName = 'connected_components';

export interface RebuildCommunitySummariesInput {
  project: string;
}

export interface PreviewCommunitySummariesInput {
  project: string;
  limit?: number;
  maxChars?: number;
}

export interface CommunityStateInput {
  project: string;
}

export interface CommunityRetrievalInput {
  project: string;
  limit?: number;
  maxChars?: number;
}

export interface DropCommunitySummariesInput {
  project?: string;
}

export interface CommunitySummarySnapshot {
  community_id: string;
  level: number;
  summary_text: string;
  entity_count: number;
  triple_count: number;
  source_observation_count: number;
  top_entities: string[];
  top_relations: string[];
  source_observation_ids: number[];
  confidence: number;
  degraded: boolean;
  degraded_reasons: string[];
}

export interface CommunityRebuildResult {
  project: string | null;
  run_id: number;
  status: CommunityRunStatus;
  freshness: CommunityState;
  algorithm: CommunityAlgorithmName;
  graph_signature: string | null;
  communities_created: number;
  entities_scanned: number;
  triples_scanned: number;
  source_observations_scanned: number;
  degraded_reasons: string[];
  error?: string;
}

export interface CommunityPreviewResult {
  project: string | null;
  state: CommunityState;
  would_commit: false;
  graph_signature: string | null;
  communities: CommunitySummarySnapshot[];
  entities_scanned: number;
  triples_scanned: number;
  source_observations_scanned: number;
  truncated: boolean;
  degraded_reasons: string[];
}

export interface CommunityStateResult {
  project: string | null;
  state: CommunityState;
  run_id: number | null;
  latest_committed_run_id: number | null;
  graph_signature: string | null;
  current_graph_signature: string | null;
  communities_count: number;
  entities_count: number;
  triples_count: number;
  source_observations_count: number;
  degraded: boolean;
  degraded_reasons: string[];
  error: string | null;
  updated_at: string | null;
}

export interface CommunityRetrievalResult {
  project: string | null;
  state: CommunityState;
  run_id: number | null;
  graph_signature: string | null;
  candidates: CommunitySummarySnapshot[];
  degraded_reasons: string[];
}

export interface DropCommunitySummariesResult {
  project: string | null;
  runs_deleted: number;
  communities_deleted: number;
  members_deleted: number;
  evidence_deleted: number;
}

export type MaintenanceMode = 'dry-run' | 'apply';
export type MaintenanceSourceKind = 'observation' | 'prompt' | 'session_summary';
export type MaintenanceDecayState = 'active' | 'attenuated' | 'suppressed';

export type MaintenanceScope =
  | { all: true }
  | { project: string }
  | { topic_key: string }
  | { topic_prefix: string };

export interface MaintenanceInput {
  scope?: MaintenanceScope;
  mode?: MaintenanceMode;
}

export interface MaintenanceSourceRef {
  kind: MaintenanceSourceKind;
  id: number;
}

export interface MaintenanceConsolidationCandidate {
  cluster_key: string;
  canonical: MaintenanceSourceRef;
  members: MaintenanceSourceRef[];
  reason_class: string;
  review_required: boolean;
  signal: Record<string, unknown>;
}

export interface MaintenanceReflectionCandidate {
  source_set_hash: string;
  topic_key: string;
  title: string;
  content: string;
  sources: MaintenanceSourceRef[];
  reason_class: string;
  existing_observation_id: number | null;
  planned_observation_id?: number;
}

export interface MaintenanceDecayCandidate {
  source: MaintenanceSourceRef;
  score: number;
  state: MaintenanceDecayState;
  reason_class: string;
  policy: Record<string, unknown>;
}

export interface MaintenanceCounts {
  records_scanned: number;
  consolidation_candidates: number;
  reflection_candidates: number;
  decay_candidates: number;
  review_required: number;
}

export interface MaintenanceRunPreview {
  dry_run: true;
  scope: MaintenanceScope;
  counts: MaintenanceCounts;
  consolidations: MaintenanceConsolidationCandidate[];
  reflections: MaintenanceReflectionCandidate[];
  decays: MaintenanceDecayCandidate[];
  degraded: string[];
}

export interface MaintenanceRunResult {
  dry_run: false;
  run_id: number;
  scope: MaintenanceScope;
  counts: MaintenanceCounts;
  consolidations: MaintenanceConsolidationCandidate[];
  reflections: MaintenanceReflectionCandidate[];
  decays: MaintenanceDecayCandidate[];
  degraded: string[];
}

export interface VizSliceRequest {
  project?: string;
  session_id?: string;
  topic_key?: string;
  type?: ObservationType;
  observation_type?: ObservationType;
  relation?: string;
  query?: string;
  depth?: number;
  max_nodes?: number;
  max_edges?: number;
  cursor?: string;
}

export interface VizExpandRequest {
  node_id: string;
  project?: string;
  session_id?: string;
  topic_key?: string;
  type?: ObservationType;
  observation_type?: ObservationType;
  relation?: string;
  query?: string;
  depth?: number;
  max_nodes?: number;
  max_edges?: number;
  cursor?: string;
}

export interface VizNode {
  id: string;
  kind: 'observation' | 'fact' | 'session' | 'project' | 'topic';
  label: string;
  snippet: string;
  project: string | null;
  session_id?: string | null;
  topic_key: string | null;
  type: ObservationType | null;
  seed_x: number;
  seed_y: number;
}

export interface VizEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation: string;
  kind?: 'semantic' | 'metadata' | 'fact';
  label: string;
  summary: string;
}

export interface VizHealthResponse {
  semantic_state: VizSemanticState;
  pending_jobs: number;
  semantic: {
    lanes: Array<{
      lane: string;
      pending: boolean;
      degraded: boolean;
      stale: boolean;
      last_ready_at: string | null;
      updated_at: string | null;
    }>;
    jobs: {
      total: number;
      pending: number;
      running: number;
      done: number;
      failed: number;
      oldest_pending_at: string | null;
      queue_lag_ms: number | null;
      by_kind: Array<{
        kind: string;
        total: number;
        pending: number;
        running: number;
        done: number;
        failed: number;
        oldest_pending_at: string | null;
        oldest_pending_age_ms: number | null;
      }>;
    };
    coverage: {
      observations: number;
      chunks: number;
      sentences: number;
      chunk_vectors: number;
      sentence_vectors: number;
      chunk_coverage: number;
      sentence_coverage: number;
    };
    recent_errors: Array<{
      id: number;
      job_key: string;
      kind: string;
      state: string;
      attempt_count: number;
      last_error: string | null;
    }>;
  };
}

export interface VizSliceResponse {
  nodes: VizNode[];
  edges: VizEdge[];
  state: VizDensityState;
  continuation: string | null;
  truncated: boolean;
  health: VizHealthResponse;
}

export interface VizInspectNodeResponse {
  id: string;
  kind: VizNode['kind'];
  label: string;
  snippet: string;
  metadata: Record<string, unknown>;
  links: string[];
}

export interface VizInspectEdgeResponse {
  id: string;
  source_id: string;
  target_id: string;
  relation: string;
  label: string;
  summary: string;
}

export interface VizFiltersResponse {
  projects: string[];
  sessions: string[];
  topic_keys: string[];
  types: ObservationType[];
  relations: string[];
}

export type ObservatoryLane = 'lexical' | 'sentence-vector' | 'chunk-vector' | 'fact-kg';
export type ObservatoryLaneStateReason =
  | 'ok'
  | 'no-query'
  | 'no-evidence'
  | 'semantic-pending'
  | 'semantic-stale'
  | 'semantic-degraded'
  | 'kg-no-match'
  | 'unsupported-sync';
export type ObservatoryLaneStateStatus = 'ready' | 'pending' | 'degraded' | 'unavailable';
export type ObservatoryPivotTarget = 'map' | 'timeline' | 'ledger' | 'recall';
export type ObservatoryFrontierReason = 'limit' | 'no-neighbors' | 'scope-filtered';

export interface ObservatoryScope {
  project?: string;
  session_id?: string;
  topic_key?: string;
  query?: string;
  type?: ObservationType;
  observation_type?: ObservationType;
  relation?: string;
  time_from?: string;
  time_to?: string;
}

export interface ObservatoryContextResponse {
  scope: ObservatoryScope;
  context_token: string;
  health: VizHealthResponse;
  capabilities: {
    viz_fallback_available: boolean;
    observatory_routes_available: boolean;
  };
}

export interface ObservatoryRecallHit {
  observation_id: number;
  title: string;
  preview: string;
  type: ObservationType;
  project: string | null;
  session_id: string;
  topic_key: string | null;
  created_at: string;
  lane: ObservatoryLane;
  pivot_token: string;
}

export interface ObservatoryRecallResponse {
  context_token: string;
  lanes: Record<ObservatoryLane, ObservatoryRecallHit[]>;
  lane_states?: Partial<Record<ObservatoryLane, { status: ObservatoryLaneStateStatus; reason: ObservatoryLaneStateReason }>>;
}

export interface ObservatoryFrontierState {
  added_node_ids: string[];
  already_visible_node_ids: string[];
  exhausted: boolean;
  continuation: string | null;
  reason?: ObservatoryFrontierReason;
}

export interface ObservatoryMapFrontierResponse {
  nodes: VizNode[];
  edges: VizEdge[];
  frontier_state: ObservatoryFrontierState;
  health: VizHealthResponse;
}

export interface ObservatoryLedgerResponse {
  observation_id: number;
  title: string;
  type: ObservationType;
  what: string[];
  why: string[];
  where: string[];
  learned: string[];
  facts: ObservationFact[];
  provenance: {
    session_id: string;
    project: string | null;
    topic_key: string | null;
    created_at: string;
  };
}

export interface ObservatoryTimelineResponse {
  context_token: string;
  events: Observation[];
  continuation: string | null;
}
