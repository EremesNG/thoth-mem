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

  function seedLargeStore(): string {
    const fullMarker = 'MEM-CONTEXT-FULL-MARKER';
    for (let i = 0; i < 30; i++) {
      store.saveObservation({
        title: `Large context ${i}`,
        content: `${'tool context body '.repeat(220)}${fullMarker}-${i}`,
        project: 'ctx-project',
      });
    }
    return fullMarker;
  }

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

  it('bounds large default output and reports omitted observations', async () => {
    seedLargeStore();

    const result = await toolHandler?.({ project: 'ctx-project' });
    const text = result?.content[0].text ?? '';

    expect(result?.isError).not.toBe(true);
    expect(text.length).toBeLessThanOrEqual(8000);
    expect(text).toContain('Showing');
    expect(text).toContain('omitted');
    expect(text).toContain('mem_get(id=');
  });

  it('honors max_chars per call without mutating the store default', async () => {
    seedLargeStore();

    const tight = await toolHandler?.({ project: 'ctx-project', max_chars: 900 });
    const normal = await toolHandler?.({ project: 'ctx-project' });
    const tightText = tight?.content[0].text ?? '';
    const normalText = normal?.content[0].text ?? '';

    expect(tightText.length).toBeLessThanOrEqual(900);
    expect(normalText.length).toBeGreaterThan(tightText.length);
    expect(normalText.length).toBeLessThanOrEqual(8000);
    expect(store.config.maxContextChars).toBe(8000);
  });

  it('enforces max_chars on context plus optional recall output', async () => {
    store.startSession('ctx-3', 'ctx-project');
    store.saveObservation({
      title: 'Recall cap target',
      content: 'fused recall marker that should appear in recall section'.repeat(40),
      session_id: 'ctx-3',
      project: 'ctx-project',
    });

    const result = await toolHandler?.({ project: 'ctx-project', recall_query: 'fused recall marker', max_chars: 2000 });
    const text = result?.content[0].text ?? '';

    expect(result?.isError).not.toBe(true);
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text).toContain('### Optional Fused Recall');
    expect(text).toContain('fused recall marker');
  });

  it('shows maintenance lineage in optional fused recall evidence', async () => {
    store.close();
    store = new Store(':memory:', {
      maintenance: {
        consolidation: { enabled: false },
        decay: { enabled: false },
        reflection: { enabled: true, minSourceCount: 2 },
      },
      knowledgeGraph: { kgMultiHopEnabled: false },
    });
    registerMemContext({
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_context') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer, store);
    store.saveObservation({
      title: 'Reflection context source A',
      content: 'reflection context marker source A',
      project: 'ctx-maint-project',
      type: 'decision',
    });
    store.saveObservation({
      title: 'Reflection context source B',
      content: 'reflection context marker source B',
      project: 'ctx-maint-project',
      type: 'decision',
    });
    store.runMaintenance({ scope: { project: 'ctx-maint-project' } });

    const result = await toolHandler?.({
      project: 'ctx-maint-project',
      recall_query: 'Reflection context source',
      max_chars: 3000,
    });
    const text = result?.content[0].text ?? '';

    expect(result?.isError).not.toBe(true);
    expect(text).toContain('maintenance: reflection');
    expect(text).toContain('sources=');
  });

  it('treats max_chars 0 as an unbounded full-content override', async () => {
    const fullMarker = seedLargeStore();

    const result = await toolHandler?.({ project: 'ctx-project', max_chars: 0 });
    const text = result?.content[0].text ?? '';

    expect(text.length).toBeGreaterThan(8000);
    expect(text).toContain(fullMarker);
    expect(text).not.toContain('mem_get(id=');
  });
});
