import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
  getNativeManagerInvocation,
  setupNativeManager,
  type ManagerCommandResult,
  type NativeManagerExecutor,
} from '../../src/setup/native-manager.js';

const roots: string[] = [];
const packageVersion = (JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as { version: string }).version;

const managerIdentities = {
  codex: { marketplaceName: 'thoth-plugins', pluginId: 'thoth-mem@thoth-plugins' },
  claude: { marketplaceName: 'thoth-plugins', pluginId: 'thoth-mem@thoth-plugins' },
} as const;

function temporaryHome(name: string): string {
  const root = join(tmpdir(), `thoth-manager-${name}-${process.pid}-${roots.length}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

function seedLegacyCache(homeDir: string, marketplaceName: 'thoth-mem' | 'thoth-mem-codex'): string {
  const root = join(homeDir, '.codex', 'plugins', 'cache', marketplaceName);
  const versionRoot = join(root, 'thoth-mem', '0.4.13');
  mkdirSync(join(versionRoot, '.codex-plugin'), { recursive: true });
  writeFileSync(join(versionRoot, '.codex-plugin', 'plugin.json'), `${JSON.stringify({ name: 'thoth-mem', version: '0.4.13' }, null, 2)}\n`);
  writeFileSync(join(versionRoot, 'payload.txt'), `${marketplaceName}\n`);
  return root;
}

function seedLegacySnapshot(homeDir: string, marketplaceName: 'thoth-mem' | 'thoth-mem-codex'): string {
  const root = join(homeDir, '.codex', '.tmp', 'marketplaces', marketplaceName);
  mkdirSync(join(root, '.agents', 'plugins'), { recursive: true });
  writeFileSync(join(root, '.codex-marketplace-install.json'), `${JSON.stringify({ source_type: 'git', source: 'https://github.com/EremesNG/thoth-mem.git' }, null, 2)}\n`);
  writeFileSync(join(root, '.agents', 'plugins', 'marketplace.json'), `${JSON.stringify({ name: marketplaceName, plugins: [{ name: 'thoth-mem' }] }, null, 2)}\n`);
  return root;
}

class FakeManager implements NativeManagerExecutor {
  readonly calls: Array<{ command: string; args: string[] }> = [];
  marketplace = false;
  plugin = false;
  readonly legacyPluginIds = new Set<string>();
  readonly legacyMarketplaces = new Map<string, string>();
  enabled = false;
  failMarketplaceAdd = false;
  failPluginAdd = false;
  marketplaceRemoveCapability = true;
  pluginVersion = packageVersion;
  afterCentralInstall?: () => void;
  marketplaceSource = 'https://github.com/EremesNG/thoth-plugins.git';

  constructor(readonly host: 'codex' | 'claude', readonly version = host === 'codex' ? 'codex-cli 0.151.0' : '2.1.198 (Claude Code)', readonly completeCapabilities = true) {}

  run(command: string, args: string[]): ManagerCommandResult {
    const identity = managerIdentities[this.host];
    this.calls.push({ command, args: [...args] });
    if (args.length === 1 && args[0] === '--version') return { status: 0, stdout: this.version, stderr: '' };
    if (args.includes('--help')) {
      const output = this.completeCapabilities
        ? this.host === 'codex'
          ? `plugin marketplace add --json plugin add --json plugin remove ${this.marketplaceRemoveCapability ? 'marketplace remove' : ''} plugin list --json`
          : 'plugin marketplace add --scope user plugin install --scope user plugin uninstall plugin enable plugin list --json'
        : 'plugin list';
      return { status: 0, stdout: output, stderr: '' };
    }
    if (args.join(' ') === 'plugin marketplace list --json') {
      const legacy = [...this.legacyMarketplaces].map(([name, source]) => ({
        name,
        marketplaceSource: { sourceType: source.startsWith('http') ? 'git' : 'local', source },
        source: 'github',
        repo: source,
      }));
      return this.host === 'codex'
        ? this.ok({ marketplaces: [...(this.marketplace ? [{ name: identity.marketplaceName, marketplaceSource: { sourceType: this.marketplaceSource.startsWith('http') ? 'git' : 'local', source: this.marketplaceSource } }] : []), ...legacy] })
        : this.ok([...(this.marketplace ? [{ name: identity.marketplaceName, source: 'github', repo: this.marketplaceSource }] : []), ...legacy]);
    }
    if (args.join(' ') === 'plugin list --json') {
      const installed = [
        ...(this.plugin ? [{ pluginId: identity.pluginId, name: 'thoth-mem', marketplaceName: identity.marketplaceName, version: this.pluginVersion, installed: true, enabled: this.enabled }] : []),
        ...[...this.legacyPluginIds].map((pluginId) => ({ pluginId, name: 'thoth-mem', marketplaceName: pluginId.split('@')[1], version: '0.4.13', installed: true, enabled: true })),
      ];
      return this.host === 'codex' ? this.ok({ installed, available: [] }) : this.ok(installed);
    }
    if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add') {
      if (!this.failMarketplaceAdd) {
        this.marketplace = true;
        this.marketplaceSource = args[3] ?? this.marketplaceSource;
      }
      return { status: this.failMarketplaceAdd ? 1 : 0, stdout: '', stderr: this.failMarketplaceAdd ? 'add failed' : '' };
    }
    if (args[0] === 'plugin' && (args[1] === 'add' || args[1] === 'install')) {
      const failed = this.failPluginAdd || args[2] !== identity.pluginId;
      if (!failed) {
        this.plugin = true;
        this.enabled = true;
        this.afterCentralInstall?.();
      }
      return { status: failed ? 1 : 0, stdout: '', stderr: failed ? 'install failed' : '' };
    }
    if (args[0] === 'plugin' && (args[1] === 'remove' || args[1] === 'uninstall')) {
      if (args[2] === identity.pluginId) {
        this.plugin = false;
        this.enabled = false;
      } else if (args[2]) this.legacyPluginIds.delete(args[2]);
      return { status: 0, stdout: '', stderr: '' };
    }
    if (args[0] === 'plugin' && args[1] === 'marketplace' && (args[2] === 'remove' || args[2] === 'rm')) {
      if (args[3] === identity.marketplaceName) this.marketplace = false;
      else if (args[3]) this.legacyMarketplaces.delete(args[3]);
      return { status: 0, stdout: '', stderr: '' };
    }
    if (args[0] === 'plugin' && args[1] === 'enable') {
      const failed = args[2] !== identity.pluginId;
      if (!failed) this.enabled = true;
      return { status: failed ? 1 : 0, stdout: '', stderr: failed ? 'enable failed' : '' };
    }
    return { status: 2, stdout: '', stderr: `unexpected ${args.join(' ')}` };
  }

  private ok(value: unknown): ManagerCommandResult {
    return { status: 0, stdout: JSON.stringify(value), stderr: '' };
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('native manager command resolution', () => {
  test('uses the Windows command shell only for implicit Codex lookup', () => {
    expect(getNativeManagerInvocation('codex', ['--version'], {
      commandShell: 'C:\\Windows\\System32\\cmd.exe',
      implicitCodex: true,
      platform: 'win32',
    })).toEqual({
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'codex', '--version'],
    });
  });

  test('keeps an explicit Codex override literal on Windows', () => {
    expect(getNativeManagerInvocation('codex', ['--version'], {
      commandShell: 'C:\\Windows\\System32\\cmd.exe',
      implicitCodex: false,
      platform: 'win32',
    })).toEqual({ command: 'codex', args: ['--version'] });
  });

  test('keeps implicit Codex execution direct outside Windows', () => {
    expect(getNativeManagerInvocation('codex', ['--version'], {
      commandShell: '/bin/sh',
      implicitCodex: true,
      platform: 'linux',
    })).toEqual({ command: 'codex', args: ['--version'] });
  });
});

describe('native Codex and Claude manager setup', () => {
  test('plans manager-only Codex operations with zero writes and zero mutating calls', () => {
    const homeDir = temporaryHome('plan');
    const executor = new FakeManager('codex');
    const result = setupNativeManager({ host: 'codex', homeDir, executor, planOnly: true });

    expect(result).toMatchObject({ status: 'planned', changed: false, strategy: 'plugin_manager', restartRequired: false });
    expect(result.actions.join('\n')).toContain('codex plugin marketplace add https://github.com/EremesNG/thoth-plugins.git');
    expect(result.actions.join('\n')).toContain('codex plugin add thoth-mem@thoth-plugins');
    expect(executor.calls.every(({ args }) => args.includes('--version') || args.includes('--help') || args.includes('list'))).toBe(true);
    expect(existsSync(join(homeDir, '.config', 'thoth-mem'))).toBe(false);
  });

  test('installs and independently verifies Codex 0.151.x, then performs an exact no-op', () => {
    const homeDir = temporaryHome('codex');
    const executor = new FakeManager('codex');
    const first = setupNativeManager({ host: 'codex', homeDir, executor });

    expect(first).toMatchObject({ status: 'complete', changed: true, strategy: 'plugin_manager', restartRequired: true });
    expect(first.verification).toEqual({ marketplace: true, plugin: true, enabled: true });
    expect(first.warnings).toEqual([]);
    expect(JSON.parse(readFileSync(first.receiptPath!, 'utf8'))).not.toHaveProperty('stdout');
    const mutationsAfterFirst = executor.calls.filter(({ args }) => !args.includes('--version') && !args.includes('--help') && !args.includes('list')).length;

    const second = setupNativeManager({ host: 'codex', homeDir, executor });
    expect(second).toMatchObject({ status: 'complete', changed: false, restartRequired: false });
    expect(executor.calls.filter(({ args }) => !args.includes('--version') && !args.includes('--help') && !args.includes('list'))).toHaveLength(mutationsAfterFirst);
  });

  test('binds an explicit local runtime while retaining the canonical Codex marketplace', () => {
    const homeDir = temporaryHome('codex-local');
    const packageRoot = join(homeDir, 'local package');
    const runtimeEntry = join(packageRoot, 'dist', 'index.js');
    const dataDir = join(homeDir, 'shared-data');
    mkdirSync(join(packageRoot, 'dist'), { recursive: true });
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ name: 'thoth-mem', version: '0.4.13' }));
    writeFileSync(runtimeEntry, 'export {};\n');
    const executor = new FakeManager('codex');
    executor.pluginVersion = '0.4.13';

    const first = setupNativeManager({ host: 'codex', homeDir, env: {}, executor, packageRoot, dataDir });
    expect(first).toMatchObject({ status: 'complete', changed: true, restartRequired: true });
    expect(first.source).toBe('https://github.com/EremesNG/thoth-plugins.git');
    expect(JSON.parse(readFileSync(join(homeDir, '.config', 'thoth-mem', 'config.json'), 'utf8'))).toEqual({
      version: 2,
      dataDir,
      runtimeEntry,
    });

    const second = setupNativeManager({ host: 'codex', homeDir, env: {}, executor, packageRoot, dataDir });
    expect(second).toMatchObject({ status: 'complete', changed: false, restartRequired: false });
  });

  test('treats verified post-state as authoritative when manager exit status is mixed', () => {
    const homeDir = temporaryHome('mixed');
    const executor = new FakeManager('codex');
    executor.failPluginAdd = true;
    const originalRun = executor.run.bind(executor);
    executor.run = (command, args) => {
      const result = originalRun(command, args);
      if (args[0] === 'plugin' && args[1] === 'add') { executor.plugin = true; executor.enabled = true; }
      return result;
    };

    const result = setupNativeManager({ host: 'codex', homeDir, executor });
    expect(result.status).toBe('complete');
    expect(result.verification).toEqual({ marketplace: true, plugin: true, enabled: true });
  });

  test('fails closed outside Codex 0.151.x unless force proves all safe capabilities', () => {
    const unsupported = new FakeManager('codex', 'codex-cli 0.152.0');
    const plain = setupNativeManager({ host: 'codex', homeDir: temporaryHome('old'), executor: unsupported });
    expect(plain).toMatchObject({ status: 'unsupported', changed: false, strategy: 'unsupported' });
    expect(plain.warnings).toEqual([]);
    expect(unsupported.marketplace).toBe(false);

    const forced = new FakeManager('codex', 'codex-cli 0.152.0');
    const override = setupNativeManager({ host: 'codex', homeDir: temporaryHome('forced'), executor: forced, forceVersion: true });
    expect(override.status).toBe('complete');
    expect(override.warnings).toEqual([expect.stringContaining('forced Codex version override')]);

    const unsafe = new FakeManager('codex', 'codex-cli 9.0.0', false);
    const rejected = setupNativeManager({ host: 'codex', homeDir: temporaryHome('unsafe'), executor: unsafe, forceVersion: true });
    expect(rejected).toMatchObject({ status: 'unsupported', changed: false, strategy: 'unsupported' });
    expect(rejected.warnings).toEqual([]);
    expect(rejected.diagnostics).toEqual([expect.stringContaining('capability')]);
  });

  test('fails closed when Codex cannot prove marketplace removal capability', () => {
    const executor = new FakeManager('codex');
    executor.marketplaceRemoveCapability = false;

    const result = setupNativeManager({ host: 'codex', homeDir: temporaryHome('missing-remove-capability'), executor });

    expect(result).toMatchObject({ status: 'unsupported', changed: false, strategy: 'unsupported' });
    expect(result.diagnostics).toEqual([expect.stringContaining('capability')]);
    expect(executor.marketplace).toBe(false);
    expect(executor.plugin).toBe(false);
  });

  test('uses only Claude user manager commands and reports no model-use evidence', () => {
    const homeDir = temporaryHome('claude');
    const executor = new FakeManager('claude');
    const result = setupNativeManager({ host: 'claude', homeDir, executor });

    expect(result).toMatchObject({ status: 'complete', changed: true, strategy: 'plugin_manager' });
    expect(result.verification).toMatchObject({ marketplace: true, plugin: true, enabled: true, modelUse: false });
    expect(executor.calls.some(({ args }) => args.join(' ').includes('marketplace add') && args.includes('user'))).toBe(true);
    expect(executor.calls.some(({ args }) => args.join(' ') === 'plugin install thoth-mem@thoth-plugins --scope user')).toBe(true);
    expect(executor.calls.every(({ command }) => command === 'claude')).toBe(true);
  });

  test('verifies the central Codex plugin before removing exact owned legacy manager state', () => {
    const executor = new FakeManager('codex');
    executor.legacyPluginIds.add('thoth-mem@thoth-mem');
    executor.legacyPluginIds.add('thoth-mem@thoth-mem-codex');
    executor.legacyMarketplaces.set('thoth-mem', 'https://github.com/EremesNG/thoth-mem.git');
    executor.legacyMarketplaces.set('thoth-mem-codex', 'https://github.com/EremesNG/thoth-mem.git');

    const result = setupNativeManager({ host: 'codex', homeDir: temporaryHome('codex-legacy'), executor });

    expect(result).toMatchObject({ status: 'complete', changed: true });
    expect(executor.plugin).toBe(true);
    expect([...executor.legacyPluginIds]).toEqual([]);
    expect([...executor.legacyMarketplaces]).toEqual([]);
    const mutations = executor.calls
      .filter(({ args }) => !args.includes('--version') && !args.includes('--help') && !args.includes('list'))
      .map(({ args }) => args.join(' '));
    expect(mutations).toEqual([
      'plugin marketplace add https://github.com/EremesNG/thoth-plugins.git --json',
      'plugin add thoth-mem@thoth-plugins --json',
      'plugin remove thoth-mem@thoth-mem --json',
      'plugin remove thoth-mem@thoth-mem-codex --json',
      'plugin marketplace remove thoth-mem --json',
      'plugin marketplace remove thoth-mem-codex --json',
    ]);
  });

  test('removes safe orphan roots while preserving sibling and unrelated Codex state, then converges to a no-op', () => {
    const homeDir = temporaryHome('codex-orphans');
    const cacheRoot = seedLegacyCache(homeDir, 'thoth-mem-codex');
    const snapshotRoot = seedLegacySnapshot(homeDir, 'thoth-mem-codex');
    const sibling = join(homeDir, '.codex', 'plugins', 'cache', 'thoth-agents', 'control.txt');
    const unrelated = join(homeDir, '.codex', 'plugins', 'cache', 'unrelated', 'control.txt');
    mkdirSync(join(sibling, '..'), { recursive: true });
    mkdirSync(join(unrelated, '..'), { recursive: true });
    writeFileSync(sibling, 'sibling-control\n');
    writeFileSync(unrelated, 'unrelated-control\n');
    const executor = new FakeManager('codex');

    const first = setupNativeManager({ host: 'codex', homeDir, executor });

    expect(first).toMatchObject({ status: 'complete', changed: true, restartRequired: true });
    expect(existsSync(cacheRoot)).toBe(false);
    expect(existsSync(snapshotRoot)).toBe(false);
    expect(readFileSync(sibling, 'utf8')).toBe('sibling-control\n');
    expect(readFileSync(unrelated, 'utf8')).toBe('unrelated-control\n');
    expect(JSON.parse(readFileSync(first.receiptPath!, 'utf8'))).toMatchObject({
      result: 'complete',
      cleanup: {
        fallbackRoots: ['plugins/cache/thoth-mem-codex', '.tmp/marketplaces/thoth-mem-codex'],
        verifiedAbsentRoots: [
          'plugins/cache/thoth-mem',
          'plugins/cache/thoth-mem-codex',
          '.tmp/marketplaces/thoth-mem',
          '.tmp/marketplaces/thoth-mem-codex',
        ],
      },
    });
    const mutationsAfterFirst = executor.calls.filter(({ args }) => !args.includes('--version') && !args.includes('--help') && !args.includes('list')).length;

    const second = setupNativeManager({ host: 'codex', homeDir, executor });
    expect(second).toMatchObject({ status: 'complete', changed: false, restartRequired: false });
    expect(executor.calls.filter(({ args }) => !args.includes('--version') && !args.includes('--help') && !args.includes('list'))).toHaveLength(mutationsAfterFirst);
  });

  test('plans exact owned cleanup without changing manager or filesystem state', () => {
    const homeDir = temporaryHome('codex-cleanup-plan');
    const cacheRoot = seedLegacyCache(homeDir, 'thoth-mem');
    const executor = new FakeManager('codex');
    executor.legacyPluginIds.add('thoth-mem@thoth-mem');
    executor.legacyMarketplaces.set('thoth-mem', 'https://github.com/EremesNG/thoth-mem.git');

    const result = setupNativeManager({ host: 'codex', homeDir, executor, planOnly: true });

    expect(result).toMatchObject({ status: 'planned', changed: false, restartRequired: false });
    expect(result.actions.join('\n')).toContain('plugin remove thoth-mem@thoth-mem --json');
    expect(result.actions.join('\n')).toContain('plugins/cache/thoth-mem');
    expect(existsSync(cacheRoot)).toBe(true);
    expect([...executor.legacyPluginIds]).toEqual(['thoth-mem@thoth-mem']);
    expect([...executor.legacyMarketplaces]).toEqual([['thoth-mem', 'https://github.com/EremesNG/thoth-mem.git']]);
    expect(executor.calls.every(({ args }) => args.includes('--version') || args.includes('--help') || args.includes('list'))).toBe(true);
  });

  test('rejects conflicting legacy marketplace provenance before any manager mutation', () => {
    const executor = new FakeManager('codex');
    executor.legacyMarketplaces.set('thoth-mem-codex', 'https://example.invalid/unrelated.git');

    const result = setupNativeManager({ host: 'codex', homeDir: temporaryHome('legacy-provenance'), executor });

    expect(result).toMatchObject({ status: 'requires-user-action', changed: false, receiptPath: null });
    expect(result.diagnostics).toEqual([expect.stringContaining('provenance conflicts')]);
    expect(executor.marketplace).toBe(false);
    expect(executor.plugin).toBe(false);
    expect(executor.calls.every(({ args }) => args.includes('--version') || args.includes('--help') || args.includes('list'))).toBe(true);
  });

  test('rejects file, link, and foreign-manifest targets before any manager mutation', () => {
    const cases = ['file', 'link', 'foreign-manifest'] as const;
    for (const kind of cases) {
      const homeDir = temporaryHome(`unsafe-${kind}`);
      const root = join(homeDir, '.codex', 'plugins', 'cache', 'thoth-mem-codex');
      mkdirSync(join(root, '..'), { recursive: true });
      if (kind === 'file') writeFileSync(root, 'not-a-directory\n');
      else if (kind === 'link') {
        const outside = join(homeDir, 'outside');
        mkdirSync(outside, { recursive: true });
        writeFileSync(join(outside, 'control.txt'), 'outside-control\n');
        symlinkSync(outside, root, process.platform === 'win32' ? 'junction' : 'dir');
      } else {
        const versionRoot = join(root, 'thoth-mem', '0.4.13', '.codex-plugin');
        mkdirSync(versionRoot, { recursive: true });
        writeFileSync(join(versionRoot, 'plugin.json'), `${JSON.stringify({ name: 'thoth-agents', version: '0.4.13' })}\n`);
      }
      const executor = new FakeManager('codex');

      const result = setupNativeManager({ host: 'codex', homeDir, executor });

      expect(result).toMatchObject({ status: 'requires-user-action', changed: false, receiptPath: null });
      expect(result.diagnostics).toEqual([expect.stringContaining('preflight failed')]);
      expect(executor.marketplace).toBe(false);
      expect(executor.plugin).toBe(false);
      expect(executor.calls.every(({ args }) => args.includes('--version') || args.includes('--help') || args.includes('list'))).toBe(true);
      if (kind === 'link') expect(readFileSync(join(homeDir, 'outside', 'control.txt'), 'utf8')).toBe('outside-control\n');
    }
  });

  test('retains the verified central plugin on a cleanup race and converges on retry', () => {
    const homeDir = temporaryHome('cleanup-retry');
    const cacheRoot = seedLegacyCache(homeDir, 'thoth-mem-codex');
    const executor = new FakeManager('codex');
    executor.afterCentralInstall = () => {
      executor.afterCentralInstall = undefined;
      rmSync(cacheRoot, { recursive: true, force: true });
      writeFileSync(cacheRoot, 'changed-after-preflight\n');
    };

    const first = setupNativeManager({ host: 'codex', homeDir, executor });

    expect(first).toMatchObject({ status: 'requires-user-action', changed: true, restartRequired: true });
    expect(first.diagnostics.join('\n')).toContain('Close Codex and rerun setup');
    expect(executor.plugin).toBe(true);
    expect(readFileSync(cacheRoot, 'utf8')).toBe('changed-after-preflight\n');
    expect(JSON.parse(readFileSync(first.receiptPath!, 'utf8'))).toMatchObject({ result: 'requires-user-action' });

    rmSync(cacheRoot, { force: true });
    seedLegacyCache(homeDir, 'thoth-mem-codex');
    const mutationsBeforeRetry = executor.calls.filter(({ args }) => !args.includes('--version') && !args.includes('--help') && !args.includes('list')).length;
    const second = setupNativeManager({ host: 'codex', homeDir, executor });

    expect(second).toMatchObject({ status: 'complete', changed: true, restartRequired: true });
    expect(existsSync(cacheRoot)).toBe(false);
    expect(executor.plugin).toBe(true);
    expect(executor.calls.filter(({ args }) => !args.includes('--version') && !args.includes('--help') && !args.includes('list'))).toHaveLength(mutationsBeforeRetry);
  });

  test('preserves legacy Claude plugin state while installing the central identity', () => {
    const executor = new FakeManager('claude');
    executor.legacyPluginIds.add('thoth-mem@thoth-mem-claude');

    const result = setupNativeManager({ host: 'claude', homeDir: temporaryHome('claude-legacy'), executor });

    expect(result).toMatchObject({ status: 'complete', changed: true });
    expect(result.diagnostics).toEqual([expect.stringContaining('externally owned')]);
    expect(executor.plugin).toBe(true);
    expect([...executor.legacyPluginIds]).toEqual(['thoth-mem@thoth-mem-claude']);
    expect(executor.calls.some(({ args }) => !args.includes('--help') && args[1] === 'uninstall')).toBe(false);
  });

  test.each(['codex', 'claude'] as const)('does not mutate a conflicting %s marketplace provenance', (host) => {
    const executor = new FakeManager(host);
    executor.marketplace = true;
    executor.marketplaceSource = 'https://example.invalid/unrelated.git';

    const result = setupNativeManager({ host, homeDir: temporaryHome(`${host}-collision`), executor });

    expect(result).toMatchObject({ status: 'requires-user-action', changed: false });
    expect(result.diagnostics).toEqual([expect.stringContaining(managerIdentities[host].marketplaceName)]);
    expect(executor.calls.every(({ args }) => args.includes('--version') || args.includes('--help') || args.includes('list'))).toBe(true);
  });

  test('reconciles an interrupted marketplace command from the receipt and current manager state', () => {
    const homeDir = temporaryHome('resume');
    const executor = new FakeManager('codex');
    expect(() => setupNativeManager({ host: 'codex', homeDir, executor, interruptAfter: 'marketplace' })).toThrow(/Simulated manager interruption/u);
    expect(executor.marketplace).toBe(true);
    expect(executor.plugin).toBe(false);

    const resumed = setupNativeManager({ host: 'codex', homeDir, executor });
    expect(resumed).toMatchObject({ status: 'complete', changed: true, recovered: true });
    expect(executor.plugin).toBe(true);
  });

  test('fails closed on a pre-identity in-progress journal instead of reusing legacy ownership booleans', () => {
    const homeDir = temporaryHome('legacy-journal');
    const executor = new FakeManager('codex');
    expect(() => setupNativeManager({ host: 'codex', homeDir, env: {}, executor, interruptAfter: 'marketplace' })).toThrow(/Simulated manager interruption/u);
    const journalPath = join(homeDir, '.config', 'thoth-mem', 'receipts', 'codex.in-progress.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Record<string, unknown>;
    journal.schemaVersion = 1;
    delete journal.marketplaceName;
    delete journal.pluginId;
    writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
    const mutationsBeforeResume = executor.calls.filter(({ args }) => !args.includes('--version') && !args.includes('--help') && !args.includes('list')).length;

    expect(() => setupNativeManager({ host: 'codex', homeDir, env: {}, executor })).toThrow(/in-progress manager receipt is invalid/u);
    expect(executor.calls.filter(({ args }) => !args.includes('--version') && !args.includes('--help') && !args.includes('list'))).toHaveLength(mutationsBeforeResume);
  });

  test('rolls back only the receipt-proven marketplace when plugin installation cannot be verified', () => {
    const homeDir = temporaryHome('rollback');
    const executor = new FakeManager('codex');
    executor.failPluginAdd = true;
    const result = setupNativeManager({ host: 'codex', homeDir, executor });

    expect(result).toMatchObject({ status: 'requires-user-action', strategy: 'plugin_manager' });
    expect(executor.marketplace).toBe(false);
    expect(executor.plugin).toBe(false);
    expect(executor.calls.some(({ args }) => args.join(' ') === 'plugin marketplace remove thoth-plugins')).toBe(true);
  });
});
