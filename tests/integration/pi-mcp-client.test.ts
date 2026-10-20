import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createPiMcpClient, type PiMcpConnection } from '../../src/integration/pi/mcp-client.js';

describe('Pi MCP client', () => {
  it('marks its native MCP child as Pi even when the inherited environment names another host', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-pi-child-marker-'));
    const runtimeEntry = join(root, 'runtime.mjs');
    writeFileSync(runtimeEntry, `
import { createInterface } from 'node:readline';
const lines = createInterface({ input: process.stdin });
lines.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  const result = request.method === 'initialize'
    ? { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
    : { content: [{ type: 'text', text: process.env.THOTH_MEM_NATIVE_HOST ?? 'missing' }] };
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');
});
`);
    const client = createPiMcpClient({ runtimeEntry, env: { ...process.env, THOTH_MEM_NATIVE_HOST: 'codex' } });
    try {
      await expect(client.callTool('mem_project', { action: 'list' })).resolves.toMatchObject({ content: [{ type: 'text', text: 'pi' }] });
    } finally { await client.close(); rmSync(root, { recursive: true, force: true }); }
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
