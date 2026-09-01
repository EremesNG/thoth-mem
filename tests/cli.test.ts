import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

import { runCli } from '../src/cli.js';
import { MemoryService } from '../src/memory-core/service.js';
import { REVISION_SIX_SCHEMA_SQL } from '../src/memory-core/sqlite/schema.js';

afterEach(() => vi.restoreAllMocks());

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
        expect(inspected.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({ version: 7 });
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
