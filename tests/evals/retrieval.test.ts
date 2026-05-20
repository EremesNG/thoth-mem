import { describe, expect, it } from 'vitest';
import { runRetrievalEval } from '../../src/evals/retrieval.js';

describe('retrieval eval baseline', () => {
  it('measures deterministic search recall before embeddings', () => {
    const report = runRetrievalEval();

    expect(report.summary.total_cases).toBeGreaterThanOrEqual(5);
    expect(report.summary.recall_at_1).toBeGreaterThanOrEqual(0.8);
    expect(report.summary.recall_at_k).toBe(1);
    expect(report.summary.mean_reciprocal_rank).toBeGreaterThanOrEqual(0.8);
    expect(report.summary.context_compression).toBeGreaterThan(0);
    expect(report.cases.every((result) => result.found)).toBe(true);
  });

  it('formats a markdown benchmark report', () => {
    const report = runRetrievalEval();

    expect(report.markdown).toContain('# Retrieval Eval Baseline');
    expect(report.markdown).toContain('| Recall @ 1 |');
    expect(report.markdown).toContain('| Mean Reciprocal Rank |');
    expect(report.markdown).toContain('## Case Results');
  });
});
