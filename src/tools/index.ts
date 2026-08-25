import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { EvidenceKind, Harness, MemoryKind, MemoryOutcome, SaveMemoryInput } from '../memory-core/contracts.js';
import type { MemoryService } from '../memory-core/service.js';

export const ALL_TOOLS = ['mem_save', 'mem_recall', 'mem_context', 'mem_get', 'mem_project', 'mem_session'] as const;
export type MemoryToolName = typeof ALL_TOOLS[number];
export interface V2ToolResult { [key: string]: unknown; content: Array<{ type: 'text'; text: string }>; structuredContent: Record<string, unknown>; isError?: boolean }
type ToolHandler = (input: Record<string, unknown>) => Promise<V2ToolResult>;
type ToolHandlers = Record<MemoryToolName, ToolHandler>;

function object(value: unknown, label: string): Record<string, unknown> { if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as Record<string, unknown>; }
function string(value: unknown, label: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`); return value; }
function optionalString(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value : undefined; }
function number(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function success(tool: MemoryToolName, data: unknown, extras: Record<string, unknown> = {}): V2ToolResult { const structuredContent = { schema: `thoth-mem.mcp.v2.${tool}`, data, ...extras }; const text = JSON.stringify(structuredContent); return { content: [{ type: 'text', text: text.length > 20_000 ? `${text.slice(0, 19_900)}…` : text }], structuredContent }; }
function failure(message: string, code = 'invalid_request'): V2ToolResult { const structuredContent = { schema: 'thoth-mem.mcp.v2.error', error: { code, message: message.slice(0, 500), retryable: false } }; return { isError: true, content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent }; }
function guarded(handler: ToolHandler): ToolHandler { return async (input) => { try { return await handler(input); } catch (error) { return failure(error instanceof Error ? error.message : String(error)); } }; }

export function createToolHandlers(service: MemoryService): ToolHandlers {
  return {
    mem_save: guarded(async (input) => {
      const evidence = object(input.evidence, 'evidence'); const memoryValue = input.memory === undefined ? undefined : object(input.memory, 'memory');
      const rootSessionKey = optionalString(input.root_session_key); const harness = optionalString(input.harness) as Harness | undefined;
      if ((rootSessionKey && !harness) || (!rootSessionKey && harness)) throw new Error('root_session_key and harness must be supplied together');
      const saveInput: SaveMemoryInput = { project: { key: string(input.project_key, 'project_key'), name: string(input.project_name, 'project_name') }, ...(rootSessionKey && harness ? { session: { rootSessionKey, harness } } : {}), evidence: { kind: string(evidence.kind, 'evidence.kind') as EvidenceKind, content: string(evidence.content, 'evidence.content'), sourceRef: optionalString(evidence.source_ref) }, ...(memoryValue ? { memory: { kind: string(memoryValue.kind, 'memory.kind') as MemoryKind, title: string(memoryValue.title, 'memory.title'), content: string(memoryValue.content, 'memory.content'), topicKey: optionalString(memoryValue.topic_key), outcome: optionalString(memoryValue.outcome) as MemoryOutcome | undefined, supersedesId: optionalString(memoryValue.supersedes_id) } } : {}), eventKey: optionalString(input.event_key) };
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
    mem_session: guarded(async (input) => { const data = service.lifecycle({ operation: string(input.operation, 'operation') as Parameters<MemoryService['lifecycle']>[0]['operation'], harness: string(input.harness, 'harness') as Harness, project: { key: string(input.project_key, 'project_key'), name: string(input.project_name, 'project_name') }, rootSessionKey: string(input.root_session_key, 'root_session_key'), eventKey: string(input.event_key, 'event_key'), content: optionalString(input.content) }); return success('mem_session', data, { sources: [data.projectId, data.sessionId, ...(data.evidenceId ? [data.evidenceId] : [])], lanes: { structured: 'ready' }, warnings: [] }); }),
  };
}

export function registerTools(server: McpServer, service: MemoryService): void {
  const handlers = createToolHandlers(service);
  const schemas: Record<MemoryToolName, Record<string, z.ZodType>> = {
    mem_save: { project_key: z.string(), project_name: z.string(), root_session_key: z.string().optional(), harness: z.enum(['opencode', 'codex', 'claude', 'mcp', 'cli', 'import']).optional(), event_key: z.string().optional(), evidence: z.record(z.string(), z.unknown()), memory: z.record(z.string(), z.unknown()).optional() },
    mem_recall: { project_key: z.string(), query: z.string(), mode: z.enum(['compact', 'context']).optional(), temporal: z.enum(['current', 'history']).optional(), budget_chars: z.number().optional(), limit: z.number().optional(), correlation_id: z.string().optional(), finalize_answer: z.boolean().optional() },
    mem_context: { project_key: z.string(), budget_chars: z.number().optional(), correlation_id: z.string().optional(), finalize_answer: z.boolean().optional() },
    mem_get: { id: z.string(), history: z.boolean().optional(), correlation_id: z.string().optional() },
    mem_project: { action: z.enum(['list', 'briefing', 'history']), project_key: z.string().optional(), id: z.string().optional(), budget_chars: z.number().optional() },
    mem_session: { operation: z.enum(['enroll', 'recover', 'capture_root', 'checkpoint_pre_compact', 'guide_post_compact', 'finalize']), harness: z.enum(['opencode', 'codex', 'claude', 'mcp', 'cli', 'import']), project_key: z.string(), project_name: z.string(), root_session_key: z.string(), event_key: z.string(), content: z.string().optional() },
  };
  for (const name of ALL_TOOLS) server.tool(name, `thoth-mem v2 ${name}`, schemas[name], async (args) => handlers[name](args));
}
export function getToolCount(): number { return ALL_TOOLS.length; }
