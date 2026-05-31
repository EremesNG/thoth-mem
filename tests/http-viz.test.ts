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
});
