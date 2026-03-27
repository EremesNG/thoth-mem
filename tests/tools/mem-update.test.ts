import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMemUpdate } from '../../src/tools/mem-update.js';
import { Store } from '../../src/store/index.js';

describe('mem_update tool', () => {
  let store: Store;
  let toolHandler: (input: any) => Promise<any>;
  let toolSchema: Record<string, z.ZodTypeAny>;

  async function invokeMemUpdate(input: Record<string, unknown>): Promise<any> {
    const parsed = z.object(toolSchema).safeParse(input);

    if (!parsed.success) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: parsed.error.issues.map((issue) => issue.message).join('; ') }],
      };
    }

    return toolHandler(parsed.data);
  }

  beforeEach(() => {
    store = new Store(':memory:');

    const server = {
      tool: vi.fn((name: string, _description: string, schema: Record<string, z.ZodTypeAny>, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_update') {
          toolSchema = schema;
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;

    registerMemUpdate(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('updates title only and increments revision count', async () => {
    const { observation } = store.saveObservation({
      title: 'Original title',
      content: 'Original content',
      project: 'test-project',
    });

    const result = await toolHandler({ id: observation.id, title: 'Updated title' });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(`Observation ${observation.id} updated (revision 2)`);

    const updated = store.getObservation(observation.id);
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('Updated title');
    expect(updated!.content).toBe('Original content');
    expect(updated!.revision_count).toBe(2);
  });

  it('updates all fields', async () => {
    const { observation } = store.saveObservation({
      title: 'Original title',
      content: 'Original content',
      type: 'manual',
      project: 'original-project',
      scope: 'project',
      topic_key: 'topic/original',
    });

    const result = await toolHandler({
      id: observation.id,
      title: 'New title',
      content: 'New content',
      type: 'decision',
      project: 'new-project',
      scope: 'personal',
      topic_key: 'topic/new',
    });

    expect(result.content[0].text).toContain(`Observation ${observation.id} updated (revision 2)`);

    const updated = store.getObservation(observation.id);
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('New title');
    expect(updated!.content).toBe('New content');
    expect(updated!.type).toBe('decision');
    expect(updated!.project).toBe('new-project');
    expect(updated!.scope).toBe('personal');
    expect(updated!.topic_key).toBe('topic/new');
    expect(updated!.revision_count).toBe(2);
  });

  it('returns null when updating a non-existent observation', () => {
    expect(store.updateObservation({ id: 999, title: 'Missing' })).toBeNull();
  });

  it('returns an error when no fields are provided', async () => {
    const { observation } = store.saveObservation({ title: 'Test', content: 'Content' });

    const result = await toolHandler({ id: observation.id });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('At least one field to update must be provided');
  });

  it('saves the previous version in history', async () => {
    const { observation } = store.saveObservation({
      title: 'Original title',
      content: 'Original content',
      type: 'bugfix',
      project: 'test-project',
    });

    await toolHandler({ id: observation.id, content: 'Updated content' });

    const versions = store.getObservationVersions(observation.id);

    expect(versions).toHaveLength(1);
    expect(versions[0].version_number).toBe(1);
    expect(versions[0].title).toBe('Original title');
    expect(versions[0].content).toBe('Original content');
    expect(versions[0].type).toBe('bugfix');
  });

});
