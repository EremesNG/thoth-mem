import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPiExtension } from '../../src/integration/pi/index.js';
import type { PiMcpClient } from '../../src/integration/pi/mcp-client.js';
import { SERVER_INSTRUCTIONS } from '../../src/server.js';
import { MEMORY_INSTRUCTION_SENTENCES, MEMORY_TOOL_CATALOG } from '../../src/tools/index.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('Pi native extension', () => {
  it('registers exactly the authoritative six tools and forwards structured results', async () => {
    const tools: Array<Record<string, unknown>> = [];
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const client: PiMcpClient = { callTool: vi.fn(async (name) => ({ content: [{ type: 'text', text: name }], structuredContent: { schema: `test.${name}` } })), close: vi.fn(async () => undefined) };
    createPiExtension({ client })({ registerTool: (tool) => tools.push(tool), on: (name, handler) => handlers.set(name, handler) });
    expect(tools.map((tool) => tool.name)).toEqual(MEMORY_TOOL_CATALOG.map((tool) => tool.name));
    expect(tools.map((tool) => tool.parameters)).toEqual(MEMORY_TOOL_CATALOG.map((tool) => tool.inputSchema));
    const result = await (tools[0]!.execute as (id: string, params: Record<string, unknown>) => Promise<unknown>)('call-1', {});
    expect(result).toMatchObject({ details: { schema: 'test.mem_save' } });
    expect(handlers.size).toBe(8);
  });

  it('exposes shared proactive guidelines only on recall within the MCP instruction budget', () => {
    const tools: Array<Record<string, unknown>> = [];
    const client: PiMcpClient = { callTool: vi.fn(async () => ({ content: [] })), close: vi.fn(async () => undefined) };
    createPiExtension({ client })({ registerTool: (tool) => tools.push(tool), on: () => undefined });
    const recall = tools.find((tool) => tool.name === 'mem_recall')!;
    const guidelines = recall.promptGuidelines as string[];
    expect(guidelines).toEqual([
      'At the start of non-trivial repository work, recall with task key terms before exploring, unprompted.',
      'Expand only selected records. Skip memory for trivial or conversational turns.',
      'Save verified decisions, root causes, failed approaches, and non-obvious conventions immediately, unprompted.',
      'When a recovered handoff\'s pending action is done, save its outcome under the same topic_key.',
      'Save one handoff before meaningful work ends if continuation helps.',
      'Use verified identity for attribution, exclude private, transient, canonical, user-forbidden, and duplicate content, and reserve mem_session for actual root lifecycle events.',
    ]);
    expect(guidelines).toEqual(MEMORY_INSTRUCTION_SENTENCES.slice(1));
    expect(guidelines.join(' ').length).toBeLessThanOrEqual(SERVER_INSTRUCTIONS.length);
    expect(SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(699);
    for (const tool of tools.filter((tool) => tool.name !== 'mem_recall')) {
      expect(tool).not.toHaveProperty('promptGuidelines');
    }
  });

  it('lists only recall and save with short Available tools snippets', () => {
    const tools: Array<Record<string, unknown>> = [];
    const client: PiMcpClient = { callTool: vi.fn(async () => ({ content: [] })), close: vi.fn(async () => undefined) };
    createPiExtension({ client })({ registerTool: (tool) => tools.push(tool), on: () => undefined });
    const snippets = tools.filter((tool) => tool.name === 'mem_recall' || tool.name === 'mem_save');
    expect(snippets.map((tool) => [tool.name, tool.promptSnippet])).toEqual([
      ['mem_save', 'Save verified project knowledge and continuation handoffs.'],
      ['mem_recall', 'Recall project memory before non-trivial repository work.'],
    ]);
    for (const tool of snippets) {
      expect((tool.promptSnippet as string).length).toBeLessThanOrEqual(80);
    }
    for (const tool of tools.filter((tool) => tool.name !== 'mem_recall' && tool.name !== 'mem_save')) {
      expect(tool).not.toHaveProperty('promptSnippet');
      expect(tool).not.toHaveProperty('promptGuidelines');
    }
  });

  it('keeps prompts usable, replaces only owned context, preserves cache on compact failure, and closes on reload', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-plugin-')); roots.push(cwd);
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const calls: string[] = [];
    const client: PiMcpClient = {
      callTool: vi.fn(async (_name, args) => { calls.push(String(args.operation)); return { content: [], structuredContent: { data: { outcome: 'degraded' } } }; }),
      close: vi.fn(async () => undefined),
    };
    createPiExtension({ client })({ registerTool: () => undefined, on: (name, handler) => handlers.set(name, handler) });
    const context = { cwd, sessionManager: { getSessionId: () => 'session-1', getLeafId: () => 'leaf-1' }, ui: { notify: () => undefined } };
    await handlers.get('session_start')!({ reason: 'startup' }, context);
    expect(await handlers.get('input')!({ text: 'root prompt', source: 'interactive' }, context)).toEqual({ action: 'continue' });
    const sections: Record<string, string> = { other: 'keep', thoth_mem_recovery: 'old' };
    expect(await handlers.get('before_agent_start')!({ prompt: 'root prompt', systemPromptOptions: { sections } }, context)).toBeUndefined();
    expect(sections.other).toBe('keep');
    expect(sections.thoth_mem_recovery).toMatch(/^<!-- thoth-mem:recovery:start -->\n.*root_session_id=session-1;/u);
    expect(handlers.has('context')).toBe(false);
    await handlers.get('session_compact_failed')!({ reason: 'manual' }, context);
    await handlers.get('agent_settled')!({}, context);
    await handlers.get('session_shutdown')!({ reason: 'reload' }, context);
    expect(calls).toEqual(['enroll', 'recover', 'capture_root', 'recover']);
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('rejects tool failures while isolating lifecycle and diagnostic failures', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-fault-')); roots.push(cwd);
    const tools: Array<Record<string, unknown>> = [];
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const client: PiMcpClient = { callTool: vi.fn(async () => { throw new Error('child unavailable'); }), close: vi.fn(async () => { throw new Error('close unavailable'); }) };
    createPiExtension({ client, onDiagnostic: () => { throw new Error('diagnostic unavailable'); } })({ registerTool: (tool) => tools.push(tool), on: (name, handler) => handlers.set(name, handler) });
    const context = { cwd, sessionManager: { getSessionId: () => 'session-1', getLeafId: () => 'leaf-1' }, ui: { notify: () => { throw new Error('UI unavailable'); } } };
    await expect(handlers.get('session_start')!({}, context)).resolves.toBeUndefined();
    await expect(handlers.get('input')!({ text: 'keep working', source: 'rpc' }, context)).resolves.toEqual({ action: 'continue' });
    await expect((tools[0]!.execute as (id: string, params: Record<string, unknown>) => Promise<unknown>)('call', {})).rejects.toThrow('child unavailable');
    await expect(handlers.get('session_shutdown')!({ reason: 'quit' }, context)).resolves.toBeUndefined();
  });

  it('dispatches successful compact guidance and finalizes only a true quit', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-compact-')); roots.push(cwd);
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const operations: string[] = [];
    const client: PiMcpClient = {
      callTool: vi.fn(async (_name, args) => { operations.push(String(args.operation)); return { content: [], structuredContent: { data: { outcome: 'confirmed' } } }; }),
      close: vi.fn(async () => undefined),
    };
    createPiExtension({ client })({ registerTool: () => undefined, on: (name, handler) => handlers.set(name, handler) });
    const context = { cwd, sessionManager: { getSessionId: () => 'session-compact', getLeafId: () => 'leaf-compact' } };
    await handlers.get('session_start')!({ reason: 'startup' }, context);
    await handlers.get('session_before_compact')!({ reason: 'manual', preparation: { firstKeptEntryId: 'entry-1' } }, context);
    await handlers.get('session_compact')!({ reason: 'manual', compactionEntry: { id: 'entry-2' } }, context);
    await handlers.get('session_compact_failed')!({ reason: 'manual' }, context);
    await handlers.get('agent_settled')!({}, context);
    await handlers.get('session_shutdown')!({ reason: 'quit', targetSessionFile: 'session.jsonl' }, context);
    expect(operations).toEqual(['enroll', 'recover', 'checkpoint_pre_compact', 'guide_post_compact', 'finalize']);
    expect(client.close).toHaveBeenCalledTimes(1);
  });
});
