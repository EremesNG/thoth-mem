import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const runnerPath = fileURLToPath(new URL('../../integrations/shared/hook-runner.mjs', import.meta.url));
const temporaryRoots: string[] = [];

interface HookRunner {
  dispatchHookRequest(
    request: Record<string, unknown>,
    options: { runnerPath: string; env: NodeJS.ProcessEnv },
  ): Promise<Record<string, unknown>>;
}

interface WindowsShimFixture {
  binRoot: string;
  commandShim: string;
  powerShellShim: string;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => (
    rm(root, { recursive: true, force: true })
  )));
});

async function importRunner(): Promise<HookRunner> {
  return import(`${pathToFileURL(runnerPath).href}?test=${randomUUID()}`) as Promise<HookRunner>;
}

function integrationRequest(): Record<string, unknown> {
  return {
    protocolVersion: 1,
    harness: 'opencode',
    event: { hook: 'SessionStart', payload: { session_id: 'windows-shim-probe' } },
  };
}

function codexSessionStartPayload(): Record<string, unknown> {
  return {
    session_id: 'windows-native-session',
    transcript_path: null,
    cwd: 'C:\\workspace\\thoth-mem',
    hook_event_name: 'SessionStart',
    model: 'gpt-5.6-codex',
    permission_mode: 'default',
    source: 'startup',
  };
}

async function createWindowsShimFixture(): Promise<WindowsShimFixture> {
  const root = await mkdtemp(join(tmpdir(), 'thoth runner cmd & spaces '));
  temporaryRoots.push(root);
  const binRoot = join(root, 'pnpm bin & shims');
  const runtimePath = join(root, 'package with spaces', 'dist', 'index.mjs');
  const commandShim = join(binRoot, 'thoth-mem.CMD');
  const powerShellShim = join(binRoot, 'thoth-mem.ps1');
  await mkdir(join(root, 'package with spaces', 'dist'), { recursive: true });
  await mkdir(binRoot, { recursive: true });
  await writeFile(runtimePath, [
    "import { readFileSync } from 'node:fs';",
    "const input = JSON.parse(readFileSync(0, 'utf8'));",
    'process.stdout.write(JSON.stringify({',
    '  protocolVersion: 1,',
    "  outcome: 'confirmed',",
    '  retryable: false,',
    '  argv: process.argv.slice(2),',
    '  input,',
    '}));',
  ].join('\n'), 'utf8');
  await writeFile(join(binRoot, 'thoth-mem'), '#!/bin/sh\nexit 97\n', 'utf8');
  await writeFile(
    commandShim,
    `@ECHO OFF\r\n"${process.execPath}" "${runtimePath}" %*\r\n`,
    'utf8',
  );
  await writeFile(powerShellShim, 'exit 0\r\n', 'utf8');
  return { binRoot, commandShim, powerShellShim };
}

describe.skipIf(process.platform !== 'win32')('portable runner Windows launchers', () => {
  it('executes the real cmd shim instead of the sibling POSIX shim from PATH', async () => {
    const fixture = await createWindowsShimFixture();
    const runner = await importRunner();
    const request = integrationRequest();

    await expect(runner.dispatchHookRequest(request, {
      runnerPath,
      env: { ...process.env, PATH: fixture.binRoot, THOTH_MEM_BIN: '' },
    })).resolves.toMatchObject({
      protocolVersion: 1,
      outcome: 'confirmed',
      argv: ['integration-event'],
      input: request,
    });
  });

  it('executes a cmd shim supplied through THOTH_MEM_BIN', async () => {
    const fixture = await createWindowsShimFixture();
    const runner = await importRunner();

    await expect(runner.dispatchHookRequest(integrationRequest(), {
      runnerPath,
      env: { ...process.env, PATH: '', THOTH_MEM_BIN: fixture.commandShim },
    })).resolves.toMatchObject({
      protocolVersion: 1,
      outcome: 'confirmed',
      argv: ['integration-event'],
    });
  });

  it('converts synchronous launcher failures into a safe degraded result', async () => {
    const fixture = await createWindowsShimFixture();
    const runner = await importRunner();

    await expect(runner.dispatchHookRequest(integrationRequest(), {
      runnerPath,
      env: { ...process.env, PATH: '', THOTH_MEM_BIN: fixture.powerShellShim },
    })).resolves.toMatchObject({
      protocolVersion: 1,
      outcome: 'degraded',
      retryable: true,
      diagnostic: expect.stringMatching(/\((?:EFTYPE|EINVAL|ENOENT)\)/),
    });
  });

  it('reports a bounded safe launcher failure on native hook stderr', async () => {
    const fixture = await createWindowsShimFixture();

    const result = spawnSync(process.execPath, [
      runnerPath,
      '--harness', 'codex',
      '--hook', 'SessionStart',
    ], {
      input: JSON.stringify(codexSessionStartPayload()),
      encoding: 'utf8',
      env: { ...process.env, PATH: '', THOTH_MEM_BIN: fixture.powerShellShim },
      shell: false,
      timeout: 5_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
    expect(result.stderr).toMatch(/thoth-mem: .*\((?:EFTYPE|EINVAL|ENOENT)\)/);
    expect(result.stderr).not.toContain('windows-native-session');
  });
});
