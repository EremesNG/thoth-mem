import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadRuntimeConfig } from './config/runtime.js';
import { MemoryService } from './memory-core/service.js';
import { registerTools } from './tools/index.js';
import { VERSION } from './version.js';

export interface ServerOptions { dataDir?: string; databasePath?: string }

const SERVER_INSTRUCTIONS = [
  'Persistent project memory for coding agents.',
  'Recall compactly before acting when prior work may change the task; expand context and fetch only selected records.',
  'Save verified durable decisions, discoveries, failures, conventions, and completed-change lessons at semantic boundaries, and save one continuation handoff before meaningful work ends when future sessions benefit.',
  'Use verified identity for attribution, exclude private, transient, canonical, user-forbidden, and duplicate content, and reserve mem_session for actual root lifecycle events.',
].join(' ');

export function createServer(options: ServerOptions = {}): { server: McpServer; service: MemoryService; databasePath: string } {
  const dataDir = loadRuntimeConfig({ ...(options.dataDir ? { explicitDataDir: options.dataDir } : {}) }).dataDir;
  mkdirSync(dataDir, { recursive: true });
  const databasePath = options.databasePath ?? join(dataDir, 'memory.sqlite');
  const service = new MemoryService({ databasePath });
  const server = new McpServer({ name: 'thoth-mem', version: VERSION }, { instructions: SERVER_INSTRUCTIONS });
  registerTools(server, service);
  return { server, service, databasePath };
}
