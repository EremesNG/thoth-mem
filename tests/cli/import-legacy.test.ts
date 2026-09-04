import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCli } from '../../src/cli.js';
import { parseImportPlan, planLegacyImport } from '../../src/memory-core/import/legacy-v1.js';
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

function createCurrentTargetWithNonEmptyWal(path: string): void {
  const database = new Database(path);
  migrateCurrentSchema(database);
  database.close();
  const result = spawnSync(process.execPath, ['-e', `
    const Database = require('better-sqlite3');
    const database = new Database(process.argv[1]);
    database.pragma('journal_mode = WAL');
    database.pragma('wal_autocheckpoint = 0');
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run(
      'project-wal', 'wal-baseline', 'WAL baseline', null,
      '2026-09-01T00:00:01.000Z', '2026-09-01T00:00:01.000Z',
    );
    process.exit(0);
  `, path], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Failed to create WAL target fixture: ${result.stderr}`);
  if (!existsSync(`${path}-wal`) || readFileSync(`${path}-wal`).byteLength === 0) throw new Error('WAL target fixture did not retain a non-empty WAL');
}

afterEach(() => vi.restoreAllMocks());

describe('import-legacy one-command CLI boundary', () => {
  it('retains the failure report and gives the close-host-and-rerun action when WAL checkpointing is busy', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-wal-checkpoint-busy-'));
    const source = join(root, 'legacy.sqlite');
    const dataDir = join(root, 'current');
    const target = join(dataDir, 'memory.sqlite');
    mkdirSync(dataDir, { recursive: true });
    createLegacy(source);
    createCurrentTargetWithNonEmptyWal(target);
    const reader = new Database(target, { readonly: true, fileMustExist: true });
    reader.exec('BEGIN');
    expect(reader.prepare("SELECT display_name FROM projects WHERE id='project-wal'").get()).toEqual({ display_name: 'WAL baseline' });
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', '--source', source, '--data-dir', dataDir, '--json'])).toBe(1);
      expect(stdout).not.toHaveBeenCalled();
      const output = stderr.mock.calls.flat().join('');
      expect(output).toMatch(/^Outcome: FAILED - legacy import was not committed\.$/mu);
      expect(output).toMatch(/^Reason: .*checkpoint incomplete.*busy=1.*$/imu);
      expect(output).toMatch(/^Next action: Close all hosts using the target and rerun the same command\.$/mu);
      const reportPath = output.match(/^Report: (.+)$/mu)?.[1];
      expect(reportPath).toBeDefined();
      expect(existsSync(reportPath!)).toBe(true);
      const report = JSON.parse(readFileSync(reportPath!, 'utf8')) as {
        committed: boolean;
        failure: { code: string; priorTargetRestored: boolean };
        artifacts: { backupPath: string | null; recoveryBundlePath: string | null };
      };
      expect(report).toMatchObject({
        committed: false,
        failure: { code: 'TARGET_LOCKED', priorTargetRestored: false },
        artifacts: { backupPath: expect.any(String), recoveryBundlePath: null },
      });
      expect(existsSync(report.artifacts.backupPath!)).toBe(true);
      const unchanged = new Database(target, { readonly: true, fileMustExist: true });
      try { expect(unchanged.prepare('SELECT count(*) AS count FROM legacy_imports').get()).toEqual({ count: 0 }); }
      finally { unchanged.close(); }
    } finally {
      reader.exec('ROLLBACK');
      reader.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('imports the conventional legacy database into the configured data directory and retains bounded audit artifacts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-one-command-'));
    const home = join(root, 'home');
    const source = join(home, '.thoth', 'thoth.db');
    const dataDir = join(root, 'current');
    const target = join(dataDir, 'memory.sqlite');
    const mappingPath = join(root, 'mapping.json');
    const privateMarker = 'ONE-COMMAND-PRIVATE-SOURCE-MARKER';
    const previousHome = process.env.HOME;
    const previousUserProfile = process.env.USERPROFILE;
    mkdirSync(join(home, '.thoth'), { recursive: true });
    createLegacy(source);
    const sourceDatabase = new Database(source);
    sourceDatabase.prepare('UPDATE sessions SET summary=? WHERE id=?').run(privateMarker, 'session-1');
    sourceDatabase.close();
    writeFileSync(mappingPath, `${JSON.stringify({ schema: 'thoth-mem.import.mapping.v1', version: 1, mappings: [] })}\n`);
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', '--map', mappingPath, '--data-dir', dataDir, '--json'])).toBe(0);
      expect(existsSync(target)).toBe(true);
      expect(stderr).not.toHaveBeenCalled();
      expect(stdout).toHaveBeenCalledTimes(1);
      const output = JSON.parse(String(stdout.mock.calls[0]![0])) as {
        schema: string;
        data: {
          committed: boolean;
          duplicate: boolean;
          reasonCounts: Record<string, number>;
          artifacts: { planPath: string; reportPath: string; backupPath: string | null; recoveryBundlePath: string | null };
        };
      };
      expect(output).toMatchObject({
        schema: 'thoth-mem.import.run.v1',
        data: {
          committed: true,
          duplicate: false,
          counts: { imported: 2, linked: 0, skipped: 0, quarantined: 0 },
          reasonCounts: { imported: 2 },
          artifacts: { backupPath: null },
        },
      });
      expect(existsSync(output.data.artifacts.planPath)).toBe(true);
      expect(existsSync(output.data.artifacts.reportPath)).toBe(true);
      expect(output.data.artifacts.recoveryBundlePath).not.toBeNull();
      expect(existsSync(output.data.artifacts.recoveryBundlePath!)).toBe(true);
      expect(readFileSync(output.data.artifacts.planPath, 'utf8')).not.toContain(privateMarker);
      expect(readFileSync(output.data.artifacts.reportPath, 'utf8')).not.toContain(privateMarker);
      expect(stdout.mock.calls.flat().join('')).not.toContain(privateMarker);
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = previousUserProfile;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports the complete bounded artifact and disposition contract in human-readable mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-one-command-human-'));
    const source = join(root, 'legacy.sqlite');
    const dataDir = join(root, 'current');
    createLegacy(source);
    const legacy = new Database(source);
    legacy.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?)').run(
      1,
      'session-1',
      'manual',
      'Quarantined manual',
      'Manual-only instructions',
      'alpha',
      'topic/manual',
      '2025-01-02T00:00:00.000Z',
      null,
    );
    legacy.close();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', '--source', source, '--data-dir', dataDir])).toBe(0);
      expect(stderr).not.toHaveBeenCalled();
      const output = stdout.mock.calls.flat().join('');
      expect(output).toMatch(/^Outcome: SUCCESS - legacy import completed and committed\.$/mu);
      expect(output).toMatch(/^Rows: total=2; imported=1; linked=0; quarantined=1; skipped=0$/mu);
      expect(output).toMatch(/^Non-imported rows: quarantined=1; skipped=0\. They were accounted for in the report and did not prevent the commit\.$/mu);
      expect(output).toMatch(/^Replay: no$/mu);
      expect(output).toMatch(/^Plan: .+\.json$/mu);
      expect(output).toMatch(/^Report: .+\.json$/mu);
      expect(output).toMatch(/^Backup \(safety artifact\): null$/mu);
      expect(output).toMatch(/^Recovery \(safety artifact\): .+$/mu);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reuses the exact committed plan for an equivalent one-command replay', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-one-command-replay-'));
    const source = join(root, 'legacy.sqlite');
    const dataDir = join(root, 'current');
    const target = join(dataDir, 'memory.sqlite');
    createLegacy(source);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const args = ['import-legacy', '--source', source, '--data-dir', dataDir, '--json'];
      expect(await runCli(args)).toBe(0);
      const first = JSON.parse(String(stdout.mock.calls[0]![0])) as { data: { artifacts: { planPath: string; reportPath: string } } };
      const firstDatabase = new Database(target, { readonly: true });
      const before = {
        memories: Number((firstDatabase.prepare('SELECT count(*) AS count FROM memories').get() as { count: number }).count),
        fts: Number((firstDatabase.prepare('SELECT count(*) AS count FROM memory_fts').get() as { count: number }).count),
      };
      firstDatabase.close();

      expect(await runCli(args)).toBe(0);
      expect(stderr).not.toHaveBeenCalled();
      const second = JSON.parse(String(stdout.mock.calls[1]![0])) as { data: { duplicate: boolean; artifacts: { planPath: string; reportPath: string } } };
      expect(second.data.duplicate).toBe(true);
      expect(second.data.artifacts.planPath).toBe(first.data.artifacts.planPath);
      expect(readdirSync(join(first.data.artifacts.planPath, '..')).filter((name) => !name.endsWith('.binding.json'))).toHaveLength(1);
      expect(JSON.parse(readFileSync(second.data.artifacts.reportPath, 'utf8'))).toMatchObject({
        committed: true,
        duplicate: true,
        rowDelta: { projects: 0, sessions: 0, evidence: 0, memories: 0, memoryEvidence: 0, fts: 0, receipts: 0 },
      });
      const replayDatabase = new Database(target, { readonly: true });
      expect({
        memories: Number((replayDatabase.prepare('SELECT count(*) AS count FROM memories').get() as { count: number }).count),
        fts: Number((replayDatabase.prepare('SELECT count(*) AS count FROM memory_fts').get() as { count: number }).count),
      }).toEqual(before);
      replayDatabase.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('recovers from a locked uncommitted attempt with a fresh baseline-bound plan and then replays the committed plan', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-one-command-retry-'));
    const source = join(root, 'legacy.sqlite');
    const dataDir = join(root, 'current');
    const target = join(dataDir, 'memory.sqlite');
    mkdirSync(dataDir, { recursive: true });
    createLegacy(source);
    const targetDatabase = new Database(target);
    migrateCurrentSchema(targetDatabase);
    targetDatabase.close();
    const targetBefore = sha256(target);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const args = ['import-legacy', '--source', source, '--data-dir', dataDir, '--json'];
    const lock = new Database(target);
    lock.exec('BEGIN EXCLUSIVE');
    try {
      expect(await runCli(args)).toBe(1);
    } finally {
      lock.exec('ROLLBACK');
      lock.close();
    }
    try {
      expect(stderr.mock.calls.flat().join('')).toMatch(/locked|busy/iu);
      expect(stderr.mock.calls.flat().join('')).toMatch(/close all hosts.*rerun/iu);
      expect(stdout).not.toHaveBeenCalled();
      expect(sha256(target)).toBe(targetBefore);
      expect(existsSync(join(dataDir, 'imports'))).toBe(false);

      const service = new MemoryService({ databasePath: target });
      service.save({
        project: { key: 'current-project', name: 'Current project' },
        evidence: { kind: 'explicit_save', content: 'A current target baseline change.' },
        memory: { kind: 'decision', title: 'Current target baseline', content: 'A current target baseline change.' },
      });
      service.close();
      stderr.mockClear();

      expect(await runCli(args)).toBe(0);
      const committed = JSON.parse(String(stdout.mock.calls[0]![0])) as { data: { duplicate: boolean; artifacts: { planPath: string } } };
      expect(committed.data.duplicate).toBe(false);
      const requestDirectory = join(dataDir, 'imports', readdirSync(join(dataDir, 'imports'))[0]!);
      expect(readdirSync(join(requestDirectory, 'plans')).filter((name) => !name.endsWith('.binding.json'))).toHaveLength(1);

      stdout.mockClear();
      expect(await runCli(args)).toBe(0);
      const replay = JSON.parse(String(stdout.mock.calls[0]![0])) as { data: { duplicate: boolean; artifacts: { planPath: string; reportPath: string } } };
      expect(replay.data).toMatchObject({ duplicate: true, artifacts: { planPath: committed.data.artifacts.planPath } });
      expect(JSON.parse(readFileSync(replay.data.artifacts.reportPath, 'utf8'))).toMatchObject({
        duplicate: true,
        rowDelta: { projects: 0, sessions: 0, evidence: 0, memories: 0, memoryEvidence: 0, fts: 0, receipts: 0 },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignores mapping entry order when selecting equivalent committed request custody', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-one-command-mapping-order-'));
    const source = join(root, 'legacy.sqlite');
    const dataDir = join(root, 'current');
    const target = join(dataDir, 'memory.sqlite');
    const firstMappingPath = join(root, 'mapping-first.json');
    const reorderedMappingPath = join(root, 'mapping-reordered.json');
    mkdirSync(dataDir, { recursive: true });
    createLegacy(source);
    const legacy = new Database(source);
    legacy.prepare("INSERT INTO sessions VALUES('session-2','beta',NULL,'2025-01-02T00:00:00.000Z',NULL,NULL)").run();
    legacy.close();
    const service = new MemoryService({ databasePath: target });
    service.save({ project: { key: 'current-alpha', name: 'Current alpha' }, evidence: { kind: 'explicit_save', content: 'Alpha target.' }, memory: { kind: 'decision', title: 'Alpha target', content: 'Alpha target.' } });
    service.save({ project: { key: 'current-beta', name: 'Current beta' }, evidence: { kind: 'explicit_save', content: 'Beta target.' }, memory: { kind: 'decision', title: 'Beta target', content: 'Beta target.' } });
    service.close();
    const mappings = [
      { sourceProject: 'alpha', targetSelector: 'current-alpha' },
      { sourceProject: 'beta', targetSelector: 'current-beta' },
    ];
    writeFileSync(firstMappingPath, `${JSON.stringify({ schema: 'thoth-mem.import.mapping.v1', version: 1, mappings })}\n`);
    writeFileSync(reorderedMappingPath, `${JSON.stringify({ schema: 'thoth-mem.import.mapping.v1', version: 1, mappings: [...mappings].reverse() })}\n`);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', '--source', source, '--map', firstMappingPath, '--data-dir', dataDir, '--json'])).toBe(0);
      const first = JSON.parse(String(stdout.mock.calls[0]![0])) as { data: { artifacts: { planPath: string } } };
      stdout.mockClear();

      expect(await runCli(['import-legacy', '--source', source, '--map', reorderedMappingPath, '--data-dir', dataDir, '--json'])).toBe(0);
      expect(stderr).not.toHaveBeenCalled();
      const replay = JSON.parse(String(stdout.mock.calls[0]![0])) as { data: { duplicate: boolean; artifacts: { planPath: string } } };
      expect(replay.data.duplicate).toBe(true);
      expect(replay.data.artifacts.planPath).toBe(first.data.artifacts.planPath);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not let an uncommitted stale plan attempt block a fresh target baseline', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-one-command-stale-attempt-'));
    const source = join(root, 'legacy.sqlite');
    const dataDir = join(root, 'current');
    const target = join(dataDir, 'memory.sqlite');
    mkdirSync(dataDir, { recursive: true });
    createLegacy(source);
    const initial = new MemoryService({ databasePath: target });
    initial.close();
    const stalePlan = planLegacyImport({ sourcePath: source, targetPath: target });
    const requestKey = createHash('sha256').update(JSON.stringify({
      sourcePath: resolve(source),
      targetPath: resolve(target),
      sourceFingerprint: stalePlan.source.logicalFingerprint,
      mapping: null,
      policyHash: stalePlan.policy.policyHash,
    })).digest('hex');
    const planDirectory = join(dataDir, 'imports', requestKey, 'plans');
    mkdirSync(planDirectory, { recursive: true });
    mkdirSync(join(dataDir, 'imports', requestKey, 'reports'));
    const stalePlanPath = join(planDirectory, `${stalePlan.planHash}.json`);
    writeFileSync(stalePlanPath, `${JSON.stringify(stalePlan, null, 2)}\n`);
    const changed = new MemoryService({ databasePath: target });
    changed.save({ project: { key: 'current-project', name: 'Current project' }, evidence: { kind: 'explicit_save', content: 'Changed after the retained plan.' }, memory: { kind: 'decision', title: 'Changed baseline', content: 'Changed after the retained plan.' } });
    changed.close();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', '--source', source, '--data-dir', dataDir, '--json'])).toBe(0);
      expect(stderr).not.toHaveBeenCalled();
      const output = JSON.parse(String(stdout.mock.calls[0]![0])) as { data: { duplicate: boolean; artifacts: { planPath: string } } };
      expect(output.data.duplicate).toBe(false);
      expect(output.data.artifacts.planPath).not.toBe(stalePlanPath);
      expect(readdirSync(planDirectory).filter((name) => !name.endsWith('.binding.json'))).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects importer custody that escapes through a symbolic-link or reparse alias', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-one-command-alias-'));
    const source = join(root, 'legacy.sqlite');
    const dataDir = join(root, 'current');
    const target = join(dataDir, 'memory.sqlite');
    const outside = join(root, 'outside');
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(outside);
    symlinkSync(outside, join(dataDir, 'imports'), 'junction');
    createLegacy(source);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', '--source', source, '--data-dir', dataDir, '--json'])).toBe(1);
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr.mock.calls.flat().join('')).toMatch(/custody|symbolic|reparse|alias/iu);
      expect(existsSync(target)).toBe(false);
      expect(readdirSync(outside)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed when the exact committed plan custody was tampered', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-one-command-tamper-'));
    const source = join(root, 'legacy.sqlite');
    const dataDir = join(root, 'current');
    const target = join(dataDir, 'memory.sqlite');
    createLegacy(source);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const args = ['import-legacy', '--source', source, '--data-dir', dataDir, '--json'];
    try {
      expect(await runCli(args)).toBe(0);
      const first = JSON.parse(String(stdout.mock.calls[0]![0])) as { data: { artifacts: { planPath: string } } };
      const database = new Database(target, { readonly: true });
      const before = Number((database.prepare('SELECT count(*) AS count FROM memories').get() as { count: number }).count);
      database.close();
      writeFileSync(first.data.artifacts.planPath, '{}');
      stdout.mockClear();

      expect(await runCli(args)).toBe(1);
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr.mock.calls.flat().join('')).toMatch(/plan|custody|invalid/iu);
      const unchanged = new Database(target, { readonly: true });
      expect(Number((unchanged.prepare('SELECT count(*) AS count FROM memories').get() as { count: number }).count)).toBe(before);
      unchanged.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not reuse committed custody when the mapping request changes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-one-command-mapping-'));
    const source = join(root, 'legacy.sqlite');
    const dataDir = join(root, 'current');
    const target = join(dataDir, 'memory.sqlite');
    const mappingPath = join(root, 'mapping.json');
    createLegacy(source);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', '--source', source, '--data-dir', dataDir, '--json'])).toBe(0);
      const first = JSON.parse(String(stdout.mock.calls[0]![0])) as { data: { artifacts: { planPath: string } } };
      const firstPlan = parseImportPlan(JSON.parse(readFileSync(first.data.artifacts.planPath, 'utf8')));
      const destinationSelector = firstPlan.projectMappings.find((mapping) => mapping.sourceProject === 'alpha')!.destinationSelector!;
      writeFileSync(mappingPath, `${JSON.stringify({ schema: 'thoth-mem.import.mapping.v1', version: 1, mappings: [{ sourceProject: 'alpha', targetSelector: destinationSelector }] })}\n`);
      const database = new Database(target, { readonly: true });
      const before = Number((database.prepare('SELECT count(*) AS count FROM memories').get() as { count: number }).count);
      database.close();
      stdout.mockClear();

      expect(await runCli(['import-legacy', '--source', source, '--map', mappingPath, '--data-dir', dataDir, '--json'])).toBe(1);
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr.mock.calls.flat().join('')).toMatch(/custody|different plan|mapping/iu);
      const unchanged = new Database(target, { readonly: true });
      expect(Number((unchanged.prepare('SELECT count(*) AS count FROM memories').get() as { count: number }).count)).toBe(before);
      unchanged.close();

      const originalRequestDirectory = dirname(dirname(first.data.artifacts.planPath));
      const changedRequestName = readdirSync(join(dataDir, 'imports')).find((name) => name !== basename(originalRequestDirectory));
      expect(changedRequestName).toBeDefined();
      const substitutedPlanPath = join(dataDir, 'imports', changedRequestName!, 'plans', basename(first.data.artifacts.planPath));
      const originalBindingPath = first.data.artifacts.planPath.replace(/\.json$/u, '.binding.json');
      const substitutedBindingPath = substitutedPlanPath.replace(/\.json$/u, '.binding.json');
      writeFileSync(substitutedPlanPath, readFileSync(first.data.artifacts.planPath));
      writeFileSync(substitutedBindingPath, readFileSync(originalBindingPath));
      stderr.mockClear();

      expect(await runCli(['import-legacy', '--source', source, '--map', mappingPath, '--data-dir', dataDir, '--json'])).toBe(1);
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr.mock.calls.flat().join('')).toMatch(/custody|request|mapping/iu);
      const stillUnchanged = new Database(target, { readonly: true });
      expect(Number((stillUnchanged.prepare('SELECT count(*) AS count FROM memories').get() as { count: number }).count)).toBe(before);
      stillUnchanged.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects null-to-empty mapping substitution even when the copied binding claims the destination request key', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-import-cli-one-command-empty-mapping-'));
    const source = join(root, 'legacy.sqlite');
    const dataDir = join(root, 'current');
    const target = join(dataDir, 'memory.sqlite');
    const mappingPath = join(root, 'empty-mapping.json');
    createLegacy(source);
    writeFileSync(mappingPath, `${JSON.stringify({ schema: 'thoth-mem.import.mapping.v1', version: 1, mappings: [] })}\n`);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-legacy', '--source', source, '--data-dir', dataDir, '--json'])).toBe(0);
      const first = JSON.parse(String(stdout.mock.calls[0]![0])) as { data: { artifacts: { planPath: string } } };
      const database = new Database(target, { readonly: true });
      const before = Number((database.prepare('SELECT count(*) AS count FROM memories').get() as { count: number }).count);
      database.close();
      stdout.mockClear();

      expect(await runCli(['import-legacy', '--source', source, '--map', mappingPath, '--data-dir', dataDir, '--json'])).toBe(1);
      const originalRequestDirectory = dirname(dirname(first.data.artifacts.planPath));
      const changedRequestName = readdirSync(join(dataDir, 'imports')).find((name) => name !== basename(originalRequestDirectory));
      expect(changedRequestName).toBeDefined();
      const substitutedPlanPath = join(dataDir, 'imports', changedRequestName!, 'plans', basename(first.data.artifacts.planPath));
      const originalBindingPath = first.data.artifacts.planPath.replace(/\.json$/u, '.binding.json');
      const substitutedBindingPath = substitutedPlanPath.replace(/\.json$/u, '.binding.json');
      const binding = JSON.parse(readFileSync(originalBindingPath, 'utf8')) as { requestKey: string };
      writeFileSync(substitutedPlanPath, readFileSync(first.data.artifacts.planPath));
      writeFileSync(substitutedBindingPath, `${JSON.stringify({ ...binding, requestKey: changedRequestName }, null, 2)}\n`);
      stderr.mockClear();

      expect(await runCli(['import-legacy', '--source', source, '--map', mappingPath, '--data-dir', dataDir, '--json'])).toBe(1);
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr.mock.calls.flat().join('')).toMatch(/mapping|plan|custody/iu);
      const unchanged = new Database(target, { readonly: true });
      expect(Number((unchanged.prepare('SELECT count(*) AS count FROM memories').get() as { count: number }).count)).toBe(before);
      unchanged.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('import-legacy plan CLI boundary', () => {
  it('writes one closed v4 plan to an explicit new path and leaves both databases unchanged', async () => {
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
      expect(plan).toMatchObject({ schema: 'thoth-mem.import.plan.v4', version: 4, mappingRequest: { mappings: [] }, target: { absent: true, schemaRevision: null } });
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

  it('rejects a one-command target override plus missing, duplicate, and unknown plan options', async () => {
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
