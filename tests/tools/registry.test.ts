import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ALL_TOOLS, registerTools } from '../../src/tools/index.js';
import { Store } from '../../src/store/index.js';

describe('MCP tool registration', () => {
  it('registers exactly 17 MCP tools', () => {
    expect(ALL_TOOLS).toHaveLength(17);
  });

  it('includes mem_timeline in registered tools', () => {
    expect(ALL_TOOLS.map((tool) => tool.name)).toContain('mem_timeline');
  });

  it('includes mem_capture_passive in registered tools', () => {
    expect(ALL_TOOLS.map((tool) => tool.name)).toContain('mem_capture_passive');
  });

  it('includes OpenCode-facing project view tools', () => {
    const names = ALL_TOOLS.map((tool) => tool.name);

    expect(names).toContain('mem_project_summary');
    expect(names).toContain('mem_project_graph');
    expect(names).toContain('mem_topic_keys');
  });

  it('does not include excluded admin/sync tools', () => {
    const names = ALL_TOOLS.map((tool) => tool.name);

    expect(names).not.toContain('mem_import');
    expect(names).not.toContain('mem_export');
    expect(names).not.toContain('mem_migrate_project');
    expect(names).not.toContain('mem_sync_export');
    expect(names).not.toContain('mem_sync_import');
  });

  it('registration does not require profile arguments', () => {
    expect(registerTools.length).toBe(2);
  });

  it('registers all tools in a single profile-free call', () => {
    const store = new Store(':memory:');
    const server = { tool: vi.fn() } as unknown as McpServer;

    try {
      registerTools(server, store);

      expect((server.tool as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(17);
    } finally {
      store.close();
    }
  });
});
