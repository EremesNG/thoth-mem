import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMemImport } from '../../src/tools/mem-import.js';
import { Store } from '../../src/store/index.js';

describe('mem_import tool', () => {
  let store: Store;
  let toolHandler: (input: any) => Promise<any>;

  beforeEach(() => {
    store = new Store(':memory:');

    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_import') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;

    registerMemImport(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('imports valid JSON data', async () => {
    const sourceStore = new Store(':memory:');

    try {
      sourceStore.startSession('session-1', 'project-a');
      sourceStore.saveObservation({ session_id: 'session-1', title: 'Observation', content: 'Content', project: 'project-a' });
      sourceStore.savePrompt('session-1', 'Prompt', 'project-a');

      const result = await toolHandler({ data: JSON.stringify(sourceStore.exportData()) });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('## Memory Import Complete');
      expect(result.content[0].text).toContain('- **Sessions imported:** 1');
      expect(result.content[0].text).toContain('- **Observations imported:** 1');
      expect(result.content[0].text).toContain('- **Prompts imported:** 1');
      expect(store.exportData().observations).toHaveLength(1);
      expect(store.exportData().prompts).toHaveLength(1);
    } finally {
      sourceStore.close();
    }
  });

  it('returns an error for invalid JSON input', async () => {
    const result = await toolHandler({ data: '{not valid json' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Invalid JSON — could not parse import data');
  });

  it('returns an error when required export fields are missing', async () => {
    const result = await toolHandler({ data: JSON.stringify({ version: 1, sessions: [] }) });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Invalid export format — missing required fields (version, sessions, observations, prompts)');
  });

  it('deduplicates observations and prompts when the same import is run twice', async () => {
    const sourceStore = new Store(':memory:');

    try {
      sourceStore.startSession('session-1', 'project-a');
      sourceStore.saveObservation({ session_id: 'session-1', title: 'Observation', content: 'Content', project: 'project-a' });
      sourceStore.savePrompt('session-1', 'Prompt', 'project-a');

      const data = JSON.stringify(sourceStore.exportData());

      const firstResult = await toolHandler({ data });
      const secondResult = await toolHandler({ data });

      expect(firstResult.content[0].text).toContain('- **Skipped (duplicates):** 0');
      expect(secondResult.content[0].text).toContain('- **Sessions imported:** 0');
      expect(secondResult.content[0].text).toContain('- **Observations imported:** 0');
      expect(secondResult.content[0].text).toContain('- **Prompts imported:** 0');
      expect(secondResult.content[0].text).toContain('- **Skipped (duplicates):** 2');
    } finally {
      sourceStore.close();
    }
  });
});
