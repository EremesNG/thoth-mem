import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

import { runCli } from '../src/cli.js';
import { shouldRunCli } from '../src/index.js';
import { MemoryService } from '../src/memory-core/service.js';
import { SQLITE_SCHEMA_REVISION } from '../src/memory-core/sqlite/migrations.js';
import { LEGACY_IMPORT_AUDIT_SCHEMA_SQL, LEGACY_IMPORT_COHORT_SCHEMA_SQL, PROJECT_ALIAS_SCHEMA_SQL, REVISION_SIX_SCHEMA_SQL } from '../src/memory-core/sqlite/schema.js';

// Inject only filesystem copy failures; database connections and migration work stay real.
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, copyFileSync: vi.fn(fs.copyFileSync) };
});

function createMigrationFixture(databasePath: string): void {
  const database = new Database(databasePath);
  const timestamp = '2026-10-19T00:00:00.000Z';
  try {
    const revisionTenSchema = REVISION_SIX_SCHEMA_SQL.replace(
      "harness IN ('opencode','codex','claude','mcp','cli','import')",
      "harness IN ('opencode','codex','claude','pi','mcp','cli','import')",
    );
    database.exec(`${revisionTenSchema}
${PROJECT_ALIAS_SCHEMA_SQL}
${LEGACY_IMPORT_AUDIT_SCHEMA_SQL}
${LEGACY_IMPORT_COHORT_SCHEMA_SQL}`);
    database.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(10, timestamp);
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-1', 'fixture', 'Fixture', null, timestamp, timestamp);
    for (const harness of ['pi', 'codex', 'import']) {
      database.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)').run(harness, 'project-1', harness, harness, 'ended', timestamp, timestamp, 0);
      for (const operation of ['enroll', 'recover', 'finalize']) {
        database.prepare('INSERT INTO lifecycle_receipts VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(harness, 'project-1', harness, operation, operation, 'payload', 'confirmed', timestamp, null, null, null);
      }
    }
  } finally { database.close(); }
}

let configRoot: string;
beforeEach(() => {
  configRoot = mkdtempSync(join(tmpdir(), 'thoth-cli-config-'));
  vi.stubEnv('XDG_CONFIG_HOME', configRoot);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(configRoot, { recursive: true, force: true });
});

describe('migration startup diagnostics', () => {
  it.each([
    ['lifecycle', 'Lifecycle failed: '],
    ['migrate', 'Migration failed: '],
    ['mcp', ''],
  ])('carries the bounded migration error through %s stderr with exit 1', (command, prefix) => {
    const dataDir = join(configRoot, 'data');
    mkdirSync(dataDir);
    const databasePath = join(dataDir, 'memory.sqlite');
    createMigrationFixture(databasePath);
    copyFileSync(databasePath, `${databasePath}.pre-v11.bak`);
    const backup = new Database(`${databasePath}.pre-v11.bak`);
    try { backup.prepare("UPDATE projects SET display_name='Mismatched backup'").run(); }
    finally { backup.close(); }
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/index.ts', command!, '--data-dir', dataDir], {
      input: '{}', encoding: 'utf8', windowsHide: true,
      env: { ...process.env, XDG_CONFIG_HOME: configRoot }, timeout: 15_000,
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`${prefix}SQLite migration revision 10→11 failed: SQLite pre-v11 backup does not match the locked revision 10 source. Run \`thoth-mem migrate\` to complete migrations without host timeouts.\n`);
    expect(Array.from(result.stderr).length).toBeLessThanOrEqual(520);
  });
});

describe('migrate CLI', () => {
  it('reads a current revision held only in the WAL without connecting to the source', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-migrate-wal-revision-'));
    const memory = new MemoryService({ databasePath: join(dataDir, 'memory.sqlite') });
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const filesBefore = readdirSync(dataDir).sort();
    const bytesBefore = new Map(filesBefore.map((file) => [file, readFileSync(join(dataDir, file))]));
    try {
      expect(filesBefore).toEqual(['memory.sqlite', 'memory.sqlite-shm', 'memory.sqlite-wal']);
      expect(await runCli(['migrate', '--data-dir', dataDir, '--json'])).toBe(0);
      expect(JSON.parse(String(stdout.mock.calls.at(-1)?.[0]))).toMatchObject({ data: { fromRevision: 12, toRevision: 12, alreadyCurrent: true } });
      expect(readdirSync(dataDir).sort()).toEqual(filesBefore);
      for (const [file, bytes] of bytesBefore) expect(readFileSync(join(dataDir, file)), file).toEqual(bytes);
    } finally {
      memory.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it.each(['database', 'WAL'])('treats a %s snapshot copy failure as a bounded operational error and removes the disposable snapshot', async (failedCopy) => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-migrate-copy-failure-'));
    const databasePath = join(dataDir, 'memory.sqlite');
    createMigrationFixture(databasePath);
    let active: Database.Database | undefined;
    if (failedCopy === 'WAL') {
      active = new Database(databasePath, { fileMustExist: true });
      active.pragma('journal_mode = WAL');
      active.prepare("UPDATE projects SET display_name='WAL copy failure fixture'").run();
      const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
      vi.mocked(copyFileSync).mockImplementationOnce(fs.copyFileSync);
    }
    const filesBefore = readdirSync(dataDir).sort();
    const bytesBefore = new Map(filesBefore.map((file) => [file, readFileSync(join(dataDir, file))]));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    let snapshotRoot: string | undefined;
    vi.mocked(copyFileSync).mockImplementationOnce((_source, destination) => {
      snapshotRoot = dirname(String(destination));
      throw new Error(`copy failed\n${'x'.repeat(1_000)}`);
    });
    try {
      expect(await runCli(['migrate', '--data-dir', dataDir])).toBe(1);
      expect(readdirSync(dataDir).sort()).toEqual(filesBefore);
      for (const [file, bytes] of bytesBefore) expect(readFileSync(join(dataDir, file)), file).toEqual(bytes);
      expect(snapshotRoot).toBeDefined();
      expect(existsSync(snapshotRoot!)).toBe(false);
      const output = stderr.mock.calls.map(([text]) => String(text)).join('');
      expect(output).toMatch(/^Migration failed: copy failed /);
      expect(output.trim().split('\n')).toHaveLength(1);
      expect(output.length).toBeLessThanOrEqual(519);
    } finally {
      active?.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('treats an unreadable snapshot as an operational failure without changing the source', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-migrate-corrupt-'));
    const databasePath = join(dataDir, 'memory.sqlite');
    const bytes = Buffer.alloc(4096, 'x');
    writeFileSync(databasePath, bytes);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['migrate', '--data-dir', dataDir, '--json'])).toBe(1);
      expect(readFileSync(databasePath)).toEqual(bytes);
      expect(readdirSync(dataDir)).toEqual(['memory.sqlite']);
      expect(stderr.mock.calls.flat().join('')).toMatch(/not a database/i);
    } finally { rmSync(dataDir, { recursive: true, force: true }); }
  });

  it.each([
    ['legacy', 'CREATE TABLE sessions(id TEXT)', /one-way legacy importer/],
    ['missing revision', 'CREATE TABLE schema_migrations(version INTEGER)', /Unsupported memory SQLite schema revision: null/],
    ['future revision', 'CREATE TABLE schema_migrations(version); INSERT INTO schema_migrations VALUES(13)', /Unsupported memory SQLite schema revision: 13/],
    ['retired revision', 'CREATE TABLE schema_migrations(version); INSERT INTO schema_migrations VALUES(1)', /Unsupported memory SQLite schema revision: 1/],
    ['unrecognized revision', "CREATE TABLE schema_migrations(version); INSERT INTO schema_migrations VALUES('unknown')", /Unsupported memory SQLite schema revision: unknown/],
    ['malformed revision table', 'CREATE TABLE schema_migrations(other TEXT)', /no such column: version/],
  ] as const)('preserves existing error semantics for a %s schema without modifying it', async (_name, sql, message) => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-migrate-unsupported-'));
    const databasePath = join(dataDir, 'memory.sqlite');
    const database = new Database(databasePath);
    database.exec(sql);
    database.close();
    const bytes = readFileSync(databasePath);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['migrate', '--data-dir', dataDir])).toBe(1);
      expect(stderr.mock.calls.flat().join('')).toMatch(message);
      expect(readFileSync(databasePath)).toEqual(bytes);
      expect(readdirSync(dataDir)).toEqual(['memory.sqlite']);
    } finally { rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('lists migrate in help and dispatches its positional command to runCli', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    expect(shouldRunCli(['migrate', '--data-dir', 'fixture', '--json'])).toBe(true);
    expect(await runCli(['help'])).toBe(0);
    expect(stdout.mock.calls.map(([text]) => String(text)).join('')).toContain('migrate [--data-dir <dir>] [--json]');
  });

  it.each(['DELETE', 'WAL without sidecars', 'WAL with sidecars'])('reports repeat no-ops without changing source bytes, journal mode, or directory contents for %s', async (mode) => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-migrate-current-'));
    const databasePath = join(dataDir, 'memory.sqlite');
    createMigrationFixture(databasePath);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    let active: Database.Database | undefined;
    try {
      expect(await runCli(['migrate', '--data-dir', dataDir, '--json'])).toBe(0);
      const database = new Database(databasePath, { fileMustExist: true });
      database.pragma(`journal_mode = ${mode === 'DELETE' ? 'DELETE' : 'WAL'}`);
      if (mode === 'WAL with sidecars') {
        active = database;
        active.prepare("UPDATE projects SET display_name='Active WAL fixture'").run();
      } else { database.close(); }
      const filesBefore = readdirSync(dataDir).sort();
      expect(filesBefore.includes('memory.sqlite-wal')).toBe(mode === 'WAL with sidecars');
      expect(filesBefore.includes('memory.sqlite-shm')).toBe(mode === 'WAL with sidecars');
      const bytesBefore = new Map(filesBefore.map((file) => [file, readFileSync(join(dataDir, file))]));
      // SQLite's header records the journal read/write format: 1=rollback, 2=WAL.
      expect(readFileSync(databasePath).subarray(18, 20)).toEqual(Buffer.from(mode === 'DELETE' ? [1, 1] : [2, 2]));
      for (const json of [true, false]) {
        expect(await runCli(['migrate', `--data-dir=${dataDir}`, ...(json ? ['--json'] : [])])).toBe(0);
        if (json) {
          expect(JSON.parse(String(stdout.mock.calls.at(-1)?.[0]))).toEqual({
            schema: 'thoth-mem.migrate.v1',
            data: { fromRevision: 12, toRevision: 12, backups: [], removedSessions: 0, removedReceipts: 0, alreadyCurrent: true, durationMs: expect.any(Number) },
          });
        } else {
          expect(stdout.mock.calls.map(([text]) => String(text)).join('')).toContain('12 → 12 (already current; no-op)');
        }
        expect(readdirSync(dataDir).sort()).toEqual(filesBefore);
        for (const [file, bytes] of bytesBefore) expect(readFileSync(join(dataDir, file)), file).toEqual(bytes);
      }
    } finally {
      active?.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it.each(['created', 'verified'] as const)('renders the revision, %s backup path, cleanup counts, and duration by default', async (status) => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-migrate-human-'));
    const databasePath = join(dataDir, 'memory.sqlite');
    createMigrationFixture(databasePath);
    if (status === 'verified') copyFileSync(databasePath, `${databasePath}.pre-v11.bak`);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['migrate', `--data-dir=${dataDir}`])).toBe(0);
      const output = stdout.mock.calls.map(([text]) => String(text)).join('');
      expect(output).toContain('10 → 12');
      expect(output).toContain(`Backup ${status}: ${databasePath}.pre-v11.bak`);
      expect(output).toContain(`Backup created: ${databasePath}.pre-v12.bak`);
      expect(output).toContain('Sessions removed: 2');
      expect(output).toContain('Lifecycle receipts removed: 6');
      expect(output).toMatch(/Duration: \d+(?:\.\d+)? ms/);
    } finally { rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('never recreates a database that disappears before an existing-only writable open', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-migrate-disappeared-'));
    const databasePath = join(dataDir, 'memory.sqlite');
    createMigrationFixture(databasePath);
    rmSync(databasePath);
    let memory: MemoryService | undefined;
    try {
      const options = { databasePath, requireExisting: true };
      expect(() => { memory = new MemoryService(options); }).toThrow();
      expect(readdirSync(dataDir)).toEqual([]);
    } finally {
      memory?.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('migrates revision 10 to 12 and emits one JSON envelope with the backup and removal counts', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-migrate-pending-'));
    const databasePath = join(dataDir, 'memory.sqlite');
    createMigrationFixture(databasePath);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['migrate', '--data-dir', dataDir, '--json'])).toBe(0);
      expect(stdout.mock.calls).toHaveLength(1);
      const output = String(stdout.mock.calls[0]?.[0]);
      expect(output.trim().split('\n')).toHaveLength(1);
      expect(JSON.parse(output)).toEqual({
        schema: 'thoth-mem.migrate.v1',
        data: {
          fromRevision: 10, toRevision: 12, alreadyCurrent: false,
          backups: [{ path: `${databasePath}.pre-v11.bak`, status: 'created' }, { path: `${databasePath}.pre-v12.bak`, status: 'created' }],
          removedSessions: 2, removedReceipts: 6, durationMs: expect.any(Number),
        },
      });
      expect(existsSync(`${databasePath}.pre-v11.bak`)).toBe(true);
      expect(existsSync(`${databasePath}.pre-v12.bak`)).toBe(true);
    } finally { rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('rejects unknown, duplicate, and malformed options before resolving configuration or opening storage', async () => {
    mkdirSync(join(configRoot, 'thoth-mem'));
    writeFileSync(join(configRoot, 'thoth-mem', 'config.json'), 'invalid config must not be read');
    const dataDir = join(configRoot, 'data');
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const invalidCases = [
      ['--unknown'], ['--unknown=value'], ['extra'], ['--json=true'], ['--json', '--json'],
      ['--data-dir'], ['--data-dir='], ['--data-dir', '--json'], ['--data-dir', '   '],
      ['--data-dir', 'bad\0path'], ['--data-dir=x', '--data-dir', 'y'], ['--data-dir=--json'],
    ];
    for (const invalid of invalidCases) {
      const args = ['migrate', ...invalid];
      if (!invalid.some((arg) => arg.startsWith('--data-dir'))) args.push('--data-dir', dataDir);
      expect(await runCli(args), invalid.join(' ')).toBe(2);
    }
    expect(await runCli(['--json', 'migrate', '--data-dir', dataDir])).toBe(2);
    expect(existsSync(dataDir)).toBe(false);
    expect(stderr.mock.calls).toHaveLength(invalidCases.length + 1);
  });

  it('fails without creating storage when memory.sqlite or its data directory is missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-cli-migrate-missing-'));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      for (const dataDir of [root, join(root, 'missing')]) {
        expect(await runCli(['migrate', '--data-dir', dataDir])).toBe(1);
        expect(readdirSync(root)).toEqual([]);
      }
      expect(stderr.mock.calls.flat().join('')).toMatch(/database does not exist/i);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('project rename CLI', () => {
  it('renames one exact project while preserving its canonical key and supports an idempotent retry', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-project-'));
    const memory = new MemoryService({ databasePath: join(dataDir, 'memory.sqlite') });
    memory.save({ project: { key: 'git:55555555-5555-4555-8555-555555555555', name: 'Before', aliases: ['path:C:/before'] }, evidence: { kind: 'explicit_save', content: 'fixture' } });
    memory.close();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['project', 'rename', '--project', 'path:C:/before', '--name', 'After', '--data-dir', dataDir])).toBe(0);
      expect(JSON.parse(String(stdout.mock.calls.at(-1)?.[0]))).toMatchObject({ data: { key: 'git:55555555-5555-4555-8555-555555555555', oldName: 'Before', newName: 'After', changed: true } });
      expect(await runCli(['project', 'rename', '--project', 'git:55555555-5555-4555-8555-555555555555', '--name', 'After', '--data-dir', dataDir])).toBe(0);
      expect(JSON.parse(String(stdout.mock.calls.at(-1)?.[0]))).toMatchObject({ data: { changed: false } });
    } finally { rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('renames through a byte-exact alias without trimming it', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-project-exact-alias-'));
    const exactAlias = 'path:C:/repository ';
    const memory = new MemoryService({ databasePath: join(dataDir, 'memory.sqlite') });
    memory.save({ project: { key: 'git:77777777-7777-4777-8777-777777777777', name: 'Before', aliases: [exactAlias] }, evidence: { kind: 'explicit_save', content: 'fixture' } });
    memory.close();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['project', 'rename', '--project', exactAlias, '--name', 'After', '--data-dir', dataDir])).toBe(0);
      expect(JSON.parse(String(stdout.mock.calls.at(-1)?.[0]))).toMatchObject({ data: { key: 'git:77777777-7777-4777-8777-777777777777', newName: 'After', changed: true } });
    } finally { rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('rejects unknown or malformed project commands without opening a database', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(await runCli(['project', 'merge'])).toBe(2);
    expect(await runCli(['project', 'rename', '--project', 'git:x'])).toBe(2);
    expect(stderr.mock.calls.flat().join('')).toMatch(/Unknown project command|requires exact/);
  });

  it('rejects unknown equals-form options before opening a database', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-project-invalid-option-'));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli([
        'project',
        'rename',
        '--project=git:55555555-5555-4555-8555-555555555555',
        '--name=After',
        `--data-dir=${dataDir}`,
        '--bogus=value',
      ])).toBe(2);
      expect(existsSync(join(dataDir, 'memory.sqlite'))).toBe(false);
      expect(stderr.mock.calls.flat().join('')).toMatch(/requires exact|unknown option/i);
    } finally { rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('does not create storage for an unknown selector when the database is absent', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-project-unknown-absent-'));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli([
        'project',
        'rename',
        '--project=git:88888888-8888-4888-8888-888888888888',
        '--name=After',
        `--data-dir=${dataDir}`,
      ])).toBe(1);
      expect(existsSync(join(dataDir, 'memory.sqlite'))).toBe(false);
      expect(stderr.mock.calls.flat().join('')).toMatch(/selector did not match/i);
    } finally { rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('does not migrate an existing revision-6 database for an unknown selector', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-project-unknown-existing-'));
    const databasePath = join(dataDir, 'memory.sqlite');
    const timestamp = '2026-08-31T00:00:00.000Z';
    const database = new Database(databasePath);
    database.exec(REVISION_SIX_SCHEMA_SQL);
    database.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(6, timestamp);
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-1', 'path:C:/known', 'Known', null, timestamp, timestamp);
    database.close();
    const filesBefore = readdirSync(dataDir).sort();
    const bytesBefore = new Map(filesBefore.map((file) => [file, readFileSync(join(dataDir, file))]));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['project', 'rename', '--project=path:C:/unknown', '--name=After', `--data-dir=${dataDir}`])).toBe(1);
      expect(readdirSync(dataDir).sort()).toEqual(filesBefore);
      for (const [file, bytes] of bytesBefore) expect(readFileSync(join(dataDir, file))).toEqual(bytes);
      const inspected = new Database(databasePath, { readonly: true, fileMustExist: true });
      try {
        expect(inspected.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 6 });
        expect(inspected.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_aliases'").get()).toBeUndefined();
        expect(inspected.prepare('SELECT identity_key,display_name FROM projects').all()).toEqual([{ identity_key: 'path:C:/known', display_name: 'Known' }]);
      } finally { inspected.close(); }
      expect(stderr.mock.calls.flat().join('')).toMatch(/selector did not match/i);
    } finally { rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('does not create WAL sidecars while preflighting an unknown selector', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-project-unknown-wal-'));
    const databasePath = join(dataDir, 'memory.sqlite');
    const memory = new MemoryService({ databasePath });
    memory.save({ project: { key: 'path:C:/known', name: 'Known' }, evidence: { kind: 'explicit_save', content: 'fixture' } });
    memory.close();
    const filesBefore = readdirSync(dataDir).sort();
    const bytesBefore = new Map(filesBefore.map((file) => [file, readFileSync(join(dataDir, file))]));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['project', 'rename', '--project=path:C:/unknown', '--name=After', `--data-dir=${dataDir}`])).toBe(1);
      expect(readdirSync(dataDir).sort()).toEqual(filesBefore);
      for (const [file, bytes] of bytesBefore) expect(readFileSync(join(dataDir, file))).toEqual(bytes);
      expect(stderr.mock.calls.flat().join('')).toMatch(/selector did not match/i);
    } finally { rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('preserves existing WAL and SHM bytes while preflighting an unknown selector', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-project-active-wal-'));
    const databasePath = join(dataDir, 'memory.sqlite');
    const memory = new MemoryService({ databasePath });
    memory.save({ project: { key: 'path:C:/known', name: 'Known' }, evidence: { kind: 'explicit_save', content: 'active WAL fixture' } });
    const filesBefore = readdirSync(dataDir).sort();
    const bytesBefore = new Map(filesBefore.map((file) => [file, readFileSync(join(dataDir, file))]));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      expect(filesBefore).toEqual(['memory.sqlite', 'memory.sqlite-shm', 'memory.sqlite-wal']);
      expect(await runCli(['project', 'rename', '--project=path:C:/unknown', '--name=After', `--data-dir=${dataDir}`])).toBe(1);
      expect(readdirSync(dataDir).sort()).toEqual(filesBefore);
      for (const [file, bytes] of bytesBefore) expect(readFileSync(join(dataDir, file))).toEqual(bytes);
      expect(stderr.mock.calls.flat().join('')).toMatch(/selector did not match/i);
      expect(await runCli(['project', 'rename', '--project=path:C:/known', '--name=After', `--data-dir=${dataDir}`])).toBe(0);
      expect(JSON.parse(String(stdout.mock.calls.at(-1)?.[0]))).toMatchObject({ data: { key: 'path:C:/known', newName: 'After' } });
    } finally {
      memory.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('migrates and renames an existing revision-6 project only after a read-only selector match', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-project-known-existing-'));
    const databasePath = join(dataDir, 'memory.sqlite');
    const timestamp = '2026-08-31T00:00:00.000Z';
    const database = new Database(databasePath);
    database.exec(REVISION_SIX_SCHEMA_SQL);
    database.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(6, timestamp);
    database.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project-1', 'path:C:/known', 'Before', null, timestamp, timestamp);
    database.close();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['project', 'rename', '--project=path:C:/known', '--name=After', `--data-dir=${dataDir}`])).toBe(0);
      expect(JSON.parse(String(stdout.mock.calls.at(-1)?.[0]))).toMatchObject({ data: { projectId: 'project-1', key: 'path:C:/known', newName: 'After', changed: true } });
      const inspected = new Database(databasePath, { readonly: true, fileMustExist: true });
      try {
        expect(inspected.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: SQLITE_SCHEMA_REVISION });
        expect(inspected.prepare('SELECT display_name FROM projects WHERE id=?').get('project-1')).toEqual({ display_name: 'After' });
      } finally { inspected.close(); }
    } finally { rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('rejects an unsafe display name before opening a database', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-project-unsafe-name-'));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli([
        'project',
        'rename',
        '--project',
        'git:55555555-5555-4555-8555-555555555555',
        '--name',
        'unsafe\nname',
        '--data-dir',
        dataDir,
      ])).toBe(2);
      expect(existsSync(join(dataDir, 'memory.sqlite'))).toBe(false);
      expect(stderr.mock.calls.flat().join('')).toMatch(/display name/i);
    } finally { rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('rejects an oversized selector before opening a database', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-project-oversized-selector-'));
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli([
        'project',
        'rename',
        '--project',
        `path:${'x'.repeat(4097)}`,
        '--name',
        'After',
        '--data-dir',
        dataDir,
      ])).toBe(2);
      expect(existsSync(join(dataDir, 'memory.sqlite'))).toBe(false);
      expect(stderr.mock.calls.flat().join('')).toMatch(/selector/i);
    } finally { rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('rejects every prohibited selector control before opening a database', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    for (const control of ['\t', '\u001b', '\u001f', '\r', '\n', '\0']) {
      const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-project-control-selector-'));
      try {
        expect(await runCli([
          'project',
          'rename',
          '--project',
          `path:C:/unsafe${control}selector`,
          '--name',
          'After',
          '--data-dir',
          dataDir,
        ])).toBe(2);
        expect(existsSync(join(dataDir, 'memory.sqlite'))).toBe(false);
      } finally { rmSync(dataDir, { recursive: true, force: true }); }
    }
    expect(stderr.mock.calls).toHaveLength(6);
  });

  it('rejects duplicate, extra, blank, and oversized rename arguments without durable side effects', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const cases = [
      ['--project=git:55555555-5555-4555-8555-555555555555', '--name=After', '--name=Again'],
      ['--project=git:55555555-5555-4555-8555-555555555555', '--name=After', 'extra'],
      ['--project=git:55555555-5555-4555-8555-555555555555', '--name='],
      ['--project=git:55555555-5555-4555-8555-555555555555', `--name=${'x'.repeat(129)}`],
    ];
    for (const invalidArguments of cases) {
      const dataDir = mkdtempSync(join(tmpdir(), 'thoth-cli-project-invalid-arguments-'));
      try {
        expect(await runCli(['project', 'rename', ...invalidArguments, `--data-dir=${dataDir}`])).toBe(2);
        expect(existsSync(join(dataDir, 'memory.sqlite'))).toBe(false);
      } finally { rmSync(dataDir, { recursive: true, force: true }); }
    }
    expect(stderr.mock.calls).toHaveLength(cases.length);
  });
});
