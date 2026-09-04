import { readFileSync } from 'node:fs';

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
const report = { schema: 'thoth-mem.benchmark-report.v1', dataset: { name: 'fixture', version: '1', license: 'committed-fixture', availability: 'committed', corpus_hash: 'a'.repeat(64), query_hash: 'b'.repeat(64) }, candidate: { id: 'fixture', config_hash: 'c'.repeat(64), config: { lexical: true } }, conditions: { run_config_hash: 'd'.repeat(64), query_order_hash: 'e'.repeat(64), reader: { id: 'deterministic-reader', settings_hash: 'f'.repeat(64) }, scorer: { id: 'exact-scorer', settings_hash: '1'.repeat(64) }, seed: 7, timeout_ms: 1000, retries: 0 }, environment: { runtime: 'node', runtime_version: '24', platform: 'win32', arch: 'x64' }, budgets: { candidate_k: 5, context_tokens: 1000, final_context_code_points: 1000 }, primary_metrics: primaryMetrics, promotion_gate: promotionGate, metrics: { retrieval: { mrr: 0.5, recall_at_1: 0.5, recall_at_5: 1, hit_at_k: 1 }, evidence: { recall: 1, provenance_coverage: 1 }, answer: { exact_match: 1 }, agent: { hidden_test_success: 1 }, progressive: { compact_returned_chars: 20, context_returned_chars: 40, source_chars: 40, evidence_chars: 20, full_chars: 40, truncated_chars: 20, full_fetches: 0, avoided_full_fetches: 1, escalation_rate: 0, compression_ratio: 0.5 }, compaction: { checkpoints: 1, recoveries: 1, recovery_success: 1, delivered_sources: 1 }, continuity: { actionable_field_names: ['Objective', 'Completed', 'First pending action', 'Blockers', 'Key files/checks'], actionable_fields_expected: 5, actionable_fields_recovered: 5, hidden_markers_expected: 3, hidden_markers_recovered: 3, restart_recovery_success: 1, post_compaction_recovery_success: 1, abstention_success: 1, project_isolation_success: 1, delegated_rejection_success: 1, trust_boundary_present: 1, poisoned_memory_safe: 1, host_cap_compliance: 1, evidence_ids_exposed: 0, injected_code_points: 40, injected_tokens: 10, useful_content_code_points: 30, useful_content_ratio: 0.75, selected_memory_ids: ['memory:1'] }, summary: { ordered_idempotency: 1, supported_claims: 1, unsupported_claims: 0, cross_scope_rejection: 1, version_precedence: 1, no_auto_promotion: 1, promoted_handoffs: 0, checkpoint_content_events_expected: 3, checkpoint_content_events_recorded: 3, host_recoveries_expected: 3, three_host_recovery: 3, support_leakage: 0, actionable_field_names: ['Objective', 'Completed', 'First pending action', 'Blockers', 'Key files/checks'], actionable_fields_expected: 5, control_actionable_fields_recovered: 5, candidate_actionable_fields_recovered: 5, control_injected_code_points: 400, candidate_injected_code_points: 400, control_useful_content_code_points: 300, candidate_useful_content_code_points: 300, baseline_useful_content_ratio: 0.75, summary_useful_content_ratio: 0.75, useful_content_non_inferiority: 1, control_selected_memory_ids: ['memory:control:1', 'memory:control:2', 'memory:control:3'], candidate_selected_summary_ids: ['summary:candidate:1', 'summary:candidate:2', 'summary:candidate:3'], candidate_selected_memory_ids: [], model_calls: 0, network_calls: 0 }, resources: { latency_p50_ms: 1, latency_p95_ms: 2, ingestion_ms: 3, startup_ms: 4, peak_memory_bytes: 5, database_bytes: 6, model_bytes: 0, network_calls: 0, llm_calls: 0, injected_tokens: 10, returned_chars: 20, truncated_chars: 0, samples: { latency_ms: [1,1,1,2,2], memory_bytes: [5,5,5,5,5] } } }, provenance: { coverage: 1, source_ids: ['memory:1'] }, fallback_controls: fallbackControls, operational_errors: [{ operation: 'optional_projection', code: 'projection_failed', message: 'Optional projection unavailable; lexical fallback remained active.', retryable: true }], unavailable: [{ id: 'external', reason: 'dataset_not_prepared' }], promotion: { decision: 'incomplete', reasons: ['fixture_only'] } };

describe('benchmark report contract', () => {
  it('accepts only explicit metric namespaces and equal budgets', () => {
    expect(validateReport(report).valid).toBe(true);
    expect(validateReport({ ...report, metrics: { ...report.metrics, retrieval: { top_k_accuracy: 1 } } }).valid).toBe(false);
    expect(validateReport({ ...report, metrics: { ...report.metrics, retrieval: { hit_at_5_accuracy: 1 } } }).valid).toBe(false);
    expect(evaluatePromotion(report, { ...report, budgets: { ...report.budgets, candidate_k: 10 } })).toMatchObject({ decision: 'incomplete', reasons: ['unequal_budget'] });
    expect(evaluatePromotion(report, { ...report, budgets: { ...report.budgets, final_context_code_points: 900 } })).toMatchObject({ decision: 'incomplete', reasons: ['unequal_budget'] });
  });

  it('rejects incomplete continuity, trust, isolation, leakage, cap, and external-quality evidence', () => {
    const continuity = report.metrics.continuity;
    const errors = (value: Record<string, unknown>) => validateReport({ ...report, metrics: { ...report.metrics, continuity: { ...continuity, ...value } } }).errors;
    expect(errors({ actionable_fields_recovered: 4 })).toContain('continuity.actionable_fields');
    expect(errors({ useful_content_ratio: 0.49 })).toContain('continuity.useful_content');
    expect(errors({ abstention_success: 0 })).toContain('continuity.abstention');
    expect(errors({ project_isolation_success: 0 })).toContain('continuity.project_isolation');
    expect(errors({ trust_boundary_present: 0 })).toContain('continuity.trust_boundary');
    expect(errors({ poisoned_memory_safe: 0 })).toContain('continuity.trust_boundary');
    expect(errors({ evidence_ids_exposed: 1 })).toContain('continuity.evidence_leakage');
    expect(errors({ host_cap_compliance: 0 })).toContain('continuity.host_cap');
    expect(errors({ injected_code_points: 1_001, injected_tokens: 251 })).toContain('continuity.host_cap');
    expect(validateReport({ ...report, promotion: { decision: 'promoted', reasons: ['fixture_claim'] } }).errors).toContain('external_quality_claim');
  });

  it('rejects forged or incomplete summary fidelity evidence and closes the schema envelope', () => {
    const summary = report.metrics.summary;
    const errors = (value: Record<string, unknown>) => validateReport({ ...report, metrics: { ...report.metrics, summary: value } }).errors;
    const { network_calls: _networkCalls, ...missing } = summary;

    expect(errors(missing)).toContain('summary.shape');
    expect(errors({ ...summary, unexpected: true })).toContain('summary.shape');
    expect(errors({ ...summary, supported_claims: 1, unsupported_claims: 1 })).toContain('summary.support');
    expect(errors({ ...summary, cross_scope_rejection: 0 })).toContain('summary.cross_scope');
    expect(errors({ ...summary, no_auto_promotion: 1, promoted_handoffs: 1 })).toContain('summary.promotion');
    expect(errors({ ...summary, checkpoint_content_events_recorded: 0 })).toContain('summary.checkpoint_capture');
    expect(errors({ ...summary, candidate_selected_memory_ids: ['memory:contamination'] })).toContain('summary.contamination');
    expect(errors({ ...summary, candidate_useful_content_code_points: 299 })).toContain('summary.accounting');
    expect(errors({ ...summary, summary_useful_content_ratio: 0.74, useful_content_non_inferiority: 1 })).toContain('summary.non_inferiority');
    expect(errors({ ...summary, model_calls: 1 })).toContain('summary.offline_execution');

    const schema = JSON.parse(readFileSync('benchmarks/report.schema.json', 'utf8'));
    expect(schema.properties.metrics.required).toContain('summary');
    expect(schema.$defs.summary.additionalProperties).toBe(false);
    expect(schema.$defs.summary.required.sort()).toEqual(Object.keys(schema.$defs.summary.properties).sort());
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
