import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { registerMemProjectGraph } from '../../src/tools/mem-project-graph.js';
import { registerMemProjectSummary } from '../../src/tools/mem-project-summary.js';
import { registerMemTopicKeys } from '../../src/tools/mem-topic-keys.js';

type ToolHandler = (input: any) => Promise<any>;

function registerToolHandler(
  register: (server: McpServer, store: Store) => void,
  store: Store,
  toolName: string
): ToolHandler {
  let toolHandler: ToolHandler | undefined;
  const server = {
    tool: vi.fn((name: string, _description: string, _schema: unknown, handler: ToolHandler) => {
      if (name === toolName) {
        toolHandler = handler;
      }
    }),
  } as unknown as McpServer;

  register(server, store);

  if (!toolHandler) {
    throw new Error(`Tool ${toolName} was not registered`);
  }

  return toolHandler;
}

describe('project view tools', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('lists live topic keys with project metadata in the store', () => {
    store.saveObservation({
      title: 'Auth model',
      content: 'Auth model content',
      project: 'auth-project',
      topic_key: 'architecture/auth-model',
    });
    store.saveObservation({
      title: 'Cache model',
      content: 'Cache model content',
      project: 'cache-project',
      topic_key: 'architecture/cache-model',
    });

    const topics = store.listTopicKeys();

    expect(topics.map((topic) => topic.topic_key)).toEqual([
      'architecture/auth-model',
      'architecture/cache-model',
    ]);
    expect(topics[0]).toMatchObject({
      project: 'auth-project',
      title: 'Auth model',
      observation_count: 1,
    });
  });

  it('returns a project summary as a tool response', async () => {
    store.startSession('summary-session', 'auth-project');
    store.saveObservation({
      title: 'Auth decision',
      content: 'Project summary tool content',
      session_id: 'summary-session',
      project: 'auth-project',
    });

    const handler = registerToolHandler(registerMemProjectSummary, store, 'mem_project_summary');
    const result = await handler({ project: 'auth-project' });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('## Project Summary: auth-project');
    expect(result.content[0].text).toContain('Project summary tool content');
  });

  it('returns graph-lite facts for a project as a tool response', async () => {
    store.saveObservation({
      title: 'Graph auth topic',
      content: '**What**: Graph-lite tool content',
      project: 'auth-project',
      topic_key: 'architecture/auth-model',
      type: 'decision',
    });

    const handler = registerToolHandler(registerMemProjectGraph, store, 'mem_project_graph');
    const result = await handler({ project: 'auth-project' });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('## Graph Lite: auth-project');
    expect(result.content[0].text).toContain('Graph auth topic -- HAS_WHAT --> Graph-lite tool content');
    expect(result.content[0].text).toContain('Graph auth topic -- HAS_TOPIC_KEY --> architecture/auth-model');
  });

  it('filters project graph facts by topic key and relation', async () => {
    store.saveObservation({
      title: 'Graph auth topic',
      content: '**What**: Auth graph content',
      project: 'auth-project',
      topic_key: 'architecture/auth-model',
      type: 'decision',
    });
    store.saveObservation({
      title: 'Graph cache topic',
      content: '**What**: Cache graph content',
      project: 'auth-project',
      topic_key: 'architecture/cache-model',
      type: 'decision',
    });

    const handler = registerToolHandler(registerMemProjectGraph, store, 'mem_project_graph');
    const result = await handler({
      project: 'auth-project',
      topic_key: 'architecture/auth-model',
      relation: 'HAS_WHAT',
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('## Graph Lite: auth-project');
    expect(result.content[0].text).toContain('Filters: topic_key=architecture/auth-model, relation=HAS_WHAT');
    expect(result.content[0].text).toContain('Graph auth topic -- HAS_WHAT --> Auth graph content');
    expect(result.content[0].text).not.toContain('Cache graph content');
    expect(result.content[0].text).not.toContain('HAS_TOPIC_KEY');
  });

  it('limits project graph edge count and reports omitted facts', async () => {
    for (let index = 0; index < 3; index++) {
      store.saveObservation({
        title: `Graph topic ${index}`,
        content: `**What**: Graph content ${index}`,
        project: 'graph-project',
        topic_key: `architecture/topic-${index}`,
        type: 'decision',
      });
    }

    const handler = registerToolHandler(registerMemProjectGraph, store, 'mem_project_graph');
    const result = await handler({ project: 'graph-project', limit: 2 });
    const text = result.content[0].text as string;
    const edgeLines = text.split('\n').filter((line) => line.startsWith('- ') && line.includes(' --> '));

    expect(result.isError).toBeUndefined();
    expect(text).toContain('Showing 2 of 12 fact(s).');
    expect(text).toContain('Omitted 10 fact(s). Narrow with relation, topic_key, or a lower limit.');
    expect(edgeLines).toHaveLength(2);
  });

  it('keeps project graph output within max_chars and reports truncation', async () => {
    for (let index = 0; index < 4; index++) {
      store.saveObservation({
        title: `Long graph topic ${index}`,
        content: `**What**: ${'Long graph content '.repeat(20)}${index}`,
        project: 'graph-project',
        type: 'decision',
      });
    }

    const handler = registerToolHandler(registerMemProjectGraph, store, 'mem_project_graph');
    const result = await handler({ project: 'graph-project', max_chars: 500 });
    const text = result.content[0].text as string;

    expect(result.isError).toBeUndefined();
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text).toContain('Output truncated');
  });

  it('lists topic keys by project as a tool response', async () => {
    store.saveObservation({
      title: 'Auth topic',
      content: 'Topic key list content',
      project: 'auth-project',
      topic_key: 'architecture/auth-model',
    });
    store.saveObservation({
      title: 'Cache topic',
      content: 'Cache topic list content',
      project: 'cache-project',
      topic_key: 'architecture/cache-model',
    });

    const handler = registerToolHandler(registerMemTopicKeys, store, 'mem_topic_keys');
    const result = await handler({ project: 'auth-project' });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('## Topic Keys');
    expect(result.content[0].text).toContain('architecture/auth-model');
    expect(result.content[0].text).not.toContain('architecture/cache-model');
  });

  it('returns exact topic-key context as a tool response', async () => {
    store.saveObservation({
      title: 'Auth topic',
      content: 'Topic key tool content',
      project: 'auth-project',
      topic_key: 'architecture/auth-model',
    });

    const handler = registerToolHandler(registerMemTopicKeys, store, 'mem_topic_keys');
    const result = await handler({
      project: 'auth-project',
      topic_key: 'architecture/auth-model',
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('## Topic Key: architecture/auth-model');
    expect(result.content[0].text).toContain('Topic key tool content');
  });
});
