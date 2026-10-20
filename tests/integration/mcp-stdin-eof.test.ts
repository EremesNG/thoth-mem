import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

import Database from 'better-sqlite3';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';

import type { SaveMemoryResult } from '../../src/memory-core/contracts.js';
import { MemoryService } from '../../src/memory-core/service.js';

describe('MCP stdio process shutdown', () => {
  it('finalizes the connection with one derived final summary when stdin reaches EOF', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'thoth-stdin-eof-'));
    const child = spawn(process.execPath, ['--import', 'tsx', resolve('src/index.ts'), 'mcp', '--data-dir', directory], {
      env: { ...process.env, THOTH_MEM_NATIVE_HOST: '', XDG_CONFIG_HOME: join(directory, 'config') },
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 10_000, killSignal: 'SIGKILL',
    });
    const exited = once(child, 'exit');
    const lines = createInterface({ input: child.stdout });
    const output = lines[Symbol.asyncIterator]();
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const request = async (id: number, method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      for (;;) {
        const next = await output.next();
        if (next.done) throw new Error(`MCP exited before response: ${stderr}`);
        const response = JSON.parse(next.value) as { id?: number; result?: Record<string, unknown>; error?: unknown };
        if (response.id !== id) continue;
        if (response.error) throw new Error(JSON.stringify(response.error));
        return response.result!;
      }
    };
    try {
      await request(1, 'initialize', { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'generic-eof-test', version: '1' } });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
      const result = await request(2, 'tools/call', { name: 'mem_save', arguments: {
        project_key: 'repo:eof', project_name: 'EOF',
        evidence: { kind: 'explicit_save', content: 'SQLite keeps local storage self-contained.' },
        memory: { kind: 'decision', title: 'Local storage', content: 'Use SQLite for local storage.' },
      } });
      expect(result.isError).not.toBe(true);
      const saved = (result.structuredContent as { data: SaveMemoryResult }).data;
      expect(saved.sessionId).toEqual(expect.any(String));
      child.stdin.end();
      expect(await exited, stderr).toEqual([0, null]);
      expect(stderr).toBe('');
      const databasePath = join(directory, 'memory.sqlite');
      const service = new MemoryService({ databasePath });
      try {
        const summaries = service.projectSummaries({ projectKey: 'repo:eof', history: true }).items;
        expect(summaries).toHaveLength(1);
        expect(summaries[0]).toMatchObject({ version: 1, sessionId: saved.sessionId, coverage: { fromSequence: 1, toSequence: 1 }, generator: { kind: 'harness' }, claims: [
          { kind: 'decision', content: 'Local storage: Use SQLite for local storage.', supportIds: [saved.evidence.id] },
        ] });
        const database = new Database(databasePath, { readonly: true });
        try {
          expect(database.prepare("SELECT count(*) AS count FROM lifecycle_receipts WHERE operation='finalize'").get()).toEqual({ count: 1 });
        } finally { database.close(); }
      } finally { service.close(); }
    } finally {
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
      lines.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15_000);
});
