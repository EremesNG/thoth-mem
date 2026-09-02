import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CANONICAL_PLUGIN_INVENTORY } from '../../src/integration/package-inventory.js';
import { ALL_TOOLS } from '../../src/tools/index.js';

const deferred = /(@xenova|transformers|embedding|hyde|knowledge.graph|dashboard|observatory|http-server|vitest\.browser)/i;
const observationReviewPaths = [
  'plugin/skills/thoth-mem/references/observation-review.md',
  'integrations/opencode/skills/thoth-mem/references/observation-review.md',
  'integrations/codex/skills/thoth-mem/references/observation-review.md',
  'integrations/claude-code/skills/thoth-mem/references/observation-review.md',
];

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
      'skills/thoth-mem/references/observation-review.md',
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
      'benchmarks/manifest.json',
      'benchmarks/report.schema.json',
      'benchmarks/retrieval-report.schema.json',
      'benchmarks/lexical-comparison-report.schema.json',
      'benchmarks/import-ranking/report.schema.json',
      'benchmarks/observation-pipeline/report.schema.json',
      'benchmarks/lexical-comparison-baseline.json',
      'benchmarks/lexical-recall-at-5-baseline.json',
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

  it('pins the lifecycle-v3 summary envelope across the unchanged six-tool, three-host package', () => {
    const inventory = JSON.parse(readFileSync('integrations/inventory.json', 'utf8')) as { lifecycleProtocolVersion: number; harnesses: Record<string, string[]> };
    const publicRunner = readFileSync('plugin/runners/public-runner.mjs', 'utf8');
    expect(ALL_TOOLS).toEqual(['mem_save', 'mem_recall', 'mem_context', 'mem_get', 'mem_project', 'mem_session']);
    expect(inventory.lifecycleProtocolVersion).toBe(3);
    expect(Object.keys(inventory.harnesses).sort()).toEqual(['claude-code', 'codex', 'opencode']);
    for (const field of ['selectedSummaryIds', 'selectedMemoryIds', 'selectedRecordIds', "'summary' : 'memory'"]) expect(publicRunner).toContain(field);
    expect(readFileSync('integrations/shared/hook-runner.mjs', 'utf8')).toContain("readFileSync(0, 'utf8')");
  });

  it('ships one host-neutral explicit observation review and promotion policy', () => {
    const contents = observationReviewPaths.map((path) => readFileSync(path, 'utf8'));
    expect(new Set(contents).size).toBe(1);
    for (const content of contents) {
      for (const phrase of ['observation candidate', 'observation_review', 'observation_promotion', 'root_user_confirmed', 'observable_validation', 'independent_review', 'untrusted data']) expect(content).toContain(phrase);
      expect(content).toContain('{ observation: ... }');
      expect(content).not.toContain('mem_save.observation');
      expect(content).not.toMatch(/^\+#{1,6}\s/mu);
      expect(content).toContain('must not automatically');
    }
    expect(readFileSync('plugin/skills/thoth-mem/SKILL.md', 'utf8')).toContain('direct `mem_save` `{ evidence, memory }` branch');
  });

  it('makes ordinary memory use proactive and keeps advanced review conditional', () => {
    const canonicalPath = 'plugin/skills/thoth-mem/SKILL.md';
    const canonical = readFileSync(canonicalPath, 'utf8');
    const frontmatter = canonical.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? '';
    expect(frontmatter).toMatch(/description:[\s\S]*recall[\s\S]*save[\s\S]*handoff/iu);
    expect(canonical.length).toBeLessThan(7_244);
    for (const phrase of [
      'Before acting',
      'At a durable boundary',
      'Before meaningful work ends',
      'without waiting for an explicit',
      'Do not save',
      'references/observation-review.md',
    ]) expect(canonical).toContain(phrase);
    expect(canonical).not.toContain('## Review uncertain durable claims');

    for (const path of observationReviewPaths) expect(existsSync(path), path).toBe(true);
    const review = readFileSync(observationReviewPaths[0]!, 'utf8');
    for (const phrase of [
      'observation candidate',
      'observation_review',
      'observation_promotion',
      'root_user_confirmed',
      'observable_validation',
      'independent_review',
      'must not automatically',
      'untrusted data',
    ]) expect(review).toContain(phrase);
    for (const path of observationReviewPaths.slice(1)) expect(readFileSync(path, 'utf8')).toBe(review);

    const inventory = JSON.parse(readFileSync('integrations/inventory.json', 'utf8')) as {
      harnesses: Record<string, string[]>;
      publicDistribution: { assets: string[] };
    };
    for (const assets of Object.values(inventory.harnesses)) expect(assets).toContain('skills/thoth-mem/references/observation-review.md');
    expect(inventory.publicDistribution.assets).toContain('skills/thoth-mem/references/observation-review.md');
  });
});
