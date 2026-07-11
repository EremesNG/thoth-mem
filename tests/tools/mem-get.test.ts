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

  it('retrieves prompts by id with kind=prompt', async () => {
    const prompt = store.savePrompt('get-session', 'prompt body', 'get-project');

    const result = await toolHandler?.({ id: prompt.id, kind: 'prompt' });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain(`Prompt (ID: ${prompt.id})`);
    expect(result?.content[0].text).toContain('prompt body');
    expect(result?.content[0].text).toContain('get-session');
  });

  it('paginates prompt content with offset and max_length', async () => {
    const prompt = store.savePrompt('get-session', 'prompt body that is longer than the page', 'get-project');

    const result = await toolHandler?.({ id: prompt.id, kind: 'prompt', offset: 7, max_length: 6 });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('**Content pagination:** Showing characters 7-13 of 40');
    expect(result?.content[0].text).toContain('Call mem_get(kind="prompt", id=');
    expect(result?.content[0].text).toContain('body t');
  });

  it('rejects timeline requests for prompts', async () => {
    const prompt = store.savePrompt('get-session', 'prompt body', 'get-project');

    const result = await toolHandler?.({ id: prompt.id, kind: 'prompt', include_timeline: true });

    expect(result?.isError).toBe(true);
    expect(result?.content[0].text).toContain('include_timeline=true is only supported for kind="observation"');
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

  it('returns suppressed or decayed observations by id with maintenance metadata', async () => {
    store.close();
    store = new Store(':memory:', {
      maintenance: {
        consolidation: { enabled: true },
        reflection: { enabled: true, minSourceCount: 2 },
        decay: { enabled: true, staleAfterDays: 1, scoreMultiplier: 0.5 },
      },
    });
    registerMemGet({
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_get') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer, store);
    const first = store.saveObservation({
      title: 'Get maintenance source A',
      content: 'get maintenance duplicate marker',
      project: 'get-maint-project',
      type: 'manual',
    }).observation;
    const second = store.saveObservation({
      title: 'Get maintenance source B',
      content: 'get maintenance duplicate marker',
      project: 'get-maint-project',
      type: 'manual',
    }).observation;
    store.getDb().prepare("UPDATE observations SET created_at = '2020-01-01 00:00:00', updated_at = '2020-01-01 00:00:00' WHERE id IN (?, ?)")
      .run(first.id, second.id);
    store.runMaintenance({ scope: { project: 'get-maint-project' } });

    const result = await toolHandler?.({ id: first.id });
    const text = result?.content[0].text ?? '';

    expect(result?.isError).not.toBe(true);
    expect(text).toContain('get maintenance duplicate marker');
    expect(text).toContain('**Maintenance:**');
    expect(text).toContain('consolidation');
    expect(text).toContain('sources=obs:');
    expect(text).toContain('decay state=attenuated');
  });
});
