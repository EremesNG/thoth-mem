import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { publishMarketplace } from '../scripts/publish-marketplace.mjs';
import { seedCentralMarketplaceFixture } from './fixtures/central-marketplace.js';

const temporaryRoots: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function initializeWorkingRepository(root: string): void {
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Marketplace Test']);
  git(root, ['config', 'user.email', 'marketplace-test@example.invalid']);
}

function initializeBareRepository(root: string, path: string): void {
  git(root, ['init', '--bare', '--initial-branch=main', path]);
}

function commitAll(root: string, message: string): void {
  git(root, ['add', '.']);
  git(root, ['commit', '-m', message]);
}

interface Fixture {
  root: string;
  centralRemote: string;
  pluginRemote: string;
  pluginWork: string;
  initialRegistry: {
    plugins: Array<{ name: string; version: string; ref: string }>;
  };
}

function createFixture(version = '0.4.14', createTag = true): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'thoth-marketplace-release-'));
  temporaryRoots.push(root);

  const centralWork = join(root, 'central-work');
  seedCentralMarketplaceFixture(centralWork);
  initializeWorkingRepository(centralWork);
  commitAll(centralWork, 'central fixture');
  const centralRemote = join(root, 'central.git');
  initializeBareRepository(root, centralRemote);
  git(centralWork, ['remote', 'add', 'origin', centralRemote]);
  git(centralWork, ['push', '-u', 'origin', 'main']);

  const pluginWork = join(root, 'plugin-work');
  mkdirSync(join(pluginWork, 'plugin', '.codex-plugin'), { recursive: true });
  mkdirSync(join(pluginWork, 'plugin', '.claude-plugin'), { recursive: true });
  mkdirSync(join(pluginWork, 'plugin', 'skills', 'thoth-mem'), {
    recursive: true,
  });
  writeFileSync(
    join(pluginWork, 'package.json'),
    `${JSON.stringify({ name: 'thoth-mem', version }, null, 2)}\n`,
  );
  const manifest = `${JSON.stringify({ name: 'thoth-mem', version }, null, 2)}\n`;
  writeFileSync(
    join(pluginWork, 'plugin', '.codex-plugin', 'plugin.json'),
    manifest,
  );
  writeFileSync(
    join(pluginWork, 'plugin', '.claude-plugin', 'plugin.json'),
    manifest,
  );
  writeFileSync(
    join(pluginWork, 'plugin', 'skills', 'thoth-mem', 'SKILL.md'),
    '# thoth-mem\n',
  );
  initializeWorkingRepository(pluginWork);
  commitAll(pluginWork, 'plugin fixture');
  if (createTag) git(pluginWork, ['tag', `v${version}`]);
  const pluginRemote = join(root, 'plugin.git');
  initializeBareRepository(root, pluginRemote);
  git(pluginWork, ['remote', 'add', 'origin', pluginRemote]);
  git(pluginWork, ['push', '-u', 'origin', 'main']);
  if (createTag) git(pluginWork, ['push', 'origin', `v${version}`]);

  return {
    root,
    centralRemote,
    pluginRemote,
    pluginWork,
    initialRegistry: JSON.parse(
      readFileSync(join(centralWork, 'catalog', 'plugins.json'), 'utf8'),
    ) as Fixture['initialRegistry'],
  };
}

function cloneCentral(fixture: Fixture, name: string): string {
  const checkout = join(fixture.root, name);
  git(fixture.root, ['clone', '--quiet', fixture.centralRemote, checkout]);
  return checkout;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('thoth-mem marketplace publication', () => {
  test('wires catalog publication after the existing version tag push', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(manifest.scripts['release:marketplace']).toBe(
      'node scripts/publish-marketplace.mjs',
    );
    for (const level of ['patch', 'minor', 'major']) {
      expect(manifest.scripts[`release:${level}`]).toBe(
        `npm version ${level} --ignore-scripts=false && git push --follow-tags && pnpm run release:marketplace`,
      );
    }
  });

  test('publishes one target-only commit and retries as a catalog-only no-op', async () => {
    const fixture = createFixture();
    const packageBefore = readFileSync(
      join(fixture.pluginWork, 'package.json'),
      'utf8',
    );

    const first = await publishMarketplace({
      projectRoot: fixture.pluginWork,
      pluginName: 'thoth-mem',
      centralRepository: fixture.centralRemote,
      pluginRepository: fixture.pluginRemote,
    });
    expect(first.status).toBe('published');

    const checkout = cloneCentral(fixture, 'published-checkout');
    const registry = JSON.parse(
      readFileSync(join(checkout, 'catalog', 'plugins.json'), 'utf8'),
    ) as Fixture['initialRegistry'];
    expect(registry.plugins.find(({ name }) => name === 'thoth-mem')).toMatchObject({
      version: '0.4.14',
      ref: 'v0.4.14',
    });
    expect(registry.plugins.find(({ name }) => name === 'thoth-agents')).toEqual(
      fixture.initialRegistry.plugins.find(({ name }) => name === 'thoth-agents'),
    );
    expect(
      git(checkout, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])
        .split(/\r?\n/u)
        .sort(),
    ).toEqual([
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      'catalog/plugins.json',
    ]);
    const publishedCommit = git(checkout, ['rev-parse', 'HEAD']);

    const retry = await publishMarketplace({
      projectRoot: fixture.pluginWork,
      pluginName: 'thoth-mem',
      centralRepository: fixture.centralRemote,
      pluginRepository: fixture.pluginRemote,
    });
    expect(retry.status).toBe('current');
    const retryCheckout = cloneCentral(fixture, 'retry-checkout');
    expect(git(retryCheckout, ['rev-parse', 'HEAD'])).toBe(publishedCommit);
    expect(readFileSync(join(fixture.pluginWork, 'package.json'), 'utf8')).toBe(
      packageBefore,
    );
  });

  test('fails clearly before cloning the catalog when the release tag is absent', async () => {
    const fixture = createFixture('0.4.15', false);

    await expect(
      publishMarketplace({
        projectRoot: fixture.pluginWork,
        pluginName: 'thoth-mem',
        centralRepository: fixture.centralRemote,
        pluginRepository: fixture.pluginRemote,
      }),
    ).rejects.toThrow(/tag v0\.4\.15 is not visible/u);
  });

  test('rejects a normal push race without force-pushing over central main', async () => {
    const fixture = createFixture();

    await expect(
      publishMarketplace({
        projectRoot: fixture.pluginWork,
        pluginName: 'thoth-mem',
        centralRepository: fixture.centralRemote,
        pluginRepository: fixture.pluginRemote,
        beforePush: async () => {
          const racer = cloneCentral(fixture, 'racer');
          git(racer, ['config', 'user.name', 'Marketplace Racer']);
          git(racer, ['config', 'user.email', 'racer@example.invalid']);
          writeFileSync(join(racer, 'race.txt'), 'advance central main\n');
          commitAll(racer, 'advance central main');
          git(racer, ['push', 'origin', 'main']);
        },
      }),
    ).rejects.toThrow(/central main advanced|push was rejected/u);

    const checkout = cloneCentral(fixture, 'race-checkout');
    expect(
      readFileSync(join(checkout, 'race.txt'), 'utf8').replaceAll('\r\n', '\n'),
    ).toBe('advance central main\n');
    const registry = JSON.parse(
      readFileSync(join(checkout, 'catalog', 'plugins.json'), 'utf8'),
    ) as Fixture['initialRegistry'];
    expect(registry.plugins.find(({ name }) => name === 'thoth-mem')).toEqual(
      fixture.initialRegistry.plugins.find(({ name }) => name === 'thoth-mem'),
    );
  });
});
