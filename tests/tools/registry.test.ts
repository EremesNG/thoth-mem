import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ALL_TOOLS, registerTools } from '../../src/tools/index.js';
import { Store } from '../../src/store/index.js';

describe('MCP tool registration', () => {
  it('registers exactly 13 MCP tools', () => {
    expect(ALL_TOOLS).toHaveLength(13);
  });

  it('includes mem_timeline in registered tools', () => {
    expect(ALL_TOOLS.map((tool) => tool.name)).toContain('mem_timeline');
  });

  it('includes mem_capture_passive in registered tools', () => {
    expect(ALL_TOOLS.map((tool) => tool.name)).toContain('mem_capture_passive');
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

      expect((server.tool as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(13);
    } finally {
      store.close();
    }
  });
});
