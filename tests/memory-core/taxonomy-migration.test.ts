import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { MemoryService } from '../../src/memory-core/service.js';
import { migrateV2 } from '../../src/memory-core/sqlite/migrations.js';
import { IMMUTABILITY_TRIGGER_SQL } from '../../src/memory-core/sqlite/schema.js';

const roots: string[] = [];

interface Fixture {
  path: string;
  projectId: string;
  memoryId: string;
  evidenceIds: string[];
}

function databasePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'thoth-v2-taxonomy-migration-'));
  roots.push(root);
  return join(root, 'memory.sqlite');
}

function createRevision2Fixture(options: { memoryKind?: string; evidenceKinds?: [string, string] } = {}): Fixture {
  const path = databasePath();
  const service = new MemoryService({ databasePath: path });
  const first = service.save({
    project: { key: 'path:/fixture', name: 'fixture' },
    session: { rootSessionKey: 'root-session', harness: 'opencode' },
    eventKey: 'fixture:first',
    evidence: { kind: 'explicit_save', content: 'SC008 migration evidence.' },
    memory: { kind: 'decision', title: 'SC008 migration marker', content: 'SC008-CROSS-HOST-NATIVE-20260825-B', topicKey: 'certification/sc008', outcome: 'succeeded' },
  });
  const second = service.save({
    project: { key: 'path:/fixture', name: 'fixture' },
    session: { rootSessionKey: 'root-session', harness: 'opencode' },
    eventKey: 'fixture:second',
    evidence: { kind: 'explicit_save', content: 'Independent verification evidence.' },
  });
  service.lifecycle({ operation: 'recover', harness: 'opencode', project: { key: 'path:/fixture', name: 'fixture' }, rootSessionKey: 'root-session', eventKey: 'fixture:recover' });
  service.close();

  const database = new Database(path);
  try {
    database.exec('DROP TRIGGER evidence_kind_insert_guard; DROP TRIGGER memory_kind_insert_guard; DROP TRIGGER evidence_immutable_update; DROP TRIGGER evidence_immutable_delete; DROP TRIGGER memory_content_immutable;');
    database.prepare('UPDATE evidence SET kind=? WHERE id=?').run(options.evidenceKinds?.[0] ?? 'certification', first.evidence.id);
    database.prepare('UPDATE evidence SET kind=? WHERE id=?').run(options.evidenceKinds?.[1] ?? 'verification', second.evidence.id);
    database.prepare('UPDATE memories SET kind=? WHERE id=?').run(options.memoryKind ?? 'learning', first.memory!.id);
    database.prepare('UPDATE schema_migrations SET version=2').run();
    database.exec(IMMUTABILITY_TRIGGER_SQL);
  } finally { database.close(); }

  return { path, projectId: first.projectId, memoryId: first.memory!.id, evidenceIds: [first.evidence.id, second.evidence.id] };
}

function authoritativeSnapshot(database: Database.Database): Record<string, unknown> {
  return {
    projects: database.prepare('SELECT * FROM projects ORDER BY id').all(),
    sessions: database.prepare('SELECT * FROM sessions ORDER BY id').all(),
    evidence: database.prepare('SELECT id,project_id,session_id,content,content_hash,source_ref,captured_at,metadata_json FROM evidence ORDER BY id').all(),
    memories: database.prepare('SELECT id,project_id,topic_key,title,content,outcome,status,valid_from,invalid_at,supersedes_id,created_at FROM memories ORDER BY id').all(),
    links: database.prepare('SELECT * FROM memory_evidence ORDER BY memory_id,evidence_id').all(),
    lifecycleReceipts: database.prepare('SELECT * FROM lifecycle_receipts ORDER BY event_key').all(),
    saveReceipts: database.prepare('SELECT * FROM save_receipts ORDER BY event_key').all(),
    fts: database.prepare('SELECT memory_id,project_id,title,content,topic_key FROM memory_fts ORDER BY memory_id').all(),
    watermarks: database.prepare('SELECT source_id,changed_at FROM change_watermark ORDER BY id').all(),
  };
}

function openError(path: string): unknown {
  try {
    const service = new MemoryService({ databasePath: path });
    service.close();
    return undefined;
  } catch (error) {
    return error;
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('SQLite taxonomy migration', () => {
  it('converges declared revision-2 values once without changing authoritative semantics', () => {
    const fixture = createRevision2Fixture();
    const beforeDatabase = new Database(fixture.path, { readonly: true });
    const before = authoritativeSnapshot(beforeDatabase);
    beforeDatabase.close();

    const service = new MemoryService({ databasePath: fixture.path });
    try {
      expect(service.get({ id: fixture.memoryId }).record).toMatchObject({ kind: 'convention', content: 'SC008-CROSS-HOST-NATIVE-20260825-B' });
      expect(service.recall({ projectKey: 'path:/fixture', query: 'SC008', mode: 'context' }).items.map((item) => item.id)).toContain(fixture.memoryId);
    } finally { service.close(); }

    const migrated = new Database(fixture.path);
    try {
      expect(migrated.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 2 }, { version: 3 }]);
      expect(migrated.prepare('SELECT id,kind FROM evidence ORDER BY id').all()).toEqual(fixture.evidenceIds.slice().sort().map((id) => ({ id, kind: 'explicit_save' })));
      expect(migrated.prepare('SELECT kind FROM memories WHERE id=?').get(fixture.memoryId)).toEqual({ kind: 'convention' });
      expect(authoritativeSnapshot(migrated)).toEqual(before);
      expect(migrated.pragma('foreign_key_check')).toEqual([]);
      expect(migrated.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'SC008'").all()).toEqual([{ memory_id: fixture.memoryId }]);
      expect(() => migrated.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run('invalid-evidence', fixture.projectId, null, 'certification', 'Invalid.', 'hash', null, new Date().toISOString(), '{}')).toThrow(/invalid evidence kind/i);
      migrated.pragma('query_only = ON');
      expect(() => migrateV2(migrated)).not.toThrow();
    } finally { migrated.close(); }
  });

  it('rejects unknown values without partially normalizing the revision-2 ledger', () => {
    const fixture = createRevision2Fixture({ memoryKind: 'folklore' });
    const beforeDatabase = new Database(fixture.path, { readonly: true });
    const before = { snapshot: authoritativeSnapshot(beforeDatabase), kinds: beforeDatabase.prepare('SELECT kind FROM evidence ORDER BY id').all(), memoryKind: beforeDatabase.prepare('SELECT kind FROM memories WHERE id=?').get(fixture.memoryId) };
    beforeDatabase.close();

    expect(String(openError(fixture.path))).toMatch(/unsupported memory kind.*revision 2/i);

    const after = new Database(fixture.path, { readonly: true });
    try {
      expect(authoritativeSnapshot(after)).toEqual(before.snapshot);
      expect(after.prepare('SELECT kind FROM evidence ORDER BY id').all()).toEqual(before.kinds);
      expect(after.prepare('SELECT kind FROM memories WHERE id=?').get(fixture.memoryId)).toEqual(before.memoryKind);
      expect(after.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 2 }]);
    } finally { after.close(); }
  });

  it('rolls back mappings, guards, and revision bookkeeping when the transaction fails', () => {
    const fixture = createRevision2Fixture();
    const setup = new Database(fixture.path);
    setup.exec("CREATE TRIGGER reject_revision_three BEFORE INSERT ON schema_migrations WHEN new.version=3 BEGIN SELECT RAISE(ABORT, 'blocked revision three'); END;");
    const before = { snapshot: authoritativeSnapshot(setup), kinds: setup.prepare('SELECT id,kind FROM evidence ORDER BY id').all(), memoryKind: setup.prepare('SELECT kind FROM memories WHERE id=?').get(fixture.memoryId) };
    setup.close();

    expect(String(openError(fixture.path))).toMatch(/blocked revision three/i);

    const after = new Database(fixture.path, { readonly: true });
    try {
      expect(authoritativeSnapshot(after)).toEqual(before.snapshot);
      expect(after.prepare('SELECT id,kind FROM evidence ORDER BY id').all()).toEqual(before.kinds);
      expect(after.prepare('SELECT kind FROM memories WHERE id=?').get(fixture.memoryId)).toEqual(before.memoryKind);
      expect(after.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 2 }]);
      expect(after.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('evidence_kind_insert_guard','memory_kind_insert_guard') ORDER BY name").all()).toEqual([]);
    } finally { after.close(); }
  });
});
