import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, linkSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MemoryService } from '../../src/memory-core/service.js';
import { migrateCurrentSchema, preV10BackupPath, preV11BackupPath, preV4BackupPath, preV6BackupPath, preV7BackupPath, preV8BackupPath, preV9BackupPath, REVISION_ELEVEN_EMPTY_SESSIONS_SQL, SQLITE_SCHEMA_REVISION } from '../../src/memory-core/sqlite/migrations.js';
import { CURRENT_SCHEMA_SQL, LEGACY_IMPORT_AUDIT_SCHEMA_SQL, LEGACY_IMPORT_COHORT_SCHEMA_SQL, PROJECT_ALIAS_SCHEMA_SQL, REVISION_FIVE_SCHEMA_SQL, REVISION_FOUR_SCHEMA_SQL, REVISION_SIX_SCHEMA_SQL, REVISION_THREE_SCHEMA_SQL } from '../../src/memory-core/sqlite/schema.js';

// Only the filesystem boundary is intercepted; SQLite connections and backups remain real.
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, existsSync: vi.fn(fs.existsSync), linkSync: vi.fn(fs.linkSync) };
});

vi.mock('node:crypto', async (importOriginal) => {
  const crypto = await importOriginal<typeof import('node:crypto')>();
  return { ...crypto, randomUUID: vi.fn(crypto.randomUUID) };
});

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

function createEmptySessionFixture(path: string, revision: 9 | 10): void {
  if (revision === 9) createRevisionNineFixture(path);
  const database = new Database(path);
  const timestamp = '2026-10-19T00:00:00.000Z';
  try {
    database.pragma('foreign_keys = ON');
    if (revision === 10) {
      database.exec(CURRENT_SCHEMA_SQL);
      database.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(10, timestamp);
      database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-1', 'fixture', 'Fixture', null, timestamp, timestamp);
      database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run('evidence-1', 'project-1', null, 'explicit_save', 'source evidence', 'hash-1', null, timestamp, '{}');
      database.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('memory-1', 'project-1', null, 'decision', 'Fixture', 'searchable migration marker', 'succeeded', 'current', timestamp, null, null, timestamp);
      database.prepare('INSERT INTO memory_evidence VALUES(?,?,?)').run('memory-1', 'evidence-1', 'supports');
      database.prepare('INSERT INTO legacy_imports VALUES(?,?,?,?,?,?,?,?,?,?)').run('import-a', 'a'.repeat(64), '{}', 'target', 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64), 'legacy-v1', 'committed', timestamp);
      database.prepare('INSERT INTO legacy_import_cohorts VALUES(?,?)').run('import-a', 1);
    }
    const session = database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)');
    const receipt = database.prepare('INSERT INTO lifecycle_receipts VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    for (const id of ['empty-codex', 'empty-opencode', 'import-empty', 'active-root', 'evidence-only', 'event-only', 'summary-only', 'observation-only', 'review-only', 'legacy-only', 'receipt-evidence-only', 'receipt-summary-only', ...(revision === 10 ? ['empty-pi'] : [])]) {
      const harness = id === 'import-empty' ? 'import' : id === 'empty-pi' ? 'pi' : id === 'empty-opencode' ? 'opencode' : 'codex';
      session.run(id, 'project-1', id, harness, 'ended', timestamp, timestamp, 0);
      for (const operation of ['enroll', 'recover', 'finalize']) receipt.run(harness, 'project-1', id, operation, operation, 'payload', 'confirmed', timestamp, null, null, null);
    }
    const evidence = database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)');
    evidence.run('active-root', 'project-1', 'active-root', 'root_prompt', 'Attributed root prompt.', 'hash', null, timestamp, '{}');
    database.prepare('INSERT INTO session_events VALUES(?,?,?,?,?,?,?)').run('active-root', 'active-root', 1, 'user', 'root_user', 'session', 'standard');
    evidence.run('evidence-only', 'project-1', 'evidence-only', 'explicit_save', 'Evidence without an event.', 'hash', null, timestamp, '{}');
    database.prepare('INSERT INTO save_receipts VALUES(?,?,?,?,?)').run('project-1', 'save', 'payload', 'evidence-only', 'memory-1');
    evidence.run('event-only', 'project-1', null, 'root_prompt', 'Prompt event.', 'hash', null, timestamp, '{}');
    evidence.run('summary-only', 'project-1', null, 'session_summary', 'Submission.', 'hash', null, timestamp, '{}');
    evidence.run('observation-only', 'project-1', null, 'observation', 'Candidate.', 'hash', null, timestamp, '{}');
    evidence.run('review-only', 'project-1', null, 'observation_review', 'Review.', 'hash', null, timestamp, '{}');
    // Exercise each independent FK, including historical rows without redundant evidence attribution.
    const guards = ['session_event_scope_guard', 'session_summary_scope_guard', 'observation_review_scope_guard'].map((name) => {
      const row = database.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(name) as { sql: string };
      database.exec(`DROP TRIGGER ${name}`);
      return row.sql;
    });
    database.prepare('INSERT INTO session_events VALUES(?,?,?,?,?,?,?)').run('event-only', 'event-only', 1, 'user', 'root_user', 'session', 'standard');
    database.prepare('INSERT INTO session_summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('summary-only', 'project-1', 'summary-only', 'summary-only', 'final', 1, 'current', 1, 1, 'harness', 'fixture', null, null, null, timestamp);
    database.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('observation-only', 'project-1', 'observation-only', 'observation-only', null, 'project', null, null, 'result', 'Candidate', 'Preserved claim.', 'discovery', 'Discovery', 'Content.', null, 'unknown', 'harness', 'fixture', null, null, timestamp);
    database.prepare('INSERT INTO observation_reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('review-only', 'observation-only', 'review-only', 'review-only', 'agent', 'root_user', 'rejected', 'independent_review', 'fixture', '1', 'Preserved review.', timestamp);
    for (const sql of guards) database.exec(sql);
    database.prepare('INSERT INTO legacy_import_rows VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('import-a', 'session', 'legacy-only', 0, '3'.repeat(64), null, 'imported', 'imported', 'project-1', 'legacy-only', null, null, timestamp);
    receipt.run('codex', 'project-1', 'receipt-evidence-only', 'capture', 'capture_root', 'payload', 'confirmed', timestamp, null, 'evidence-1', null);
    receipt.run('codex', 'project-1', 'receipt-summary-only', 'summary', 'finalize', 'payload', 'confirmed', timestamp, null, null, 'summary-only');
    // Composite identity must not conflate another harness/project with an empty root.
    session.run('other-harness', 'project-1', 'empty-codex', 'claude', 'active', timestamp, null, 0);
    receipt.run('claude', 'project-1', 'empty-codex', 'capture', 'capture_root', 'payload', 'confirmed', timestamp, null, 'evidence-1', null);
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-2', 'other', 'Other', null, timestamp, timestamp);
    session.run('other-project', 'project-2', 'empty-codex', 'codex', 'active', timestamp, null, 0);
    receipt.run('codex', 'project-2', 'empty-codex', 'capture', 'capture_root', 'payload', 'confirmed', timestamp, null, 'evidence-1', null);
    receipt.run('codex', 'project-1', 'no-session', 'enroll', 'enroll', 'payload', 'confirmed', timestamp, null, null, null);
    expect(database.pragma('foreign_key_check')).toEqual([]);
  } finally { database.close(); }
}

function createScaleRevisionTenFixture(path: string): void {
  const database = new Database(path);
  const timestamp = '2026-10-19T00:00:00.000Z';
  try {
    database.pragma('foreign_keys = ON');
    database.exec(CURRENT_SCHEMA_SQL);
    database.transaction(() => {
      database.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(10, timestamp);
      database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('scale-project', 'scale', 'Scale', null, timestamp, timestamp);
      database.prepare('INSERT INTO legacy_imports VALUES(?,?,?,?,?,?,?,?,?,?)').run('scale-import', 'a'.repeat(64), '{}', 'target', 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64), 'legacy-v1', 'committed', timestamp);
      database.prepare('INSERT INTO legacy_import_cohorts VALUES(?,?)').run('scale-import', 1);
      const session = database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)');
      const receipt = database.prepare('INSERT INTO lifecycle_receipts VALUES(?,?,?,?,?,?,?,?,?,?,?)');
      for (let index = 0; index < 8_000; index++) {
        const id = `scale-${index}`;
        const harness = index >= 4_000 && index < 5_000 ? 'import' : index % 2 === 0 ? 'pi' : 'codex';
        session.run(id, 'scale-project', id, harness, 'ended', timestamp, timestamp, 0);
        for (const operation of ['enroll', 'recover', 'finalize']) receipt.run(harness, 'scale-project', id, operation, operation, 'payload', 'confirmed', timestamp, null, null, null);
      }
      const evidence = database.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)');
      for (let index = 0; index < 25_000; index++) {
        evidence.run(`scale-evidence-${index}`, 'scale-project', index < 24_000 ? `scale-${5_000 + index % 2_000}` : null, 'explicit_save', 'Scale evidence.', 'hash', null, timestamp, '{}');
      }
      const legacy = database.prepare('INSERT INTO legacy_import_rows VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
      for (let index = 0; index < 30_000; index++) {
        legacy.run('scale-import', 'session', `legacy-${index}`, 0, 'e'.repeat(64), null, 'imported', 'imported', 'scale-project', index < 29_000 ? `scale-${7_000 + index % 1_000}` : null, null, null, timestamp);
      }
    })();
  } finally { database.close(); }
}

const revisionFixtures = {
  2: createRevisionThreeFixture,
  3: createRevisionThreeFixture,
  4: createRevisionFourFixture,
  5: createRevisionFiveFixture,
  6: createRevisionSixFixture,
  7: createRevisionSevenFixture,
  8: createRevisionEightFixture,
  9: createRevisionNineFixture,
  10: (path: string) => createEmptySessionFixture(path, 10),
};
const revisionBackupPaths = {
  3: preV4BackupPath, 5: preV6BackupPath, 6: preV7BackupPath, 7: preV8BackupPath,
  8: preV9BackupPath, 9: preV10BackupPath, 10: preV11BackupPath,
};

afterEach(() => {
  vi.mocked(randomUUID).mockReset();
  vi.mocked(existsSync).mockReset();
  vi.mocked(linkSync).mockReset();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// File-backed backups and VACUUM INTO make these slower than the default timeout under full-suite load.
describe('SQLite current schema migrations', { timeout: 30_000 }, () => {
  it('reports the failing revision with bounded observed detail and manual recovery guidance', () => {
    const path = fixturePath(); createEmptySessionFixture(path, 10);
    const database = new Database(path);
    try {
      let failure: unknown;
      try { migrateCurrentSchema(database, { afterRevisionTenBackupVerified: () => { throw new Error(`injected failure\n${'🧠'.repeat(1_000)}`); } }); }
      catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error);
      const message = (failure as Error).message;
      expect(message).toMatch(/^SQLite migration revision 10→11 failed: injected failure /u);
      expect(message).toContain('Run `thoth-mem migrate` to complete migrations without host timeouts.');
      expect(message).not.toMatch(/[\r\n\u2028\u2029]/u);
      expect(message.length).toBeLessThanOrEqual(500);
      expect(message).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
    } finally { database.close(); }
  });

  it('names the failed step rather than the initial revision when an earlier step already committed', () => {
    const path = fixturePath(); createRevisionThreeFixture(path);
    const database = new Database(path);
    try {
      expect(() => migrateCurrentSchema(database, { afterRevisionSevenBackupVerified: () => { throw new Error('injected later-step failure'); } })).toThrow('SQLite migration revision 7→8 failed: injected later-step failure. Run `thoth-mem migrate` to complete migrations without host timeouts.');
      expect(database.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 7 });
    } finally { database.close(); }
  });

  it('surfaces an actionable migration error from MemoryService construction', () => {
    const path = fixturePath(); createEmptySessionFixture(path, 10);
    copyFileSync(path, preV11BackupPath(path));
    const backup = new Database(preV11BackupPath(path));
    try { backup.prepare("UPDATE projects SET display_name='Mismatched backup'").run(); }
    finally { backup.close(); }
    expect(() => new MemoryService({ databasePath: path })).toThrow('SQLite migration revision 10→11 failed: SQLite pre-v11 backup does not match the locked revision 10 source. Run `thoth-mem migrate` to complete migrations without host timeouts.');
  });

  it.each(['DELETE', 'WAL'])('reports an observed migration lock during %s startup without guessing its cause', (journalMode) => {
    const path = fixturePath(); createEmptySessionFixture(path, 10);
    copyFileSync(path, preV11BackupPath(path));
    const lockHolder = new Database(path);
    try {
      lockHolder.pragma(`journal_mode = ${journalMode}`);
      lockHolder.exec('BEGIN IMMEDIATE');
      expect(() => new MemoryService({ databasePath: path })).toThrow('SQLite migration revision 10→11 failed: database is locked by another process. Run `thoth-mem migrate` to complete migrations without host timeouts.');
    } finally { lockHolder.exec('ROLLBACK'); lockHolder.close(); }
  });

  it('preserves foreign unique and legacy temporary files for every backup revision', () => {
    const path = fixturePath(); createRevisionThreeFixture(path);
    const backupPaths = Object.values(revisionBackupPaths).map((backupPath) => backupPath(path));
    const foreignPaths = backupPaths.flatMap((backupPath) => [
      `${backupPath}.tmp`, `${backupPath}.987654.12345678-1234-4234-8234-123456789abc.tmp`,
    ]);
    for (const foreignPath of foreignPaths) writeFileSync(foreignPath, 'another process owns this file');
    const database = new Database(path);
    try {
      expect(migrateCurrentSchema(database).backups).toEqual(backupPaths.map((backupPath) => ({ path: backupPath, status: 'created' })));
      for (const foreignPath of foreignPaths) expect(readFileSync(foreignPath, 'utf8')).toBe('another process owns this file');
      expect(readdirSync(join(path, '..')).filter((name) => name.endsWith('.tmp')).sort()).toEqual(foreignPaths.map((foreignPath) => foreignPath.split(/[\\/]/u).at(-1)).sort());
    } finally { database.close(); }
  });

  it('never removes a foreign temporary file even if its unique name collides', () => {
    const path = fixturePath(); createEmptySessionFixture(path, 10);
    const uuid = '12345678-1234-4234-8234-123456789abc';
    const temporaryPath = `${preV11BackupPath(path)}.${process.pid}.${uuid}.tmp`;
    writeFileSync(temporaryPath, 'foreign candidate');
    vi.mocked(randomUUID).mockReturnValueOnce(uuid);
    const database = new Database(path);
    try {
      const before = exactLogicalRows(database);
      expect(() => migrateCurrentSchema(database)).toThrow();
      expect(exactLogicalRows(database)).toBe(before);
      expect(readFileSync(temporaryPath, 'utf8')).toBe('foreign candidate');
      expect(existsSync(preV11BackupPath(path))).toBe(false);
    } finally { database.close(); }
  });

  it.each([false, true])('verifies a backup published at publication time and rejects mismatched state (%s)', async (mismatched) => {
    const path = fixturePath(); createEmptySessionFixture(path, 10);
    const winnerPath = fixturePath('winner.sqlite'); copyFileSync(path, winnerPath);
    if (mismatched) {
      const winner = new Database(winnerPath);
      try { winner.prepare('DELETE FROM lifecycle_receipts WHERE root_session_key=?').run('no-session'); }
      finally { winner.close(); }
    }
    const winnerBytes = readFileSync(winnerPath);
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    vi.mocked(linkSync).mockImplementationOnce((temporaryPath, backupPath) => {
      expect(String(temporaryPath)).toMatch(new RegExp(`\\.${process.pid}\\.[0-9a-f-]{36}\\.tmp$`, 'u'));
      fs.linkSync(winnerPath, backupPath);
      fs.linkSync(temporaryPath, backupPath); // Real EEXIST: publication must never replace the winner.
    });
    const database = new Database(path);
    try {
      const before = exactLogicalRows(database);
      if (mismatched) {
        expect(() => migrateCurrentSchema(database)).toThrow(/locked revision 10 source/iu);
        expect(exactLogicalRows(database)).toBe(before);
      } else {
        expect(migrateCurrentSchema(database)).toMatchObject({
          backups: [{ path: preV11BackupPath(path), status: 'verified' }], removedSessions: 3, removedReceipts: 9,
        });
      }
      expect(readFileSync(preV11BackupPath(path))).toEqual(winnerBytes);
      expect(readdirSync(join(path, '..')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    } finally { database.close(); }
  });

  it('fails closed without a copy fallback when hard-link publication is unsupported', () => {
    const path = fixturePath(); createEmptySessionFixture(path, 10);
    vi.mocked(linkSync).mockImplementationOnce(() => { throw Object.assign(new Error('not supported'), { code: 'ENOTSUP' }); });
    const database = new Database(path);
    try {
      const before = exactLogicalRows(database);
      expect(() => migrateCurrentSchema(database)).toThrow('SQLite migration revision 10→11 failed: SQLite migration backup cannot be published atomically (hard link required). Run `thoth-mem migrate` to complete migrations without host timeouts.');
      expect(exactLogicalRows(database)).toBe(before);
      expect(existsSync(preV11BackupPath(path))).toBe(false);
      expect(readdirSync(join(path, '..')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    } finally { database.close(); }
  });

  it('treats a winner advancing beyond one revision before the lock as complete with no removals', () => {
    const path = fixturePath(); createEmptySessionFixture(path, 9);
    const database = new Database(path);
    const winner = new Database(path);
    try {
      let winnerApplied = false;
      const report = migrateCurrentSchema(database, { afterRevisionNineBackupVerified: () => {
        expect(migrateCurrentSchema(winner)).toMatchObject({ fromRevision: 9, toRevision: 11, removedSessions: 2, removedReceipts: 6 });
        winnerApplied = true;
      } });
      expect(winnerApplied).toBe(true);
      expect(report).toMatchObject({ fromRevision: 9, toRevision: 11, removedSessions: 0, removedReceipts: 0 });
      expect(database.prepare('SELECT version FROM schema_migrations WHERE version>=9 ORDER BY version').all()).toEqual([{ version: 9 }, { version: 10 }, { version: 11 }]);
      expect(database.pragma('foreign_key_check')).toEqual([]);
    } finally { winner.close(); database.close(); }
  });

  it.each([3, 5, 6, 7, 8, 9, 10] as const)('reuses the winner when revision %i advances after the absent-backup check but before VACUUM', async (revision) => {
    const path = fixturePath();
    revisionFixtures[revision](path);
    const database = new Database(path);
    const winner = new Database(path);
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const backupPath = revisionBackupPaths[revision](path);
    let winnerApplied = false;
    vi.mocked(existsSync).mockImplementation((candidate) => {
      const exists = fs.existsSync(candidate);
      if (candidate === backupPath && !winnerApplied) {
        expect(exists).toBe(false);
        winnerApplied = true;
        migrateCurrentSchema(winner);
      }
      return exists;
    });
    try {
      expect(migrateCurrentSchema(database)).toEqual({
        fromRevision: revision, toRevision: 11, backups: [{ path: backupPath, status: 'verified' }], removedSessions: 0, removedReceipts: 0,
      });
      expect(winnerApplied).toBe(true);
      expect(database.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 11 });
      const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
      try {
        expect(backup.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: revision });
        expect(backup.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
        expect(backup.pragma('foreign_key_check')).toEqual([]);
      } finally { backup.close(); }
      expect(readdirSync(join(path, '..')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    } finally { winner.close(); database.close(); }
  });

  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10] as const)('rechecks revision %i under the immediate lock and continues after a winner applies the next revision', (revision) => {
    const path = fixturePath();
    revisionFixtures[revision](path);
    const winner = new Database(path);
    if (revision === 2) winner.prepare('UPDATE schema_migrations SET version=2 WHERE version=3').run();
    const previousRevisions = winner.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    if (revision < 10) winner.exec(`CREATE TRIGGER pause_winner BEFORE INSERT ON schema_migrations WHEN new.version=${revision + 2} BEGIN SELECT RAISE(ABORT, 'pause winner'); END;`);
    let winnerApplied = false;
    const database = new Database(path, { verbose: (sql) => {
      if (sql !== 'BEGIN IMMEDIATE' || winnerApplied) return;
      winnerApplied = true;
      if (revision < 10) {
        expect(() => migrateCurrentSchema(winner)).toThrow(/pause winner/u);
        winner.exec('DROP TRIGGER pause_winner');
      } else {
        expect(migrateCurrentSchema(winner)).toMatchObject({ removedSessions: 3, removedReceipts: 9 });
      }
      expect(winner.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: revision + 1 });
    } });
    try {
      const report = migrateCurrentSchema(database);
      expect(winnerApplied).toBe(true);
      expect(report).toMatchObject({ fromRevision: revision, toRevision: 11, ...(revision === 10 ? { removedSessions: 0, removedReceipts: 0 } : {}) });
      expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([...previousRevisions, ...Array.from({ length: 11 - revision }, (_, index) => ({ version: revision + index + 1 }))]);
      expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(database.pragma('foreign_key_check')).toEqual([]);
    } finally { winner.close(); database.close(); }
  });

  it('applies revision 11 exactly once across two concurrent child processes with an intact backup', async () => {
    const path = fixturePath(); createEmptySessionFixture(path, 10);
    const moduleUrl = pathToFileURL(join(process.cwd(), 'src/memory-core/sqlite/migrations.ts')).href;
    const script = `
      import Database from 'better-sqlite3';
      import { migrateCurrentSchema } from ${JSON.stringify(moduleUrl)};
      const database = new Database(${JSON.stringify(path)}, { timeout: 1000 });
      process.once('message', () => {
        try { process.stdout.write(JSON.stringify({ report: migrateCurrentSchema(database) })); }
        catch (error) { process.stdout.write(JSON.stringify({ error: { code: error.code, message: error.message } })); }
        finally { database.close(); process.disconnect(); }
      });
      process.send('ready');
    `;
    const launch = () => {
      const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
        cwd: process.cwd(), windowsHide: true, timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      let stdout = ''; let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      const ready = new Promise<void>((resolve, reject) => {
        child.once('message', () => resolve());
        child.once('error', reject);
        child.once('exit', () => reject(new Error(`Migration child exited before ready: ${stderr}`)));
      });
      const done = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code) => resolve({ code, stdout, stderr }));
      });
      return { child, ready, done };
    };
    const children = [launch(), launch()];
    try {
      await Promise.all(children.map(({ ready }) => ready));
      for (const { child } of children) child.send('migrate');
      const results = await Promise.all(children.map(({ done }) => done));
      const outcomes = results.map(({ code, stdout, stderr }) => {
        expect(code, stderr).toBe(0);
        expect(stderr).toBe('');
        return JSON.parse(stdout) as { report?: { toRevision: number; removedSessions: number; removedReceipts: number }; error?: { code: string; message: string } };
      });
      expect(outcomes.filter(({ report }) => report?.removedSessions === 3)).toHaveLength(1);
      expect(outcomes.reduce((total, { report }) => total + (report?.removedReceipts ?? 0), 0)).toBe(9);
      for (const outcome of outcomes) {
        if (outcome.error) {
          expect(outcome.error.code).toMatch(/^SQLITE_BUSY/u);
          expect(outcome.error.message).toMatch(/busy|locked/iu);
          expect(outcome.error.message.length).toBeLessThan(300);
        } else expect(outcome.report?.toRevision).toBe(11);
      }
      const database = new Database(path);
      const backup = new Database(preV11BackupPath(path), { readonly: true, fileMustExist: true });
      try {
        expect(database.prepare('SELECT count(*) AS count FROM schema_migrations WHERE version=11').get()).toEqual({ count: 1 });
        expect(database.prepare('SELECT count(*) AS count FROM sessions').get()).toEqual({ count: 12 });
        expect(backup.prepare('SELECT count(*) AS count FROM sessions').get()).toEqual({ count: 15 });
        expect(backup.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 10 });
        for (const connection of [database, backup]) {
          expect(connection.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
          expect(connection.pragma('foreign_key_check')).toEqual([]);
        }
        expect(readdirSync(join(path, '..')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
      } finally { backup.close(); database.close(); }
    } finally {
      for (const { child } of children) if (child.exitCode === null) child.kill();
      await Promise.allSettled(children.map(({ done }) => done));
    }
  });

  it.each([9, 10] as const)('reports revision %i upgrades, backup creation, and exact cleanup counts', (revision) => {
    const path = fixturePath(); createEmptySessionFixture(path, revision);
    const database = new Database(path);
    try {
      expect(migrateCurrentSchema(database)).toEqual({
        fromRevision: revision,
        toRevision: 11,
        backups: [
          ...(revision === 9 ? [{ path: preV10BackupPath(path), status: 'created' }] : []),
          { path: preV11BackupPath(path), status: 'created' },
        ],
        removedSessions: revision === 9 ? 2 : 3,
        removedReceipts: revision === 9 ? 6 : 9,
      });
      expect(migrateCurrentSchema(database)).toEqual({ fromRevision: 11, toRevision: 11, backups: [], removedSessions: 0, removedReceipts: 0 });
    } finally { database.close(); }
  });

  it('keeps the startup migration report on MemoryService and reports fresh/current opens as no-ops', () => {
    const path = fixturePath(); createEmptySessionFixture(path, 10);
    copyFileSync(path, preV11BackupPath(path));
    const migrated = new MemoryService({ databasePath: path });
    try {
      expect(migrated.migrationReport).toEqual({
        fromRevision: 10, toRevision: 11,
        backups: [{ path: preV11BackupPath(path), status: 'verified' }],
        removedSessions: 3, removedReceipts: 9,
      });
    } finally { migrated.close(); }
    const noOp = { fromRevision: 11, toRevision: 11, backups: [], removedSessions: 0, removedReceipts: 0 };
    for (const databasePath of [path, fixturePath(), ':memory:']) {
      const service = new MemoryService({ databasePath });
      try { expect(service.migrationReport).toEqual(noOp); }
      finally { service.close(); }
    }
    const readonly = new MemoryService({ databasePath: path, readonly: true });
    try { expect(readonly.migrationReport).toBeNull(); }
    finally { readonly.close(); }
  });

  it('selects empty sessions without correlated scans of unindexed referencing tables', () => {
    const path = fixturePath(); createEmptySessionFixture(path, 10);
    const database = new Database(path);
    try {
      const plan = database.prepare(`EXPLAIN QUERY PLAN ${REVISION_ELEVEN_EMPTY_SESSIONS_SQL}`).all() as Array<{ id: number; parent: number; detail: string }>;
      const byId = new Map(plan.map((row) => [row.id, row]));
      const isCorrelated = (row: typeof plan[number]): boolean => {
        if (/CORRELATED/iu.test(row.detail)) return true;
        const parent = byId.get(row.parent);
        return parent ? isCorrelated(parent) : false;
      };
      const expensiveScans = plan.filter((row) => /SCAN (?:evidence|legacy_import_rows|observation_reviews)\b/iu.test(row.detail));
      expect(expensiveScans.length).toBeGreaterThan(0);
      expect(expensiveScans.filter(isCorrelated)).toEqual([]);
      expect(plan.filter((row) => /CORRELATED/iu.test(row.detail))).toHaveLength(1);
      expect(plan.some((row) => /SEARCH r USING INDEX .*\(harness=\? AND project_id=\? AND root_session_key=\?\)/iu.test(row.detail))).toBe(true);
    } finally { database.close(); }
  });

  it.each([9, 10] as const)('removes only unreferenced non-import sessions from revision %i with an exact backup and idempotent reopen', (revision) => {
    const path = fixturePath(); createEmptySessionFixture(path, revision);
    const database = new Database(path);
    const beforeOtherRows = exactLogicalRows(database, ['schema_migrations', 'sessions', 'lifecycle_receipts']);
    const emptyIds = ['empty-codex', 'empty-opencode', 'empty-pi'];
    const beforeSessions = database.prepare('SELECT * FROM sessions ORDER BY id').all() as Array<{ id: string }>;
    const beforeReceipts = database.prepare('SELECT * FROM lifecycle_receipts ORDER BY harness,project_id,root_session_key,event_key,operation').all() as Array<{ root_session_key: string; harness: string; project_id: string }>;
    const removedRoots = new Set(['codex:project-1:empty-codex', 'opencode:project-1:empty-opencode', 'pi:project-1:empty-pi']);
    try {
      migrateCurrentSchema(database);
      expect(database.prepare('SELECT * FROM sessions ORDER BY id').all()).toEqual(beforeSessions.filter((row) => !emptyIds.includes(row.id)));
      expect(database.prepare('SELECT * FROM lifecycle_receipts ORDER BY harness,project_id,root_session_key,event_key,operation').all()).toEqual(beforeReceipts.filter((row) => !removedRoots.has(`${row.harness}:${row.project_id}:${row.root_session_key}`)));
      expect(exactLogicalRows(database, ['schema_migrations', 'sessions', 'lifecycle_receipts'])).toBe(beforeOtherRows);
      expect(database.prepare('SELECT version FROM schema_migrations WHERE version>=9 ORDER BY version').all()).toEqual([{ version: 9 }, { version: 10 }, { version: 11 }].filter((row) => row.version >= revision));
      expect(database.prepare("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH 'search*'").all()).toEqual([{ memory_id: 'memory-1' }]);
      expect(database.pragma('foreign_key_check')).toEqual([]);
      expect(database.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
      const after = exactLogicalRows(database);
      migrateCurrentSchema(database);
      expect(exactLogicalRows(database)).toBe(after);
    } finally { database.close(); }
    const backup = new Database(preV11BackupPath(path), { readonly: true, fileMustExist: true });
    try {
      expect(backup.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 10 });
      expect(backup.prepare('SELECT * FROM sessions ORDER BY id').all()).toEqual(beforeSessions);
      expect(backup.prepare('SELECT * FROM lifecycle_receipts ORDER BY harness,project_id,root_session_key,event_key,operation').all()).toEqual(beforeReceipts);
      expect(exactLogicalRows(backup, ['schema_migrations', 'sessions', 'lifecycle_receipts'])).toBe(beforeOtherRows);
      expect(backup.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    } finally { backup.close(); }
  });

  it('migrates 8000 sessions with 25000 evidence and 30000 legacy rows within a generous bound', () => {
    const path = fixturePath(); createScaleRevisionTenFixture(path);
    const database = new Database(path);
    try {
      const before = database.prepare('SELECT id FROM sessions').all() as Array<{ id: string }>;
      const started = performance.now();
      migrateCurrentSchema(database);
      const elapsedMs = performance.now() - started;
      console.info(`Revision 10->11 synthetic migration: ${elapsedMs.toFixed(1)} ms`);
      // Includes backup + verification + locked state comparison, but not fixture construction.
      // 15 seconds is deliberately generous for shared Windows/CI runners; plan coverage is deterministic.
      expect(elapsedMs).toBeLessThan(15_000);
      const remaining = database.prepare('SELECT id FROM sessions').all() as Array<{ id: string }>;
      const remainingIds = new Set(remaining.map((row) => row.id));
      expect(before.filter((row) => !remainingIds.has(row.id)).map((row) => row.id).sort()).toEqual(Array.from({ length: 4_000 }, (_, index) => `scale-${index}`).sort());
      expect(remaining).toHaveLength(4_000);
      const receiptRoots = database.prepare('SELECT DISTINCT root_session_key FROM lifecycle_receipts ORDER BY root_session_key').all();
      expect(receiptRoots).toEqual(Array.from({ length: 4_000 }, (_, index) => `scale-${4_000 + index}`).sort().map((id) => ({ root_session_key: id })));
      expect(database.prepare('SELECT count(*) AS count FROM lifecycle_receipts').get()).toEqual({ count: 12_000 });
      expect(database.prepare('SELECT count(*) AS count FROM evidence').get()).toEqual({ count: 25_000 });
      expect(database.prepare('SELECT count(*) AS count FROM legacy_import_rows').get()).toEqual({ count: 30_000 });
      expect(database.pragma('foreign_key_check')).toEqual([]);
      expect(database.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 11 });
      expect(existsSync(preV11BackupPath(path))).toBe(true);
    } finally { database.close(); }
  });

  it('disables foreign-key enforcement only around the verified revision-11 cleanup transaction', () => {
    const path = fixturePath(); createEmptySessionFixture(path, 10);
    const database = new Database(path);
    try {
      migrateCurrentSchema(database, { afterRevisionTenBackupVerified: () => {
        expect(database.inTransaction).toBe(true);
        expect(database.pragma('foreign_keys', { simple: true })).toBe(0);
      } });
      expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(database.pragma('foreign_key_check')).toEqual([]);
    } finally { database.close(); }
  });

  it('holds a write reservation from pre-v11 backup verification through cleanup commit', () => {
    const path = fixturePath(); createEmptySessionFixture(path, 10);
    const database = new Database(path);
    const contender = new Database(path, { timeout: 0 });
    let lockObserved = false;
    try {
      migrateCurrentSchema(database, { afterRevisionTenBackupVerified: () => {
        expect(() => contender.prepare('DELETE FROM sessions WHERE id=?').run('empty-codex')).toThrow(/locked|busy/iu);
        lockObserved = true;
      } });
      expect(lockObserved).toBe(true);
      expect(database.prepare('SELECT count(*) AS count FROM sessions WHERE id=?').get('empty-codex')).toEqual({ count: 0 });
      expect(contender.prepare('DELETE FROM lifecycle_receipts WHERE root_session_key=?').run('no-session').changes).toBe(1);
    } finally { contender.close(); database.close(); }
  });

  it('rolls revision 11 cleanup back completely when its migration record cannot commit', () => {
    const path = fixturePath(); createEmptySessionFixture(path, 10);
    const database = new Database(path);
    try {
      database.exec("CREATE TRIGGER reject_revision_eleven BEFORE INSERT ON schema_migrations WHEN new.version=11 BEGIN SELECT RAISE(ABORT, 'blocked revision eleven'); END;");
      const before = exactLogicalRows(database);
      expect(() => migrateCurrentSchema(database)).toThrow(/blocked revision eleven/iu);
      expect(exactLogicalRows(database)).toBe(before);
      expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(existsSync(preV11BackupPath(path))).toBe(true);
      database.exec('DROP TRIGGER reject_revision_eleven');
      migrateCurrentSchema(database);
      expect(database.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 11 });
    } finally { database.close(); }
  });

  it('rejects foreign-key failures before recording revision 11 and restores enforcement after rollback', () => {
    const path = fixturePath(); createEmptySessionFixture(path, 10);
    const database = new Database(path);
    try {
      const before = exactLogicalRows(database);
      // A record-trigger failure would mask a late FK check: the verification must win first.
      database.exec("CREATE TRIGGER reject_revision_eleven BEFORE INSERT ON schema_migrations WHEN new.version=11 BEGIN SELECT RAISE(ABORT, 'revision recorded before verification'); END;");
      expect(() => migrateCurrentSchema(database, { afterRevisionTenBackupVerified: () => {
        database.exec('DROP TRIGGER evidence_immutable_update');
        database.prepare('UPDATE evidence SET session_id=? WHERE id=?').run('missing-session', 'evidence-1');
      } })).toThrow(/revision 11 migration failed foreign-key verification/iu);
      expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(database.pragma('foreign_key_check')).toEqual([]);
      expect(exactLogicalRows(database)).toBe(before);
      expect(database.prepare("SELECT name FROM sqlite_temp_master WHERE name='revision_eleven_empty_sessions'").all()).toEqual([]);
    } finally { database.close(); }
  });

  it('rejects a mismatched pre-v11 backup before deleting any session or receipt', () => {
    const path = fixturePath(); const foreign = fixturePath('foreign.sqlite');
    createEmptySessionFixture(path, 10); createEmptySessionFixture(foreign, 10);
    const other = new Database(foreign);
    other.prepare('DELETE FROM lifecycle_receipts WHERE root_session_key=?').run('no-session');
    other.close();
    copyFileSync(foreign, preV11BackupPath(path));
    const database = new Database(path);
    try {
      const before = exactLogicalRows(database);
      expect(() => migrateCurrentSchema(database)).toThrow(/locked revision 10 source/iu);
      expect(exactLogicalRows(database)).toBe(before);
    } finally { database.close(); }
  });

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
      expect(database.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 11 });
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
      expect(SQLITE_SCHEMA_REVISION).toBe(11);
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
      expect(SQLITE_SCHEMA_REVISION).toBe(11);
      expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }, { version: 11 }]);
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
  it('creates revision 11 directly with aliases, observation projections, import audit state, and shared prefix indexes', () => {
    const path = fixturePath();
    for (const target of [path, ':memory:']) {
      const database = new Database(target);
      try {
        migrateCurrentSchema(database);
        expect(SQLITE_SCHEMA_REVISION).toBe(11);
        expect(database.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 11 });
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
      expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 3 }, { version: 4 }, { version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }, { version: 11 }]);
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
      expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 4 }, { version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }, { version: 11 }]);
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
      expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }, { version: 11 }]);
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
      expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }, { version: 11 }]);
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
      expect(retry.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 11 });
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
