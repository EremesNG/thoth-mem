import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const runner = join(process.cwd(), 'plugin', 'runners', 'public-runner.mjs');

function createNpxShim(root: string): { command: string; capture: string } {
  const runtime = join(root, 'fake runtime.mjs');
  const capture = join(root, 'captured args.json');
  writeFileSync(runtime, `
import { readFileSync, writeFileSync } from 'node:fs';
writeFileSync(process.env.CAPTURE_PATH, JSON.stringify(process.argv.slice(2)));
readFileSync(0, 'utf8');
if (process.env.FAIL_RUNTIME === '1') {
  process.stderr.write('x'.repeat(2000));
  process.exit(7);
}
process.stdout.write(JSON.stringify({
  schema: 'thoth-mem.lifecycle.v2',
  data: {
    outcome: 'confirmed',
    recovery: { items: [{ kind: 'decision', title: 'Public recovery', content: 'Use marketplace memory.' }] }
  }
}));
`);
  if (process.platform === 'win32') {
    const command = join(root, 'fake npx.cmd');
    writeFileSync(command, `@echo off\r\n"${process.execPath}" "${runtime}" %*\r\n`);
    return { command, capture };
  }
  const command = join(root, 'fake npx');
  writeFileSync(command, `#!/bin/sh\n"${process.execPath}" "${runtime}" "$@"\n`);
  chmodSync(command, 0o755);
  return { command, capture };
}

describe('public plugin runner', () => {
  it.each(['codex', 'claude'] as const)('runs the pinned public package for %s without a setup receipt', (harness) => {
    const root = mkdtempSync(join(tmpdir(), 'thoth public runner space '));
    try {
      const shim = createNpxShim(root);
      const result = spawnSync(process.execPath, [runner, '--harness', harness], {
        cwd: tmpdir(),
        input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'root', cwd: 'C:/fixture', source: 'startup' }),
        encoding: 'utf8',
        env: { ...process.env, THOTH_MEM_PUBLIC_NPX_COMMAND: shim.command, CAPTURE_PATH: shim.capture },
        windowsHide: true,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: '## thoth-mem recovered context\n- [decision] Public recovery: Use marketplace memory.',
        },
      });
      expect(JSON.parse(readFileSync(shim.capture, 'utf8'))).toEqual([
        '--yes', 'thoth-mem@0.4.13', 'lifecycle-v2', '--harness', harness,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed with neutral output and bounded diagnostics', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth public runner failure '));
    try {
      const shim = createNpxShim(root);
      const result = spawnSync(process.execPath, [runner, '--harness', 'codex'], {
        cwd: tmpdir(),
        input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'root', cwd: 'C:/fixture', source: 'startup' }),
        encoding: 'utf8',
        env: { ...process.env, THOTH_MEM_PUBLIC_NPX_COMMAND: shim.command, CAPTURE_PATH: shim.capture, FAIL_RUNTIME: '1' },
        windowsHide: true,
      });
      expect(result.status).not.toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({});
      expect(result.stderr.length).toBeLessThanOrEqual(600);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
