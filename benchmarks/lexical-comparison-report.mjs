import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { percentile, validateRetrievalReport } from './retrieval-report.mjs';

export const LEXICAL_COMPARISON_STRATEGY_IDS = Object.freeze(['all-prefix-v1', 'any-prefix-v1', 'all-then-any-prefix-v1']);
export const LEXICAL_RECALL_AT_5_STRATEGY_IDS = Object.freeze([...LEXICAL_COMPARISON_STRATEGY_IDS, 'strict-selected-any-cap5-rrf-v1']);
export const LEXICAL_COMPARISON_BASELINE = Object.freeze(JSON.parse(readFileSync(new URL('./lexical-comparison-baseline.json', import.meta.url), 'utf8')));
export const LEXICAL_RECALL_AT_5_BASELINE = Object.freeze(JSON.parse(readFileSync(new URL('./lexical-recall-at-5-baseline.json', import.meta.url), 'utf8')));

const HASH = /^[a-f0-9]{64}$/u;
const STAGE_KINDS = Object.freeze(['exact', 'strict', 'relaxed', 'post_query']);
const WORK_KEYS = Object.freeze([
  'ranked_fts_rows', 'hydrated_memory_rows', 'hydrated_evidence_links',
  'memory_hydration_statements', 'evidence_hydration_statements', 'snippet_token_checks',
  'returned_rows', 'source_utf16_code_units', 'evidence_utf16_code_units', 'returned_utf16_code_units',
]);
const STRATEGY_CAPS_BY_CONFIG_HASH = Object.freeze({
  'all-prefix-v1': Object.freeze({ e792c3009bbab297d654684da8b4ad1b6463277716aed860f765f9dbc38714e6: null }),
  'any-prefix-v1': Object.freeze({
    d85dfebda68b2508f244048a27960947e4074c4b8350ed3e402ca994eda139ec: 10,
    d30879b9d3b56515e08ffdc13b795179fd54727b55143182888b1be7ed1f265f: 5,
    '810f9bad33b6c1689d3d8182752342c0300e4e44fd9fd1a30edde5b633d0c89c': 2,
    d31ca3f7d1a0fd6662af2148cd51d1f3149b681012f8f756629d6bdd67aeb553: 2,
  }),
  'all-then-any-prefix-v1': Object.freeze({ '40cd3522257085172694037746cc7cd720ded68f65c5d6bae1f514cf273eb443': null }),
  'strict-selected-any-cap5-rrf-v1': Object.freeze({ '5ba29df9811fbf3f5bc7d770738b961cc4ea7dd933f424f77ff1414dd39e17d9': 5 }),
});

function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function exactKeys(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function nonnegative(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function nonnegativeInteger(value) { return Number.isInteger(value) && value >= 0; }
function expectedStrategyCap(id, configHash) { return STRATEGY_CAPS_BY_CONFIG_HASH[id]?.[configHash]; }

function recallAt5Quality(report) {
  return {
    config_hash: report.candidate.config.lexical_strategy.config_hash,
    recall_any_at_5: report.metrics.ranking.overall.recall_any_at_5,
    recall_at_5: report.metrics.ranking.overall.recall_at_5,
    recall_all_at_5: report.metrics.ranking.overall.recall_all_at_5,
    ndcg_at_10: report.metrics.ranking.overall.ndcg_at_10,
    mrr_any: report.metrics.ranking.overall.mrr_any,
    sqlite_bytes_total: report.metrics.resources.sqlite_bytes.total,
  };
}

export function validateLexicalRecallAt5Baseline(baseline, reference) {
  const errors = [];
  if (!exactKeys(baseline, ['schema', 'report', 'quality_baseline']) || baseline?.schema !== 'thoth-mem.lexical-recall-at-5-baseline.v1') errors.push('schema');
  const expectedReport = {
    path: 'benchmarks/results/longmemeval-s-lexical-latency-report-r4.json',
    schema: 'thoth-mem.lexical-comparison-report.v2',
    sha256: '842805cc423cc48d33cf07b05e73c25967f532b79e24131b44407d87b1e6fe36',
  };
  if (!exactKeys(baseline?.report, Object.keys(expectedReport))
    || JSON.stringify(baseline.report) !== JSON.stringify(expectedReport)
    || !exactKeys(reference, ['path', 'sha256', 'report'])
    || reference.path !== expectedReport.path
    || reference.sha256 !== expectedReport.sha256
    || reference.report?.schema !== expectedReport.schema) errors.push('report_reference');
  const quality = baseline?.quality_baseline;
  if (!exactKeys(quality, LEXICAL_COMPARISON_STRATEGY_IDS)) errors.push('quality_baseline');
  else {
    for (const id of LEXICAL_COMPARISON_STRATEGY_IDS) {
      const lane = reference?.report?.lanes?.[id];
      const expected = lane ? recallAt5Quality(lane) : null;
      if (!expected || lane.candidate.config.lexical_strategy.id !== id || !exactKeys(quality[id], Object.keys(expected)) || JSON.stringify(quality[id]) !== JSON.stringify(expected)) errors.push('quality_baseline');
    }
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

function sharedFrom(control) {
  return {
    source_sha256: control.dataset.source.sha256,
    corpus_hash: control.dataset.corpus_hash,
    query_hash: control.dataset.query_hash,
    evaluated_count: control.dataset.evaluated_count,
    query_order_hash: control.conditions.query_order_hash,
    candidate_k: control.conditions.candidate_k,
    candidate_payload_utf16_code_units: control.conditions.candidate_payload_utf16_code_units,
    delivery_utf16_code_units: control.conditions.delivery.utf16_code_units,
    provenance_hash: hash(control.provenance.mappings),
  };
}

function qualityBaseline(report) {
  return {
    recall_any_at_20: report.metrics.ranking.overall.recall_any_at_20,
    recall_at_20: report.metrics.ranking.overall.recall_at_20,
    ndcg_at_10: report.metrics.ranking.overall.ndcg_at_10,
    sqlite_bytes_total: report.metrics.resources.sqlite_bytes.total,
  };
}

function archivedReference(archived, lanes) {
  const quality = Object.fromEntries(LEXICAL_COMPARISON_STRATEGY_IDS.map((id) => [id, qualityBaseline(archived.lanes[id])]));
  return {
    sha256: archived.sha256,
    quality_baseline: quality,
    quality_deltas: Object.fromEntries(LEXICAL_COMPARISON_STRATEGY_IDS.slice(1).map((id) => {
      const current = qualityBaseline(lanes[id]);
      const baseline = quality[id];
      return [id, {
        recall_any_at_20: current.recall_any_at_20 - baseline.recall_any_at_20,
        recall_at_20: current.recall_at_20 - baseline.recall_at_20,
        ndcg_at_10: current.ndcg_at_10 - baseline.ndcg_at_10,
      }];
    })),
  };
}

function baseCandidateConfig(report) { const config = { ...report.candidate.config }; delete config.lexical_strategy; return config; }
function laneMatchesControl(lane, control) {
  return JSON.stringify(lane.dataset) === JSON.stringify(control.dataset)
    && JSON.stringify(lane.conditions) === JSON.stringify(control.conditions)
    && JSON.stringify(lane.provenance.mappings) === JSON.stringify(control.provenance.mappings)
    && JSON.stringify(baseCandidateConfig(lane)) === JSON.stringify(baseCandidateConfig(control));
}
function laneSetComplete(lanes) {
  if (!exactKeys(lanes, LEXICAL_COMPARISON_STRATEGY_IDS)) return false;
  const control = lanes['all-prefix-v1'];
  if (!control || !validateRetrievalReport(control).valid || control.errors.length !== 0) return false;
  return LEXICAL_COMPARISON_STRATEGY_IDS.every((id) => {
    const lane = lanes[id];
    return validateRetrievalReport(lane).valid && lane.candidate.config.lexical_strategy.id === id && laneMatchesControl(lane, control);
  });
}

function promotionLane(strategyId, report, archivedSqliteBytesTotal) {
  return {
    strategyId,
    recallAnyAt20: report.metrics.ranking.overall.recall_any_at_20,
    recallAnyAt20Hits: report.queries.reduce((sum, query) => sum + query.ranking.recall_any_at_20, 0),
    evaluatedCount: report.queries.length,
    ndcgAt10: report.metrics.ranking.overall.ndcg_at_10,
    recallAt20: report.metrics.ranking.overall.recall_at_20,
    retrievalP95Ms: report.metrics.resources.retrieval_latency_ms.p95,
    sqliteBytesTotal: report.metrics.resources.sqlite_bytes.total,
    archivedSqliteBytesTotal,
    errorCount: report.errors.length,
    networkCalls: report.metrics.resources.network_calls,
    modelCalls: report.metrics.resources.model_calls,
    llmCalls: report.metrics.resources.llm_calls,
    provenanceValid: report.provenance.coverage === 1 && validateRetrievalReport(report).valid,
  };
}

function hasRequiredCoverageGain(control, candidate) {
  if (!Number.isInteger(control.recallAnyAt20Hits) || !Number.isInteger(candidate.recallAnyAt20Hits) || !Number.isInteger(control.evaluatedCount) || !Number.isInteger(candidate.evaluatedCount) || control.evaluatedCount < 1 || candidate.evaluatedCount < 1) return false;
  const gainNumerator = (candidate.recallAnyAt20Hits * control.evaluatedCount) - (control.recallAnyAt20Hits * candidate.evaluatedCount);
  return gainNumerator * 20 >= control.evaluatedCount * candidate.evaluatedCount;
}

export function assessLexicalPromotion(input) {
  if (!input?.complete || !input.control || input.control.errorCount !== 0 || !Array.isArray(input.candidates)) return { decision: 'incomplete', selected_strategy: null, assessments: [], reasons: ['comparison_incomplete'] };
  const control = input.control;
  const assessments = input.candidates.map((candidate) => {
    const reasons = [];
    const coverageGain = candidate.recallAnyAt20 - control.recallAnyAt20;
    const ndcgDelta = candidate.ndcgAt10 - control.ndcgAt10;
    const recallDelta = candidate.recallAt20 - control.recallAt20;
    if (!hasRequiredCoverageGain(control, candidate)) reasons.push('coverage_gain_below_0_05');
    if (ndcgDelta < 0) reasons.push('ndcg_at_10_regression');
    if (recallDelta < 0) reasons.push('recall_at_20_regression');
    if ((control.retrievalP95Ms === 0 && candidate.retrievalP95Ms !== 0) || (control.retrievalP95Ms > 0 && candidate.retrievalP95Ms > control.retrievalP95Ms * 2)) reasons.push('retrieval_p95_above_2x_control');
    if (candidate.sqliteBytesTotal !== control.sqliteBytesTotal) reasons.push('sqlite_bytes_mismatch');
    if (nonnegative(candidate.archivedSqliteBytesTotal) && candidate.sqliteBytesTotal > candidate.archivedSqliteBytesTotal * 1.5) reasons.push('sqlite_bytes_above_1_5x_archived');
    if (candidate.errorCount !== 0) reasons.push('nonzero_errors');
    if (candidate.networkCalls !== 0 || candidate.modelCalls !== 0 || candidate.llmCalls !== 0) reasons.push('nonzero_calls');
    if (!candidate.provenanceValid) reasons.push('invalid_provenance');
    return {
      strategy_id: candidate.strategyId,
      eligible: reasons.length === 0,
      reasons,
      evidence: {
        recall_any_at_20_gain: coverageGain, ndcg_at_10_delta: ndcgDelta, recall_at_20_delta: recallDelta,
        control_retrieval_p95_ms: control.retrievalP95Ms, candidate_retrieval_p95_ms: candidate.retrievalP95Ms,
        control_sqlite_bytes_total: control.sqliteBytesTotal, candidate_sqlite_bytes_total: candidate.sqliteBytesTotal,
      },
    };
  });
  const eligible = assessments.filter((assessment) => assessment.eligible);
  if (eligible.length === 1) return { decision: 'promote', selected_strategy: eligible[0].strategy_id, assessments, reasons: ['unique_candidate_eligible'] };
  return { decision: 'retain_control', selected_strategy: null, assessments, reasons: [eligible.length === 0 ? 'no_candidate_eligible' : 'multiple_eligible_candidates'] };
}

export function assessRecallAt5Promotion(input) {
  if (!input?.complete || !input.control || !Array.isArray(input.references) || input.references.length !== 2 || !input.candidate) {
    return { decision: 'incomplete', selected_strategy: null, assessments: [], reasons: ['comparison_incomplete'] };
  }
  const { control, references, candidate } = input;
  const bestReference = {
    recallAt5: Math.max(...references.map((reference) => reference.recallAt5)),
    recallAllAt5: Math.max(...references.map((reference) => reference.recallAllAt5)),
    ndcgAt10: Math.max(...references.map((reference) => reference.ndcgAt10)),
  };
  const reasons = [];
  if (!Number.isInteger(candidate.recallAnyAt5Hits) || candidate.evaluatedCount !== 470 || candidate.recallAnyAt5Hits < 447) reasons.push('recall_any_at_5_below_447_of_470');
  if (candidate.recallAt5 < bestReference.recallAt5) reasons.push('recall_at_5_regression');
  if (candidate.recallAllAt5 < bestReference.recallAllAt5) reasons.push('recall_all_at_5_regression');
  if (candidate.ndcgAt10 < bestReference.ndcgAt10) reasons.push('ndcg_at_10_regression');
  if ((control.retrievalP95Ms === 0 && candidate.retrievalP95Ms !== 0) || (control.retrievalP95Ms > 0 && candidate.retrievalP95Ms > control.retrievalP95Ms * 2)) reasons.push('retrieval_p95_above_2x_control');
  if ([...references, candidate].some((lane) => lane.sqliteBytesTotal !== control.sqliteBytesTotal)) reasons.push('sqlite_bytes_mismatch');
  if (candidate.strategyId !== 'strict-selected-any-cap5-rrf-v1' || !candidate.configIdentityValid) reasons.push('config_identity_mismatch');
  if (candidate.errorCount !== 0) reasons.push('nonzero_errors');
  if (candidate.networkCalls !== 0 || candidate.modelCalls !== 0 || candidate.llmCalls !== 0) reasons.push('nonzero_calls');
  if (!candidate.provenanceValid) reasons.push('invalid_provenance');
  const assessment = {
    strategy_id: 'strict-selected-any-cap5-rrf-v1',
    eligible: reasons.length === 0,
    reasons,
    evidence: {
      recall_any_at_5_hits: candidate.recallAnyAt5Hits,
      evaluated_count: candidate.evaluatedCount,
      recall_any_at_5: candidate.recallAnyAt5Hits / candidate.evaluatedCount,
      candidate_recall_at_5: candidate.recallAt5,
      best_reference_recall_at_5: bestReference.recallAt5,
      candidate_recall_all_at_5: candidate.recallAllAt5,
      best_reference_recall_all_at_5: bestReference.recallAllAt5,
      candidate_ndcg_at_10: candidate.ndcgAt10,
      best_reference_ndcg_at_10: bestReference.ndcgAt10,
      candidate_mrr_any: candidate.mrrAny,
      control_retrieval_p95_ms: control.retrievalP95Ms,
      candidate_retrieval_p95_ms: candidate.retrievalP95Ms,
      sqlite_bytes_total: candidate.sqliteBytesTotal,
      config_identity_valid: candidate.configIdentityValid,
    },
  };
  return assessment.eligible
    ? { decision: 'promote', selected_strategy: 'strict-selected-any-cap5-rrf-v1', assessments: [assessment], reasons: ['unique_candidate_eligible'] }
    : { decision: 'retain_default', selected_strategy: null, assessments: [assessment], reasons: ['no_candidate_eligible'] };
}

function recallAt5PromotionLane(strategyId, report) {
  return {
    strategyId,
    recallAnyAt5Hits: report.queries.reduce((sum, query) => sum + query.ranking.recall_any_at_5, 0),
    recallAnyAt5: report.metrics.ranking.overall.recall_any_at_5,
    evaluatedCount: report.queries.length,
    recallAt5: report.metrics.ranking.overall.recall_at_5,
    recallAllAt5: report.metrics.ranking.overall.recall_all_at_5,
    ndcgAt10: report.metrics.ranking.overall.ndcg_at_10,
    mrrAny: report.metrics.ranking.overall.mrr_any,
    retrievalP95Ms: report.metrics.resources.retrieval_latency_ms.p95,
    sqliteBytesTotal: report.metrics.resources.sqlite_bytes.total,
    configIdentityValid: expectedStrategyCap(strategyId, report.candidate.config.lexical_strategy.config_hash) !== undefined,
    errorCount: report.errors.length,
    networkCalls: report.metrics.resources.network_calls,
    modelCalls: report.metrics.resources.model_calls,
    llmCalls: report.metrics.resources.llm_calls,
    provenanceValid: report.provenance.coverage === 1 && validateRetrievalReport(report).valid,
  };
}

function assessRecallAt5ReportPromotion(lanes) {
  if (!exactKeys(lanes, LEXICAL_RECALL_AT_5_STRATEGY_IDS)) return assessRecallAt5Promotion({ complete: false });
  const laneValues = LEXICAL_RECALL_AT_5_STRATEGY_IDS.map((id) => lanes[id]);
  if (laneValues.some((lane) => !lane || !validateRetrievalReport(lane).valid)) return assessRecallAt5Promotion({ complete: false });
  const [control, currentDefault, broadReference, e0] = LEXICAL_RECALL_AT_5_STRATEGY_IDS.map((id) => recallAt5PromotionLane(id, lanes[id]));
  const errorCount = laneValues.reduce((sum, lane) => sum + lane.errors.length, 0);
  const networkCalls = laneValues.reduce((sum, lane) => sum + lane.metrics.resources.network_calls, 0);
  const modelCalls = laneValues.reduce((sum, lane) => sum + lane.metrics.resources.model_calls, 0);
  const llmCalls = laneValues.reduce((sum, lane) => sum + lane.metrics.resources.llm_calls, 0);
  const provenanceValid = laneValues.every((lane) => lane.provenance.coverage === 1 && validateRetrievalReport(lane).valid);
  return assessRecallAt5Promotion({
    complete: true,
    control,
    references: [currentDefault, broadReference],
    candidate: { ...e0, errorCount, networkCalls, modelCalls, llmCalls, provenanceValid },
  });
}

function assessReportPromotion(lanes, archivedQuality) {
  if (!laneSetComplete(lanes)) return assessLexicalPromotion({ complete: false });
  return assessLexicalPromotion({
    complete: true,
    control: promotionLane('all-prefix-v1', lanes['all-prefix-v1'], archivedQuality?.['all-prefix-v1']?.sqlite_bytes_total),
    candidates: [
      promotionLane('any-prefix-v1', lanes['any-prefix-v1'], archivedQuality?.['any-prefix-v1']?.sqlite_bytes_total),
      promotionLane('all-then-any-prefix-v1', lanes['all-then-any-prefix-v1'], archivedQuality?.['all-then-any-prefix-v1']?.sqlite_bytes_total),
    ],
  });
}

function sampleSummary(samples) { return { p50: percentile(samples, 50), p95: percentile(samples, 95), samples }; }
export function aggregateLexicalDiagnostics(queries) {
  const stageSamples = Object.fromEntries(STAGE_KINDS.map((kind) => [kind, queries.map((query) => query.stages.find((stage) => stage.kind === kind)?.elapsed_ms ?? 0)]));
  return {
    total_elapsed_ms: sampleSummary(queries.map((query) => query.total_elapsed_ms)),
    stage_elapsed_ms: Object.fromEntries(Object.entries(stageSamples).map(([kind, samples]) => [kind, sampleSummary(samples)])),
    work: Object.fromEntries(WORK_KEYS.map((key) => [key, queries.reduce((sum, query) => sum + query.work[key], 0)])),
  };
}

function aggregateLexicalDiagnosticsV3(queries) {
  const aggregate = aggregateLexicalDiagnostics(queries);
  const withP99 = (summary) => ({ p50: summary.p50, p95: summary.p95, p99: percentile(summary.samples, 99), samples: summary.samples });
  aggregate.total_elapsed_ms = withP99(aggregate.total_elapsed_ms);
  aggregate.stage_elapsed_ms = Object.fromEntries(Object.entries(aggregate.stage_elapsed_ms).map(([kind, summary]) => [kind, withP99(summary)]));
  aggregate.work.fused_lexical_rows = queries.reduce((sum, query) => sum + query.work.fused_lexical_rows, 0);
  return aggregate;
}

function diagnosticStagePlanValid(stages, id, requestedLimit) {
  const [exact, strict, relaxed, postQuery] = stages;
  if (!exact.executed || !postQuery.executed) return false;
  const limitSatisfied = (stage) => !stage.executed && stage.reason === 'limit_satisfied' && exact.rows + strict.rows >= requestedLimit;
  if (id === 'all-prefix-v1') return (strict.executed || limitSatisfied(strict)) && !relaxed.executed && relaxed.reason === 'not_planned';
  if (id === 'any-prefix-v1') return !strict.executed && strict.reason === 'not_planned' && (relaxed.executed || limitSatisfied(relaxed));
  return (strict.executed || limitSatisfied(strict))
    && (relaxed.executed || relaxed.reason === 'not_planned' || limitSatisfied(relaxed));
}

function diagnosticQueryValid(diagnostic, laneQuery, lane, id, version = 2) {
  if (!exactKeys(diagnostic, ['question_id', 'strategy_id', 'config_hash', 'plan_hash', 'total_elapsed_ms', 'stages', 'work', 'result'])) return false;
  if (diagnostic.question_id !== laneQuery.question_id || diagnostic.strategy_id !== id || diagnostic.config_hash !== lane.candidate.config.lexical_strategy.config_hash || diagnostic.plan_hash !== laneQuery.query_plan_hash || !nonnegative(diagnostic.total_elapsed_ms)) return false;
  if (!Array.isArray(diagnostic.stages) || diagnostic.stages.length !== STAGE_KINDS.length) return false;
  for (let index = 0; index < STAGE_KINDS.length; index += 1) {
    const stage = diagnostic.stages[index];
    if (!exactKeys(stage, stage.executed ? ['kind', 'executed', 'elapsed_ms', 'rows'] : ['kind', 'executed', 'elapsed_ms', 'rows', 'reason']) || stage.kind !== STAGE_KINDS[index] || typeof stage.executed !== 'boolean' || !nonnegative(stage.elapsed_ms) || !nonnegativeInteger(stage.rows)) return false;
    if (!stage.executed && (stage.elapsed_ms !== 0 || stage.rows !== 0 || !['not_planned', 'limit_satisfied', 'empty_query', 'project_not_found'].includes(stage.reason))) return false;
  }
  if (diagnostic.stages.reduce((sum, stage) => sum + stage.elapsed_ms, 0) > diagnostic.total_elapsed_ms + 0.001) return false;
  const workKeys = version === 3 ? [...WORK_KEYS, 'fused_lexical_rows'] : WORK_KEYS;
  if (!exactKeys(diagnostic.work, workKeys) || workKeys.some((key) => !nonnegativeInteger(diagnostic.work[key]))) return false;
  const expectedCap = expectedStrategyCap(id, lane.candidate.config.lexical_strategy.config_hash);
  if (expectedCap === undefined || !exactKeys(diagnostic.result, ['requested_limit', 'max_lexical_results', 'returned_count', 'budget']) || diagnostic.result.requested_limit !== lane.conditions.candidate_k || diagnostic.result.max_lexical_results !== expectedCap || diagnostic.result.returned_count !== laneQuery.ranked_source_ids.length) return false;
  if (!diagnosticStagePlanValid(diagnostic.stages, id, diagnostic.result.requested_limit)) return false;
  const budget = diagnostic.result.budget;
  if (!exactKeys(budget, ['requested_utf16_code_units', 'source_utf16_code_units', 'evidence_utf16_code_units', 'returned_utf16_code_units']) || budget.requested_utf16_code_units !== laneQuery.ranking_budget.requested_utf16_code_units || budget.source_utf16_code_units !== laneQuery.ranking_budget.source_utf16_code_units || budget.evidence_utf16_code_units !== laneQuery.ranking_budget.evidence_utf16_code_units || budget.returned_utf16_code_units !== laneQuery.ranking_budget.returned_utf16_code_units) return false;
  const stageRows = Object.fromEntries(diagnostic.stages.map((stage) => [stage.kind, stage.rows]));
  const lexicalRows = stageRows.strict + stageRows.relaxed;
  const hydrationStatements = stageRows.post_query > 0 ? 1 : 0;
  const fusedLexicalRows = version === 3 ? diagnostic.work.fused_lexical_rows : lexicalRows;
  return stageRows.exact === 0
    && stageRows.post_query === fusedLexicalRows
    && stageRows.post_query <= diagnostic.result.requested_limit
    && diagnostic.result.returned_count === stageRows.post_query
    && (expectedCap === null || fusedLexicalRows <= expectedCap)
    && diagnostic.work.ranked_fts_rows === (version === 3 ? lexicalRows : stageRows.post_query)
    && diagnostic.work.hydrated_memory_rows === stageRows.post_query
    && diagnostic.work.hydrated_evidence_links === diagnostic.work.hydrated_memory_rows
    && diagnostic.work.memory_hydration_statements === hydrationStatements
    && diagnostic.work.evidence_hydration_statements === hydrationStatements
    && diagnostic.work.returned_rows === diagnostic.result.returned_count
    && diagnostic.work.source_utf16_code_units === budget.source_utf16_code_units
    && diagnostic.work.evidence_utf16_code_units === budget.evidence_utf16_code_units
    && diagnostic.work.returned_utf16_code_units === budget.returned_utf16_code_units;
}

function diagnosticLaneValid(diagnostic, lane, id, version = 2) {
  const expectedCap = expectedStrategyCap(id, lane.candidate.config.lexical_strategy.config_hash);
  if (expectedCap === undefined || !exactKeys(diagnostic, ['strategy_id', 'config_hash', 'max_lexical_results', 'queries', 'aggregate']) || diagnostic.strategy_id !== id || diagnostic.config_hash !== lane.candidate.config.lexical_strategy.config_hash || diagnostic.max_lexical_results !== expectedCap || !Array.isArray(diagnostic.queries) || diagnostic.queries.length !== lane.queries.length) return false;
  if (diagnostic.queries.some((query, index) => !diagnosticQueryValid(query, lane.queries[index], lane, id, version))) return false;
  const expectedAggregate = version === 3 ? aggregateLexicalDiagnosticsV3(diagnostic.queries) : aggregateLexicalDiagnostics(diagnostic.queries);
  return JSON.stringify(diagnostic.aggregate) === JSON.stringify(expectedAggregate);
}

function v3Diagnostics(diagnostics) {
  const ordered = structuredClone(Object.fromEntries(LEXICAL_RECALL_AT_5_STRATEGY_IDS.map((id) => [id, diagnostics[id]])));
  for (const diagnostic of Object.values(ordered)) {
    for (const query of diagnostic.queries) {
      const exactRows = query.stages.find((stage) => stage.kind === 'exact')?.rows ?? 0;
      const postRows = query.stages.find((stage) => stage.kind === 'post_query')?.rows ?? 0;
      query.work.fused_lexical_rows = postRows - exactRows;
    }
    diagnostic.aggregate = aggregateLexicalDiagnosticsV3(diagnostic.queries);
  }
  return ordered;
}

function v2Diagnostics(diagnostics) {
  const ordered = structuredClone(Object.fromEntries(LEXICAL_COMPARISON_STRATEGY_IDS.map((id) => [id, diagnostics[id]])));
  for (const diagnostic of Object.values(ordered)) {
    for (const query of diagnostic.queries) delete query.work.fused_lexical_rows;
    delete diagnostic.aggregate.work.fused_lexical_rows;
  }
  return ordered;
}

function recallAt5Reference(reference) {
  return {
    path: reference.path,
    schema: reference.report?.schema,
    sha256: reference.sha256,
    quality_baseline: Object.fromEntries(LEXICAL_COMPARISON_STRATEGY_IDS.map((id) => [id, recallAt5Quality(reference.report.lanes[id])])),
  };
}

function recallAt5ReferenceValid(reference) {
  return exactKeys(reference, ['path', 'schema', 'sha256', 'quality_baseline'])
    && reference.path === LEXICAL_RECALL_AT_5_BASELINE.report.path
    && reference.schema === LEXICAL_RECALL_AT_5_BASELINE.report.schema
    && reference.sha256 === LEXICAL_RECALL_AT_5_BASELINE.report.sha256
    && JSON.stringify(reference.quality_baseline) === JSON.stringify(LEXICAL_RECALL_AT_5_BASELINE.quality_baseline);
}

function e0Candidate(lanes) {
  return {
    strategy_id: 'strict-selected-any-cap5-rrf-v1',
    config_hash: lanes['strict-selected-any-cap5-rrf-v1'].candidate.config.lexical_strategy.config_hash,
    max_stage_results: 5,
    max_lexical_results: 5,
    fusion: { kind: 'rrf-v1', rank_constant: 60, weights: { strict: 1, relaxed: 1 } },
  };
}

function e0CandidateValid(candidate, lanes) {
  const expected = e0Candidate(lanes);
  return exactKeys(candidate, Object.keys(expected)) && JSON.stringify(candidate) === JSON.stringify(expected);
}

function archivedReferenceValid(reference, lanes) {
  if (!exactKeys(lanes, LEXICAL_COMPARISON_STRATEGY_IDS) || !exactKeys(reference, ['sha256', 'quality_baseline', 'quality_deltas']) || !HASH.test(reference.sha256) || !exactKeys(reference.quality_baseline, LEXICAL_COMPARISON_STRATEGY_IDS) || !exactKeys(reference.quality_deltas, LEXICAL_COMPARISON_STRATEGY_IDS.slice(1))) return false;
  for (const id of LEXICAL_COMPARISON_STRATEGY_IDS) {
    const baseline = reference.quality_baseline[id];
    if (!exactKeys(baseline, ['recall_any_at_20', 'recall_at_20', 'ndcg_at_10', 'sqlite_bytes_total']) || !nonnegative(baseline.recall_any_at_20) || !nonnegative(baseline.recall_at_20) || !nonnegative(baseline.ndcg_at_10) || !nonnegativeInteger(baseline.sqlite_bytes_total)) return false;
  }
  if (LEXICAL_COMPARISON_BASELINE.schema !== 'thoth-mem.lexical-comparison-baseline.v1'
    || reference.sha256 !== LEXICAL_COMPARISON_BASELINE.report_sha256
    || JSON.stringify(reference.quality_baseline) !== JSON.stringify(LEXICAL_COMPARISON_BASELINE.quality_baseline)) return false;
  for (const id of LEXICAL_COMPARISON_STRATEGY_IDS.slice(1)) {
    const current = qualityBaseline(lanes[id]);
    const baseline = reference.quality_baseline[id];
    const expected = { recall_any_at_20: current.recall_any_at_20 - baseline.recall_any_at_20, recall_at_20: current.recall_at_20 - baseline.recall_at_20, ndcg_at_10: current.ndcg_at_10 - baseline.ndcg_at_10 };
    if (JSON.stringify(reference.quality_deltas[id]) !== JSON.stringify(expected)) return false;
  }
  return true;
}

export function createLexicalComparisonReport(lanes, options) {
  if (exactKeys(lanes, LEXICAL_RECALL_AT_5_STRATEGY_IDS) && options.recallAt5Archived) {
    const orderedLanes = Object.fromEntries(LEXICAL_RECALL_AT_5_STRATEGY_IDS.map((id) => [id, lanes[id]]));
    const legacyLanes = Object.fromEntries(LEXICAL_COMPARISON_STRATEGY_IDS.map((id) => [id, orderedLanes[id]]));
    const archived = archivedReference(options.archived, legacyLanes);
    return {
      schema: 'thoth-mem.lexical-comparison-report.v3', created_at: options.createdAt ?? new Date().toISOString(), shared: sharedFrom(orderedLanes['all-prefix-v1']),
      archived_reference: archived, recall_at_5_reference: recallAt5Reference(options.recallAt5Archived), candidate: e0Candidate(orderedLanes),
      diagnostics: v3Diagnostics(options.diagnostics), lanes: orderedLanes,
      promotion: assessRecallAt5ReportPromotion(orderedLanes),
    };
  }
  const orderedLanes = Object.fromEntries(LEXICAL_COMPARISON_STRATEGY_IDS.map((id) => [id, lanes[id]]));
  const orderedDiagnostics = v2Diagnostics(options.diagnostics);
  const control = orderedLanes['all-prefix-v1'];
  const archived = archivedReference(options.archived, orderedLanes);
  return {
    schema: 'thoth-mem.lexical-comparison-report.v2', created_at: options.createdAt ?? new Date().toISOString(), shared: control ? sharedFrom(control) : null,
    archived_reference: archived, diagnostics: orderedDiagnostics, lanes: orderedLanes,
    promotion: assessReportPromotion(orderedLanes, archived.quality_baseline),
  };
}

export function validateLexicalComparisonReport(report) {
  if (report?.schema === 'thoth-mem.lexical-comparison-report.v3') return validateLexicalRecallAt5Report(report);
  const errors = [];
  if (!exactKeys(report, ['schema', 'created_at', 'shared', 'archived_reference', 'diagnostics', 'lanes', 'promotion']) || report?.schema !== 'thoth-mem.lexical-comparison-report.v2') errors.push('schema');
  if (typeof report?.created_at !== 'string' || Number.isNaN(Date.parse(report.created_at))) errors.push('created_at');
  const lanes = report?.lanes;
  if (!exactKeys(lanes, LEXICAL_COMPARISON_STRATEGY_IDS)) errors.push('lane_inventory');
  const available = LEXICAL_COMPARISON_STRATEGY_IDS.map((id) => [id, lanes?.[id]]).filter((entry) => entry[1]);
  for (const [id, lane] of available) {
    if (!validateRetrievalReport(lane).valid) errors.push('lane_validity');
    if (lane?.candidate?.config?.lexical_strategy?.id !== id) errors.push('lane_identity');
  }
  const control = lanes?.['all-prefix-v1'];
  if (control) {
    const expectedShared = sharedFrom(control);
    if (!exactKeys(report?.shared, Object.keys(expectedShared)) || !HASH.test(report.shared.source_sha256) || !HASH.test(report.shared.corpus_hash) || !HASH.test(report.shared.query_hash) || !HASH.test(report.shared.query_order_hash) || !HASH.test(report.shared.provenance_hash) || JSON.stringify(report.shared) !== JSON.stringify(expectedShared)) errors.push('shared_identity');
    for (const [, lane] of available) if (!laneMatchesControl(lane, control)) errors.push('shared_identity');
  } else errors.push('shared_identity');
  if (!exactKeys(report?.diagnostics, LEXICAL_COMPARISON_STRATEGY_IDS) || available.some(([id, lane]) => !diagnosticLaneValid(report.diagnostics?.[id], lane, id))) errors.push('diagnostics');
  if (lanes && !archivedReferenceValid(report?.archived_reference, lanes)) errors.push('archived_reference');
  if (!exactKeys(report?.promotion, ['decision', 'selected_strategy', 'assessments', 'reasons']) || !['incomplete', 'retain_control', 'promote'].includes(report.promotion.decision) || (report.promotion.selected_strategy !== null && !LEXICAL_COMPARISON_STRATEGY_IDS.includes(report.promotion.selected_strategy)) || !Array.isArray(report.promotion.assessments) || !Array.isArray(report.promotion.reasons) || report.promotion.reasons.some((reason) => typeof reason !== 'string' || !reason)) errors.push('promotion');
  if (lanes && JSON.stringify(report?.promotion) !== JSON.stringify(assessReportPromotion(lanes, report?.archived_reference?.quality_baseline))) errors.push('promotion');
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

function validateLexicalRecallAt5Report(report) {
  const errors = [];
  const rootKeys = ['schema', 'created_at', 'shared', 'archived_reference', 'recall_at_5_reference', 'candidate', 'diagnostics', 'lanes', 'promotion'];
  if (!exactKeys(report, rootKeys)) errors.push('schema');
  if (typeof report?.created_at !== 'string' || Number.isNaN(Date.parse(report.created_at))) errors.push('created_at');
  const lanes = report?.lanes;
  if (!exactKeys(lanes, LEXICAL_RECALL_AT_5_STRATEGY_IDS)) errors.push('lane_inventory');
  const available = LEXICAL_RECALL_AT_5_STRATEGY_IDS.map((id) => [id, lanes?.[id]]).filter((entry) => entry[1]);
  for (const [id, lane] of available) {
    if (!validateRetrievalReport(lane).valid) errors.push('lane_validity');
    if (lane?.candidate?.config?.lexical_strategy?.id !== id) errors.push('lane_identity');
  }
  const control = lanes?.['all-prefix-v1'];
  if (control) {
    const expectedShared = sharedFrom(control);
    if (!exactKeys(report?.shared, Object.keys(expectedShared)) || JSON.stringify(report.shared) !== JSON.stringify(expectedShared)) errors.push('shared_identity');
    for (const [, lane] of available) if (!laneMatchesControl(lane, control)) errors.push('shared_identity');
  } else errors.push('shared_identity');
  if (!exactKeys(report?.diagnostics, LEXICAL_RECALL_AT_5_STRATEGY_IDS) || available.some(([id, lane]) => !diagnosticLaneValid(report.diagnostics?.[id], lane, id, 3))) errors.push('diagnostics');
  const legacyLanes = lanes ? Object.fromEntries(LEXICAL_COMPARISON_STRATEGY_IDS.map((id) => [id, lanes[id]])) : null;
  if (!legacyLanes || !archivedReferenceValid(report?.archived_reference, legacyLanes)) errors.push('archived_reference');
  if (!recallAt5ReferenceValid(report?.recall_at_5_reference)) errors.push('recall_at_5_reference');
  if (!lanes || !e0CandidateValid(report?.candidate, lanes)) errors.push('candidate');
  const expectedPromotion = lanes ? assessRecallAt5ReportPromotion(lanes) : assessRecallAt5Promotion({ complete: false });
  if (!exactKeys(report?.promotion, ['decision', 'selected_strategy', 'assessments', 'reasons']) || JSON.stringify(report.promotion) !== JSON.stringify(expectedPromotion)) errors.push('promotion');
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}
