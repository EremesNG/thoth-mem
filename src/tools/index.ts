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

const DIRECT_EVIDENCE_KIND_VALUES = EVIDENCE_KIND_VALUES.filter((kind) => !['observation', 'observation_review', 'observation_promotion'].includes(kind)) as [typeof EVIDENCE_KIND_VALUES[number], ...Array<typeof EVIDENCE_KIND_VALUES[number]>];
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
  project_key: z.string().min(1),
  project_name: z.string().min(1),
  root_session_key: z.string().optional(),
  harness: z.enum(HARNESS_VALUES).optional(),
  event_key: z.string().optional(),
  evidence: evidenceInputSchema.optional(),
  memory: memoryInputSchema.optional(),
  observation: observationSchema.optional(),
  observation_review: observationReviewSchema.optional(),
  observation_promotion: observationPromotionSchema.optional(),
}).strict();
const memSaveInputSchema = memSaveBaseInputSchema.superRefine((value, context) => {
  const branches = [value.evidence !== undefined, value.observation !== undefined, value.observation_review !== undefined, value.observation_promotion !== undefined].filter(Boolean).length;
  if (branches !== 1) context.addIssue({ code: 'custom', path: [], message: 'exactly one mem_save operation branch is required' });
  if (value.memory && !value.evidence) context.addIssue({ code: 'custom', path: ['memory'], message: 'memory is valid only with direct evidence' });
  if (value.evidence && 'metadata' in value.evidence && value.memory) context.addIssue({ code: 'custom', path: ['memory'], message: 'structured support evidence cannot include memory' });
  const requiresEvent = value.observation || value.observation_review || value.observation_promotion || (value.evidence && 'metadata' in value.evidence);
  if (requiresEvent && !value.event_key) context.addIssue({ code: 'custom', path: ['event_key'], message: 'event_key is required for observation operations' });
  const requiresSession = value.observation_review || value.observation_promotion || (value.evidence && 'metadata' in value.evidence);
  if (requiresSession && (!value.root_session_key || !value.harness)) context.addIssue({ code: 'custom', path: ['root_session_key'], message: 'verified paired session identity is required' });
  if (value.observation?.scope === 'session' && (!value.root_session_key || !value.harness || !value.observation.coverage)) context.addIssue({ code: 'custom', path: ['observation'], message: 'session scope requires paired identity and coverage' });
  if (value.observation?.scope === 'project' && value.observation.coverage) context.addIssue({ code: 'custom', path: ['observation', 'coverage'], message: 'project scope forbids coverage' });
});
const summaryCoverageSchema = z.object({
  from_sequence: z.number().int().positive(),
  to_sequence: z.number().int().positive(),
}).strict();
const summaryGeneratorSchema = z.object({
  kind: z.enum(SESSION_SUMMARY_GENERATOR_KIND_VALUES),
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(200).optional(),
  config_hash: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
}).strict();
const summaryClaimSchema = z.object({
  kind: z.enum(SESSION_SUMMARY_CLAIM_KIND_VALUES),
  content: z.string().min(1),
  outcome: z.enum(MEMORY_OUTCOME_VALUES).optional(),
  support_ids: z.array(z.string().min(1).max(200)).min(SESSION_SUMMARY_LIMITS.minSupportsPerClaim).max(SESSION_SUMMARY_LIMITS.maxSupportsPerClaim),
}).strict();
const sessionSummarySchema = z.object({
  kind: z.enum(SESSION_SUMMARY_KIND_VALUES),
  coverage: summaryCoverageSchema,
  generator: summaryGeneratorSchema,
  claims: z.array(summaryClaimSchema).min(SESSION_SUMMARY_LIMITS.minClaims).max(SESSION_SUMMARY_LIMITS.maxClaims),
}).strict();
const memSessionInputSchema = z.object({
  operation: z.enum(LIFECYCLE_OPERATION_VALUES),
  harness: z.enum(HARNESS_VALUES),
  project_key: z.string().min(1),
  project_name: z.string().min(1),
  root_session_key: z.string().min(1),
  event_key: z.string().min(1),
  content: z.string().optional(),
  summary: sessionSummarySchema.optional(),
}).strict();
const memContextInputSchema = z.object({
  project_key: z.string().min(1),
  root_session_key: z.string().min(1).optional(),
  harness: z.enum(HARNESS_VALUES).optional(),
  budget_chars: z.number().optional(),
  correlation_id: z.string().optional(),
  finalize_answer: z.boolean().optional(),
}).strict();
const memProjectInputSchema = z.object({
  action: z.enum(['list', 'briefing', 'history', 'summaries', 'observations']),
  project_key: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
  root_session_key: z.string().min(1).optional(),
  harness: z.enum(HARNESS_VALUES).optional(),
  temporal: z.enum(['current', 'history']).optional(),
  state: z.enum(OBSERVATION_STATE_VALUES).optional(),
  limit: z.number().int().positive().max(100).optional(),
  budget_chars: z.number().optional(),
}).strict();

function string(value: unknown, label: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`); return value; }
function optionalString(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value : undefined; }
function number(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function parseToolInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  let field = issue?.path.join('.') || 'request';
  if (field === 'evidence' && typeof input === 'object' && input !== null && 'evidence' in input) {
    const evidence = (input as { evidence?: unknown }).evidence;
    if (typeof evidence === 'object' && evidence !== null && 'kind' in evidence && !DIRECT_EVIDENCE_KIND_VALUES.includes(String((evidence as { kind?: unknown }).kind) as typeof DIRECT_EVIDENCE_KIND_VALUES[number])) field = 'evidence.kind';
  }
  throw new Error(`${field}: ${issue?.message ?? 'invalid value'}`);
}
function success(tool: MemoryToolName, data: unknown, extras: Record<string, unknown> = {}): ToolResult { const structuredContent = { schema: `thoth-mem.mcp.${tool}`, data, ...extras }; const text = JSON.stringify(structuredContent); return { content: [{ type: 'text', text: text.length > 20_000 ? `${text.slice(0, 19_900)}…` : text }], structuredContent }; }
function failure(message: string, code = 'invalid_request'): ToolResult { const structuredContent = { schema: 'thoth-mem.mcp.error', error: { code, message: message.slice(0, 500), retryable: false } }; return { isError: true, content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent }; }
function guarded(handler: ToolHandler): ToolHandler { return async (input) => { try { return await handler(input); } catch (error) { return failure(error instanceof Error ? error.message : String(error)); } }; }
function publicRecallItem(item: RecallItem): Omit<RecallItem, 'evidenceIds'> { const { evidenceIds, ...publicItem } = item; void evidenceIds; return publicItem; }
function isSummaryContextItem(item: ContextItem): item is SummaryContextItem { return 'recordType' in item && item.recordType === 'summary'; }
function publicContextItem(item: ContextItem): unknown {
  if (!isSummaryContextItem(item)) return { recordType: 'memory', ...publicRecallItem(item) };
  return { recordType: 'summary', id: item.id, kind: item.kind, version: item.version, coverage: item.coverage, snippet: item.snippet, status: item.status, score: item.score };
}
function sessionIdentity(rootSessionKey: string | undefined, harness: Harness | undefined): { rootSessionKey: string; harness: Harness } | undefined {
  if ((rootSessionKey && !harness) || (!rootSessionKey && harness)) throw new Error('root_session_key and harness must be supplied together');
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
      const rootSessionKey = optionalString(parsed.root_session_key); const harness = parsed.harness;
      if ((rootSessionKey && !harness) || (!rootSessionKey && harness)) throw new Error('root_session_key and harness must be supplied together');
      const project = { key: parsed.project_key, name: parsed.project_name };
      const session = rootSessionKey && harness ? { rootSessionKey, harness } : undefined;
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
      const mode = input.mode === 'context' ? 'context' : 'compact'; const result = service.recall({ projectKey: string(input.project_key, 'project_key'), query: string(input.query, 'query'), mode, history: input.temporal === 'history', budgetChars: number(input.budget_chars, mode === 'context' ? 4000 : 1200), limit: number(input.limit, 5), correlationId: optionalString(input.correlation_id) });
      return success('mem_recall', { mode, items: result.items.map(publicRecallItem) }, { sources: result.items.map((item) => item.id), budget: { requested_chars: result.budget.requestedChars, returned_chars: result.budget.returnedChars, truncated_chars: result.budget.truncatedChars, source_chars: result.budget.sourceChars, evidence_chars: result.budget.evidenceChars, full_chars: result.budget.fullChars, compression_ratio: result.budget.compressionRatio, token_basis: result.budget.tokenBasis }, lanes: result.lanes, warnings: result.warnings, correlation_id: result.correlationId, telemetry: service.retrievalTelemetry(result.correlationId, mode, input.finalize_answer === true) });
    }),
    mem_context: guarded(async (input) => { const parsed = parseToolInput(memContextInputSchema, input); const identity = sessionIdentity(parsed.root_session_key, parsed.harness); const result = service.context({ projectKey: parsed.project_key, ...(identity ?? {}), budgetChars: number(parsed.budget_chars, 4000), correlationId: optionalString(parsed.correlation_id) }); return success('mem_context', { items: result.items.map(publicContextItem), selectedSummaryIds: result.selectedSummaryIds, selectedMemoryIds: result.selectedMemoryIds, selectedRecordIds: result.selectedRecordIds }, { sources: result.items.map((item) => item.id), budget: { requested_chars: result.budget.requestedChars, returned_chars: result.budget.returnedChars, truncated_chars: result.budget.truncatedChars, source_chars: result.budget.sourceChars, evidence_chars: result.budget.evidenceChars, full_chars: result.budget.fullChars, compression_ratio: result.budget.compressionRatio, token_basis: result.budget.tokenBasis }, lanes: result.lanes, warnings: result.warnings, correlation_id: result.correlationId, telemetry: service.retrievalTelemetry(result.correlationId, 'context', parsed.finalize_answer === true) }); }),
    mem_get: guarded(async (input) => { const result = service.get({ id: string(input.id, 'id'), history: input.history === true }); const correlationId = optionalString(input.correlation_id); return success('mem_get', result, { sources: [...new Set([recordSourceIds(result.record as unknown as Record<string, unknown>), ...result.lineage.map((item) => recordSourceIds(item as unknown as Record<string, unknown>))].flat())], lanes: { structured: 'ready' }, warnings: [], ...(correlationId ? { correlation_id: correlationId } : {}), telemetry: correlationId ? service.retrievalTelemetry(correlationId, 'full_fetch') : { stage: 'full_fetch', finalized: true, escalated: true, avoided: false, full_fetches: 1, avoided_full_fetches: 0 } }); }),
    mem_project: guarded(async (input) => {
      const parsed = parseToolInput(memProjectInputSchema, input); const action = parsed.action; if (action === 'list') return success('mem_project', { projects: service.listProjects() });
      const identity = sessionIdentity(parsed.root_session_key, parsed.harness);
      if (action === 'briefing') { const result = service.context({ projectKey: string(parsed.project_key, 'project_key'), ...(identity ?? {}), budgetChars: number(parsed.budget_chars, 5000) }); return success('mem_project', { action, items: result.items.map(publicContextItem), selectedSummaryIds: result.selectedSummaryIds, selectedMemoryIds: result.selectedMemoryIds, selectedRecordIds: result.selectedRecordIds }, { sources: result.items.map((item) => item.id), budget: { requested_chars: result.budget.requestedChars, returned_chars: result.budget.returnedChars, compression_ratio: result.budget.compressionRatio } }); }
      if (action === 'history') { const result = service.get({ id: string(parsed.id, 'id'), history: true }); return success('mem_project', { action, lineage: result.lineage }, { sources: [...new Set(result.lineage.flatMap((item) => recordSourceIds(item as unknown as Record<string, unknown>)))] }); }
      if (action === 'summaries') { const result = service.projectSummaries({ projectKey: string(parsed.project_key, 'project_key'), ...(identity ?? {}), history: parsed.temporal === 'history', budgetChars: number(parsed.budget_chars, 4_000) }); return success('mem_project', { action, items: result.items }, { sources: [...new Set(result.items.flatMap((item) => recordSourceIds(item as unknown as Record<string, unknown>)))], budget: { requested_chars: result.requestedChars, returned_chars: result.returnedChars }, warnings: result.truncated ? ['payload_truncated'] : [] }); }
      if (action === 'observations') { const result = service.listObservations({ projectKey: string(parsed.project_key, 'project_key'), ...(identity ?? {}), temporal: parsed.temporal, state: parsed.state, limit: parsed.limit, budgetChars: number(parsed.budget_chars, 4_000) }); return success('mem_project', { action, items: result.items }, { sources: result.items.map((item) => item.id), budget: { requested_chars: result.requestedChars, returned_chars: result.returnedChars }, warnings: result.truncated ? ['payload_truncated'] : [] }); }
      return failure(`Unsupported mem_project action: ${action}`);
    }),
    mem_session: guarded(async (input) => { const parsed = parseToolInput(memSessionInputSchema, input); const data = service.lifecycle({ operation: parsed.operation, harness: parsed.harness, project: { key: parsed.project_key, name: parsed.project_name }, rootSessionKey: parsed.root_session_key, eventKey: parsed.event_key, content: optionalString(parsed.content), ...(parsed.summary ? { summary: internalSummary(parsed.summary) } : {}) }); return success('mem_session', data, { sources: [data.projectId, data.sessionId, ...(data.evidenceId ? [data.evidenceId] : []), ...(data.summaryId ? [data.summaryId] : [])], lanes: { structured: 'ready' }, warnings: [] }); }),
  };
}

export function registerTools(server: McpServer, service: MemoryService): void {
  const handlers = createToolHandlers(service);
  const schemas: Record<MemoryToolName, Record<string, z.ZodType>> = {
    mem_save: memSaveBaseInputSchema.shape,
    mem_recall: { project_key: z.string(), query: z.string(), mode: z.enum(['compact', 'context']).optional(), temporal: z.enum(['current', 'history']).optional(), budget_chars: z.number().optional(), limit: z.number().optional(), correlation_id: z.string().optional(), finalize_answer: z.boolean().optional() },
    mem_context: memContextInputSchema.shape,
    mem_get: { id: z.string(), history: z.boolean().optional(), correlation_id: z.string().optional() },
    mem_project: memProjectInputSchema.shape,
    mem_session: memSessionInputSchema.shape,
  };
  for (const name of ALL_TOOLS) server.tool(name, `thoth-mem ${name}`, schemas[name], async (args) => handlers[name](args));
}
export function getToolCount(): number { return ALL_TOOLS.length; }
