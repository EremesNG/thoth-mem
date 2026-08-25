import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { validateReport } from '../../benchmarks/report.mjs';

function percentile(samples: number[], percentileValue: number): number {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.ceil((percentileValue / 100) * ordered.length) - 1]!;
}

describe('benchmark fixture runner', () => {
  it('emits a schema-valid measured report with deterministic conditions and explicit unavailable lanes', () => {
    const result = spawnSync(process.execPath, ['benchmarks/run.mjs'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);

    const outputPath = result.stdout.trim();
    const report = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(validateReport(report)).toEqual({ valid: true, errors: [] });
    expect(report).toMatchObject({
      created_at: '1970-01-01T00:00:00.000Z',
      dataset: { name: 'committed-fixture', version: '1', license: 'committed-fixture', availability: 'committed' },
      candidate: { id: 'fixture-lexical', config: { lexical: true } },
      conditions: {
        reader: { id: 'fixture-reader@1' },
        scorer: { id: 'deterministic-exact@1' },
        seed: 7,
        timeout_ms: 10_000,
        retries: 0,
      },
      environment: { runtime: 'node', runtime_version: process.versions.node, platform: process.platform, arch: process.arch },
      metrics: {
        retrieval: { mrr: 1, recall_at_1: 1, recall_at_5: 1, hit_at_k: 1 },
        evidence: { recall: 1, provenance_coverage: 1 },
        answer: { exact_match: 1 },
        agent: { hidden_test_success: null },
        progressive: { source_chars: expect.any(Number), evidence_chars: expect.any(Number), full_chars: expect.any(Number), truncated_chars: expect.any(Number), full_fetches: 1, avoided_full_fetches: 0, escalation_rate: 1 },
        compaction: { checkpoints: 1, recoveries: 1, recovery_success: 1 },
      },
      promotion: { decision: 'incomplete', reasons: ['fixture_only_external_lanes_unavailable'] },
    });
    expect(report.metrics.resources.samples.latency_ms).toHaveLength(7);
    expect(report.metrics.resources.samples.memory_bytes).toHaveLength(7);
    expect(report.metrics.resources.latency_p50_ms).toBe(percentile(report.metrics.resources.samples.latency_ms, 50));
    expect(report.metrics.resources.latency_p95_ms).toBe(percentile(report.metrics.resources.samples.latency_ms, 95));
    expect(report.metrics.resources.peak_memory_bytes).toBe(Math.max(...report.metrics.resources.samples.memory_bytes));
    expect(report.metrics.progressive.compact_returned_chars).toBeGreaterThan(0);
    expect(report.metrics.progressive.context_returned_chars).toBeGreaterThanOrEqual(report.metrics.progressive.compact_returned_chars);
    expect(report.metrics.progressive.compression_ratio).toBeGreaterThan(0);
    expect(report.metrics.compaction.delivered_sources).toBeGreaterThan(0);
    expect(report.provenance).toMatchObject({ coverage: 1, source_ids: expect.arrayContaining([expect.any(String)]) });
    expect(report.primary_metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ namespace: 'retrieval', metric: 'mrr', gate: 'relative_gain' }),
      expect.objectContaining({ namespace: 'answer', metric: 'exact_match', gate: 'non_regression' }),
      expect.objectContaining({ namespace: 'agent', metric: 'hidden_test_success', gate: 'non_regression' }),
    ]));
    expect(report.fallback_controls.map((control: { scenario: string }) => control.scenario).sort()).toEqual(['disabled', 'failed', 'missing', 'rebuilding', 'source_mismatched', 'stale']);
    expect(report.fallback_controls.every((control: { control_lexical_hits: number; fallback_lexical_hits: number }) => control.control_lexical_hits === 0 || control.fallback_lexical_hits > 0)).toBe(true);
    expect(report.operational_errors).toEqual(expect.arrayContaining([expect.objectContaining({ operation: 'optional_projection', code: 'projection_failed' })]));
    expect(report.unavailable.map((lane: { id: string }) => lane.id)).toEqual([
      'longmemeval-s', 'locomo', 'amb-beam-100k', 'amb-beam-1m',
      'amb-personamem-32k', 'amb-personamem-1m', 'sdebench',
    ]);
  });
});
