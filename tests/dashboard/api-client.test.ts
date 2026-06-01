import { describe, expect, it } from 'vitest';

import { api, normalizeProjectGraphResponse } from '../../dashboard/src/api/client.js';
import type { ProjectGraphFact, ProjectGraphResponse } from '../../dashboard/src/api/client.js';

describe('api.getMcpVersion', () => {
  it('reads the MCP version from the OpenAPI info payload', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      expect(input).toBe('/openapi.json');

      return new Response(JSON.stringify({
        openapi: '3.0.0',
        info: {
          title: 'thoth-mem HTTP API',
          version: '0.2.1',
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await expect(api.getMcpVersion()).resolves.toBe('0.2.1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('api error handling', () => {
  it('rejects non-OK non-JSON responses with ApiError without double-reading the body', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response('<!doctype html><html><body>Bad Gateway</body></html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      });
    }) as typeof fetch;

    try {
      await expect(api.getStats()).rejects.toMatchObject({
        name: 'ApiError',
        status: 502,
      });
      await expect(api.getStats()).rejects.not.toThrow(TypeError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('normalizeProjectGraphResponse', () => {
  it('normalizes legacy text-only graph responses to a safe structured shape', () => {
    const result = normalizeProjectGraphResponse({
      project: 'thoth-mem',
      text: 'legacy graph output\n... truncated',
    });

    expect(result).toEqual({
      project: 'thoth-mem',
      text: 'legacy graph output\n... truncated',
      facts: [],
      summary: {
        shown: 0,
        total: 0,
        omitted: 0,
        truncated: true,
        text_truncated: true,
        limit: 0,
        max_chars: 0,
        filters: {},
      },
    });
  });

  it('preserves structured graph responses', () => {
    const fact: ProjectGraphFact = {
      id: 1,
      observation_id: 2,
      subject: 'Subject',
      relation: 'HAS_WHAT',
      object: 'Object',
      project: 'thoth-mem',
      topic_key: 'topic/key',
      type: 'discovery',
      created_at: '2026-05-19T00:00:00.000Z',
    };
    const response: ProjectGraphResponse = {
      project: 'thoth-mem',
      text: 'structured graph output',
      facts: [fact],
      summary: {
        shown: 1,
        total: 3,
        omitted: 2,
        truncated: false,
        text_truncated: false,
        limit: 100,
        max_chars: 6000,
        filters: { topic_key: 'topic/key', relation: 'HAS_WHAT' },
      },
    };

    expect(normalizeProjectGraphResponse(response)).toEqual(response);
  });
});

describe('viz client routes', () => {
  it('builds viz slice/expand/inspect/filter/health requests', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const url = String(input);
      if (url.startsWith('/viz/slice')) {
        return new Response(JSON.stringify({
          nodes: [],
          edges: [],
          state: 'empty',
          continuation: null,
          truncated: false,
          health: { semantic_state: 'ready', pending_jobs: 0 },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/viz/expand') {
        return new Response(JSON.stringify({
          nodes: [],
          edges: [],
          state: 'sparse',
          continuation: null,
          truncated: false,
          health: { semantic_state: 'pending', pending_jobs: 1 },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/viz/inspect/node/')) {
        return new Response(JSON.stringify({
          id: 'obs:1',
          kind: 'observation',
          label: 'Node 1',
          snippet: 'Snippet',
          links: [],
          metadata: {},
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/viz/inspect/edge/')) {
        return new Response(JSON.stringify({
          id: 'edge:1',
          source_id: 'obs:1',
          target_id: 'obs:2',
          relation: 'HAS_TOPIC_KEY',
          label: 'Topic link',
          summary: 'Summary',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/viz/filters')) {
        return new Response(JSON.stringify({
          projects: ['p1'],
          sessions: ['s1'],
          topic_keys: ['t1'],
          types: ['decision'],
          relations: ['HAS_WHAT'],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ semantic_state: 'degraded', pending_jobs: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await api.getVizSlice({ project: 'p1', session_id: 's1', topic_key: 't1', type: 'decision', observation_type: 'decision', relation: 'HAS_WHAT', query: 'token', max_nodes: 100, max_edges: 300, depth: 1, cursor: 'c1' });
      await api.expandVizNode({ project: 'p1', session_id: 's1', topic_key: 't1', type: 'decision', observation_type: 'decision', relation: 'HAS_WHAT', query: 'token', node_id: 'obs:1', depth: 1, max_nodes: 100, max_edges: 300, cursor: 'c1' });
      await api.inspectVizNode('obs:1', { project: 'p1' });
      await api.inspectVizEdge('edge:1', { project: 'p1' });
      await api.getVizFilters({ project: 'p1', session_id: 's1' });
      await api.getVizHealth({ project: 'p1' });

      expect(String(calls[0].input)).toContain('/viz/slice?project=p1');
      expect(String(calls[0].input)).toContain('session_id=s1');
      expect(String(calls[0].input)).toContain('observation_type=decision');
      expect(String(calls[0].input)).toContain('relation=HAS_WHAT');
      expect(String(calls[0].input)).toContain('query=token');
      expect(String(calls[1].input)).toBe('/viz/expand');
      expect(calls[1].init?.method).toBe('POST');
      expect(String(calls[2].input)).toContain('/viz/inspect/node/obs%3A1?project=p1');
      expect(String(calls[3].input)).toContain('/viz/inspect/edge/edge%3A1?project=p1');
      expect(String(calls[4].input)).toContain('/viz/filters?project=p1&session_id=s1');
      expect(String(calls[5].input)).toContain('/viz/health?project=p1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('observatory client routes', () => {
  it('builds observatory requests and keeps /viz fallback methods available', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const url = String(input);
      if (url.startsWith('/observatory/context')) {
        return new Response(JSON.stringify({
          scope: {},
          context_token: 'ctx',
          health: { semantic_state: 'ready', pending_jobs: 0 },
          capabilities: { viz_fallback_available: true, observatory_routes_available: true },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/observatory/recall')) {
        return new Response(JSON.stringify({
          context_token: 'ctx',
          lanes: { lexical: [], 'sentence-vector': [], 'chunk-vector': [], 'fact-kg': [] },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/observatory/pivot') {
        return new Response(JSON.stringify({
          context_token: 'ctx',
          scope: {},
          focus_node_id: 'obs:1',
          target: 'map',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/observatory/map/frontier') {
        return new Response(JSON.stringify({
          nodes: [],
          edges: [],
          frontier_state: { added_node_ids: [], already_visible_node_ids: [], exhausted: true, continuation: null, reason: 'no-neighbors' },
          health: { semantic_state: 'ready', pending_jobs: 0 },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/observatory/ledger/')) {
        return new Response(JSON.stringify({
          observation_id: 1,
          title: 'Ledger',
          type: 'decision',
          what: [],
          why: [],
          where: [],
          learned: [],
          facts: [],
          provenance: { session_id: 's1', project: 'p1', topic_key: 't1', created_at: '2026-05-31T00:00:00.000Z' },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/observatory/timeline')) {
        return new Response(JSON.stringify({
          context_token: 'ctx',
          events: [],
          continuation: null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/observatory/health')) {
        return new Response(JSON.stringify({ semantic_state: 'pending', pending_jobs: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        nodes: [],
        edges: [],
        state: 'empty',
        continuation: null,
        truncated: false,
        health: { semantic_state: 'ready', pending_jobs: 0 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    try {
      await api.getObservatoryContext({ project: 'p1', query: 'jwt' });
      await api.getObservatoryRecall({ context_token: 'ctx', lanes: ['lexical', 'fact-kg'] });
      await api.resolveObservatoryPivot({ pivot_token: 'tok', target: 'map' });
      await api.getObservatoryMapFrontier({ context_token: 'ctx', focus_node_id: 'obs:1', max_nodes: 10 });
      await api.getObservatoryLedger(1);
      await api.getObservatoryTimeline({ context_token: 'ctx', limit: 20 });
      await api.getObservatoryHealth({ project: 'p1' });
      await api.getVizSlice({ project: 'p1' });

      expect(String(calls[0].input)).toContain('/observatory/context?project=p1');
      expect(String(calls[1].input)).toContain('/observatory/recall?context_token=ctx');
      expect(String(calls[1].input)).toContain('lanes=lexical%2Cfact-kg');
      expect(String(calls[2].input)).toBe('/observatory/pivot');
      expect(String(calls[2].init?.method)).toBe('POST');
      expect(String(calls[3].input)).toBe('/observatory/map/frontier');
      expect(String(calls[4].input)).toContain('/observatory/ledger/1');
      expect(String(calls[5].input)).toContain('/observatory/timeline?context_token=ctx');
      expect(String(calls[6].input)).toContain('/observatory/health?project=p1');
      expect(String(calls[7].input)).toContain('/viz/slice?project=p1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('operations console client routes', () => {
  it('builds version, operation, trace, and rebuild requests', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const url = String(input);

      if (url === '/version') {
        return new Response(JSON.stringify({ version: '0.2.2' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/operations') {
        return new Response(JSON.stringify({ operations: [{ id: 'mcp-mem-recall', origin: 'mcp', label: 'mem_recall', kind: 'read', target: 'mem_recall', description: 'Recall' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/operation-traces/trace-1')) {
        return new Response(JSON.stringify({
          id: 1,
          trace_id: 'trace-1',
          origin: 'http',
          target: 'POST /observations',
          status: 'ok',
          project: 'ops',
          session_id: 's1',
          started_at: '2026-06-01T00:00:00.000Z',
          finished_at: '2026-06-01T00:00:00.010Z',
          duration_ms: 10,
          request_json: '{}',
          response_json: '{}',
          error: null,
          request_truncated: false,
          response_truncated: false,
          created_at: '2026-06-01T00:00:00.010Z',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/operation-traces')) {
        return new Response(JSON.stringify({ traces: [], total: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/index/status')) {
        return new Response(JSON.stringify({
          project: 'ops',
          state: { pending: true, degraded: false, stale: true, degradedReason: null },
          progress: { lanes: [], jobs: [], byKind: [], oldestPendingAt: null, queueLagMs: null, totals: { total: 0, pending: 0, running: 0, done: 0, failed: 0 }, coverage: { observations: 0, chunks: 0, sentences: 0, chunkVectors: 0, sentenceVectors: 0 }, recentErrors: [] },
          health: { semantic_state: 'pending', pending_jobs: 1 },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/index/rebuild') {
        return new Response(JSON.stringify({ project: 'ops', queued: true, dedupe_key: 'rebuild:dashboard:ops', processed: 0, state: {}, progress: {}, health: {} }), { status: 202, headers: { 'content-type': 'application/json' } });
      }

      return new Response(JSON.stringify({ project: 'ops', observations_scanned: 1, facts_deleted: 1, facts_created: 2 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await expect(api.getVersion()).resolves.toEqual({ version: '0.2.2' });
      await api.getOperations();
      await api.getOperationTraces({ origin: 'http', target: 'POST /observations', status: 'ok', project: 'ops', limit: 25 });
      await api.getOperationTrace('trace-1');
      await api.getIndexStatus({ project: 'ops' });
      await api.rebuildIndex({ project: 'ops', reason: 'dashboard', process_limit: 0 });
      await api.rebuildGraph({ project: 'ops' });

      expect(String(calls[0].input)).toBe('/version');
      expect(String(calls[1].input)).toBe('/operations');
      expect(String(calls[2].input)).toContain('/operation-traces?origin=http');
      expect(String(calls[2].input)).toContain('target=POST+%2Fobservations');
      expect(String(calls[2].input)).toContain('status=ok');
      expect(String(calls[3].input)).toBe('/operation-traces/trace-1');
      expect(String(calls[4].input)).toBe('/index/status?project=ops');
      expect(String(calls[5].input)).toBe('/index/rebuild');
      expect(calls[5].init?.method).toBe('POST');
      expect(calls[5].init?.body).toBe(JSON.stringify({ project: 'ops', reason: 'dashboard', process_limit: 0 }));
      expect(String(calls[6].input)).toBe('/graph/rebuild');
      expect(calls[6].init?.method).toBe('POST');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
