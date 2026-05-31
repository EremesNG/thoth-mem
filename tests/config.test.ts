import { describe, it, expect, afterEach, beforeEach } from 'vitest';
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

describe('embedding config (hybrid retrieval baseline)', () => {
  const originalEnv = { ...process.env };
  let tmpDataDir: string | null = null;

  beforeEach(() => {
    process.env = { ...originalEnv };
    tmpDataDir = mkdtempSync(join(tmpdir(), 'thoth-config-test-'));
    process.env.THOTH_DATA_DIR = tmpDataDir;
  });

  afterEach(() => {
    if (tmpDataDir) {
      rmSync(tmpDataDir, { recursive: true, force: true });
      tmpDataDir = null;
    }
    process.env = { ...originalEnv };
  });

  it('embedding: exposes Hybrid Retrieval retrieval defaults', () => {
    const config = getConfig() as any;

    expect(config.retrievalDefaults).toEqual({
      sentenceTopK: 100,
      chunkTopK: 20,
      lexicalLimit: 20,
      minSemanticScore: 0.3,
      l2DistanceScale: 20,
    });
  });

  it('embedding: resolves provider from env before config file and defaults', () => {
    process.env.THOTH_EMBEDDING_PROVIDER = 'ollama';
    process.env.THOTH_EMBEDDING_MODEL = 'nomic-embed-text';
    process.env.THOTH_EMBEDDING_BASE_URL = 'http://127.0.0.1:11434';

    const config = getConfig() as any;

    expect(config.embedding.provider).toBe('ollama');
    expect(config.embedding.model).toBe('nomic-embed-text');
    expect(config.embedding.baseUrl).toBe('http://127.0.0.1:11434');
    expect(config.embedding.dimensions).toBe(768);
  });

  it('embedding: falls back to local transformers only when provider is unset', () => {
    delete process.env.THOTH_EMBEDDING_PROVIDER;
    delete process.env.THOTH_EMBEDDING_MODEL;
    delete process.env.THOTH_EMBEDDING_BASE_URL;

    const config = getConfig() as any;

    expect(config.embedding.provider).toBe('transformers_local');
    expect(config.embedding.model).toBe('nomic-ai/nomic-embed-text-v1.5');
    expect(config.embedding.dimensions).toBe(768);
  });

  it('embedding: exposes canonical config hash that is stable for same inputs and changes when provider changes', () => {
    process.env.THOTH_EMBEDDING_PROVIDER = 'ollama';
    process.env.THOTH_EMBEDDING_MODEL = 'nomic-embed-text';
    process.env.THOTH_EMBEDDING_BASE_URL = 'http://127.0.0.1:11434';

    const configA = getConfig() as any;
    const configB = getConfig() as any;

    process.env.THOTH_EMBEDDING_PROVIDER = 'lmstudio';
    const configC = getConfig() as any;

    expect(configA.embedding.configHash).toBe(configB.embedding.configHash);
    expect(configA.embedding.configHash).not.toBe(configC.embedding.configHash);
  });
});
