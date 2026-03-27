import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMemSave } from '../../src/tools/mem-save.js';
import { Store } from '../../src/store/index.js';

describe('mem_save tool (via Store)', () => {
  let store: Store;
  let toolHandler: (input: any) => Promise<any>;
  let toolSchema: Record<string, z.ZodTypeAny>;

  async function invokeMemSave(input: Record<string, unknown>): Promise<any> {
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
        if (name === 'mem_save') {
          toolSchema = schema;
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;

    registerMemSave(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('saves a new observation and returns created action', () => {
    const result = store.saveObservation({
      title: 'Test observation',
      content: '**What**: Test\n**Why**: Testing',
      project: 'test-project',
    });

    expect(result.action).toBe('created');
    expect(result.observation.id).toBeGreaterThan(0);
    expect(result.observation.title).toBe('Test observation');
  });

  it('deduplicates identical content within window', () => {
    const r1 = store.saveObservation({ title: 'Same', content: 'Same content', project: 'p' });
    const r2 = store.saveObservation({ title: 'Same', content: 'Same content', project: 'p' });

    expect(r1.action).toBe('created');
    expect(r2.action).toBe('deduplicated');
    expect(r2.observation.id).toBe(r1.observation.id);
  });

  it('upserts via topic_key', () => {
    const r1 = store.saveObservation({ title: 'V1', content: 'Version 1', topic_key: 'arch/test', project: 'p' });
    const r2 = store.saveObservation({ title: 'V2', content: 'Version 2', topic_key: 'arch/test', project: 'p' });

    expect(r1.action).toBe('created');
    expect(r2.action).toBe('upserted');
    expect(r2.observation.id).toBe(r1.observation.id);
    expect(r2.observation.revision_count).toBe(2);
  });

  it('strips private tags from content', () => {
    const result = store.saveObservation({
      title: 'Secret',
      content: 'Public info <private>secret data</private> more public',
    });

    expect(result.observation.content).not.toContain('secret data');
    expect(result.observation.content).toContain('Public info');
  });

  it('uses default type when not provided', () => {
    const result = store.saveObservation({ title: 'Test', content: 'Content' });

    expect(result.observation.type).toBe('manual');
  });

});
