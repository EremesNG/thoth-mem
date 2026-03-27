import { getOpenApiSpec } from './http-openapi.js';
import type {
  ExportData,
  Observation,
  ObservationScope,
  ObservationType,
  SearchMode,
  Session,
  UserPrompt,
} from './store/types.js';
import { OBSERVATION_TYPES } from './store/types.js';
import type { Store } from './store/index.js';
import { syncExport, syncImport } from './sync/index.js';
import { suggestTopicKey } from './utils/topic-key.js';

const OBSERVATION_SCOPES: ObservationScope[] = ['project', 'personal'];
const SEARCH_MODES: SearchMode[] = ['compact', 'preview'];

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

export class HttpRouteError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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

function parseObservationId(params: Record<string, string>): number {
  return parseRequiredInteger(params.id, 'id', 1);
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

export async function handleOpenApi(_store: Store, _request: HttpRouteRequest, port: number): Promise<HttpRouteResponse> {
  return { status: 200, body: getOpenApiSpec(port) };
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

export async function handleCreateObservation(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const result = store.saveObservation({
    title: requireString(body?.title, 'title'),
    content: requireString(body?.content, 'content'),
    type: parseObservationType(body?.type, 'type'),
    session_id: optionalString(body?.session_id, 'session_id'),
    project: optionalString(body?.project, 'project'),
    scope: parseObservationScope(body?.scope, 'scope'),
    topic_key: optionalString(body?.topic_key, 'topic_key'),
  });

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

export async function handleSessionSummary(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const project = requireString(body?.project, 'project');
  const sessionId = optionalString(body?.session_id, 'session_id') ?? `manual-save-${project}`;
  const content = requireString(body?.content, 'content');
  const result = store.saveObservation({
    title: `Session summary: ${project}`,
    content,
    type: 'session_summary',
    session_id: sessionId,
    project,
    scope: 'project',
  });

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

export async function handleCapturePassive(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const learnings = extractPassiveLearnings(requireString(body?.content, 'content'));
  const sessionId = optionalString(body?.session_id, 'session_id');
  const project = optionalString(body?.project, 'project');

  let saved = 0;
  let duplicates = 0;

  for (const item of learnings) {
    const title = item.length > 50 ? `${item.slice(0, 50)}...` : item;
    const result = store.saveObservation({
      title,
      content: item,
      type: 'learning',
      session_id: sessionId,
      project,
      scope: 'project',
    });

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
      chunk_file: result.filename,
      sessions: result.sessions,
      observations: result.observations,
      prompts: result.prompts,
    },
  };
}

export async function handleSyncImport(store: Store, request: HttpRouteRequest): Promise<HttpRouteResponse> {
  const body = request.body as Record<string, unknown> | undefined;
  const result = syncImport(store, requireString(body?.sync_dir, 'sync_dir'));

  return {
    status: 200,
    body: {
      imported: result.sessions_imported + result.observations_imported + result.prompts_imported,
      skipped: result.skipped,
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

export type HttpRouteHandler = (store: Store, request: HttpRouteRequest, port: number) => Promise<HttpRouteResponse>;
