#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Server as HttpServer } from 'node:http';
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
  'version',
  'help',
]);

function parseArgs(argv: string[]): { profiles: string[]; dataDir?: string; httpDisabled: boolean } {
  const args = argv.slice(2);
  let profiles = ['agent', 'admin'];
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
    } else if (arg.startsWith('--tools=')) {
      profiles = arg.slice('--tools='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--data-dir=')) {
      dataDir = arg.slice('--data-dir='.length);
    } else if (arg === '--no-http') {
      httpDisabled = true;
    }
  }

  return { profiles, dataDir, httpDisabled };
}

function shouldRunCli(args: string[]): boolean {
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

async function startMcpServer(argv: string[]): Promise<void> {
  const { profiles, dataDir, httpDisabled } = parseArgs(argv);

  const { server, store, config } = createServer({ profiles, dataDir });

  if (httpDisabled) {
    config.httpDisabled = true;
  }

  const transport = new StdioServerTransport();
  let httpBridge: ReturnType<typeof createHttpBridge> | null = null;
  let httpServer: HttpServer | null = null;
  let isShuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    try {
      if (httpServer && httpBridge) {
        await httpBridge.stop();
      }
    } finally {
      store.close();
    }
  };

  process.on('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on('exit', () => {
    void shutdown();
  });

  process.stderr.write(`thoth-mem MCP server started (tools: ${profiles.join(', ')})\n`);

  try {
    await server.connect(transport);

    if (!config.httpDisabled) {
      httpBridge = createHttpBridge(store, config);
      httpServer = await httpBridge.start();
    }
  } catch (error) {
    await shutdown();
    throw error;
  }
}

async function main(): Promise<void> {
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

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
