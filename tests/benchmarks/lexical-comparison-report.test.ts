import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  LEXICAL_COMPARISON_BASELINE,
  LEXICAL_RECALL_AT_5_BASELINE,
  assessLexicalPromotion,
  assessRecallAt5Promotion,
  createLexicalComparisonReport,
  validateLexicalComparisonReport,
  validateLexicalRecallAt5Baseline,
} from '../../benchmarks/lexical-comparison-report.mjs';
import { runLongMemEval } from '../../benchmarks/longmemeval/run.mjs';

const STRATEGY_IDS = ['all-prefix-v1', 'any-prefix-v1', 'all-then-any-prefix-v1'] as const;
const E0_STRATEGY_ID = 'strict-selected-any-cap5-rrf-v1' as const;
type StrategyId = (typeof STRATEGY_IDS)[number];
type LaneReport = Awaited<ReturnType<typeof runLongMemEval>>['report'];

let root: string;
let lanes: Record<StrategyId, LaneReport>;
let diagnostics: Record<StrategyId, Awaited<ReturnType<typeof runLongMemEval>>['diagnostics']>;
let e0Lane: LaneReport;
let e0Diagnostics: Awaited<ReturnType<typeof runLongMemEval>>['diagnostics'];

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
  const e0 = await runLongMemEval({ datasetPath, expectedSha256: sha256, outputPath: join(root, `${E0_STRATEGY_ID}.json`), source, lexicalStrategy: E0_STRATEGY_ID });
  e0Lane = e0.report;
  e0Diagnostics = e0.diagnostics;
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

  it('binds the separate r4 Top-5 baseline to exact immutable evidence', () => {
    const path = 'benchmarks/results/longmemeval-s-lexical-latency-report-r4.json';
    const raw = readFileSync(path, 'utf8');
    const archivedReport = JSON.parse(raw);
    const reference = {
      path,
      sha256: createHash('sha256').update(raw).digest('hex'),
      report: archivedReport,
    };
    expect(validateLexicalRecallAt5Baseline(LEXICAL_RECALL_AT_5_BASELINE, reference)).toEqual({ valid: true, errors: [] });
    expect(LEXICAL_RECALL_AT_5_BASELINE).toMatchObject({
      schema: 'thoth-mem.lexical-recall-at-5-baseline.v1',
      report: {
        path,
        schema: 'thoth-mem.lexical-comparison-report.v2',
        sha256: '842805cc423cc48d33cf07b05e73c25967f532b79e24131b44407d87b1e6fe36',
      },
      quality_baseline: {
        'all-prefix-v1': { config_hash: 'e792c3009bbab297d654684da8b4ad1b6463277716aed860f765f9dbc38714e6', recall_any_at_5: 0.12978723404255318, recall_at_5: 0.09801418439716311, recall_all_at_5: 0.06595744680851064, ndcg_at_10: 0.10450544310213, mrr_any: 0.12872340425531914, sqlite_bytes_total: 1_519_955_968 },
        'any-prefix-v1': { config_hash: 'd31ca3f7d1a0fd6662af2148cd51d1f3149b681012f8f756629d6bdd67aeb553', recall_any_at_5: 0.825531914893617, recall_at_5: 0.6770212765957448, recall_all_at_5: 0.5404255319148936, ndcg_at_10: 0.6965441169016003, mrr_any: 0.7946808510638298, sqlite_bytes_total: 1_519_955_968 },
        'all-then-any-prefix-v1': { config_hash: '40cd3522257085172694037746cc7cd720ded68f65c5d6bae1f514cf273eb443', recall_any_at_5: 0.948936170212766, recall_at_5: 0.8792553191489364, recall_all_at_5: 0.7872340425531915, ndcg_at_10: 0.8538289016145295, mrr_any: 0.8716652534643773, sqlite_bytes_total: 1_519_955_968 },
      },
    });

    const cases: Array<{ mutate: (baseline: typeof LEXICAL_RECALL_AT_5_BASELINE) => void; error: string }> = [
      { mutate: (baseline) => { baseline.schema = 'wrong'; }, error: 'schema' },
      { mutate: (baseline) => { baseline.report.path = 'wrong.json'; }, error: 'report_reference' },
      { mutate: (baseline) => { baseline.report.schema = 'wrong'; }, error: 'report_reference' },
      { mutate: (baseline) => { baseline.report.sha256 = 'f'.repeat(64); }, error: 'report_reference' },
      { mutate: (baseline) => { baseline.quality_baseline['any-prefix-v1'].config_hash = 'f'.repeat(64); }, error: 'quality_baseline' },
      { mutate: (baseline) => { baseline.quality_baseline['any-prefix-v1'].recall_any_at_5 += 0.01; }, error: 'quality_baseline' },
      { mutate: (baseline) => { baseline.quality_baseline['any-prefix-v1'].mrr_any += 0.01; }, error: 'quality_baseline' },
      { mutate: (baseline) => { baseline.quality_baseline['any-prefix-v1'].sqlite_bytes_total += 1; }, error: 'quality_baseline' },
    ];
    for (const entry of cases) {
      const baseline = structuredClone(LEXICAL_RECALL_AT_5_BASELINE);
      entry.mutate(baseline);
      expect(validateLexicalRecallAt5Baseline(baseline, reference).errors).toContain(entry.error);
    }
  });

  it('creates and validates a four-lane v3 report with explicit E0 fusion evidence', () => {
    const report = createV3Report();
    expect(report.schema).toBe('thoth-mem.lexical-comparison-report.v3');
    expect(Object.keys(report.lanes)).toEqual([...STRATEGY_IDS, E0_STRATEGY_ID]);
    expect(report.candidate).toMatchObject({
      strategy_id: E0_STRATEGY_ID,
      config_hash: e0Lane.candidate.config.lexical_strategy.config_hash,
      max_stage_results: 5,
      max_lexical_results: 5,
      fusion: { kind: 'rrf-v1', rank_constant: 60, weights: { strict: 1, relaxed: 1 } },
    });
    expect(report.recall_at_5_reference).toMatchObject({
      path: LEXICAL_RECALL_AT_5_BASELINE.report.path,
      schema: LEXICAL_RECALL_AT_5_BASELINE.report.schema,
      sha256: LEXICAL_RECALL_AT_5_BASELINE.report.sha256,
      quality_baseline: LEXICAL_RECALL_AT_5_BASELINE.quality_baseline,
    });
    expect(report.diagnostics[E0_STRATEGY_ID].queries[0].work).toHaveProperty('fused_lexical_rows');
    expect(report.diagnostics[E0_STRATEGY_ID].aggregate.total_elapsed_ms.p99).toBeTypeOf('number');
    expect(validateLexicalComparisonReport(report)).toEqual({ valid: true, errors: [] });

    const cases: Array<{ mutate: (candidate: typeof report) => void; error: string }> = [
      { mutate: (candidate) => { candidate.lanes['unexpected-v1'] = structuredClone(candidate.lanes['all-prefix-v1']); }, error: 'lane_inventory' },
      { mutate: (candidate) => { candidate.candidate.max_lexical_results = 4; }, error: 'candidate' },
      { mutate: (candidate) => { candidate.candidate.fusion.rank_constant = 59; }, error: 'candidate' },
      { mutate: (candidate) => { candidate.recall_at_5_reference.sha256 = 'f'.repeat(64); }, error: 'recall_at_5_reference' },
      { mutate: (candidate) => { candidate.diagnostics[E0_STRATEGY_ID].queries[0].work.fused_lexical_rows += 1; }, error: 'diagnostics' },
    ];
    for (const entry of cases) {
      const candidate = structuredClone(report);
      entry.mutate(candidate);
      expect(validateLexicalComparisonReport(candidate).errors).toContain(entry.error);
    }
  });

  it('keeps the machine-readable schema aligned with the exact lane contract', () => {
    const schema = JSON.parse(readFileSync('benchmarks/lexical-comparison-report.schema.json', 'utf8'));
    expect(schema.oneOf).toEqual([{ $ref: '#/$defs/reportV2' }, { $ref: '#/$defs/reportV3' }]);
    expect(schema.$defs.reportV2.properties.schema.const).toBe('thoth-mem.lexical-comparison-report.v2');
    expect(schema.$defs.reportV2.required).toEqual(['schema', 'created_at', 'shared', 'archived_reference', 'diagnostics', 'lanes', 'promotion']);
    expect(schema.$defs.reportV3.properties.schema.const).toBe('thoth-mem.lexical-comparison-report.v3');
    expect(schema.$defs.reportV3.required).toEqual(['schema', 'created_at', 'shared', 'archived_reference', 'recall_at_5_reference', 'candidate', 'diagnostics', 'lanes', 'promotion']);
    expect(schema.$defs.lanesV2.required).toEqual(STRATEGY_IDS);
    expect(schema.$defs.lanesV3.required).toEqual([...STRATEGY_IDS, E0_STRATEGY_ID]);
    expect(schema.$defs.lanesV2.additionalProperties).toBe(false);
    expect(schema.$defs.lanesV3.additionalProperties).toBe(false);
    expect(schema.$defs.diagnosticV2.additionalProperties).toBe(false);
    expect(schema.$defs.diagnosticV3.additionalProperties).toBe(false);
    expect(schema.$defs.diagnosticV3.required).toEqual(['question_id', 'strategy_id', 'config_hash', 'plan_hash', 'total_elapsed_ms', 'stages', 'work', 'result']);
    expect(schema.$defs.workV3.required).toContain('fused_lexical_rows');
    expect(schema.$defs.sampleSummaryV3.required).toEqual(['p50', 'p95', 'p99', 'samples']);
    expect(schema.$defs.stage.properties.kind.enum).toEqual(['exact', 'strict', 'relaxed', 'post_query']);
    expect(schema.$defs.stage.properties.elapsed_ms.minimum).toBe(0);
    expect(schema.$defs.stage.properties.rows.minimum).toBe(0);
    expect(schema.$defs.stage.properties.reason.enum).toEqual(['not_planned', 'limit_satisfied', 'empty_query', 'project_not_found']);
    expect(Object.keys(schema.$defs.diagnosticV3.properties)).not.toEqual(expect.arrayContaining(['query', 'title', 'content', 'topic_key', 'source_ref', 'evidence', 'sql']));
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

  it('promotes only E0 at the exact Recall@5 quality, latency, footprint, and identity boundaries', () => {
    const control = promotionAt5Lane('all-prefix-v1', { retrievalP95Ms: 10 });
    const currentDefault = promotionAt5Lane('any-prefix-v1', { recallAt5: 0.87, recallAllAt5: 0.78, ndcgAt10: 0.85 });
    const broadReference = promotionAt5Lane('all-then-any-prefix-v1', { recallAt5: 0.88, recallAllAt5: 0.79, ndcgAt10: 0.86 });
    const candidate = promotionAt5Lane(E0_STRATEGY_ID, {
      recallAnyAt5Hits: 447,
      recallAt5: 0.88,
      recallAllAt5: 0.79,
      ndcgAt10: 0.86,
      retrievalP95Ms: 20,
    });
    const result = assessRecallAt5Promotion({ complete: true, control, references: [currentDefault, broadReference], candidate });
    expect(result).toMatchObject({ decision: 'promote', selected_strategy: E0_STRATEGY_ID, reasons: ['unique_candidate_eligible'] });
    expect(result.assessments).toHaveLength(1);
    expect(result.assessments[0]).toMatchObject({ strategy_id: E0_STRATEGY_ID, eligible: true, reasons: [] });
    expect(result.assessments[0].evidence).toMatchObject({ recall_any_at_5_hits: 447, evaluated_count: 470, candidate_mrr_any: 0.8 });
  });

  it('fails E0 promotion closed for compensated, regressed, slow, bloated, stale, or impure evidence', () => {
    const control = promotionAt5Lane('all-prefix-v1', { retrievalP95Ms: 10 });
    const references = [
      promotionAt5Lane('any-prefix-v1', { recallAt5: 0.87, recallAllAt5: 0.78, ndcgAt10: 0.85 }),
      promotionAt5Lane('all-then-any-prefix-v1', { recallAt5: 0.88, recallAllAt5: 0.79, ndcgAt10: 0.86 }),
    ];
    const candidate = promotionAt5Lane(E0_STRATEGY_ID, {
      recallAnyAt5Hits: 446,
      reportedRecallAnyAt5: 0.99,
      recallAt5: 0.879,
      recallAllAt5: 0.789,
      ndcgAt10: 0.859,
      retrievalP95Ms: 20.001,
      sqliteBytesTotal: 101,
      configIdentityValid: false,
      errorCount: 1,
      networkCalls: 1,
      provenanceValid: false,
    });
    const result = assessRecallAt5Promotion({ complete: true, control, references, candidate });
    expect(result).toMatchObject({ decision: 'retain_default', selected_strategy: null, reasons: ['no_candidate_eligible'] });
    expect(result.assessments).toHaveLength(1);
    expect(result.assessments[0].reasons).toEqual([
      'recall_any_at_5_below_447_of_470',
      'recall_at_5_regression',
      'recall_all_at_5_regression',
      'ndcg_at_10_regression',
      'retrieval_p95_above_2x_control',
      'sqlite_bytes_mismatch',
      'config_identity_mismatch',
      'nonzero_errors',
      'nonzero_calls',
      'invalid_provenance',
    ]);
  });

  it('recomputes and validates the persisted v3 promotion decision', () => {
    const report = createV3Report();
    expect(report.promotion.decision).toBe('retain_default');
    expect(report.promotion.assessments).toHaveLength(1);
    expect(validateLexicalComparisonReport(report)).toEqual({ valid: true, errors: [] });
    report.promotion.decision = 'promote';
    report.promotion.selected_strategy = E0_STRATEGY_ID;
    expect(validateLexicalComparisonReport(report).errors).toContain('promotion');
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

function createV3Report() {
  const archivedLanes = structuredClone(lanes);
  for (const id of STRATEGY_IDS) {
    const baseline = LEXICAL_COMPARISON_BASELINE.quality_baseline[id];
    archivedLanes[id].metrics.ranking.overall.recall_any_at_20 = baseline.recall_any_at_20;
    archivedLanes[id].metrics.ranking.overall.recall_at_20 = baseline.recall_at_20;
    archivedLanes[id].metrics.ranking.overall.ndcg_at_10 = baseline.ndcg_at_10;
    archivedLanes[id].metrics.resources.sqlite_bytes.total = baseline.sqlite_bytes_total;
  }
  const path = LEXICAL_RECALL_AT_5_BASELINE.report.path;
  const raw = readFileSync(path, 'utf8');
  return createLexicalComparisonReport({ ...structuredClone(lanes), [E0_STRATEGY_ID]: structuredClone(e0Lane) }, {
    diagnostics: { ...structuredClone(diagnostics), [E0_STRATEGY_ID]: structuredClone(e0Diagnostics) },
    archived: { sha256: LEXICAL_COMPARISON_BASELINE.report_sha256, lanes: archivedLanes },
    recallAt5Archived: { path, sha256: createHash('sha256').update(raw).digest('hex'), report: JSON.parse(raw) },
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

function promotionAt5Lane(strategyId: string, overrides: Partial<{
  recallAnyAt5Hits: number;
  reportedRecallAnyAt5: number;
  evaluatedCount: number;
  recallAt5: number;
  recallAllAt5: number;
  ndcgAt10: number;
  mrrAny: number;
  retrievalP95Ms: number;
  sqliteBytesTotal: number;
  configIdentityValid: boolean;
  errorCount: number;
  networkCalls: number;
  modelCalls: number;
  llmCalls: number;
  provenanceValid: boolean;
}> = {}) {
  const evaluatedCount = overrides.evaluatedCount ?? 470;
  const recallAnyAt5Hits = overrides.recallAnyAt5Hits ?? 100;
  return {
    strategyId,
    recallAnyAt5Hits,
    recallAnyAt5: overrides.reportedRecallAnyAt5 ?? recallAnyAt5Hits / evaluatedCount,
    evaluatedCount,
    recallAt5: overrides.recallAt5 ?? 0.1,
    recallAllAt5: overrides.recallAllAt5 ?? 0.1,
    ndcgAt10: overrides.ndcgAt10 ?? 0.1,
    mrrAny: overrides.mrrAny ?? 0.8,
    retrievalP95Ms: overrides.retrievalP95Ms ?? 10,
    sqliteBytesTotal: overrides.sqliteBytesTotal ?? 100,
    configIdentityValid: overrides.configIdentityValid ?? true,
    errorCount: overrides.errorCount ?? 0,
    networkCalls: overrides.networkCalls ?? 0,
    modelCalls: overrides.modelCalls ?? 0,
    llmCalls: overrides.llmCalls ?? 0,
    provenanceValid: overrides.provenanceValid ?? true,
  };
}
