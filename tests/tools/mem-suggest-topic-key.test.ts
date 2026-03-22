import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { registerMemSuggestTopicKey } from '../../src/tools/mem-suggest-topic-key.js';

describe('mem_suggest_topic_key tool', () => {
  let store: Store;
  let toolHandler: ((input: any) => Promise<any>) | undefined;

  beforeEach(() => {
    store = new Store(':memory:');
    toolHandler = undefined;

    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_suggest_topic_key') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;

    registerMemSuggestTopicKey(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('returns key for title + type', async () => {
    const result = await toolHandler?.({ title: 'JWT auth middleware', type: 'architecture' });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('Suggested topic key: `architecture/jwt-auth-middleware`');
  });

  it('falls back to content when title is empty', async () => {
    const result = await toolHandler?.({ title: '', type: 'decision', content: 'Adopt a single source of truth for auth state' });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('Suggested topic key: `decision/adopt-a-single-source-of-truth-for-auth-state`');
  });

  it('handles empty inputs gracefully', async () => {
    const result = await toolHandler?.({});

    expect(result?.isError).toBe(true);
    expect(result?.content[0].text).toContain('provide either title or content');
  });
});
