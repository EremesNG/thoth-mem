import { describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';
import { StaleAdminPreviewError } from '../../src/store/types.js';

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

  it('persists metrics json and summarizes payload averages plus mem_get correlation', () => {
    const store = new Store(':memory:');

    try {
      store.saveOperationTrace({
        trace_id: 'trace-recall-avoided',
        origin: 'mcp',
        target: 'mem_recall',
        status: 'ok',
        project: 'trace-project',
        started_at: '2026-06-01T10:00:00.000Z',
        finished_at: '2026-06-01T10:00:00.010Z',
        request: { query: 'safe recall' },
        response: { content: [{ type: 'text', text: 'obs:10 safe evidence' }] },
        metrics: {
          schema_version: 1,
          request_chars: 23,
          response_chars: 44,
          returned_chars: 44,
          full_chars: 200,
          evidence_chars: 80,
          saved_chars: 156,
          compression_ratio: 0.78,
          token_basis: 'estimated_chars_div_4',
          estimated_tokens: { request: 6, response: 11, returned: 11, full: 50, evidence: 20 },
          evidence_observation_ids: [10],
          retrieval_mode: 'compact',
        },
        correlation_id: 'corr-avoided',
      });
      store.saveOperationTrace({
        trace_id: 'trace-recall-escalated',
        origin: 'mcp',
        target: 'mem_context',
        status: 'ok',
        project: 'trace-project',
        started_at: '2026-06-01T10:01:00.000Z',
        finished_at: '2026-06-01T10:01:00.010Z',
        request: { recall_query: 'needs full fetch' },
        response: { content: [{ type: 'text', text: 'obs:11 evidence' }] },
        metrics: {
          schema_version: 1,
          request_chars: 35,
          response_chars: 38,
          returned_chars: 38,
          full_chars: 220,
          evidence_chars: 90,
          saved_chars: 182,
          compression_ratio: 0.827,
          token_basis: 'estimated_chars_div_4',
          estimated_tokens: { request: 9, response: 10, returned: 10, full: 55, evidence: 23 },
          evidence_observation_ids: [11],
          retrieval_mode: 'context',
        },
        correlation_id: 'corr-escalated',
      });
      store.saveOperationTrace({
        trace_id: 'trace-get-escalation',
        origin: 'mcp',
        target: 'mem_get',
        status: 'ok',
        project: 'trace-project',
        started_at: '2026-06-01T10:05:00.000Z',
        finished_at: '2026-06-01T10:05:00.010Z',
        request: { id: 11 },
        response: { content: [{ type: 'text', text: 'full safe body' }] },
        metrics: {
          schema_version: 1,
          request_chars: 9,
          response_chars: 40,
          returned_chars: 40,
          full_chars: 40,
          saved_chars: 0,
          compression_ratio: 0,
          token_basis: 'estimated_chars_div_4',
          estimated_tokens: { request: 3, response: 10, returned: 10, full: 10 },
          fetched_observation_id: 11,
        },
        correlation_id: 'corr-escalated',
      });

      const traces = store.listOperationTraces({ target: 'mem_recall' });
      expect(traces.traces[0].correlation_id).toBe('corr-avoided');
      expect(traces.traces[0].metrics_json).toContain('"schema_version":1');
      expect(traces.traces[0].metrics_json).not.toContain('safe recall');

      const telemetry = store.getOperationTraceTelemetry({ project: 'trace-project', now: '2026-06-01T10:20:30.000Z' });
      expect(telemetry.average_payload_chars_by_tool.mem_recall.returned_chars).toBe(44);
      expect(telemetry.average_payload_chars_by_tool.mem_context.returned_chars).toBe(38);
      expect(telemetry.mem_get_avoided_count).toBe(1);
      expect(telemetry.mem_get_escalated_count).toBe(1);
      expect(telemetry.mem_get_pending_count).toBe(0);
      expect(telemetry.correlation_window_minutes).toBe(15);
    } finally {
      store.close();
    }
  });
});

describe('operation trace retention administration', () => {
  it('uses strict status cutoffs and requires the exact preview binding', () => {
    const store = new Store(':memory:');
    try {
      const now = '2026-08-12T12:00:00.000Z';
      for (const [trace_id, status, started_at] of [
        ['old-ok', 'ok', '2026-08-05T11:59:59.999Z'],
        ['boundary-ok', 'ok', '2026-08-05T12:00:00.000Z'],
        ['old-error', 'error', '2026-07-13T11:59:59.999Z'],
      ] as const) store.saveOperationTrace({ trace_id, origin: 'system', target: trace_id, status, started_at, finished_at: started_at, request: {} });
      const preview = store.previewOperationTraceRetention({ all: true }, now);
      expect(preview.counts.eligible).toBe(2);
      expect(preview.sample_trace_ids).toEqual(['old-error', 'old-ok']);
      expect(() => store.applyOperationTraceRetention({ scope: { all: true }, effective_now: now,
        expected_selection_fingerprint: 'sha256:' + '0'.repeat(64) })).toThrow(StaleAdminPreviewError);
      const applied = store.applyOperationTraceRetention({ scope: { all: true }, effective_now: now,
        expected_selection_fingerprint: preview.selection_fingerprint });
      expect(applied.counts.deleted).toBe(2);
      expect(store.getOperationTrace('boundary-ok')).not.toBeNull();
    } finally { store.close(); }
  });

  it('bounds deletion at 50,000 and reports continuation from the commit snapshot', () => {
    const store = new Store(':memory:');
    try {
      const insert = store.getDb().prepare(`INSERT INTO operation_traces
        (trace_id, origin, target, status, started_at, finished_at, duration_ms, request_json, request_truncated, response_truncated)
        VALUES (?, 'system', 'bulk', 'ok', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', 0, '{}', 0, 0)`);
      store.getDb().transaction(() => { for (let index = 0; index < 50_001; index += 1) insert.run(`bulk-${index}`); })();
      const preview = store.previewOperationTraceRetention({ all: true }, '2026-08-12T12:00:00.000Z');
      expect(preview.counts).toMatchObject({ eligible: 50_001, selected: 50_000, remaining_eligible: 1 });
      expect(preview.has_more).toBe(true);
      const applied = store.applyOperationTraceRetention({ scope: { all: true }, effective_now: preview.effective_now,
        expected_selection_fingerprint: preview.selection_fingerprint });
      expect(applied.counts).toMatchObject({ deleted: 50_000, after_in_scope_at_commit: 1 });
    } finally { store.close(); }
  });

  it('preserves malformed timestamps, scopes null-project rows correctly, and is repeat-safe', () => {
    const store = new Store(':memory:');
    try {
      const insert = (trace_id: string, project: string | null, started_at: string) => store.getDb().prepare(`INSERT INTO operation_traces
        (trace_id, origin, target, status, project, started_at, finished_at, duration_ms, request_json, request_truncated, response_truncated)
        VALUES (?, 'system', 'retention', 'ok', ?, ?, ?, 0, '{}', 0, 0)`).run(trace_id, project, started_at, started_at);
      insert('project-old', 'p', '2020-01-01T00:00:00.000Z');
      insert('null-old', null, '2020-01-01T00:00:00.000Z');
      insert('malformed', 'p', '2020-01-01 00:00:00');
      const now = '2026-08-12T12:00:00.000Z';
      const projectPreview = store.previewOperationTraceRetention({ project: 'p' }, now);
      expect(projectPreview.counts).toMatchObject({ before_in_scope: 2, eligible: 1, skipped_invalid_timestamp: 1 });
      const projectApply = store.applyOperationTraceRetention({ scope: { project: 'p' }, effective_now: now, expected_selection_fingerprint: projectPreview.selection_fingerprint });
      expect(projectApply.counts.deleted).toBe(1);
      expect(store.getOperationTrace('malformed')).not.toBeNull();
      expect(store.getOperationTrace('null-old')).not.toBeNull();
      const allPreview = store.previewOperationTraceRetention({ all: true }, now);
      const allApply = store.applyOperationTraceRetention({ scope: { all: true }, effective_now: now, expected_selection_fingerprint: allPreview.selection_fingerprint });
      expect(allApply.counts.deleted).toBe(1);
      const repeat = store.previewOperationTraceRetention({ all: true }, now);
      expect(repeat.counts).toMatchObject({ eligible: 0, selected: 0 });
    } finally { store.close(); }
  });

  it('rejects candidate drift and rolls deletion failure back without touching unrelated tables', () => {
    const store = new Store(':memory:');
    try {
      const old = '2020-01-01T00:00:00.000Z';
      store.saveObservation({ title: 'unrelated', content: 'unrelated', project: 'p' });
      store.saveOperationTrace({ trace_id: 'first', origin: 'system', target: 'retention', status: 'ok', project: 'p', started_at: old, finished_at: old, request: {} });
      const now = '2026-08-12T12:00:00.000Z';
      const stale = store.previewOperationTraceRetention({ project: 'p' }, now);
      store.saveOperationTrace({ trace_id: 'drift', origin: 'system', target: 'retention', status: 'ok', project: 'p', started_at: old, finished_at: old, request: {} });
      expect(() => store.applyOperationTraceRetention({ scope: { project: 'p' }, effective_now: now, expected_selection_fingerprint: stale.selection_fingerprint })).toThrow(StaleAdminPreviewError);
      expect(store.getOperationTrace('first')).not.toBeNull();
      expect(store.getOperationTrace('drift')).not.toBeNull();

      const fresh = store.previewOperationTraceRetention({ project: 'p' }, now);
      store.getDb().exec("CREATE TRIGGER block_retention_delete BEFORE DELETE ON operation_traces WHEN OLD.trace_id = 'drift' BEGIN SELECT RAISE(ABORT, 'retention delete blocked'); END");
      expect(() => store.applyOperationTraceRetention({ scope: { project: 'p' }, effective_now: now, expected_selection_fingerprint: fresh.selection_fingerprint })).toThrow(/retention delete blocked/);
      expect(store.getOperationTrace('first')).not.toBeNull();
      expect(store.getOperationTrace('drift')).not.toBeNull();
      expect(store.searchObservations({ query: 'unrelated', project: 'p' })).toHaveLength(1);
    } finally { store.close(); }
  });
});
