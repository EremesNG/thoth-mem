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

  it('filters search results by session_id', () => {
    store.saveObservation({
      title: 'Session scoped auth',
      content: 'Scoped JWT authentication result',
      session_id: 'session-a',
      project: 'auth-project',
    });
    store.saveObservation({
      title: 'Other session auth',
      content: 'Scoped JWT authentication result',
      session_id: 'session-b',
      project: 'auth-project',
    });

    const results = store.searchObservations({
      query: 'Scoped JWT authentication',
      session_id: 'session-a',
    });

    expect(results).toHaveLength(1);
    expect(results[0].session_id).toBe('session-a');
    expect(results[0].title).toBe('Session scoped auth');
  });

  describe('progressive disclosure mode', () => {
    it('defaults to compact mode when mode is omitted', () => {
      store.saveObservation({
        title: 'Default compact mode',
        content: 'default-mode-token and no preview snippet needed',
      });

      const defaultMode = store.searchObservationsFormatted({ query: 'default-mode-token' });
      const explicitCompact = store.searchObservationsFormatted({ query: 'default-mode-token', mode: 'compact' });

      expect(defaultMode).toBe(explicitCompact);
    });

    it('compact mode returns only id, title, type, created_at', () => {
      store.saveObservation({
        title: 'Compact output observation',
        content: 'compact-mode-token compact-snippet-should-not-appear',
        type: 'manual',
        project: 'compact-project',
      });

      const text = store.searchObservationsFormatted({ query: 'compact-mode-token', mode: 'compact' });
      const resultLine = text.split('\n').find((line) => line.startsWith('['));

      expect(resultLine).toMatch(/^\[\d+\] \(manual\) Compact output observation — /);
      expect(text).not.toContain('### [manual]');
      expect(text).not.toContain('**Project:**');
      expect(text).not.toContain('compact-snippet-should-not-appear');
    });

    it('preview mode returns current behavior with snippets', () => {
      store.saveObservation({
        title: 'Preview output observation',
        content: 'preview-mode-token preview-unique-snippet-here',
        type: 'manual',
      });

      const text = store.searchObservationsFormatted({ query: 'preview-mode-token', mode: 'preview' });

      expect(text).toContain('### [manual] Preview output observation');
      expect(text).toContain('preview-unique-snippet-here');
      expect(text).toContain('**Project:**');
    });
  });

  
});
