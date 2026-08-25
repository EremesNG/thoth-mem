import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCli } from '../../src/cli.js';

function createLegacy(path: string): void {
  const db = new Database(path);
  db.exec('CREATE TABLE sessions(id TEXT PRIMARY KEY,project TEXT,directory TEXT,started_at TEXT,ended_at TEXT,summary TEXT); CREATE TABLE user_prompts(id INTEGER PRIMARY KEY,session_id TEXT,content TEXT,project TEXT,created_at TEXT); CREATE TABLE observations(id INTEGER PRIMARY KEY,session_id TEXT,type TEXT,title TEXT,content TEXT,project TEXT,topic_key TEXT,created_at TEXT,deleted_at TEXT);');
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('s1', 'alpha', null, '2025-01-01T00:00:00.000Z', null, null);
  db.close();
}

afterEach(() => vi.restoreAllMocks());

describe('import-v2 CLI boundary', () => {
  it('requires explicit paths and writes a versioned report to an explicit new file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-cli-import-'));
    const source = join(root, 'legacy.sqlite'); const target = join(root, 'v2.sqlite'); const reportPath = join(root, 'report.json');
    createLegacy(source);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-v2'])).toBe(2);
      expect(stderr.mock.calls.flat().join('')).toMatch(/explicit --source and --target/);
      expect(await runCli(['import-v2', '--source', source, '--target', target, '--report', reportPath])).toBe(0);
      expect(stdout).not.toHaveBeenCalled();
      expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toMatchObject({ schema: 'thoth-mem.import.v2', targetPath: target });
      expect(existsSync(target)).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects unknown schemas and non-empty targets without destructive mutation and bounds errors', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-cli-import-invalid-'));
    const source = join(root, 'unknown.sqlite'); const target = join(root, 'occupied.sqlite'); const fresh = join(root, 'fresh.sqlite');
    const unknown = new Database(source); unknown.exec('CREATE TABLE something_else(value TEXT)'); unknown.close();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-v2', '--source', source, '--target', fresh])).toBe(1);
      expect(existsSync(fresh)).toBe(false);
      writeFileSync(target, 'do-not-touch'); const before = readFileSync(target);
      expect(await runCli(['import-v2', '--source', source, '--target', target])).toBe(1);
      expect(readFileSync(target)).toEqual(before);
      const output = stderr.mock.calls.flat().join('');
      expect(output).toMatch(/Unsupported legacy schema|must be empty or absent/);
      expect(Buffer.byteLength(output)).toBeLessThanOrEqual(1_200);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects an occupied report path before creating the target', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-cli-import-report-'));
    const source = join(root, 'legacy.sqlite'); const target = join(root, 'v2.sqlite'); const report = join(root, 'existing.json');
    createLegacy(source); writeFileSync(report, 'owned');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-v2', '--source', source, '--target', target, '--report', report])).toBe(1);
      expect(existsSync(target)).toBe(false);
      expect(readFileSync(report, 'utf8')).toBe('owned');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('writes a schema-valid bounded failure report without leaving a target', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-cli-import-failure-report-')); const source = join(root, 'unknown.sqlite'); const target = join(root, 'v2.sqlite'); const reportPath = join(root, 'failure.json');
    const db = new Database(source); db.exec('CREATE TABLE unknown(value TEXT)'); db.close(); vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['import-v2', '--source', source, '--target', target, '--report', reportPath])).toBe(1);
      expect(existsSync(target)).toBe(false);
      expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toMatchObject({ schema: 'thoth-mem.import.v2', reportVersion: 2, committed: false, errors: [{ code: 'UNSUPPORTED_SCHEMA' }] });
      expect(readFileSync(reportPath).length).toBeLessThan(5_000);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
