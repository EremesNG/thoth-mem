#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createHttpBridge } from './http-server.js';
import { createServer } from './server.js';

const CLI_SUBCOMMANDS = new Set([
  'search',
  'save',
  'timeline',
  'context',
  'stats',
  'export',
  'import',
  'sync',
  'sync-import',
  'migrate-project',
  'delete-project',
  'rebuild-graph',
  'prune-graph',
  'rebuild-index',
  'maintain-memory',
  'version',
  'help',
]);

const SEMANTIC_WORKER_BATCH_SIZE = 25;
const SEMANTIC_WORKER_INTERVAL_MS = 2_000;

export function parseArgs(argv: string[]): { dataDir?: string; httpDisabled: boolean } {
  const args = argv.slice(2);
  let dataDir: string | undefined;
  let httpDisabled = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === '--data-dir') {
      const nextValue = args[index + 1];
      if (nextValue && !nextValue.startsWith('-')) {
        dataDir = nextValue;
        index++;
      }
    } else if (arg.startsWith('--data-dir=')) {
      dataDir = arg.slice('--data-dir='.length);
    } else if (arg === '--no-http') {
      httpDisabled = true;
    }
  }

  return { dataDir, httpDisabled };
}

export function shouldRunCli(args: string[]): boolean {
  if (args.includes('--help')) {
    return true;
  }

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === '--data-dir' || arg === '-p' || arg === '--project') {
      index++;
      continue;
    }

    if (arg.startsWith('--data-dir=') || arg.startsWith('--project=') || arg.startsWith('--tools=')) {
      continue;
    }

    if (arg.startsWith('-')) {
      continue;
    }

    return arg !== 'mcp';
  }

  return false;
}

export async function startMcpServer(argv: string[]): Promise<void> {
  const { dataDir, httpDisabled } = parseArgs(argv);

  const { server, store, config, embeddingProvider, hydeGenerator, kgLlmExtractor } = createServer({ dataDir });

  if (httpDisabled) {
    config.httpDisabled = true;
  }

  const transport = new StdioServerTransport();
  let httpBridge: ReturnType<typeof createHttpBridge> | null = null;
  let orphanCheck: NodeJS.Timeout | null = null;
  let semanticWorker: NodeJS.Timeout | null = null;
  let semanticWorkerActive = false;
  let isShuttingDown = false;
  const DISCONNECT_CODES = new Set(['EPIPE', 'ERR_STREAM_DESTROYED']);

  const clearOrphanCheck = (): void => {
    if (!orphanCheck) {
      return;
    }

    clearInterval(orphanCheck);
    orphanCheck = null;
  };

  const clearSemanticWorker = (): void => {
    if (!semanticWorker) {
      return;
    }
    clearInterval(semanticWorker);
    semanticWorker = null;
  };

  const runSemanticWorkerBatch = (): void => {
    if (isShuttingDown || semanticWorkerActive) {
      return;
    }

    semanticWorkerActive = true;
    void store.processSemanticJobs({ limit: SEMANTIC_WORKER_BATCH_SIZE, embeddingProvider, kgLlmExtractor })
      .catch((error: unknown) => {
        process.stderr.write(`[thoth-mem] semantic background worker skipped: ${error instanceof Error ? error.message : String(error)}\n`);
      })
      .finally(() => {
        semanticWorkerActive = false;
      });
  };

  const shutdown = async (options: { exit?: boolean } = {}): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    clearOrphanCheck();
    clearSemanticWorker();

    try {
      if (httpBridge) {
        await httpBridge.stop();
      }
    } finally {
      store.close();
    }

    if (options.exit !== false) {
      process.exit(0);
    }
  };

  const requestShutdown = (message: string): void => {
    if (isShuttingDown) {
      return;
    }

    process.stderr.write(`${message}\n`);
    void shutdown();
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
  process.on('exit', () => {
    void shutdown({ exit: false });
  });

  process.stdin.once('end', () => {
    requestShutdown('[thoth-mem] stdin EOF detected, shutting down');
  });
  process.stdin.once('close', () => {
    requestShutdown('[thoth-mem] stdin closed, shutting down');
  });

  const initialPpid = process.ppid;
  orphanCheck = setInterval(() => {
    if (process.ppid === 1 || process.ppid !== initialPpid) {
      requestShutdown(`[thoth-mem] parent process changed from ${initialPpid} to ${process.ppid}, shutting down`);
    }
  }, 30_000);
  orphanCheck.unref();

  process.stdin.once('error', () => {
    void shutdown();
  });
  process.stdout.once('error', (error) => {
    if (error && DISCONNECT_CODES.has((error as NodeJS.ErrnoException).code ?? '')) {
      void shutdown();
    }
  });

  process.stderr.write('thoth-mem MCP server started\n');

  try {
    await server.connect(transport);
    runSemanticWorkerBatch();
    semanticWorker = setInterval(runSemanticWorkerBatch, SEMANTIC_WORKER_INTERVAL_MS);
    semanticWorker.unref();

    if (!config.httpDisabled) {
      httpBridge = createHttpBridge(store, config, { embeddingProvider, hydeGenerator });

      try {
        await httpBridge.start();
      } catch (error) {
        process.stderr.write(`[thoth-http] HTTP bridge failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  } catch (error) {
    await shutdown({ exit: false });
    throw error;
  }
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (shouldRunCli(args)) {
    const { runCli } = await import('./cli.js');
    try {
      await runCli(args);
    } catch {
      process.exit(1);
    }
    return;
  }

  const mcpArgs = args[0] === 'mcp' ? ['node', 'thoth-mem', ...args.slice(1)] : process.argv;
  await startMcpServer(mcpArgs);
}

function isExecutedAsEntryPoint(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  const argvPath = getRealPath(process.argv[1]);
  const modulePath = getRealPath(fileURLToPath(import.meta.url));

  return argvPath !== null && argvPath === modulePath;
}

function getRealPath(filePath: string): string | null {
  try {
    return realpathSync.native(resolve(filePath));
  } catch {
    return null;
  }
}

if (isExecutedAsEntryPoint()) {
  main().catch((err) => {
    process.stderr.write(`Fatal error: ${err}\n`);
    process.exit(1);
  });
}
