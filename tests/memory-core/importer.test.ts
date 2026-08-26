import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { importLegacyV1, LegacyImportFailure } from '../../src/memory-core/import/legacy-v1.js';
function createLegacy(path: string): void {
  const db = new Database(path);
  db.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,project TEXT,directory TEXT,started_at TEXT,ended_at TEXT,summary TEXT);
    CREATE TABLE user_prompts(id INTEGER PRIMARY KEY,session_id TEXT,content TEXT,project TEXT,created_at TEXT);
    CREATE TABLE observations(id INTEGER PRIMARY KEY,session_id TEXT,type TEXT,title TEXT,content TEXT,project TEXT,topic_key TEXT,created_at TEXT,deleted_at TEXT);
    CREATE TABLE kg_triples(id INTEGER PRIMARY KEY,subject TEXT);
    CREATE TABLE vector_embeddings(id INTEGER PRIMARY KEY,embedding BLOB);`);
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('s1', 'alpha', null, '2025-01-01T00:00:00.000Z', null, null);
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('s2', 'unknown', null, '2025-01-01T00:00:00.000Z', null, null);
  db.prepare('INSERT INTO user_prompts VALUES(?,?,?,?,?)').run(1, 's1', 'root request', 'alpha', '2025-01-01T00:00:00.000Z');
  db.prepare('INSERT INTO user_prompts VALUES(?,?,?,?,?)').run(2, 'missing', 'quarantine me', 'unassigned', '2025-01-01T00:00:00.000Z');
  db.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?)').run(1, 's1', 'decision', 'Choice', 'Choose SQLite', 'alpha', 'db/choice', '2025-01-01T00:00:01.000Z', null);
  db.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?)').run(2, 's1', 'learning', 'Deleted', 'Old answer', 'alpha', null, '2025-01-01T00:00:02.000Z', '2025-01-02T00:00:00.000Z');
  db.prepare('INSERT INTO kg_triples VALUES(?,?)').run(1, 'derived');
  db.prepare('INSERT INTO vector_embeddings VALUES(?,?)').run(1, Buffer.from([1, 2, 3]));
  db.close();
}

function logicalRows(path: string): unknown {
  const db = new Database(path, { readonly: true });
  try {
    return {
      projects: db.prepare('SELECT id,identity_key,display_name FROM projects ORDER BY id').all(),
      sessions: db.prepare('SELECT id,project_id,root_session_key,harness FROM sessions ORDER BY id').all(),
      evidence: db.prepare('SELECT id,project_id,session_id,kind,content,source_ref,captured_at FROM evidence ORDER BY id').all(),
      memories: db.prepare('SELECT id,project_id,topic_key,kind,title,content,outcome,status FROM memories ORDER BY id').all(),
    };
  } finally { db.close(); }
}

describe('one-way legacy importer', () => {
  it('keeps the supported source read-only and imports only authoritative rows with quarantine', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-'));
    const source = join(root, 'legacy.sqlite'); const target = join(root, 'memory.sqlite');
    createLegacy(source);
    const before = createHash('sha256').update(readFileSync(source)).digest('hex');
    try {
      const report = importLegacyV1({ sourcePath: source, targetPath: target });
      expect(report).toMatchObject({ schema: 'thoth-mem.import', sourceHash: before, imported: { sessions: 1, prompts: 1, observations: 1 }, skipped: 1, quarantined: 2, ignoredDerived: { tables: ['kg_triples', 'vector_embeddings'], rows: 2 }, integrity: { foreignKeys: true, fts: true }, sourceUnchanged: true });
      expect(report).toMatchObject({ reportVersion: 2, sourceSchemaVersion: 'legacy-v1', targetSchemaVersion: 2, committed: true, dispositions: { sessions: { imported: 1, quarantined: 1 }, prompts: { imported: 1, quarantined: 1 }, observations: { imported: 1, skipped: 1 } } });
      expect(report.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); expect(report.finishedAt).toBe(report.startedAt);
      expect(report.dispositionReasons).toEqual(['observations:2:deleted', 'sessions:s2:placeholder_identity', 'user_prompts:2:placeholder_identity']);
      expect(createHash('sha256').update(readFileSync(source)).digest('hex')).toBe(before);
      const targetDb = new Database(target, { readonly: true });
      expect(targetDb.prepare("SELECT count(*) AS count FROM memories WHERE content='derived'").get()).toEqual({ count: 0 });
      targetDb.close();
      expect(() => importLegacyV1({ sourcePath: source, targetPath: source })).toThrow(/distinct/i);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('produces identical dispositions and stable logical identifiers in two fresh targets', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-deterministic-'));
    const source = join(root, 'legacy.sqlite'); const first = join(root, 'first.sqlite'); const second = join(root, 'second.sqlite');
    createLegacy(source);
    try {
      const one = importLegacyV1({ sourcePath: source, targetPath: first });
      const two = importLegacyV1({ sourcePath: source, targetPath: second });
      expect({ ...one, targetPath: undefined }).toEqual({ ...two, targetPath: undefined });
      expect(logicalRows(first)).toEqual(logicalRows(second));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('removes its staging database when authoritative mapping fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cleanup-'));
    const source = join(root, 'legacy.sqlite'); const target = join(root, 'memory.sqlite'); createLegacy(source);
    const db = new Database(source); db.prepare('UPDATE user_prompts SET content=? WHERE id=1').run('<private>secret</private>'); db.close();
    try {
      let failure: LegacyImportFailure | undefined; try { importLegacyV1({ sourcePath: source, targetPath: target }); } catch (error) { failure = error as LegacyImportFailure; }
      expect(failure).toBeInstanceOf(LegacyImportFailure);
      expect(failure?.report).toMatchObject({ schema: 'thoth-mem.import', reportVersion: 2, committed: false, failed: 1, errors: [{ code: 'MAPPING_FAILED' }] });
      expect(JSON.stringify(failure?.report).length).toBeLessThan(5_000);
      expect(existsSync(target)).toBe(false);
      expect(readdirSync(root).filter((name) => name.includes('.importing-'))).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
