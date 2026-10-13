import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadRuntimeConfig } from './config/runtime.js';
import { MemoryService } from './memory-core/service.js';
import { registerTools } from './tools/index.js';
import { VERSION } from './version.js';

export interface ServerOptions { dataDir?: string; databasePath?: string }

export const SERVER_INSTRUCTIONS = [
  'Persistent project memory for coding agents.',
  'At the start of non-trivial repository work, recall with task key terms before exploring, unprompted.',
  'Expand only selected records. Skip memory for trivial or conversational turns.',
  'Save verified decisions, root causes, failed approaches, and non-obvious conventions immediately, unprompted.',
  'When a recovered handoff\'s pending action is done, save its outcome under the same topic_key.',
  'Save one handoff before meaningful work ends if continuation helps.',
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
