import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { URL } from 'node:url';
import type { ThothConfig } from './config.js';
import {
  handleCapturePassive,
  handleContext,
  handleCreateObservation,
  handleDeleteObservation,
  handleDocs,
  handleExport,
  handleGetObservation,
  handleHealth,
  handleImport,
  handleMigrateProject,
  handleOpenApi,
  handleSavePrompt,
  handleSearchObservations,
  handleSessionSummary,
  handleStartSession,
  handleStats,
  handleSuggestTopicKey,
  handleSyncExport,
  handleSyncImport,
  handleTimeline,
  handleUpdateObservation,
  HttpRouteError,
  type HttpRouteHandler,
} from './http-routes.js';
import type { Store } from './store/index.js';

interface RouteDefinition {
  handler: HttpRouteHandler;
  method: string;
  pattern: string;
}

const ROUTES: RouteDefinition[] = [
  { method: 'GET', pattern: '/health', handler: async (_store, _request, _port) => handleHealth() },
  { method: 'GET', pattern: '/openapi.json', handler: handleOpenApi },
  { method: 'GET', pattern: '/docs', handler: async (_store, _request, _port) => handleDocs() },
  { method: 'POST', pattern: '/observations', handler: handleCreateObservation },
  { method: 'GET', pattern: '/observations/search', handler: handleSearchObservations },
  { method: 'GET', pattern: '/observations/:id', handler: handleGetObservation },
  { method: 'PATCH', pattern: '/observations/:id', handler: handleUpdateObservation },
  { method: 'DELETE', pattern: '/observations/:id', handler: handleDeleteObservation },
  { method: 'POST', pattern: '/sessions', handler: handleStartSession },
  { method: 'POST', pattern: '/sessions/summary', handler: handleSessionSummary },
  { method: 'GET', pattern: '/context', handler: handleContext },
  { method: 'GET', pattern: '/timeline', handler: handleTimeline },
  { method: 'GET', pattern: '/stats', handler: handleStats },
  { method: 'POST', pattern: '/prompts', handler: handleSavePrompt },
  { method: 'POST', pattern: '/suggest-topic-key', handler: handleSuggestTopicKey },
  { method: 'POST', pattern: '/capture-passive', handler: handleCapturePassive },
  { method: 'GET', pattern: '/export', handler: handleExport },
  { method: 'POST', pattern: '/import', handler: handleImport },
  { method: 'POST', pattern: '/sync/export', handler: handleSyncExport },
  { method: 'POST', pattern: '/sync/import', handler: handleSyncImport },
  { method: 'POST', pattern: '/projects/migrate', handler: handleMigrateProject },
];

async function parseBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim();

  if (raw === '') {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpRouteError(400, 'Invalid JSON body');
  }
}

function sendJson(response: ServerResponse, statusCode: number, data: unknown): void {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function sendText(response: ServerResponse, statusCode: number, contentType: string, text: string): void {
  response.writeHead(statusCode, { 'Content-Type': contentType });
  response.end(text);
}

function sendError(response: ServerResponse, statusCode: number, message: string): void {
  sendJson(response, statusCode, { error: message });
}

export function matchRoute(pathname: string, pattern: string): Record<string, string> | null {
  const pathnameSegments = pathname.split('/').filter(Boolean);
  const patternSegments = pattern.split('/').filter(Boolean);

  if (pathnameSegments.length !== patternSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const pathnameSegment = pathnameSegments[index];

    if (patternSegment.startsWith(':')) {
      params[patternSegment.slice(1)] = pathnameSegment;
      continue;
    }

    if (patternSegment !== pathnameSegment) {
      return null;
    }
  }

  return params;
}

export function createHttpBridge(store: Store, config: ThothConfig): { start(): Promise<Server>; stop(): Promise<void> } {
  let server: Server | null = null;

  return {
    async start(): Promise<Server> {
      if (server) {
        return server;
      }

      const httpServer = createHttpServer(async (request, response) => {
        const method = request.method ?? 'GET';
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');

        try {
          const route = ROUTES.find((candidate) => candidate.method === method && matchRoute(url.pathname, candidate.pattern) !== null);

          if (!route) {
            sendError(response, 404, 'Not Found');
            return;
          }

          const params = matchRoute(url.pathname, route.pattern) ?? {};
          const body = method === 'POST' || method === 'PATCH' || method === 'DELETE'
            ? await parseBody<Record<string, unknown>>(request)
            : undefined;
          const result = await route.handler(store, { body, params, query: url.searchParams }, config.httpPort);

          if (result.text !== undefined) {
            sendText(response, result.status, result.contentType ?? 'text/plain; charset=utf-8', result.text);
            return;
          }

          sendJson(response, result.status, result.body ?? null);
        } catch (error) {
          if (error instanceof HttpRouteError) {
            sendError(response, error.status, error.message);
            return;
          }

          sendError(response, 500, error instanceof Error ? error.message : String(error));
        }
      });

      await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(config.httpPort, '127.0.0.1', () => {
          httpServer.off('error', reject);
          process.stderr.write(`[thoth-http] HTTP server listening on 127.0.0.1:${config.httpPort}\n`);
          resolve();
        });
      });

      server = httpServer;
      return httpServer;
    },

    async stop(): Promise<void> {
      if (!server) {
        return;
      }

      const serverToClose = server;
      server = null;

      await new Promise<void>((resolve, reject) => {
        serverToClose.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}
