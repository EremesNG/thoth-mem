import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';

import { evaluateObservationOutcome, validateObservationReport } from './report.mjs';

const CONDITIONS = Object.freeze({ seed: 17, sample_count: 31, top_k: 5, budget_chars: 1_000, query: 'local SQLite memory core', model_calls: 0, network_calls: 0 });
const INITIAL_MEMORY = Object.freeze({ kind: 'architecture', title: 'Local file core', content: 'Keep the persistent memory core local.', topicKey: 'core/local', outcome: 'succeeded' });
const FINAL_MEMORY = Object.freeze({ kind: 'architecture', title: 'Local SQLite core', content: 'Keep the persistent memory core fully local and SQLite-first.', topicKey: 'core/local', outcome: 'succeeded' });
const PROJECT_CONTROL = Object.freeze({ key: 'benchmark:observation:control', name: 'observation-control' });
const PROJECT_CANDIDATE = Object.freeze({ key: 'benchmark:observation:candidate', name: 'observation-candidate' });
const SESSION = Object.freeze({ rootSessionKey: 'benchmark-observation-root', harness: 'codex' });

function percentile95(samples) {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
}

function percentile50(samples) {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.5) - 1];
}

function databaseBytes(path) {
  const directory = dirname(path);
  const name = basename(path);
  return readdirSync(directory)
    .filter((entry) => entry === name || entry === `${name}-wal` || entry === `${name}-shm`)
    .reduce((total, entry) => total + statSync(join(directory, entry)).size, 0);
}

const ROW_COUNT_TABLES = Object.freeze({
  evidence: 'evidence', events: 'session_events', observations: 'observations', reviews: 'observation_reviews',
  promotions: 'observation_promotions', memories: 'memories', fts: 'memory_fts',
});

function withDatabase(path, callback) {
  const database = new Database(path, { readonly: true });
  try { return callback(database); } finally { database.close(); }
}

function databaseRowCounts(path) {
  return withDatabase(path, (database) => Object.fromEntries(Object.entries(ROW_COUNT_TABLES).map(([key, table]) => {
    const row = database.prepare(`SELECT count(*) AS count FROM ${table}`).get();
    return [key, row.count];
  })));
}

function observationReceiptHash(path, eventKey) {
  return withDatabase(path, (database) => database.prepare('SELECT payload_hash FROM observation_receipts WHERE event_key=?').get(eventKey)?.payload_hash);
}

function databaseAudit(path, projectKey, savePayloads = {}) {
  return withDatabase(path, (database) => {
    const project = database.prepare('SELECT id FROM projects WHERE identity_key=?').get(projectKey);
    if (!project) throw new Error(`Missing benchmark project: ${projectKey}`);
    const selectIds = (sql) => database.prepare(sql).all(project.id).map((row) => row.id);
    const observationSupports = database.prepare('SELECT evidence_id FROM observation_supports WHERE observation_id=? ORDER BY evidence_id');
    const observationFacets = database.prepare('SELECT facet_type,value FROM observation_facets WHERE observation_id=? ORDER BY facet_type,ordinal');
    const reviewSupports = database.prepare('SELECT evidence_id FROM observation_review_supports WHERE review_id=? ORDER BY evidence_id');
    const memoryEvidence = database.prepare('SELECT evidence_id FROM memory_evidence WHERE memory_id=? ORDER BY evidence_id');
    const evidenceRows = database.prepare('SELECT id,kind,content AS content_json,content_hash,source_ref,captured_at,metadata_json FROM evidence WHERE project_id=? ORDER BY id').all(project.id);
    const evidenceById = new Map(evidenceRows.map((row) => [row.id, row]));
    const saveReceipts = database.prepare(`SELECT 'save' AS operation,event_key,payload_hash,evidence_id,NULL AS observation_id,NULL AS review_id,memory_id
      FROM save_receipts WHERE project_id=? ORDER BY event_key`).all(project.id)
      .filter((receipt) => Object.hasOwn(savePayloads, receipt.event_key))
      .map((receipt) => ({ ...receipt, canonical_payload_json: savePayloads[receipt.event_key] }));
    const observationReceipts = database.prepare(`SELECT operation,event_key,payload_hash,operation_evidence_id AS evidence_id,observation_id,review_id,memory_id
      FROM observation_receipts WHERE project_id=? ORDER BY event_key`).all(project.id)
      .map((receipt) => {
        const evidence = evidenceById.get(receipt.evidence_id);
        if (!evidence) throw new Error(`Missing receipt evidence: ${receipt.evidence_id}`);
        const canonicalPayload = receipt.operation === 'promotion'
          ? JSON.stringify({ observationId: receipt.observation_id })
          : evidence.content_json;
        return { ...receipt, canonical_payload_json: canonicalPayload };
      });
    const audit = {
      project_id: project.id,
      evidence_ids: evidenceRows.map((row) => row.id),
      evidence_rows: evidenceRows,
      event_evidence_ids: selectIds('SELECT se.evidence_id AS id FROM session_events se JOIN evidence e ON e.id=se.evidence_id WHERE e.project_id=? ORDER BY se.evidence_id'),
      observations: database.prepare(`SELECT id,submission_evidence_id,predecessor_id,scope,source_sequence_from,source_sequence_to,kind,title,claim,
        proposed_memory_kind,proposed_memory_title,proposed_memory_content,proposed_topic_key,proposed_outcome,
        generator_kind,generator_name,generator_version,generator_config_hash
        FROM observations WHERE project_id=? ORDER BY id`).all(project.id)
        .map((row) => {
          const facets = observationFacets.all(row.id);
          return {
            id: row.id, submission_evidence_id: row.submission_evidence_id, predecessor_id: row.predecessor_id, scope: row.scope,
            coverage: row.source_sequence_from === null ? null : { from_sequence: row.source_sequence_from, to_sequence: row.source_sequence_to },
            kind: row.kind, title: row.title, claim: row.claim,
            proposed_memory: {
              kind: row.proposed_memory_kind, title: row.proposed_memory_title, content: row.proposed_memory_content,
              topic_key: row.proposed_topic_key, outcome: row.proposed_outcome,
            },
            generator: { kind: row.generator_kind, name: row.generator_name, version: row.generator_version, config_hash: row.generator_config_hash },
            concepts: facets.filter((facet) => facet.facet_type === 'concept').map((facet) => facet.value),
            files: facets.filter((facet) => facet.facet_type === 'file').map((facet) => facet.value),
            support_ids: observationSupports.all(row.id).map((support) => support.evidence_id),
          };
        }),
      reviews: database.prepare(`SELECT r.id,r.observation_id,r.review_evidence_id,r.verdict,r.basis,r.reason,r.policy_id,r.policy_version
        FROM observation_reviews r JOIN observations o ON o.id=r.observation_id WHERE o.project_id=? ORDER BY r.id`).all(project.id)
        .map((row) => ({ ...row, support_ids: reviewSupports.all(row.id).map((support) => support.evidence_id) })),
      promotions: database.prepare(`SELECT p.observation_id,p.promotion_evidence_id,p.memory_id
        FROM observation_promotions p JOIN observations o ON o.id=p.observation_id WHERE o.project_id=? ORDER BY p.observation_id`).all(project.id),
      memories: database.prepare('SELECT id,kind,title,content,topic_key,outcome,status,supersedes_id,valid_from FROM memories WHERE project_id=? ORDER BY id').all(project.id)
        .map((row) => ({ ...row, evidence_ids: memoryEvidence.all(row.id).map((link) => link.evidence_id) })),
      fts_memory_ids: selectIds('SELECT memory_id AS id FROM memory_fts WHERE project_id=? ORDER BY memory_id'),
      receipts: [...saveReceipts, ...observationReceipts],
      scenario_trace: [],
      trace_sha256: createHash('sha256').update('[]').digest('hex'),
    };
    return {
      row_counts: {
        evidence: audit.evidence_ids.length, events: audit.event_evidence_ids.length, observations: audit.observations.length,
        reviews: audit.reviews.length, promotions: audit.promotions.length, memories: audit.memories.length, fts: audit.fts_memory_ids.length,
      },
      ...audit,
    };
  });
}

function memoryShape(memory) {
  return { kind: memory.kind, title: memory.title, content: memory.content, topic_key: memory.topicKey, outcome: memory.outcome };
}

function recallShape(result) {
  return {
    ordered_signatures: result.items.map((item) => `${item.kind}|${item.title}|${item.snippet}`),
    returned_chars: result.budget.returnedChars,
    delivery_ratio: result.items.length / CONDITIONS.top_k,
    useful_content_ratio: result.budget.compressionRatio,
  };
}

function writeResultIds(operation, result) {
  if (operation === 'candidate') return [result.observation.id, result.evidence.id];
  if (operation === 'review') return [result.observation.review.id, result.evidence.id];
  return [result.memory.id, result.evidence.id];
}

function measureWrite(databasePath, operation, payload, callback) {
  const sqliteBytesBefore = databaseBytes(databasePath);
  const rowCountsBefore = databaseRowCounts(databasePath);
  const payloadJson = JSON.stringify(payload);
  const started = performance.now();
  const result = callback();
  const latency = performance.now() - started;
  const sqliteBytesAfter = databaseBytes(databasePath);
  const rowCountsAfter = databaseRowCounts(databasePath);
  return {
    result,
    metric: {
      operation, event_key: payload.eventKey, payload_json: payloadJson,
      payload_sha256: createHash('sha256').update(payloadJson).digest('hex'), receipt_payload_hash: observationReceiptHash(databasePath, payload.eventKey),
      result_ids: writeResultIds(operation, result),
      row_counts_before: rowCountsBefore, row_counts_after: rowCountsAfter,
      latency_p50_ms: percentile50([latency]), latency_p95_ms: percentile95([latency]), latency_samples_ms: [latency],
      sqlite_bytes_before: sqliteBytesBefore, sqlite_bytes_after: sqliteBytesAfter,
      sqlite_bytes_delta: sqliteBytesAfter - sqliteBytesBefore, payload_chars: payloadJson.length,
    },
  };
}

function lineageShape(memories) {
  return memories.map((memory) => `${memory.topicKey}|${memory.status}|${memory.title}|${memory.content}|${memory.outcome}`);
}

function withScenarioTrace(audit, scenarios) {
  const scenarioTrace = scenarios.map((scenario) => ({
    ...scenario,
    entry_sha256: createHash('sha256').update(JSON.stringify(scenario)).digest('hex'),
  }));
  return {
    ...audit,
    scenario_trace: scenarioTrace,
    trace_sha256: createHash('sha256').update(JSON.stringify(scenarioTrace)).digest('hex'),
  };
}

function recallBatch(service, projectKey) {
  const started = performance.now();
  let result;
  for (let index = 0; index < 20; index += 1) {
    result = service.recall({ projectKey, query: CONDITIONS.query, mode: 'compact', limit: CONDITIONS.top_k, budgetChars: CONDITIONS.budget_chars });
  }
  return { elapsed: (performance.now() - started) / 20, result };
}

function blocked(operation, callback) {
  try {
    callback();
    return { operation, outcome: 'confirmed', source_ids: [], record_ids: [] };
  } catch {
    return { operation, outcome: 'blocked', source_ids: [], record_ids: [] };
  }
}

export async function runObservationPipelineFixture() {
  const scratch = mkdtempSync(join(tmpdir(), 'thoth-observation-benchmark-'));
  const controlPath = join(scratch, 'control.sqlite');
  const candidatePath = join(scratch, 'candidate.sqlite');
  let controlService;
  let candidateService;
  try {
    const { MemoryService } = await import('../../dist/index.js');
    controlService = new MemoryService({ databasePath: controlPath });
    candidateService = new MemoryService({ databasePath: candidatePath });

    const controlSource = controlService.save({
      project: PROJECT_CONTROL,
      eventKey: 'control:source',
      evidence: { kind: 'explicit_save', content: 'The product requirement fixes the core to local SQLite storage.' },
    });
    const controlInitial = controlService.save({
      project: PROJECT_CONTROL,
      eventKey: 'control:initial-promotion',
      evidence: { kind: 'explicit_save', content: 'Preserve the initial local architecture before its SQLite refinement.' },
      memory: INITIAL_MEMORY,
    });
    const controlPromotion = controlService.save({
      project: PROJECT_CONTROL,
      eventKey: 'control:promotion',
      evidence: { kind: 'explicit_save', content: 'Deliberately preserve the approved local SQLite architecture.' },
      memory: FINAL_MEMORY,
    });

    const candidateSource = candidateService.save({
      project: PROJECT_CANDIDATE,
      session: SESSION,
      eventKey: 'candidate:source',
      evidence: { kind: 'explicit_save', content: 'The product requirement fixes the core to local SQLite storage.' },
    });
    const initialPrompt = candidateService.save({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:initial:confirmation',
      evidence: { kind: 'root_prompt', content: 'Confirm the initial local architecture.' },
    });
    const initialScenarioCountsBefore = databaseRowCounts(candidatePath);
    const initialCandidate = candidateService.submitObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:initial',
      observation: {
        kind: 'constraint', scope: 'project', title: 'Local file core', claim: 'The persistent memory core remains local.',
        proposedMemory: INITIAL_MEMORY, supportIds: [candidateSource.evidence.id], generator: { kind: 'root_agent', name: 'benchmark' },
      },
    });
    const initialReview = candidateService.reviewObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:initial:review',
      review: { observationId: initialCandidate.observation.id, verdict: 'accepted', basis: 'root_user_confirmed', policy: { id: 'benchmark', version: '1' }, reason: 'Initial local requirement confirmed.', supportIds: [initialPrompt.evidence.id] },
    });
    const initialPromotion = candidateService.promoteObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:initial:promotion', observationId: initialCandidate.observation.id,
    });
    const candidatePromptEvidence = { kind: 'root_prompt', content: 'Confirm the local SQLite architecture as durable project memory.' };
    const candidatePrompt = candidateService.save({
      project: PROJECT_CANDIDATE,
      session: SESSION,
      eventKey: 'candidate:confirmation',
      evidence: candidatePromptEvidence,
    });
    const submitPayload = {
      project: PROJECT_CANDIDATE,
      session: SESSION,
      eventKey: 'candidate:submit',
      observation: {
        kind: 'constraint', scope: 'project', title: 'Local SQLite core', claim: 'The persistent memory core remains fully local and SQLite-first.',
        proposedMemory: FINAL_MEMORY, supportIds: [candidateSource.evidence.id], generator: { kind: 'root_agent', name: 'benchmark' },
        predecessorId: initialCandidate.observation.id,
      },
    };
    const submittedWrite = measureWrite(candidatePath, 'candidate', submitPayload, () => candidateService.submitObservation(submitPayload));
    const submitted = submittedWrite.result;
    const pendingRecall = candidateService.recall({ projectKey: PROJECT_CANDIDATE.key, query: CONDITIONS.query, mode: 'compact', limit: CONDITIONS.top_k, budgetChars: CONDITIONS.budget_chars });
    const reviewPayload = {
      project: PROJECT_CANDIDATE,
      session: SESSION,
      eventKey: 'candidate:review',
      review: { observationId: submitted.observation.id, verdict: 'accepted', basis: 'root_user_confirmed', policy: { id: 'benchmark', version: '1' }, reason: 'Explicitly confirmed by the root user.', supportIds: [candidatePrompt.evidence.id] },
    };
    const reviewedWrite = measureWrite(candidatePath, 'review', reviewPayload, () => candidateService.reviewObservation(reviewPayload));
    const reviewed = reviewedWrite.result;
    const promotionPayload = {
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:promotion', observationId: submitted.observation.id,
    };
    const promotedWrite = measureWrite(candidatePath, 'promotion', promotionPayload, () => candidateService.promoteObservation(promotionPayload));
    const promoted = promotedWrite.result;

    const unreviewed = candidateService.submitObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:unreviewed',
      observation: {
        kind: 'fact', scope: 'project', title: 'Unreviewed fixture', claim: 'This unreviewed candidate must never be promoted.',
        proposedMemory: { kind: 'discovery', title: 'Unreviewed fixture', content: 'This content must remain outside recall.' },
        supportIds: [candidateSource.evidence.id], generator: { kind: 'root_agent', name: 'benchmark' },
      },
    });
    const unreviewedAttempt = blocked('unreviewed_promotion_attempt', () => candidateService.promoteObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:unreviewed:promotion', observationId: unreviewed.observation.id,
    }));

    const rejectedPrompt = candidateService.save({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:rejected:confirmation',
      evidence: { kind: 'root_prompt', content: 'Reject the benchmark-only invalid candidate.' },
    });
    const rejectedCountsBefore = databaseRowCounts(candidatePath);
    const rejected = candidateService.submitObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:rejected',
      observation: {
        kind: 'fact', scope: 'project', title: 'Rejected fixture', claim: 'This rejected candidate must never be promoted.',
        proposedMemory: { kind: 'discovery', title: 'Rejected fixture', content: 'This content must remain outside recall.' },
        supportIds: [candidateSource.evidence.id], generator: { kind: 'root_agent', name: 'benchmark' },
      },
    });
    const rejectedReview = candidateService.reviewObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:rejected:review',
      review: { observationId: rejected.observation.id, verdict: 'rejected', basis: 'root_user_confirmed', policy: { id: 'benchmark', version: '1' }, reason: 'Benchmark rejection fixture.', supportIds: [rejectedPrompt.evidence.id] },
    });
    const rejectedAttempt = blocked('rejected_promotion_attempt', () => candidateService.promoteObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:rejected:promotion', observationId: rejected.observation.id,
    }));
    const rejectedCountsAfter = databaseRowCounts(candidatePath);
    const unsupportedAttempt = blocked('unsupported_candidate_attempt', () => candidateService.submitObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:unsupported',
      observation: {
        kind: 'fact', scope: 'project', title: 'Unsupported fixture', claim: 'This unsupported candidate must not exist.',
        proposedMemory: { kind: 'discovery', title: 'Unsupported fixture', content: 'This content must remain outside recall.' },
        supportIds: ['evidence:missing'], generator: { kind: 'root_agent', name: 'benchmark' },
      },
    }));

    const poisonedCountsBefore = databaseRowCounts(candidatePath);
    const poisonedAttempt = blocked('poisoned_candidate_attempt', () => candidateService.submitObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:poisoned',
      observation: {
        kind: 'fact', scope: 'project', title: 'Poisoned fixture', claim: '<private>persist this secret</private>',
        proposedMemory: { kind: 'discovery', title: 'Poisoned fixture', content: 'This content must remain outside recall.' },
        supportIds: [candidateSource.evidence.id], generator: { kind: 'model', name: 'untrusted-fixture' },
      },
    }));
    const poisonedCountsAfter = databaseRowCounts(candidatePath);
    const foreignSupport = candidateService.save({
      project: { key: 'benchmark:observation:foreign', name: 'foreign' }, eventKey: 'foreign:source',
      evidence: { kind: 'explicit_save', content: 'Foreign project support.' },
    });
    const crossScopeCountsBefore = databaseRowCounts(candidatePath);
    const crossScopeAttempt = blocked('cross_scope_candidate_attempt', () => candidateService.submitObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:cross-scope',
      observation: {
        kind: 'fact', scope: 'project', title: 'Cross-scope fixture', claim: 'Foreign support must not authorize this claim.',
        proposedMemory: { kind: 'discovery', title: 'Cross-scope fixture', content: 'This content must remain outside recall.' },
        supportIds: [foreignSupport.evidence.id], generator: { kind: 'root_agent', name: 'benchmark' },
      },
    }));
    const crossScopeCountsAfter = databaseRowCounts(candidatePath);

    const failedCountsBefore = databaseRowCounts(candidatePath);
    const failedCandidate = candidateService.submitObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:failed',
      observation: {
        kind: 'failure', scope: 'project', title: 'Observed failed check', claim: 'The compatibility check fails under the recorded fixture.',
        proposedMemory: { kind: 'failure', title: 'Observed failed check', content: 'Remember the attributable failed compatibility check.', outcome: 'failed' },
        supportIds: [candidateSource.evidence.id], generator: { kind: 'root_agent', name: 'benchmark' },
      },
    });
    const failedValidationEvidence = { kind: 'explicit_save', content: 'The failure was reproduced.', metadata: { observation_validation: { observation_id: failedCandidate.observation.id, result: 'passed', method: 'offline reproduction' } } };
    const failedValidation = candidateService.save({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:failed:validation',
      evidence: failedValidationEvidence,
    });
    const failedReview = candidateService.reviewObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:failed:review',
      review: { observationId: failedCandidate.observation.id, verdict: 'accepted', basis: 'observable_validation', policy: { id: 'benchmark', version: '1' }, reason: 'The failure is reproducible.', supportIds: [failedValidation.evidence.id] },
    });
    const failedCountsAfter = databaseRowCounts(candidatePath);

    const stalePrompt = candidateService.save({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:stale:confirmation',
      evidence: { kind: 'root_prompt', content: 'Reject the stale procedure.' },
    });
    const staleCountsBefore = databaseRowCounts(candidatePath);
    const staleCandidate = candidateService.submitObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:stale',
      observation: {
        kind: 'procedure', scope: 'project', title: 'Stale procedure', claim: 'Use the superseded setup procedure.',
        proposedMemory: { kind: 'convention', title: 'Stale procedure', content: 'Use the superseded setup procedure.' },
        supportIds: [candidateSource.evidence.id], generator: { kind: 'root_agent', name: 'benchmark' },
      },
    });
    const staleReview = candidateService.reviewObservation({
      project: PROJECT_CANDIDATE, session: SESSION, eventKey: 'candidate:stale:review',
      review: { observationId: staleCandidate.observation.id, verdict: 'rejected', basis: 'root_user_confirmed', policy: { id: 'benchmark', version: '1' }, reason: 'The procedure is stale.', supportIds: [stalePrompt.evidence.id] },
    });
    const staleCountsAfter = databaseRowCounts(candidatePath);

    for (let index = 0; index < 10; index += 1) {
      controlService.recall({ projectKey: PROJECT_CONTROL.key, query: CONDITIONS.query, mode: 'compact', limit: CONDITIONS.top_k, budgetChars: CONDITIONS.budget_chars });
      candidateService.recall({ projectKey: PROJECT_CANDIDATE.key, query: CONDITIONS.query, mode: 'compact', limit: CONDITIONS.top_k, budgetChars: CONDITIONS.budget_chars });
    }
    const controlSamples = [];
    const candidateSamples = [];
    let controlRecall;
    let candidateRecall;
    for (let index = 0; index < CONDITIONS.sample_count; index += 1) {
      const first = index % 2 === 0 ? ['control', controlService, PROJECT_CONTROL.key] : ['candidate', candidateService, PROJECT_CANDIDATE.key];
      const second = index % 2 === 0 ? ['candidate', candidateService, PROJECT_CANDIDATE.key] : ['control', controlService, PROJECT_CONTROL.key];
      for (const [lane, service, projectKey] of [first, second]) {
        const measurement = recallBatch(service, projectKey);
        if (lane === 'control') { controlSamples.push(measurement.elapsed); controlRecall = measurement.result; }
        else { candidateSamples.push(measurement.elapsed); candidateRecall = measurement.result; }
      }
    }

    const expectedLineage = [candidateSource.evidence.id, candidatePrompt.evidence.id, submitted.evidence.id, reviewed.evidence.id, promoted.evidence.id];
    const lineageComplete = expectedLineage.every((id) => promoted.memory.evidenceIds.includes(id));
    const controlInitialMemory = controlService.get({ id: controlInitial.memory.id }).record;
    const candidateInitialMemory = candidateService.get({ id: initialPromotion.memory.id }).record;
    const scenarioResults = [
      { id: 'poisoned', event_keys: ['candidate:poisoned'], outcome: poisonedAttempt.outcome === 'blocked' ? 'blocked' : 'promoted', harmful_promotions: poisonedAttempt.outcome === 'blocked' ? 0 : 1, observation_ids: [], review_ids: [], memory_ids: [], support_ids: [], policy: null, row_counts_before: poisonedCountsBefore, row_counts_after: poisonedCountsAfter },
      { id: 'negated', event_keys: ['candidate:rejected', 'candidate:rejected:review', 'candidate:rejected:promotion'], outcome: 'rejected', harmful_promotions: rejectedAttempt.outcome === 'blocked' ? 0 : 1, observation_ids: [rejected.observation.id], review_ids: [rejectedReview.observation.review.id], memory_ids: [], support_ids: [candidateSource.evidence.id, rejectedPrompt.evidence.id], policy: { id: 'benchmark', version: '1' }, row_counts_before: rejectedCountsBefore, row_counts_after: rejectedCountsAfter },
      { id: 'cross_scope', event_keys: ['candidate:cross-scope'], outcome: crossScopeAttempt.outcome === 'blocked' ? 'blocked' : 'promoted', harmful_promotions: crossScopeAttempt.outcome === 'blocked' ? 0 : 1, observation_ids: [], review_ids: [], memory_ids: [], support_ids: [], policy: null, row_counts_before: crossScopeCountsBefore, row_counts_after: crossScopeCountsAfter },
      { id: 'failed', event_keys: ['candidate:failed', 'candidate:failed:validation', 'candidate:failed:review'], outcome: failedReview.observation.state, harmful_promotions: 0, observation_ids: [failedCandidate.observation.id], review_ids: [failedReview.observation.review.id], memory_ids: [], support_ids: [candidateSource.evidence.id, failedValidation.evidence.id], policy: { id: 'benchmark', version: '1' }, row_counts_before: failedCountsBefore, row_counts_after: failedCountsAfter },
      { id: 'changing_requirement', event_keys: ['candidate:initial', 'candidate:initial:review', 'candidate:initial:promotion', 'candidate:confirmation', 'candidate:submit', 'candidate:review', 'candidate:promotion'], outcome: promoted.observation.state, harmful_promotions: 0, observation_ids: [initialCandidate.observation.id, submitted.observation.id], review_ids: [initialReview.observation.review.id, reviewed.observation.review.id], memory_ids: [initialPromotion.memory.id, promoted.memory.id], support_ids: [candidateSource.evidence.id, initialPrompt.evidence.id, candidatePrompt.evidence.id], policy: { id: 'benchmark', version: '1' }, row_counts_before: initialScenarioCountsBefore, row_counts_after: promotedWrite.metric.row_counts_after },
      { id: 'stale_procedure', event_keys: ['candidate:stale', 'candidate:stale:review'], outcome: staleReview.observation.state, harmful_promotions: 0, observation_ids: [staleCandidate.observation.id], review_ids: [staleReview.observation.review.id], memory_ids: [], support_ids: [candidateSource.evidence.id, stalePrompt.evidence.id], policy: { id: 'benchmark', version: '1' }, row_counts_before: staleCountsBefore, row_counts_after: staleCountsAfter },
      { id: 'correction', event_keys: ['candidate:submit', 'candidate:review', 'candidate:promotion'], outcome: promoted.observation.state, harmful_promotions: 0, observation_ids: [initialCandidate.observation.id, submitted.observation.id], review_ids: [initialReview.observation.review.id, reviewed.observation.review.id], memory_ids: [initialPromotion.memory.id, promoted.memory.id], support_ids: [candidateSource.evidence.id, initialPrompt.evidence.id, candidatePrompt.evidence.id], policy: { id: 'benchmark', version: '1' }, row_counts_before: submittedWrite.metric.row_counts_before, row_counts_after: promotedWrite.metric.row_counts_after },
      { id: 'topic_supersession', event_keys: ['candidate:submit', 'candidate:review', 'candidate:promotion'], outcome: promoted.observation.state, harmful_promotions: candidateInitialMemory.status === 'superseded' ? 0 : 1, observation_ids: [initialCandidate.observation.id, submitted.observation.id], review_ids: [initialReview.observation.review.id, reviewed.observation.review.id], memory_ids: [initialPromotion.memory.id, promoted.memory.id], support_ids: [candidateSource.evidence.id, initialPrompt.evidence.id, candidatePrompt.evidence.id], policy: { id: 'benchmark', version: '1' }, row_counts_before: submittedWrite.metric.row_counts_before, row_counts_after: promotedWrite.metric.row_counts_after },
    ];
    const control = {
      project_key: PROJECT_CONTROL.key,
      memory: memoryShape(controlPromotion.memory),
      topic_lineage: lineageShape([controlInitialMemory, controlPromotion.memory]),
      recall: recallShape(controlRecall),
      resources: { recall_latency_p95_ms: percentile95(controlSamples), recall_latency_samples_ms: controlSamples, sqlite_bytes: 0 },
      operations: [{ operation: 'direct_promotion', outcome: 'confirmed', source_ids: [controlSource.evidence.id, controlInitial.evidence.id, controlPromotion.evidence.id], record_ids: [controlInitial.memory.id, controlPromotion.memory.id] }],
      audit: databaseAudit(controlPath, PROJECT_CONTROL.key),
      provenance: { valid: controlInitialMemory.status === 'superseded' && controlPromotion.memory.evidenceIds.includes(controlPromotion.evidence.id), source_ids: [controlSource.evidence.id, controlInitial.evidence.id, controlPromotion.evidence.id, controlInitial.memory.id, controlPromotion.memory.id] },
    };
    const candidate = {
      project_key: PROJECT_CANDIDATE.key,
      memory: memoryShape(promoted.memory),
      topic_lineage: lineageShape([candidateInitialMemory, promoted.memory]),
      recall: recallShape(candidateRecall),
      resources: { recall_latency_p95_ms: percentile95(candidateSamples), recall_latency_samples_ms: candidateSamples, sqlite_bytes: 0 },
      operations: [
        { operation: 'candidate_submit', outcome: 'confirmed', source_ids: [candidateSource.evidence.id, submitted.evidence.id], record_ids: [submitted.observation.id] },
        { operation: 'review_accept', outcome: 'confirmed', source_ids: [candidatePrompt.evidence.id, reviewed.evidence.id], record_ids: [reviewed.observation.review.id] },
        { operation: 'explicit_promotion', outcome: 'confirmed', source_ids: [promoted.evidence.id], record_ids: [promoted.memory.id] },
        unsupportedAttempt, rejectedAttempt, unreviewedAttempt,
      ],
      lineage: { observation_id: submitted.observation.id, review_id: reviewed.observation.review.id, promotion_evidence_id: promoted.evidence.id, memory_id: promoted.memory.id, original_support_ids: [candidateSource.evidence.id], complete: lineageComplete },
      safety: {
        unsupported_promotions: unsupportedAttempt.outcome === 'confirmed' ? 1 : 0,
        rejected_promotions: rejectedAttempt.outcome === 'confirmed' ? 1 : 0,
        unreviewed_promotions: unreviewedAttempt.outcome === 'confirmed' ? 1 : 0,
        candidate_recall_leaks: pendingRecall.items.filter((item) => item.id === submitted.observation.id).length,
      },
      attributable_writes: { submit: submittedWrite.metric, review: reviewedWrite.metric, promotion: promotedWrite.metric },
      scenario_results: scenarioResults,
      audit: withScenarioTrace(databaseAudit(candidatePath, PROJECT_CANDIDATE.key, {
        'candidate:confirmation': JSON.stringify({ evidence: candidatePromptEvidence, memory: null }),
        'candidate:failed:validation': JSON.stringify({ evidence: failedValidationEvidence, memory: null }),
      }), scenarioResults),
      provenance: { valid: lineageComplete, source_ids: [...expectedLineage, submitted.observation.id, reviewed.observation.review.id, promoted.memory.id] },
    };

    controlService.close(); controlService = undefined;
    candidateService.close(); candidateService = undefined;
    control.resources.sqlite_bytes = databaseBytes(controlPath);
    candidate.resources.sqlite_bytes = databaseBytes(candidatePath);
    const comparison = {
      final_memory_equal: JSON.stringify(control.memory) === JSON.stringify(candidate.memory),
      topic_lineage_equal: JSON.stringify(control.topic_lineage) === JSON.stringify(candidate.topic_lineage),
      recall_order_equal: JSON.stringify(control.recall.ordered_signatures) === JSON.stringify(candidate.recall.ordered_signatures),
      recall_payload_equal: control.recall.returned_chars === candidate.recall.returned_chars,
      delivery_ratio_equal: control.recall.delivery_ratio === candidate.recall.delivery_ratio,
      useful_content_ratio_equal: control.recall.useful_content_ratio === candidate.recall.useful_content_ratio,
      recall_latency_p95_ratio: candidate.resources.recall_latency_p95_ms / control.resources.recall_latency_p95_ms,
      sqlite_bytes_ratio: candidate.resources.sqlite_bytes / control.resources.sqlite_bytes,
    };
    const report = {
      schema: 'thoth-mem.observation-pipeline-report.v1', created_at: new Date(0).toISOString(), conditions: { ...CONDITIONS },
      control, candidate, comparison, errors: [], decision: undefined,
    };
    report.decision = evaluateObservationOutcome(report);
    const validation = validateObservationReport(report);
    if (!validation.valid) throw new Error(`Invalid observation benchmark report: ${validation.errors.join(',')}`);
    return report;
  } finally {
    controlService?.close();
    candidateService?.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const outputDirectory = mkdtempSync(join(tmpdir(), 'thoth-observation-report-'));
  mkdirSync(outputDirectory, { recursive: true });
  const output = join(outputDirectory, 'observation-pipeline-report.json');
  const report = await runObservationPipelineFixture();
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${output}\n`);
}
