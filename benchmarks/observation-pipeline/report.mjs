import { createHash } from 'node:crypto';

const TOP_LEVEL_KEYS = ['schema', 'created_at', 'conditions', 'control', 'candidate', 'comparison', 'errors', 'decision'];
const CONDITION_KEYS = ['seed', 'sample_count', 'top_k', 'budget_chars', 'query', 'model_calls', 'network_calls'];
const LANE_KEYS = ['project_key', 'memory', 'topic_lineage', 'recall', 'resources', 'operations', 'audit', 'provenance'];
const CANDIDATE_KEYS = ['project_key', 'memory', 'topic_lineage', 'recall', 'resources', 'operations', 'lineage', 'safety', 'attributable_writes', 'scenario_results', 'audit', 'provenance'];
const MEMORY_KEYS = ['kind', 'title', 'content', 'topic_key', 'outcome'];
const RECALL_KEYS = ['ordered_signatures', 'returned_chars', 'delivery_ratio', 'useful_content_ratio'];
const RESOURCE_KEYS = ['recall_latency_p95_ms', 'recall_latency_samples_ms', 'sqlite_bytes'];
const OPERATION_KEYS = ['operation', 'outcome', 'source_ids', 'record_ids'];
const PROVENANCE_KEYS = ['valid', 'source_ids'];
const LINEAGE_KEYS = ['observation_id', 'review_id', 'promotion_evidence_id', 'memory_id', 'original_support_ids', 'complete'];
const SAFETY_KEYS = ['unsupported_promotions', 'rejected_promotions', 'unreviewed_promotions', 'candidate_recall_leaks'];
const ATTRIBUTABLE_WRITE_KEYS = ['submit', 'review', 'promotion'];
const WRITE_METRIC_KEYS = ['operation', 'event_key', 'payload_json', 'payload_sha256', 'receipt_payload_hash', 'result_ids', 'row_counts_before', 'row_counts_after', 'latency_p50_ms', 'latency_p95_ms', 'latency_samples_ms', 'sqlite_bytes_before', 'sqlite_bytes_after', 'sqlite_bytes_delta', 'payload_chars'];
const ROW_COUNT_KEYS = ['evidence', 'events', 'observations', 'reviews', 'promotions', 'memories', 'fts'];
const SCENARIO_KEYS = ['id', 'event_keys', 'outcome', 'harmful_promotions', 'observation_ids', 'review_ids', 'memory_ids', 'support_ids', 'policy', 'row_counts_before', 'row_counts_after'];
const POLICY_KEYS = ['id', 'version'];
const AUDIT_KEYS = ['project_id', 'row_counts', 'evidence_ids', 'evidence_rows', 'event_evidence_ids', 'observations', 'reviews', 'promotions', 'memories', 'fts_memory_ids', 'receipts', 'scenario_trace', 'trace_sha256'];
const AUDIT_EVIDENCE_KEYS = ['id', 'kind', 'content_json', 'content_hash', 'source_ref', 'captured_at', 'metadata_json'];
const AUDIT_OBSERVATION_KEYS = ['id', 'submission_evidence_id', 'predecessor_id', 'scope', 'coverage', 'kind', 'title', 'claim', 'proposed_memory', 'generator', 'concepts', 'files', 'support_ids'];
const AUDIT_REVIEW_KEYS = ['id', 'observation_id', 'review_evidence_id', 'verdict', 'basis', 'reason', 'policy_id', 'policy_version', 'support_ids'];
const AUDIT_PROMOTION_KEYS = ['observation_id', 'promotion_evidence_id', 'memory_id'];
const AUDIT_MEMORY_KEYS = ['id', 'kind', 'title', 'content', 'topic_key', 'outcome', 'status', 'supersedes_id', 'valid_from', 'evidence_ids'];
const AUDIT_RECEIPT_KEYS = ['operation', 'event_key', 'canonical_payload_json', 'payload_hash', 'evidence_id', 'observation_id', 'review_id', 'memory_id'];
const TRACE_ENTRY_KEYS = [...SCENARIO_KEYS, 'entry_sha256'];
const SCENARIO_OUTCOMES = new Map([
  ['poisoned', 'blocked'], ['negated', 'rejected'], ['cross_scope', 'blocked'], ['failed', 'accepted'],
  ['changing_requirement', 'promoted'], ['stale_procedure', 'rejected'], ['correction', 'promoted'], ['topic_supersession', 'promoted'],
]);
const SCENARIO_EVENT_KEYS = new Map([
  ['poisoned', ['candidate:poisoned']],
  ['negated', ['candidate:rejected', 'candidate:rejected:review', 'candidate:rejected:promotion']],
  ['cross_scope', ['candidate:cross-scope']],
  ['failed', ['candidate:failed', 'candidate:failed:validation', 'candidate:failed:review']],
  ['changing_requirement', ['candidate:initial', 'candidate:initial:review', 'candidate:initial:promotion', 'candidate:confirmation', 'candidate:submit', 'candidate:review', 'candidate:promotion']],
  ['stale_procedure', ['candidate:stale', 'candidate:stale:review']],
  ['correction', ['candidate:submit', 'candidate:review', 'candidate:promotion']],
  ['topic_supersession', ['candidate:submit', 'candidate:review', 'candidate:promotion']],
]);
const SCENARIO_RECEIPT_KEYS = new Map([
  ['poisoned', []], ['negated', ['candidate:rejected', 'candidate:rejected:review']], ['cross_scope', []],
  ['failed', ['candidate:failed', 'candidate:failed:validation', 'candidate:failed:review']],
  ['changing_requirement', SCENARIO_EVENT_KEYS.get('changing_requirement')],
  ['stale_procedure', ['candidate:stale', 'candidate:stale:review']],
  ['correction', SCENARIO_EVENT_KEYS.get('correction')], ['topic_supersession', SCENARIO_EVENT_KEYS.get('topic_supersession')],
]);
const ADVERSE_SCENARIO_CANDIDATES = new Map([
  ['candidate:rejected', {
    kind: 'fact', scope: 'project', title: 'Rejected fixture', claim: 'This rejected candidate must never be promoted.',
    proposed_memory: { kind: 'discovery', title: 'Rejected fixture', content: 'This content must remain outside recall.', topic_key: null, outcome: 'unknown' },
    generator: { kind: 'root_agent', name: 'benchmark', version: null, config_hash: null }, coverage: null, concepts: [], files: [],
  }],
  ['candidate:failed', {
    kind: 'failure', scope: 'project', title: 'Observed failed check', claim: 'The compatibility check fails under the recorded fixture.',
    proposed_memory: { kind: 'failure', title: 'Observed failed check', content: 'Remember the attributable failed compatibility check.', topic_key: null, outcome: 'failed' },
    generator: { kind: 'root_agent', name: 'benchmark', version: null, config_hash: null }, coverage: null, concepts: [], files: [],
  }],
  ['candidate:stale', {
    kind: 'procedure', scope: 'project', title: 'Stale procedure', claim: 'Use the superseded setup procedure.',
    proposed_memory: { kind: 'convention', title: 'Stale procedure', content: 'Use the superseded setup procedure.', topic_key: null, outcome: 'unknown' },
    generator: { kind: 'root_agent', name: 'benchmark', version: null, config_hash: null }, coverage: null, concepts: [], files: [],
  }],
]);
const FIXTURE_CANDIDATE_ASSERTIONS = new Map([
  ['candidate:initial', { kind: 'constraint', scope: 'project', title: 'Local file core', claim: 'The persistent memory core remains local.' }],
  ['candidate:submit', { kind: 'constraint', scope: 'project', title: 'Local SQLite core', claim: 'The persistent memory core remains fully local and SQLite-first.' }],
  ['candidate:rejected', { kind: 'fact', scope: 'project', title: 'Rejected fixture', claim: 'This rejected candidate must never be promoted.' }],
  ['candidate:failed', { kind: 'failure', scope: 'project', title: 'Observed failed check', claim: 'The compatibility check fails under the recorded fixture.' }],
  ['candidate:stale', { kind: 'procedure', scope: 'project', title: 'Stale procedure', claim: 'Use the superseded setup procedure.' }],
]);
const FIXTURE_REVIEW_SEMANTICS = new Map([
  ['candidate:initial:review', { verdict: 'accepted', basis: 'root_user_confirmed', policy: { id: 'benchmark', version: '1' }, reason: 'Initial local requirement confirmed.' }],
  ['candidate:review', { verdict: 'accepted', basis: 'root_user_confirmed', policy: { id: 'benchmark', version: '1' }, reason: 'Explicitly confirmed by the root user.' }],
  ['candidate:rejected:review', { verdict: 'rejected', basis: 'root_user_confirmed', policy: { id: 'benchmark', version: '1' }, reason: 'Benchmark rejection fixture.' }],
  ['candidate:failed:review', { verdict: 'accepted', basis: 'observable_validation', policy: { id: 'benchmark', version: '1' }, reason: 'The failure is reproducible.' }],
  ['candidate:stale:review', { verdict: 'rejected', basis: 'root_user_confirmed', policy: { id: 'benchmark', version: '1' }, reason: 'The procedure is stale.' }],
]);
const FIXTURE_SUPPORT_EVENTS = new Map([
  ['candidate:initial', ['candidate:source']],
  ['candidate:submit', ['candidate:source']],
  ['candidate:rejected', ['candidate:source']],
  ['candidate:failed', ['candidate:source']],
  ['candidate:stale', ['candidate:source']],
  ['candidate:initial:review', ['candidate:initial:confirmation']],
  ['candidate:review', ['candidate:confirmation']],
  ['candidate:rejected:review', ['candidate:rejected:confirmation']],
  ['candidate:failed:review', ['candidate:failed:validation']],
  ['candidate:stale:review', ['candidate:stale:confirmation']],
]);
const FIXTURE_SUPPORT_EVIDENCE = new Map([
  ['candidate:source', { kind: 'explicit_save', content: 'The product requirement fixes the core to local SQLite storage.' }],
  ['candidate:initial:confirmation', { kind: 'root_prompt', content: 'Confirm the initial local architecture.' }],
  ['candidate:confirmation', { kind: 'root_prompt', content: 'Confirm the local SQLite architecture as durable project memory.' }],
  ['candidate:rejected:confirmation', { kind: 'root_prompt', content: 'Reject the benchmark-only invalid candidate.' }],
  ['candidate:failed:validation', { kind: 'explicit_save', content: 'The failure was reproduced.' }],
  ['candidate:stale:confirmation', { kind: 'root_prompt', content: 'Reject the stale procedure.' }],
]);
const COMPARISON_KEYS = ['final_memory_equal', 'topic_lineage_equal', 'recall_order_equal', 'recall_payload_equal', 'delivery_ratio_equal', 'useful_content_ratio_equal', 'recall_latency_p95_ratio', 'sqlite_bytes_ratio'];
const DECISION_KEYS = ['status', 'reasons'];
const REQUIRED_CANDIDATE_OPERATIONS = ['candidate_submit', 'review_accept', 'explicit_promotion'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNonNegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const isString = (value) => typeof value === 'string' && value.length > 0;
const isStringArray = (value, allowEmpty = false) => Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(isString);
const sameKeys = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const hasClosedKeys = (value, required, optional = []) => isObject(value)
  && required.every((key) => Object.hasOwn(value, key))
  && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const sameValue = (left, right) => Math.abs(left - right) <= 1e-12;
const uniqueStrings = (value, allowEmpty = false) => isStringArray(value, allowEmpty) && new Set(value).size === value.length;
const sameStringSet = (left, right) => uniqueStrings(left, true) && uniqueStrings(right, true)
  && left.length === right.length && left.every((value) => right.includes(value));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const stableUuid = (value) => {
  const hex = sha256(value.normalize('NFC'));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

function percentile95(samples) {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
}

function percentile50(samples) {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.5) - 1];
}

function ratio(candidate, control) {
  if (control === 0) return candidate === 0 ? 1 : Number.POSITIVE_INFINITY;
  return candidate / control;
}

function validMemory(value) {
  return sameKeys(value, MEMORY_KEYS)
    && MEMORY_KEYS.every((key) => key === 'topic_key' ? value[key] === null || isString(value[key]) : isString(value[key]));
}

function validRecall(value) {
  return sameKeys(value, RECALL_KEYS)
    && isStringArray(value.ordered_signatures)
    && Number.isInteger(value.returned_chars) && value.returned_chars >= 0
    && isFiniteNonNegative(value.delivery_ratio) && value.delivery_ratio <= 1
    && isFiniteNonNegative(value.useful_content_ratio) && value.useful_content_ratio <= 1;
}

function validResources(value, sampleCount) {
  return sameKeys(value, RESOURCE_KEYS)
    && isFiniteNonNegative(value.recall_latency_p95_ms)
    && Array.isArray(value.recall_latency_samples_ms)
    && value.recall_latency_samples_ms.length === sampleCount
    && value.recall_latency_samples_ms.every(isFiniteNonNegative)
    && sameValue(value.recall_latency_p95_ms, percentile95(value.recall_latency_samples_ms))
    && Number.isInteger(value.sqlite_bytes) && value.sqlite_bytes > 0;
}

function validOperations(value) {
  return Array.isArray(value) && value.length > 0 && value.every((operation) => sameKeys(operation, OPERATION_KEYS)
    && /^[a-z_]{3,64}$/u.test(operation.operation)
    && ['confirmed', 'blocked'].includes(operation.outcome)
    && isStringArray(operation.source_ids, operation.outcome === 'blocked')
    && isStringArray(operation.record_ids, operation.outcome === 'blocked'));
}

function validProvenance(value) {
  return sameKeys(value, PROVENANCE_KEYS) && typeof value.valid === 'boolean' && isStringArray(value.source_ids);
}

function validLane(value, keys, sampleCount) {
  return sameKeys(value, keys) && isString(value.project_key) && validMemory(value.memory) && isStringArray(value.topic_lineage) && validRecall(value.recall)
    && validResources(value.resources, sampleCount) && validOperations(value.operations) && validAudit(value.audit, value.project_key)
    && validProvenance(value.provenance) && reconciledLane(value);
}

function validRowCounts(value) {
  return sameKeys(value, ROW_COUNT_KEYS) && ROW_COUNT_KEYS.every((key) => Number.isInteger(value[key]) && value[key] >= 0);
}

function validRowDelta(before, after, expected) {
  return validRowCounts(before) && validRowCounts(after)
    && ROW_COUNT_KEYS.every((key) => after[key] - before[key] === (expected[key] ?? 0));
}

function auditedMemoryShape(memory) {
  return { kind: memory.kind, title: memory.title, content: memory.content, topic_key: memory.topic_key, outcome: memory.outcome };
}

function auditedTopicLineage(audit, currentMemory) {
  const byId = new Map(audit.memories.map((memory) => [memory.id, memory]));
  const lineage = [];
  const visited = new Set();
  let cursor = currentMemory;
  while (cursor && !visited.has(cursor.id)) {
    lineage.push(cursor);
    visited.add(cursor.id);
    cursor = cursor.supersedes_id === null ? undefined : byId.get(cursor.supersedes_id);
  }
  if (cursor || lineage.length === 0) return undefined;
  return lineage.reverse().map((memory) => `${memory.topic_key}|${memory.status}|${memory.title}|${memory.content}|${memory.outcome}`);
}

function reconciledLane(lane) {
  const currentMemories = lane.audit.memories.filter((memory) => memory.status === 'current'
    && JSON.stringify(auditedMemoryShape(memory)) === JSON.stringify(lane.memory));
  if (currentMemories.length !== 1) return false;
  return JSON.stringify(lane.topic_lineage) === JSON.stringify(auditedTopicLineage(lane.audit, currentMemories[0]));
}

function validAudit(value, projectKey) {
  if (!sameKeys(value, AUDIT_KEYS) || !validRowCounts(value.row_counts) || !uniqueStrings(value.evidence_ids) || !uniqueStrings(value.event_evidence_ids, true)
    || !uniqueStrings(value.fts_memory_ids, true) || !Array.isArray(value.observations) || !Array.isArray(value.reviews)
    || !Array.isArray(value.evidence_rows) || !Array.isArray(value.promotions) || !Array.isArray(value.memories) || !Array.isArray(value.receipts)
    || !isString(projectKey) || value.project_id !== stableUuid(`project:${projectKey}`)
    || !Array.isArray(value.scenario_trace) || !/^[0-9a-f]{64}$/u.test(value.trace_sha256)
    || value.trace_sha256 !== sha256(JSON.stringify(value.scenario_trace))) return false;
  const observations = new Map(value.observations.map((row) => [row?.id, row]));
  const reviews = new Map(value.reviews.map((row) => [row?.id, row]));
  const memories = new Map(value.memories.map((row) => [row?.id, row]));
  const evidenceRows = new Map(value.evidence_rows.map((row) => [row?.id, row]));
  if (observations.size !== value.observations.length || reviews.size !== value.reviews.length || memories.size !== value.memories.length) return false;
  if (evidenceRows.size !== value.evidence_rows.length || !sameStringSet(value.evidence_ids, [...evidenceRows.keys()])
    || value.evidence_rows.some((row) => !sameKeys(row, AUDIT_EVIDENCE_KEYS) || !isString(row.id) || !isString(row.kind)
      || !isString(row.content_json) || !/^[0-9a-f]{64}$/u.test(row.content_hash)
      || (row.source_ref !== null && typeof row.source_ref !== 'string') || !isString(row.captured_at) || !isString(row.metadata_json)
      || !isObject(parsedJson(row.metadata_json))
      || sha256(row.content_json.normalize('NFC')) !== row.content_hash)) return false;
  if (value.observations.some((row) => !sameKeys(row, AUDIT_OBSERVATION_KEYS) || !isString(row.id)
    || row.id !== stableUuid(`observation:${row.submission_evidence_id}`)
    || !value.evidence_ids.includes(row.submission_evidence_id) || (row.predecessor_id !== null && !observations.has(row.predecessor_id))
    || !isString(row.scope) || (row.coverage !== null && (!sameKeys(row.coverage, ['from_sequence', 'to_sequence'])
      || !isPositiveInteger(row.coverage.from_sequence) || !isPositiveInteger(row.coverage.to_sequence)))
    || !isString(row.kind) || !isString(row.title) || !isString(row.claim) || !validMemory(row.proposed_memory)
    || !sameKeys(row.generator, ['kind', 'name', 'version', 'config_hash']) || !isString(row.generator.kind) || !isString(row.generator.name)
    || (row.generator.version !== null && !isString(row.generator.version)) || (row.generator.config_hash !== null && !/^[0-9a-f]{64}$/u.test(row.generator.config_hash))
    || !uniqueStrings(row.concepts, true) || !uniqueStrings(row.files, true)
    || !uniqueStrings(row.support_ids) || row.support_ids.some((id) => !value.evidence_ids.includes(id)))) return false;
  if (value.reviews.some((row) => !sameKeys(row, AUDIT_REVIEW_KEYS) || !isString(row.id)
    || row.id !== stableUuid(`observation-review:${row.review_evidence_id}`) || !observations.has(row.observation_id)
    || !value.evidence_ids.includes(row.review_evidence_id) || !['accepted', 'rejected'].includes(row.verdict)
    || !isString(row.basis) || !isString(row.reason) || !isString(row.policy_id) || !isString(row.policy_version) || !uniqueStrings(row.support_ids)
    || row.support_ids.some((id) => !value.evidence_ids.includes(id)) || !validReviewSupportSemantics(row, evidenceRows))) return false;
  if (value.promotions.some((row) => !sameKeys(row, AUDIT_PROMOTION_KEYS) || !observations.has(row.observation_id)
    || !value.evidence_ids.includes(row.promotion_evidence_id) || !memories.has(row.memory_id))) return false;
  if (value.memories.some((row) => !sameKeys(row, AUDIT_MEMORY_KEYS) || !isString(row.id) || !isString(row.kind)
    || !isString(row.title) || !isString(row.content) || !isString(row.outcome) || !isString(row.valid_from)
    || (row.topic_key !== null && !isString(row.topic_key)) || (row.supersedes_id !== null && !memories.has(row.supersedes_id))
    || !['current', 'superseded'].includes(row.status) || !uniqueStrings(row.evidence_ids)
    || row.evidence_ids.some((id) => !value.evidence_ids.includes(id)))) return false;
  if (value.receipts.some((row) => !sameKeys(row, AUDIT_RECEIPT_KEYS) || !['save', 'candidate', 'review', 'promotion'].includes(row.operation)
    || !isString(row.event_key) || !isString(row.canonical_payload_json) || !/^[0-9a-f]{64}$/u.test(row.payload_hash)
    || sha256(row.canonical_payload_json.normalize('NFC')) !== row.payload_hash || !value.evidence_ids.includes(row.evidence_id)
    || (row.observation_id !== null && !observations.has(row.observation_id)) || (row.review_id !== null && !reviews.has(row.review_id))
    || (row.memory_id !== null && !memories.has(row.memory_id))
    || !validReceiptTargets(row, value.project_id, evidenceRows, observations, reviews, memories, value.promotions))) return false;
  if (value.scenario_trace.some((entry) => !sameKeys(entry, TRACE_ENTRY_KEYS)
    || entry.entry_sha256 !== sha256(JSON.stringify(Object.fromEntries(SCENARIO_KEYS.map((key) => [key, entry[key]])))))) return false;
  const promotionObservationIds = value.promotions.map((row) => row.observation_id);
  const promotionMemoryIds = value.promotions.map((row) => row.memory_id);
  const receiptEventKeys = value.receipts.map((row) => row.event_key);
  return value.row_counts.evidence === value.evidence_ids.length && value.row_counts.events === value.event_evidence_ids.length
    && value.row_counts.observations === value.observations.length && value.row_counts.reviews === value.reviews.length
    && value.row_counts.promotions === value.promotions.length && value.row_counts.memories === value.memories.length
    && value.row_counts.fts === value.fts_memory_ids.length
    && new Set(promotionObservationIds).size === promotionObservationIds.length && new Set(promotionMemoryIds).size === promotionMemoryIds.length
    && new Set(receiptEventKeys).size === receiptEventKeys.length
    && value.event_evidence_ids.every((id) => value.evidence_ids.includes(id))
    && value.observations.every((row) => value.event_evidence_ids.includes(row.submission_evidence_id))
    && value.reviews.every((row) => value.event_evidence_ids.includes(row.review_evidence_id))
    && value.promotions.every((row) => value.event_evidence_ids.includes(row.promotion_evidence_id))
    && value.fts_memory_ids.every((id) => memories.has(id))
    && value.promotions.every((row) => value.fts_memory_ids.includes(row.memory_id)
      && JSON.stringify(observations.get(row.observation_id)?.proposed_memory) === JSON.stringify(auditedMemoryShape(memories.get(row.memory_id))));
}

function proposedMemoryFromCanonical(value) {
  return {
    kind: value?.kind, title: value?.title, content: value?.content,
    topic_key: value?.topicKey ?? null, outcome: value?.outcome ?? 'unknown',
  };
}

function observationProjectionFromCanonical(value) {
  return {
    predecessor_id: value?.predecessorId ?? null,
    scope: value?.scope,
    coverage: value?.coverage === undefined ? null : { from_sequence: value.coverage.fromSequence, to_sequence: value.coverage.toSequence },
    kind: value?.kind,
    title: value?.title,
    claim: value?.claim,
    proposed_memory: proposedMemoryFromCanonical(value?.proposedMemory),
    generator: {
      kind: value?.generator?.kind,
      name: value?.generator?.name,
      version: value?.generator?.version ?? null,
      config_hash: value?.generator?.configHash ?? null,
    },
    concepts: value?.concepts ?? [],
    files: value?.files ?? [],
    support_ids: value?.supportIds,
  };
}

function auditedObservationProjection(value) {
  return {
    predecessor_id: value?.predecessor_id,
    scope: value?.scope,
    coverage: value?.coverage,
    kind: value?.kind,
    title: value?.title,
    claim: value?.claim,
    proposed_memory: value?.proposed_memory,
    generator: value?.generator,
    concepts: value?.concepts,
    files: value?.files,
    support_ids: value?.support_ids,
  };
}

function hasEvidenceSchema(evidence, schema) {
  const metadata = parsedJson(evidence.metadata_json);
  return sameKeys(metadata, ['schema']) && metadata.schema === schema;
}

function validReviewSupportSemantics(review, evidenceRows) {
  return review.support_ids.every((supportId) => {
    const evidence = evidenceRows.get(supportId);
    if (!evidence) return false;
    if (review.basis === 'root_user_confirmed') return evidence.kind === 'root_prompt';
    const metadata = parsedJson(evidence.metadata_json);
    if (review.basis === 'observable_validation') {
      const validation = metadata?.observation_validation;
      return evidence.kind === 'explicit_save' && sameKeys(metadata, ['observation_validation'])
        && sameKeys(validation, ['observation_id', 'result', 'method'])
        && validation.observation_id === review.observation_id
        && validation.result === (review.verdict === 'accepted' ? 'passed' : 'failed') && isString(validation.method);
    }
    if (review.basis === 'independent_review') {
      const attestation = metadata?.observation_review_attestation;
      return evidence.kind === 'handoff' && sameKeys(metadata, ['observation_review_attestation'])
        && sameKeys(attestation, ['observation_id', 'verdict', 'reviewer', 'method'])
        && attestation.observation_id === review.observation_id && attestation.verdict === review.verdict
        && isString(attestation.reviewer) && isString(attestation.method);
    }
    return false;
  });
}

function adverseScenarioCandidateSemantics(value) {
  return {
    kind: value?.kind,
    scope: value?.scope,
    title: value?.title,
    claim: value?.claim,
    proposed_memory: proposedMemoryFromCanonical(value?.proposedMemory),
    generator: {
      kind: value?.generator?.kind,
      name: value?.generator?.name,
      version: value?.generator?.version ?? null,
      config_hash: value?.generator?.configHash ?? null,
    },
    coverage: value?.coverage === undefined ? null : { from_sequence: value.coverage.fromSequence, to_sequence: value.coverage.toSequence },
    concepts: value?.concepts ?? [],
    files: value?.files ?? [],
  };
}

function candidateAssertion(value) {
  return { kind: value?.kind, scope: value?.scope, title: value?.title, claim: value?.claim };
}

function reviewSemantics(value) {
  return { verdict: value?.verdict, basis: value?.basis, policy: value?.policy, reason: value?.reason };
}

function validFixtureSupportManifest(audit) {
  const receipts = new Map(audit.receipts.map((receipt) => [receipt.event_key, receipt]));
  for (const [eventKey, supportEventKeys] of FIXTURE_SUPPORT_EVENTS) {
    const receipt = receipts.get(eventKey);
    const payload = receipt ? parsedJson(receipt.canonical_payload_json) : undefined;
    const supportIds = receipt?.operation === 'candidate' ? payload?.observation?.supportIds : payload?.review?.supportIds;
    const expectedSupportIds = supportEventKeys.map((supportEventKey) => stableUuid(`evidence:${audit.project_id}:${supportEventKey}`)).sort();
    if (JSON.stringify(supportIds) !== JSON.stringify(expectedSupportIds)) return false;
  }
  const failedObservationId = receipts.get('candidate:failed')?.observation_id;
  for (const [eventKey, expected] of FIXTURE_SUPPORT_EVIDENCE) {
    const evidenceId = stableUuid(`evidence:${audit.project_id}:${eventKey}`);
    const evidence = audit.evidence_rows.find((row) => row.id === evidenceId);
    if (!evidence || !audit.event_evidence_ids.includes(evidenceId) || evidence.kind !== expected.kind || evidence.content_json !== expected.content) return false;
    const expectedMetadata = eventKey === 'candidate:failed:validation'
      ? { observation_validation: { observation_id: failedObservationId, result: 'passed', method: 'offline reproduction' } }
      : {};
    if (evidence.metadata_json !== JSON.stringify(expectedMetadata)) return false;
  }
  return true;
}

function parsedJson(value) {
  try { return JSON.parse(value); } catch { return undefined; }
}

function validReceiptTargets(receipt, projectId, evidenceRows, observations, reviews, memories, promotions) {
  const payload = parsedJson(receipt.canonical_payload_json);
  if (payload === undefined) return false;
  const evidence = evidenceRows.get(receipt.evidence_id);
  if (!evidence) return false;
  const evidencePrefix = { save: 'evidence', candidate: 'observation-evidence', review: 'observation-review-evidence', promotion: 'observation-promotion-evidence' }[receipt.operation];
  if (receipt.evidence_id !== stableUuid(`${evidencePrefix}:${projectId}:${receipt.event_key}`)) return false;
  if (receipt.operation === 'save') {
    const canonicalEvidence = payload?.evidence;
    const canonicalEvidenceKeys = ['kind', 'content', 'sourceRef', 'capturedAt', 'metadata'];
    if (!sameKeys(payload, ['evidence', 'memory']) || !isObject(canonicalEvidence)
      || Object.keys(canonicalEvidence).some((key) => !canonicalEvidenceKeys.includes(key))) return false;
    const canonicalMetadata = canonicalEvidence.metadata ?? {};
    if (!isObject(canonicalMetadata) || canonicalEvidence.kind !== evidence.kind || canonicalEvidence.content !== evidence.content_json
      || (canonicalEvidence.sourceRef ?? null) !== evidence.source_ref
      || (canonicalEvidence.capturedAt !== undefined && canonicalEvidence.capturedAt !== evidence.captured_at)
      || JSON.stringify(canonicalMetadata) !== evidence.metadata_json) return false;
    if (payload.memory === null) return receipt.observation_id === null && receipt.review_id === null && receipt.memory_id === null;
    const memory = memories.get(receipt.memory_id);
    return receipt.observation_id === null && receipt.review_id === null && memory
      && JSON.stringify(proposedMemoryFromCanonical(payload.memory)) === JSON.stringify(auditedMemoryShape(memory));
  }
  if (receipt.operation === 'candidate') {
    const observation = [...observations.values()].find((row) => row.submission_evidence_id === receipt.evidence_id);
    return evidence.kind === 'observation' && evidence.content_json === receipt.canonical_payload_json
      && hasEvidenceSchema(evidence, 'thoth-mem.observation.v1')
      && sameKeys(payload, ['schema', 'observation']) && payload.schema === 'thoth-mem.observation.v1'
      && hasClosedKeys(payload.observation, ['kind', 'scope', 'title', 'claim', 'proposedMemory', 'supportIds', 'generator'], ['coverage', 'concepts', 'files', 'predecessorId'])
      && hasClosedKeys(payload.observation.proposedMemory, ['kind', 'title', 'content'], ['topicKey', 'outcome'])
      && hasClosedKeys(payload.observation.generator, ['kind', 'name'], ['version', 'configHash'])
      && (payload.observation.coverage === undefined || sameKeys(payload.observation.coverage, ['fromSequence', 'toSequence']))
      && observation?.id === receipt.observation_id
      && receipt.review_id === null && receipt.memory_id === null
      && JSON.stringify(observationProjectionFromCanonical(payload.observation)) === JSON.stringify(auditedObservationProjection(observation));
  }
  if (receipt.operation === 'review') {
    const review = [...reviews.values()].find((row) => row.review_evidence_id === receipt.evidence_id);
    return evidence.kind === 'observation_review' && evidence.content_json === receipt.canonical_payload_json
      && hasEvidenceSchema(evidence, 'thoth-mem.observation-review.v1')
      && sameKeys(payload, ['schema', 'review']) && payload.schema === 'thoth-mem.observation-review.v1'
      && sameKeys(payload.review, ['observationId', 'verdict', 'basis', 'policy', 'reason', 'supportIds'])
      && sameKeys(payload.review.policy, ['id', 'version']) && review?.id === receipt.review_id
      && review?.observation_id === receipt.observation_id && receipt.memory_id === null
      && payload.review?.observationId === review.observation_id
      && JSON.stringify(payload.review?.supportIds) === JSON.stringify(review.support_ids)
      && payload.review?.verdict === review.verdict && payload.review?.basis === review.basis && payload.review?.reason === review.reason
      && payload.review?.policy?.id === review.policy_id && payload.review?.policy?.version === review.policy_version;
  }
  const promotion = promotions.find((row) => row.promotion_evidence_id === receipt.evidence_id);
  const promotionEvidence = parsedJson(evidence.content_json);
  return evidence.kind === 'observation_promotion' && sameKeys(payload, ['observationId'])
    && hasEvidenceSchema(evidence, 'thoth-mem.observation-promotion.v1')
    && sameKeys(promotionEvidence, ['schema', 'promotion']) && promotionEvidence.schema === 'thoth-mem.observation-promotion.v1'
    && sameKeys(promotionEvidence.promotion, ['observationId'])
    && payload.observationId === promotionEvidence.promotion.observationId && payload.observationId === promotion?.observation_id
    && promotion?.observation_id === receipt.observation_id && promotion?.memory_id === receipt.memory_id
    && reviews.get(receipt.review_id)?.observation_id === receipt.observation_id;
}

function parsedCanonicalPayload(metric) {
  try {
    const parsed = JSON.parse(metric.payload_json);
    return JSON.stringify(parsed) === metric.payload_json ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function validAttributableWrites(value, audit, lineage, operations) {
  if (!sameKeys(value, ATTRIBUTABLE_WRITE_KEYS)) return false;
  const expectedDeltas = {
    submit: { evidence: 1, events: 1, observations: 1 },
    review: { evidence: 1, events: 1, reviews: 1 },
    promotion: { evidence: 1, events: 1, promotions: 1, memories: 1, fts: 1 },
  };
  const expectedOperation = { submit: 'candidate', review: 'review', promotion: 'promotion' };
  return ATTRIBUTABLE_WRITE_KEYS.every((operation) => {
    const metric = value[operation];
    const payload = sameKeys(metric, WRITE_METRIC_KEYS) ? parsedCanonicalPayload(metric) : undefined;
    const operationRecord = operations?.find((entry) => entry.operation === ({ submit: 'candidate_submit', review: 'review_accept', promotion: 'explicit_promotion' })[operation]);
    const expectedIds = operation === 'submit'
      ? [lineage?.observation_id, audit?.observations?.find((row) => row.id === lineage?.observation_id)?.submission_evidence_id]
      : operation === 'review'
        ? [lineage?.review_id, audit?.reviews?.find((row) => row.id === lineage?.review_id)?.review_evidence_id]
        : [lineage?.memory_id, lineage?.promotion_evidence_id];
    const observationRow = audit?.observations?.find((row) => row.id === lineage?.observation_id);
    const reviewRow = audit?.reviews?.find((row) => row.id === lineage?.review_id);
    const promotionRow = audit?.promotions?.find((row) => row.observation_id === lineage?.observation_id);
    const receipt = audit?.receipts?.find((row) => row.event_key === metric?.event_key);
    return sameKeys(metric, WRITE_METRIC_KEYS) && metric.operation === expectedOperation[operation]
      && isString(metric.event_key) && payload && payload.eventKey === metric.event_key
      && sha256(metric.payload_json) === metric.payload_sha256 && metric.payload_chars === metric.payload_json.length
      && receipt?.payload_hash === metric.receipt_payload_hash && receipt.operation === expectedOperation[operation]
      && uniqueStrings(metric.result_ids) && metric.result_ids.length === 2 && expectedIds.every((id) => metric.result_ids.includes(id))
      && operationRecord && metric.result_ids.every((id) => operationRecord.source_ids.includes(id) || operationRecord.record_ids.includes(id))
      && validRowDelta(metric.row_counts_before, metric.row_counts_after, expectedDeltas[operation])
      && (operation === 'submit' ? JSON.stringify(payload.observation?.supportIds) === JSON.stringify(observationRow?.support_ids)
        && payload.observation?.predecessorId === observationRow?.predecessor_id
        && JSON.stringify({
          kind: payload.observation?.proposedMemory?.kind, title: payload.observation?.proposedMemory?.title,
          content: payload.observation?.proposedMemory?.content, topic_key: payload.observation?.proposedMemory?.topicKey ?? null,
          outcome: payload.observation?.proposedMemory?.outcome ?? 'unknown',
        }) === JSON.stringify(observationRow?.proposed_memory) : true)
      && (operation === 'review' ? payload.review?.observationId === lineage?.observation_id
        && JSON.stringify(payload.review?.supportIds) === JSON.stringify(reviewRow?.support_ids)
        && payload.review?.policy?.id === reviewRow?.policy_id && payload.review?.policy?.version === reviewRow?.policy_version : true)
      && (operation === 'promotion' ? payload.observationId === lineage?.observation_id
        && promotionRow?.memory_id === lineage?.memory_id && promotionRow?.promotion_evidence_id === lineage?.promotion_evidence_id : true)
      && Array.isArray(metric.latency_samples_ms) && metric.latency_samples_ms.length > 0 && metric.latency_samples_ms.every(isFiniteNonNegative)
      && sameValue(metric.latency_p50_ms, percentile50(metric.latency_samples_ms))
      && sameValue(metric.latency_p95_ms, percentile95(metric.latency_samples_ms))
      && Number.isInteger(metric.sqlite_bytes_before) && metric.sqlite_bytes_before > 0
      && Number.isInteger(metric.sqlite_bytes_after) && metric.sqlite_bytes_after >= metric.sqlite_bytes_before
      && metric.sqlite_bytes_delta === metric.sqlite_bytes_after - metric.sqlite_bytes_before
      && Number.isInteger(metric.payload_chars) && metric.payload_chars > 0;
  });
}

function validLineageReconciliation(candidate) {
  const { audit, lineage, operations, provenance } = candidate;
  const observation = audit?.observations?.find((row) => row.id === lineage?.observation_id);
  const review = audit?.reviews?.find((row) => row.id === lineage?.review_id);
  const promotion = audit?.promotions?.find((row) => row.observation_id === lineage?.observation_id);
  const memory = audit?.memories?.find((row) => row.id === lineage?.memory_id);
  if (!observation || !review || !promotion || !memory || review.observation_id !== observation.id
    || promotion.memory_id !== memory.id || promotion.promotion_evidence_id !== lineage.promotion_evidence_id
    || !sameStringSet(lineage.original_support_ids, observation.support_ids)) return false;
  const expectedEvidenceIds = [...new Set([...observation.support_ids, ...review.support_ids, observation.submission_evidence_id,
    review.review_evidence_id, promotion.promotion_evidence_id])];
  const expectedProvenanceIds = [...expectedEvidenceIds, observation.id, review.id, memory.id];
  const submit = operations.find((entry) => entry.operation === 'candidate_submit');
  const accept = operations.find((entry) => entry.operation === 'review_accept');
  const promote = operations.find((entry) => entry.operation === 'explicit_promotion');
  return lineage.complete === sameStringSet(memory.evidence_ids, expectedEvidenceIds)
    && lineage.complete
    && sameStringSet(submit?.source_ids, [...observation.support_ids, observation.submission_evidence_id])
    && sameStringSet(submit?.record_ids, [observation.id])
    && sameStringSet(accept?.source_ids, [...review.support_ids, review.review_evidence_id])
    && sameStringSet(accept?.record_ids, [review.id])
    && sameStringSet(promote?.source_ids, [promotion.promotion_evidence_id])
    && sameStringSet(promote?.record_ids, [memory.id])
    && sameStringSet(provenance.source_ids, expectedProvenanceIds);
}

function validScenarioResults(value, audit, projectKey, lineage, attributableWrites) {
  if (!Array.isArray(value) || value.length !== SCENARIO_OUTCOMES.size || !lineage || !validAudit(audit, projectKey)) return false;
  if (!validFixtureSupportManifest(audit)) return false;
  if ([...FIXTURE_CANDIDATE_ASSERTIONS].some(([eventKey, expected]) => {
    const receipt = audit.receipts.find((row) => row.event_key === eventKey && row.operation === 'candidate');
    const payload = receipt ? parsedJson(receipt.canonical_payload_json) : undefined;
    return JSON.stringify(candidateAssertion(payload?.observation)) !== JSON.stringify(expected);
  })) return false;
  if ([...ADVERSE_SCENARIO_CANDIDATES].some(([eventKey, expected]) => {
    const receipt = audit.receipts.find((row) => row.event_key === eventKey && row.operation === 'candidate');
    const payload = receipt ? parsedJson(receipt.canonical_payload_json) : undefined;
    return JSON.stringify(adverseScenarioCandidateSemantics(payload?.observation)) !== JSON.stringify(expected);
  })) return false;
  if ([...FIXTURE_REVIEW_SEMANTICS].some(([eventKey, expected]) => {
    const receipt = audit.receipts.find((row) => row.event_key === eventKey && row.operation === 'review');
    const payload = receipt ? parsedJson(receipt.canonical_payload_json) : undefined;
    return JSON.stringify(reviewSemantics(payload?.review)) !== JSON.stringify(expected);
  })) return false;
  const ids = new Set(value.map((scenario) => scenario?.id));
  if (ids.size !== SCENARIO_OUTCOMES.size || [...SCENARIO_OUTCOMES.keys()].some((id) => !ids.has(id))) return false;
  const observations = new Map(audit?.observations?.map((row) => [row.id, row]));
  const reviews = new Map(audit?.reviews?.map((row) => [row.id, row]));
  const promotions = new Map(audit?.promotions?.map((row) => [row.observation_id, row]));
  const memories = new Map(audit?.memories?.map((row) => [row.id, row]));
  if (audit.scenario_trace.length !== value.length) return false;
  return value.every((scenario) => {
    if (!sameKeys(scenario, SCENARIO_KEYS)) return false;
    const traceEntry = audit.scenario_trace.find((entry) => entry.id === scenario.id);
    const traceScenario = traceEntry && Object.fromEntries(SCENARIO_KEYS.map((key) => [key, traceEntry[key]]));
    if (scenario.outcome !== SCENARIO_OUTCOMES.get(scenario.id)
      || JSON.stringify(scenario.event_keys) !== JSON.stringify(SCENARIO_EVENT_KEYS.get(scenario.id) ?? [])
      || !traceEntry || JSON.stringify(traceScenario) !== JSON.stringify(scenario)
      || traceEntry.entry_sha256 !== sha256(JSON.stringify(scenario))
      || !(SCENARIO_RECEIPT_KEYS.get(scenario.id) ?? []).every((eventKey) => audit.receipts.some((receipt) => receipt.event_key === eventKey))
      || !Number.isInteger(scenario.harmful_promotions) || scenario.harmful_promotions < 0
      || !uniqueStrings(scenario.observation_ids, true) || !uniqueStrings(scenario.review_ids, true)
      || !uniqueStrings(scenario.memory_ids, true) || !uniqueStrings(scenario.support_ids, true)
      || !validRowCounts(scenario.row_counts_before) || !validRowCounts(scenario.row_counts_after)
      || ROW_COUNT_KEYS.some((key) => scenario.row_counts_after[key] < scenario.row_counts_before[key])
      || scenario.observation_ids.some((id) => !observations.has(id)) || scenario.review_ids.some((id) => !reviews.has(id))
      || scenario.memory_ids.some((id) => !memories.has(id)) || scenario.support_ids.some((id) => !audit.evidence_ids.includes(id))) return false;
    const scenarioReceipts = (SCENARIO_RECEIPT_KEYS.get(scenario.id) ?? []).map((eventKey) => audit.receipts.find((receipt) => receipt.event_key === eventKey));
    if (scenarioReceipts.some((receipt) => !receipt)
      || scenarioReceipts.some((receipt) => receipt.observation_id !== null && !scenario.observation_ids.includes(receipt.observation_id)
        || receipt.review_id !== null && !scenario.review_ids.includes(receipt.review_id)
        || receipt.memory_id !== null && !scenario.memory_ids.includes(receipt.memory_id))) return false;
    if (scenario.outcome === 'blocked') return scenario.policy === null && scenario.observation_ids.length === 0
      && scenario.review_ids.length === 0 && scenario.memory_ids.length === 0 && scenario.support_ids.length === 0
      && ROW_COUNT_KEYS.every((key) => scenario.row_counts_before[key] === scenario.row_counts_after[key]);
    const exactScenarioDeltas = {
      negated: { evidence: 2, events: 2, observations: 1, reviews: 1 },
      failed: { evidence: 3, events: 3, observations: 1, reviews: 1 },
      stale_procedure: { evidence: 2, events: 2, observations: 1, reviews: 1 },
      changing_requirement: { evidence: 7, events: 7, observations: 2, reviews: 2, promotions: 2, memories: 2, fts: 2 },
      correction: { evidence: 3, events: 3, observations: 1, reviews: 1, promotions: 1, memories: 1, fts: 1 },
      topic_supersession: { evidence: 3, events: 3, observations: 1, reviews: 1, promotions: 1, memories: 1, fts: 1 },
    };
    if (!validRowDelta(scenario.row_counts_before, scenario.row_counts_after, exactScenarioDeltas[scenario.id])) return false;
    if (['changing_requirement', 'correction', 'topic_supersession'].includes(scenario.id)) {
      if (JSON.stringify(scenario.row_counts_after) !== JSON.stringify(attributableWrites?.promotion?.row_counts_after)) return false;
      if (scenario.id !== 'changing_requirement'
        && JSON.stringify(scenario.row_counts_before) !== JSON.stringify(attributableWrites?.submit?.row_counts_before)) return false;
    }
    if (!sameKeys(scenario.policy, POLICY_KEYS) || !isString(scenario.policy.id) || !isString(scenario.policy.version)
      || scenario.review_ids.length === 0 || scenario.support_ids.length === 0) return false;
    const linkedReviews = scenario.review_ids.map((id) => reviews.get(id));
    const linkedObservations = scenario.observation_ids.map((id) => observations.get(id));
    const expectedReviews = [...reviews.values()].filter((review) => scenario.observation_ids.includes(review.observation_id));
    const expectedSupportIds = [...new Set([...linkedObservations.flatMap((observation) => observation.support_ids),
      ...expectedReviews.flatMap((review) => review.support_ids)])];
    if (!sameStringSet(scenario.review_ids, expectedReviews.map((review) => review.id))
      || !sameStringSet(scenario.support_ids, expectedSupportIds)
      || linkedReviews.some((review) => !scenario.observation_ids.includes(review.observation_id)
      || review.policy_id !== scenario.policy.id || review.policy_version !== scenario.policy.version
      || review.support_ids.some((id) => !scenario.support_ids.includes(id)))
      || linkedObservations.some((observation) => observation.support_ids.some((id) => !scenario.support_ids.includes(id)))) return false;
    if (scenario.outcome === 'rejected') return scenario.memory_ids.length === 0 && linkedReviews.every((review) => review.verdict === 'rejected')
      && scenario.observation_ids.every((id) => !promotions.has(id));
    if (scenario.outcome === 'accepted') return scenario.memory_ids.length === 0 && linkedReviews.every((review) => review.verdict === 'accepted')
      && scenario.observation_ids.every((id) => !promotions.has(id));
    const predecessorId = observations.get(lineage.observation_id)?.predecessor_id;
    const completeObservationIds = predecessorId ? [predecessorId, lineage.observation_id] : [];
    const completePromotions = completeObservationIds.map((id) => promotions.get(id));
    if (!predecessorId || !sameStringSet(scenario.observation_ids, completeObservationIds)
      || completePromotions.some((promotion) => !promotion)
      || !sameStringSet(scenario.memory_ids, completePromotions.map((promotion) => promotion.memory_id))
      || linkedReviews.some((review) => review.verdict !== 'accepted')) return false;
    if (scenario.row_counts_after.promotions <= scenario.row_counts_before.promotions
      || scenario.row_counts_after.memories <= scenario.row_counts_before.memories
      || scenario.row_counts_after.fts <= scenario.row_counts_before.fts) return false;
    if (scenario.id === 'changing_requirement') return scenario.observation_ids.includes(lineage.observation_id)
      && scenario.memory_ids.includes(lineage.memory_id) && scenario.observation_ids.some((id) => observations.get(lineage.observation_id)?.predecessor_id === id);
    if (scenario.id === 'correction') return scenario.observation_ids.includes(lineage.observation_id)
      && scenario.memory_ids.includes(lineage.memory_id);
    if (scenario.id === 'topic_supersession') {
      const finalMemory = memories.get(lineage.memory_id);
      return scenario.observation_ids.includes(lineage.observation_id) && scenario.memory_ids.includes(lineage.memory_id)
        && finalMemory?.status === 'current' && scenario.memory_ids.some((id) => id !== lineage.memory_id
          && memories.get(id)?.status === 'superseded' && memories.get(id)?.topic_key === finalMemory.topic_key);
    }
    return true;
  });
}

export function evaluateObservationOutcome(report) {
  const reasons = [];
  const conditions = report?.conditions;
  const control = report?.control;
  const candidate = report?.candidate;
  if (conditions?.model_calls !== 0 || conditions?.network_calls !== 0) reasons.push('nonzero_external_calls');
  if (JSON.stringify(control?.memory) !== JSON.stringify(candidate?.memory)) reasons.push('final_memory_mismatch');
  if (JSON.stringify(control?.topic_lineage) !== JSON.stringify(candidate?.topic_lineage)) reasons.push('topic_lineage_mismatch');
  if (JSON.stringify(control?.recall?.ordered_signatures) !== JSON.stringify(candidate?.recall?.ordered_signatures)) reasons.push('recall_order_mismatch');
  if (control?.recall?.returned_chars !== candidate?.recall?.returned_chars) reasons.push('recall_payload_mismatch');
  if (control?.recall?.delivery_ratio !== candidate?.recall?.delivery_ratio) reasons.push('delivery_ratio_mismatch');
  if (control?.recall?.useful_content_ratio !== candidate?.recall?.useful_content_ratio) reasons.push('useful_content_ratio_mismatch');
  if (candidate?.safety?.candidate_recall_leaks !== 0) reasons.push('candidate_recall_contamination');
  if (candidate?.safety?.unsupported_promotions !== 0) reasons.push('unsupported_promotion');
  if (candidate?.safety?.rejected_promotions !== 0) reasons.push('rejected_promotion');
  if (candidate?.safety?.unreviewed_promotions !== 0) reasons.push('unreviewed_promotion');
  if (candidate?.scenario_results?.some((scenario) => scenario.harmful_promotions !== 0)) reasons.push('harmful_scenario_promotion');
  if (!control?.provenance?.valid || !candidate?.provenance?.valid || !candidate?.lineage?.complete) reasons.push('invalid_provenance');
  if (candidate?.resources?.recall_latency_p95_ms > control?.resources?.recall_latency_p95_ms * 2) reasons.push('recall_latency_above_2x_control');
  if (candidate?.resources?.sqlite_bytes > control?.resources?.sqlite_bytes * 2) reasons.push('sqlite_bytes_above_2x_control');
  return reasons.length === 0
    ? { status: 'pass', reasons: ['all_observation_gates_passed'] }
    : { status: 'fail', reasons };
}

export function validateObservationReport(report) {
  const errors = [];
  if (!sameKeys(report, TOP_LEVEL_KEYS)) errors.push('shape');
  if (report?.schema !== 'thoth-mem.observation-pipeline-report.v1' || report?.created_at !== new Date(0).toISOString()) errors.push('identity');
  const conditions = report?.conditions;
  if (!sameKeys(conditions, CONDITION_KEYS) || !Number.isInteger(conditions?.seed) || !isPositiveInteger(conditions?.sample_count)
    || !isPositiveInteger(conditions?.top_k) || !isPositiveInteger(conditions?.budget_chars) || !isString(conditions?.query)
    || !Number.isInteger(conditions?.model_calls) || conditions.model_calls < 0 || !Number.isInteger(conditions?.network_calls) || conditions.network_calls < 0) errors.push('conditions');
  const sampleCount = isPositiveInteger(conditions?.sample_count) ? conditions.sample_count : 0;
  if (!validLane(report?.control, LANE_KEYS, sampleCount)) errors.push('control');
  if (!validLane(report?.candidate, CANDIDATE_KEYS, sampleCount)) errors.push('candidate');
  if ((report?.control?.audit && !reconciledLane(report.control)) || (report?.candidate?.audit && !reconciledLane(report.candidate))) errors.push('lane_reconciliation');
  const lineage = report?.candidate?.lineage;
  if (!sameKeys(lineage, LINEAGE_KEYS) || !isString(lineage?.observation_id) || !isString(lineage?.review_id)
    || !isString(lineage?.promotion_evidence_id) || !isString(lineage?.memory_id) || !isStringArray(lineage?.original_support_ids)
    || typeof lineage?.complete !== 'boolean') errors.push('lineage');
  if (report?.candidate && !validLineageReconciliation(report.candidate)) errors.push('lineage_reconciliation');
  const safety = report?.candidate?.safety;
  if (!sameKeys(safety, SAFETY_KEYS) || SAFETY_KEYS.some((key) => !Number.isInteger(safety?.[key]) || safety[key] < 0)) errors.push('safety');
  const audit = report?.candidate?.audit;
  if (!validAudit(audit, report?.candidate?.project_key)) errors.push('audit');
  if (!validAttributableWrites(report?.candidate?.attributable_writes, audit, lineage, report?.candidate?.operations)) {
    errors.push('attributable_writes', 'attributable_write_reconciliation');
  }
  if (!validScenarioResults(report?.candidate?.scenario_results, audit, report?.candidate?.project_key, lineage, report?.candidate?.attributable_writes)) {
    errors.push('scenario_results', 'scenario_reconciliation');
  }
  const operationNames = report?.candidate?.operations?.filter((operation) => operation.outcome === 'confirmed').map((operation) => operation.operation) ?? [];
  if (REQUIRED_CANDIDATE_OPERATIONS.some((operation) => !operationNames.includes(operation))) errors.push('operations');
  const comparison = report?.comparison;
  const expectedComparison = report?.control && report?.candidate ? {
    final_memory_equal: JSON.stringify(report.control.memory) === JSON.stringify(report.candidate.memory),
    topic_lineage_equal: JSON.stringify(report.control.topic_lineage) === JSON.stringify(report.candidate.topic_lineage),
    recall_order_equal: JSON.stringify(report.control.recall.ordered_signatures) === JSON.stringify(report.candidate.recall.ordered_signatures),
    recall_payload_equal: report.control.recall.returned_chars === report.candidate.recall.returned_chars,
    delivery_ratio_equal: report.control.recall.delivery_ratio === report.candidate.recall.delivery_ratio,
    useful_content_ratio_equal: report.control.recall.useful_content_ratio === report.candidate.recall.useful_content_ratio,
    recall_latency_p95_ratio: ratio(report.candidate.resources.recall_latency_p95_ms, report.control.resources.recall_latency_p95_ms),
    sqlite_bytes_ratio: ratio(report.candidate.resources.sqlite_bytes, report.control.resources.sqlite_bytes),
  } : undefined;
  if (!sameKeys(comparison, COMPARISON_KEYS) || !expectedComparison
    || COMPARISON_KEYS.some((key) => typeof comparison[key] !== typeof expectedComparison[key]
      || (typeof comparison[key] === 'number' ? !Number.isFinite(comparison[key]) || !sameValue(comparison[key], expectedComparison[key]) : comparison[key] !== expectedComparison[key]))) errors.push('comparison');
  if (!Array.isArray(report?.errors) || report.errors.some((error) => !sameKeys(error, ['operation', 'code', 'message']) || !isString(error.operation) || !isString(error.code) || !isString(error.message))) errors.push('errors');
  const decision = report?.decision;
  const expectedDecision = evaluateObservationOutcome(report);
  if (!sameKeys(decision, DECISION_KEYS) || !['pass', 'fail'].includes(decision?.status) || !isStringArray(decision?.reasons)
    || JSON.stringify(decision) !== JSON.stringify(expectedDecision)) errors.push('decision');
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}
