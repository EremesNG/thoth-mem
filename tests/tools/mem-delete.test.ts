import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMemDelete } from '../../src/tools/mem-delete.js';
import { Store } from '../../src/store/index.js';

describe('mem_delete tool', () => {
  let store: Store;
  let toolHandler: (input: any) => Promise<any>;

  beforeEach(() => {
    store = new Store(':memory:');

    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_delete') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;

    registerMemDelete(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('soft delete hides observation from getObservation', async () => {
    const { observation } = store.saveObservation({ title: 'Test', content: 'Content' });

    const result = await toolHandler({ id: observation.id });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe(`Observation ${observation.id} soft-deleted`);
    expect(store.getObservation(observation.id)).toBeNull();
  });

  it('hard delete permanently removes', async () => {
    const { observation } = store.saveObservation({ title: 'Test', content: 'Content' });

    const result = await toolHandler({ id: observation.id, hard_delete: true });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe(`Observation ${observation.id} permanently deleted`);
    expect(store.getObservation(observation.id)).toBeNull();
    expect(store.getObservationVersions(observation.id)).toHaveLength(0);
  });

  it('returns false for non-existent ID', async () => {
    const result = await toolHandler({ id: 999 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Observation 999 not found');
  });

  it('soft-deleted observation is excluded from search', async () => {
    const { observation } = store.saveObservation({ title: 'Searchable', content: 'needle content', project: 'test-project' });

    const before = store.searchObservations({ query: 'needle', project: 'test-project' });
    expect(before).toHaveLength(1);

    await toolHandler({ id: observation.id });

    const after = store.searchObservations({ query: 'needle', project: 'test-project' });
    expect(after).toHaveLength(0);
  });
});
