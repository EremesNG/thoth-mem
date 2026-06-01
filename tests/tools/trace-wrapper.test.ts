import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { registerTools } from '../../src/tools/index.js';

type ToolResponse = {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
};

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResponse> | ToolResponse;

function registerWithMockServer(store: Store): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    tool: vi.fn((
      name: string,
      _description: string,
      _schema: unknown,
      handler: ToolHandler,
    ) => {
      handlers.set(name, handler);
    }),
  } as unknown as McpServer;

  registerTools(server, store);
  return handlers;
}

describe('MCP trace wrapper', () => {
  it('traces successful tool calls with sanitized request and response payloads', async () => {
    const store = new Store(':memory:');

    try {
      const handlers = registerWithMockServer(store);
      const handler = handlers.get('mem_save');
      expect(handler).toBeDefined();

      const result = await handler?.({
        title: 'Trace wrapper target',
        content: '<private>hidden token</private> Public traced content',
        project: 'trace-project',
        session_id: 'trace-session',
      });

      expect(result?.isError).not.toBe(true);
      const traces = store.listOperationTraces({ origin: 'mcp', target: 'mem_save', limit: 10 });
      expect(traces.total).toBe(1);
      expect(traces.traces[0]).toMatchObject({
        origin: 'mcp',
        target: 'mem_save',
        status: 'ok',
        project: 'trace-project',
        session_id: 'trace-session',
      });
      expect(traces.traces[0].request_json).toContain('Public traced content');
      expect(traces.traces[0].request_json).not.toContain('hidden token');
      expect(traces.traces[0].response_json).toContain('Observation saved');
    } finally {
      store.close();
    }
  });

  it('traces handled tool errors without hiding the tool response', async () => {
    const store = new Store(':memory:');

    try {
      const handlers = registerWithMockServer(store);
      const result = await handlers.get('mem_save')?.({
        kind: 'observation',
        content: 'Missing title should be a handled MCP error',
        project: 'trace-project',
      });

      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('title is required');

      const traces = store.listOperationTraces({ origin: 'mcp', target: 'mem_save', status: 'error' });
      expect(traces.total).toBe(1);
      expect(traces.traces[0].response_json).toContain('title is required');
    } finally {
      store.close();
    }
  });
});
