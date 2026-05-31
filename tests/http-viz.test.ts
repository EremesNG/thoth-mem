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
    const saved = store.saveObservation({
      title: 'Billing relation',
      content: 'billing visible',
      project: 'viz-http',
      session_id: 'viz-session-b',
      topic_key: 'architecture/billing',
      type: 'discovery',
    });
    store.getDb().prepare(
      'INSERT INTO observation_facts (observation_id, subject, relation, object, project, topic_key, type) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(saved.observation.id, 'Billing', 'HAS_WHAT', 'Payments', 'viz-http', 'architecture/billing', 'discovery');
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

    const filtersResponse = await fetch(`http://127.0.0.1:${port}/viz/filters?project=viz-http&session_id=viz-session-b`);
    expect(filtersResponse.status).toBe(200);
    const filtersBody = await filtersResponse.json();
    expect(filtersBody.sessions).toContain('viz-session-b');
    expect(filtersBody.relations).toContain('HAS_WHAT');
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
    expect(recallBody.lanes['fact-kg'].length).toBe(0);
    expect(recallBody.lane_states.lexical.status).toBe('ready');
    expect(recallBody.lane_states['sentence-vector'].status).toBe('pending');
    expect(recallBody.lane_states['chunk-vector'].status).toBe('pending');
    expect(recallBody.lane_states['fact-kg'].status).toBe('unavailable');
    expect(recallBody.lane_states['sentence-vector'].reason).toMatch(/^semantic-/);
    expect(recallBody.lane_states['chunk-vector'].reason).toMatch(/^semantic-/);
    expect(recallBody.lane_states['fact-kg'].reason).toBe('kg-no-match');
  });
});
