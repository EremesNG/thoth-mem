import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { applyDatabaseCompaction, previewDatabaseCompaction } from '../../src/store/compaction.js';
import type { DatabaseCompactionRuntime } from '../../src/store/compaction.js';

function fileDigest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function createFreelistDatabase(directory: string, rows = 400): string {
  const dbPath = join(directory, 'thoth.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE memories (id INTEGER PRIMARY KEY, content TEXT NOT NULL); CREATE INDEX memories_content ON memories(content);');
  const insert = db.prepare('INSERT INTO memories(content) VALUES (?)');
  const insertMany = db.transaction(() => {
    for (let index = 0; index < rows; index += 1) insert.run(`${index}:${'x'.repeat(2000)}`);
  });
  insertMany();
  db.exec('DELETE FROM memories WHERE id > 5');
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  return dbPath;
}

describe('database compaction', () => {
  const tempDirectories: string[] = [];

  afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function tempDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), 'thoth-compaction-'));
    tempDirectories.push(directory);
    return directory;
  }

  it('previews a sidecar-free database through immutable access without changing any file', () => {
    const directory = tempDirectory();
    const dbPath = createFreelistDatabase(directory);
    const beforeEntries = readdirSync(directory).sort();
    const beforeDigest = fileDigest(dbPath);
    const beforeBytes = statSync(dbPath).size;

    const preview = previewDatabaseCompaction(dbPath);

    expect(preview.dry_run).toBe(true);
    expect(preview.metrics).toMatchObject({
      database_path: dbPath,
      database_bytes: beforeBytes,
      wal_bytes: 0,
      shm_bytes: 0,
      wal_present: false,
      shm_present: false,
      sidecar_state: 'none',
      journal_mode: 'wal',
    });
    expect(preview.metrics.logical_database_bytes)
      .toBe(preview.metrics.page_size * preview.metrics.page_count);
    expect(preview.metrics.reclaimable_bytes)
      .toBe(preview.metrics.page_size * preview.metrics.freelist_count);
    expect(preview.metrics.required_free_bytes)
      .toBe(2 * Math.max(beforeBytes, preview.metrics.logical_database_bytes));
    expect(preview.metrics.freelist_count).toBeGreaterThan(0);
    expect(readdirSync(directory).sort()).toEqual(beforeEntries);
    expect(fileDigest(dbPath)).toBe(beforeDigest);
    expect(statSync(dbPath).size).toBe(beforeBytes);
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
  });

  it('fails closed for a missing target without creating its parent or sidecars', () => {
    const directory = tempDirectory();
    const missingParent = join(directory, 'missing');
    const dbPath = join(missingParent, 'thoth.db');

    expect(() => previewDatabaseCompaction(dbPath)).toThrow(/target.*missing|does not exist/i);
    expect(existsSync(missingParent)).toBe(false);
  });

  it('enables immutable URI handling before a fresh child constructs SQLite', () => {
    const directory = tempDirectory();
    const dbPath = createFreelistDatabase(directory);
    const script = `
      const { previewDatabaseCompaction } = await import('./src/store/compaction.ts');
      const result = previewDatabaseCompaction(${JSON.stringify(dbPath)});
      process.stdout.write(JSON.stringify({ env: process.env.SQLITE_USE_URI, state: result.metrics.sidecar_state }));
    `;

    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, SQLITE_USE_URI: '0' },
      timeout: 15_000,
    });

    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({ env: '1', state: 'none' });
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
  });

  it('fails closed when a child preinitializes SQLite with URI handling disabled', () => {
    const directory = tempDirectory();
    const dbPath = createFreelistDatabase(directory);
    const script = `
      const { default: Database } = await import('better-sqlite3');
      const initialized = new Database(':memory:');
      initialized.close();
      const { previewDatabaseCompaction } = await import('./src/store/compaction.ts');
      try {
        previewDatabaseCompaction(${JSON.stringify(dbPath)});
        process.stdout.write('unexpected-success');
      } catch (error) {
        process.stdout.write(error instanceof Error ? error.message : String(error));
      }
    `;

    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, SQLITE_USE_URI: '0' },
      timeout: 15_000,
    });

    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout).toMatch(/URI runtime unavailable/i);
    expect(child.stdout).not.toContain('unexpected-success');
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
  });

  it('uses read-only access for a complete WAL/SHM pair and rejects ambiguous sidecars', () => {
    const pairedDirectory = tempDirectory();
    const pairedPath = join(pairedDirectory, 'thoth.db');
    const writer = new Database(pairedPath);
    try {
      writer.pragma('journal_mode = WAL');
      writer.exec('CREATE TABLE durable (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO durable(value) VALUES (\'visible in WAL\')');
      expect(existsSync(`${pairedPath}-wal`)).toBe(true);
      expect(existsSync(`${pairedPath}-shm`)).toBe(true);

      const preview = previewDatabaseCompaction(pairedPath);
      expect(preview.metrics.sidecar_state).toBe('wal-and-shm');
      expect(preview.metrics.logical_database_bytes).toBeGreaterThanOrEqual(preview.metrics.database_bytes);
    } finally {
      writer.close();
    }

    const partialDirectory = tempDirectory();
    const partialPath = createFreelistDatabase(partialDirectory);
    writeFileSync(`${partialPath}-wal`, 'ambiguous');
    expect(() => previewDatabaseCompaction(partialPath)).toThrow(/complete readable WAL\/SHM pair/i);
    expect(existsSync(`${partialPath}-shm`)).toBe(false);

    rmSync(`${partialPath}-wal`);
    mkdirSync(`${partialPath}-shm`);
    mkdirSync(`${partialPath}-wal`);
    expect(() => previewDatabaseCompaction(partialPath)).toThrow(/not a regular file/i);
  });

  it('compacts through SQLite VACUUM and preserves schema and durable rows', () => {
    const directory = tempDirectory();
    const dbPath = createFreelistDatabase(directory, 800);
    const beforeBytes = statSync(dbPath).size;

    const result = applyDatabaseCompaction(dbPath);

    expect(result).toMatchObject({
      dry_run: false,
      skipped: false,
      skip_reason: null,
      checks: {
        pre_integrity_ok: true,
        post_integrity_ok: true,
        pre_foreign_key_violations: 0,
        post_foreign_key_violations: 0,
        schema_identity_preserved: true,
        durable_counts_preserved: true,
        final_journal_mode: 'wal',
      },
    });
    expect(result.before.database_bytes).toBe(beforeBytes);
    expect(result.after.database_bytes).toBeLessThan(beforeBytes / 2);
    expect(result.reclaimed_bytes).toBe(beforeBytes - result.after.database_bytes);
    const reopened = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      expect(reopened.prepare('SELECT COUNT(*) AS count FROM memories').get()).toEqual({ count: 5 });
      expect(reopened.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = 'memories_content'").get())
        .toEqual({ name: 'memories_content' });
      expect(reopened.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      reopened.close();
    }
  });

  it('cannot substitute the SQLite VACUUM operation through the public runtime seam', () => {
    const directory = tempDirectory();
    const dbPath = createFreelistDatabase(directory, 800);

    const result = applyDatabaseCompaction(dbPath, { vacuum: () => undefined });

    expect(result.after.freelist_count).toBe(0);
    expect(result.after.database_bytes).toBeLessThan(result.before.database_bytes);
  });

  it('returns a zero-freelist no-op before checkpoint hooks are reached', () => {
    const directory = tempDirectory();
    const dbPath = join(directory, 'thoth.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE durable (id INTEGER PRIMARY KEY, value TEXT)');
    db.close();
    let checkpointReached = false;

    const result = applyDatabaseCompaction(dbPath, {
      beforeCheckpoint: () => { checkpointReached = true; },
    });

    expect(result.skipped).toBe(true);
    expect(result.skip_reason).toBe('no-reclaimable-pages');
    expect(result.before).toEqual(result.after);
    expect(result.reclaimed_bytes).toBe(0);
    expect(checkpointReached).toBe(false);
  });

  it('does not return stale no-op success when reclaimable pages appear after preview', () => {
    const directory = tempDirectory();
    const dbPath = join(directory, 'thoth.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE durable (id INTEGER PRIMARY KEY, value TEXT)');
    db.close();
    const runtime: DatabaseCompactionRuntime & { beforeNoOpValidation: () => void } = {
      beforeNoOpValidation: () => {
        const writer = new Database(dbPath);
        try {
          writer.exec('CREATE TABLE transient_payload (value TEXT NOT NULL)');
          const insert = writer.prepare('INSERT INTO transient_payload(value) VALUES (?)');
          writer.transaction(() => {
            for (let index = 0; index < 400; index += 1) insert.run('s'.repeat(2000));
          })();
          writer.exec('DROP TABLE transient_payload');
          writer.pragma('wal_checkpoint(TRUNCATE)');
        } finally {
          writer.close();
        }
      },
    };

    expect(() => applyDatabaseCompaction(dbPath, runtime)).toThrow(/no-op.*freelist|state changed/i);

    const reopened = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      expect(reopened.pragma('freelist_count', { simple: true })).toBeGreaterThan(0);
    } finally {
      reopened.close();
    }
  });

  it('validates a zero-freelist database instead of returning false-success checks', () => {
    const directory = tempDirectory();
    const dbPath = join(directory, 'thoth.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
      INSERT INTO child(id, parent_id) VALUES (1, 999);
    `);
    db.pragma('wal_checkpoint(TRUNCATE)');
    expect(db.pragma('freelist_count', { simple: true })).toBe(0);
    db.close();
    let checkpointReached = false;
    let vacuumReached = false;

    expect(() => applyDatabaseCompaction(dbPath, {
      beforeCheckpoint: () => { checkpointReached = true; },
      vacuum: () => { vacuumReached = true; },
    })).toThrow(/foreign-key check found 1 violation/i);
    expect(checkpointReached).toBe(false);
    expect(vacuumReached).toBe(false);
  });

  it('enforces capacity both before and after checkpoint without VACUUM success', () => {
    for (const failingPhase of ['before-checkpoint', 'after-checkpoint'] as const) {
      const directory = tempDirectory();
      const dbPath = createFreelistDatabase(directory);
      const beforeDigest = fileDigest(dbPath);
      let vacuumReached = false;

      expect(() => applyDatabaseCompaction(dbPath, {
        filesystemFreeBytes: (_path, phase) => phase === failingPhase ? 0 : Number.MAX_SAFE_INTEGER,
        beforeVacuum: () => { vacuumReached = true; },
      })).toThrow(new RegExp(failingPhase));
      expect(vacuumReached).toBe(false);
      expect(fileDigest(dbPath)).toBe(beforeDigest);
    }
  });

  it('counts committed uncheckpointed WAL growth in the conservative capacity gate', () => {
    const directory = tempDirectory();
    const dbPath = join(directory, 'thoth.db');
    const writer = new Database(dbPath);
    try {
      writer.pragma('journal_mode = WAL');
      writer.pragma('wal_autocheckpoint = 0');
      writer.exec('CREATE TABLE payloads (id INTEGER PRIMARY KEY, content TEXT NOT NULL)');
      const insert = writer.prepare('INSERT INTO payloads(content) VALUES (?)');
      writer.transaction(() => {
        for (let index = 0; index < 500; index += 1) insert.run('w'.repeat(4000));
      })();

      const preview = previewDatabaseCompaction(dbPath);
      expect(preview.metrics.wal_bytes).toBeGreaterThan(0);
      expect(preview.metrics.logical_database_bytes).toBeGreaterThan(preview.metrics.database_bytes);
      expect(preview.metrics.required_free_bytes).toBe(2 * preview.metrics.logical_database_bytes);
    } finally {
      writer.close();
    }
  });

  it('rejects a busy TRUNCATE checkpoint and foreign-key-invalid content before VACUUM', () => {
    const busyDirectory = tempDirectory();
    const busyPath = join(busyDirectory, 'thoth.db');
    const writer = new Database(busyPath);
    writer.pragma('journal_mode = WAL');
    writer.pragma('wal_autocheckpoint = 0');
    writer.exec('CREATE TABLE durable (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO durable(value) VALUES (\'first\'); CREATE TABLE filler (value TEXT)');
    const busyFill = writer.prepare('INSERT INTO filler(value) VALUES (?)');
    writer.transaction(() => {
      for (let index = 0; index < 200; index += 1) busyFill.run('b'.repeat(2000));
    })();
    writer.exec('DELETE FROM filler');
    const reader = new Database(busyPath, { readonly: true });
    reader.exec('BEGIN');
    reader.prepare('SELECT * FROM durable').all();
    writer.exec("INSERT INTO durable(value) VALUES ('second')");
    writer.close();
    try {
      expect(() => applyDatabaseCompaction(busyPath)).toThrow(/checkpoint.*busy|database is locked/i);
      expect(reader.prepare('SELECT COUNT(*) AS count FROM durable').get()).toEqual({ count: 1 });
    } finally {
      reader.exec('ROLLBACK');
      reader.close();
    }

    const invalidDirectory = tempDirectory();
    const invalidPath = join(invalidDirectory, 'thoth.db');
    const invalid = new Database(invalidPath);
    invalid.pragma('journal_mode = WAL');
    invalid.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
      INSERT INTO child(id, parent_id) VALUES (1, 999);
      CREATE TABLE filler (id INTEGER PRIMARY KEY, value TEXT);
    `);
    const fill = invalid.prepare('INSERT INTO filler(value) VALUES (?)');
    invalid.transaction(() => {
      for (let index = 0; index < 200; index += 1) fill.run('f'.repeat(2000));
    })();
    invalid.exec('DELETE FROM filler');
    invalid.pragma('wal_checkpoint(TRUNCATE)');
    invalid.close();

    expect(() => applyDatabaseCompaction(invalidPath)).toThrow(/foreign-key check found 1 violation/i);
    const unchanged = new Database(invalidPath, { readonly: true });
    try {
      expect(unchanged.prepare('SELECT parent_id FROM child').get()).toEqual({ parent_id: 999 });
    } finally {
      unchanged.close();
    }
  });

  it('reports post-commit verification failure without claiming rollback or deleting SQLite files', () => {
    const directory = tempDirectory();
    const dbPath = createFreelistDatabase(directory);

    expect(() => applyDatabaseCompaction(dbPath, {
      afterReopen: () => { throw new Error('injected durable-read failure'); },
    })).toThrow(/post-commit verification.*injected durable-read failure/i);
    expect(existsSync(dbPath)).toBe(true);
    expect(readdirSync(directory).every((name) => name.startsWith('thoth.db'))).toBe(true);
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      expect(db.prepare('SELECT COUNT(*) AS count FROM memories').get()).toEqual({ count: 5 });
    } finally {
      db.close();
    }
  });

  it('reports a failed VACUUM without false success and preserves prior logical state', () => {
    const directory = tempDirectory();
    const dbPath = createFreelistDatabase(directory);

    expect(() => applyDatabaseCompaction(dbPath, {
      vacuum: () => { throw new Error('injected VACUUM interruption'); },
    })).toThrow(/apply.*VACUUM interruption/i);
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      expect(db.prepare('SELECT COUNT(*) AS count FROM memories').get()).toEqual({ count: 5 });
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      db.close();
    }
  });
});
