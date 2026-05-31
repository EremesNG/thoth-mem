import { describe, expect, it } from 'vitest';
import { runRetrievalEval } from '../../src/evals/retrieval.js';

describe('retrieval eval baseline', () => {
  it('measures deterministic search recall before embeddings', async () => {
    const report = await runRetrievalEval();

    expect(report.summary.total_cases).toBeGreaterThanOrEqual(5);
    expect(report.summary.recall_at_1).toBeGreaterThanOrEqual(0.8);
    expect(report.summary.recall_at_k).toBe(1);
    expect(report.summary.mean_reciprocal_rank).toBeGreaterThanOrEqual(0.8);
    expect(report.summary.context_compression).toBeGreaterThan(0);
    expect(report.summary.retrieval_defaults.lane_order).toBe('sentence > chunk > lexical');
    expect(report.summary.retrieval_defaults.sentence_top_k).toBe(100);
    expect(report.summary.hybrid.pending_rate).toBeGreaterThanOrEqual(0);
    expect(report.summary.hybrid.degraded_rate).toBeGreaterThanOrEqual(0);
    expect(report.summary.hybrid.lexical_prefix_hit_rate).toBeGreaterThanOrEqual(0);
    expect(report.summary.hybrid.raw_semantic_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.hyde_semantic_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.kg_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.evidence_lineage_coverage).toBeGreaterThan(0);
    expect(report.summary.hybrid.stale_result_rate).toBe(1);
    expect(report.summary.hybrid.kg_provenance_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.lane_truth_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.facts_source_rate).toBeGreaterThan(0);
    expect(report.cases.every((result) => result.found)).toBe(true);
  });

  it('formats a markdown benchmark report', async () => {
    const report = await runRetrievalEval();

    expect(report.markdown).toContain('# Retrieval Eval Baseline (Hybrid Retrieval)');
    expect(report.markdown).toContain('| Recall @ 1 |');
    expect(report.markdown).toContain('| Mean Reciprocal Rank |');
    expect(report.markdown).toContain('| Pending Rate |');
    expect(report.markdown).toContain('| Stale Result Prevention Rate |');
    expect(report.markdown).toContain('| KG Provenance Rate |');
    expect(report.markdown).toContain('| Lane Truth Rate |');
    expect(report.markdown).toContain('## Retrieval Defaults');
    expect(report.markdown).toContain('## Case Results');
  });

  it('lane contribution gates: requires non-zero semantic/HyDE and KG enrichment when fixtures support them', async () => {
    const report = await runRetrievalEval();

    expect(report.summary.hybrid.raw_semantic_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.hyde_semantic_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.kg_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.stale_result_rate).toBe(1);
    expect(report.summary.hybrid.kg_provenance_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.lane_truth_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.facts_source_rate).toBeGreaterThan(0);
  });
});
