import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import type { MemoryToolName } from '../../tools/index.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256_000;

export interface PiMcpConnection {
  callTool(name: MemoryToolName, arguments_: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
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

export interface PiMcpClient {
  callTool(name: MemoryToolName, arguments_: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

function defaultRuntimeEntry(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return basename(moduleDirectory) === 'dist'
    ? join(moduleDirectory, 'index.js')
    : resolve(moduleDirectory, '../../../dist/index.js');
}

function boundedError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`thoth-mem Pi bridge failed: ${Array.from(message).slice(0, 300).join('')}`);
}

async function productionConnection(options: PiMcpClientOptions): Promise<PiMcpConnection> {
  const client = new Client({ name: 'thoth-mem-pi', version: '1' });
  const environment = Object.fromEntries(Object.entries(options.env ?? process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const transport = new StdioClientTransport({
    command: options.nodeCommand ?? process.execPath,
    args: [resolve(options.runtimeEntry ?? defaultRuntimeEntry()), 'mcp', '--no-http'],
    env: environment,
    stderr: 'pipe',
  });
  await client.connect(transport);
  return {
    callTool: async (name, arguments_, signal) => client.callTool({ name, arguments: arguments_ }, undefined, { signal }),
    close: async () => client.close(),
  };
}

export function createPiMcpClient(options: PiMcpClientOptions = {}): PiMcpClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error('Pi MCP timeout is invalid');
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 1_000_000) throw new Error('Pi MCP output limit is invalid');
  let connection: PiMcpConnection | undefined;
  let connecting: { generation: number; promise: Promise<PiMcpConnection> } | undefined;
  let generation = 0;
  let closed = false;

  const report = (code: string): void => { try { options.onDiagnostic?.(code); } catch { /* diagnostics cannot own transport state */ } };
  const closeConnection = async (target: PiMcpConnection): Promise<void> => {
    try { await target.close(); } catch { report('pi_mcp_close_failed'); }
  };

  const connect = async (): Promise<PiMcpConnection> => {
    if (closed) throw new Error('Pi MCP client is closed');
    if (connection) return connection;
    if (connecting?.generation === generation) return connecting.promise;
    const attemptGeneration = generation;
    const pending = (options.connect ? options.connect() : productionConnection(options)).then(async (value) => {
      if (closed || generation !== attemptGeneration) {
        await closeConnection(value);
        throw new Error(closed ? 'Pi MCP client is closed' : 'Pi MCP connection attempt is stale');
      }
      connection = value;
      return value;
    });
    const attempt = { generation: attemptGeneration, promise: pending };
    connecting = attempt;
    void pending.finally(() => { if (connecting === attempt) connecting = undefined; }).catch(() => undefined);
    return pending;
  };
  const invalidate = async (target?: PiMcpConnection): Promise<void> => {
    if (target && connection !== target) return;
    generation += 1;
    connecting = undefined;
    const stale = connection;
    connection = undefined;
    if (stale) await closeConnection(stale);
  };
  const timed = async <T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    let abort: (() => void) | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('request timed out')), timeoutMs); }),
        ...(signal ? [new Promise<T>((_resolve, reject) => {
          abort = () => reject(new Error('request aborted'));
          if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
        })] : []),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      if (signal && abort) signal.removeEventListener('abort', abort);
    }
  };

  return {
    async callTool(name, arguments_, signal) {
      let active: PiMcpConnection | undefined;
      try {
        active = await timed(connect(), signal);
        const value = await timed(active.callTool(name, arguments_, signal), signal);
        const serialized = JSON.stringify(value);
        if (Buffer.byteLength(serialized, 'utf8') > maxOutputBytes) throw new Error('response exceeded output limit');
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('response envelope is invalid');
        const record = value as Record<string, unknown>;
        if (record.isError === true) {
          const text = Array.isArray(record.content) && typeof (record.content[0] as { text?: unknown } | undefined)?.text === 'string'
            ? String((record.content[0] as { text: string }).text)
            : 'memory tool returned an error';
          throw new Error(text);
        }
        return record;
      } catch (error) {
        await invalidate(active);
        report('pi_mcp_request_failed');
        throw boundedError(error);
      }
    },
    async close() {
      closed = true;
      generation += 1;
      connecting = undefined;
      await invalidate();
    },
  };
}
