import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCli } from '../../src/cli.js';
import { parseImportPlan } from '../../src/memory-core/import/legacy-v1.js';
import { MemoryService } from '../../src/memory-core/service.js';
import { migrateCurrentSchema } from '../../src/memory-core/sqlite/migrations.js';

function createLegacy(path: string): void {
  const database = new Database(path);
  database.exec(`
    CREATE TABLE sessions(id TEXT PRIMARY KEY,project TEXT,directory TEXT,started_at TEXT,ended_at TEXT,summary TEXT);
    CREATE TABLE user_prompts(id INTEGER PRIMARY KEY,session_id TEXT,content TEXT,project TEXT,created_at TEXT);
    CREATE TABLE observations(id INTEGER PRIMARY KEY,session_id TEXT,type TEXT,title TEXT,content TEXT,project TEXT,topic_key TEXT,created_at TEXT,deleted_at TEXT);
    INSERT INTO sessions VALUES('session-1','alpha',NULL,'2025-01-01T00:00:00.000Z',NULL,NULL);
  `);
  database.close();
}

function addLegacyVersionHistory(path: string): void {
  const database = new Database(path);
  database.exec(`
    CREATE TABLE observation_versions(
      id INTEGER PRIMARY KEY,
      observation_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO observations VALUES(1,'session-1','decision','Current title','Current content','alpha','topic/history','2025-01-03T00:00:00.000Z',NULL);
    INSERT INTO observation_versions VALUES(1,1,'First title','First content','decision',1,'2025-01-01T00:00:00.000Z');
    INSERT INTO observation_versions VALUES(2,1,'Second title','Second content','decision',2,'2025-01-02T00:00:00.000Z');
  `);
  database.close();
}

function addLegacyTaxonomyCases(path: string): void {
  const database = new Database(path);
  database.exec(`
    CREATE TABLE observation_versions(
      id INTEGER PRIMARY KEY,
      observation_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO observations VALUES(1,'session-1','bugfix','Current bugfix','Fixed durable import behavior','alpha','topic/bugfix','2025-01-02T00:00:00.000Z',NULL);
    INSERT INTO observation_versions VALUES(1,1,'Earlier bugfix','Diagnosed durable import behavior','bugfix',1,'2025-01-01T00:00:00.000Z');
    INSERT INTO observations VALUES(2,'session-1','manual','Legacy manual','Manual-only instructions','alpha','topic/manual','2025-01-03T00:00:00.000Z',NULL);
    INSERT INTO observations VALUES(3,'session-1','pattern','Legacy pattern','Pattern-only instructions','alpha','topic/pattern','2025-01-04T00:00:00.000Z',NULL);
  `);
  database.close();
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

afterEach(() => vi.restoreAllMocks());

describe('import-legacy plan CLI boundary', () => {
  it('writes one closed v3 plan to an explicit new path and leaves both databases unchanged', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    const planPath = join(root, 'plan.json');
    const mappingPath = join(root, 'mapping.json');
    createLegacy(source);
    const sourceBefore = sha256(source);
    writeFileSync(mappingPath, `${JSON.stringify({ schema: 'thoth-mem.import.mapping.v1', version: 1, mappings: [] })}\n`);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', 'plan', '--source', source, '--target', target, '--plan', planPath, '--map', mappingPath])).toBe(0);
      const plan = parseImportPlan(JSON.parse(readFileSync(planPath, 'utf8')));
      expect(plan).toMatchObject({ schema: 'thoth-mem.import.plan.v3', version: 3, target: { absent: true, schemaRevision: null } });
      expect(sha256(source)).toBe(sourceBefore);
      expect(() => readFileSync(target)).toThrow();
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('plans closed WAL-mode inputs without treating reader-created sidecars as database changes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-wal-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    const planPath = join(root, 'plan.json');
    createLegacy(source);
    const sourceDatabase = new Database(source);
    expect(sourceDatabase.pragma('journal_mode = WAL', { simple: true })).toBe('wal');
    sourceDatabase.close();
    const targetDatabase = new Database(target);
    migrateCurrentSchema(targetDatabase);
    expect(targetDatabase.pragma('journal_mode = WAL', { simple: true })).toBe('wal');
    targetDatabase.close();
    const sourceBefore = sha256(source);
    const targetBefore = sha256(target);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', 'plan', '--source', source, '--target', target, '--plan', planPath])).toBe(0);
      const plan = parseImportPlan(JSON.parse(readFileSync(planPath, 'utf8')));
      expect(plan.source.fileFingerprint).toEqual({ main: sourceBefore, wal: null, shm: null });
      expect(plan.target).toMatchObject({ absent: false, fileFingerprint: { main: targetBefore, wal: null, shm: null } });
      expect(sha256(source)).toBe(sourceBefore);
      expect(sha256(target)).toBe(targetBefore);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects the removed one-shot shape plus missing, duplicate, and unknown plan options', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(await runCli(['import-legacy', '--source', 'legacy.sqlite', '--target', 'memory.sqlite'])).toBe(2);
    expect(await runCli(['import-legacy', 'plan', '--source', 'legacy.sqlite', '--target', 'memory.sqlite'])).toBe(2);
    expect(await runCli(['import-legacy', 'plan', '--source', 'legacy.sqlite', '--source', 'again.sqlite', '--target', 'memory.sqlite', '--plan', 'plan.json'])).toBe(2);
    expect(await runCli(['import-legacy', 'plan', '--source', 'legacy.sqlite', '--target', 'memory.sqlite', '--plan', 'plan.json', '--fuzzy'])).toBe(2);
    expect(stderr.mock.calls.flat().join('')).toMatch(/exact --source, --target, and --plan/);
  });

  it('refuses an occupied plan path before inspecting or creating any database', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-owned-'));
    const source = join(root, 'missing.sqlite');
    const target = join(root, 'memory.sqlite');
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, 'owned');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', 'plan', '--source', source, '--target', target, '--plan', planPath])).toBe(1);
      expect(readFileSync(planPath, 'utf8')).toBe('owned');
      expect(() => readFileSync(source)).toThrow();
      expect(() => readFileSync(target)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns a bounded single-line planning error without creating the output artifact', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-error-'));
    const source = join(root, 'unknown.sqlite');
    const target = join(root, 'memory.sqlite');
    const planPath = join(root, 'plan.json');
    const database = new Database(source);
    database.exec('CREATE TABLE unknown(value TEXT)');
    database.close();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', 'plan', '--source', source, '--target', target, '--plan', planPath])).toBe(1);
      const message = stderr.mock.calls.flat().join('');
      expect(message).toMatch(/^Import planning failed: Unsupported legacy schema:/);
      expect(message.length).toBeLessThanOrEqual(525);
      expect(message).not.toMatch(/[\r\t]/);
      expect(() => readFileSync(planPath)).toThrow();
      expect(() => readFileSync(target)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('import-legacy apply CLI boundary', () => {
  it('imports bugfix histories as successful discoveries with their legacy kind in provenance', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-bugfix-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    const planPath = join(root, 'plan.json');
    const reportPath = join(root, 'report.json');
    createLegacy(source);
    addLegacyTaxonomyCases(source);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', 'plan', '--source', source, '--target', target, '--plan', planPath])).toBe(0);
      const plan = parseImportPlan(JSON.parse(readFileSync(planPath, 'utf8')));
      expect(plan.reasonCounts.unsupported_kind).toBe(2);
      expect(await runCli(['import-legacy', 'apply', '--plan', planPath, '--report', reportPath])).toBe(0);
      expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toMatchObject({
        committed: true,
        dispositions: {
          observation_version: { imported: 1, linked: 0, skipped: 0, quarantined: 0 },
          observation: { imported: 1, linked: 0, skipped: 0, quarantined: 2 },
        },
        reasonCounts: { imported: 3, unsupported_kind: 2 },
        integrity: { receiptClosure: true, temporalLineage: true, provenance: true },
      });

      const projectKey = plan.projectMappings.find((mapping) => mapping.sourceProject === 'alpha')!.destinationSelector!;
      const service = new MemoryService({ databasePath: target, readonly: true });
      try {
        const current = service.recall({ projectKey, query: 'Fixed durable import behavior' }).items;
        expect(current).toEqual([expect.objectContaining({ kind: 'discovery', outcome: 'succeeded', title: 'Current bugfix' })]);
        const history = service.get({ id: current[0]!.id, history: true }).lineage;
        expect(history).toEqual([
          expect.objectContaining({ kind: 'discovery', outcome: 'succeeded', title: 'Current bugfix' }),
          expect.objectContaining({ kind: 'discovery', outcome: 'succeeded', title: 'Earlier bugfix' }),
        ]);
        for (const memory of history) {
          expect('evidenceIds' in memory).toBe(true);
          const evidence = service.get({ id: memory.evidenceIds[0]! }).record;
          expect(evidence).toMatchObject({ kind: 'legacy_observation', metadata: { legacy_kind: 'bugfix' } });
        }
        expect(service.recall({ projectKey, query: 'Manual-only instructions', history: true }).items).toEqual([]);
        expect(service.recall({ projectKey, query: 'Pattern-only instructions', history: true }).items).toEqual([]);
      } finally {
        service.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('replays an import with repeated legacy memories against the sealed pre-import baseline', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-replay-baseline-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    const planPath = join(root, 'plan.json');
    const reportPath = join(root, 'report.json');
    const replayPath = join(root, 'replay.json');
    createLegacy(source);
    const database = new Database(source);
    database.prepare('UPDATE sessions SET summary=? WHERE id=?').run('Repeated legacy summary.', 'session-1');
    database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('session-2', 'alpha', null, '2025-01-02T00:00:00.000Z', null, 'Repeated legacy summary.');
    database.close();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', 'plan', '--source', source, '--target', target, '--plan', planPath])).toBe(0);
      expect(await runCli(['import-legacy', 'apply', '--plan', planPath, '--report', reportPath])).toBe(0);
      expect(await runCli(['import-legacy', 'apply', '--plan', planPath, '--report', replayPath])).toBe(0);
      expect(JSON.parse(readFileSync(replayPath, 'utf8'))).toMatchObject({
        committed: true,
        duplicate: true,
        rowDelta: { projects: 0, sessions: 0, evidence: 0, memories: 0, memoryEvidence: 0, fts: 0, receipts: 0 },
        integrity: { baselinePreserved: true, receiptClosure: true, provenance: true },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves a valid current cross-topic supersession lineage', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-cross-topic-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    const planPath = join(root, 'plan.json');
    const reportPath = join(root, 'report.json');
    createLegacy(source);
    const service = new MemoryService({ databasePath: target });
    const predecessor = service.save({
      project: { key: 'alpha', name: 'Alpha' },
      evidence: { kind: 'explicit_save', content: 'Original current memory.' },
      memory: { kind: 'decision', title: 'Original', content: 'Original current memory.', topicKey: 'topic/original' },
    });
    service.save({
      project: { key: 'alpha', name: 'Alpha' },
      evidence: { kind: 'explicit_save', content: 'Replacement current memory.' },
      memory: { kind: 'decision', title: 'Replacement', content: 'Replacement current memory.', topicKey: 'topic/replacement', supersedesId: predecessor.memory!.id },
    });
    service.close();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', 'plan', '--source', source, '--target', target, '--plan', planPath])).toBe(0);
      expect(await runCli(['import-legacy', 'apply', '--plan', planPath, '--report', reportPath])).toBe(0);
      expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toMatchObject({
        committed: true,
        integrity: { baselinePreserved: true, temporalLineage: true },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves real legacy version_number history through a committed audited import', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-version-history-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    const planPath = join(root, 'plan.json');
    const reportPath = join(root, 'report.json');
    createLegacy(source);
    addLegacyVersionHistory(source);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', 'plan', '--source', source, '--target', target, '--plan', planPath])).toBe(0);
      expect(await runCli(['import-legacy', 'apply', '--plan', planPath, '--report', reportPath])).toBe(0);
      expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toMatchObject({
        committed: true,
        dispositions: { observation_version: { imported: 2, linked: 0, skipped: 0, quarantined: 0 } },
        integrity: { receiptClosure: true, temporalLineage: true, provenance: true },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts only a bound plan and writes one create-only committed report', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-apply-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'memory.sqlite');
    const planPath = join(root, 'plan.json');
    const reportPath = join(root, 'report.json');
    createLegacy(source);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', 'plan', '--source', source, '--target', target, '--plan', planPath])).toBe(0);
      expect(await runCli(['import-legacy', 'apply', '--plan', planPath, '--report', reportPath])).toBe(0);
      expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toMatchObject({ schema: 'thoth-mem.import.report.v3', committed: true, duplicate: false });
      expect(await runCli(['import-legacy', 'apply', '--plan', planPath, '--report', reportPath])).toBe(1);
      expect(await runCli(['import-legacy', 'apply', '--plan', planPath, '--report', join(root, 'other.json'), '--source', source])).toBe(2);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('writes one bounded failed report for an invalid sealed plan', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-apply-invalid-'));
    const planPath = join(root, 'plan.json');
    const reportPath = join(root, 'report.json');
    writeFileSync(planPath, '{}');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', 'apply', '--plan', planPath, '--report', reportPath])).toBe(1);
      expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toMatchObject({ committed: false, failure: { code: 'PLAN_INVALID', priorTargetRestored: false } });
      expect(stderr.mock.calls.flat().join('').length).toBeLessThanOrEqual(525);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
