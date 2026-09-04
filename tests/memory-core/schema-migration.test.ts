import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migrateCurrentSchema, preV10BackupPath, preV4BackupPath, preV6BackupPath, preV7BackupPath, preV8BackupPath, preV9BackupPath, SQLITE_SCHEMA_REVISION } from '../../src/memory-core/sqlite/migrations.js';
import { LEGACY_IMPORT_AUDIT_SCHEMA_SQL, LEGACY_IMPORT_COHORT_SCHEMA_SQL, PROJECT_ALIAS_SCHEMA_SQL, REVISION_FIVE_SCHEMA_SQL, REVISION_FOUR_SCHEMA_SQL, REVISION_SIX_SCHEMA_SQL, REVISION_THREE_SCHEMA_SQL } from '../../src/memory-core/sqlite/schema.js';

const roots: string[] = [];

function fixturePath(name = 'memory.sqlite'): string {
  const root = mkdtempSync(join(tmpdir(), 'thoth-schema-v4-'));
  roots.push(root);
  return join(root, name);
}

function exactLogicalRows(database: Database.Database, excluded: readonly string[] = []): string {
  const excludedNames = new Set(excluded);
  const tables = (database.prepare("SELECT name FROM pragma_table_list WHERE schema='main' AND type IN ('table','virtual') AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name").all() as Array<{ name: string }>)
    .map((row) => row.name).filter((name) => !excludedNames.has(name));
  return JSON.stringify(tables.map((table) => [table, (database.prepare(`SELECT * FROM "${table.replaceAll('"', '""')}"`).all() as Array<Record<string, unknown>>).map((row) => JSON.stringify(row)).sort()]));
}

function createRevisionThreeFixture(path: string): void {
  const database = new Database(path);
  const timestamp = '2026-08-27T00:00:00.000Z';
  try {
    database.pragma('foreign_keys = ON');
    database.exec(REVISION_THREE_SCHEMA_SQL);
    database.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(3, timestamp);
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-1', 'fixture', 'Fixture', null, timestamp, timestamp);
    database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)').run('session-1', 'project-1', 'root-1', 'codex', 'active', timestamp, null);
    database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run('evidence-1', 'project-1', 'session-1', 'explicit_save', 'source evidence', 'hash-1', null, timestamp, '{}');
    database.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('memory-1', 'project-1', 'fixture/topic', 'decision', 'Fixture decision', 'searchable migration marker', 'succeeded', 'current', timestamp, null, null, timestamp);
    database.prepare('INSERT INTO memory_evidence VALUES(?,?,?)').run('memory-1', 'evidence-1', 'supports');
  } finally {
    database.close();
  }
}

function createRevisionFourFixture(path: string): void {
  const database = new Database(path);
  const timestamp = '2026-08-27T00:00:00.000Z';
  try {
    database.pragma('foreign_keys = ON');
    database.exec(REVISION_FOUR_SCHEMA_SQL);
    database.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(4, timestamp);
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-1', 'fixture', 'Fixture', null, timestamp, timestamp);
    database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run('evidence-1', 'project-1', null, 'explicit_save', 'source evidence', 'hash-1', null, timestamp, '{}');
    database.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('memory-1', 'project-1', 'fixture/topic', 'decision', 'Fixture decision', 'searchable migration marker café', 'succeeded', 'current', timestamp, null, null, timestamp);
    database.prepare('INSERT INTO memory_evidence VALUES(?,?,?)').run('memory-1', 'evidence-1', 'supports');
  } finally { database.close(); }
}

function createRevisionFiveFixture(path: string): void {
  const database = new Database(path);
  const timestamp = '2026-08-28T00:00:00.000Z';
  try {
    database.pragma('foreign_keys = ON');
    database.exec(REVISION_FIVE_SCHEMA_SQL);
    database.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(5, timestamp);
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-1', 'fixture', 'Fixture', null, timestamp, timestamp);
    database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run('evidence-1', 'project-1', null, 'explicit_save', 'source evidence', 'hash-1', null, timestamp, '{}');
    database.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('memory-1', 'project-1', 'fixture/topic', 'decision', 'Fixture decision', 'searchable revision five marker', 'succeeded', 'current', timestamp, null, null, timestamp);
    database.prepare('INSERT INTO memory_evidence VALUES(?,?,?)').run('memory-1', 'evidence-1', 'supports');
  } finally { database.close(); }
}

function createRevisionSixFixture(path: string): void {
  const database = new Database(path);
  const timestamp = '2026-08-31T00:00:00.000Z';
  try {
    database.pragma('foreign_keys = ON');
    database.exec(REVISION_SIX_SCHEMA_SQL);
    database.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(6, timestamp);
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-1', 'path:C:/repo', 'Fixture', null, timestamp, timestamp);
    database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run('evidence-1', 'project-1', null, 'explicit_save', 'source evidence', 'hash-1', null, timestamp, '{}');
    database.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('memory-1', 'project-1', 'fixture/topic', 'decision', 'Fixture decision', 'searchable revision six marker', 'succeeded', 'current', timestamp, null, null, timestamp);
    database.prepare('INSERT INTO memory_evidence VALUES(?,?,?)').run('memory-1', 'evidence-1', 'supports');
  } finally { database.close(); }
}

function createRevisionSevenFixture(path: string): void {
  const database = new Database(path);
  const timestamp = '2026-09-01T00:00:00.000Z';
  try {
    database.pragma('foreign_keys = ON');
    database.exec(`${REVISION_SIX_SCHEMA_SQL}\n${PROJECT_ALIAS_SCHEMA_SQL}`);
    database.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(7, timestamp);
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-1', 'path:C:/repo', 'Fixture', null, timestamp, timestamp);
    database.prepare('INSERT INTO project_aliases VALUES(?,?,?,?,?)').run('path:C:/repo-alias', 'project-1', 'path', timestamp, timestamp);
    database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run('evidence-1', 'project-1', null, 'explicit_save', 'source evidence', 'hash-1', null, timestamp, '{}');
    database.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('memory-1', 'project-1', 'fixture/topic', 'decision', 'Fixture decision', 'searchable revision seven marker', 'succeeded', 'current', timestamp, null, null, timestamp);
    database.prepare('INSERT INTO memory_evidence VALUES(?,?,?)').run('memory-1', 'evidence-1', 'supports');
  } finally { database.close(); }
}

function createRevisionEightFixture(path: string): void {
  createRevisionSevenFixture(path);
  const database = new Database(path);
  try {
    database.exec(LEGACY_IMPORT_AUDIT_SCHEMA_SQL);
    database.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(8, '2026-09-02T00:00:00.000Z');
    const insert = database.prepare('INSERT INTO legacy_imports VALUES(?,?,?,?,?,?,?,?,?,?)');
    insert.run('import-z', 'a'.repeat(64), '{}', 'target', 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64), 'legacy-v1', 'committed', '2026-09-02T02:00:00.000Z');
    insert.run('import-a', 'e'.repeat(64), '{}', 'target', 'f'.repeat(64), '1'.repeat(64), '2'.repeat(64), 'legacy-v1', 'committed', '2026-09-02T01:00:00.000Z');
  } finally { database.close(); }
}

function createRevisionNineFixture(path: string): void {
  createRevisionEightFixture(path);
  const database = new Database(path);
  try {
    database.exec(LEGACY_IMPORT_COHORT_SCHEMA_SQL);
    const timestamp = '2026-09-03T00:00:00.000Z';
    database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)').run('session-9', 'project-1', 'root-9', 'codex', 'compacted', timestamp, null, 2);
    const evidence = database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)');
    evidence.run('event-evidence-9', 'project-1', 'session-9', 'root_prompt', 'Referenced root event.', 'event-hash-9', null, timestamp, '{"fixture":9}');
    evidence.run('summary-evidence-9', 'project-1', 'session-9', 'session_summary', 'Referenced summary.', 'summary-hash-9', null, timestamp, '{}');
    evidence.run('observation-evidence-9', 'project-1', 'session-9', 'observation', 'Referenced observation.', 'observation-hash-9', null, timestamp, '{}');
    database.prepare('INSERT INTO session_events VALUES(?,?,?,?,?,?,?)').run('event-evidence-9', 'session-9', 1, 'user', 'root_user', 'session', 'standard');
    database.prepare('INSERT INTO session_summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('summary-9', 'project-1', 'session-9', 'summary-evidence-9', 'checkpoint', 1, 'current', 1, 1, 'harness', 'pi-fixture', null, null, null, timestamp);
    database.prepare('INSERT INTO session_summary_claims VALUES(?,?,?,?,?,?)').run('claim-9', 'summary-9', 0, 'completed', 'Referenced claim.', 'succeeded');
    database.prepare('INSERT INTO session_summary_claim_supports VALUES(?,?,?)').run('claim-9', 'event-evidence-9', 'supports');
    database.prepare('INSERT INTO lifecycle_receipts(harness,project_id,root_session_key,event_key,operation,payload_hash,outcome,confirmed_at,diagnostic_code,evidence_id,summary_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('codex', 'project-1', 'root-9', 'checkpoint-9', 'checkpoint_pre_compact', 'payload-hash-9', 'confirmed', timestamp, null, 'summary-evidence-9', 'summary-9');
    database.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('observation-9', 'project-1', 'session-9', 'observation-evidence-9', null, 'session', 1, 1, 'result', 'Referenced observation', 'The migration preserves this observation.', 'discovery', 'Preserved discovery', 'Preserved content.', null, 'succeeded', 'harness', 'pi-fixture', null, null, timestamp);
    database.prepare('INSERT INTO observation_facets VALUES(?,?,?,?)').run('observation-9', 'concept', 0, 'migration');
    database.prepare('INSERT INTO observation_supports VALUES(?,?,?)').run('observation-9', 'event-evidence-9', 'supports');
    database.prepare('INSERT INTO legacy_import_rows VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('import-a', 'session', 'legacy-session-9', 0, '3'.repeat(64), '4'.repeat(64), 'imported', 'imported', 'project-1', 'session-9', 'event-evidence-9', 'memory-1', timestamp);
    database.prepare('INSERT INTO legacy_import_cohorts VALUES(?,?)').run('import-a', 1);
    database.prepare('INSERT INTO legacy_import_cohorts VALUES(?,?)').run('import-z', 2);
    database.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(9, '2026-09-03T00:00:00.000Z');
  } finally { database.close(); }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('SQLite current schema migrations', () => {
  it('migrates revision 9 through an exact retained backup, reopens idempotently, and accepts Pi', () => {
    const path = fixturePath(); createRevisionNineFixture(path);
    const database = new Database(path);
    const contender = new Database(path); contender.pragma('busy_timeout = 1');
    const beforeAllRows = exactLogicalRows(database);
    const beforeAuthoritativeRows = exactLogicalRows(database, ['schema_migrations']);
    try {
      const before = database.prepare('SELECT * FROM sessions ORDER BY id').all();
      migrateCurrentSchema(database, { afterRevisionNineTableRebuilt: () => {
        expect(() => contender.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('concurrent', 'concurrent', 'Concurrent', null, '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.000Z')).toThrow(/locked|busy/iu);
      } });
      expect(database.prepare('SELECT * FROM sessions ORDER BY id').all()).toEqual(before);
      expect(exactLogicalRows(database, ['schema_migrations'])).toBe(beforeAuthoritativeRows);
      expect(database.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 10 });
      expect(() => database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)').run('pi-session', 'project-1', 'pi-root', 'pi', 'active', '2026-09-03T00:00:00.000Z', null, 0)).not.toThrow();
      expect(database.pragma('foreign_key_check')).toEqual([]);
      expect(() => migrateCurrentSchema(database)).not.toThrow();
    } finally { contender.close(); database.close(); }
    const backup = new Database(preV10BackupPath(path), { readonly: true, fileMustExist: true });
    try {
      expect(backup.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 9 });
      expect(exactLogicalRows(backup)).toBe(beforeAllRows);
    }
    finally { backup.close(); }
  });

  it('rejects a structurally valid mismatched pre-v10 backup before mutation', () => {
    const path = fixturePath(); const foreign = fixturePath('foreign.sqlite');
    createRevisionNineFixture(path); createRevisionNineFixture(foreign);
    const other = new Database(foreign);
    other.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('foreign-project', 'foreign', 'Foreign', null, '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.000Z');
    other.close();
    copyFileSync(foreign, preV10BackupPath(path));
    const database = new Database(path);
    try {
      expect(() => migrateCurrentSchema(database)).toThrow(/locked revision 9 source/u);
      expect(database.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 9 });
      expect(database.prepare("SELECT sql FROM sqlite_master WHERE name='sessions'").get()).not.toMatchObject({ sql: expect.stringContaining("'pi'") });
    } finally { database.close(); }
  });

  it('rejects drift after backup verification and rolls back an interrupted table swap', () => {
    const driftPath = fixturePath(); createRevisionNineFixture(driftPath);
    const drift = new Database(driftPath);
    try {
      expect(() => migrateCurrentSchema(drift, { afterRevisionNineBackupVerified: () => {
        drift.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('drift', 'drift', 'Drift', null, '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.000Z');
      } })).toThrow(/locked revision 9 source/u);
      expect(drift.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 9 });
    } finally { drift.close(); }

    const rollbackPath = fixturePath(); createRevisionNineFixture(rollbackPath);
    const rollbackDatabase = new Database(rollbackPath);
    const sessions = rollbackDatabase.prepare('SELECT * FROM sessions ORDER BY id').all();
    try {
      expect(() => migrateCurrentSchema(rollbackDatabase, { afterRevisionNineTableRebuilt: () => { throw new Error('interrupt table swap'); } })).toThrow(/interrupt table swap/u);
      expect(rollbackDatabase.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 9 });
      expect(rollbackDatabase.prepare('SELECT * FROM sessions ORDER BY id').all()).toEqual(sessions);
      expect(rollbackDatabase.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(rollbackDatabase.pragma('foreign_key_check')).toEqual([]);
      expect(existsSync(preV10BackupPath(rollbackPath))).toBe(true);
    } finally { rollbackDatabase.close(); }
  });

  it('detects any dependent-row mutation during the revision-10 table swap and rolls it back', () => {
    const path = fixturePath(); createRevisionNineFixture(path);
    const database = new Database(path);
    const before = database.prepare('SELECT * FROM lifecycle_receipts').all();
    try {
      expect(() => migrateCurrentSchema(database, { afterRevisionNineTableRebuilt: () => {
        database.prepare("UPDATE lifecycle_receipts SET payload_hash='changed-but-same-count'").run();
      } })).toThrow(/row|state|depend/iu);
      expect(database.prepare('SELECT * FROM lifecycle_receipts').all()).toEqual(before);
      expect(database.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 9 });
    } finally { database.close(); }
  });

  it('adds immutable gap-free import cohorts when revision 8 is upgraded', () => {
    const path = fixturePath();
    createRevisionEightFixture(path);
    const database = new Database(path);
    try {
      migrateCurrentSchema(database);
      expect(SQLITE_SCHEMA_REVISION).toBe(10);
      expect(database.prepare('SELECT import_id,cohort_sequence FROM legacy_import_cohorts ORDER BY cohort_sequence').all()).toEqual([
        { import_id: 'import-a', cohort_sequence: 1 },
        { import_id: 'import-z', cohort_sequence: 2 },
      ]);
      expect(() => database.prepare('UPDATE legacy_import_cohorts SET cohort_sequence=3 WHERE import_id=?').run('import-a')).toThrow(/immutable/i);
      expect(() => migrateCurrentSchema(database)).not.toThrow();
    } finally { database.close(); }
    expect(existsSync(preV9BackupPath(path))).toBe(true);
  });

  it('upgrades revision 5 with a verified backup, empty observation state, and unchanged memory FTS', () => {
    const path = fixturePath();
    createRevisionFiveFixture(path);
    const database = new Database(path);
    try {
      migrateCurrentSchema(database);
      expect(SQLITE_SCHEMA_REVISION).toBe(10);
      expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }]);
      expect(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('observations','observation_facets','observation_supports','observation_reviews','observation_review_supports','observation_promotions','observation_receipts') ORDER BY name").all()).toHaveLength(7);
      for (const table of ['observations', 'observation_facets', 'observation_supports', 'observation_reviews', 'observation_review_supports', 'observation_promotions', 'observation_receipts']) {
        expect(database.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
      }
      expect(database.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'revision' ").all()).toEqual([{ memory_id: 'memory-1' }]);
      expect(database.pragma('foreign_key_check')).toEqual([]);
      expect(() => migrateCurrentSchema(database)).not.toThrow();
    } finally { database.close(); }

    const backup = new Database(preV6BackupPath(path), { readonly: true, fileMustExist: true });
    try {
      expect(backup.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
      expect(backup.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 5 });
      expect(backup.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name='observations'").get()).toEqual({ count: 0 });
      expect(backup.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'revision'").all()).toEqual([{ memory_id: 'memory-1' }]);
    } finally { backup.close(); }
  });

  it('rolls back a failed revision-6 projection migration and leaves revision 5 searchable', () => {
    const path = fixturePath();
    createRevisionFiveFixture(path);
    const setup = new Database(path);
    setup.exec("CREATE TRIGGER reject_revision_six BEFORE INSERT ON schema_migrations WHEN new.version=6 BEGIN SELECT RAISE(ABORT, 'blocked revision six'); END;");
    setup.close();

    const database = new Database(path);
    try { expect(() => migrateCurrentSchema(database)).toThrow(/blocked revision six/i); } finally { database.close(); }

    const source = new Database(path, { readonly: true });
    try {
      expect(source.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 5 });
      expect(source.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name='observations'").get()).toEqual({ count: 0 });
      expect(source.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'revision'").all()).toEqual([{ memory_id: 'memory-1' }]);
      expect(source.prepare('SELECT content FROM evidence WHERE id=?').get('evidence-1')).toEqual({ content: 'source evidence' });
    } finally { source.close(); }
    expect(existsSync(preV6BackupPath(path))).toBe(true);
  });
  it('creates revision 9 directly with aliases, observation projections, import audit state, and shared prefix indexes', () => {
    const path = fixturePath();
    for (const target of [path, ':memory:']) {
      const database = new Database(target);
      try {
        migrateCurrentSchema(database);
        expect(SQLITE_SCHEMA_REVISION).toBe(10);
        expect(database.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 10 });
        expect(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='project_aliases'").get()).toEqual({ count: 1 });
        expect(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('legacy_imports','legacy_project_mappings','legacy_import_rows') ORDER BY name").all()).toHaveLength(3);
        expect(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='legacy_import_cohorts'").get()).toEqual({ count: 1 });
        expect(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('session_events','session_summaries','session_summary_claims','session_summary_claim_supports') ORDER BY name").all()).toHaveLength(4);
        expect(database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='memory_fts'").get()).toMatchObject({ sql: expect.stringContaining("prefix='2 3 4 5 6 7 8 9 10 11 12'") });
        const insertImport = database.prepare('INSERT INTO legacy_imports VALUES(?,?,?,?,?,?,?,?,?,?)');
        insertImport.run('clean-a', 'a'.repeat(64), '{}', 'empty', 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64), 'legacy-v1', 'committed', '2026-09-02T00:00:00.000Z');
        insertImport.run('clean-b', 'e'.repeat(64), '{}', 'empty', 'f'.repeat(64), '1'.repeat(64), '2'.repeat(64), 'legacy-v1', 'committed', '2026-09-02T00:00:00.000Z');
        database.prepare('INSERT INTO legacy_import_cohorts VALUES(?,1)').run('clean-a');
        expect(() => database.prepare('INSERT INTO legacy_import_cohorts VALUES(?,0)').run('clean-b')).toThrow();
        expect(() => database.prepare('INSERT INTO legacy_import_cohorts VALUES(?,1)').run('clean-b')).toThrow();
        expect(() => database.prepare('DELETE FROM legacy_import_cohorts WHERE import_id=?').run('clean-a')).toThrow(/immutable/i);
      } finally { database.close(); }
    }
    expect(existsSync(preV4BackupPath(path))).toBe(false);
  });

  it('upgrades revision 3 once, verifies a restorable backup, and never infers history', () => {
    const path = fixturePath();
    createRevisionThreeFixture(path);

    const database = new Database(path);
    try {
      migrateCurrentSchema(database);
      expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 3 }, { version: 4 }, { version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }]);
      expect(database.prepare('SELECT next_event_sequence FROM sessions WHERE id=?').get('session-1')).toEqual({ next_event_sequence: 0 });
      expect(database.prepare('SELECT count(*) AS count FROM session_events').get()).toEqual({ count: 0 });
      expect(database.prepare('SELECT count(*) AS count FROM session_summaries').get()).toEqual({ count: 0 });
      expect(database.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'migration'").all()).toEqual([{ memory_id: 'memory-1' }]);
      expect(database.pragma('foreign_key_check')).toEqual([]);
      expect(() => migrateCurrentSchema(database)).not.toThrow();
    } finally { database.close(); }

    const backup = new Database(preV4BackupPath(path), { readonly: true, fileMustExist: true });
    try {
      expect(backup.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
      expect(backup.pragma('foreign_key_check')).toEqual([]);
      expect(backup.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 3 });
      expect(backup.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name='session_events'").get()).toEqual({ count: 0 });
    } finally { backup.close(); }
  });

  it('upgrades revision 4 transactionally and preserves authoritative rows and FTS maintenance', () => {
    const path = fixturePath();
    createRevisionFourFixture(path);
    const database = new Database(path);
    try {
      migrateCurrentSchema(database);
      expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 4 }, { version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }]);
      expect(database.prepare('SELECT id,content FROM memories').get()).toEqual({ id: 'memory-1', content: 'searchable migration marker café' });
      expect(database.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'migra*'").all()).toEqual([{ memory_id: 'memory-1' }]);
      expect(database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='memory_fts'").get()).toMatchObject({ sql: expect.stringContaining("prefix='2 3 4 5 6 7 8 9 10 11 12'") });
      database.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('memory-2', 'project-1', null, 'decision', 'Unicode', 'café nuevo', 'unknown', 'current', '2026-08-28T00:00:00.000Z', null, null, '2026-08-28T00:00:00.000Z');
      expect(database.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'caf*' ORDER BY memory_id").all()).toEqual([{ memory_id: 'memory-1' }, { memory_id: 'memory-2' }]);
      database.prepare("DELETE FROM memories WHERE id='memory-2'").run();
      expect(database.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'caf*'").all()).toEqual([{ memory_id: 'memory-1' }]);
      expect(database.pragma('foreign_key_check')).toEqual([]);
      expect(() => migrateCurrentSchema(database)).not.toThrow();
    } finally { database.close(); }
  });

  it('rolls back a failed revision-5 FTS rebuild and leaves revision 4 searchable', () => {
    const path = fixturePath();
    createRevisionFourFixture(path);
    const setup = new Database(path);
    setup.exec("CREATE TRIGGER reject_revision_five BEFORE INSERT ON schema_migrations WHEN new.version=5 BEGIN SELECT RAISE(ABORT, 'blocked revision five'); END;");
    setup.close();

    const database = new Database(path);
    try { expect(() => migrateCurrentSchema(database)).toThrow(/blocked revision five/i); } finally { database.close(); }

    const source = new Database(path, { readonly: true });
    try {
      expect(source.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 4 });
      expect(source.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'migration'").all()).toEqual([{ memory_id: 'memory-1' }]);
      expect(source.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='memory_fts'").get()).toMatchObject({ sql: expect.not.stringContaining("prefix='2 3 4") });
      expect(source.prepare('SELECT content FROM evidence WHERE id=?').get('evidence-1')).toEqual({ content: 'source evidence' });
    } finally { source.close(); }
  });

  it('leaves revision 3 usable after an injected migration failure and preserves its verified backup', () => {
    const path = fixturePath();
    createRevisionThreeFixture(path);
    const setup = new Database(path);
    setup.exec("CREATE TRIGGER reject_revision_four BEFORE INSERT ON schema_migrations WHEN new.version=4 BEGIN SELECT RAISE(ABORT, 'blocked revision four'); END;");
    setup.close();

    const database = new Database(path);
    try {
      expect(() => migrateCurrentSchema(database)).toThrow(/blocked revision four/i);
    } finally { database.close(); }

    const source = new Database(path, { readonly: true });
    try {
      expect(source.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 3 });
      expect(source.prepare("SELECT count(*) AS count FROM pragma_table_info('sessions') WHERE name='next_event_sequence'").get()).toEqual({ count: 0 });
      expect(source.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'migration'").all()).toEqual([{ memory_id: 'memory-1' }]);
    } finally { source.close(); }

    const backupPath = preV4BackupPath(path);
    expect(existsSync(backupPath)).toBe(true);
    const restoredPath = fixturePath('restored.sqlite');
    copyFileSync(backupPath, restoredPath);
    const restored = new Database(restoredPath, { readonly: true });
    try {
      expect(restored.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
      expect(restored.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 3 });
      expect(restored.prepare('SELECT content FROM evidence WHERE id=?').get('evidence-1')).toEqual({ content: 'source evidence' });
    } finally { restored.close(); }
  });

  it('enforces closed revision-4 taxonomy, scope, uniqueness, foreign keys, and immutability in SQLite', () => {
    const database = new Database(':memory:');
    const timestamp = '2026-08-27T00:00:00.000Z';
    try {
      migrateCurrentSchema(database);
      database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-1', 'fixture', 'Fixture', null, timestamp, timestamp);
      database.prepare('INSERT INTO sessions(id,project_id,root_session_key,harness,state,started_at) VALUES(?,?,?,?,?,?)').run('session-1', 'project-1', 'root-1', 'codex', 'active', timestamp);
      for (const [id, kind] of [['evidence-1', 'explicit_save'], ['submission-1', 'session_summary'], ['submission-2', 'session_summary']] as const) {
        database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run(id, 'project-1', 'session-1', kind, id, `hash-${id}`, null, timestamp, '{}');
      }

      expect(() => database.prepare('INSERT INTO session_events VALUES(?,?,?,?,?,?,?)').run('evidence-1', 'session-1', 1, 'intruder', 'root_user', 'project', 'standard')).toThrow(/check constraint/i);
      database.prepare('INSERT INTO session_events VALUES(?,?,?,?,?,?,?)').run('evidence-1', 'session-1', 1, 'agent', 'root_user', 'project', 'standard');
      expect(() => database.prepare('INSERT INTO session_events VALUES(?,?,?,?,?,?,?)').run('submission-1', 'session-1', 1, 'agent', 'root_user', 'project', 'standard')).toThrow(/unique constraint/i);
      expect(() => database.prepare("UPDATE evidence SET content='changed' WHERE id='evidence-1'").run()).toThrow(/immutable/i);
      expect(() => database.prepare("DELETE FROM session_events WHERE evidence_id='evidence-1'").run()).toThrow(/immutable/i);

      const insertSummary = database.prepare('INSERT INTO session_summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      insertSummary.run('summary-1', 'project-1', 'session-1', 'submission-1', 'checkpoint', 1, 'current', 1, 1, 'root_agent', 'codex', null, null, null, timestamp);
      expect(() => insertSummary.run('summary-2', 'project-1', 'session-1', 'submission-2', 'checkpoint', 2, 'current', 1, 2, 'root_agent', 'codex', null, null, 'summary-1', timestamp)).toThrow(/unique constraint/i);
      expect(() => database.prepare("UPDATE session_summaries SET generator_name='forged' WHERE id='summary-1'").run()).toThrow(/immutable/i);

      database.prepare('INSERT INTO session_summary_claims VALUES(?,?,?,?,?,?)').run('claim-1', 'summary-1', 0, 'objective', 'Ship safely', null);
      expect(() => database.prepare('INSERT INTO session_summary_claim_supports VALUES(?,?,?)').run('claim-1', 'missing-evidence', 'supports')).toThrow(/foreign key/i);
    } finally { database.close(); }
  });

  it('upgrades revision 6 through a verified pre-v7 backup without changing authoritative or FTS rows', () => {
    const path = fixturePath();
    createRevisionSixFixture(path);
    const database = new Database(path);
    try {
      migrateCurrentSchema(database);
      expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }]);
      expect(database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='project_aliases'").get()).toMatchObject({ sql: expect.stringContaining('alias_key TEXT PRIMARY KEY') });
      expect(database.prepare('SELECT count(*) AS count FROM project_aliases').get()).toEqual({ count: 0 });
      expect(database.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'revision'").all()).toEqual([{ memory_id: 'memory-1' }]);
      expect(database.prepare('SELECT content FROM evidence WHERE id=?').get('evidence-1')).toEqual({ content: 'source evidence' });
      expect(database.pragma('foreign_key_check')).toEqual([]);
    } finally { database.close(); }

    const backupPath = preV7BackupPath(path);
    expect(existsSync(backupPath)).toBe(true);
    const backup = new Database(backupPath, { readonly: true });
    try {
      expect(backup.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 6 });
      expect(backup.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='project_aliases'").get()).toEqual({ count: 0 });
      expect(backup.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    } finally { backup.close(); }
  });

  it('rolls revision 7 back completely when the migration record cannot commit', () => {
    const path = fixturePath();
    createRevisionSixFixture(path);
    const setup = new Database(path);
    setup.exec("CREATE TRIGGER reject_revision_seven BEFORE INSERT ON schema_migrations WHEN new.version=7 BEGIN SELECT RAISE(ABORT, 'blocked revision seven'); END;");
    setup.close();

    const database = new Database(path);
    try { expect(() => migrateCurrentSchema(database)).toThrow(/blocked revision seven/i); } finally { database.close(); }

    const source = new Database(path, { readonly: true });
    try {
      expect(source.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 6 });
      expect(source.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='project_aliases'").get()).toEqual({ count: 0 });
      expect(source.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'revision'").all()).toEqual([{ memory_id: 'memory-1' }]);
    } finally { source.close(); }
  });

  it('upgrades revision 7 through a verified pre-v8 backup while preserving baseline rows and FTS', () => {
    const path = fixturePath();
    createRevisionSevenFixture(path);

    const database = new Database(path);
    try {
      migrateCurrentSchema(database);
      expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }]);
      expect(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('legacy_imports','legacy_project_mappings','legacy_import_rows') ORDER BY name").all()).toEqual([
        { name: 'legacy_import_rows' }, { name: 'legacy_imports' }, { name: 'legacy_project_mappings' },
      ]);
      for (const table of ['legacy_imports', 'legacy_project_mappings', 'legacy_import_rows']) {
        expect(database.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
      }
      expect(database.prepare('SELECT id,identity_key,display_name FROM projects').get()).toEqual({ id: 'project-1', identity_key: 'path:C:/repo', display_name: 'Fixture' });
      expect(database.prepare('SELECT alias_key,project_id FROM project_aliases').get()).toEqual({ alias_key: 'path:C:/repo-alias', project_id: 'project-1' });
      expect(database.prepare('SELECT content FROM evidence WHERE id=?').get('evidence-1')).toEqual({ content: 'source evidence' });
      expect(database.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'seven'").all()).toEqual([{ memory_id: 'memory-1' }]);
      expect(database.pragma('foreign_key_check')).toEqual([]);
      expect(() => migrateCurrentSchema(database)).not.toThrow();
    } finally { database.close(); }

    const backup = new Database(preV8BackupPath(path), { readonly: true, fileMustExist: true });
    try {
      expect(backup.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
      expect(backup.pragma('foreign_key_check')).toEqual([]);
      expect(backup.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 7 });
      expect(backup.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name LIKE 'legacy_import%'").get()).toEqual({ count: 0 });
      expect(backup.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'seven'").all()).toEqual([{ memory_id: 'memory-1' }]);
    } finally { backup.close(); }
  });

  it('rolls revision 8 back completely when its migration record cannot commit and retains the verified backup', () => {
    const path = fixturePath();
    createRevisionSevenFixture(path);
    const setup = new Database(path);
    setup.exec("CREATE TRIGGER reject_revision_eight BEFORE INSERT ON schema_migrations WHEN new.version=8 BEGIN SELECT RAISE(ABORT, 'blocked revision eight'); END;");
    setup.close();

    const database = new Database(path);
    try { expect(() => migrateCurrentSchema(database)).toThrow(/blocked revision eight/i); } finally { database.close(); }

    const source = new Database(path, { readonly: true });
    try {
      expect(source.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 7 });
      expect(source.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name IN ('legacy_imports','legacy_project_mappings','legacy_import_rows')").get()).toEqual({ count: 0 });
      expect(source.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'seven'").all()).toEqual([{ memory_id: 'memory-1' }]);
    } finally { source.close(); }
    expect(existsSync(preV8BackupPath(path))).toBe(true);

    const retry = new Database(path);
    try {
      retry.exec('DROP TRIGGER reject_revision_eight');
      expect(() => migrateCurrentSchema(retry)).not.toThrow();
      expect(retry.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 10 });
    } finally { retry.close(); }
  });

  it('rejects a stale pre-v8 backup after the revision-7 database changes', () => {
    const path = fixturePath();
    createRevisionSevenFixture(path);
    const first = new Database(path);
    first.exec("CREATE TRIGGER reject_revision_eight BEFORE INSERT ON schema_migrations WHEN new.version=8 BEGIN SELECT RAISE(ABORT, 'blocked revision eight'); END;");
    try { expect(() => migrateCurrentSchema(first)).toThrow(/blocked revision eight/i); }
    finally { first.close(); }

    const changed = new Database(path);
    try {
      changed.exec('DROP TRIGGER reject_revision_eight');
      changed.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-after-failure', 'after-failure', 'After failure', null, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z');
      expect(() => migrateCurrentSchema(changed)).toThrow(/pre-v8 backup.*current revision 7 state/i);
      expect(changed.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 7 });
      expect(changed.prepare('SELECT id FROM projects WHERE id=?').get('project-after-failure')).toEqual({ id: 'project-after-failure' });
    } finally { changed.close(); }
  });

  it('rejects a stale pre-v8 backup when only the change watermark sequence advances', () => {
    const path = fixturePath();
    createRevisionSevenFixture(path);
    const first = new Database(path);
    first.exec("CREATE TRIGGER reject_revision_eight BEFORE INSERT ON schema_migrations WHEN new.version=8 BEGIN SELECT RAISE(ABORT, 'blocked revision eight'); END;");
    try { expect(() => migrateCurrentSchema(first)).toThrow(/blocked revision eight/i); }
    finally { first.close(); }

    const changed = new Database(path);
    const backup = new Database(preV8BackupPath(path), { readonly: true, fileMustExist: true });
    try {
      changed.exec('DROP TRIGGER reject_revision_eight');
      const priorRows = changed.prepare('SELECT * FROM change_watermark ORDER BY id').all();
      expect(backup.prepare("SELECT seq FROM sqlite_sequence WHERE name='change_watermark'").get()).toEqual({ seq: 1 });

      changed.prepare('INSERT INTO change_watermark(source_id,changed_at) VALUES(?,?)').run('temporary-source', '2026-09-02T00:00:00.000Z');
      changed.prepare('DELETE FROM change_watermark WHERE source_id=?').run('temporary-source');

      expect(changed.prepare('SELECT * FROM change_watermark ORDER BY id').all()).toEqual(priorRows);
      expect(changed.prepare("SELECT seq FROM sqlite_sequence WHERE name='change_watermark'").get()).toEqual({ seq: 2 });
      expect(() => migrateCurrentSchema(changed)).toThrow(/pre-v8 backup.*current revision 7 state/i);
      expect(changed.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 7 });
    } finally { backup.close(); changed.close(); }
  });

  it('holds a write reservation from final pre-v8 backup verification through migration commit', () => {
    const path = fixturePath();
    createRevisionSevenFixture(path);
    const migrator = new Database(path);
    const contender = new Database(path, { timeout: 0 });
    let lockObserved = false;
    try {
      migrateCurrentSchema(migrator, {
        afterRevisionSevenBackupVerified: () => {
          expect(() => contender.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run(
            'project-contender', 'contender', 'Contender', null, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z',
          )).toThrow(/locked|busy/i);
          lockObserved = true;
        },
      });
      expect(lockObserved).toBe(true);
      const backup = new Database(preV8BackupPath(path), { readonly: true, fileMustExist: true });
      try {
        expect(backup.prepare('SELECT id FROM projects ORDER BY id').all()).toEqual(migrator.prepare('SELECT id FROM projects ORDER BY id').all());
        expect(backup.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 7 });
      } finally { backup.close(); }
      expect(contender.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run(
        'project-contender', 'contender', 'Contender', null, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z',
      ).changes).toBe(1);
    } finally { contender.close(); migrator.close(); }
  });
});
