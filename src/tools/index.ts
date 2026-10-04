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
  type SessionSummaryInput,
  type SummaryContextItem,
} from '../memory-core/contracts.js';
import type { MemoryService } from '../memory-core/service.js';

export const ALL_TOOLS = ['mem_save', 'mem_recall', 'mem_context', 'mem_get', 'mem_project', 'mem_session'] as const;
export type MemoryToolName = typeof ALL_TOOLS[number];
export interface ToolResult { [key: string]: unknown; content: Array<{ type: 'text'; text: string }>; structuredContent: Record<string, unknown>; isError?: boolean }
type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;
type ToolHandlers = Record<MemoryToolName, ToolHandler>;

export const TOOL_DESCRIPTIONS: Readonly<Record<MemoryToolName, string>> = {
  mem_save: [
    'Save verified durable decisions, discoveries, failures, conventions, and continuation handoffs.',
    'For a direct promoted memory other than a handoff, write memory.content as concise labeled Result, Rationale, Scope, and Caveat / safe action lines.',
    'Omit Scope or Caveat / safe action when it does not apply, and never invent details to fill the template.',
    'Keep evidence compact and factual. Handoff memories keep the dedicated Objective, Completed, First pending action, Blockers, and Key files/checks format and require a stable workstream topic_key; close a finished handoff by saving its outcome under the same topic_key.',
    'Send exactly one branch: evidence (optionally + memory for a direct promoted save; structured evidence with metadata forbids memory and requires event_key plus the session pair), observation (requires event_key; session scope also requires the session pair and coverage), observation_review or observation_promotion (each requires event_key plus the session pair).',
    'Supply root_session_key and harness together or omit both.',
  ].join(' '),
  mem_recall: 'Search promoted project memory with a non-empty query before expanding selected records. temporal="current" (default) searches current guidance; temporal="history" includes historical records. mode="compact" (default) returns bounded snippets; mode="context" adds selected memory content.',
  mem_context: 'Build bounded handoff-first continuity. project_key is always required. Supply both root_session_key and harness for session context, or omit both for project context.',
  mem_get: 'Expand one selected memory, summary, observation, or evidence id returned by a prior tool result. Set history:true to include predecessor lineage for memory, summary, or observation records; evidence ids return evidence without lineage.',
  mem_project: 'Inspect project views without mutation. action="list": no fields required. action="timeline": project_key required; optionally since, until, cursor, limit, and budget_chars. action="briefing", "summaries", or "observations": project_key required; optionally supply both root_session_key and harness to select that session\'s summaries/observations (briefing still includes project-wide memories). action="history": id required from a prior result. temporal filters summaries/observations, not timeline. list returns at most 256 exact aliases per project plus aliasCount and aliasesTruncated metadata.',
  mem_session: 'Record verified root lifecycle events; never use it as an ordinary save. summary is optional and only valid for operation="checkpoint_pre_compact" with kind="checkpoint" or operation="finalize" with kind="final". summary.coverage starts at 1 and its to_sequence must advance the current ending sequence for this session and kind. Each claim\'s support_ids must be evidence ids from this project_key + root_session_key/harness session inside summary.coverage.',
};

const DIRECT_EVIDENCE_KIND_VALUES = EVIDENCE_KIND_VALUES.filter((kind) => !['observation', 'observation_review', 'observation_promotion'].includes(kind)) as [typeof EVIDENCE_KIND_VALUES[number], ...Array<typeof EVIDENCE_KIND_VALUES[number]>];
const projectKeySchema = z.string().min(1).describe('Exact opaque project_key copied verbatim from verified native identity; never derive it from a display name, path hint, remote, branch, worktree name, host ID, listing, or recalled content.');
const projectNameSchema = z.string().min(1).describe('Creation/display metadata only; never participates in project identity equality. Prefer the database-persisted name returned by lifecycle or project output.');
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
  project_key: projectKeySchema,
  project_name: projectNameSchema,
  root_session_key: z.string().optional().describe('Verified root session key; supply with harness or omit both. Required for session-scoped observations, observation_review, observation_promotion, and evidence with metadata; blank counts as absent.'),
  harness: z.enum(HARNESS_VALUES).optional().describe('Native harness for root_session_key; supply both or omit both. Required wherever root_session_key is required.'),
  event_key: z.string().optional().describe('Stable event key for idempotency; required for observation, observation_review, observation_promotion, and evidence with metadata.'),
  evidence: evidenceInputSchema.optional().describe('Direct evidence { kind, content }; optionally add memory for a promoted save. Structured metadata forbids memory and requires event_key, root_session_key, and harness.'),
  memory: memoryInputSchema.optional().describe('Promoted memory for direct evidence only; requires evidence without metadata. Do not combine with observation, observation_review, or observation_promotion.'),
  observation: observationSchema.optional().describe('Submit a supported candidate without promotion; requires event_key. Session scope also requires root_session_key, harness, and coverage.'),
  observation_review: observationReviewSchema.optional().describe('Review one supported observation; requires event_key, root_session_key, and harness. Send no other operation branch or memory.'),
  observation_promotion: observationPromotionSchema.optional().describe('Promote one accepted observation without new prose; requires event_key, root_session_key, and harness. Send no other operation branch or memory.'),
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
  from_sequence: z.number().int().positive().describe('Inclusive first session event sequence; must start at 1.'),
  to_sequence: z.number().int().positive().describe('Inclusive last session event sequence; must be >= from_sequence and exceed the current summary ending sequence for this session and kind.'),
}).strict().describe('Inclusive session evidence coverage; start at 1 and advance to_sequence for this session and summary kind.');
const summaryGeneratorSchema = z.object({
  kind: z.enum(SESSION_SUMMARY_GENERATOR_KIND_VALUES),
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(200).optional(),
  config_hash: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
}).strict();
const summaryClaimSchema = z.object({
  kind: z.enum(SESSION_SUMMARY_CLAIM_KIND_VALUES),
  content: z.string().min(1).describe(`Atomic claim content; at most ${SESSION_SUMMARY_LIMITS.maxClaimCodePoints} code points after privacy filtering.`),
  outcome: z.enum(MEMORY_OUTCOME_VALUES).optional(),
  support_ids: z.array(z.string().min(1).max(200)).min(SESSION_SUMMARY_LIMITS.minSupportsPerClaim).max(SESSION_SUMMARY_LIMITS.maxSupportsPerClaim).describe(`${SESSION_SUMMARY_LIMITS.minSupportsPerClaim}-${SESSION_SUMMARY_LIMITS.maxSupportsPerClaim} distinct evidence ids from this project_key + root_session_key/harness session inside summary.coverage; never memory, summary, or observation ids.`),
}).strict();
const sessionSummarySchema = z.object({
  kind: z.enum(SESSION_SUMMARY_KIND_VALUES).describe('Send checkpoint for operation="checkpoint_pre_compact" or final for operation="finalize".'),
  coverage: summaryCoverageSchema,
  generator: summaryGeneratorSchema,
  claims: z.array(summaryClaimSchema).min(SESSION_SUMMARY_LIMITS.minClaims).max(SESSION_SUMMARY_LIMITS.maxClaims).describe(`${SESSION_SUMMARY_LIMITS.minClaims}-${SESSION_SUMMARY_LIMITS.maxClaims} atomic supported claims; keep the canonical summary within ${SESSION_SUMMARY_LIMITS.maxCanonicalUtf16Units} UTF-16 units.`),
}).strict();
const memSessionInputSchema = z.object({
  operation: z.enum(LIFECYCLE_OPERATION_VALUES).describe('Lifecycle operation; summary is allowed only for checkpoint_pre_compact (checkpoint) or finalize (final).'),
  harness: z.enum(HARNESS_VALUES).describe('Verified native harness for root_session_key in project_key.'),
  project_key: projectKeySchema,
  project_name: projectNameSchema,
  root_session_key: z.string().min(1).describe('Stable verified root session key; required with harness for every operation.'),
  event_key: z.string().min(1).describe('Stable lifecycle event key; retries for the same operation must resend identical content/summary.'),
  content: z.string().optional(),
  summary: sessionSummarySchema.optional().describe(`Optional only for operation="checkpoint_pre_compact" (kind="checkpoint") or operation="finalize" (kind="final"). coverage starts at 1 and to_sequence must advance the current summary for this session and kind. support_ids must be evidence ids from this project_key + root_session_key/harness session inside coverage. Canonical submission limit: ${SESSION_SUMMARY_LIMITS.maxCanonicalUtf16Units} UTF-16 units.`),
}).strict();
const memContextInputSchema = z.object({
  project_key: projectKeySchema,
  root_session_key: z.string().min(1).optional().describe('Optional verified root session key; supply with harness for session context, or omit both for project context.'),
  harness: z.enum(HARNESS_VALUES).optional().describe('Native harness for root_session_key; supply both for session context, or omit both for project context.'),
  budget_chars: z.number().optional(),
  correlation_id: z.string().optional(),
  finalize_answer: z.boolean().optional(),
}).strict();
const projectLimitMessage = 'limit must be an integer from 1 to 100 for action="timeline" or action="observations"';
const projectCursorMessage = 'cursor must be an unchanged nextCursor from mem_project action="timeline"';
const memProjectInputSchema = z.object({
  action: z.enum(['list', 'timeline', 'briefing', 'history', 'summaries', 'observations']).describe(TOOL_DESCRIPTIONS.mem_project),
  project_key: projectKeySchema.optional().describe(`${projectKeySchema.description} Required for action="timeline", "briefing", "summaries", or "observations"; not required for "list" or "history".`),
  id: z.string().min(1).optional().describe('Required for action="history"; send a record id returned by a prior tool result.'),
  root_session_key: z.string().min(1).optional().describe('Optional session filter for action="briefing", "summaries", or "observations"; supply with harness or omit both.'),
  harness: z.enum(HARNESS_VALUES).optional().describe('Native harness for the optional root_session_key filter; supply both or omit both. Not accepted for action="timeline".'),
  temporal: z.enum(['current', 'history']).optional().describe('Filter summaries/observations: current selects current summary versions or observation correction-chain leaves; history includes older summary versions or selects observation predecessors. Not accepted for action="timeline".'),
  state: z.enum(OBSERVATION_STATE_VALUES).optional().describe('Optional state filter for action="observations".'),
  limit: z.number().int(projectLimitMessage).positive(projectLimitMessage).max(100, projectLimitMessage).optional().describe('Maximum items (1-100) for action="timeline" or "observations".'),
  budget_chars: z.number().optional().describe('Optional aggregate character budget for timeline, briefing, summaries, or observations; timeline clamps a positive integer to 1024-20000 characters.'),
  since: z.string().min(1).optional().describe('Optional inclusive lower ISO-8601 instant for action="timeline" only; must be <= until.'),
  until: z.string().min(1).optional().describe('Optional inclusive upper ISO-8601 instant for action="timeline" only; must be >= since.'),
  cursor: z.string().min(1, projectCursorMessage).max(4_096, projectCursorMessage).optional().describe('Unchanged nextCursor from a prior mem_project action="timeline" result; keep project_key, since, and until unchanged.'),
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
function success(tool: MemoryToolName, data: unknown, extras: Record<string, unknown> = {}): ToolResult { const structuredContent = { schema: `thoth-mem.mcp.${tool}`, data, ...extras }; const text = JSON.stringify(structuredContent); return { content: [{ type: 'text', text: text.length > 20_000 ? `${text.slice(0, 19_900)}…` : text }], structuredContent }; }
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

export function createToolHandlers(service: MemoryService): ToolHandlers {
  return {
    mem_save: guarded(async (input) => {
      const parsed = parseToolInput(memSaveInputSchema, input);
      const project = { key: parsed.project_key, name: parsed.project_name };
      const session = sessionIdentity(optionalString(parsed.root_session_key), parsed.harness);
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
    mem_context: guarded(async (input) => { const parsed = parseToolInput(memContextInputSchema, input); const result = service.context({ projectKey: parsed.project_key, rootSessionKey: parsed.root_session_key, harness: parsed.harness, budgetChars: number(parsed.budget_chars, 4000), correlationId: optionalString(parsed.correlation_id) }); return success('mem_context', { items: result.items.map(publicContextItem), selectedSummaryIds: result.selectedSummaryIds, selectedMemoryIds: result.selectedMemoryIds, selectedRecordIds: result.selectedRecordIds }, { sources: result.items.map((item) => item.id), budget: { requested_chars: result.budget.requestedChars, returned_chars: result.budget.returnedChars, truncated_chars: result.budget.truncatedChars, source_chars: result.budget.sourceChars, evidence_chars: result.budget.evidenceChars, full_chars: result.budget.fullChars, compression_ratio: result.budget.compressionRatio, token_basis: result.budget.tokenBasis }, lanes: result.lanes, warnings: result.warnings, correlation_id: result.correlationId, telemetry: service.retrievalTelemetry(result.correlationId, 'context', parsed.finalize_answer === true) }); }),
    mem_get: guarded(async (input) => { const result = service.get({ id: string(input.id, 'id'), history: input.history === true }); const correlationId = optionalString(input.correlation_id); return success('mem_get', result, { sources: [...new Set([recordSourceIds(result.record as unknown as Record<string, unknown>), ...result.lineage.map((item) => recordSourceIds(item as unknown as Record<string, unknown>))].flat())], lanes: { structured: 'ready' }, warnings: [], ...(correlationId ? { correlation_id: correlationId } : {}), telemetry: correlationId ? service.retrievalTelemetry(correlationId, 'full_fetch') : { stage: 'full_fetch', finalized: true, escalated: true, avoided: false, full_fetches: 1, avoided_full_fetches: 0 } }); }),
    mem_project: guarded(async (input) => {
      const parsed = parseToolInput(memProjectInputSchema, input); const action = parsed.action;
      if (action === 'timeline') {
        const forbiddenFields = (['id', 'root_session_key', 'harness', 'temporal', 'state'] as const).filter((field) => parsed[field] !== undefined);
        if (forbiddenFields.length > 0) throw new Error(`action="timeline" does not accept ${forbiddenFields.join(', ')}; send only project_key, since, until, cursor, limit, and budget_chars`);
        const result = service.timeline({ projectKey: string(parsed.project_key, 'project_key', `project_key is required for action="${action}"`), since: parsed.since, until: parsed.until, cursor: parsed.cursor, limit: parsed.limit, budgetChars: parsed.budget_chars });
        return success('mem_project', { action, items: result.items, nextCursor: result.nextCursor, hasMore: result.hasMore }, { sources: result.items.map((item) => item.id), budget: { requested_chars: result.requestedChars, returned_chars: result.returnedChars }, warnings: result.hasMore ? ['payload_truncated'] : [] });
      }
      const timelineFields = (['since', 'until', 'cursor'] as const).filter((field) => parsed[field] !== undefined);
      if (timelineFields.length > 0) throw new Error(`received ${timelineFields.join(', ')} for action="${action}"; omit these timeline-only fields or use action="timeline"`);
      if (action === 'list') return success('mem_project', { projects: service.listProjects() });
      const identity = sessionIdentity(parsed.root_session_key, parsed.harness);
      if (action === 'briefing') { const result = service.context({ projectKey: string(parsed.project_key, 'project_key', `project_key is required for action="${action}"`), ...(identity ?? {}), budgetChars: number(parsed.budget_chars, 5000) }); return success('mem_project', { action, items: result.items.map(publicContextItem), selectedSummaryIds: result.selectedSummaryIds, selectedMemoryIds: result.selectedMemoryIds, selectedRecordIds: result.selectedRecordIds }, { sources: result.items.map((item) => item.id), budget: { requested_chars: result.budget.requestedChars, returned_chars: result.budget.returnedChars, compression_ratio: result.budget.compressionRatio } }); }
      if (action === 'history') { const result = service.get({ id: string(parsed.id, 'id', 'id is required for action="history"; send a record id from a prior result'), history: true }); return success('mem_project', { action, lineage: result.lineage }, { sources: [...new Set(result.lineage.flatMap((item) => recordSourceIds(item as unknown as Record<string, unknown>)))] }); }
      if (action === 'summaries') { const result = service.projectSummaries({ projectKey: string(parsed.project_key, 'project_key', `project_key is required for action="${action}"`), ...(identity ?? {}), history: parsed.temporal === 'history', budgetChars: number(parsed.budget_chars, 4_000) }); return success('mem_project', { action, items: result.items }, { sources: [...new Set(result.items.flatMap((item) => recordSourceIds(item as unknown as Record<string, unknown>)))], budget: { requested_chars: result.requestedChars, returned_chars: result.returnedChars }, warnings: result.truncated ? ['payload_truncated'] : [] }); }
      if (action === 'observations') { const result = service.listObservations({ projectKey: string(parsed.project_key, 'project_key', `project_key is required for action="${action}"`), ...(identity ?? {}), temporal: parsed.temporal, state: parsed.state, limit: parsed.limit, budgetChars: number(parsed.budget_chars, 4_000) }); return success('mem_project', { action, items: result.items }, { sources: result.items.map((item) => item.id), budget: { requested_chars: result.requestedChars, returned_chars: result.returnedChars }, warnings: result.truncated ? ['payload_truncated'] : [] }); }
      return failure(`Unsupported mem_project action: ${action}`);
    }),
    mem_session: guarded(async (input) => { const parsed = parseToolInput(memSessionInputSchema, input); const data = service.lifecycle({ operation: parsed.operation, harness: parsed.harness, project: { key: parsed.project_key, name: parsed.project_name }, rootSessionKey: parsed.root_session_key, eventKey: parsed.event_key, content: optionalString(parsed.content), ...(parsed.summary ? { summary: internalSummary(parsed.summary) } : {}) }); return success('mem_session', data, { sources: [data.projectId, data.sessionId, ...(data.evidenceId ? [data.evidenceId] : []), ...(data.summaryId ? [data.summaryId] : [])], lanes: { structured: 'ready' }, warnings: [] }); }),
  };
}

export function registerTools(server: McpServer, service: MemoryService): void {
  const handlers = createToolHandlers(service);
  for (const item of MEMORY_TOOL_CATALOG) server.tool(item.name, item.description, TOOL_SCHEMA_SHAPES[item.name], async (args) => handlers[item.name](args));
}
export function getToolCount(): number { return ALL_TOOLS.length; }

const TOOL_SCHEMA_SHAPES: Record<MemoryToolName, Record<string, z.ZodType>> = {
  mem_save: memSaveBaseInputSchema.shape,
  mem_recall: { project_key: projectKeySchema, query: z.string().min(1, 'query must be a non-empty search string').describe('Non-empty search string for promoted project memory.'), mode: z.enum(['compact', 'context']).optional().describe('compact (default) returns bounded snippets; context adds selected memory content.'), temporal: z.enum(['current', 'history']).optional().describe('current (default) searches current guidance; history includes historical records.'), budget_chars: z.number().optional(), limit: z.number().optional(), correlation_id: z.string().optional(), finalize_answer: z.boolean().optional() },
  mem_context: memContextInputSchema.shape,
  mem_get: { id: z.string().describe('Memory, summary, observation, or evidence id returned by a prior tool result.'), history: z.boolean().optional().describe('Set true to expand predecessor lineage for memory, summary, or observation records; evidence ids have no lineage.'), correlation_id: z.string().optional() },
  mem_project: memProjectInputSchema.shape,
  mem_session: memSessionInputSchema.shape,
};

export interface MemoryToolCatalogItem {
  name: MemoryToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}

function publicInputSchema(name: MemoryToolName): Record<string, unknown> {
  const { additionalProperties: _additionalProperties, ...schema } = z.toJSONSchema(z.object(TOOL_SCHEMA_SHAPES[name]), { target: 'draft-7' }) as Record<string, unknown>;
  return schema;
}

export const MEMORY_TOOL_CATALOG: readonly MemoryToolCatalogItem[] = Object.freeze(ALL_TOOLS.map((name) => Object.freeze({
  name,
  description: TOOL_DESCRIPTIONS[name],
  inputSchema: publicInputSchema(name),
})));
