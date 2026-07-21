import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  stat,
  symlink,
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
import type {
  CodexCommandExecutor,
  CodexCommandResult,
} from '../../src/setup/codex-cli.js';
import {
  resolveSetupPaths,
  type SetupPaths,
  type SetupRoots,
} from '../../src/setup/paths.js';
import {
  createSetupReceipt,
  loadSetupReceipt,
  persistSetupReceipt,
  resolveSetupReceiptPaths,
  type ReceiptFaultEvent,
  type SetupReceiptV2,
} from '../../src/setup/receipt.js';
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
    harness: 'claude',
    scope: 'global',
    target: 'C:\\Users\\Example User\\.claude',
    steps: [{ name: 'Inspect Claude Code setup', outcome: 'confirmed' }],
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
    expect(parseSetupRequest(['claude'])).toEqual({
      harness: 'claude',
      scope: 'global',
      planOnly: false,
      force: false,
      json: false,
    });
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
    { args: [], message: 'setup requires opencode, codex, or claude' },
    { args: ['claude-code'], message: 'Invalid setup harness: claude-code' },
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

const FIXTURE_ROOT = resolve('test fixtures', 'setup engine');
const ROOTS: SetupRoots = {
  homeDir: join(FIXTURE_ROOT, 'home', 'Example User'),
  cwd: join(FIXTURE_ROOT, 'Workspaces'),
  packageRoot: join(FIXTURE_ROOT, 'Program Files', 'thoth-mem'),
  xdgConfigHome: join(FIXTURE_ROOT, 'Harness Config'),
  codexHome: join(FIXTURE_ROOT, 'Codex Home'),
};
const PROJECT_PATH = join(ROOTS.cwd, 'Project With Spaces');

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
  fileSystem.file(join(dirname(dirname(paths.sourceAssetsPath)), 'integrations', 'inventory.json'), JSON.stringify({
    schemaVersion: 1,
    assets: [
      { harness: 'opencode', role: 'plugin', path: 'integrations/opencode/plugin.mjs' },
      { harness: 'opencode', role: 'instruction', path: 'integrations/opencode/memory-protocol.md' },
      { harness: 'opencode', role: 'runner', path: 'integrations/shared/hook-runner.mjs' },
      { harness: 'shared', role: 'skill', path: 'plugin/skills/thoth-mem/SKILL.md' },
      { harness: 'shared', role: 'skill-reference-opencode', path: 'plugin/skills/thoth-mem/references/opencode.md' },
    ],
  }));
  fileSystem.directory(paths.sourceAssetsPath);
  if (paths.sourceSharedPath) {
    fileSystem.directory(paths.sourceSharedPath);
    fileSystem.file(join(paths.sourceAssetsPath, 'plugin.mjs'), 'packaged-opencode-plugin');
    fileSystem.file(join(paths.sourceAssetsPath, 'memory-protocol.md'), 'packaged-memory-protocol');
    fileSystem.file(join(paths.sourceSharedPath, 'hook-runner.mjs'), 'packaged-hook-runner');
    fileSystem.directory(dirname(paths.sourceSkillPath!));
    fileSystem.directory(paths.sourceSkillPath!);
    fileSystem.file(join(paths.sourceSkillPath!, 'SKILL.md'), 'packaged-skill');
    fileSystem.directory(join(paths.sourceSkillPath!, 'references'));
    fileSystem.file(join(paths.sourceSkillPath!, 'references', 'opencode.md'), 'packaged-opencode-reference');
  } else {
    fileSystem.file(join(paths.sourceAssetsPath, 'codex.mcp.json'), 'packaged-codex-mcp');
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
    fileSystem.directory(join(paths.assetPath, 'opencode', 'skills'));
    fileSystem.file(join(paths.assetPath, 'opencode', 'plugin.mjs'), 'packaged-opencode-plugin');
    fileSystem.file(join(paths.assetPath, 'opencode', 'memory-protocol.md'), 'packaged-memory-protocol');
    fileSystem.file(join(paths.assetPath, 'shared', 'hook-runner.mjs'), 'packaged-hook-runner');
    fileSystem.directory(join(paths.assetPath, 'opencode', 'skills', 'thoth-mem'));
    fileSystem.file(
      join(paths.assetPath, 'opencode', 'skills', 'thoth-mem', 'SKILL.md'),
      'packaged-skill',
    );
    fileSystem.directory(join(paths.assetPath, 'opencode', 'skills', 'thoth-mem', 'references'));
    fileSystem.file(
      join(paths.assetPath, 'opencode', 'skills', 'thoth-mem', 'references', 'opencode.md'),
      'packaged-opencode-reference',
    );
    fileSystem.file(paths.pluginEntryPath, 'export { default } from \'./.thoth-mem/opencode/plugin.mjs\';\n');
  } else {
    fileSystem.file(join(paths.assetPath, 'codex.mcp.json'), 'packaged-codex-mcp');
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

interface PlanningCodexOptions {
  version?: string;
  marketplace?: boolean;
  plugin?: boolean;
  projectScoped?: boolean;
  malformedState?: boolean;
}

class PlanningCodexExecutor implements CodexCommandExecutor {
  readonly calls: string[][] = [];
  readonly mutatingCalls: string[][] = [];

  constructor(private readonly options: PlanningCodexOptions = {}) {}

  async execute(args: readonly string[]): Promise<CodexCommandResult> {
    const command = [...args];
    this.calls.push(command);
    const success = (stdout: string): CodexCommandResult => ({ exitCode: 0, stdout, stderr: '' });
    const key = command
      .filter((argument, index) => (
        argument !== '--json'
        && argument !== '--project'
        && command[index - 1] !== '--project'
      ))
      .join(' ');
    if (key === '--version') {
      return success(this.options.version ?? 'codex-cli 0.144.0');
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
    if (key.endsWith('--help')) {
      const supportsProject = this.options.projectScoped ? '\nOptions:\n  --project <PATH>' : '';
      const supportsJson = key.includes(' list --help') ? '\n  --json' : '';
      const usage = key === 'plugin marketplace add --help'
        ? 'Usage: codex plugin marketplace add [OPTIONS] <SOURCE>'
        : key === 'plugin marketplace list --help'
          ? 'Usage: codex plugin marketplace list [OPTIONS]'
          : key === 'plugin add --help'
            ? 'Usage: codex plugin add [OPTIONS] <PLUGIN>'
            : 'Usage: codex plugin list [OPTIONS]';
      return success(`${usage}${supportsProject}${supportsJson}`);
    }
    if (key === 'plugin marketplace list') {
      return success(this.options.malformedState
        ? '{"marketplaces":['
        : JSON.stringify({
            marketplaces: this.options.marketplace
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
      return success(this.options.malformedState
        ? JSON.stringify({ unexpected: [] })
        : JSON.stringify({
            installed: this.options.plugin
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
    if (key.startsWith('plugin marketplace add') || key.startsWith('plugin add')) {
      this.mutatingCalls.push(command);
      return success('unexpected mutation');
    }
    return { exitCode: 64, stdout: '', stderr: 'unexpected command' };
  }
}

type MarketplaceMutation =
  | 'success'
  | 'nonzero_verified'
  | 'collision'
  | 'ordinary_failure';
type PluginMutation = 'success' | 'ordinary_failure';

interface ExecutingCodexOptions {
  marketplaceInitially?: boolean;
  pluginInitially?: boolean;
  marketplaceMutation?: MarketplaceMutation;
  pluginMutation?: PluginMutation;
  removeAvailable?: boolean;
}

function normalizedCodexCommand(command: readonly string[]): string {
  return command
    .filter((argument, index) => (
      argument !== '--json'
      && argument !== '--project'
      && command[index - 1] !== '--project'
    ))
    .join(' ');
}

class ExecutingCodexExecutor implements CodexCommandExecutor {
  readonly calls: string[][] = [];
  readonly mutatingCalls: string[] = [];
  marketplaceInstalled: boolean;
  pluginInstalled: boolean;

  constructor(private readonly options: ExecutingCodexOptions = {}) {
    this.marketplaceInstalled = options.marketplaceInitially ?? false;
    this.pluginInstalled = options.pluginInitially ?? false;
  }

  async execute(args: readonly string[]): Promise<CodexCommandResult> {
    const command = [...args];
    this.calls.push(command);
    const success = (stdout: string): CodexCommandResult => ({ exitCode: 0, stdout, stderr: '' });
    const key = normalizedCodexCommand(command);

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
      return success([
        'Usage: codex plugin marketplace <COMMAND>',
        'Commands:',
        '  list',
        '  add',
        ...(this.options.removeAvailable ? ['  remove'] : []),
      ].join('\n'));
    }
    if (key === 'plugin marketplace add --help') {
      return success('Usage: codex plugin marketplace add [OPTIONS] <SOURCE>');
    }
    if (key === 'plugin marketplace list --help') {
      return success('Usage: codex plugin marketplace list [OPTIONS]\n  --json');
    }
    if (key === 'plugin marketplace remove --help' && this.options.removeAvailable) {
      return success('Usage: codex plugin marketplace remove [OPTIONS] <NAME>\n  --json');
    }
    if (key === 'plugin add --help') {
      return success('Usage: codex plugin add [OPTIONS] <PLUGIN>');
    }
    if (key === 'plugin list --help') {
      return success('Usage: codex plugin list [OPTIONS]\n  --json');
    }
    if (key === 'plugin marketplace list') {
      return success(JSON.stringify({
        marketplaces: this.marketplaceInstalled
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
        installed: this.pluginInstalled
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
      this.mutatingCalls.push(key);
      const mutation = this.options.marketplaceMutation ?? 'success';
      if (mutation === 'success' || mutation === 'nonzero_verified') {
        this.marketplaceInstalled = true;
      }
      if (mutation === 'success') {
        return success('registered');
      }
      if (mutation === 'nonzero_verified') {
        return { exitCode: 17, stdout: '', stderr: 'transient command failure' };
      }
      if (mutation === 'collision') {
        return {
          exitCode: 17,
          stdout: '',
          stderr: "marketplace 'thoth-mem' is already added from a different source; remove it before adding this source",
        };
      }
      return { exitCode: 17, stdout: '', stderr: 'ordinary marketplace failure' };
    }
    if (key === 'plugin add thoth-mem') {
      this.mutatingCalls.push(key);
      if ((this.options.pluginMutation ?? 'success') === 'success') {
        this.pluginInstalled = true;
        return success('installed');
      }
      return { exitCode: 17, stdout: '', stderr: 'ordinary plugin failure' };
    }
    if (key.startsWith('plugin marketplace remove')) {
      this.mutatingCalls.push(key);
      return { exitCode: 70, stdout: '', stderr: 'remove must remain manual' };
    }
    return { exitCode: 64, stdout: '', stderr: `unexpected command: ${key}` };
  }
}

interface ExecutingCodexFixture {
  dataDir: string;
  executablePath: string;
  receiptBasePath: string;
  request: SetupRequest;
  roots: SetupRoots;
}

async function withExecutingCodexFixture<T>(
  run: (fixture: ExecutingCodexFixture) => Promise<T>,
): Promise<T> {
  return withTemporarySetupRoot(async (root) => {
    const dataDir = join(root, 'thoth data');
    const executablePath = join(root, 'bin', 'thoth-mem.js');
    const roots: SetupRoots = {
      homeDir: join(root, 'home'),
      cwd: join(root, 'work'),
      packageRoot: join(root, 'package with spaces'),
      codexHome: join(root, 'Codex Home'),
    };
    const request = setupRequest('codex', { planOnly: false });
    await mkdir(join(roots.packageRoot, 'integrations', 'codex'), { recursive: true });
    await mkdir(roots.codexHome!, { recursive: true });
    await mkdir(dirname(executablePath), { recursive: true });
    await writeFile(executablePath, '#!/usr/bin/env node\n', 'utf8');
    return run({
      dataDir,
      executablePath,
      receiptBasePath: join(dataDir, 'setup', 'receipts'),
      request,
      roots,
    });
  });
}

async function runExecutingCodexSetup(
  fixture: ExecutingCodexFixture,
  executor: ExecutingCodexExecutor,
  options: {
    id?: string;
    receiptFault?: (event: ReceiptFaultEvent) => void | Promise<void>;
  } = {},
): Promise<SetupResult> {
  return inspectAndPlanSetup(fixture.request, {
    roots: fixture.roots,
    dataDir: fixture.dataDir,
    executablePath: fixture.executablePath,
    codexExecutor: executor,
    transaction: {
      idFactory: () => options.id ?? 'engine-codex-v2',
      now: () => new Date('2026-07-14T16:00:00.000Z'),
      receiptFault: options.receiptFault,
    },
  });
}

async function loadEngineV2Receipt(
  fixture: ExecutingCodexFixture,
  receiptPath: string,
): Promise<SetupReceiptV2> {
  const loaded = await loadSetupReceipt(receiptPath, {
    dataDir: fixture.dataDir,
    expectedBasePath: fixture.receiptBasePath,
  });
  expect(loaded.ok).toBe(true);
  if (!loaded.ok || loaded.receipt.schema_version !== 2) {
    throw new Error('expected signed V2 receipt');
  }
  return loaded.receipt;
}

function codexPlanStepNames(scope: SetupRequest['scope'], strategy: 'modern' | 'legacy'): string[] {
  if (strategy === 'modern') {
    return [
      `Inspect Codex plugin manager capabilities (${scope})`,
      `Inspect Codex manager state (${scope})`,
      `Register thoth-mem Codex marketplace (${scope})`,
      `Checkpoint Codex marketplace state (${scope})`,
      `Reread Codex manager state after marketplace (${scope})`,
      `Install thoth-mem Codex plugin (${scope})`,
      `Checkpoint Codex plugin state (${scope})`,
      `Reread Codex manager state after plugin (${scope})`,
      `Verify Codex plugin-manager setup (${scope})`,
    ];
  }
  return [
    'Inspect packaged legacy Codex assets',
    'Inspect legacy Codex managed configuration fragment',
    'Install legacy Codex assets',
    'Merge legacy Codex managed configuration fragment',
    'Write legacy Codex installation metadata',
    'Verify legacy Codex setup',
  ];
}

describe('inspects and plans with zero writes', () => {
  it.each([
    { scope: 'global' as const, projectPath: undefined, projectScoped: false },
    { scope: 'project' as const, projectPath: PROJECT_PATH, projectScoped: true },
  ])('plans exclusive modern ownership with zero writes in $scope scope', async ({
    scope,
    projectPath,
    projectScoped,
  }) => {
    const request = setupRequest('codex', {
      scope,
      ...(projectPath ? { projectPath } : {}),
    });
    const paths = resolveSetupPaths(request, ROOTS);
    const fileSystem = new FakeSetupFileSystem();
    const executor = new PlanningCodexExecutor({ projectScoped });
    const before = fileSystem.snapshot();
    const trace: string[] = [];

    const result = await inspectAndPlanSetup(request, {
      roots: ROOTS,
      fileSystem,
      codexExecutor: executor,
      transaction: { trace: ({ kind }) => trace.push(kind) },
    });

    expect(result).toMatchObject({ status: 'complete', changed: false, receipt: null });
    expect(result.steps.map((step) => step.name)).toEqual(codexPlanStepNames(scope, 'modern'));
    expect(result.steps.every((step) => !step.name.includes('legacy Codex'))).toBe(true);
    expect(executor.mutatingCalls).toEqual([]);
    expect(trace).toEqual([]);
    expectZeroWrites(fileSystem, before);
    expect(fileSystem.reads.every((path) => (
      path.startsWith(paths.targetRoot) || path.startsWith(ROOTS.packageRoot)
    ))).toBe(true);
  });

  it.each([
    { scope: 'global' as const, projectPath: undefined, projectScoped: false },
    { scope: 'project' as const, projectPath: PROJECT_PATH, projectScoped: true },
  ])('plans only legacy-owned paths with zero writes in $scope scope', async ({
    scope,
    projectPath,
    projectScoped,
  }) => {
    const request = setupRequest('codex', {
      scope,
      ...(projectPath ? { projectPath } : {}),
    });
    const paths = resolveSetupPaths(request, ROOTS);
    const fileSystem = new FakeSetupFileSystem();
    seedPackagedAssets(fileSystem, paths);
    const before = fileSystem.snapshot();
    const executor = new PlanningCodexExecutor({
      version: 'codex-cli 0.145.0',
      projectScoped,
    });

    const result = await inspectAndPlanSetup(request, {
      roots: ROOTS,
      fileSystem,
      codexExecutor: executor,
    });

    expect(result).toMatchObject({ status: 'complete', changed: false, receipt: null });
    expect(result.steps.map((step) => step.name)).toEqual(codexPlanStepNames(scope, 'legacy'));
    expect(result.steps.every((step) => !step.name.includes('marketplace'))).toBe(true);
    expect(result.steps.every((step) => !step.name.includes('plugin manager'))).toBe(true);
    expect(executor.mutatingCalls).toEqual([]);
    expectZeroWrites(fileSystem, before);
  });

  it('plans exactly one bounded manager action when only the modern plugin drifts', async () => {
    const request = setupRequest('codex');
    const fileSystem = new FakeSetupFileSystem();
    const executor = new PlanningCodexExecutor({ marketplace: true, plugin: false });
    const before = fileSystem.snapshot();

    const result = await inspectAndPlanSetup(request, {
      roots: ROOTS,
      fileSystem,
      codexExecutor: executor,
    });

    expect(result).toMatchObject({ status: 'complete', changed: false, receipt: null });
    expect(result.steps.filter((step) => (
      (step.name.startsWith('Register ') || step.name.startsWith('Install '))
      && step.outcome === 'planned'
    )).map((step) => step.name)).toEqual(['Install thoth-mem Codex plugin (global)']);
    expect(executor.mutatingCalls).toEqual([]);
    expectZeroWrites(fileSystem, before);
  });

  it('orders verified manager checkpointing before planned legacy fragment removal', async () => {
    const request = setupRequest('codex');
    const paths = resolveSetupPaths(request, ROOTS);
    const fileSystem = new FakeSetupFileSystem();
    seedManagedSetup(fileSystem, request, paths);
    const before = fileSystem.snapshot();
    const executor = new PlanningCodexExecutor({ marketplace: true, plugin: true });

    const result = await inspectAndPlanSetup(request, {
      roots: ROOTS,
      fileSystem,
      codexExecutor: executor,
    });

    const names = result.steps.map((step) => step.name);
    expect(result).toMatchObject({ status: 'complete', changed: false, receipt: null });
    expect(names).toContain('Checkpoint verified Codex manager state (global)');
    expect(names).toContain('Remove proven legacy Codex managed configuration fragment');
    expect(names.indexOf('Checkpoint verified Codex manager state (global)'))
      .toBeLessThan(names.indexOf('Remove proven legacy Codex managed configuration fragment'));
    expect(executor.mutatingCalls).toEqual([]);
    expectZeroWrites(fileSystem, before);
  });

  it('keeps ambiguous legacy residue non-forceable and zero-write', async () => {
    const request = setupRequest('codex', { force: true });
    const paths = resolveSetupPaths(request, ROOTS);
    const fileSystem = new FakeSetupFileSystem();
    seedPackagedAssets(fileSystem, paths);
    fileSystem.directory(paths.assetPath);
    fileSystem.file(join(paths.assetPath, 'lookalike.txt'), 'unowned-private-value');
    const before = fileSystem.snapshot();
    const executor = new PlanningCodexExecutor({ marketplace: true, plugin: true });

    const result = await inspectAndPlanSetup(request, {
      roots: ROOTS,
      fileSystem,
      codexExecutor: executor,
    });

    expect(result).toMatchObject({ status: 'requires_user_action', changed: false, receipt: null });
    expect(result.steps.some((step) => step.name.startsWith('Remove '))).toBe(false);
    expect(JSON.stringify(result)).not.toContain('unowned-private-value');
    expect(executor.mutatingCalls).toEqual([]);
    expectZeroWrites(fileSystem, before);
  });
  it('resolves global and explicit project targets without ambient home state', () => {
    const openCode = resolveSetupPaths(setupRequest('opencode'), ROOTS);
    expect(openCode).toEqual({
      targetRoot: join(ROOTS.xdgConfigHome!, 'opencode'),
      configPath: join(ROOTS.xdgConfigHome!, 'opencode', 'opencode.json'),
      configCandidates: [
        join(ROOTS.xdgConfigHome!, 'opencode', 'opencode.json'),
        join(ROOTS.xdgConfigHome!, 'opencode', 'opencode.jsonc'),
      ],
      assetPath: join(ROOTS.xdgConfigHome!, 'opencode', 'plugins', '.thoth-mem'),
      pluginEntryPath: join(ROOTS.xdgConfigHome!, 'opencode', 'plugins', 'thoth-mem.js'),
      metadataPath: join(
        ROOTS.xdgConfigHome!,
        'opencode',
        'plugins',
        '.thoth-mem',
        '.thoth-mem-managed.json',
      ),
      sourceAssetsPath: join(ROOTS.packageRoot, 'integrations', 'opencode'),
      sourceSharedPath: join(ROOTS.packageRoot, 'integrations', 'shared'),
      sourceSkillPath: join(ROOTS.packageRoot, 'plugin', 'skills', 'thoth-mem'),
    });

    const projectPath = PROJECT_PATH;
    const codex = resolveSetupPaths(setupRequest('codex', {
      scope: 'project',
      projectPath,
    }), ROOTS);
    expect(codex).toEqual({
      targetRoot: join(projectPath, '.codex'),
      configPath: join(projectPath, '.codex', 'config.toml'),
      configCandidates: [join(projectPath, '.codex', 'config.toml')],
      assetPath: join(projectPath, '.codex', 'plugins', 'thoth-mem'),
      pluginEntryPath: join(projectPath, '.codex', 'plugins', 'thoth-mem'),
      metadataPath: join(projectPath, '.codex', 'plugins', 'thoth-mem', '.thoth-mem-managed.json'),
      sourceAssetsPath: join(ROOTS.packageRoot, 'plugin'),
      sourceSharedPath: null,
      sourceSkillPath: null,
    });
  });

  it('requires the packaged OpenCode skill source before planning setup', async () => {
    const request = setupRequest('opencode');
    const paths = resolveSetupPaths(request, ROOTS);
    const fileSystem = new FakeSetupFileSystem();
    seedPackagedAssets(fileSystem, paths);
    fileSystem.entries.delete(paths.sourceSkillPath!);

    const result = await inspectAndPlanSetup(request, { roots: ROOTS, fileSystem });

    expect(result).toMatchObject({ status: 'failed', changed: false });
    expect(result.diagnostics).toEqual([
      `Packaged OpenCode skill assets are unavailable: ${join(
        ROOTS.packageRoot,
        'plugin',
        'skills',
        'thoth-mem',
      )}`,
    ]);
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
      'planned',
      'planned',
      'planned',
      'planned',
    ]);
    expect(planned.steps.map((step) => step.name)).toEqual([
      `Inspect packaged OpenCode assets: ${paths.sourceAssetsPath}`,
      `Inspect OpenCode configuration: ${paths.configPath}`,
      'Prepare target-bound temporary OpenCode recovery journal',
      `Replace complete OpenCode managed assets: ${paths.assetPath}`,
      `Replace canonical OpenCode plugin entry: ${paths.pluginEntryPath}`,
      `Merge managed OpenCode configuration: ${paths.configPath}`,
      'Verify exact OpenCode setup post-state',
      'Remove target-bound OpenCode recovery and rollback evidence',
      'Report manual OpenCode restart requirement',
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

  it('plans destructive OpenCode convergence, temporary recovery, cleanup, and restart with zero writes', async () => {
        const request = setupRequest('opencode');
        const paths = resolveSetupPaths(request, ROOTS);
        const fileSystem = new FakeSetupFileSystem();
        seedPackagedAssets(fileSystem, paths);
        fileSystem.directory(paths.assetPath);
        fileSystem.file(join(paths.assetPath, 'obsolete-private.txt'), 'private');
        const before = fileSystem.snapshot();

        const result = await inspectAndPlanSetup(request, { roots: ROOTS, fileSystem });

        expect(result).toMatchObject({ status: 'complete', changed: false, receipt: null });
        expect(result.steps.map((step) => step.name)).toEqual([
          `Inspect packaged OpenCode assets: ${paths.sourceAssetsPath}`,
          `Inspect OpenCode configuration: ${paths.configPath}`,
          'Prepare target-bound temporary OpenCode recovery journal',
          `Replace complete OpenCode managed assets: ${paths.assetPath}`,
          `Replace canonical OpenCode plugin entry: ${paths.pluginEntryPath}`,
          `Merge managed OpenCode configuration: ${paths.configPath}`,
          'Verify exact OpenCode setup post-state',
          'Remove target-bound OpenCode recovery and rollback evidence',
          'Report manual OpenCode restart requirement',
        ]);
        expect(result.steps.slice(2).every((step) => step.outcome === 'planned')).toBe(true);
        expect(result.diagnostics).toContain(
          'OpenCode convergence replaces the complete managed asset directory and canonical plugin entry.',
        );
        expect(result.diagnostics).toContain('Changed OpenCode setup requires a manual host restart.');
        expectZeroWrites(fileSystem, before);
      });

      it('returns an idempotent no-op for verified OpenCode project setup', async () => {
    const request = setupRequest('opencode', {
      scope: 'project',
      projectPath: PROJECT_PATH,
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
      'skipped',
      'skipped',
      'confirmed',
      'skipped',
      'skipped',
    ]);
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(fileSystem.reads.some((path) => path.startsWith(ROOTS.xdgConfigHome!))).toBe(false);
    expectZeroWrites(fileSystem, before);
  });

  it.each([
        { scope: 'global' as const, projectPath: undefined },
        { scope: 'project' as const, projectPath: PROJECT_PATH },
      ])('plans every non-current OpenCode state for convergence without force in $scope scope', async ({
        scope,
        projectPath,
      }) => {
        const request = setupRequest('opencode', {
          scope,
          ...(projectPath ? { projectPath } : {}),
        });
        const paths = resolveSetupPaths(request, ROOTS);
        const metadataPath = join(paths.assetPath, 'thoth-mem.installation.json');
        const cases: Array<{ name: string; mutate: (fileSystem: FakeSetupFileSystem) => void }> = [
          {
            name: 'older metadata',
            mutate: (fileSystem) => fileSystem.file(
              metadataPath,
              managedMetadata(request, paths).replace(getVersion(), '0.0.1'),
            ),
          },
          {
            name: 'newer metadata',
            mutate: (fileSystem) => fileSystem.file(
              metadataPath,
              managedMetadata(request, paths).replace(getVersion(), '999.0.0'),
            ),
          },
          { name: 'missing metadata', mutate: (fileSystem) => fileSystem.entries.delete(metadataPath) },
          { name: 'malformed metadata', mutate: (fileSystem) => fileSystem.file(metadataPath, '{') },
          {
            name: 'same-version asset drift',
            mutate: (fileSystem) => fileSystem.file(
              join(paths.assetPath, 'opencode', 'plugin.mjs'),
              'drifted-private-value',
            ),
          },
        ];

        for (const fixture of cases) {
          const fileSystem = new FakeSetupFileSystem();
          seedManagedSetup(fileSystem, request, paths);
          fixture.mutate(fileSystem);
          const before = fileSystem.snapshot();

          const result = await inspectAndPlanSetup(request, { roots: ROOTS, fileSystem });

          expect(result, fixture.name).toMatchObject({
            status: 'complete',
            changed: false,
            receipt: null,
          });
          expect(result.steps.find((step) => step.name.startsWith('Replace complete OpenCode managed assets'))?.outcome)
            .toBe('planned');
          expect(result.manual_actions.join('\n')).not.toContain('--force');
          expect(JSON.stringify(result)).not.toContain('drifted-private-value');
          expectZeroWrites(fileSystem, before);
        }
      });

      it('treats the bundled OpenCode skill as part of managed asset drift', async () => {
    const request = setupRequest('opencode', {
      scope: 'project',
      projectPath: PROJECT_PATH,
    });
    const paths = resolveSetupPaths(request, ROOTS);
    const installedSkillPath = join(paths.assetPath, 'opencode', 'skills', 'thoth-mem');
    const fileSystem = new FakeSetupFileSystem();
    seedManagedSetup(fileSystem, request, paths);

    const clean = await inspectAndPlanSetup(request, { roots: ROOTS, fileSystem });
    expect(clean).toMatchObject({ status: 'complete', changed: false });

    fileSystem.file(join(installedSkillPath, 'SKILL.md'), 'drifted-private-value');
    const drifted = await inspectAndPlanSetup(request, { roots: ROOTS, fileSystem });
    expect(drifted.status).toBe('complete');
    expect(drifted.steps.find((step) => step.name.startsWith('Replace complete OpenCode managed assets'))?.outcome)
      .toBe('planned');
    expect(JSON.stringify(drifted)).not.toContain('drifted-private-value');
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
    expect(blocked.status).toBe('complete');
    expect(blocked.steps).toContainEqual({
      name: `Merge managed OpenCode configuration: ${paths.configCandidates[1]}`,
      outcome: 'planned',
    });
    expect(blocked.diagnostics.join('\n')).not.toContain('Multiple OpenCode configuration files');
  });

  it('does not trust matching metadata when managed config or assets drift', async () => {
    const request = setupRequest('opencode', {
      scope: 'project',
      projectPath: PROJECT_PATH,
    });
    const paths = resolveSetupPaths(request, ROOTS);

    const configDrift = new FakeSetupFileSystem();
    seedManagedSetup(configDrift, request, paths);
    configDrift.file(paths.configPath, '{ "unrelated_secret": "must-not-leak" }');
    const configBlocked = await inspectAndPlanSetup(request, {
      roots: ROOTS,
      fileSystem: configDrift,
    });
    expect(configBlocked.status).toBe('complete');
    expect(configBlocked.steps.find((step) => step.name.startsWith('Merge managed'))?.outcome)
      .toBe('planned');
    expect(JSON.stringify(configBlocked)).not.toContain('must-not-leak');

    const assetDrift = new FakeSetupFileSystem();
    seedManagedSetup(assetDrift, request, paths);
    assetDrift.file(join(paths.assetPath, 'opencode', 'plugin.mjs'), 'drifted-secret');
    const assetBlocked = await inspectAndPlanSetup(request, {
      roots: ROOTS,
      fileSystem: assetDrift,
    });
    expect(assetBlocked.status).toBe('complete');
    expect(assetBlocked.steps.find((step) => step.name.startsWith('Replace complete OpenCode managed assets'))?.outcome)
      .toBe('planned');
    expect(JSON.stringify(assetBlocked)).not.toContain('drifted-secret');

    const forced = await inspectAndPlanSetup(
      { ...request, force: true },
      { roots: ROOTS, fileSystem: assetDrift },
    );
    expect(forced.status).toBe('complete');
    expect(forced.steps.find((step) => step.name.startsWith('Replace complete OpenCode managed assets'))?.outcome)
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
    expect(blocked.status).toBe('complete');
    expect(blocked.changed).toBe(false);
    expect(blocked.steps.find((step) => step.name.startsWith('Replace complete OpenCode managed assets'))?.outcome)
      .toBe('planned');
    expectZeroWrites(fileSystem, before);

    const forced = await inspectAndPlanSetup({ ...request, force: true }, {
      roots: ROOTS,
      fileSystem,
    });
    expect(forced.status).toBe('complete');
    expect(forced.changed).toBe(false);
    expect(forced.steps.find((step) => step.name.startsWith('Replace complete OpenCode managed assets'))?.outcome)
      .toBe('planned');
    expect(forced.diagnostics.join('\n')).not.toContain('Force would replace');
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
    const projectPath = PROJECT_PATH;
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

describe('projects Codex execution evidence without losing phase semantics', () => {
  it('keeps result, signed receipt, JSON, and human output aligned for mixed outcomes', async () => {
    await withExecutingCodexFixture(async (fixture) => {
      const executor = new ExecutingCodexExecutor({ pluginMutation: 'ordinary_failure' });
      const result = await runExecutingCodexSetup(fixture, executor, { id: 'mixed-outcome-v2' });

      expect(result.status).toBe('partial');
      expect(getSetupExitCode(result.status)).toBe(2);
      expect(result.steps).toEqual(expect.arrayContaining([
        { name: 'Register thoth-mem Codex marketplace (global)', outcome: 'confirmed' },
        { name: 'Checkpoint Codex marketplace state (global)', outcome: 'confirmed' },
        { name: 'Reread Codex manager state after marketplace (global)', outcome: 'confirmed' },
        { name: 'Install thoth-mem Codex plugin (global)', outcome: 'failed' },
        { name: 'Checkpoint Codex plugin state (global)', outcome: 'failed' },
        { name: 'Reread Codex manager state after plugin (global)', outcome: 'failed' },
        { name: 'Verify Codex plugin-manager setup (global)', outcome: 'failed' },
      ]));
      expect(result.steps.some((step) => step.outcome === 'planned')).toBe(false);

      const receipt = await loadEngineV2Receipt(fixture, result.receipt!);
      expect(receipt.status).toBe('partial');
      expect(receipt.steps.find((step) => step.id === 'codex-marketplace')?.outcome)
        .toBe('confirmed');
      expect(receipt.steps.find((step) => step.id === 'codex-plugin')?.outcome).toBe('failed');
      expect(receipt.steps.find((step) => step.id === 'verify')?.outcome).toBe('failed');
      expect(receipt.external_checkpoints.map(({ id, outcome }) => ({ id, outcome }))).toEqual([
        { id: 'codex-marketplace', outcome: 'confirmed' },
        { id: 'codex-marketplace', outcome: 'confirmed' },
        { id: 'codex-plugin', outcome: 'failed' },
        { id: 'codex-plugin', outcome: 'failed' },
      ]);

      expect(JSON.parse(formatSetupResult(result, true))).toEqual(result);
      const human = formatSetupResult(result, false);
      expect(human).toContain('Status: partial');
      expect(human).toContain('Checkpoint Codex plugin state (global): failed');
      expect(human).toContain('Verify Codex plugin-manager setup (global): failed');
    });
  });

  it('preserves checkpoint boundaries, reread precedence, and existing V2 limits', async () => {
    for (const failedRename of [2, 3]) {
      await withExecutingCodexFixture(async (fixture) => {
        const executor = new ExecutingCodexExecutor();
        let receiptRenames = 0;
        const result = await runExecutingCodexSetup(fixture, executor, {
          id: `checkpoint-boundary-${failedRename}`,
          receiptFault: ({ point }) => {
            if (point === 'receipt-rename' && ++receiptRenames === failedRename) {
              throw new Error('injected checkpoint persistence failure');
            }
          },
        });

        expect(result.status).toBe('failed');
        expect(executor.mutatingCalls).toEqual([
          'plugin marketplace add EremesNG/thoth-mem',
        ]);
        const receipt = await loadEngineV2Receipt(fixture, result.receipt!);
        expect(receipt.external_checkpoints).toHaveLength(failedRename === 2 ? 0 : 1);
        expect(receipt.steps.find((step) => step.id === 'codex-marketplace')?.outcome)
          .toBe(failedRename === 2 ? 'planned' : 'confirmed');
        const mutationIndex = executor.calls.findIndex((call) => (
          normalizedCodexCommand(call) === 'plugin marketplace add EremesNG/thoth-mem'
        ));
        const callsAfterMutation = executor.calls
          .slice(mutationIndex + 1)
          .map(normalizedCodexCommand);
        expect(callsAfterMutation.filter((call) => call === 'plugin marketplace list'))
          .toHaveLength(failedRename === 2 ? 0 : 1);
        expect(callsAfterMutation).not.toContain('plugin add thoth-mem');
      });
    }

    await withExecutingCodexFixture(async (fixture) => {
      const baselineResult = await runExecutingCodexSetup(
        fixture,
        new ExecutingCodexExecutor(),
        { id: 'limits-baseline-v2' },
      );
      const baseline = await loadEngineV2Receipt(fixture, baselineResult.receipt!);
      const { hmac_sha256: _signature, ...unsigned } = baseline;
      const persistence = {
        dataDir: fixture.dataDir,
        expectedBasePath: fixture.receiptBasePath,
      };
      const invalidDiagnostic = createSetupReceipt({
        ...unsigned,
        id: 'diagnostic-limit-v2',
        external_checkpoints: [{
          ...baseline.external_checkpoints[0]!,
          diagnostic: 'x'.repeat(513),
        }],
      });
      const diagnosticPath = resolveSetupReceiptPaths(
        fixture.receiptBasePath,
        invalidDiagnostic.id,
      ).receiptPath;
      await expect(persistSetupReceipt(diagnosticPath, invalidDiagnostic, persistence))
        .resolves.toEqual({ ok: false, reason: 'receipt_schema_invalid' });

      const tooManyCheckpoints = createSetupReceipt({
        ...unsigned,
        id: 'checkpoint-limit-v2',
        external_checkpoints: Array.from({ length: 257 }, (_, index) => ({
          sequence: index + 1,
          id: index % 2 === 0 ? 'codex-marketplace' as const : 'codex-plugin' as const,
          outcome: 'confirmed' as const,
          observed_at: '2026-07-14T16:00:00.000Z',
        })),
      });
      const checkpointPath = resolveSetupReceiptPaths(
        fixture.receiptBasePath,
        tooManyCheckpoints.id,
      ).receiptPath;
      await expect(persistSetupReceipt(checkpointPath, tooManyCheckpoints, persistence))
        .resolves.toEqual({ ok: false, reason: 'receipt_schema_invalid' });

      const oversized = createSetupReceipt({
        ...unsigned,
        id: 'byte-limit-v2',
        target: 'x'.repeat((1024 * 1024) + 1),
      });
      const oversizedPath = resolveSetupReceiptPaths(
        fixture.receiptBasePath,
        oversized.id,
      ).receiptPath;
      await expect(persistSetupReceipt(oversizedPath, oversized, persistence))
        .resolves.toEqual({ ok: false, reason: 'receipt_schema_invalid' });
    });

    await withExecutingCodexFixture(async (fixture) => {
      const executor = new ExecutingCodexExecutor({
        marketplaceMutation: 'nonzero_verified',
        pluginInitially: true,
      });
      const result = await runExecutingCodexSetup(fixture, executor, {
        id: 'reread-precedence-v2',
      });
      const receipt = await loadEngineV2Receipt(fixture, result.receipt!);

      expect(result.status).toBe('complete');
      expect(receipt.external_checkpoints
        .filter((checkpoint) => checkpoint.id === 'codex-marketplace')
        .map((checkpoint) => checkpoint.outcome)).toEqual(['failed', 'confirmed']);
      expect(result.steps).toContainEqual({
        name: 'Checkpoint Codex marketplace state (global)',
        outcome: 'failed',
      });
      expect(result.steps).toContainEqual({
        name: 'Reread Codex manager state after marketplace (global)',
        outcome: 'confirmed',
      });
    });
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

  it('normalizes OpenCode owned and invalid parent values without force and recreates malformed roots', () => {
        const ownedDrift = planOpenCodeManagedConfig({
          before: '{ "theme": "keep", "mcp": { "thoth-mem": { "command": ["wrong"] } } }',
          force: false,
          mcpValue: OPENCODE_MCP_VALUE,
        });
        expect(ownedDrift).toMatchObject({ changed: true, forced: false, conflicts: [] });
        expect(ownedDrift.after).toContain('"theme": "keep"');
        expect(ownedDrift.after).not.toContain('wrong');

        const invalidParent = planOpenCodeManagedConfig({
          before: '{ "theme": "keep", "mcp": false }',
          force: false,
          mcpValue: OPENCODE_MCP_VALUE,
        });
        expect(invalidParent).toMatchObject({ changed: true, conflicts: [] });
        expect(invalidParent.after).toContain('"theme": "keep"');
        expect(invalidParent.verification.ownedValuesMatch).toBe(true);

        const malformed = planOpenCodeManagedConfig({
          before: Buffer.from([0xff, 0x7b, 0x22, 0x73, 0x65, 0x63, 0x72, 0x65, 0x74]).toString('latin1'),
          force: false,
          mcpValue: OPENCODE_MCP_VALUE,
        });
        expect(malformed).toMatchObject({
          changed: true,
          conflicts: [],
          verification: { beforeValid: false, afterValid: true, ownedValuesMatch: true },
        });
        expect(malformed.after).not.toContain('secret');
        expect(JSON.parse(malformed.after)).toEqual({ mcp: { 'thoth-mem': OPENCODE_MCP_VALUE } });
      });

      it('keeps exact OpenCode ownership idempotent and converges drift without force', () => {
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
    expect(blocked.changed).toBe(true);
    expect(blocked.conflicts).toEqual([]);
    expect(blocked.after).toContain('"theme": "unchanged"');
    expect(blocked.after).not.toContain('wrong-command');

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

  it('recreates malformed OpenCode config without leaking values', () => {
    const before = '{ "api_token": "do-not-leak",';
    const plan = planOpenCodeManagedConfig({
      before,
      force: true,
      mcpValue: OPENCODE_MCP_VALUE,
    });

    expect(plan.changed).toBe(true);
    expect(plan.verification.beforeValid).toBe(false);
    expect(plan.conflicts).toEqual([]);
    expect(plan.after).not.toContain('do-not-leak');
    expect(JSON.parse(plan.after)).toEqual({ mcp: { 'thoth-mem': OPENCODE_MCP_VALUE } });
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

  it('authoritatively replaces cross-kind and final linked targets without following destinations', async (context) => {
        await withTemporarySetupRoot(async (root) => {
          const targetRoot = join(root, 'managed target');
          const sourceRoot = join(root, 'package source');
          const source = join(sourceRoot, 'assets');
          const outside = join(root, 'outside destination');
          const targetPath = join(targetRoot, 'plugins', '.thoth-mem');
          const sentinel = join(outside, 'sentinel.txt');
          await mkdir(source, { recursive: true });
          await mkdir(dirname(targetPath), { recursive: true });
          await mkdir(outside, { recursive: true });
          await writeFile(join(source, 'current.txt'), 'current', 'utf8');
          await writeFile(sentinel, 'destination-unchanged', 'utf8');
          try {
            await symlink(outside, targetPath, process.platform === 'win32' ? 'junction' : 'dir');
          } catch (error) {
            const code = error instanceof Error && 'code' in error
              ? (error as NodeJS.ErrnoException).code
              : undefined;
            if (code === 'EPERM' || code === 'EACCES') {
              context.skip();
              return;
            }
            throw error;
          }
          const originalLink = await readlink(targetPath);

          const replaced = await applyAtomicFilesystemChanges({
            targetRoot,
            sourceRoot,
            backupRoot: join(root, 'backups'),
            changes: [{
              kind: 'directory',
              targetPath,
              entries: [{ sourcePath: source, targetRelativePath: '.' }],
              replaceExisting: true,
            }],
          });

          expect(replaced.outcome).toBe('confirmed');
          expect((await lstat(targetPath)).isDirectory()).toBe(true);
          expect(await readFile(join(targetPath, 'current.txt'), 'utf8')).toBe('current');
          expect(await readFile(sentinel, 'utf8')).toBe('destination-unchanged');

          await rm(targetPath, { recursive: true, force: true });
          await symlink(outside, targetPath, process.platform === 'win32' ? 'junction' : 'dir');
          const restored = await applyAtomicFilesystemChanges({
            targetRoot,
            sourceRoot,
            backupRoot: join(root, 'restore backups'),
            changes: [{
              kind: 'directory',
              targetPath,
              entries: [{ sourcePath: source, targetRelativePath: '.' }],
              replaceExisting: true,
            }],
          }, {
            fault: ({ point }) => {
              if (point === 'after-rename') {
                throw new Error('restore linked pre-state');
              }
            },
          });

          expect(restored.outcome).toBe('failed');
          expect(restored.unrestored).toEqual([]);
          expect((await lstat(targetPath)).isSymbolicLink()).toBe(true);
          expect(await readlink(targetPath)).toBe(originalLink);
          expect(await readFile(sentinel, 'utf8')).toBe('destination-unchanged');
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
