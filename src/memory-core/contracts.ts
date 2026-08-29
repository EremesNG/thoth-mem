export const MEMORY_PROTOCOL_VERSION = 3;

export const HARNESS_VALUES = ['opencode', 'codex', 'claude', 'mcp', 'cli', 'import'] as const;
export const EVIDENCE_KIND_VALUES = [
  'root_prompt', 'explicit_save', 'checkpoint', 'handoff',
  'legacy_prompt', 'legacy_observation', 'session_summary',
  'observation', 'observation_review', 'observation_promotion',
] as const;
export const MEMORY_KIND_VALUES = ['decision', 'convention', 'architecture', 'discovery', 'failure', 'project_structure', 'handoff', 'preference'] as const;
export const MEMORY_OUTCOME_VALUES = ['unknown', 'succeeded', 'failed', 'mixed'] as const;
export const MEMORY_STATUS_VALUES = ['current', 'superseded', 'retracted', 'historical'] as const;
export const LIFECYCLE_OPERATION_VALUES = ['enroll', 'recover', 'capture_root', 'checkpoint_pre_compact', 'guide_post_compact', 'finalize'] as const;
export const EVENT_ACTOR_VALUES = ['user', 'system', 'agent', 'tool'] as const;
export const EVENT_AUTHORITY_VALUES = ['root_user', 'harness', 'agent', 'tool', 'untrusted_external'] as const;
export const RETENTION_CLASS_VALUES = ['project', 'session', 'ephemeral', 'external_reference'] as const;
export const PRIVACY_CLASS_VALUES = ['standard', 'sensitive', 'restricted'] as const;
export const SESSION_SUMMARY_KIND_VALUES = ['checkpoint', 'final'] as const;
export const SESSION_SUMMARY_STATUS_VALUES = ['current', 'superseded'] as const;
export const SESSION_SUMMARY_GENERATOR_KIND_VALUES = ['root_agent', 'harness', 'model'] as const;
export const SESSION_SUMMARY_CLAIM_KIND_VALUES = ['objective', 'completed', 'decision', 'changed_surface', 'verification', 'pending', 'blocker', 'next_action'] as const;
export const SESSION_SUMMARY_SUPPORT_RELATION_VALUES = ['supports'] as const;
export const OBSERVATION_KIND_VALUES = ['decision', 'constraint', 'fact', 'procedure', 'result', 'failure', 'preference'] as const;
export const OBSERVATION_SCOPE_VALUES = ['session', 'project'] as const;
export const OBSERVATION_STATE_VALUES = ['pending', 'accepted', 'rejected', 'promoted'] as const;
export const OBSERVATION_REVIEW_VERDICT_VALUES = ['accepted', 'rejected'] as const;
export const OBSERVATION_REVIEW_BASIS_VALUES = ['root_user_confirmed', 'observable_validation', 'independent_review'] as const;
export const OBSERVATION_SUPPORT_RELATION_VALUES = ['supports'] as const;
export const OBSERVATION_GENERATOR_KIND_VALUES = ['root_agent', 'harness', 'model'] as const;

export const OBSERVATION_LIMITS = Object.freeze({
  maxIdentityCodePoints: 200,
  maxMethodCodePoints: 500,
});

export const SESSION_SUMMARY_LIMITS = Object.freeze({
  minClaims: 1,
  maxClaims: 32,
  maxClaimCodePoints: 2_000,
  minSupportsPerClaim: 1,
  maxSupportsPerClaim: 16,
  maxCanonicalUtf16Units: 20_000,
});

type CanonicalValue<T extends readonly string[]> = T[number];

export type Harness = CanonicalValue<typeof HARNESS_VALUES>;
export type EvidenceKind = CanonicalValue<typeof EVIDENCE_KIND_VALUES>;
export type MemoryKind = CanonicalValue<typeof MEMORY_KIND_VALUES>;
export type MemoryOutcome = CanonicalValue<typeof MEMORY_OUTCOME_VALUES>;
export type MemoryStatus = CanonicalValue<typeof MEMORY_STATUS_VALUES>;
export type LifecycleOperation = CanonicalValue<typeof LIFECYCLE_OPERATION_VALUES>;
export type EventActor = CanonicalValue<typeof EVENT_ACTOR_VALUES>;
export type EventAuthority = CanonicalValue<typeof EVENT_AUTHORITY_VALUES>;
export type RetentionClass = CanonicalValue<typeof RETENTION_CLASS_VALUES>;
export type PrivacyClass = CanonicalValue<typeof PRIVACY_CLASS_VALUES>;
export type SessionSummaryKind = CanonicalValue<typeof SESSION_SUMMARY_KIND_VALUES>;
export type SessionSummaryStatus = CanonicalValue<typeof SESSION_SUMMARY_STATUS_VALUES>;
export type SessionSummaryGeneratorKind = CanonicalValue<typeof SESSION_SUMMARY_GENERATOR_KIND_VALUES>;
export type SessionSummaryClaimKind = CanonicalValue<typeof SESSION_SUMMARY_CLAIM_KIND_VALUES>;
export type SessionSummarySupportRelation = CanonicalValue<typeof SESSION_SUMMARY_SUPPORT_RELATION_VALUES>;
export type ObservationKind = CanonicalValue<typeof OBSERVATION_KIND_VALUES>;
export type ObservationScope = CanonicalValue<typeof OBSERVATION_SCOPE_VALUES>;
export type ObservationState = CanonicalValue<typeof OBSERVATION_STATE_VALUES>;
export type ObservationReviewVerdict = CanonicalValue<typeof OBSERVATION_REVIEW_VERDICT_VALUES>;
export type ObservationReviewBasis = CanonicalValue<typeof OBSERVATION_REVIEW_BASIS_VALUES>;
export type ObservationSupportRelation = CanonicalValue<typeof OBSERVATION_SUPPORT_RELATION_VALUES>;
export type ObservationGeneratorKind = CanonicalValue<typeof OBSERVATION_GENERATOR_KIND_VALUES>;
export type ProjectionState = 'disabled' | 'pending' | 'ready' | 'stale' | 'rebuilding' | 'degraded';

export interface ObservationValidationMetadata {
  observation_validation: {
    observation_id: string;
    result: 'passed' | 'failed';
    method: string;
  };
}

export interface ObservationReviewAttestationMetadata {
  observation_review_attestation: {
    observation_id: string;
    verdict: ObservationReviewVerdict;
    reviewer: string;
    method: string;
  };
}

export type ObservationSupportMetadata = ObservationValidationMetadata | ObservationReviewAttestationMetadata;

export function isCanonicalValue<T extends readonly string[]>(values: T, value: unknown): value is CanonicalValue<T> {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function requireCanonicalValue<T extends readonly string[]>(label: string, values: T, value: unknown): CanonicalValue<T> {
  if (!isCanonicalValue(values, value)) throw new Error(`${label} must be one of: ${values.join(', ')}`);
  return value;
}

function requireExactRecord(label: string, value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} must contain exact keys: ${expected.join(', ')}`);
  }
  return record;
}

function requireBoundedText(label: string, value: unknown, maxCodePoints: number): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be non-empty and at most ${maxCodePoints} code points`);
  }
  const canonical = value.normalize('NFC').trim();
  if (!canonical || Array.from(canonical).length > maxCodePoints) throw new Error(`${label} must be non-empty and at most ${maxCodePoints} code points`);
  return canonical;
}

export function requireObservationSupportMetadata(kind: EvidenceKind, value: unknown): ObservationSupportMetadata {
  if (kind === 'explicit_save') {
    const outer = requireExactRecord('evidence.metadata', value, ['observation_validation']);
    const validation = requireExactRecord('evidence.metadata.observation_validation', outer.observation_validation, ['observation_id', 'result', 'method']);
    const result = requireCanonicalValue('evidence.metadata.observation_validation.result', ['passed', 'failed'] as const, validation.result);
    return {
      observation_validation: {
        observation_id: requireBoundedText('evidence.metadata.observation_validation.observation_id', validation.observation_id, OBSERVATION_LIMITS.maxIdentityCodePoints),
        result,
        method: requireBoundedText('evidence.metadata.observation_validation.method', validation.method, OBSERVATION_LIMITS.maxMethodCodePoints),
      },
    };
  }
  if (kind === 'handoff') {
    const outer = requireExactRecord('evidence.metadata', value, ['observation_review_attestation']);
    const attestation = requireExactRecord('evidence.metadata.observation_review_attestation', outer.observation_review_attestation, ['observation_id', 'verdict', 'reviewer', 'method']);
    return {
      observation_review_attestation: {
        observation_id: requireBoundedText('evidence.metadata.observation_review_attestation.observation_id', attestation.observation_id, OBSERVATION_LIMITS.maxIdentityCodePoints),
        verdict: requireCanonicalValue('evidence.metadata.observation_review_attestation.verdict', OBSERVATION_REVIEW_VERDICT_VALUES, attestation.verdict),
        reviewer: requireBoundedText('evidence.metadata.observation_review_attestation.reviewer', attestation.reviewer, OBSERVATION_LIMITS.maxIdentityCodePoints),
        method: requireBoundedText('evidence.metadata.observation_review_attestation.method', attestation.method, OBSERVATION_LIMITS.maxMethodCodePoints),
      },
    };
  }
  throw new Error(`Evidence kind ${kind} does not support observation metadata`);
}

export interface ProjectIdentityInput { key: string; name: string; rootHint?: string | null }
export interface SessionIdentityInput { rootSessionKey: string; harness: Harness }
export interface EvidenceInput { kind: EvidenceKind; content: string; sourceRef?: string | null; capturedAt?: string; metadata?: Record<string, unknown> }
export interface PromotedMemoryInput { kind: MemoryKind; title: string; content: string; topicKey?: string | null; outcome?: MemoryOutcome; supersedesId?: string | null }
export type ObservationProposedMemoryInput = Omit<PromotedMemoryInput, 'supersedesId'>;
export interface SaveMemoryInput { project: ProjectIdentityInput; session?: SessionIdentityInput; evidence: EvidenceInput; memory?: PromotedMemoryInput; eventKey?: string }

export interface ObservationCoverage { fromSequence: number; toSequence: number }
export interface ObservationGenerator { kind: ObservationGeneratorKind; name: string; version?: string; configHash?: string }
export interface ObservationCandidateInput {
  kind: ObservationKind;
  scope: ObservationScope;
  title: string;
  claim: string;
  proposedMemory: ObservationProposedMemoryInput;
  supportIds: string[];
  coverage?: ObservationCoverage;
  generator: ObservationGenerator;
  concepts?: string[];
  files?: string[];
  predecessorId?: string;
}
export interface SubmitObservationInput {
  project: ProjectIdentityInput;
  session?: SessionIdentityInput;
  eventKey: string;
  observation: ObservationCandidateInput;
}
export interface ObservationReviewRecord {
  id: string;
  evidenceId: string;
  reviewerSessionId: string;
  verdict: ObservationReviewVerdict;
  basis: ObservationReviewBasis;
  policy: { id: string; version: string };
  reason: string;
  supportIds: string[];
  createdAt: string;
}
export interface ObservationRecord {
  recordType: 'observation';
  id: string;
  projectId: string;
  sessionId: string | null;
  submissionEvidenceId: string;
  predecessorId: string | null;
  successorId: string | null;
  scope: ObservationScope;
  coverage: ObservationCoverage | null;
  kind: ObservationKind;
  title: string;
  claim: string;
  proposedMemory: ObservationProposedMemoryInput;
  generator: ObservationGenerator;
  concepts: string[];
  files: string[];
  supportIds: string[];
  state: ObservationState;
  review: ObservationReviewRecord | null;
  promotedMemoryId: string | null;
  promotionEvidenceId: string | null;
  createdAt: string;
}
export interface SubmitObservationResult {
  operation: 'candidate';
  observation: ObservationRecord;
  evidence: EvidenceRecord;
  event: SessionEventRecord | null;
  projectId: string;
  sessionId: string | null;
  duplicate: boolean;
}
export interface ObservationReviewInput {
  observationId: string;
  verdict: ObservationReviewVerdict;
  basis: ObservationReviewBasis;
  policy: { id: string; version: string };
  reason: string;
  supportIds: string[];
}
export interface ReviewObservationInput {
  project: ProjectIdentityInput;
  session: SessionIdentityInput;
  eventKey: string;
  review: ObservationReviewInput;
}
export interface ReviewObservationResult {
  operation: 'review';
  observation: ObservationRecord;
  evidence: EvidenceRecord;
  event: SessionEventRecord;
  projectId: string;
  sessionId: string;
  duplicate: boolean;
}
export interface PromoteObservationInput {
  project: ProjectIdentityInput;
  session: SessionIdentityInput;
  eventKey: string;
  observationId: string;
}
export interface PromoteObservationResult {
  operation: 'promotion';
  observation: ObservationRecord;
  review: ObservationReviewRecord;
  memory: MemoryRecord;
  evidence: EvidenceRecord;
  event: SessionEventRecord;
  projectId: string;
  sessionId: string;
  duplicate: boolean;
}
export interface ListObservationsInput {
  projectKey: string;
  rootSessionKey?: string;
  harness?: Harness;
  state?: ObservationState;
  temporal?: 'current' | 'history';
  limit?: number;
  budgetChars?: number;
}
export interface ObservationListItem {
  id: string;
  kind: ObservationKind;
  scope: ObservationScope;
  state: ObservationState;
  title: string;
  snippet: string;
  createdAt: string;
  supportCount: number;
  reviewBasis: ObservationReviewBasis | null;
  reviewVerdict: ObservationReviewVerdict | null;
  promotedMemoryId: string | null;
}
export interface ListObservationsResult { items: ObservationListItem[]; requestedChars: number; returnedChars: number; truncated: boolean }

export interface EvidenceRecord { id: string; projectId: string; sessionId: string | null; kind: EvidenceKind; content: string; contentHash: string; sourceRef: string | null; capturedAt: string; metadata: Record<string, unknown> }
export interface MemoryRecord { id: string; projectId: string; topicKey: string | null; kind: MemoryKind; title: string; content: string; outcome: MemoryOutcome; status: MemoryStatus; validFrom: string; invalidAt: string | null; supersedesId: string | null; createdAt: string; evidenceIds: string[] }
export interface SaveMemoryResult { evidence: EvidenceRecord; memory: MemoryRecord | null; event: SessionEventRecord | null; projectId: string; sessionId: string | null; duplicate: boolean }

export interface SessionEventInput {
  actor: EventActor;
  authority: EventAuthority;
  retentionClass: RetentionClass;
  privacyClass: PrivacyClass;
}

export interface SessionEventRecord extends SessionEventInput {
  evidenceId: string;
  sessionId: string;
  sequence: number;
}

export interface SessionSummaryCoverage {
  fromSequence: number;
  toSequence: number;
}

export interface SessionSummaryGenerator {
  kind: SessionSummaryGeneratorKind;
  name: string;
  version?: string;
  configHash?: string;
}

export interface SessionSummaryClaimInput {
  kind: SessionSummaryClaimKind;
  content: string;
  outcome?: MemoryOutcome;
  supportIds: string[];
}

export interface SessionSummaryInput {
  kind: SessionSummaryKind;
  coverage: SessionSummaryCoverage;
  generator: SessionSummaryGenerator;
  claims: SessionSummaryClaimInput[];
}

export interface SessionSummaryClaimRecord {
  id: string;
  ordinal: number;
  kind: SessionSummaryClaimKind;
  content: string;
  outcome: MemoryOutcome | null;
  supportIds: string[];
}

export interface SessionSummaryRecord {
  recordType: 'summary';
  id: string;
  projectId: string;
  sessionId: string;
  submissionEvidenceId: string;
  kind: SessionSummaryKind;
  version: number;
  status: SessionSummaryStatus;
  coverage: SessionSummaryCoverage;
  generator: SessionSummaryGenerator;
  supersedesId: string | null;
  createdAt: string;
  claims: SessionSummaryClaimRecord[];
}

export interface BudgetMeasurement { requestedChars: number; returnedChars: number; truncatedChars: number; sourceChars: number; evidenceChars: number; fullChars: number; compressionRatio: number; tokenBasis: 'estimated_chars_div_4' }
export interface RecallItem { id: string; title: string; kind: MemoryKind; topicKey: string | null; outcome: MemoryOutcome; status: MemoryStatus; snippet: string; content?: string; score: number; scoreComponents: { exact: number; lexical: number; temporal: number }; lane: 'structured' | 'lexical'; evidenceIds: string[] }
export interface RecallResult { items: RecallItem[]; budget: BudgetMeasurement; lanes: Record<string, ProjectionState | 'ready'>; warnings: string[]; correlationId: string }
export type MemoryContextItem = RecallItem & { recordType: 'memory' };
export interface SummaryContextItem {
  recordType: 'summary';
  id: string;
  kind: SessionSummaryKind;
  version: number;
  coverage: SessionSummaryCoverage;
  snippet: string;
  status: 'current';
  score: number;
  submissionEvidenceId: string;
  claims: Array<{ kind: SessionSummaryClaimKind; content: string; outcome?: MemoryOutcome }>;
}
export type ContextItem = RecallItem | SummaryContextItem;
export interface ContextResult extends Omit<RecallResult, 'items'> {
  items: ContextItem[];
  selectedSummaryIds: string[];
  selectedMemoryIds: string[];
  selectedRecordIds: string[];
}
export interface ProjectionRecord { projectionId: string; configHash: string; sourceWatermark: number; state: ProjectionState; updatedAt: string; lastErrorCode: string | null }

export interface LifecycleInput { operation: LifecycleOperation; harness: Harness; project: ProjectIdentityInput; rootSessionKey: string; eventKey: string; identityConfidence?: 'confirmed' | 'degraded'; content?: string; summary?: SessionSummaryInput; capability?: { nativeEvent: string; contextInjection: boolean; modelConsumption: boolean } }
export interface LifecycleCapability { hookExecuted: boolean; memoryConfirmed: boolean; contextDelivered: boolean; modelConsumed: boolean }
export interface LifecycleRendering { maxCodePoints: number; totalCodePoints: number; contentCodePoints: number; usefulContentRatio: number }
export interface LifecycleRecovery { context: string; items: ContextItem[]; selectedSummaryIds: string[]; selectedMemoryIds: string[]; selectedRecordIds: string[]; sources: string[]; budget: BudgetMeasurement; rendering: LifecycleRendering }
export interface LifecycleResult { outcome: 'confirmed' | 'degraded' | 'failed'; duplicate: boolean; projectId: string; sessionId: string; evidenceId: string | null; event: SessionEventRecord | null; summaryId: string | null; recovery?: LifecycleRecovery; capability: LifecycleCapability }
