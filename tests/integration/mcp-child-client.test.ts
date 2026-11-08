import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';

import { createMcpChildClient, type McpChildConnection as PiMcpConnection } from '../../src/integration/mcp-child-client.js';

const createPiMcpClient = (options: { connect?: () => Promise<PiMcpConnection>; timeoutMs?: number; maxOutputBytes?: number; onDiagnostic?: (code: string) => void } = {}) => createMcpChildClient({
  command: 'node', args: [], clientIdentity: { name: 'test-host', version: '1' }, nativeHost: 'test',
  label: 'Pi MCP', errorPrefix: 'thoth-mem Pi bridge failed', diagnosticPrefix: 'pi_mcp', ...options,
});

const isAlive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
};

async function realChildTest(run: (client: ReturnType<typeof createMcpChildClient>, pids: () => Promise<number[]>, shutdownMarker: () => Promise<string>) => Promise<void>, mode = 'hang') {
  const directory = await mkdtemp(join(tmpdir(), 'thoth-mcp-child-'));
  const pidFile = join(directory, 'pids');
  const pids = async (): Promise<number[]> => {
    try { return (await readFile(pidFile, 'utf8')).trim().split('\n').filter(Boolean).map(Number); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  };
  const client = createMcpChildClient({
    command: 'node', args: [fileURLToPath(new URL('./fixtures/mcp-child.mjs', import.meta.url))],
    clientIdentity: { name: 'test-host', version: '1' }, nativeHost: 'test',
    label: 'test MCP', errorPrefix: 'test bridge failed', diagnosticPrefix: 'test_mcp',
    startupTimeoutMs: 2_000, timeoutMs: 1_000,
    env: { ...process.env, THOTH_TEST_PID_FILE: pidFile, THOTH_TEST_MCP_MODE: mode },
  });
  try { await run(client, pids, () => readFile(`${pidFile}.closed`, 'utf8')); }
  finally {
    await client.close();
    for (const pid of await pids()) {
      if (isAlive(pid)) process.kill(pid, 'SIGKILL');
      await vi.waitFor(() => expect(isAlive(pid)).toBe(false), { timeout: 3_000, interval: 25 });
    }
    await rm(directory, { recursive: true, force: true });
  }
}

async function expectTerminated(pids: number[]) {
  expect(pids.length).toBeGreaterThan(0);
  await vi.waitFor(() => expect(pids.filter(isAlive)).toEqual([]), { timeout: 3_000, interval: 25 });
}

describe('shared owned MCP client', () => {
  it('terminates the real child on startup timeout before retrying', async () => {
    await realChildTest(async (client, pids) => {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        await expect(client.callTool('mem_get', {})).rejects.toMatchObject({ code: 'startup_timeout' });
        expect(await pids()).toHaveLength(attempt);
        await expectTerminated(await pids());
      }
    });
  }, 15_000);

  it.each(['abort', 'close'] as const)('terminates the real child when %s interrupts initialization', async (action) => {
    await realChildTest(async (client, pids) => {
      const controller = new AbortController();
      const pending = client.callTool('mem_get', {}, controller.signal);
      const rejection = expect(pending).rejects.toThrow(action === 'abort' ? /aborted/u : /closed|aborted|connection closed/iu);
      await vi.waitFor(async () => expect(await pids()).toHaveLength(1), { timeout: 1_500, interval: 10 });
      if (action === 'abort') controller.abort();
      else await client.close();
      await rejection;
      await expectTerminated(await pids());
    });
  }, 10_000);

  it('terminates the real child when initialization fails', async () => {
    await realChildTest(async (client, pids) => {
      await expect(client.callTool('mem_get', {})).rejects.toThrow(/protocol version/iu);
      await expectTerminated(await pids());
    }, 'invalid');
  }, 10_000);

  it('lets a standalone process exit naturally after close during initialization', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thoth-mcp-close-'));
    const pidFile = join(directory, 'pids');
    try {
      await promisify(execFile)(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/mcp-close-runner.ts', import.meta.url))], {
        env: { ...process.env, THOTH_TEST_PID_FILE: pidFile, THOTH_TEST_MCP_MODE: 'hang' },
        timeout: 8_000, windowsHide: true,
      });
      await expectTerminated((await readFile(pidFile, 'utf8')).trim().split('\n').map(Number));
    } finally {
      const contents = await readFile(pidFile, 'utf8').catch(() => '');
      for (const pid of contents.trim().split('\n').filter(Boolean).map(Number)) {
        if (isAlive(pid)) process.kill(pid, 'SIGKILL');
        await vi.waitFor(() => expect(isAlive(pid)).toBe(false), { timeout: 3_000, interval: 25 });
      }
      await rm(directory, { recursive: true, force: true });
    }
  }, 15_000);

  it('keeps real successful calls lazy and coalesced and shuts down gracefully', async () => {
    await realChildTest(async (client, pids, shutdownMarker) => {
      expect(await pids()).toEqual([]);
      const values = await Promise.all([client.callTool('mem_get', {}), client.callTool('mem_session', {})]);
      expect(values).toEqual(Array.from({ length: 2 }, () => ({ content: [{ type: 'text', text: 'ok' }] })));
      expect(await pids()).toHaveLength(1);
      await client.close();
      await expectTerminated(await pids());
      expect(await shutdownMarker()).toBe('graceful');
    }, 'healthy');
  }, 10_000);

  it('allows first-install startup to exceed the request deadline while keeping established requests bounded', async () => {
    const close = vi.fn(async () => undefined);
    const client = createMcpChildClient({
      command: 'node', args: [], clientIdentity: { name: 'test-host', version: '1' }, nativeHost: 'test',
      label: 'test MCP', errorPrefix: 'test bridge failed', diagnosticPrefix: 'test_mcp',
      timeoutMs: 10, startupTimeoutMs: 1_000,
      connect: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { callTool: async () => ({ content: [] }), close };
      },
    });
    try { await expect(client.callTool('mem_get', {})).resolves.toEqual({ content: [] }); }
    finally { await client.close(); }
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('shares one lazy connection across concurrent tool and lifecycle calls and owns close', async () => {
    const close = vi.fn(async () => undefined);
    const callTool = vi.fn(async (name: string) => ({ content: [{ type: 'text', text: name }], structuredContent: { name } }));
    const connect = vi.fn(async (): Promise<PiMcpConnection> => ({ callTool, close }));
    const client = createPiMcpClient({ connect });
    await Promise.all([client.callTool('mem_recall', {}), client.callTool('mem_session', {})]);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledTimes(2);
    await client.close();
    expect(close).toHaveBeenCalledTimes(1);
    await expect(client.callTool('mem_get', {})).rejects.toThrow(/closed/u);
  });

  it('bounds time and output and reconnects after a transport failure', async () => {
    const firstClose = vi.fn(async () => undefined);
    const healthy = { callTool: async () => ({ content: [], structuredContent: { ok: true } }), close: vi.fn(async () => undefined) };
    const connect = vi.fn()
      .mockResolvedValueOnce({ callTool: async () => { throw new Error('transport exploded with private detail'); }, close: firstClose })
      .mockResolvedValueOnce(healthy)
      .mockResolvedValueOnce({ callTool: async () => ({ content: [], structuredContent: { text: 'x'.repeat(500) } }), close: vi.fn(async () => undefined) })
      .mockResolvedValueOnce({ callTool: async () => new Promise(() => undefined), close: vi.fn(async () => undefined) });
    const client = createPiMcpClient({ connect, timeoutMs: 10, maxOutputBytes: 256 });
    await expect(client.callTool('mem_get', {})).rejects.toThrow(/Pi bridge failed/u);
    expect(firstClose).toHaveBeenCalledTimes(1);
    await expect(client.callTool('mem_get', {})).resolves.toMatchObject({ structuredContent: { ok: true } });
    await client.close();

    const oversized = createPiMcpClient({ connect, timeoutMs: 10, maxOutputBytes: 256 });
    await expect(oversized.callTool('mem_get', {})).rejects.toThrow(/output limit/u);
    const timed = createPiMcpClient({ connect, timeoutMs: 10, maxOutputBytes: 256 });
    await expect(timed.callTool('mem_get', {})).rejects.toThrow(/timed out/u);
  });

  it('does not launch an abandoned retry while the previous child is still closing', async () => {
    let finishClose!: () => void;
    const close = vi.fn(() => new Promise<void>((resolve) => { finishClose = resolve; }));
    const connect = vi.fn()
      .mockResolvedValueOnce({ callTool: async () => { throw new Error('transport failed'); }, close })
      .mockResolvedValue({ callTool: async () => ({ content: [] }), close: async () => undefined });
    const client = createPiMcpClient({ connect, timeoutMs: 1_000 });
    const failed = expect(client.callTool('mem_get', {})).rejects.toThrow(/transport failed/u);
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    const controller = new AbortController();
    const abandoned = expect(client.callTool('mem_get', {}, controller.signal)).rejects.toThrow(/aborted/u);
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(connect).toHaveBeenCalledTimes(1);
    finishClose();
    await Promise.all([failed, abandoned]);
    expect(connect).toHaveBeenCalledTimes(1);
    await expect(client.callTool('mem_get', {})).resolves.toEqual({ content: [] });
    expect(connect).toHaveBeenCalledTimes(2);
    await client.close();
  });

  it('aborts a bounded request and releases the stale owned connection', async () => {
    const close = vi.fn(async () => undefined);
    const client = createPiMcpClient({ connect: async () => ({ callTool: async () => new Promise(() => undefined), close }), timeoutMs: 1_000 });
    const controller = new AbortController();
    const pending = client.callTool('mem_recall', {}, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/aborted/u);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('bounds launch, protocol, and MCP error failures and reconnects after each', async () => {
    const closeInvalid = vi.fn(async () => undefined);
    const closeMcpError = vi.fn(async () => undefined);
    const healthy = { callTool: async () => ({ content: [], structuredContent: { ok: true } }), close: vi.fn(async () => undefined) };
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error('launch secret'))
      .mockResolvedValueOnce({ callTool: async () => 'invalid envelope', close: closeInvalid })
      .mockResolvedValueOnce({ callTool: async () => ({ isError: true, content: [{ type: 'text', text: 'bounded MCP rejection' }] }), close: closeMcpError })
      .mockResolvedValueOnce(healthy);
    const client = createPiMcpClient({ connect });
    await expect(client.callTool('mem_get', {})).rejects.toThrow(/Pi bridge failed/iu);
    await expect(client.callTool('mem_get', {})).rejects.toThrow(/envelope/iu);
    await expect(client.callTool('mem_get', {})).rejects.toThrow(/bounded MCP rejection/iu);
    await expect(client.callTool('mem_get', {})).resolves.toMatchObject({ structuredContent: { ok: true } });
    expect(connect).toHaveBeenCalledTimes(4);
    expect(closeInvalid).toHaveBeenCalledTimes(1);
    expect(closeMcpError).toHaveBeenCalledTimes(1);
    await client.close();
  });

  it.each(['never resolves', 'resolves late'])('classifies a startup timeout when connect %s', async (outcome) => {
    let resolveConnect!: (connection: PiMcpConnection) => void;
    const diagnostics: string[] = [];
    const close = vi.fn(async () => undefined);
    const client = createPiMcpClient({
      connect: () => new Promise<PiMcpConnection>((resolve) => { resolveConnect = resolve; }),
      timeoutMs: 10,
      onDiagnostic: (code) => diagnostics.push(code),
    });
    try {
      await expect(client.callTool('mem_get', {})).rejects.toMatchObject({
        code: 'startup_timeout',
        message: 'thoth-mem Pi bridge failed: memory server startup timed out',
      });
      expect(diagnostics).toEqual(['pi_mcp_startup_timeout']);
      if (outcome === 'resolves late') {
        resolveConnect({ callTool: async () => ({ content: [] }), close });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(close).toHaveBeenCalledTimes(1);
      }
    } finally { await client.close(); }
  });

  it('keeps request timeouts on an established connection generic', async () => {
    const diagnostics: string[] = [];
    const close = vi.fn(async () => undefined);
    const client = createPiMcpClient({
      connect: async () => ({ callTool: async () => new Promise(() => undefined), close }),
      timeoutMs: 10,
      onDiagnostic: (code) => diagnostics.push(code),
    });
    try {
      const request = client.callTool('mem_get', {});
      await expect(request).rejects.toThrow('thoth-mem Pi bridge failed: request timed out');
      await expect(request).rejects.not.toHaveProperty('code');
      expect(diagnostics).toEqual(['pi_mcp_request_failed']);
      expect(close).toHaveBeenCalledTimes(1);
    } finally { await client.close(); }
  });

  it('closes a connection that arrives after connect timeout and never reuses it', async () => {
    let resolveLate!: (connection: PiMcpConnection) => void;
    const lateClose = vi.fn(async () => undefined);
    const freshClose = vi.fn(async () => undefined);
    const late = new Promise<PiMcpConnection>((resolve) => { resolveLate = resolve; });
    const connect = vi.fn()
      .mockReturnValueOnce(late)
      .mockResolvedValueOnce({ callTool: async () => ({ content: [], structuredContent: { fresh: true } }), close: freshClose });
    const client = createPiMcpClient({ connect, timeoutMs: 10 });
    await expect(client.callTool('mem_get', {})).rejects.toThrow(/timed out/iu);
    resolveLate({ callTool: async () => ({ content: [], structuredContent: { late: true } }), close: lateClose });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lateClose).toHaveBeenCalledTimes(1);
    await expect(client.callTool('mem_get', {})).resolves.toMatchObject({ structuredContent: { fresh: true } });
    expect(connect).toHaveBeenCalledTimes(2);
    await client.close();
    expect(freshClose).toHaveBeenCalledTimes(1);
  });

  it('closes a connection that resolves while the client is closing', async () => {
    let resolvePending!: (connection: PiMcpConnection) => void;
    const ownedClose = vi.fn(async () => undefined);
    const client = createPiMcpClient({ connect: () => new Promise<PiMcpConnection>((resolve) => { resolvePending = resolve; }), timeoutMs: 1_000 });
    const pendingCall = client.callTool('mem_get', {});
    const pendingRejection = expect(pendingCall).rejects.toThrow(/closed/iu);
    await Promise.resolve();
    const closing = client.close();
    const closeOutcome = await Promise.race([
      closing.then(() => 'closed'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 20)),
    ]);
    resolvePending({ callTool: async () => ({ content: [], structuredContent: { stale: true } }), close: ownedClose });
    await closing;
    expect(closeOutcome).toBe('closed');
    await pendingRejection;
    expect(ownedClose).toHaveBeenCalledTimes(1);
  });
});
