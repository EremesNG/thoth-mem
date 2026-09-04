import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { evaluateObservationOutcome, validateObservationReport } from '../../benchmarks/observation-pipeline/report.mjs';

const samples = [1, 1, 1, 1, 2];
const memory = { kind: 'architecture', title: 'Local core', content: 'Keep memory local.', topic_key: 'core/local', outcome: 'succeeded' };
const recall = { ordered_signatures: ['architecture|Local core|Keep memory local.'], returned_chars: 18, delivery_ratio: 1, useful_content_ratio: 1 };
const resources = { recall_latency_p95_ms: 2, recall_latency_samples_ms: samples, sqlite_bytes: 100 };
const rowCounts = { evidence: 10, events: 10, observations: 5, reviews: 5, promotions: 1, memories: 1, fts: 1 };
const digest = (value: string) => createHash('sha256').update(value.normalize('NFC')).digest('hex');
const stableUuid = (value: string) => {
  const hex = digest(value);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const writePayloads = {
  submit: JSON.stringify({ eventKey: 'candidate:submit', observation: { supportIds: ['evidence:source'], predecessorId: 'observation:initial', proposedMemory: { kind: 'architecture', title: 'Local core', content: 'Keep memory local.', topicKey: 'core/local', outcome: 'succeeded' } } }),
  review: JSON.stringify({ eventKey: 'candidate:review', review: { observationId: 'observation:1', supportIds: ['evidence:prompt'], policy: { id: 'benchmark', version: '1' } } }),
  promotion: JSON.stringify({ eventKey: 'candidate:promotion', observationId: 'observation:1' }),
};
const canonicalCandidatePayload = (supportIds: string[], proposedMemory: Record<string, unknown>, predecessorId?: string, semantic: Record<string, unknown> = {}) => JSON.stringify({
  schema: 'thoth-mem.observation.v1',
  observation: {
    kind: 'fact', scope: 'project', title: proposedMemory.title, claim: proposedMemory.content,
    ...semantic, proposedMemory, supportIds, generator: { kind: 'root_agent', name: 'benchmark' }, ...(predecessorId ? { predecessorId } : {}),
  },
});
const canonicalReviewPayload = (observationId: string, supportIds: string[], verdict: 'accepted' | 'rejected' = 'accepted', basis = 'root_user_confirmed', reason = 'Confirmed.') => JSON.stringify({
  schema: 'thoth-mem.observation-review.v1', review: { observationId, verdict, basis, policy: { id: 'benchmark', version: '1' }, reason, supportIds },
});
const canonicalMemory = { kind: 'architecture', title: 'Local core', content: 'Keep memory local.', topicKey: 'core/local', outcome: 'succeeded' };
const negatedMemory = { kind: 'discovery', title: 'Rejected fixture', content: 'This content must remain outside recall.', outcome: 'unknown' };
const failedMemory = { kind: 'failure', title: 'Observed failed check', content: 'Remember the attributable failed compatibility check.', outcome: 'failed' };
const staleMemory = { kind: 'convention', title: 'Stale procedure', content: 'Use the superseded setup procedure.', outcome: 'unknown' };
const negatedSemantic = { kind: 'fact', title: 'Rejected fixture', claim: 'This rejected candidate must never be promoted.' };
const failedSemantic = { kind: 'failure', title: 'Observed failed check', claim: 'The compatibility check fails under the recorded fixture.' };
const staleSemantic = { kind: 'procedure', title: 'Stale procedure', claim: 'Use the superseded setup procedure.' };
const initialSemantic = { kind: 'constraint', title: 'Local file core', claim: 'The persistent memory core remains local.' };
const currentSemantic = { kind: 'constraint', title: 'Local SQLite core', claim: 'The persistent memory core remains fully local and SQLite-first.' };
const auditedCandidateProjection = (supportIds: string[], proposedMemory: Record<string, any>, predecessorId?: string, semantic: Record<string, any> = {}) => ({
  predecessor_id: predecessorId ?? null, scope: 'project', coverage: null,
  kind: semantic.kind ?? 'fact', title: semantic.title ?? proposedMemory.title, claim: semantic.claim ?? proposedMemory.content,
  proposed_memory: {
    kind: proposedMemory.kind, title: proposedMemory.title, content: proposedMemory.content,
    topic_key: proposedMemory.topicKey ?? null, outcome: proposedMemory.outcome ?? 'unknown',
  },
  generator: { kind: 'root_agent', name: 'benchmark', version: null, config_hash: null }, concepts: [], files: [], support_ids: supportIds,
});
const staticReceiptPayloads: Record<string, string> = {
  'candidate:submit': canonicalCandidatePayload(['evidence:source'], canonicalMemory, 'observation:initial', currentSemantic),
  'candidate:review': canonicalReviewPayload('observation:1', ['evidence:prompt'], 'accepted', 'root_user_confirmed', 'Explicitly confirmed by the root user.'),
  'candidate:promotion': JSON.stringify({ observationId: 'observation:1' }),
  'candidate:initial': canonicalCandidatePayload(['evidence:source'], canonicalMemory, undefined, initialSemantic),
  'candidate:initial:review': canonicalReviewPayload('observation:initial', ['evidence:initial-prompt'], 'accepted', 'root_user_confirmed', 'Initial local requirement confirmed.'),
  'candidate:initial:promotion': JSON.stringify({ observationId: 'observation:initial' }),
  'candidate:confirmation': JSON.stringify({ evidence: { kind: 'root_prompt', content: 'Confirm the local SQLite architecture as durable project memory.' }, memory: null }),
  'candidate:rejected': canonicalCandidatePayload(['evidence:source'], negatedMemory, undefined, negatedSemantic),
  'candidate:rejected:review': canonicalReviewPayload('observation:negated', ['evidence:rejected-prompt'], 'rejected', 'root_user_confirmed', 'Benchmark rejection fixture.'),
  'candidate:failed': canonicalCandidatePayload(['evidence:source'], failedMemory, undefined, failedSemantic),
  'candidate:failed:validation': JSON.stringify({
    evidence: {
      kind: 'explicit_save', content: 'The failure was reproduced.',
      metadata: { observation_validation: { observation_id: 'observation:failed', result: 'passed', method: 'offline reproduction' } },
    },
    memory: null,
  }),
  'candidate:failed:review': canonicalReviewPayload('observation:failed', ['evidence:validation'], 'accepted', 'observable_validation', 'The failure is reproducible.'),
  'candidate:stale': canonicalCandidatePayload(['evidence:source'], staleMemory, undefined, staleSemantic),
  'candidate:stale:review': canonicalReviewPayload('observation:stale', ['evidence:stale-prompt'], 'rejected', 'root_user_confirmed', 'The procedure is stale.'),
};
const receiptHash = (eventKey: string) => createHash('sha256').update(staticReceiptPayloads[eventKey]).digest('hex');
const writeMetric = (operation: 'submit' | 'review' | 'promotion') => {
  const expectedOperation = { submit: 'candidate', review: 'review', promotion: 'promotion' }[operation];
  const deltas = {
    submit: { evidence: 1, events: 1, observations: 1 },
    review: { evidence: 1, events: 1, reviews: 1 },
    promotion: { evidence: 1, events: 1, promotions: 1, memories: 1, fts: 1 },
  }[operation];
  const priorDeltas = {
    submit: {},
    review: { evidence: 1, events: 1, observations: 1 },
    promotion: { evidence: 2, events: 2, observations: 1, reviews: 1 },
  }[operation];
  const before = Object.fromEntries(Object.entries(rowCounts).map(([key, value]) => [key, value + ((priorDeltas as Record<string, number>)[key] ?? 0)]));
  const after = Object.fromEntries(Object.entries(before).map(([key, value]) => [key, value + ((deltas as Record<string, number>)[key] ?? 0)]));
  const resultIds = {
    submit: ['observation:1', 'evidence:submit'],
    review: ['review:1', 'evidence:review'],
    promotion: ['memory:candidate', 'evidence:promotion'],
  }[operation];
  return {
    operation: expectedOperation, event_key: `candidate:${operation === 'promotion' ? 'promotion' : operation}`,
    payload_json: writePayloads[operation], payload_sha256: createHash('sha256').update(writePayloads[operation]).digest('hex'),
    receipt_payload_hash: receiptHash(`candidate:${operation === 'promotion' ? 'promotion' : operation}`),
    result_ids: resultIds, row_counts_before: before, row_counts_after: after,
    latency_p50_ms: 1, latency_p95_ms: 1, latency_samples_ms: [1], sqlite_bytes_before: 100,
    sqlite_bytes_after: 110, sqlite_bytes_delta: 10, payload_chars: writePayloads[operation].length,
  };
};
const scenarioOutcomes = {
  poisoned: 'blocked', negated: 'rejected', cross_scope: 'blocked', failed: 'accepted',
  changing_requirement: 'promoted', stale_procedure: 'rejected', correction: 'promoted', topic_supersession: 'promoted',
} as const;
const reportFixture = {
  schema: 'thoth-mem.observation-pipeline-report.v1',
  created_at: '1970-01-01T00:00:00.000Z',
  conditions: { seed: 17, sample_count: 5, top_k: 5, budget_chars: 1_000, query: 'local memory core', model_calls: 0, network_calls: 0 },
  control: {
    project_key: 'benchmark:observation:control', memory: { ...memory }, topic_lineage: ['core/local|superseded|Local core|Keep memory local.|succeeded', 'core/local|current|Local core|Keep memory local.|succeeded'], recall: { ...recall, ordered_signatures: [...recall.ordered_signatures] }, resources: { ...resources, recall_latency_samples_ms: [...resources.recall_latency_samples_ms] },
    operations: [{ operation: 'direct_promotion', outcome: 'confirmed', source_ids: ['evidence:control'], record_ids: ['memory:control'] }],
    audit: {
      project_id: stableUuid('project:benchmark:observation:control'),
      row_counts: { evidence: 2, events: 0, observations: 0, reviews: 0, promotions: 0, memories: 2, fts: 2 },
      evidence_ids: ['evidence:control-initial', 'evidence:control'], evidence_rows: [], event_evidence_ids: [], observations: [], reviews: [], promotions: [],
      memories: [
        { id: 'memory:control-initial', kind: 'architecture', title: 'Local core', content: 'Keep memory local.', topic_key: 'core/local', outcome: 'succeeded', status: 'superseded', supersedes_id: null, valid_from: '1970-01-01T00:00:00.000Z', evidence_ids: ['evidence:control-initial'] },
        { id: 'memory:control', kind: 'architecture', title: 'Local core', content: 'Keep memory local.', topic_key: 'core/local', outcome: 'succeeded', status: 'current', supersedes_id: 'memory:control-initial', valid_from: '1970-01-01T00:00:01.000Z', evidence_ids: ['evidence:control'] },
      ],
      fts_memory_ids: ['memory:control-initial', 'memory:control'],
      receipts: [],
      scenario_trace: [], trace_sha256: createHash('sha256').update('[]').digest('hex'),
    },
    provenance: { valid: true, source_ids: ['evidence:control', 'memory:control'] },
  },
  candidate: {
    project_key: 'benchmark:observation:candidate', memory: { ...memory }, topic_lineage: ['core/local|superseded|Local core|Keep memory local.|succeeded', 'core/local|current|Local core|Keep memory local.|succeeded'], recall: { ...recall, ordered_signatures: [...recall.ordered_signatures] }, resources: { ...resources, recall_latency_samples_ms: [...resources.recall_latency_samples_ms] },
    operations: [
      { operation: 'candidate_submit', outcome: 'confirmed', source_ids: ['evidence:source', 'evidence:submit'], record_ids: ['observation:1'] },
      { operation: 'review_accept', outcome: 'confirmed', source_ids: ['evidence:prompt', 'evidence:review'], record_ids: ['review:1'] },
      { operation: 'explicit_promotion', outcome: 'confirmed', source_ids: ['evidence:promotion'], record_ids: ['memory:candidate'] },
    ],
    lineage: { observation_id: 'observation:1', review_id: 'review:1', promotion_evidence_id: 'evidence:promotion', memory_id: 'memory:candidate', original_support_ids: ['evidence:source'], complete: true },
    safety: { unsupported_promotions: 0, rejected_promotions: 0, unreviewed_promotions: 0, candidate_recall_leaks: 0 },
    attributable_writes: { submit: writeMetric('submit'), review: writeMetric('review'), promotion: writeMetric('promotion') },
    scenario_results: [
      { id: 'poisoned', event_keys: ['candidate:poisoned'], outcome: 'blocked', harmful_promotions: 0, observation_ids: [], review_ids: [], memory_ids: [], support_ids: [], policy: null, row_counts_before: rowCounts, row_counts_after: rowCounts },
      { id: 'negated', event_keys: ['candidate:rejected', 'candidate:rejected:review', 'candidate:rejected:promotion'], outcome: 'rejected', harmful_promotions: 0, observation_ids: ['observation:negated'], review_ids: ['review:negated'], memory_ids: [], support_ids: ['evidence:source', 'evidence:rejected-prompt'], policy: { id: 'benchmark', version: '1' }, row_counts_before: rowCounts, row_counts_after: { ...rowCounts, evidence: 12, events: 12, observations: 6, reviews: 6 } },
      { id: 'cross_scope', event_keys: ['candidate:cross-scope'], outcome: 'blocked', harmful_promotions: 0, observation_ids: [], review_ids: [], memory_ids: [], support_ids: [], policy: null, row_counts_before: rowCounts, row_counts_after: rowCounts },
      { id: 'failed', event_keys: ['candidate:failed', 'candidate:failed:validation', 'candidate:failed:review'], outcome: 'accepted', harmful_promotions: 0, observation_ids: ['observation:failed'], review_ids: ['review:failed'], memory_ids: [], support_ids: ['evidence:source', 'evidence:validation'], policy: { id: 'benchmark', version: '1' }, row_counts_before: rowCounts, row_counts_after: { ...rowCounts, evidence: 13, events: 13, observations: 6, reviews: 6 } },
      { id: 'changing_requirement', event_keys: ['candidate:initial', 'candidate:initial:review', 'candidate:initial:promotion', 'candidate:confirmation', 'candidate:submit', 'candidate:review', 'candidate:promotion'], outcome: 'promoted', harmful_promotions: 0, observation_ids: ['observation:initial', 'observation:1'], review_ids: ['review:initial', 'review:1'], memory_ids: ['memory:initial', 'memory:candidate'], support_ids: ['evidence:source', 'evidence:initial-prompt', 'evidence:prompt'], policy: { id: 'benchmark', version: '1' }, row_counts_before: { ...rowCounts, evidence: 6, events: 6, observations: 4, reviews: 4, promotions: 0, memories: 0, fts: 0 }, row_counts_after: { ...rowCounts, evidence: 13, events: 13, observations: 6, reviews: 6, promotions: 2, memories: 2, fts: 2 } },
      { id: 'stale_procedure', event_keys: ['candidate:stale', 'candidate:stale:review'], outcome: 'rejected', harmful_promotions: 0, observation_ids: ['observation:stale'], review_ids: ['review:stale'], memory_ids: [], support_ids: ['evidence:source', 'evidence:stale-prompt'], policy: { id: 'benchmark', version: '1' }, row_counts_before: rowCounts, row_counts_after: { ...rowCounts, evidence: 12, events: 12, observations: 6, reviews: 6 } },
      { id: 'correction', event_keys: ['candidate:submit', 'candidate:review', 'candidate:promotion'], outcome: 'promoted', harmful_promotions: 0, observation_ids: ['observation:initial', 'observation:1'], review_ids: ['review:initial', 'review:1'], memory_ids: ['memory:initial', 'memory:candidate'], support_ids: ['evidence:source', 'evidence:initial-prompt', 'evidence:prompt'], policy: { id: 'benchmark', version: '1' }, row_counts_before: rowCounts, row_counts_after: { ...rowCounts, evidence: 13, events: 13, observations: 6, reviews: 6, promotions: 2, memories: 2, fts: 2 } },
      { id: 'topic_supersession', event_keys: ['candidate:submit', 'candidate:review', 'candidate:promotion'], outcome: 'promoted', harmful_promotions: 0, observation_ids: ['observation:initial', 'observation:1'], review_ids: ['review:initial', 'review:1'], memory_ids: ['memory:initial', 'memory:candidate'], support_ids: ['evidence:source', 'evidence:initial-prompt', 'evidence:prompt'], policy: { id: 'benchmark', version: '1' }, row_counts_before: rowCounts, row_counts_after: { ...rowCounts, evidence: 13, events: 13, observations: 6, reviews: 6, promotions: 2, memories: 2, fts: 2 } },
    ],
    audit: {
      project_id: stableUuid('project:benchmark:observation:candidate'),
      row_counts: { evidence: 18, events: 18, observations: 5, reviews: 5, promotions: 2, memories: 2, fts: 2 },
      evidence_ids: ['evidence:source', 'evidence:prompt', 'evidence:initial-prompt', 'evidence:rejected-prompt', 'evidence:stale-prompt', 'evidence:submit', 'evidence:review', 'evidence:promotion', 'evidence:validation', 'evidence:initial-submit', 'evidence:initial-review', 'evidence:initial-promotion', 'evidence:negated-submit', 'evidence:negated-review', 'evidence:failed-submit', 'evidence:failed-review', 'evidence:stale-submit', 'evidence:stale-review'],
      evidence_rows: [],
      event_evidence_ids: ['evidence:source', 'evidence:prompt', 'evidence:initial-prompt', 'evidence:rejected-prompt', 'evidence:stale-prompt', 'evidence:submit', 'evidence:review', 'evidence:promotion', 'evidence:validation', 'evidence:initial-submit', 'evidence:initial-review', 'evidence:initial-promotion', 'evidence:negated-submit', 'evidence:negated-review', 'evidence:failed-submit', 'evidence:failed-review', 'evidence:stale-submit', 'evidence:stale-review'],
      observations: [
        { id: 'observation:initial', submission_evidence_id: 'evidence:initial-submit', ...auditedCandidateProjection(['evidence:source'], canonicalMemory, undefined, initialSemantic) },
        { id: 'observation:1', submission_evidence_id: 'evidence:submit', ...auditedCandidateProjection(['evidence:source'], canonicalMemory, 'observation:initial', currentSemantic) },
        { id: 'observation:negated', submission_evidence_id: 'evidence:negated-submit', ...auditedCandidateProjection(['evidence:source'], negatedMemory, undefined, negatedSemantic) },
        { id: 'observation:failed', submission_evidence_id: 'evidence:failed-submit', ...auditedCandidateProjection(['evidence:source'], failedMemory, undefined, failedSemantic) },
        { id: 'observation:stale', submission_evidence_id: 'evidence:stale-submit', ...auditedCandidateProjection(['evidence:source'], staleMemory, undefined, staleSemantic) },
      ],
      reviews: [
        { id: 'review:initial', observation_id: 'observation:initial', review_evidence_id: 'evidence:initial-review', verdict: 'accepted', basis: 'root_user_confirmed', reason: 'Initial local requirement confirmed.', policy_id: 'benchmark', policy_version: '1', support_ids: ['evidence:initial-prompt'] },
        { id: 'review:1', observation_id: 'observation:1', review_evidence_id: 'evidence:review', verdict: 'accepted', basis: 'root_user_confirmed', reason: 'Explicitly confirmed by the root user.', policy_id: 'benchmark', policy_version: '1', support_ids: ['evidence:prompt'] },
        { id: 'review:negated', observation_id: 'observation:negated', review_evidence_id: 'evidence:negated-review', verdict: 'rejected', basis: 'root_user_confirmed', reason: 'Benchmark rejection fixture.', policy_id: 'benchmark', policy_version: '1', support_ids: ['evidence:rejected-prompt'] },
        { id: 'review:failed', observation_id: 'observation:failed', review_evidence_id: 'evidence:failed-review', verdict: 'accepted', basis: 'observable_validation', reason: 'The failure is reproducible.', policy_id: 'benchmark', policy_version: '1', support_ids: ['evidence:validation'] },
        { id: 'review:stale', observation_id: 'observation:stale', review_evidence_id: 'evidence:stale-review', verdict: 'rejected', basis: 'root_user_confirmed', reason: 'The procedure is stale.', policy_id: 'benchmark', policy_version: '1', support_ids: ['evidence:stale-prompt'] },
      ],
      promotions: [
        { observation_id: 'observation:initial', promotion_evidence_id: 'evidence:initial-promotion', memory_id: 'memory:initial' },
        { observation_id: 'observation:1', promotion_evidence_id: 'evidence:promotion', memory_id: 'memory:candidate' },
      ],
      memories: [
        { id: 'memory:initial', kind: 'architecture', title: 'Local core', content: 'Keep memory local.', topic_key: 'core/local', outcome: 'succeeded', status: 'superseded', supersedes_id: null, valid_from: '1970-01-01T00:00:00.000Z', evidence_ids: ['evidence:source', 'evidence:initial-prompt', 'evidence:initial-submit', 'evidence:initial-review', 'evidence:initial-promotion'] },
        { id: 'memory:candidate', kind: 'architecture', title: 'Local core', content: 'Keep memory local.', topic_key: 'core/local', outcome: 'succeeded', status: 'current', supersedes_id: 'memory:initial', valid_from: '1970-01-01T00:00:01.000Z', evidence_ids: ['evidence:source', 'evidence:prompt', 'evidence:submit', 'evidence:review', 'evidence:promotion'] },
      ],
      fts_memory_ids: ['memory:initial', 'memory:candidate'],
      receipts: [
        { operation: 'candidate', event_key: 'candidate:submit', canonical_payload_json: staticReceiptPayloads['candidate:submit'], payload_hash: receiptHash('candidate:submit'), evidence_id: 'evidence:submit', observation_id: 'observation:1', review_id: null, memory_id: null },
        { operation: 'review', event_key: 'candidate:review', canonical_payload_json: staticReceiptPayloads['candidate:review'], payload_hash: receiptHash('candidate:review'), evidence_id: 'evidence:review', observation_id: 'observation:1', review_id: 'review:1', memory_id: null },
        { operation: 'promotion', event_key: 'candidate:promotion', canonical_payload_json: staticReceiptPayloads['candidate:promotion'], payload_hash: receiptHash('candidate:promotion'), evidence_id: 'evidence:promotion', observation_id: 'observation:1', review_id: 'review:1', memory_id: 'memory:candidate' },
        { operation: 'candidate', event_key: 'candidate:initial', canonical_payload_json: staticReceiptPayloads['candidate:initial'], payload_hash: receiptHash('candidate:initial'), evidence_id: 'evidence:initial-submit', observation_id: 'observation:initial', review_id: null, memory_id: null },
        { operation: 'review', event_key: 'candidate:initial:review', canonical_payload_json: staticReceiptPayloads['candidate:initial:review'], payload_hash: receiptHash('candidate:initial:review'), evidence_id: 'evidence:initial-review', observation_id: 'observation:initial', review_id: 'review:initial', memory_id: null },
        { operation: 'promotion', event_key: 'candidate:initial:promotion', canonical_payload_json: staticReceiptPayloads['candidate:initial:promotion'], payload_hash: receiptHash('candidate:initial:promotion'), evidence_id: 'evidence:initial-promotion', observation_id: 'observation:initial', review_id: 'review:initial', memory_id: 'memory:initial' },
        { operation: 'save', event_key: 'candidate:confirmation', canonical_payload_json: staticReceiptPayloads['candidate:confirmation'], payload_hash: receiptHash('candidate:confirmation'), evidence_id: 'evidence:prompt', observation_id: null, review_id: null, memory_id: null },
        { operation: 'candidate', event_key: 'candidate:rejected', canonical_payload_json: staticReceiptPayloads['candidate:rejected'], payload_hash: receiptHash('candidate:rejected'), evidence_id: 'evidence:negated-submit', observation_id: 'observation:negated', review_id: null, memory_id: null },
        { operation: 'review', event_key: 'candidate:rejected:review', canonical_payload_json: staticReceiptPayloads['candidate:rejected:review'], payload_hash: receiptHash('candidate:rejected:review'), evidence_id: 'evidence:negated-review', observation_id: 'observation:negated', review_id: 'review:negated', memory_id: null },
        { operation: 'candidate', event_key: 'candidate:failed', canonical_payload_json: staticReceiptPayloads['candidate:failed'], payload_hash: receiptHash('candidate:failed'), evidence_id: 'evidence:failed-submit', observation_id: 'observation:failed', review_id: null, memory_id: null },
        { operation: 'save', event_key: 'candidate:failed:validation', canonical_payload_json: staticReceiptPayloads['candidate:failed:validation'], payload_hash: receiptHash('candidate:failed:validation'), evidence_id: 'evidence:validation', observation_id: null, review_id: null, memory_id: null },
        { operation: 'review', event_key: 'candidate:failed:review', canonical_payload_json: staticReceiptPayloads['candidate:failed:review'], payload_hash: receiptHash('candidate:failed:review'), evidence_id: 'evidence:failed-review', observation_id: 'observation:failed', review_id: 'review:failed', memory_id: null },
        { operation: 'candidate', event_key: 'candidate:stale', canonical_payload_json: staticReceiptPayloads['candidate:stale'], payload_hash: receiptHash('candidate:stale'), evidence_id: 'evidence:stale-submit', observation_id: 'observation:stale', review_id: null, memory_id: null },
        { operation: 'review', event_key: 'candidate:stale:review', canonical_payload_json: staticReceiptPayloads['candidate:stale:review'], payload_hash: receiptHash('candidate:stale:review'), evidence_id: 'evidence:stale-review', observation_id: 'observation:stale', review_id: 'review:stale', memory_id: null },
      ],
      scenario_trace: [] as Array<Record<string, unknown>>, trace_sha256: '',
    },
    provenance: { valid: true, source_ids: ['evidence:source', 'evidence:prompt', 'evidence:submit', 'evidence:review', 'evidence:promotion', 'observation:1', 'review:1', 'memory:candidate'] },
  },
  comparison: { final_memory_equal: true, topic_lineage_equal: true, recall_order_equal: true, recall_payload_equal: true, delivery_ratio_equal: true, useful_content_ratio_equal: true, recall_latency_p95_ratio: 1, sqlite_bytes_ratio: 1 },
  errors: [],
  decision: { status: 'pass', reasons: ['all_observation_gates_passed'] },
};

function remapStrings(value: any, mappings: Array<[string, string]>): any {
  if (typeof value === 'string') return mappings.reduce((current, [from, to]) => current.replaceAll(from, to), value);
  if (Array.isArray(value)) return value.map((item) => remapStrings(item, mappings));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapStrings(item, mappings)]));
  return value;
}

const receiptPrefixes = { save: 'evidence', candidate: 'observation-evidence', review: 'observation-review-evidence', promotion: 'observation-promotion-evidence' } as const;
const candidateProjectId = reportFixture.candidate.audit.project_id;
const receiptEvidenceId = (operation: keyof typeof receiptPrefixes, eventKey: string) => stableUuid(`${receiptPrefixes[operation]}:${candidateProjectId}:${eventKey}`);
const evidenceMappings = [
  ...reportFixture.candidate.audit.receipts.map((receipt) => [receipt.evidence_id, receiptEvidenceId(receipt.operation, receipt.event_key)] as [string, string]),
  ['evidence:source', receiptEvidenceId('save', 'candidate:source')],
  ['evidence:initial-prompt', receiptEvidenceId('save', 'candidate:initial:confirmation')],
  ['evidence:rejected-prompt', receiptEvidenceId('save', 'candidate:rejected:confirmation')],
  ['evidence:stale-prompt', receiptEvidenceId('save', 'candidate:stale:confirmation')],
  ['observation:initial', stableUuid(`observation:${receiptEvidenceId('candidate', 'candidate:initial')}`)],
  ['observation:1', stableUuid(`observation:${receiptEvidenceId('candidate', 'candidate:submit')}`)],
  ['observation:negated', stableUuid(`observation:${receiptEvidenceId('candidate', 'candidate:rejected')}`)],
  ['observation:failed', stableUuid(`observation:${receiptEvidenceId('candidate', 'candidate:failed')}`)],
  ['observation:stale', stableUuid(`observation:${receiptEvidenceId('candidate', 'candidate:stale')}`)],
  ['review:initial', stableUuid(`observation-review:${receiptEvidenceId('review', 'candidate:initial:review')}`)],
  ['review:1', stableUuid(`observation-review:${receiptEvidenceId('review', 'candidate:review')}`)],
  ['review:negated', stableUuid(`observation-review:${receiptEvidenceId('review', 'candidate:rejected:review')}`)],
  ['review:failed', stableUuid(`observation-review:${receiptEvidenceId('review', 'candidate:failed:review')}`)],
  ['review:stale', stableUuid(`observation-review:${receiptEvidenceId('review', 'candidate:stale:review')}`)],
]
  .sort(([left], [right]) => right.length - left.length);
const report = remapStrings(reportFixture, evidenceMappings);
const staticEvidenceById = new Map([
  [receiptEvidenceId('save', 'candidate:source'), { kind: 'explicit_save', content: 'The product requirement fixes the core to local SQLite storage.' }],
  [receiptEvidenceId('save', 'candidate:initial:confirmation'), { kind: 'root_prompt', content: 'Confirm the initial local architecture.' }],
  [receiptEvidenceId('save', 'candidate:rejected:confirmation'), { kind: 'root_prompt', content: 'Reject the benchmark-only invalid candidate.' }],
  [receiptEvidenceId('save', 'candidate:stale:confirmation'), { kind: 'root_prompt', content: 'Reject the stale procedure.' }],
]);
for (const receipt of report.candidate.audit.receipts) receipt.payload_hash = digest(receipt.canonical_payload_json);
for (const metric of Object.values(report.candidate.attributable_writes) as any[]) {
  metric.payload_sha256 = digest(metric.payload_json);
  metric.payload_chars = metric.payload_json.length;
  metric.receipt_payload_hash = report.candidate.audit.receipts.find((receipt: any) => receipt.event_key === metric.event_key).payload_hash;
}

function populateEvidenceRows(audit: typeof report.candidate.audit): void {
  audit.evidence_rows = audit.evidence_ids.map((id) => {
    const receipt = audit.receipts.find((entry) => entry.evidence_id === id);
    const staticEvidence = staticEvidenceById.get(id);
    const savePayload = receipt?.operation === 'save' ? JSON.parse(receipt.canonical_payload_json) : undefined;
    const kind = receipt?.operation === 'candidate' ? 'observation'
      : receipt?.operation === 'review' ? 'observation_review'
        : receipt?.operation === 'promotion' ? 'observation_promotion' : savePayload?.evidence.kind ?? staticEvidence?.kind ?? 'explicit_save';
    const contentJson = receipt && ['candidate', 'review'].includes(receipt.operation)
      ? receipt.canonical_payload_json
      : receipt?.operation === 'promotion'
        ? JSON.stringify({ schema: 'thoth-mem.observation-promotion.v1', promotion: { observationId: receipt.observation_id } })
        : savePayload?.evidence.content ?? staticEvidence?.content ?? JSON.stringify({ evidence_id: id });
    return {
      id, kind, content_json: contentJson, content_hash: digest(contentJson), source_ref: savePayload?.evidence.sourceRef ?? null,
      captured_at: savePayload?.evidence.capturedAt ?? '1970-01-01T00:00:00.000Z',
      metadata_json: JSON.stringify(receipt?.operation === 'candidate' ? { schema: 'thoth-mem.observation.v1' }
        : receipt?.operation === 'review' ? { schema: 'thoth-mem.observation-review.v1' }
          : receipt?.operation === 'promotion' ? { schema: 'thoth-mem.observation-promotion.v1' }
            : savePayload?.evidence.metadata ?? {}),
    };
  });
}

populateEvidenceRows(report.control.audit);
populateEvidenceRows(report.candidate.audit);
report.candidate.audit.scenario_trace = report.candidate.scenario_results.map((scenario) => ({
  ...scenario,
  entry_sha256: createHash('sha256').update(JSON.stringify(scenario)).digest('hex'),
}));
report.candidate.audit.trace_sha256 = createHash('sha256').update(JSON.stringify(report.candidate.audit.scenario_trace)).digest('hex');

function refreshScenarioTrace(candidate: typeof report.candidate): void {
  candidate.audit.scenario_trace = candidate.scenario_results.map((scenario) => ({
    ...scenario,
    entry_sha256: createHash('sha256').update(JSON.stringify(scenario)).digest('hex'),
  }));
  candidate.audit.trace_sha256 = createHash('sha256').update(JSON.stringify(candidate.audit.scenario_trace)).digest('hex');
}

describe('observation pipeline benchmark contract', () => {
  it('accepts a complete equal-budget offline outcome and aligns the machine-readable schema', () => {
    expect(validateObservationReport(report)).toEqual({ valid: true, errors: [] });
    expect(evaluateObservationOutcome(report)).toEqual({ status: 'pass', reasons: ['all_observation_gates_passed'] });
    const schema = JSON.parse(readFileSync('benchmarks/observation-pipeline/report.schema.json', 'utf8'));
    expect(schema.properties.schema.const).toBe('thoth-mem.observation-pipeline-report.v1');
    expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort());
    for (const definition of ['control', 'candidate', 'writeMetric', 'scenarioResult', 'auditObservation', 'auditReview', 'auditMemory', 'auditReceipt', 'auditEvidence', 'traceEntry', 'audit']) {
      expect(schema.$defs[definition].required.sort()).toEqual(Object.keys(schema.$defs[definition].properties).sort());
      expect(schema.$defs[definition].additionalProperties).toBe(false);
    }
    expect(schema.additionalProperties).toBe(false);
  });

  it.each([
    ['contaminated recall', (value: any) => { value.candidate.safety.candidate_recall_leaks = 1; }, 'candidate_recall_contamination'],
    ['unequal final memory', (value: any) => {
      value.candidate.memory.content = 'Drifted.';
      value.candidate.audit.memories.find((memory: { status: string }) => memory.status === 'current').content = 'Drifted.';
      value.candidate.topic_lineage[1] = 'core/local|current|Local core|Drifted.|succeeded';
    }, 'final_memory_mismatch', false],
    ['unsupported promotion', (value: any) => { value.candidate.safety.unsupported_promotions = 1; }, 'unsupported_promotion'],
    ['rejected promotion', (value: any) => { value.candidate.safety.rejected_promotions = 1; }, 'rejected_promotion'],
    ['unreviewed promotion', (value: any) => { value.candidate.safety.unreviewed_promotions = 1; }, 'unreviewed_promotion'],
    ['recall order regression', (value: any) => { value.candidate.recall.ordered_signatures = ['different']; }, 'recall_order_mismatch'],
    ['latency above ceiling', (value: any) => { value.candidate.resources = { ...value.candidate.resources, recall_latency_p95_ms: 5, recall_latency_samples_ms: [5, 5, 5, 5, 5] }; }, 'recall_latency_above_2x_control'],
    ['footprint above ceiling', (value: any) => { value.candidate.resources.sqlite_bytes = 201; }, 'sqlite_bytes_above_2x_control'],
    ['network call', (value: any) => { value.conditions.network_calls = 1; }, 'nonzero_external_calls'],
    ['invalid provenance', (value: any) => { value.candidate.provenance.valid = false; }, 'invalid_provenance'],
  ])('fails closed for %s', (_label, mutate, reason, remainsValid = true) => {
    const candidate = structuredClone(report);
    mutate(candidate);
    candidate.comparison = {
      final_memory_equal: candidate.control.memory.content === candidate.candidate.memory.content,
      topic_lineage_equal: JSON.stringify(candidate.control.topic_lineage) === JSON.stringify(candidate.candidate.topic_lineage),
      recall_order_equal: JSON.stringify(candidate.control.recall.ordered_signatures) === JSON.stringify(candidate.candidate.recall.ordered_signatures),
      recall_payload_equal: candidate.control.recall.returned_chars === candidate.candidate.recall.returned_chars,
      delivery_ratio_equal: candidate.control.recall.delivery_ratio === candidate.candidate.recall.delivery_ratio,
      useful_content_ratio_equal: candidate.control.recall.useful_content_ratio === candidate.candidate.recall.useful_content_ratio,
      recall_latency_p95_ratio: candidate.candidate.resources.recall_latency_p95_ms / candidate.control.resources.recall_latency_p95_ms,
      sqlite_bytes_ratio: candidate.candidate.resources.sqlite_bytes / candidate.control.resources.sqlite_bytes,
    };
    candidate.decision = evaluateObservationOutcome(candidate);
    expect(candidate.decision).toMatchObject({ status: 'fail', reasons: expect.arrayContaining([reason]) });
    if (remainsValid) expect(validateObservationReport(candidate)).toEqual({ valid: true, errors: [] });
    else expect(validateObservationReport(candidate).valid).toBe(false);
  });

  it('rejects missing, forged, or schema-invalid evidence rather than trusting the declared decision', () => {
    expect(validateObservationReport({ ...report, candidate: { ...report.candidate, lineage: undefined } }).valid).toBe(false);
    expect(validateObservationReport({ ...report, candidate: { ...report.candidate, scenario_results: report.candidate.scenario_results.slice(1) } }).errors).toContain('scenario_results');
    expect(validateObservationReport({ ...report, candidate: { ...report.candidate, attributable_writes: { ...report.candidate.attributable_writes, submit: { ...writeMetric, sqlite_bytes_delta: 9 } } } }).errors).toContain('attributable_writes');
    expect(validateObservationReport({ ...report, comparison: { ...report.comparison, sqlite_bytes_ratio: 1.5 } }).errors).toContain('comparison');
    expect(validateObservationReport({ ...report, decision: { status: 'fail', reasons: ['forged'] } }).errors).toContain('decision');
    const forgedScenario = structuredClone(report);
    forgedScenario.candidate.scenario_results.find((scenario: { id: string }) => scenario.id === 'negated').observation_ids = ['forged:observation'];
    expect(validateObservationReport(forgedScenario).errors).toContain('scenario_reconciliation');
    const forgedPayloadAttribution = structuredClone(report);
    forgedPayloadAttribution.candidate.attributable_writes.submit.payload_chars = 1;
    expect(validateObservationReport(forgedPayloadAttribution).errors).toContain('attributable_write_reconciliation');
    const forgedPayloadHash = structuredClone(report);
    forgedPayloadHash.candidate.attributable_writes.submit.payload_sha256 = '0'.repeat(64);
    expect(validateObservationReport(forgedPayloadHash).errors).toContain('attributable_write_reconciliation');
    const forgedWriteCount = structuredClone(report);
    forgedWriteCount.candidate.attributable_writes.review.row_counts_after.reviews = forgedWriteCount.candidate.attributable_writes.review.row_counts_before.reviews;
    expect(validateObservationReport(forgedWriteCount).errors).toContain('attributable_write_reconciliation');
    const forgedPolicy = structuredClone(report);
    const rejectedReviewId = forgedPolicy.candidate.audit.receipts.find((receipt: { event_key: string }) => receipt.event_key === 'candidate:rejected:review').review_id;
    forgedPolicy.candidate.audit.reviews.find((review: { id: string }) => review.id === rejectedReviewId).policy_version = 'forged';
    expect(validateObservationReport(forgedPolicy).errors).toContain('scenario_reconciliation');
    const forgedSupport = structuredClone(report);
    const rejectedObservationId = forgedSupport.candidate.audit.receipts.find((receipt: { event_key: string }) => receipt.event_key === 'candidate:rejected').observation_id;
    forgedSupport.candidate.audit.observations.find((observation: { id: string }) => observation.id === rejectedObservationId).support_ids = ['evidence:missing'];
    expect(validateObservationReport(forgedSupport).errors).toContain('audit');
    const forgedPromotion = structuredClone(report);
    forgedPromotion.candidate.audit.promotions.find((promotion: { observation_id: string }) => promotion.observation_id === forgedPromotion.candidate.lineage.observation_id).memory_id = 'memory:forged';
    expect(validateObservationReport(forgedPromotion).errors).toContain('audit');
    const forgedFts = structuredClone(report);
    forgedFts.candidate.audit.fts_memory_ids = ['memory:initial'];
    expect(validateObservationReport(forgedFts).errors).toContain('audit');
    const forgedChangingCounts = structuredClone(report);
    forgedChangingCounts.candidate.scenario_results.find((scenario: { id: string }) => scenario.id === 'changing_requirement').row_counts_before.evidence = 0;
    expect(validateObservationReport(forgedChangingCounts).errors).toContain('scenario_reconciliation');
    const forgedCorrectionCounts = structuredClone(report);
    forgedCorrectionCounts.candidate.scenario_results.find((scenario: { id: string }) => scenario.id === 'correction').row_counts_before.reviews = 0;
    expect(validateObservationReport(forgedCorrectionCounts).errors).toContain('scenario_reconciliation');
    const forgedTopicCounts = structuredClone(report);
    forgedTopicCounts.candidate.scenario_results.find((scenario: { id: string }) => scenario.id === 'topic_supersession').row_counts_after.evidence -= 1;
    expect(validateObservationReport(forgedTopicCounts).errors).toContain('scenario_reconciliation');
    const unrelatedSupport = structuredClone(report);
    unrelatedSupport.candidate.scenario_results.find((scenario: { id: string }) => scenario.id === 'negated').support_ids.push('evidence:validation');
    expect(validateObservationReport(unrelatedSupport).errors).toContain('scenario_reconciliation');
    const incompleteCorrection = structuredClone(report);
    const correction = incompleteCorrection.candidate.scenario_results.find((scenario: { id: string }) => scenario.id === 'correction');
    correction.observation_ids = [incompleteCorrection.candidate.lineage.observation_id]; correction.review_ids = [incompleteCorrection.candidate.lineage.review_id];
    expect(validateObservationReport(incompleteCorrection).errors).toContain('scenario_reconciliation');
    const incompleteChanging = structuredClone(report);
    const changing = incompleteChanging.candidate.scenario_results.find((scenario: { id: string }) => scenario.id === 'changing_requirement');
    changing.review_ids = [incompleteChanging.candidate.lineage.review_id]; changing.memory_ids = [incompleteChanging.candidate.lineage.memory_id];
    expect(validateObservationReport(incompleteChanging).errors).toContain('scenario_reconciliation');
    const forgedFinalMemory = structuredClone(report);
    forgedFinalMemory.control.memory.content = 'Fabricated shared result.'; forgedFinalMemory.candidate.memory.content = 'Fabricated shared result.';
    expect(validateObservationReport(forgedFinalMemory).errors).toContain('lane_reconciliation');
    const forgedTopicLineage = structuredClone(report);
    forgedTopicLineage.control.topic_lineage = ['fabricated']; forgedTopicLineage.candidate.topic_lineage = ['fabricated'];
    expect(validateObservationReport(forgedTopicLineage).errors).toContain('lane_reconciliation');
    const forgedOriginalSupport = structuredClone(report);
    forgedOriginalSupport.candidate.lineage.original_support_ids = ['evidence:validation'];
    expect(validateObservationReport(forgedOriginalSupport).errors).toContain('lineage_reconciliation');
    const incompleteOperationSource = structuredClone(report);
    incompleteOperationSource.candidate.operations.find((operation: { operation: string }) => operation.operation === 'candidate_submit').source_ids = ['evidence:submit'];
    expect(validateObservationReport(incompleteOperationSource).errors).toContain('lineage_reconciliation');
    const shiftedWindow = structuredClone(report);
    const shiftedCorrection = shiftedWindow.candidate.scenario_results.find((scenario: { id: string }) => scenario.id === 'correction');
    for (const counts of [shiftedCorrection.row_counts_before, shiftedCorrection.row_counts_after]) for (const key of Object.keys(counts)) counts[key] += 100;
    refreshScenarioTrace(shiftedWindow.candidate);
    expect(validateObservationReport(shiftedWindow).errors).toContain('scenario_reconciliation');
    const swappedScenarios = structuredClone(report);
    const negated = swappedScenarios.candidate.scenario_results.find((scenario: { id: string }) => scenario.id === 'negated');
    const stale = swappedScenarios.candidate.scenario_results.find((scenario: { id: string }) => scenario.id === 'stale_procedure');
    for (const key of ['observation_ids', 'review_ids', 'memory_ids', 'support_ids', 'policy']) [negated[key], stale[key]] = [stale[key], negated[key]];
    for (const [leftKey, rightKey] of [['candidate:rejected', 'candidate:stale'], ['candidate:rejected:review', 'candidate:stale:review']]) {
      const left = swappedScenarios.candidate.audit.receipts.find((receipt: { event_key: string }) => receipt.event_key === leftKey);
      const right = swappedScenarios.candidate.audit.receipts.find((receipt: { event_key: string }) => receipt.event_key === rightKey);
      [left.observation_id, right.observation_id] = [right.observation_id, left.observation_id];
      [left.review_id, right.review_id] = [right.review_id, left.review_id];
    }
    refreshScenarioTrace(swappedScenarios.candidate);
    expect(validateObservationReport(swappedScenarios).errors).toContain('scenario_reconciliation');
    expect(validateObservationReport({ ...report, unexpected: true }).errors).toContain('shape');
  });

  it('rejects complete receipt-bundle swaps that preserve only the declared event keys', () => {
    const forged = structuredClone(report);
    const swapReceiptBundles = (leftKey: string, rightKey: string) => {
      const left = forged.candidate.audit.receipts.find((receipt: { event_key: string }) => receipt.event_key === leftKey);
      const right = forged.candidate.audit.receipts.find((receipt: { event_key: string }) => receipt.event_key === rightKey);
      for (const key of ['canonical_payload_json', 'payload_hash', 'evidence_id', 'observation_id', 'review_id', 'memory_id']) {
        [left[key], right[key]] = [right[key], left[key]];
      }
    };
    swapReceiptBundles('candidate:rejected', 'candidate:stale');
    swapReceiptBundles('candidate:rejected:review', 'candidate:stale:review');
    const negated = forged.candidate.scenario_results.find((scenario: { id: string }) => scenario.id === 'negated');
    const stale = forged.candidate.scenario_results.find((scenario: { id: string }) => scenario.id === 'stale_procedure');
    for (const key of ['observation_ids', 'review_ids', 'memory_ids', 'support_ids', 'policy']) {
      [negated[key], stale[key]] = [stale[key], negated[key]];
    }
    refreshScenarioTrace(forged.candidate);
    expect(validateObservationReport(forged).valid).toBe(false);
  });

  it('rejects a save receipt whose canonical envelope no longer describes its evidence', () => {
    const forged = structuredClone(report);
    const receipt = forged.candidate.audit.receipts.find((entry: { event_key: string }) => entry.event_key === 'candidate:failed:validation');
    receipt.canonical_payload_json = '{}';
    receipt.payload_hash = createHash('sha256').update('{}').digest('hex');
    expect(validateObservationReport(forged).valid).toBe(false);
  });

  it('rejects a review receipt whose canonical verdict contradicts the audited review', () => {
    const forged = structuredClone(report);
    const receipt = forged.candidate.audit.receipts.find((entry: { event_key: string }) => entry.event_key === 'candidate:rejected:review');
    const canonical = JSON.parse(receipt.canonical_payload_json);
    canonical.review.verdict = 'accepted';
    receipt.canonical_payload_json = JSON.stringify(canonical);
    receipt.payload_hash = createHash('sha256').update(receipt.canonical_payload_json).digest('hex');
    const evidence = forged.candidate.audit.evidence_rows.find((row: { id: string }) => row.id === receipt.evidence_id);
    evidence.content_json = receipt.canonical_payload_json;
    evidence.content_hash = createHash('sha256').update(evidence.content_json).digest('hex');
    expect(validateObservationReport(forged).valid).toBe(false);
  });

  it('rejects a candidate receipt whose canonical claim contradicts the audited candidate', () => {
    const forged = structuredClone(report);
    const receipt = forged.candidate.audit.receipts.find((entry: { event_key: string }) => entry.event_key === 'candidate:rejected');
    const canonical = JSON.parse(receipt.canonical_payload_json);
    canonical.observation.claim = 'A materially different claim.';
    receipt.canonical_payload_json = JSON.stringify(canonical);
    receipt.payload_hash = digest(receipt.canonical_payload_json);
    const evidence = forged.candidate.audit.evidence_rows.find((row: { id: string }) => row.id === receipt.evidence_id);
    evidence.content_json = receipt.canonical_payload_json;
    evidence.content_hash = digest(evidence.content_json);
    expect(validateObservationReport(forged).valid).toBe(false);
  });

  it('rejects a promotion receipt with a non-canonical operation envelope', () => {
    const forged = structuredClone(report);
    const receipt = forged.candidate.audit.receipts.find((entry: { event_key: string }) => entry.event_key === 'candidate:initial:promotion');
    const canonical = JSON.parse(receipt.canonical_payload_json);
    canonical.forged = true;
    receipt.canonical_payload_json = JSON.stringify(canonical);
    receipt.payload_hash = digest(receipt.canonical_payload_json);
    expect(validateObservationReport(forged).valid).toBe(false);
  });

  it('rejects an accepted observable review backed by a failed validation receipt', () => {
    const forged = structuredClone(report);
    const receipt = forged.candidate.audit.receipts.find((entry: { event_key: string }) => entry.event_key === 'candidate:failed:validation');
    const canonical = JSON.parse(receipt.canonical_payload_json);
    canonical.evidence.metadata.observation_validation.result = 'failed';
    receipt.canonical_payload_json = JSON.stringify(canonical);
    receipt.payload_hash = digest(receipt.canonical_payload_json);
    const evidence = forged.candidate.audit.evidence_rows.find((row: { id: string }) => row.id === receipt.evidence_id);
    evidence.metadata_json = JSON.stringify(canonical.evidence.metadata);
    expect(validateObservationReport(forged).valid).toBe(false);
  });

  it('rejects replacement of a committed adverse-scenario assertion across receipt, evidence, and audit', () => {
    const forged = structuredClone(report);
    const receipt = forged.candidate.audit.receipts.find((entry: { event_key: string }) => entry.event_key === 'candidate:rejected');
    const canonical = JSON.parse(receipt.canonical_payload_json);
    canonical.observation.claim = 'A coherent but different scenario assertion.';
    receipt.canonical_payload_json = JSON.stringify(canonical);
    receipt.payload_hash = digest(receipt.canonical_payload_json);
    const evidence = forged.candidate.audit.evidence_rows.find((row: { id: string }) => row.id === receipt.evidence_id);
    evidence.content_json = receipt.canonical_payload_json;
    evidence.content_hash = digest(evidence.content_json);
    forged.candidate.audit.observations.find((observation: { id: string }) => observation.id === receipt.observation_id).claim = canonical.observation.claim;
    expect(validateObservationReport(forged).valid).toBe(false);
  });

  it('rejects coherent replacement of a committed fixture review reason', () => {
    const forged = structuredClone(report);
    const receipt = forged.candidate.audit.receipts.find((entry: { event_key: string }) => entry.event_key === 'candidate:rejected:review');
    const canonical = JSON.parse(receipt.canonical_payload_json);
    canonical.review.reason = 'A different review rationale.';
    receipt.canonical_payload_json = JSON.stringify(canonical);
    receipt.payload_hash = digest(receipt.canonical_payload_json);
    const evidence = forged.candidate.audit.evidence_rows.find((row: { id: string }) => row.id === receipt.evidence_id);
    evidence.content_json = receipt.canonical_payload_json;
    evidence.content_hash = digest(evidence.content_json);
    forged.candidate.audit.reviews.find((review: { id: string }) => review.id === receipt.review_id).reason = canonical.review.reason;
    expect(validateObservationReport(forged).valid).toBe(false);
  });

  it('rejects coherent redefinition of the committed validation method and content', () => {
    for (const mutate of [
      (canonical: any) => { canonical.evidence.metadata.observation_validation.method = 'not actually validated'; },
      (canonical: any) => { canonical.evidence.content = 'No compatibility check was executed.'; },
    ]) {
      const forged = structuredClone(report);
      const receipt = forged.candidate.audit.receipts.find((entry: { event_key: string }) => entry.event_key === 'candidate:failed:validation');
      const canonical = JSON.parse(receipt.canonical_payload_json);
      mutate(canonical);
      receipt.canonical_payload_json = JSON.stringify(canonical);
      receipt.payload_hash = digest(receipt.canonical_payload_json);
      const evidence = forged.candidate.audit.evidence_rows.find((row: { id: string }) => row.id === receipt.evidence_id);
      evidence.content_json = canonical.evidence.content;
      evidence.content_hash = digest(evidence.content_json);
      evidence.metadata_json = JSON.stringify(canonical.evidence.metadata);
      expect(validateObservationReport(forged).valid).toBe(false);
    }
  });

  it('rejects coherent substitution of a fixed candidate support relationship', () => {
    const forged = structuredClone(report);
    const receipt = forged.candidate.audit.receipts.find((entry: { event_key: string }) => entry.event_key === 'candidate:rejected');
    const unrelatedSupportId = forged.candidate.audit.receipts.find((entry: { event_key: string }) => entry.event_key === 'candidate:confirmation').evidence_id;
    const canonical = JSON.parse(receipt.canonical_payload_json);
    canonical.observation.supportIds = [unrelatedSupportId];
    receipt.canonical_payload_json = JSON.stringify(canonical);
    receipt.payload_hash = digest(receipt.canonical_payload_json);
    const evidence = forged.candidate.audit.evidence_rows.find((row: { id: string }) => row.id === receipt.evidence_id);
    evidence.content_json = receipt.canonical_payload_json;
    evidence.content_hash = digest(evidence.content_json);
    forged.candidate.audit.observations.find((observation: { id: string }) => observation.id === receipt.observation_id).support_ids = [unrelatedSupportId];
    const scenario = forged.candidate.scenario_results.find((entry: { id: string }) => entry.id === 'negated');
    const reviewSupportId = forged.candidate.audit.reviews.find((review: { observation_id: string }) => review.observation_id === receipt.observation_id).support_ids[0];
    scenario.support_ids = [unrelatedSupportId, reviewSupportId];
    refreshScenarioTrace(forged.candidate);
    expect(validateObservationReport(forged).valid).toBe(false);
  });

  it('runs the isolated fixture offline and emits a validated PASS report', () => {
    const result = spawnSync(process.execPath, ['benchmarks/observation-pipeline/run.mjs'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const emitted = JSON.parse(readFileSync(result.stdout.trim(), 'utf8'));
    expect(validateObservationReport(emitted)).toEqual({ valid: true, errors: [] });
    expect(emitted.decision).toEqual({ status: 'pass', reasons: ['all_observation_gates_passed'] });
    expect(emitted.conditions).toMatchObject({ model_calls: 0, network_calls: 0 });
  });
});
