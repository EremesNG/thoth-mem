#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServer } from './server.js';

export { MemoryService } from './memory-core/service.js';
export * from './memory-core/contracts.js';
export { createServer } from './server.js';
export { ALL_TOOLS, createToolHandlers } from './tools/index.js';

export function shouldRunCli(args: string[]): boolean {
  const command = args[0];
  return args.includes('--help') || (command !== undefined && !command.startsWith('-') && command !== 'mcp');
}

export async function startMcpServer(argv: string[] = process.argv.slice(2)): Promise<void> {
  const dataIndex = argv.findIndex((arg) => arg === '--data-dir');
  const dataDir = dataIndex >= 0 ? argv[dataIndex + 1] : argv.find((arg) => arg.startsWith('--data-dir='))?.slice(11);
  const { server, service } = createServer({ ...(dataDir ? { dataDir } : {}) });
  const transport = new StdioServerTransport();
  const close = (): void => service.close();
  process.once('SIGINT', close); process.once('SIGTERM', close); process.once('exit', close);
  await server.connect(transport);
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (shouldRunCli(args)) { const { runCli } = await import('./cli.js'); process.exitCode = await runCli(args); return; }
  await startMcpServer(args[0] === 'mcp' ? args.slice(1) : args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
