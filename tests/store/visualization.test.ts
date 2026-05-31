import { describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('Store visualization', () => {
  it('returns deterministic projection coordinates for unchanged slice scope', () => {
    const store = new Store(':memory:');

    try {
      store.saveObservation({
        title: 'Auth map',
        content: '<private>secret</private> Public auth summary',
        project: 'viz-project',
        topic_key: 'architecture/auth',
        type: 'architecture',
      });
      store.saveObservation({
        title: 'Cache map',
        content: 'Cache summary',
        project: 'viz-project',
        topic_key: 'architecture/cache',
        type: 'pattern',
      });

      const first = store.getVisualizationSlice({ project: 'viz-project', max_nodes: 10, max_edges: 10, depth: 1 });
      const second = store.getVisualizationSlice({ project: 'viz-project', max_nodes: 10, max_edges: 10, depth: 1 });

      expect(first.nodes.map((node) => ({ id: node.id, x: node.seed_x, y: node.seed_y })))
        .toEqual(second.nodes.map((node) => ({ id: node.id, x: node.seed_x, y: node.seed_y })));
      expect(first.nodes.some((node) => node.snippet.includes('secret'))).toBe(false);
    } finally {
      store.close();
    }
  });

  it('reports pending and degraded semantic health states', () => {
    const store = new Store(':memory:');

    try {
      const pending = store.getVisualizationHealth({ project: 'viz-project' });
      expect(['pending', 'degraded', 'ready', 'rebuilding']).toContain(pending.semantic_state);

      store.getDb().prepare("UPDATE semantic_index_state SET degraded = 1, pending = 0 WHERE lane IN ('chunk','sentence')").run();
      const degraded = store.getVisualizationHealth({ project: 'viz-project' });
      expect(degraded.semantic_state).toBe('degraded');
    } finally {
      store.close();
    }
  });

  it('supports viz filtering by session/relation/query and returns richer filter metadata', () => {
    const store = new Store(':memory:');
    try {
      const first = store.saveObservation({
        title: 'Auth decision',
        content: 'Use token cache for API auth',
        project: 'viz-rich',
        session_id: 'session-a',
        topic_key: 'architecture/auth',
        type: 'decision',
      });
      const second = store.saveObservation({
        title: 'Billing discovery',
        content: 'Billing retries are exponential',
        project: 'viz-rich',
        session_id: 'session-b',
        topic_key: 'product/billing',
        type: 'discovery',
      });

      store.getDb().prepare(
        'INSERT INTO observation_facts (observation_id, subject, relation, object, project, topic_key, type) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(first.observation.id, 'Auth', 'HAS_WHAT', 'Token cache', 'viz-rich', 'architecture/auth', 'decision');
      store.getDb().prepare(
        'INSERT INTO observation_facts (observation_id, subject, relation, object, project, topic_key, type) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(second.observation.id, 'Billing', 'HAS_WHY', 'Retry strategy', 'viz-rich', 'product/billing', 'discovery');

      const slice = store.getVisualizationSlice({
        project: 'viz-rich',
        session_id: 'session-a',
        relation: 'HAS_WHAT',
        query: 'token',
        observation_type: 'decision',
        max_nodes: 100,
        max_edges: 100,
      });

      expect(slice.edges.length).toBeGreaterThan(0);
      expect(slice.edges.every((edge) => ['fact', 'metadata'].includes(edge.kind ?? ''))).toBe(true);
      expect(slice.nodes.some((node) => node.kind === 'session')).toBe(true);
      expect(slice.nodes.some((node) => node.kind === 'project')).toBe(true);
      expect(slice.nodes.every((node) => !node.snippet.includes('<private>'))).toBe(true);

      const filters = store.getVisualizationFilters({ project: 'viz-rich' });
      expect(filters.sessions).toContain('session-a');
      expect(filters.sessions).toContain('session-b');
      expect(filters.relations).toContain('HAS_WHAT');
      expect(filters.relations).toContain('HAS_WHY');
    } finally {
      store.close();
    }
  });
});
