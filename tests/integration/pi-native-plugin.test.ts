import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPiExtension } from '../../src/integration/pi/index.js';
import type { PiMcpClient } from '../../src/integration/pi/mcp-client.js';
import { MEMORY_TOOL_CATALOG } from '../../src/tools/index.js';

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
    const transformed = await handlers.get('context')!({ messages: [{ role: 'custom', customType: 'other', content: 'keep' }, { role: 'custom', customType: 'thoth-mem-recovery', content: 'old' }] }, context) as { messages: Array<Record<string, unknown>> };
    expect(transformed.messages).toHaveLength(2);
    expect(transformed.messages[0]).toEqual({ role: 'custom', customType: 'other', content: 'keep' });
    expect(transformed.messages[1]).toMatchObject({ role: 'custom', customType: 'thoth-mem-recovery', display: false });
    await handlers.get('session_compact_failed')!({ reason: 'manual' }, context);
    await handlers.get('agent_settled')!({}, context);
    await handlers.get('session_shutdown')!({ reason: 'reload' }, context);
    expect(calls).toEqual(['enroll', 'recover', 'capture_root']);
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('isolates launch failures and throwing diagnostic sinks while returning control to Pi', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-fault-')); roots.push(cwd);
    const tools: Array<Record<string, unknown>> = [];
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const client: PiMcpClient = { callTool: vi.fn(async () => { throw new Error('child unavailable'); }), close: vi.fn(async () => { throw new Error('close unavailable'); }) };
    createPiExtension({ client, onDiagnostic: () => { throw new Error('diagnostic unavailable'); } })({ registerTool: (tool) => tools.push(tool), on: (name, handler) => handlers.set(name, handler) });
    const context = { cwd, sessionManager: { getSessionId: () => 'session-1', getLeafId: () => 'leaf-1' }, ui: { notify: () => { throw new Error('UI unavailable'); } } };
    await expect(handlers.get('session_start')!({}, context)).resolves.toBeUndefined();
    await expect(handlers.get('input')!({ text: 'keep working', source: 'rpc' }, context)).resolves.toEqual({ action: 'continue' });
    await expect((tools[0]!.execute as (id: string, params: Record<string, unknown>) => Promise<unknown>)('call', {})).resolves.toMatchObject({ isError: true });
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
