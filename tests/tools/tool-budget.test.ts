import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, it } from 'vitest';

import { createServer } from '../../src/server.js';

it('keeps the six listed MCP definitions within their model-facing budget', async () => {
  const root = mkdtempSync(join(tmpdir(), 'thoth-mcp-tool-budget-'));
  const built = createServer({ dataDir: root, databasePath: ':memory:' });
  const client = new Client({ name: 'tool-budget-test', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await built.server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = (await client.listTools()).tools;
    expect(tools.map((tool) => tool.name)).toEqual(['mem_save', 'mem_recall', 'mem_context', 'mem_get', 'mem_project', 'mem_session']);
    const size = tools.reduce((total, { name, description, inputSchema }) => total + JSON.stringify({
      name, description, inputSchema,
    }).length, 0);

    // Baseline: 19,561 chars; compacted: 14,457, with 5% headroom.
    expect(size).toBeLessThanOrEqual(15_180);
  } finally {
    await client.close();
    await built.server.close();
    built.service.close();
    rmSync(root, { recursive: true, force: true });
  }
});
