import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';



import { createServer } from '../../src/server.js';
import { ALL_TOOLS, registerTools } from '../../src/tools/index.js';
import { Store } from '../../src/store/index.js';
import { MEM_PROJECT_INPUT_SCHEMA } from '../../src/tools/mem-project.js';

const PUBLIC_TOOL_NAMES = [
  'mem_save',
  'mem_recall',
  'mem_context',
  'mem_get',
  'mem_project',
  'mem_session',
] as const;

const PUBLIC_INPUT_SHAPES: Record<string, { properties: string[]; required: string[] }> = {
  mem_save: {
    properties: ['kind', 'title', 'content', 'type', 'session_id', 'project', 'scope', 'topic_key'],
    required: ['content'],
  },
  mem_recall: {
    properties: [
      'query',
      'project',
      'session_id',
      'scope',
      'topic_key',
      'type',
      'time_from',
      'time_to',
      'limit',
      'mode',
      'hyde',
      'debug',
    ],
    required: ['query'],
  },
  mem_context: {
    properties: ['project', 'session_id', 'scope', 'limit', 'max_chars', 'recall_query'],
    required: [],
  },
  mem_get: {
    properties: ['id', 'kind', 'offset', 'max_length', 'include_timeline', 'before', 'after'],
    required: ['id'],
  },
  mem_project: {
    properties: [
      'action',
      'project',
      'topic_key',
      'relation',
      'limit',
      'max_chars',
      'navigation',
      'focus_node_id',
      'observation_id',
      'continuation',
      'include_superseded',
    ],
    required: ['action'],
  },
  mem_session: {
    properties: ['action', 'id', 'project', 'directory', 'content', 'summary'],
    required: ['action', 'project'],
  },
};

interface ListedTool {
  description?: string;
  inputSchema: {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  name: string;
}

interface PublicContractSnapshot {
  responses: Record<string, { contentTypes: string[]; isError: boolean }>;
  tools: ListedTool[];
}

function contractExpansionViolations(tools: ListedTool[]): string[] {
  const allowedNames = new Set<string>(PUBLIC_TOOL_NAMES);
  const violations: string[] = [];

  for (const tool of tools) {
    if (!allowedNames.has(tool.name)) {
      violations.push(`tool:${tool.name}`);
    }
    for (const property of Object.keys(tool.inputSchema.properties ?? {})) {
      if (/adapter|event|harness|idempotenc|native/i.test(property)) {
        violations.push(`input:${tool.name}.${property}`);
      }
    }
  }
  return violations;
}

function responseEnvelope(result: unknown): { contentTypes: string[]; isError: boolean } {
  const response = result as {
    content?: Array<{ type?: unknown }>;
    isError?: boolean;
  };
  return {
    contentTypes: (response.content ?? []).map((item) => String(item.type)),
    isError: response.isError === true,
  };
}

async function capturePublicContract(): Promise<PublicContractSnapshot> {
  const dataDir = mkdtempSync(join(tmpdir(), 'thoth-public-contract-'));
  const { server, store } = createServer({ dataDir });
  const client = new Client({ name: 'registry-contract-test', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const listed = await client.listTools();
    const tools = listed.tools as ListedTool[];

    const session = await client.callTool({
      name: 'mem_session',
      arguments: {
        action: 'start',
        id: 'legacy-session',
        project: 'legacy-project',
        directory: dataDir,
      },
    });
    const saved = await client.callTool({
      name: 'mem_save',
      arguments: {
        kind: 'prompt',
        content: 'Legacy public request.',
        session_id: 'legacy-session',
        project: 'legacy-project',
      },
    });
    const savedText = (saved.content as Array<{ text?: string }>)
      .map((item) => item.text ?? '')
      .join('\n');
    const promptId = Number(savedText.match(/prompt ID: (\d+)/)?.[1]);
    if (!Number.isInteger(promptId)) {
      throw new Error('Expected legacy mem_save response to contain a prompt ID');
    }

    const recall = await client.callTool({
      name: 'mem_recall',
      arguments: {
        query: 'Legacy public request',
        mode: 'compact',
        project: 'legacy-project',
        limit: 1,
        hyde: false,
      },
    });
    const context = await client.callTool({
      name: 'mem_context',
      arguments: {
        project: 'legacy-project',
        session_id: 'legacy-session',
        limit: 1,
        max_chars: 2000,
      },
    });
    const get = await client.callTool({
      name: 'mem_get',
      arguments: { kind: 'prompt', id: promptId },
    });
    const project = await client.callTool({
      name: 'mem_project',
      arguments: { action: 'list' },
    });

    return {
      tools,
      responses: {
        mem_save: responseEnvelope(saved),
        mem_recall: responseEnvelope(recall),
        mem_context: responseEnvelope(context),
        mem_get: responseEnvelope(get),
        mem_project: responseEnvelope(project),
        mem_session: responseEnvelope(session),
      },
    };
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    store.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

describe('MCP tool registration', () => {
  it('preserves the six-tool public contract', async () => {
    const baseline = await capturePublicContract();

    expect(baseline.tools.map((tool) => tool.name)).toEqual(PUBLIC_TOOL_NAMES);

    for (const tool of baseline.tools) {
      expect({
        properties: Object.keys(tool.inputSchema.properties ?? {}),
        required: tool.inputSchema.required ?? [],
      }).toEqual(PUBLIC_INPUT_SHAPES[tool.name]);
      expect(Object.keys(tool.inputSchema.properties ?? {})).not.toEqual(
        expect.arrayContaining(['harness', 'event_id', 'idempotency_key']),
      );
    }

    expect(baseline.responses).toEqual(Object.fromEntries(
      PUBLIC_TOOL_NAMES.map((name) => [name, { contentTypes: ['text'], isError: false }]),
    ));

  });

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
    expect(MEM_PROJECT_INPUT_SCHEMA.safeParse({
      action: 'health',
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
