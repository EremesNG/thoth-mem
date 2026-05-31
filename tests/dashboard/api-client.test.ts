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
