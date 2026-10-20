import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LifecycleInput, LifecycleResult } from '../../src/memory-core/contracts.js';
import { MemoryService } from '../../src/memory-core/service.js';
import { createPiExtension } from '../../src/integration/pi/index.js';
import { PiMcpStartupTimeoutError, type PiMcpClient } from '../../src/integration/pi/mcp-client.js';
import { SERVER_INSTRUCTIONS } from '../../src/server.js';
import { createToolHandlers, MEMORY_INSTRUCTION_SENTENCES, MEMORY_TOOL_CATALOG } from '../../src/tools/index.js';

type PiApi = Parameters<ReturnType<typeof createPiExtension>>[0];
type PiToolDefinition = Parameters<PiApi['registerTool']>[0];

const STARTUP_TIMEOUT_WARNING = 'thoth-mem degraded: pi_mcp_startup_timeout — the memory server did not start in time; if memory stays unavailable, run `thoth-mem migrate`';
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

  it('finalizes a resumed root again with a new final summary covering its new prompt in a temporary database', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-resume-')); roots.push(cwd);
    const databasePath = join(cwd, 'memory.sqlite');
    const service = new MemoryService({ databasePath });
    const database = new Database(databasePath, { readonly: true });
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const tools = createToolHandlers(service);
    const calls: Array<{ args: Record<string, unknown>; result: LifecycleResult }> = [];
    const client: PiMcpClient = {
      callTool: async (name, args) => {
        const response = await tools[name](args);
        expect(response.isError).not.toBe(true);
        calls.push({ args, result: response.structuredContent.data as LifecycleResult });
        return response;
      },
      close: async () => undefined,
    };
    const createRunNonce = vi.fn().mockReturnValueOnce('run-1').mockReturnValueOnce('run-2');
    createPiExtension({ client, createRunNonce })({ registerTool: () => undefined, on: (name, handler) => handlers.set(name, handler) });
    let leaf = 'leaf-1';
    const context = { cwd, sessionManager: { getSessionId: () => 'resumed-root', getLeafId: () => leaf } };
    const shutdown = { reason: 'quit', targetSessionFile: 'session.jsonl' };
    try {
      await handlers.get('session_start')!({ reason: 'startup' }, context);
      await handlers.get('input')!({ text: 'Implement the shared lifecycle and verify the first clean session shutdown.', source: 'interactive' }, context);
      await handlers.get('session_shutdown')!(shutdown, context);
      const firstFinal = calls.at(-1)!.result;
      expect(firstFinal).toMatchObject({ duplicate: false, summaryId: expect.any(String) });
      expect(service.get({ id: firstFinal.summaryId! }).record).toMatchObject({ kind: 'final', version: 1, coverage: { toSequence: 1 } });
      const replayedFinal = await tools.mem_session(calls.at(-1)!.args);
      expect(replayedFinal.structuredContent.data).toMatchObject({ duplicate: true, summaryId: firstFinal.summaryId });

      await handlers.get('session_start')!({ reason: 'resume' }, context);
      expect(database.prepare('SELECT state FROM sessions WHERE root_session_key=?').get('resumed-root')).toEqual({ state: 'ended' });
      leaf = 'leaf-2';
      const prompt = { text: 'Continue the resumed lifecycle with new activity and verify a second final summary.', source: 'interactive' };
      await handlers.get('input')!(prompt, context);
      const captured = calls.at(-1)!.result;
      expect(captured).toMatchObject({ duplicate: false, sessionId: firstFinal.sessionId, event: { sequence: 3 } });
      expect(database.prepare('SELECT state,ended_at FROM sessions WHERE id=?').get(firstFinal.sessionId)).toEqual({ state: 'active', ended_at: null });
      await handlers.get('input')!(prompt, context);
      expect(calls.at(-1)!.result).toMatchObject({ duplicate: true, evidenceId: captured.evidenceId, event: captured.event });
      for (let index = 0; index < 2; index += 1) {
        await handlers.get('before_agent_start')!({ systemPromptOptions: { sections: {} } }, context);
      }
      expect(calls.at(-1)!.result.duplicate).toBe(true);
      await handlers.get('session_shutdown')!(shutdown, context);
      const secondFinal = calls.at(-1)!.result;
      expect(secondFinal).toMatchObject({ duplicate: false, sessionId: firstFinal.sessionId });
      expect(secondFinal.summaryId).not.toBe(firstFinal.summaryId);
      expect(service.get({ id: secondFinal.summaryId! }).record).toMatchObject({
        kind: 'final', version: 2, status: 'current', supersedesId: firstFinal.summaryId,
        coverage: { fromSequence: 1, toSequence: captured.event!.sequence }, generator: { kind: 'harness' },
        claims: expect.arrayContaining([expect.objectContaining({ kind: 'objective', content: prompt.text, supportIds: [captured.evidenceId] })]),
      });
      expect(service.get({ id: firstFinal.summaryId! }).record).toMatchObject({ status: 'superseded' });
      expect(database.prepare('SELECT state,ended_at FROM sessions WHERE id=?').get(firstFinal.sessionId)).toEqual({ state: 'ended', ended_at: expect.any(String) });
      expect(database.prepare("SELECT count(*) AS count FROM lifecycle_receipts WHERE root_session_key=? AND operation='finalize'").get('resumed-root')).toEqual({ count: 2 });
      expect(calls.every(({ args }) => !('summary' in args))).toBe(true);
      expect(createRunNonce).toHaveBeenCalledTimes(2);
    } finally { database.close(); service.close(); }
  });

  it('retains one nonce through repeated start and post-compaction recovery refreshes, replacing it at each session_start', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-run-keys-')); roots.push(cwd);
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const calls: Record<string, unknown>[] = [];
    const client: PiMcpClient = {
      callTool: async (_name, args) => { calls.push(args); return { structuredContent: { data: { outcome: 'degraded' } } }; },
      close: async () => undefined,
    };
    const createRunNonce = vi.fn().mockReturnValueOnce('run-1').mockReturnValueOnce('run-2');
    createPiExtension({ client, createRunNonce })({ registerTool: () => undefined, on: (name, handler) => handlers.set(name, handler) });
    const context = { cwd, sessionManager: { getSessionId: () => 'same-root', getLeafId: () => 'same-leaf' } };
    const run = async () => {
      const offset = calls.length;
      await handlers.get('session_start')!({ reason: 'resume' }, context);
      for (let index = 0; index < 2; index += 1) {
        await handlers.get('before_agent_start')!({ systemPromptOptions: { sections: {} } }, context);
      }
      await handlers.get('input')!({ text: 'root prompt', source: 'interactive' }, context);
      await handlers.get('session_before_compact')!({ reason: 'manual', preparation: { firstKeptEntryId: 'entry-1' } }, context);
      await handlers.get('session_compact')!({ reason: 'manual', compactionEntry: { id: 'compact-1', summary: '## Goal\nVerify recovery.' } }, context);
      for (let index = 0; index < 2; index += 1) {
        await handlers.get('before_agent_start')!({ systemPromptOptions: { sections: {} } }, context);
      }
      await handlers.get('session_shutdown')!({ reason: 'quit', targetSessionFile: 'same-session.jsonl' }, context);
      const runCalls = calls.slice(offset);
      expect(runCalls.map(({ operation }) => operation)).toEqual(['enroll', 'recover', 'recover', 'recover', 'capture_root', 'checkpoint_pre_compact', 'guide_post_compact', 'recover', 'recover', 'finalize']);
      expect(runCalls[2]!.event_key).toBe(runCalls[1]!.event_key);
      expect(runCalls[3]!.event_key).toBe(runCalls[1]!.event_key);
      expect(runCalls[7]!.event_key).not.toBe(runCalls[1]!.event_key);
      expect(runCalls[8]!.event_key).toBe(runCalls[7]!.event_key);
      expect(runCalls[7]).not.toHaveProperty('content');
      return runCalls;
    };
    const first = await run();
    const resumed = await run();
    expect(createRunNonce).toHaveBeenCalledTimes(2);
    for (const [index, call] of first.entries()) {
      const resumedKey = resumed[index]!.event_key;
      if (call.operation === 'enroll' || call.operation === 'recover' || call.operation === 'finalize') {
        expect(resumedKey).not.toBe(call.event_key);
      } else {
        expect(resumedKey).toBe(call.event_key);
      }
    }
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

  it.each([
    { tool: 'mem_get', length: 25_000 },
    { tool: 'mem_recall', length: 20_001 },
  ])('replaces $length-character $tool text with a small JSON notice without changing structured details', async ({ tool, length }) => {
    const tools: PiToolDefinition[] = [];
    const structuredContent = { schema: 'test.mem_get', data: { keep: 'original details' } };
    const client: PiMcpClient = {
      callTool: async () => ({ content: [{ type: 'text', text: 'x'.repeat(length) }], structuredContent }),
      close: async () => undefined,
    };
    createPiExtension({ client })({ registerTool: (tool) => tools.push(tool), on: () => undefined });

    const result = await tools.find((definition) => definition.name === tool)!.execute('call', {});
    expect(result.content).toHaveLength(1);
    const text = result.content[0]!.text;
    const notice: unknown = JSON.parse(text);
    expect(text.length).toBeLessThan(1_000);
    expect(notice).toEqual({
      schema: 'thoth-mem.pi.output_truncated',
      tool,
      original_chars: length,
      cap_chars: 20_000,
      guidance: expect.stringMatching(/narrow.*smaller budget_chars.*selective mem_get/iu),
    });
    expect(result.details).toBe(structuredContent);
  });

  it.each([0, 19_000, 20_000])('passes %i-character tool text through unchanged', async (length) => {
    const tools: PiToolDefinition[] = [];
    const text = length === 0 ? '' : ' \n🙂é"\\'.padEnd(length - 1, 'x') + '\n';
    const client: PiMcpClient = {
      callTool: async () => ({ content: [{ type: 'text', text }] }),
      close: async () => undefined,
    };
    createPiExtension({ client })({ registerTool: (tool) => tools.push(tool), on: () => undefined });

    const result = await tools[0]!.execute('call', {});
    expect(result.content).toEqual([{ type: 'text', text }]);
  });

  it('bounds serialized structured-only text without changing its details', async () => {
    const tools: PiToolDefinition[] = [];
    const structuredContent = { data: 'x'.repeat(24_989) };
    const client: PiMcpClient = {
      callTool: async () => ({ structuredContent }),
      close: async () => undefined,
    };
    createPiExtension({ client })({ registerTool: (tool) => tools.push(tool), on: () => undefined });

    const result = await tools[0]!.execute('call', {});
    const text = result.content[0]!.text;
    expect(text.length).toBeLessThan(1_000);
    expect(JSON.parse(text)).toMatchObject({
      schema: 'thoth-mem.pi.output_truncated',
      tool: 'mem_save',
      original_chars: 25_000,
      cap_chars: 20_000,
    });
    expect(result.details).toBe(structuredContent);
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

  it('warns once per session about startup timeouts without blocking prompts or injecting memory', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-startup-timeout-')); roots.push(cwd);
    const tools: PiToolDefinition[] = [];
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const notify = vi.fn();
    createPiExtension({ connect: () => new Promise(() => undefined), timeoutMs: 10 })({
      registerTool: (tool) => tools.push(tool),
      on: (name, handler) => handlers.set(name, handler),
    });
    try {
      for (const session of ['session-1', 'session-1', 'session-2']) {
        const context = { cwd, sessionManager: { getSessionId: () => session, getLeafId: () => 'leaf-1' }, ui: { notify } };
        await expect(handlers.get('session_start')!({ reason: 'startup' }, context)).resolves.toBeUndefined();
        await expect(handlers.get('input')!({ text: 'keep working', source: 'interactive' }, context)).resolves.toEqual({ action: 'continue' });
        const sections: Record<string, string> = { other: 'keep', thoth_mem_recovery: 'unverified old content' };
        await expect(handlers.get('before_agent_start')!({ systemPromptOptions: { sections } }, context)).resolves.toBeUndefined();
        expect(sections.other).toBe('keep');
        expect(sections.thoth_mem_recovery).not.toContain('unverified old content');
        expect(sections.thoth_mem_recovery).toContain(`root_session_id=${session};`);
        expect(sections.thoth_mem_recovery).toContain('Memory recovery was unavailable; only local identity is shown.');
        await expect(tools[0]!.execute('call', {}, undefined, undefined, context)).rejects.toThrow('thoth-mem Pi bridge failed: memory server startup timed out');
        expect(notify).toHaveBeenCalledTimes(session === 'session-1' ? 1 : 2);
      }
      expect(notify.mock.calls).toEqual([
        [STARTUP_TIMEOUT_WARNING, 'warning'],
        [STARTUP_TIMEOUT_WARNING, 'warning'],
      ]);
    } finally { await handlers.get('session_shutdown')!({ reason: 'reload' }, { cwd }); }
  });

  it('warns once for startup-timeout tool failures and still rejects with bounded error text', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-tool-startup-timeout-')); roots.push(cwd);
    const tools: PiToolDefinition[] = [];
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const notify = vi.fn();
    const diagnostics: string[] = [];
    const message = '🙂'.repeat(1_000);
    const client: PiMcpClient = {
      callTool: async (name) => {
        if (name === 'mem_session') return { structuredContent: { data: { outcome: 'degraded' } } };
        throw new PiMcpStartupTimeoutError(message);
      },
      close: async () => undefined,
    };
    createPiExtension({ client, onDiagnostic: (code) => diagnostics.push(code) })({ registerTool: (tool) => tools.push(tool), on: (name, handler) => handlers.set(name, handler) });
    const context = { cwd, sessionManager: { getSessionId: () => 'session-1', getLeafId: () => 'leaf-1' }, ui: { notify } };
    await handlers.get('session_start')!({}, context);
    for (const tool of tools.slice(0, 2)) {
      await expect(tool.execute('call', {}, undefined, undefined, context)).rejects.toMatchObject({ message: '🙂'.repeat(500) });
    }
    expect(notify.mock.calls).toEqual([[STARTUP_TIMEOUT_WARNING, 'warning']]);
    expect(diagnostics).toEqual(['pi_mcp_startup_timeout', 'pi_mcp_startup_timeout']);
    await handlers.get('session_shutdown')!({ reason: 'reload' }, context);
  });

  it('keeps repeated generic lifecycle warnings and tool failure diagnostics unchanged', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-generic-fault-')); roots.push(cwd);
    const tools: PiToolDefinition[] = [];
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const notify = vi.fn();
    const diagnostics: string[] = [];
    const client: PiMcpClient = {
      callTool: async () => { throw new Error('request timed out'); },
      close: async () => undefined,
    };
    createPiExtension({ client, onDiagnostic: (code) => diagnostics.push(code) })({ registerTool: (tool) => tools.push(tool), on: (name, handler) => handlers.set(name, handler) });
    const context = { cwd, sessionManager: { getSessionId: () => 'session-1', getLeafId: () => 'leaf-1' }, ui: { notify } };
    await handlers.get('session_start')!({}, context);
    await expect(handlers.get('input')!({ text: 'keep working', source: 'rpc' }, context)).resolves.toEqual({ action: 'continue' });
    await handlers.get('before_agent_start')!({ systemPromptOptions: { sections: {} } }, context);
    await expect(tools[0]!.execute('call', {}, undefined, undefined, context)).rejects.toThrow('request timed out');
    expect(notify.mock.calls).toEqual(Array.from({ length: 4 }, () => ['thoth-mem degraded: pi_lifecycle_request_failed', 'warning']));
    expect(diagnostics).toEqual([...Array<string>(4).fill('pi_lifecycle_request_failed'), 'pi_tool_request_failed']);
    await handlers.get('session_shutdown')!({ reason: 'reload' }, context);
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
