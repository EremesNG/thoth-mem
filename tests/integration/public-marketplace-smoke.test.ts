import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('packed native distribution smoke', () => {
  it('verifies the local four-host package including Pi metadata and built assets', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-integration-package.mjs'], {
      cwd: process.cwd(), encoding: 'utf8', windowsHide: true,
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('OpenCode, Codex, Claude Code, and Pi');
    const fixture = mkdtempSync(join(tmpdir(), 'thoth-stale-pi-'));
    try {
      for (const path of ['package.json', 'integrations', 'plugin', 'dist']) cpSync(path, join(fixture, path), { recursive: true });
      writeFileSync(join(fixture, 'integrations', 'pi', 'skills', 'thoth-mem', 'SKILL.md'), 'stale\n');
      const stale = spawnSync(process.execPath, ['scripts/verify-integration-package.mjs'], {
        cwd: process.cwd(), encoding: 'utf8', windowsHide: true, env: { ...process.env, THOTH_MEM_VERIFY_ROOT: fixture },
      });
      expect(stale.status).toBe(1);
      expect(stale.stderr).toContain('stale-pi-skill:SKILL.md');
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('executes four native hosts plus local and hermetic-public Pi paths', () => {
    const inheritedConfig = mkdtempSync(join(tmpdir(), 'thoth-smoke-inherited-config-'));
    const providerRoot = join(inheritedConfig, 'thoth-mem');
    const providerPath = join(providerRoot, 'config.json');
    const providerBefore = 'unrelated host configuration must not be read or changed\n';
    mkdirSync(providerRoot);
    writeFileSync(providerPath, providerBefore);
    try {
      const result = spawnSync(process.execPath, ['scripts/verify-packed-plugins.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        windowsHide: true,
        timeout: 180_000,
        env: { ...process.env, XDG_CONFIG_HOME: inheritedConfig },
      });
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain('Packed smoke passed for opencode, codex, claude-code, pi.');
      expect(result.stdout).toContain('Activated lifecycle fixtures for opencode, codex, claude-code, pi.');
      expect(result.stdout).toMatch(/Verified Pi \d+\.\d+\.\d+ local candidate with disposable home and unchanged real Pi home\./u);
      expect(result.stdout).toContain('Verified hermetic public Pi candidate and complete runtime closure.');
      expect(result.stdout).toContain('Verified exact public Pi list and full installed runtime graph.');
      expect(result.stdout).toContain('Verified SHA-256, SHA-512 integrity, and SHA-1 shasum ledger fields.');
      expect(readFileSync(providerPath, 'utf8')).toBe(providerBefore);
      expect(readdirSync(inheritedConfig)).toEqual(['thoth-mem']);
      expect(readdirSync(providerRoot)).toEqual(['config.json']);
    } finally {
      rmSync(inheritedConfig, { recursive: true, force: true });
    }
  }, 180_000);
});
