import type { LifecycleInput, LifecycleResult } from '../../memory-core/contracts.js';
import { MEMORY_RECALL_INSTRUCTION_SENTENCES, MEMORY_SAVE_INSTRUCTION_SENTENCES, MEMORY_TOOL_CATALOG, type MemoryToolName } from '../../tools/index.js';
import { verifiedRecovery } from '../recovery.js';
import { createPiMcpClient, PiMcpStartupTimeoutError, type PiMcpClient, type PiMcpClientOptions } from './mcp-client.js';
import { createToolRenderers } from './render.js';
import {
  createPiLifecycleState,
  piInputCapture,
  piPostCompactInput,
  piPreCompactInput,
  piRecoveryInput,
  piSessionStartInput,
  piShutdownInput,
  type PiLifecycleContext,
  type PiLifecycleState,
} from './lifecycle.js';

// One named system-prompt section, replaced or removed at each root prompt. Pi diffs
// sections into the transcript, so an unchanged block costs no extra context.
const RECOVERY_SECTION = 'thoth_mem_recovery';

interface PiToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details?: Record<string, unknown>;
}

interface PiExtensionApi {
  registerTool(definition: {
    name: string;
    label: string;
    description: string;
    promptGuidelines?: string[];
    promptSnippet?: string;
    parameters: Record<string, unknown>;
    execute(toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal, onUpdate?: unknown, context?: PiExtensionContext): Promise<PiToolResult>;
  } & Partial<ReturnType<typeof createToolRenderers>>): void;
  on(event: string, handler: (event: Record<string, unknown>, context: PiExtensionContext) => Promise<unknown> | unknown): void;
}

interface PiExtensionContext extends PiLifecycleContext {
  ui?: { notify(message: string, level?: 'warning' | 'error' | 'info'): void };
}

export interface PiExtensionOptions extends PiMcpClientOptions {
  client?: PiMcpClient;
  onDiagnostic?: (code: string) => void;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function textContent(value: Record<string, unknown>): Array<{ type: 'text'; text: string }> {
  if (!Array.isArray(value.content)) return [{ type: 'text', text: JSON.stringify(value.structuredContent ?? {}) }];
  return value.content.flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    return record.type === 'text' && typeof record.text === 'string' ? [{ type: 'text' as const, text: record.text.slice(0, 20_000) }] : [];
  });
}

function lifecycleResult(value: Record<string, unknown>): LifecycleResult | undefined {
  const structured = asRecord(value.structuredContent);
  return asRecord(structured?.data) as unknown as LifecycleResult | undefined;
}

function lifecycleArguments(input: ReturnType<typeof piSessionStartInput>): Record<string, unknown> {
  return {
    operation: input.operation,
    harness: 'pi',
    project_key: input.project.key,
    project_name: input.project.name,
    root_session_key: input.rootSessionKey,
    event_key: input.eventKey,
    ...(input.content ? { content: input.content } : {}),
  };
}

export function createPiExtension(options: PiExtensionOptions = {}): (pi: PiExtensionApi) => void {
  return (pi) => {
    let startupTimeoutWarned = false;
    const report = (code: string, context?: PiExtensionContext): void => {
      try { options.onDiagnostic?.(code); } catch { /* diagnostics must not affect Pi */ }
      const startupTimeout = code === 'pi_mcp_startup_timeout';
      if (startupTimeout) {
        if (!context?.ui || startupTimeoutWarned) return;
        startupTimeoutWarned = true;
      }
      const message = `thoth-mem degraded: ${code}${startupTimeout ? ' — the memory server did not start in time; if memory stays unavailable, run `thoth-mem migrate`' : ''}`;
      try { context?.ui?.notify(message, 'warning'); } catch { /* UI is optional */ }
    };
    const client = options.client ?? createPiMcpClient({ ...options, onDiagnostic: (code) => report(code) });
    let state: PiLifecycleState | undefined;
    let recovery: string | undefined;
    // Replaying the same recovery event key re-renders current memory without a new receipt.
    let refresh: LifecycleInput | undefined;

    const dispatch = async (input: ReturnType<typeof piSessionStartInput>, context?: PiExtensionContext): Promise<LifecycleResult | undefined> => {
      try { return lifecycleResult(await client.callTool('mem_session', lifecycleArguments(input))); }
      catch (error) { report(error instanceof PiMcpStartupTimeoutError ? 'pi_mcp_startup_timeout' : 'pi_lifecycle_request_failed', context); return undefined; }
    };

    for (const tool of MEMORY_TOOL_CATALOG) {
      if (tool.name === 'mem_session') continue;
      pi.registerTool({
        name: tool.name,
        label: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        ...(tool.name === 'mem_recall' ? {
          promptGuidelines: [...MEMORY_RECALL_INSTRUCTION_SENTENCES],
          promptSnippet: 'Recall project memory before non-trivial repository work.',
        } : {}),
        ...(tool.name === 'mem_save' ? {
          promptGuidelines: [...MEMORY_SAVE_INSTRUCTION_SENTENCES],
          promptSnippet: 'Save verified project knowledge and continuation handoffs.',
        } : {}),
        ...createToolRenderers(tool.name),
        async execute(_toolCallId, params, signal, _onUpdate, context) {
          try {
            const result = await client.callTool(tool.name as MemoryToolName, params, signal);
            return { content: textContent(result), details: result.structuredContent as Record<string, unknown> | undefined };
          } catch (error) {
            if (error instanceof PiMcpStartupTimeoutError) report('pi_mcp_startup_timeout', context);
            else report('pi_tool_request_failed');
            const message = error instanceof Error ? error.message : 'memory tool failed';
            // Pi derives tool-result error status from execute rejection.
            throw new Error(Array.from(message).slice(0, 500).join(''));
          }
        },
      });
    }

    pi.on('session_start', async (event, context) => {
      try {
        const nextState = createPiLifecycleState(context);
        if (nextState.rootSessionKey !== state?.rootSessionKey) startupTimeoutWarned = false;
        state = nextState;
        const reason = typeof event.reason === 'string' ? event.reason : 'startup';
        await dispatch(piSessionStartInput(state, reason), context);
        refresh = piRecoveryInput(state, 'start');
        const recovered = await dispatch(refresh, context);
        recovery = verifiedRecovery(recovered, state.rootSessionKey, state.directory, 'pi');
      } catch { state = undefined; recovery = undefined; refresh = undefined; report('pi_session_start_failed', context); }
    });
    pi.on('input', async (event, context) => {
      if (!state) return { action: 'continue' };
      try {
        const mapped = piInputCapture(state, context, {
          text: typeof event.text === 'string' ? event.text : '',
          source: typeof event.source === 'string' ? event.source : '',
          ...(typeof event.streamingBehavior === 'string' ? { streamingBehavior: event.streamingBehavior } : {}),
        });
        if (mapped) await dispatch(mapped, context);
      } catch { report('pi_input_capture_failed', context); }
      return { action: 'continue' };
    });
    pi.on('before_agent_start', async (event, context) => {
      const sections = asRecord(asRecord(event.systemPromptOptions)?.sections);
      if (!sections) return undefined;
      if (state && refresh) {
        try {
          const recovered = await dispatch(refresh, context);
          if (recovered) recovery = verifiedRecovery(recovered, state.rootSessionKey, state.directory, 'pi');
        } catch { report('pi_recovery_refresh_failed', context); }
      }
      if (recovery) sections[RECOVERY_SECTION] = recovery;
      else delete sections[RECOVERY_SECTION];
      return undefined;
    });
    pi.on('session_before_compact', async (event, context) => {
      if (!state) return;
      try {
        const preparation = asRecord(event.preparation) ?? {};
        await dispatch(piPreCompactInput(state, { firstKeptEntryId: typeof preparation.firstKeptEntryId === 'string' ? preparation.firstKeptEntryId : undefined, reason: typeof event.reason === 'string' ? event.reason : 'manual', isRetry: event.willRetry === true }), context);
      } catch { report('pi_pre_compact_failed', context); }
    });
    pi.on('session_compact', async (event, context) => {
      if (!state) return;
      try {
        const entry = asRecord(event.compactionEntry) ?? {};
        const guidance = piPostCompactInput(state, { compactionEntryId: typeof entry.id === 'string' ? entry.id : undefined, summary: typeof entry.summary === 'string' ? entry.summary : undefined, reason: typeof event.reason === 'string' ? event.reason : 'manual', isRetry: event.willRetry === true });
        const result = await dispatch(guidance, context);
        recovery = verifiedRecovery(result, state.rootSessionKey, state.directory, 'pi') ?? recovery;
        // Refresh project recovery without replaying harvested content under its receipt key.
        refresh = piRecoveryInput(state, 'context');
      } catch { report('pi_post_compact_failed', context); }
    });
    pi.on('session_compact_failed', (_event, context) => { report('pi_compact_failed', context); });
    pi.on('agent_settled', () => undefined);
    pi.on('session_shutdown', async (event, context) => {
      try {
        if (state) {
          const mapped = piShutdownInput(state, { reason: typeof event.reason === 'string' ? event.reason : 'quit', sessionFile: typeof event.targetSessionFile === 'string' ? event.targetSessionFile : undefined });
          if (mapped) await dispatch(mapped, context);
        }
      } catch { report('pi_shutdown_finalize_failed', context); }
      finally { await client.close().catch(() => report('pi_shutdown_close_failed', context)); state = undefined; recovery = undefined; refresh = undefined; }
    });
  };
}

export default createPiExtension();
