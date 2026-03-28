import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { registerMemSearch } from '../../src/tools/mem-search.js';

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

  it('returns exact topic_key matches when topic_key_exact is provided', () => {
    const exact = store.saveObservation({
      title: 'Exact key target',
      content: 'Exact lookup content',
      topic_key: 'architecture/auth-model',
      project: 'auth-project',
      scope: 'project',
    }).observation;

    store.saveObservation({
      title: 'Different key',
      content: 'Different exact key content',
      topic_key: 'architecture/other-model',
      project: 'auth-project',
      scope: 'project',
    });

    const results = store.searchObservations({
      query: 'this value is ignored for exact topic key lookup',
      topic_key_exact: 'architecture/auth-model',
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((result) => result.topic_key === 'architecture/auth-model')).toBe(true);
    expect(results.some((result) => result.id === exact.id)).toBe(true);
  });

  it('applies filters together with topic_key_exact', () => {
    store.saveObservation({
      title: 'Filter target A',
      content: 'Same topic key in project A',
      topic_key: 'topic/shared-key',
      project: 'project-a',
    });
    store.saveObservation({
      title: 'Filter target B',
      content: 'Same topic key in project B',
      topic_key: 'topic/shared-key',
      project: 'project-b',
    });

    const results = store.searchObservations({
      query: 'ignored in exact mode',
      topic_key_exact: 'topic/shared-key',
      project: 'project-a',
    });

    expect(results).toHaveLength(1);
    expect(results[0].project).toBe('project-a');
    expect(results[0].topic_key).toBe('topic/shared-key');
  });

  it('returns empty results for unknown topic_key_exact', () => {
    const results = store.searchObservations({
      query: 'ignored in exact mode',
      topic_key_exact: 'does/not/exist',
    });

    expect(results).toHaveLength(0);
  });

  it('finds observations by topic_key text via FTS query', () => {
    const saved = store.saveObservation({
      title: 'FTS topic key observation',
      content: 'FTS topic key content',
      topic_key: 'topic_searchable_key',
      project: 'search-project',
    }).observation;

    const results = store.searchObservations({ query: 'topic_searchable_key' });

    expect(results.some((result) => result.id === saved.id)).toBe(true);
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

describe('mem_search tool (handler)', () => {
  let store: Store;
  let toolHandler: ((input: any) => Promise<any>) | undefined;

  beforeEach(() => {
    store = new Store(':memory:');
    toolHandler = undefined;

    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_search') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;

    registerMemSearch(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('returns exact topic-key matches when topic_key_exact is provided', async () => {
    store.saveObservation({
      title: 'Exact topic key match',
      content: 'Exact topic key content',
      topic_key: 'architecture/auth-model',
      project: 'auth-project',
    });
    store.saveObservation({
      title: 'Non-matching topic key',
      content: 'Different topic key content',
      topic_key: 'architecture/other-model',
      project: 'auth-project',
    });

    const result = await toolHandler?.({
      query: 'ignored for exact key lookup',
      topic_key_exact: 'architecture/auth-model',
    });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('Found 1 memory:');
    expect(result?.content[0].text).toContain('Exact topic key match');
    expect(result?.content[0].text).not.toContain('Non-matching topic key');
  });

  it('returns empty results when topic_key_exact has no matches', async () => {
    store.saveObservation({
      title: 'Known topic',
      content: 'Known content',
      topic_key: 'architecture/known',
    });

    const result = await toolHandler?.({
      query: 'ignored for exact key lookup',
      topic_key_exact: 'architecture/missing',
    });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toBe('No memories found.');
  });
});
