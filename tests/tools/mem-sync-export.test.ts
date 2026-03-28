import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMemSyncExport } from '../../src/tools/mem-sync-export.js';
import { Store } from '../../src/store/index.js';

describe('mem_sync_export tool', () => {
  let store: Store;
  let toolHandler: (input: any) => Promise<any>;
  let tempDirs: string[];

  function createTempDir(): string {
    const directory = mkdtempSync(join(tmpdir(), 'thoth-mem-sync-export-'));
    tempDirs.push(directory);
    return directory;
  }

  function seedStore(): void {
    store.startSession('sync-session', 'sync-project');
    store.saveObservation({
      session_id: 'sync-session',
      title: 'Sync observation',
      content: 'Sync observation content',
      project: 'sync-project',
    });
    store.savePrompt('sync-session', 'Sync prompt content', 'sync-project');
  }

  beforeEach(() => {
    store = new Store(':memory:');
    tempDirs = [];

    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_sync_export') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;

    registerMemSyncExport(server, store);
  });

  afterEach(() => {
    store.close();

    for (const directory of tempDirs) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('exports changes and returns a sync summary', async () => {
    seedStore();
    const syncDir = createTempDir();

    const result = await toolHandler({ sync_dir: syncDir, project: 'sync-project' });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('## Sync Export Complete');
    expect(result.content[0].text).toContain('- **Mutations Exported:** 3');
    expect(result.content[0].text).toContain('- **Sessions:** 1');
    expect(result.content[0].text).toContain('- **Observations:** 1');
    expect(result.content[0].text).toContain('- **Prompts:** 1');
    expect(result.content[0].text).toContain(`Sync directory: ${syncDir}`);
  });

  it('returns a no-op message when no new mutations exist', async () => {
    seedStore();
    const syncDir = createTempDir();

    await toolHandler({ sync_dir: syncDir, project: 'sync-project' });
    const second = await toolHandler({ sync_dir: syncDir, project: 'sync-project' });

    expect(second.isError).toBeUndefined();
    expect(second.content[0].text).toBe('No new changes to export — all mutations already synced.');
  });

  it('creates a chunk file in the sync directory', async () => {
    seedStore();
    const syncDir = createTempDir();

    const result = await toolHandler({ sync_dir: syncDir, project: 'sync-project' });
    const filenameMatch = result.content[0].text.match(/- \*\*Filename:\*\* (.+)/);

    expect(filenameMatch).not.toBeNull();

    const filename = filenameMatch?.[1]?.trim();
    expect(filename).toBeTruthy();
    expect(existsSync(join(syncDir, 'chunks', filename!))).toBe(true);
    expect(readdirSync(join(syncDir, 'chunks')).some((entry) => entry.endsWith('.json.gz'))).toBe(true);
  });
});
