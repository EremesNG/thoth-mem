import type { LifecycleResult } from '../../memory-core/contracts.js';
import { MEMORY_TOOL_CATALOG, type MemoryToolName } from '../../tools/index.js';
import { verifiedRecovery } from '../recovery.js';
import { createPiMcpClient, type PiMcpClient, type PiMcpClientOptions } from './mcp-client.js';
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

const RECOVERY_CUSTOM_TYPE = 'thoth-mem-recovery';

interface PiToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details?: Record<string, unknown>;
}

interface PiExtensionApi {
  registerTool(definition: {
    name: string;
    label: string;
    description: string;
    parameters: Record<string, unknown>;
    execute(toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<PiToolResult>;
  }): void;
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
    const report = (code: string, context?: PiExtensionContext): void => {
      try { options.onDiagnostic?.(code); } catch { /* diagnostics must not affect Pi */ }
      try { context?.ui?.notify(`thoth-mem degraded: ${code}`, 'warning'); } catch { /* UI is optional */ }
    };
    const client = options.client ?? createPiMcpClient({ ...options, onDiagnostic: (code) => report(code) });
    let state: PiLifecycleState | undefined;
    let recovery: string | undefined;

    const dispatch = async (input: ReturnType<typeof piSessionStartInput>, context?: PiExtensionContext): Promise<LifecycleResult | undefined> => {
      try { return lifecycleResult(await client.callTool('mem_session', lifecycleArguments(input))); }
      catch { report('pi_lifecycle_request_failed', context); return undefined; }
    };

    for (const tool of MEMORY_TOOL_CATALOG) {
      pi.registerTool({
        name: tool.name,
        label: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        async execute(_toolCallId, params, signal) {
          try {
            const result = await client.callTool(tool.name as MemoryToolName, params, signal);
            return { content: textContent(result), details: result.structuredContent as Record<string, unknown> | undefined };
          } catch (error) {
            report('pi_tool_request_failed');
            const message = error instanceof Error ? error.message : 'memory tool failed';
            // Pi derives tool-result error status from execute rejection.
            throw new Error(Array.from(message).slice(0, 500).join(''));
          }
        },
      });
    }

    pi.on('session_start', async (event, context) => {
      try {
        state = createPiLifecycleState(context);
        const reason = typeof event.reason === 'string' ? event.reason : 'startup';
        await dispatch(piSessionStartInput(state, reason), context);
        const recovered = await dispatch(piRecoveryInput(state, 'start'), context);
        recovery = verifiedRecovery(recovered, state.rootSessionKey, state.directory, 'pi');
      } catch { state = undefined; recovery = undefined; report('pi_session_start_failed', context); }
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
    pi.on('context', (event) => {
      if (!Array.isArray(event.messages)) return undefined;
      const messages = event.messages.filter((message) => !message || typeof message !== 'object' || Array.isArray(message) || (message as Record<string, unknown>).customType !== RECOVERY_CUSTOM_TYPE);
      if (recovery) messages.push({ role: 'custom', customType: RECOVERY_CUSTOM_TYPE, content: recovery, display: false, timestamp: Date.now() });
      return { messages };
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
        const result = await dispatch(piPostCompactInput(state, { compactionEntryId: typeof entry.id === 'string' ? entry.id : undefined, reason: typeof event.reason === 'string' ? event.reason : 'manual', isRetry: event.willRetry === true }), context);
        recovery = verifiedRecovery(result, state.rootSessionKey, state.directory, 'pi') ?? recovery;
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
      finally { await client.close().catch(() => report('pi_shutdown_close_failed', context)); state = undefined; recovery = undefined; }
    });
  };
}

export default createPiExtension();
