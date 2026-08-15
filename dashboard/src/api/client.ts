export interface Session {
  id: string;
  project: string;
  directory: string | null;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
}

export type ObservationType =
  | 'decision'
  | 'architecture'
  | 'bugfix'
  | 'pattern'
  | 'config'
  | 'discovery'
  | 'learning'
  | 'session_summary'
  | 'manual';

export type ObservationScope = 'project' | 'personal';

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
  revision_count: number;
  duplicate_count: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UserPrompt {
  id: number;
  sync_id: string | null;
  session_id: string;
  content: string;
  project: string | null;
  created_at: string;
}

export interface Stats {
  sessions: number;
  observations: number;
  prompts: number;
  projects: string[];
}

export interface VersionResponse {
  version: string;
}

export type OperationOrigin = 'http' | 'mcp' | 'cli';
export type OperationKind = 'read' | 'write' | 'admin' | 'sync' | 'indexing';
export type OperationTraceOrigin = 'mcp' | 'http' | 'cli' | 'system';
export type OperationTraceStatus = 'ok' | 'error';

export interface OperationCatalogEntry {
  id: string;
  origin: OperationOrigin;
  label: string;
  kind: OperationKind;
  method?: string;
  path?: string;
  target?: string;
  description: string;
}

export interface OperationCatalogResponse {
  operations: OperationCatalogEntry[];
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

export interface OperationTraceListResponse {
  traces: OperationTrace[];
  total: number;
}

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
  jobs: Array<{ state: string; kind: string; count: number }>;
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
  totals: { total: number; pending: number; running: number; done: number; failed: number };
  coverage: {
    observations: number;
    chunks: number;
    sentences: number;
    chunkVectors: number;
    sentenceVectors: number;
  };
  recentErrors: Array<{ id: number; jobKey: string; kind: string; state: string; attemptCount: number; lastError: string | null }>;
}

export interface IndexStatusResponse {
  project: string | null;
  state: { pending: boolean; degraded: boolean; stale: boolean; degradedReason: string | null };
  progress: SemanticIndexProgress;
  health: VizHealthResponse;
}

export interface RebuildIndexRequest {
  project?: string;
  reason?: string;
  process_limit?: number;
}

export interface RebuildIndexResponse extends IndexStatusResponse {
  queued: boolean;
  dedupe_key: string;
  processed: number;
}

export interface RebuildGraphResponse {
  project: string | null;
  observations_scanned: number;
  facts_deleted: number;
  facts_created: number;
}

interface OpenApiInfoResponse {
  info?: {
    version?: unknown;
  };
}

export interface ContextResponse {
  sessions: Session[];
  observations: Observation[];
  prompts: UserPrompt[];
  stats: Stats;
}

export interface SearchResultItem {
  id: number;
  title: string;
  type: ObservationType;
  created_at: string;
  project?: string;
  scope?: ObservationScope;
  topic_key?: string | null;
  preview?: string;
}

export interface SearchResponse {
  results: SearchResultItem[];
  total: number;
}

export interface ObservationDetailResponse extends Observation {
  pagination?: {
    total_length: number;
    returned_from: number;
    returned_to: number;
    has_more: boolean;
    next_offset?: number;
  };
}

export interface TimelineResponse {
  focus: Observation;
  before: Observation[];
  after: Observation[];
}

export interface ProjectSummaryResponse {
  project: string;
  text: string;
}

export interface TopicKeySummary {
  topic_key: string;
  project: string | null;
  title: string;
  type: ObservationType;
  observation_count: number;
  updated_at: string;
}

export interface ProjectTopicKeysResponse {
  project: string;
  topic_key?: string;
  topics?: TopicKeySummary[];
  text: string;
}

export interface ProjectGraphFact {
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

export interface ProjectGraphSummary {
  shown: number;
  total: number;
  omitted: number;
  truncated: boolean;
  text_truncated: boolean;
  limit: number;
  max_chars: number;
  filters: {
    topic_key?: string;
    relation?: string;
  };
}

export interface ProjectGraphResponse {
  project: string;
  text: string;
  facts: ProjectGraphFact[];
  summary: ProjectGraphSummary;
}

export type VizDensityState = 'empty' | 'sparse' | 'dense';
export type VizSemanticState = 'ready' | 'pending' | 'degraded' | 'rebuilding';
export interface VizHealthResponse {
  semantic_state: VizSemanticState;
  pending_jobs: number;
  semantic?: {
    lanes: Array<{ lane: string; pending: boolean; degraded: boolean; stale: boolean; last_ready_at: string | null; updated_at: string | null }>;
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
    recent_errors: Array<{ id: number; job_key: string; kind: string; state: string; attempt_count: number; last_error: string | null }>;
  };
}
export interface VizNode { id: string; kind: 'community' | 'observation' | 'fact' | 'session' | 'project' | 'topic'; label: string; snippet: string; project: string | null; session_id?: string | null; topic_key: string | null; type: ObservationType | null; seed_x: number; seed_y: number; semantic_level?: AtlasLevel; community_id?: string | null; owner_project_id?: string | null; region_id?: string | null; representative_reason?: string; representative_signals?: SemanticAtlasRepresentativeSignal[]; representative_rank?: number; member_count?: number | null; project_count?: number | null; unclustered?: boolean; }
export interface VizEdge { id: string; source_id: string; target_id: string; relation: string; kind?: 'aggregate' | 'semantic' | 'metadata' | 'fact'; label: string; summary: string; weight?: number; evidence_count?: number; tier?: 'representative-backbone' | 'representative-semantic' | 'fact-support' | 'metadata'; relationship_class?: 'aggregate' | 'semantic' | 'fact' | 'metadata' | 'unknown'; direction?: 'directed' | 'undirected' | 'mixed' | 'unknown'; confidence?: 'high' | 'medium' | 'low' | 'unknown'; provenance?: SemanticAtlasRelationshipProvenance[]; }
export interface VizSliceResponse { nodes: VizNode[]; edges: VizEdge[]; state: VizDensityState; continuation: string | null; truncated: boolean; health: VizHealthResponse; }
export interface VizGraphPageRequest {
  project?: string;
  session_id?: string;
  topic_key?: string;
  type?: ObservationType;
  observation_type?: ObservationType;
  relation?: string;
  query?: string;
  page_size?: number;
  cursor?: string;
}
export type VizGraphPageResponse = VizSliceResponse;
export type AtlasHierarchy = 'global' | 'project';
export type AtlasLevel = 'universe' | 'project' | 'community' | 'neighborhood';
export type AtlasFacetKind = 'project' | 'session' | 'topic';
export interface AtlasFacetRef { kind: AtlasFacetKind; token: string; label: string; }
export interface AtlasFacetOption extends AtlasFacetRef { count: number; }
export interface AtlasTokenScope {
  project: AtlasFacetRef | null;
  session: AtlasFacetRef | null;
  topic: AtlasFacetRef | null;
  type: ObservationType | null;
  relation: string | null;
  query: string | null;
  time_from: string | null;
  time_to: string | null;
}
export interface SemanticAtlasPageRequest {
  hierarchy?: AtlasHierarchy;
  level?: AtlasLevel;
  project_id?: string;
  project_token?: string;
  session_token?: string;
  topic_token?: string;
  type?: ObservationType;
  observation_type?: ObservationType;
  relation?: string;
  query?: string;
  community_id?: string;
  focus_node_id?: string;
  depth?: 1 | 2;
  page_size?: number;
  cursor?: string;
  presentation?: 'complete' | 'semantic-zoom';
  region_id?: string;
}
export interface SemanticAtlasNode {
  id: string;
  kind: 'community' | 'observation' | 'fact' | 'session' | 'project' | 'topic';
  label: string;
  snippet: string;
  project: AtlasFacetRef | null;
  session: AtlasFacetRef | null;
  topic: AtlasFacetRef | null;
  type: ObservationType | null;
  community_id: string | null;
  owner_project_id: string | null;
  region_id?: string | null;
  member_count: number | null;
  project_count: number | null;
  unclustered: boolean;
  seed_x: number;
  seed_y: number;
}
export interface SemanticAtlasEdge {
  id: string;
  source_id: string;
  target_id: string;
  kind: 'aggregate' | 'semantic' | 'fact' | 'metadata';
  relation: string;
  label: string;
  summary: string;
  weight: number;
  evidence_count: number;
  tier: 'representative-backbone' | 'representative-semantic' | 'fact-support' | 'metadata';
  relationship_class: 'aggregate' | 'semantic' | 'fact' | 'metadata' | 'unknown';
  direction: 'directed' | 'undirected' | 'mixed' | 'unknown';
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  provenance: SemanticAtlasRelationshipProvenance[];
}
export type SemanticAtlasRepresentativeSignal = 'structural' | 'bridge' | 'recency' | 'confidence' | 'diversity';
export interface SemanticAtlasRelationshipProvenance {
  source_kind: 'kg-triple' | 'legacy-fact' | 'community-aggregate' | 'unknown';
  source_id: string;
  relation: string;
  evidence_count: number;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
}
export interface SemanticAtlasRegion {
  id: string; community_id: string; label: string; summary: string; member_count: number;
  project_count: number; time_from: string | null; time_to: string | null;
  concepts: Array<{ label: string; count: number }>;
  facets: { projects: AtlasFacetOption[]; sessions: AtlasFacetOption[]; topics: AtlasFacetOption[]; types: Array<{ value: ObservationType; count: number }> };
  representatives: Array<{ node_id: string; reason: string; signals: SemanticAtlasRepresentativeSignal[]; rank: number }>;
  seed_x: number; seed_y: number; unclustered: boolean;
}
export interface SemanticAtlasRegionBridge {
  id: string; source_region_id: string; target_region_id: string; tier: 'region-aggregate';
  relationship_class: 'aggregate'; direction: 'directed' | 'undirected' | 'mixed' | 'unknown';
  weight: number; evidence_count: number; relations: string[]; confidence: 'high' | 'medium' | 'low' | 'unknown';
  representative_edge_ids: string[]; provenance: SemanticAtlasRelationshipProvenance[];
}
export interface SemanticAtlasProjectRegion {
  id: string; label: string; summary: string; memory_count: number; constellation_count: number;
  visible_constellation_count: number; omitted_constellation_count: number; constellation_ids: string[];
  seed_x: number; seed_y: number; unassigned: boolean;
}
export interface SemanticAtlasProjectBridge {
  id: string; source_project_id: string; target_project_id: string; tier: 'project-aggregate';
  relationship_class: 'aggregate'; direction: 'directed' | 'undirected' | 'mixed' | 'unknown';
  weight: number; evidence_count: number; relations: string[]; confidence: 'high' | 'medium' | 'low' | 'unknown';
  representative_edge_ids: string[]; provenance: SemanticAtlasRelationshipProvenance[];
}
export interface SemanticAtlasPageResponse {
  hierarchy: AtlasHierarchy;
  level: AtlasLevel;
  generation: string;
  presentation_key?: string;
  presentation: 'complete' | 'semantic-zoom';
  nodes: SemanticAtlasNode[];
  edges: SemanticAtlasEdge[];
  regions: SemanticAtlasRegion[];
  region_bridges: SemanticAtlasRegionBridge[];
  project_regions: SemanticAtlasProjectRegion[];
  project_bridges: SemanticAtlasProjectBridge[];
  counts: {
    memory_count: number;
    project_count: number;
    community_count: number;
    assigned_memory_count: number;
    unclustered_memory_count: number;
    supporting_entity_count: number;
    relationship_count: number;
    raw_entity_count: number;
    raw_relationship_count: number;
  };
  coverage: {
    state: 'fresh' | 'stale' | 'missing' | 'rebuilding' | 'failed' | 'degraded';
    projection_source: 'deterministic-kg' | 'deterministic-unclustered';
    summary_state: 'fresh' | 'stale' | 'missing' | 'rebuilding' | 'failed' | 'degraded';
    observations_with_kg: number;
    observations_without_kg: number;
    degraded_reasons: string[];
  };
  facets: {
    projects: AtlasFacetOption[];
    sessions: AtlasFacetOption[];
    topics: AtlasFacetOption[];
    types: ObservationType[];
    relations: string[];
  };
  navigation: {
    project_id: string | null;
    community_id: string | null;
    focus_node_id: string | null;
    depth: 1 | 2 | null;
    region_id: string | null;
    source_project_count: number;
    visible_project_count: number;
    omitted_projects: number;
    source_constellation_count: number;
    visible_constellation_count: number;
    omitted_constellations: number;
    source_memory_count: number;
    visible_memory_count: number;
    source_relationship_count: number;
    visible_relationship_count: number;
    represented_source_relationship_count: number;
    omitted_nodes: number;
    omitted_edges: number;
    raw_rich_render_safe: boolean;
    raw_rich_render_limit: number;
    scope: { project: AtlasFacetRef | null; session: AtlasFacetRef | null; topic: AtlasFacetRef | null; type: ObservationType | null; relation: string | null };
  };
  continuation: string | null;
  truncated: boolean;
  health: VizHealthResponse;
}
export interface VizInspectNodeResponse { id: string; kind: VizNode['kind']; label: string; snippet: string; metadata: Record<string, unknown>; links: string[]; }
export interface VizInspectEdgeResponse { id: string; source_id: string; target_id: string; relation: string; label: string; summary: string; }
export interface VizFiltersResponse { projects: string[]; sessions: string[]; topic_keys: string[]; types: ObservationType[]; relations: string[]; }
export type ObservatoryLane = 'lexical' | 'sentence-vector' | 'chunk-vector' | 'fact-kg';
export interface ObservatoryScope {
  project_token?: string;
  session_token?: string;
  topic_token?: string;
  query?: string;
  type?: ObservationType;
  observation_type?: ObservationType;
  relation?: string;
  time_from?: string;
  time_to?: string;
}
export interface ObservatoryContextResponse {
  scope: AtlasTokenScope;
  context_token: string;
  health: VizHealthResponse;
  capabilities: { viz_fallback_available: boolean; observatory_routes_available: boolean };
}
export interface ObservatoryRecallHit {
  observation_id: number;
  title: string;
  preview: string;
  type: ObservationType;
  project: AtlasFacetRef | null;
  session: AtlasFacetRef | null;
  topic: AtlasFacetRef | null;
  community_id: string;
  project_id: string | null;
  created_at: string;
  lane: ObservatoryLane;
  pivot_token: string;
}
export interface ObservatoryRecallResponse {
  context_token: string;
  lanes: Record<ObservatoryLane, ObservatoryRecallHit[]>;
}
export interface ObservatoryPivotResponse {
  hierarchy: AtlasHierarchy;
  context_token: string;
  scope: AtlasTokenScope;
  focus_node_id: string;
  community_id: string;
  project_id: string | null;
  target: 'map' | 'timeline' | 'ledger' | 'recall';
}
export interface ObservatoryFrontierState {
  added_node_ids: string[];
  already_visible_node_ids: string[];
  exhausted: boolean;
  continuation: string | null;
  reason?: 'limit' | 'no-neighbors' | 'scope-filtered';
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
  facts: ProjectGraphFact[];
  provenance: { session_id: string; project: string | null; topic_key: string | null; created_at: string };
}
export interface ObservatoryTimelineResponse {
  context_token: string;
  events: Observation[];
  continuation: string | null;
}

type ProjectGraphResponsePayload = Partial<Omit<ProjectGraphResponse, 'summary'>> & {
  summary?: Partial<ProjectGraphSummary>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasTruncationMarker(text: string): boolean {
  return text.includes('Output truncated by max_chars.') || text.toLowerCase().includes('truncated');
}

/**
 * Normalizes graph-lite responses at the HTTP boundary.
 *
 * The current backend contract is structured (`facts` + `summary`), but a stale
 * dev/proxy backend can still return the legacy `{ project, text }` shape.
 */
export function normalizeProjectGraphResponse(payload: ProjectGraphResponsePayload): ProjectGraphResponse {
  const facts = Array.isArray(payload.facts) ? payload.facts : [];
  const text = typeof payload.text === 'string' ? payload.text : '';
  const summary = isRecord(payload.summary) ? payload.summary : {};
  const fallbackCount = facts.length;
  const fallbackTruncated = hasTruncationMarker(text);

  return {
    project: typeof payload.project === 'string' ? payload.project : '',
    text,
    facts,
    summary: {
      shown: isNumber(summary.shown) ? summary.shown : fallbackCount,
      total: isNumber(summary.total) ? summary.total : fallbackCount,
      omitted: isNumber(summary.omitted) ? summary.omitted : 0,
      truncated: typeof summary.truncated === 'boolean' ? summary.truncated : fallbackTruncated,
      text_truncated: typeof summary.text_truncated === 'boolean' ? summary.text_truncated : fallbackTruncated,
      limit: isNumber(summary.limit) ? summary.limit : 0,
      max_chars: isNumber(summary.max_chars) ? summary.max_chars : 0,
      filters: isRecord(summary.filters)
        ? {
            ...(typeof summary.filters.topic_key === 'string' ? { topic_key: summary.filters.topic_key } : {}),
            ...(typeof summary.filters.relation === 'string' ? { relation: summary.filters.relation } : {}),
          }
        : {},
    },
  };
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

// Helper to handle fetch responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const bodyText = await response.text();
    let body: any = bodyText;

    try {
      body = bodyText ? JSON.parse(bodyText) : bodyText;
    } catch {
    }

    throw new ApiError(
      response.status,
      body?.error || body?.message || (typeof bodyText === 'string' && bodyText.trim() ? bodyText : response.statusText) || `HTTP error ${response.status}`,
      body
    );
  }
  return response.json() as Promise<T>;
}

// Base fetch with optional abort signal
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  // In production, the dashboard is served from the same origin as the HTTP server.
  // In development, Vite proxies requests to http://localhost:7438.
  const response = await fetch(path, options);
  return handleResponse<T>(response);
}

export const api = {
  /**
   * Get MCP server version from the HTTP bridge OpenAPI metadata
   */
  getMcpVersion: async (signal?: AbortSignal): Promise<string> => {
    const payload = await apiFetch<OpenApiInfoResponse>('/openapi.json', { signal });
    return typeof payload.info?.version === 'string' ? payload.info.version : 'unknown';
  },

  getVersion: (signal?: AbortSignal): Promise<VersionResponse> => {
    return apiFetch<VersionResponse>('/version', { signal });
  },

  getOperations: (signal?: AbortSignal): Promise<OperationCatalogResponse> => {
    return apiFetch<OperationCatalogResponse>('/operations', { signal });
  },

  getOperationTraces: (
    params?: {
      origin?: OperationTraceOrigin;
      target?: string;
      status?: OperationTraceStatus;
      project?: string;
      session_id?: string;
      since?: string;
      until?: string;
      limit?: number;
      offset?: number;
    },
    signal?: AbortSignal
  ): Promise<OperationTraceListResponse> => {
    const query = new URLSearchParams();
    if (params?.origin) query.append('origin', params.origin);
    if (params?.target) query.append('target', params.target);
    if (params?.status) query.append('status', params.status);
    if (params?.project) query.append('project', params.project);
    if (params?.session_id) query.append('session_id', params.session_id);
    if (params?.since) query.append('since', params.since);
    if (params?.until) query.append('until', params.until);
    if (params?.limit !== undefined) query.append('limit', String(params.limit));
    if (params?.offset !== undefined) query.append('offset', String(params.offset));
    const queryString = query.toString();
    return apiFetch<OperationTraceListResponse>(`/operation-traces${queryString ? `?${queryString}` : ''}`, { signal });
  },

  getOperationTrace: (traceId: string, signal?: AbortSignal): Promise<OperationTrace> => {
    return apiFetch<OperationTrace>(`/operation-traces/${encodeURIComponent(traceId)}`, { signal });
  },

  getIndexStatus: (params?: { project?: string }, signal?: AbortSignal): Promise<IndexStatusResponse> => {
    const query = new URLSearchParams();
    if (params?.project) query.append('project', params.project);
    const queryString = query.toString();
    return apiFetch<IndexStatusResponse>(`/index/status${queryString ? `?${queryString}` : ''}`, { signal });
  },

  rebuildIndex: (payload: RebuildIndexRequest = {}, signal?: AbortSignal): Promise<RebuildIndexResponse> => {
    return apiFetch<RebuildIndexResponse>('/index/rebuild', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  },

  rebuildGraph: (payload: { project?: string } = {}, signal?: AbortSignal): Promise<RebuildGraphResponse> => {
    return apiFetch<RebuildGraphResponse>('/graph/rebuild', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  },

  /**
   * Get global stats
   */
  getStats: (signal?: AbortSignal): Promise<Stats> => {
    return apiFetch<Stats>('/stats', { signal });
  },

  /**
   * Get recent context (sessions, observations, prompts, stats)
   */
  getContext: (
    params?: {
      project?: string;
      session_id?: string;
      scope?: ObservationScope;
      limit?: number;
    },
    signal?: AbortSignal
  ): Promise<ContextResponse> => {
    const query = new URLSearchParams();
    if (params?.project) query.append('project', params.project);
    if (params?.session_id) query.append('session_id', params.session_id);
    if (params?.scope) query.append('scope', params.scope);
    if (params?.limit !== undefined) query.append('limit', String(params.limit));

    const queryString = query.toString();
    return apiFetch<ContextResponse>(`/context${queryString ? `?${queryString}` : ''}`, { signal });
  },

  /**
   * Search observations
   */
  searchObservations: (
    params: {
      query: string;
      type?: ObservationType;
      project?: string;
      session_id?: string;
      scope?: ObservationScope;
      topic_key_exact?: string;
      limit?: number;
      mode?: 'compact' | 'preview';
    },
    signal?: AbortSignal
  ): Promise<SearchResponse> => {
    const query = new URLSearchParams();
    query.append('query', params.query);
    if (params.type) query.append('type', params.type);
    if (params.project) query.append('project', params.project);
    if (params.session_id) query.append('session_id', params.session_id);
    if (params.scope) query.append('scope', params.scope);
    if (params.topic_key_exact) query.append('topic_key_exact', params.topic_key_exact);
    if (params.limit !== undefined) query.append('limit', String(params.limit));
    if (params.mode) query.append('mode', params.mode);

    return apiFetch<SearchResponse>(`/observations/search?${query.toString()}`, { signal });
  },

  /**
   * Get observation by ID (with pagination support)
   */
  getObservation: (
    id: number,
    params?: { offset?: number; max_length?: number },
    signal?: AbortSignal
  ): Promise<ObservationDetailResponse> => {
    const query = new URLSearchParams();
    if (params?.offset !== undefined) query.append('offset', String(params.offset));
    if (params?.max_length !== undefined) query.append('max_length', String(params.max_length));

    const queryString = query.toString();
    return apiFetch<ObservationDetailResponse>(
      `/observations/${id}${queryString ? `?${queryString}` : ''}`,
      { signal }
    );
  },

  /**
   * Get timeline context around an observation
   */
  getTimeline: (
    params: { observation_id: number; before?: number; after?: number },
    signal?: AbortSignal
  ): Promise<TimelineResponse> => {
    const query = new URLSearchParams();
    query.append('observation_id', String(params.observation_id));
    if (params.before !== undefined) query.append('before', String(params.before));
    if (params.after !== undefined) query.append('after', String(params.after));

    return apiFetch<TimelineResponse>(`/timeline?${query.toString()}`, { signal });
  },

  /**
   * Get project summary
   */
  getProjectSummary: (
    project: string,
    params?: { limit?: number },
    signal?: AbortSignal
  ): Promise<ProjectSummaryResponse> => {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) query.append('limit', String(params.limit));

    const queryString = query.toString();
    return apiFetch<ProjectSummaryResponse>(
      `/projects/${encodeURIComponent(project)}/summary${queryString ? `?${queryString}` : ''}`,
      { signal }
    );
  },

  /**
   * Get project topic keys
   */
  getProjectTopicKeys: (
    project: string,
    params?: { topic_key?: string; limit?: number; max_chars?: number },
    signal?: AbortSignal
  ): Promise<ProjectTopicKeysResponse> => {
    const query = new URLSearchParams();
    if (params?.topic_key) query.append('topic_key', params.topic_key);
    if (params?.limit !== undefined) query.append('limit', String(params.limit));
    if (params?.max_chars !== undefined) query.append('max_chars', String(params.max_chars));

    const queryString = query.toString();
    return apiFetch<ProjectTopicKeysResponse>(
      `/projects/${encodeURIComponent(project)}/topic-keys${queryString ? `?${queryString}` : ''}`,
      { signal }
    );
  },

  /**
   * Get project graph-lite facts
   */
  getProjectGraph: (
    project: string,
    params?: { topic_key?: string; relation?: string; limit?: number; max_chars?: number },
    signal?: AbortSignal
  ): Promise<ProjectGraphResponse> => {
    const query = new URLSearchParams();
    if (params?.topic_key) query.append('topic_key', params.topic_key);
    if (params?.relation) query.append('relation', params.relation);
    if (params?.limit !== undefined) query.append('limit', String(params.limit));
    if (params?.max_chars !== undefined) query.append('max_chars', String(params.max_chars));

    const queryString = query.toString();
    return apiFetch<ProjectGraphResponsePayload>(
      `/projects/${encodeURIComponent(project)}/graph${queryString ? `?${queryString}` : ''}`,
      { signal }
    ).then(normalizeProjectGraphResponse);
  },

  getVizGraphPage: (
    params: VizGraphPageRequest = {},
    signal?: AbortSignal,
  ): Promise<VizGraphPageResponse> => {
    const query = new URLSearchParams();
    if (params.project) query.append('project', params.project);
    if (params.session_id) query.append('session_id', params.session_id);
    if (params.topic_key) query.append('topic_key', params.topic_key);
    if (params.type) query.append('type', params.type);
    if (params.observation_type) query.append('observation_type', params.observation_type);
    if (params.relation) query.append('relation', params.relation);
    if (params.query) query.append('query', params.query);
    if (params.page_size !== undefined) query.append('page_size', String(params.page_size));
    if (params.cursor) query.append('cursor', params.cursor);
    const queryString = query.toString();
    return apiFetch<VizGraphPageResponse>(`/viz/graph${queryString ? `?${queryString}` : ''}`, { signal });
  },

  getSemanticAtlasPage: (
    params: SemanticAtlasPageRequest = {},
    signal?: AbortSignal,
  ): Promise<SemanticAtlasPageResponse> => {
    const query = new URLSearchParams();
    if (params.level) query.append('level', params.level);
    if (params.hierarchy) query.append('hierarchy', params.hierarchy);
    if (params.project_id) query.append('project_id', params.project_id);
    if (params.project_token) query.append('project_token', params.project_token);
    if (params.session_token) query.append('session_token', params.session_token);
    if (params.topic_token) query.append('topic_token', params.topic_token);
    if (params.type) query.append('type', params.type);
    if (params.observation_type) query.append('observation_type', params.observation_type);
    if (params.relation) query.append('relation', params.relation);
    if (params.query) query.append('query', params.query);
    if (params.community_id) query.append('community_id', params.community_id);
    if (params.focus_node_id) query.append('focus_node_id', params.focus_node_id);
    if (params.depth !== undefined) query.append('depth', String(params.depth));
    if (params.page_size !== undefined) query.append('page_size', String(params.page_size));
    if (params.cursor) query.append('cursor', params.cursor);
    if (params.presentation) query.append('presentation', params.presentation);
    if (params.region_id) query.append('region_id', params.region_id);
    const queryString = query.toString();
    const requestUrl = `/viz/atlas${queryString ? `?${queryString}` : ''}`;
    return apiFetch<SemanticAtlasPageResponse>(requestUrl, { signal }).then((page) => {
      const presentationKey = JSON.stringify({ hierarchy: page.hierarchy, level: page.level, project: page.navigation.project_id, generation: page.generation, region: page.navigation.region_id, focus: page.navigation.focus_node_id, request: requestUrl });
      page.presentation_key = presentationKey;
      if (typeof document !== 'undefined') {
        const response = {
          level: page.level,
          generation: page.generation,
          regionId: page.navigation.region_id,
          focusNodeId: page.navigation.focus_node_id,
          requestUrl,
          presentationKey,
          completeAt: performance.now(),
        };
        const history = JSON.parse(document.documentElement.dataset.atlasResponseHistory ?? '[]') as typeof response[];
        document.documentElement.dataset.atlasResponseHistory = JSON.stringify([...history.slice(-63), response]);
      }
      return page;
    });
  },

  getVizSlice: (
    params?: { project?: string; session_id?: string; topic_key?: string; type?: ObservationType; observation_type?: ObservationType; relation?: string; query?: string; depth?: number; max_nodes?: number; max_edges?: number; cursor?: string },
    signal?: AbortSignal
  ): Promise<VizSliceResponse> => {
    const query = new URLSearchParams();
    if (params?.project) query.append('project', params.project);
    if (params?.session_id) query.append('session_id', params.session_id);
    if (params?.topic_key) query.append('topic_key', params.topic_key);
    if (params?.type) query.append('type', params.type);
    if (params?.observation_type) query.append('observation_type', params.observation_type);
    if (params?.relation) query.append('relation', params.relation);
    if (params?.query) query.append('query', params.query);
    if (params?.depth !== undefined) query.append('depth', String(params.depth));
    if (params?.max_nodes !== undefined) query.append('max_nodes', String(params.max_nodes));
    if (params?.max_edges !== undefined) query.append('max_edges', String(params.max_edges));
    if (params?.cursor) query.append('cursor', params.cursor);
    const queryString = query.toString();
    return apiFetch<VizSliceResponse>(`/viz/slice${queryString ? `?${queryString}` : ''}`, { signal });
  },

  expandVizNode: (
    payload: { node_id: string; project?: string; session_id?: string; topic_key?: string; type?: ObservationType; observation_type?: ObservationType; relation?: string; query?: string; depth?: number; max_nodes?: number; max_edges?: number; cursor?: string },
    signal?: AbortSignal
  ): Promise<VizSliceResponse> => {
    return apiFetch<VizSliceResponse>('/viz/expand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  },

  inspectVizNode: (id: string, params?: { project?: string }, signal?: AbortSignal): Promise<VizInspectNodeResponse> => {
    const query = new URLSearchParams();
    if (params?.project) query.append('project', params.project);
    const queryString = query.toString();
    return apiFetch<VizInspectNodeResponse>(`/viz/inspect/node/${id.split(':').map(encodeURIComponent).join(':')}${queryString ? `?${queryString}` : ''}`, { signal });
  },

  inspectVizEdge: (id: string, params?: { project?: string }, signal?: AbortSignal): Promise<VizInspectEdgeResponse> => {
    const query = new URLSearchParams();
    if (params?.project) query.append('project', params.project);
    const queryString = query.toString();
    return apiFetch<VizInspectEdgeResponse>(`/viz/inspect/edge/${id.split(':').map(encodeURIComponent).join(':')}${queryString ? `?${queryString}` : ''}`, { signal });
  },

  getVizFilters: (params?: { project?: string; session_id?: string }, signal?: AbortSignal): Promise<VizFiltersResponse> => {
    const query = new URLSearchParams();
    if (params?.project) query.append('project', params.project);
    if (params?.session_id) query.append('session_id', params.session_id);
    const queryString = query.toString();
    return apiFetch<VizFiltersResponse>(`/viz/filters${queryString ? `?${queryString}` : ''}`, { signal });
  },

  getVizHealth: (params?: { project?: string }, signal?: AbortSignal): Promise<VizHealthResponse> => {
    const query = new URLSearchParams();
    if (params?.project) query.append('project', params.project);
    const queryString = query.toString();
    return apiFetch<VizHealthResponse>(`/viz/health${queryString ? `?${queryString}` : ''}`, { signal });
  },

  getObservatoryContext: (params?: ObservatoryScope, signal?: AbortSignal): Promise<ObservatoryContextResponse> => {
    const query = new URLSearchParams();
    if (params?.project_token) query.append('project_token', params.project_token);
    if (params?.session_token) query.append('session_token', params.session_token);
    if (params?.topic_token) query.append('topic_token', params.topic_token);
    if (params?.query) query.append('query', params.query);
    if (params?.type) query.append('type', params.type);
    if (params?.observation_type) query.append('observation_type', params.observation_type);
    if (params?.relation) query.append('relation', params.relation);
    if (params?.time_from) query.append('time_from', params.time_from);
    if (params?.time_to) query.append('time_to', params.time_to);
    const queryString = query.toString();
    return apiFetch<ObservatoryContextResponse>(`/observatory/context${queryString ? `?${queryString}` : ''}`, { signal });
  },

  getObservatoryRecall: (
    params: { context_token: string; hierarchy?: AtlasHierarchy; lanes?: ObservatoryLane[]; limit?: number },
    signal?: AbortSignal
  ): Promise<ObservatoryRecallResponse> => {
    const query = new URLSearchParams();
    query.append('context_token', params.context_token);
    if (params.hierarchy) query.append('hierarchy', params.hierarchy);
    if (params.lanes && params.lanes.length > 0) query.append('lanes', params.lanes.join(','));
    if (params.limit !== undefined) query.append('limit', String(params.limit));
    return apiFetch<ObservatoryRecallResponse>(`/observatory/recall?${query.toString()}`, { signal });
  },

  resolveObservatoryPivot: (
    payload: { pivot_token: string; hierarchy?: AtlasHierarchy; target: 'map' | 'timeline' | 'ledger' | 'recall' },
    signal?: AbortSignal
  ): Promise<ObservatoryPivotResponse> => {
    return apiFetch<ObservatoryPivotResponse>('/observatory/pivot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  },

  getObservatoryMapFrontier: (
    payload: { context_token: string; focus_node_id: string; visible_node_ids?: string[]; max_nodes?: number; max_edges?: number; continuation?: string },
    signal?: AbortSignal
  ): Promise<ObservatoryMapFrontierResponse> => {
    return apiFetch<ObservatoryMapFrontierResponse>('/observatory/map/frontier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  },

  getObservatoryLedger: (id: number, signal?: AbortSignal): Promise<ObservatoryLedgerResponse> => {
    return apiFetch<ObservatoryLedgerResponse>(`/observatory/ledger/${id}`, { signal });
  },

  getObservatoryTimeline: (
    params: { context_token: string; limit?: number; continuation?: string },
    signal?: AbortSignal
  ): Promise<ObservatoryTimelineResponse> => {
    const query = new URLSearchParams();
    query.append('context_token', params.context_token);
    if (params.limit !== undefined) query.append('limit', String(params.limit));
    if (params.continuation) query.append('continuation', params.continuation);
    return apiFetch<ObservatoryTimelineResponse>(`/observatory/timeline?${query.toString()}`, { signal });
  },

  getObservatoryHealth: (params?: { project?: string }, signal?: AbortSignal): Promise<VizHealthResponse> => {
    const query = new URLSearchParams();
    if (params?.project) query.append('project', params.project);
    const queryString = query.toString();
    return apiFetch<VizHealthResponse>(`/observatory/health${queryString ? `?${queryString}` : ''}`, { signal });
  },
};
