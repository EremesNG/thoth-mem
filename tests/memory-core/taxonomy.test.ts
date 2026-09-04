import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { HARNESS_VALUES, type LifecycleInput, type SaveMemoryInput } from '../../src/memory-core/contracts.js';
import { MemoryService } from '../../src/memory-core/service.js';

const roots: string[] = [];

function databasePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'thoth-taxonomy-'));
  roots.push(root);
  return join(root, 'memory.sqlite');
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('canonical taxonomy', () => {
  it('accepts Pi alongside every prior harness while keeping the allowlist exact', () => {
    expect(HARNESS_VALUES).toEqual(['opencode', 'codex', 'claude', 'pi', 'mcp', 'cli', 'import']);
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      for (const harness of HARNESS_VALUES) {
        const result = service.lifecycle({ operation: 'enroll', harness, project: { key: `repo:${harness}`, name: harness }, rootSessionKey: 'root', eventKey: 'enroll' });
        expect(result).toMatchObject({ outcome: 'confirmed', projectKey: `repo:${harness}` });
      }
    } finally { service.close(); }
  });

  it('rejects invalid direct service classifications before durable mutation', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const invalidSaves = [
        { field: 'evidence.kind', input: { project: { key: 'repo:invalid:evidence', name: 'invalid' }, evidence: { kind: 'certification', content: 'Must fail.' } } },
        { field: 'memory.kind', input: { project: { key: 'repo:invalid:memory', name: 'invalid' }, evidence: { kind: 'explicit_save', content: 'Must fail.' }, memory: { kind: 'learning', title: 'Must fail', content: 'Must fail.' } } },
        { field: 'memory.outcome', input: { project: { key: 'repo:invalid:outcome', name: 'invalid' }, evidence: { kind: 'explicit_save', content: 'Must fail.' }, memory: { kind: 'decision', title: 'Must fail', content: 'Must fail.', outcome: 'successful' } } },
        { field: 'session.harness', input: { project: { key: 'repo:invalid:harness', name: 'invalid' }, session: { rootSessionKey: 'root', harness: 'cursor' }, evidence: { kind: 'explicit_save', content: 'Must fail.' } } },
      ];
      for (const testCase of invalidSaves) {
        expect(() => service.save(testCase.input as unknown as SaveMemoryInput), testCase.field).toThrow(testCase.field);
      }
      expect(service.listProjects()).toEqual([]);

      const invalidLifecycle = { operation: 'restore', harness: 'mcp', project: { key: 'repo:invalid:lifecycle', name: 'invalid' }, rootSessionKey: 'root', eventKey: 'event' } as unknown as LifecycleInput;
      expect(() => service.lifecycle(invalidLifecycle)).toThrow('operation');
      expect(service.listProjects()).toEqual([]);

      const saved = service.save({ project: { key: 'repo:valid', name: 'valid' }, evidence: { kind: 'explicit_save', content: 'Initial evidence.' }, memory: { kind: 'decision', title: 'Initial', content: 'Initial memory.' } });
      expect(() => service.retract({ id: saved.memory!.id, evidence: { kind: 'verification', content: 'Must fail.' } as never })).toThrow('evidence.kind');
      expect(service.get({ id: saved.memory!.id }).record).toMatchObject({ status: 'current', evidenceIds: [saved.evidence.id] });
    } finally { service.close(); }
  });

  it('rejects non-canonical evidence and memory kinds at the fresh SQLite boundary', () => {
    const path = databasePath();
    const service = new MemoryService({ databasePath: path });
    const saved = service.save({ project: { key: 'repo:sql', name: 'sql' }, evidence: { kind: 'explicit_save', content: 'Valid evidence.' }, memory: { kind: 'decision', title: 'Valid', content: 'Valid memory.' } });
    service.close();

    const database = new Database(path);
    database.pragma('foreign_keys = ON');
    try {
      expect(() => database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run('invalid-evidence', saved.projectId, null, 'certification', 'Invalid.', 'hash', null, new Date().toISOString(), '{}')).toThrow(/invalid evidence kind/i);
      expect(() => database.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('invalid-memory', saved.projectId, null, 'learning', 'Invalid', 'Invalid.', 'unknown', 'current', new Date().toISOString(), null, null, new Date().toISOString())).toThrow(/invalid memory kind/i);
      expect(database.prepare("SELECT count(*) AS count FROM evidence WHERE id='invalid-evidence'").get()).toEqual({ count: 0 });
      expect(database.prepare("SELECT count(*) AS count FROM memories WHERE id='invalid-memory'").get()).toEqual({ count: 0 });
      expect(database.prepare("SELECT count(*) AS count FROM memory_fts WHERE memory_id IN ('invalid-memory')").get()).toEqual({ count: 0 });
    } finally { database.close(); }
  });
});
