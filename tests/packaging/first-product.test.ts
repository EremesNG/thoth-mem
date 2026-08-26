import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CANONICAL_PLUGIN_INVENTORY } from '../../src/integration/package-inventory.js';

const deferred = /(@xenova|transformers|embedding|hyde|knowledge.graph|dashboard|observatory|http-server|vitest\.browser)/i;

describe('first-product packed boundary', () => {
  it('packs, installs, cold-starts, and activates hook lifecycle from all three disposable hosts', () => {
    const smoke = spawnSync(process.execPath, ['scripts/verify-packed-plugins.mjs'], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true, timeout: 120_000 });
    expect(smoke.status, `${smoke.stdout}\n${smoke.stderr}`).toBe(0);
    expect(smoke.stdout).toContain('Packed smoke passed for opencode, codex, claude-code.');
    expect(smoke.stdout).toContain('Activated lifecycle fixtures for opencode, codex, claude-code.');
  }, 120_000);

  it('keeps exact hook/MCP/Skill ownership and no deferred active package, workspace, config, or CI references', () => {
    const inventory = JSON.parse(readFileSync('integrations/inventory.json', 'utf8')) as { harnesses: Record<string, string[]> };
    expect(inventory.harnesses).toEqual(CANONICAL_PLUGIN_INVENTORY);
    expect(inventory.harnesses.opencode).toEqual([
      'skills/thoth-mem/SKILL.md',
      'skills/thoth-mem/references/opencode.md',
    ]);
    expect(inventory.harnesses.opencode).not.toContain('plugin.mjs');
    for (const assets of [inventory.harnesses.codex, inventory.harnesses['claude-code']]) {
      expect(assets.filter((asset) => /hooks?\.json$/.test(asset))).toHaveLength(1);
      expect(assets.filter((asset) => /mcp\.json$/.test(asset))).toHaveLength(1);
      expect(assets.filter((asset) => /SKILL\.md$/.test(asset))).toHaveLength(1);
    }
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      main: string;
      bin: Record<string, string>;
      dependencies: Record<string, string>;
      files: string[];
      scripts: Record<string, string>;
    };
    expect(manifest.main).toBe('dist/opencode.js');
    expect(manifest.bin).toEqual({ 'thoth-mem': 'dist/index.js' });
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      '@modelcontextprotocol/sdk',
      '@opencode-ai/plugin',
      'better-sqlite3',
      'jsonc-parser',
      'zod',
    ]);
    expect(manifest.files).toEqual([
      'dist',
      'config.schema.json',
      'README.md',
      'integrations',
      'plugin',
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      'benchmarks/manifest.json',
      'benchmarks/report.schema.json',
    ]);
    const active = ['package.json', 'pnpm-workspace.yaml', 'config.schema.json', '.github/workflows/ci.yml', '.github/workflows/release.yml'].map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(active).not.toMatch(deferred);
    expect(active).toContain('integration:smoke');
    expect(active).toContain('benchmark:fixture');
  });

  it('packs only the clean dist and the canonical integration inventory', () => {
    const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const packed = spawnSync(process.execPath, [npmCli, 'pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    expect(packed.status, packed.stderr).toBe(0);
    const paths = (JSON.parse(packed.stdout)[0].files as Array<{ path: string }>).map((file) => file.path.replaceAll('\\', '/'));
    expect(paths.filter((path) => path.startsWith('dist/'))).toEqual([
      'dist/index.js',
      'dist/index.js.map',
      'dist/opencode.js',
      'dist/opencode.js.map',
    ]);
    const integrations = paths.filter((path) => path.startsWith('integrations/')).sort();
    const expected = ['integrations/inventory.json', 'integrations/shared/hook-runner.mjs'];
    for (const [harness, assets] of Object.entries(CANONICAL_PLUGIN_INVENTORY)) for (const asset of assets) expected.push(`integrations/${harness}/${asset}`);
    expect(integrations).toEqual(expected.sort());
  });
});
