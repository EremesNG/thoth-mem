import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getRuntimeConfigPath,
  loadRuntimeConfig,
  persistRuntimeConfig,
  persistRuntimeDataDir,
} from '../../src/config/runtime.js';

describe('runtime provider configuration', () => {
  it('resolves explicit, environment, file, and default data directories in order', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-runtime-config-'));
    try {
      const configPath = getRuntimeConfigPath({ homeDir: root, env: {} });
      mkdirSync(join(root, '.config', 'thoth-mem'), { recursive: true });
      writeFileSync(configPath, JSON.stringify({ version: 2, dataDir: join(root, 'file-data') }));

      expect(loadRuntimeConfig({ homeDir: root, env: {} }).dataDir).toBe(join(root, 'file-data'));
      expect(loadRuntimeConfig({ homeDir: root, env: { THOTH_MEM_DATA_DIR: join(root, 'env-data') } }).dataDir).toBe(join(root, 'env-data'));
      expect(loadRuntimeConfig({ homeDir: root, env: { THOTH_MEM_DATA_DIR: join(root, 'env-data') }, explicitDataDir: join(root, 'explicit-data') }).dataDir).toBe(join(root, 'explicit-data'));

      rmSync(configPath);
      expect(loadRuntimeConfig({ homeDir: root, env: {} }).dataDir).toBe(join(root, '.thoth-mem'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['malformed JSON', '{'],
    ['wrong schema version', JSON.stringify({ version: 1, dataDir: 'data' })],
    ['unknown field', JSON.stringify({ version: 2, dataDir: 'data', secret: 'nope' })],
  ])('fails closed for %s', (_label, content) => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-runtime-invalid-'));
    try {
      const configPath = getRuntimeConfigPath({ homeDir: root, env: {} });
      mkdirSync(join(root, '.config', 'thoth-mem'), { recursive: true });
      writeFileSync(configPath, content);
      expect(() => loadRuntimeConfig({ homeDir: root, env: {} })).toThrow(/provider configuration/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed when the provider config path is not a file', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-runtime-not-file-'));
    try {
      mkdirSync(getRuntimeConfigPath({ homeDir: root, env: {} }), { recursive: true });
      expect(() => loadRuntimeConfig({ homeDir: root, env: {} })).toThrow(/provider configuration/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('atomically persists only dataDir and preserves other valid provider fields', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-runtime-write-'));
    try {
      const configPath = getRuntimeConfigPath({ homeDir: root, env: {} });
      mkdirSync(join(root, '.config', 'thoth-mem'), { recursive: true });
      writeFileSync(configPath, `${JSON.stringify({ version: 2, recall: { compactChars: 512 }, plugins: { opencode: true } }, null, 2)}\n`);

      const dataDir = join(root, 'shared-data');
      const result = persistRuntimeDataDir(dataDir, { homeDir: root, env: {} });
      expect(result).toEqual({ path: configPath, changed: true, dataDir });
      expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({
        version: 2,
        recall: { compactChars: 512 },
        plugins: { opencode: true },
        dataDir,
      });
      expect(existsSync(`${configPath}.tmp`)).toBe(false);
      expect(persistRuntimeDataDir(dataDir, { homeDir: root, env: {} }).changed).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('persists an explicit local runtime entry with the shared data directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-runtime-local-entry-'));
    try {
      const configPath = getRuntimeConfigPath({ homeDir: root, env: {} });
      const runtimeEntry = join(root, 'package', 'dist', 'index.js');
      const dataDir = join(root, 'shared-data');
      const result = persistRuntimeConfig({ dataDir, runtimeEntry }, { homeDir: root, env: {} });

      expect(result).toEqual({ path: configPath, changed: true });
      expect(loadRuntimeConfig({ homeDir: root, env: {} }).provider).toEqual({
        version: 2,
        dataDir,
        runtimeEntry,
      });
      expect(persistRuntimeConfig({ dataDir, runtimeEntry }, { homeDir: root, env: {} }).changed).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
