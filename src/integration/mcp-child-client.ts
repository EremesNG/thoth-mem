import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import type { MemoryToolName } from '../tools/index.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256_000;

export class McpChildStartupTimeoutError extends Error {
  readonly code = 'startup_timeout';

  constructor(message = 'memory server startup timed out') {
    super(message);
    this.name = 'McpChildStartupTimeoutError';
  }
}

export interface McpChildConnection {
  callTool(name: MemoryToolName, arguments_: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
}

export interface McpChildClientOptions {
  command: string;
  args: string[];
  clientIdentity: { name: string; version: string };
  nativeHost: string;
  label: string;
  errorPrefix: string;
  diagnosticPrefix: string;
  startupTimeoutMs?: number;
  startupTimeoutError?: (message?: string) => McpChildStartupTimeoutError;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
  connect?: () => Promise<McpChildConnection>;
  onDiagnostic?: (code: string) => void;
}

export interface McpChildClient {
  callTool(name: MemoryToolName, arguments_: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

function boundedError(error: unknown, options: McpChildClientOptions): Error {
  const message = error instanceof Error ? error.message : String(error);
  const bounded = `${options.errorPrefix}: ${Array.from(message).slice(0, 300).join('')}`;
  if (error instanceof McpChildStartupTimeoutError) {
    return options.startupTimeoutError?.(bounded) ?? new McpChildStartupTimeoutError(bounded);
  }
  return new Error(bounded);
}

async function productionConnection(options: McpChildClientOptions, own: (connection: McpChildConnection) => void): Promise<McpChildConnection> {
  const client = new Client(options.clientIdentity);
  const environment = Object.fromEntries(Object.entries(options.env ?? process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const transport = new StdioClientTransport({
    command: options.command,
    args: options.args,
    env: { ...environment, THOTH_MEM_NATIVE_HOST: options.nativeHost },
    stderr: 'pipe',
  });
  // The SDK also closes after initialization failure. Share its teardown so a
  // retry cannot overtake an in-progress transport close.
  const closeTransport = transport.close.bind(transport);
  let transportClosing: Promise<void> | undefined;
  transport.close = () => transportClosing ??= (async () => {
    // Preserve stdin-EOF shutdown. Windows node.exe launchers (including
    // pnpm's) can own another Node process, so terminate the tree if it hangs,
    // before the SDK's two-second fallback kills the parent and orphans it.
    const pid = transport.pid;
    if (process.platform !== 'win32' || pid === null) return closeTransport();
    let termination: Promise<unknown> | undefined;
    const timer = setTimeout(() => {
      termination = promisify(execFile)('taskkill.exe', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5_000 })
        .catch(() => undefined); // Already-exited children still need SDK stream cleanup.
    }, 1_500);
    try { await closeTransport(); }
    finally { clearTimeout(timer); }
    await termination;
  })();
  const initialization = new AbortController();
  const connection: McpChildConnection = {
    callTool: async (name, arguments_, signal) => client.callTool({ name, arguments: arguments_ }, undefined, { signal }),
    close: async () => {
      initialization.abort();
      await transport.close();
    },
  };
  own(connection);
  await client.connect(transport, { signal: initialization.signal });
  return connection;
}

export function createMcpChildClient(options: McpChildClientOptions): McpChildClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error(`${options.label} timeout is invalid`);
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 1_000_000) throw new Error(`${options.label} output limit is invalid`);
  const startupTimeoutMs = options.startupTimeoutMs ?? timeoutMs;
  if (!Number.isInteger(startupTimeoutMs) || startupTimeoutMs < 1 || startupTimeoutMs > 600_000) throw new Error(`${options.label} startup timeout is invalid`);
  let connection: McpChildConnection | undefined;
  let connecting: { generation: number; promise: Promise<McpChildConnection>; owned?: McpChildConnection } | undefined;
  let disposing: Promise<void> = Promise.resolve();
  let generation = 0;
  let closed = false;

  const report = (code: string): void => { try { options.onDiagnostic?.(code); } catch { /* diagnostics cannot own transport state */ } };
  const closeConnection = async (target: McpChildConnection): Promise<void> => {
    try { await target.close(); } catch { report(`${options.diagnosticPrefix}_close_failed`); }
  };

  const connect = async (expectedGeneration: number): Promise<McpChildConnection> => {
    await disposing;
    if (closed) throw new Error(`${options.label} client is closed`);
    if (expectedGeneration !== generation) throw new Error(`${options.label} connection attempt is stale`);
    if (connection) return connection;
    if (connecting?.generation === generation) return connecting.promise;
    const attemptGeneration = generation;
    let owned: McpChildConnection | undefined;
    const pending = (options.connect ? options.connect() : productionConnection(options, (value) => { owned = value; })).then(async (value) => {
      if (closed || generation !== attemptGeneration) {
        await closeConnection(value);
        throw new Error(closed ? `${options.label} client is closed` : `${options.label} connection attempt is stale`);
      }
      connection = value;
      return value;
    });
    const attempt = { generation: attemptGeneration, promise: pending, owned };
    connecting = attempt;
    // Keep failed attempts owned until invalidation has awaited their teardown.
    void pending.catch(() => undefined);
    return pending;
  };
  const invalidate = async (target?: McpChildConnection, expectedGeneration = generation): Promise<void> => {
    if (expectedGeneration !== generation || (target && connection !== target)) return disposing;
    generation += 1;
    const stale = connection ?? connecting?.owned;
    connecting = undefined;
    connection = undefined;
    disposing = disposing.then(async () => { if (stale) await closeConnection(stale); });
    await disposing;
  };
  const timed = async <T>(operation: Promise<T>, signal?: AbortSignal, timeoutError: Error = new Error('request timed out'), limitMs = timeoutMs): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    let abort: (() => void) | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(timeoutError), limitMs); }),
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
      let active: McpChildConnection | undefined;
      const callGeneration = generation;
      try {
        active = await timed(connect(callGeneration), signal, options.startupTimeoutError?.() ?? new McpChildStartupTimeoutError(), startupTimeoutMs);
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
        await invalidate(active, callGeneration);
        report(error instanceof McpChildStartupTimeoutError ? `${options.diagnosticPrefix}_startup_timeout` : `${options.diagnosticPrefix}_request_failed`);
        throw boundedError(error, options);
      }
    },
    async close() {
      closed = true;
      await invalidate();
    },
  };
}
