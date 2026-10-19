#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServer } from './server.js';

export { MemoryService } from './memory-core/service.js';
export * from './memory-core/contracts.js';
export { buildFtsQueryPlan } from './memory-core/sqlite/fts.js';
export { createServer } from './server.js';
export { ALL_TOOLS, createToolHandlers } from './tools/index.js';

export function shouldRunCli(args: string[]): boolean {
  const command = args[0];
  return args.includes('--help') || args.includes('-h') || (command !== undefined && !command.startsWith('-') && command !== 'mcp');
}

// Node resolves the main module to its real path, while package-manager shims may pass a linked path.
export function isMainModule(moduleUrl: string, entry: string | undefined): boolean {
  if (!entry) return false;
  try { return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(entry); } catch { return false; }
}

export async function startMcpServer(argv: string[] = process.argv.slice(2)): Promise<void> {
  const dataIndex = argv.findIndex((arg) => arg === '--data-dir');
  const dataDir = dataIndex >= 0 ? argv[dataIndex + 1] : argv.find((arg) => arg.startsWith('--data-dir='))?.slice(11);
  const { server, service, finalizeConnectionSessions } = createServer({ ...(dataDir ? { dataDir } : {}) });
  const transport = new StdioServerTransport();
  let closing: Promise<void> | undefined;
  const shutdown = (): Promise<void> => closing ??= Promise.resolve().then(async () => {
    process.stdin.off('end', stop); process.stdin.off('close', stop);
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
    try { finalizeConnectionSessions(); }
    finally {
      try { await server.close(); }
      finally { service.close(); }
    }
  });
  const stop = (): void => { void shutdown().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }); };
  // SDK 1.29 stdio does not report stdin EOF through transport.onclose.
  process.stdin.once('end', stop); process.stdin.once('close', stop);
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  transport.onclose = stop;
  try { await server.connect(transport); }
  catch (error) { await shutdown(); throw error; }
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (shouldRunCli(args)) { const { runCli } = await import('./cli.js'); process.exitCode = await runCli(args); return; }
  await startMcpServer(args[0] === 'mcp' ? args.slice(1) : args);
}

if (isMainModule(import.meta.url, process.argv[1])) void main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
