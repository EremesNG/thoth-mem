import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMcpChildClient, McpChildStartupTimeoutError, type McpChildClient, type McpChildConnection } from '../mcp-child-client.js';

export type PiMcpConnection = McpChildConnection;
export type PiMcpClient = McpChildClient;

export class PiMcpStartupTimeoutError extends McpChildStartupTimeoutError {
  constructor(message = 'memory server startup timed out') {
    super(message);
    this.name = 'PiMcpStartupTimeoutError';
  }
}

export interface PiMcpClientOptions {
  runtimeEntry?: string;
  nodeCommand?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
  connect?: () => Promise<PiMcpConnection>;
  onDiagnostic?: (code: string) => void;
}

function defaultRuntimeEntry(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return basename(moduleDirectory) === 'dist'
    ? join(moduleDirectory, 'index.js')
    : resolve(moduleDirectory, '../../../dist/index.js');
}

export function createPiMcpClient(options: PiMcpClientOptions = {}): PiMcpClient {
  return createMcpChildClient({
    ...options,
    command: options.nodeCommand ?? process.execPath,
    args: [resolve(options.runtimeEntry ?? defaultRuntimeEntry()), 'mcp', '--no-http'],
    clientIdentity: { name: 'thoth-mem-pi', version: '1' },
    nativeHost: 'pi',
    label: 'Pi MCP',
    errorPrefix: 'thoth-mem Pi bridge failed',
    diagnosticPrefix: 'pi_mcp',
    startupTimeoutError: (message) => new PiMcpStartupTimeoutError(message),
  });
}
