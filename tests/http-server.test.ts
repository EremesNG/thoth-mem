import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createServer as createHttpServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { getConfig } from '../src/config.js';
import { createHttpBridge } from '../src/http-server.js';
import { Store } from '../src/store/index.js';

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

async function startBridge(): Promise<RunningBridge> {
  const port = await getAvailablePort();
  const store = new Store(':memory:');
  const config = { ...getConfig(), httpPort: port };
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

    const search = await fetchJson('/observations/search?query=updated&project=http-api-v2&scope=personal&limit=5', undefined, bridge.port);
    expect(search.response.status).toBe(200);
    expect(search.body.total).toBe(1);
    expect(search.body.results[0].id).toBe(created.body.id);
    expect(search.body.results[0].preview).toContain('updated content');

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

  it('supports topic key suggestion and passive capture extraction', async () => {
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

    bridge.store.saveObservation({
      title: 'Use stable topic keys for evolving topics.',
      content: 'Use stable topic keys for evolving topics.',
      type: 'learning',
      project: 'alpha',
      session_id: 'capture-session',
    });

    const capture = await fetchJson(
      '/capture-passive',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: 'alpha',
          session_id: 'capture-session',
          content: [
            '## Key Learnings:',
            '- Use stable topic keys for evolving topics.',
            '- HTTP handlers should return structured JSON.',
          ].join('\n'),
        }),
      },
      bridge.port,
    );

    expect(capture.response.status).toBe(200);
    expect(capture.body).toEqual({ extracted: 2, saved: 1, duplicates: 1 });
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
    expect(syncImport.body).toEqual({ imported: 3, skipped: 0 });
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
});
