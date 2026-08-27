export const MEMORY_PROTOCOL_VERSION = 3;

export const HARNESS_VALUES = ['opencode', 'codex', 'claude', 'mcp', 'cli', 'import'] as const;
export const EVIDENCE_KIND_VALUES = ['root_prompt', 'explicit_save', 'checkpoint', 'handoff', 'legacy_prompt', 'legacy_observation', 'session_summary'] as const;
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
export type ProjectionState = 'disabled' | 'pending' | 'ready' | 'stale' | 'rebuilding' | 'degraded';

export function isCanonicalValue<T extends readonly string[]>(values: T, value: unknown): value is CanonicalValue<T> {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function requireCanonicalValue<T extends readonly string[]>(label: string, values: T, value: unknown): CanonicalValue<T> {
  if (!isCanonicalValue(values, value)) throw new Error(`${label} must be one of: ${values.join(', ')}`);
  return value;
}

export interface ProjectIdentityInput { key: string; name: string; rootHint?: string | null }
export interface SessionIdentityInput { rootSessionKey: string; harness: Harness }
export interface EvidenceInput { kind: EvidenceKind; content: string; sourceRef?: string | null; capturedAt?: string; metadata?: Record<string, unknown> }
export interface PromotedMemoryInput { kind: MemoryKind; title: string; content: string; topicKey?: string | null; outcome?: MemoryOutcome; supersedesId?: string | null }
export interface SaveMemoryInput { project: ProjectIdentityInput; session?: SessionIdentityInput; evidence: EvidenceInput; memory?: PromotedMemoryInput; eventKey?: string }

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
