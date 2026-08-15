import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface PackageManifest {
  scripts: Record<string, string>;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const testsRoot = join(repositoryRoot, 'tests');

async function readRepositoryFile(path: string): Promise<string> {
  return readFile(join(repositoryRoot, path), 'utf8');
}

async function collectTestFiles(directory = testsRoot): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTestFiles(path);
    if (!entry.isFile() || !entry.name.endsWith('.test.ts')) return [];
    return [relative(repositoryRoot, path).replaceAll('\\', '/')];
  }));
  return nested.flat().sort();
}

function isIntegrationTest(path: string): boolean {
  return path === 'tests/integration.test.ts'
    || /^tests\/http-[^/]+\.test\.ts$/.test(path)
    || ['tests/integration/', 'tests/setup/', 'tests/packaging/']
      .some((prefix) => path.startsWith(prefix));
}

function laneMembership(path: string): string[] {
  const lanes: string[] = [];
  if (path.endsWith('.browser.test.ts')) lanes.push('browser-smoke');
  if (path.endsWith('.performance.test.ts')) lanes.push('browser-performance');
  if (isIntegrationTest(path)) lanes.push('integration');
  if (lanes.length === 0) lanes.push('unit');
  return lanes;
}

function expectPackageBuildBeforeVitest(command: string): void {
  const buildIndex = command.indexOf('node scripts/build.mjs');
  const vitestIndex = command.indexOf('vitest run');
  expect(buildIndex).toBeGreaterThanOrEqual(0);
  expect(vitestIndex).toBeGreaterThan(buildIndex);
}

function jobBlock(workflow: string, jobId: string): string {
  const match = new RegExp(`^  ${jobId}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:\\n|(?![\\s\\S]))`, 'm').exec(workflow);
  expect(match, `Missing CI job ${jobId}`).not.toBeNull();
  return match?.[0] ?? '';
}

describe('CI test lanes', () => {
  it('owns every test in exactly one lane and keeps packaging commands self-contained', async () => {
    const manifest = JSON.parse(await readRepositoryFile('package.json')) as PackageManifest;
    expect(manifest.scripts['test:unit']).toContain('vitest.unit.config.ts');
    expect(manifest.scripts['test:integration']).toContain('vitest.integration.config.ts');
    expect(manifest.scripts['test:browser']).toContain('vitest.browser.config.ts');
    expect(manifest.scripts['test:browser:performance']).toContain('vitest.browser-performance.config.ts');
    expectPackageBuildBeforeVitest(manifest.scripts.test);
    expectPackageBuildBeforeVitest(manifest.scripts['test:integration']);

    const testFiles = await collectTestFiles();
    expect(testFiles.length).toBeGreaterThan(0);
    expect(testFiles.every((path) => laneMembership(path).length === 1)).toBe(true);

    const harnessConsumers: string[] = [];
    for (const path of testFiles) {
      if (path.startsWith('tests/dashboard/')
        && (await readRepositoryFile(path)).includes('dashboard-browser-harness.js')) {
        harnessConsumers.push(path);
      }
    }
    expect(harnessConsumers.length).toBeGreaterThan(0);
    expect(harnessConsumers.every((path) =>
      path.endsWith('.browser.test.ts') || path.endsWith('.performance.test.ts'))).toBe(true);

    const smoke = await readRepositoryFile('tests/dashboard/full-atlas.browser.test.ts');
    const performance = await readRepositoryFile('tests/dashboard/full-atlas.performance.test.ts');
    const fixtures = await readRepositoryFile('tests/dashboard/full-atlas-fixtures.ts');
    const performanceScenarios = fixtures.slice(
      fixtures.indexOf('export function registerFullAtlasPerformanceTests'),
      fixtures.indexOf('export function registerFullAtlasSmokeTests'),
    );
    const smokeScenarios = fixtures.slice(fixtures.indexOf('export function registerFullAtlasSmokeTests'));
    expect(smoke).toContain('registerFullAtlasSmokeTests();');
    expect(performance).toContain('registerFullAtlasPerformanceTests();');
    expect(smokeScenarios.match(/\bit\('/g)).toHaveLength(3);
    expect(performanceScenarios.match(/\bit\('/g)).toHaveLength(2);
  });

  it('runs four pull-request lanes independently and uploads smoke diagnostics only on failure', async () => {
    const workflow = await readRepositoryFile('.github/workflows/ci.yml');
    const expectedJobs = {
      quality: 'pnpm run test:unit',
      integration: 'pnpm run test:integration',
      'browser-smoke': 'pnpm run test:browser',
      'retrieval-eval': 'pnpm run eval:retrieval',
    } as const;

    for (const [jobId, command] of Object.entries(expectedJobs)) {
      const block = jobBlock(workflow, jobId);
      expect(block).toContain(command);
      expect(block).not.toMatch(/^    needs:/m);
    }

    const browserBlock = jobBlock(workflow, 'browser-smoke');
    expect(browserBlock).toContain('actions/upload-artifact@v4');
    expect(browserBlock).toContain('if: failure()');
    expect(browserBlock).toContain('path: test-results/browser/');
    expect(browserBlock).toContain('if-no-files-found: ignore');
  });

  it('keeps dense performance evidence in a scheduled or manual workflow', async () => {
    const workflow = await readRepositoryFile('.github/workflows/dashboard-performance.yml');
    expect(workflow).toMatch(/^  schedule:/m);
    expect(workflow).toMatch(/^  workflow_dispatch:/m);
    expect(workflow).not.toMatch(/^  pull_request:/m);
    expect(workflow).toContain('pnpm run test:browser:performance');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('if: failure()');
    expect(workflow).toContain('path: test-results/browser/');
    expect(workflow).toContain('if-no-files-found: ignore');
  });
});
