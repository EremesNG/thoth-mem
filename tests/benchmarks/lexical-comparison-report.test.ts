import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LEXICAL_COMPARISON_BASELINE, assessLexicalPromotion, createLexicalComparisonReport, validateLexicalComparisonReport } from '../../benchmarks/lexical-comparison-report.mjs';
import { runLongMemEval } from '../../benchmarks/longmemeval/run.mjs';

const STRATEGY_IDS = ['all-prefix-v1', 'any-prefix-v1', 'all-then-any-prefix-v1'] as const;
type StrategyId = (typeof STRATEGY_IDS)[number];
type LaneReport = Awaited<ReturnType<typeof runLongMemEval>>['report'];

let root: string;
let lanes: Record<StrategyId, LaneReport>;
let diagnostics: Record<StrategyId, Awaited<ReturnType<typeof runLongMemEval>>['diagnostics']>;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'thoth-lexical-report-'));
  const fixture = JSON.parse(readFileSync('benchmarks/fixtures/longmemeval-s-mini.json', 'utf8')) as Array<Record<string, unknown>>;
  const content = JSON.stringify(fixture.slice(0, 4));
  const datasetPath = join(root, 'dataset.json');
  const sha256 = createHash('sha256').update(content).digest('hex');
  const source = { dataset: 'test/longmemeval-cleaned', filename: 'dataset.json', revision: 'a'.repeat(40), sha256, bytes: Buffer.byteLength(content), license: 'MIT' };
  writeFileSync(datasetPath, content);
  const entries = await Promise.all(STRATEGY_IDS.map(async (lexicalStrategy) => {
    const result = await runLongMemEval({ datasetPath, expectedSha256: sha256, outputPath: join(root, `${lexicalStrategy}.json`), source, lexicalStrategy });
    return [lexicalStrategy, result] as const;
  }));
  lanes = Object.fromEntries(entries.map(([id, result]) => [id, result.report])) as Record<StrategyId, LaneReport>;
  diagnostics = Object.fromEntries(entries.map(([id, result]) => [id, result.diagnostics])) as typeof diagnostics;
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('lexical comparison report', () => {
  it('accepts exactly three individually valid lanes with shared identities', () => {
    const report = createReport(lanes);
    expect(validateLexicalComparisonReport(report)).toEqual({ valid: true, errors: [] });
    expect(report.schema).toBe('thoth-mem.lexical-comparison-report.v2');
    expect(report.archived_reference).toMatchObject({ sha256: LEXICAL_COMPARISON_BASELINE.report_sha256 });
    expect(report.diagnostics['any-prefix-v1']).toMatchObject({ strategy_id: 'any-prefix-v1', max_lexical_results: 2 });
    expect(report.shared).toMatchObject({
      evaluated_count: 3,
      candidate_k: 20,
      candidate_payload_utf16_code_units: 20_000,
      delivery_utf16_code_units: 4_000,
    });
    expect(Object.keys(report.lanes)).toEqual(STRATEGY_IDS);
  });

  it('fails closed for missing, extra, invalid, or cross-lane drifting evidence', () => {
    const cases: Array<{ mutate: (report: ReturnType<typeof createReport>) => void; error: string }> = [
      { mutate: (report) => { delete report.lanes['any-prefix-v1']; }, error: 'lane_inventory' },
      { mutate: (report) => { report.lanes['unexpected-v1'] = structuredClone(report.lanes['all-prefix-v1']); }, error: 'lane_inventory' },
      { mutate: (report) => { report.lanes['any-prefix-v1'].dataset.corpus_hash = 'f'.repeat(64); }, error: 'shared_identity' },
      { mutate: (report) => { report.lanes['any-prefix-v1'].dataset.exclusions[0].question_id = 'drifted-exclusion'; }, error: 'shared_identity' },
      { mutate: (report) => {
        const lane = report.lanes['any-prefix-v1'];
        lane.candidate.config.granularity = 'turn';
        lane.candidate.config_hash = createHash('sha256').update(JSON.stringify(lane.candidate.config)).digest('hex');
      }, error: 'shared_identity' },
      { mutate: (report) => { report.lanes['any-prefix-v1'].conditions.delivery.utf16_code_units = 3_999; }, error: 'lane_validity' },
      { mutate: (report) => { report.lanes['any-prefix-v1'].provenance.mappings[0].memory_id = 'drifted-memory'; }, error: 'shared_identity' },
      { mutate: (report) => { report.lanes['any-prefix-v1'].candidate.config.lexical_strategy.id = 'all-prefix-v1'; }, error: 'lane_identity' },
      { mutate: (report) => { report.lanes['any-prefix-v1'].queries[0].answer = 'forbidden'; }, error: 'lane_validity' },
    ];
    for (const entry of cases) {
      const report = createReport(structuredClone(lanes));
      entry.mutate(report);
      expect(validateLexicalComparisonReport(report).errors, entry.error).toContain(entry.error);
    }
  });

  it('rejects diagnostic, aggregate, configuration, and archived-delta drift', () => {
    const cases: Array<{ mutate: (report: ReturnType<typeof createReport>) => void; error: string }> = [
      { mutate: (report) => { report.diagnostics['any-prefix-v1'].queries[0].question_id = 'wrong-order'; }, error: 'diagnostics' },
      { mutate: (report) => { report.diagnostics['any-prefix-v1'].config_hash = 'f'.repeat(64); }, error: 'diagnostics' },
      { mutate: (report) => { report.diagnostics['any-prefix-v1'].aggregate.work.returned_rows += 1; }, error: 'diagnostics' },
      { mutate: (report) => { report.diagnostics['any-prefix-v1'].queries[0].result.returned_count += 1; }, error: 'diagnostics' },
      { mutate: (report) => { report.archived_reference.quality_deltas['any-prefix-v1'].ndcg_at_10 += 0.01; }, error: 'archived_reference' },
    ];
    for (const entry of cases) {
      const report = createReport(structuredClone(lanes));
      entry.mutate(report);
      expect(validateLexicalComparisonReport(report).errors, entry.error).toContain(entry.error);
    }
  });

  it('reconciles diagnostic work counters with the stages that produced them', () => {
    const cases: Array<(report: ReturnType<typeof createReport>) => void> = [
      (report) => mutateDiagnosticWork(report, 'ranked_fts_rows', 1),
      (report) => mutateDiagnosticWork(report, 'hydrated_memory_rows', 1),
      (report) => {
        const diagnostic = report.diagnostics['any-prefix-v1'].queries.find((query) => query.stages[3]?.rows > 0)!;
        const delta = diagnostic.work.memory_hydration_statements === 0 ? 1 : -1;
        diagnostic.work.memory_hydration_statements += delta;
        report.diagnostics['any-prefix-v1'].aggregate.work.memory_hydration_statements += delta;
      },
      (report) => {
        const diagnostic = report.diagnostics['any-prefix-v1'].queries.find((query) => query.stages[3]?.rows > 0)!;
        const delta = diagnostic.work.evidence_hydration_statements === 0 ? 1 : -1;
        diagnostic.work.evidence_hydration_statements += delta;
        report.diagnostics['any-prefix-v1'].aggregate.work.evidence_hydration_statements += delta;
      },
    ];

    for (const mutate of cases) {
      const report = createReport(structuredClone(lanes));
      mutate(report);
      expect(validateLexicalComparisonReport(report).errors).toContain('diagnostics');
    }
  });

  it('rejects impossible stage plans, invented rows, and cap-violating reconciled work', () => {
    const cases: Array<(report: ReturnType<typeof createReport>) => void> = [
      (report) => {
        report.diagnostics['any-prefix-v1'].queries[0].stages[1] = {
          kind: 'strict', executed: true, elapsed_ms: 0, rows: 0,
        };
      },
      (report) => { report.diagnostics['any-prefix-v1'].queries[0].stages[0].rows += 1; },
      (report) => {
        const diagnostic = report.diagnostics['any-prefix-v1'].queries[0];
        diagnostic.stages[3].rows += 1;
        diagnostic.work.hydrated_memory_rows += 1;
        report.diagnostics['any-prefix-v1'].aggregate.work.hydrated_memory_rows += 1;
      },
      (report) => {
        const diagnostic = report.diagnostics['any-prefix-v1'].queries[0];
        const exactRows = diagnostic.stages[0].rows;
        const previousRanked = diagnostic.work.ranked_fts_rows;
        const previousHydrated = diagnostic.work.hydrated_memory_rows;
        diagnostic.stages[2].rows = 10;
        diagnostic.stages[3].rows = exactRows + 10;
        diagnostic.work.ranked_fts_rows = 10;
        diagnostic.work.hydrated_memory_rows = exactRows + 10;
        report.diagnostics['any-prefix-v1'].aggregate.work.ranked_fts_rows += 10 - previousRanked;
        report.diagnostics['any-prefix-v1'].aggregate.work.hydrated_memory_rows += exactRows + 10 - previousHydrated;
      },
    ];

    for (const mutate of cases) {
      const report = createReport(structuredClone(lanes));
      mutate(report);
      expect(validateLexicalComparisonReport(report).errors).toContain('diagnostics');
    }
  });

  it('rejects compensated fabricated benchmark-profile work', () => {
    const cases: Array<(report: ReturnType<typeof createReport>) => void> = [
      (report) => {
        const lane = report.diagnostics['any-prefix-v1'];
        const diagnostic = lane.queries.find((query) => query.stages[2].rows > 0)!;
        diagnostic.stages[0].rows += 1;
        diagnostic.stages[2].rows -= 1;
        diagnostic.work.ranked_fts_rows -= 1;
        lane.aggregate.work.ranked_fts_rows -= 1;
      },
      (report) => {
        const lane = report.diagnostics['any-prefix-v1'];
        const diagnostic = lane.queries.find((query) => query.stages[2].rows === 0 && query.stages[3].rows === 0)!;
        diagnostic.stages[2].rows += 1;
        diagnostic.stages[3].rows += 1;
        diagnostic.work.ranked_fts_rows += 1;
        diagnostic.work.hydrated_memory_rows += 1;
        diagnostic.work.memory_hydration_statements += 1;
        diagnostic.work.evidence_hydration_statements += 1;
        lane.aggregate.work.ranked_fts_rows += 1;
        lane.aggregate.work.hydrated_memory_rows += 1;
        lane.aggregate.work.memory_hydration_statements += 1;
        lane.aggregate.work.evidence_hydration_statements += 1;
      },
      (report) => {
        const lane = report.diagnostics['any-prefix-v1'];
        const diagnostic = lane.queries.find((query) => query.work.hydrated_memory_rows > 0)!;
        diagnostic.work.hydrated_evidence_links += 1;
        lane.aggregate.work.hydrated_evidence_links += 1;
      },
    ];

    for (const mutate of cases) {
      const report = createReport(structuredClone(lanes));
      mutate(report);
      expect(validateLexicalComparisonReport(report).errors).toContain('diagnostics');
    }
  });

  it('binds archived quality and footprint baselines to the archived report hash', () => {
    const archivedLanes = structuredClone(lanes);
    for (const id of STRATEGY_IDS) archivedLanes[id].metrics.resources.sqlite_bytes.total = 1;
    const report = createLexicalComparisonReport(structuredClone(lanes), {
      diagnostics: structuredClone(diagnostics),
      archived: { sha256: LEXICAL_COMPARISON_BASELINE.report_sha256, lanes: archivedLanes },
      createdAt: '2026-08-28T00:00:00.000Z',
    });

    expect(validateLexicalComparisonReport(report).errors).toContain('archived_reference');
  });

  it('keeps the machine-readable schema aligned with the exact lane contract', () => {
    const schema = JSON.parse(readFileSync('benchmarks/lexical-comparison-report.schema.json', 'utf8'));
    expect(schema.properties.schema.const).toBe('thoth-mem.lexical-comparison-report.v2');
    expect(schema.properties.lanes.required).toEqual(STRATEGY_IDS);
    expect(schema.properties.lanes.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['schema', 'created_at', 'shared', 'archived_reference', 'diagnostics', 'lanes', 'promotion']);
    expect(schema.$defs.diagnostic.additionalProperties).toBe(false);
    expect(schema.$defs.diagnostic.required).toEqual(['question_id', 'strategy_id', 'config_hash', 'plan_hash', 'total_elapsed_ms', 'stages', 'work', 'result']);
    expect(schema.$defs.stage.properties.kind.enum).toEqual(['exact', 'strict', 'relaxed', 'post_query']);
    expect(schema.$defs.stage.properties.elapsed_ms.minimum).toBe(0);
    expect(schema.$defs.stage.properties.rows.minimum).toBe(0);
    expect(schema.$defs.stage.properties.reason.enum).toEqual(['not_planned', 'limit_satisfied', 'empty_query', 'project_not_found']);
    expect(Object.keys(schema.$defs.diagnostic.properties)).not.toEqual(expect.arrayContaining(['query', 'title', 'content', 'topic_key', 'source_ref', 'evidence', 'sql']));
  });

  it('promotes one candidate at every exact quality and resource boundary', () => {
    const control = promotionLane('all-prefix-v1', { recallAnyAt20: 0.1 });
    const winner = promotionLane('any-prefix-v1', {
      recallAnyAt20: 0.15,
      retrievalP95Ms: 20,
    });
    const rejected = promotionLane('all-then-any-prefix-v1', { recallAnyAt20: 0.14 });
    const result = assessLexicalPromotion({ complete: true, control, candidates: [winner, rejected] });
    expect(result).toMatchObject({
      decision: 'promote',
      selected_strategy: 'any-prefix-v1',
      reasons: ['unique_candidate_eligible'],
    });
    expect(result.assessments[0]).toMatchObject({ strategy_id: 'any-prefix-v1', eligible: true, reasons: [] });
    expect(result.assessments[1].reasons).toContain('coverage_gain_below_0_05');
  });

  it('fails every promotion gate closed with explicit deterministic reasons', () => {
    const control = promotionLane('all-prefix-v1');
    const rejected = promotionLane('any-prefix-v1', {
      recallAnyAt20: 0.14,
      ndcgAt10: 0.199,
      recallAt20: 0.149,
      retrievalP95Ms: 20.001,
      sqliteBytesTotal: 101,
      errorCount: 1,
      networkCalls: 1,
      provenanceValid: false,
    });
    const result = assessLexicalPromotion({ complete: true, control, candidates: [rejected, promotionLane('all-then-any-prefix-v1', { recallAnyAt20: 0.1 })] });
    expect(result).toMatchObject({ decision: 'retain_control', selected_strategy: null, reasons: ['no_candidate_eligible'] });
    expect(result.assessments[0].reasons).toEqual([
      'coverage_gain_below_0_05',
      'ndcg_at_10_regression',
      'recall_at_20_regression',
      'retrieval_p95_above_2x_control',
      'sqlite_bytes_mismatch',
      'nonzero_errors',
      'nonzero_calls',
      'invalid_provenance',
    ]);
  });

  it('handles zero latency, incomplete evidence, and multiple eligible candidates without implicit tie-breaking', () => {
    const zeroControl = promotionLane('all-prefix-v1', { retrievalP95Ms: 0 });
    const zeroWinner = promotionLane('any-prefix-v1', { recallAnyAt20: 0.16, retrievalP95Ms: 0 });
    expect(assessLexicalPromotion({ complete: true, control: zeroControl, candidates: [zeroWinner] }).decision).toBe('promote');

    const nonzeroCandidate = promotionLane('any-prefix-v1', { recallAnyAt20: 0.16, retrievalP95Ms: Number.EPSILON });
    expect(assessLexicalPromotion({ complete: true, control: zeroControl, candidates: [nonzeroCandidate] }).assessments[0].reasons).toContain('retrieval_p95_above_2x_control');

    const tied = assessLexicalPromotion({
      complete: true,
      control: promotionLane('all-prefix-v1'),
      candidates: [promotionLane('any-prefix-v1', { recallAnyAt20: 0.16 }), promotionLane('all-then-any-prefix-v1', { recallAnyAt20: 0.16 })],
    });
    expect(tied).toMatchObject({ decision: 'retain_control', selected_strategy: null, reasons: ['multiple_eligible_candidates'] });
    expect(assessLexicalPromotion({ complete: false, control: promotionLane('all-prefix-v1'), candidates: [] })).toMatchObject({
      decision: 'incomplete',
      selected_strategy: null,
      reasons: ['comparison_incomplete'],
    });
  });

  it('treats a control-lane error as incomplete in both policy and validated reports', () => {
    const control = promotionLane('all-prefix-v1', { errorCount: 1 });
    const winner = promotionLane('any-prefix-v1', { recallAnyAt20: 0.16 });
    expect(assessLexicalPromotion({ complete: true, control, candidates: [winner] })).toMatchObject({
      decision: 'incomplete',
      selected_strategy: null,
      assessments: [],
      reasons: ['comparison_incomplete'],
    });

    const reportLanes = structuredClone(lanes);
    const questionId = reportLanes['all-prefix-v1'].queries[0].question_id;
    reportLanes['all-prefix-v1'].errors.push({
      question_id: questionId,
      code: 'retrieval_failed',
      message: 'Control retrieval failed.',
    });
    const report = createReport(reportLanes);
    expect(report.promotion).toMatchObject({
      decision: 'incomplete',
      selected_strategy: null,
      assessments: [],
      reasons: ['comparison_incomplete'],
    });
    expect(validateLexicalComparisonReport(report)).toEqual({ valid: true, errors: [] });
  });

  it('rejects immediately sub-threshold gains and every negative quality delta', () => {
    const control = promotionLane('all-prefix-v1', { evaluatedCount: 1_000, recallAnyAt20Hits: 100 });
    const almost = promotionLane('any-prefix-v1', {
      evaluatedCount: 1_000,
      recallAnyAt20Hits: 149,
      ndcgAt10: 0.1999999999995,
      recallAt20: 0.1499999999995,
    });
    const result = assessLexicalPromotion({
      complete: true,
      control,
      candidates: [almost, promotionLane('all-then-any-prefix-v1')],
    });
    expect(result.decision).toBe('retain_control');
    expect(result.assessments[0].reasons).toEqual([
      'coverage_gain_below_0_05',
      'ndcg_at_10_regression',
      'recall_at_20_regression',
    ]);
  });
});

function createReport(laneValues: Record<StrategyId, LaneReport>) {
  const archivedLanes = structuredClone(lanes);
  for (const id of STRATEGY_IDS) {
    const baseline = LEXICAL_COMPARISON_BASELINE.quality_baseline[id];
    archivedLanes[id].metrics.ranking.overall.recall_any_at_20 = baseline.recall_any_at_20;
    archivedLanes[id].metrics.ranking.overall.recall_at_20 = baseline.recall_at_20;
    archivedLanes[id].metrics.ranking.overall.ndcg_at_10 = baseline.ndcg_at_10;
    archivedLanes[id].metrics.resources.sqlite_bytes.total = baseline.sqlite_bytes_total;
  }
  return createLexicalComparisonReport(laneValues, {
    diagnostics: structuredClone(diagnostics),
    archived: { sha256: LEXICAL_COMPARISON_BASELINE.report_sha256, lanes: archivedLanes },
    createdAt: '2026-08-28T00:00:00.000Z',
  });
}

function mutateDiagnosticWork(report: ReturnType<typeof createReport>, key: 'ranked_fts_rows' | 'hydrated_memory_rows', delta: number) {
  report.diagnostics['any-prefix-v1'].queries[0].work[key] += delta;
  report.diagnostics['any-prefix-v1'].aggregate.work[key] += delta;
}

function promotionLane(strategyId: StrategyId, overrides: Partial<{
  recallAnyAt20: number;
  recallAnyAt20Hits: number;
  evaluatedCount: number;
  ndcgAt10: number;
  recallAt20: number;
  retrievalP95Ms: number;
  sqliteBytesTotal: number;
  errorCount: number;
  networkCalls: number;
  modelCalls: number;
  llmCalls: number;
  provenanceValid: boolean;
}> = {}) {
  const evaluatedCount = overrides.evaluatedCount ?? 100;
  const recallAnyAt20Hits = overrides.recallAnyAt20Hits ?? Math.round((overrides.recallAnyAt20 ?? 0.1) * evaluatedCount);
  return {
    strategyId,
    recallAnyAt20: recallAnyAt20Hits / evaluatedCount,
    recallAnyAt20Hits,
    evaluatedCount,
    ndcgAt10: overrides.ndcgAt10 ?? 0.2,
    recallAt20: overrides.recallAt20 ?? 0.15,
    retrievalP95Ms: overrides.retrievalP95Ms ?? 10,
    sqliteBytesTotal: overrides.sqliteBytesTotal ?? 100,
    errorCount: overrides.errorCount ?? 0,
    networkCalls: overrides.networkCalls ?? 0,
    modelCalls: overrides.modelCalls ?? 0,
    llmCalls: overrides.llmCalls ?? 0,
    provenanceValid: overrides.provenanceValid ?? true,
  };
}
