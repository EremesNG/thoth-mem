const REQUIRED_RESOURCES = ['latency_p50_ms','latency_p95_ms','ingestion_ms','startup_ms','peak_memory_bytes','database_bytes','model_bytes','network_calls','llm_calls','injected_tokens','returned_chars','truncated_chars'];
const METRIC_NAMESPACES = {
  retrieval: new Set(['mrr', 'recall_at_1', 'recall_at_5', 'hit_at_k']),
  evidence: new Set(['recall', 'provenance_coverage']),
  answer: new Set(['exact_match', 'f1', 'judge_score']),
  agent: new Set(['hidden_test_success']),
};
const PRIMARY_NAMESPACES = new Set(['retrieval', 'answer', 'agent']);
const FALLBACK_STATES = new Map([
  ['disabled', 'disabled'], ['missing', 'missing'], ['stale', 'stale'],
  ['rebuilding', 'rebuilding'], ['failed', 'degraded'], ['source_mismatched', 'stale'],
]);
const RESOURCE_CEILING_REASONS = new Map([
  ['latency_p95_ms', 'latency_ceiling_exceeded'],
  ['peak_memory_bytes', 'memory_ceiling_exceeded'],
  ['database_bytes', 'database_ceiling_exceeded'],
  ['model_bytes', 'model_ceiling_exceeded'],
  ['network_calls', 'network_ceiling_exceeded'],
  ['llm_calls', 'llm_ceiling_exceeded'],
  ['injected_tokens', 'token_ceiling_exceeded'],
]);
const HASH = /^[a-f0-9]{64}$/;
const isNonNegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function percentile(samples, percentileValue) {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.ceil((percentileValue / 100) * ordered.length) - 1];
}

export function validateReport(report) {
  const errors = [];
  if (report?.schema !== 'thoth-mem.benchmark-report.v1') errors.push('schema');
  if (!report?.dataset?.name || !report?.dataset?.version || !report?.dataset?.license || !report?.dataset?.availability || !HASH.test(report?.dataset?.corpus_hash) || !HASH.test(report?.dataset?.query_hash)) errors.push('dataset_identity');
  if (!report?.candidate?.id || !HASH.test(report?.candidate?.config_hash) || !report?.candidate?.config || typeof report.candidate.config !== 'object') errors.push('candidate_identity');
  if (!HASH.test(report?.conditions?.run_config_hash) || !HASH.test(report?.conditions?.query_order_hash) || !report?.conditions?.reader?.id || !HASH.test(report?.conditions?.reader?.settings_hash) || !report?.conditions?.scorer?.id || !HASH.test(report?.conditions?.scorer?.settings_hash) || !Number.isInteger(report?.conditions?.seed) || !Number.isInteger(report?.conditions?.timeout_ms) || report.conditions.timeout_ms <= 0 || !Number.isInteger(report?.conditions?.retries) || report.conditions.retries < 0) errors.push('conditions');
  if (!report?.environment?.runtime || !report?.environment?.runtime_version || !report?.environment?.platform || !report?.environment?.arch) errors.push('environment');
  if (!report?.budgets || !Number.isInteger(report.budgets.candidate_k) || report.budgets.candidate_k <= 0 || !Number.isInteger(report.budgets.context_tokens) || report.budgets.context_tokens <= 0) errors.push('budgets');
  const primaryMetrics = report?.primary_metrics;
  const primaryKeys = new Set();
  const validPrimaryMetrics = Array.isArray(primaryMetrics) && primaryMetrics.length >= 3 && primaryMetrics.every((item) => {
    const allowed = METRIC_NAMESPACES[item?.namespace];
    const key = `${item?.namespace}.${item?.metric}`;
    const validGate = item?.gate === 'non_regression' ? item.threshold === undefined : item?.gate === 'relative_gain' && typeof item.threshold === 'number' && Number.isFinite(item.threshold) && item.threshold > 0;
    if (!PRIMARY_NAMESPACES.has(item?.namespace) || !allowed?.has(item?.metric) || !validGate || primaryKeys.has(key)) return false;
    primaryKeys.add(key); return true;
  }) && [...PRIMARY_NAMESPACES].every((namespace) => primaryMetrics.some((item) => item.namespace === namespace)) && primaryMetrics.filter((item) => item.gate === 'relative_gain').length === 1;
  if (!validPrimaryMetrics) errors.push('primary_metrics');
  const promotionGate = report?.promotion_gate;
  const resourceCeilings = promotionGate?.resource_ceilings;
  if (!isNonNegative(promotionGate?.provenance_coverage) || promotionGate.provenance_coverage > 1 || !resourceCeilings || Object.keys(resourceCeilings).length !== RESOURCE_CEILING_REASONS.size || [...RESOURCE_CEILING_REASONS.keys()].some((key) => typeof resourceCeilings[key] !== 'number' || !Number.isFinite(resourceCeilings[key]) || resourceCeilings[key] < 1)) errors.push('promotion_gate');
  if (!report?.metrics?.retrieval) errors.push('metric_namespace');
  for (const [namespace, allowed] of Object.entries(METRIC_NAMESPACES)) {
    const values = report?.metrics?.[namespace];
    if (values && Object.keys(values).some((key) => !allowed.has(key))) errors.push('metric_namespace');
    if (values && Object.values(values).some((value) => value !== null && (typeof value !== 'number' || !Number.isFinite(value)))) errors.push('metric_values');
  }
  for (const key of REQUIRED_RESOURCES) if (typeof report?.metrics?.resources?.[key] !== 'number' || !Number.isFinite(report.metrics.resources[key]) || report.metrics.resources[key] < 0) errors.push(`resources.${key}`);
  const samples = report?.metrics?.resources?.samples;
  const validSamples = Array.isArray(samples?.latency_ms) && samples.latency_ms.length >= 5 && samples.latency_ms.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0) && Array.isArray(samples?.memory_bytes) && samples.memory_bytes.length >= 5 && samples.memory_bytes.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  if (!validSamples) errors.push('resource_samples');
  else if (report.metrics.resources.latency_p50_ms !== percentile(samples.latency_ms, 50) || report.metrics.resources.latency_p95_ms !== percentile(samples.latency_ms, 95) || report.metrics.resources.peak_memory_bytes !== Math.max(...samples.memory_bytes)) errors.push('resource_summaries');
  const progressive = report?.metrics?.progressive; if (!progressive || ['compact_returned_chars','context_returned_chars','source_chars','evidence_chars','full_chars','truncated_chars','full_fetches','avoided_full_fetches','escalation_rate','compression_ratio'].some((key) => !isNonNegative(progressive[key])) || progressive.escalation_rate > 1 || progressive.compression_ratio > 1 || progressive.full_chars !== progressive.source_chars || progressive.truncated_chars !== Math.max(0, progressive.source_chars - progressive.compact_returned_chars)) errors.push('progressive');
  const compaction = report?.metrics?.compaction; if (!compaction || ['checkpoints','recoveries','recovery_success','delivered_sources'].some((key) => !Number.isInteger(compaction[key]) || compaction[key] < 0) || compaction.recovery_success > compaction.recoveries) errors.push('compaction');
  if (!isNonNegative(report?.provenance?.coverage) || report.provenance.coverage > 1 || !Array.isArray(report?.provenance?.source_ids) || report.provenance.source_ids.some((id) => typeof id !== 'string' || !id) || (report.provenance.coverage > 0 && report.provenance.source_ids.length === 0)) errors.push('provenance');
  const fallbackControls = report?.fallback_controls;
  const fallbackScenarios = new Set(Array.isArray(fallbackControls) ? fallbackControls.map((item) => item?.scenario) : []);
  if (!Array.isArray(fallbackControls) || fallbackControls.length !== FALLBACK_STATES.size || fallbackScenarios.size !== FALLBACK_STATES.size || [...FALLBACK_STATES.keys()].some((scenario) => !fallbackScenarios.has(scenario)) || fallbackControls.some((item) => item?.observed_state !== FALLBACK_STATES.get(item?.scenario) || !Number.isInteger(item?.control_lexical_hits) || item.control_lexical_hits < 0 || !Number.isInteger(item?.fallback_lexical_hits) || item.fallback_lexical_hits < 0 || !Array.isArray(item?.source_ids) || item.source_ids.some((id) => typeof id !== 'string' || !id))) errors.push('fallback_controls');
  if (Array.isArray(fallbackControls) && fallbackControls.some((item) => item?.control_lexical_hits > 0 && item?.fallback_lexical_hits === 0)) errors.push('fallback_lexical_control');
  const operationalErrors = report?.operational_errors;
  if (!Array.isArray(operationalErrors) || operationalErrors.length < 1 || operationalErrors.length > 32 || operationalErrors.some((item) => typeof item?.operation !== 'string' || !/^[a-z_]{3,64}$/.test(item.operation) || typeof item?.code !== 'string' || !/^[a-z_]{3,64}$/.test(item.code) || typeof item?.message !== 'string' || item.message.length < 1 || item.message.length > 200 || typeof item?.retryable !== 'boolean')) errors.push('operational_errors');
  if (!Array.isArray(report?.unavailable) || report.unavailable.some((item) => typeof item?.id !== 'string' || !/^[a-z0-9-]{3,64}$/.test(item.id) || !/^[a-z_]{3,64}$/.test(item.reason))) errors.push('unavailable');
  if (!['promoted','rejected','incomplete'].includes(report?.promotion?.decision) || !Array.isArray(report?.promotion?.reasons)) errors.push('promotion');
  return { valid: errors.length === 0, errors };
}

export function evaluatePromotion(control, candidate) {
  if (!validateReport(control).valid || !validateReport(candidate).valid) return { decision: 'incomplete', reasons: ['invalid_or_incomplete_report'] };
  const incomparable = [];
  if (control.dataset.corpus_hash !== candidate.dataset.corpus_hash) incomparable.push('corpus_mismatch');
  if (control.dataset.query_hash !== candidate.dataset.query_hash) incomparable.push('query_mismatch');
  if (control.conditions.query_order_hash !== candidate.conditions.query_order_hash) incomparable.push('query_order_mismatch');
  if (control.conditions.run_config_hash !== candidate.conditions.run_config_hash) incomparable.push('run_config_mismatch');
  if (JSON.stringify(control.conditions.reader) !== JSON.stringify(candidate.conditions.reader)) incomparable.push('reader_mismatch');
  if (JSON.stringify(control.conditions.scorer) !== JSON.stringify(candidate.conditions.scorer)) incomparable.push('scorer_mismatch');
  if (control.conditions.seed !== candidate.conditions.seed || control.conditions.timeout_ms !== candidate.conditions.timeout_ms || control.conditions.retries !== candidate.conditions.retries) incomparable.push('execution_condition_mismatch');
  if (control.budgets.candidate_k !== candidate.budgets.candidate_k || control.budgets.context_tokens !== candidate.budgets.context_tokens) incomparable.push('unequal_budget');
  if (JSON.stringify(control.primary_metrics) !== JSON.stringify(candidate.primary_metrics)) incomparable.push('primary_metric_mismatch');
  if (JSON.stringify(control.promotion_gate) !== JSON.stringify(candidate.promotion_gate)) incomparable.push('promotion_gate_mismatch');
  if (incomparable.length) return { decision: 'incomplete', reasons: incomparable };
  const primaryValues = control.primary_metrics.map((item) => ({ declaration: item, baseline: control.metrics[item.namespace]?.[item.metric], candidate: candidate.metrics[item.namespace]?.[item.metric] }));
  if (primaryValues.some(({ baseline, candidate: value }) => typeof baseline !== 'number' || !Number.isFinite(baseline) || typeof value !== 'number' || !Number.isFinite(value))) return { decision: 'incomplete', reasons: ['incomplete_primary_metrics'] };
  const reasons = [];
  for (const { declaration, baseline, candidate: quality } of primaryValues) {
    if (declaration.gate === 'relative_gain') {
      if (baseline <= 0 || quality <= 0 || (quality - baseline) / baseline < declaration.threshold) reasons.push('primary_quality_gain_below_threshold');
    } else if (quality < baseline) reasons.push(`${declaration.namespace}_${declaration.metric}_regression`);
  }
  if (reasons.some((reason) => reason.startsWith('retrieval_') && reason.endsWith('_regression'))) reasons.push('primary_quality_regression');
  if (candidate.provenance.coverage < candidate.promotion_gate.provenance_coverage || candidate.provenance.coverage < control.provenance.coverage) reasons.push('provenance_regression');
  for (const [metric, reason] of RESOURCE_CEILING_REASONS) {
    const overControl = candidate.metrics.resources[metric] > control.metrics.resources[metric] * candidate.promotion_gate.resource_ceilings[metric];
    const overBudget = metric === 'injected_tokens' && candidate.metrics.resources[metric] > control.budgets.context_tokens;
    if (overControl || overBudget) reasons.push(reason);
  }
  if (reasons.length) return { decision: 'rejected', reasons };
  return { decision: 'promoted', reasons: ['quality_and_resource_gate_passed'] };
}
