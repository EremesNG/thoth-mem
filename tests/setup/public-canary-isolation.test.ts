import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { installPlugin, type SetupReceipt } from '../../src/setup/install.js';

const hash = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const trace = (root: string, directory = root): string[] => readdirSync(directory).flatMap((entry) => {
  const path = join(directory, entry);
  const relative = path.slice(root.length + 1).replaceAll('\\', '/');
  return statSync(path).isDirectory() ? [relative, ...trace(root, path)] : [relative];
}).sort();

describe('public marketplace and local canary isolation', () => {
  it('keeps public catalogs immutable and routes both canary MCP servers through the receipt runtime', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-canary-isolation-'));
    const catalogs = ['.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json'];
    const before = catalogs.map(hash);
    try {
      const sentinel = join(root, 'sibling-sentinel.txt');
      writeFileSync(sentinel, 'must remain unchanged\n');
      const sentinelHash = hash(sentinel);
      const beforeTrace = trace(root);
      const receipts = new Map<string, SetupReceipt>();
      for (const harness of ['codex', 'claude-code'] as const) {
        receipts.set(harness, installPlugin({ harness, targetRoot: join(root, harness), packageRoot: process.cwd() }));
      }
      expect(catalogs.map(hash)).toEqual(before);
      expect(hash(sentinel)).toBe(sentinelHash);
      const createdPaths = trace(root).filter((path) => !beforeTrace.includes(path));
      expect(createdPaths.length).toBeGreaterThan(0);
      expect(createdPaths.every((path) => path === 'codex' || path.startsWith('codex/') || path === 'claude-code' || path.startsWith('claude-code/'))).toBe(true);
      for (const [harness, receipt] of receipts) {
        expect(receipt.target.startsWith(root)).toBe(true);
        expect(receipt.runtimeEntry).toBe(join(process.cwd(), 'dist', 'index.js'));
        expect(readFileSync(join(receipt.target, 'runner.mjs'), 'utf8')).not.toContain('thoth-mem@');
        const mcpPath = join(receipt.target, harness === 'codex' ? 'mcp.json' : '.mcp.json');
        const mcp = JSON.parse(readFileSync(mcpPath, 'utf8')) as Record<string, unknown>;
        const server = harness === 'codex'
          ? mcp.thoth_mem as { command: string; args: string[] }
          : (mcp.mcpServers as Record<string, { command: string; args: string[] }>)['thoth-mem'];
        expect(server).toMatchObject({ command: 'node', args: ['runner.mjs', '--mcp'] });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
