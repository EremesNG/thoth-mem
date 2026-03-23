#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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

function parseArgs(argv: string[]): { profiles: string[]; dataDir?: string } {
  const args = argv.slice(2);
  let profiles = ['agent', 'admin'];
  let dataDir: string | undefined;

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
    }
  }

  return { profiles, dataDir };
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
  const { profiles, dataDir } = parseArgs(argv);

  const { server, store } = createServer({ profiles, dataDir });

  const transport = new StdioServerTransport();

  const shutdown = () => {
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.stderr.write(`thoth-mem MCP server started (tools: ${profiles.join(', ')})\n`);

  await server.connect(transport);
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
