import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

const temporaryRoots: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function createReleaseFixture(autocrlf: boolean): string {
  const sourceRoot = process.cwd();
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'thoth-release-version-'));
  temporaryRoots.push(fixtureRoot);
  cpSync(join(sourceRoot, '.gitattributes'), join(fixtureRoot, '.gitattributes'));

  const manifest = JSON.parse(
    readFileSync(join(sourceRoot, 'package.json'), 'utf8'),
  ) as {
    devDependencies: Record<string, string>;
    keywords: string[];
    name: string;
    packageManager: string;
    peerDependencies: Record<string, string>;
    pi: {
      extensions: string[];
      skills: string[];
    };
    version: string;
    scripts: Record<string, string>;
  };
  writeFileSync(
    join(fixtureRoot, 'package.json'),
    `${JSON.stringify({
      devDependencies: manifest.devDependencies,
      keywords: manifest.keywords,
      name: manifest.name,
      packageManager: manifest.packageManager,
      peerDependencies: manifest.peerDependencies,
      pi: manifest.pi,
      version: manifest.version,
      scripts: {
        'integration:sync': manifest.scripts['integration:sync'],
        'integration:verify': manifest.scripts['integration:verify'],
        version: manifest.scripts.version,
      },
    }, null, 2)}\n`,
  );
  cpSync(join(sourceRoot, 'integrations'), join(fixtureRoot, 'integrations'), {
    recursive: true,
  });
  cpSync(join(sourceRoot, 'plugin'), join(fixtureRoot, 'plugin'), {
    recursive: true,
  });
  mkdirSync(join(fixtureRoot, 'dist'));
  cpSync(join(sourceRoot, 'dist', 'pi.js'), join(fixtureRoot, 'dist', 'pi.js'));
  mkdirSync(join(fixtureRoot, 'scripts'));
  for (const script of [
    'sync-plugin-distribution.mjs',
    'verify-integration-package.mjs',
  ]) {
    cpSync(join(sourceRoot, 'scripts', script), join(fixtureRoot, 'scripts', script));
  }

  git(fixtureRoot, ['init', '--quiet', '-b', 'main']);
  git(fixtureRoot, ['config', 'core.autocrlf', String(autocrlf)]);
  git(fixtureRoot, ['config', 'user.name', 'Release Test']);
  git(fixtureRoot, ['config', 'user.email', 'release-test@example.invalid']);
  git(fixtureRoot, ['add', '.']);
  git(fixtureRoot, ['commit', '--quiet', '-m', 'release fixture']);
  const checkoutRoot = `${fixtureRoot}-checkout`;
  temporaryRoots.push(checkoutRoot);
  git(fixtureRoot, ['-c', `core.autocrlf=${autocrlf}`, 'clone', '--quiet', fixtureRoot, checkoutRoot]);
  git(checkoutRoot, ['config', 'core.autocrlf', String(autocrlf)]);
  git(checkoutRoot, ['config', 'user.name', 'Release Test']);
  git(checkoutRoot, ['config', 'user.email', 'release-test@example.invalid']);
  return checkoutRoot;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('npm version release lifecycle', () => {
  test.each([false, true])('commits a portable clean release with autocrlf=%s', (autocrlf) => {
    const fixtureRoot = createReleaseFixture(autocrlf);

    const command = process.platform === 'win32'
      ? process.env.ComSpec ?? 'cmd.exe'
      : 'npm';
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm version patch --ignore-scripts=false --sign-git-tag=false']
      : ['version', 'patch', '--ignore-scripts=false', '--sign-git-tag=false'];
    execFileSync(command, args, {
      cwd: fixtureRoot,
      encoding: 'utf8',
      windowsHide: true,
    });

    expect(
      git(fixtureRoot, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])
        .split(/\r?\n/u)
        .sort(),
    ).toEqual([
      'package.json',
      'plugin/.claude-plugin/plugin.json',
      'plugin/.codex-plugin/plugin.json',
      'plugin/distribution-lock.json',
      'plugin/runtime.json',
    ]);
    expect(git(fixtureRoot, ['status', '--short'])).toBe('');
    const lfCheckout = `${fixtureRoot}-lf`;
    temporaryRoots.push(lfCheckout);
    git(fixtureRoot, ['-c', 'core.autocrlf=false', 'clone', '--quiet', fixtureRoot, lfCheckout]);
    execFileSync(process.execPath, ['scripts/verify-integration-package.mjs'], {
      cwd: lfCheckout,
      encoding: 'utf8',
      windowsHide: true,
    });
    execFileSync(process.execPath, ['scripts/sync-plugin-distribution.mjs'], {
      cwd: fixtureRoot,
      windowsHide: true,
    });
    expect(git(fixtureRoot, ['status', '--short'])).toBe('');
  });

  test('builds before verifying generated assets during prepublish', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts.prepublishOnly.split(' && ')).toEqual([
      'pnpm run build', 'pnpm run integration:verify', 'pnpm test',
    ]);
  });
});
