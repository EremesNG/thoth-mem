import { describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('Store operation traces', () => {
  it('persists sanitized MCP request and response payloads', () => {
    const store = new Store(':memory:');

    try {
      const trace = store.saveOperationTrace({
        trace_id: 'trace-mcp-1',
        origin: 'mcp',
        target: 'mem_save',
        status: 'ok',
        project: 'trace-project',
        session_id: 'trace-session',
        started_at: '2026-06-01T10:00:00.000Z',
        finished_at: '2026-06-01T10:00:00.120Z',
        duration_ms: 120,
        request: {
          content: '<private>hidden implementation key</private> public memory',
          Authorization: 'Bearer eyJhbGciOiJIUzI1Ni.fake.signature',
          nested: {
            apiKey: 'sk-live-secret',
          },
        },
        response: {
          content: [{ type: 'text', text: 'Saved observation without secrets.' }],
          token: 'secret-response-token',
        },
      });

      expect(trace.id).toEqual(expect.any(Number));
      expect(trace.trace_id).toBe('trace-mcp-1');
      expect(trace.origin).toBe('mcp');
      expect(trace.target).toBe('mem_save');
      expect(trace.status).toBe('ok');
      expect(trace.project).toBe('trace-project');
      expect(trace.session_id).toBe('trace-session');
      expect(trace.duration_ms).toBe(120);
      expect(trace.request_json).toContain('public memory');
      expect(trace.request_json).not.toContain('hidden implementation key');
      expect(trace.request_json).not.toContain('sk-live-secret');
      expect(trace.request_json).not.toContain('eyJhbGciOiJIUzI1Ni');
      expect(trace.response_json).not.toContain('secret-response-token');
      expect(trace.request_truncated).toBe(false);
      expect(trace.response_truncated).toBe(false);
    } finally {
      store.close();
    }
  });

  it('lists traces with filters and returns detail by trace id', () => {
    const store = new Store(':memory:');

    try {
      store.saveOperationTrace({
        trace_id: 'trace-http-1',
        origin: 'http',
        target: 'GET /health',
        status: 'ok',
        project: 'alpha',
        started_at: '2026-06-01T10:00:01.000Z',
        finished_at: '2026-06-01T10:00:01.005Z',
        duration_ms: 5,
        request: { method: 'GET', path: '/health' },
        response: { ok: true },
      });
      store.saveOperationTrace({
        trace_id: 'trace-mcp-2',
        origin: 'mcp',
        target: 'mem_recall',
        status: 'error',
        project: 'beta',
        session_id: 'beta-session',
        started_at: '2026-06-01T10:00:02.000Z',
        finished_at: '2026-06-01T10:00:02.040Z',
        duration_ms: 40,
        request: { query: 'missing context' },
        error: 'provider unavailable',
      });

      const mcpTraces = store.listOperationTraces({ origin: 'mcp', status: 'error', limit: 10 });
      expect(mcpTraces.total).toBe(1);
      expect(mcpTraces.traces).toHaveLength(1);
      expect(mcpTraces.traces[0]).toMatchObject({
        trace_id: 'trace-mcp-2',
        target: 'mem_recall',
        status: 'error',
        project: 'beta',
      });

      const detail = store.getOperationTrace('trace-mcp-2');
      expect(detail?.error).toBe('provider unavailable');
      expect(detail?.request_json).toContain('missing context');
    } finally {
      store.close();
    }
  });

  it('truncates oversized trace payloads deterministically', () => {
    const store = new Store(':memory:');

    try {
      const trace = store.saveOperationTrace({
        trace_id: 'trace-large-1',
        origin: 'system',
        target: 'background-index',
        status: 'ok',
        started_at: '2026-06-01T10:00:03.000Z',
        finished_at: '2026-06-01T10:00:03.010Z',
        duration_ms: 10,
        request: { payload: 'x'.repeat(20_000) },
        response: { payload: 'y'.repeat(20_000) },
        max_payload_chars: 1024,
      });

      expect(trace.request_truncated).toBe(true);
      expect(trace.response_truncated).toBe(true);
      expect(trace.request_json.length).toBeLessThanOrEqual(1100);
      expect(trace.response_json?.length).toBeLessThanOrEqual(1100);
      expect(trace.request_json).toContain('[truncated');
      expect(trace.response_json).toContain('[truncated');
    } finally {
      store.close();
    }
  });
});
