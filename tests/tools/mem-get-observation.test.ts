import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { registerMemGetObservation } from '../../src/tools/mem-get-observation.js';

describe('mem_get_observation tool (via Store)', () => {
  let store: Store;
  let toolHandler: ((input: any) => Promise<any>) | undefined;

  beforeEach(() => {
    store = new Store(':memory:');
    toolHandler = undefined;

    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_get_observation') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;

    registerMemGetObservation(server, store);
  });

  afterEach(() => { store.close(); });

  it('returns full observation for small content', () => {
    const { observation } = store.saveObservation({ title: 'Test', content: 'Short content' });
    const result = store.getObservation(observation.id);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Short content');
    expect(result!.title).toBe('Test');
  });

  it('returns null for non-existent ID', () => {
    expect(store.getObservation(999)).toBeNull();
  });

  it('returns null for soft-deleted observation', () => {
    const { observation } = store.saveObservation({ title: 'Test', content: 'Content' });
    store.deleteObservation(observation.id, false);
    expect(store.getObservation(observation.id)).toBeNull();
  });

  it('handles large content for pagination logic', () => {
    const largeContent = 'x'.repeat(60000);
    const { observation } = store.saveObservation({ title: 'Large', content: largeContent });
    const result = store.getObservation(observation.id);
    expect(result!.content.length).toBe(60000);
  });

  it('returns all observation fields', () => {
    const { observation } = store.saveObservation({
      title: 'Full fields',
      content: 'Content here',
      type: 'decision',
      project: 'my-project',
      scope: 'personal',
      topic_key: 'decision/test',
    });
    const result = store.getObservation(observation.id);
    expect(result!.type).toBe('decision');
    expect(result!.project).toBe('my-project');
    expect(result!.scope).toBe('personal');
    expect(result!.topic_key).toBe('decision/test');
    expect(result!.revision_count).toBe(1);
    expect(result!.duplicate_count).toBe(1);
  });

  it('works directly without prior search/timeline', async () => {
    const { observation } = store.saveObservation({
      title: 'Direct retrieval',
      content: '**What**: Retrieve directly\n**Where**: src/tools/mem-get-observation.ts',
      type: 'manual',
      project: 'metadata-project',
      topic_key: 'regression/direct-get',
    });

    const toolResult = await toolHandler?.({ id: observation.id });

    expect(toolResult?.isError).not.toBe(true);
    expect(toolResult?.content[0].text).toContain('### [manual] Direct retrieval (ID:');
    expect(toolResult?.content[0].text).toContain('**Project:** metadata-project');
    expect(toolResult?.content[0].text).toContain('**Topic:** regression/direct-get');
    expect(toolResult?.content[0].text).toContain('**What**: Retrieve directly');

    const loaded = store.getObservation(observation.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.title).toBe('Direct retrieval');
  });
});
