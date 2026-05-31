import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { registerMemRecall } from '../../src/tools/mem-recall.js';

describe('mem_recall tool', () => {
  let store: Store;
  let toolHandler: ((input: any) => Promise<any>) | undefined;

  beforeEach(() => {
    store = new Store(':memory:');
    toolHandler = undefined;
    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_recall') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;
    registerMemRecall(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('returns fused compact recall metadata', async () => {
    store.saveObservation({ title: 'Recall target', content: 'hybrid compact marker', project: 'recall-project' });

    const result = await toolHandler?.({ query: 'hybrid compact marker', project: 'recall-project', limit: 3 });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('Recall query: hybrid compact marker');
    expect(result?.content[0].text).toContain('pending:');
    expect(result?.content[0].text).toContain('degraded_fallback:');
    expect(result?.content[0].text).toContain('evidence_lanes:');
  });

  it('can expand recall into context text', async () => {
    store.saveObservation({ title: 'Context target', content: 'expanded recall body marker', project: 'recall-project' });

    const result = await toolHandler?.({ query: 'expanded recall body marker', project: 'recall-project', mode: 'context' });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('expanded recall body marker');
  });
});
