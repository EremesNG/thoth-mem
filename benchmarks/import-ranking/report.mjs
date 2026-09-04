import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HASH = /^[a-f0-9]{64}$/u;
const STABLE_STRATEGY_ID = 'strict-selected-any-cap5-stable-v1';
const STABLE_CONFIG_HASH = 'b3a5b51c95b8aa79a677b8756e7a7bac0dc6aaad84403446ea1a68f14864fa04';

function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
}

function percentile95(samples) {
  if (samples.length === 0) return Number.NaN;
  return [...samples].sort((left, right) => left - right)[Math.ceil(samples.length * 0.95) - 1];
}

function finiteSamples(value, count) {
  return Array.isArray(value) && value.length === count && value.every((sample) => Number.isFinite(sample) && sample >= 0);
}

function rankings(value, probeCount, topK) {
  return Array.isArray(value) && value.length === probeCount
    && value.every((ranking) => Array.isArray(ranking) && ranking.length === topK && ranking.every((id) => typeof id === 'string' && id.length > 0));
}

function inversionCount(control, candidate) {
  let inversions = 0;
  for (let probe = 0; probe < control.length; probe++) {
    const candidatePositions = new Map(candidate[probe].map((id, index) => [id, index]));
    for (let left = 0; left < control[probe].length; left++) {
      for (let right = left + 1; right < control[probe].length; right++) {
        const leftPosition = candidatePositions.get(control[probe][left]);
        const rightPosition = candidatePositions.get(control[probe][right]);
        if (leftPosition !== undefined && rightPosition !== undefined && leftPosition > rightPosition) inversions++;
      }
    }
  }
  return inversions;
}

function diagnosticsValid(value, expectedCalls) {
  const diagnostics = record(value);
  return diagnostics !== null
    && diagnostics.recall_calls === expectedCalls
    && ['ranked_fts_rows', 'fused_lexical_rows', 'hydrated_memory_rows'].every((key) => Number.isSafeInteger(diagnostics[key]) && diagnostics[key] >= 0);
}

export function validateImportRankingReport(value) {
  const errors = [];
  const report = record(value);
  if (!report || report.schema !== 'thoth-mem.import-ranking-report.v1') return { valid: false, errors: ['schema'] };
  const strategy = record(report.strategy);
  if (!strategy || strategy.id !== STABLE_STRATEGY_ID || strategy.config_hash !== STABLE_CONFIG_HASH || !HASH.test(strategy.plan_manifest_hash)) errors.push('strategy_identity');
  const conditions = record(report.conditions);
  const conditionsValid = conditions?.warmups === 10 && conditions.samples === 100 && conditions.probe_count === 17
    && Number.isSafeInteger(conditions.imported_memory_count) && conditions.imported_memory_count >= 1_000 && conditions.top_k === 5;
  if (!conditionsValid) errors.push('conditions');
  const sampleCount = conditionsValid ? conditions.samples : 100;
  const probeCount = conditionsValid ? conditions.probe_count : 17;
  const topK = conditionsValid ? conditions.top_k : 5;
  const control = record(report.control);
  const candidate = record(report.candidate);
  if (!control || !candidate || control.strategy_id !== 'strict-selected-any-cap5-rrf-v1' || candidate.strategy_id !== STABLE_STRATEGY_ID
    || !HASH.test(control.input_hash ?? '') || control.input_hash !== candidate.input_hash) errors.push('paired_input_identity');
  const controlLatency = record(control?.latency_ms);
  const candidateLatency = record(candidate?.latency_ms);
  if (!finiteSamples(controlLatency?.samples, sampleCount)) errors.push('control_sample_count');
  if (!finiteSamples(candidateLatency?.samples, sampleCount)) errors.push('candidate_sample_count');
  if (finiteSamples(controlLatency?.samples, sampleCount) && controlLatency.p95 !== percentile95(controlLatency.samples)) errors.push('control_p95');
  if (finiteSamples(candidateLatency?.samples, sampleCount) && candidateLatency.p95 !== percentile95(candidateLatency.samples)) errors.push('candidate_p95');
  const stability = record(report.stability);
  const controlRankingsValid = rankings(stability?.before_rankings, probeCount, topK);
  const candidateRankingsValid = rankings(stability?.after_rankings, probeCount, topK);
  if (!controlRankingsValid || !candidateRankingsValid) errors.push('rankings');
  const exactTopKCount = controlRankingsValid && candidateRankingsValid
    ? stability.before_rankings.filter((ranking, index) => JSON.stringify(ranking) === JSON.stringify(stability.after_rankings[index])).length
    : 0;
  const pairwiseInversions = controlRankingsValid && candidateRankingsValid ? inversionCount(stability.before_rankings, stability.after_rankings) : -1;
  if (!stability || stability.exact_top_k_count !== exactTopKCount || exactTopKCount !== probeCount) errors.push('exact_top_k_count');
  if (!stability || stability.pairwise_inversions !== pairwiseInversions || pairwiseInversions !== 0) errors.push('pairwise_inversions');
  const expectedCalls = sampleCount * probeCount;
  if (!diagnosticsValid(control?.diagnostics, expectedCalls) || !diagnosticsValid(candidate?.diagnostics, expectedCalls)) errors.push('diagnostics');
  if (finiteSamples(controlLatency?.samples, sampleCount) && finiteSamples(candidateLatency?.samples, sampleCount)) {
    const controlP95 = percentile95(controlLatency.samples);
    const candidateP95 = percentile95(candidateLatency.samples);
    const ratio = controlP95 === 0 ? (candidateP95 === 0 ? 1 : Number.POSITIVE_INFINITY) : candidateP95 / controlP95;
    const performance = record(report.performance);
    if (!performance || Math.abs(performance.candidate_to_control_p95_ratio - ratio) > 1e-12 || performance.maximum_ratio !== 2) errors.push('performance_ratio');
    if (!performance || performance.passed !== (ratio <= 2) || ratio > 2) errors.push('performance_gate');
  }
  const calls = record(report.calls);
  if (!calls || calls.network !== 0 || calls.model !== 0 || calls.llm !== 0) errors.push('external_calls');
  const output = record(report.output);
  if (!output || output.mode !== 'create-only' || typeof output.path !== 'string' || output.path.length === 0) errors.push('create_only_output');
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

export function writeImportRankingReport(value, outputPath) {
  const path = resolve(outputPath);
  const report = { ...value, output: { mode: 'create-only', path } };
  const validation = validateImportRankingReport(report);
  if (!validation.valid) throw new Error(`Import ranking report validation failed: ${validation.errors.join(',')} (${JSON.stringify(report.performance)})`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return report;
}

export { percentile95 };
