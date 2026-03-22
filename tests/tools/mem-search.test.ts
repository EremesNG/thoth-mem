import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('mem_search tool (via Store)', () => {
  let store: Store;
  beforeEach(() => {
    store = new Store(':memory:');
    // Seed test data
    store.saveObservation({ title: 'JWT auth middleware', content: 'Implemented JWT authentication for API routes', type: 'architecture', project: 'auth-project' });
    store.saveObservation({ title: 'Fixed N+1 query', content: 'Resolved N+1 query in user list endpoint', type: 'bugfix', project: 'auth-project' });
    store.saveObservation({ title: 'Redis caching pattern', content: 'Added Redis cache layer for session data', type: 'pattern', project: 'cache-project' });
  });
  afterEach(() => { store.close(); });

  it('finds observations by keyword', () => {
    const results = store.searchObservations({ query: 'JWT authentication' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].title).toContain('JWT');
  });

  it('filters by type', () => {
    const results = store.searchObservations({ query: 'query', type: 'bugfix' });
    expect(results.length).toBe(1);
    expect(results[0].type).toBe('bugfix');
  });

  it('filters by project', () => {
    const results = store.searchObservations({ query: 'cache', project: 'cache-project' });
    expect(results.length).toBe(1);
    expect(results[0].project).toBe('cache-project');
  });

  it('returns empty array for no matches', () => {
    const results = store.searchObservations({ query: 'nonexistent_xyzzy_12345' });
    expect(results).toHaveLength(0);
  });

  it('respects limit', () => {
    const results = store.searchObservations({ query: 'auth JWT query Redis', limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('includes preview in results', () => {
    const results = store.searchObservations({ query: 'JWT' });
    expect(results[0].preview).toBeDefined();
    expect(typeof results[0].preview).toBe('string');
  });
});
