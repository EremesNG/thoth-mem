import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  identity: { root_session_id: process.env.IDENTITY_ROOT ?? 'root', project: process.env.IDENTITY_PROJECT ?? 'fixture' },
  data: {
    outcome: 'confirmed',
    recovery: { items: [{ kind: 'decision', title: 'Public recovery', content: process.env.RECOVERY_CONTENT ?? 'Use marketplace memory.' }] }
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

function createPackedRuntimeShim(root: string): string {
  const runtime = join(root, 'packed runtime.mjs');
  writeFileSync(runtime, `
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const lifecycle = args.indexOf('lifecycle-v2');
const child = spawnSync(process.execPath, [${JSON.stringify(join(process.cwd(), 'dist', 'index.js'))}, ...args.slice(lifecycle)], { stdio: 'inherit', env: process.env, windowsHide: true });
process.exit(child.status ?? 1);
`);
  if (process.platform === 'win32') {
    const command = join(root, 'packed npx.cmd');
    writeFileSync(command, `@echo off\r\n"${process.execPath}" "${runtime}" %*\r\n`);
    return command;
  }
  const command = join(root, 'packed npx');
  writeFileSync(command, `#!/bin/sh\n"${process.execPath}" "${runtime}" "$@"\n`);
  chmodSync(command, 0o755);
  return command;
}

function createLocalRuntime(root: string): { entry: string; capture: string } {
  const packageRoot = join(root, 'local package');
  const entry = join(packageRoot, 'dist', 'index.js');
  const capture = join(root, 'local runtime args.json');
  mkdirSync(join(packageRoot, 'dist'), { recursive: true });
  writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ name: 'thoth-mem', version: '0.4.13' }));
  writeFileSync(entry, `
import { writeFileSync } from 'node:fs';
writeFileSync(process.env.CAPTURE_PATH, JSON.stringify(process.argv.slice(2)));
`);
  return { entry, capture };
}

describe('public plugin runner', () => {
  it('starts MCP from the explicit validated local runtime instead of the published package', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth local runner space '));
    try {
      const local = createLocalRuntime(root);
      const configRoot = join(root, 'config');
      const providerDirectory = join(configRoot, 'thoth-mem');
      mkdirSync(providerDirectory, { recursive: true });
      writeFileSync(join(providerDirectory, 'config.json'), `${JSON.stringify({
        version: 2,
        dataDir: join(root, 'shared data'),
        runtimeEntry: local.entry,
      }, null, 2)}\n`);

      const result = spawnSync(process.execPath, [runner, '--mcp'], {
        cwd: tmpdir(),
        encoding: 'utf8',
        env: {
          ...process.env,
          XDG_CONFIG_HOME: configRoot,
          CAPTURE_PATH: local.capture,
          THOTH_MEM_PUBLIC_NPX_COMMAND: join(root, 'must-not-run-npx'),
        },
        windowsHide: true,
      });

      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(readFileSync(local.capture, 'utf8'))).toEqual(['mcp', '--no-http']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(['codex', 'claude'] as const)('runs the pinned public package for %s without a setup receipt', (harness) => {
    const root = mkdtempSync(join(tmpdir(), 'thoth public runner space '));
    try {
      const shim = createNpxShim(root);
      const result = spawnSync(process.execPath, [runner, '--harness', harness], {
        cwd: tmpdir(),
        input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'root', cwd: 'C:/fixture', source: 'startup' }),
        encoding: 'utf8',
        env: { ...process.env, XDG_CONFIG_HOME: join(root, 'config'), THOTH_MEM_PUBLIC_NPX_COMMAND: shim.command, CAPTURE_PATH: shim.capture },
        windowsHide: true,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: 'thoth-mem verified identity: root_session_id=root; project=fixture\n\n## thoth-mem recovered context\n- [decision] Public recovery: Use marketplace memory.',
        },
      });
      expect(JSON.parse(readFileSync(shim.capture, 'utf8'))).toEqual([
        '--yes', 'thoth-mem@0.4.13', 'lifecycle-v2', '--harness', harness,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps verified identity complete, truncates only recovery context, and rejects an overlong identity header', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth public runner identity bound '));
    try {
      const shim = createNpxShim(root);
      const payload = JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'root', cwd: 'C:/fixture', source: 'startup' });
      const baseEnvironment = { ...process.env, XDG_CONFIG_HOME: join(root, 'config'), THOTH_MEM_PUBLIC_NPX_COMMAND: shim.command, CAPTURE_PATH: shim.capture };
      const bounded = spawnSync(process.execPath, [runner, '--harness', 'codex'], {
        cwd: tmpdir(), input: payload, encoding: 'utf8', env: { ...baseEnvironment, RECOVERY_CONTENT: 'x'.repeat(2_000) }, windowsHide: true,
      });
      const boundedContext = JSON.parse(bounded.stdout).hookSpecificOutput.additionalContext as string;
      expect(Array.from(boundedContext)).toHaveLength(1_000);
      expect(boundedContext).toMatch(/^thoth-mem verified identity: root_session_id=root; project=fixture\n\n/);

      const rejected = spawnSync(process.execPath, [runner, '--harness', 'codex'], {
        cwd: tmpdir(), input: payload, encoding: 'utf8', env: { ...baseEnvironment, IDENTITY_ROOT: `root-${'x'.repeat(1_000)}` }, windowsHide: true,
      });
      expect(JSON.parse(rejected.stdout)).toEqual({});

      const injected = spawnSync(process.execPath, [runner, '--harness', 'codex'], {
        cwd: tmpdir(), input: payload, encoding: 'utf8', env: { ...baseEnvironment, IDENTITY_ROOT: 'root\ninjected-context' }, windowsHide: true,
      });
      expect(JSON.parse(injected.stdout)).toEqual({});

      for (const value of ['root; project=forged', 'root\tforged', 'root\u2028forged', 'root\u2029forged']) {
        const rejectedRoot = spawnSync(process.execPath, [runner, '--harness', 'codex'], {
          cwd: tmpdir(), input: payload, encoding: 'utf8', env: { ...baseEnvironment, IDENTITY_ROOT: value }, windowsHide: true,
        });
        expect(JSON.parse(rejectedRoot.stdout), `root identity ${JSON.stringify(value)}`).toEqual({});

        const rejectedProject = spawnSync(process.execPath, [runner, '--harness', 'codex'], {
          cwd: tmpdir(), input: payload, encoding: 'utf8', env: { ...baseEnvironment, IDENTITY_PROJECT: value }, windowsHide: true,
        });
        expect(JSON.parse(rejectedProject.stdout), `project identity ${JSON.stringify(value)}`).toEqual({});
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('delivers the Claude pre-compaction checkpoint on SessionStart compact with verified identity first', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth claude compact recovery '));
    try {
      const command = createPackedRuntimeShim(root);
      const configRoot = join(root, 'config');
      const providerDirectory = join(configRoot, 'thoth-mem');
      mkdirSync(providerDirectory, { recursive: true });
      writeFileSync(join(providerDirectory, 'config.json'), `${JSON.stringify({ version: 2, dataDir: join(root, 'shared data') }, null, 2)}\n`);
      const environment = { ...process.env, XDG_CONFIG_HOME: configRoot, THOTH_MEM_PUBLIC_NPX_COMMAND: command };
      const base = { session_id: 'claude-compact-root', cwd: 'C:/fixture' };

      const preCompact = spawnSync(process.execPath, [runner, '--harness', 'claude'], {
        cwd: tmpdir(),
        input: JSON.stringify({ ...base, hook_event_name: 'PreCompact', event_id: 'claude:pre-compact', summary: 'Keep the compact recovery contract.' }),
        encoding: 'utf8',
        env: environment,
        windowsHide: true,
      });
      expect(preCompact.status, preCompact.stderr).toBe(0);
      expect(JSON.parse(preCompact.stdout)).toEqual({});

      const compactStart = spawnSync(process.execPath, [runner, '--harness', 'claude'], {
        cwd: tmpdir(),
        input: JSON.stringify({ ...base, hook_event_name: 'SessionStart', event_id: 'claude:compact-start', source: 'compact' }),
        encoding: 'utf8',
        env: environment,
        windowsHide: true,
      });
      expect(compactStart.status, compactStart.stderr).toBe(0);
      const context = JSON.parse(compactStart.stdout).hookSpecificOutput?.additionalContext as string;
      expect(context).toMatch(/^thoth-mem verified identity: root_session_id=claude-compact-root; project=fixture\n\n/);
      expect(context).toContain('Keep the compact recovery contract.');
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
        env: { ...process.env, XDG_CONFIG_HOME: join(root, 'config'), THOTH_MEM_PUBLIC_NPX_COMMAND: shim.command, CAPTURE_PATH: shim.capture, FAIL_RUNTIME: '1' },
        windowsHide: true,
      });
      expect(result.status).not.toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({});
      expect(result.stderr.length).toBeLessThanOrEqual(600);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the strict provider config for the pinned runtime and fails closed on invalid config', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth public provider '));
    try {
      const command = createPackedRuntimeShim(root);
      const configRoot = join(root, 'config');
      const providerDirectory = join(configRoot, 'thoth-mem');
      const dataDir = join(root, 'shared data');
      mkdirSync(providerDirectory, { recursive: true });
      const configPath = join(providerDirectory, 'config.json');
      writeFileSync(configPath, `${JSON.stringify({ version: 2, dataDir }, null, 2)}\n`);
      const environment = { ...process.env, XDG_CONFIG_HOME: configRoot, THOTH_MEM_PUBLIC_NPX_COMMAND: command };
      delete environment.THOTH_MEM_DATA_DIR;
      const payload = JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'provider-root', event_id: 'provider-start', cwd: 'C:/fixture', source: 'startup' });
      const valid = spawnSync(process.execPath, [runner, '--harness', 'codex'], { cwd: tmpdir(), input: payload, encoding: 'utf8', env: environment, windowsHide: true });
      expect(valid.status, valid.stderr).toBe(0);
      expect(JSON.parse(valid.stdout)).toEqual({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: 'thoth-mem verified identity: root_session_id=provider-root; project=fixture',
        },
      });
      expect(existsSync(join(dataDir, 'memory-v2.sqlite'))).toBe(true);

      writeFileSync(configPath, '{ invalid json');
      const invalid = spawnSync(process.execPath, [runner, '--harness', 'codex'], { cwd: tmpdir(), input: payload, encoding: 'utf8', env: environment, windowsHide: true });
      expect(invalid.status).not.toBe(0);
      expect(JSON.parse(invalid.stdout)).toEqual({});
      expect(invalid.stderr).toContain('provider configuration is invalid');
      expect(invalid.stderr.length).toBeLessThanOrEqual(600);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
