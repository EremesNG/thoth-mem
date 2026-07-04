import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { registerMemSession } from '../../src/tools/mem-session.js';

describe('mem_session tool', () => {
  let store: Store;
  let toolHandler: ((input: any) => Promise<any>) | undefined;

  beforeEach(() => {
    store = new Store(':memory:');
    toolHandler = undefined;
    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_session') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;
    registerMemSession(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('starts and summarizes a session', async () => {
    const started = await toolHandler?.({ action: 'start', id: 'session-1', project: 'session-project' });
    const summary = await toolHandler?.({
      action: 'summary',
      id: 'session-1',
      project: 'session-project',
      content: '## Goal\nFinish compact MCP tools\n\n## Accomplished\n- Done',
    });

    expect(started?.isError).not.toBe(true);
    expect(started?.content[0].text).toContain('Session started: session-1');
    expect(started?.content[0].text).not.toContain('Identity fallback:');
    expect(summary?.isError).not.toBe(true);
    expect(summary?.content[0].text).toContain('Session summary saved');
    expect(summary?.content[0].text).not.toContain('Identity fallback:');
  });

  it('reports fallback identity when summary omits id', async () => {
    const summary = await toolHandler?.({
      action: 'summary',
      project: 'session-project',
      content: '## Goal\nFallback summary\n\n## Accomplished\n- Done',
    });

    expect(summary?.isError).not.toBe(true);
    expect(summary?.content[0].text).toContain('Session summary saved');
    expect(summary?.content[0].text).toContain('Identity fallback: session_id missing -> manual-save-session-project');
  });
});
