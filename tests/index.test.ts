import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bridgeStart: vi.fn(),
  bridgeStop: vi.fn(),
  connect: vi.fn(),
  createHttpBridge: vi.fn(),
  createServer: vi.fn(),
  processSemanticJobs: vi.fn(),
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
import { registerMemRecall } from '../src/tools/mem-recall.js';
import { Store } from '../src/store/index.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('index entrypoint execution', () => {
  const originalArgv = process.argv;

  async function importIndexWithEntrypointMocks(options: {
    importKey: 'symlink' | 'missing';
    argv: string[];
    modulePath: string;
    resolvedPaths?: Record<string, string>;
    realpaths?: Record<string, string>;
    missingPaths?: string[];
  }): Promise<ReturnType<typeof vi.fn>> {
    const runCli = vi.fn().mockResolvedValue(undefined);
    const realpathNative = vi.fn((inputPath: string) => {
      if (options.missingPaths?.includes(inputPath)) {
        const error = new Error(`ENOENT: no such file or directory, realpath '${inputPath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }

      return options.realpaths?.[inputPath] ?? inputPath;
    });

    vi.resetModules();
    vi.doMock('node:path', async () => {
      const actual = await vi.importActual<typeof import('node:path')>('node:path');
      return {
        ...actual,
        resolve: vi.fn((inputPath: string) => {
          if (options.resolvedPaths?.[inputPath]) {
            return options.resolvedPaths[inputPath];
          }

          return actual.resolve(inputPath);
        }),
      };
    });
    vi.doMock('node:url', async () => {
      const actual = await vi.importActual<typeof import('node:url')>('node:url');
      return {
        ...actual,
        fileURLToPath: vi.fn(() => options.modulePath),
      };
    });
    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
      return {
        ...actual,
        realpathSync: Object.assign(realpathNative, {
          native: realpathNative,
        }),
      };
    });
    vi.doMock('../src/cli.js', () => ({ runCli }));

    process.argv = options.argv;
    if (options.importKey === 'symlink') {
      await import('../src/index.js?entrypoint-symlink');
    } else {
      await import('../src/index.js?entrypoint-missing');
    }
    await Promise.resolve();

    return runCli;
  }

  afterEach(() => {
    process.argv = originalArgv;
    vi.resetModules();
    vi.doUnmock('node:path');
    vi.doUnmock('node:url');
    vi.doUnmock('node:fs');
    vi.doUnmock('../src/cli.js');
  });

  it('runs the CLI when argv[1] is a symlinked entrypoint path to the same file', async () => {
    const runCli = await importIndexWithEntrypointMocks({
      importKey: 'symlink',
      argv: ['node', 'C:/nvm4w/nodejs/thoth-mem', 'help'],
      modulePath: 'C:/Users/Eremes/AppData/Roaming/npm/node_modules/thoth-mem/dist/index.js',
      resolvedPaths: {
        'C:/nvm4w/nodejs/thoth-mem': 'C:/nvm4w/nodejs/thoth-mem',
        'C:/Users/Eremes/AppData/Roaming/npm/node_modules/thoth-mem/dist/index.js': 'C:/Users/Eremes/AppData/Roaming/npm/node_modules/thoth-mem/dist/index.js',
      },
      realpaths: {
        'C:/nvm4w/nodejs/thoth-mem': 'C:/Program Files/nodejs/thoth-mem',
        'C:/Users/Eremes/AppData/Roaming/npm/node_modules/thoth-mem/dist/index.js': 'C:/Program Files/nodejs/thoth-mem',
      },
    });

    await vi.waitFor(() => {
      expect(runCli).toHaveBeenCalledWith(['help']);
    });
  });

  it('does not crash or execute when the entrypoint path cannot be resolved', async () => {
    const runCli = await importIndexWithEntrypointMocks({
      importKey: 'missing',
      argv: ['node', 'C:/missing/thoth-mem', 'help'],
      modulePath: 'C:/Users/Eremes/AppData/Roaming/npm/node_modules/thoth-mem/dist/index.js',
      resolvedPaths: {
        'C:/missing/thoth-mem': 'C:/missing/thoth-mem',
        'C:/Users/Eremes/AppData/Roaming/npm/node_modules/thoth-mem/dist/index.js': 'C:/Users/Eremes/AppData/Roaming/npm/node_modules/thoth-mem/dist/index.js',
      },
      missingPaths: ['C:/missing/thoth-mem'],
      realpaths: {
        'C:/Users/Eremes/AppData/Roaming/npm/node_modules/thoth-mem/dist/index.js': 'C:/Program Files/nodejs/thoth-mem',
      },
    });

    expect(runCli).not.toHaveBeenCalled();
  });
});

describe('startMcpServer lifecycle shutdown', () => {
  const processHandlers = new Map<string, (...args: unknown[]) => void>();
  const stdinHandlers = new Map<string, (...args: unknown[]) => void>();
  const stdoutHandlers = new Map<string, (...args: unknown[]) => void>();

  let currentPpid = 4242;
  let orphanCheckCallback: (() => void) | undefined;
  let semanticWorkerCallback: (() => void) | undefined;
  let orphanTimer: NodeJS.Timeout;
  let semanticTimer: NodeJS.Timeout;

  beforeEach(() => {
    processHandlers.clear();
    stdinHandlers.clear();
    stdoutHandlers.clear();
    currentPpid = 4242;
    orphanCheckCallback = undefined;
    semanticWorkerCallback = undefined;
    orphanTimer = { unref: vi.fn() } as unknown as NodeJS.Timeout;
    semanticTimer = { unref: vi.fn() } as unknown as NodeJS.Timeout;

    mocks.connect.mockReset().mockResolvedValue(undefined);
    mocks.processSemanticJobs.mockReset().mockResolvedValue(0);
    mocks.storeClose.mockReset();
    mocks.bridgeStart.mockReset().mockResolvedValue(null);
    mocks.bridgeStop.mockReset().mockResolvedValue(undefined);
    mocks.createServer.mockReset().mockImplementation(() => ({
      server: { connect: mocks.connect },
      store: { close: mocks.storeClose, processSemanticJobs: mocks.processSemanticJobs },
      config: { httpDisabled: false, httpPort: 4545 },
      embeddingProvider: null,
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
    mocks.stdioTransport.mockReset().mockImplementation(function StdioServerTransport() {
      return {};
    });
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
    vi.spyOn(global, 'setInterval').mockImplementation(((callback: () => void, delay?: number) => {
      if (delay === 30_000) {
        orphanCheckCallback = callback;
        return orphanTimer;
      }

      if (delay === 2_000) {
        semanticWorkerCallback = callback;
        return semanticTimer;
      }

      throw new Error(`Unexpected interval delay: ${String(delay)}`);
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
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 2_000);
    expect((orphanTimer.unref as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((semanticTimer.unref as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect(mocks.processSemanticJobs).toHaveBeenCalledWith({ limit: 25, embeddingProvider: null });

    stdinHandlers.get('end')?.();

    await vi.waitFor(() => {
      expect(mocks.bridgeStop).toHaveBeenCalledOnce();
      expect(mocks.storeClose).toHaveBeenCalledOnce();
      expect(clearInterval).toHaveBeenCalledWith(orphanTimer);
      expect(clearInterval).toHaveBeenCalledWith(semanticTimer);
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

  it('runs semantic background batches periodically without overlapping', async () => {
    let finishInitialBatch: (value: number) => void = () => {};
    const initialBatch = new Promise<number>((resolve) => {
      finishInitialBatch = resolve;
    });
    mocks.processSemanticJobs.mockReturnValueOnce(initialBatch).mockResolvedValue(0);

    await startMcpServer(['node', 'thoth-mem', 'mcp']);

    expect(mocks.processSemanticJobs).toHaveBeenCalledTimes(1);
    semanticWorkerCallback?.();
    expect(mocks.processSemanticJobs).toHaveBeenCalledTimes(1);

    finishInitialBatch(1);
    await initialBatch;
    await Promise.resolve();
    await Promise.resolve();

    semanticWorkerCallback?.();
    expect(mocks.processSemanticJobs).toHaveBeenCalledTimes(2);
    expect(mocks.processSemanticJobs).toHaveBeenLastCalledWith({ limit: 25, embeddingProvider: null });
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

describe('mem_recall tool registration', () => {
  it('mem_recall registers and returns additive retrieval metadata', async () => {
    const store = new Store(':memory:');
    store.saveObservation({ title: 'Recallable', content: 'recall marker', project: 'recall-project' });
    let handler: ((input: any) => Promise<any>) | undefined;
    const server = {
      tool: vi.fn((name: string, _description: string, _schema: unknown, candidate: (input: any) => Promise<any>) => {
        if (name === 'mem_recall') {
          handler = candidate;
        }
      }),
    } as unknown as McpServer;

    registerMemRecall(server, store);
    const result = await handler?.({ query: 'recall marker', project: 'recall-project', limit: 3 });

    expect(result?.isError).not.toBe(true);
    expect(result?.content[0].text).toContain('Recall query: recall marker');
    expect(result?.content[0].text).toContain('pending:');
    expect(result?.content[0].text).toContain('degraded_fallback:');
    store.close();
  });
});
