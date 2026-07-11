import {
  MEMORY_TOOL_NAMES,
  type AdapterCapabilities,
  type CapabilityState,
} from './types.js';

export interface ProtocolIdentity {
  sessionId: string;
  project: string;
  cwd?: string;
}

export interface MemoryProtocol {
  systemInstructions(): string;
  recallNudge(identity: ProtocolIdentity): string;
  compactionInstruction(identity: ProtocolIdentity): string;
}

export { MEMORY_TOOL_NAMES as MEMORY_PROTOCOL_TOOL_NAMES };

export const MEMORY_PROTOCOL_SECTIONS = {
  purpose: 'thoth-mem — Persistent memory for coding agents.',
  toolSurface: [
    'Use exactly these six MCP tools:',
    ...MEMORY_TOOL_NAMES.map((tool) => `- ${tool}`),
  ].join('\n'),
  recall: [
    'Recall in three bounded steps:',
    '1. mem_recall(query, mode="compact") to scan evidence.',
    '2. mem_recall(query, mode="context") to expand the strongest hits.',
    '3. mem_get(id) only for selected full records.',
    'Use mem_context for bounded recent continuity and mem_project for project navigation.',
  ].join('\n'),
  ownership: [
    'The root/orchestrator owns session lifecycle, prompt capture, and continuity summaries.',
    'Subagents must not start, checkpoint, or summarize the root session and must not save prompts.',
    'Save only real root-user intent. Generated prompts must not be saved as user intent.',
    'Exclude assistant, tool, subagent, handoff, and scaffolding traffic. Remove content inside <private> tags before persistence.',
    'Use stable session_id and project identity. If either is unavailable, expose the limitation instead of inventing continuity.',
  ].join('\n'),
  lifecycle: [
    'Capability states are supported, degraded, and unsupported.',
    'Advance lifecycle state only after confirmed MCP success; failed or indeterminate calls remain retryable.',
    'Compaction is explicit and retry-safe: checkpoint only on a verified root compaction event and retry after failure.',
    'Finalization is explicit and retry-safe: summarize only on a verified root terminal event and never infer completion.',
    'A duplicate event is suppressed by stable event identity. Distinct intentional events remain separate effects, while byte-identical same-session prompts inside the existing 30-second window may resolve to one canonical prompt row.',
    'Manual recovery stays visible for every degraded or unsupported capability; unrelated supported operations remain available.',
  ].join('\n'),
  save: [
    'Save decisions, architecture, bug fixes, patterns, configuration changes, discoveries, and non-obvious learnings with mem_save.',
    'Use concise What, Why, Where, and Learned fields, and use a stable topic key for evolving facts.',
    'The root may use mem_session to start, checkpoint, or summarize a stable session.',
  ].join('\n'),
} as const;

export function renderMemoryProtocolInstructions(): string {
  return [
    MEMORY_PROTOCOL_SECTIONS.purpose,
    MEMORY_PROTOCOL_SECTIONS.toolSurface,
    MEMORY_PROTOCOL_SECTIONS.recall,
    MEMORY_PROTOCOL_SECTIONS.ownership,
    MEMORY_PROTOCOL_SECTIONS.lifecycle,
    MEMORY_PROTOCOL_SECTIONS.save,
  ].join('\n\n');
}

export const SERVER_MEMORY_PROTOCOL_INSTRUCTIONS = renderMemoryProtocolInstructions();

function capabilityNote(state: CapabilityState): string {
  switch (state) {
    case 'supported':
      return 'supported; perform it only with stable identity and confirmed MCP success';
    case 'degraded':
      return 'degraded; keep the limitation and manual recovery visible';
    case 'unsupported':
      return 'unsupported; do not simulate the lifecycle event';
  }
}

function identityNote(identity: ProtocolIdentity): string {
  return `session_id=${identity.sessionId}, project=${identity.project}`;
}

export function createMemoryProtocol(capabilities: AdapterCapabilities): MemoryProtocol {
  return {
    systemInstructions(): string {
      return SERVER_MEMORY_PROTOCOL_INSTRUCTIONS;
    },
    recallNudge(identity: ProtocolIdentity): string {
      return [
        `For ${identityNote(identity)}, recall with mem_recall(mode="compact"),`,
        'then mem_recall(mode="context"), then mem_get only for selected records.',
        `Recall guidance is ${capabilityNote(capabilities.recall_guidance.state)}.`,
      ].join(' ');
    },
    compactionInstruction(identity: ProtocolIdentity): string {
      return [
        `For ${identityNote(identity)}, compaction is ${capabilityNote(capabilities.compact_session.state)}.`,
        'Advance checkpoint state only after confirmed MCP success; otherwise leave it retry-safe.',
      ].join(' ');
    },
  };
}
