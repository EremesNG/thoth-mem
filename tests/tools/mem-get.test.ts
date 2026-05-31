import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { registerMemGet } from '../../src/tools/mem-get.js';

describe('mem_get tool', () => {
  let store: Store;
  let toolHandler: ((input: any) => Promise<any>) | undefined;

  beforeEach(() => {
    store = new Store(':memory:');
    toolHandler = undefined;
    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_get') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;
    registerMemGet(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('retrieves full memory content by id', async () => {
    const saved = store.saveObservation({ title: 'Full memory', content: 'complete body', project: 'get-project' }).observation;

    const result = await toolHandler?.({ id: saved.id });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('Full memory');
    expect(result?.content[0].text).toContain('complete body');
  });

  it('can include surrounding timeline', async () => {
    store.startSession('get-session', 'get-project');
    store.saveObservation({ title: 'Before', content: 'before body', session_id: 'get-session', project: 'get-project' });
    const focus = store.saveObservation({ title: 'Focus', content: 'focus body', session_id: 'get-session', project: 'get-project' }).observation;
    store.saveObservation({ title: 'After', content: 'after body', session_id: 'get-session', project: 'get-project' });

    const result = await toolHandler?.({ id: focus.id, include_timeline: true });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('## Timeline around observation');
    expect(result?.content[0].text).toContain('Before');
    expect(result?.content[0].text).toContain('After');
  });
});
