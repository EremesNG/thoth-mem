import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMemMigrateProject } from '../../src/tools/mem-migrate-project.js';
import { Store } from '../../src/store/index.js';

describe('mem_migrate_project tool', () => {
  let store: Store;
  let toolHandler: (input: any) => Promise<any>;

  beforeEach(() => {
    store = new Store(':memory:');

    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_migrate_project') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;

    registerMemMigrateProject(server, store);
  });

  afterEach(() => {
    store.close();
  });

  it('successfully migrates a project across all record types', async () => {
    store.startSession('session-1', 'old-project');
    store.saveObservation({ session_id: 'session-1', title: 'Observation', content: 'Content', project: 'old-project' });
    store.savePrompt('session-1', 'Prompt', 'old-project');

    const result = await toolHandler({ old_project: 'old-project', new_project: 'new-project' });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('## Project Migrated: old-project → new-project');
    expect(result.content[0].text).toContain('- **Sessions updated:** 1');
    expect(result.content[0].text).toContain('- **Observations updated:** 1');
    expect(result.content[0].text).toContain('- **Prompts updated:** 1');
    expect(store.getSession('session-1')?.project).toBe('new-project');
  });

  it('returns a no-records message when the project does not exist', async () => {
    const result = await toolHandler({ old_project: 'missing-project', new_project: 'new-project' });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('No records found for project "missing-project"');
  });

  it('returns an error when the old and new project names are the same', async () => {
    const result = await toolHandler({ old_project: 'same-project', new_project: 'same-project' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Old and new project names are the same');
  });
});
