import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import {
  delimiter,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { HOST_EVIDENCE } from '../fixtures/integration/host-evidence.js';
    import {
      CLAUDE_LATER_USER_EDITS,
      CLAUDE_MANAGER_PROBES,
      CLAUDE_OWNERSHIP_STATES,
      buildClaudeDisposableScopes,
    } from '../fixtures/setup/claude-manager-evidence.js';
import { HARNESSES, buildDisposableHarnesses, selectNativeStdoutEnvelope } from '../fixtures/packaging/disposable-harnesses.js';

import { inspectAndPlanSetup } from '../../src/setup/engine.js';
import type {
  CodexCommandExecutor,
  CodexCommandResult,
} from '../../src/setup/codex-cli.js';
import { resolveSetupPaths, type SetupRoots } from '../../src/setup/paths.js';
import type { SetupRequest } from '../../src/setup/types.js';
import { getVersion } from '../../src/version.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGE_TIMEOUT_MS = 120_000;
const CANONICAL_METADATA_NAME = 'thoth-mem.installation.json';
const LEGACY_METADATA_NAME = '.thoth-mem-managed.json';

interface InstalledPackageFixture {
  root: string;
  installRoot: string;
  packageRoot: string;
  entryPath: string;
  npmEnv: NodeJS.ProcessEnv;
  installMode: 'offline';
}

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
  json?: Record<string, unknown>;
}

function withoutCredentials(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      value === undefined
      || /token|auth|password|secret|credential|api[_-]?key/i.test(key)
      || /^npm_config_/i.test(key)
      || ['NODE_PATH', 'THOTH_MEM_BIN', 'INIT_CWD', 'PWD'].includes(key)
    ) {
      continue;
    }
    environment[key] = value;
  }
  return { ...environment, ...overrides };
}

function run(
  command: string,
  args: readonly string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    timeout?: number;
  },
): SpawnSyncReturns<string> {
  return spawnSync(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    input: options.input,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: options.timeout ?? PACKAGE_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function runNpm(
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): SpawnSyncReturns<string> {
  const candidates = [
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(dirname(process.execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const npmCli = candidates.find((candidate) => existsSync(candidate));
  return npmCli
    ? run(process.execPath, [npmCli, ...args], options)
    : run('npm', args, options);
}

function runPnpm(
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): SpawnSyncReturns<string> {
  const pnpmExecPath = process.env.npm_execpath;
  if (pnpmExecPath && existsSync(pnpmExecPath)) {
    const extension = extname(pnpmExecPath).toLowerCase();
    return ['.js', '.cjs', '.mjs'].includes(extension)
      ? run(process.execPath, [pnpmExecPath, ...args], options)
      : run(pnpmExecPath, args, options);
  }
  if (process.platform === 'win32') {
    const pnpmExecutable = (process.env.PATH ?? '')
      .split(delimiter)
      .map((directory) => join(directory, '..', 'node_modules', '@pnpm', 'exe', 'pnpm.exe'))
      .find((candidate) => existsSync(candidate));
    if (pnpmExecutable) {
      return run(pnpmExecutable, args, options);
    }
  }
  return run('pnpm', args, options);
}

function offlineDependencyInstallArguments(): string[] {
  return ['install', '--offline', '--frozen-lockfile', '--prod'];
}

describe('packed install policy', () => {
  it('requires a no-registry offline dependency install path', () => {
    const args = offlineDependencyInstallArguments();

    expect(args).toContain('--offline');
    expect(args).toContain('--frozen-lockfile');
    expect(args).not.toContain('--ignore-scripts');
    expect(args).not.toContain('--registry');
    expect(args).not.toContain('--offline=false');
  });
});

function expectCommandSucceeded(result: SpawnSyncReturns<string>, label: string): void {
  expect(
    result.status,
    `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}\n${result.error?.message ?? ''}`,
  ).toBe(0);
}

async function packAndInstall(): Promise<InstalledPackageFixture> {
  const root = await mkdtemp(join(tmpdir(), 'thoth packed install '));
  try {
  const packRoot = join(root, 'packed artifact');
  const installRoot = join(root, 'isolated npm install with spaces');
  const npmHome = join(root, 'npm home');
  const npmConfig = join(root, 'isolated.npmrc');
  const npmGlobalConfig = join(root, 'isolated-global.npmrc');
  await Promise.all([
    mkdir(packRoot, { recursive: true }),
    mkdir(installRoot, { recursive: true }),
    mkdir(npmHome, { recursive: true }),
    writeFile(npmConfig, [
      'ignore-scripts=false',
      'offline=true',
      'audit=false',
      'fund=false',
      'save=false',
      'package-lock=false',
      '',
    ].join('\n'), 'utf8'),
    writeFile(npmGlobalConfig, '', 'utf8'),
  ]);

  const npmEnv = withoutCredentials({
    HOME: npmHome,
    USERPROFILE: npmHome,
    npm_config_userconfig: npmConfig,
    npm_config_globalconfig: npmGlobalConfig,
    npm_config_cache: join(root, 'npm cache'),
    npm_config_offline: 'true',
    XDG_CACHE_HOME: join(root, 'cache'),
    npm_config_ignore_scripts: 'false',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_save: 'false',
    npm_config_package_lock: 'false',
    NODE_PATH: '',
    THOTH_MEM_BIN: '',
  });
  const sourceManifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as {
    packageManager?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  await Promise.all([
    writeFile(join(installRoot, 'package.json'), JSON.stringify({
      name: 'thoth-packed-smoke-host',
      private: true,
      version: '1.0.0',
      ...(sourceManifest.packageManager ? { packageManager: sourceManifest.packageManager } : {}),
      ...(sourceManifest.dependencies ? { dependencies: sourceManifest.dependencies } : {}),
      ...(sourceManifest.devDependencies ? { devDependencies: sourceManifest.devDependencies } : {}),
    }), 'utf8'),
    cp(join(repositoryRoot, 'pnpm-lock.yaml'), join(installRoot, 'pnpm-lock.yaml')),
    cp(join(repositoryRoot, 'pnpm-workspace.yaml'), join(installRoot, 'pnpm-workspace.yaml')),
  ]);

  const packed = runNpm([
    'pack',
    '--ignore-scripts',
    '--offline',
    '--json',
    '--pack-destination',
    packRoot,
  ], { cwd: repositoryRoot, env: npmEnv });
  expectCommandSucceeded(packed, 'script-disabled npm pack');
  const report = JSON.parse(packed.stdout) as Array<{ filename: string }>;
  expect(report).toHaveLength(1);
  const tarball = join(packRoot, report[0]!.filename);

  const installMode: InstalledPackageFixture['installMode'] = 'offline';
  const dependencies = runPnpm(offlineDependencyInstallArguments(), { cwd: installRoot, env: npmEnv });
  expectCommandSucceeded(dependencies, 'isolated frozen offline dependency install');
  const unpackRoot = join(root, 'unpacked tarball');
  await mkdir(unpackRoot, { recursive: true });
  const extracted = run('tar', ['-xzf', tarball, '-C', unpackRoot], { cwd: installRoot, env: npmEnv });
  expectCommandSucceeded(extracted, 'isolated packed tarball extraction');
  const packageRoot = join(installRoot, 'node_modules', 'thoth-mem');
  await cp(join(unpackRoot, 'package'), packageRoot, { recursive: true });
  const entryPath = join(packageRoot, 'dist', 'index.js');
  expect((await stat(entryPath)).isFile()).toBe(true);
  return { root, installRoot, packageRoot, entryPath, npmEnv, installMode };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

function cliEnvironment(
  fixture: InstalledPackageFixture,
  harnessRoot: string,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return withoutCredentials({
    ...fixture.npmEnv,
    HOME: join(harnessRoot, 'home'),
    USERPROFILE: join(harnessRoot, 'home'),
    XDG_CONFIG_HOME: join(harnessRoot, 'xdg config'),
    CODEX_HOME: join(harnessRoot, 'codex home'),
    THOTH_DATA_DIR: join(harnessRoot, 'thoth data'),
    NODE_PATH: '',
    THOTH_MEM_BIN: '',
    ...overrides,
  });
}

function resolvedPathsOverlap(left: string, right: string): boolean {
  const leftPath = resolve(left);
  const rightPath = resolve(right);
  const leftToRight = relative(leftPath, rightPath);
  const rightToLeft = relative(rightPath, leftPath);
  const isContained = (path: string): boolean => (
    path === '' || (!path.startsWith('..') && !isAbsolute(path))
  );
  return isContained(leftToRight) || isContained(rightToLeft);
}

function assertDisposableCodexHome(codexHome: string, activeCodexHome: string): string {
  const activeRealHome = resolve(activeCodexHome);
  if (resolvedPathsOverlap(codexHome, activeRealHome)) {
    throw new Error('Disposable CODEX_HOME overlaps the active real Codex home.');
  }
  return activeRealHome;
}

function runPackedCli(
  fixture: InstalledPackageFixture,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; input?: string },
): CliResult {
  const result = run(process.execPath, [fixture.entryPath, ...args], options);
  let json: Record<string, unknown> | undefined;
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    json = undefined;
  }
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(json ? { json } : {}),
  };
}


function packedNativeSessionStart(harness: 'codex' | 'claude'): Record<string, unknown> {
  const shared = { session_id: 'packed-' + harness + '-session', transcript_path: harness === 'codex' ? null : '/tmp/packed-claude.jsonl', cwd: '/workspace/packed-thoth-mem', hook_event_name: 'SessionStart', source: 'startup' };
  return harness === 'codex' ? { ...shared, model: 'gpt-5.6-codex', permission_mode: 'default' } : shared;
}

function packedNativeCompaction(harness: 'codex' | 'claude'): Record<string, unknown> {
  const shared = { session_id: 'packed-' + harness + '-session', transcript_path: harness === 'codex' ? null : '/tmp/packed-claude.jsonl', cwd: '/workspace/packed-thoth-mem', hook_event_name: 'PreCompact', trigger: 'auto' };
  return harness === 'codex' ? { ...shared, model: 'gpt-5.6-codex', turn_id: 'packed-turn' } : { ...shared, custom_instructions: '' };
}

function packedRuntimeClaim(harness: 'codex' | 'claude', eventMappingId: string, deliveryMappingId: string): Record<string, unknown> {
  const fixtureHarness = harness === 'claude' ? 'claude-code' : harness;
  const evidence = HOST_EVIDENCE.find((entry) => entry.harness === fixtureHarness)!;
  return { payloadMappingId: evidence.payloadMappingId, assetExecutionMarker: evidence.activationMarker, eventMappingId, deliveryChannel: evidence.recovery.channel, deliveryMappingId, behaviorEvidenceMappingId: harness === 'codex' ? 'codex-command-hook-payload-v1' : 'claude-code-command-hook-payload-v1' };
}

async function directoryDigest(root: string): Promise<string> {
  const hash = createHash('sha256');
  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        hash.update('missing');
        return;
      }
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      const relativePath = relative(root, path).replaceAll('\\', '/');
      hash.update(`${entry.isDirectory() ? 'd' : 'f'}:${relativePath}\0`);
      if (entry.isDirectory()) {
        await visit(path);
      } else {
        hash.update(await readFile(path));
      }
    }
  }
  await visit(root);
  return hash.digest('hex');
}

async function assertNoCheckoutReferences(packageRoot: string): Promise<void> {
  const checkoutForms = [repositoryRoot, repositoryRoot.replaceAll('\\', '/')];
  const textExtensions = new Set(['.json', '.mjs', '.js', '.md', '.toml']);
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      const extension = entry.name.slice(entry.name.lastIndexOf('.'));
      if (!textExtensions.has(extension)) {
        continue;
      }
      const content = await readFile(path, 'utf8');
      for (const checkout of checkoutForms) {
        expect(content, `packed file ${relative(packageRoot, path)} references the checkout`)
          .not.toContain(checkout);
      }
    }
  }
  await visit(packageRoot);
}

async function createSourceSetupFixture(
  harness: SetupRequest['harness'] = 'opencode',
): Promise<{
  root: string;
  request: SetupRequest;
  roots: SetupRoots;
  dataDir: string;
  executablePath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), 'thoth metadata source contract '));
  const packageRoot = join(root, 'installed package with spaces');
  const executablePath = join(packageRoot, 'dist', 'index.js');
  const copies = [
    cp(
      join(repositoryRoot, 'integrations', harness),
      join(packageRoot, 'integrations', harness),
      { recursive: true },
    ),
    mkdir(dirname(executablePath), { recursive: true }),
  ];
  if (harness === 'opencode') {
    copies.push(cp(
      join(repositoryRoot, 'integrations', 'shared'),
      join(packageRoot, 'integrations', 'shared'),
      { recursive: true },
    ));
  }
  await Promise.all(copies);
  await writeFile(executablePath, '#!/usr/bin/env node\n', 'utf8');
  return {
    root,
    request: {
      harness,
      scope: 'global',
      planOnly: false,
      force: false,
      json: true,
    },
    roots: {
      homeDir: join(root, 'home'),
      cwd: join(root, 'unrelated cwd'),
      packageRoot,
      xdgConfigHome: join(root, 'xdg config'),
      codexHome: join(root, 'codex home'),
    },
    dataDir: join(root, 'thoth data'),
    executablePath,
  };
}

function legacyCodexExecutor(projectScoped = false): CodexCommandExecutor {
  const success = (stdout: string): CodexCommandResult => ({ exitCode: 0, stdout, stderr: '' });
  return {
    async execute(args): Promise<CodexCommandResult> {
      const command = [...args];
      const key = command.filter((argument, index) => (
        argument !== '--json'
        && argument !== '--project'
        && command[index - 1] !== '--project'
      )).join(' ');
      if (key === '--version') {
        return success('codex-cli 0.144.0');
      }
      if (key === '--help') {
        return success('Usage: codex\nCommands:\n  plugin');
      }
      if (key === 'plugin --help') {
        return success('Usage: codex plugin <COMMAND>\nCommands:\n  list\n  marketplace');
      }
      if (key === 'plugin marketplace --help') {
        return success('Usage: codex plugin marketplace <COMMAND>\nCommands:\n  list\n  add');
      }
      if (key === 'plugin marketplace add --help') {
        return success(`Usage: codex plugin marketplace add [OPTIONS] <SOURCE>${projectScoped
          ? '\nOptions:\n  --project <PATH>'
          : ''}`);
      }
      if (key === 'plugin marketplace list --help') {
        return success(`Usage: codex plugin marketplace list [OPTIONS] [--json]${projectScoped
          ? '\nOptions:\n  --project <PATH>'
          : ''}`);
      }
      if (key === 'plugin list --help') {
        return success(`Usage: codex plugin list [OPTIONS] [--json]${projectScoped
          ? '\nOptions:\n  --project <PATH>'
          : ''}`);
      }
      if (key === 'plugin marketplace list') {
        return success('{"marketplaces":[]}');
      }
      if (key === 'plugin list') {
        return success('{"installed":[],"available":[]}');
      }
      return { exitCode: 64, stdout: '', stderr: 'unexpected controlled command' };
    },
  };
}

interface ControlledModernCodexState {
  marketplace: boolean;
  plugin: boolean;
  mutations: string[];
  projectScoped?: boolean;
}

function controlledModernCodexExecutor(state: ControlledModernCodexState): CodexCommandExecutor {
  const success = (stdout: string): CodexCommandResult => ({ exitCode: 0, stdout, stderr: '' });
  return {
    async execute(args): Promise<CodexCommandResult> {
      const command = [...args];
      const key = command.filter((argument, index) => (
        argument !== '--json'
        && argument !== '--project'
        && command[index - 1] !== '--project'
      )).join(' ');
      const projectOption = state.projectScoped ? '\nOptions:\n  --project <PATH>' : '';
      if (key === '--version') {
        return success('codex-cli 0.144.0');
      }
      if (key === '--help') {
        return success('Usage: codex\nCommands:\n  plugin  Manage plugins');
      }
      if (key === 'plugin --help') {
        return success('Usage: codex plugin <COMMAND>\nCommands:\n  list\n  add\n  marketplace');
      }
      if (key === 'plugin marketplace --help') {
        return success('Usage: codex plugin marketplace <COMMAND>\nCommands:\n  list\n  add');
      }
      if (key === 'plugin marketplace add --help') {
        return success(`Usage: codex plugin marketplace add [OPTIONS] <SOURCE>${projectOption}`);
      }
      if (key === 'plugin marketplace list --help') {
        return success(`Usage: codex plugin marketplace list [OPTIONS] [--json]${projectOption}`);
      }
      if (key === 'plugin add --help') {
        return success(`Usage: codex plugin add [OPTIONS] <PLUGIN>${projectOption}`);
      }
      if (key === 'plugin list --help') {
        return success(`Usage: codex plugin list [OPTIONS] [--json]${projectOption}`);
      }
      if (key === 'plugin marketplace list') {
        return success(JSON.stringify({
          marketplaces: state.marketplace
            ? [{
                name: 'thoth-mem',
                marketplaceSource: {
                  sourceType: 'git',
                  source: 'https://github.com/EremesNG/thoth-mem.git',
                },
              }]
            : [],
        }));
      }
      if (key === 'plugin list') {
        return success(JSON.stringify({
          installed: state.plugin
            ? [{
                pluginId: 'thoth-mem@thoth-mem',
                name: 'thoth-mem',
                marketplaceName: 'thoth-mem',
                installed: true,
                enabled: true,
              }]
            : [],
          available: [],
        }));
      }
      if (key === 'plugin marketplace add EremesNG/thoth-mem') {
        state.mutations.push(key);
        state.marketplace = true;
        return success('registered');
      }
      if (key === 'plugin add thoth-mem') {
        state.mutations.push(key);
        state.plugin = true;
        return success('installed');
      }
      return { exitCode: 64, stdout: '', stderr: 'unexpected controlled command' };
    },
  };
}

async function importRunner(runnerPath: string): Promise<{
  resolveThothMemCommand(options: {
    runnerPath: string;
    env: NodeJS.ProcessEnv;
  }): { command: string; args: string[]; source: string } | undefined;
}> {
  return import(`${pathToFileURL(runnerPath).href}?test=${randomUUID()}`);
}

describe('managed installation metadata source contract', () => {
  it.each(['global', 'project'] as const)(
    'keeps a verified legacy Codex %s install current across executable paths without writes',
    async (scope) => {
    const fixture = await createSourceSetupFixture('codex');
    const projectPath = join(fixture.root, 'legacy project with spaces');
    const request: SetupRequest = {
      ...fixture.request,
      scope,
      ...(scope === 'project' ? { projectPath } : {}),
    };
    const paths = resolveSetupPaths(request, fixture.roots);
    try {
      if (scope === 'project') {
        await mkdir(projectPath, { recursive: true });
      }
      const executor = legacyCodexExecutor(scope === 'project');
      const installed = await inspectAndPlanSetup(request, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: fixture.executablePath,
        codexExecutor: executor,
        transaction: { idFactory: () => 'legacy-first' },
      });
      expect(installed).toMatchObject({ status: 'complete', changed: true });
      const targetBefore = await directoryDigest(paths.targetRoot);
      const receiptsRoot = scope === 'global'
        ? join(fixture.dataDir, 'setup', 'receipts')
        : join(projectPath, '.thoth', 'setup', 'receipts');
      const receiptsBefore = await readdir(receiptsRoot);
      const metadataPath = join(paths.assetPath, CANONICAL_METADATA_NAME);
      const metadataBefore = await readFile(metadataPath, 'utf8');
      const alternateExecutable = join(fixture.root, 'alternate shim', 'thoth-mem.js');
      await mkdir(dirname(alternateExecutable), { recursive: true });
      await writeFile(alternateExecutable, '#!/usr/bin/env node\n', 'utf8');
      const repeatTrace: string[] = [];

      const repeated = await inspectAndPlanSetup(request, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: alternateExecutable,
        codexExecutor: executor,
        transaction: {
          idFactory: () => 'must-not-create',
          trace: ({ kind }) => repeatTrace.push(kind),
        },
      });

      expect(repeated).toMatchObject({ status: 'complete', changed: false, receipt: null });
      expect(repeatTrace).toEqual([]);
      expect(await directoryDigest(paths.targetRoot)).toBe(targetBefore);
      expect(await readFile(metadataPath, 'utf8')).toBe(metadataBefore);
      expect(await readdir(receiptsRoot)).toEqual(receiptsBefore);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it.each(['global', 'project'] as const)(
    'repeats clean modern Codex %s setup without writes and repairs one plugin drift',
    async (scope) => {
      const fixture = await createSourceSetupFixture('codex');
      const projectPath = join(fixture.root, 'modern project with spaces');
      const request: SetupRequest = {
        ...fixture.request,
        scope,
        ...(scope === 'project' ? { projectPath } : {}),
      };
      const paths = resolveSetupPaths(request, fixture.roots);
      const state: ControlledModernCodexState = {
        marketplace: false,
        plugin: false,
        mutations: [],
        projectScoped: scope === 'project',
      };
      const executor = controlledModernCodexExecutor(state);
      try {
        if (scope === 'project') {
          await mkdir(projectPath, { recursive: true });
        }
        const installed = await inspectAndPlanSetup(request, {
          roots: fixture.roots,
          dataDir: fixture.dataDir,
          executablePath: fixture.executablePath,
          codexExecutor: executor,
          transaction: { idFactory: () => `modern-${scope}-first` },
        });
        expect(installed).toMatchObject({ status: 'complete', changed: true });
        expect(state.mutations).toEqual([
          'plugin marketplace add EremesNG/thoth-mem',
          'plugin add thoth-mem',
        ]);

        const before = await directoryDigest(fixture.root);
        const mutationsBefore = [...state.mutations];
        const repeatTrace: string[] = [];
        const repeated = await inspectAndPlanSetup(request, {
          roots: fixture.roots,
          dataDir: fixture.dataDir,
          executablePath: fixture.executablePath,
          codexExecutor: executor,
          transaction: {
            idFactory: () => `modern-${scope}-must-not-create`,
            trace: ({ kind }) => repeatTrace.push(kind),
          },
        });
        expect(repeated).toMatchObject({ status: 'complete', changed: false, receipt: null });
        expect(repeatTrace).toEqual([]);
        expect(state.mutations).toEqual(mutationsBefore);
        expect(await directoryDigest(fixture.root)).toBe(before);
        await expect(stat(paths.assetPath)).rejects.toMatchObject({ code: 'ENOENT' });

        state.plugin = false;
        const drifted = await inspectAndPlanSetup(request, {
          roots: fixture.roots,
          dataDir: fixture.dataDir,
          executablePath: fixture.executablePath,
          codexExecutor: executor,
          transaction: { idFactory: () => `modern-${scope}-plugin-drift` },
        });
        expect(drifted).toMatchObject({ status: 'complete', changed: true });
        expect(state.mutations.slice(mutationsBefore.length)).toEqual(['plugin add thoth-mem']);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );

  it('repeats a migrated dual Codex setup as a modern-only no-op', async () => {
    const fixture = await createSourceSetupFixture('codex');
    const paths = resolveSetupPaths(fixture.request, fixture.roots);
    try {
      const legacy = await inspectAndPlanSetup(fixture.request, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: fixture.executablePath,
        codexExecutor: legacyCodexExecutor(),
        transaction: { idFactory: () => 'migration-legacy-first' },
      });
      expect(legacy).toMatchObject({ status: 'complete', changed: true });

      const state: ControlledModernCodexState = {
        marketplace: true,
        plugin: true,
        mutations: [],
      };
      const executor = controlledModernCodexExecutor(state);
      const migrated = await inspectAndPlanSetup(fixture.request, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: fixture.executablePath,
        codexExecutor: executor,
        transaction: { idFactory: () => 'migration-to-modern' },
      });
      expect(migrated).toMatchObject({ status: 'complete', changed: true });
      await expect(stat(paths.assetPath)).rejects.toMatchObject({ code: 'ENOENT' });
      const configAfterMigration = await readFile(paths.configPath, 'utf8');
      expect(configAfterMigration).not.toContain('thoth-mem managed');

      const before = await directoryDigest(fixture.root);
      const repeatTrace: string[] = [];
      const repeated = await inspectAndPlanSetup(fixture.request, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: fixture.executablePath,
        codexExecutor: executor,
        transaction: {
          idFactory: () => 'migration-must-not-create',
          trace: ({ kind }) => repeatTrace.push(kind),
        },
      });
      expect(repeated).toMatchObject({ status: 'complete', changed: false, receipt: null });
      expect(repeatTrace).toEqual([]);
      expect(state.mutations).toEqual([]);
      expect(await directoryDigest(fixture.root)).toBe(before);
      expect(await readFile(paths.configPath, 'utf8')).toBe(configAfterMigration);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('writes canonical camelCase metadata and treats executable path as diagnostic only', async () => {
    const fixture = await createSourceSetupFixture();
    const paths = resolveSetupPaths(fixture.request, fixture.roots);
    try {
      const installed = await inspectAndPlanSetup(fixture.request, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: fixture.executablePath,
      });
      expect(installed).toMatchObject({ status: 'complete', changed: true });
      const canonicalPath = join(paths.assetPath, CANONICAL_METADATA_NAME);
      const metadata = JSON.parse(await readFile(canonicalPath, 'utf8')) as Record<string, unknown>;
      expect(metadata).toEqual({
        schemaVersion: 1,
        packageVersion: getVersion(),
        executable: fixture.executablePath,
        harness: 'opencode',
        scope: 'global',
        target: paths.targetRoot,
        configPath: paths.configPath,
        assetsPath: paths.assetPath,
        verified: true,
      });
      expect(isAbsolute(metadata.executable as string)).toBe(true);
      await expect(lstat(canonicalPath)).resolves.toMatchObject({});

      const repeated = await inspectAndPlanSetup(fixture.request, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: fixture.executablePath,
      });
      expect(repeated).toMatchObject({ status: 'complete', changed: false });

      const alternateExecutable = join(dirname(fixture.executablePath), 'replacement.js');
      await writeFile(alternateExecutable, '#!/usr/bin/env node\n', 'utf8');
      const stable = await inspectAndPlanSetup({ ...fixture.request, planOnly: true }, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: alternateExecutable,
      });
      expect(stable).toMatchObject({ status: 'complete', changed: false });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('keeps package, topology, packaged content, and owned content drift actionable', async () => {
    const fixture = await createSourceSetupFixture();
    const paths = resolveSetupPaths(fixture.request, fixture.roots);
    try {
      await inspectAndPlanSetup(fixture.request, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: fixture.executablePath,
      });
      const metadataPath = join(paths.assetPath, CANONICAL_METADATA_NAME);
      const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<string, unknown>;
      for (const drift of [
        { ...metadata, packageVersion: '0.0.0-drift' },
        { ...metadata, harness: 'codex' },
        { ...metadata, scope: 'project' },
        { ...metadata, target: join(fixture.root, 'different target') },
        { ...metadata, configPath: join(fixture.root, 'different config') },
        { ...metadata, assetsPath: join(fixture.root, 'different assets') },
      ]) {
        await writeFile(metadataPath, JSON.stringify(drift), 'utf8');
        const blocked = await inspectAndPlanSetup({ ...fixture.request, planOnly: true }, {
          roots: fixture.roots,
          dataDir: fixture.dataDir,
          executablePath: fixture.executablePath,
        });
        expect(blocked.status).toBe('requires_user_action');
      }
      await writeFile(metadataPath, JSON.stringify(metadata), 'utf8');

      const sourcePlugin = join(
        fixture.roots.packageRoot,
        'integrations',
        'opencode',
        'plugin.mjs',
      );
      const installedPlugin = join(paths.assetPath, 'opencode', 'plugin.mjs');
      const sourceBefore = await readFile(sourcePlugin, 'utf8');
      await writeFile(sourcePlugin, 'export default { packageDrift: true };\n', 'utf8');
      const packagedDrift = await inspectAndPlanSetup({ ...fixture.request, planOnly: true }, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: fixture.executablePath,
      });
      expect(packagedDrift.status).toBe('requires_user_action');
      await writeFile(sourcePlugin, sourceBefore, 'utf8');

      await writeFile(installedPlugin, 'export default { installedDrift: true };\n', 'utf8');
      const ownedDrift = await inspectAndPlanSetup({ ...fixture.request, planOnly: true }, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: fixture.executablePath,
      });
      expect(ownedDrift.status).toBe('requires_user_action');
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('recognizes legacy snake_case ownership but plans migration to canonical metadata', async () => {
    const fixture = await createSourceSetupFixture();
    const paths = resolveSetupPaths(fixture.request, fixture.roots);
    try {
      await inspectAndPlanSetup(fixture.request, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: fixture.executablePath,
      });
      const canonicalPath = join(paths.assetPath, CANONICAL_METADATA_NAME);
      const metadata = JSON.parse(await readFile(canonicalPath, 'utf8')) as Record<string, unknown>;
      await writeFile(join(paths.assetPath, LEGACY_METADATA_NAME), JSON.stringify({
        schema_version: metadata.schemaVersion,
        package_version: metadata.packageVersion,
        executable_path: metadata.executable,
        harness: metadata.harness,
        scope: metadata.scope,
        target: metadata.target,
        config_path: metadata.configPath,
        assets_path: metadata.assetsPath,
        verified: metadata.verified,
      }), 'utf8');
      await rm(canonicalPath);

      const alternateExecutable = join(fixture.root, 'alternate legacy shim.js');
      await writeFile(alternateExecutable, '#!/usr/bin/env node\n', 'utf8');

      const plan = await inspectAndPlanSetup({ ...fixture.request, planOnly: true }, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: alternateExecutable,
      });
      expect(plan).toMatchObject({ status: 'complete', changed: false });
      expect(plan.steps.some((step) => step.outcome === 'planned')).toBe(true);
      expect(plan.steps.some((step) => /remove/i.test(step.name))).toBe(false);
      await expect(lstat(join(paths.assetPath, LEGACY_METADATA_NAME))).resolves.toMatchObject({});
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('runner accepts contained canonical/legacy metadata and rejects malformed, relative, linked, or mismatched metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thoth runner metadata trust '));
    const assetRoot = join(root, 'copied installation with spaces');
    const runnerPath = join(assetRoot, 'runners', 'hook-runner.mjs');
    const executablePath = join(root, 'npm install with spaces', 'node_modules', 'thoth-mem', 'dist', 'index.js');
    await Promise.all([
      mkdir(dirname(runnerPath), { recursive: true }),
      mkdir(dirname(executablePath), { recursive: true }),
    ]);
    await cp(join(repositoryRoot, 'integrations', 'shared', 'hook-runner.mjs'), runnerPath);
    await writeFile(executablePath, '#!/usr/bin/env node\n', 'utf8');
    const runner = await importRunner(runnerPath);
    const metadataPath = join(assetRoot, CANONICAL_METADATA_NAME);
    const canonical = {
      schemaVersion: 1,
      packageVersion: getVersion(),
      executable: executablePath,
      harness: 'codex',
      scope: 'global',
      target: join(root, 'codex home'),
      configPath: join(root, 'codex home', 'config.toml'),
      assetsPath: assetRoot,
      verified: true,
    };
    try {
      await writeFile(metadataPath, JSON.stringify(canonical), 'utf8');
      expect(runner.resolveThothMemCommand({ runnerPath, env: { PATH: '', THOTH_MEM_BIN: '' } }))
        .toMatchObject({ source: 'managed', args: [executablePath] });

      for (const invalid of [
        { ...canonical, executable: 'relative/index.js' },
        { ...canonical, packageVersion: '' },
        { ...canonical, assetsPath: join(root, 'different assets') },
        { ...canonical, verified: false },
        { ...canonical, harness: 'unknown' },
      ]) {
        await writeFile(metadataPath, JSON.stringify(invalid), 'utf8');
        expect(runner.resolveThothMemCommand({ runnerPath, env: { PATH: '', THOTH_MEM_BIN: '' } }))
          .toBeUndefined();
      }

      await rm(metadataPath);
      await writeFile(join(assetRoot, LEGACY_METADATA_NAME), JSON.stringify({
        schema_version: 1,
        package_version: getVersion(),
        executable_path: executablePath,
        harness: 'codex',
        scope: 'global',
        target: join(root, 'codex home'),
        config_path: join(root, 'codex home', 'config.toml'),
        assets_path: assetRoot,
        verified: true,
      }), 'utf8');
      expect(runner.resolveThothMemCommand({ runnerPath, env: { PATH: '', THOTH_MEM_BIN: '' } }))
        .toMatchObject({ source: 'managed', args: [executablePath] });

      await rm(join(assetRoot, LEGACY_METADATA_NAME));
      const linkedExecutable = join(root, 'linked executable.js');
      try {
        await symlink(executablePath, linkedExecutable, 'file');
        await writeFile(metadataPath, JSON.stringify({ ...canonical, executable: linkedExecutable }), 'utf8');
        expect(runner.resolveThothMemCommand({ runnerPath, env: { PATH: '', THOTH_MEM_BIN: '' } }))
          .toBeUndefined();
      } catch (error) {
        if (!['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) {
          throw error;
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('controlled Codex launcher advertises and verifies shell-free plugin grammar', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thoth codex native launcher '));
    const binRoot = join(root, 'bin with spaces');
    const cwd = join(root, 'fixture cwd with spaces');
    const statePath = join(root, 'codex-state.json');
    await mkdir(cwd, { recursive: true });
    try {
      const fixture = await writeCodexDiscoveryFixture(
        binRoot,
        cwd,
        codexFixtureSource({ project: true }),
      );
      const env = withoutCredentials({
        PATH: [binRoot, process.env.PATH ?? ''].join(delimiter),
        NODE_OPTIONS: fixture.nodeOptions,
        CODEX_FIXTURE_STATE: statePath,
      });
      const version = run(fixture.command, [...fixture.args, '--version'], { cwd, env });
      expectCommandSucceeded(version, 'controlled Codex version');
      expect(version.stdout.trim()).toBe('codex-cli 0.144.0');
      const rootHelp = run(fixture.command, [...fixture.args, '--help'], { cwd, env });
      expectCommandSucceeded(rootHelp, 'controlled Codex root help');
      expect(rootHelp.stdout).toMatch(/plugin\s+Manage plugins/i);
      const pluginHelp = run(fixture.command, [...fixture.args, 'plugin', '--help'], { cwd, env });
      expectCommandSucceeded(pluginHelp, 'controlled Codex plugin help');
      expect(pluginHelp.stdout).toMatch(/marketplace.*add.*list/is);
      expectCommandSucceeded(run(fixture.command, [...fixture.args,
        'plugin', 'marketplace', 'add', 'EremesNG/thoth-mem',
      ], { cwd, env }), 'controlled Codex marketplace add');
      const listed = run(fixture.command, [
        ...fixture.args,
        'plugin', 'marketplace', 'list',
      ], { cwd, env });
      expectCommandSucceeded(listed, 'controlled Codex marketplace list');
      expect(listed.stdout).toContain('EremesNG/thoth-mem');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

let packedFixture: InstalledPackageFixture | undefined;
let packedFixturePromise: Promise<InstalledPackageFixture> | undefined;

async function getPackedFixture(): Promise<InstalledPackageFixture> {
  packedFixturePromise ??= packAndInstall();
  packedFixture ??= await packedFixturePromise;
  return packedFixture;
}

afterAll(async () => {
  if (packedFixture) {
    await rm(packedFixture.root, { recursive: true, force: true });
  }
});

describe('packed OpenCode installation', () => {
  it('uses a temporary cache and never configures a registry for packed installation', async () => {
    const fixture = await getPackedFixture();

    expect(fixture.npmEnv.npm_config_cache).toBe(join(fixture.root, 'npm cache'));
    expect(fixture.npmEnv.XDG_CACHE_HOME).toBe(join(fixture.root, 'cache'));
    expect(fixture.npmEnv.npm_config_registry).toBeUndefined();
  }, PACKAGE_TIMEOUT_MS);

  it('installs global/project scopes from packed assets with zero-write plan and verified rerun', async () => {
    const fixture = await getPackedFixture();
    expect(fixture.installMode).toBe('offline');
    const root = join(fixture.root, 'OpenCode harness homes with spaces');
    const globalRoot = join(root, 'global fixture');
    const projectRoot = join(root, 'project fixture with spaces');
    const unrelatedCwd = join(root, 'unrelated cwd');
    await Promise.all([
      mkdir(projectRoot, { recursive: true }),
      mkdir(unrelatedCwd, { recursive: true }),
    ]);
    const env = cliEnvironment(fixture, globalRoot);
    const globalConfigRoot = env.XDG_CONFIG_HOME!;

    const beforePlan = await directoryDigest(globalConfigRoot);
    const planned = runPackedCli(fixture, ['setup', 'opencode', '--plan', '--json'], {
      cwd: unrelatedCwd,
      env,
    });
    expect(planned.status, planned.stderr).toBe(0);
    expect(planned.json).toMatchObject({ status: 'complete', changed: false, scope: 'global' });
    expect(await directoryDigest(globalConfigRoot)).toBe(beforePlan);

    const installed = runPackedCli(fixture, ['setup', 'opencode', '--json'], {
      cwd: unrelatedCwd,
      env,
    });
    expect(installed.status, `${installed.stdout}\n${installed.stderr}`).toBe(0);
    expect(installed.json).toMatchObject({ status: 'complete', changed: true, scope: 'global' });
    const globalAssetRoot = join(globalConfigRoot, 'opencode', 'plugins', '.thoth-mem');
    expect(JSON.parse(await readFile(join(globalAssetRoot, CANONICAL_METADATA_NAME), 'utf8')))
      .toMatchObject({ executable: fixture.entryPath, packageVersion: getVersion() });

    const repeated = runPackedCli(fixture, ['setup', 'opencode', '--json'], {
      cwd: unrelatedCwd,
      env,
    });
    expect(repeated.status, repeated.stderr).toBe(0);
    expect(repeated.json).toMatchObject({ status: 'complete', changed: false });

    const globalBeforeProject = await directoryDigest(globalConfigRoot);
    const projectInstalled = runPackedCli(fixture, [
      'setup',
      'opencode',
      '--scope',
      'project',
      '--project',
      projectRoot,
      '--json',
    ], { cwd: unrelatedCwd, env });
    expect(projectInstalled.status, projectInstalled.stderr).toBe(0);
    expect(projectInstalled.json).toMatchObject({ status: 'complete', changed: true, scope: 'project' });
    expect(await directoryDigest(globalConfigRoot)).toBe(globalBeforeProject);
    expect((await stat(join(projectRoot, '.opencode', 'plugins', '.thoth-mem'))).isDirectory()).toBe(true);

    const runnerPath = join(globalAssetRoot, 'shared', 'hook-runner.mjs');
    const runner = run(process.execPath, [runnerPath, '--harness', 'opencode', '--hook', 'SessionStart'], {
      cwd: unrelatedCwd,
      env: { ...env, PATH: '', THOTH_MEM_BIN: '', NODE_PATH: '' },
      input: JSON.stringify({
        protocolVersion: 1,
        harness: 'opencode',
        capabilityEvidence: {
          verifiedEvents: [
            'session.created',
            'chat.message',
            'experimental.chat.system.transform',
            'experimental.session.compacting',
          ],
        },
        event: {
          type: 'session.created',
          event_id: 'packed-opencode-event',
          properties: { info: { id: 'packed-root' } },
        },
        context: { project: 'packed-project', directory: projectRoot },
      }),
    });
    expectCommandSucceeded(runner, 'packed OpenCode runner');
    const runnerResponse = JSON.parse(runner.stdout);
        expect(runnerResponse).toMatchObject({
          protocolVersion: 1,
          harness: 'opencode',
          outcome: 'degraded',
          retryable: false,
        });
        expect(runnerResponse).not.toHaveProperty('intent');
    expect(runner.stdout).not.toMatch(/unable to resolve the thoth-mem executable/i);
    await assertNoCheckoutReferences(fixture.packageRoot);
  }, PACKAGE_TIMEOUT_MS);
});

describe('packed disposable runtime evidence', () => {
  it('executes every packed harness through the real six-tool memory port', async () => {
        const fixture = await getPackedFixture();
        const harnesses = buildDisposableHarnesses('packed-runtime-real-port');
        try {
          for (const harness of harnesses) {
            const env = cliEnvironment(fixture, harness.home.root, { PATH: '', THOTH_MEM_BIN: fixture.entryPath });
            const runtimeHarness = harness.harness === 'claude-code' ? 'claude' : harness.harness;
            const unverified = runPackedCli(fixture, ['integration-event'], {
              cwd: harness.home.root,
              env,
              input: JSON.stringify({ protocolVersion: 1, harness: runtimeHarness, event: { hook: 'SessionStart', payload: { session_id: 'packed-unverified' } } }),
            });
            expect(unverified.status, unverified.stderr).toBe(0);
            expect(unverified.json).toMatchObject({ protocolVersion: 1, harness: runtimeHarness, outcome: 'degraded', retryable: false });
            expect(unverified.json).not.toHaveProperty('hostOutputDirective');

            if (runtimeHarness === 'opencode') {
              const runner = join(fixture.packageRoot, 'integrations', 'shared', 'hook-runner.mjs');
              const start = run(process.execPath, [runner, '--harness', 'opencode', '--hook', 'SessionStart'], {
                cwd: harness.home.root, env,
                input: JSON.stringify({ protocolVersion: 1, operation: 'prepare_delivery', harness: 'opencode', capabilityEvidence: { payloadMappingId: 'opencode-session-payload-v1', assetExecutionMarker: 'opencode-activation-v1', eventMappingId: 'opencode-session-start-v1', deliveryChannel: 'opencode-protocol-output', deliveryMappingId: 'opencode-recovery-injection-v1', behaviorEvidenceMappingId: 'opencode-plugin-init-mutation-v1', mutableOutputChannel: 'system' }, event: { type: 'experimental.chat.system.transform', id: 'packed-opencode-start', sequence: 1, input: { model: { providerID: 'fixture', modelID: 'packed' }, sessionID: 'packed-opencode-session' } }, context: { project: 'packed-project', directory: harness.home.root } }),
              });
              expectCommandSucceeded(start, 'packed OpenCode real memory start');
              expect(JSON.parse(start.stdout)).toMatchObject({ outcome: expect.stringMatching(/^(confirmed|degraded)$/), hostOutputDirective: { purpose: 'recovery_context' }, deliveryState: { memoryConfirmation: 'confirmed', modelConsumption: 'unproven' } });
              const compact = run(process.execPath, [runner, '--harness', 'opencode', '--hook', 'PreCompact'], {
                cwd: harness.home.root, env,
                input: JSON.stringify({ protocolVersion: 1, operation: 'prepare_delivery', harness: 'opencode', capabilityEvidence: { payloadMappingId: 'opencode-session-payload-v1', assetExecutionMarker: 'opencode-activation-v1', eventMappingId: 'opencode-compaction-v1', deliveryChannel: 'opencode-protocol-output', deliveryMappingId: 'opencode-compaction-v1', behaviorEvidenceMappingId: 'opencode-plugin-init-mutation-v1', mutableOutputChannel: 'context' }, event: { type: 'experimental.session.compacting', id: 'packed-opencode-compact', sequence: 2, input: { sessionID: 'packed-opencode-session' } }, context: { project: 'packed-project', directory: harness.home.root } }),
              });
              expectCommandSucceeded(compact, 'packed OpenCode real memory compaction');
              expect(JSON.parse(compact.stdout)).toMatchObject({ outcome: expect.stringMatching(/^(confirmed|degraded)$/), hostOutputDirective: { purpose: 'post_compaction_guidance' }, deliveryState: { memoryConfirmation: 'confirmed', modelConsumption: 'unproven' } });
            } else {
              const nativeHarness = runtimeHarness as 'codex' | 'claude';
              const runner = join(fixture.packageRoot, 'integrations', nativeHarness === 'claude' ? 'claude-code' : 'codex', 'runners', 'hook-runner.mjs');
              const startup = run(process.execPath, [runner, '--harness', nativeHarness, '--hook', 'SessionStart'], { cwd: harness.home.root, env, input: JSON.stringify(packedNativeSessionStart(nativeHarness)) });
                  expectCommandSucceeded(startup, 'packed ' + nativeHarness + ' SessionStart enrollment');
                  expect(JSON.parse(startup.stdout)).toMatchObject({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: expect.any(String) } });
                  const checkpoint = run(process.execPath, [runner, '--harness', nativeHarness, '--hook', 'PreCompact'], { cwd: harness.home.root, env, input: JSON.stringify(packedNativeCompaction(nativeHarness)) });
              expectCommandSucceeded(checkpoint, 'packed ' + nativeHarness + ' PreCompact checkpoint');
              expect(JSON.parse(checkpoint.stdout)).toEqual({});
              const compactStart = run(process.execPath, [runner, '--harness', nativeHarness, '--hook', 'SessionStart'], { cwd: harness.home.root, env, input: JSON.stringify({ ...packedNativeSessionStart(nativeHarness), source: 'compact' }) });
              expectCommandSucceeded(compactStart, 'packed ' + nativeHarness + ' compact SessionStart recovery');
              expect(JSON.parse(compactStart.stdout)).toMatchObject({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: expect.any(String) } });
              expect(JSON.parse(compactStart.stdout)).not.toHaveProperty('modelConsumption');
            }
            await expect(stat(join(env.THOTH_DATA_DIR!, 'thoth.db'))).resolves.toMatchObject({});
          }
          await assertNoCheckoutReferences(fixture.packageRoot);
        } finally {
          for (const harness of harnesses) expect(harness.cleanup()).toBe(true);
        }
      }, PACKAGE_TIMEOUT_MS);
    });
    function packedClaudeManagerSource(): string {
  return String.raw`
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const statePath = process.env.CLAUDE_FIXTURE_STATE;
const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, 'utf8'))
  : { marketplace: false, plugin: false, mutations: [] };
const key = args.filter((argument, index) => argument !== '--json' && argument !== '--scope' && args[index - 1] !== '--scope').join(' ');
const save = () => writeFileSync(statePath, JSON.stringify(state));
const ok = (text) => process.stdout.write(text);
if (process.env.CLAUDE_FIXTURE_UNAVAILABLE === 'true' && key === '--version') { process.exitCode = 1; }
else if (key === '--version') ok('claude-code 1.0.0');
else if (key === 'plugin --help') ok('Commands: marketplace install list uninstall');
else if (key === 'plugin marketplace --help') ok('Commands: add list remove');
else if (key === 'plugin marketplace add --help') ok('Usage: claude plugin marketplace add <SOURCE> --scope <user|project>');
else if (key === 'plugin marketplace list --help') ok('Usage: claude plugin marketplace list --scope <user|project> --json');
else if (key === 'plugin marketplace remove --help') ok('Usage: claude plugin marketplace remove <NAME> --scope <user|project>');
else if (key === 'plugin install --help') ok('Usage: claude plugin install <PLUGIN>@<MARKETPLACE> --scope <user|project>');
else if (key === 'plugin list --help') ok('Usage: claude plugin list --scope <user|project> --json');
else if (key === 'plugin uninstall --help') ok('Usage: claude plugin uninstall <PLUGIN>@<MARKETPLACE> --scope <user|project>');
else if (key === 'plugin marketplace list') ok(JSON.stringify({ marketplaces: state.marketplace ? [{ name: 'thoth-mem', source: 'EremesNG/thoth-mem' }] : [] }));
else if (key === 'plugin list') ok(JSON.stringify({ plugins: state.plugin ? [{ id: 'thoth-mem@thoth-mem', name: 'thoth-mem', marketplace: 'thoth-mem', enabled: true }] : [] }));
else if (key === 'plugin marketplace add EremesNG/thoth-mem') { state.marketplace = true; state.mutations.push(key); save(); }
else if (key === 'plugin install thoth-mem@thoth-mem') { state.plugin = true; state.mutations.push(key); save(); }
else if (key === 'plugin uninstall thoth-mem@thoth-mem') { state.plugin = false; state.mutations.push(key); save(); }
else if (key === 'plugin marketplace remove thoth-mem') { state.marketplace = false; state.mutations.push(key); save(); }
else { process.exitCode = 64; }
`;
}
async function writeNodeCliFixture(
  binRoot: string,
  name: 'codex' | 'claude',
  source: string,
): Promise<{ command: string; args: string[] }> {
  await mkdir(binRoot, { recursive: true });
  const scriptPath = join(binRoot, `${name}-fixture.mjs`);
  await writeFile(scriptPath, source, 'utf8');
  if (process.platform === 'win32') {
    const launcher = join(binRoot, `${name}.cmd`);
    await writeFile(launcher, `@\"${process.execPath}\" \"${scriptPath}\" %*\r\n`, 'utf8');
    return { command: process.execPath, args: [scriptPath] };
  }
  const launcher = join(binRoot, name);
  await writeFile(launcher, `#!/bin/sh\nexec \"${process.execPath}\" \"${scriptPath}\" \"$@\"\n`, 'utf8');
  await chmod(launcher, 0o755);
  return { command: launcher, args: [] };
}

async function writeCodexDiscoveryFixture(
  binRoot: string,
  cwd: string,
  source: string,
): Promise<{ command: string; args: string[]; nodeOptions: string }> {
  await mkdir(cwd, { recursive: true });
  const fixture = await writeNodeCliFixture(binRoot, 'codex', source);
  return {
    ...fixture,
    nodeOptions: '',
  };
}

function codexFixtureSource(options: {
  project: boolean;
  failPlugin?: boolean;
  version?: string;
  advertiseRemove?: boolean;
  collideOnExistingMarketplace?: boolean;
}): string {
  return `
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
const statePath = process.env.CODEX_FIXTURE_STATE;
const logPath = process.env.CODEX_FIXTURE_LOG;
const orphanCheckout = process.env.CODEX_HOME
  ? join(process.env.CODEX_HOME, '.tmp', 'marketplaces', 'thoth-mem')
  : null;
const state = statePath && existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, 'utf8'))
  : { marketplaces: [], plugins: [] };
const projectOption = ${options.project ? "' [--project <PATH>]'" : "''"};
const line = args.join(' ');
if (logPath) appendFileSync(logPath, line + '\\n');
if (line === '--help') console.log('  plugin  Manage plugins');
else if (line === '--version') console.log('codex-cli ${options.version ?? '0.144.0'}');
else if (line === 'plugin --help') console.log('  marketplace  Manage marketplaces\\n  add  Add plugin\\n  list  List plugins');
else if (line === 'plugin marketplace --help') console.log('  add  Add marketplace\\n  list  List marketplaces${options.advertiseRemove ? '\\n  remove  Remove marketplace' : ''}');
else if (line === 'plugin marketplace add --help') console.log('Usage: codex plugin marketplace add <SOURCE>' + projectOption);
else if (line === 'plugin marketplace list --help') console.log('Usage: codex plugin marketplace list [--json]' + projectOption);
${options.advertiseRemove
    ? "else if (line === 'plugin marketplace remove --help') console.log('Usage: codex plugin marketplace remove <NAME> [--json]' + projectOption);"
    : ''}
else if (line === 'plugin add --help') console.log('Usage: codex plugin add <PLUGIN>' + projectOption);
else if (line === 'plugin list --help') console.log('Usage: codex plugin list [--json]' + projectOption);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {
  if (args.includes('--json')) console.log(JSON.stringify({ marketplaces: state.marketplaces.map((source) => ({ name: 'thoth-mem', marketplaceSource: { sourceType: 'git', source } })) }));
  else console.log(state.marketplaces.join('\\n'));
}
else if (args[0] === 'plugin' && args[1] === 'list') {
  if (args.includes('--json')) console.log(JSON.stringify({ installed: state.plugins.map((plugin) => ({ pluginId: plugin + '@thoth-mem', name: plugin, marketplaceName: 'thoth-mem', installed: true, enabled: true })), available: [] }));
  else console.log(state.plugins.join('\\n'));
}
${options.advertiseRemove
    ? `else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'remove') {
  delete state.orphanMarketplace;
  state.marketplaces = [];
  state.plugins = [];
  writeFileSync(statePath, JSON.stringify(state));
  if (orphanCheckout) rmSync(orphanCheckout, { recursive: true, force: true });
  console.log(JSON.stringify({ removed: 'thoth-mem' }));
}`
    : ''}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add') {
  const source = args.at(-1);
  if (${options.collideOnExistingMarketplace === true} && state.orphanMarketplace === true && !state.marketplaces.includes(source)) {
    console.error("marketplace 'thoth-mem' is already added from a different source; remove it before adding this source");
    process.exitCode = 1;
  } else {
    if (!state.marketplaces.includes(source)) state.marketplaces.push(source);
    writeFileSync(statePath, JSON.stringify(state));
  }
} else if (args[0] === 'plugin' && args[1] === 'add') {
  if (${options.collideOnExistingMarketplace === true} && !state.marketplaces.includes('EremesNG/thoth-mem')) {
    console.error('controlled plugin marketplace unavailable');
    process.exitCode = 7;
  } else {
    ${options.failPlugin
      ? "console.error('controlled plugin failure'); process.exitCode = 7;"
      : "const plugin = args.at(-1); if (!state.plugins.includes(plugin)) state.plugins.push(plugin); writeFileSync(statePath, JSON.stringify(state));"}
  }
} else { console.error('unsupported controlled codex args: ' + line); process.exitCode = 2; }
`;
}

function claudeFixtureSource(): string {
  return `
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
const args = process.argv.slice(2);
const configRoot = process.env.CLAUDE_CONFIG_DIR;
const statePath = join(configRoot, 'fixture-state.json');
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add') {
  const marketplaceRoot = resolve(args[3]);
  const marketplace = JSON.parse(readFileSync(join(marketplaceRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  if (marketplace.name !== 'thoth-mem') throw new Error('invalid marketplace identity');
  state.marketplaceRoot = marketplaceRoot;
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state));
} else if (args[0] === 'plugin' && args[1] === 'install') {
  const requested = args[2];
  const marketplace = JSON.parse(readFileSync(join(state.marketplaceRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const plugin = marketplace.plugins.find((candidate) =>
    requested === candidate.name || requested === candidate.name + '@' + marketplace.name
  );
  if (!plugin) throw new Error('requested plugin is not available in the added marketplace');
  const source = resolve(state.marketplaceRoot, plugin.source);
  const manifest = JSON.parse(readFileSync(join(source, '.claude-plugin', 'plugin.json'), 'utf8'));
  if (manifest.name !== 'thoth-mem') throw new Error('invalid plugin identity');
  const target = join(configRoot, 'plugins', 'thoth-mem');
  cpSync(source, target, { recursive: true });
  console.log(target);
} else { console.error('unsupported controlled claude args: ' + args.join(' ')); process.exitCode = 2; }
`;
}

describe('packed Claude Code manager setup', () => {
  it('preserves existing coexistence and rolls back only receipt-owned manager changes in disposable homes', async () => {
    const fixture = await getPackedFixture();
    const scopes = buildClaudeDisposableScopes('packed-claude-manager');
    const scope = scopes.find((candidate) => candidate.scope === 'global')!;
    const binRoot = join(scope.root, 'controlled-bin');
    const statePath = join(scope.root, 'claude-state.json');
    const launcher = await writeNodeCliFixture(binRoot, 'claude', packedClaudeManagerSource());
    const env = cliEnvironment(fixture, scope.root, {
      PATH: [binRoot, process.env.PATH ?? ''].join(delimiter),
      CLAUDE_FIXTURE_STATE: statePath,
    });
    await writeFile(statePath, JSON.stringify({ marketplace: true, plugin: true, mutations: [] }), 'utf8');
    try {
      const coexistenceBefore = await directoryDigest(scope.root);
      const coexistencePlan = runPackedCli(fixture, ['setup', 'claude-code', '--plan', '--json'], { cwd: scope.root, env });
      expect(coexistencePlan.status, coexistencePlan.stderr).toBe(0);
      expect(coexistencePlan.json).toMatchObject({ status: 'complete', changed: false, receipt: null });
      expect(await directoryDigest(scope.root)).toBe(coexistenceBefore);
      expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual({ marketplace: true, plugin: true, mutations: [] });

      const coexistenceApply = runPackedCli(fixture, ['setup', 'claude-code', '--json'], { cwd: scope.root, env });
      expect(coexistenceApply.status, coexistenceApply.stderr).toBe(0);
      expect(coexistenceApply.json).toMatchObject({ status: 'complete', changed: false, receipt: null });
      expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual({ marketplace: true, plugin: true, mutations: [] });

      await writeFile(statePath, JSON.stringify({ marketplace: false, plugin: false, mutations: [] }), 'utf8');
      const settingsPath = join(env.HOME!, '.claude', 'settings.json');
      await mkdir(dirname(settingsPath), { recursive: true });
      await writeFile(settingsPath, JSON.stringify({ mcpServers: { 'thoth-mem': { command: 'manual' } } }), 'utf8');
      const manualBefore = await readFile(settingsPath, 'utf8');
      const manual = runPackedCli(fixture, ['setup', 'claude-code', '--json'], { cwd: scope.root, env });
      expect(manual.status).toBe(3);
      expect(manual.json).toMatchObject({ status: 'requires_user_action', changed: false, receipt: null });
      expect(await readFile(settingsPath, 'utf8')).toBe(manualBefore);
      expect(JSON.parse(await readFile(statePath, 'utf8'))).toMatchObject({ mutations: [] });
      await rm(settingsPath);

      const installed = runPackedCli(fixture, ['setup', 'claude-code', '--json'], { cwd: scope.root, env });
      expect(installed.status, installed.stderr).toBe(0);
      expect(installed.json).toMatchObject({ status: 'complete', changed: true, harness: 'claude-code', receipt: expect.any(String) });
      const receipt = installed.json!.receipt as string;
      await writeFile(settingsPath, JSON.stringify({ laterEdit: true }), 'utf8');
      const rollback = runPackedCli(fixture, ['setup', 'claude-code', '--rollback', receipt, '--json'], { cwd: scope.root, env });
      expect(rollback.status, rollback.stderr).toBe(0);
      expect(rollback.json).toMatchObject({ status: 'complete', changed: true, receipt: null });
      expect(JSON.parse(await readFile(statePath, 'utf8'))).toMatchObject({ marketplace: false, plugin: false, mutations: [
        'plugin marketplace add EremesNG/thoth-mem', 'plugin install thoth-mem@thoth-mem', 'plugin uninstall thoth-mem@thoth-mem', 'plugin marketplace remove thoth-mem',
      ] });
      expect(await readFile(settingsPath, 'utf8')).toContain('laterEdit');
      const locks = await readdir(join(env.THOTH_DATA_DIR!, 'setup', 'locks')).catch(() => [] as string[]);
      expect(locks.filter((name) => name.endsWith('.lock'))).toEqual([]);

      const cacheSentinel = join(env.HOME!, '.claude', 'cache', 'sentinel.txt');
      await mkdir(dirname(cacheSentinel), { recursive: true });
      await writeFile(cacheSentinel, 'preserve-cache', 'utf8');
      const unavailable = runPackedCli(fixture, ['setup', 'claude-code', '--json'], {
        cwd: scope.root,
        env: { ...env, CLAUDE_FIXTURE_UNAVAILABLE: 'true' },
      });
      expect(unavailable.status).toBe(3);
      expect(unavailable.json).toMatchObject({ status: 'requires_user_action', changed: false, receipt: null });
      expect(await readFile(cacheSentinel, 'utf8')).toBe('preserve-cache');
      expect(JSON.parse(await readFile(statePath, 'utf8'))).toMatchObject({ marketplace: false, plugin: false });
      await assertNoCheckoutReferences(fixture.packageRoot);
      expect(launcher.command).toBeDefined();
    } finally {
      for (const disposable of scopes) expect(disposable.cleanup()).toBe(true);
    }
  }, PACKAGE_TIMEOUT_MS);
});
describe('packed Codex and Claude installation', () => {
  it('rejects overlapping simulated Codex homes before any setup side effect', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thoth packed codex overlap guard '));
    try {
      const overlapRoot = join(root, 'simulated overlap');
      const simulatedActiveHome = join(overlapRoot, 'active codex home');
      const outsideRoot = join(root, 'outside sentinel');
      const outsideSentinel = join(outsideRoot, 'sentinel.txt');
      await mkdir(outsideRoot, { recursive: true });
      await writeFile(outsideSentinel, 'guard-unchanged', 'utf8');
      const outsideDigest = await directoryDigest(outsideRoot);
      let controlledCodexInvocations = 0;

      const attemptSetup = async (candidate: string): Promise<void> => {
        assertDisposableCodexHome(candidate, simulatedActiveHome);
        controlledCodexInvocations += 1;
        await mkdir(join(candidate, 'thoth data', 'setup', 'receipts'), { recursive: true });
        await writeFile(outsideSentinel, 'guard-mutated', 'utf8');
      };

      for (const candidate of [
        simulatedActiveHome,
        join(simulatedActiveHome, 'contained disposable home'),
        overlapRoot,
      ]) {
        await expect(attemptSetup(candidate)).rejects.toThrow(
          'Disposable CODEX_HOME overlaps the active real Codex home.',
        );
      }

      expect(controlledCodexInvocations).toBe(0);
      await expect(stat(overlapRoot)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await directoryDigest(outsideRoot)).toBe(outsideDigest);
      expect(await readFile(outsideSentinel, 'utf8')).toBe('guard-unchanged');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('publishes one canonical Codex identity and content graph from the packed artifact', async () => {
    const fixture = await getPackedFixture();
    const packageManifest = JSON.parse(
      await readFile(join(fixture.packageRoot, 'package.json'), 'utf8'),
    ) as Record<string, unknown>;
    const inventory = JSON.parse(
      await readFile(join(fixture.packageRoot, 'integrations', 'inventory.json'), 'utf8'),
    ) as { assets: Array<{ harness: string; role: string; path: string }> };
    const marketplace = JSON.parse(
      await readFile(join(fixture.packageRoot, '.agents', 'plugins', 'marketplace.json'), 'utf8'),
    ) as { name: string; plugins: Array<{ name: string; source: { source: string; path: string } }> };
    const pluginRoot = join(fixture.packageRoot, 'integrations', 'codex');
    const plugin = JSON.parse(
      await readFile(join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'),
    ) as Record<string, unknown>;
    const mcp = JSON.parse(await readFile(join(pluginRoot, '.mcp.json'), 'utf8')) as {
      mcpServers: {
        'thoth-mem': { command: string; args: string[] };
      };
    };
    const hooks = await readFile(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8');
    const runner = await readFile(join(pluginRoot, 'runners', 'hook-runner.mjs'), 'utf8');
    const canonicalRunner = await readFile(
      join(fixture.packageRoot, 'integrations', 'shared', 'hook-runner.mjs'),
      'utf8',
    );
    const skill = await readFile(join(pluginRoot, 'skills', 'thoth-mem', 'SKILL.md'), 'utf8');

    expect(packageManifest).toMatchObject({ name: 'thoth-mem', version: getVersion() });
    expect(marketplace).toEqual(expect.objectContaining({
      name: 'thoth-mem',
      plugins: [expect.objectContaining({
        name: 'thoth-mem',
        source: { source: 'local', path: './integrations/codex' },
      })],
    }));
    expect(plugin).toMatchObject({
      name: 'thoth-mem',
      version: getVersion(),
      skills: './skills/',
      hooks: './hooks/hooks.json',
      mcpServers: './.mcp.json',
    });
    expect(mcp).toEqual({
      mcpServers: {
        'thoth-mem': { command: 'thoth-mem', args: ['mcp', '--no-http'] },
      },
    });
    expect(hooks).toContain('${PLUGIN_ROOT}/runners/hook-runner.mjs');
    expect(runner).toBe(canonicalRunner);
    expect(skill).toMatch(/^---\nname: thoth-mem\n/);
    expect(skill).toContain('mem_recall');
    expect(skill).toContain('mem_session');
    expect(inventory.assets.filter((asset) => asset.harness === 'codex')).toEqual([
      { harness: 'codex', role: 'marketplace', path: '.agents/plugins/marketplace.json' },
      { harness: 'codex', role: 'plugin', path: 'integrations/codex/.codex-plugin/plugin.json' },
      { harness: 'codex', role: 'mcp', path: 'integrations/codex/.mcp.json' },
      { harness: 'codex', role: 'hooks', path: 'integrations/codex/hooks/hooks.json' },
      { harness: 'codex', role: 'runner', path: 'integrations/codex/runners/hook-runner.mjs' },
      { harness: 'codex', role: 'skill', path: 'integrations/codex/skills/thoth-mem/SKILL.md' },
    ]);
    await assertNoCheckoutReferences(fixture.packageRoot);
  }, PACKAGE_TIMEOUT_MS);

  it('derives controlled Codex states without unproven global mutation', async () => {
    const fixture = await getPackedFixture();
    expect(fixture.installMode).toBe('offline');
    const root = join(fixture.root, 'Codex fixtures with spaces');
    const binRoot = join(root, 'controlled bin');
    const unrelatedCwd = join(root, 'unrelated cwd');
    const globalHarness = join(root, 'global harness');
    const projectHarness = join(root, 'project harness');
    const projectPath = join(projectHarness, 'project with spaces');
    const statePath = join(root, 'codex-state.json');
    await Promise.all([mkdir(unrelatedCwd, { recursive: true }), mkdir(projectPath, { recursive: true })]);
    const codexFixture = await writeCodexDiscoveryFixture(
      binRoot,
      unrelatedCwd,
      codexFixtureSource({ project: true }),
    );
    const path = [binRoot, process.env.PATH ?? ''].join(delimiter);
    const globalEnv = cliEnvironment(fixture, globalHarness, {
      PATH: path,
      NODE_OPTIONS: codexFixture.nodeOptions,
      CODEX_FIXTURE_STATE: statePath,
    });
    expect(globalEnv.HOME).toBe(join(globalHarness, 'home'));
    expect(globalEnv.USERPROFILE).toBe(join(globalHarness, 'home'));
    expect(globalEnv.CODEX_HOME).toBe(join(globalHarness, 'codex home'));
    expect(Object.keys(globalEnv).filter((key) => (
      /token|auth|password|secret|credential|api[_-]?key/i.test(key)
    ))).toEqual([]);
    const outsideHome = join(root, 'outside isolated harness homes');
    const outsideSentinel = join(outsideHome, 'sentinel.txt');
    await mkdir(outsideHome, { recursive: true });
    await writeFile(outsideSentinel, 'outside-unchanged', 'utf8');
    const complete = runPackedCli(fixture, ['setup', 'codex', '--json'], { cwd: unrelatedCwd, env: globalEnv });
    expect(complete.status, `${complete.stdout}\n${complete.stderr}`).toBe(0);
    expect(complete.json).toMatchObject({ status: 'complete', scope: 'global' });
    await expect(stat(join(globalEnv.CODEX_HOME!, 'plugins', 'thoth-mem')))
      .rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual({
      marketplaces: ['EremesNG/thoth-mem'],
      plugins: ['thoth-mem'],
    });
    const globalBeforeRepeat = await directoryDigest(globalHarness);
    const globalRepeated = runPackedCli(fixture, ['setup', 'codex', '--json'], {
      cwd: unrelatedCwd,
      env: globalEnv,
    });
    expect(globalRepeated.status, globalRepeated.stderr).toBe(0);
    expect(globalRepeated.json).toMatchObject({
      status: 'complete',
      changed: false,
      receipt: null,
    });
    expect(await directoryDigest(globalHarness)).toBe(globalBeforeRepeat);
    expect(await readFile(outsideSentinel, 'utf8')).toBe('outside-unchanged');

    const projectStatePath = join(root, 'codex-project-state.json');
    const projectEnv = cliEnvironment(fixture, projectHarness, {
      PATH: path,
      NODE_OPTIONS: codexFixture.nodeOptions,
      CODEX_FIXTURE_STATE: projectStatePath,
    });
    const projectGlobalBefore = await directoryDigest(projectEnv.CODEX_HOME!);
    const project = runPackedCli(fixture, [
      'setup', 'codex', '--scope', 'project', '--project', projectPath, '--json',
    ], { cwd: unrelatedCwd, env: projectEnv });
    expect(project.status, `${project.stdout}\n${project.stderr}`).toBe(0);
    expect(project.json).toMatchObject({ status: 'complete', scope: 'project' });
    await expect(stat(join(projectPath, '.codex', 'plugins', 'thoth-mem')))
      .rejects.toMatchObject({ code: 'ENOENT' });
    expect(await directoryDigest(projectEnv.CODEX_HOME!)).toBe(projectGlobalBefore);
    expect(JSON.parse(await readFile(projectStatePath, 'utf8'))).toEqual({
      marketplaces: ['EremesNG/thoth-mem'],
      plugins: ['thoth-mem'],
    });
    const projectBeforeRepeat = await directoryDigest(projectHarness);
    const projectRepeated = runPackedCli(fixture, [
      'setup', 'codex', '--scope', 'project', '--project', projectPath, '--json',
    ], { cwd: unrelatedCwd, env: projectEnv });
    expect(projectRepeated.status, projectRepeated.stderr).toBe(0);
    expect(projectRepeated.json).toMatchObject({
      status: 'complete',
      changed: false,
      receipt: null,
    });
    expect(await directoryDigest(projectHarness)).toBe(projectBeforeRepeat);

    const unsupportedBin = join(root, 'unscoped controlled bin');
    const unsupportedCwd = join(root, 'unscoped fixture cwd');
    const unsupportedFixture = await writeCodexDiscoveryFixture(
      unsupportedBin,
      unsupportedCwd,
      codexFixtureSource({ project: false }),
    );
    const safeGlobal = join(root, 'safe global home');
    const safeEnv = cliEnvironment(fixture, safeGlobal, {
      PATH: [unsupportedBin, process.env.PATH ?? ''].join(delimiter),
      NODE_OPTIONS: unsupportedFixture.nodeOptions,
      CODEX_FIXTURE_STATE: join(root, 'unscoped-state.json'),
    });
    const safeBefore = await directoryDigest(safeEnv.CODEX_HOME!);
    const requiresAction = runPackedCli(fixture, [
      'setup', 'codex', '--scope', 'project', '--project', projectPath, '--json',
    ], { cwd: unsupportedCwd, env: safeEnv });
    expect(requiresAction.status).toBe(3);
    expect(requiresAction.json).toMatchObject({ status: 'requires_user_action', scope: 'project' });
    expect(await directoryDigest(safeEnv.CODEX_HOME!)).toBe(safeBefore);

    const partialBin = join(root, 'partial controlled bin');
    const partialCwd = join(root, 'partial fixture cwd');
    const partialFixture = await writeCodexDiscoveryFixture(
      partialBin,
      partialCwd,
      codexFixtureSource({ project: true, failPlugin: true }),
    );
    const partialEnv = cliEnvironment(fixture, join(root, 'partial harness'), {
      PATH: [partialBin, process.env.PATH ?? ''].join(delimiter),
      NODE_OPTIONS: partialFixture.nodeOptions,
      CODEX_FIXTURE_STATE: join(root, 'partial-state.json'),
    });
    const partial = runPackedCli(fixture, ['setup', 'codex', '--json'], {
      cwd: partialCwd,
      env: partialEnv,
    });
    expect(partial.status).toBe(2);
    expect(partial.json).toMatchObject({ status: 'partial' });
    expect(JSON.stringify(partial.json)).toMatch(/plugin/i);
    await writeCodexDiscoveryFixture(
      partialBin,
      partialCwd,
      codexFixtureSource({ project: true }),
    );
    const recovered = runPackedCli(fixture, ['setup', 'codex', '--json'], {
      cwd: partialCwd,
      env: partialEnv,
    });
    expect(recovered.status, `${recovered.stdout}\n${recovered.stderr}`).toBe(0);
    expect(recovered.json).toMatchObject({ status: 'complete', changed: true });
    expect(JSON.parse(await readFile(partialEnv.CODEX_FIXTURE_STATE!, 'utf8'))).toEqual({
      marketplaces: ['EremesNG/thoth-mem'],
      plugins: ['thoth-mem'],
    });
    const recoveredBeforeRepeat = await directoryDigest(join(root, 'partial harness'));
    const recoveredRepeat = runPackedCli(fixture, ['setup', 'codex', '--json'], {
      cwd: partialCwd,
      env: partialEnv,
    });
    expect(recoveredRepeat.status, recoveredRepeat.stderr).toBe(0);
    expect(recoveredRepeat.json).toMatchObject({
      status: 'complete',
      changed: false,
      receipt: null,
    });
    expect(await directoryDigest(join(root, 'partial harness'))).toBe(recoveredBeforeRepeat);
    await assertNoCheckoutReferences(fixture.packageRoot);
  }, PACKAGE_TIMEOUT_MS);

  it('recovers an orphan Codex marketplace only through an explicit supported remove', async () => {
    const fixture = await getPackedFixture();
    const root = join(fixture.root, 'Packed Codex orphan recovery with spaces');
    const harnessRoot = join(root, 'disposable harness');
    const unrelatedCwd = join(root, 'unrelated cwd');
    const binRoot = join(root, 'controlled bin');
    const codexHome = join(harnessRoot, 'codex home');
    const simulatedActiveCodexHome = join(root, 'simulated active real Codex home');
    const activeRealCodexHome = assertDisposableCodexHome(
      codexHome,
      simulatedActiveCodexHome,
    );
    const statePath = join(codexHome, 'fixture-state.json');
    const logPath = join(codexHome, 'fixture-commands.log');
    const orphanCheckout = join(codexHome, '.tmp', 'marketplaces', 'thoth-mem');
    const orphanSentinel = join(orphanCheckout, 'orphan-sentinel.txt');
    const outsideHome = join(root, 'outside disposable Codex home');
    const outsideSentinel = join(outsideHome, 'sentinel.txt');

    await Promise.all([
      mkdir(codexHome, { recursive: true }),
      mkdir(unrelatedCwd, { recursive: true }),
      mkdir(orphanCheckout, { recursive: true }),
      mkdir(outsideHome, { recursive: true }),
    ]);
    await writeFile(statePath, JSON.stringify({
      orphanMarketplace: true,
      marketplaces: [],
      plugins: [],
    }), 'utf8');
    await writeFile(logPath, '', 'utf8');
    await writeFile(orphanSentinel, 'orphan-checkout-preserved', 'utf8');
    await writeFile(outsideSentinel, 'outside-unchanged', 'utf8');
    const orphanDigest = await directoryDigest(orphanCheckout);
    const outsideDigest = await directoryDigest(outsideHome);

    const codexFixture = await writeCodexDiscoveryFixture(
      binRoot,
      unrelatedCwd,
      codexFixtureSource({
        project: true,
        advertiseRemove: true,
        collideOnExistingMarketplace: true,
      }),
    );
    const environment = cliEnvironment(fixture, harnessRoot, {
      PATH: [binRoot, process.env.PATH ?? ''].join(delimiter),
      NODE_OPTIONS: codexFixture.nodeOptions,
      CODEX_FIXTURE_STATE: statePath,
      CODEX_FIXTURE_LOG: logPath,
    });
    expect(resolve(environment.CODEX_HOME!)).toBe(resolve(codexHome));
    expect(resolvedPathsOverlap(environment.CODEX_HOME!, activeRealCodexHome)).toBe(false);
    expect(resolve(statePath).startsWith(`${resolve(codexHome)}${process.platform === 'win32' ? '\\' : '/'}`))
      .toBe(true);
    expect(Object.keys(environment).filter((key) => (
      /token|auth|password|secret|credential|api[_-]?key/i.test(key)
    ))).toEqual([]);

    const runControlledCodex = (args: string[]): SpawnSyncReturns<string> => run(
      codexFixture.command,
      [...codexFixture.args, ...args],
      { cwd: unrelatedCwd, env: environment },
    );
    const initialMarketplaceList = runControlledCodex([
      'plugin', 'marketplace', 'list', '--json',
    ]);
    const initialPluginList = runControlledCodex(['plugin', 'list', '--json']);
    expectCommandSucceeded(initialMarketplaceList, 'controlled orphan marketplace preflight');
    expectCommandSucceeded(initialPluginList, 'controlled absent plugin preflight');
    expect(JSON.parse(initialMarketplaceList.stdout)).toEqual({ marketplaces: [] });
    expect(JSON.parse(initialPluginList.stdout)).toEqual({ installed: [], available: [] });

    const first = runPackedCli(fixture, ['setup', 'codex', '--json'], {
      cwd: unrelatedCwd,
      env: environment,
    });
    expect(first.status, JSON.stringify(first.json)).toBe(3);
    expect(first.json).toMatchObject({
      status: 'requires_user_action',
      changed: true,
      scope: 'global',
    });
    expect(first.json?.manual_actions).toEqual(expect.arrayContaining([
      'codex plugin marketplace remove thoth-mem --json',
      'Retry the advertised Codex plugin installation, then verify thoth-mem appears in the plugin list.',
    ]));
    expect(first.json?.manual_actions).toHaveLength(2);
    const boundedGuidance = [
      ...((first.json?.diagnostics as string[] | undefined) ?? []),
      ...((first.json?.manual_actions as string[] | undefined) ?? []),
    ];
    expect(boundedGuidance.length).toBeGreaterThan(0);
    expect(boundedGuidance.every((message) => message.length <= 512)).toBe(true);
    expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual({
      orphanMarketplace: true,
      marketplaces: [],
      plugins: [],
    });
    expect(await directoryDigest(orphanCheckout)).toBe(orphanDigest);
    expect(await readFile(orphanSentinel, 'utf8')).toBe('orphan-checkout-preserved');
    const firstRunCommands = (await readFile(logPath, 'utf8')).trim().split(/\r?\n/);
    expect(firstRunCommands).toContain('plugin marketplace remove --help');
    expect(firstRunCommands).not.toContain('plugin marketplace remove thoth-mem --json');

    const removed = runControlledCodex([
      'plugin', 'marketplace', 'remove', 'thoth-mem', '--json',
    ]);
    expectCommandSucceeded(removed, 'explicit controlled Codex marketplace removal');
    expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual({
      marketplaces: [],
      plugins: [],
    });
    await expect(stat(orphanCheckout)).rejects.toMatchObject({ code: 'ENOENT' });
    const absentMarketplaceList = runControlledCodex([
      'plugin', 'marketplace', 'list', '--json',
    ]);
    const absentPluginList = runControlledCodex(['plugin', 'list', '--json']);
    expectCommandSucceeded(absentMarketplaceList, 'controlled marketplace absence check');
    expectCommandSucceeded(absentPluginList, 'controlled plugin absence check');
    expect(JSON.parse(absentMarketplaceList.stdout)).toEqual({ marketplaces: [] });
    expect(JSON.parse(absentPluginList.stdout)).toEqual({ installed: [], available: [] });

    const retryLogOffset = (await readFile(logPath, 'utf8')).trim().split(/\r?\n/).length;
    const recovered = runPackedCli(fixture, ['setup', 'codex', '--json'], {
      cwd: unrelatedCwd,
      env: environment,
    });
    expect(recovered.status, `${recovered.stdout}\n${recovered.stderr}`).toBe(0);
    expect(recovered.json).toMatchObject({ status: 'complete', scope: 'global' });
    expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual({
      marketplaces: ['EremesNG/thoth-mem'],
      plugins: ['thoth-mem'],
    });
    await expect(stat(orphanCheckout)).rejects.toMatchObject({ code: 'ENOENT' });

    const allCommands = (await readFile(logPath, 'utf8')).trim().split(/\r?\n/);
    expect(allCommands.filter((command) => (
      command === 'plugin marketplace remove thoth-mem --json'
    ))).toHaveLength(1);
    const retryCommands = allCommands.slice(retryLogOffset);
    const retryMarketplaceList = retryCommands.indexOf('plugin marketplace list --json');
    const retryMarketplaceAdd = retryCommands.indexOf(
      'plugin marketplace add EremesNG/thoth-mem',
    );
    expect(retryCommands).toContain('--version');
    expect(retryCommands).toContain('plugin list --json');
    expect(retryMarketplaceList).toBeGreaterThanOrEqual(0);
    expect(retryMarketplaceAdd).toBeGreaterThan(retryMarketplaceList);
    expect(allCommands.join('\n')).not.toContain(activeRealCodexHome);
    expect(await directoryDigest(outsideHome)).toBe(outsideDigest);
    expect(await readFile(outsideSentinel, 'utf8')).toBe('outside-unchanged');
    await assertNoCheckoutReferences(fixture.packageRoot);
  }, PACKAGE_TIMEOUT_MS);

  it('executes packed legacy identity, dual migration, ambiguity, and executable variation safely', async () => {
    const fixture = await getPackedFixture();
    const root = join(fixture.root, 'Packed Codex ownership routes with spaces');
    const binRoot = join(root, 'controlled bin');
    const unrelatedCwd = join(root, 'unrelated cwd');
    const legacyHarness = join(root, 'legacy harness');
    const statePath = join(root, 'legacy-manager-state.json');
    await mkdir(unrelatedCwd, { recursive: true });
    await writeCodexDiscoveryFixture(
      binRoot,
      unrelatedCwd,
      codexFixtureSource({ project: true, version: '0.145.0' }),
    );
    const env = cliEnvironment(fixture, legacyHarness, {
      PATH: [binRoot, process.env.PATH ?? ''].join(delimiter),
      CODEX_FIXTURE_STATE: statePath,
    });
    const assetRoot = join(env.CODEX_HOME!, 'plugins', 'thoth-mem');
    const configPath = join(env.CODEX_HOME!, 'config.toml');

    const legacy = runPackedCli(fixture, ['setup', 'codex', '--json'], {
      cwd: unrelatedCwd,
      env,
    });
    expect(legacy.status, `${legacy.stdout}\n${legacy.stderr}`).toBe(0);
    expect(legacy.json).toMatchObject({ status: 'complete', changed: true, scope: 'global' });
    const metadataPath = join(assetRoot, CANONICAL_METADATA_NAME);
    expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toMatchObject({
      packageVersion: getVersion(),
      executable: fixture.entryPath,
      harness: 'codex',
      scope: 'global',
    });
    for (const relativeAsset of [
      '.codex-plugin/plugin.json',
      '.mcp.json',
      'hooks/hooks.json',
      'runners/hook-runner.mjs',
      'skills/thoth-mem/SKILL.md',
    ]) {
      expect(await readFile(join(assetRoot, relativeAsset), 'utf8')).toBe(
        await readFile(join(fixture.packageRoot, 'integrations', 'codex', relativeAsset), 'utf8'),
      );
    }

    const alternatePackageRoot = join(
      fixture.installRoot,
      'node_modules',
      'thoth-mem-alternate-executable',
    );
    await cp(fixture.packageRoot, alternatePackageRoot, { recursive: true });
    const alternateFixture: InstalledPackageFixture = {
      ...fixture,
      packageRoot: alternatePackageRoot,
      entryPath: join(alternatePackageRoot, 'dist', 'index.js'),
    };
    const metadataBefore = await readFile(metadataPath, 'utf8');
    const legacyBeforeRepeat = await directoryDigest(legacyHarness);
    const repeatedLegacy = runPackedCli(alternateFixture, ['setup', 'codex', '--json'], {
      cwd: unrelatedCwd,
      env,
    });
    expect(repeatedLegacy.status, `${repeatedLegacy.stdout}\n${repeatedLegacy.stderr}`).toBe(0);
    expect(repeatedLegacy.json).toMatchObject({
      status: 'complete',
      changed: false,
      receipt: null,
    });
    expect(await directoryDigest(legacyHarness)).toBe(legacyBeforeRepeat);
    expect(await readFile(metadataPath, 'utf8')).toBe(metadataBefore);

    await writeCodexDiscoveryFixture(
      binRoot,
      unrelatedCwd,
      codexFixtureSource({ project: true }),
    );
    await writeFile(statePath, JSON.stringify({
      marketplaces: ['https://github.com/EremesNG/thoth-mem.git'],
      plugins: ['thoth-mem'],
    }), 'utf8');
    const migrated = runPackedCli(fixture, ['setup', 'codex', '--json'], {
      cwd: unrelatedCwd,
      env,
    });
    expect(migrated.status, `${migrated.stdout}\n${migrated.stderr}`).toBe(0);
    expect(migrated.json).toMatchObject({ status: 'complete', changed: true });
    await expect(stat(assetRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(configPath, 'utf8')).not.toContain('thoth-mem managed');
    const migratedBeforeRepeat = await directoryDigest(legacyHarness);
    const repeatedMigration = runPackedCli(fixture, ['setup', 'codex', '--json'], {
      cwd: unrelatedCwd,
      env,
    });
    expect(repeatedMigration.status, repeatedMigration.stderr).toBe(0);
    expect(repeatedMigration.json).toMatchObject({
      status: 'complete',
      changed: false,
      receipt: null,
    });
    expect(await directoryDigest(legacyHarness)).toBe(migratedBeforeRepeat);

    const ambiguousBin = join(root, 'ambiguous controlled bin');
    const ambiguousCwd = join(root, 'ambiguous cwd');
    const ambiguousHarness = join(root, 'ambiguous harness');
    const ambiguousState = join(root, 'ambiguous-state.json');
    await mkdir(ambiguousCwd, { recursive: true });
    await writeCodexDiscoveryFixture(
      ambiguousBin,
      ambiguousCwd,
      codexFixtureSource({ project: true, version: '0.145.0' }),
    );
    const ambiguousEnv = cliEnvironment(fixture, ambiguousHarness, {
      PATH: [ambiguousBin, process.env.PATH ?? ''].join(delimiter),
      CODEX_FIXTURE_STATE: ambiguousState,
    });
    const ambiguousLegacy = runPackedCli(fixture, ['setup', 'codex', '--json'], {
      cwd: ambiguousCwd,
      env: ambiguousEnv,
    });
    expect(ambiguousLegacy.status, ambiguousLegacy.stderr).toBe(0);
    const ambiguousAssetRoot = join(ambiguousEnv.CODEX_HOME!, 'plugins', 'thoth-mem');
    const ambiguousMcp = join(ambiguousAssetRoot, '.mcp.json');
    await writeFile(ambiguousMcp, '{"drifted":true}\n', 'utf8');
    await writeCodexDiscoveryFixture(
      ambiguousBin,
      ambiguousCwd,
      codexFixtureSource({ project: true }),
    );
    await writeFile(ambiguousState, JSON.stringify({
      marketplaces: ['https://github.com/EremesNG/thoth-mem.git'],
      plugins: ['thoth-mem'],
    }), 'utf8');
    const ambiguousBefore = await directoryDigest(ambiguousHarness);
    for (const args of [
      ['setup', 'codex', '--json'],
      ['setup', 'codex', '--force', '--json'],
    ]) {
      const blocked = runPackedCli(fixture, args, { cwd: ambiguousCwd, env: ambiguousEnv });
      expect(blocked.status).toBe(3);
      expect(blocked.json).toMatchObject({
        status: 'requires_user_action',
        changed: false,
        receipt: null,
      });
      expect(await directoryDigest(ambiguousHarness)).toBe(ambiguousBefore);
    }
    await assertNoCheckoutReferences(fixture.packageRoot);
  }, PACKAGE_TIMEOUT_MS);

  it('validates and installs the accepted unqualified Claude plugin from the packed local marketplace', async () => {
    const fixture = await getPackedFixture();
    expect(fixture.installMode).toBe('offline');
    const root = join(fixture.root, 'Claude fixture with spaces');
    const binRoot = join(root, 'controlled bin');
    const configRoot = join(root, 'claude config');
    const unrelatedCwd = join(root, 'unrelated cwd');
    await Promise.all([mkdir(configRoot, { recursive: true }), mkdir(unrelatedCwd, { recursive: true })]);
    const launcher = await writeNodeCliFixture(binRoot, 'claude', claudeFixtureSource());
    const env = withoutCredentials({
      ...fixture.npmEnv,
      CLAUDE_CONFIG_DIR: configRoot,
      HOME: join(root, 'home'),
      USERPROFILE: join(root, 'home'),
      NODE_PATH: '',
      THOTH_MEM_BIN: '',
    });
    const marketplace = run(launcher.command, [
      ...launcher.args,
      'plugin',
      'marketplace',
      'add',
      fixture.packageRoot,
    ], {
      cwd: unrelatedCwd,
      env,
    });
    expectCommandSucceeded(marketplace, 'controlled Claude marketplace add');
    const installed = run(launcher.command, [
      ...launcher.args,
      'plugin',
      'install',
      'thoth-mem',
    ], {
      cwd: unrelatedCwd,
      env,
    });
    expectCommandSucceeded(installed, 'controlled accepted unqualified Claude plugin install');
    const pluginRoot = join(configRoot, 'plugins', 'thoth-mem');
    const plugin = JSON.parse(await readFile(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
    expect(plugin).toMatchObject({ name: 'thoth-mem', version: getVersion() });
    expect((await stat(join(pluginRoot, 'hooks', 'hooks.json'))).isFile()).toBe(true);
    expect((await stat(join(pluginRoot, 'runners', 'hook-runner.mjs'))).isFile()).toBe(true);

    await writeFile(join(pluginRoot, CANONICAL_METADATA_NAME), JSON.stringify({
      schemaVersion: 1,
      packageVersion: getVersion(),
      executable: fixture.entryPath,
      harness: 'claude',
      scope: 'global',
      target: configRoot,
      configPath: join(pluginRoot, '.mcp.json'),
      assetsPath: pluginRoot,
      verified: true,
    }), { encoding: 'utf8', mode: 0o600 });
    const runner = run(process.execPath, [
      join(pluginRoot, 'runners', 'hook-runner.mjs'),
      '--harness', 'claude', '--hook', 'SessionStart',
    ], {
      cwd: unrelatedCwd,
      env: { ...env, PATH: '', THOTH_MEM_BIN: '', NODE_PATH: '' },
      input: JSON.stringify({ session_id: 'packed-claude-root', project: unrelatedCwd }),
    });
    expectCommandSucceeded(runner, 'packed Claude runner');
    const runnerResponse = JSON.parse(runner.stdout);
        expect(runnerResponse).toEqual({});
        expect(runnerResponse).not.toHaveProperty('intent');
    expect(runner.stdout).not.toMatch(/unable to resolve the thoth-mem executable/i);
    expect(isAbsolute(fixture.packageRoot)).toBe(true);
    expect(relative(fixture.packageRoot, pluginRoot).startsWith('..')).toBe(true);
    await assertNoCheckoutReferences(fixture.packageRoot);
  }, PACKAGE_TIMEOUT_MS);
});
