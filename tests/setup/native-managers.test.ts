import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { setupNativeManager, type ManagerCommandResult, type NativeManagerExecutor } from '../../src/setup/native-manager.js';

const roots: string[] = [];

function temporaryHome(name: string): string {
  const root = join(tmpdir(), `thoth-manager-${name}-${process.pid}-${roots.length}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

class FakeManager implements NativeManagerExecutor {
  readonly calls: Array<{ command: string; args: string[] }> = [];
  marketplace = false;
  plugin = false;
  enabled = false;
  failMarketplaceAdd = false;
  failPluginAdd = false;
  marketplaceSource = 'https://github.com/EremesNG/thoth-mem.git';

  constructor(readonly host: 'codex' | 'claude', readonly version = host === 'codex' ? 'codex-cli 0.147.0' : '2.1.198 (Claude Code)', readonly completeCapabilities = true) {}

  run(command: string, args: string[]): ManagerCommandResult {
    this.calls.push({ command, args: [...args] });
    if (args.length === 1 && args[0] === '--version') return { status: 0, stdout: this.version, stderr: '' };
    if (args.includes('--help')) {
      const output = this.completeCapabilities
        ? this.host === 'codex'
          ? 'plugin marketplace add --json plugin add --json plugin remove marketplace remove plugin list --json'
          : 'plugin marketplace add --scope user plugin install --scope user plugin uninstall plugin enable plugin list --json'
        : 'plugin list';
      return { status: 0, stdout: output, stderr: '' };
    }
    if (args.join(' ') === 'plugin marketplace list --json') {
      return this.host === 'codex'
        ? this.ok({ marketplaces: this.marketplace ? [{ name: 'thoth-mem', marketplaceSource: { sourceType: this.marketplaceSource.startsWith('http') ? 'git' : 'local', source: this.marketplaceSource } }] : [] })
        : this.ok(this.marketplace ? [{ name: 'thoth-mem', source: 'github', repo: 'EremesNG/thoth-mem' }] : []);
    }
    if (args.join(' ') === 'plugin list --json') {
      const installed = this.plugin ? [{ pluginId: 'thoth-mem@thoth-mem', name: 'thoth-mem', marketplaceName: 'thoth-mem', version: '0.4.13', installed: true, enabled: this.enabled }] : [];
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
      if (!this.failPluginAdd) { this.plugin = true; this.enabled = true; }
      return { status: this.failPluginAdd ? 1 : 0, stdout: '', stderr: this.failPluginAdd ? 'install failed' : '' };
    }
    if (args[0] === 'plugin' && (args[1] === 'remove' || args[1] === 'uninstall')) {
      this.plugin = false;
      this.enabled = false;
      return { status: 0, stdout: '', stderr: '' };
    }
    if (args[0] === 'plugin' && args[1] === 'marketplace' && (args[2] === 'remove' || args[2] === 'rm')) {
      this.marketplace = false;
      return { status: 0, stdout: '', stderr: '' };
    }
    if (args[0] === 'plugin' && args[1] === 'enable') {
      this.enabled = true;
      return { status: 0, stdout: '', stderr: '' };
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

describe('native Codex and Claude manager setup', () => {
  test('plans manager-only Codex operations with zero writes and zero mutating calls', () => {
    const homeDir = temporaryHome('plan');
    const executor = new FakeManager('codex');
    const result = setupNativeManager({ host: 'codex', homeDir, executor, planOnly: true });

    expect(result).toMatchObject({ status: 'planned', changed: false, strategy: 'plugin_manager', restartRequired: false });
    expect(result.actions.join('\n')).toContain('codex plugin marketplace add');
    expect(result.actions.join('\n')).toContain('codex plugin add thoth-mem@thoth-mem');
    expect(executor.calls.every(({ args }) => args.includes('--version') || args.includes('--help') || args.includes('list'))).toBe(true);
    expect(existsSync(join(homeDir, '.config', 'thoth-mem'))).toBe(false);
  });

  test('installs and independently verifies Codex 0.147.x, then performs an exact no-op', () => {
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

  test('binds an explicit local Codex marketplace to its verified checkout runtime', () => {
    const homeDir = temporaryHome('codex-local');
    const packageRoot = join(homeDir, 'local package');
    const runtimeEntry = join(packageRoot, 'dist', 'index.js');
    const dataDir = join(homeDir, 'shared-data');
    mkdirSync(join(packageRoot, 'dist'), { recursive: true });
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ name: 'thoth-mem', version: '0.4.13' }));
    writeFileSync(runtimeEntry, 'export {};\n');
    const executor = new FakeManager('codex');

    const first = setupNativeManager({ host: 'codex', homeDir, executor, packageRoot, dataDir });
    expect(first).toMatchObject({ status: 'complete', changed: true, restartRequired: true });
    expect(JSON.parse(readFileSync(join(homeDir, '.config', 'thoth-mem', 'config.json'), 'utf8'))).toEqual({
      version: 2,
      dataDir,
      runtimeEntry,
    });

    const second = setupNativeManager({ host: 'codex', homeDir, executor, packageRoot, dataDir });
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

  test('fails closed outside Codex 0.147.x unless force proves all safe capabilities', () => {
    const unsupported = new FakeManager('codex', 'codex-cli 0.146.0');
    const plain = setupNativeManager({ host: 'codex', homeDir: temporaryHome('old'), executor: unsupported });
    expect(plain).toMatchObject({ status: 'unsupported', changed: false, strategy: 'unsupported' });
    expect(plain.warnings).toEqual([]);
    expect(unsupported.marketplace).toBe(false);

    const forced = new FakeManager('codex', 'codex-cli 0.146.0');
    const override = setupNativeManager({ host: 'codex', homeDir: temporaryHome('forced'), executor: forced, forceVersion: true });
    expect(override.status).toBe('complete');
    expect(override.warnings).toEqual([expect.stringContaining('forced Codex version override')]);

    const unsafe = new FakeManager('codex', 'codex-cli 9.0.0', false);
    const rejected = setupNativeManager({ host: 'codex', homeDir: temporaryHome('unsafe'), executor: unsafe, forceVersion: true });
    expect(rejected).toMatchObject({ status: 'unsupported', changed: false, strategy: 'unsupported' });
    expect(rejected.warnings).toEqual([]);
    expect(rejected.diagnostics).toEqual([expect.stringContaining('capability')]);
  });

  test('uses only Claude user manager commands and reports no model-use evidence', () => {
    const homeDir = temporaryHome('claude');
    const executor = new FakeManager('claude');
    const result = setupNativeManager({ host: 'claude', homeDir, executor });

    expect(result).toMatchObject({ status: 'complete', changed: true, strategy: 'plugin_manager' });
    expect(result.verification).toMatchObject({ marketplace: true, plugin: true, enabled: true, modelUse: false });
    expect(executor.calls.some(({ args }) => args.join(' ').includes('marketplace add') && args.includes('user'))).toBe(true);
    expect(executor.calls.some(({ args }) => args.join(' ').includes('plugin install') && args.includes('user'))).toBe(true);
    expect(executor.calls.every(({ command }) => command === 'claude')).toBe(true);
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

  test('rolls back only the receipt-proven marketplace when plugin installation cannot be verified', () => {
    const homeDir = temporaryHome('rollback');
    const executor = new FakeManager('codex');
    executor.failPluginAdd = true;
    const result = setupNativeManager({ host: 'codex', homeDir, executor });

    expect(result).toMatchObject({ status: 'requires-user-action', strategy: 'plugin_manager' });
    expect(executor.marketplace).toBe(false);
    expect(executor.plugin).toBe(false);
    expect(executor.calls.some(({ args }) => args.join(' ') === 'plugin marketplace remove thoth-mem')).toBe(true);
  });
});
