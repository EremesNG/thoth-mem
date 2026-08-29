import type Database from 'better-sqlite3';

import {
  MEMORY_KIND_VALUES,
  MEMORY_OUTCOME_VALUES,
  OBSERVATION_GENERATOR_KIND_VALUES,
  OBSERVATION_KIND_VALUES,
  OBSERVATION_REVIEW_BASIS_VALUES,
  OBSERVATION_REVIEW_VERDICT_VALUES,
  OBSERVATION_SCOPE_VALUES,
  requireCanonicalValue,
  requireObservationSupportMetadata,
  type ListObservationsInput,
  type ListObservationsResult,
  type ObservationCandidateInput,
  type ObservationListItem,
  type ObservationRecord,
  type ObservationReviewInput,
} from './contracts.js';
import { sanitizePrivateContent } from './privacy.js';
import { stableUuid } from './sqlite/ledger.js';

const OBSERVATION_EVIDENCE_SCHEMA = 'thoth-mem.observation.v1';
const OBSERVATION_REVIEW_EVIDENCE_SCHEMA = 'thoth-mem.observation-review.v1';

interface CanonicalObservation {
  input: ObservationCandidateInput;
  canonicalJson: string;
}

interface InsertObservationInput {
  projectId: string;
  sessionId: string | null;
  submissionEvidenceId: string;
  observation: ObservationCandidateInput;
  createdAt: string;
}

interface InsertObservationReviewInput {
  projectId: string;
  reviewerSessionId: string;
  reviewEvidenceId: string;
  review: ObservationReviewInput;
  createdAt: string;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${label} contains unknown field: ${unknown[0]}`);
}

function text(value: unknown, label: string, maxCodePoints: number): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const sanitized = sanitizePrivateContent(value).normalize('NFC').trim();
  if (!sanitized) throw new Error(`${label} is required after privacy filtering`);
  if (Array.from(sanitized).length > maxCodePoints) throw new Error(`${label} exceeds ${maxCodePoints} code points`);
  return sanitized;
}

function optionalText(value: unknown, label: string, maxCodePoints: number): string | undefined {
  return value === undefined ? undefined : text(value, label, maxCodePoints);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`${label} must be a positive integer`);
  return Number(value);
}

function stringList(value: unknown, label: string, maxItems: number, maxCodePoints: number): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${label} must contain at most ${maxItems} items`);
  const values = value.map((item, index) => text(item, `${label}[${index}]`, maxCodePoints));
  if (new Set(values).size !== values.length) throw new Error(`${label} contains a duplicate value`);
  return values;
}

function supportIdList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) throw new Error(`${label} must contain 1-16 items`);
  const supportIds = value.map((supportId, index) => text(supportId, `${label}[${index}]`, 200)).sort();
  if (new Set(supportIds).size !== supportIds.length) throw new Error(`${label} contains a duplicate support ID`);
  return supportIds;
}

export function canonicalizeObservation(value: ObservationCandidateInput): CanonicalObservation {
  const candidate = object(value, 'observation');
  exactKeys(candidate, ['kind', 'scope', 'title', 'claim', 'proposedMemory', 'supportIds', 'coverage', 'generator', 'concepts', 'files', 'predecessorId'], 'observation');
  const kind = requireCanonicalValue('observation.kind', OBSERVATION_KIND_VALUES, candidate.kind);
  const scope = requireCanonicalValue('observation.scope', OBSERVATION_SCOPE_VALUES, candidate.scope);
  const title = text(candidate.title, 'observation.title', 500);
  const claim = text(candidate.claim, 'observation.claim', 4_000);

  const proposed = object(candidate.proposedMemory, 'observation.proposedMemory');
  exactKeys(proposed, ['kind', 'title', 'content', 'topicKey', 'outcome'], 'observation.proposedMemory');
  const proposedMemory = {
    kind: requireCanonicalValue('observation.proposedMemory.kind', MEMORY_KIND_VALUES, proposed.kind),
    title: text(proposed.title, 'observation.proposedMemory.title', 500),
    content: text(proposed.content, 'observation.proposedMemory.content', 8_000),
    ...(proposed.topicKey === undefined ? {} : { topicKey: optionalText(proposed.topicKey, 'observation.proposedMemory.topicKey', 500) }),
    ...(proposed.outcome === undefined ? {} : { outcome: requireCanonicalValue('observation.proposedMemory.outcome', MEMORY_OUTCOME_VALUES, proposed.outcome) }),
  };

  const supportIds = supportIdList(candidate.supportIds, 'observation.supportIds');

  let coverage: ObservationCandidateInput['coverage'];
  if (scope === 'session') {
    const coverageInput = object(candidate.coverage, 'observation.coverage');
    exactKeys(coverageInput, ['fromSequence', 'toSequence'], 'observation.coverage');
    const fromSequence = positiveInteger(coverageInput.fromSequence, 'observation.coverage.fromSequence');
    const toSequence = positiveInteger(coverageInput.toSequence, 'observation.coverage.toSequence');
    if (toSequence < fromSequence) throw new Error('observation coverage must not regress');
    coverage = { fromSequence, toSequence };
  } else if (candidate.coverage !== undefined) {
    throw new Error('Project-scoped observations must not declare sequence coverage');
  }

  const generatorInput = object(candidate.generator, 'observation.generator');
  exactKeys(generatorInput, ['kind', 'name', 'version', 'configHash'], 'observation.generator');
  const configHash = optionalText(generatorInput.configHash, 'observation.generator.configHash', 64);
  if (configHash !== undefined && !/^[0-9a-f]{64}$/u.test(configHash)) throw new Error('observation generator config hash must be lowercase SHA-256');
  const generator = {
    kind: requireCanonicalValue('observation.generator.kind', OBSERVATION_GENERATOR_KIND_VALUES, generatorInput.kind),
    name: text(generatorInput.name, 'observation.generator.name', 200),
    ...(generatorInput.version === undefined ? {} : { version: optionalText(generatorInput.version, 'observation.generator.version', 200) }),
    ...(configHash === undefined ? {} : { configHash }),
  };
  const concepts = stringList(candidate.concepts, 'observation.concepts', 16, 200);
  const files = stringList(candidate.files, 'observation.files', 16, 500);
  const predecessorId = optionalText(candidate.predecessorId, 'observation.predecessorId', 200);

  const input: ObservationCandidateInput = {
    kind,
    scope,
    title,
    claim,
    proposedMemory,
    supportIds,
    ...(coverage ? { coverage } : {}),
    generator,
    ...(concepts.length ? { concepts } : {}),
    ...(files.length ? { files } : {}),
    ...(predecessorId ? { predecessorId } : {}),
  };
  return { input, canonicalJson: JSON.stringify({ schema: OBSERVATION_EVIDENCE_SCHEMA, observation: input }) };
}

export function canonicalizeObservationReview(value: ObservationReviewInput): { input: ObservationReviewInput; canonicalJson: string } {
  const review = object(value, 'observationReview');
  exactKeys(review, ['observationId', 'verdict', 'basis', 'policy', 'reason', 'supportIds'], 'observationReview');
  const observationId = text(review.observationId, 'observationReview.observationId', 200);
  const verdict = requireCanonicalValue('observationReview.verdict', OBSERVATION_REVIEW_VERDICT_VALUES, review.verdict);
  const basis = requireCanonicalValue('observationReview.basis', OBSERVATION_REVIEW_BASIS_VALUES, review.basis);
  const policyInput = object(review.policy, 'observationReview.policy');
  exactKeys(policyInput, ['id', 'version'], 'observationReview.policy');
  const policy = { id: text(policyInput.id, 'observationReview.policy.id', 200), version: text(policyInput.version, 'observationReview.policy.version', 200) };
  const reason = text(review.reason, 'observationReview.reason', 1_000);
  const supportIds = supportIdList(review.supportIds, 'observationReview.supportIds');
  const input = { observationId, verdict, basis, policy, reason, supportIds };
  return { input, canonicalJson: JSON.stringify({ schema: OBSERVATION_REVIEW_EVIDENCE_SCHEMA, review: input }) };
}

export function insertObservationReviewProjection(database: Database.Database, input: InsertObservationReviewInput): ObservationRecord {
  const review = canonicalizeObservationReview(input.review).input;
  const observation = observationFromId(database, review.observationId);
  if (!observation || observation.projectId !== input.projectId) throw new Error('Observation review requires an existing candidate in the same project');
  if (observation.review) throw new Error('Observation already has a terminal review');
  const session = database.prepare('SELECT project_id,harness,state FROM sessions WHERE id=?').get(input.reviewerSessionId) as { project_id: string; harness: string; state: string } | undefined;
  if (!session || session.project_id !== input.projectId || session.harness === 'import' || session.state === 'degraded') throw new Error('Observation review requires verified non-import root identity');
  const rootOnly = observation.kind === 'decision' || observation.kind === 'constraint' || observation.kind === 'preference';
  if (rootOnly && review.basis !== 'root_user_confirmed') throw new Error(`Observation kind ${observation.kind} requires root_user_confirmed review`);

  const placeholders = review.supportIds.map(() => '?').join(',');
  const supports = database.prepare(`
    SELECT e.id,e.kind,e.project_id,e.session_id,e.metadata_json,e.rowid,se.actor,se.authority
    FROM evidence e LEFT JOIN session_events se ON se.evidence_id=e.id
    WHERE e.id IN (${placeholders})
  `).all(...review.supportIds) as Array<{ id: string; kind: string; project_id: string; session_id: string | null; metadata_json: string; rowid: number; actor: string | null; authority: string | null }>;
  const reviewEvidenceRow = database.prepare('SELECT rowid FROM evidence WHERE id=?').get(input.reviewEvidenceId) as { rowid: number } | undefined;
  if (!reviewEvidenceRow || supports.length !== review.supportIds.length || supports.some((support) => support.project_id !== input.projectId || support.id === observation.submissionEvidenceId || support.id === input.reviewEvidenceId || support.rowid >= reviewEvidenceRow.rowid)) {
    throw new Error('Observation review supports must be prior same-project evidence');
  }
  for (const support of supports) {
    if (review.basis === 'root_user_confirmed') {
      if (support.kind !== 'root_prompt' || support.session_id !== input.reviewerSessionId || support.actor !== 'user' || support.authority !== 'root_user') throw new Error('root_user_confirmed requires a same-session root prompt');
      continue;
    }
    const metadata = requireObservationSupportMetadata(support.kind as 'explicit_save' | 'handoff', JSON.parse(support.metadata_json) as unknown);
    if (review.basis === 'observable_validation') {
      if (support.kind !== 'explicit_save' || support.session_id !== input.reviewerSessionId || support.actor !== 'agent' || support.authority !== 'root_user' || !('observation_validation' in metadata)) throw new Error('observable_validation requires a same-session validation receipt');
      const expectedResult = review.verdict === 'accepted' ? 'passed' : 'failed';
      if (metadata.observation_validation.observation_id !== observation.id || metadata.observation_validation.result !== expectedResult) throw new Error('Validation receipt does not match observation and verdict');
      continue;
    }
    if (support.kind !== 'handoff' || support.session_id === input.reviewerSessionId || support.actor !== 'agent' || support.authority !== 'harness' || !('observation_review_attestation' in metadata)) throw new Error('independent_review requires a different-session harness attestation');
    if (metadata.observation_review_attestation.observation_id !== observation.id || metadata.observation_review_attestation.verdict !== review.verdict) throw new Error('Independent review attestation does not match observation and verdict');
  }

  const id = stableUuid(`observation-review:${input.reviewEvidenceId}`);
  database.prepare(`INSERT INTO observation_reviews(
    id,observation_id,review_evidence_id,reviewer_session_id,actor,authority,verdict,basis,policy_id,policy_version,reason,created_at
  ) VALUES(?,?,?,?,'agent','root_user',?,?,?,?,?,?)`).run(
    id, observation.id, input.reviewEvidenceId, input.reviewerSessionId, review.verdict, review.basis, review.policy.id, review.policy.version, review.reason, input.createdAt,
  );
  for (const supportId of review.supportIds) database.prepare("INSERT INTO observation_review_supports VALUES(?,?,'supports')").run(id, supportId);
  return observationFromId(database, observation.id)!;
}

export function observationFromId(database: Database.Database, id: string): ObservationRecord | null {
  const row = database.prepare(`
    SELECT o.*, successor.id AS successor_id, r.id AS review_id, r.review_evidence_id, r.reviewer_session_id,
      r.verdict,r.basis,r.policy_id,r.policy_version,r.reason,r.created_at AS review_created_at,
      p.memory_id,p.promotion_evidence_id
    FROM observations o
    LEFT JOIN observations successor ON successor.predecessor_id=o.id
    LEFT JOIN observation_reviews r ON r.observation_id=o.id
    LEFT JOIN observation_promotions p ON p.observation_id=o.id
    WHERE o.id=?
  `).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const facets = database.prepare('SELECT facet_type,value FROM observation_facets WHERE observation_id=? ORDER BY facet_type,ordinal').all(id) as Array<{ facet_type: 'concept' | 'file'; value: string }>;
  const supportIds = (database.prepare('SELECT evidence_id FROM observation_supports WHERE observation_id=? ORDER BY evidence_id').all(id) as Array<{ evidence_id: string }>).map((support) => support.evidence_id);
  const reviewId = row.review_id === null ? null : String(row.review_id);
  const reviewSupportIds = reviewId === null ? [] : (database.prepare('SELECT evidence_id FROM observation_review_supports WHERE review_id=? ORDER BY evidence_id').all(reviewId) as Array<{ evidence_id: string }>).map((support) => support.evidence_id);
  const state: ObservationRecord['state'] = row.memory_id !== null ? 'promoted' : row.verdict === 'accepted' ? 'accepted' : row.verdict === 'rejected' ? 'rejected' : 'pending';
  return {
    recordType: 'observation',
    id: String(row.id),
    projectId: String(row.project_id),
    sessionId: row.session_id === null ? null : String(row.session_id),
    submissionEvidenceId: String(row.submission_evidence_id),
    predecessorId: row.predecessor_id === null ? null : String(row.predecessor_id),
    successorId: row.successor_id === null ? null : String(row.successor_id),
    scope: row.scope as ObservationRecord['scope'],
    coverage: row.source_sequence_from === null ? null : { fromSequence: Number(row.source_sequence_from), toSequence: Number(row.source_sequence_to) },
    kind: row.kind as ObservationRecord['kind'],
    title: String(row.title),
    claim: String(row.claim),
    proposedMemory: {
      kind: row.proposed_memory_kind as ObservationRecord['proposedMemory']['kind'],
      title: String(row.proposed_memory_title),
      content: String(row.proposed_memory_content),
      ...(row.proposed_topic_key === null ? {} : { topicKey: String(row.proposed_topic_key) }),
      outcome: row.proposed_outcome as NonNullable<ObservationRecord['proposedMemory']['outcome']>,
    },
    generator: {
      kind: row.generator_kind as ObservationRecord['generator']['kind'],
      name: String(row.generator_name),
      ...(row.generator_version === null ? {} : { version: String(row.generator_version) }),
      ...(row.generator_config_hash === null ? {} : { configHash: String(row.generator_config_hash) }),
    },
    concepts: facets.filter((facet) => facet.facet_type === 'concept').map((facet) => facet.value),
    files: facets.filter((facet) => facet.facet_type === 'file').map((facet) => facet.value),
    supportIds,
    state,
    review: reviewId === null ? null : {
      id: reviewId,
      evidenceId: String(row.review_evidence_id),
      reviewerSessionId: String(row.reviewer_session_id),
      verdict: row.verdict as NonNullable<ObservationRecord['review']>['verdict'],
      basis: row.basis as NonNullable<ObservationRecord['review']>['basis'],
      policy: { id: String(row.policy_id), version: String(row.policy_version) },
      reason: String(row.reason),
      supportIds: reviewSupportIds,
      createdAt: String(row.review_created_at),
    },
    promotedMemoryId: row.memory_id === null ? null : String(row.memory_id),
    promotionEvidenceId: row.promotion_evidence_id === null ? null : String(row.promotion_evidence_id),
    createdAt: String(row.created_at),
  };
}

export function insertObservationProjection(database: Database.Database, input: InsertObservationInput): ObservationRecord {
  const candidate = canonicalizeObservation(input.observation).input;
  if (candidate.scope === 'session' && !input.sessionId) throw new Error('Session-scoped observation requires verified session identity');
  if (candidate.predecessorId) {
    const predecessor = database.prepare('SELECT project_id FROM observations WHERE id=?').get(candidate.predecessorId) as { project_id: string } | undefined;
    if (!predecessor || predecessor.project_id !== input.projectId) throw new Error('Observation predecessor must belong to the same project');
  }
  const placeholders = candidate.supportIds.map(() => '?').join(',');
  const supports = database.prepare(`SELECT e.id,e.project_id,e.session_id,se.sequence FROM evidence e LEFT JOIN session_events se ON se.evidence_id=e.id WHERE e.id IN (${placeholders})`).all(...candidate.supportIds) as Array<{ id: string; project_id: string; session_id: string | null; sequence: number | null }>;
  if (supports.length !== candidate.supportIds.length || supports.some((support) => support.project_id !== input.projectId || support.id === input.submissionEvidenceId)) throw new Error('Every observation support must be existing same-project source evidence');
  if (candidate.scope === 'session' && supports.some((support) => support.session_id !== input.sessionId || support.sequence === null || support.sequence < candidate.coverage!.fromSequence || support.sequence > candidate.coverage!.toSequence)) {
    throw new Error('Every session observation support must be in the verified covered event range');
  }
  const id = stableUuid(`observation:${input.submissionEvidenceId}`);
  database.prepare(`INSERT INTO observations(
    id,project_id,session_id,submission_evidence_id,predecessor_id,scope,source_sequence_from,source_sequence_to,kind,title,claim,
    proposed_memory_kind,proposed_memory_title,proposed_memory_content,proposed_topic_key,proposed_outcome,
    generator_kind,generator_name,generator_version,generator_config_hash,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, input.projectId, input.sessionId, input.submissionEvidenceId, candidate.predecessorId ?? null, candidate.scope,
    candidate.coverage?.fromSequence ?? null, candidate.coverage?.toSequence ?? null, candidate.kind, candidate.title, candidate.claim,
    candidate.proposedMemory.kind, candidate.proposedMemory.title, candidate.proposedMemory.content, candidate.proposedMemory.topicKey ?? null,
    candidate.proposedMemory.outcome ?? 'unknown', candidate.generator.kind, candidate.generator.name, candidate.generator.version ?? null,
    candidate.generator.configHash ?? null, input.createdAt,
  );
  for (const supportId of candidate.supportIds) database.prepare("INSERT INTO observation_supports VALUES(?,?,'supports')").run(id, supportId);
  for (const [facetType, values] of [['concept', candidate.concepts ?? []], ['file', candidate.files ?? []]] as const) {
    values.forEach((value, ordinal) => database.prepare('INSERT INTO observation_facets VALUES(?,?,?,?)').run(id, facetType, ordinal, value));
  }
  return observationFromId(database, id)!;
}

export function listObservationRecords(database: Database.Database, input: ListObservationsInput): ListObservationsResult {
  if ((input.rootSessionKey && !input.harness) || (!input.rootSessionKey && input.harness)) throw new Error('root_session_key and harness must be supplied together');
  const requestedChars = Math.max(64, Math.min(input.budgetChars ?? 4_000, 20_000));
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const project = database.prepare('SELECT id FROM projects WHERE identity_key=?').get(input.projectKey) as { id: string } | undefined;
  if (!project) return { items: [], requestedChars, returnedChars: 0, truncated: false };
  let sessionId: string | null = null;
  if (input.rootSessionKey && input.harness) {
    sessionId = (database.prepare('SELECT id FROM sessions WHERE project_id=? AND root_session_key=? AND harness=?').get(project.id, input.rootSessionKey, input.harness) as { id: string } | undefined)?.id ?? null;
    if (!sessionId) return { items: [], requestedChars, returnedChars: 0, truncated: false };
  }
  const temporal = input.temporal ?? 'current';
  const rows = database.prepare(`
    WITH queue AS (
      SELECT o.id,o.kind,o.scope,o.title,o.claim,o.created_at,
        count(DISTINCT os.evidence_id) AS support_count,r.basis,r.verdict,p.memory_id,successor.id AS successor_id,
        CASE WHEN p.memory_id IS NOT NULL THEN 'promoted' WHEN r.verdict='accepted' THEN 'accepted' WHEN r.verdict='rejected' THEN 'rejected' ELSE 'pending' END AS state,
        CASE WHEN p.memory_id IS NOT NULL THEN 3 WHEN r.verdict='accepted' THEN 1 WHEN r.verdict='rejected' THEN 2 ELSE 0 END AS state_priority
      FROM observations o
      LEFT JOIN observation_supports os ON os.observation_id=o.id
      LEFT JOIN observation_reviews r ON r.observation_id=o.id
      LEFT JOIN observation_promotions p ON p.observation_id=o.id
      LEFT JOIN observations successor ON successor.predecessor_id=o.id
      WHERE o.project_id=? ${sessionId ? 'AND o.session_id=?' : ''}
      GROUP BY o.id
    )
    SELECT * FROM queue
    WHERE ${temporal === 'current' ? 'successor_id IS NULL' : 'successor_id IS NOT NULL'} ${input.state ? 'AND state=?' : ''}
    ORDER BY state_priority,created_at,id
    LIMIT ?
  `).all(...(sessionId ? [project.id, sessionId] : [project.id]), ...(input.state ? [input.state] : []), limit + 1) as Array<Record<string, unknown>>;
  const items: ObservationListItem[] = [];
  let returnedChars = 0;
  for (const row of rows.slice(0, limit)) {
    const item: ObservationListItem = {
      id: String(row.id), kind: row.kind as ObservationListItem['kind'], scope: row.scope as ObservationListItem['scope'], state: row.state as ObservationListItem['state'],
      title: String(row.title), snippet: String(row.claim).slice(0, 240), createdAt: String(row.created_at), supportCount: Number(row.support_count),
      reviewBasis: row.basis === null ? null : row.basis as ObservationListItem['reviewBasis'], reviewVerdict: row.verdict === null ? null : row.verdict as ObservationListItem['reviewVerdict'],
      promotedMemoryId: row.memory_id === null ? null : String(row.memory_id),
    };
    const size = JSON.stringify(item).length;
    if (returnedChars + size > requestedChars) break;
    items.push(item);
    returnedChars += size;
  }
  return { items, requestedChars, returnedChars, truncated: items.length < rows.length };
}

function parseObservationEvidence(content: string): ObservationCandidateInput {
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('Observation evidence is not valid JSON'); }
  const envelope = object(parsed, 'observation evidence');
  exactKeys(envelope, ['schema', 'observation'], 'observation evidence');
  if (envelope.schema !== OBSERVATION_EVIDENCE_SCHEMA) throw new Error('Observation evidence has an unsupported schema');
  const canonical = canonicalizeObservation(envelope.observation as ObservationCandidateInput);
  if (canonical.canonicalJson !== content) throw new Error('Observation evidence is not canonical');
  return canonical.input;
}

function parseObservationReviewEvidence(content: string): ObservationReviewInput {
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('Observation review evidence is not valid JSON'); }
  const envelope = object(parsed, 'observation review evidence');
  exactKeys(envelope, ['schema', 'review'], 'observation review evidence');
  if (envelope.schema !== OBSERVATION_REVIEW_EVIDENCE_SCHEMA) throw new Error('Observation review evidence has an unsupported schema');
  const canonical = canonicalizeObservationReview(envelope.review as ObservationReviewInput);
  if (canonical.canonicalJson !== content) throw new Error('Observation review evidence is not canonical');
  return canonical.input;
}

function parseObservationPromotionEvidence(content: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('Observation promotion evidence is not valid JSON'); }
  const envelope = object(parsed, 'observation promotion evidence');
  exactKeys(envelope, ['schema', 'promotion'], 'observation promotion evidence');
  if (envelope.schema !== 'thoth-mem.observation-promotion.v1') throw new Error('Observation promotion evidence has an unsupported schema');
  const promotion = object(envelope.promotion, 'observation promotion evidence.promotion');
  exactKeys(promotion, ['observationId'], 'observation promotion evidence.promotion');
  const observationId = text(promotion.observationId, 'observation promotion evidence.promotion.observationId', 200);
  const canonical = JSON.stringify({ schema: 'thoth-mem.observation-promotion.v1', promotion: { observationId } });
  if (canonical !== content) throw new Error('Observation promotion evidence is not canonical');
  return observationId;
}

export function rebuildObservationProjection(database: Database.Database): { candidates: number; reviews: number; promotions: number; supports: number; reviewSupports: number } {
  return database.transaction(() => {
    const triggerRows = database.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'observation_%' ORDER BY name").all() as Array<{ name: string; sql: string }>;
    const receiptRows = database.prepare('SELECT * FROM observation_receipts ORDER BY project_id,operation,event_key').all() as Array<Record<string, unknown>>;
    for (const trigger of triggerRows) database.exec(`DROP TRIGGER IF EXISTS ${trigger.name}`);
    database.exec(`
      DELETE FROM observation_receipts;
      DELETE FROM observation_promotions;
      DELETE FROM observation_review_supports;
      DELETE FROM observation_reviews;
      DELETE FROM observation_supports;
      DELETE FROM observation_facets;
      DELETE FROM observations;
    `);

    const candidateRows = database.prepare(`
      SELECT e.id,e.project_id,e.session_id,e.content,e.captured_at,se.sequence
      FROM evidence e LEFT JOIN session_events se ON se.evidence_id=e.id
      WHERE e.kind='observation'
      ORDER BY e.project_id,coalesce(e.session_id,''),coalesce(se.sequence,9223372036854775807),e.captured_at,e.id
    `).all() as Array<{ id: string; project_id: string; session_id: string | null; content: string; captured_at: string; sequence: number | null }>;
    const pending = candidateRows.map((row) => ({ row, observation: parseObservationEvidence(row.content) }));
    while (pending.length > 0) {
      const index = pending.findIndex((item) => !item.observation.predecessorId || observationFromId(database, item.observation.predecessorId));
      if (index < 0) throw new Error('Observation rebuild found missing or cyclic predecessor lineage');
      const [item] = pending.splice(index, 1);
      insertObservationProjection(database, {
        projectId: item!.row.project_id, sessionId: item!.row.session_id, submissionEvidenceId: item!.row.id,
        observation: item!.observation, createdAt: item!.row.captured_at,
      });
    }

    const reviewRows = database.prepare(`
      SELECT e.id,e.project_id,e.session_id,e.content,e.captured_at,se.sequence
      FROM evidence e JOIN session_events se ON se.evidence_id=e.id
      WHERE e.kind='observation_review'
      ORDER BY e.project_id,se.session_id,se.sequence,e.id
    `).all() as Array<{ id: string; project_id: string; session_id: string; content: string; captured_at: string; sequence: number }>;
    for (const row of reviewRows) {
      insertObservationReviewProjection(database, {
        projectId: row.project_id, reviewerSessionId: row.session_id, reviewEvidenceId: row.id,
        review: parseObservationReviewEvidence(row.content), createdAt: row.captured_at,
      });
    }

    const promotionRows = database.prepare(`
      SELECT e.id,e.project_id,e.content,e.captured_at,se.sequence
      FROM evidence e JOIN session_events se ON se.evidence_id=e.id
      WHERE e.kind='observation_promotion'
      ORDER BY e.project_id,se.session_id,se.sequence,e.id
    `).all() as Array<{ id: string; project_id: string; content: string; captured_at: string; sequence: number }>;
    for (const row of promotionRows) {
      const observationId = parseObservationPromotionEvidence(row.content);
      const observation = observationFromId(database, observationId);
      if (!observation || observation.projectId !== row.project_id || observation.review?.verdict !== 'accepted') throw new Error('Observation promotion rebuild found invalid accepted lineage');
      const memories = database.prepare(`
        SELECT m.* FROM memories m JOIN memory_evidence me ON me.memory_id=m.id
        WHERE me.evidence_id=? AND me.relation='derived_from'
      `).all(row.id) as Array<Record<string, unknown>>;
      if (memories.length !== 1) throw new Error('Observation promotion rebuild requires exactly one linked memory');
      const memory = memories[0]!;
      const proposed = observation.proposedMemory;
      if (String(memory.project_id) !== row.project_id || String(memory.kind) !== proposed.kind || String(memory.title) !== proposed.title || String(memory.content) !== proposed.content || (memory.topic_key === null ? null : String(memory.topic_key)) !== (proposed.topicKey ?? null) || String(memory.outcome) !== (proposed.outcome ?? 'unknown')) {
        throw new Error('Observation promotion rebuild found memory content drift');
      }
      database.prepare('INSERT INTO observation_promotions VALUES(?,?,?,?)').run(observation.id, row.id, String(memory.id), row.captured_at);
    }

    for (const receipt of receiptRows) {
      const observation = observationFromId(database, String(receipt.observation_id));
      if (!observation) throw new Error('Observation rebuild receipt points to missing candidate');
      if (receipt.review_id !== null && observation.review?.id !== String(receipt.review_id)) throw new Error('Observation rebuild receipt review mismatch');
      if (receipt.memory_id !== null && observation.promotedMemoryId !== String(receipt.memory_id)) throw new Error('Observation rebuild receipt memory mismatch');
      database.prepare('INSERT INTO observation_receipts(project_id,operation,event_key,payload_hash,operation_evidence_id,observation_id,review_id,memory_id) VALUES(?,?,?,?,?,?,?,?)').run(
        receipt.project_id, receipt.operation, receipt.event_key, receipt.payload_hash, receipt.operation_evidence_id, receipt.observation_id, receipt.review_id, receipt.memory_id,
      );
    }
    for (const trigger of triggerRows) database.exec(trigger.sql);
    if ((database.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('Observation projection rebuild failed foreign-key verification');
    return {
      candidates: Number((database.prepare('SELECT count(*) AS count FROM observations').get() as { count: number }).count),
      reviews: Number((database.prepare('SELECT count(*) AS count FROM observation_reviews').get() as { count: number }).count),
      promotions: Number((database.prepare('SELECT count(*) AS count FROM observation_promotions').get() as { count: number }).count),
      supports: Number((database.prepare('SELECT count(*) AS count FROM observation_supports').get() as { count: number }).count),
      reviewSupports: Number((database.prepare('SELECT count(*) AS count FROM observation_review_supports').get() as { count: number }).count),
    };
  })();
}
