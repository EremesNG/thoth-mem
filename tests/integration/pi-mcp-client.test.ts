import { describe, expect, it, vi } from 'vitest';

import { createPiMcpClient, type PiMcpConnection } from '../../src/integration/pi/mcp-client.js';

describe('Pi MCP client', () => {
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
