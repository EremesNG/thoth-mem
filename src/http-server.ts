import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import type { ThothConfig } from './config.js';
import {
  handleCapturePassive,
  handleContext,
  handleCreateObservation,
  handleDeleteProject,
  handleDeleteObservation,
  handleDocs,
  handleExport,
  handleGetObservation,
  handleHealth,
  handleImport,
  handleMigrateProject,
  handleOpenApi,
  handleProjectGraph,
  handleProjectSummary,
  handleProjectTopicKeys,
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

interface HttpBridgeConfig extends ThothConfig {
  dashboardDistDir?: string;
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
  { method: 'GET', pattern: '/projects/:project/summary', handler: handleProjectSummary },
  { method: 'GET', pattern: '/projects/:project/graph', handler: handleProjectGraph },
  { method: 'GET', pattern: '/projects/:project/topic-keys', handler: handleProjectTopicKeys },
  { method: 'POST', pattern: '/prompts', handler: handleSavePrompt },
  { method: 'POST', pattern: '/suggest-topic-key', handler: handleSuggestTopicKey },
  { method: 'POST', pattern: '/capture-passive', handler: handleCapturePassive },
  { method: 'GET', pattern: '/export', handler: handleExport },
  { method: 'POST', pattern: '/import', handler: handleImport },
  { method: 'POST', pattern: '/sync/export', handler: handleSyncExport },
  { method: 'POST', pattern: '/sync/import', handler: handleSyncImport },
  { method: 'POST', pattern: '/projects/delete', handler: handleDeleteProject },
  { method: 'POST', pattern: '/projects/migrate', handler: handleMigrateProject },
];

const DASHBOARD_MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
};

const DASHBOARD_MISSING_MESSAGE = [
  'Dashboard assets are not built yet for Thoth-Mem.',
  'Run `pnpm run dashboard:build` from the package root to generate dist/dashboard/.',
  'The HTTP API remains available at /docs, /openapi.json, and the REST endpoints.',
].join('\n');

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

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

function getDefaultDashboardDistDir(): string {
  const compiledPackagePath = resolve(moduleDirectory, 'dashboard');

  if (existsSync(compiledPackagePath)) {
    return compiledPackagePath;
  }

  return resolve(moduleDirectory, '..', 'dist', 'dashboard');
}

function hasDashboardIndex(dashboardDistDir: string): boolean {
  const indexPath = resolve(dashboardDistDir, 'index.html');

  return existsSync(indexPath) && statSync(indexPath).isFile();
}

function isPathContained(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);

  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${sep}`);
}

function resolveDashboardFile(dashboardDistDir: string, pathname: string): { error?: string; path?: string } {
  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return { error: 'Invalid dashboard asset path' };
  }

  if (decodedPath.includes('\0')) {
    return { error: 'Invalid dashboard asset path' };
  }

  if (decodedPath.split('/').includes('..')) {
    return { error: 'Invalid dashboard asset path' };
  }

  const relativePath = decodedPath.replace(/^\/+/, '');
  const filePath = resolve(dashboardDistDir, relativePath === '' ? 'index.html' : relativePath);

  if (!isPathContained(dashboardDistDir, filePath)) {
    return { error: 'Invalid dashboard asset path' };
  }

  return { path: filePath };
}

function isDashboardFallbackPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/search' || pathname === '/topic-keys' || pathname === '/graph') {
    return true;
  }

  return /^\/projects\/[^/]+$/.test(pathname) || /^\/memory\/[^/]+$/.test(pathname);
}

function getDashboardContentType(filePath: string): string {
  return DASHBOARD_MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

async function sendDashboardFile(response: ServerResponse, filePath: string): Promise<void> {
  const file = await readFile(filePath);
  response.writeHead(200, { 'Content-Type': getDashboardContentType(filePath) });
  response.end(file);
}

async function tryServeDashboard(response: ServerResponse, dashboardDistDir: string, pathname: string): Promise<boolean> {
  if (pathname === '/') {
    if (!hasDashboardIndex(dashboardDistDir)) {
      sendText(response, 200, 'text/plain; charset=utf-8', DASHBOARD_MISSING_MESSAGE);
      return true;
    }

    await sendDashboardFile(response, resolve(dashboardDistDir, 'index.html'));
    return true;
  }

  const resolved = resolveDashboardFile(dashboardDistDir, pathname);

  if (resolved.error) {
    sendError(response, 400, resolved.error);
    return true;
  }

  if (resolved.path && existsSync(resolved.path) && statSync(resolved.path).isFile()) {
    await sendDashboardFile(response, resolved.path);
    return true;
  }

  if (pathname.startsWith('/assets/')) {
    return false;
  }

  if (!isDashboardFallbackPath(pathname)) {
    return false;
  }

  if (!hasDashboardIndex(dashboardDistDir)) {
    sendText(response, 200, 'text/plain; charset=utf-8', DASHBOARD_MISSING_MESSAGE);
    return true;
  }

  await sendDashboardFile(response, resolve(dashboardDistDir, 'index.html'));
  return true;
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

export function createHttpBridge(store: Store, config: HttpBridgeConfig): HttpBridge {
  let server: Server | null = null;
  let isOwner = false;
  let healthCheckInterval: NodeJS.Timeout | null = null;
  let isStopped = false;
  let takeoverPromise: Promise<void> | null = null;
  const dashboardDistDir = config.dashboardDistDir ?? getDefaultDashboardDistDir();

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
      const rawPathname = (request.url ?? '/').split('?')[0] || '/';
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');

      try {
        const route = ROUTES.find((candidate) => candidate.method === method && matchRoute(url.pathname, candidate.pattern) !== null);

        if (!route) {
          if (method === 'GET' && await tryServeDashboard(response, dashboardDistDir, rawPathname)) {
            return;
          }

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
          sendJson(response, error.status, error.body ?? { error: error.message });
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
