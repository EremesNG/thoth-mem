import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bridgeStart: vi.fn(),
  bridgeStop: vi.fn(),
  connect: vi.fn(),
  createHttpBridge: vi.fn(),
  createServer: vi.fn(),
  stderrWrite: vi.fn(),
  stdioTransport: vi.fn(),
  storeClose: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: mocks.stdioTransport,
}));

vi.mock('../src/http-server.js', () => ({
  createHttpBridge: mocks.createHttpBridge,
}));

vi.mock('../src/server.js', () => ({
  createServer: mocks.createServer,
}));

import { startMcpServer } from '../src/index.js';

describe('startMcpServer lifecycle shutdown', () => {
  const processHandlers = new Map<string, (...args: unknown[]) => void>();
  const stdinHandlers = new Map<string, (...args: unknown[]) => void>();
  const stdoutHandlers = new Map<string, (...args: unknown[]) => void>();

  let currentPpid = 4242;
  let orphanCheckCallback: (() => void) | undefined;
  let orphanTimer: NodeJS.Timeout;

  beforeEach(() => {
    processHandlers.clear();
    stdinHandlers.clear();
    stdoutHandlers.clear();
    currentPpid = 4242;
    orphanCheckCallback = undefined;
    orphanTimer = { unref: vi.fn() } as unknown as NodeJS.Timeout;

    mocks.connect.mockReset().mockResolvedValue(undefined);
    mocks.storeClose.mockReset();
    mocks.bridgeStart.mockReset().mockResolvedValue(null);
    mocks.bridgeStop.mockReset().mockResolvedValue(undefined);
    mocks.createServer.mockReset().mockImplementation(() => ({
      server: { connect: mocks.connect },
      store: { close: mocks.storeClose },
      config: { httpDisabled: false, httpPort: 4545 },
    }));
    mocks.createHttpBridge.mockReset().mockImplementation(() => ({
      start: mocks.bridgeStart,
      stop: mocks.bridgeStop,
      get isOwner() {
        return true;
      },
      get isRunning() {
        return true;
      },
    }));
    mocks.stdioTransport.mockReset().mockImplementation(() => ({}));
    mocks.stderrWrite.mockReset();

    vi.spyOn(process, 'on').mockImplementation(((event: string, listener: (...args: unknown[]) => void) => {
      processHandlers.set(event, listener);
      return process;
    }) as typeof process.on);
    vi.spyOn(process.stdin, 'once').mockImplementation(((event: string, listener: (...args: unknown[]) => void) => {
      stdinHandlers.set(event, listener);
      return process.stdin;
    }) as typeof process.stdin.once);
    vi.spyOn(process.stdout, 'once').mockImplementation(((event: string, listener: (...args: unknown[]) => void) => {
      stdoutHandlers.set(event, listener);
      return process.stdout;
    }) as typeof process.stdout.once);
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      mocks.stderrWrite(String(chunk));
      return true;
    }) as typeof process.stderr.write);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => code as never) as typeof process.exit);
    vi.spyOn(process, 'ppid', 'get').mockImplementation(() => currentPpid);
    vi.spyOn(global, 'setInterval').mockImplementation(((callback: () => void) => {
      orphanCheckCallback = callback;
      return orphanTimer;
    }) as typeof setInterval);
    vi.spyOn(global, 'clearInterval').mockImplementation((() => undefined) as typeof clearInterval);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shuts down on stdin EOF, clears orphan monitor, and exits', async () => {
    await startMcpServer(['node', 'thoth-mem', 'mcp']);

    expect(stdinHandlers.has('end')).toBe(true);
    expect(stdinHandlers.has('close')).toBe(true);
    expect(stdinHandlers.has('error')).toBe(true);
    expect(processHandlers.has('SIGINT')).toBe(true);
    expect(processHandlers.has('SIGTERM')).toBe(true);
    expect(processHandlers.has('exit')).toBe(true);
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 30_000);
    expect((orphanTimer.unref as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();

    stdinHandlers.get('end')?.();

    await vi.waitFor(() => {
      expect(mocks.bridgeStop).toHaveBeenCalledOnce();
      expect(mocks.storeClose).toHaveBeenCalledOnce();
      expect(clearInterval).toHaveBeenCalledWith(orphanTimer);
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    expect(mocks.stderrWrite).toHaveBeenCalledWith('[thoth-mem] stdin EOF detected, shutting down\n');
  });

  it('shuts down when the parent process changes', async () => {
    await startMcpServer(['node', 'thoth-mem', 'mcp']);

    currentPpid = 1;
    orphanCheckCallback?.();

    await vi.waitFor(() => {
      expect(mocks.bridgeStop).toHaveBeenCalledOnce();
      expect(mocks.storeClose).toHaveBeenCalledOnce();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    expect(mocks.stderrWrite).toHaveBeenCalledWith('[thoth-mem] parent process changed from 4242 to 1, shutting down\n');
  });

  it('shuts down on disconnect-related stdout errors but ignores other codes', async () => {
    await startMcpServer(['node', 'thoth-mem', 'mcp']);

    stdoutHandlers.get('error')?.({ code: 'ECONNRESET' });

    expect(mocks.bridgeStop).not.toHaveBeenCalled();
    expect(mocks.storeClose).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();

    stdoutHandlers.get('error')?.({ code: 'EPIPE' });

    await vi.waitFor(() => {
      expect(mocks.bridgeStop).toHaveBeenCalledOnce();
      expect(mocks.storeClose).toHaveBeenCalledOnce();
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });
});
