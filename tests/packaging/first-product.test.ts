import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseNpmPackRecord, resolveNpmCli } from '../../scripts/npm-pack.mjs';
import { CANONICAL_PLUGIN_INVENTORY, validateIntegrationInventory } from '../../src/integration/package-inventory.js';
import { ALL_TOOLS } from '../../src/tools/index.js';

const deferred = /(@xenova|transformers|embedding|hyde|knowledge.graph|dashboard|observatory|http-server|vitest\.browser)/i;
const observationReviewPaths = [
  'plugin/skills/thoth-mem/references/observation-review.md',
  'integrations/opencode/skills/thoth-mem/references/observation-review.md',
  'integrations/codex/skills/thoth-mem/references/observation-review.md',
  'integrations/claude-code/skills/thoth-mem/references/observation-review.md',
  'integrations/pi/skills/thoth-mem/references/observation-review.md',
];

describe('first-product packed boundary', () => {
  it('normalizes supported npm pack envelopes and rejects ambiguous output', () => {
    const record = {
      name: 'thoth-mem',
      filename: 'thoth-mem-0.4.13.tgz',
      files: [{ path: 'dist/index.js' }],
    };

    expect(parseNpmPackRecord(JSON.stringify([record]))).toEqual(record);
    expect(parseNpmPackRecord(JSON.stringify({ 'thoth-mem': record }))).toEqual(record);
    expect(() => parseNpmPackRecord('not json')).toThrow(/valid JSON/u);
    expect(() => parseNpmPackRecord('[]')).toThrow(/exactly one package record/u);
    expect(() => parseNpmPackRecord(JSON.stringify([record, record]))).toThrow(/exactly one package record/u);
    expect(() => parseNpmPackRecord(JSON.stringify({ 'thoth-mem': { name: 'thoth-mem' } }))).toThrow(/filename and files/u);
    expect(existsSync(resolveNpmCli())).toBe(true);
    expect(() => resolveNpmCli({ execPath: resolve('missing-node-root', 'node'), env: {} })).toThrow(/npm CLI was not found/u);
  });

  it('packs, installs, cold-starts, and activates hook lifecycle from all four disposable hosts', () => {
    const smoke = spawnSync(process.execPath, ['scripts/verify-packed-plugins.mjs'], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true, timeout: 180_000 });
    expect(smoke.status, `${smoke.stdout}\n${smoke.stderr}`).toBe(0);
    expect(smoke.stdout).toContain('Packed smoke passed for opencode, codex, claude-code, pi.');
    expect(smoke.stdout).toContain('Activated lifecycle fixtures for opencode, codex, claude-code, pi.');
    expect(smoke.stdout).toContain('Verified hermetic public Pi candidate and complete runtime closure.');
    expect(smoke.stdout).toContain('Verified exact public Pi list and full installed runtime graph.');
    expect(smoke.stdout).toContain('Verified SHA-256, SHA-512 integrity, and SHA-1 shasum ledger fields.');
  }, 180_000);

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
      keywords: string[];
      pi: { extensions: string[]; skills: string[] };
      peerDependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(manifest.main).toBe('dist/opencode.js');
    expect(manifest.bin).toEqual({ 'thoth-mem': 'dist/index.js' });
    expect(manifest.pi).toEqual({ extensions: ['./dist/pi.js'], skills: ['./integrations/pi/skills/thoth-mem'] });
    expect(manifest.keywords).toContain('pi-package');
    expect(manifest.peerDependencies).toMatchObject({ '@earendil-works/pi-coding-agent': '*', typebox: '*' });
    expect(manifest.devDependencies).toMatchObject({ '@earendil-works/pi-coding-agent': '0.84.4', typebox: '1.3.7' });
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
    const npmCli = resolveNpmCli();
    const packed = spawnSync(process.execPath, [npmCli, 'pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    expect(packed.status, packed.stderr).toBe(0);
    const paths = parseNpmPackRecord(packed.stdout).files.map((file) => file.path.replaceAll('\\', '/'));
    expect(paths.filter((path) => path.startsWith('dist/'))).toEqual([
      'dist/index.js',
      'dist/index.js.map',
      'dist/opencode.js',
      'dist/opencode.js.map',
      'dist/pi.js',
      'dist/pi.js.map',
    ]);
    const integrations = paths.filter((path) => path.startsWith('integrations/')).sort();
    const expected = ['integrations/inventory.json', 'integrations/shared/hook-runner.mjs'];
    for (const [harness, assets] of Object.entries(CANONICAL_PLUGIN_INVENTORY)) for (const asset of assets) expected.push(`integrations/${harness}/${asset}`);
    expect(integrations).toEqual(expected.sort());
  });

  it('pins the lifecycle-v3 summary envelope across the unchanged six-tool, four-host package', () => {
    const inventory = JSON.parse(readFileSync('integrations/inventory.json', 'utf8')) as { lifecycleProtocolVersion: number; harnesses: Record<string, string[]> };
    const publicRunner = readFileSync('plugin/runners/public-runner.mjs', 'utf8');
    expect(ALL_TOOLS).toEqual(['mem_save', 'mem_recall', 'mem_context', 'mem_get', 'mem_project', 'mem_session']);
    expect(inventory.lifecycleProtocolVersion).toBe(3);
    expect(Object.keys(inventory.harnesses).sort()).toEqual(['claude-code', 'codex', 'opencode', 'pi']);
    for (const field of ['selectedSummaryIds', 'selectedMemoryIds', 'selectedRecordIds', "'summary' : 'memory'"]) expect(publicRunner).toContain(field);
    expect(readFileSync('integrations/shared/hook-runner.mjs', 'utf8')).toContain("readFileSync(0, 'utf8')");
  });

  it('builds a thin Pi entry and ships Pi-specific identity guidance', () => {
    const built = readFileSync('dist/pi.js', 'utf8');
    expect(built).not.toMatch(/better-sqlite3|class MemoryService|sqlite\/migrations/iu);
    expect(built).toContain('MEMORY_TOOL_CATALOG');
    const reference = readFileSync('integrations/pi/skills/thoth-mem/references/pi.md', 'utf8');
    for (const phrase of ['harness=pi', 'root_session_id', 'session_start', 'session_before_compact', 'session_compact', 'session_shutdown']) expect(reference).toContain(phrase);
    expect(reference).toMatch(/privacy[\s\S]*before[\s\S]*identity/iu);
    expect(reference).toMatch(/must not infer[\s\S]*community[\s\S]*delegat/iu);
  });

  it('routes canonical and Pi Skills to the Pi identity reference', () => {
    const skillPaths = [
      'plugin/skills/thoth-mem/SKILL.md',
      'integrations/opencode/skills/thoth-mem/SKILL.md',
      'integrations/codex/skills/thoth-mem/SKILL.md',
      'integrations/claude-code/skills/thoth-mem/SKILL.md',
      'integrations/pi/skills/thoth-mem/SKILL.md',
    ];
    const skills = skillPaths.map((path) => readFileSync(path, 'utf8'));
    expect(new Set(skills)).toHaveLength(1);
    const canonical = skills[0]!;
    for (const host of ['opencode', 'codex', 'claude-code', 'pi']) expect(canonical).toContain(`references/${host}.md`);
    for (const [index, skill] of skills.entries()) expect(skill, skillPaths[index]).toMatch(/For Pi, select\s+`references\/pi\.md`\s+for identity and lifecycle operations\./u);
  });

  it('synchronizes only canonical Pi Skill assets without extending the public distribution lock', () => {
    const script = readFileSync('scripts/sync-plugin-distribution.mjs', 'utf8');
    expect(script).toContain('integrations/pi/skills/thoth-mem/SKILL.md');
    expect(script).toContain('integrations/pi/skills/thoth-mem/references/observation-review.md');
    const lock = JSON.parse(readFileSync('plugin/distribution-lock.json', 'utf8')) as { assets: Record<string, string> };
    expect(Object.keys(lock.assets).some((path) => path.includes('/pi/'))).toBe(false);
  });

  it('validates exact four-harness ownership and rejects malformed Pi inventories', () => {
    const inventory = JSON.parse(readFileSync('integrations/inventory.json', 'utf8')) as Record<string, unknown> & { harnesses: Record<string, string[]> };
    expect(validateIntegrationInventory(inventory).harnesses).toEqual(CANONICAL_PLUGIN_INVENTORY);
    for (const mutate of [
      (assets: string[]) => assets.slice(1),
      (assets: string[]) => [...assets, 'extra.mjs'],
      (assets: string[]) => [...assets, assets[0]!],
      (assets: string[]) => [...assets.slice(0, -1), '../escaped.md'],
      (assets: string[]) => [...assets.slice(0, -1), 'dashboard.mjs'],
    ]) {
      const malformed = structuredClone(inventory);
      malformed.harnesses.pi = mutate(malformed.harnesses.pi!);
      expect(() => validateIntegrationInventory(malformed)).toThrow();
    }
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

  it('teaches bounded chronological exploration through mem_project timeline', () => {
    const skill = readFileSync('plugin/skills/thoth-mem/SKILL.md', 'utf8');
    expect(skill).toMatch(/topic|query[\s\S]*chronolog/iu);
    expect(skill).toMatch(/mem_project[\s\S]*action[=:]timeline/iu);
    expect(skill).toMatch(/nextCursor[\s\S]*only as needed/iu);
    expect(skill).toMatch(/historical entries[\s\S]*untrusted context/iu);
    expect(skill).toMatch(/stable IDs[\s\S]*mem_get/iu);
    expect(skill).toMatch(/not raw (?:session|activity)[\s\S]*history/iu);
    expect(skill).not.toMatch(/include_timeline/iu);
  });
});
