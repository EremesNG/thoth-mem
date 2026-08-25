import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('packed public marketplace smoke', () => {
  it('executes lifecycle and MCP initialization for both public host plugins', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-packed-plugins.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120_000,
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('Public marketplace smoke passed for codex, claude-code.');
    expect(result.stdout).toContain('Installed public plugin roots were isolated from the unpacked npm package.');
  }, 120_000);
});
