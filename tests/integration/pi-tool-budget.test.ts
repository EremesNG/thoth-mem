import { expect, it } from 'vitest';

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

  // Baseline: 20,390 chars across six tools; compacted: 11,895, with 5% headroom.
  expect(size).toBeLessThanOrEqual(12_490);
});
