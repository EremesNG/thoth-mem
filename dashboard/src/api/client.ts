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
    let body: any;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
    throw new ApiError(
      response.status,
      body?.error || body?.message || `HTTP error ${response.status}`,
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
};
