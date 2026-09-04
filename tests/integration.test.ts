import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { createServer } from '../src/server.js';

describe('process construction', () => {
  it('constructs one shared core and lists only bounded tools', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-process-')); const built = createServer({ dataDir: root });
    const client = new Client({ name: 'test', version: '1' }); const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await built.server.connect(serverTransport); await client.connect(clientTransport);
      expect(client.getInstructions()).toMatch(/recall[\s\S]*save[\s\S]*handoff/iu);
      const tools = (await client.listTools()).tools;
      expect(tools.map((tool) => tool.name)).toEqual(['mem_save','mem_recall','mem_context','mem_get','mem_project','mem_session']);
      const memSave = tools.find((tool) => tool.name === 'mem_save')!;
      expect(Object.keys(memSave.inputSchema.properties ?? {}).sort()).toEqual([
        'event_key', 'evidence', 'harness', 'memory', 'observation', 'observation_promotion',
        'observation_review', 'project_key', 'project_name', 'root_session_key',
      ]);
      const descriptions = Object.fromEntries(tools.map((tool) => [tool.name, tool.description ?? '']));
      expect(new Set(Object.values(descriptions))).toHaveLength(6);
      expect(descriptions.mem_save).toMatch(/save[\s\S]*(?:decision|discover|failure|convention)[\s\S]*handoff/iu);
      expect(descriptions.mem_save).toMatch(/direct promoted memory[\s\S]*Result[\s\S]*Rationale[\s\S]*Scope[\s\S]*Caveat[\s\S]*safe action/iu);
      expect(descriptions.mem_save).toMatch(/omit[\s\S]*Scope[\s\S]*Caveat[\s\S]*never invent/iu);
      expect(descriptions.mem_save).toMatch(/evidence[\s\S]*compact[\s\S]*factual/iu);
      expect(descriptions.mem_save).toMatch(/handoff[\s\S]*Objective[\s\S]*Completed[\s\S]*First pending action[\s\S]*Blockers[\s\S]*Key files\/checks/iu);
      expect(descriptions.mem_recall).toMatch(/search[\s\S]*(?:compact|context)/iu);
      expect(descriptions.mem_context).toMatch(/continuity[\s\S]*(?:project|session)/iu);
      expect(descriptions.mem_get).toMatch(/selected[\s\S]*(?:record|lineage)/iu);
      expect(descriptions.mem_project).toMatch(/project[\s\S]*(?:briefing|history|observation)/iu);
      expect(descriptions.mem_session).toMatch(/verified[\s\S]*(?:lifecycle|session)/iu);
      const saved = await client.callTool({ name: 'mem_save', arguments: { project_key: 'repo:process', project_name: 'process', evidence: { kind: 'explicit_save', content: 'Bounded process memory.' }, memory: { kind: 'decision', title: 'Bounded', content: 'Bounded process memory.' } } });
      expect(saved.isError).not.toBe(true); expect(JSON.stringify(saved).length).toBeLessThan(20_000);
      const recalled = await client.callTool({ name: 'mem_recall', arguments: { project_key: 'repo:process', query: 'bounded', budget_chars: 128 } });
      expect(JSON.stringify(recalled)).toContain('thoth-mem.mcp.mem_recall'); expect(JSON.stringify(recalled).length).toBeLessThan(20_000);
    } finally { await client.close(); await built.server.close(); built.service.close(); rmSync(root, { recursive: true, force: true }); }
  });

  it('refuses an old database explicitly without creating a fallback schema', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-process-old-')); const path = join(root, 'legacy.sqlite'); const db = new Database(path); db.exec('CREATE TABLE observations(id INTEGER PRIMARY KEY)'); db.close();
    try {
      expect(() => createServer({ dataDir: root, databasePath: path })).toThrow(/one-way legacy importer/i);
      const check = new Database(path, { readonly: true }); expect(check.prepare("SELECT name FROM sqlite_master WHERE name='projects'").get()).toBeUndefined(); check.close();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
