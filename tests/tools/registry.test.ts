import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ALL_TOOLS, registerTools } from '../../src/tools/index.js';
import { Store } from '../../src/store/index.js';
import { MEM_PROJECT_INPUT_SCHEMA } from '../../src/tools/mem-project.js';

describe('MCP tool registration', () => {
  it('registers exactly 6 compact MCP tools', () => {
    expect(ALL_TOOLS.map((tool) => tool.name)).toEqual([
      'mem_save',
      'mem_recall',
      'mem_context',
      'mem_get',
      'mem_project',
      'mem_session',
    ]);
  });

  it('mcp tool registry remains six entries', () => {
    const names = ALL_TOOLS.map((tool) => tool.name);

    expect(names).toEqual([
      'mem_save',
      'mem_recall',
      'mem_context',
      'mem_get',
      'mem_project',
      'mem_session',
    ]);
    expect(names.filter((name) => /communit/i.test(name))).toEqual([]);
  });

  it('does not expose legacy or admin tools in the MCP surface', () => {
    const names = ALL_TOOLS.map((tool) => tool.name);

    expect(names).not.toContain('mem_search');
    expect(names).not.toContain('mem_get_observation');
    expect(names).not.toContain('mem_session_start');
    expect(names).not.toContain('mem_session_summary');
    expect(names).not.toContain('mem_update');
    expect(names).not.toContain('mem_delete');
    expect(names).not.toContain('mem_stats');
    expect(names).not.toContain('mem_import');
    expect(names).not.toContain('mem_export');
    expect(names).not.toContain('mem_migrate_project');
    expect(names).not.toContain('mem_sync_export');
    expect(names).not.toContain('mem_sync_import');
    expect(names).not.toContain('mem_maintenance');
    expect(names).not.toContain('mem_maintain');
    expect(names).not.toContain('maintain_memory');
    expect(names).not.toContain('maintain-memory');
  });

  it('does not expose supersession-specific MCP tools', () => {
    const names = ALL_TOOLS.map((tool) => tool.name);

    expect(names).toEqual([
      'mem_save',
      'mem_recall',
      'mem_context',
      'mem_get',
      'mem_project',
      'mem_session',
    ]);
    expect(names.some((name) => /supersed|kg_supersed|mem_supersed/i.test(name))).toBe(false);
  });

  it('keeps graph max_chars bounded without restoring a zero sentinel', () => {
    expect(MEM_PROJECT_INPUT_SCHEMA.safeParse({
      action: 'graph',
      project: 'registry-project',
      max_chars: 199,
    }).success).toBe(false);
    expect(MEM_PROJECT_INPUT_SCHEMA.safeParse({
      action: 'graph',
      project: 'registry-project',
      max_chars: 0,
    }).success).toBe(false);
    expect(MEM_PROJECT_INPUT_SCHEMA.safeParse({
      action: 'graph',
      project: 'registry-project',
      max_chars: 200,
    }).success).toBe(true);
    expect(MEM_PROJECT_INPUT_SCHEMA.safeParse({
      action: 'summary',
      project: 'registry-project',
      max_chars: 0,
    }).success).toBe(true);
  });

  it('registration does not require profile arguments', () => {
    expect(registerTools.length).toBe(2);
  });

  it('registers all tools in a single profile-free call', () => {
    const store = new Store(':memory:');
    const server = { tool: vi.fn() } as unknown as McpServer;

    try {
      registerTools(server, store);

      expect((server.tool as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(6);
    } finally {
      store.close();
    }
  });
});
