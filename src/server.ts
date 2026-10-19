import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadRuntimeConfig } from './config/runtime.js';
import { MemoryService } from './memory-core/service.js';
import { MCP_CONNECTION_SESSION_PREFIX, MEMORY_INSTRUCTION_SENTENCES, registerTools } from './tools/index.js';
import { VERSION } from './version.js';

export interface ServerOptions { dataDir?: string; databasePath?: string }

export const SERVER_INSTRUCTIONS = MEMORY_INSTRUCTION_SENTENCES.join(' ');

export function createServer(options: ServerOptions = {}): { server: McpServer; service: MemoryService; databasePath: string; finalizeConnectionSessions: () => void } {
  const dataDir = loadRuntimeConfig({ ...(options.dataDir ? { explicitDataDir: options.dataDir } : {}) }).dataDir;
  mkdirSync(dataDir, { recursive: true });
  const databasePath = options.databasePath ?? join(dataDir, 'memory.sqlite');
  const service = new MemoryService({ databasePath });
  const server = new McpServer({ name: 'thoth-mem', version: VERSION }, { instructions: SERVER_INSTRUCTIONS });
  // Launch metadata affects attribution only; it never supplies root authority.
  const nativeHost = ['opencode', 'codex', 'claude', 'pi'].includes(process.env.THOTH_MEM_NATIVE_HOST?.trim() ?? '');
  let nativeClient: boolean | undefined;
  let rootSessionKey: string | undefined;
  let finalized = false;
  const finalizeConnectionSessions = (): void => {
    if (finalized) return;
    finalized = true;
    if (!rootSessionKey) return;
    const errors: unknown[] = [];
    for (const project of service.listProjects()) {
      try {
        const ownsSession = service.adoption(project.key).sessions.perSession.some((session) => session.harness === 'mcp' && session.rootSessionKey === rootSessionKey);
        if (!ownsSession) continue;
        service.lifecycle({ operation: 'finalize', project: { key: project.key, name: project.name }, rootSessionKey, harness: 'mcp', eventKey: 'mcp-connection:finalize' });
      } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Could not finalize all MCP connection sessions');
  };
  server.server.onclose = finalizeConnectionSessions;
  registerTools(server, service, {
    connectionSession: () => {
      if (finalized) throw new Error('MCP connection is closed');
      nativeClient ??= nativeHost || server.server.getClientVersion()?.name === 'thoth-mem-pi';
      return nativeClient ? undefined : { rootSessionKey: rootSessionKey ??= `${MCP_CONNECTION_SESSION_PREFIX}${randomUUID()}`, harness: 'mcp' };
    },
  });
  return { server, service, databasePath, finalizeConnectionSessions };
}
