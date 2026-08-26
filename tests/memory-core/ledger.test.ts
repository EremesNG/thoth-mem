import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { MemoryService } from '../../src/memory-core/service.js';

const roots: string[] = [];

function databasePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'thoth-ledger-'));
  roots.push(root);
  return join(root, 'memory.sqlite');
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('SQLite-first memory ledger', () => {
  it('promotes immutable evidence, supersedes atomically, and recalls immediately', () => {
    const service = new MemoryService({ databasePath: databasePath() });
    try {
      const first = service.save({
        project: { key: 'repo:alpha', name: 'alpha' },
        evidence: { kind: 'explicit_save', content: 'Use the blue deployment lane.' },
        memory: { kind: 'decision', title: 'Deployment lane', content: 'Use blue.', topicKey: 'deploy/lane', outcome: 'failed' },
      });
      const second = service.save({
        project: { key: 'repo:alpha', name: 'alpha' },
        evidence: { kind: 'explicit_save', content: 'Blue failed; green is verified.' },
        memory: { kind: 'decision', title: 'Deployment lane', content: 'Use green.', topicKey: 'deploy/lane', outcome: 'succeeded' },
      });

      expect(service.recall({ projectKey: 'repo:alpha', query: 'deployment lane', mode: 'compact' }).items[0]?.id).toBe(second.memory?.id);
      const history = service.get({ id: second.memory!.id, history: true });
      expect(history.lineage.map((item) => item.id)).toContain(first.memory?.id);
      expect(history.lineage.find((item) => item.id === first.memory?.id)?.status).toBe('superseded');
      expect(first.evidence.id).not.toBe(second.evidence.id);
    } finally {
      service.close();
    }
  });

  it('rejects a legacy database without mutating it', () => {
    const path = databasePath();
    const legacy = new Database(path);
    legacy.exec('CREATE TABLE observations(id INTEGER PRIMARY KEY, content TEXT NOT NULL)');
    legacy.close();
    expect(() => new MemoryService({ databasePath: path })).toThrow(/not a clean current database/i);
    const check = new Database(path, { readonly: true });
    expect(check.prepare("SELECT name FROM sqlite_master WHERE name='projects'").get()).toBeUndefined();
    check.close();
  });

  it('initializes offline without vector or model state and records projection lineage', () => {
    const service = new MemoryService({ databasePath: databasePath() });
    try {
      expect(service.projections.list()).toEqual([]);
      service.projections.record({ projectionId: 'fixture', configHash: 'sha256:abc', sourceWatermark: 0, state: 'disabled' });
      expect(service.projections.list()).toEqual([expect.objectContaining({ projectionId: 'fixture', state: 'disabled' })]);
    } finally {
      service.close();
    }
  });
});
