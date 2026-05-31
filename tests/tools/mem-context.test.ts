import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { registerMemContext } from '../../src/tools/mem-context.js';

describe('mem_context tool (via Store)', () => {
  let store: Store;
  beforeEach(() => { store = new Store(':memory:'); });
  afterEach(() => { store.close(); });

  it('returns context with sessions and observations', () => {
    store.startSession('s1', 'test-project');
    store.saveObservation({ title: 'Test obs', content: 'Test content', session_id: 's1', project: 'test-project' });
    store.savePrompt('s1', 'What is this?', 'test-project');

    const context = store.getContext({});
    expect(context).toContain('test-project');
    expect(context).toContain('Test obs');
  });

  it('filters by project', () => {
    store.saveObservation({ title: 'A', content: 'Project A', project: 'projA' });
    store.saveObservation({ title: 'B', content: 'Project B', project: 'projB' });

    const context = store.getContext({ project: 'projA' });
    expect(context).toContain('Project A');
    // Should not contain projB observations in the observations section
  });

  it('returns empty-ish context for fresh database', () => {
    const context = store.getContext({});
    expect(typeof context).toBe('string');
    // Should at least have the stats section
    expect(context).toContain('0');
  });

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      store.saveObservation({ title: `Obs ${i}`, content: `Content ${i}`, project: 'p' });
    }
    const context = store.getContext({ limit: 2 });
    expect(typeof context).toBe('string');
  });

  it('filters observations and prompts by session_id', () => {
    store.startSession('session-a', 'test-project');
    store.startSession('session-b', 'test-project');

    store.saveObservation({
      title: 'Session A obs',
      content: 'Only session A content',
      session_id: 'session-a',
      project: 'test-project',
    });
    store.saveObservation({
      title: 'Session B obs',
      content: 'Only session B content',
      session_id: 'session-b',
      project: 'test-project',
    });

    store.savePrompt('session-a', 'Prompt from session A', 'test-project');
    store.savePrompt('session-b', 'Prompt from session B', 'test-project');

    const context = store.getContext({ session_id: 'session-a' });

    expect(context).toContain('Session A obs');
    expect(context).toContain('Prompt from session A');
    expect(context).toContain('test-project');
    expect(context).not.toContain('Session B obs');
    expect(context).not.toContain('Prompt from session B');
  });
});

describe('mem_context tool (handler)', () => {
  let store: Store;
  let toolHandler: ((input: any) => Promise<any>) | undefined;

  beforeEach(() => {
    store = new Store(':memory:');
    toolHandler = undefined;
    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_context') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;
    registerMemContext(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('keeps legacy context sections when recall_query is omitted', async () => {
    store.startSession('ctx-1', 'ctx-project');
    store.saveObservation({ title: 'Compat context', content: 'Stable section body', session_id: 'ctx-1', project: 'ctx-project' });

    const result = await toolHandler?.({});
    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('## Memory from Previous Sessions');
    expect(result?.content[0].text).not.toContain('### Optional Fused Recall');
  });

  it('appends additive fused recall section when recall_query is provided', async () => {
    store.startSession('ctx-2', 'ctx-project');
    store.saveObservation({ title: 'Recall target', content: 'fused recall marker', session_id: 'ctx-2', project: 'ctx-project' });

    const result = await toolHandler?.({ project: 'ctx-project', recall_query: 'fused recall marker' });
    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('## Memory from Previous Sessions');
    expect(result?.content[0].text).toContain('### Optional Fused Recall');
    expect(result?.content[0].text).toContain('pending:');
  });
});
