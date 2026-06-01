import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ShapeOutput, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Store } from '../store/index.js';

type ToolSchema = ZodRawShapeCompat;
type ToolHandler<Args extends ToolSchema> = (args: ShapeOutput<Args>) => CallToolResult | Promise<CallToolResult>;
type RegisterTool = <Args extends ToolSchema>(
  name: string,
  description: string,
  schema: Args,
  handler: (args: ShapeOutput<Args>) => CallToolResult | Promise<CallToolResult>,
) => void;

function traceMetadata(args: unknown): { project: string | null; session_id: string | null } {
  if (Object.prototype.toString.call(args) !== '[object Object]') {
    return { project: null, session_id: null };
  }

  const record = args as Record<string, unknown>;
  return {
    project: typeof record.project === 'string' ? record.project : null,
    session_id: typeof record.session_id === 'string' ? record.session_id : null,
  };
}

function safeRecordTrace(
  store: Store,
  input: Parameters<Store['saveOperationTrace']>[0],
): void {
  try {
    store.saveOperationTrace(input);
  } catch (error) {
    process.stderr.write(
      `[tools] Failed to record operation trace (${input.origin} ${input.target}): ${error instanceof Error ? error.message : String(error)}\n`
    );
  }
}

export function registerTracedTool<Args extends ToolSchema>(
  server: McpServer,
  store: Store,
  name: string,
  description: string,
  schema: Args,
  handler: ToolHandler<Args>,
): void {
  const registerTool = server.tool.bind(server) as RegisterTool;
  registerTool(name, description, schema, async (args) => {
    const traceId = randomUUID();
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const metadata = traceMetadata(args);

    try {
      const result = await handler(args as ShapeOutput<Args>);
      const finishedAtMs = Date.now();
      safeRecordTrace(store, {
        trace_id: traceId,
        origin: 'mcp',
        target: name,
        status: result.isError === true ? 'error' : 'ok',
        project: metadata.project,
        session_id: metadata.session_id,
        started_at: startedAt,
        finished_at: new Date(finishedAtMs).toISOString(),
        duration_ms: finishedAtMs - startedAtMs,
        request: args,
        response: result,
      });
      return result;
    } catch (error) {
      const finishedAtMs = Date.now();
      safeRecordTrace(store, {
        trace_id: traceId,
        origin: 'mcp',
        target: name,
        status: 'error',
        project: metadata.project,
        session_id: metadata.session_id,
        started_at: startedAt,
        finished_at: new Date(finishedAtMs).toISOString(),
        duration_ms: finishedAtMs - startedAtMs,
        request: args,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
}
