import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { registerMemProject } from '../../src/tools/mem-project.js';

describe('mem_project tool', () => {
  let store: Store;
  let toolHandler: ((input: any) => Promise<any>) | undefined;

  beforeEach(() => {
    store = new Store(':memory:');
    toolHandler = undefined;
    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_project') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;
    registerMemProject(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('lists projects', async () => {
    store.saveObservation({ title: 'Project item', content: 'body', project: 'project-a' });

    const result = await toolHandler?.({ action: 'list' });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('project-a');
  });

  it('returns summary, graph, and topic-key views', async () => {
    store.saveObservation({
      title: 'Topic item',
      content: '**What**: Durable topic\n**Why**: Testing project tool',
      project: 'project-a',
      topic_key: 'architecture/topic-a',
    });

    const summary = await toolHandler?.({ action: 'summary', project: 'project-a' });
    const graph = await toolHandler?.({ action: 'graph', project: 'project-a' });
    const topics = await toolHandler?.({ action: 'topics', project: 'project-a' });
    const topic = await toolHandler?.({ action: 'topic', project: 'project-a', topic_key: 'architecture/topic-a' });

    expect(summary?.content[0].text).toContain('## Project Summary: project-a');
    expect(graph?.content[0].text).toContain('## Knowledge Graph Ledger: project-a');
    expect(topics?.content[0].text).toContain('architecture/topic-a');
    expect(topic?.content[0].text).toContain('## Topic Key: architecture/topic-a');
  });
});
