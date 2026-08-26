import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  EVIDENCE_KIND_VALUES,
  HARNESS_VALUES,
  LIFECYCLE_OPERATION_VALUES,
  MEMORY_KIND_VALUES,
  MEMORY_OUTCOME_VALUES,
  type SaveMemoryInput,
} from '../memory-core/contracts.js';
import type { MemoryService } from '../memory-core/service.js';

export const ALL_TOOLS = ['mem_save', 'mem_recall', 'mem_context', 'mem_get', 'mem_project', 'mem_session'] as const;
export type MemoryToolName = typeof ALL_TOOLS[number];
export interface V2ToolResult { [key: string]: unknown; content: Array<{ type: 'text'; text: string }>; structuredContent: Record<string, unknown>; isError?: boolean }
type ToolHandler = (input: Record<string, unknown>) => Promise<V2ToolResult>;
type ToolHandlers = Record<MemoryToolName, ToolHandler>;

const evidenceInputSchema = z.object({
  kind: z.enum(EVIDENCE_KIND_VALUES),
  content: z.string().min(1),
  source_ref: z.string().optional(),
}).strict();
const memoryInputSchema = z.object({
  kind: z.enum(MEMORY_KIND_VALUES),
  title: z.string().min(1),
  content: z.string().min(1),
  topic_key: z.string().optional(),
  outcome: z.enum(MEMORY_OUTCOME_VALUES).optional(),
  supersedes_id: z.string().optional(),
}).strict();
const memSaveInputSchema = z.object({
  project_key: z.string().min(1),
  project_name: z.string().min(1),
  root_session_key: z.string().optional(),
  harness: z.enum(HARNESS_VALUES).optional(),
  event_key: z.string().optional(),
  evidence: evidenceInputSchema,
  memory: memoryInputSchema.optional(),
}).strict();
const memSessionInputSchema = z.object({
  operation: z.enum(LIFECYCLE_OPERATION_VALUES),
  harness: z.enum(HARNESS_VALUES),
  project_key: z.string().min(1),
  project_name: z.string().min(1),
  root_session_key: z.string().min(1),
  event_key: z.string().min(1),
  content: z.string().optional(),
}).strict();

function string(value: unknown, label: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`); return value; }
function optionalString(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value : undefined; }
function number(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function parseToolInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = issue?.path.join('.') || 'request';
  throw new Error(`${field}: ${issue?.message ?? 'invalid value'}`);
}
function success(tool: MemoryToolName, data: unknown, extras: Record<string, unknown> = {}): V2ToolResult { const structuredContent = { schema: `thoth-mem.mcp.v2.${tool}`, data, ...extras }; const text = JSON.stringify(structuredContent); return { content: [{ type: 'text', text: text.length > 20_000 ? `${text.slice(0, 19_900)}…` : text }], structuredContent }; }
function failure(message: string, code = 'invalid_request'): V2ToolResult { const structuredContent = { schema: 'thoth-mem.mcp.v2.error', error: { code, message: message.slice(0, 500), retryable: false } }; return { isError: true, content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent }; }
function guarded(handler: ToolHandler): ToolHandler { return async (input) => { try { return await handler(input); } catch (error) { return failure(error instanceof Error ? error.message : String(error)); } }; }

export function createToolHandlers(service: MemoryService): ToolHandlers {
  return {
    mem_save: guarded(async (input) => {
      const parsed = parseToolInput(memSaveInputSchema, input);
      const rootSessionKey = optionalString(parsed.root_session_key); const harness = parsed.harness;
      if ((rootSessionKey && !harness) || (!rootSessionKey && harness)) throw new Error('root_session_key and harness must be supplied together');
      const saveInput: SaveMemoryInput = { project: { key: parsed.project_key, name: parsed.project_name }, ...(rootSessionKey && harness ? { session: { rootSessionKey, harness } } : {}), evidence: { kind: parsed.evidence.kind, content: parsed.evidence.content, sourceRef: optionalString(parsed.evidence.source_ref) }, ...(parsed.memory ? { memory: { kind: parsed.memory.kind, title: parsed.memory.title, content: parsed.memory.content, topicKey: optionalString(parsed.memory.topic_key), outcome: parsed.memory.outcome, supersedesId: optionalString(parsed.memory.supersedes_id) } } : {}), eventKey: optionalString(parsed.event_key) };
      const data = service.save(saveInput); return success('mem_save', data, { sources: [data.evidence.id, ...(data.memory ? [data.memory.id] : [])], lanes: { lexical: 'ready' }, warnings: [] });
    }),
    mem_recall: guarded(async (input) => {
      const mode = input.mode === 'context' ? 'context' : 'compact'; const result = service.recall({ projectKey: string(input.project_key, 'project_key'), query: string(input.query, 'query'), mode, history: input.temporal === 'history', budgetChars: number(input.budget_chars, mode === 'context' ? 4000 : 1200), limit: number(input.limit, 5), correlationId: optionalString(input.correlation_id) });
      return success('mem_recall', { mode, items: result.items }, { sources: result.items.flatMap((item) => [item.id, ...item.evidenceIds]), budget: { requested_chars: result.budget.requestedChars, returned_chars: result.budget.returnedChars, truncated_chars: result.budget.truncatedChars, source_chars: result.budget.sourceChars, evidence_chars: result.budget.evidenceChars, full_chars: result.budget.fullChars, compression_ratio: result.budget.compressionRatio, token_basis: result.budget.tokenBasis }, lanes: result.lanes, warnings: result.warnings, correlation_id: result.correlationId, telemetry: service.retrievalTelemetry(result.correlationId, mode, input.finalize_answer === true) });
    }),
    mem_context: guarded(async (input) => { const result = service.context({ projectKey: string(input.project_key, 'project_key'), budgetChars: number(input.budget_chars, 4000), correlationId: optionalString(input.correlation_id) }); return success('mem_context', { items: result.items }, { sources: [...new Set(result.items.flatMap((item) => [item.id, ...item.evidenceIds]))], budget: { requested_chars: result.budget.requestedChars, returned_chars: result.budget.returnedChars, truncated_chars: result.budget.truncatedChars, source_chars: result.budget.sourceChars, evidence_chars: result.budget.evidenceChars, full_chars: result.budget.fullChars, compression_ratio: result.budget.compressionRatio, token_basis: result.budget.tokenBasis }, lanes: result.lanes, warnings: result.warnings, correlation_id: result.correlationId, telemetry: service.retrievalTelemetry(result.correlationId, 'context', input.finalize_answer === true) }); }),
    mem_get: guarded(async (input) => { const result = service.get({ id: string(input.id, 'id'), history: input.history === true }); const correlationId = optionalString(input.correlation_id); const evidenceIds = 'evidenceIds' in result.record ? result.record.evidenceIds : []; return success('mem_get', result, { sources: [...new Set([result.record.id, ...evidenceIds, ...result.lineage.flatMap((item) => [item.id, ...item.evidenceIds])])], lanes: { structured: 'ready' }, warnings: [], ...(correlationId ? { correlation_id: correlationId } : {}), telemetry: correlationId ? service.retrievalTelemetry(correlationId, 'full_fetch') : { stage: 'full_fetch', finalized: true, escalated: true, avoided: false, full_fetches: 1, avoided_full_fetches: 0 } }); }),
    mem_project: guarded(async (input) => {
      const action = string(input.action, 'action'); if (action === 'list') return success('mem_project', { projects: service.listProjects() });
      if (action === 'briefing') { const result = service.context({ projectKey: string(input.project_key, 'project_key'), budgetChars: number(input.budget_chars, 5000) }); return success('mem_project', { action, items: result.items }, { sources: result.items.map((item) => item.id), budget: { requested_chars: result.budget.requestedChars, returned_chars: result.budget.returnedChars, compression_ratio: result.budget.compressionRatio } }); }
      if (action === 'history') { const result = service.get({ id: string(input.id, 'id'), history: true }); return success('mem_project', { action, lineage: result.lineage }, { sources: result.lineage.map((item) => item.id) }); }
      return failure(`Unsupported mem_project action: ${action}`);
    }),
    mem_session: guarded(async (input) => { const parsed = parseToolInput(memSessionInputSchema, input); const data = service.lifecycle({ operation: parsed.operation, harness: parsed.harness, project: { key: parsed.project_key, name: parsed.project_name }, rootSessionKey: parsed.root_session_key, eventKey: parsed.event_key, content: optionalString(parsed.content) }); return success('mem_session', data, { sources: [data.projectId, data.sessionId, ...(data.evidenceId ? [data.evidenceId] : [])], lanes: { structured: 'ready' }, warnings: [] }); }),
  };
}

export function registerTools(server: McpServer, service: MemoryService): void {
  const handlers = createToolHandlers(service);
  const schemas: Record<MemoryToolName, Record<string, z.ZodType>> = {
    mem_save: memSaveInputSchema.shape,
    mem_recall: { project_key: z.string(), query: z.string(), mode: z.enum(['compact', 'context']).optional(), temporal: z.enum(['current', 'history']).optional(), budget_chars: z.number().optional(), limit: z.number().optional(), correlation_id: z.string().optional(), finalize_answer: z.boolean().optional() },
    mem_context: { project_key: z.string(), budget_chars: z.number().optional(), correlation_id: z.string().optional(), finalize_answer: z.boolean().optional() },
    mem_get: { id: z.string(), history: z.boolean().optional(), correlation_id: z.string().optional() },
    mem_project: { action: z.enum(['list', 'briefing', 'history']), project_key: z.string().optional(), id: z.string().optional(), budget_chars: z.number().optional() },
    mem_session: memSessionInputSchema.shape,
  };
  for (const name of ALL_TOOLS) server.tool(name, `thoth-mem v2 ${name}`, schemas[name], async (args) => handlers[name](args));
}
export function getToolCount(): number { return ALL_TOOLS.length; }
