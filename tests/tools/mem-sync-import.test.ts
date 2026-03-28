import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMemSyncImport } from '../../src/tools/mem-sync-import.js';
import { syncExport } from '../../src/sync/index.js';
import { Store } from '../../src/store/index.js';

describe('mem_sync_import tool', () => {
  let store: Store;
  let toolHandler: (input: any) => Promise<any>;
  let tempDirs: string[];

  function createTempDir(): string {
    const directory = mkdtempSync(join(tmpdir(), 'thoth-mem-sync-import-'));
    tempDirs.push(directory);
    return directory;
  }

  beforeEach(() => {
    store = new Store(':memory:');
    tempDirs = [];

    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_sync_import') {
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;

    registerMemSyncImport(server, store);
  });

  afterEach(() => {
    store.close();

    for (const directory of tempDirs) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('imports chunks from a sync directory and returns summary', async () => {
    const sourceStore = new Store(':memory:');
    const syncDir = createTempDir();

    try {
      sourceStore.startSession('session-1', 'sync-project');
      sourceStore.saveObservation({
        session_id: 'session-1',
        title: 'Imported observation',
        content: 'Imported observation content',
        project: 'sync-project',
      });
      sourceStore.savePrompt('session-1', 'Imported prompt', 'sync-project');

      syncExport(sourceStore, syncDir, 'sync-project');
    } finally {
      sourceStore.close();
    }

    const result = await toolHandler({ sync_dir: syncDir });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('## Sync Import Complete');
    expect(result.content[0].text).toContain('- **Chunks processed:** 1');
    expect(result.content[0].text).toContain('- **Chunks imported:** 1');
    expect(result.content[0].text).toContain('- **Skipped (duplicates):** 0');
    expect(result.content[0].text).toContain('- **Failed:** 0');
  });

  it('returns zero counts when sync directory is empty', async () => {
    const syncDir = createTempDir();

    const result = await toolHandler({ sync_dir: syncDir });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe(`No chunks found in sync directory: ${syncDir}`);
  });

  it('reports skipped duplicates when re-importing same chunks', async () => {
    const sourceStore = new Store(':memory:');
    const syncDir = createTempDir();

    try {
      sourceStore.startSession('session-1', 'sync-project');
      sourceStore.saveObservation({
        session_id: 'session-1',
        title: 'Replay-safe observation',
        content: 'Replay-safe content',
        project: 'sync-project',
      });
      sourceStore.savePrompt('session-1', 'Replay-safe prompt', 'sync-project');

      syncExport(sourceStore, syncDir, 'sync-project');
    } finally {
      sourceStore.close();
    }

    const firstImport = await toolHandler({ sync_dir: syncDir });
    const secondImport = await toolHandler({ sync_dir: syncDir });

    expect(firstImport.content[0].text).toContain('- **Chunks imported:** 1');
    expect(secondImport.isError).toBeUndefined();
    expect(secondImport.content[0].text).toContain('- **Chunks imported:** 0');
    expect(secondImport.content[0].text).toContain('- **Skipped (duplicates):** 3');
    expect(secondImport.content[0].text).toContain('- **Failed:** 0');
  });
});
