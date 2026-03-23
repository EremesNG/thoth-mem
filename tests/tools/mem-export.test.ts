import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMemExport } from '../../src/tools/mem-export.js';
import { Store } from '../../src/store/index.js';

function extractJsonBlock(text: string): string {
  const match = text.match(/```json\n([\s\S]*?)\n```/);

  if (!match) {
    throw new Error('Expected JSON code block in tool output');
  }

  return match[1];
}

describe('mem_export tool', () => {
  let store: Store;
  let toolHandler: (input: any) => Promise<any>;

  beforeEach(() => {
    store = new Store(':memory:');

    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_export') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;

    registerMemExport(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('exports memory data as JSON', async () => {
    store.startSession('session-1', 'project-a');
    store.saveObservation({ session_id: 'session-1', title: 'Observation', content: 'Content', project: 'project-a' });
    store.savePrompt('session-1', 'Prompt', 'project-a');

    const result = await toolHandler({});
    const data = JSON.parse(extractJsonBlock(result.content[0].text)) as {
      sessions: unknown[];
      observations: unknown[];
      prompts: unknown[];
    };

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('## Memory Export');
    expect(data.sessions).toHaveLength(1);
    expect(data.observations).toHaveLength(1);
    expect(data.prompts).toHaveLength(1);
  });

  it('exports memory data filtered by project', async () => {
    store.startSession('session-a', 'project-a');
    store.startSession('session-b', 'project-b');
    store.saveObservation({ session_id: 'session-a', title: 'Observation A', content: 'Content A', project: 'project-a' });
    store.saveObservation({ session_id: 'session-b', title: 'Observation B', content: 'Content B', project: 'project-b' });
    store.savePrompt('session-a', 'Prompt A', 'project-a');
    store.savePrompt('session-b', 'Prompt B', 'project-b');

    const result = await toolHandler({ project: 'project-a' });
    const data = JSON.parse(extractJsonBlock(result.content[0].text)) as {
      project?: string;
      sessions: Array<{ project: string }>;
      observations: Array<{ project: string | null }>;
      prompts: Array<{ project: string | null }>;
    };

    expect(result.content[0].text).toContain('## Memory Export (project: project-a)');
    expect(data.project).toBe('project-a');
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].project).toBe('project-a');
    expect(data.observations).toHaveLength(1);
    expect(data.observations[0].project).toBe('project-a');
    expect(data.prompts).toHaveLength(1);
    expect(data.prompts[0].project).toBe('project-a');
  });

  it('exports empty data when no observations exist', async () => {
    const result = await toolHandler({});
    const data = JSON.parse(extractJsonBlock(result.content[0].text)) as {
      sessions: unknown[];
      observations: unknown[];
      prompts: unknown[];
    };

    expect(data.sessions).toHaveLength(0);
    expect(data.observations).toHaveLength(0);
    expect(data.prompts).toHaveLength(0);
  });
});
