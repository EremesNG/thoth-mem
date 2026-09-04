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
        compaction: { checkpoints: 1, recoveries: 2, recovery_success: 2 },
        continuity: {
          actionable_field_names: ['Objective', 'Completed', 'First pending action', 'Blockers', 'Key files/checks'],
          actionable_fields_expected: 5,
          actionable_fields_recovered: 5,
          hidden_markers_expected: 3,
          hidden_markers_recovered: 3,
          restart_recovery_success: 1,
          post_compaction_recovery_success: 1,
          abstention_success: 1,
          project_isolation_success: 1,
          delegated_rejection_success: 1,
          trust_boundary_present: 1,
          poisoned_memory_safe: 1,
          host_cap_compliance: 1,
          evidence_ids_exposed: 0,
          injected_code_points: expect.any(Number),
          injected_tokens: expect.any(Number),
          useful_content_code_points: expect.any(Number),
          useful_content_ratio: expect.any(Number),
          selected_memory_ids: expect.arrayContaining([expect.any(String)]),
        },
        summary: {
          ordered_idempotency: 1,
          supported_claims: 1,
          unsupported_claims: 0,
          cross_scope_rejection: 1,
          version_precedence: 1,
          no_auto_promotion: 1,
          promoted_handoffs: 0,
          checkpoint_content_events_expected: 3,
          checkpoint_content_events_recorded: 3,
          host_recoveries_expected: 3,
          three_host_recovery: 3,
          support_leakage: 0,
          actionable_field_names: ['Objective', 'Completed', 'First pending action', 'Blockers', 'Key files/checks'],
          actionable_fields_expected: 5,
          control_actionable_fields_recovered: 5,
          candidate_actionable_fields_recovered: 5,
          useful_content_non_inferiority: 1,
          control_selected_memory_ids: expect.arrayContaining([expect.any(String)]),
          candidate_selected_summary_ids: expect.arrayContaining([expect.any(String)]),
          candidate_selected_memory_ids: [],
          model_calls: 0,
          network_calls: 0,
        },
      },
      promotion: { decision: 'incomplete', reasons: ['fixture_only_external_lanes_unavailable'] },
    });
    // The report validator reconciles measured latency with the declared decision.
    expect([
      { status: 'pass', reasons: ['all_observation_gates_passed'] },
      { status: 'fail', reasons: ['recall_latency_above_2x_control'] },
    ]).toContainEqual(report.observation_pipeline.decision);
    expect(report.metrics.resources.samples.latency_ms).toHaveLength(7);
    expect(report.metrics.resources.samples.memory_bytes).toHaveLength(7);
    expect(report.metrics.resources.latency_p50_ms).toBe(percentile(report.metrics.resources.samples.latency_ms, 50));
    expect(report.metrics.resources.latency_p95_ms).toBe(percentile(report.metrics.resources.samples.latency_ms, 95));
    expect(report.metrics.resources.peak_memory_bytes).toBe(Math.max(...report.metrics.resources.samples.memory_bytes));
    expect(report.metrics.progressive.compact_returned_chars).toBeGreaterThan(0);
    expect(report.metrics.progressive.context_returned_chars).toBeGreaterThanOrEqual(report.metrics.progressive.compact_returned_chars);
    expect(report.metrics.progressive.compression_ratio).toBeGreaterThan(0);
    expect(report.metrics.compaction.delivered_sources).toBeGreaterThan(0);
    expect(report.metrics.continuity.injected_code_points).toBeLessThanOrEqual(report.budgets.final_context_code_points);
    expect(report.metrics.continuity.useful_content_ratio).toBeGreaterThanOrEqual(0.5);
    expect(report.metrics.continuity.selected_memory_ids.length).toBeGreaterThanOrEqual(1);
    expect(report.metrics.continuity.selected_memory_ids.length).toBeLessThanOrEqual(3);
    expect(report.metrics.summary.summary_useful_content_ratio).toBeGreaterThanOrEqual(report.metrics.summary.baseline_useful_content_ratio);
    expect(report.metrics.summary.control_useful_content_code_points / report.metrics.summary.control_injected_code_points).toBe(report.metrics.summary.baseline_useful_content_ratio);
    expect(report.metrics.summary.candidate_useful_content_code_points / report.metrics.summary.candidate_injected_code_points).toBe(report.metrics.summary.summary_useful_content_ratio);
    expect(report.metrics.summary.control_injected_code_points).toBeLessThanOrEqual(report.budgets.final_context_code_points * 3);
    expect(report.metrics.summary.candidate_injected_code_points).toBeLessThanOrEqual(report.budgets.final_context_code_points * 3);
    expect(report.metrics.summary.control_selected_memory_ids).toHaveLength(3);
    expect(report.metrics.summary.candidate_selected_summary_ids).toHaveLength(3);
    expect(report.metrics.summary.candidate_selected_memory_ids).toEqual([]);
    expect(report.metrics.resources.injected_tokens).toBe(report.metrics.continuity.injected_tokens);
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
