import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Plugin } from '@opencode/plugin';
import type { Info } from '@opencode/plugin/promise/tool';
import { expect, it } from 'vitest';

import { createThothMemPlugin } from '../../src/integration/opencode/plugin.js';
import { createPiExtension } from '../../src/integration/pi/index.js';
import type { PiMcpClient } from '../../src/integration/pi/mcp-client.js';

type PiApi = Parameters<ReturnType<typeof createPiExtension>>[0];
type ToolDefinition = Parameters<PiApi['registerTool']>[0];

it('keeps the five registered Pi definitions within their model-facing budget', () => {
  const tools: ToolDefinition[] = [];
  const client: PiMcpClient = {
    callTool: async () => ({ content: [] }),
    close: async () => undefined,
  };
  createPiExtension({ client })({ registerTool: (tool) => tools.push(tool), on: () => undefined });
  expect(tools.map((tool) => tool.name)).toEqual(['mem_save', 'mem_recall', 'mem_context', 'mem_get', 'mem_project']);

  const size = tools.reduce((total, { name, description, parameters, promptSnippet, promptGuidelines }) => total + JSON.stringify({
    name, description, parameters, promptSnippet, promptGuidelines,
  }).length, 0);

  // Compacted: 9,478 chars, with 5% headroom. Keep at least 20% off 11,895.
  expect(size).toBeLessThanOrEqual(9_952);
  expect(size).toBeLessThanOrEqual(Math.floor(11_895 * 0.8));
});

it('locks the six OpenCode native definitions aggregate model-facing budget', async () => {
  const tools: Info[] = [];
  const homeDir = mkdtempSync(join(tmpdir(), 'thoth-opencode-budget-'));
  const context = {
    tool: { transform: async (transform: Parameters<Plugin.Context['tool']['transform']>[0]) => {
      transform({ add: (tool: Info) => tools.push(tool) } as Parameters<typeof transform>[0]);
      return { dispose: async () => undefined };
    } },
  } as unknown as Plugin.Context;
  const client: PiMcpClient = { callTool: async () => ({ content: [] }), close: async () => undefined };
  try {
    const cleanup = await createThothMemPlugin({ client, runtimeConfig: { homeDir, env: {} } }).setup(context);
    try {
      expect(tools.map(({ name }) => name)).toEqual([
        'mem_save', 'mem_recall', 'mem_context', 'mem_get', 'mem_project', 'thoth_mem_root_identity',
      ]);
      const size = tools.reduce((total, { name, description, input }) => total + JSON.stringify({ name, description, input }).length, 0);
      // All six native definitions, including identity; changes require deliberate review.
      expect(size).toBe(8_811);
    } finally {
      await cleanup();
    }
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});
