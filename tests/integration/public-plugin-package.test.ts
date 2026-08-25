import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CANONICAL_PUBLIC_PLUGIN_INVENTORY,
  validateIntegrationInventory,
  type IntegrationInventory,
} from '../../src/integration/package-inventory.js';

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

const copyPublicReleaseFixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'thoth-public-stale-'));
  for (const path of ['package.json', 'integrations', 'plugin', '.agents', '.claude-plugin']) {
    cpSync(path, join(root, path), { recursive: true });
  }
  return root;
};

const verifyFixture = (root: string) => spawnSync(process.execPath, ['scripts/verify-integration-package.mjs'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, THOTH_MEM_VERIFY_ROOT: root },
  windowsHide: true,
});

describe('public plugin release inventory', () => {
  it('owns exactly two marketplace anchors and one complete shared plugin root', () => {
    const inventory = validateIntegrationInventory(readJson<IntegrationInventory>('integrations/inventory.json'));
    expect(inventory.publicDistribution.marketplaces).toEqual({
      codex: '.agents/plugins/marketplace.json',
      'claude-code': '.claude-plugin/marketplace.json',
    });
    expect(inventory.publicDistribution.assets).toEqual(CANONICAL_PUBLIC_PLUGIN_INVENTORY);
    for (const path of Object.values(inventory.publicDistribution.marketplaces)) expect(existsSync(path), path).toBe(true);
    for (const path of inventory.publicDistribution.assets) expect(existsSync(join('plugin', path)), path).toBe(true);
  });

  it('keeps every public version and pinned runtime synchronized with the package', () => {
    const packageManifest = readJson<{ version: string; files: string[]; scripts: Record<string, string> }>('package.json');
    const runtime = readJson<{ package: string; version: string }>('plugin/runtime.json');
    const codex = readJson<{ version: string }>('plugin/.codex-plugin/plugin.json');
    const claude = readJson<{ version: string }>('plugin/.claude-plugin/plugin.json');
    const claudeMarketplace = readJson<{ plugins: Array<{ version: string }> }>('.claude-plugin/marketplace.json');
    const claudeMcp = readJson<{ mcpServers: Record<string, { args: string[] }> }>('plugin/.mcp.json');
    expect([runtime.version, codex.version, claude.version, claudeMarketplace.plugins[0]!.version]).toEqual(Array(4).fill(packageManifest.version));
    expect(claudeMcp.mcpServers['thoth-mem']!.args).toContain(`thoth-mem@${packageManifest.version}`);
    expect(packageManifest.files).toEqual(expect.arrayContaining(['plugin', '.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json']));
    expect(packageManifest.scripts.version).toContain('integration:sync');
    expect(packageManifest.scripts.prepublishOnly).toContain('integration:verify');
  });

  it('fails release verification for a stale public runtime fixture', () => {
    const root = copyPublicReleaseFixture();
    try {
      const runtimePath = join(root, 'plugin', 'runtime.json');
      writeFileSync(runtimePath, `${JSON.stringify({ package: 'thoth-mem', version: '0.0.0' })}\n`);
      const result = verifyFixture(root);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('stale-version:plugin/runtime.json:0.0.0');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['marketplace', '.agents/plugins/marketplace.json', '"./plugin"', '"./stale-plugin"'],
    ['manifest', 'plugin/.codex-plugin/plugin.json', '"./.mcp.json"', '"./stale.mcp.json"'],
    ['MCP descriptor', 'plugin/.mcp.json', 'thoth-mem@0.4.13', 'thoth-mem@0.0.0'],
    ['hook command', 'plugin/hooks/hooks.json', 'public-runner.mjs', 'stale-runner.mjs'],
    ['Skill', 'plugin/skills/thoth-mem/SKILL.md', 'six v2 MCP tools', 'seven legacy MCP tools'],
    ['launcher', 'plugin/runners/public-runner.mjs', 'lifecycle-v2', 'lifecycle-stale'],
  ])('fails release verification for a stale %s asset', (_category, relativePath, current, stale) => {
    const root = copyPublicReleaseFixture();
    try {
      const path = join(root, relativePath);
      const original = readFileSync(path, 'utf8');
      expect(original).toContain(current);
      writeFileSync(path, original.replace(current, stale));
      const result = verifyFixture(root);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`stale-public-asset:${relativePath.replaceAll('\\', '/')}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
