import { describe, expect, it } from 'vitest';

import { evaluatePromotion, validateReport } from '../../benchmarks/report.mjs';

const primaryMetrics = [
  { namespace: 'retrieval', metric: 'mrr', gate: 'relative_gain', threshold: 0.05 },
  { namespace: 'retrieval', metric: 'recall_at_1', gate: 'non_regression' },
  { namespace: 'retrieval', metric: 'recall_at_5', gate: 'non_regression' },
  { namespace: 'retrieval', metric: 'hit_at_k', gate: 'non_regression' },
  { namespace: 'answer', metric: 'exact_match', gate: 'non_regression' },
  { namespace: 'agent', metric: 'hidden_test_success', gate: 'non_regression' },
];
const fallbackControls = ['disabled', 'missing', 'stale', 'rebuilding', 'failed', 'source_mismatched'].map((scenario) => ({ scenario, observed_state: scenario === 'failed' ? 'degraded' : scenario === 'source_mismatched' ? 'stale' : scenario, control_lexical_hits: 1, fallback_lexical_hits: 1, source_ids: ['memory:1'] }));
const promotionGate = { provenance_coverage: 1, resource_ceilings: { latency_p95_ms: 1.25, peak_memory_bytes: 1.1, database_bytes: 1.25, model_bytes: 1, network_calls: 1, llm_calls: 1, injected_tokens: 1 } };
const report = { schema: 'thoth-mem.benchmark-report.v1', dataset: { name: 'fixture', version: '1', license: 'committed-fixture', availability: 'committed', corpus_hash: 'a'.repeat(64), query_hash: 'b'.repeat(64) }, candidate: { id: 'fixture', config_hash: 'c'.repeat(64), config: { lexical: true } }, conditions: { run_config_hash: 'd'.repeat(64), query_order_hash: 'e'.repeat(64), reader: { id: 'deterministic-reader', settings_hash: 'f'.repeat(64) }, scorer: { id: 'exact-scorer', settings_hash: '1'.repeat(64) }, seed: 7, timeout_ms: 1000, retries: 0 }, environment: { runtime: 'node', runtime_version: '24', platform: 'win32', arch: 'x64' }, budgets: { candidate_k: 5, context_tokens: 1000 }, primary_metrics: primaryMetrics, promotion_gate: promotionGate, metrics: { retrieval: { mrr: 0.5, recall_at_1: 0.5, recall_at_5: 1, hit_at_k: 1 }, evidence: { recall: 1, provenance_coverage: 1 }, answer: { exact_match: 1 }, agent: { hidden_test_success: 1 }, progressive: { compact_returned_chars: 20, context_returned_chars: 40, source_chars: 40, evidence_chars: 20, full_chars: 40, truncated_chars: 20, full_fetches: 0, avoided_full_fetches: 1, escalation_rate: 0, compression_ratio: 0.5 }, compaction: { checkpoints: 1, recoveries: 1, recovery_success: 1, delivered_sources: 1 }, resources: { latency_p50_ms: 1, latency_p95_ms: 2, ingestion_ms: 3, startup_ms: 4, peak_memory_bytes: 5, database_bytes: 6, model_bytes: 0, network_calls: 0, llm_calls: 0, injected_tokens: 10, returned_chars: 20, truncated_chars: 0, samples: { latency_ms: [1,1,1,2,2], memory_bytes: [5,5,5,5,5] } } }, provenance: { coverage: 1, source_ids: ['memory:1'] }, fallback_controls: fallbackControls, operational_errors: [{ operation: 'optional_projection', code: 'projection_failed', message: 'Optional projection unavailable; lexical fallback remained active.', retryable: true }], unavailable: [{ id: 'external', reason: 'dataset_not_prepared' }], promotion: { decision: 'incomplete', reasons: ['fixture_only'] } };

describe('benchmark report contract', () => {
  it('accepts only explicit metric namespaces and equal budgets', () => {
    expect(validateReport(report).valid).toBe(true);
    expect(validateReport({ ...report, metrics: { ...report.metrics, retrieval: { top_k_accuracy: 1 } } }).valid).toBe(false);
    expect(validateReport({ ...report, metrics: { ...report.metrics, retrieval: { hit_at_5_accuracy: 1 } } }).valid).toBe(false);
    expect(evaluatePromotion(report, { ...report, budgets: { candidate_k: 10, context_tokens: 1000 } })).toMatchObject({ decision: 'incomplete', reasons: ['unequal_budget'] });
  });

  it('requires dataset/config hashes, provenance, resources, and bounded unavailable evidence', () => {
    expect(validateReport({ ...report, candidate: { id: 'fixture' } }).errors).toContain('candidate_identity');
    expect(validateReport({ ...report, dataset: { ...report.dataset, query_hash: '' } }).errors).toContain('dataset_identity');
    expect(validateReport({ ...report, metrics: { ...report.metrics, resources: { ...report.metrics.resources, model_bytes: undefined } } }).errors).toContain('resources.model_bytes');
    expect(validateReport({ ...report, provenance: { coverage: 1 } }).errors).toContain('provenance');
    expect(validateReport({ ...report, unavailable: [{ id: 'external', reason: 'free form reason' }] }).errors).toContain('unavailable');
    expect(validateReport({ ...report, conditions: undefined }).errors).toContain('conditions');
    expect(validateReport({ ...report, metrics: { ...report.metrics, progressive: undefined } }).errors).toContain('progressive');
    expect(validateReport({ ...report, primary_metrics: undefined }).errors).toContain('primary_metrics');
    expect(validateReport({ ...report, promotion_gate: undefined }).errors).toContain('promotion_gate');
    expect(validateReport({ ...report, provenance: { coverage: 1, source_ids: [] } }).errors).toContain('provenance');
    expect(validateReport({ ...report, fallback_controls: fallbackControls.slice(1) }).errors).toContain('fallback_controls');
    expect(validateReport({ ...report, fallback_controls: fallbackControls.map((item) => item.scenario === 'stale' ? { ...item, fallback_lexical_hits: 0 } : item) }).errors).toContain('fallback_lexical_control');
    expect(validateReport({ ...report, operational_errors: [{ operation: 'optional_projection', code: 'projection_failed', message: 'x'.repeat(201), retryable: true }] }).errors).toContain('operational_errors');
    expect(validateReport({ ...report, metrics: { ...report.metrics, resources: { ...report.metrics.resources, samples: { latency_ms: [1], memory_bytes: [1] } } } }).errors).toContain('resource_samples');
    expect(validateReport({ ...report, metrics: { ...report.metrics, resources: { ...report.metrics.resources, latency_p95_ms: 1 } } }).errors).toContain('resource_summaries');
    expect(validateReport({ ...report, metrics: { ...report.metrics, resources: { ...report.metrics.resources, peak_memory_bytes: 4 } } }).errors).toContain('resource_summaries');
    expect(validateReport({ ...report, metrics: { ...report.metrics, retrieval: { ...report.metrics.retrieval, mrr: Number.NaN } } }).errors).toContain('metric_values');
    expect(validateReport({ ...report, provenance: { ...report.provenance, coverage: Number.NaN } }).errors).toContain('provenance');
    expect(validateReport({ ...report, metrics: { ...report.metrics, progressive: { ...report.metrics.progressive, escalation_rate: Number.NaN } } }).errors).toContain('progressive');
  });

  it('fails closed for incomparable conditions and quality or resource regressions', () => {
    expect(evaluatePromotion(report, { ...report, dataset: { ...report.dataset, corpus_hash: '9'.repeat(64) } })).toMatchObject({ decision: 'incomplete', reasons: expect.arrayContaining(['corpus_mismatch']) });
    expect(evaluatePromotion(report, { ...report, conditions: { ...report.conditions, query_order_hash: '8'.repeat(64) } })).toMatchObject({ decision: 'incomplete', reasons: expect.arrayContaining(['query_order_mismatch']) });
    const pathological = { ...report, metrics: { ...report.metrics, retrieval: { mrr: 0.6, recall_at_1: 0, recall_at_5: 0, hit_at_k: 0 }, resources: { ...report.metrics.resources, latency_p95_ms: 200, peak_memory_bytes: 500, network_calls: 1, samples: { latency_ms: [1,1,1,200,200], memory_bytes: [500,500,500,500,500] } } } };
    expect(evaluatePromotion(report, pathological)).toMatchObject({ decision: 'rejected', reasons: expect.arrayContaining(['primary_quality_regression', 'latency_ceiling_exceeded', 'memory_ceiling_exceeded', 'network_ceiling_exceeded']) });
  });

  it('promotes only a comparable quality gain within every resource ceiling', () => {
    const candidate = { ...report, metrics: { ...report.metrics, retrieval: { ...report.metrics.retrieval, mrr: 0.55 }, resources: { ...report.metrics.resources, latency_p95_ms: 1.5, samples: { ...report.metrics.resources.samples, latency_ms: [1,1,1,1.5,1.5] } } } };
    expect(evaluatePromotion(report, candidate)).toEqual({ decision: 'promoted', reasons: ['quality_and_resource_gate_passed'] });
  });

  it('rejects an MRR gain when declared answer and agent primary metrics regress', () => {
    const candidate = { ...report, metrics: { ...report.metrics, retrieval: { ...report.metrics.retrieval, mrr: 0.55 }, answer: { exact_match: 0 }, agent: { hidden_test_success: 0 } } };
    expect(evaluatePromotion(report, candidate)).toMatchObject({ decision: 'rejected', reasons: expect.arrayContaining(['answer_exact_match_regression', 'agent_hidden_test_success_regression']) });
    const incomplete = { ...candidate, metrics: { ...candidate.metrics, agent: { hidden_test_success: null } } };
    expect(evaluatePromotion(report, incomplete)).toEqual({ decision: 'incomplete', reasons: ['incomplete_primary_metrics'] });
  });
});
