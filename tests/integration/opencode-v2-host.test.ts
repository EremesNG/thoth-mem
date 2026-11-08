import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import Database from 'better-sqlite3';
import { expect, test } from 'vitest';

const optedIn = process.env.THOTH_MEM_OPENCODE_HOST_TEST === '1';
const windows = process.platform === 'win32';
const version = optedIn ? spawnSync('opencode', ['--version'], { shell: windows, encoding: 'utf8', timeout: 10_000 }).stdout?.trim() : '';
const stable = /^(?:opencode\s+)?v?(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');
const supported = !!stable && (Number(stable[1]) > 2 || (Number(stable[1]) === 2 && (Number(stable[2]) > 2 || (Number(stable[2]) === 2 && Number(stable[3]) >= 6))));
const names = ['mem_context', 'mem_get', 'mem_project', 'mem_recall', 'mem_save', 'thoth_mem_root_identity'];
type Message = { role: string; content: string | { type: string; text?: string }[] };
type Part = { type: string; text: string; cache_control?: unknown };
type Tool = { name: string; cache_control?: unknown };
type Request = { system: Part[]; messages: Message[]; tools: Tool[]; stream?: boolean };
type Entry = { key: string; value: string };
const text = (message: Message) => typeof message.content === 'string' ? message.content : message.content.map((part) => part.text ?? '').join('');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const escaped = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
async function listen(server: Server): Promise<number> {
  await new Promise<void>((accept) => server.listen(0, '127.0.0.1', accept));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing loopback address');
  return address.port;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept()));
}
async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise<void>((accept) => child.once('exit', () => accept()));
  if (windows && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { timeout: 10_000 });
  else child.kill('SIGTERM');
  await Promise.race([exited, delay(5_000).then(() => { throw new Error('OpenCode failed to stop'); })]);
}

// Opt-in keeps ordinary tests offline and avoids starting an installed host.
test.skipIf(!optedIn || !supported)('OpenCode V2 real-host recovery baseline and cache stability', async () => {
  // Windows' per-user TEMP has the real home as an ancestor; config discovery
  // walks ancestors even when HOME is redirected. Use the system temp instead.
  const temporaryBase = windows ? join(process.env.SystemRoot ?? 'C:\\Windows', 'Temp') : tmpdir();
  const root = await mkdtemp(join(temporaryBase, 'thoth-opencode-v2-'));
  const requests: Request[] = [];
  const submitted: string[] = [];
  const blocked: string[] = [];
  let host: ChildProcess | undefined;
  let logs = '';
  const stub = createServer(async (request, response) => {
    if (request.url?.split('?')[0] !== '/v1/messages') {
      blocked.push(`${request.method} ${request.url}`);
      response.writeHead(503).end();
      return;
    }
    let body = '';
    for await (const chunk of request) body += String(chunk);
    const input = JSON.parse(body) as Request;
    requests.push(input);
    const completion = { id: 'msg_local', type: 'message', role: 'assistant', model: 'stub', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } };
    if (input.stream) {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const event = (type: string, value: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
      event('message_start', { message: completion });
      event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Local response.' } });
      event('content_block_stop', { index: 0 });
      event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } });
      event('message_stop', {});
      response.end();
    } else {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ...completion, content: [{ type: 'text', text: 'Local response.' }], stop_reason: 'end_turn' }));
    }
  });
  stub.on('connect', (request, socket) => {
    blocked.push(`CONNECT ${request.url}`);
    socket.on('error', () => { /* The rejected metadata fetch may reset its socket. */ });
    socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
  });
  try {
    const stubPort = await listen(stub);
    const proxy = `http://127.0.0.1:${stubPort}`;
    const home = join(root, 'home');
    const config = join(root, 'xdg-config', 'opencode');
    const project = join(root, 'project');
    const data = join(root, 'memory');
    for (const directory of [home, config, project, data]) await mkdir(directory, { recursive: true });
    await writeFile(join(project, 'AGENTS.md'), 'Disposable host fixture instructions.');
    await writeFile(join(project, 'fixture.md'), 'Disposable configured instructions.');
    await writeFile(join(config, 'opencode.json'), JSON.stringify({
      instructions: [join(project, 'fixture.md')],
      plugins: [resolve('.')], model: 'local/stub',
      providers: { local: { package: '@opencode/ai/providers/anthropic-compatible', settings: { baseURL: `${proxy}/v1`, apiKey: 'local-test-only' }, models: { stub: { name: 'Offline stub', limit: { context: 128000, output: 1024 } } } } },
      policies: [{ action: 'provider.use', resource: '*', effect: 'deny' }, { action: 'provider.use', resource: 'local', effect: 'allow' }],
      compaction: { auto: false },
    }));
    // Do not forward credentials, host config overrides, or real-home paths.
    const env: NodeJS.ProcessEnv = {};
    for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, {
      HOME: home, USERPROFILE: home, OPENCODE_TEST_HOME: home, HOMEDRIVE: home.slice(0, 2), HOMEPATH: home.slice(2), APPDATA: join(root, 'appdata'), LOCALAPPDATA: join(root, 'localappdata'), ProgramData: join(root, 'programdata'),
      XDG_CONFIG_HOME: join(root, 'xdg-config'), XDG_DATA_HOME: join(root, 'xdg-data'), XDG_CACHE_HOME: join(root, 'xdg-cache'), XDG_STATE_HOME: join(root, 'xdg-state'),
      OPENCODE_DISABLE_MODELS_FETCH: '1', OPENCODE_DISABLE_FILEWATCHER: '1', OPENCODE_DISABLE_FFF: '1',
      OPENCODE_CONFIG_DIR: config, OPENCODE_PASSWORD: 'disposable-host-test', THOTH_MEM_DATA_DIR: data,
      TEMP: root, TMP: root, TMPDIR: root, npm_config_cache: join(root, 'npm-cache'), npm_config_userconfig: join(root, 'npmrc'),
      HTTP_PROXY: proxy, HTTPS_PROXY: proxy, ALL_PROXY: proxy, http_proxy: proxy, https_proxy: proxy, all_proxy: proxy,
      NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
    });
    // Reserve an ephemeral port without fixed machine-wide state.
    const reservation = createServer();
    const hostPort = await listen(reservation);
    await close(reservation);
    let spawnError: Error | undefined;
    const launch = () => {
      logs = '';
      spawnError = undefined;
      host = spawn('opencode', ['serve', '--hostname', '127.0.0.1', '--port', String(hostPort)], { cwd: project, env, shell: windows, stdio: ['ignore', 'pipe', 'pipe'] });
      host.stdout?.on('data', (chunk: Buffer) => { logs = (logs + chunk.toString()).slice(-24000); });
      host.stderr?.on('data', (chunk: Buffer) => { logs = (logs + chunk.toString()).slice(-24000); });
      host.on('error', (error) => { spawnError = error; });
    };
    launch();
    const api = async (path: string, body?: unknown): Promise<unknown> => {
      const response = await fetch(`http://127.0.0.1:${hostPort}/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Basic ${Buffer.from('opencode:disposable-host-test').toString('base64')}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000) });
      const value = await response.text();
      if (!response.ok) throw new Error(`${path}: ${response.status} ${value}`);
      return value ? JSON.parse(value) as unknown : undefined;
    };
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      if (host?.exitCode !== null) throw new Error(`Host exited: ${logs}`);
      try { await api('/session'); ready = true; break; } catch { await delay(200); }
    }
    expect(ready, logs).toBe(true);
    const location = new URLSearchParams({ 'location[directory]': project }).toString();
    const sources = await api(`/config?${location}`) as { path?: string }[];
    for (const source of sources) if (source.path) expect(source.path.startsWith(root), source.path).toBe(true);
    let plugins = await api(`/plugin?${location}`);
    for (let attempt = 0; attempt < 50 && !JSON.stringify(plugins).includes('thoth-mem'); attempt++) {
      await delay(100);
      plugins = await api(`/plugin?${location}`);
    }
    const skills = await api(`/skill?${location}`);
    const plugin = (plugins as { data: { id: string; state: unknown }[] }).data.find((item) => item.id === 'thoth-mem');
    console.log('OpenCode registration', JSON.stringify({ version, plugin, skillRegistered: JSON.stringify(skills).includes('thoth-mem') }));
    expect(plugin?.state).toMatchObject({ status: 'active' });
    expect(JSON.stringify(skills)).toContain('thoth-mem');
    const session = async () => {
      const result = await api('/session', { location: { directory: project }, model: { providerID: 'local', id: 'stub' }, title: 'Local cache check' }) as { data: { id: string } };
      return result.data.id;
    };
    const prompt = async (id: string, value: string) => {
      const before = requests.length;
      submitted.push(value);
      await api(`/session/${id}/prompt`, { text: value });
      for (let attempt = 0; attempt < 150 && requests.length === before; attempt++) await delay(100);
      expect(requests.length, logs).toBeGreaterThan(before);
      let settled = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        const active = await api('/session/active') as { data: Record<string, unknown> };
        if (!active.data[id]) { settled = true; break; }
        await delay(100);
      }
      expect(settled, 'Host session did not settle').toBe(true);
      expect(requests.length).toBe(before + 1);
      return requests[before]!;
    };
    const firstID = await session();
    const first = await prompt(firstID, 'Reply locally with a short acknowledgement.');
    const entries = await api(`/experimental/session/${firstID}/instructions/entries`) as { data: Entry[] };
    const db = new Database(join(data, 'memory.sqlite'), { readonly: true });
    let enrollment: unknown;
    try { enrollment = db.prepare('SELECT harness, root_session_key FROM sessions WHERE root_session_key = ?').get(firstID); } finally { db.close(); }
    const systems = first.system.map((part) => part.text);
    const toolNames = first.tools.map((tool) => tool.name);
    console.log('OpenCode captured baseline', JSON.stringify({ systems: systems.map((value) => ({ bytes: Buffer.byteLength(value), sha256: hash(value) })), recoveryPart: systems.findIndex((value) => value.includes('<context key="thoth-mem-recovery">')), recoveryOffset: systems[2]?.indexOf('<context key="thoth-mem-recovery">'), followingHostPart: systems[3], toolNames, entries: entries.data.map((entry) => ({ key: entry.key, bytes: Buffer.byteLength(entry.value) })), enrollment, blocked }));
    for (const name of names) expect(toolNames).toContain(name);
    expect(toolNames).not.toContain('mem_session');
    expect(enrollment).toMatchObject({ harness: 'opencode', root_session_key: firstID });
    expect(systems).toHaveLength(4);
    expect(first.system[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(first.system.at(-1)!.cache_control).toEqual({ type: 'ephemeral' });
    expect(first.tools.at(-1)!.cache_control).toEqual({ type: 'ephemeral' });
    const entry = entries.data.find((item) => item.key === 'thoth-mem-recovery');
    expect(entry).toBeDefined();
    // STOP here if the host froze its baseline before the awaited prompt hook.
    expect(systems[2], 'AC-5 blocker: recovery is absent from the first frozen baseline').toContain(entry!.value);
    expect(systems[2]!.endsWith(`${entry!.value}\n</context>`)).toBe(true);
    expect(systems[2]!.indexOf('<available_skills>')).toBeLessThan(systems[2]!.indexOf(entry!.value));
    expect(systems[2]!.indexOf('</env>')).toBeLessThan(systems[2]!.indexOf(entry!.value));
    for (const instruction of ['Disposable host fixture instructions.', 'Disposable configured instructions.']) {
      expect(systems[2]).toContain(instruction);
      expect(systems[2]!.indexOf(instruction)).toBeLessThan(systems[2]!.indexOf(entry!.value));
    }
    expect(systems[3]).toContain('When you create a worktree');
    const second = await prompt(firstID, 'Acknowledge this second local message.');
    const other = await prompt(await session(), 'Acknowledge this fresh local session.');
    expect(JSON.stringify(second.system)).toBe(JSON.stringify(first.system));
    expect(JSON.stringify(other.tools)).toBe(JSON.stringify(first.tools));
    expect(JSON.stringify(other.system[0])).toBe(JSON.stringify(first.system[0]));
    expect(JSON.stringify(other.system[1])).toBe(JSON.stringify(first.system[1]));
    expect(other.system[3]).toEqual(first.system[3]);
    for (const request of requests) for (const message of request.messages.filter((item) => item.role === 'user')) expect(text(message)).not.toContain('thoth-mem');

    // A regular file at the data-directory path is a legitimate startup failure.
    // It leaves the configured local runtime intact and never permits npx fallback.
    await stop(host);
    const unavailable = join(root, 'unavailable-memory');
    await writeFile(unavailable, 'This is deliberately not a directory.');
    env.THOTH_MEM_DATA_DIR = unavailable;
    launch();
    ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      try { await api('/session'); ready = true; break; } catch { await delay(200); }
    }
    expect(ready, logs).toBe(true);
    const replacementID = await session();
    const identity = await prompt(replacementID, 'First offline acknowledgement.');
    const identityEntries = await api(`/experimental/session/${replacementID}/instructions/entries`) as { data: Entry[] };
    const identityEntry = identityEntries.data.find((item) => item.key === 'thoth-mem-recovery')!;
    expect(identityEntry.value).toContain('Memory recovery was unavailable; only local identity is shown.');
    expect(identity.system[2]!.text).toContain(identityEntry.value);
    await rm(unavailable);
    await mkdir(unavailable);
    const verified = await prompt(replacementID, 'Second offline acknowledgement.');
    const verifiedEntries = await api(`/experimental/session/${replacementID}/instructions/entries`) as { data: Entry[] };
    const verifiedEntry = verifiedEntries.data.find((item) => item.key === 'thoth-mem-recovery')!;
    expect(verifiedEntry.value).not.toBe(identityEntry.value);
    expect(JSON.stringify(verified.system)).toBe(JSON.stringify(identity.system));
    const updates = verified.messages.slice(identity.messages.length).filter((message) => text(message).startsWith('<system-update>'));
    expect(updates).toHaveLength(1);
    expect(text(updates[0]!)).toContain(escaped(verifiedEntry.value));
    expect(verified.messages.at(-1) && text(verified.messages.at(-1)!)).toBe('Second offline acknowledgement.');
    expect(JSON.stringify(verified.tools)).toBe(JSON.stringify(identity.tools));
    const third = await prompt(replacementID, 'Third offline acknowledgement.');
    expect(JSON.stringify(third.system)).toBe(JSON.stringify(identity.system));
    expect(third.messages.filter((message) => text(message).includes(escaped(verifiedEntry.value)))).toHaveLength(1);
    expect(await api(`/experimental/session/${replacementID}/instructions/entries`)).toEqual(verifiedEntries);
    for (const request of requests) {
      for (const message of request.messages.filter((item) => item.role === 'user')) {
        const value = text(message);
        // Anthropic has no transcript system role: the host lowers durable
        // instruction updates to a distinct user-role <system-update> envelope.
        if (value.startsWith('<system-update>')) continue;
        expect(submitted).toContain(value);
        expect(value).not.toContain('thoth-mem');
      }
    }
    expect(blocked, 'Unexpected network/metadata attempt').toEqual([]);
    console.log('OpenCode cache verification', JSON.stringify({ first: first.system.map((part) => ({ bytes: Buffer.byteLength(part.text), sha256: hash(part.text), cache_control: part.cache_control })), toolHash: hash(JSON.stringify(first.tools)), identity: identity.system.map((part) => ({ bytes: Buffer.byteLength(part.text), sha256: hash(part.text) })), replacementAppended: true, blocked }));
  } finally {
    try { await stop(host); }
    finally {
      try { await close(stub); }
      finally { await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); }
    }
  }
}, 120_000);
