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
}

export interface RebuildObservationFactsInput {
  project?: string;
}

export interface ContextInput {
  project?: string;
  session_id?: string;
  scope?: ObservationScope;
  limit?: number;
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
