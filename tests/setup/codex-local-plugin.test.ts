import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { syncCodexLocalPlugin } from '../../scripts/setup-codex-local.mjs';

function json(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('Codex local plugin setup', () => {
  it('replaces the personal payload with a cache-busted copy that runs the checkout dist', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth codex local setup '));
    try {
      const repositoryRoot = join(root, 'checkout');
      const homeDirectory = join(root, 'home');
      const marketplacePath = join(homeDirectory, '.agents', 'plugins', 'marketplace.json');
      const pluginTarget = join(homeDirectory, 'plugins', 'thoth-mem');
      mkdirSync(repositoryRoot, { recursive: true });
      cpSync(join(process.cwd(), 'plugin'), join(repositoryRoot, 'plugin'), { recursive: true });
      mkdirSync(join(repositoryRoot, 'dist'), { recursive: true });
      writeFileSync(join(repositoryRoot, 'dist', 'index.js'), '// built runtime\n');
      writeFileSync(join(repositoryRoot, 'package.json'), `${JSON.stringify({ name: 'thoth-mem', version: '0.4.13' }, null, 2)}\n`);
      mkdirSync(join(homeDirectory, '.agents', 'plugins'), { recursive: true });
      const marketplace = '{"name":"personal","plugins":[]}\n';
      writeFileSync(marketplacePath, marketplace);
      mkdirSync(pluginTarget, { recursive: true });
      writeFileSync(join(pluginTarget, 'stale.txt'), 'remove me');
      const sourceManifestPath = join(repositoryRoot, 'plugin', '.codex-plugin', 'plugin.json');
      const sourceManifest = readFileSync(sourceManifestPath, 'utf8');

      const result = syncCodexLocalPlugin({
        repositoryRoot,
        homeDirectory,
        cachebuster: '20260831T120000Z',
      });

      const runtimeEntry = resolve(repositoryRoot, 'dist', 'index.js');
      expect(result).toEqual({
        pluginTarget: resolve(pluginTarget),
        runtimeEntry,
        version: '0.4.13+codex.local-20260831T120000Z',
      });
      expect(readFileSync(marketplacePath, 'utf8')).toBe(marketplace);
      expect(readFileSync(sourceManifestPath, 'utf8')).toBe(sourceManifest);
      expect(() => readFileSync(join(pluginTarget, 'stale.txt'), 'utf8')).toThrow();
      expect(json(join(pluginTarget, '.codex-plugin', 'plugin.json')).version).toBe(result.version);
      expect(json(join(pluginTarget, '.claude-plugin', 'plugin.json')).version).toBe(result.version);
      expect(json(join(pluginTarget, 'runtime.json'))).toEqual({
        package: 'thoth-mem',
        version: '0.4.13',
        entry: runtimeEntry,
      });
      expect(json(join(pluginTarget, '.mcp.json'))).toEqual({
        mcpServers: {
          'thoth-mem': {
            cwd: resolve(repositoryRoot),
            command: process.execPath,
            args: [runtimeEntry, 'mcp', '--no-http'],
          },
        },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
