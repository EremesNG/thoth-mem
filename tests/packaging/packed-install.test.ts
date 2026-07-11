import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  chmod,
  cp,
  lstat,
  link,
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

import { inspectAndPlanSetup } from '../../src/setup/engine.js';
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
  installMode: 'offline' | 'public-registry-fallback';
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

function isOfflineCacheMiss(diagnostic: string): boolean {
  return /(?:^|[^A-Za-z0-9_])(?:ENOTCACHED|ERR_PNPM_NO_OFFLINE_(?:TARBALL|META))(?=$|[^A-Za-z0-9_])/
    .test(diagnostic);
}

function pnpmInstallAttempts(tarball: string): {
  offline: string[];
  publicRegistryFallback: string[];
} {
  const installArgs = [
    'add',
    tarball,
    '--ignore-scripts',
    '--save-exact',
    '--registry',
    'https://registry.npmjs.org/',
  ];
  return {
    offline: [...installArgs, '--offline'],
    publicRegistryFallback: [...installArgs, '--offline=false'],
  };
}

describe('packed install retry policy', () => {
  it.each([
    ['npm cache miss', 'ENOTCACHED', true],
    ['npm cache miss in an error line', 'npm ERR! code ENOTCACHED\n', true],
    ['pnpm tarball cache miss', 'ERR_PNPM_NO_OFFLINE_TARBALL', true],
    ['pnpm tarball cache miss with punctuation', 'ERR_PNPM_NO_OFFLINE_TARBALL: missing tarball', true],
    ['pnpm metadata cache miss', 'ERR_PNPM_NO_OFFLINE_META', true],
    ['pnpm metadata cache miss with whitespace', '  ERR_PNPM_NO_OFFLINE_META  ', true],
    ['prefixed npm cache-miss lookalike', 'XENOTCACHED', false],
    ['suffixed npm cache-miss lookalike', 'ENOTCACHED_EXTRA', false],
    ['prefixed pnpm tarball lookalike', 'XERR_PNPM_NO_OFFLINE_TARBALL', false],
    ['suffixed pnpm metadata lookalike', 'ERR_PNPM_NO_OFFLINE_META_EXTRA', false],
    ['unrelated pnpm failure', 'ERR_PNPM_FETCH_500', false],
  ])('classifies %s', (_label, diagnostic, shouldRetry) => {
    expect(isOfflineCacheMiss(diagnostic)).toBe(shouldRetry);
  });

  it('keeps the initial attempt offline and the public-registry fallback online', () => {
    const attempts = pnpmInstallAttempts('package.tgz');

    expect(attempts.offline).toContain('--offline');
    expect(attempts.offline).not.toContain('--offline=false');
    expect(attempts.publicRegistryFallback).toContain('--offline=false');
    expect(attempts.publicRegistryFallback).not.toContain('--offline');
    expect(attempts.publicRegistryFallback).toContain('https://registry.npmjs.org/');
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
      'ignore-scripts=true',
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
    npm_config_cache: join(homedir(), '.npm'),
    npm_config_ignore_scripts: 'true',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_save: 'false',
    npm_config_package_lock: 'false',
    npm_config_registry: 'https://registry.npmjs.org/',
    NODE_PATH: '',
    THOTH_MEM_BIN: '',
  });
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

  await writeFile(join(installRoot, 'package.json'), JSON.stringify({
    name: 'thoth-packed-smoke-host',
    private: true,
    version: '1.0.0',
  }), 'utf8');
  const installAttempts = pnpmInstallAttempts(tarball);
  let installMode: InstalledPackageFixture['installMode'] = 'offline';
  let installed = runPnpm(installAttempts.offline, { cwd: installRoot, env: npmEnv });
  const installDiagnostic = `${installed.stdout ?? ''}\n${installed.stderr ?? ''}`;
  if (
    installed.status !== 0
    && isOfflineCacheMiss(installDiagnostic)
  ) {
    installMode = 'public-registry-fallback';
    installed = runPnpm(installAttempts.publicRegistryFallback, { cwd: installRoot, env: npmEnv });
  }
  expectCommandSucceeded(installed, 'script-disabled isolated pnpm tarball install');

  const packageRoot = join(installRoot, 'node_modules', 'thoth-mem');
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

function runPackedCli(
  fixture: InstalledPackageFixture,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
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

async function createSourceSetupFixture(): Promise<{
  root: string;
  request: SetupRequest;
  roots: SetupRoots;
  dataDir: string;
  executablePath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), 'thoth metadata source contract '));
  const packageRoot = join(root, 'installed package with spaces');
  const executablePath = join(packageRoot, 'dist', 'index.js');
  await Promise.all([
    cp(join(repositoryRoot, 'integrations', 'opencode'), join(packageRoot, 'integrations', 'opencode'), { recursive: true }),
    cp(join(repositoryRoot, 'integrations', 'shared'), join(packageRoot, 'integrations', 'shared'), { recursive: true }),
    mkdir(dirname(executablePath), { recursive: true }),
  ]);
  await writeFile(executablePath, '#!/usr/bin/env node\n', 'utf8');
  return {
    root,
    request: {
      harness: 'opencode',
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
    },
    dataDir: join(root, 'thoth data'),
    executablePath,
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
  it('writes canonical camelCase metadata and treats package/executable drift as unverified', async () => {
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

      const staleExecutable = join(dirname(fixture.executablePath), 'replacement.js');
      await writeFile(staleExecutable, '#!/usr/bin/env node\n', 'utf8');
      const stale = await inspectAndPlanSetup({ ...fixture.request, planOnly: true }, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: staleExecutable,
      });
      expect(stale.status).toBe('requires_user_action');
      expect(stale.diagnostics.join('\n')).toMatch(/metadata|executable|verified/i);
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

      const plan = await inspectAndPlanSetup({ ...fixture.request, planOnly: true }, {
        roots: fixture.roots,
        dataDir: fixture.dataDir,
        executablePath: fixture.executablePath,
      });
      expect(plan).toMatchObject({ status: 'complete', changed: false });
      expect(plan.steps.some((step) => step.outcome === 'planned')).toBe(true);
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
      const rootHelp = run(fixture.command, ['--help'], { cwd, env });
      expectCommandSucceeded(rootHelp, 'controlled Codex root help');
      expect(rootHelp.stdout).toMatch(/plugin\s+Manage plugins/i);
      const pluginHelp = run(fixture.command, ['plugin', '--help'], { cwd, env });
      expectCommandSucceeded(pluginHelp, 'controlled Codex plugin help');
      expect(pluginHelp.stdout).toMatch(/marketplace.*add.*list/is);
      expectCommandSucceeded(run(fixture.command, [
        'plugin', 'marketplace', 'add', 'EremesNG/thoth-mem',
      ], { cwd, env }), 'controlled Codex marketplace add');
      const listed = run(fixture.command, ['plugin', 'marketplace', 'list'], { cwd, env });
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
  it('installs global/project scopes from packed assets with zero-write plan and verified rerun', async () => {
    const fixture = await getPackedFixture();
    expect(['offline', 'public-registry-fallback']).toContain(fixture.installMode);
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
    expect(JSON.parse(runner.stdout)).toMatchObject({
      protocolVersion: 1,
      harness: 'opencode',
      intent: 'enroll_session',
      outcome: expect.stringMatching(/^(confirmed|failed|degraded|no_op)$/),
    });
    expect(runner.stdout).not.toMatch(/unable to resolve the thoth-mem executable/i);
    await assertNoCheckoutReferences(fixture.packageRoot);
  }, PACKAGE_TIMEOUT_MS);
});

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
): Promise<{ command: string; nodeOptions: string }> {
  await Promise.all([mkdir(binRoot, { recursive: true }), mkdir(cwd, { recursive: true })]);
  const command = join(binRoot, process.platform === 'win32' ? 'codex.exe' : 'codex');
  try {
    await link(process.execPath, command);
  } catch {
    await cp(process.execPath, command);
  }
  await chmod(command, 0o755);
  await writeFile(join(cwd, 'plugin'), source, 'utf8');
  const preloadPath = join(cwd, 'codex-preload.cjs');
  await writeFile(preloadPath, `
const { basename } = require('node:path');
const executable = basename(process.argv0).toLowerCase();
if (executable === 'codex' || executable === 'codex.exe') {
  if (process.execArgv.includes('--help') && process.argv.length === 1) {
    process.stdout.write('  plugin  Manage plugins\\n');
    process.exit(0);
  }
}
`, 'utf8');
  return {
    command,
    nodeOptions: `--require=\"${preloadPath.replaceAll('\\', '/')}\"`,
  };
}

function codexFixtureSource(options: { project: boolean; failPlugin?: boolean }): string {
  return `
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const args = ['plugin', ...process.argv.slice(2)];
const statePath = process.env.CODEX_FIXTURE_STATE;
const state = statePath && existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, 'utf8'))
  : { marketplaces: [], plugins: [] };
const projectOption = ${options.project ? "' [--project <PATH>]'" : "''"};
const line = args.join(' ');
if (line === '--help') console.log('  plugin  Manage plugins');
else if (line === 'plugin --help') console.log('  marketplace  Manage marketplaces\\n  add  Add plugin\\n  list  List plugins');
else if (line === 'plugin marketplace --help') console.log('  add  Add marketplace\\n  list  List marketplaces');
else if (line === 'plugin marketplace add --help') console.log('Usage: codex plugin marketplace add <SOURCE>' + projectOption);
else if (line === 'plugin marketplace list --help') console.log('Usage: codex plugin marketplace list' + projectOption);
else if (line === 'plugin add --help') console.log('Usage: codex plugin add <PLUGIN>' + projectOption);
else if (line === 'plugin list --help') console.log('Usage: codex plugin list' + projectOption);
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') console.log(state.marketplaces.join('\\n'));
else if (args[0] === 'plugin' && args[1] === 'list') console.log(state.plugins.join('\\n'));
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add') {
  const source = args.at(-1);
  if (!state.marketplaces.includes(source)) state.marketplaces.push(source);
  writeFileSync(statePath, JSON.stringify(state));
} else if (args[0] === 'plugin' && args[1] === 'add') {
  ${options.failPlugin
    ? "console.error('controlled plugin failure'); process.exitCode = 7;"
    : "const plugin = args.at(-1); if (!state.plugins.includes(plugin)) state.plugins.push(plugin); writeFileSync(statePath, JSON.stringify(state));"}
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

describe('packed Codex and Claude installation', () => {
  it('derives controlled Codex states without unproven global mutation', async () => {
    const fixture = await getPackedFixture();
    expect(['offline', 'public-registry-fallback']).toContain(fixture.installMode);
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
    const complete = runPackedCli(fixture, ['setup', 'codex', '--json'], { cwd: unrelatedCwd, env: globalEnv });
    expect(complete.status, `${complete.stdout}\n${complete.stderr}`).toBe(0);
    expect(complete.json).toMatchObject({ status: 'complete', scope: 'global' });
    expect((await stat(join(globalEnv.CODEX_HOME!, 'plugins', 'thoth-mem'))).isDirectory()).toBe(true);

    const projectEnv = cliEnvironment(fixture, projectHarness, {
      PATH: path,
      NODE_OPTIONS: codexFixture.nodeOptions,
      CODEX_FIXTURE_STATE: statePath,
    });
    const projectGlobalBefore = await directoryDigest(projectEnv.CODEX_HOME!);
    const project = runPackedCli(fixture, [
      'setup', 'codex', '--scope', 'project', '--project', projectPath, '--json',
    ], { cwd: unrelatedCwd, env: projectEnv });
    expect(project.status, `${project.stdout}\n${project.stderr}`).toBe(0);
    expect(project.json).toMatchObject({ status: 'complete', scope: 'project' });
    expect((await stat(join(projectPath, '.codex', 'plugins', 'thoth-mem'))).isDirectory()).toBe(true);
    expect(await directoryDigest(projectEnv.CODEX_HOME!)).toBe(projectGlobalBefore);

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
    await assertNoCheckoutReferences(fixture.packageRoot);
  }, PACKAGE_TIMEOUT_MS);

  it('validates and installs the accepted unqualified Claude plugin from the packed local marketplace', async () => {
    const fixture = await getPackedFixture();
    expect(['offline', 'public-registry-fallback']).toContain(fixture.installMode);
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
    expect(JSON.parse(runner.stdout)).toMatchObject({
      protocolVersion: 1,
      harness: 'claude',
      intent: 'enroll_session',
      outcome: expect.stringMatching(/^(confirmed|failed|degraded|no_op)$/),
    });
    expect(runner.stdout).not.toMatch(/unable to resolve the thoth-mem executable/i);
    expect(isAbsolute(fixture.packageRoot)).toBe(true);
    expect(relative(fixture.packageRoot, pluginRoot).startsWith('..')).toBe(true);
    await assertNoCheckoutReferences(fixture.packageRoot);
  }, PACKAGE_TIMEOUT_MS);
});
