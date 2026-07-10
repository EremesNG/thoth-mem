import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  formatSetupResult,
  parseSetupRequest,
} from '../../src/cli.js';
import {
  getSetupExitCode,
  type SetupRequest,
  type SetupResult,
  type SetupStatus,
} from '../../src/setup/types.js';
import {
  inspectAndPlanSetup,
  SETUP_MANAGED_METADATA_VERSION,
  type CodexRegistrationEvidence,
  type SetupFileSystem,
} from '../../src/setup/engine.js';
import {
  resolveSetupPaths,
  type SetupPaths,
  type SetupRoots,
} from '../../src/setup/paths.js';
import { planOpenCodeManagedConfig } from '../../src/setup/harnesses/opencode.js';
import { getVersion } from '../../src/version.js';
import {
  CODEX_MANAGED_BLOCK_END,
  CODEX_MANAGED_BLOCK_START,
  planCodexManagedConfig,
} from '../../src/setup/harnesses/codex.js';
import {
  applyAtomicFilesystemChanges,
  type FilesystemDirectoryEntry,
  type FilesystemFaultPoint,
} from '../../src/setup/filesystem.js';

const RESULT_BY_STATUS: Record<SetupStatus, SetupResult> = {
  complete: {
    status: 'complete',
    changed: false,
    harness: 'opencode',
    scope: 'global',
    target: 'C:\\Users\\Example User\\.config\\opencode',
    steps: [{ name: 'Inspect target', outcome: 'confirmed' }],
    diagnostics: [],
    manual_actions: [],
    receipt: null,
  },
  failed: {
    status: 'failed',
    changed: false,
    harness: 'opencode',
    scope: 'global',
    target: 'C:\\Users\\Example User\\.config\\opencode',
    steps: [{ name: 'Inspect target', outcome: 'failed' }],
    diagnostics: ['Target inspection failed.'],
    manual_actions: [],
    receipt: null,
  },
  partial: {
    status: 'partial',
    changed: true,
    harness: 'codex',
    scope: 'global',
    target: 'C:\\Users\\Example User\\.codex',
    steps: [
      { name: 'Register marketplace', outcome: 'confirmed' },
      { name: 'Install plugin', outcome: 'failed' },
    ],
    diagnostics: ['Plugin installation could not be verified.'],
    manual_actions: ['Install the thoth-mem Codex plugin manually.'],
    receipt: 'C:\\Users\\Example User\\.thoth\\setup\\receipt.json',
  },
  requires_user_action: {
    status: 'requires_user_action',
    changed: false,
    harness: 'codex',
    scope: 'project',
    target: 'C:\\Workspaces\\Project With Spaces\\.codex',
    steps: [{ name: 'Install plugin', outcome: 'unavailable' }],
    diagnostics: ['No verified Codex plugin command is available.'],
    manual_actions: ['Complete plugin installation manually.'],
    receipt: null,
  },
};

describe('setup command contract', () => {
  it('parses only the accepted setup grammar with global and explicit project scope', () => {
    expect(parseSetupRequest(['opencode'])).toEqual({
      harness: 'opencode',
      scope: 'global',
      planOnly: false,
      force: false,
      json: false,
    });
    expect(parseSetupRequest([
      'codex',
      '--scope',
      'project',
      '--project',
      'C:\\Workspaces\\Project With Spaces',
      '--plan',
      '--force',
      '--json',
    ])).toEqual({
      harness: 'codex',
      scope: 'project',
      projectPath: 'C:\\Workspaces\\Project With Spaces',
      planOnly: true,
      force: true,
      json: true,
    });
    expect(parseSetupRequest([
      'opencode',
      '--scope=global',
      '--rollback=C:\\Receipts\\setup receipt.json',
    ])).toEqual({
      harness: 'opencode',
      scope: 'global',
      planOnly: false,
      force: false,
      rollbackReceipt: 'C:\\Receipts\\setup receipt.json',
      json: false,
    });
  });

  it.each([
    { args: [], message: 'setup requires opencode or codex' },
    { args: ['claude'], message: 'Invalid setup harness' },
    { args: ['opencode', '--scope', 'workspace'], message: 'Invalid value for --scope' },
    { args: ['opencode', '--scope', 'project'], message: '--scope project requires --project <path>' },
    { args: ['opencode', '--project', 'C:\\Work'], message: '--project is only valid with --scope project' },
    { args: ['opencode', '-p', 'C:\\Work'], message: 'Unexpected setup option: -p' },
    { args: ['opencode', '--unknown'], message: 'Unexpected setup option: --unknown' },
    { args: ['opencode', '--plan', '--plan'], message: 'Duplicate setup option: --plan' },
  ])('rejects invalid setup combination %# before execution', ({ args, message }) => {
    expect(() => parseSetupRequest(args)).toThrow(message);
  });

  it('renders stable human and JSON fields for all four statuses and exact exit codes', () => {
    expect(Object.fromEntries(
      Object.entries(RESULT_BY_STATUS).map(([status, result]) => [
        status,
        getSetupExitCode(result.status),
      ]),
    )).toEqual({
      complete: 0,
      failed: 1,
      partial: 2,
      requires_user_action: 3,
    });

    for (const result of Object.values(RESULT_BY_STATUS)) {
      expect(JSON.parse(formatSetupResult(result, true))).toEqual(result);
      expect(formatSetupResult(result, false)).toContain(`Status: ${result.status}`);
      expect(formatSetupResult(result, false)).toContain(`Changed: ${result.changed ? 'yes' : 'no'}`);
      expect(formatSetupResult(result, false)).toContain(`Receipt: ${result.receipt ?? 'none'}`);
    }

    expect(formatSetupResult(RESULT_BY_STATUS.requires_user_action, false)).toMatchInlineSnapshot(`
      "Setup: codex (project)
      Status: requires_user_action
      Changed: no
      Target: C:\\Workspaces\\Project With Spaces\\.codex
      Steps:
        - Install plugin: unavailable
      Diagnostics:
        - No verified Codex plugin command is available.
      Manual actions:
        - Complete plugin installation manually.
      Receipt: none"
    `);
  });

  it('documentation matches setup contract', async () => {
    const readme = await readFile(join(process.cwd(), 'README.md'), 'utf8');
    const documentedCommands: Array<{ command: string; request: SetupRequest }> = [
      {
        command: 'thoth-mem setup opencode',
        request: {
          harness: 'opencode',
          scope: 'global',
          planOnly: false,
          force: false,
          json: false,
        },
      },
      {
        command: 'thoth-mem setup codex --scope global --plan --json',
        request: {
          harness: 'codex',
          scope: 'global',
          planOnly: true,
          force: false,
          json: true,
        },
      },
      {
        command: 'thoth-mem setup opencode --scope project --project /path/to/project --force',
        request: {
          harness: 'opencode',
          scope: 'project',
          projectPath: '/path/to/project',
          planOnly: false,
          force: true,
          json: false,
        },
      },
      {
        command: 'thoth-mem setup codex --rollback /path/to/receipt.json',
        request: {
          harness: 'codex',
          scope: 'global',
          planOnly: false,
          force: false,
          rollbackReceipt: '/path/to/receipt.json',
          json: false,
        },
      },
    ];

    for (const { command, request } of documentedCommands) {
      expect.soft(readme).toContain(command);
      expect(parseSetupRequest(command.split(' ').slice(2))).toEqual(request);
    }

    for (const status of Object.keys(RESULT_BY_STATUS) as SetupStatus[]) {
      expect.soft(readme).toContain(`| \`${status}\` | \`${getSetupExitCode(status)}\` |`);
    }

    const requiredContractMarkers = [
      'Plan mode performs zero writes',
      'thoth-mem-managed locations',
      'Backups are created before the first mutation',
      'global receipts: `<thoth-data-dir>/setup/receipts/<receipt-id>/receipt.json`',
      'project receipts: `<project>/.thoth/setup/receipts/<receipt-id>/receipt.json`',
      '`in_progress`',
      'HMAC',
      'tampered',
      'preserves unrelated settings',
      'Repeated setup and repeated completed rollback are no-ops',
      '`opencode.json` or `opencode.jsonc`',
      '`requires_user_action`',
      '`/plugins`',
      'External Codex registration is not atomically reversible',
    ];
    for (const marker of requiredContractMarkers) {
      expect.soft(readme).toContain(marker);
    }
    expect.soft(readme).not.toContain('~/.config/opencode/config.json');
  });
});

type FakeEntry =
  | { kind: 'directory' }
  | { kind: 'file'; content: string };

class FakeSetupFileSystem implements SetupFileSystem {
  readonly reads: string[] = [];
  readonly writes: string[] = [];
  readonly entries = new Map<string, FakeEntry>();

  directory(path: string): void {
    this.entries.set(path, { kind: 'directory' });
  }

  file(path: string, content: string): void {
    this.entries.set(path, { kind: 'file', content });
  }

  async pathType(path: string): Promise<'missing' | 'file' | 'directory' | 'other'> {
    this.reads.push(path);
    return this.entries.get(path)?.kind ?? 'missing';
  }

  async readText(path: string): Promise<string> {
    this.reads.push(path);
    const entry = this.entries.get(path);
    if (entry?.kind !== 'file') {
      throw new Error(`ENOENT: ${path}`);
    }
    return entry.content;
  }

  async directoryMatches(
    targetPath: string,
    layout: FilesystemDirectoryEntry[],
    ignoredRelativePaths: string[],
  ): Promise<boolean> {
    const actual = this.directorySnapshot(targetPath, ignoredRelativePaths);
    const expected: string[] = [];
    for (const entry of layout) {
      const prefix = normalizeTestRelativePath(entry.targetRelativePath);
      if (prefix) {
        expected.push(`directory:${prefix}`);
      }
      for (const [path, value] of this.entries) {
        const sourceRelative = normalizeTestRelativePath(relative(entry.sourcePath, path));
        if (!sourceRelative || sourceRelative.startsWith('../')) {
          continue;
        }
        const targetRelative = prefix
          ? `${prefix}/${sourceRelative}`
          : sourceRelative;
        expected.push(value.kind === 'file'
          ? `file:${targetRelative}:${value.content}`
          : `directory:${targetRelative}`);
      }
    }
    expected.sort();
    return JSON.stringify(expected) === JSON.stringify(actual);
  }

  async writeText(path: string, content: string): Promise<void> {
    this.writes.push(path);
    this.file(path, content);
  }

  snapshot(): string {
    return JSON.stringify(
      [...this.entries.entries()].sort(([left], [right]) => left.localeCompare(right)),
    );
  }

  private directorySnapshot(root: string, ignored: string[]): string[] {
    const records: string[] = [];
    for (const [path, value] of this.entries) {
      const relativePath = normalizeTestRelativePath(relative(root, path));
      if (
        !relativePath
        || relativePath.startsWith('../')
        || ignored.some((candidate) => (
          relativePath === candidate || relativePath.startsWith(`${candidate}/`)
        ))
      ) {
        continue;
      }
      records.push(value.kind === 'file'
        ? `file:${relativePath}:${value.content}`
        : `directory:${relativePath}`);
    }
    records.sort();
    return records;
  }
}

function normalizeTestRelativePath(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  return normalized === '.' ? '' : normalized;
}

const ROOTS: SetupRoots = {
  homeDir: 'C:\\Users\\Example User',
  cwd: 'C:\\Workspaces',
  packageRoot: 'C:\\Program Files\\thoth-mem',
  xdgConfigHome: 'C:\\Harness Config',
  codexHome: 'C:\\Codex Home',
};

function setupRequest(
  harness: SetupRequest['harness'],
  overrides: Partial<SetupRequest> = {},
): SetupRequest {
  return {
    harness,
    scope: 'global',
    planOnly: true,
    force: false,
    json: false,
    ...overrides,
  };
}

function managedMetadata(request: SetupRequest, paths: SetupPaths): string {
  return JSON.stringify({
    schemaVersion: SETUP_MANAGED_METADATA_VERSION,
    packageVersion: getVersion(),
    executable: resolve(process.argv[1] ?? 'thoth-mem'),
    harness: request.harness,
    scope: request.scope,
    target: paths.targetRoot,
    configPath: paths.configPath,
    assetsPath: paths.assetPath,
    verified: true,
  });
}

function seedPackagedAssets(fileSystem: FakeSetupFileSystem, paths: SetupPaths): void {
  fileSystem.directory(paths.sourceAssetsPath);
  if (paths.sourceSharedPath) {
    fileSystem.directory(paths.sourceSharedPath);
    fileSystem.file(join(paths.sourceAssetsPath, 'plugin.mjs'), 'packaged-opencode-plugin');
    fileSystem.file(join(paths.sourceSharedPath, 'hook-runner.mjs'), 'packaged-hook-runner');
  } else {
    fileSystem.file(join(paths.sourceAssetsPath, '.mcp.json'), 'packaged-codex-mcp');
  }
}

function seedManagedSetup(
  fileSystem: FakeSetupFileSystem,
  request: SetupRequest,
  paths: SetupPaths,
): void {
  seedPackagedAssets(fileSystem, paths);
  const before = request.harness === 'opencode'
    ? '{ "unrelated_secret": "must-not-leak" }'
    : 'unrelated_secret = "must-not-leak"\n';
  fileSystem.file(paths.configPath, request.harness === 'opencode'
    ? planOpenCodeManagedConfig({
        before,
        force: false,
        mcpValue: OPENCODE_MCP_VALUE,
      }).after
    : planCodexManagedConfig({ before, force: false }).after);
  fileSystem.directory(paths.assetPath);
  if (request.harness === 'opencode') {
    fileSystem.directory(join(paths.assetPath, 'opencode'));
    fileSystem.directory(join(paths.assetPath, 'shared'));
    fileSystem.file(join(paths.assetPath, 'opencode', 'plugin.mjs'), 'packaged-opencode-plugin');
    fileSystem.file(join(paths.assetPath, 'shared', 'hook-runner.mjs'), 'packaged-hook-runner');
    fileSystem.file(paths.pluginEntryPath, 'export { default } from \'./.thoth-mem/opencode/plugin.mjs\';\n');
  } else {
    fileSystem.file(join(paths.assetPath, '.mcp.json'), 'packaged-codex-mcp');
  }
  fileSystem.file(
    join(paths.assetPath, 'thoth-mem.installation.json'),
    managedMetadata(request, paths),
  );
}

function expectZeroWrites(fileSystem: FakeSetupFileSystem, before: string): void {
  expect(fileSystem.snapshot()).toBe(before);
  expect(fileSystem.writes).toEqual([]);
}

const CONFIRMED_PROJECT_CODEX: CodexRegistrationEvidence = {
  scope: 'project',
  marketplace: 'confirmed',
  plugin: 'confirmed',
};

describe('inspects and plans with zero writes', () => {
  it('resolves global and explicit project targets without ambient home state', () => {
    const openCode = resolveSetupPaths(setupRequest('opencode'), ROOTS);
    expect(openCode).toEqual({
      targetRoot: 'C:\\Harness Config\\opencode',
      configPath: 'C:\\Harness Config\\opencode\\opencode.json',
      configCandidates: [
        'C:\\Harness Config\\opencode\\opencode.json',
        'C:\\Harness Config\\opencode\\opencode.jsonc',
      ],
      assetPath: 'C:\\Harness Config\\opencode\\plugins\\.thoth-mem',
      pluginEntryPath: 'C:\\Harness Config\\opencode\\plugins\\thoth-mem.js',
      metadataPath: 'C:\\Harness Config\\opencode\\plugins\\.thoth-mem\\.thoth-mem-managed.json',
      sourceAssetsPath: 'C:\\Program Files\\thoth-mem\\integrations\\opencode',
      sourceSharedPath: 'C:\\Program Files\\thoth-mem\\integrations\\shared',
    });

    const projectPath = 'C:\\Workspaces\\Project With Spaces';
    const codex = resolveSetupPaths(setupRequest('codex', {
      scope: 'project',
      projectPath,
    }), ROOTS);
    expect(codex).toEqual({
      targetRoot: `${projectPath}\\.codex`,
      configPath: `${projectPath}\\.codex\\config.toml`,
      configCandidates: [`${projectPath}\\.codex\\config.toml`],
      assetPath: `${projectPath}\\.codex\\plugins\\thoth-mem`,
      pluginEntryPath: `${projectPath}\\.codex\\plugins\\thoth-mem`,
      metadataPath: `${projectPath}\\.codex\\plugins\\thoth-mem\\.thoth-mem-managed.json`,
      sourceAssetsPath: 'C:\\Program Files\\thoth-mem\\integrations\\codex',
      sourceSharedPath: null,
    });
  });

  it('plans clean OpenCode global setup and refuses mutation in this planning slice', async () => {
    const request = setupRequest('opencode');
    const paths = resolveSetupPaths(request, ROOTS);
    const fileSystem = new FakeSetupFileSystem();
    seedPackagedAssets(fileSystem, paths);
    const before = fileSystem.snapshot();

    const planned = await inspectAndPlanSetup(request, { roots: ROOTS, fileSystem });

    expect(planned).toMatchObject({
      status: 'complete',
      changed: false,
      harness: 'opencode',
      scope: 'global',
      target: paths.targetRoot,
    });
    expect(planned.steps.map((step) => step.outcome)).toEqual([
      'confirmed',
      'confirmed',
      'planned',
      'planned',
      'planned',
    ]);
    expect(planned.steps.map((step) => step.name)).toEqual([
      `Inspect packaged OpenCode assets: ${paths.sourceAssetsPath}`,
      `Inspect OpenCode configuration: ${paths.configPath}`,
      `Install OpenCode assets: ${paths.assetPath}`,
      `Merge managed OpenCode configuration: ${paths.configPath}`,
      'Verify OpenCode setup',
    ]);
    expectZeroWrites(fileSystem, before);

    const mutatingRequest = { ...request, planOnly: false };
    const notApplied = await inspectAndPlanSetup(mutatingRequest, { roots: ROOTS, fileSystem });
    expect(notApplied.status).toBe('requires_user_action');
    expect(notApplied.changed).toBe(false);
    expect(notApplied.manual_actions).toContain(
      'Apply support is not available in this planning slice; no setup changes were made.',
    );
    expectZeroWrites(fileSystem, before);
  });

  it('returns an idempotent no-op for verified OpenCode project setup', async () => {
    const request = setupRequest('opencode', {
      scope: 'project',
      projectPath: 'C:\\Workspaces\\Project With Spaces',
      planOnly: false,
    });
    const paths = resolveSetupPaths(request, ROOTS);
    const fileSystem = new FakeSetupFileSystem();
    seedManagedSetup(fileSystem, request, paths);
    const before = fileSystem.snapshot();

    const result = await inspectAndPlanSetup(request, { roots: ROOTS, fileSystem });

    expect(result.status).toBe('complete');
    expect(result.changed).toBe(false);
    expect(result.steps.map((step) => step.outcome)).toEqual([
      'confirmed',
      'confirmed',
      'skipped',
      'skipped',
      'confirmed',
    ]);
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(fileSystem.reads.some((path) => path.startsWith('C:\\Harness Config'))).toBe(false);
    expectZeroWrites(fileSystem, before);
  });

  it('uses exactly one OpenCode JSON/JSONC candidate and fails closed when both exist', async () => {
    const request = setupRequest('opencode');
    const paths = resolveSetupPaths(request, ROOTS);
    const jsoncPath = paths.configCandidates[1]!;
    const jsoncFileSystem = new FakeSetupFileSystem();
    seedPackagedAssets(jsoncFileSystem, paths);
    jsoncFileSystem.file(jsoncPath, planOpenCodeManagedConfig({
      before: '{ // keep jsonc\n}\n',
      force: false,
      mcpValue: OPENCODE_MCP_VALUE,
    }).after);

    const selected = await inspectAndPlanSetup(request, {
      roots: ROOTS,
      fileSystem: jsoncFileSystem,
    });
    expect(selected.status).toBe('complete');
    expect(selected.steps).toContainEqual({
      name: `Inspect OpenCode configuration: ${jsoncPath}`,
      outcome: 'confirmed',
    });
    expect(selected.steps).toContainEqual({
      name: `Merge managed OpenCode configuration: ${jsoncPath}`,
      outcome: 'planned',
    });

    const ambiguousFileSystem = new FakeSetupFileSystem();
    seedPackagedAssets(ambiguousFileSystem, paths);
    ambiguousFileSystem.file(paths.configCandidates[0]!, '{}');
    ambiguousFileSystem.file(paths.configCandidates[1]!, '{}');
    const blocked = await inspectAndPlanSetup(
      { ...request, force: true },
      { roots: ROOTS, fileSystem: ambiguousFileSystem },
    );
    expect(blocked.status).toBe('requires_user_action');
    expect(blocked.diagnostics).toContain(
      `Multiple OpenCode configuration files exist: ${paths.configCandidates.join(', ')}`,
    );
  });

  it('does not trust matching metadata when managed config or assets drift', async () => {
    const request = setupRequest('opencode', {
      scope: 'project',
      projectPath: 'C:\\Workspaces\\Project With Spaces',
    });
    const paths = resolveSetupPaths(request, ROOTS);

    const configDrift = new FakeSetupFileSystem();
    seedManagedSetup(configDrift, request, paths);
    configDrift.file(paths.configPath, '{ "unrelated_secret": "must-not-leak" }');
    const configBlocked = await inspectAndPlanSetup(request, {
      roots: ROOTS,
      fileSystem: configDrift,
    });
    expect(configBlocked.status).toBe('requires_user_action');
    expect(configBlocked.steps.find((step) => step.name.startsWith('Merge managed'))?.outcome)
      .toBe('unavailable');
    expect(JSON.stringify(configBlocked)).not.toContain('must-not-leak');

    const assetDrift = new FakeSetupFileSystem();
    seedManagedSetup(assetDrift, request, paths);
    assetDrift.file(join(paths.assetPath, 'opencode', 'plugin.mjs'), 'drifted-secret');
    const assetBlocked = await inspectAndPlanSetup(request, {
      roots: ROOTS,
      fileSystem: assetDrift,
    });
    expect(assetBlocked.status).toBe('requires_user_action');
    expect(assetBlocked.steps.find((step) => step.name.startsWith('Install OpenCode assets'))?.outcome)
      .toBe('unavailable');
    expect(JSON.stringify(assetBlocked)).not.toContain('drifted-secret');

    const forced = await inspectAndPlanSetup(
      { ...request, force: true },
      { roots: ROOTS, fileSystem: assetDrift },
    );
    expect(forced.status).toBe('complete');
    expect(forced.steps.find((step) => step.name.startsWith('Install OpenCode assets'))?.outcome)
      .toBe('planned');
  });

  it('reports OpenCode conflicts and makes plan force zero-write and deterministic', async () => {
    const request = setupRequest('opencode');
    const paths = resolveSetupPaths(request, ROOTS);
    const fileSystem = new FakeSetupFileSystem();
    seedPackagedAssets(fileSystem, paths);
    fileSystem.file(paths.configPath, '{ "plugin": "someone-else" }');
    fileSystem.directory(paths.assetPath);
    const before = fileSystem.snapshot();

    const blocked = await inspectAndPlanSetup(request, { roots: ROOTS, fileSystem });
    expect(blocked.status).toBe('requires_user_action');
    expect(blocked.changed).toBe(false);
    expect(blocked.diagnostics).toContain(`Conflict at managed asset target: ${paths.assetPath}`);
    expectZeroWrites(fileSystem, before);

    const forced = await inspectAndPlanSetup({ ...request, force: true }, {
      roots: ROOTS,
      fileSystem,
    });
    expect(forced.status).toBe('complete');
    expect(forced.changed).toBe(false);
    expect(forced.steps.find((step) => step.name.startsWith('Install OpenCode assets'))?.outcome)
      .toBe('planned');
    expect(forced.diagnostics).toContain(`Force would replace only: ${paths.assetPath}`);
    expectZeroWrites(fileSystem, before);
  });

  it('never treats Codex marketplace presence alone as complete', async () => {
    const request = setupRequest('codex');
    const paths = resolveSetupPaths(request, ROOTS);
    const fileSystem = new FakeSetupFileSystem();
    seedManagedSetup(fileSystem, request, paths);
    const before = fileSystem.snapshot();

    const result = await inspectAndPlanSetup(request, {
      roots: ROOTS,
      fileSystem,
      codexRegistration: {
        scope: 'global',
        marketplace: 'confirmed',
        plugin: 'unverified',
      },
    });

    expect(result.status).toBe('requires_user_action');
    expect(result.changed).toBe(false);
    expect(result.steps).toContainEqual({
      name: 'Register thoth-mem Codex marketplace (global)',
      outcome: 'confirmed',
    });
    expect(result.steps).toContainEqual({
      name: 'Install thoth-mem Codex plugin (global)',
      outcome: 'unavailable',
    });
    expect(result.manual_actions).toContain(
      'Complete and independently verify Codex plugin installation for global scope.',
    );
    expectZeroWrites(fileSystem, before);
  });

  it('confines verified and conflicting Codex project plans to the explicit project', async () => {
    const projectPath = 'C:\\Workspaces\\Project With Spaces';
    const request = setupRequest('codex', {
      scope: 'project',
      projectPath,
      planOnly: false,
    });
    const paths = resolveSetupPaths(request, ROOTS);
    const managedFileSystem = new FakeSetupFileSystem();
    seedManagedSetup(managedFileSystem, request, paths);
    const managedBefore = managedFileSystem.snapshot();

    const managed = await inspectAndPlanSetup(request, {
      roots: ROOTS,
      fileSystem: managedFileSystem,
      codexRegistration: CONFIRMED_PROJECT_CODEX,
    });
    expect(managed.status).toBe('complete');
    expect(managed.changed).toBe(false);
    expect(managedFileSystem.reads.every((path) => (
      path.startsWith(projectPath) || path.startsWith(ROOTS.packageRoot)
    ))).toBe(true);
    expect(managed.steps.some((step) => step.name.includes('(global)'))).toBe(false);
    expectZeroWrites(managedFileSystem, managedBefore);

    const conflictFileSystem = new FakeSetupFileSystem();
    seedPackagedAssets(conflictFileSystem, paths);
    conflictFileSystem.directory(paths.assetPath);
    const conflictBefore = conflictFileSystem.snapshot();
    const blocked = await inspectAndPlanSetup(
      { ...request, planOnly: true },
      {
        roots: ROOTS,
        fileSystem: conflictFileSystem,
        codexRegistration: CONFIRMED_PROJECT_CODEX,
      },
    );
    expect(blocked.status).toBe('requires_user_action');
    expectZeroWrites(conflictFileSystem, conflictBefore);

    const forced = await inspectAndPlanSetup(
      { ...request, planOnly: true, force: true },
      {
        roots: ROOTS,
        fileSystem: conflictFileSystem,
        codexRegistration: CONFIRMED_PROJECT_CODEX,
      },
    );
    expect(forced.status).toBe('complete');
    expect(forced.changed).toBe(false);
    expectZeroWrites(conflictFileSystem, conflictBefore);
  });
});

const OPENCODE_MCP_VALUE = {
  type: 'local' as const,
  command: ['thoth-mem', 'mcp', '--no-http'],
  enabled: true,
};

describe('merges only managed configuration', () => {
  it('adds only mcp.thoth-mem to clean and comment-rich OpenCode JSONC', () => {
    const clean = planOpenCodeManagedConfig({
      before: null,
      force: false,
      mcpValue: OPENCODE_MCP_VALUE,
    });
    expect(clean).toMatchObject({
      before: null,
      changed: true,
      forced: false,
      conflicts: [],
      ownedLocations: ['mcp.thoth-mem'],
      verification: {
        beforeValid: true,
        afterValid: true,
        ownedValuesMatch: true,
      },
    });
    expect(clean.after).toContain('"thoth-mem"');
    expect(clean.after).toContain('"command": [');

    const before = `{
  // preserve root comments and unrelated settings
  "theme": "nord",
  "plugin": [
    "foreign-one", // preserve inline plugin comment
    "foreign-two",
  ],
  "mcp": {
    "other": { "type": "remote", "url": "https://example.invalid/mcp" },
  },
}
`;
    const plan = planOpenCodeManagedConfig({
      before,
      force: false,
      mcpValue: OPENCODE_MCP_VALUE,
    });

    expect(plan.changed).toBe(true);
    expect(plan.conflicts).toEqual([]);
    expect(plan.after).toContain('// preserve root comments and unrelated settings');
    expect(plan.after).toContain(`  "plugin": [
    "foreign-one", // preserve inline plugin comment
    "foreign-two",
  ],`);
    expect(plan.after).toContain('"other": { "type": "remote", "url": "https://example.invalid/mcp" },');
    expect(plan.verification).toEqual({
      beforeValid: true,
      afterValid: true,
      ownedValuesMatch: true,
    });
  });

  it('treats exact OpenCode ownership as idempotent and force-replaces only conflicts', () => {
    const installed = planOpenCodeManagedConfig({
      before: null,
      force: false,
      mcpValue: OPENCODE_MCP_VALUE,
    }).after;
    const noOp = planOpenCodeManagedConfig({
      before: installed,
      force: false,
      mcpValue: OPENCODE_MCP_VALUE,
    });
    expect(noOp.changed).toBe(false);
    expect(noOp.after).toBe(installed);
    expect(noOp.verification.ownedValuesMatch).toBe(true);

    const before = `{
  "theme": "unchanged",
  "mcp": {
    "other": { "type": "remote", "url": "https://example.invalid/keep" },
    "thoth-mem": { "type": "local", "command": ["wrong-command"] },
  },
}
`;
    const blocked = planOpenCodeManagedConfig({
      before,
      force: false,
      mcpValue: OPENCODE_MCP_VALUE,
    });
    expect(blocked.changed).toBe(false);
    expect(blocked.after).toBe(before);
    expect(blocked.conflicts).toEqual([expect.objectContaining({
      location: 'mcp.thoth-mem',
      forceable: true,
    })]);

    const forced = planOpenCodeManagedConfig({
      before,
      force: true,
      mcpValue: OPENCODE_MCP_VALUE,
    });
    expect(forced.changed).toBe(true);
    expect(forced.forced).toBe(true);
    expect(forced.after).toContain('"theme": "unchanged"');
    expect(forced.after).toContain('"other": { "type": "remote", "url": "https://example.invalid/keep" },');
    expect(forced.after).not.toContain('wrong-command');
    expect(forced.verification.ownedValuesMatch).toBe(true);
  });

  it('fails closed on malformed OpenCode config without leaking values', () => {
    const before = '{ "api_token": "do-not-leak",';
    const plan = planOpenCodeManagedConfig({
      before,
      force: true,
      mcpValue: OPENCODE_MCP_VALUE,
    });

    expect(plan.changed).toBe(false);
    expect(plan.after).toBe(before);
    expect(plan.verification.beforeValid).toBe(false);
    expect(plan.conflicts).toEqual([expect.objectContaining({
      location: 'root',
      forceable: false,
    })]);
    expect(JSON.stringify(plan.conflicts)).not.toContain('do-not-leak');
  });

  it('appends one plugin-scoped Codex policy block while preserving unrelated TOML bytes', () => {
    const before = `# preserve this comment
model = "gpt-5"

[features]
web_search = true
`;
    const plan = planCodexManagedConfig({ before, force: false });

    expect(plan.changed).toBe(true);
    expect(plan.before).toBe(before);
    expect(plan.after.startsWith(before)).toBe(true);
    expect(plan.after).toContain(CODEX_MANAGED_BLOCK_START);
    expect(plan.after).toContain('[plugins."thoth-mem".mcp_servers."thoth-mem"]');
    expect(plan.after).toContain('enabled = true');
    expect(plan.after).toContain(CODEX_MANAGED_BLOCK_END);
    expect(plan.after).not.toContain('[mcp_servers.thoth-mem]');
    expect(plan.ownedLocations).toEqual([
      'plugins."thoth-mem".mcp_servers."thoth-mem"',
    ]);
    expect(plan.verification).toEqual({
      beforeValid: true,
      afterValid: true,
      ownedValuesMatch: true,
    });
  });

  it('keeps exact Codex policy idempotent and force-replaces only the marker region', () => {
    const prefix = `model = "gpt-5"

[features]
web_search = true

`;
    const installed = planCodexManagedConfig({ before: prefix, force: false }).after;
    const noOp = planCodexManagedConfig({ before: installed, force: false });
    expect(noOp.changed).toBe(false);
    expect(noOp.after).toBe(installed);

    const conflicting = `${prefix}${CODEX_MANAGED_BLOCK_START}
[plugins."thoth-mem".mcp_servers."thoth-mem"]
enabled = false
${CODEX_MANAGED_BLOCK_END}
`;
    const blocked = planCodexManagedConfig({ before: conflicting, force: false });
    expect(blocked.changed).toBe(false);
    expect(blocked.after).toBe(conflicting);
    expect(blocked.conflicts).toEqual([expect.objectContaining({
      location: 'plugins."thoth-mem".mcp_servers."thoth-mem"',
      forceable: true,
    })]);

    const forced = planCodexManagedConfig({ before: conflicting, force: true });
    expect(forced.changed).toBe(true);
    expect(forced.forced).toBe(true);
    expect(forced.after.startsWith(prefix)).toBe(true);
    expect(forced.after).not.toContain('enabled = false');
    expect(forced.after.match(new RegExp(CODEX_MANAGED_BLOCK_START, 'g'))).toHaveLength(1);
    expect(forced.verification.ownedValuesMatch).toBe(true);
  });

  it.each([
    {
      name: 'duplicate blocks',
      before: `${CODEX_MANAGED_BLOCK_START}\n[plugins."thoth-mem"]\nenabled = true\n${CODEX_MANAGED_BLOCK_END}\n${CODEX_MANAGED_BLOCK_START}\n[plugins."thoth-mem"]\nenabled = true\n${CODEX_MANAGED_BLOCK_END}\n`,
      location: 'managed marker block',
    },
    {
      name: 'unclosed block',
      before: `${CODEX_MANAGED_BLOCK_START}\n[plugins."thoth-mem"]\nenabled = true\n`,
      location: 'managed marker block',
    },
    {
      name: 'foreign owned table',
      before: '[plugins."thoth-mem".mcp_servers."thoth-mem"]\nenabled = false\n',
      location: 'plugins."thoth-mem".mcp_servers."thoth-mem"',
    },
    {
      name: 'malformed TOML',
      before: 'api_token = "do-not-leak\n',
      location: 'root',
    },
  ])('fails closed for Codex $name even with force', ({ before, location }) => {
    const plan = planCodexManagedConfig({ before, force: true });

    expect(plan.changed).toBe(false);
    expect(plan.after).toBe(before);
    expect(plan.conflicts).toEqual([expect.objectContaining({
      location,
      forceable: false,
    })]);
    expect(JSON.stringify(plan.conflicts)).not.toContain('do-not-leak');
  });
});

const FILESYSTEM_FAULT_POINTS = [
  'before-write',
  'stage-write',
  'stage-sync',
  'atomic-rename',
  'after-rename',
  'post-write-verify',
] as const satisfies readonly FilesystemFaultPoint[];

async function withTemporarySetupRoot<T>(
  run: (root: string) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'thoth-mem setup '));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('backs up and applies atomically', () => {
  it('backs up before mutation and exposes only complete old or new file content', async () => {
    await withTemporarySetupRoot(async (root) => {
      const targetRoot = join(root, 'Harness Config', 'opencode');
      const targetPath = join(targetRoot, 'opencode.jsonc');
      const backupRoot = join(root, 'receipt backups');
      await mkdir(targetRoot, { recursive: true });
      await writeFile(targetPath, 'old-complete', 'utf8');

      const observed: string[] = [];
      const stagePaths: string[] = [];
      const result = await applyAtomicFilesystemChanges({
        targetRoot,
        backupRoot,
        changes: [{ kind: 'file', targetPath, content: 'new-complete' }],
      }, {
        fault: async ({ point, stagePath }) => {
          if (stagePath) {
            stagePaths.push(stagePath);
          }
          if (point === 'before-write' || point === 'after-rename') {
            observed.push(await readFile(targetPath, 'utf8'));
          }
        },
      });

      expect(result).toMatchObject({
        outcome: 'confirmed',
        changed: true,
        restored: [],
        unrestored: [],
        diagnostics: [],
      });
      expect(observed).toEqual(['old-complete', 'new-complete']);
      expect(await readFile(targetPath, 'utf8')).toBe('new-complete');
      expect(result.backups).toHaveLength(1);
      expect(await readFile(result.backups[0]!.backupPath, 'utf8')).toBe('old-complete');
      expect(stagePaths.every((path) => dirname(path) === dirname(targetPath))).toBe(true);
      expect((await readdir(targetRoot)).some((name) => name.includes('.thoth-mem-stage-')))
        .toBe(false);
    });
  });

  it.each(FILESYSTEM_FAULT_POINTS)(
    'restores the original target after an injected %s failure',
    async (faultPoint) => {
      await withTemporarySetupRoot(async (root) => {
        const targetRoot = join(root, 'target with spaces');
        const targetPath = join(targetRoot, 'config.toml');
        const backupRoot = join(root, 'backups');
        await mkdir(targetRoot, { recursive: true });
        await writeFile(targetPath, 'old-complete', 'utf8');

        const result = await applyAtomicFilesystemChanges({
          targetRoot,
          backupRoot,
          changes: [{ kind: 'file', targetPath, content: 'new-complete' }],
        }, {
          fault: ({ point }) => {
            if (point === faultPoint) {
              throw new Error('injected filesystem fault');
            }
          },
        });

        expect(result.outcome).toBe('failed');
        expect(result.changed).toBe(false);
        expect(result.unrestored).toEqual([]);
        expect(await readFile(targetPath, 'utf8')).toBe('old-complete');
        expect(result.backups).toHaveLength(1);
        expect(await readFile(result.backups[0]!.backupPath, 'utf8')).toBe('old-complete');
        expect((await readdir(targetRoot)).some((name) => name.includes('.thoth-mem-stage-')))
          .toBe(false);
      });
    },
  );

  it('fails without false completion and reports only safe unrestored paths', async () => {
    await withTemporarySetupRoot(async (root) => {
      const targetRoot = join(root, 'target');
      const targetPath = join(targetRoot, 'config.toml');
      await mkdir(targetRoot, { recursive: true });
      await writeFile(targetPath, 'old-secret-do-not-leak', 'utf8');

      const result = await applyAtomicFilesystemChanges({
        targetRoot,
        backupRoot: join(root, 'backups'),
        changes: [{
          kind: 'file',
          targetPath,
          content: 'new-secret-do-not-leak',
        }],
      }, {
        fault: ({ point }) => {
          if (point === 'after-rename' || point === 'restore') {
            throw new Error('injected filesystem fault');
          }
        },
      });

      expect(result).toMatchObject({
        outcome: 'failed',
        changed: true,
        restored: [],
        unrestored: [targetPath],
      });
      expect(await readFile(targetPath, 'utf8')).toBe('new-secret-do-not-leak');
      expect(JSON.stringify(result.diagnostics)).not.toContain('old-secret-do-not-leak');
      expect(JSON.stringify(result.diagnostics)).not.toContain('new-secret-do-not-leak');
    });
  });

  it('stages contained OpenCode assets and rejects source or target escapes', async () => {
    await withTemporarySetupRoot(async (root) => {
      const sourceRoot = join(root, 'package with spaces', 'integrations');
      const openCodeSource = join(sourceRoot, 'opencode');
      const sharedSource = join(sourceRoot, 'shared');
      await mkdir(openCodeSource, { recursive: true });
      await mkdir(sharedSource, { recursive: true });
      await writeFile(join(openCodeSource, 'plugin.mjs'), 'export default {};\n', 'utf8');
      await writeFile(join(sharedSource, 'hook-runner.mjs'), 'export {};\n', 'utf8');

      const targetRoot = join(root, 'Harness Config', 'opencode');
      const managedAssets = join(targetRoot, 'plugins', '.thoth-mem');
      const pluginEntry = join(targetRoot, 'plugins', 'thoth-mem.js');
      const result = await applyAtomicFilesystemChanges({
        targetRoot,
        sourceRoot,
        backupRoot: join(root, 'backups'),
        changes: [
          {
            kind: 'directory',
            targetPath: managedAssets,
            entries: [
              { sourcePath: openCodeSource, targetRelativePath: 'opencode' },
              { sourcePath: sharedSource, targetRelativePath: 'shared' },
            ],
          },
          {
            kind: 'file',
            targetPath: pluginEntry,
            content: "export { default } from './.thoth-mem/opencode/plugin.mjs';\n",
          },
        ],
      });

      expect(result.outcome).toBe('confirmed');
      expect(await readFile(join(managedAssets, 'opencode', 'plugin.mjs'), 'utf8'))
        .toBe('export default {};\n');
      expect(await readFile(join(managedAssets, 'shared', 'hook-runner.mjs'), 'utf8'))
        .toBe('export {};\n');
      expect(await readFile(pluginEntry, 'utf8'))
        .toBe("export { default } from './.thoth-mem/opencode/plugin.mjs';\n");

      const escapedTarget = join(targetRoot, '..', 'escaped.txt');
      const escapedSource = join(root, 'outside source');
      await mkdir(escapedSource, { recursive: true });
      await writeFile(join(escapedSource, 'payload.txt'), 'outside', 'utf8');
      const rejected = await applyAtomicFilesystemChanges({
        targetRoot,
        sourceRoot,
        backupRoot: join(root, 'rejected backups'),
        changes: [
          { kind: 'file', targetPath: escapedTarget, content: 'escape' },
          {
            kind: 'directory',
            targetPath: join(targetRoot, 'plugins', 'rejected'),
            entries: [{ sourcePath: escapedSource, targetRelativePath: '.' }],
          },
        ],
      });

      expect(rejected).toMatchObject({
        outcome: 'failed',
        changed: false,
        backups: [],
        restored: [],
        unrestored: [],
      });
      await expect(stat(escapedTarget)).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });
});
