import { createHash } from 'node:crypto';

const K_VALUES = [1, 5, 10, 20];
const METRIC_KEYS = [...K_VALUES.flatMap((k) => [`recall_any_at_${k}`, `recall_at_${k}`, `recall_all_at_${k}`]), 'mrr_any', 'ndcg_at_10'];
const HASH = /^[a-f0-9]{64}$/u;
const REVISION = /^[a-f0-9]{40}$/u;

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function strings(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value)) throw new Error(`${label} must contain nonempty strings`);
  return [...values];
}

export function scoreRanking(rankedSourceIds, goldSourceIds, relevantOccurrenceCount) {
  const ranked = strings(rankedSourceIds, 'rankedSourceIds');
  const goldValues = strings(goldSourceIds, 'goldSourceIds');
  const gold = [...new Set(goldValues)];
  if (gold.length === 0) throw new Error('goldSourceIds must not be empty');
  if (gold.length !== goldValues.length) throw new Error('goldSourceIds must be unique');
  const occurrenceCount = relevantOccurrenceCount ?? gold.length;
  if (!Number.isInteger(occurrenceCount) || occurrenceCount < gold.length) throw new Error('relevantOccurrenceCount must cover every distinct gold source');
  const goldSet = new Set(gold);
  if (ranked.filter((id) => goldSet.has(id)).length > occurrenceCount) throw new Error('rankedSourceIds contain more relevant occurrences than the corpus');
  const result = {};
  for (const k of K_VALUES) {
    const hits = new Set(ranked.slice(0, k).filter((id) => goldSet.has(id))).size;
    result[`recall_any_at_${k}`] = hits > 0 ? 1 : 0;
    result[`recall_at_${k}`] = hits / gold.length;
    result[`recall_all_at_${k}`] = hits === gold.length ? 1 : 0;
  }
  const firstGoldIndex = ranked.findIndex((id) => goldSet.has(id));
  result.mrr_any = firstGoldIndex < 0 ? 0 : 1 / (firstGoldIndex + 1);
  let dcg = 0;
  for (let index = 0; index < Math.min(ranked.length, 10); index += 1) {
    if (goldSet.has(ranked[index])) dcg += 1 / Math.log2(index + 2);
  }
  let ideal = 0;
  for (let index = 0; index < Math.min(occurrenceCount, 10); index += 1) ideal += 1 / Math.log2(index + 2);
  result.ndcg_at_10 = dcg / ideal;
  return result;
}

function average(entries) {
  if (entries.length === 0) throw new Error('Cannot aggregate zero retrieval scores');
  const keys = Object.keys(entries[0]);
  return Object.fromEntries(keys.map((key) => [key, entries.reduce((sum, entry) => sum + entry[key], 0) / entries.length]));
}

export function aggregateScores(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('At least one scored question is required');
  const groups = new Map();
  for (const entry of entries) {
    if (typeof entry?.questionType !== 'string' || !entry.questionType || !entry.metrics) throw new Error('Each scored question requires questionType and metrics');
    const group = groups.get(entry.questionType) ?? [];
    group.push(entry.metrics);
    groups.set(entry.questionType, group);
  }
  return {
    overall: { count: entries.length, ...average(entries.map((entry) => entry.metrics)) },
    by_question_type: Object.fromEntries([...groups].map(([questionType, metrics]) => [questionType, { count: metrics.length, ...average(metrics) }])),
  };
}

export function percentile(samples, percentileValue) {
  if (!Array.isArray(samples) || samples.length === 0 || samples.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new Error('Percentile samples must be nonempty nonnegative numbers');
  if (typeof percentileValue !== 'number' || percentileValue <= 0 || percentileValue > 100) throw new Error('Percentile must be greater than zero and at most 100');
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.ceil((percentileValue / 100) * ordered.length) - 1];
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function nonnegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function uniqueNonemptyStrings(value, allowEmpty = true) {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.every((item) => typeof item === 'string' && item.length > 0)
    && new Set(value).size === value.length;
}

function validMetricSet(value) {
  return value && typeof value === 'object'
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...METRIC_KEYS].sort())
    && METRIC_KEYS.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1);
}

function validAggregate(value) {
  if (!exactKeys(value, [...METRIC_KEYS, 'count']) || !Number.isInteger(value.count) || value.count < 1) return false;
  const metrics = Object.fromEntries(METRIC_KEYS.map((key) => [key, value[key]]));
  return validMetricSet(metrics) && Object.keys(value).length === METRIC_KEYS.length + 1;
}

function validSummary(value) {
  if (!exactKeys(value, ['overall', 'by_question_type']) || !validAggregate(value.overall) || !value.by_question_type || typeof value.by_question_type !== 'object') return false;
  const groups = Object.values(value.by_question_type);
  return groups.length > 0 && groups.every(validAggregate) && groups.reduce((sum, group) => sum + group.count, 0) === value.overall.count;
}

function validSamples(value) {
  return exactKeys(value, ['p50', 'p95', 'samples'])
    && Array.isArray(value.samples) && value.samples.length > 0 && value.samples.every(nonnegative)
    && value.p50 === percentile(value.samples, 50) && value.p95 === percentile(value.samples, 95);
}

const BUDGET_KEYS = ['requested_utf16_code_units', 'returned_utf16_code_units', 'truncated_utf16_code_units', 'source_utf16_code_units', 'evidence_utf16_code_units', 'full_utf16_code_units', 'compression_ratio', 'token_basis'];

function validBudget(value, requested) {
  if (!exactKeys(value, BUDGET_KEYS) || value.requested_utf16_code_units !== requested
    || !Number.isInteger(value.returned_utf16_code_units) || value.returned_utf16_code_units < 0
    || !Number.isInteger(value.truncated_utf16_code_units) || value.truncated_utf16_code_units < 0
    || !Number.isInteger(value.source_utf16_code_units) || value.source_utf16_code_units < 0
    || !Number.isInteger(value.evidence_utf16_code_units) || value.evidence_utf16_code_units < 0
    || value.returned_utf16_code_units > value.source_utf16_code_units
    || value.truncated_utf16_code_units !== value.source_utf16_code_units - value.returned_utf16_code_units
    || value.full_utf16_code_units !== value.source_utf16_code_units
    || value.compression_ratio !== (value.source_utf16_code_units === 0 ? 1 : value.returned_utf16_code_units / value.source_utf16_code_units)
    || value.token_basis !== 'estimated_chars_div_4') return false;
  return true;
}

function containsForbiddenLabel(value) {
  if (Array.isArray(value)) return value.some(containsForbiddenLabel);
  if (!value || typeof value !== 'object') return false;
  const forbidden = new Set(['answer', 'answer_session_ids', 'has_answer', 'question']);
  return Object.entries(value).some(([key, child]) => forbidden.has(key) || containsForbiddenLabel(child));
}

export function validateRetrievalReport(report) {
  const errors = [];
  if (!exactKeys(report, ['schema', 'created_at', 'dataset', 'candidate', 'conditions', 'environment', 'metrics', 'provenance', 'queries', 'errors', 'promotion'])
    || report?.schema !== 'thoth-mem.retrieval-benchmark-report.v1') errors.push('schema');
  if (typeof report?.created_at !== 'string' || Number.isNaN(Date.parse(report.created_at))) errors.push('created_at');

  const dataset = report?.dataset;
  const source = dataset?.source;
  if (!exactKeys(dataset, ['name', 'source', 'corpus_hash', 'query_hash', 'record_count', 'evaluated_count', 'exclusions'])
    || typeof dataset.name !== 'string' || !dataset.name || !exactKeys(source, ['dataset', 'filename', 'revision', 'sha256', 'bytes', 'license'])
    || typeof source.dataset !== 'string' || !source.dataset
    || typeof source.filename !== 'string' || !source.filename
    || !REVISION.test(source.revision) || !HASH.test(source.sha256)
    || !Number.isInteger(source.bytes) || source.bytes < 1 || typeof source.license !== 'string' || !source.license
    || !HASH.test(dataset.corpus_hash) || !HASH.test(dataset.query_hash)
    || !Number.isInteger(dataset.record_count) || dataset.record_count < 1
    || !Number.isInteger(dataset.evaluated_count) || dataset.evaluated_count < 1
    || !Array.isArray(dataset.exclusions)
    || dataset.exclusions.some((item) => !exactKeys(item, ['question_id', 'reason']) || typeof item.question_id !== 'string' || !item.question_id || item.reason !== 'abstention')
    || dataset.record_count !== dataset.evaluated_count + dataset.exclusions.length) errors.push('dataset');

  if (!exactKeys(report?.candidate, ['id', 'config_hash', 'config']) || typeof report.candidate.id !== 'string' || !report.candidate.id
    || !HASH.test(report.candidate.config_hash) || !report.candidate.config || typeof report.candidate.config !== 'object' || Array.isArray(report.candidate.config)
    || report.candidate.config_hash !== hash(report.candidate.config)) errors.push('candidate');
  const conditions = report?.conditions;
  if (!exactKeys(conditions, ['query_order', 'query_order_hash', 'candidate_k', 'candidate_payload_utf16_code_units', 'delivery'])
    || !uniqueNonemptyStrings(conditions.query_order, false)
    || conditions.query_order_hash !== hash(conditions.query_order)
    || conditions.candidate_k !== 20 || conditions.candidate_payload_utf16_code_units !== 20_000
    || !exactKeys(conditions.delivery, ['utf16_code_units', 'estimated_tokens', 'token_basis'])
    || conditions.delivery.utf16_code_units !== 4_000 || conditions.delivery.estimated_tokens !== 1_000
    || conditions.delivery?.token_basis !== 'estimated_chars_div_4') errors.push('budgets');
  if (!exactKeys(report?.environment, ['runtime', 'runtime_version', 'platform', 'arch']) || typeof report.environment.runtime !== 'string' || !report.environment.runtime || typeof report.environment.runtime_version !== 'string' || !report.environment.runtime_version || typeof report.environment.platform !== 'string' || !report.environment.platform || typeof report.environment.arch !== 'string' || !report.environment.arch) errors.push('environment');

  const queries = report?.queries;
  if (!Array.isArray(queries) || queries.length === 0 || queries.length !== dataset?.evaluated_count) errors.push('queries');
  else {
    if (JSON.stringify(queries.map((query) => query?.question_id)) !== JSON.stringify(conditions?.query_order)) errors.push('query_order');
    if (new Set(queries.map((query) => query?.question_id)).size !== queries.length) errors.push('queries');
    for (const query of queries) {
      const shapeValid = exactKeys(query, ['question_id', 'question_type', 'gold_session_ids', 'gold_source_ids', 'ranked_source_ids', 'ranked_session_ids', 'delivered_source_ids', 'delivered_session_ids', 'gold_ranks', 'ranking_budget', 'delivery_budget', 'ranking', 'delivery'])
        && typeof query.question_id === 'string' && Boolean(query.question_id)
        && typeof query.question_type === 'string' && Boolean(query.question_type)
        && uniqueNonemptyStrings(query.gold_session_ids, false) && uniqueNonemptyStrings(query.gold_source_ids, false)
        && query.gold_source_ids.length >= query.gold_session_ids.length
        && uniqueNonemptyStrings(query.ranked_source_ids) && Array.isArray(query.ranked_session_ids)
        && query.ranked_session_ids.every((id) => typeof id === 'string' && id) && query.ranked_source_ids.length === query.ranked_session_ids.length
        && uniqueNonemptyStrings(query.delivered_source_ids) && Array.isArray(query.delivered_session_ids)
        && query.delivered_session_ids.every((id) => typeof id === 'string' && id) && query.delivered_source_ids.length === query.delivered_session_ids.length
        && query.delivered_source_ids.every((id) => query.ranked_source_ids.includes(id))
        && Array.isArray(query.gold_ranks) && query.gold_ranks.every((rank) => Number.isInteger(rank) && rank >= 1)
        && new Set(query.gold_ranks).size === query.gold_ranks.length
        && validBudget(query.ranking_budget, 20_000) && validBudget(query.delivery_budget, 4_000)
        && validMetricSet(query.ranking) && validMetricSet(query.delivery);
      if (containsForbiddenLabel(query)) errors.push('label_leakage');
      if (!shapeValid) {
        errors.push('queries');
        continue;
      }
      try {
        const expectedRanks = query.gold_session_ids.map((id) => query.ranked_session_ids.indexOf(id) + 1).filter((rank) => rank > 0);
        if (JSON.stringify(query.gold_ranks) !== JSON.stringify(expectedRanks)
          || JSON.stringify(query.ranking) !== JSON.stringify(scoreRanking(query.ranked_session_ids, query.gold_session_ids, query.gold_source_ids.length))
          || JSON.stringify(query.delivery) !== JSON.stringify(scoreRanking(query.delivered_session_ids, query.gold_session_ids, query.gold_source_ids.length))) errors.push('query_metrics');
      } catch {
        errors.push('query_metrics');
      }
    }
  }

  const ranking = report?.metrics?.ranking;
  const delivery = report?.metrics?.delivery;
  if (!validSummary(ranking)) errors.push('metrics.ranking');
  if (!validSummary(delivery)) errors.push('metrics.delivery');
  if (Array.isArray(queries) && queries.length > 0
    && queries.every((query) => query && typeof query.question_type === 'string' && validMetricSet(query.ranking) && validMetricSet(query.delivery))) {
    const expectedRanking = aggregateScores(queries.map((query) => ({ questionType: query.question_type, metrics: query.ranking })));
    const expectedDelivery = aggregateScores(queries.map((query) => ({ questionType: query.question_type, metrics: query.delivery })));
    if (JSON.stringify(ranking) !== JSON.stringify(expectedRanking)) errors.push('metrics.ranking');
    if (JSON.stringify(delivery) !== JSON.stringify(expectedDelivery)) errors.push('metrics.delivery');
  }

  const mappings = report?.provenance?.mappings;
  if (!exactKeys(report?.provenance, ['coverage', 'mappings']) || report.provenance.coverage !== 1 || !Array.isArray(mappings) || mappings.length === 0
    || mappings.some((item) => !exactKeys(item, ['question_id', 'source_id', 'session_index', 'session_id', 'memory_id', 'evidence_id'])
      || typeof item.question_id !== 'string' || !item.question_id || typeof item.source_id !== 'string' || !item.source_id
      || !Number.isInteger(item?.session_index) || item.session_index < 0 || typeof item?.session_id !== 'string' || !item.session_id
      || typeof item?.memory_id !== 'string' || !item.memory_id || typeof item?.evidence_id !== 'string' || !item.evidence_id)
    || new Set(mappings?.map((item) => `${item.question_id}\0${item.source_id}`)).size !== mappings?.length
    || new Set(mappings?.map((item) => item.memory_id)).size !== mappings?.length
    || new Set(mappings?.map((item) => item.evidence_id)).size !== mappings?.length) errors.push('provenance');
  if (Array.isArray(queries) && Array.isArray(mappings)) {
    for (const query of queries) {
      if (!query || typeof query.question_id !== 'string' || !Array.isArray(query.gold_session_ids)
        || !Array.isArray(query.gold_source_ids) || !Array.isArray(query.ranked_source_ids) || !Array.isArray(query.ranked_session_ids)
        || !Array.isArray(query.delivered_source_ids) || !Array.isArray(query.delivered_session_ids)) {
        errors.push('provenance');
        continue;
      }
      const queryMappings = mappings.filter((item) => item.question_id === query.question_id);
      const sourceMap = new Map(queryMappings.map((item) => [item.source_id, item.session_id]));
      const expectedGoldSources = queryMappings.filter((item) => query.gold_session_ids.includes(item.session_id)).map((item) => item.source_id);
      const aligned = (sourceIds, sessionIds) => sourceIds.every((sourceId, index) => sourceMap.get(sourceId) === sessionIds[index]);
      if (JSON.stringify(query.gold_source_ids) !== JSON.stringify(expectedGoldSources)
        || !aligned(query.ranked_source_ids, query.ranked_session_ids)
        || !aligned(query.delivered_source_ids, query.delivered_session_ids)) errors.push('provenance');
    }
  }

  if (!exactKeys(report?.metrics, ['ranking', 'delivery', 'resources'])) errors.push('metrics');
  const resources = report?.metrics?.resources;
  if (!exactKeys(resources, ['retrieval_latency_ms', 'delivery_latency_ms', 'ingestion_ms', 'startup_ms', 'rss_bytes', 'sqlite_bytes', 'text', 'network_calls', 'model_calls', 'llm_calls'])) errors.push('resources');
  for (const key of ['retrieval_latency_ms', 'delivery_latency_ms', 'ingestion_ms', 'startup_ms']) if (!validSamples(resources?.[key])) errors.push(`resources.${key}`);
  if (!exactKeys(resources?.rss_bytes, ['peak', 'samples']) || !Array.isArray(resources.rss_bytes.samples) || resources.rss_bytes.samples.length === 0 || resources.rss_bytes.samples.some((value) => !nonnegative(value)) || resources.rss_bytes.peak !== Math.max(...resources.rss_bytes.samples)) errors.push('resources.rss_bytes');
  if (!exactKeys(resources?.sqlite_bytes, ['total', 'p50', 'p95', 'samples']) || !validSamples({ p50: resources.sqlite_bytes.p50, p95: resources.sqlite_bytes.p95, samples: resources.sqlite_bytes.samples }) || resources.sqlite_bytes.total !== resources.sqlite_bytes.samples.reduce((sum, value) => sum + value, 0)) errors.push('resources.sqlite_bytes');
  const text = resources?.text;
  const textKeys = ['corpus_utf16_code_units', 'query_utf16_code_units', 'ranked_source_utf16_code_units', 'ranked_evidence_utf16_code_units', 'ranked_returned_utf16_code_units', 'ranked_truncated_utf16_code_units', 'delivery_source_utf16_code_units', 'delivery_evidence_utf16_code_units', 'delivered_utf16_code_units', 'delivery_truncated_utf16_code_units'];
  const tokenKeys = ['corpus', 'queries', 'ranked_source', 'ranked_returned', 'ranked_truncated', 'delivery_source', 'delivered', 'delivery_truncated'];
  if (!exactKeys(text, [...textKeys, 'estimated_tokens']) || textKeys.some((key) => !Number.isInteger(text[key]) || text[key] < 0)
    || !exactKeys(text.estimated_tokens, tokenKeys) || text.estimated_tokens.corpus !== Math.ceil(text.corpus_utf16_code_units / 4)
    || text.estimated_tokens.queries !== Math.ceil(text.query_utf16_code_units / 4)
    || text.estimated_tokens.ranked_source !== Math.ceil(text.ranked_source_utf16_code_units / 4)
    || text.estimated_tokens.ranked_returned !== Math.ceil(text.ranked_returned_utf16_code_units / 4)
    || text.estimated_tokens.ranked_truncated !== Math.ceil(text.ranked_truncated_utf16_code_units / 4)
    || text.estimated_tokens.delivery_source !== Math.ceil(text.delivery_source_utf16_code_units / 4)
    || text.estimated_tokens.delivered !== Math.ceil(text.delivered_utf16_code_units / 4)
    || text.estimated_tokens.delivery_truncated !== Math.ceil(text.delivery_truncated_utf16_code_units / 4)) errors.push('resources.text');
  if (Array.isArray(queries) && queries.length > 0 && queries.every((query) => validBudget(query?.ranking_budget, 20_000) && validBudget(query?.delivery_budget, 4_000))) {
    const sum = (budgetKey, field) => queries.reduce((total, query) => total + query[budgetKey][field], 0);
    if (text?.ranked_source_utf16_code_units !== sum('ranking_budget', 'source_utf16_code_units')
      || text?.ranked_evidence_utf16_code_units !== sum('ranking_budget', 'evidence_utf16_code_units')
      || text?.ranked_returned_utf16_code_units !== sum('ranking_budget', 'returned_utf16_code_units')
      || text?.ranked_truncated_utf16_code_units !== sum('ranking_budget', 'truncated_utf16_code_units')
      || text?.delivery_source_utf16_code_units !== sum('delivery_budget', 'source_utf16_code_units')
      || text?.delivery_evidence_utf16_code_units !== sum('delivery_budget', 'evidence_utf16_code_units')
      || text?.delivered_utf16_code_units !== sum('delivery_budget', 'returned_utf16_code_units')
      || text?.delivery_truncated_utf16_code_units !== sum('delivery_budget', 'truncated_utf16_code_units')) errors.push('resources.text');
  }
  if (resources?.network_calls !== 0 || resources?.model_calls !== 0 || resources?.llm_calls !== 0) errors.push('offline_execution');

  if (!Array.isArray(report?.errors) || report.errors.some((item) => !exactKeys(item, ['question_id', 'code', 'message']) || typeof item.question_id !== 'string' || !item.question_id || typeof item.code !== 'string' || !/^[a-z_]{3,64}$/u.test(item.code) || typeof item.message !== 'string' || !item.message || item.message.length > 200)) errors.push('errors');
  if (!exactKeys(report?.promotion, ['decision', 'reasons']) || report.promotion.decision !== 'incomplete' || !Array.isArray(report.promotion.reasons) || !report.promotion.reasons.includes('lexical_baseline_only_no_candidate_comparison')) errors.push('promotion');
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}
