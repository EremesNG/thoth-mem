import { describe, expect, it } from 'vitest';
import { runKgQualityEval } from '../../src/evals/kg-quality.js';

describe('kg quality eval', () => {
  it('reports expected KG recall and forbidden-relation safety metrics', () => {
    const report = runKgQualityEval();

    expect(report.summary.total_cases).toBeGreaterThanOrEqual(5);
    expect(report.summary.expected_triples).toBeGreaterThanOrEqual(10);
    expect(report.summary.expected_triple_recall).toBeGreaterThanOrEqual(0.85);
    expect(report.summary.forbidden_triple_rate).toBe(0);
    expect(report.markdown).toContain('# KG Quality Eval');
    expect(report.markdown).toContain('| Expected Triple Recall |');
    expect(report.markdown).toContain('| Forbidden Triple Rate |');
  });
});
