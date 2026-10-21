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
  it.each(['startup', 'resume', 'new', 'fork'])('delivers one hidden recovery on %s and leaves system sections untouched after a save', async (reason) => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-boundary-')); roots.push(cwd);
    const service = new MemoryService({ databasePath: ':memory:' });
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const tools: PiToolDefinition[] = [];
    const calls: Record<string, unknown>[] = [];
    const results: LifecycleResult[] = [];
    const toolHandlers = createToolHandlers(service);
    const client: PiMcpClient = {
      callTool: async (name, args) => {
        const response = await toolHandlers[name](args);
        if (name === 'mem_session') { calls.push(args); results.push(response.structuredContent.data as LifecycleResult); }
        return response;
      },
      close: async () => undefined,
    };
    createPiExtension({ client })({ registerTool: (tool) => tools.push(tool), on: (name, handler) => handlers.set(name, handler) });
    const context = { cwd, sessionManager: { getSessionId: () => 'root', getLeafId: () => 'leaf', getBranch: () => [] } };
    const sections = Object.freeze({ other: 'keep', thoth_mem_recovery: 'not owned by this extension anymore' });
    const prompt = { systemPromptOptions: { sections } };
    try {
      await handlers.get('session_start')!({ reason }, context);
      const block = results.at(-1)!.recovery!.context;
      expect(await handlers.get('before_agent_start')!(prompt, context)).toEqual({ message: { customType: 'thoth-mem-recovery', content: block, display: false } });
      expect(await handlers.get('before_agent_start')!(prompt, context)).toBeUndefined();
      const saved = await tools.find((tool) => tool.name === 'mem_save')!.execute('save', {
        project_key: results[0]!.projectKey, project_name: results[0]!.projectName,
        evidence: { kind: 'explicit_save', content: 'Verified stable delivery.' },
        memory: { kind: 'decision', title: 'Mid-session choice', content: 'Result: Keep later prompts stable.\nRationale: Preserve the request prefix.' },
      });
      expect(saved.details).toMatchObject({ data: { memory: { title: 'Mid-session choice' } } });
      expect(await handlers.get('before_agent_start')!(prompt, context)).toBeUndefined();
      expect(calls.map(({ operation }) => operation)).toEqual(['enroll', 'recover']);
      await handlers.get('session_compact')!({ reason: 'manual', compactionEntry: { id: 'compact-1', summary: '## Goal\nKeep the delivery stable.' } }, context);
      const compactedBlock = results.at(-1)!.recovery!.context;
      expect(compactedBlock).toContain('Keep later prompts stable.');
      expect(await handlers.get('before_agent_start')!(prompt, context)).toEqual({ message: { customType: 'thoth-mem-recovery', content: compactedBlock, display: false } });
      expect(await handlers.get('before_agent_start')!(prompt, context)).toBeUndefined();
      await handlers.get('session_compact_failed')!({ reason: 'manual' }, context);
      expect(await handlers.get('before_agent_start')!(prompt, context)).toBeUndefined();
      expect(calls.map(({ operation }) => operation)).toEqual(['enroll', 'recover', 'guide_post_compact']);
      expect(sections).toEqual({ other: 'keep', thoth_mem_recovery: 'not owned by this extension anymore' });
      expect(await handlers.get('before_agent_start')!({ get systemPromptOptions() { throw new Error('must not read system prompt options'); } }, context)).toBeUndefined();
    } finally { service.close(); }
  });

  it.each([
    { label: 'empty branch', branch: [], delivers: true },
    { label: 'unrelated custom message', branch: [{ type: 'custom_message', customType: 'other' }], delivers: true },
    { label: 'existing recovery', branch: [{ type: 'custom_message', customType: 'thoth-mem-recovery' }, { type: 'message' }], delivers: false },
    { label: 'recovery after compaction', branch: [{ type: 'compaction' }, { type: 'custom_message', customType: 'thoth-mem-recovery' }, { type: 'message' }], delivers: false },
    { label: 'recovery only before latest compaction', branch: [{ type: 'compaction' }, { type: 'custom_message', customType: 'thoth-mem-recovery' }, { type: 'compaction' }, { type: 'message' }], delivers: true },
  ])('deduplicates reload delivery against $label', async ({ branch, delivers }) => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-reload-')); roots.push(cwd);
    const service = new MemoryService({ databasePath: ':memory:' });
    const tools = createToolHandlers(service);
    const calls: Record<string, unknown>[] = [];
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const client: PiMcpClient = {
      callTool: async (name, args) => { calls.push(args); return tools[name](args); },
      close: async () => undefined,
    };
    createPiExtension({ client })({ registerTool: () => undefined, on: (name, handler) => handlers.set(name, handler) });
    const context = { cwd, sessionManager: { getSessionId: () => 'root', getLeafId: () => 'leaf', getBranch: () => branch } };
    try {
      await handlers.get('session_start')!({ reason: 'reload' }, context);
      const first = await handlers.get('before_agent_start')!({}, context);
      if (delivers) expect(first).toMatchObject({ message: { customType: 'thoth-mem-recovery', display: false, content: expect.stringContaining('root_session_id=root;') } });
      else expect(first).toBeUndefined();
      expect(await handlers.get('before_agent_start')!({}, context)).toBeUndefined();
      expect(calls.map(({ operation }) => operation)).toEqual(['enroll', 'recover']);
    } finally { service.close(); }
  });

  it.each(['start', 'compact'])('delivers fallback then retries until one verified block at the %s boundary', async (boundary) => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-retry-')); roots.push(cwd);
    const service = new MemoryService({ databasePath: ':memory:' });
    const tools = createToolHandlers(service);
    const calls: Record<string, unknown>[] = [];
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    let unavailable = boundary === 'start';
    let verified: string | undefined;
    const client: PiMcpClient = {
      callTool: async (name, args) => {
        calls.push(args);
        if (unavailable && (args.operation === 'recover' || args.operation === 'guide_post_compact')) return { structuredContent: { data: { outcome: 'degraded' } } };
        const response = await tools[name](args);
        if (args.operation === 'recover') verified = (response.structuredContent.data as LifecycleResult).recovery!.context;
        return response;
      },
      close: async () => undefined,
    };
    createPiExtension({ client })({ registerTool: () => undefined, on: (name, handler) => handlers.set(name, handler) });
    const context = { cwd, sessionManager: { getSessionId: () => 'root', getLeafId: () => 'leaf', getBranch: () => [] } };
    try {
      await handlers.get('session_start')!({ reason: 'startup' }, context);
      if (boundary === 'compact') {
        await handlers.get('before_agent_start')!({}, context);
        unavailable = true;
        await handlers.get('session_compact')!({ compactionEntry: { id: 'compact-1' } }, context);
      }
      const initialCalls = calls.length;
      expect(await handlers.get('before_agent_start')!({}, context)).toEqual({ message: {
        customType: 'thoth-mem-recovery', display: false,
        content: expect.stringContaining('Memory recovery was unavailable; only local identity is shown.'),
      } });
      expect(calls).toHaveLength(initialCalls);
      expect(await handlers.get('before_agent_start')!({}, context)).toBeUndefined();
      expect(calls).toHaveLength(initialCalls + 1);
      unavailable = false;
      const recovered = await handlers.get('before_agent_start')!({}, context);
      expect(recovered).toEqual({ message: { customType: 'thoth-mem-recovery', content: verified, display: false } });
      expect(verified).toContain('No memory was recovered;');
      expect(await handlers.get('before_agent_start')!({}, context)).toBeUndefined();
      expect(calls).toHaveLength(initialCalls + 2);
      const keys = calls.filter(({ operation }) => operation === 'recover').map(({ event_key }) => event_key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(calls.slice(initialCalls).map(({ operation }) => operation)).toEqual(['recover', 'recover']);
      expect(calls.slice(initialCalls).every((call) => !('content' in call))).toBe(true);
    } finally { service.close(); }
  });

  it('replaces a pending fallback boundary on compaction and ignores an in-flight retry from the old boundary', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-retry-compact-')); roots.push(cwd);
    const service = new MemoryService({ databasePath: ':memory:' });
    const tools = createToolHandlers(service);
    const calls: Record<string, unknown>[] = [];
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    let completeRetry: (value: Record<string, unknown>) => void = () => { throw new Error('retry did not start'); };
    const retry = new Promise<Record<string, unknown>>((resolve) => { completeRetry = resolve; });
    let compactedBlock: string | undefined;
    const client: PiMcpClient = {
      callTool: async (name, args) => {
        calls.push(args);
        if (args.operation === 'recover') {
          if (calls.filter(({ operation }) => operation === 'recover').length === 1) return {};
          return retry;
        }
        const response = await tools[name](args);
        if (args.operation === 'guide_post_compact') compactedBlock = (response.structuredContent.data as LifecycleResult).recovery!.context;
        return response;
      },
      close: async () => undefined,
    };
    createPiExtension({ client })({ registerTool: () => undefined, on: (name, handler) => handlers.set(name, handler) });
    const context = { cwd, sessionManager: { getSessionId: () => 'root', getLeafId: () => 'leaf', getBranch: () => [] } };
    try {
      await handlers.get('session_start')!({ reason: 'startup' }, context);
      expect(await handlers.get('before_agent_start')!({}, context)).toMatchObject({ message: { content: expect.stringContaining('Memory recovery was unavailable;') } });
      const oldPrompt = handlers.get('before_agent_start')!({}, context);
      await handlers.get('session_compact')!({ compactionEntry: { id: 'compact-1' } }, context);
      completeRetry({});
      expect(await oldPrompt).toBeUndefined();
      expect(await handlers.get('before_agent_start')!({}, context)).toEqual({ message: { customType: 'thoth-mem-recovery', content: compactedBlock, display: false } });
      expect(await handlers.get('before_agent_start')!({}, context)).toBeUndefined();
      expect(calls.map(({ operation }) => operation)).toEqual(['enroll', 'recover', 'recover', 'guide_post_compact']);
    } finally { completeRetry({}); service.close(); }
  });

  it.each(['invalid;root', '', 'root\ninjected'])('delivers nothing and never retries invalid local identity %j', async (root) => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-pi-invalid-')); roots.push(cwd);
    const handlers = new Map<string, (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown>();
    const callTool = vi.fn(async () => ({}));
    createPiExtension({ client: { callTool, close: async () => undefined } })({ registerTool: () => undefined, on: (name, handler) => handlers.set(name, handler) });
    const context = { cwd, sessionManager: { getSessionId: () => root, getLeafId: () => 'leaf', getBranch: () => [] } };
    await handlers.get('session_start')!({ reason: 'startup' }, context);
    const initialCalls = callTool.mock.calls.length;
    for (let index = 0; index < 2; index += 1) {
      expect(await handlers.get('before_agent_start')!({ get systemPromptOptions() { throw new Error('must not read system prompt options'); } }, context)).toBeUndefined();
    }
    expect(callTool).toHaveBeenCalledTimes(initialCalls);
  });

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
      const recovery = await handlers.get('before_agent_start')!({ systemPromptOptions: { sections } }, untouched);
      expect(recovery).toMatchObject({ message: { customType: 'thoth-mem-recovery', content: expect.stringContaining('root_session_id=untouched;'), display: false } });
      expect(recovery).toMatchObject({ message: { content: expect.not.stringContaining('Memory recovery was unavailable') } });
      expect(sections).toEqual({});
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
      expect(database.prepare('SELECT version,status FROM session_summaries').all()).toEqual([{ version: 1, status: 'current' }]);
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
      expect(service.get({ id: firstFinal.summaryId! }).record).toMatchObject({ version: 1, coverage: { toSequence: 1 } });
      const replayedFinal = await tools.mem_session(calls.at(-1)!.args);
      expect(replayedFinal.structuredContent.data).toMatchObject({ duplicate: true, summaryId: firstFinal.summaryId });

      await handlers.get('session_start')!({ reason: 'resume' }, context);
      leaf = 'leaf-2';
      const prompt = { text: 'Continue the resumed lifecycle with new activity and verify a second final summary.', source: 'interactive' };
      await handlers.get('input')!(prompt, context);
      const captured = calls.at(-1)!.result;
      expect(captured).toMatchObject({ duplicate: false, sessionId: firstFinal.sessionId, event: { sequence: 3 } });
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
        version: 2, status: 'current', supersedesId: firstFinal.summaryId,
        coverage: { fromSequence: 1, toSequence: captured.event!.sequence }, generator: { kind: 'harness' },
        claims: expect.arrayContaining([expect.objectContaining({ kind: 'objective', content: prompt.text, supportIds: [captured.evidenceId] })]),
      });
      expect(service.get({ id: firstFinal.summaryId! }).record).toMatchObject({ status: 'superseded' });
      expect(database.prepare("SELECT count(*) AS count FROM lifecycle_receipts WHERE root_session_key=? AND operation='finalize'").get('resumed-root')).toEqual({ count: 2 });
      expect(calls.every(({ args }) => !('summary' in args))).toBe(true);
      expect(createRunNonce).toHaveBeenCalledTimes(2);
    } finally { database.close(); service.close(); }
  });

  it('retains one nonce with fresh retry keys across start and compaction, replacing it at each session_start', async () => {
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
      expect(runCalls.map(({ operation }) => operation)).toEqual(['enroll', 'recover', 'recover', 'capture_root', 'checkpoint_pre_compact', 'guide_post_compact', 'recover', 'finalize']);
      const retries = runCalls.filter(({ operation }) => operation === 'recover');
      expect(new Set(retries.map(({ event_key }) => event_key)).size).toBe(3);
      expect(retries.every((call) => !('content' in call))).toBe(true);
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

  it('keeps prompts usable, emits fallback only once through compact failure, and clears delivery on reload shutdown', async () => {
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
    const sections = Object.freeze({ other: 'keep', thoth_mem_recovery: 'old' });
    expect(await handlers.get('before_agent_start')!({ prompt: 'root prompt', systemPromptOptions: { sections } }, context)).toEqual({ message: {
      customType: 'thoth-mem-recovery', display: false,
      content: expect.stringMatching(/^<!-- thoth-mem:recovery:start -->\n.*root_session_id=session-1;.*\nMemory recovery was unavailable;/u),
    } });
    expect(sections).toEqual({ other: 'keep', thoth_mem_recovery: 'old' });
    expect(handlers.has('context')).toBe(false);
    await handlers.get('session_compact_failed')!({ reason: 'manual' }, context);
    expect(await handlers.get('before_agent_start')!({}, context)).toBeUndefined();
    await handlers.get('agent_settled')!({}, context);
    await handlers.get('session_shutdown')!({ reason: 'reload' }, context);
    expect(await handlers.get('before_agent_start')!({}, context)).toBeUndefined();
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
        const sections = Object.freeze({ other: 'keep', thoth_mem_recovery: 'unverified old content' });
        await expect(handlers.get('before_agent_start')!({ systemPromptOptions: { sections } }, context)).resolves.toEqual({ message: {
          customType: 'thoth-mem-recovery', display: false,
          content: expect.stringContaining(`root_session_id=${session};`),
        } });
        expect(sections).toEqual({ other: 'keep', thoth_mem_recovery: 'unverified old content' });
        await expect(handlers.get('before_agent_start')!({}, context)).resolves.toBeUndefined();
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
    await handlers.get('before_agent_start')!({}, context);
    await expect(tools[0]!.execute('call', {}, undefined, undefined, context)).rejects.toThrow('request timed out');
    expect(notify.mock.calls).toEqual(Array.from({ length: 4 }, () => ['thoth-mem degraded: pi_lifecycle_request_failed', 'warning']));
    expect(diagnostics).toEqual([...Array<string>(4).fill('pi_lifecycle_request_failed'), 'pi_tool_request_failed']);
    await handlers.get('session_shutdown')!({ reason: 'reload' }, context);
  });

  it('forwards distinct compaction summaries once per identity and delivers the returned recovery without a refresh', async () => {
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
      const compactedBlock = results.at(-1)!.recovery!.context;
      service.lifecycle({ ...previous, operation: 'capture_root', eventKey: 'new', content: 'Updated predecessor. Continue verifying native recovery across hosts.' });
      const sections = Object.freeze({ other: 'keep' });
      expect(await handlers.get('before_agent_start')!({ systemPromptOptions: { sections } }, context)).toEqual({ message: {
        customType: 'thoth-mem-recovery', content: compactedBlock, display: false,
      } });
      expect(await handlers.get('before_agent_start')!({}, context)).toBeUndefined();
      expect(calls.at(-1)).toBe(compactions.at(-1));
      expect(compactedBlock).not.toContain('Updated predecessor.');
      expect(compactedBlock).toContain('Keep project recovery.');
      expect(compactedBlock).not.toContain('Own compact-');
      expect(sections).toEqual({ other: 'keep' });
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
