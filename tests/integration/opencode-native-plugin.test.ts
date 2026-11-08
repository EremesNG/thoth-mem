import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Plugin } from '@opencode/plugin';
import type { Info, ToolContext, ToolEditor } from '@opencode/plugin/promise/tool';
import type { SkillEditor } from '@opencode/plugin/promise/skill';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryService } from '../../src/memory-core/service.js';
import { resolveLocalProjectIdentity } from '../../src/integration/project-identity.js';
import { identityOnlyRecovery } from '../../src/integration/recovery.js';
import { MEMORY_TOOL_CATALOG } from '../../src/tools/index.js';
import type { McpChildClient } from '../../src/integration/mcp-child-client.js';
import plugin from '../../src/integration/opencode/index.js';
import { createThothMemPlugin } from '../../src/integration/opencode/plugin.js';
import { buildIdentityResult, resolveRootSession, sanitizeLifecycleContent, stableLifecycleEventKey } from '../../src/integration/opencode/helpers.js';

vi.mock('node:fs/promises', { spy: true });

// Only the V2 domains owned by this integration; other host domains are not used.
function fakeContext(): Plugin.Context {
  return {
    location: { directory: process.cwd() },
    tool: { transform: vi.fn(async () => ({ dispose: async () => undefined })) },
    skill: { transform: vi.fn(async () => ({ dispose: async () => undefined })) },
    event: { subscribe: vi.fn(async function* () {}) },
    session: {
      hook: vi.fn(async () => ({ dispose: async () => undefined })),
      get: vi.fn(),
      instructions: { entry: { put: vi.fn(), list: vi.fn(), remove: vi.fn() } },
    },
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), scan: vi.fn() },
  } as unknown as Plugin.Context;
}

describe('native OpenCode V2 entry', () => {
  let configRoot: string;
  beforeEach(() => {
    configRoot = mkdtempSync(join(tmpdir(), 'thoth-opencode-v2-'));
    vi.stubEnv('XDG_CONFIG_HOME', configRoot);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(configRoot, { recursive: true, force: true });
  });

  it('loads as a plain plugin object and returns an idle, idempotent cleanup', async () => {
    const start = vi.spyOn(StdioClientTransport.prototype, 'start');
    try {
      expect(typeof plugin).toBe('object');
      expect(Object.getPrototypeOf(plugin)).toBe(Object.prototype);
      expect(plugin.id).toBe('thoth-mem');
      const cleanup = await plugin.setup(fakeContext());
      expect(typeof cleanup).toBe('function');
      await cleanup();
      await cleanup();
      expect(start).not.toHaveBeenCalled();
    } finally {
      start.mockRestore();
    }
  });

  it('loads the built entry in a native ESM host without runtime OpenCode dependencies', () => {
    const url = pathToFileURL(join(process.cwd(), 'dist/opencode.js')).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      const { default: plugin } = await import(${JSON.stringify(url)});
      const { existsSync } = await import('node:fs');
      const skills = [];
      const cleanup = await plugin.setup({
        location: { directory: process.cwd() },
        tool: { transform: async () => ({ dispose: async () => {} }) },
        session: { hook: async () => ({ dispose: async () => {} }) },
        event: { subscribe: async function* () {} },
        skill: { transform: async (transform) => {
          transform({ add: (info) => skills.push(info) });
          return { dispose: async () => {} };
        } },
      });
      await cleanup();
      console.log(JSON.stringify({ id: plugin.id, setup: typeof plugin.setup,
        path: skills[0]?.path, exists: existsSync(skills[0]?.path ?? '') }));
    `], { encoding: 'utf8', windowsHide: true, cwd: configRoot });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      id: 'thoth-mem', setup: 'function', exists: true,
      path: join(process.cwd(), 'integrations/opencode/skills/thoth-mem/SKILL.md'),
    });
  });

  it('registers six stable native definitions in one transform, with the shared Pi schemas', async () => {
    const context = fakeContext();
    const tools: Info[] = [];
    const editors: ToolEditor[] = [];
    vi.mocked(context.tool.transform).mockImplementation(async (transform) => {
      const editor = { add: (tool: Info) => tools.push(tool) } as ToolEditor;
      editors.push(editor);
      transform(editor);
      return { dispose: vi.fn(async () => undefined) };
    });
    const cleanup = await createThothMemPlugin().setup(context);
    expect(context.tool.transform).toHaveBeenCalledTimes(1);
    expect(tools.map(({ name }) => name)).toEqual([
      'mem_save', 'mem_recall', 'mem_context', 'mem_get', 'mem_project', 'thoth_mem_root_identity',
    ]);
    for (const tool of tools) expect(tool.options).toEqual({ codemode: false });
    for (const tool of tools.slice(0, 5)) {
      const shared = MEMORY_TOOL_CATALOG.find(({ name }) => name === tool.name)!;
      expect(tool.description).toBe(shared.description);
      expect(tool.input).toEqual(shared.inputSchema);
      expect(JSON.stringify(tool.input)).toBe(JSON.stringify(shared.inputSchema));
      expect(tool.input).not.toHaveProperty('$schema');
    }
    expect(tools[5]!.input).toEqual({ type: 'object', properties: {} });
    // OpenCode may evaluate the transform for each session; never rebuild definitions.
    vi.mocked(context.tool.transform).mock.calls[0]![0](editors[0]!);
    for (let index = 0; index < 6; index += 1) expect(tools[index + 6]).toBe(tools[index]);
    await cleanup();
  });

  it('registers the validated packaged Skill once with stable content and its absolute asset path', async () => {
    const context = fakeContext();
    const skills: Parameters<SkillEditor['add']>[0][] = [];
    const editor = { add: (skill: Parameters<SkillEditor['add']>[0]) => skills.push(skill) } as SkillEditor;
    const dispose = vi.fn(async () => undefined);
    vi.mocked(context.skill.transform).mockImplementation(async (transform) => {
      transform(editor);
      return { dispose };
    });
    const cleanup = await createThothMemPlugin().setup(context);
    expect(context.skill.transform).toHaveBeenCalledTimes(1);
    expect(skills).toHaveLength(1);
    const skill = skills[0]!;
    expect(skill).toMatchObject({ id: 'thoth-mem', name: 'thoth-mem' });
    expect(skill.description).toContain('At the start of any non-trivial repository task');
    expect(isAbsolute(skill.path)).toBe(true);
    expect(skill.path).toBe(join(process.cwd(), 'integrations/opencode/skills/thoth-mem/SKILL.md'));
    expect(existsSync(skill.path)).toBe(true);
    expect(skill.content).toBe(readFileSync(skill.path, 'utf8').split(/\r?\n---\r?\n/u)[1]!.trim());
    vi.mocked(context.skill.transform).mock.calls[0]![0](editor);
    expect(skills[1]).toBe(skill);
    await cleanup();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing asset', null],
    ['missing frontmatter', '# Skill'],
    ['non-string description', '---\nname: thoth-mem\ndescription: true\n---\nBody'],
    ['empty content', '---\nname: thoth-mem\ndescription: Memory\n---\n'],
    ['wrong name', '---\nname: other\ndescription: Memory\n---\nBody'],
    ['empty description', '---\nname: thoth-mem\ndescription: ""\n---\nBody'],
    ['invalid YAML', '---\nname: thoth-mem\ndescription: [broken\n---\nBody'],
    ['duplicate metadata', '---\nname: thoth-mem\nname: other\ndescription: Memory\n---\nBody'],
  ])('skips registration with a bounded diagnostic for %s', async (_label, source) => {
    const read = vi.spyOn(fs, 'readFile').mockClear();
    if (source === null) read.mockRejectedValue(new Error('private asset path'));
    else read.mockResolvedValue(source);
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const context = fakeContext();
      const instance = createThothMemPlugin();
      const cleanup = await instance.setup(context);
      expect(context.skill.transform).not.toHaveBeenCalled();
      expect(diagnostic).toHaveBeenCalledExactlyOnceWith('[thoth-mem] OpenCode bridge degraded: packaged_skill_registration_failed');
      await cleanup();
      const nextCleanup = await instance.setup(fakeContext());
      expect(read).toHaveBeenCalledTimes(1);
      await nextCleanup();
    } finally {
      read.mockRestore();
      diagnostic.mockRestore();
    }
  });

  it('forwards input and cancellation to the owned client and preserves MCP text/error envelopes', async () => {
    const callTool = vi.fn<McpChildClient['callTool']>().mockResolvedValue({
      content: [{ type: 'text', text: '{"data":"verified"}' }],
    });
    const context = fakeContext();
    const tools: Info[] = [];
    vi.mocked(context.tool.transform).mockImplementation(async (transform) => {
      transform({ add: (tool: Info) => tools.push(tool) } as ToolEditor);
      return { dispose: async () => undefined };
    });
    const close = vi.fn(async () => undefined);
    const cleanup = await createThothMemPlugin({ client: { callTool, close } }).setup(context);
    const signal = new AbortController().signal;
    const caller = { signal, sessionID: 'root' } as ToolContext;
    const input = { project_key: 'fixture', query: 'verified' };
    expect(await tools[1]!.execute(input, caller)).toEqual({ content: [{ type: 'text', text: '{"data":"verified"}' }] });
    expect(callTool).toHaveBeenCalledExactlyOnceWith('mem_recall', input, signal);
    const errorText = '{"schema":"thoth-mem.mcp.error","error":{"code":"invalid_request"}}';
    callTool.mockResolvedValueOnce({ isError: true, content: [{ type: 'text', text: errorText }] });
    expect(await tools[0]!.execute({}, caller)).toEqual({ content: [{ type: 'text', text: errorText }] });
    await cleanup();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('bounds aggregate text without slicing JSON and hides rejected child internals', async () => {
    const callTool = vi.fn<McpChildClient['callTool']>()
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'x'.repeat(15_000) }, { type: 'text', text: 'y'.repeat(15_000) }] })
      .mockRejectedValueOnce(new Error('secret child stack and database path'))
      .mockResolvedValueOnce({ structuredContent: { data: 'reconnected' } });
    const context = fakeContext();
    const tools: Info[] = [];
    vi.mocked(context.tool.transform).mockImplementation(async (transform) => {
      transform({ add: (tool: Info) => tools.push(tool) } as ToolEditor);
      return { dispose: async () => undefined };
    });
    const cleanup = await createThothMemPlugin({ client: { callTool, close: async () => undefined } }).setup(context);
    const caller = { signal: new AbortController().signal, sessionID: 'root' } as ToolContext;
    const oversized = await tools[0]!.execute({}, caller);
    expect(oversized).toEqual({ content: [{ type: 'text', text: JSON.stringify({
      schema: 'thoth-mem.opencode.output_truncated', tool: 'mem_save', original_chars: 30_001,
      cap_chars: 20_000, guidance: 'Narrow the request with a smaller budget_chars or a selective mem_get.',
    }) }] });
    const failed = await tools[0]!.execute({}, caller);
    expect(failed).toEqual({ content: [{ type: 'text', text: JSON.stringify({
      schema: 'thoth-mem.opencode.error', error: { code: 'tool_request_failed', message: 'Memory tool failed; retry the request.', retryable: true },
    }) }] });
    expect(JSON.stringify(failed)).not.toContain('secret');
    expect(await tools[0]!.execute({}, caller)).toEqual({ content: [{ type: 'text', text: '{"data":"reconnected"}' }] });
    await cleanup();
  });

  it('resolves read-only root and delegated identities through V2 session.get and location', async () => {
    const context = fakeContext();
    Object.assign(context.location, { directory: configRoot });
    const sessions: Record<string, unknown> = { root: { id: 'root' }, child: { id: 'child', parentID: 'root' } };
    for (let index = 0; index <= 17; index += 1) {
      sessions[`session-${index}`] = { id: `session-${index}`, ...(index < 17 ? { parentID: `session-${index + 1}` } : {}) };
    }
    sessions.cycle = { id: 'cycle', parentID: 'cycle' };
    vi.mocked(context.session.get).mockImplementation(async ({ sessionID }) => sessions[sessionID] as Awaited<ReturnType<typeof context.session.get>>);
    const tools: Info[] = [];
    vi.mocked(context.tool.transform).mockImplementation(async (transform) => {
      transform({ add: (tool: Info) => tools.push(tool) } as ToolEditor);
      return { dispose: async () => undefined };
    });
    const callTool = vi.fn<McpChildClient['callTool']>();
    const cleanup = await createThothMemPlugin({ client: { callTool, close: async () => undefined } }).setup(context);
    const identity = async (sessionID: string) => {
      const result = await tools[5]!.execute({}, { sessionID } as ToolContext);
      const content = result.content;
      if (!Array.isArray(content) || content[0]?.type !== 'text') throw new Error('Expected text identity');
      return JSON.parse(content[0].text);
    };
    const root = await identity('root');
    expect(root).toMatchObject({
      schema: 'thoth-mem.opencode.identity.v2', status: 'verified', root_session_id: 'root',
      caller_session_id: 'root', caller_role: 'root', authorization: 'root_lifecycle',
      project_name_hint: configRoot.split(/[\\/]/u).at(-1), project_key: expect.stringMatching(/^path:/u),
    });
    expect(await identity('child')).toMatchObject({ root_session_id: 'root', caller_role: 'delegated', authorization: 'none', project_key: root.project_key });
    expect(await identity('cycle')).toMatchObject({ status: 'degraded', reason: 'parent_cycle', authorization: 'none' });
    expect(await identity('session-1')).toMatchObject({ root_session_id: 'session-17', authorization: 'none' });
    expect(await identity('session-0')).toMatchObject({ status: 'degraded', reason: 'parent_depth_exceeded', authorization: 'none' });
    expect(context.session.get).toHaveBeenCalledWith({ sessionID: 'child' });
    expect(callTool).not.toHaveBeenCalled();
    expect(context.storage.set).not.toHaveBeenCalled();
    expect(context.session.instructions.entry.put).not.toHaveBeenCalled();
    await cleanup();
  });

  it('fails closed on invalid configured runtime provenance before starting a child', async () => {
    const entry = join(configRoot, 'runtime.js');
    writeFileSync(entry, 'throw new Error("must not execute");');
    await expect(createThothMemPlugin({ runtimeEntry: entry }).setup(fakeContext()))
      .rejects.toThrow('runtimeEntry package manifest is invalid');
  });
});

const projectIdentity = () => ({ key: 'git:fixture-project', name: 'Fixture' });
const lookup = (sessions: Record<string, unknown>) => async (id: string) => sessions[id];

describe('OpenCode identity and lifecycle helpers', () => {
  it('preserves the versioned root and delegated identity authorization contract', async () => {
    const sessions = lookup({ root: { id: 'root' }, child: { id: 'child', parentID: 'root' } });
    expect(JSON.parse(await buildIdentityResult('root', sessions, projectIdentity))).toEqual({
      schema: 'thoth-mem.opencode.identity.v2', status: 'verified', root_session_id: 'root',
      caller_session_id: 'root', caller_role: 'root', project_key: 'git:fixture-project',
      project_name_hint: 'Fixture', authorization: 'root_lifecycle',
    });
    expect(JSON.parse(await buildIdentityResult('child', sessions, projectIdentity))).toMatchObject({
      root_session_id: 'root', caller_session_id: 'child', caller_role: 'delegated', authorization: 'none',
    });
  });

  it('accepts sixteen parent links and rejects a seventeenth', async () => {
    const sessions: Record<string, unknown> = {};
    for (let index = 0; index <= 17; index += 1) {
      sessions[`session-${index}`] = { id: `session-${index}`, ...(index < 17 ? { parentID: `session-${index + 1}` } : {}) };
    }
    expect(await resolveRootSession('session-1', lookup(sessions))).toEqual({ rootSessionID: 'session-17' });
    expect(await resolveRootSession('session-0', lookup(sessions))).toEqual({ reason: 'parent_depth_exceeded' });
  });

  it.each([
    ['invalid caller', 'bad caller', {}, 'invalid_caller_session'],
    ['missing session', 'root', {}, 'session_not_found'],
    ['mismatched ID', 'root', { root: { id: 'other' } }, 'session_id_mismatch'],
    ['malformed parent', 'root', { root: { id: 'root', parentID: '' } }, 'parent_id_invalid'],
    ['cycle', 'root', { root: { id: 'root', parentID: 'child' }, child: { id: 'child', parentID: 'root' } }, 'parent_cycle'],
  ])('fails closed for %s', async (_name, caller, sessions, reason) => {
    expect(JSON.parse(await buildIdentityResult(caller, lookup(sessions), projectIdentity))).toEqual({
      schema: 'thoth-mem.opencode.identity.v2', status: 'degraded', reason, authorization: 'none',
    });
  });

  it('degrades failed host and local project lookups without leaking their errors', async () => {
    expect(await resolveRootSession('root', async () => { throw new Error('private'); })).toEqual({ reason: 'session_lookup_failed' });
    expect(JSON.parse(await buildIdentityResult('root', lookup({ root: { id: 'root' } }), () => { throw new Error('private'); }))).toEqual({
      schema: 'thoth-mem.opencode.identity.v2', status: 'degraded', reason: 'project_unavailable', authorization: 'none',
    });
  });

  it('sanitizes content before stable event keys, excluding synthetic and ignored text', () => {
    const content = sanitizeLifecycleContent([
      { type: 'text', text: 'Keep <private>one secret</private>safe' },
      { type: 'text', text: 'synthetic', synthetic: true },
      { type: 'text', text: 'ignored', ignored: true },
      { type: 'image', text: 'not text' },
    ]);
    expect(content).toBe('Keep safe');
    expect(stableLifecycleEventKey(['root', content])).toBe(stableLifecycleEventKey([
      'root', sanitizeLifecycleContent([{ type: 'text', text: 'Keep <private>different secret</private>safe' }]),
    ]));
    expect(sanitizeLifecycleContent([{ type: 'text', text: 'Bearer abcdefghijklmnopqrstuvwxyz' }])).toBe('[REDACTED]');
  });
});

// Host-facing seams: registered callbacks and private MCP requests, not bridge internals.
function lifecycleFixture(recovery = false) {
  const context = fakeContext();
  const storage = new Map<string, { mode: 'verified' | 'identity' }>(recovery ? [] : [['recovery/root', { mode: 'verified' }]]);
  const entries = new Map<string, string>();
  vi.mocked(context.storage.get).mockImplementation(async (key) => storage.get(key));
  vi.mocked(context.storage.set).mockImplementation(async (key, value) => { storage.set(key, value as { mode: 'verified' | 'identity' }); });
  vi.mocked(context.storage.remove).mockImplementation(async (key) => { storage.delete(key); });
  vi.mocked(context.session.instructions.entry.list).mockImplementation(async () => [...entries].map(([key, value]) => ({ key, value })));
  vi.mocked(context.session.instructions.entry.put).mockImplementation(async ({ key, value }) => { entries.set(key, String(value)); });
  const pending: unknown[] = [];
  let wake: (() => void) | undefined;
  let signal: AbortSignal | undefined;
  vi.mocked(context.event.subscribe).mockImplementation((options) => {
    signal = options?.signal;
    signal?.addEventListener('abort', () => wake?.(), { once: true });
    return (async function* () {
      while (!signal?.aborted) {
        if (!pending.length) await new Promise<void>((resolve) => { wake = resolve; });
        if (signal?.aborted) return;
        while (pending.length) yield pending.shift();
      }
    })() as ReturnType<typeof context.event.subscribe>;
  });
  const callTool = vi.fn<McpChildClient['callTool']>().mockResolvedValue({});
  const close = vi.fn(async () => undefined);
  const hook = async (name: 'prompt' | 'compaction', event: unknown) => {
    const registration = vi.mocked(context.session.hook).mock.calls.find(([kind]) => kind === name);
    if (!registration) throw new Error(`Missing ${name} hook`);
    await registration[1](event as never);
  };
  return { context, storage, entries, callTool, close, hook, signal: () => signal,
    emit(type: string, data: unknown, id = type) { pending.push({ id, type, data }); wake?.(); },
    setup: () => createThothMemPlugin({ client: { callTool, close } }).setup(context),
  };
}

describe('OpenCode V2 root lifecycle', () => {
  it('contains iterator failures instead of rejecting setup or cleanup', async () => {
    const fixture = lifecycleFixture();
    vi.mocked(fixture.context.event.subscribe).mockImplementation(async function* () { throw new Error('private host failure'); });
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const cleanup = await fixture.setup();
      await cleanup();
      expect(diagnostic).toHaveBeenCalledExactlyOnceWith('[thoth-mem] OpenCode bridge degraded: lifecycle_subscription_failed');
      expect(fixture.callTool).not.toHaveBeenCalled();
      expect(fixture.close).toHaveBeenCalledTimes(1);
    } finally { diagnostic.mockRestore(); }
  });

  it('aborts an in-flight prompt on cleanup and disposes both hooks', async () => {
    const fixture = lifecycleFixture();
    vi.mocked(fixture.context.session.get).mockResolvedValue({ id: 'root' } as Awaited<ReturnType<typeof fixture.context.session.get>>);
    const dispose = vi.fn(async () => undefined);
    vi.mocked(fixture.context.session.hook).mockResolvedValue({ dispose });
    fixture.callTool.mockImplementation(async () => new Promise(() => undefined));
    const cleanup = await fixture.setup();
    const prompt = fixture.hook('prompt', { sessionID: 'root', messageID: 'one', prompt: { text: 'Capture' } });
    await vi.waitFor(() => expect(fixture.callTool).toHaveBeenCalledTimes(1));
    await cleanup();
    await expect(prompt).resolves.toBeUndefined();
    expect(fixture.callTool.mock.calls[0]?.[2]?.aborted).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(fixture.close).toHaveBeenCalledTimes(1);
  });

  it('fails closed and caches cold ancestry with cycles or more than sixteen links', async () => {
    const fixture = lifecycleFixture();
    const sessions: Record<string, unknown> = { cycle: { id: 'cycle', parentID: 'cycle' } };
    for (let index = 0; index <= 17; index += 1) sessions[`s-${index}`] = { id: `s-${index}`, ...(index < 17 ? { parentID: `s-${index + 1}` } : {}) };
    vi.mocked(fixture.context.session.get).mockImplementation(async ({ sessionID }) => sessions[sessionID] as Awaited<ReturnType<typeof fixture.context.session.get>>);
    const cleanup = await fixture.setup();
    for (const sessionID of ['cycle', 's-0', 's-1']) {
      const event = { sessionID, messageID: 'one', prompt: { text: 'Must not capture' } };
      await fixture.hook('prompt', event);
      const lookups = vi.mocked(fixture.context.session.get).mock.calls.length;
      await fixture.hook('prompt', event);
      expect(fixture.context.session.get).toHaveBeenCalledTimes(lookups);
      await fixture.hook('compaction', { sessionID, messages: [] });
    }
    expect(fixture.callTool).not.toHaveBeenCalled();
    await cleanup();
  });

  it('ignores every delegated event and hook even when create metadata is the only parent evidence', async () => {
    const fixture = lifecycleFixture();
    vi.mocked(fixture.context.session.get).mockResolvedValue({ id: 'root' } as Awaited<ReturnType<typeof fixture.context.session.get>>);
    const cleanup = await fixture.setup();
    fixture.emit('session.created', { sessionID: 'child', parentID: 'root' });
    fixture.emit('session.compaction.ended', { sessionID: 'child', text: 'child summary' });
    fixture.emit('session.deleted', { sessionID: 'child' });
    fixture.emit('session.created', { sessionID: 'root' });
    await vi.waitFor(() => expect(fixture.callTool).toHaveBeenCalledTimes(1));
    await fixture.hook('prompt', { sessionID: 'child', messageID: 'one', prompt: { text: 'Child input' } });
    await fixture.hook('compaction', { sessionID: 'child', messages: [] });
    expect(fixture.callTool.mock.calls[0]?.[1]).toMatchObject({ operation: 'enroll', root_session_key: 'root' });
    expect(fixture.callTool).toHaveBeenCalledTimes(1);
    await cleanup();
  });
  it('contains MCP error envelopes, rejections and slow calls with one bounded diagnostic and no prompt mutation', async () => {
    const fixture = lifecycleFixture();
    vi.mocked(fixture.context.session.get).mockResolvedValue({ id: 'root' } as Awaited<ReturnType<typeof fixture.context.session.get>>);
    fixture.callTool.mockResolvedValueOnce({ isError: true, content: [{ type: 'text', text: 'private failure' }] });
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cleanup = await fixture.setup();
    try {
      const prompt = { sessionID: 'root', messageID: 'one', prompt: { text: 'First' } };
      await expect(fixture.hook('prompt', prompt)).resolves.toBeUndefined();
      expect(diagnostic).toHaveBeenCalledTimes(1);
      fixture.callTool.mockRejectedValueOnce(new Error('private database path'));
      await expect(fixture.hook('prompt', { ...prompt, messageID: 'two' })).resolves.toBeUndefined();
      vi.useFakeTimers();
      fixture.callTool.mockImplementationOnce(async () => new Promise(() => undefined));
      const slow = fixture.hook('prompt', { ...prompt, messageID: 'three' });
      await vi.advanceTimersByTimeAsync(1_500);
      await expect(slow).resolves.toBeUndefined();
      expect(fixture.callTool.mock.calls[2]?.[2]?.aborted).toBe(true);
      expect(prompt.prompt.text).toBe('First');
      expect(diagnostic).toHaveBeenCalledExactlyOnceWith('[thoth-mem] OpenCode bridge degraded: lifecycle_request_failed_or_timed_out');
    } finally { vi.useRealTimers(); await cleanup(); diagnostic.mockRestore(); }
  });
  it('enrolls only root creates and cleanup aborts the subscription and closes the shared child', async () => {
    const fixture = lifecycleFixture();
    const cleanup = await fixture.setup();
    fixture.emit('session.created', { sessionID: 'root' });
    await vi.waitFor(() => expect(fixture.callTool).toHaveBeenCalledTimes(1));
    expect(fixture.callTool.mock.calls[0]).toEqual(['mem_session', expect.objectContaining({
      operation: 'enroll', harness: 'opencode', root_session_key: 'root', project_key: expect.any(String),
    }), expect.any(AbortSignal)]);
    fixture.emit('session.created', { sessionID: 'child', parentID: 'root' });
    await cleanup();
    expect(fixture.signal()?.aborted).toBe(true);
    expect(fixture.close).toHaveBeenCalledTimes(1);
    expect(fixture.callTool).toHaveBeenCalledTimes(1);
    expect(fixture.context.event.subscribe).toHaveBeenCalledWith({
      types: ['session.created', 'session.deleted', 'session.compaction.ended'], signal: expect.any(AbortSignal),
    });
  });
  it('captures distinct sanitized root inputs without mutating prompts, and ignores delegated hooks', async () => {
    const fixture = lifecycleFixture();
    vi.mocked(fixture.context.session.get).mockImplementation(async ({ sessionID }) => ({
      id: sessionID, ...(sessionID === 'child' ? { parentID: 'root' } : {}),
    }) as Awaited<ReturnType<typeof fixture.context.session.get>>);
    const cleanup = await fixture.setup();
    const prompt = { sessionID: 'root', messageID: 'message-1', prompt: { text: 'Keep <private>secret</private>safe' } };
    const original = structuredClone(prompt);
    await fixture.hook('prompt', prompt);
    await fixture.hook('prompt', { ...prompt, prompt: { text: 'Keep <private>rotated</private>safe' } });
    await fixture.hook('prompt', { ...prompt, prompt: { text: 'Second steer' } });
    await fixture.hook('prompt', { ...prompt, sessionID: 'child' });
    await fixture.hook('compaction', { sessionID: 'child', messages: [] });
    expect(prompt).toEqual(original);
    expect(fixture.callTool.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ operation: 'capture_root', root_session_key: 'root', content: 'Keep safe' }),
      expect.objectContaining({ operation: 'capture_root', root_session_key: 'root', content: 'Second steer' }),
    ]);
    expect(fixture.context.session.get).toHaveBeenCalledTimes(3); // root, child, child's root
    await cleanup();
  });

  it('checkpoints sanitized request text without replacing compaction and guides by event id before finalizing once', async () => {
    const fixture = lifecycleFixture();
    vi.mocked(fixture.context.session.get).mockResolvedValue({ id: 'root' } as Awaited<ReturnType<typeof fixture.context.session.get>>);
    const cleanup = await fixture.setup();
    const compaction = { sessionID: 'root', messages: [
      { role: 'user', content: [{ type: 'text', text: 'Goal <private>secret</private>safe' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'not root intent' }] },
    ] };
    const original = structuredClone(compaction);
    await fixture.hook('compaction', compaction);
    expect(compaction).toEqual(original);
    expect(compaction).not.toHaveProperty('result');
    fixture.emit('session.compaction.ended', { sessionID: 'root', text: '## Goal\nResume <private>secret</private>safely' }, 'compact-1');
    fixture.emit('session.compaction.ended', { sessionID: 'root', text: 'duplicate' }, 'compact-1');
    fixture.emit('session.deleted', { sessionID: 'root' }, 'delete-1');
    fixture.emit('session.deleted', { sessionID: 'root' }, 'delete-2');
    // A final distinct event proves both duplicate deliveries were consumed before cleanup.
    fixture.emit('session.compaction.ended', { sessionID: 'root', text: 'Next summary' }, 'compact-2');
    await vi.waitFor(() => expect(fixture.callTool).toHaveBeenCalledTimes(4));
    await cleanup();
    expect(fixture.callTool.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ operation: 'checkpoint_pre_compact', content: 'Goal safe' }),
      expect.objectContaining({ operation: 'guide_post_compact', content: '## Goal\nResume safely' }),
      expect.objectContaining({ operation: 'finalize' }),
      expect.objectContaining({ operation: 'guide_post_compact', content: 'Next summary' }),
    ]);
    expect(new Set(fixture.callTool.mock.calls.map((call) => call[0]))).toEqual(new Set(['mem_session']));
  });

});

describe('OpenCode V2 cache-stable recovery delivery', () => {
  it('delivers identity despite capture failure, then retries until exactly one verified replacement', async () => {
    const fixture = lifecycleFixture(true);
    vi.mocked(fixture.context.session.get).mockResolvedValue({ id: 'root' } as Awaited<ReturnType<typeof fixture.context.session.get>>);
    const service = new MemoryService({ databasePath: ':memory:' });
    const result = service.lifecycle({ operation: 'recover', harness: 'opencode', project: resolveLocalProjectIdentity(process.cwd()), rootSessionKey: 'root', eventKey: 'recover' });
    service.close();
    fixture.callTool.mockRejectedValue(new Error('unavailable'));
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cleanup = await fixture.setup();
    try {
      const prompt = { sessionID: 'root', messageID: 'one', prompt: { text: 'First' } };
      await fixture.hook('prompt', prompt);
      expect(fixture.entries.get('thoth-mem-recovery')).toBe(identityOnlyRecovery('root', process.cwd()));
      expect(fixture.storage.get('recovery/root')).toEqual({ mode: 'identity' });
      await fixture.hook('prompt', { ...prompt, messageID: 'two' });
      expect(fixture.context.session.instructions.entry.put).toHaveBeenCalledTimes(1);
      fixture.callTool.mockImplementation(async (_name, input) => input.operation === 'recover' ? { structuredContent: { data: result } } : {});
      await fixture.hook('prompt', { ...prompt, messageID: 'three' });
      expect(fixture.entries.get('thoth-mem-recovery')).toBe(result.recovery!.context);
      expect(fixture.storage.get('recovery/root')).toEqual({ mode: 'verified' });
      for (let i = 0; i < 10; i++) await fixture.hook('prompt', { ...prompt, messageID: `next-${i}` });
      fixture.emit('session.compaction.ended', { sessionID: 'root', text: 'Summary' });
      await vi.waitFor(() => expect(fixture.callTool.mock.calls.some((call) => call[1].operation === 'guide_post_compact')).toBe(true));
      await fixture.hook('prompt', { ...prompt, messageID: 'after-compaction' });
      expect(fixture.context.session.instructions.entry.put).toHaveBeenCalledTimes(2);
      expect(fixture.callTool.mock.calls.filter((call) => call[1].operation === 'recover')).toHaveLength(3);
      await cleanup();
      vi.mocked(fixture.context.session.hook).mockClear();
      const restartCleanup = await fixture.setup();
      await fixture.hook('prompt', { ...prompt, messageID: 'resumed' });
      expect(fixture.context.session.instructions.entry.put).toHaveBeenCalledTimes(2);
      expect(fixture.callTool.mock.calls.filter((call) => call[1].operation === 'recover')).toHaveLength(3);
      await restartCleanup();
    } finally { await cleanup(); diagnostic.mockRestore(); }
  });

  it.each(['identity', 'verified'])('does not rewrite a surviving %s entry when storage was lost', async (kind) => {
    const fixture = lifecycleFixture(true);
    vi.mocked(fixture.context.session.get).mockResolvedValue({ id: 'root' } as Awaited<ReturnType<typeof fixture.context.session.get>>);
    fixture.entries.set('thoth-mem-recovery', kind === 'identity' ? identityOnlyRecovery('root', process.cwd())! : 'persisted verified block');
    const cleanup = await fixture.setup();
    try {
      for (let i = 0; i < 3; i++) await fixture.hook('prompt', { sessionID: 'root', messageID: `${i}`, prompt: { text: '' } });
      expect(fixture.context.session.instructions.entry.put).not.toHaveBeenCalled();
      expect(fixture.callTool).not.toHaveBeenCalled();
    } finally { await cleanup(); }
  });

  it('writes no entry or storage for delegated sessions, and removes root state after finalization', async () => {
    const fixture = lifecycleFixture(true);
    vi.mocked(fixture.context.session.get).mockImplementation(async ({ sessionID }) => ({ id: sessionID, ...(sessionID === 'child' ? { parentID: 'root' } : {}) }) as Awaited<ReturnType<typeof fixture.context.session.get>>);
    const cleanup = await fixture.setup();
    try {
      await fixture.hook('prompt', { sessionID: 'child', messageID: 'one', prompt: { text: 'Delegated' } });
      fixture.emit('session.deleted', { sessionID: 'child' });
      fixture.emit('session.created', { sessionID: 'root' });
      await vi.waitFor(() => expect(fixture.callTool).toHaveBeenCalledTimes(1));
      expect(fixture.context.storage.get).not.toHaveBeenCalled();
      expect(fixture.context.storage.set).not.toHaveBeenCalled();
      expect(fixture.context.storage.remove).not.toHaveBeenCalled();
      expect(fixture.context.session.instructions.entry.put).not.toHaveBeenCalled();
      fixture.storage.set('recovery/root', { mode: 'verified' });
      fixture.emit('session.deleted', { sessionID: 'root' });
      await vi.waitFor(() => expect(fixture.context.storage.remove).toHaveBeenCalledWith('recovery/root'));
      expect(fixture.storage.size).toBe(0);
      expect(fixture.callTool.mock.calls.at(-1)?.[1].operation).toBe('finalize');
    } finally { await cleanup(); }
  });

  it('bounds a hanging capture and recovery, delivers identity and ignores late child results', async () => {
    const fixture = lifecycleFixture(true);
    vi.mocked(fixture.context.session.get).mockResolvedValue({ id: 'root' } as Awaited<ReturnType<typeof fixture.context.session.get>>);
    const releases: ((result: Record<string, unknown>) => void)[] = [];
    fixture.callTool.mockImplementation(async () => new Promise((resolve) => releases.push(resolve)));
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cleanup = await fixture.setup();
    vi.useFakeTimers();
    try {
      const pending = fixture.hook('prompt', { sessionID: 'root', messageID: 'one', prompt: { text: 'First' } });
      await vi.advanceTimersByTimeAsync(3_000);
      await expect(pending).resolves.toBeUndefined();
      expect(fixture.callTool).toHaveBeenCalledTimes(2);
      expect(fixture.callTool.mock.calls.every((call) => call[2]?.aborted)).toBe(true);
      expect(fixture.entries.get('thoth-mem-recovery')).toBe(identityOnlyRecovery('root', process.cwd()));
      expect(fixture.storage.get('recovery/root')).toEqual({ mode: 'identity' });
      for (const release of releases) release({});
      await vi.advanceTimersByTimeAsync(0);
      expect(fixture.context.session.instructions.entry.put).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); await cleanup(); diagnostic.mockRestore(); }
  });

  it('does not deliver or resurrect storage when deletion overtakes pending recovery', async () => {
    const fixture = lifecycleFixture(true);
    vi.mocked(fixture.context.session.get).mockResolvedValue({ id: 'root' } as Awaited<ReturnType<typeof fixture.context.session.get>>);
    let release!: () => void;
    fixture.callTool.mockImplementation(async (_name, input) => input.operation === 'recover' ? new Promise((resolve) => { release = () => resolve({}); }) : {});
    const cleanup = await fixture.setup();
    try {
      const pending = fixture.hook('prompt', { sessionID: 'root', messageID: 'one', prompt: { text: '' } });
      await vi.waitFor(() => expect(fixture.callTool).toHaveBeenCalledTimes(1));
      fixture.emit('session.deleted', { sessionID: 'root' });
      await vi.waitFor(() => expect(fixture.context.storage.remove).toHaveBeenCalledWith('recovery/root'));
      release();
      await pending;
      expect(fixture.context.session.instructions.entry.put).not.toHaveBeenCalled();
      expect(fixture.storage.size).toBe(0);
    } finally { await cleanup(); }
  });

  it('cleans delivery storage even when finalization times out', async () => {
    const fixture = lifecycleFixture(true);
    fixture.storage.set('recovery/root', { mode: 'verified' });
    vi.mocked(fixture.context.session.get).mockResolvedValue({ id: 'root' } as Awaited<ReturnType<typeof fixture.context.session.get>>);
    fixture.callTool.mockImplementation(async () => new Promise(() => undefined));
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cleanup = await fixture.setup();
    vi.useFakeTimers();
    try {
      fixture.emit('session.deleted', { sessionID: 'root' });
      await vi.advanceTimersByTimeAsync(1_500);
      expect(fixture.context.storage.remove).toHaveBeenCalledWith('recovery/root');
      expect(fixture.storage.size).toBe(0);
    } finally { vi.useRealTimers(); await cleanup(); diagnostic.mockRestore(); }
  });

  it('never starts another write after a host put times out with unknown admission', async () => {
    const fixture = lifecycleFixture(true);
    vi.mocked(fixture.context.session.get).mockResolvedValue({ id: 'root' } as Awaited<ReturnType<typeof fixture.context.session.get>>);
    vi.mocked(fixture.context.session.instructions.entry.put).mockImplementation(async () => new Promise(() => undefined));
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cleanup = await fixture.setup();
    vi.useFakeTimers();
    try {
      const prompt = { sessionID: 'root', messageID: 'one', prompt: { text: '' } };
      const first = fixture.hook('prompt', prompt);
      await vi.advanceTimersByTimeAsync(1_500);
      await first;
      const next = fixture.hook('prompt', prompt);
      await vi.advanceTimersByTimeAsync(1_500);
      await next;
      expect(fixture.context.session.instructions.entry.put).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); await cleanup(); diagnostic.mockRestore(); }
  });

  it('coalesces simultaneous root delivery and never rewrites identity while recovery remains invalid', async () => {
    const fixture = lifecycleFixture(true);
    vi.mocked(fixture.context.session.get).mockResolvedValue({ id: 'root' } as Awaited<ReturnType<typeof fixture.context.session.get>>);
    fixture.callTool.mockResolvedValue({ structuredContent: { data: { recovery: { context: 'untrusted' } } } });
    const cleanup = await fixture.setup();
    try {
      await Promise.all(Array.from({ length: 4 }, (_, i) => fixture.hook('prompt', { sessionID: 'root', messageID: `${i}`, prompt: { text: '' } })));
      expect(fixture.context.session.instructions.entry.put).toHaveBeenCalledTimes(1);
      expect(fixture.storage.get('recovery/root')).toEqual({ mode: 'identity' });
      await fixture.hook('prompt', { sessionID: 'root', messageID: 'next', prompt: { text: '' } });
      expect(fixture.context.session.instructions.entry.put).toHaveBeenCalledTimes(1);
      expect(fixture.entries.get('thoth-mem-recovery')).toBe(identityOnlyRecovery('root', process.cwd()));
    } finally { await cleanup(); }
  });

  it('awaits the verified instruction entry on the first root prompt without mutating it', async () => {
    const fixture = lifecycleFixture(true);
    vi.mocked(fixture.context.session.get).mockResolvedValue({ id: 'root' } as Awaited<ReturnType<typeof fixture.context.session.get>>);
    const service = new MemoryService({ databasePath: ':memory:' });
    const result = service.lifecycle({ operation: 'recover', harness: 'opencode', project: resolveLocalProjectIdentity(process.cwd()), rootSessionKey: 'root', eventKey: 'recover' });
    service.close();
    fixture.callTool.mockImplementation(async (_name, input) => input.operation === 'recover' ? { structuredContent: { data: result } } : {});
    let release!: () => void;
    vi.mocked(fixture.context.session.instructions.entry.put).mockImplementation(async () => new Promise<void>((resolve) => { release = resolve; }));
    const cleanup = await fixture.setup();
    try {
      const prompt = { sessionID: 'root', messageID: 'one', prompt: { text: 'First request' } };
      const original = structuredClone(prompt);
      let finished = false;
      const pending = fixture.hook('prompt', prompt).then(() => { finished = true; });
      await vi.waitFor(() => expect(fixture.context.session.instructions.entry.put).toHaveBeenCalledTimes(1));
      expect(finished).toBe(false);
      expect(fixture.storage.size).toBe(0);
      expect(fixture.context.session.instructions.entry.put).toHaveBeenCalledWith({ sessionID: 'root', key: 'thoth-mem-recovery', value: result.recovery!.context });
      release();
      await pending;
      expect(fixture.storage.get('recovery/root')).toEqual({ mode: 'verified' });
      expect(fixture.callTool.mock.calls.map((call) => call[1].operation)).toEqual(['capture_root', 'recover']);
      expect(prompt).toEqual(original);
      expect(vi.mocked(fixture.context.session.hook).mock.calls.map(([kind]) => kind)).toEqual(['prompt', 'compaction']);
    } finally { await cleanup(); }
  });
});
