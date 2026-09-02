import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateImportRankingReport, writeImportRankingReport } from '../../benchmarks/import-ranking/report.mjs';

function validReport() {
  const rankings = Array.from({ length: 17 }, (_, probe) => Array.from({ length: 5 }, (_, rank) => `memory-${probe}-${rank}`));
  const controlSamples = Array.from({ length: 100 }, (_, index) => index + 1);
  const candidateSamples = controlSamples.map((sample) => sample * 1.5);
  const diagnostics = { recall_calls: 1_700, ranked_fts_rows: 17_000, fused_lexical_rows: 8_500, hydrated_memory_rows: 8_500 };
  return {
    schema: 'thoth-mem.import-ranking-report.v1',
    created_at: '2026-09-02T00:00:00.000Z',
    strategy: {
      id: 'strict-selected-any-cap5-stable-v1',
      config_hash: 'b3a5b51c95b8aa79a677b8756e7a7bac0dc6aaad84403446ea1a68f14864fa04',
      plan_manifest_hash: 'a'.repeat(64),
    },
    conditions: { warmups: 10, samples: 100, probe_count: 17, imported_memory_count: 1_000, top_k: 5 },
    control: { strategy_id: 'strict-selected-any-cap5-rrf-v1', input_hash: 'b'.repeat(64), latency_ms: { p95: 95, samples: controlSamples }, diagnostics },
    candidate: { strategy_id: 'strict-selected-any-cap5-stable-v1', input_hash: 'b'.repeat(64), latency_ms: { p95: 142.5, samples: candidateSamples }, diagnostics: { ...diagnostics } },
    stability: { before_rankings: rankings, after_rankings: structuredClone(rankings), exact_top_k_count: 17, pairwise_inversions: 0 },
    performance: { candidate_to_control_p95_ratio: 1.5, maximum_ratio: 2, passed: true },
    calls: { network: 0, model: 0, llm: 0 },
    output: { mode: 'create-only', path: 'C:/tmp/import-ranking-report.json' },
  };
}

describe('import ranking benchmark report', () => {
  it('accepts a complete paired 10/100 run with exact stability and a p95 ratio at most 2x', () => {
    expect(validateImportRankingReport(validReport())).toEqual({ valid: true, errors: [] });
  });

  it('recomputes identities, samples, p95, stability, diagnostics, output policy, and zero-call claims', () => {
    const cases: Array<[string, (report: ReturnType<typeof validReport>) => void]> = [
      ['paired_input_identity', (report) => { report.candidate.input_hash = 'c'.repeat(64); }],
      ['control_sample_count', (report) => { report.control.latency_ms.samples.pop(); }],
      ['candidate_p95', (report) => { report.candidate.latency_ms.p95 = 1; }],
      ['exact_top_k_count', (report) => { report.stability.after_rankings[0]![0] = 'changed'; }],
      ['pairwise_inversions', (report) => { [report.stability.after_rankings[0]![0], report.stability.after_rankings[0]![1]] = [report.stability.after_rankings[0]![1]!, report.stability.after_rankings[0]![0]!]; }],
      ['diagnostics', (report) => { report.candidate.diagnostics.recall_calls = 0; }],
      ['performance_ratio', (report) => { report.performance.candidate_to_control_p95_ratio = 1; }],
      ['performance_gate', (report) => { report.candidate.latency_ms.samples = report.candidate.latency_ms.samples.map((sample) => sample * 2); report.candidate.latency_ms.p95 *= 2; }],
      ['create_only_output', (report) => { report.output.mode = 'overwrite' as 'create-only'; }],
      ['external_calls', (report) => { report.calls.network = 1; }],
    ];
    for (const [error, mutate] of cases) {
      const report = validReport();
      mutate(report);
      expect(validateImportRankingReport(report).errors).toContain(error);
    }
  });

  it('creates the explicit report once and refuses to overwrite it', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-ranking-report-'));
    const outputPath = join(root, 'report.json');
    try {
      expect(writeImportRankingReport(validReport(), outputPath).output).toEqual({ mode: 'create-only', path: outputPath });
      expect(() => writeImportRankingReport(validReport(), outputPath)).toThrow(/exist/i);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
