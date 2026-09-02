import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { CANONICAL_PLUGIN_INVENTORY } from '../../src/integration/package-inventory.js';

describe('first-product native setup boundary', () => {
  it('exposes only native setup commands and rejects the removed copied setup command', () => {
    const removedCommand = `setup-v${2}`;
    const cli = join(process.cwd(), 'dist', 'index.js');
    const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8', windowsHide: true });
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('setup <opencode|codex|claude>');
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
        ...(['opencode', 'codex', 'claude'] as const).flatMap((host) => [['setup', host, '--help'], ['setup', host, '-h']]),
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
        expect(result.stdout, args.join(' ')).toContain('setup <opencode|codex|claude>');
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
