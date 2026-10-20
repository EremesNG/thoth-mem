import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  EVIDENCE_KIND_VALUES,
  HARNESS_VALUES,
  LIFECYCLE_OPERATION_VALUES,
  MEMORY_KIND_VALUES,
  MEMORY_OUTCOME_VALUES,
  OBSERVATION_GENERATOR_KIND_VALUES,
  OBSERVATION_KIND_VALUES,
  OBSERVATION_REVIEW_BASIS_VALUES,
  OBSERVATION_REVIEW_VERDICT_VALUES,
  OBSERVATION_SCOPE_VALUES,
  OBSERVATION_STATE_VALUES,
  SESSION_SUMMARY_CLAIM_KIND_VALUES,
  SESSION_SUMMARY_GENERATOR_KIND_VALUES,
  SESSION_SUMMARY_KIND_VALUES,
  SESSION_SUMMARY_LIMITS,
  type ContextItem,
  type Harness,
  type RecallItem,
  type SaveMemoryInput,
  type SessionIdentityInput,
  type SessionSummaryInput,
  type SummaryContextItem,
  type TimelineResult,
} from '../memory-core/contracts.js';
import type { MemoryService } from '../memory-core/service.js';
import { boundedJson } from './bounded-json.js';

export const MEMORY_RECALL_INSTRUCTION_SENTENCES = [
  'At the start of non-trivial repository work, recall with task key terms before exploring, unprompted.',
  'Expand only selected records. Skip memory for trivial or conversational turns.',
] as const;

export const MEMORY_SAVE_INSTRUCTION_SENTENCES = [
  'Save verified decisions, root causes, failed approaches, and non-obvious conventions immediately, unprompted.',
  'When a recovered handoff\'s pending action is done, save its outcome under the same topic_key.',
  'Save one handoff before meaningful work ends if continuation helps.',
  'Use verified identity for attribution, exclude private, transient, canonical, user-forbidden, and duplicate content, and reserve mem_session for actual root lifecycle events.',
] as const;

export const MEMORY_INSTRUCTION_SENTENCES = [
  'Persistent project memory for coding agents.',
  ...MEMORY_RECALL_INSTRUCTION_SENTENCES,
  ...MEMORY_SAVE_INSTRUCTION_SENTENCES,
] as const;

// Reserved for unverified server-assigned identities, including across process restarts.
export const MCP_CONNECTION_SESSION_PREFIX = 'thoth-mem:mcp-connection:';

export const ALL_TOOLS = ['mem_save', 'mem_recall', 'mem_context', 'mem_get', 'mem_project', 'mem_session'] as const;
export type MemoryToolName = typeof ALL_TOOLS[number];
export interface ToolResult { [key: string]: unknown; content: Array<{ type: 'text'; text: string }>; structuredContent: Record<string, unknown>; isError?: boolean }
type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;
type ToolHandlers = Record<MemoryToolName, ToolHandler>;

export const TOOL_DESCRIPTIONS: Readonly<Record<MemoryToolName, string>> = {
  mem_save: [
    'Save unprompted as soon as decisions, root causes, failed approaches, or non-obvious conventions are verified. Save durable discoveries and continuation handoffs.',
    'Direct promoted memory (not handoff): memory.content uses labeled Result, Rationale, Scope, Caveat / safe action lines; omit inapplicable Scope/Caveat and never invent details.',
    'Handoffs: Objective, Completed, First pending action, Blockers, Key files/checks; require a stable workstream topic_key; close a finished handoff by saving its outcome under the same topic_key.',
    'Send exactly one branch: evidence, observation, observation_review, or observation_promotion.',
    'Supply root_session_key and harness together or omit both.',
  ].join(' '),
  mem_recall: 'Call at the start of non-trivial repository work before exploring, with task key terms, unprompted. Search promoted project memory before expanding selected records.',
  mem_context: 'Build bounded handoff-first continuity. project_key required; root_session_key and harness together for session context, neither for project context.',
  mem_get: 'Expand one selected record from a prior tool result.',
  mem_project: 'Read-only project views. list: no fields required; returns at most 256 exact aliases/project with aliasCount/aliasesTruncated. timeline: project_key required; accepts only since, until, cursor, limit, budget_chars. briefing/summaries/observations: project_key required; optional session filter selects summaries/observations, not briefing\'s project-wide memories. history: id required from a prior result.',
  mem_session: 'Record verified root lifecycle events, never ordinary saves. guide_post_compact content carries host compaction text.',
};

const DIRECT_EVIDENCE_KIND_VALUES = EVIDENCE_KIND_VALUES.filter((kind) => !['observation', 'observation_review', 'observation_promotion'].includes(kind)) as [typeof EVIDENCE_KIND_VALUES[number], ...Array<typeof EVIDENCE_KIND_VALUES[number]>];
const projectKeySchema = z.string().min(1).describe('Verified project_key, copied verbatim; never derived.');
const projectNameSchema = z.string().min(1).describe('Display/creation metadata only, not identity; prefer the persisted name from lifecycle/project output.');
const plainEvidenceInputSchema = z.object({
  kind: z.enum(DIRECT_EVIDENCE_KIND_VALUES),
  content: z.string().min(1),
  source_ref: z.string().optional(),
}).strict();
const validationMetadataSchema = z.object({
  observation_validation: z.object({
    observation_id: z.string().min(1).max(200),
    result: z.enum(['passed', 'failed']),
    method: z.string().min(1).max(500),
  }).strict(),
}).strict();
const attestationMetadataSchema = z.object({
  observation_review_attestation: z.object({
    observation_id: z.string().min(1).max(200),
    verdict: z.enum(OBSERVATION_REVIEW_VERDICT_VALUES),
    reviewer: z.string().min(1).max(200),
    method: z.string().min(1).max(500),
  }).strict(),
}).strict();
const evidenceInputSchema = z.union([
  plainEvidenceInputSchema,
  z.object({ kind: z.literal('explicit_save'), content: z.string().min(1), source_ref: z.string().optional(), metadata: validationMetadataSchema }).strict(),
  z.object({ kind: z.literal('handoff'), content: z.string().min(1), source_ref: z.string().optional(), metadata: attestationMetadataSchema }).strict(),
]);
const memoryInputSchema = z.object({
  kind: z.enum(MEMORY_KIND_VALUES),
  title: z.string().min(1),
  content: z.string().min(1),
  topic_key: z.string().optional(),
  outcome: z.enum(MEMORY_OUTCOME_VALUES).optional(),
  supersedes_id: z.string().optional(),
}).strict();
const observationProposedMemorySchema = memoryInputSchema.omit({ supersedes_id: true });
const observationGeneratorSchema = z.object({
  kind: z.enum(OBSERVATION_GENERATOR_KIND_VALUES),
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(200).optional(),
  config_hash: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
}).strict();
const observationSchema = z.object({
  kind: z.enum(OBSERVATION_KIND_VALUES),
  scope: z.enum(OBSERVATION_SCOPE_VALUES),
  title: z.string().min(1).max(500),
  claim: z.string().min(1).max(4_000),
  proposed_memory: observationProposedMemorySchema,
  support_ids: z.array(z.string().min(1).max(200)).min(1).max(16),
  coverage: z.object({ from_sequence: z.number().int().positive(), to_sequence: z.number().int().positive() }).strict().optional(),
  generator: observationGeneratorSchema,
  concepts: z.array(z.string().min(1).max(200)).max(16).optional(),
  files: z.array(z.string().min(1).max(500)).max(16).optional(),
  predecessor_id: z.string().min(1).max(200).optional(),
}).strict();
const observationReviewSchema = z.object({
  observation_id: z.string().min(1).max(200),
  verdict: z.enum(OBSERVATION_REVIEW_VERDICT_VALUES),
  basis: z.enum(OBSERVATION_REVIEW_BASIS_VALUES),
  policy: z.object({ id: z.string().min(1).max(200), version: z.string().min(1).max(200) }).strict(),
  reason: z.string().min(1).max(1_000),
  support_ids: z.array(z.string().min(1).max(200)).min(1).max(16),
}).strict();
const observationPromotionSchema = z.object({ observation_id: z.string().min(1).max(200) }).strict();
const memSaveBaseInputSchema = z.object({
  project_key: projectKeySchema.describe('Copy opaque project_key verbatim from verified native identity; never derive from names, paths, remotes, branches, worktrees, host IDs, listings, or recalled content.'),
  project_name: projectNameSchema,
  root_session_key: z.string().optional().describe('Verified root session key; blank is absent.'),
  harness: z.enum(HARNESS_VALUES).optional().describe('Verified native harness.'),
  event_key: z.string().optional().describe('Stable idempotency key.'),
  evidence: evidenceInputSchema.optional().describe('Compact factual evidence; metadata requires event_key + session pair and forbids memory.'),
  memory: memoryInputSchema.optional().describe('Direct promoted memory; requires evidence without metadata.'),
  observation: observationSchema.optional().describe('Supported candidate, not promoted; requires event_key. Session scope needs session pair + coverage; project scope forbids coverage.'),
  observation_review: observationReviewSchema.optional().describe('Review supported observation; requires event_key + session pair.'),
  observation_promotion: observationPromotionSchema.optional().describe('Promote accepted observation without new prose; requires event_key + session pair.'),
}).strict();
const memSaveInputSchema = memSaveBaseInputSchema.superRefine((value, context) => {
  const branchNames = ['evidence', 'observation', 'observation_review', 'observation_promotion'] as const;
  const receivedBranches = branchNames.filter((name) => value[name] !== undefined);
  const branchInstruction = `send exactly one of ${branchNames.join(', ')}`;
  if (receivedBranches.length === 0 && !value.memory) context.addIssue({ code: 'custom', path: [], message: branchInstruction });
  if (receivedBranches.length > 1) context.addIssue({ code: 'custom', path: [], message: `received ${receivedBranches.join(' and ')}; ${branchInstruction}` });
  if (value.memory && !value.evidence) context.addIssue({ code: 'custom', path: ['memory'], message: 'memory requires direct evidence: send { evidence: { kind, content }, memory }' });
  if (value.evidence && 'metadata' in value.evidence && value.memory) context.addIssue({ code: 'custom', path: ['memory'], message: 'structured support evidence cannot include memory' });
  const requiresEvent = value.observation || value.observation_review || value.observation_promotion || (value.evidence && 'metadata' in value.evidence);
  if (requiresEvent && !value.event_key) context.addIssue({ code: 'custom', path: ['event_key'], message: 'event_key is required for observation operations' });
  const requiresSession = value.observation_review || value.observation_promotion || (value.evidence && 'metadata' in value.evidence) || value.observation?.scope === 'session';
  const rootSessionKey = optionalString(value.root_session_key);
  if (requiresSession && (!rootSessionKey || !value.harness)) context.addIssue({ code: 'custom', path: [rootSessionKey ? 'harness' : 'root_session_key'], message: sessionPairError(rootSessionKey, value.harness) ?? 'root_session_key and harness are required for this operation' });
  if (value.observation?.scope === 'session' && !value.observation.coverage) context.addIssue({ code: 'custom', path: ['observation', 'coverage'], message: 'coverage is required for session scope' });
  if (value.observation?.scope === 'project' && value.observation.coverage) context.addIssue({ code: 'custom', path: ['observation', 'coverage'], message: 'project scope forbids coverage' });
});
const summaryCoverageSchema = z.object({
  from_sequence: z.number().int().positive().describe('First event sequence: 1.'),
  to_sequence: z.number().int().positive().describe('Last sequence: >= from_sequence; must advance the current summary for this session/kind.'),
}).strict().describe('Inclusive session evidence range.');
const summaryGeneratorSchema = z.object({
  kind: z.enum(SESSION_SUMMARY_GENERATOR_KIND_VALUES),
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(200).optional(),
  config_hash: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
}).strict();
const summaryClaimSchema = z.object({
  kind: z.enum(SESSION_SUMMARY_CLAIM_KIND_VALUES),
  content: z.string().min(1).describe(`Atomic claim; <=${SESSION_SUMMARY_LIMITS.maxClaimCodePoints} code points after privacy filtering.`),
  outcome: z.enum(MEMORY_OUTCOME_VALUES).optional(),
  support_ids: z.array(z.string().min(1).max(200)).min(SESSION_SUMMARY_LIMITS.minSupportsPerClaim).max(SESSION_SUMMARY_LIMITS.maxSupportsPerClaim).describe('Distinct evidence ids inside coverage from this project_key + root_session_key/harness session; never memory, summary, or observation ids.'),
}).strict();
const sessionSummarySchema = z.object({
  kind: z.enum(SESSION_SUMMARY_KIND_VALUES).describe('Only checkpoint_pre_compact: checkpoint; finalize: final.'),
  coverage: summaryCoverageSchema,
  generator: summaryGeneratorSchema,
  claims: z.array(summaryClaimSchema).min(SESSION_SUMMARY_LIMITS.minClaims).max(SESSION_SUMMARY_LIMITS.maxClaims).describe(`Supported claims; canonical summary <=${SESSION_SUMMARY_LIMITS.maxCanonicalUtf16Units} UTF-16 units.`),
}).strict();
const memSessionInputSchema = z.object({
  operation: z.enum(LIFECYCLE_OPERATION_VALUES).describe('Root lifecycle operation.'),
  harness: z.enum(HARNESS_VALUES).describe('Verified native harness.'),
  project_key: projectKeySchema,
  project_name: projectNameSchema,
  root_session_key: z.string().min(1).describe('Stable verified root session key.'),
  event_key: z.string().min(1).describe('Stable lifecycle key; retries must resend identical content/summary.'),
  content: z.string().optional(),
  summary: sessionSummarySchema.optional().describe('Session summary.'),
}).strict();
const memContextInputSchema = z.object({
  project_key: projectKeySchema,
  root_session_key: z.string().min(1).optional().describe('Verified root session key.'),
  harness: z.enum(HARNESS_VALUES).optional().describe('Verified native harness.'),
  budget_chars: z.number().optional(),
  correlation_id: z.string().optional(),
  finalize_answer: z.boolean().optional(),
}).strict();
const projectLimitMessage = 'limit must be an integer from 1 to 100 for action="timeline" or action="observations"';
const projectCursorMessage = 'cursor must be an unchanged nextCursor from mem_project action="timeline"';
const memProjectInputSchema = z.object({
  action: z.enum(['list', 'timeline', 'briefing', 'history', 'summaries', 'observations']).describe('Project view.'),
  project_key: projectKeySchema.optional(),
  id: z.string().min(1).optional().describe('Prior-result record id.'),
  root_session_key: z.string().min(1).optional().describe('Verified session filter; pair with harness or omit both.'),
  harness: z.enum(HARNESS_VALUES).optional().describe('Native harness for session filter.'),
  temporal: z.enum(['current', 'history']).optional().describe('Summaries/observations only: current=latest summaries/correction leaves; history=older summaries/observation predecessors.'),
  state: z.enum(OBSERVATION_STATE_VALUES).optional().describe('Observations state filter.'),
  limit: z.number().int(projectLimitMessage).positive(projectLimitMessage).max(100, projectLimitMessage).optional().describe('Maximum items for timeline/observations.'),
  budget_chars: z.number().optional().describe('Aggregate character budget for timeline/briefing/summaries/observations; timeline clamps positive integers to 1024-20000.'),
  since: z.string().min(1).optional().describe('Timeline inclusive lower ISO-8601 instant; <= until.'),
  until: z.string().min(1).optional().describe('Timeline inclusive upper ISO-8601 instant.'),
  cursor: z.string().min(1, projectCursorMessage).max(4_096, projectCursorMessage).optional().describe('Timeline nextCursor, unchanged; keep project_key, since, until unchanged.'),
}).strict();

function string(value: unknown, label: string, message = `${label} is required`): string { if (typeof value !== 'string' || !value.trim()) throw new Error(message); return value; }
function optionalString(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value : undefined; }
function number(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function parseToolInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const messages = parsed.error.issues.map((issue) => {
    let field = issue.path.join('.') || 'request';
    if (field === 'evidence' && typeof input === 'object' && input !== null && 'evidence' in input) {
      const evidence = (input as { evidence?: unknown }).evidence;
      if (typeof evidence === 'object' && evidence !== null && 'kind' in evidence && !DIRECT_EVIDENCE_KIND_VALUES.includes(String((evidence as { kind?: unknown }).kind) as typeof DIRECT_EVIDENCE_KIND_VALUES[number])) field = 'evidence.kind';
    }
    return `${field}: ${issue.message}`;
  });
  throw new Error(messages.join('; '));
}
function success(tool: MemoryToolName, data: unknown, extras: Record<string, unknown> = {}): ToolResult {
  const { text, structuredContent, isError } = boundedJson({ schema: `thoth-mem.mcp.${tool}`, data, ...extras });
  return { content: [{ type: 'text', text }], structuredContent, ...(isError ? { isError } : {}) };
}
function failure(message: string, code = 'invalid_request'): ToolResult { const structuredContent = { schema: 'thoth-mem.mcp.error', error: { code, message: message.slice(0, 1000), retryable: false } }; return { isError: true, content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent }; }
function guarded(handler: ToolHandler): ToolHandler { return async (input) => { try { return await handler(input); } catch (error) { return failure(error instanceof Error ? error.message : String(error)); } }; }
function publicRecallItem(item: RecallItem): Omit<RecallItem, 'evidenceIds'> { const { evidenceIds, ...publicItem } = item; void evidenceIds; return publicItem; }
function isSummaryContextItem(item: ContextItem): item is SummaryContextItem { return 'recordType' in item && item.recordType === 'summary'; }
function publicContextItem(item: ContextItem): unknown {
  if (!isSummaryContextItem(item)) return { recordType: 'memory', ...publicRecallItem(item) };
  return { recordType: 'summary', id: item.id, kind: item.kind, version: item.version, coverage: item.coverage, snippet: item.snippet, status: item.status, score: item.score };
}
function sessionPairError(rootSessionKey: string | undefined, harness: Harness | undefined): string | undefined {
  if (rootSessionKey && !harness) return 'root_session_key supplied without harness';
  if (!rootSessionKey && harness) return 'harness supplied without root_session_key';
  return undefined;
}
function sessionIdentity(rootSessionKey: string | undefined, harness: Harness | undefined): { rootSessionKey: string; harness: Harness } | undefined {
  const error = sessionPairError(rootSessionKey, harness);
  if (error) throw new Error(error);
  return rootSessionKey && harness ? { rootSessionKey, harness } : undefined;
}
function internalSummary(summary: z.infer<typeof sessionSummarySchema>): SessionSummaryInput {
  return {
    kind: summary.kind,
    coverage: { fromSequence: summary.coverage.from_sequence, toSequence: summary.coverage.to_sequence },
    generator: { kind: summary.generator.kind, name: summary.generator.name, ...(summary.generator.version ? { version: summary.generator.version } : {}), ...(summary.generator.config_hash ? { configHash: summary.generator.config_hash } : {}) },
    claims: summary.claims.map((claim) => ({ kind: claim.kind, content: claim.content, ...(claim.outcome ? { outcome: claim.outcome } : {}), supportIds: claim.support_ids })),
  };
}
function timelinePayload(result: TimelineResult) {
  return {
    data: { action: 'timeline', items: result.items, nextCursor: result.nextCursor, hasMore: result.hasMore },
    sources: result.items.map((item) => item.id),
    budget: { requested_chars: result.requestedChars, returned_chars: result.returnedChars },
    warnings: result.hasMore ? ['payload_truncated'] : [],
  };
}
function recordSourceIds(record: Record<string, unknown>): string[] {
  const id = String(record.id);
  if (record.recordType === 'summary') {
    const claims = Array.isArray(record.claims) ? record.claims as Array<{ supportIds?: string[] }> : [];
    return [id, String(record.submissionEvidenceId), ...claims.flatMap((claim) => claim.supportIds ?? [])];
  }
  if (record.recordType === 'observation') {
    const review = typeof record.review === 'object' && record.review !== null ? record.review as Record<string, unknown> : null;
    return [
      id,
      String(record.submissionEvidenceId),
      ...(Array.isArray(record.supportIds) ? record.supportIds.map(String) : []),
      ...(review ? [String(review.evidenceId), ...(Array.isArray(review.supportIds) ? review.supportIds.map(String) : [])] : []),
      ...(typeof record.promotionEvidenceId === 'string' ? [record.promotionEvidenceId] : []),
      ...(typeof record.promotedMemoryId === 'string' ? [record.promotedMemoryId] : []),
    ];
  }
  return [id, ...(Array.isArray(record.evidenceIds) ? record.evidenceIds.map(String) : [])];
}

export interface ToolSessionPolicy {
  connectionSession(projectKey: string): SessionIdentityInput | undefined;
}

export function createToolHandlers(service: MemoryService, sessions?: ToolSessionPolicy): ToolHandlers {
  const attribute = (input: Record<string, unknown>): Record<string, unknown> => {
    const root = input.root_session_key;
    const rootAbsent = root === undefined || (typeof root === 'string' && !root.trim());
    if (!rootAbsent || input.harness !== undefined) return input;
    const session = sessions?.connectionSession(string(input.project_key, 'project_key'));
    return session ? { ...input, root_session_key: session.rootSessionKey, harness: session.harness } : input;
  };
  const requireRoot = (session: SessionIdentityInput): void => {
    if (session.harness === 'mcp' && session.rootSessionKey.startsWith(MCP_CONNECTION_SESSION_PREFIX)) throw new Error('Connection sessions are unverified and cannot authorize observation review, promotion, or mem_session operations.');
  };
  return {
    mem_save: guarded(async (input) => {
      const parsed = parseToolInput(memSaveInputSchema, attribute(input));
      const project = { key: parsed.project_key, name: parsed.project_name };
      const session = sessionIdentity(optionalString(parsed.root_session_key), parsed.harness);
      if (session && (parsed.observation_review || parsed.observation_promotion)) requireRoot(session);
      if (parsed.observation) {
        const proposed = parsed.observation.proposed_memory;
        const data = service.submitObservation({ project, ...(session ? { session } : {}), eventKey: parsed.event_key!, observation: {
          kind: parsed.observation.kind, scope: parsed.observation.scope, title: parsed.observation.title, claim: parsed.observation.claim,
          proposedMemory: { kind: proposed.kind, title: proposed.title, content: proposed.content, topicKey: optionalString(proposed.topic_key), outcome: proposed.outcome },
          supportIds: parsed.observation.support_ids,
          ...(parsed.observation.coverage ? { coverage: { fromSequence: parsed.observation.coverage.from_sequence, toSequence: parsed.observation.coverage.to_sequence } } : {}),
          generator: { kind: parsed.observation.generator.kind, name: parsed.observation.generator.name, ...(parsed.observation.generator.version ? { version: parsed.observation.generator.version } : {}), ...(parsed.observation.generator.config_hash ? { configHash: parsed.observation.generator.config_hash } : {}) },
          ...(parsed.observation.concepts ? { concepts: parsed.observation.concepts } : {}), ...(parsed.observation.files ? { files: parsed.observation.files } : {}),
          ...(parsed.observation.predecessor_id ? { predecessorId: parsed.observation.predecessor_id } : {}),
        } });
        return success('mem_save', data, { sources: recordSourceIds(data.observation as unknown as Record<string, unknown>), lanes: { structured: 'ready' }, warnings: [] });
      }
      if (parsed.observation_review) {
        const review = parsed.observation_review;
        const data = service.reviewObservation({ project, session: session!, eventKey: parsed.event_key!, review: { observationId: review.observation_id, verdict: review.verdict, basis: review.basis, policy: review.policy, reason: review.reason, supportIds: review.support_ids } });
        return success('mem_save', data, { sources: recordSourceIds(data.observation as unknown as Record<string, unknown>), lanes: { structured: 'ready' }, warnings: [] });
      }
      if (parsed.observation_promotion) {
        const data = service.promoteObservation({ project, session: session!, eventKey: parsed.event_key!, observationId: parsed.observation_promotion.observation_id });
        return success('mem_save', data, { sources: recordSourceIds(data.observation as unknown as Record<string, unknown>), lanes: { lexical: 'ready', structured: 'ready' }, warnings: [] });
      }
      const evidence = parsed.evidence!;
      const metadata = 'metadata' in evidence ? evidence.metadata : undefined;
      const saveInput: SaveMemoryInput = { project, ...(session ? { session } : {}), evidence: { kind: evidence.kind, content: evidence.content, sourceRef: optionalString(evidence.source_ref), ...(metadata ? { metadata } : {}) }, ...(parsed.memory ? { memory: { kind: parsed.memory.kind, title: parsed.memory.title, content: parsed.memory.content, topicKey: optionalString(parsed.memory.topic_key), outcome: parsed.memory.outcome, supersedesId: optionalString(parsed.memory.supersedes_id) } } : {}), eventKey: optionalString(parsed.event_key) };
      const data = service.save(saveInput); return success('mem_save', data, { sources: [data.evidence.id, ...(data.memory ? [data.memory.id] : [])], lanes: { lexical: 'ready' }, warnings: [] });
    }),
    mem_recall: guarded(async (input) => {
      const mode = input.mode === 'context' ? 'context' : 'compact'; const result = service.recall({ projectKey: string(input.project_key, 'project_key'), query: string(input.query, 'query', 'query must be a non-empty search string'), mode, history: input.temporal === 'history', budgetChars: number(input.budget_chars, mode === 'context' ? 4000 : 1200), limit: number(input.limit, 5), correlationId: optionalString(input.correlation_id) });
      return success('mem_recall', { mode, items: result.items.map(publicRecallItem) }, { sources: result.items.map((item) => item.id), budget: { requested_chars: result.budget.requestedChars, returned_chars: result.budget.returnedChars, truncated_chars: result.budget.truncatedChars, source_chars: result.budget.sourceChars, evidence_chars: result.budget.evidenceChars, full_chars: result.budget.fullChars, compression_ratio: result.budget.compressionRatio, token_basis: result.budget.tokenBasis }, lanes: result.lanes, warnings: result.warnings, correlation_id: result.correlationId, telemetry: service.retrievalTelemetry(result.correlationId, mode, input.finalize_answer === true) });
    }),
    mem_context: guarded(async (input) => { const attributed = attribute(input); const parsed = parseToolInput(memContextInputSchema, attributed); const result = service.context({ projectKey: parsed.project_key, rootSessionKey: parsed.root_session_key, harness: parsed.harness, budgetChars: number(parsed.budget_chars, 4000), correlationId: optionalString(parsed.correlation_id) }, attributed === input ? 'explicit' : 'recovery'); return success('mem_context', { items: result.items.map(publicContextItem), selectedSummaryIds: result.selectedSummaryIds, selectedMemoryIds: result.selectedMemoryIds, selectedRecordIds: result.selectedRecordIds }, { sources: result.items.map((item) => item.id), budget: { requested_chars: result.budget.requestedChars, returned_chars: result.budget.returnedChars, truncated_chars: result.budget.truncatedChars, source_chars: result.budget.sourceChars, evidence_chars: result.budget.evidenceChars, full_chars: result.budget.fullChars, compression_ratio: result.budget.compressionRatio, token_basis: result.budget.tokenBasis }, lanes: result.lanes, warnings: result.warnings, correlation_id: result.correlationId, telemetry: service.retrievalTelemetry(result.correlationId, 'context', parsed.finalize_answer === true) }); }),
    mem_get: guarded(async (input) => {
      const selected = service.get({ id: string(input.id, 'id'), history: input.history === true });
      const result = { record: selected.record, lineage: input.history === true ? selected.lineage.slice(1) : [] };
      const correlationId = optionalString(input.correlation_id);
      return success('mem_get', result, { sources: [...new Set([recordSourceIds(result.record as unknown as Record<string, unknown>), ...result.lineage.map((item) => recordSourceIds(item as unknown as Record<string, unknown>))].flat())], lanes: { structured: 'ready' }, warnings: [], ...(correlationId ? { correlation_id: correlationId } : {}), telemetry: correlationId ? service.retrievalTelemetry(correlationId, 'full_fetch') : { stage: 'full_fetch', finalized: true, escalated: true, avoided: false, full_fetches: 1, avoided_full_fetches: 0 } });
    }),
    mem_project: guarded(async (input) => {
      const parsed = parseToolInput(memProjectInputSchema, input); const action = parsed.action;
      if (action === 'timeline') {
        const forbiddenFields = (['id', 'root_session_key', 'harness', 'temporal', 'state'] as const).filter((field) => parsed[field] !== undefined);
        if (forbiddenFields.length > 0) throw new Error(`action="timeline" does not accept ${forbiddenFields.join(', ')}; send only project_key, since, until, cursor, limit, and budget_chars`);
        const result = service.timeline(
          { projectKey: string(parsed.project_key, 'project_key', `project_key is required for action="${action}"`), since: parsed.since, until: parsed.until, cursor: parsed.cursor, limit: parsed.limit, budgetChars: parsed.budget_chars },
          (page) => JSON.stringify({ schema: 'thoth-mem.mcp.mem_project', ...timelinePayload(page) }).length,
        );
        const { data, ...extras } = timelinePayload(result);
        return success('mem_project', data, extras);
      }
      const timelineFields = (['since', 'until', 'cursor'] as const).filter((field) => parsed[field] !== undefined);
      if (timelineFields.length > 0) throw new Error(`received ${timelineFields.join(', ')} for action="${action}"; omit these timeline-only fields or use action="timeline"`);
      if (action === 'list') return success('mem_project', { projects: service.listProjects() });
      const identity = sessionIdentity(parsed.root_session_key, parsed.harness);
      if (action === 'briefing') { const projectKey = string(parsed.project_key, 'project_key', `project_key is required for action="${action}"`); const connection = identity ? undefined : sessions?.connectionSession(projectKey); const result = service.context({ projectKey, ...(identity ?? connection ?? {}), budgetChars: number(parsed.budget_chars, 5000) }, connection ? 'recovery' : 'explicit'); return success('mem_project', { action, items: result.items.map(publicContextItem), selectedSummaryIds: result.selectedSummaryIds, selectedMemoryIds: result.selectedMemoryIds, selectedRecordIds: result.selectedRecordIds }, { sources: result.items.map((item) => item.id), budget: { requested_chars: result.budget.requestedChars, returned_chars: result.budget.returnedChars, compression_ratio: result.budget.compressionRatio } }); }
      if (action === 'history') { const result = service.get({ id: string(parsed.id, 'id', 'id is required for action="history"; send a record id from a prior result'), history: true }); return success('mem_project', { action, lineage: result.lineage }, { sources: [...new Set(result.lineage.flatMap((item) => recordSourceIds(item as unknown as Record<string, unknown>)))] }); }
      if (action === 'summaries') { const result = service.projectSummaries({ projectKey: string(parsed.project_key, 'project_key', `project_key is required for action="${action}"`), ...(identity ?? {}), history: parsed.temporal === 'history', budgetChars: number(parsed.budget_chars, 4_000) }); return success('mem_project', { action, items: result.items }, { sources: [...new Set(result.items.flatMap((item) => recordSourceIds(item as unknown as Record<string, unknown>)))], budget: { requested_chars: result.requestedChars, returned_chars: result.returnedChars }, warnings: result.truncated ? ['payload_truncated'] : [] }); }
      if (action === 'observations') { const result = service.listObservations({ projectKey: string(parsed.project_key, 'project_key', `project_key is required for action="${action}"`), ...(identity ?? {}), temporal: parsed.temporal, state: parsed.state, limit: parsed.limit, budgetChars: number(parsed.budget_chars, 4_000) }); return success('mem_project', { action, items: result.items }, { sources: result.items.map((item) => item.id), budget: { requested_chars: result.requestedChars, returned_chars: result.returnedChars }, warnings: result.truncated ? ['payload_truncated'] : [] }); }
      return failure(`Unsupported mem_project action: ${action}`);
    }),
    mem_session: guarded(async (input) => { const parsed = parseToolInput(memSessionInputSchema, input); requireRoot({ rootSessionKey: parsed.root_session_key, harness: parsed.harness }); const data = service.lifecycle({ operation: parsed.operation, harness: parsed.harness, project: { key: parsed.project_key, name: parsed.project_name }, rootSessionKey: parsed.root_session_key, eventKey: parsed.event_key, content: optionalString(parsed.content), ...(parsed.summary ? { summary: internalSummary(parsed.summary) } : {}) }); return success('mem_session', data, { sources: [data.projectId, data.sessionId, ...(data.evidenceId ? [data.evidenceId] : []), ...(data.summaryId ? [data.summaryId] : [])], lanes: { structured: 'ready' }, warnings: [] }); }),
  };
}

export function registerTools(server: McpServer, service: MemoryService, sessions?: ToolSessionPolicy): void {
  const handlers = createToolHandlers(service, sessions);
  for (const item of MEMORY_TOOL_CATALOG) server.tool(item.name, item.description, TOOL_SCHEMA_SHAPES[item.name], async (args) => handlers[item.name](args));
}
export function getToolCount(): number { return ALL_TOOLS.length; }

const TOOL_SCHEMA_SHAPES: Record<MemoryToolName, Record<string, z.ZodType>> = {
  mem_save: memSaveBaseInputSchema.shape,
  mem_recall: { project_key: projectKeySchema, query: z.string().min(1, 'query must be a non-empty search string').describe('Non-empty task search terms.'), mode: z.enum(['compact', 'context']).optional().describe('compact (default): bounded snippets; context: selected content.'), temporal: z.enum(['current', 'history']).optional().describe('current (default): current guidance; history: historical records.'), budget_chars: z.number().optional(), limit: z.number().optional(), correlation_id: z.string().optional(), finalize_answer: z.boolean().optional() },
  mem_context: memContextInputSchema.shape,
  mem_get: { id: z.string().describe('Memory, summary, observation, or evidence id.'), history: z.boolean().optional().describe('true: include predecessor lineage; evidence has no lineage.'), correlation_id: z.string().optional() },
  mem_project: memProjectInputSchema.shape,
  mem_session: memSessionInputSchema.shape,
};

export interface MemoryToolCatalogItem {
  name: MemoryToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}

function publicInputSchema(name: MemoryToolName): Record<string, unknown> {
  const { $schema: _dialect, additionalProperties: _additionalProperties, ...schema } = z.toJSONSchema(z.object(TOOL_SCHEMA_SHAPES[name]), { target: 'draft-7' }) as Record<string, unknown>;
  return schema;
}

export const MEMORY_TOOL_CATALOG: readonly MemoryToolCatalogItem[] = Object.freeze(ALL_TOOLS.map((name) => Object.freeze({
  name,
  description: TOOL_DESCRIPTIONS[name],
  inputSchema: publicInputSchema(name),
})));
