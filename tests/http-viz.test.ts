import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { getConfig } from '../src/config.js';
import { createHttpBridge } from '../src/http-server.js';
import { Store } from '../src/store/index.js';

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
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

describe('viz routes', () => {
  const active: Array<{ store: Store; stop: () => Promise<void>; port: number }> = [];

  afterEach(async () => {
    while (active.length > 0) {
      const item = active.pop();
      if (!item) continue;
      await item.stop();
      item.store.close();
    }
  });

  it('serves viz slice and expand with privacy sanitization and read-only expand', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:');
    store.saveObservation({
      title: 'Auth private',
      content: '<private>do not show</private> visible content',
      project: 'viz-http',
      session_id: 'viz-session-a',
      topic_key: 'architecture/auth',
      type: 'architecture',
    });
    store.saveObservation({
      title: 'Billing relation',
      content: 'What: Payments',
      project: 'viz-http',
      session_id: 'viz-session-b',
      topic_key: 'architecture/billing',
      type: 'discovery',
    });
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const sliceResponse = await fetch(`http://127.0.0.1:${port}/viz/slice?project=viz-http&session_id=viz-session-b&relation=HAS_WHAT&query=payments&observation_type=discovery&type=discovery&max_nodes=20&max_edges=20&depth=1`);
    expect(sliceResponse.status).toBe(200);
    const sliceBody = await sliceResponse.json();
    expect(sliceBody.nodes.length).toBeGreaterThan(0);
    expect(sliceBody.nodes[0].snippet).not.toContain('do not show');

    const beforeMutations = (store.getDb().prepare('SELECT COUNT(*) as count FROM sync_mutations').get() as { count: number }).count;
    const expandResponse = await fetch(`http://127.0.0.1:${port}/viz/expand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'viz-http', session_id: 'viz-session-b', relation: 'HAS_WHAT', query: 'payments', observation_type: 'discovery', node_id: sliceBody.nodes[0].id, depth: 1, max_nodes: 20, max_edges: 20 }),
    });
    expect(expandResponse.status).toBe(200);
    const afterMutations = (store.getDb().prepare('SELECT COUNT(*) as count FROM sync_mutations').get() as { count: number }).count;
    expect(afterMutations).toBe(beforeMutations);

    const healthResponse = await fetch(`http://127.0.0.1:${port}/viz/health?project=viz-http`);
    expect(healthResponse.status).toBe(200);
    const healthBody = await healthResponse.json();
    expect(['ready', 'pending', 'degraded', 'rebuilding']).toContain(healthBody.semantic_state);
    expect(healthBody.semantic.jobs.pending).toBeGreaterThan(0);
    expect(healthBody.semantic.jobs.queue_lag_ms).toEqual(expect.any(Number));
    expect(healthBody.semantic.jobs.by_kind.some((job: { kind: string; pending: number }) => (
      job.kind === 'chunk' && job.pending > 0
    ))).toBe(true);
    expect(healthBody.semantic.coverage.observations).toBe(2);
    expect(Array.isArray(healthBody.semantic.recent_errors)).toBe(true);

    const filtersResponse = await fetch(`http://127.0.0.1:${port}/viz/filters?project=viz-http&session_id=viz-session-b`);
    expect(filtersResponse.status).toBe(200);
    const filtersBody = await filtersResponse.json();
    expect(filtersBody.sessions).toContain('viz-session-b');
    expect(filtersBody.relations).toContain('HAS_WHAT');
  });

  it('rebuilds graph-lite facts through HTTP POST /graph/rebuild without legacy table dependency', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:');
    const saved = store.saveObservation({
      title: 'HTTP rebuild graph',
      content: '**What**: HTTP rebuild KG content',
      project: 'http-rebuild',
      session_id: 'http-rebuild-session',
      topic_key: 'http/rebuild',
      type: 'decision',
    }).observation;
    store.getDb().prepare("DELETE FROM kg_triples WHERE source_type = 'observation'").run();
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const response = await fetch(`http://127.0.0.1:${port}/graph/rebuild`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'http-rebuild' }),
    });
    const body = await response.json();
    const triples = store.getDb().prepare(
      "SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?"
    ).get(saved.id) as { count: number };
    const legacyTable = store.getDb().prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'observation_facts'"
    ).get() as { name: string } | undefined;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      project: 'http-rebuild',
      observations_scanned: 1,
      facts_deleted: 0,
    });
    expect(body.facts_created).toBeGreaterThan(0);
    expect(triples.count).toBeGreaterThan(0);
    expect(legacyTable).toBeUndefined();
    expect(store.getObservationFacts({ observation_id: saved.id }).map((fact) => fact.relation)).toEqual([
      'HAS_TYPE',
      'IN_PROJECT',
      'HAS_TOPIC_KEY',
      'HAS_WHAT',
    ]);
  });

  it('signals empty/sparse/dense states across slice sizes', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:');
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const emptyResponse = await fetch(`http://127.0.0.1:${port}/viz/slice?project=no-data&max_nodes=10&max_edges=10`);
    const emptyBody = await emptyResponse.json();
    expect(emptyBody.state).toBe('empty');

    store.saveObservation({ title: 'one', content: 'one', project: 'viz-state', topic_key: 'a/b' });
    const sparseResponse = await fetch(`http://127.0.0.1:${port}/viz/slice?project=viz-state&max_nodes=20&max_edges=20`);
    const sparseBody = await sparseResponse.json();
    expect(['sparse', 'dense']).toContain(sparseBody.state);

    for (let index = 0; index < 20; index += 1) {
      store.saveObservation({ title: `dense-${index}`, content: `dense-${index}`, project: 'viz-state', topic_key: `k/${index}` });
    }
    const denseResponse = await fetch(`http://127.0.0.1:${port}/viz/slice?project=viz-state&max_nodes=10&max_edges=100`);
    const denseBody = await denseResponse.json();
    expect(denseBody.state).toBe('dense');
  });

  it('serves observatory routes with token and continuation validation', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:');
    const saved = store.saveObservation({
      title: 'Observatory auth',
      content: 'jwt rotation',
      project: 'obs-http',
      session_id: 'obs-session',
      topic_key: 'auth/jwt',
      type: 'decision',
    });
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const contextResponse = await fetch(`http://127.0.0.1:${port}/observatory/context?project=obs-http&session_id=obs-session&query=jwt`);
    expect(contextResponse.status).toBe(200);
    const contextBody = await contextResponse.json();
    expect(contextBody.context_token).toBeTypeOf('string');

    const recallResponse = await fetch(`http://127.0.0.1:${port}/observatory/recall?context_token=${encodeURIComponent(contextBody.context_token)}&lanes=lexical`);
    expect(recallResponse.status).toBe(200);
    const recallBody = await recallResponse.json();
    expect(recallBody.lanes.lexical.length).toBeGreaterThan(0);

    const pivotResponse = await fetch(`http://127.0.0.1:${port}/observatory/pivot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pivot_token: recallBody.lanes.lexical[0].pivot_token, target: 'map' }),
    });
    expect(pivotResponse.status).toBe(200);

    const frontierResponse = await fetch(`http://127.0.0.1:${port}/observatory/map/frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_token: contextBody.context_token, focus_node_id: `obs:${saved.observation.id}`, visible_node_ids: [], max_nodes: 1 }),
    });
    expect(frontierResponse.status).toBe(200);
    const frontierBody = await frontierResponse.json();
    expect(frontierBody.frontier_state.added_node_ids.length).toBeGreaterThan(0);

    const invalidContinuationResponse = await fetch(`http://127.0.0.1:${port}/observatory/map/frontier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_token: contextBody.context_token, focus_node_id: `obs:${saved.observation.id}`, continuation: 'bad-token' }),
    });
    expect(invalidContinuationResponse.status).toBe(400);

    const invalidTokenResponse = await fetch(`http://127.0.0.1:${port}/observatory/recall?context_token=not-a-token`);
    expect(invalidTokenResponse.status).toBe(400);

    const ledgerResponse = await fetch(`http://127.0.0.1:${port}/observatory/ledger/${saved.observation.id}`);
    expect(ledgerResponse.status).toBe(200);

    const timelineResponse = await fetch(`http://127.0.0.1:${port}/observatory/timeline?context_token=${encodeURIComponent(contextBody.context_token)}&limit=1`);
    expect(timelineResponse.status).toBe(200);
  });

  it('observatory lane truth: HTTP recall lane payload must not clone lexical evidence into semantic/kg lanes', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:');
    store.saveObservation({
      title: 'HTTP lexical only',
      content: 'lexical-only phrase for http lane truth',
      project: 'obs-http-lane',
      session_id: 'obs-http-session',
    });
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const contextResponse = await fetch(`http://127.0.0.1:${port}/observatory/context?project=obs-http-lane&session_id=obs-http-session&query=lexical-only`);
    expect(contextResponse.status).toBe(200);
    const contextBody = await contextResponse.json();

    const recallResponse = await fetch(
      `http://127.0.0.1:${port}/observatory/recall?context_token=${encodeURIComponent(contextBody.context_token)}&lanes=lexical,sentence-vector,chunk-vector,fact-kg&limit=20`,
    );
    expect(recallResponse.status).toBe(200);
    const recallBody = await recallResponse.json();

    expect(recallBody.lanes.lexical.length).toBeGreaterThan(0);
    expect(recallBody.lanes['sentence-vector'].length).toBe(0);
    expect(recallBody.lanes['chunk-vector'].length).toBe(0);
    expect(recallBody.lanes['fact-kg'].length).toBeGreaterThan(0);
    expect(recallBody.lane_states.lexical.status).toBe('ready');
    expect(recallBody.lane_states['sentence-vector'].status).toBe('pending');
    expect(recallBody.lane_states['chunk-vector'].status).toBe('pending');
    expect(recallBody.lane_states['fact-kg'].status).toBe('ready');
    expect(recallBody.lane_states['sentence-vector'].reason).toMatch(/^semantic-/);
    expect(recallBody.lane_states['chunk-vector'].reason).toMatch(/^semantic-/);
    expect(recallBody.lane_states['fact-kg'].reason).toBe('ok');
  });

  it('exposes background indexing failures through HTTP index status', async () => {
    const port = await getAvailablePort();
    const store = new Store(':memory:');
    const saved = store.saveObservation({
      title: 'Index failure telemetry',
      content: 'provider outage should remain visible',
      project: 'idx-http-failure',
      session_id: 'idx-session',
    });
    store.getDb().prepare(
      `UPDATE semantic_jobs
       SET state = 'failed',
           attempt_count = 3,
           last_error = 'embedding provider offline',
           updated_at = datetime('now')
       WHERE job_key = ?`
    ).run(`chunk:${saved.observation.id}`);
    const bridge = createHttpBridge(store, { ...getConfig(), httpPort: port });
    await bridge.start();
    active.push({ store, port, stop: () => bridge.stop() });

    const statusResponse = await fetch(`http://127.0.0.1:${port}/index/status?project=idx-http-failure`);
    expect(statusResponse.status).toBe(200);
    const statusBody = await statusResponse.json();
    expect(statusBody.health.semantic.recent_errors.some((error: { last_error: string | null; job_key: string }) => (
      error.job_key === `chunk:${saved.observation.id}`
      && error.last_error === 'embedding provider offline'
    ))).toBe(true);
    expect(statusBody.progress.recentErrors.some((error: { lastError: string | null; jobKey: string }) => (
      error.jobKey === `chunk:${saved.observation.id}`
      && error.lastError === 'embedding provider offline'
    ))).toBe(true);
  });
});
