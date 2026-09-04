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
  for (const path of ['package.json', 'integrations', 'plugin']) {
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
  it('defines a selective durable-memory and actionable-handoff contract', () => {
    const skill = readFileSync('plugin/skills/thoth-mem/SKILL.md', 'utf8');
    for (const required of [
      'Save without waiting for an explicit',
      'will materially change how a future coding agent acts',
      '`topic_key`',
      'outcome',
      'Objective',
      'Completed',
      'First pending action',
      'Blockers',
      'Key files/checks',
      'supporting evidence',
      'assistant reasoning',
      'tool streams',
      'delegated output',
    ]) expect(skill, required).toContain(required);

    const observationReview = readFileSync('plugin/skills/thoth-mem/references/observation-review.md', 'utf8');
    expect(observationReview).toContain('observation_review');
    expect(observationReview).toContain('observation_promotion');
  });

  it('owns zero package marketplaces and one complete shared plugin root', () => {
    const inventory = validateIntegrationInventory(readJson<IntegrationInventory>('integrations/inventory.json'));
    expect(inventory.publicDistribution).not.toHaveProperty('marketplaces');
    expect(inventory.publicDistribution.assets).toEqual(CANONICAL_PUBLIC_PLUGIN_INVENTORY);
    for (const path of inventory.publicDistribution.assets) expect(existsSync(join('plugin', path)), path).toBe(true);
    expect(existsSync('.agents/plugins/marketplace.json')).toBe(false);
    expect(existsSync('.claude-plugin/marketplace.json')).toBe(false);
  });

  it('keeps every public version and pinned runtime synchronized with the package', () => {
    const packageManifest = readJson<{ version: string; files: string[]; scripts: Record<string, string> }>('package.json');
    const runtime = readJson<{ package: string; version: string }>('plugin/runtime.json');
    const codex = readJson<{ version: string }>('plugin/.codex-plugin/plugin.json');
    const claude = readJson<{ version: string }>('plugin/.claude-plugin/plugin.json');
    const claudeMcp = readJson<{ mcpServers: Record<string, { cwd: string; command: string; args: string[] }> }>('plugin/.mcp.json');
    expect([runtime.version, codex.version, claude.version]).toEqual(Array(3).fill(packageManifest.version));
    expect(claudeMcp.mcpServers['thoth-mem']).toEqual({ cwd: '.', command: 'node', args: ['./runners/public-runner.mjs', '--mcp'] });
    expect(packageManifest.files).toContain('plugin');
    expect(packageManifest.files).not.toContain('.agents/plugins/marketplace.json');
    expect(packageManifest.files).not.toContain('.claude-plugin/marketplace.json');
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
    ['manifest', 'plugin/.codex-plugin/plugin.json', '"./.mcp.json"', '"./stale.mcp.json"'],
    ['MCP descriptor', 'plugin/.mcp.json', './runners/public-runner.mjs', './runners/stale-runner.mjs'],
    ['hook command', 'plugin/hooks/hooks.json', 'public-runner.mjs', 'stale-runner.mjs'],
    ['Skill', 'plugin/skills/thoth-mem/SKILL.md', 'six MCP tools', 'seven legacy MCP tools'],
    ['launcher', 'plugin/runners/public-runner.mjs', "['lifecycle', '--harness'", "['lifecycle-stale', '--harness'"],
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
