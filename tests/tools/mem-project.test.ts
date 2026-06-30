import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { MEM_PROJECT_INPUT_SCHEMA, registerMemProject } from '../../src/tools/mem-project.js';

describe('mem_project tool', () => {
  let store: Store;
  let toolHandler: ((input: any) => Promise<any>) | undefined;

  function seedLargeProject(project = 'project-a'): string {
    const fullMarker = 'MEM-PROJECT-FULL-MARKER';
    for (let i = 0; i < 30; i++) {
      store.saveObservation({
        title: `Large project ${i}`,
        content: `${'project summary body '.repeat(220)}${fullMarker}-${i}`,
        project,
      });
    }
    return fullMarker;
  }

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

  it('bounds summary output by default and with per-call max_chars', async () => {
    seedLargeProject();

    const defaultResult = await toolHandler?.({ action: 'summary', project: 'project-a' });
    const tightResult = await toolHandler?.({ action: 'summary', project: 'project-a', max_chars: 900 });
    const defaultText = defaultResult?.content[0].text ?? '';
    const tightText = tightResult?.content[0].text ?? '';

    expect(defaultText.length).toBeLessThanOrEqual(8000);
    expect(defaultText).toContain('Showing');
    expect(defaultText).toContain('mem_get(id=');
    expect(tightText.length).toBeLessThanOrEqual(900);
    expect(defaultText.length).toBeGreaterThan(tightText.length);
    expect(store.config.maxContextChars).toBe(8000);
  });

  it('allows max_chars 0 for summary as an unbounded full-content override', async () => {
    const fullMarker = seedLargeProject();

    const result = await toolHandler?.({ action: 'summary', project: 'project-a', max_chars: 0 });
    const text = result?.content[0].text ?? '';

    expect(text.length).toBeGreaterThan(8000);
    expect(text).toContain(fullMarker);
    expect(text).not.toContain('mem_get(id=');
  });

  it('keeps graph and topic max_chars validation at 200 or greater', () => {
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({ action: 'summary', project: 'project-a', max_chars: 0 })).not.toThrow();
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({ action: 'graph', project: 'project-a', max_chars: 0 })).toThrow(/max_chars must be >= 200/);
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({ action: 'graph', project: 'project-a', max_chars: 150 })).toThrow(/max_chars must be >= 200/);
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({ action: 'graph', project: 'project-a', max_chars: 300 })).not.toThrow();
    expect(() => MEM_PROJECT_INPUT_SCHEMA.parse({ action: 'topic', project: 'project-a', topic_key: 'architecture/topic-a', max_chars: 0 })).toThrow(/max_chars must be >= 200/);
  });
});
