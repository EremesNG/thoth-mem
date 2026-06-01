import { beforeAll, describe, expect, it } from 'vitest';
import { runRetrievalEval, type RetrievalEvalReport } from '../../src/evals/retrieval.js';

describe('retrieval eval baseline', () => {
  let report: RetrievalEvalReport;

  beforeAll(async () => {
    report = await runRetrievalEval();
  }, 20_000);

  it('measures deterministic hybrid recall under synthetic noise', async () => {
    expect(report.summary.total_cases).toBeGreaterThanOrEqual(5);
    expect(report.summary.recall_at_1).toBeGreaterThanOrEqual(0.75);
    expect(report.summary.recall_at_k).toBeGreaterThanOrEqual(0.9);
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
  });

  it('formats a markdown benchmark report', async () => {
    expect(report.markdown).toContain('# Retrieval Eval Baseline (Hybrid Retrieval)');
    expect(report.markdown).toContain('| Recall @ 1 |');
    expect(report.markdown).toContain('| Mean Reciprocal Rank |');
    expect(report.markdown).toContain('| Pending Rate |');
    expect(report.markdown).toContain('| Stale Result Prevention Rate |');
    expect(report.markdown).toContain('| KG Provenance Rate |');
    expect(report.markdown).toContain('| Lane Truth Rate |');
    expect(report.markdown).toContain('## Retrieval Defaults');
    expect(report.markdown).toContain('## Case Results');
    expect(report.markdown).toContain('| Rephrased cases |');
  });

  it('lane contribution gates: requires non-zero semantic/HyDE and KG enrichment when fixtures support them', async () => {
    expect(report.summary.hybrid.raw_semantic_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.hyde_semantic_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.kg_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.stale_result_rate).toBe(1);
    expect(report.summary.hybrid.kg_provenance_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.lane_truth_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.facts_source_rate).toBeGreaterThan(0);
  });

  it('reports ArcRift-style evidence gap metrics from hybrid retrieval', async () => {
    expect(report.summary.corpus.total_observations).toBeGreaterThanOrEqual(100);
    expect(report.summary.corpus.noise_observations).toBeGreaterThanOrEqual(90);
    expect(report.summary.case_mix.rephrased_cases).toBeGreaterThanOrEqual(8);
    expect(report.summary.hybrid.surgical_compression).toBeGreaterThanOrEqual(0.75);
    expect(report.summary.hybrid.hyde_lift_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.hybrid_rank_source_rate).toBe(1);
    expect(report.cases.some((result) => (
      result.raw_rank !== null && result.hyde_rank !== null && result.hyde_rank < result.raw_rank
    ))).toBe(true);
    expect(report.markdown).toContain('## Corpus');
    expect(report.markdown).toContain('| Surgical Compression |');
    expect(report.markdown).toContain('| HyDE Lift Rate |');
  });

  it('keeps global sync recall discoverable under synthetic distractors', async () => {
    const syncCase = report.cases.find((result) => result.name === 'global sync recall');

    expect(syncCase).toBeDefined();
    expect(syncCase?.found).toBe(true);
    expect(syncCase?.rank).toBe(1);
  });

  it('supports explicit larger-corpus scale runs', async () => {
    const scaledReport = await runRetrievalEval({ noiseCount: 120 });

    expect(scaledReport.summary.corpus.noise_observations).toBe(120);
    expect(scaledReport.summary.corpus.total_observations).toBe(126);
    expect(scaledReport.summary.case_mix.rephrased_cases).toBeGreaterThanOrEqual(8);
    expect(scaledReport.summary.recall_at_k).toBeGreaterThanOrEqual(0.9);
  }, 20_000);
});
