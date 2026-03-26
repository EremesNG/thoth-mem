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

export interface HttpBridge {
  start(): Promise<Server | null>;
  stop(): Promise<void>;
  readonly isOwner: boolean;
  readonly isRunning: boolean;
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

function isAddressInUseError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function createHttpBridge(store: Store, config: ThothConfig): HttpBridge {
  let server: Server | null = null;
  let isOwner = false;
  let healthCheckInterval: NodeJS.Timeout | null = null;
  let isStopped = false;
  let takeoverPromise: Promise<void> | null = null;

  function clearHealthCheckLoop(): void {
    if (!healthCheckInterval) {
      return;
    }

    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }

  async function isBridgeAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${config.httpPort}/health`, {
        signal: AbortSignal.timeout(2000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  function createListenerServer(): Server {
    return createHttpServer(async (request, response) => {
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
  }

  async function listenOnPort(): Promise<Server> {
    const httpServer = createListenerServer();

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        httpServer.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        httpServer.off('error', onError);
        resolve();
      };

      httpServer.once('error', onError);
      httpServer.once('listening', onListening);
      httpServer.listen(config.httpPort, '127.0.0.1');
    });

    if (isStopped) {
      await closeServer(httpServer);
      throw new Error('HTTP bridge stopped during startup');
    }

    server = httpServer;
    isOwner = true;
    return httpServer;
  }

  function startHealthCheckLoop(): void {
    if (isStopped || healthCheckInterval) {
      return;
    }

    healthCheckInterval = setInterval(() => {
      void (async () => {
        const isAvailable = await isBridgeAvailable();

        if (isAvailable) {
          return;
        }

        clearHealthCheckLoop();
        await attemptTakeover();
      })().catch((error) => {
        process.stderr.write(`[thoth-http] Health check failed on port ${config.httpPort}: ${error instanceof Error ? error.message : String(error)}\n`);
        startHealthCheckLoop();
      });
    }, 5000);

    healthCheckInterval.unref();
  }

  async function attemptTakeover(): Promise<void> {
    if (isStopped) {
      return;
    }

    if (takeoverPromise) {
      return takeoverPromise;
    }

    takeoverPromise = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));

      if (isStopped) {
        return;
      }

      const isAvailable = await isBridgeAvailable();

      if (isAvailable) {
        startHealthCheckLoop();
        return;
      }

      try {
        await listenOnPort();
        process.stderr.write(`[thoth-http] Took over HTTP bridge on port ${config.httpPort}\n`);
      } catch (error) {
        server = null;
        isOwner = false;

        if (!isAddressInUseError(error) && !isStopped) {
          process.stderr.write(`[thoth-http] HTTP takeover failed on port ${config.httpPort}: ${error instanceof Error ? error.message : String(error)}\n`);
        }

        if (!isStopped) {
          startHealthCheckLoop();
        }
      }
    })().finally(() => {
      takeoverPromise = null;
    });

    return takeoverPromise;
  }

  return {
    async start(): Promise<Server | null> {
      if (config.httpDisabled || isStopped) {
        return null;
      }

      if (server) {
        return server;
      }

      if (healthCheckInterval || takeoverPromise) {
        return null;
      }

      try {
        const httpServer = await listenOnPort();
        process.stderr.write(`[thoth-http] HTTP server listening on 127.0.0.1:${config.httpPort}\n`);
        return httpServer;
      } catch (error) {
        if (!isAddressInUseError(error)) {
          throw error;
        }

        server = null;
        isOwner = false;
        process.stderr.write(`[thoth-http] Port ${config.httpPort} already in use, running as non-owner (MCP stdio active)\n`);
        startHealthCheckLoop();
        return null;
      }
    },

    async stop(): Promise<void> {
      isStopped = true;
      clearHealthCheckLoop();

      if (!server) {
        isOwner = false;
        return;
      }

      const serverToClose = server;
      server = null;
      isOwner = false;

      await closeServer(serverToClose);
    },

    get isOwner(): boolean {
      return isOwner;
    },

    get isRunning(): boolean {
      return server !== null;
    },
  };
}
