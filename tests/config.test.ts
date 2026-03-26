import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getConfig, resolveDataDir } from '../src/config.js';

describe('getConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns sensible defaults', () => {
    const config = getConfig();
    expect(config.maxContentLength).toBe(100_000);
    expect(config.maxContextResults).toBe(20);
    expect(config.maxSearchResults).toBe(20);
    expect(config.dedupeWindowMinutes).toBe(15);
    expect(config.previewLength).toBe(300);
    expect(config.httpPort).toBe(7438);
    expect(config.httpDisabled).toBe(false);
    expect(config.dataDir).toContain('.thoth');
    expect(config.dbPath).toContain('thoth.db');
  });

  it('respects THOTH_DATA_DIR env var', () => {
    process.env.THOTH_DATA_DIR = '/custom/path';
    const config = getConfig();
    expect(config.dataDir).toBe('/custom/path');
    expect(config.dbPath).toBe(join('/custom/path', 'thoth.db'));
  });

  it('respects numeric env var overrides', () => {
    process.env.THOTH_MAX_CONTENT_LENGTH = '50000';
    process.env.THOTH_MAX_CONTEXT_RESULTS = '10';
    process.env.THOTH_MAX_SEARCH_RESULTS = '5';
    process.env.THOTH_DEDUPE_WINDOW_MINUTES = '30';
    process.env.THOTH_PREVIEW_LENGTH = '500';
    process.env.THOTH_HTTP_PORT = '9000';
    process.env.THOTH_HTTP_DISABLED = 'true';
    const config = getConfig();
    expect(config.maxContentLength).toBe(50000);
    expect(config.maxContextResults).toBe(10);
    expect(config.maxSearchResults).toBe(5);
    expect(config.dedupeWindowMinutes).toBe(30);
    expect(config.previewLength).toBe(500);
    expect(config.httpPort).toBe(9000);
    expect(config.httpDisabled).toBe(true);
  });

  it('dbPath is derived from dataDir', () => {
    process.env.THOTH_DATA_DIR = '/test/dir';
    const config = getConfig();
    expect(config.dbPath).toBe(join('/test/dir', 'thoth.db'));
  });
});

describe('resolveDataDir', () => {
  it('creates data directory if it does not exist', () => {
    const tmpBase = mkdtempSync(join(tmpdir(), 'thoth-test-'));
    const dataDir = join(tmpBase, 'nested', 'dir');
    const config = getConfig();
    config.dataDir = dataDir;

    resolveDataDir(config);

    expect(existsSync(dataDir)).toBe(true);

    rmSync(tmpBase, { recursive: true, force: true });
  });
});
