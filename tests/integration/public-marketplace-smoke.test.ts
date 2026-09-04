import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('packed native distribution smoke', () => {
  it('executes native OpenCode plus isolated Codex and Claude lifecycle/MCP paths', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-packed-plugins.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120_000,
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('Packed smoke passed for opencode, codex, claude-code.');
    expect(result.stdout).toContain('Activated lifecycle fixtures for opencode, codex, claude-code.');
  }, 120_000);
});
