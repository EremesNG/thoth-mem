import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadRuntimeConfig } from './config/runtime.js';
import { MemoryService } from './memory-core/service.js';
import { registerTools } from './tools/index.js';
import { VERSION } from './version.js';

export interface ServerOptions { dataDir?: string; databasePath?: string }

export function createServer(options: ServerOptions = {}): { server: McpServer; service: MemoryService; databasePath: string } {
  const dataDir = loadRuntimeConfig({ ...(options.dataDir ? { explicitDataDir: options.dataDir } : {}) }).dataDir;
  mkdirSync(dataDir, { recursive: true });
  const databasePath = options.databasePath ?? join(dataDir, 'memory-v2.sqlite');
  const service = new MemoryService({ databasePath });
  const server = new McpServer({ name: 'thoth-mem', version: VERSION }, { instructions: 'SQLite-first durable memory v2. Use compact recall, context expansion, then mem_get.' });
  registerTools(server, service);
  return { server, service, databasePath };
}
