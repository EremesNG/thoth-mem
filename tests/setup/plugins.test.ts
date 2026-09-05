import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';

const setupPiMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/setup/pi.js', () => ({ setupPi: setupPiMock }));

import { CANONICAL_PLUGIN_INVENTORY } from '../../src/integration/package-inventory.js';
import { runCli } from '../../src/cli.js';

describe('first-product native setup boundary', () => {
  it('advertises Pi setup and rejects project scope before manager access', async () => {
    let stdout = ''; let stderr = '';
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((value) => { stdout += String(value); return true; });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((value) => { stderr += String(value); return true; });
    try {
      expect(await runCli(['--help'])).toBe(0);
      expect(stdout).toContain('setup <opencode|codex|claude|pi>');
      expect(await runCli(['setup', 'pi', '--scope', 'project'])).toBe(2);
      expect(stderr).toContain('only global/user');
    } finally { stdoutSpy.mockRestore(); stderrSpy.mockRestore(); }
  });

  it('parses the exact Pi setup flags and rejects duplicate or unknown options', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-pi-cli-'));
    const localRoot = join(root, 'package'); const dataDir = join(root, 'data');
    setupPiMock.mockReturnValue({ host: 'pi', status: 'planned', changed: false, source: localRoot, version: '0.5.1', piVersion: '0.84.4', actions: [], receiptPath: null, recovered: false, verification: { package: false, source: false, manifest: false }, warnings: [] });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(await runCli(['setup', 'pi', '--plan', '--json', '--data-dir', dataDir, `--local-package-root=${localRoot}`])).toBe(0);
      expect(setupPiMock).toHaveBeenCalledWith({ packageRoot: localRoot, dataDir, planOnly: true });
      expect(await runCli(['setup', 'pi', '--force-version'])).toBe(2);
      expect(await runCli(['setup', 'pi', '--plan', '--plan'])).toBe(2);
      expect(await runCli(['setup', 'pi', '--unknown'])).toBe(2);
      expect(await runCli(['setup', 'pi', '--data-dir'])).toBe(2);
      expect(setupPiMock).toHaveBeenCalledTimes(1);
    } finally { stdoutSpy.mockRestore(); stderrSpy.mockRestore(); rmSync(root, { recursive: true, force: true }); }
  });

  it('exposes only native setup commands and rejects the removed copied setup command', () => {
    const removedCommand = `setup-v${2}`;
    const cli = join(process.cwd(), 'dist', 'index.js');
    const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8', windowsHide: true });
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('setup <opencode|codex|claude|pi>');
    expect(help.stdout).not.toContain(removedCommand);
    expect(help.stdout).not.toContain('--target <plugin-dir>');

    const root = mkdtempSync(join(tmpdir(), 'thoth-removed-setup-'));
    try {
      const removed = spawnSync(process.execPath, [cli, removedCommand, '--harness', 'opencode', '--target', root], { encoding: 'utf8', windowsHide: true });
      expect(removed.status).toBe(2);
      expect(removed.stderr).toContain(`Unknown command: ${removedCommand}`);
      expect(existsSync(join(root, 'thoth-mem'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('treats global, MCP, and every setup help form as a zero-write operation', () => {
    const cli = join(process.cwd(), 'dist', 'index.js');
    const root = mkdtempSync(join(tmpdir(), 'thoth-setup-help-'));
    try {
      const cases = [
        ['--help'], ['-h'], ['mcp', '--help'], ['mcp', '-h'],
        ...(['opencode', 'codex', 'claude', 'pi'] as const).flatMap((host) => [['setup', host, '--help'], ['setup', host, '-h']]),
      ];
      for (const [index, args] of cases.entries()) {
        const isolatedHome = join(root, `case-${index}`);
        const configDirectory = join(isolatedHome, 'opencode');
        const result = spawnSync(process.execPath, [cli, ...args], {
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: isolatedHome,
            USERPROFILE: isolatedHome,
            OPENCODE_CONFIG_DIR: configDirectory,
            XDG_CONFIG_HOME: join(isolatedHome, 'config'),
            THOTH_MEM_DATA_DIR: join(isolatedHome, 'data'),
          },
          input: '',
          windowsHide: true,
        });

        expect(result.status, `${args.join(' ')}\n${result.stderr}`).toBe(0);
        expect(result.stdout, args.join(' ')).toContain('setup <opencode|codex|claude|pi>');
        expect(result.stdout, args.join(' ')).not.toContain('complete; changed=');
        expect(existsSync(isolatedHome) ? readdirSync(isolatedHome, { recursive: true }) : [], args.join(' ')).toEqual([]);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retains only the canonical OpenCode Skill source and native Codex/Claude bundle contracts', () => {
    expect(CANONICAL_PLUGIN_INVENTORY.opencode).toEqual([
      'skills/thoth-mem/SKILL.md',
      'skills/thoth-mem/references/observation-review.md',
      'skills/thoth-mem/references/opencode.md',
    ]);
    for (const removed of ['hooks.json', 'manifest.json', 'mcp.json', 'plugin.mjs', 'runner.mjs']) {
      expect(existsSync(join(process.cwd(), 'integrations', 'opencode', removed))).toBe(false);
    }
    for (const harness of ['codex', 'claude-code'] as const) {
      for (const asset of CANONICAL_PLUGIN_INVENTORY[harness]) {
        expect(existsSync(join(process.cwd(), 'integrations', harness, asset))).toBe(true);
      }
    }
    expect(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).toContain('"main": "dist/opencode.js"');
  });
});
