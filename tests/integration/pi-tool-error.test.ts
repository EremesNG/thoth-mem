import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

it('delivers tool failures to the real Pi model context and recovers for the next call', async () => {
  const root = mkdtempSync(join(tmpdir(), 'thoth-pi-tool-error-'));
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../fixtures/pi-tool-error-smoke.mjs', import.meta.url)), root], { timeout: 30_000, windowsHide: true });
    expect(stdout).toContain('Pi native error signaling and subsequent MCP call passed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 40_000);
