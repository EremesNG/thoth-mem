import { getOpenApiSpec } from './http-openapi.js';
import type {
  ExportData,
  ListOperationTracesInput,
  ObservationFact,
  Observation,
  ObservationScope,
  ObservationType,
  OperationTraceOrigin,
  OperationTraceStatus,
  SearchMode,
  Session,
  UserPrompt,
  VizExpandRequest,
  ObservatoryLane,
} from './store/types.js';
import { OBSERVATION_TYPES } from './store/types.js';
import type { Store } from './store/index.js';
import { syncExport, syncImport } from './sync/index.js';
import { formatProjectGraph, formatProjectSummary, formatTopicKeyContext, formatTopicKeyList } from './tools/project-views.js';
import { suggestTopicKey } from './utils/topic-key.js';
import type { EmbeddingProviderAdapter } from './retrieval/providers.js';
import type { HydeGenerator } from './retrieval/hyde.js';
import { VERSION } from './version.js';

const OBSERVATION_SCOPES: ObservationScope[] = ['project', 'personal'];
const SEARCH_MODES: SearchMode[] = ['compact', 'preview'];
const OPERATION_TRACE_ORIGINS: OperationTraceOrigin[] = ['mcp', 'http', 'cli', 'system'];
const OPERATION_TRACE_STATUSES: OperationTraceStatus[] = ['ok', 'error'];
const OBSERVATORY_LANES: ObservatoryLane[] = ['lexical', 'sentence-vector', 'chunk-vector', 'fact-kg'];
const GRAPH_RELATIONS = [
  'HAS_TYPE',
  'IN_PROJECT',
  'HAS_TOPIC_KEY',
  'HAS_WHAT',
  'HAS_WHY',
  'HAS_WHERE',
  'HAS_LEARNED',
] as const;

type GraphRelation = typeof GRAPH_RELATIONS[number];

interface OperationCatalogEntry {
  id: string;
  origin: 'http' | 'mcp' | 'cli';
  label: string;
  kind: 'read' | 'write' | 'admin' | 'sync' | 'indexing';
  method?: string;
  path?: string;
  target?: string;
  description: string;
}

const OPERATION_CATALOG: OperationCatalogEntry[] = [
  { id: 'create-observation', origin: 'http', label: 'Create observation', kind: 'write', method: 'POST', path: '/observations', description: 'Save a durable observation and enqueue indexing work.' },
  { id: 'search-observations', origin: 'http', label: 'Search observations', kind: 'read', method: 'GET', path: '/observations/search', description: 'Run lexical observation search with compact or preview responses.' },
  { id: 'observatory-recall', origin: 'http', label: 'Observatory recall', kind: 'read', method: 'GET', path: '/observatory/recall', description: 'Read hybrid lane recall payloads for lexical, sentence, chunk, and KG evidence.' },
  { id: 'operation-traces', origin: 'http', label: 'Operation traces', kind: 'read', method: 'GET', path: '/operation-traces', description: 'Inspect sanitized MCP and HTTP trace logs.' },
  { id: 'rebuild-index', origin: 'http', label: 'Rebuild index', kind: 'indexing', method: 'POST', path: '/index/rebuild', description: 'Queue semantic index rebuild work and optionally process queued jobs.' },
  { id: 'index-status', origin: 'http', label: 'Index status', kind: 'indexing', method: 'GET', path: '/index/status', description: 'Inspect semantic lane readiness, queue counts, coverage, and recent failures.' },
  { id: 'rebuild-graph', origin: 'http', label: 'Rebuild graph', kind: 'indexing', method: 'POST', path: '/graph/rebuild', description: 'Rebuild deterministic graph-lite facts from saved observations.' },
  { id: 'prune-graph', origin: 'http', label: 'Prune graph', kind: 'indexing', method: 'POST', path: '/graph/prune', description: 'Bound superseded KG history using the configured keep-N policy.' },
  { id: 'sync-export', origin: 'http', label: 'Sync export', kind: 'sync', method: 'POST', path: '/sync/export', description: 'Export incremental sync chunks.' },
  { id: 'sync-import', origin: 'http', label: 'Sync import', kind: 'sync', method: 'POST', path: '/sync/import', description: 'Import incremental sync chunks.' },
  { id: 'mcp-mem-save', origin: 'mcp', label: 'mem_save', kind: 'write', target: 'mem_save', description: 'Save observations, prompts, session summaries, or passive learnings.' },
  { id: 'mcp-mem-recall', origin: 'mcp', label: 'mem_recall', kind: 'read', target: 'mem_recall', description: 'Run fused hybrid recall across sentence, chunk, lexical, and KG lanes.' },
  { id: 'mcp-mem-context', origin: 'mcp', label: 'mem_context', kind: 'read', target: 'mem_context', description: 'Recover recent project/session memory context.' },
  { id: 'mcp-mem-get', origin: 'mcp', label: 'mem_get', kind: 'read', target: 'mem_get', description: 'Fetch full memory content and optional timeline neighborhood.' },
  { id: 'mcp-mem-project', origin: 'mcp', label: 'mem_project', kind: 'read', target: 'mem_project', description: 'Navigate project summaries, graph facts, and topic-key memory.' },
  { id: 'mcp-mem-session', origin: 'mcp', label: 'mem_session', kind: 'write', target: 'mem_session', description: 'Start, checkpoint, or summarize a memory session.' },
  { id: 'cli-rebuild-index', origin: 'cli', label: 'rebuild-index', kind: 'indexing', target: 'rebuild-index', description: 'CLI equivalent for queueing or inspecting semantic index rebuild jobs.' },
  { id: 'cli-rebuild-graph', origin: 'cli', label: 'rebuild-graph', kind: 'indexing', target: 'rebuild-graph', description: 'CLI equivalent for rebuilding graph-lite facts.' },
  { id: 'cli-prune-graph', origin: 'cli', label: 'prune-graph', kind: 'indexing', target: 'prune-graph', description: 'CLI equivalent for bounding superseded graph history.' },
  { id: 'cli-version', origin: 'cli', label: 'version', kind: 'read', target: 'version', description: 'CLI equivalent for package version output.' },
];

interface ProjectGraphSummary {
  shown: number;
  total: number;
  omitted: number;
  truncated: boolean;
  text_truncated: boolean;
  limit: number;
  max_chars: number;
  filters: {
    topic_key?: string;
    relation?: GraphRelation;
  };
}

export interface HttpRouteRequest<TBody = unknown> {
  body?: TBody;
  params: Record<string, string>;
  query: URLSearchParams;
}

export interface HttpRouteResponse {
  body?: unknown;
  contentType?: string;
  status: number;
  text?: string;
}

export interface HttpRouteContext {
  embeddingProvider?: EmbeddingProviderAdapter | null;
  hydeGenerator?: HydeGenerator | null;
  port: number;
}

export class HttpRouteError extends Error {
  public readonly status: number;
  public readonly body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function mapDeleteProjectConflict(project: string, error: Error): HttpRouteError | null {
  const promptConflict = error.message.match(
    /^Cannot delete project (.+): shared session (.+) contains cross-project prompt data \((.+)\)$/
  );

  if (promptConflict) {
    return new HttpRouteError(409, error.message, {
      error: error.message,
      code: 'project_delete_conflict',
      project,
      conflict: {
        session_id: promptConflict[2],
        entity_type: 'prompt',
        foreign_project: promptConflict[3],
      },
    });
  }

  const observationConflict = error.message.match(
    /^Cannot delete project (.+): shared session (.+) contains cross-project observation data \((.+)\)$/
  );

  if (observationConflict) {
    return new HttpRouteError(409, error.message, {
      error: error.message,
      code: 'project_delete_conflict',
      project,
      conflict: {
        session_id: observationConflict[2],
        entity_type: 'observation',
        foreign_project: observationConflict[3],
      },
    });
  }

  return null;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpRouteError(400, `Missing or invalid required field: ${fieldName}`);
  }

  return value;
}

function optionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new HttpRouteError(400, `Invalid field: ${fieldName}`);
  }

  return value;
}

function parseRequiredInteger(value: string | undefined, fieldName: string, min: number = 0): number {
  if (!value) {
    throw new HttpRouteError(400, `Missing required field: ${fieldName}`);
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < min) {
    throw new HttpRouteError(400, `Invalid integer field: ${fieldName}`);
  }

  return parsed;
}

function parseOptionalInteger(value: string | null, fieldName: string, min: number = 0): number | undefined {
  if (value === null || value === '') {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < min) {
    throw new HttpRouteError(400, `Invalid integer field: ${fieldName}`);
  }

  return parsed;
}

function parseOptionalBoolean(value: string | null, fieldName: string): boolean | undefined {
  if (value === null || value === '') {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new HttpRouteError(400, `Invalid boolean field: ${fieldName}`);
}

function optionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new HttpRouteError(400, `Invalid field: ${fieldName}`);
  }

  return value;
}

function parseObservationType(value: unknown, fieldName: string): ObservationType | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !OBSERVATION_TYPES.includes(value as ObservationType)) {
    throw new HttpRouteError(400, `Invalid field: ${fieldName}`);
  }

  return value as ObservationType;
}

function parseObservationScope(value: unknown, fieldName: string): ObservationScope | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !OBSERVATION_SCOPES.includes(value as ObservationScope)) {
    throw new HttpRouteError(400, `Invalid field: ${fieldName}`);
  }

  return value as ObservationScope;
}

function parseSearchMode(value: string | null, fieldName: string): SearchMode {
  if (value === null || value === '') {
    return 'compact';
  }

  if (!SEARCH_MODES.includes(value as SearchMode)) {
    throw new HttpRouteError(400, `Invalid field: ${fieldName}`);
  }

  return value as SearchMode;
}

function parseOperationTraceOrigin(value: string | null): OperationTraceOrigin | undefined {
  if (value === null || value === '') {
    return undefined;
  }

  if (!OPERATION_TRACE_ORIGINS.includes(value as OperationTraceOrigin)) {
    throw new HttpRouteError(400, 'Invalid field: origin');
  }

  return value as OperationTraceOrigin;
}

function parseOperationTraceStatus(value: string | null): OperationTraceStatus | undefined {
  if (value === null || value === '') {
    return undefined;
  }

  if (!OPERATION_TRACE_STATUSES.includes(value as OperationTraceStatus)) {
    throw new HttpRouteError(400, 'Invalid field: status');
  }

  return value as OperationTraceStatus;
}

function parseGraphRelation(value: string | null, fieldName: string): GraphRelation | undefined {
  if (value === null || value === '') {
    return undefined;
  }

  if (!GRAPH_RELATIONS.includes(value as GraphRelation)) {
    throw new HttpRouteError(400, `Invalid field: ${fieldName}`);
  }

  return value as GraphRelation;
}

function parseObservationId(params: Record<string, string>): number {
  return parseRequiredInteger(params.id, 'id', 1);
}

function parseProjectParam(params: Record<string, string>): string {
  const project = params.project;

  if (!project) {
    throw new HttpRouteError(400, 'Missing required field: project');
  }

  return decodeURIComponent(project);
}

function getProjectGraphFacts(store: Store, project: string, topicKey?: string, relation?: GraphRelation): ObservationFact[] {
  return store
    .getObservationFacts({ project, topic_key: topicKey })
    .filter((fact) => !relation || fact.relation === relation);
}

function createProjectGraphSummary(input: {
  facts: ObservationFact[];
  shown: number;
  limit: number;
  maxChars: number;
  topicKey?: string;
  relation?: GraphRelation;
  text: string;
}): ProjectGraphSummary {
  const omitted = Math.max(input.facts.length - input.shown, 0);
  const textTruncated = input.text.includes('Output truncated by max_chars.');

  return {
    shown: input.shown,
    total: input.facts.length,
    omitted,
    truncated: omitted > 0 || textTruncated,
    text_truncated: textTruncated,
    limit: input.limit,
    max_chars: input.maxChars,
    filters: {
      ...(input.topicKey ? { topic_key: input.topicKey } : {}),
      ...(input.relation ? { relation: input.relation } : {}),
    },
  };
}

function toStatsResponse(store: Store): { sessions: number; observations: number; prompts: number; projects: string[] } {
  const stats = store.getStats();

  return {
    sessions: stats.total_sessions,
    observations: stats.total_observations,
    prompts: stats.total_prompts,
    projects: stats.projects,
  };
}

function getMemSavePromptSessionId(sessionId: string | undefined, project: string | undefined): string {
  return sessionId ?? `manual-save-${project || 'unknown'}`;
}

function extractFirstContentLine(content: string): string {
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
      return trimmed.substring(0, 200);
    }
  }

  return 'Session completed';
}

function extractPassiveLearnings(content: string): string[] {
  const headerMatch = content.match(/^##\s+(Key Learnings|Aprendizajes Clave)\s*:?\s*$/im);

  if (!headerMatch || headerMatch.index === undefined) {
    throw new HttpRouteError(400, "No '## Key Learnings:' or '## Aprendizajes Clave:' section found in content");
  }

  const afterHeader = content.slice(headerMatch.index + headerMatch[0].length);
  const nextHeaderMatch = afterHeader.match(/^##\s+/m);
  const sectionText = nextHeaderMatch && nextHeaderMatch.index !== undefined
    ? afterHeader.slice(0, nextHeaderMatch.index)
    : afterHeader;

  return sectionText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^(?:-\s+|\*\s+|\d+\.\s+)(.+)$/)?.[1]?.trim())
    .filter((item): item is string => Boolean(item));
}

function getContextSessions(store: Store, project?: string, sessionId?: string): Session[] {
  const sql = [
    'SELECT DISTINCT s.*',
    'FROM sessions s',
    'JOIN observations o ON o.session_id = s.id',
    'WHERE o.deleted_at IS NULL',
  ];
  const params: Array<string | number> = [];

  if (project) {
    sql.push('AND s.project = ?');
    params.push(project);
  }

  if (sessionId) {
    sql.push('AND s.id = ?');
    params.push(sessionId);
  }

  sql.push('ORDER BY s.started_at DESC LIMIT 5');

  return store.getDb().prepare(sql.join(' ')).all(...params) as Session[];
}

function getContextObservations(store: Store, project?: string, sessionId?: string, scope?: ObservationScope, limit?: number): Observation[] {
  const sql = ['SELECT * FROM observations WHERE deleted_at IS NULL'];
  const params: Array<string | number> = [];

  if (project) {
    sql.push('AND project = ?');
    params.push(project);
  }

  if (scope) {
    sql.push('AND scope = ?');
    params.push(scope);
  }

  if (sessionId) {
    sql.push('AND session_id = ?');
    params.push(sessionId);
  }

  sql.push('ORDER BY created_at DESC LIMIT ?');
  params.push(limit ?? store.config.maxContextResults);

  return store.getDb().prepare(sql.join(' ')).all(...params) as Observation[];
}

function parseImportPayload(data: string): ExportData {
  let parsed: ExportData;

  try {
    parsed = JSON.parse(data) as ExportData;
  } catch {
    throw new HttpRouteError(400, 'Invalid JSON — could not parse import data');
  }

  if (!parsed.version || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.observations) || !Array.isArray(parsed.prompts)) {
    throw new HttpRouteError(400, 'Invalid export format — missing required fields (version, sessions, observations, prompts)');
  }

  return parsed;
}

export async function handleHealth(): Promise<HttpRouteResponse> {
  return { status: 200, body: { status: 'ok' } };
}

export async function handleOpenApi(_store: Store, _request: HttpRouteRequest, context: HttpRouteContext): Promise<HttpRouteResponse> {
  return { status: 200, body: getOpenApiSpec(context.port) };
}

export async function handleDocs(): Promise<HttpRouteResponse> {
  return {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    text: [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '  <title>thoth-mem API</title>',
      '  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css">',
      '</head>',
      '<body>',
      '  <div id="swagger-ui"></div>',
      '  <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>',
      "  <script>SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui' })</script>",
      '</body>',
      '</html>',
    ].join('\n'),
  };
}

export async function handleVersion(): Promise<HttpRouteResponse> {
  return { status: 200, body: { version: VERSION } };
}

export async function handleOperationsCatalog(): Promise<HttpRouteResponse> {
  return {
    status: 200,
    body: {
      operations: OPERATION_CATALOG,
    },
  };
}

export async function handleOperationTraces(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const input: ListOperationTracesInput = {
    origin: parseOperationTraceOrigin(request.query.get('origin')),
    target: request.query.get('target') ?? undefined,
    status: parseOperationTraceStatus(request.query.get('status')),
    project: request.query.get('project') ?? undefined,
    session_id: request.query.get('session_id') ?? undefined,
    since: request.query.get('since') ?? undefined,
    until: request.query.get('until') ?? undefined,
    limit: parseOptionalInteger(request.query.get('limit'), 'limit', 1),
    offset: parseOptionalInteger(request.query.get('offset'), 'offset', 0),
  };

  return { status: 200, body: store.listOperationTraces(input) };
}

export async function handleOperationTraceDetail(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const traceId = requireString(request.params.trace_id, 'trace_id');
  const trace = store.getOperationTrace(traceId);

  if (!trace) {
    throw new HttpRouteError(404, `Operation trace ${traceId} not found`);
  }

  return { status: 200, body: trace };
}

export async function handleIndexStatus(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const project = request.query.get('project') ?? undefined;

  return {
    status: 200,
    body: {
      project: project ?? null,
      state: store.getSemanticIndexState(),
      progress: store.getSemanticIndexProgress({ project }),
      health: store.getVisualizationHealth({ project }),
    },
  };
}

export async function handleRebuildIndex(
  store: Store,
  request: HttpRouteRequest,
  context: HttpRouteContext,
): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const project = optionalString(body?.project, 'project');
  const reason = optionalString(body?.reason, 'reason') ?? 'http-manual';
  const processLimit = body?.process_limit === undefined
    ? 0
    : parseRequiredInteger(String(body.process_limit), 'process_limit', 0);
  const rebuild = store.enqueueManualSemanticRebuild({
    scope: project ?? 'all',
    reason,
  });
  const processed = processLimit > 0
    ? await store.processSemanticJobs({
        limit: processLimit,
        embeddingProvider: context.embeddingProvider ?? null,
      })
    : 0;

  return {
    status: 202,
    body: {
      project: project ?? null,
      queued: true,
      dedupe_key: rebuild.dedupeKey,
      processed,
      state: store.getSemanticIndexState(),
      progress: store.getSemanticIndexProgress({ project }),
      health: store.getVisualizationHealth({ project }),
    },
  };
}

export async function handleRebuildGraph(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  return {
    status: 200,
    body: store.rebuildObservationFacts({
      project: optionalString(body?.project, 'project'),
    }),
  };
}

export async function handlePruneGraph(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  return {
    status: 200,
    body: store.pruneSupersededTriples({
      project: optionalString(body?.project, 'project'),
      dryRun: optionalBoolean(body?.dryRun, 'dryRun') ?? false,
    }),
  };
}

export async function handleCreateObservation(
  store: Store,
  request: HttpRouteRequest,
  context: HttpRouteContext,
): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const result = await store.saveObservationWithIndex({
    title: requireString(body?.title, 'title'),
    content: requireString(body?.content, 'content'),
    type: parseObservationType(body?.type, 'type'),
    session_id: optionalString(body?.session_id, 'session_id'),
    project: optionalString(body?.project, 'project'),
    scope: parseObservationScope(body?.scope, 'scope'),
    topic_key: optionalString(body?.topic_key, 'topic_key'),
  }, { embeddingProvider: context.embeddingProvider ?? null });

  return {
    status: 201,
    body: {
      id: result.observation.id,
      action: result.action,
      revision: result.observation.revision_count,
    },
  };
}

export async function handleSearchObservations(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const query = request.query.get('query');

  if (!query || query.trim() === '') {
    throw new HttpRouteError(400, 'Missing required field: query');
  }

  const mode = parseSearchMode(request.query.get('mode'), 'mode');
  const results = store.searchObservations({
    query,
    type: parseObservationType(request.query.get('type') ?? undefined, 'type'),
    project: request.query.get('project') ?? undefined,
    session_id: request.query.get('session_id') ?? undefined,
    scope: parseObservationScope(request.query.get('scope') ?? undefined, 'scope'),
    topic_key_exact: request.query.get('topic_key_exact') ?? undefined,
    limit: parseOptionalInteger(request.query.get('limit'), 'limit', 1),
    mode,
  });

  const shapedResults = mode === 'compact'
    ? results.map((result) => ({
        id: result.id,
        title: result.title,
        type: result.type,
        created_at: result.created_at,
      }))
    : results.map((result) => ({
        id: result.id,
        title: result.title,
        type: result.type,
        project: result.project,
        scope: result.scope,
        topic_key: result.topic_key,
        created_at: result.created_at,
        preview: result.preview,
      }));

  return {
    status: 200,
    body: {
      results: shapedResults,
      total: shapedResults.length,
    },
  };
}

export async function handleGetObservation(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const id = parseObservationId(request.params);
  const observation = store.getObservation(id);

  if (!observation) {
    throw new HttpRouteError(404, `Observation ${id} not found`);
  }

  const offset = parseOptionalInteger(request.query.get('offset'), 'offset', 0) ?? 0;
  const maxLength = parseOptionalInteger(request.query.get('max_length'), 'max_length', 1) ?? 50000;
  const totalLength = observation.content.length;

  if (offset === 0 && totalLength <= maxLength) {
    return { status: 200, body: observation };
  }

  const content = observation.content.substring(offset, offset + maxLength);
  const returnedTo = offset + content.length;
  const hasMore = returnedTo < totalLength;

  return {
    status: 200,
    body: {
      ...observation,
      content,
      pagination: {
        total_length: totalLength,
        returned_from: offset,
        returned_to: returnedTo,
        has_more: hasMore,
        ...(hasMore ? { next_offset: returnedTo } : {}),
      },
    },
  };
}

export async function handleUpdateObservation(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const update = {
    title: optionalString(body?.title, 'title'),
    content: optionalString(body?.content, 'content'),
    type: parseObservationType(body?.type, 'type'),
    project: optionalString(body?.project, 'project'),
    scope: parseObservationScope(body?.scope, 'scope'),
    topic_key: optionalString(body?.topic_key, 'topic_key'),
  };

  if (Object.values(update).every((value) => value === undefined)) {
    throw new HttpRouteError(400, 'At least one field to update must be provided');
  }

  const observation = store.updateObservation({
    id: parseObservationId(request.params),
    ...update,
  });

  if (!observation) {
    throw new HttpRouteError(404, `Observation ${request.params.id} not found`);
  }

  return {
    status: 200,
    body: {
      id: observation.id,
      revision: observation.revision_count,
    },
  };
}

export async function handleDeleteObservation(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const id = parseObservationId(request.params);
  const hardDelete = parseOptionalBoolean(request.query.get('hard_delete'), 'hard_delete') ?? false;
  const deleted = store.deleteObservation(id, hardDelete);

  if (!deleted) {
    throw new HttpRouteError(404, `Observation ${id} not found`);
  }

  return {
    status: 200,
    body: {
      id,
      deleted: hardDelete ? 'hard' : 'soft',
    },
  };
}

export async function handleStartSession(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const session = store.startSession(
    requireString(body?.id, 'id'),
    requireString(body?.project, 'project'),
    optionalString(body?.directory, 'directory'),
  );

  return {
    status: 201,
    body: {
      session_id: session.id,
      project: session.project,
    },
  };
}

export async function handleSessionSummary(
  store: Store,
  request: HttpRouteRequest,
  context: HttpRouteContext,
): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const project = requireString(body?.project, 'project');
  const sessionId = optionalString(body?.session_id, 'session_id') ?? `manual-save-${project}`;
  const content = requireString(body?.content, 'content');
  const result = await store.saveObservationWithIndex({
    title: `Session summary: ${project}`,
    content,
    type: 'session_summary',
    session_id: sessionId,
    project,
    scope: 'project',
  }, { embeddingProvider: context.embeddingProvider ?? null });

  store.endSession(sessionId, extractFirstContentLine(content));

  return {
    status: 201,
    body: {
      observation_id: result.observation.id,
      session_id: sessionId,
    },
  };
}

export async function handleContext(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const project = request.query.get('project') ?? undefined;
  const sessionId = request.query.get('session_id') ?? undefined;
  const scope = parseObservationScope(request.query.get('scope') ?? undefined, 'scope');
  const limit = parseOptionalInteger(request.query.get('limit'), 'limit', 1);

  return {
    status: 200,
    body: {
      sessions: getContextSessions(store, project, sessionId),
      observations: getContextObservations(store, project, sessionId, scope, limit),
      prompts: store.recentPrompts(10, project, sessionId),
      stats: toStatsResponse(store),
    },
  };
}

export async function handleTimeline(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const observationId = parseOptionalInteger(request.query.get('observation_id'), 'observation_id', 1);

  if (observationId === undefined) {
    throw new HttpRouteError(400, 'Missing required field: observation_id');
  }

  const timeline = store.getTimeline({
    observation_id: observationId,
    before: parseOptionalInteger(request.query.get('before'), 'before', 0),
    after: parseOptionalInteger(request.query.get('after'), 'after', 0),
  });

  if (!timeline.focus) {
    throw new HttpRouteError(404, `Observation ${observationId} not found`);
  }

  return { status: 200, body: timeline };
}

export async function handleStats(store: Store): Promise<HttpRouteResponse> {
  return { status: 200, body: toStatsResponse(store) };
}

function parseObservatoryLanes(value: string | null): ObservatoryLane[] | undefined {
  if (!value) return undefined;
  const lanes = value.split(',').map((lane) => lane.trim()).filter((lane) => lane.length > 0);
  if (lanes.length === 0) return undefined;
  const invalid = lanes.find((lane) => !OBSERVATORY_LANES.includes(lane as ObservatoryLane));
  if (invalid) {
    throw new HttpRouteError(400, `Invalid lane: ${invalid}`);
  }
  return lanes as ObservatoryLane[];
}

export async function handleVizSlice(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const type = parseObservationType(request.query.get('type') ?? undefined, 'type');
  const observationType = parseObservationType(request.query.get('observation_type') ?? undefined, 'observation_type');
  return {
    status: 200,
    body: store.getVisualizationSlice({
      project: request.query.get('project') ?? undefined,
      session_id: request.query.get('session_id') ?? undefined,
      topic_key: request.query.get('topic_key') ?? undefined,
      type,
      observation_type: observationType,
      relation: request.query.get('relation') ?? undefined,
      query: request.query.get('query') ?? undefined,
      depth: parseOptionalInteger(request.query.get('depth'), 'depth', 0),
      max_nodes: parseOptionalInteger(request.query.get('max_nodes'), 'max_nodes', 1),
      max_edges: parseOptionalInteger(request.query.get('max_edges'), 'max_edges', 1),
      cursor: request.query.get('cursor') ?? undefined,
    }),
  };
}

export async function handleVizExpand(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const type = parseObservationType(body?.type, 'type');
  const observationType = parseObservationType(body?.observation_type, 'observation_type');
  const payload: VizExpandRequest = {
    node_id: requireString(body?.node_id, 'node_id'),
    project: optionalString(body?.project, 'project'),
    session_id: optionalString(body?.session_id, 'session_id'),
    topic_key: optionalString(body?.topic_key, 'topic_key'),
    type,
    observation_type: observationType,
    relation: optionalString(body?.relation, 'relation'),
    query: optionalString(body?.query, 'query'),
    depth: body?.depth !== undefined ? parseRequiredInteger(String(body.depth), 'depth', 1) : undefined,
    max_nodes: body?.max_nodes !== undefined ? parseRequiredInteger(String(body.max_nodes), 'max_nodes', 1) : undefined,
    max_edges: body?.max_edges !== undefined ? parseRequiredInteger(String(body.max_edges), 'max_edges', 1) : undefined,
    cursor: optionalString(body?.cursor, 'cursor'),
  };
  return { status: 200, body: store.expandVisualizationNode(payload) };
}

export async function handleVizInspectNode(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const id = requireString(request.params.id, 'id');
  const result = store.inspectVisualizationNode(id, { project: request.query.get('project') ?? undefined });
  if (!result) throw new HttpRouteError(404, `Visualization node ${id} not found`);
  return { status: 200, body: result };
}

export async function handleVizInspectEdge(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const id = requireString(request.params.id, 'id');
  const result = store.inspectVisualizationEdge(id, { project: request.query.get('project') ?? undefined });
  if (!result) throw new HttpRouteError(404, `Visualization edge ${id} not found`);
  return { status: 200, body: result };
}

export async function handleVizFilters(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const project = request.query.get('project') ?? undefined;
  const session_id = request.query.get('session_id') ?? undefined;
  const base = store.getVisualizationFilters({ project });
  const filteredSessions = session_id ? base.sessions.filter((value) => value === session_id) : base.sessions;
  return { status: 200, body: { ...base, sessions: filteredSessions } };
}

export async function handleVizHealth(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  return { status: 200, body: store.getVisualizationHealth({ project: request.query.get('project') ?? undefined }) };
}

export async function handleObservatoryContext(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  return {
    status: 200,
    body: store.getObservatoryContext({
      project: request.query.get('project') ?? undefined,
      session_id: request.query.get('session_id') ?? undefined,
      topic_key: request.query.get('topic_key') ?? undefined,
      query: request.query.get('query') ?? undefined,
      relation: request.query.get('relation') ?? undefined,
      type: parseObservationType(request.query.get('type') ?? undefined, 'type'),
      observation_type: parseObservationType(request.query.get('observation_type') ?? undefined, 'observation_type'),
      time_from: request.query.get('time_from') ?? undefined,
      time_to: request.query.get('time_to') ?? undefined,
    }),
  };
}

export async function handleObservatoryRecall(store: Store, request: HttpRouteRequest, context: HttpRouteContext): Promise<HttpRouteResponse> {
  const contextToken = request.query.get('context_token');
  if (!contextToken) throw new HttpRouteError(400, 'Missing required field: context_token');
  try {
    return {
      status: 200,
      body: await store.getObservatoryRecall({
        context_token: contextToken,
        lanes: parseObservatoryLanes(request.query.get('lanes')),
        limit: parseOptionalInteger(request.query.get('limit'), 'limit', 1),
        embeddingProvider: context.embeddingProvider ?? null,
        hydeGenerator: context.hydeGenerator ?? null,
      }),
    };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('token') || error.message.includes('Token') || error.message.includes('Expired'))) {
      throw new HttpRouteError(400, error.message);
    }
    throw error;
  }
}

export async function handleObservatoryPivot(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const target = requireString(body?.target, 'target');
  if (!['map', 'timeline', 'ledger', 'recall'].includes(target)) {
    throw new HttpRouteError(400, 'Invalid field: target');
  }
  try {
    return {
      status: 200,
      body: store.resolveObservatoryPivot({
        pivot_token: requireString(body?.pivot_token, 'pivot_token'),
        target: target as 'map' | 'timeline' | 'ledger' | 'recall',
      }),
    };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('token') || error.message.includes('Token') || error.message.includes('Expired'))) {
      throw new HttpRouteError(400, error.message);
    }
    throw error;
  }
}

export async function handleObservatoryMapFrontier(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  try {
    return {
      status: 200,
      body: store.getObservatoryMapFrontier({
        context_token: requireString(body?.context_token, 'context_token'),
        focus_node_id: requireString(body?.focus_node_id, 'focus_node_id'),
        visible_node_ids: Array.isArray(body?.visible_node_ids)
          ? body?.visible_node_ids.filter((item): item is string => typeof item === 'string')
          : undefined,
        max_nodes: body?.max_nodes !== undefined ? parseRequiredInteger(String(body.max_nodes), 'max_nodes', 1) : undefined,
        max_edges: body?.max_edges !== undefined ? parseRequiredInteger(String(body.max_edges), 'max_edges', 1) : undefined,
        continuation: optionalString(body?.continuation, 'continuation'),
      }),
    };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('token') || error.message.includes('Token') || error.message.includes('Expired') || error.message.includes('continuation'))) {
      throw new HttpRouteError(400, error.message);
    }
    throw error;
  }
}

export async function handleObservatoryLedger(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const id = parseObservationId(request.params);
  const payload = store.getObservatoryLedgerDetail({ observation_id: id });
  if (!payload) throw new HttpRouteError(404, `Observation ${id} not found`);
  return { status: 200, body: payload };
}

export async function handleObservatoryTimeline(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const contextToken = request.query.get('context_token');
  if (!contextToken) throw new HttpRouteError(400, 'Missing required field: context_token');
  try {
    return {
      status: 200,
      body: store.getObservatoryTimeline({
        context_token: contextToken,
        limit: parseOptionalInteger(request.query.get('limit'), 'limit', 1),
        continuation: request.query.get('continuation') ?? undefined,
      }),
    };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('token') || error.message.includes('Token') || error.message.includes('Expired') || error.message.includes('continuation'))) {
      throw new HttpRouteError(400, error.message);
    }
    throw error;
  }
}

export async function handleObservatoryHealth(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  return { status: 200, body: store.getVisualizationHealth({ project: request.query.get('project') ?? undefined }) };
}

export async function handleProjectSummary(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const project = parseProjectParam(request.params);
  const limit = parseOptionalInteger(request.query.get('limit'), 'limit', 1);

  return {
    status: 200,
    body: {
      project,
      text: formatProjectSummary(store, project, limit),
    },
  };
}

export async function handleProjectGraph(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const project = parseProjectParam(request.params);
  const topicKey = request.query.get('topic_key') ?? undefined;
  const limit = parseOptionalInteger(request.query.get('limit'), 'limit', 1);
  const maxChars = parseOptionalInteger(request.query.get('max_chars'), 'max_chars', 200) ?? 6000;
  const relation = parseGraphRelation(request.query.get('relation'), 'relation');
  const effectiveLimit = limit ?? 100;
  const facts = getProjectGraphFacts(store, project, topicKey, relation);
  const limitedFacts = facts.slice(0, effectiveLimit);
  const text = formatProjectGraph(store, project, {
    topicKey,
    relation,
    limit: effectiveLimit,
    maxChars,
  });

  return {
    status: 200,
    body: {
      project,
      text,
      facts: limitedFacts,
      summary: createProjectGraphSummary({
        facts,
        shown: limitedFacts.length,
        limit: effectiveLimit,
        maxChars,
        topicKey,
        relation,
        text,
      }),
    },
  };
}

export async function handleProjectTopicKeys(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const project = parseProjectParam(request.params);
  const topicKey = request.query.get('topic_key') ?? undefined;

  if (topicKey) {
    const limit = parseOptionalInteger(request.query.get('limit'), 'limit', 1);
    const maxChars = parseOptionalInteger(request.query.get('max_chars'), 'max_chars', 200);

    return {
      status: 200,
      body: {
        project,
        topic_key: topicKey,
        text: formatTopicKeyContext(store, project, topicKey, maxChars, limit),
      },
    };
  }

  return {
    status: 200,
    body: {
      project,
      topics: store.listTopicKeys(project),
      text: formatTopicKeyList(store, project),
    },
  };
}

export async function handleSavePrompt(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const project = optionalString(body?.project, 'project');
  const prompt = store.savePrompt(
    getMemSavePromptSessionId(optionalString(body?.session_id, 'session_id'), project),
    requireString(body?.content, 'content'),
    project,
  );

  return {
    status: 201,
    body: { id: prompt.id },
  };
}

export async function handleSuggestTopicKey(_store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const title = optionalString(body?.title, 'title');
  const content = optionalString(body?.content, 'content');
  const type = optionalString(body?.type, 'type');

  if (!title && !content) {
    throw new HttpRouteError(400, 'Provide either title or content');
  }

  return {
    status: 200,
    body: {
      topic_key: suggestTopicKey(title ?? '', type, content),
    },
  };
}

export async function handleCapturePassive(
  store: Store,
  request: HttpRouteRequest,
  context: HttpRouteContext,
): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const learnings = extractPassiveLearnings(requireString(body?.content, 'content'));
  const sessionId = optionalString(body?.session_id, 'session_id');
  const project = optionalString(body?.project, 'project');

  let saved = 0;
  let duplicates = 0;

  for (const item of learnings) {
    const title = item.length > 50 ? `${item.slice(0, 50)}...` : item;
    const result = await store.saveObservationWithIndex({
      title,
      content: item,
      type: 'learning',
      session_id: sessionId,
      project,
      scope: 'project',
    }, { embeddingProvider: context.embeddingProvider ?? null });

    if (result.action === 'created' || result.action === 'upserted') {
      saved += 1;
    }

    if (result.action === 'deduplicated') {
      duplicates += 1;
    }
  }

  return {
    status: 200,
    body: {
      extracted: learnings.length,
      saved,
      duplicates,
    },
  };
}

export async function handleExport(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  return {
    status: 200,
    body: store.exportData(request.query.get('project') ?? undefined),
  };
}

export async function handleImport(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const data = parseImportPayload(requireString(body?.data, 'data'));
  const result = store.importData(data);

  return {
    status: 200,
    body: {
      imported: {
        sessions: result.sessions_imported,
        observations: result.observations_imported,
        prompts: result.prompts_imported,
      },
      skipped: {
        total: result.skipped,
      },
    },
  };
}

export async function handleSyncExport(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const result = syncExport(
    store,
    requireString(body?.sync_dir, 'sync_dir'),
    optionalString(body?.project, 'project'),
  );

  return {
    status: 200,
    body: {
      chunk_id: result.chunk_id,
      filename: result.filename,
      chunk_file: result.filename,
      sessions: result.sessions,
      observations: result.observations,
      prompts: result.prompts,
      exported: result.exported,
      skipped: result.skipped,
      chunks: result.chunks,
      from_mutation_id: result.from_mutation_id,
      to_mutation_id: result.to_mutation_id,
      ...(result.message ? { message: result.message } : {}),
    },
  };
}

export async function handleSyncImport(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const result = syncImport(store, requireString(body?.sync_dir, 'sync_dir'));

  return {
    status: 200,
    body: {
      chunks_processed: result.chunks_processed,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
    },
  };
}

export async function handleMigrateProject(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const oldProject = requireString(body?.old_project, 'old_project');
  const newProject = requireString(body?.new_project, 'new_project');

  if (oldProject === newProject) {
    throw new HttpRouteError(400, 'Old and new project names are the same');
  }

  const result = store.migrateProject(oldProject, newProject);

  return {
    status: 200,
    body: {
      old_project: result.old_project,
      new_project: result.new_project,
      migrated: {
        sessions: result.sessions_updated,
        observations: result.observations_updated,
        prompts: result.prompts_updated,
      },
    },
  };
}

export async function handleDeleteProject(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const project = requireString(body?.project, 'project');

  try {
    const result = store.deleteProject(project);

    return {
      status: 200,
      body: {
        project: result.project,
        deleted: {
          observations: result.observations_deleted,
          observation_versions: result.observation_versions_deleted,
          prompts: result.prompts_deleted,
          sessions: result.sessions_deleted,
        },
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      const conflict = mapDeleteProjectConflict(project, error);

      if (conflict) {
        throw conflict;
      }
    }

    throw error;
  }
}

export type HttpRouteHandler = (store: Store, request: HttpRouteRequest, context: HttpRouteContext) => Promise<HttpRouteResponse>;
