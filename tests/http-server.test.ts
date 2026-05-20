import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createServer as createHttpServer, request as httpRequest, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { getConfig } from '../src/config.js';
import { createHttpBridge } from '../src/http-server.js';
import { Store } from '../src/store/index.js';
import { VERSION } from '../src/version.js';

type HttpBridge = ReturnType<typeof createHttpBridge>;

interface RunningBridge {
  bridge: HttpBridge;
  port: number;
  store: Store;
  stop(): Promise<void>;
}

const bridges: RunningBridge[] = [];
const tempDirs: string[] = [];
const dummyServers: Server[] = [];

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not resolve ephemeral port.')));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

function createTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'thoth-http-test-'));
  tempDirs.push(directory);
  return directory;
}

async function startBridge(options?: { dashboardDistDir?: string }): Promise<RunningBridge> {
  const port = await getAvailablePort();
  const store = new Store(':memory:');
  const config = { ...getConfig(), httpPort: port, ...options };
  const bridge = createHttpBridge(store, config);

  await bridge.start();

  const running: RunningBridge = {
    bridge,
    port,
    store,
    async stop(): Promise<void> {
      await bridge.stop();
    },
  };

  bridges.push(running);
  return running;
}

function createDashboardFixture(): string {
  const directory = createTempDir();
  mkdirSync(join(directory, 'assets'), { recursive: true });
  writeFileSync(
    join(directory, 'index.html'),
    '<!doctype html><html><head><title>Thoth Dashboard</title><script type="module" src="./assets/app.js"></script></head><body><div id="root"></div></body></html>',
  );
  writeFileSync(join(directory, 'assets', 'app.js'), 'console.log("dashboard");');
  writeFileSync(join(directory, 'assets', 'style.css'), 'body { color: #111; }');
  return directory;
}

function getUrl(port: number, path: string): string {
  return `http://127.0.0.1:${port}${path}`;
}

async function startDummyHttpServer(port: number): Promise<Server> {
  const server = createHttpServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'dummy' }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  dummyServers.push(server);
  return server;
}

async function stopDummyHttpServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  const index = dummyServers.indexOf(server);
  if (index >= 0) {
    dummyServers.splice(index, 1);
  }
}

async function waitForCondition(predicate: () => Promise<boolean>, timeoutMs: number, intervalMs = 100): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

async function fetchJson(path: string, init?: RequestInit, port?: number): Promise<{ response: Response; body: any }> {
  const bridgePort = port ?? bridges[bridges.length - 1].port;
  const response = await fetch(getUrl(bridgePort, path), init);
  const body = await response.json();
  return { response, body };
}

async function requestRawJson(port: number, path: string): Promise<{ status: number | undefined; body: any }> {
  return await new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path, method: 'GET' }, (response) => {
      const chunks: Buffer[] = [];

      response.on('data', (chunk) => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf-8')) });
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);
    request.end();
  });
}

afterEach(async () => {
  while (bridges.length > 0) {
    const bridge = bridges.pop();

    if (!bridge) {
      continue;
    }

    try {
      await bridge.stop();
    } catch {
      // Bridge may already be closed.
    }

    try {
      bridge.store.close();
    } catch {
      // Store may already be closed.
    }
  }

  while (dummyServers.length > 0) {
    const server = dummyServers.pop();

    if (!server) {
      continue;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    } catch {
      // Dummy server may already be closed.
    }
  }

  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();

    if (!directory) {
      continue;
    }

    rmSync(directory, { recursive: true, force: true });
  }
});

describe('createHttpBridge', () => {
  describe('owner/non-owner pattern', () => {
    it('starts as owner when the configured port is available', async () => {
      const bridge = await startBridge();

      expect(bridge.bridge.isOwner).toBe(true);
      expect(bridge.bridge.isRunning).toBe(true);

      const health = await fetchJson('/health', undefined, bridge.port);
      expect(health.response.status).toBe(200);
      expect(health.body).toEqual({ status: 'ok' });
    });

    it('degrades gracefully to non-owner mode when the port is already in use', async () => {
      const port = await getAvailablePort();
      const dummyServer = await startDummyHttpServer(port);
      const store = new Store(':memory:');
      const config = { ...getConfig(), httpPort: port };
      const bridge = createHttpBridge(store, config);

      await expect(bridge.start()).resolves.toBeNull();

      bridges.push({
        bridge,
        port,
        store,
        async stop(): Promise<void> {
          await bridge.stop();
        },
      });

      expect(dummyServer.listening).toBe(true);
      expect(bridge.isOwner).toBe(false);
      expect(bridge.isRunning).toBe(false);
    });

    it('takes over the port after the owner goes away', async () => {
      const port = await getAvailablePort();
      const dummyServer = await startDummyHttpServer(port);
      const store = new Store(':memory:');
      const config = { ...getConfig(), httpPort: port };
      const bridge = createHttpBridge(store, config);

      await bridge.start();

      bridges.push({
        bridge,
        port,
        store,
        async stop(): Promise<void> {
          await bridge.stop();
        },
      });

      expect(bridge.isOwner).toBe(false);

      await stopDummyHttpServer(dummyServer);

      await waitForCondition(async () => {
        if (!bridge.isOwner) {
          return false;
        }

        try {
          const response = await fetch(getUrl(port, '/health'));
          return response.ok;
        } catch {
          return false;
        }
      }, 9000);

      expect(bridge.isOwner).toBe(true);

      const health = await fetchJson('/health', undefined, port);
      expect(health.response.status).toBe(200);
      expect(health.body).toEqual({ status: 'ok' });
    }, 15000);

    it('does not start when HTTP is disabled', async () => {
      const port = await getAvailablePort();
      const store = new Store(':memory:');
      const config = { ...getConfig(), httpPort: port, httpDisabled: true };
      const bridge = createHttpBridge(store, config);

      await expect(bridge.start()).resolves.toBeNull();

      bridges.push({
        bridge,
        port,
        store,
        async stop(): Promise<void> {
          await bridge.stop();
        },
      });

      expect(bridge.isOwner).toBe(false);
      expect(bridge.isRunning).toBe(false);
      await expect(fetch(getUrl(port, '/health'))).rejects.toThrow();
    });
  });

  it('serves health, OpenAPI, and Swagger docs', async () => {
    const bridge = await startBridge();

    const health = await fetchJson('/health', undefined, bridge.port);
    expect(health.response.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });

    const openapi = await fetchJson('/openapi.json', undefined, bridge.port);
    expect(openapi.response.status).toBe(200);
    expect(openapi.body.openapi).toBe('3.0.0');
    expect(openapi.body.info.title).toBe('thoth-mem HTTP API');
    expect(openapi.body.info.version).toBe(VERSION);
    expect(openapi.body.servers[0].url).toBe(`http://127.0.0.1:${bridge.port}`);
    expect(openapi.body.paths['/observations']).toBeDefined();
    expect(openapi.body.paths['/docs']).toBeDefined();

    const docsResponse = await fetch(getUrl(bridge.port, '/docs'));
    const docsHtml = await docsResponse.text();
    expect(docsResponse.status).toBe(200);
    expect(docsHtml).toContain('SwaggerUIBundle');
    expect(docsHtml).toContain("url: '/openapi.json'");
  });

  it('supports observation CRUD, search, and paginated retrieval', async () => {
    const bridge = await startBridge();

    const created = await fetchJson(
      '/observations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'REST API observation',
          content: '1234567890',
          type: 'decision',
          session_id: 'obs-session',
          project: 'http-api',
          topic_key: 'decision/rest-api',
        }),
      },
      bridge.port,
    );

    expect(created.response.status).toBe(201);
    expect(created.body.action).toBe('created');
    expect(created.body.id).toBeGreaterThan(0);

    const fullObservation = await fetchJson(`/observations/${created.body.id}`, undefined, bridge.port);
    expect(fullObservation.response.status).toBe(200);
    expect(fullObservation.body.title).toBe('REST API observation');
    expect(fullObservation.body.content).toBe('1234567890');

    const paginated = await fetchJson(`/observations/${created.body.id}?offset=2&max_length=4`, undefined, bridge.port);
    expect(paginated.response.status).toBe(200);
    expect(paginated.body.content).toBe('3456');
    expect(paginated.body.pagination).toEqual({
      total_length: 10,
      returned_from: 2,
      returned_to: 6,
      has_more: true,
      next_offset: 6,
    });

    const updated = await fetchJson(
      `/observations/${created.body.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'REST API observation updated',
          content: 'updated content for search',
          type: 'architecture',
          project: 'http-api-v2',
          scope: 'personal',
          topic_key: 'architecture/rest-api',
        }),
      },
      bridge.port,
    );

    expect(updated.response.status).toBe(200);
    expect(updated.body).toEqual({ id: created.body.id, revision: 2 });

    const updatedObservation = await fetchJson(`/observations/${created.body.id}`, undefined, bridge.port);
    expect(updatedObservation.response.status).toBe(200);

    const compactSearch = await fetchJson(
      '/observations/search?query=updated&project=http-api-v2&scope=personal&limit=5',
      undefined,
      bridge.port,
    );
    expect(compactSearch.response.status).toBe(200);
    expect(compactSearch.body.total).toBe(1);
    expect(compactSearch.body.results[0]).toEqual({
      id: created.body.id,
      title: 'REST API observation updated',
      type: 'architecture',
      created_at: expect.any(String),
    });
    expect(compactSearch.body.results[0].preview).toBeUndefined();
    expect(compactSearch.body.results[0].project).toBeUndefined();

    const previewSearch = await fetchJson(
      '/observations/search?query=updated&mode=preview&project=http-api-v2&scope=personal&limit=5',
      undefined,
      bridge.port,
    );
    expect(previewSearch.response.status).toBe(200);
    expect(previewSearch.body.total).toBe(1);
    expect(previewSearch.body.results[0].id).toBe(created.body.id);
    expect(previewSearch.body.results[0].project).toBe('http-api-v2');
    expect(previewSearch.body.results[0].scope).toBe('personal');
    expect(previewSearch.body.results[0].topic_key).toBe('architecture/rest-api');
    expect(previewSearch.body.results[0].preview).toContain('updated content');

    const softDeleted = await fetchJson(`/observations/${created.body.id}`, { method: 'DELETE' }, bridge.port);
    expect(softDeleted.response.status).toBe(200);
    expect(softDeleted.body).toEqual({ id: created.body.id, deleted: 'soft' });

    const afterSoftDelete = await fetchJson(`/observations/${created.body.id}`, undefined, bridge.port);
    expect(afterSoftDelete.response.status).toBe(404);
    expect(afterSoftDelete.body.error).toContain(String(created.body.id));

    const hardCreated = await fetchJson(
      '/observations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Hard delete observation',
          content: 'remove permanently',
          project: 'http-api',
        }),
      },
      bridge.port,
    );

    const hardDeleted = await fetchJson(`/observations/${hardCreated.body.id}?hard_delete=true`, { method: 'DELETE' }, bridge.port);
    expect(hardDeleted.response.status).toBe(200);
    expect(hardDeleted.body).toEqual({ id: hardCreated.body.id, deleted: 'hard' });
    expect(bridge.store.getDb().prepare('SELECT * FROM observations WHERE id = ?').get(hardCreated.body.id)).toBeUndefined();
  });

  it('supports sessions, summaries, context, timeline, stats, and prompts', async () => {
    const bridge = await startBridge();

    const session = await fetchJson(
      '/sessions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'session-1', project: 'alpha', directory: '/tmp/alpha' }),
      },
      bridge.port,
    );
    expect(session.response.status).toBe(201);
    expect(session.body).toEqual({ session_id: 'session-1', project: 'alpha' });

    const firstObservation = await fetchJson(
      '/observations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Alpha note one',
          content: 'Alpha note one content',
          session_id: 'session-1',
          project: 'alpha',
          type: 'decision',
        }),
      },
      bridge.port,
    );

    const secondObservation = await fetchJson(
      '/observations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Alpha note two',
          content: 'Alpha note two content',
          session_id: 'session-1',
          project: 'alpha',
          type: 'pattern',
        }),
      },
      bridge.port,
    );

    await fetchJson(
      '/sessions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'session-2', project: 'beta' }),
      },
      bridge.port,
    );

    await fetchJson(
      '/observations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Beta note',
          content: 'Beta context content',
          session_id: 'session-2',
          project: 'beta',
          type: 'bugfix',
        }),
      },
      bridge.port,
    );

    const prompt = await fetchJson(
      '/prompts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'How should alpha track context?', session_id: 'session-1', project: 'alpha' }),
      },
      bridge.port,
    );
    expect(prompt.response.status).toBe(201);
    expect(prompt.body.id).toBeGreaterThan(0);

    const context = await fetchJson('/context?project=alpha&session_id=session-1&scope=project&limit=1', undefined, bridge.port);
    expect(context.response.status).toBe(200);
    expect(context.body.sessions).toHaveLength(1);
    expect(context.body.observations).toHaveLength(1);
    expect(context.body.prompts).toHaveLength(1);
    expect(context.body.observations[0].session_id).toBe('session-1');
    expect(context.body.stats.sessions).toBe(2);

    const timeline = await fetchJson(
      `/timeline?observation_id=${secondObservation.body.id}&before=1&after=0`,
      undefined,
      bridge.port,
    );
    expect(timeline.response.status).toBe(200);
    expect(timeline.body.focus.id).toBe(secondObservation.body.id);
    expect(timeline.body.before).toHaveLength(1);
    expect(timeline.body.before[0].id).toBe(firstObservation.body.id);
    expect(timeline.body.after).toHaveLength(0);

    const stats = await fetchJson('/stats', undefined, bridge.port);
    expect(stats.response.status).toBe(200);
    expect(stats.body.sessions).toBe(2);
    expect(stats.body.observations).toBe(3);
    expect(stats.body.prompts).toBe(1);
    expect(stats.body.projects).toEqual(['alpha', 'beta']);

    const summary = await fetchJson(
      '/sessions/summary',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: 'alpha',
          session_id: 'session-1',
          content: [
            '## Goal',
            'Ship the REST API',
            '',
            '## Accomplished',
            '- Added structured HTTP endpoints',
          ].join('\n'),
        }),
      },
      bridge.port,
    );
    expect(summary.response.status).toBe(201);
    expect(summary.body.session_id).toBe('session-1');
    expect(summary.body.observation_id).toBeGreaterThan(0);

    const endedSession = bridge.store.getSession('session-1');
    expect(endedSession?.ended_at).not.toBeNull();
    expect(endedSession?.summary).toBe('Ship the REST API');
  });

  it('serves the dashboard root, concrete assets, and known SPA deep links without shadowing HTTP routes', async () => {
    const dashboardDistDir = createDashboardFixture();
    const bridge = await startBridge({ dashboardDistDir });

    const rootResponse = await fetch(getUrl(bridge.port, '/'));
    const rootHtml = await rootResponse.text();
    expect(rootResponse.status).toBe(200);
    expect(rootResponse.headers.get('content-type')).toContain('text/html');
    expect(rootHtml).toContain('Thoth Dashboard');

    const assetResponse = await fetch(getUrl(bridge.port, '/assets/app.js'));
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get('content-type')).toContain('text/javascript');
    expect(await assetResponse.text()).toContain('dashboard');

    const projectDeepLink = await fetch(getUrl(bridge.port, '/projects/http-project'));
    expect(projectDeepLink.status).toBe(200);
    expect(projectDeepLink.headers.get('content-type')).toContain('text/html');

    const observationDeepLink = await fetch(getUrl(bridge.port, '/memory/123'));
    expect(observationDeepLink.status).toBe(200);
    expect(observationDeepLink.headers.get('content-type')).toContain('text/html');

    const docsResponse = await fetch(getUrl(bridge.port, '/docs'));
    expect(docsResponse.status).toBe(200);
    expect(await docsResponse.text()).toContain('SwaggerUIBundle');

    const stats = await fetchJson('/stats', undefined, bridge.port);
    expect(stats.response.status).toBe(200);
    expect(stats.body).toEqual({ sessions: 0, observations: 0, prompts: 0, projects: [] });
  });

  it('returns a local dashboard build message when root assets are missing while APIs stay available', async () => {
    const dashboardDistDir = createTempDir();
    const bridge = await startBridge({ dashboardDistDir });

    const rootResponse = await fetch(getUrl(bridge.port, '/'));
    const rootText = await rootResponse.text();
    expect(rootResponse.status).toBe(200);
    expect(rootResponse.headers.get('content-type')).toContain('text/plain');
    expect(rootText).toContain('Dashboard assets are not built');
    expect(rootText).toContain('npm run dashboard:build');

    const health = await fetchJson('/health', undefined, bridge.port);
    expect(health.response.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });
  });

  it('rejects dashboard path traversal and does not fallback for unknown API-like paths', async () => {
    const dashboardDistDir = createDashboardFixture();
    const bridge = await startBridge({ dashboardDistDir });

    const traversal = await requestRawJson(bridge.port, '/assets/%2e%2e/index.html');
    expect(traversal.status).toBe(400);
    expect(traversal.body).toEqual({ error: 'Invalid dashboard asset path' });

    const unknownObservationApi = await fetchJson('/observations/123/extra', undefined, bridge.port);
    expect(unknownObservationApi.response.status).toBe(404);
    expect(unknownObservationApi.body).toEqual({ error: 'Not Found' });

    const unknownProjectApi = await fetchJson('/projects/http-project/unknown', undefined, bridge.port);
    expect(unknownProjectApi.response.status).toBe(404);
    expect(unknownProjectApi.body).toEqual({ error: 'Not Found' });
  });

  it('serves project view tools through HTTP endpoints', async () => {
    const bridge = await startBridge();

    await fetchJson(
      '/observations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'HTTP project graph topic',
          content: '**What**: HTTP graph fact content',
          project: 'http-project',
          topic_key: 'architecture/http-graph',
          type: 'decision',
        }),
      },
      bridge.port,
    );
    await fetchJson(
      '/prompts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Inspect HTTP project views', project: 'http-project' }),
      },
      bridge.port,
    );

    const summary = await fetchJson('/projects/http-project/summary?limit=5', undefined, bridge.port);
    expect(summary.response.status).toBe(200);
    expect(summary.body.project).toBe('http-project');
    expect(summary.body.text).toContain('## Project Summary: http-project');
    expect(summary.body.text).toContain('HTTP project graph topic');

    const topicKeys = await fetchJson('/projects/http-project/topic-keys', undefined, bridge.port);
    expect(topicKeys.response.status).toBe(200);
    expect(topicKeys.body.project).toBe('http-project');
    expect(topicKeys.body.topics).toHaveLength(1);
    expect(topicKeys.body.topics[0].topic_key).toBe('architecture/http-graph');
    expect(topicKeys.body.text).toContain('architecture/http-graph');

    const topicContext = await fetchJson(
      '/projects/http-project/topic-keys?topic_key=architecture%2Fhttp-graph&max_chars=1000',
      undefined,
      bridge.port,
    );
    expect(topicContext.response.status).toBe(200);
    expect(topicContext.body.project).toBe('http-project');
    expect(topicContext.body.topic_key).toBe('architecture/http-graph');
    expect(topicContext.body.text).toContain('## Topic Key: architecture/http-graph');
    expect(topicContext.body.text).toContain('HTTP graph fact content');

    const graph = await fetchJson(
      '/projects/http-project/graph?topic_key=architecture%2Fhttp-graph&relation=HAS_WHAT&limit=2&max_chars=1000',
      undefined,
      bridge.port,
    );
    expect(graph.response.status).toBe(200);
    expect(graph.body.project).toBe('http-project');
    expect(graph.body.text).toContain('## Graph Lite: http-project');
    expect(graph.body.text).toContain('Filters: topic_key=architecture/http-graph, relation=HAS_WHAT');
    expect(graph.body.text).toContain('HTTP project graph topic -- HAS_WHAT --> HTTP graph fact content');
    expect(graph.body.text).not.toContain('HAS_TOPIC_KEY');
    expect(graph.body.facts).toEqual([
      {
        id: expect.any(Number),
        observation_id: expect.any(Number),
        subject: 'HTTP project graph topic',
        relation: 'HAS_WHAT',
        object: 'HTTP graph fact content',
        project: 'http-project',
        topic_key: 'architecture/http-graph',
        type: 'decision',
        created_at: expect.any(String),
      },
    ]);
    expect(graph.body.summary).toEqual({
      shown: 1,
      total: 1,
      omitted: 0,
      truncated: false,
      text_truncated: false,
      limit: 2,
      max_chars: 1000,
      filters: {
        topic_key: 'architecture/http-graph',
        relation: 'HAS_WHAT',
      },
    });
  });

  it('supports topic key suggestion', async () => {
    const bridge = await startBridge();

    const topicKey = await fetchJson(
      '/suggest-topic-key',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Auth Model', type: 'architecture' }),
      },
      bridge.port,
    );

    expect(topicKey.response.status).toBe(200);
    expect(topicKey.body).toEqual({ topic_key: 'architecture/auth-model' });
  });

  it('supports export/import and sync export/import flows', async () => {
    const source = await startBridge();

    await fetchJson(
      '/sessions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'export-session', project: 'sync-project' }),
      },
      source.port,
    );
    await fetchJson(
      '/observations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Exported observation',
          content: 'Export this observation',
          session_id: 'export-session',
          project: 'sync-project',
        }),
      },
      source.port,
    );
    await fetchJson(
      '/prompts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Export this prompt', session_id: 'export-session', project: 'sync-project' }),
      },
      source.port,
    );

    const exported = await fetchJson('/export?project=sync-project', undefined, source.port);
    expect(exported.response.status).toBe(200);
    expect(exported.body.sessions).toHaveLength(1);
    expect(exported.body.observations).toHaveLength(1);
    expect(exported.body.prompts).toHaveLength(1);

    const importedTarget = await startBridge();
    const imported = await fetchJson(
      '/import',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: JSON.stringify(exported.body) }),
      },
      importedTarget.port,
    );
    expect(imported.response.status).toBe(200);
    expect(imported.body).toEqual({
      imported: { sessions: 1, observations: 1, prompts: 1 },
      skipped: { total: 0 },
    });

    const syncDir = createTempDir();
    const syncExport = await fetchJson(
      '/sync/export',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_dir: syncDir, project: 'sync-project' }),
      },
      source.port,
    );
    expect(syncExport.response.status).toBe(200);
    expect(syncExport.body.chunk_file).toContain('.json.gz');
    expect(syncExport.body.sessions).toBe(1);
    expect(syncExport.body.observations).toBe(1);
    expect(syncExport.body.prompts).toBe(1);
    expect(syncExport.body.from_mutation_id).toBeTypeOf('number');
    expect(syncExport.body.to_mutation_id).toBeTypeOf('number');

    const syncTarget = await startBridge();
    const syncImport = await fetchJson(
      '/sync/import',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_dir: syncDir }),
      },
      syncTarget.port,
    );
    expect(syncImport.response.status).toBe(200);
    expect(syncImport.body).toEqual({
      chunks_processed: 1,
      imported: 1,
      skipped: 0,
      failed: 0,
    });
  });

  it('returns incremental v2 fields in HTTP sync export responses', async () => {
    const bridge = await startBridge();
    const syncDir = createTempDir();

    await fetchJson(
      '/sessions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'incremental-session', project: 'incremental-project' }),
      },
      bridge.port,
    );
    await fetchJson(
      '/observations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Incremental observation',
          content: 'Incremental sync content',
          session_id: 'incremental-session',
          project: 'incremental-project',
        }),
      },
      bridge.port,
    );

    const first = await fetchJson(
      '/sync/export',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_dir: syncDir, project: 'incremental-project' }),
      },
      bridge.port,
    );

    expect(first.response.status).toBe(200);
    expect(first.body.chunk_id).toContain('chunk-');
    expect(first.body.filename).toContain('.json.gz');
    expect(first.body.from_mutation_id).toBeTypeOf('number');
    expect(first.body.to_mutation_id).toBeTypeOf('number');
    expect(first.body.exported).toBeGreaterThan(0);

    const second = await fetchJson(
      '/sync/export',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_dir: syncDir, project: 'incremental-project' }),
      },
      bridge.port,
    );

    expect(second.response.status).toBe(200);
    expect(second.body.chunk_id).toBe('');
    expect(second.body.filename).toBe('');
    expect(second.body.from_mutation_id).toBeNull();
    expect(second.body.to_mutation_id).toBeNull();
    expect(second.body.message).toBe('No new changes to export');
  });

  it('supports project migration', async () => {
    const bridge = await startBridge();

    await fetchJson(
      '/sessions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'migrate-session', project: 'old-project' }),
      },
      bridge.port,
    );
    await fetchJson(
      '/observations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Migrated observation',
          content: 'Move me',
          session_id: 'migrate-session',
          project: 'old-project',
        }),
      },
      bridge.port,
    );
    await fetchJson(
      '/prompts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Move prompt', session_id: 'migrate-session', project: 'old-project' }),
      },
      bridge.port,
    );

    const migrated = await fetchJson(
      '/projects/migrate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_project: 'old-project', new_project: 'new-project' }),
      },
      bridge.port,
    );

    expect(migrated.response.status).toBe(200);
    expect(migrated.body).toEqual({
      old_project: 'old-project',
      new_project: 'new-project',
      migrated: { sessions: 1, observations: 1, prompts: 1 },
    });
  });

  it('deletes an isolated project and returns deletion counts', async () => {
    const bridge = await startBridge();

    await fetchJson(
      '/sessions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'delete-session', project: 'delete-project' }),
      },
      bridge.port,
    );
    await fetchJson(
      '/observations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Delete observation',
          content: 'Delete me safely',
          session_id: 'delete-session',
          project: 'delete-project',
        }),
      },
      bridge.port,
    );
    await fetchJson(
      '/prompts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Delete prompt', session_id: 'delete-session', project: 'delete-project' }),
      },
      bridge.port,
    );

    const deleted = await fetchJson(
      '/projects/delete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: 'delete-project' }),
      },
      bridge.port,
    );

    expect(deleted.response.status).toBe(200);
    expect(deleted.body).toEqual({
      project: 'delete-project',
      deleted: {
        observations: 1,
        observation_versions: 0,
        prompts: 1,
        sessions: 1,
      },
    });
    expect(bridge.store.exportData('delete-project')).toEqual({
      version: 1,
      exported_at: expect.any(String),
      project: 'delete-project',
      sessions: [],
      observations: [],
      prompts: [],
    });
  });

  it('maps delete-project guardrail conflicts to HTTP 409 without deleting data', async () => {
    const bridge = await startBridge();

    await fetchJson(
      '/sessions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'shared-session', project: 'delete-project' }),
      },
      bridge.port,
    );
    await fetchJson(
      '/observations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Owned observation',
          content: 'Still owned by delete-project',
          session_id: 'shared-session',
          project: 'delete-project',
        }),
      },
      bridge.port,
    );
    await fetchJson(
      '/prompts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Foreign prompt', session_id: 'shared-session', project: 'other-project' }),
      },
      bridge.port,
    );

    const conflict = await fetchJson(
      '/projects/delete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: 'delete-project' }),
      },
      bridge.port,
    );

    expect(conflict.response.status).toBe(409);
    expect(conflict.body).toEqual({
      error: expect.stringMatching(/Cannot delete project delete-project/i),
      code: 'project_delete_conflict',
      project: 'delete-project',
      conflict: {
        session_id: 'shared-session',
        entity_type: 'prompt',
        foreign_project: 'other-project',
      },
    });
    expect(bridge.store.exportData('delete-project').sessions).toHaveLength(1);
    expect(bridge.store.exportData('delete-project').observations).toHaveLength(1);
    expect(bridge.store.exportData('other-project').prompts).toHaveLength(1);
    const deleteMutationCount = bridge.store.getDb().prepare(
      "SELECT COUNT(*) as count FROM sync_mutations WHERE operation = 'delete'"
    ).get() as { count: number };
    expect(deleteMutationCount.count).toBe(0);
  });

  it('returns structured errors for bad routes, bad JSON, invalid input, and missing observations', async () => {
    const bridge = await startBridge();

    const missingRoute = await fetchJson('/nonexistent', undefined, bridge.port);
    expect(missingRoute.response.status).toBe(404);
    expect(missingRoute.body).toEqual({ error: 'Not Found' });

    const badJsonResponse = await fetch(getUrl(bridge.port, '/observations'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title":',
    });
    const badJsonBody = await badJsonResponse.json();
    expect(badJsonResponse.status).toBe(400);
    expect(badJsonBody).toEqual({ error: 'Invalid JSON body' });

    const missingFields = await fetchJson(
      '/observations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      bridge.port,
    );
    expect(missingFields.response.status).toBe(400);
    expect(missingFields.body.error).toContain('title');

    const missingObservation = await fetchJson('/observations/999', undefined, bridge.port);
    expect(missingObservation.response.status).toBe(404);
    expect(missingObservation.body).toEqual({ error: 'Observation 999 not found' });

  });

  it('stop() closes the server', async () => {
    const bridge = await startBridge();
    const url = getUrl(bridge.port, '/health');

    await bridge.stop();
    bridge.store.close();
    bridges.pop();

    await expect(fetch(url)).rejects.toThrow();
  });

  describe('capture-passive support', () => {
    it('POST /capture-passive extracts learnings and reports deduplicates', async () => {
      const bridge = await startBridge();

      await fetchJson(
        '/observations',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Keep tests focused.',
            content: 'Keep tests focused.',
            type: 'learning',
            project: 'passive-project',
            session_id: 'passive-session',
          }),
        },
        bridge.port,
      );

      const result = await fetchJson(
        '/capture-passive',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: [
              '## Key Learnings:',
              '- Keep tests focused.',
              '- Keep payloads minimal.',
            ].join('\n'),
            project: 'passive-project',
            session_id: 'passive-session',
          }),
        },
        bridge.port,
      );

      expect(result.response.status).toBe(200);
      expect(result.body).toEqual({ extracted: 2, saved: 1, duplicates: 1 });
    });

    it('OpenAPI spec includes /capture-passive path', async () => {
      const bridge = await startBridge();

      const openapi = await fetchJson('/openapi.json', undefined, bridge.port);

      expect(openapi.response.status).toBe(200);
      expect(openapi.body.paths['/capture-passive']).toBeDefined();
    });

    it('OpenAPI spec documents the /projects/delete contract', async () => {
      const bridge = await startBridge();

      const openapi = await fetchJson('/openapi.json', undefined, bridge.port);

      expect(openapi.response.status).toBe(200);
      expect(openapi.body.paths['/projects/delete']).toEqual({
        post: {
          summary: 'Delete project data safely',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeleteProjectRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Project deletion result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/DeleteProjectResponse' },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/DeleteProjectConflict' },
          },
        },
      });

      expect(openapi.body.components.schemas.DeleteProjectRequest).toEqual({
        type: 'object',
        properties: {
          project: { type: 'string' },
        },
        required: ['project'],
      });

      expect(openapi.body.components.schemas.DeleteProjectResponse).toEqual({
        type: 'object',
        properties: {
          project: { type: 'string' },
          deleted: {
            type: 'object',
            properties: {
              observations: { type: 'integer' },
              observation_versions: { type: 'integer' },
              prompts: { type: 'integer' },
              sessions: { type: 'integer' },
            },
            required: ['observations', 'observation_versions', 'prompts', 'sessions'],
          },
        },
        required: ['project', 'deleted'],
      });

      expect(openapi.body.components.responses.DeleteProjectConflict).toEqual({
        description: 'Project deletion conflict response',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DeleteProjectConflict' },
          },
        },
      });

      expect(openapi.body.components.schemas.DeleteProjectConflict).toEqual({
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string', enum: ['project_delete_conflict'] },
          project: { type: 'string' },
          conflict: {
            type: 'object',
            properties: {
              session_id: { type: 'string' },
              entity_type: { type: 'string', enum: ['prompt', 'observation'] },
              foreign_project: { type: 'string' },
            },
            required: ['session_id', 'entity_type', 'foreign_project'],
          },
        },
        required: ['error', 'code', 'project', 'conflict'],
      });
    });

    it('OpenAPI spec documents project view endpoints', async () => {
      const bridge = await startBridge();

      const openapi = await fetchJson('/openapi.json', undefined, bridge.port);

      expect(openapi.response.status).toBe(200);
      expect(openapi.body.paths['/projects/{project}/summary']).toBeDefined();
      expect(openapi.body.paths['/projects/{project}/graph']).toBeDefined();
      expect(openapi.body.paths['/projects/{project}/topic-keys']).toBeDefined();
      expect(openapi.body.paths['/projects/{project}/graph'].get.parameters.map((parameter: any) => parameter.name)).toEqual([
        'project',
        'topic_key',
        'relation',
        'limit',
        'max_chars',
      ]);
      expect(openapi.body.paths['/projects/{project}/graph'].get.responses['200'].content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/ProjectGraphResponse',
      });
      expect(openapi.body.components.schemas.ProjectTextResponse).toBeDefined();
      expect(openapi.body.components.schemas.ProjectGraphFact).toBeDefined();
      expect(openapi.body.components.schemas.ProjectGraphSummary).toBeDefined();
      expect(openapi.body.components.schemas.ProjectGraphResponse).toBeDefined();
      expect(openapi.body.components.schemas.TopicKeysResponse).toBeDefined();
    });
  });

  describe('search mode via HTTP', () => {
    it('GET /observations/search accepts mode query param', async () => {
      const bridge = await startBridge();

      await fetchJson(
        '/observations',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Mode target',
            content: 'mode target content',
            project: 'mode-project',
            scope: 'project',
          }),
        },
        bridge.port,
      );

      const compact = await fetchJson('/observations/search?query=mode&mode=compact&project=mode-project', undefined, bridge.port);
      expect(compact.response.status).toBe(200);

      const preview = await fetchJson('/observations/search?query=mode&mode=preview&project=mode-project', undefined, bridge.port);
      expect(preview.response.status).toBe(200);
      expect(preview.body.results[0].preview).toBeTypeOf('string');
    });

    it('compact mode returns minimal JSON response', async () => {
      const bridge = await startBridge();

      await fetchJson(
        '/observations',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Compact response target',
            content: 'compact result body',
            project: 'compact-project',
          }),
        },
        bridge.port,
      );

      const compact = await fetchJson('/observations/search?query=compact&mode=compact&project=compact-project', undefined, bridge.port);
      expect(compact.response.status).toBe(200);
      expect(compact.body.total).toBe(1);
      expect(compact.body.results[0]).toEqual({
        id: expect.any(Number),
        title: 'Compact response target',
        type: expect.any(String),
        created_at: expect.any(String),
      });
      expect(compact.body.results[0].preview).toBeUndefined();
      expect(compact.body.results[0].project).toBeUndefined();
      expect(compact.body.results[0].scope).toBeUndefined();
      expect(compact.body.results[0].topic_key).toBeUndefined();
    });

    it('preview mode returns full JSON response with preview', async () => {
      const bridge = await startBridge();

      const created = await fetchJson(
        '/observations',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Preview response target',
            content: 'preview result body',
            project: 'preview-project',
            scope: 'personal',
            topic_key: 'reference/preview-target',
          }),
        },
        bridge.port,
      );

      const preview = await fetchJson('/observations/search?query=preview&mode=preview&project=preview-project&scope=personal', undefined, bridge.port);
      expect(preview.response.status).toBe(200);
      expect(preview.body.total).toBe(1);
      expect(preview.body.results[0]).toEqual({
        id: created.body.id,
        title: 'Preview response target',
        type: expect.any(String),
        project: 'preview-project',
        scope: 'personal',
        topic_key: 'reference/preview-target',
        created_at: expect.any(String),
        preview: expect.any(String),
      });
    });

    it('GET /observations/search supports topic_key_exact for exact key matches', async () => {
      const bridge = await startBridge();

      const exact = await fetchJson(
        '/observations',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Exact key match',
            content: 'Exact key content',
            project: 'topic-project',
            topic_key: 'architecture/auth-model',
          }),
        },
        bridge.port,
      );

      await fetchJson(
        '/observations',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Different key',
            content: 'Different key content',
            project: 'topic-project',
            topic_key: 'architecture/other-model',
          }),
        },
        bridge.port,
      );

      const response = await fetchJson(
        '/observations/search?query=ignored&topic_key_exact=architecture/auth-model&project=topic-project&mode=preview',
        undefined,
        bridge.port,
      );

      expect(response.response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.results[0].id).toBe(exact.body.id);
      expect(response.body.results[0].topic_key).toBe('architecture/auth-model');
      expect(response.body.results[0].title).toBe('Exact key match');
    });
  });
});
