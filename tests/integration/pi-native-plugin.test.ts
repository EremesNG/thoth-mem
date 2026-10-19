import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LifecycleInput, LifecycleResult } from '../../src/memory-core/contracts.js';
import { MemoryService } from '../../src/memory-core/service.js';
import { createPiExtension } from '../../src/integration/pi/index.js';
import type { PiMcpClient } from '../../src/integration/pi/mcp-client.js';
import { SERVER_INSTRUCTIONS } from '../../src/server.js';
import { createToolHandlers, MEMORY_INSTRUCTION_SENTENCES, MEMORY_TOOL_CATALOG } from '../../src/tools/index.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('Pi native extension', () => {
  it.each(['resume', 'quit'])('leaves untouched start/recover/%s sessions absent until a typed prompt', async (reason) => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-lazy-')); roots.push(cwd);
    const databasePath = join(cwd, 'memory.sqlite');
    const service = new MemoryService({ databasePath });
    const database = new Database(databasePath, { readonly: true });
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const tools = createToolHandlers(service);
    const client: PiMcpClient = { callTool: (name, args) => tools[name](args), close: async () => undefined };
    createPiExtension({ client })({ registerTool: () => undefined, on: (name, handler) => handlers.set(name, handler) });
    const context = (root: string) => ({ cwd, sessionManager: { getSessionId: () => root, getLeafId: () => 'leaf' } });
    try {
      const untouched = context('untouched');
      await handlers.get('session_start')!({ reason: 'startup' }, untouched);
      const sections: Record<string, string> = {};
      await handlers.get('before_agent_start')!({ systemPromptOptions: { sections } }, untouched);
      expect(sections.thoth_mem_recovery).toContain('root_session_id=untouched;');
      expect(sections.thoth_mem_recovery).not.toContain('Memory recovery was unavailable');
      expect(database.prepare('SELECT count(*) AS count FROM sessions').get()).toEqual({ count: 0 });
      expect(database.prepare('SELECT count(*) AS count FROM lifecycle_receipts').get()).toEqual({ count: 0 });
      await handlers.get('session_shutdown')!({ reason }, untouched);
      expect(database.prepare('SELECT count(*) AS count FROM sessions').get()).toEqual({ count: 0 });
      expect(database.prepare('SELECT count(*) AS count FROM lifecycle_receipts').get()).toEqual({ count: 0 });
      expect(database.prepare('SELECT count(*) AS count FROM session_summaries').get()).toEqual({ count: 0 });

      const active = context('typed');
      await handlers.get('session_start')!({ reason: 'resume' }, active);
      expect(await handlers.get('input')!({ text: 'Implement the requested lifecycle change.', source: 'interactive' }, active)).toEqual({ action: 'continue' });
      expect(database.prepare('SELECT root_session_key,harness FROM sessions').all()).toEqual([{ root_session_key: 'typed', harness: 'pi' }]);
      expect(database.prepare('SELECT root_session_key,operation FROM lifecycle_receipts').all()).toEqual([{ root_session_key: 'typed', operation: 'capture_root' }]);
      await handlers.get('session_shutdown')!({ reason: 'quit' }, active);
      expect(database.prepare('SELECT count(*) AS count FROM sessions').get()).toEqual({ count: 1 });
      expect(database.prepare('SELECT kind FROM session_summaries').all()).toEqual([{ kind: 'final' }]);
      expect(database.prepare("SELECT count(*) AS count FROM lifecycle_receipts WHERE root_session_key='untouched'").get()).toEqual({ count: 0 });
    } finally { database.close(); service.close(); }
  });

  it('registers five model-facing tools without a dialect marker and forwards structured results', async () => {
    const tools: Array<Record<string, unknown>> = [];
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const client: PiMcpClient = { callTool: vi.fn(async (name) => ({ content: [{ type: 'text', text: name }], structuredContent: { schema: `test.${name}` } })), close: vi.fn(async () => undefined) };
    createPiExtension({ client })({ registerTool: (tool) => tools.push(tool), on: (name, handler) => handlers.set(name, handler) });
    expect(tools.map((tool) => tool.name)).toEqual(['mem_save', 'mem_recall', 'mem_context', 'mem_get', 'mem_project']);
    const catalog = MEMORY_TOOL_CATALOG.filter((tool) => tool.name !== 'mem_session');
    expect(tools.map((tool) => tool.parameters)).toEqual(catalog.map(({ inputSchema }) => {
      const { $schema: _dialect, ...parameters } = inputSchema;
      return parameters;
    }));
    for (const tool of tools) expect(tool.parameters).not.toHaveProperty('$schema');
    const result = await (tools[0]!.execute as (id: string, params: Record<string, unknown>) => Promise<unknown>)('call-1', {});
    expect(result).toMatchObject({ details: { schema: 'test.mem_save' } });
    expect(handlers.size).toBe(8);
  });

  it('partitions shared proactive guidelines between recall and save within the MCP instruction budget', () => {
    const tools: Array<Record<string, unknown>> = [];
    const client: PiMcpClient = { callTool: vi.fn(async () => ({ content: [] })), close: vi.fn(async () => undefined) };
    createPiExtension({ client })({ registerTool: (tool) => tools.push(tool), on: () => undefined });
    const recall = tools.find((tool) => tool.name === 'mem_recall')!;
    const guidelines = recall.promptGuidelines as string[];
    expect(guidelines).toEqual([
      'At the start of non-trivial repository work, recall with task key terms before exploring, unprompted.',
      'Expand only selected records. Skip memory for trivial or conversational turns.',
    ]);
    const saveGuidelines = tools.find((tool) => tool.name === 'mem_save')!.promptGuidelines as string[];
    expect(saveGuidelines).toEqual([
      'Save verified decisions, root causes, failed approaches, and non-obvious conventions immediately, unprompted.',
      'When a recovered handoff\'s pending action is done, save its outcome under the same topic_key.',
      'Save one handoff before meaningful work ends if continuation helps.',
      'Use verified identity for attribution, exclude private, transient, canonical, user-forbidden, and duplicate content, and reserve mem_session for actual root lifecycle events.',
    ]);
    expect([...guidelines, ...saveGuidelines]).toEqual(MEMORY_INSTRUCTION_SENTENCES.slice(1));
    expect([...guidelines, ...saveGuidelines].join(' ').length).toBeLessThanOrEqual(SERVER_INSTRUCTIONS.length);
    expect(SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(699);
    for (const tool of tools.filter((tool) => tool.name !== 'mem_recall' && tool.name !== 'mem_save')) {
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
    expect(sections.thoth_mem_recovery!.split('\n')[2]).toBe('Memory recovery was unavailable; only local identity is shown. Use mem_recall before relying on prior context.');
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

  it('forwards distinct compaction summaries once per identity and refreshes project and predecessor recovery', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-summaries-')); roots.push(cwd);
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: `path:${cwd.replaceAll('\\', '/')}`, name: cwd.split(/[\\/]/u).at(-1)! };
    const previous = { harness: 'claude' as const, project, rootSessionKey: 'previous' };
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const calls: Record<string, unknown>[] = [];
    const results: LifecycleResult[] = [];
    const client: PiMcpClient = {
      callTool: async (_name, args) => {
        calls.push(args);
        const result = service.lifecycle({
          operation: args.operation as LifecycleInput['operation'], harness: 'pi', project,
          rootSessionKey: String(args.root_session_key), eventKey: String(args.event_key),
          ...(typeof args.content === 'string' ? { content: args.content } : {}),
        });
        results.push(result);
        return { structuredContent: { data: result } };
      },
      close: async () => undefined,
    };
    try {
      service.lifecycle({ ...previous, operation: 'capture_root', eventKey: 'old', content: 'Previous objective.' });
      service.save({ project, evidence: { kind: 'explicit_save', content: 'support' }, memory: { kind: 'decision', title: 'Project choice', content: 'Keep project recovery.' } });
      createPiExtension({ client })({ registerTool: () => undefined, on: (name, handler) => handlers.set(name, handler) });
      const context = { cwd, sessionManager: { getSessionId: () => 'current', getLeafId: () => 'leaf' } };
      await handlers.get('session_start')!({ reason: 'startup' }, context);
      for (const id of ['compact-1', 'compact-2', 'compact-2']) {
        await handlers.get('session_before_compact')!({ reason: 'manual', preparation: { firstKeptEntryId: id } }, context);
        await handlers.get('session_compact')!({ reason: 'manual', compactionEntry: { id, summary: `## Goal\nOwn ${id}. <private>secret</private>` } }, context);
      }
      const compactions = calls.filter((args) => args.operation === 'guide_post_compact');
      expect(compactions.map((args) => args.content)).toEqual(['## Goal\nOwn compact-1. ', '## Goal\nOwn compact-2. ', '## Goal\nOwn compact-2. ']);
      expect(compactions[0]!.event_key).not.toBe(compactions[1]!.event_key);
      expect(compactions[1]!.event_key).toBe(compactions[2]!.event_key);
      expect(results.at(-1)).toMatchObject({ duplicate: true });
      service.lifecycle({ ...previous, operation: 'capture_root', eventKey: 'new', content: 'Updated predecessor. Continue verifying native recovery across hosts.' });
      const sections: Record<string, string> = {};
      await handlers.get('before_agent_start')!({ systemPromptOptions: { sections } }, context);
      expect(calls.at(-1)).toMatchObject({ operation: 'recover' });
      expect(calls.at(-1)).not.toHaveProperty('content');
      expect(sections.thoth_mem_recovery).toContain('Updated predecessor.');
      expect(sections.thoth_mem_recovery).toContain('Keep project recovery.');
      expect(sections.thoth_mem_recovery).not.toContain('Own compact-');
    } finally { service.close(); }
  });

  it('dispatches every root lifecycle operation through mem_session without model registration', async () => {
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
    await handlers.get('input')!({ text: 'root objective', source: 'interactive' }, context);
    await handlers.get('session_before_compact')!({ reason: 'manual', preparation: { firstKeptEntryId: 'entry-1' } }, context);
    await handlers.get('session_compact')!({ reason: 'manual', compactionEntry: { id: 'entry-2' } }, context);
    await handlers.get('session_compact_failed')!({ reason: 'manual' }, context);
    await handlers.get('agent_settled')!({}, context);
    await handlers.get('session_shutdown')!({ reason: 'quit', targetSessionFile: 'session.jsonl' }, context);
    expect(operations).toEqual(['enroll', 'recover', 'capture_root', 'checkpoint_pre_compact', 'guide_post_compact', 'finalize']);
    expect(vi.mocked(client.callTool).mock.calls.map(([name]) => name)).toEqual(operations.map(() => 'mem_session'));
    expect(client.close).toHaveBeenCalledTimes(1);
  });
});
