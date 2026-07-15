import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  inspectAndPlanSetup,
  type SetupEngineOptions,
} from '../../src/setup/engine.js';
import {
  createNodeCodexCommandExecutor,
  executeCodexCli,
  inspectCodexCli,
  type CodexCliPlan,
  type CodexExternalCheckpoint,
} from '../../src/setup/codex-cli.js';
import {
  resolveSetupPaths,
  type SetupPaths,
  type SetupRoots,
} from '../../src/setup/paths.js';
import {
  loadSetupReceipt,
  type SetupReceiptV1,
} from '../../src/setup/receipt.js';
import {
  getSetupExitCode,
  type SetupRequest,
  type SetupResult,
} from '../../src/setup/types.js';

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  outputTruncated?: boolean;
  error?: string;
  errorCode?: string;
}

interface CommandExecutionOptions {
  timeoutMs: number;
}

interface CommandExecutionRequest {
  args: string[];
  timeoutMs?: number;
}

interface ControlledCodexOptions {
  versionOutput?: string;
  versionProbe?: CommandResult;
  marketplaceInstalled?: boolean;
  pluginInstalled?: boolean;
  marketplaceAvailable?: boolean;
  pluginAvailable?: boolean;
  projectScoped?: boolean;
  inlineProjectScoped?: boolean;
  failMarketplaceAdd?: boolean;
  failPluginAdd?: boolean;
  unverifiableMarketplace?: boolean;
  unverifiablePlugin?: boolean;
  rootProbe?: CommandResult;
  oversizedListOutput?: boolean;
  marketplaceListOutput?: string;
  pluginListOutput?: string;
  marketplaceListJson?: boolean;
  pluginListJson?: boolean;
  marketplaceListResults?: CommandResult[];
  pluginListResults?: CommandResult[];
  marketplaceRemoveAvailable?: boolean;
  marketplaceRemoveHelp?: string;
  marketplaceRemoveJson?: boolean;
  pluginSelector?: '<PLUGIN>' | '<PLUGIN[@MARKETPLACE]>';
  marketplaceMutationDurationMs?: number;
  pluginMutationDurationMs?: number;
  marketplaceVisibilityAfterPolls?: number;
  marketplaceMutationResult?: CommandResult;
  pluginMutationResult?: CommandResult;
  marketplaceReconciliationResult?: CommandResult;
  onExecute?: (args: readonly string[]) => void;
}

class ControlledCodexExecutor {
  readonly calls: string[][] = [];
  readonly mutatingCalls: string[][] = [];
  readonly executionRequests: CommandExecutionRequest[] = [];
  marketplaceInstalled: boolean;
  pluginInstalled: boolean;
  private readonly options: ControlledCodexOptions;
  private marketplaceMutationAttempted = false;
  private marketplacePollsAfterMutation = 0;
  private marketplaceListResultIndex = 0;
  private pluginListResultIndex = 0;

  constructor(options: ControlledCodexOptions = {}) {
    this.options = options;
    this.marketplaceInstalled = options.marketplaceInstalled ?? false;
    this.pluginInstalled = options.pluginInstalled ?? false;
  }

  async execute(
    args: readonly string[],
    execution?: CommandExecutionOptions,
  ): Promise<CommandResult> {
    const command = [...args];
    this.calls.push(command);
    this.executionRequests.push({
      args: command,
      ...(execution ? { timeoutMs: execution.timeoutMs } : {}),
    });
    this.options.onExecute?.(command);

    if (command.join(' ') === '--version') {
      return this.options.versionProbe
        ?? success(this.options.versionOutput ?? 'codex-cli 0.144.0');
    }
    if (command.join(' ') === '--help') {
      return this.options.rootProbe ?? success([
        'Usage: codex [OPTIONS] [PROMPT]',
        'Commands:',
        '  plugin  Manage Codex plugins',
      ].join('\n'));
    }
    if (command.join(' ') === 'plugin --help') {
      const commands = [
        'Usage: codex plugin <COMMAND>',
        'Commands:',
        '  list         List installed plugins',
        '  marketplace  Manage plugin marketplaces',
      ];
      if (this.options.pluginAvailable !== false) {
        commands.push('  add          Install a plugin');
      }
      return success(commands.join('\n'));
    }
    if (command.join(' ') === 'plugin marketplace --help') {
      const commands = [
        'Usage: codex plugin marketplace <COMMAND>',
        'Commands:',
        '  list  List registered marketplaces',
      ];
      if (this.options.marketplaceAvailable !== false) {
        commands.push('  add   Register a marketplace');
      }
      if (this.options.marketplaceRemoveAvailable) {
        commands.push('  remove  Remove a marketplace');
      }
      return success(commands.join('\n'));
    }
    if (command.join(' ') === 'plugin marketplace add --help') {
      return success(commandHelp(
        'codex plugin marketplace add [OPTIONS] <SOURCE>',
        this.options.projectScoped,
        this.options.inlineProjectScoped,
      ));
    }
    if (command.join(' ') === 'plugin marketplace list --help') {
      return success(commandHelp(
        'codex plugin marketplace list [OPTIONS]',
        this.options.projectScoped,
        this.options.inlineProjectScoped,
        this.options.marketplaceListJson,
      ));
    }
    if (command.join(' ') === 'plugin marketplace remove --help') {
      return success(this.options.marketplaceRemoveHelp ?? commandHelp(
        'codex plugin marketplace remove [OPTIONS] <NAME>',
        this.options.projectScoped,
        this.options.inlineProjectScoped,
        this.options.marketplaceRemoveJson,
      ));
    }
    if (command.join(' ') === 'plugin add --help') {
      return success(commandHelp(
        `codex plugin add [OPTIONS] ${this.options.pluginSelector ?? '<PLUGIN>'}`,
        this.options.projectScoped,
        this.options.inlineProjectScoped,
      ));
    }
    if (command.join(' ') === 'plugin list --help') {
      return success(commandHelp(
        'codex plugin list [OPTIONS]',
        this.options.projectScoped,
        this.options.inlineProjectScoped,
        this.options.pluginListJson,
      ));
    }

    const normalized = withoutProjectScope(command).filter((argument) => argument !== '--json');
    const key = normalized.join(' ');
    if (key === 'plugin marketplace list') {
      if (this.marketplaceMutationAttempted) {
        this.marketplacePollsAfterMutation += 1;
        if (this.options.marketplaceReconciliationResult) {
          return this.options.marketplaceReconciliationResult;
        }
        if (
          this.options.marketplaceVisibilityAfterPolls !== undefined
          && this.marketplacePollsAfterMutation >= this.options.marketplaceVisibilityAfterPolls
        ) {
          this.marketplaceInstalled = true;
        }
      }
      if (this.options.oversizedListOutput) {
        return {
          exitCode: 0,
          stdout: `private-token-${'x'.repeat(100_000)}`,
          stderr: '',
          outputTruncated: true,
        };
      }
      if (this.options.marketplaceListResults) {
        const result = this.options.marketplaceListResults[
          Math.min(
            this.marketplaceListResultIndex,
            this.options.marketplaceListResults.length - 1,
          )
        ];
        this.marketplaceListResultIndex += 1;
        return result ?? failure(64, 'missing controlled marketplace list result');
      }
      return success(
        this.options.marketplaceListOutput
          ?? (command.includes('--json')
            ? marketplaceJson(this.marketplaceInstalled)
            : legacyMarketplaceInventory(this.marketplaceInstalled)),
      );
    }
    if (key === 'plugin list') {
      if (this.options.pluginListResults) {
        const result = this.options.pluginListResults[
          Math.min(this.pluginListResultIndex, this.options.pluginListResults.length - 1)
        ];
        this.pluginListResultIndex += 1;
        return result ?? failure(64, 'missing controlled plugin list result');
      }
      return success(
        this.options.pluginListOutput
          ?? (command.includes('--json')
            ? pluginJson(this.pluginInstalled)
            : legacyPluginInventory(this.pluginInstalled)),
      );
    }
    if (key === 'plugin marketplace add EremesNG/thoth-mem') {
      this.mutatingCalls.push(command);
      this.marketplaceMutationAttempted = true;
      if (this.options.marketplaceMutationResult) {
        return this.options.marketplaceMutationResult;
      }
      if (
        this.options.marketplaceMutationDurationMs !== undefined
        && this.options.marketplaceMutationDurationMs > (execution?.timeoutMs ?? 5_000)
      ) {
        return { exitCode: null, stdout: '', stderr: '', timedOut: true };
      }
      if (this.options.failMarketplaceAdd) {
        return failure(17, 'marketplace rejected private-token');
      }
      if (
        !this.options.unverifiableMarketplace
        && this.options.marketplaceVisibilityAfterPolls === undefined
      ) {
        this.marketplaceInstalled = true;
      }
      return success('registered');
    }
    if (key === 'plugin add thoth-mem') {
      this.mutatingCalls.push(command);
      if (this.options.pluginMutationResult) {
        return this.options.pluginMutationResult;
      }
      if (
        this.options.pluginMutationDurationMs !== undefined
        && this.options.pluginMutationDurationMs > (execution?.timeoutMs ?? 5_000)
      ) {
        return { exitCode: null, stdout: '', stderr: '', timedOut: true };
      }
      if (this.options.failPluginAdd) {
        return failure(19, 'plugin rejected private-token');
      }
      if (!this.options.unverifiablePlugin) {
        this.pluginInstalled = true;
      }
      return success('installed');
    }
    if (key === 'plugin marketplace remove thoth-mem') {
      this.mutatingCalls.push(command);
      return failure(65, 'automatic marketplace removal is forbidden in this fixture');
    }
    return failure(64, 'unexpected command');
  }

}

class VirtualCodexTiming {
  nowMs = 0;
  readonly sleeps: number[] = [];

  readonly now = (): number => this.nowMs;

  readonly sleep = async (delayMs: number): Promise<void> => {
    this.sleeps.push(delayMs);
    this.nowMs += delayMs;
  };
}

interface CodexFixture {
  root: string;
  dataDir: string;
  projectPath: string;
  roots: SetupRoots;
  request: SetupRequest;
  paths: SetupPaths;
}

function success(stdout: string): CommandResult {
  return { exitCode: 0, stdout, stderr: '' };
}

function commandHelp(
  usage: string,
  projectScoped = false,
  inlineProjectScoped = false,
  json = false,
): string {
  const options = [
    ...(projectScoped && !inlineProjectScoped
      ? ['  --project <PATH>  Use project-local plugin state']
      : []),
    ...(json ? ['  --json            Print JSON output'] : []),
  ];
  if (projectScoped && inlineProjectScoped) {
    return `Usage: ${usage} [--project <PATH>]${json ? ' [--json]' : ''}`;
  }
  return options.length > 0
    ? `Usage: ${usage}\nOptions:\n${options.join('\n')}`
    : `Usage: ${usage}`;
}

function marketplaceJson(
  installed: boolean,
  overrides: { name?: string; sourceType?: string; source?: string } = {},
): string {
  return JSON.stringify({
    marketplaces: installed
      ? [{
          name: overrides.name ?? 'thoth-mem',
          root: 'C:\\Users\\Example User\\.codex\\plugins\\marketplaces\\thoth-mem',
          marketplaceSource: {
            sourceType: overrides.sourceType ?? 'git',
            source: overrides.source ?? 'https://github.com/EremesNG/thoth-mem.git',
          },
        }]
      : [{
          name: 'official',
          root: 'C:\\Program Files\\Codex\\plugins\\marketplaces\\official',
          marketplaceSource: {
            sourceType: 'builtin',
            source: 'official',
          },
        }],
  });
}

function pluginJson(
  installed: boolean,
  overrides: { installed?: unknown[]; available?: unknown[] } = {},
): string {
  const defaultInstalled = installed
    ? [{
        pluginId: 'thoth-mem@thoth-mem',
        name: 'thoth-mem',
        marketplaceName: 'thoth-mem',
        version: '1.0.0',
        source: 'https://github.com/EremesNG/thoth-mem.git',
        installPath: 'C:\\Users\\Example User\\.codex\\plugins\\cache\\thoth-mem',
        installed: true,
        enabled: true,
      }]
    : [];
  const defaultAvailable = installed
    ? []
    : [{
        pluginId: 'thoth-mem@thoth-mem',
        name: 'thoth-mem',
        marketplaceName: 'thoth-mem',
        version: '1.0.0',
        installed: false,
        enabled: false,
      }];
  return JSON.stringify({
    installed: overrides.installed ?? defaultInstalled,
    available: overrides.available ?? defaultAvailable,
  });
}

function legacyPluginList(
  status: string,
  pluginId = 'thoth-mem@thoth-mem',
): string {
  return [
    'Marketplace: thoth-mem',
    'Root: C:\\Users\\Example User\\.codex\\plugins\\marketplaces\\thoth-mem',
    '',
    'PLUGIN  STATUS  VERSION  PATH',
    `  ${pluginId} ${status} 0.3.7 C:\\Users\\Example User\\Codex Data\\thoth-mem`,
  ].join('\n');
}

function legacyMarketplaceInventory(installed: boolean): string {
  return [
    'NAME  SOURCE',
    ...(installed
      ? ['thoth-mem  https://github.com/EremesNG/thoth-mem.git']
      : ['official  builtin']),
  ].join('\n');
}

function legacyPluginInventory(installed: boolean): string {
  return installed
    ? legacyPluginList('installed, enabled')
    : 'PLUGIN  STATUS  VERSION  PATH';
}

function failure(exitCode: number, stderr: string): CommandResult {
  return { exitCode, stdout: '', stderr };
}

function strategyOf(plan: CodexCliPlan): unknown {
  return (plan as CodexCliPlan & { strategy?: unknown }).strategy;
}

function evidenceOf(plan: CodexCliPlan): unknown {
  return (plan as CodexCliPlan & { evidence?: unknown }).evidence;
}

function operationEvidenceOf(result: unknown): Array<Record<string, unknown>> {
  const operations = (result as { operations?: unknown }).operations;
  return Array.isArray(operations)
    ? operations as Array<Record<string, unknown>>
    : [];
}

function checkpointPhaseOf(
  checkpoint: CodexExternalCheckpoint,
): 'attempt' | 'reread' | undefined {
  return (checkpoint as CodexExternalCheckpoint & {
    phase?: 'attempt' | 'reread';
  }).phase;
}

function collisionFailure(extra = ''): CommandResult {
  return failure(17, [
    "marketplace 'thoth-mem' is already added from a different source; remove it before adding this source",
    extra,
  ].filter(Boolean).join('\n'));
}

function withoutProjectScope(args: string[]): string[] {
  const index = args.indexOf('--project');
  if (index < 0) {
    return args;
  }
  return [...args.slice(0, index), ...args.slice(index + 2)];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    return error instanceof Error
      && 'code' in error
      && (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? false
      : Promise.reject(error);
  }
}

async function withCodexFixture<T>(
  run: (fixture: CodexFixture) => Promise<T>,
  scope: SetupRequest['scope'] = 'global',
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'thoth-mem codex cli '));
  const packageRoot = join(root, 'package with spaces');
  const projectPath = join(root, 'project with spaces');
  const roots: SetupRoots = {
    homeDir: join(root, 'home'),
    cwd: root,
    packageRoot,
    codexHome: join(root, 'Codex Home'),
  };
  const request: SetupRequest = {
    harness: 'codex',
    scope,
    ...(scope === 'project' ? { projectPath } : {}),
    planOnly: false,
    force: false,
    json: false,
  };
  const paths = resolveSetupPaths(request, roots);
  const source = join(packageRoot, 'integrations', 'codex');
  await mkdir(join(source, '.codex-plugin'), { recursive: true });
  await mkdir(join(source, 'skills', 'thoth-mem'), { recursive: true });
  await writeFile(
    join(source, '.codex-plugin', 'plugin.json'),
    '{"name":"thoth-mem","version":"0.0.0"}\n',
    'utf8',
  );
  await writeFile(join(source, '.mcp.json'), '{}\n', 'utf8');
  await writeFile(join(source, 'skills', 'thoth-mem', 'SKILL.md'), '# thoth-mem\n', 'utf8');

  try {
    return await run({
      root,
      dataDir: join(root, 'thoth data'),
      projectPath,
      roots,
      request,
      paths,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function setupOptions(
  fixture: CodexFixture,
  executor: ControlledCodexExecutor,
  ids: string[] = ['codex-setup'],
  timing?: VirtualCodexTiming,
): SetupEngineOptions & { codexExecutor: ControlledCodexExecutor } {
  const receiptIds = [...ids];
  return {
    roots: fixture.roots,
    dataDir: fixture.dataDir,
    executablePath: join(fixture.root, 'bin', 'thoth-mem.js'),
    codexExecutor: executor,
    ...(timing ? { codexTiming: { now: timing.now, sleep: timing.sleep } } : {}),
    transaction: {
      idFactory: () => receiptIds.shift() ?? `codex-${Date.now()}`,
      now: () => new Date('2026-07-09T12:00:00.000Z'),
    },
  };
}

async function runSetup(
  fixture: CodexFixture,
  executor: ControlledCodexExecutor,
  request: SetupRequest = fixture.request,
  ids?: string[],
  timing?: VirtualCodexTiming,
): Promise<SetupResult> {
  return inspectAndPlanSetup(request, setupOptions(fixture, executor, ids, timing));
}

async function loadReceipt(fixture: CodexFixture, result: SetupResult): Promise<SetupReceiptV1> {
  expect(result.receipt).not.toBeNull();
  const loaded = await loadSetupReceipt(result.receipt!, {
    dataDir: fixture.dataDir,
    expectedBasePath: join(fixture.dataDir, 'setup', 'receipts'),
  });
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  return loaded.receipt;
}

describe('Codex CLI setup capability orchestration', () => {
  it('selects plugin manager only from tested version, complete scoped grammar, and classified absent state', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      pluginListJson: true,
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(strategyOf(plan)).toBe('plugin_manager');
    expect(evidenceOf(plan)).toEqual({
      version: { value: '0.144.0', classification: 'tested' },
      capabilities: {
        scope: 'global',
        marketplace: { mutation: true, verification: true, format: 'json' },
        plugin: { mutation: true, verification: true, format: 'json' },
        complete: true,
      },
      managerState: 'absent',
    });
    expect(executor.calls[0]).toEqual(['--version']);
  });

  it.each([
    {
      name: 'version-only evidence with incomplete plugin mutation grammar',
      options: { pluginAvailable: false },
    },
    {
      name: 'untested version with otherwise complete capabilities',
      options: { versionOutput: 'codex-cli 0.145.0' },
    },
    {
      name: 'unknown version output with otherwise complete capabilities',
      options: { versionOutput: 'Codex development build' },
    },
  ])('selects legacy filesystem for safe absent manager state and $name', async ({ options }) => {
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      pluginListJson: true,
      ...options,
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(strategyOf(plan)).toBe('legacy_filesystem');
    expect((evidenceOf(plan) as { managerState?: unknown }).managerState).toBe('absent');
  });

  it('blocks instead of guessing a strategy for malformed advertised manager state', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      pluginListJson: true,
      marketplaceListOutput: '{"marketplaces":[',
      pluginListOutput: JSON.stringify({ unexpected: [] }),
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(strategyOf(plan)).toBeNull();
    expect(plan.status).toBe('requires_user_action');
    expect((evidenceOf(plan) as { managerState?: unknown }).managerState).toBe('unclassifiable');
  });

  it('blocks unavailable project scope when scoped manager absence cannot be classified', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      pluginListJson: true,
      projectScoped: false,
    });

    const plan = await inspectCodexCli({
      executor,
      scope: 'project',
      projectPath: 'C:\\workspace with spaces',
    });

    expect(strategyOf(plan)).toBeNull();
    expect(plan.status).toBe('requires_user_action');
  });

  it('keeps a selected modern failure from creating legacy filesystem ownership', async () => {
    await withCodexFixture(async (fixture) => {
      const executor = new ControlledCodexExecutor({
        marketplaceListJson: true,
        pluginListJson: true,
        failMarketplaceAdd: true,
      });

      const result = await runSetup(fixture, executor);

      expect(result.status).toBe('partial');
      expect(await pathExists(fixture.paths.assetPath)).toBe(false);
      expect(await pathExists(fixture.paths.configPath)).toBe(false);
      expect(executor.mutatingCalls).toEqual([
        ['plugin', 'marketplace', 'add', 'EremesNG/thoth-mem'],
        ['plugin', 'add', 'thoth-mem'],
      ]);
    });
  });

  it('blocks force from claiming ambiguous legacy residue without leaking its contents', async () => {
    await withCodexFixture(async (fixture) => {
      const ambiguousFile = join(fixture.paths.assetPath, 'lookalike-private.json');
      await mkdir(fixture.paths.assetPath, { recursive: true });
      await writeFile(ambiguousFile, '{"token":"private-token-must-not-leak"}', 'utf8');
      const executor = new ControlledCodexExecutor({
        marketplaceInstalled: true,
        pluginInstalled: true,
        marketplaceListJson: true,
        pluginListJson: true,
      });

      const result = await runSetup(fixture, executor, {
        ...fixture.request,
        force: true,
      });

      expect(result).toMatchObject({
        status: 'requires_user_action',
        changed: false,
        receipt: null,
      });
      expect(executor.mutatingCalls).toEqual([]);
      expect(await pathExists(ambiguousFile)).toBe(true);
      expect(JSON.stringify(result)).not.toContain('private-token-must-not-leak');
      expect(result.diagnostics.every((diagnostic) => diagnostic.length <= 512)).toBe(true);
    });
  });

  it('uses short probe deadlines and longer mutation deadlines', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceMutationDurationMs: 6_000,
      pluginMutationDurationMs: 6_000,
    });
    const plan: CodexCliPlan = await inspectCodexCli({ executor, scope: 'global' });
    const requestCountBeforeExecution = executor.executionRequests.length;

    const result = await executeCodexCli(plan, { executor });

    expect(result.status).toBe('complete');
    const planningRequests = executor.executionRequests.slice(0, requestCountBeforeExecution);
    expect(planningRequests.length).toBeGreaterThan(0);
    expect(planningRequests.every((request) => request.timeoutMs === 5_000)).toBe(true);
    const executionRequests = executor.executionRequests.slice(requestCountBeforeExecution);
    const mutationRequests = executionRequests.filter((request) => (
      request.args.includes('add') && !request.args.includes('--help')
    ));
    expect(mutationRequests.map((request) => request.timeoutMs)).toEqual([120_000, 120_000]);
    expect(executionRequests
      .filter((request) => request.args.includes('list'))
      .every((request) => request.timeoutMs === 5_000)).toBe(true);
  });

  it('reconciles delayed visibility with exact list-only polls and virtual time', async () => {
    const timing = new VirtualCodexTiming();
    const executor = new ControlledCodexExecutor({
      pluginInstalled: true,
      marketplaceVisibilityAfterPolls: 3,
    });
    const plan = await inspectCodexCli({ executor, scope: 'global' });
    const requestCountBeforeExecution = executor.executionRequests.length;

    const result = await executeCodexCli(plan, {
      executor,
      timing: { now: timing.now, sleep: timing.sleep },
    });

    expect(result.status).toBe('complete');
    expect(timing.sleeps).toEqual([1_000, 1_000]);
    const executionRequests = executor.executionRequests.slice(requestCountBeforeExecution);
    expect(executionRequests.filter((request) => (
      request.args.join(' ') === 'plugin marketplace add EremesNG/thoth-mem'
    ))).toHaveLength(1);
    expect(executionRequests.filter((request) => (
      request.args.join(' ') === 'plugin marketplace list'
    ))).toEqual([
      { args: ['plugin', 'marketplace', 'list'], timeoutMs: 5_000 },
      { args: ['plugin', 'marketplace', 'list'], timeoutMs: 5_000 },
      { args: ['plugin', 'marketplace', 'list'], timeoutMs: 5_000 },
    ]);
    expect(executor.mutatingCalls).toEqual([
      ['plugin', 'marketplace', 'add', 'EremesNG/thoth-mem'],
    ]);
  });

  it('reconciles a timed-out mutation only after the attempt checkpoint', async () => {
    const events: string[] = [];
    const checkpoints: CodexExternalCheckpoint[] = [];
    const timing = new VirtualCodexTiming();
    const executor = new ControlledCodexExecutor({
      pluginInstalled: true,
      marketplaceMutationDurationMs: 130_000,
      marketplaceVisibilityAfterPolls: 2,
      onExecute: (args) => events.push(`execute:${args.join(' ')}`),
    });
    const plan = await inspectCodexCli({ executor, scope: 'global' });
    events.length = 0;

    const result = await executeCodexCli(plan, {
      executor,
      timing: { now: timing.now, sleep: timing.sleep },
      checkpoint: async (checkpoint) => {
        checkpoints.push(checkpoint);
        events.push(`checkpoint:${checkpoint.id}:${checkpoint.outcome}`);
        return true;
      },
    });

    expect(result.status).toBe('complete');
    expect(checkpoints).toEqual([
      expect.objectContaining({ id: 'codex-marketplace', outcome: 'failed' }),
      { id: 'codex-marketplace', outcome: 'confirmed' },
    ]);
    expect(events).toEqual([
      'execute:plugin marketplace add EremesNG/thoth-mem',
      'checkpoint:codex-marketplace:failed',
      'execute:plugin marketplace list',
      'execute:plugin marketplace list',
      'checkpoint:codex-marketplace:confirmed',
    ]);
    expect(executor.mutatingCalls).toHaveLength(1);
  });

  it('checkpoints a nonzero mutation before rereading and accepting exact resulting state', async () => {
    const events: string[] = [];
    const executor = new ControlledCodexExecutor({
      pluginInstalled: true,
      marketplaceMutationResult: failure(17, 'private-token-must-not-leak'),
      marketplaceVisibilityAfterPolls: 1,
      onExecute: (args) => events.push(`execute:${args.join(' ')}`),
    });
    const plan = await inspectCodexCli({ executor, scope: 'global' });
    events.length = 0;

    const result = await executeCodexCli(plan, {
      executor,
      checkpoint: async (checkpoint) => {
        events.push(`checkpoint:${checkpoint.id}:${checkpoint.outcome}`);
        return true;
      },
    });

    expect(result.status).toBe('complete');
    expect(events).toEqual([
      'execute:plugin marketplace add EremesNG/thoth-mem',
      'checkpoint:codex-marketplace:failed',
      'execute:plugin marketplace list',
      'checkpoint:codex-marketplace:confirmed',
    ]);
    expect(JSON.stringify(result)).not.toContain('private-token-must-not-leak');
  });

  it('expires reconciliation at 30 polls per operation and derives a failed receipt', async () => {
    await withCodexFixture(async (fixture) => {
      const timing = new VirtualCodexTiming();
      const executor = new ControlledCodexExecutor({
        unverifiableMarketplace: true,
        unverifiablePlugin: true,
      });

      const result = await runSetup(fixture, executor, fixture.request, undefined, timing);

      expect(result.status).toBe('failed');
      expect(result.manual_actions).toEqual([
        'Retry the advertised Codex marketplace registration, then verify EremesNG/thoth-mem appears in the marketplace list.',
        'Retry the advertised Codex plugin installation, then verify thoth-mem appears in the plugin list.',
      ]);
      expect(executor.mutatingCalls).toEqual([
        ['plugin', 'marketplace', 'add', 'EremesNG/thoth-mem'],
        ['plugin', 'add', 'thoth-mem'],
      ]);
      expect(executor.executionRequests.filter((request) => (
        request.args.join(' ') === 'plugin marketplace list'
      ))).toHaveLength(31);
      let pluginListRequestCount = 0;
      for (const request of executor.executionRequests) {
        if (
          request.args.length === 2
          && request.args[0] === 'plugin'
          && request.args[1] === 'list'
        ) {
          pluginListRequestCount += 1;
        }
      }
      expect(pluginListRequestCount).toBe(31);
      expect(timing.sleeps).toHaveLength(58);
      expect(timing.nowMs).toBe(58_000);
      for (const delayMs of timing.sleeps) {
        expect(delayMs).toBe(1_000);
      }
      const reconciliationDeadlines: Array<number | undefined> = [];
      let planningListRequestCount = 0;
      for (const request of executor.executionRequests) {
        const isMarketplaceList = request.args.length === 3
          && request.args[0] === 'plugin'
          && request.args[1] === 'marketplace'
          && request.args[2] === 'list';
        const isPluginList = request.args.length === 2
          && request.args[0] === 'plugin'
          && request.args[1] === 'list';
        if (!isMarketplaceList && !isPluginList) {
          continue;
        }
        if (planningListRequestCount < 2) {
          planningListRequestCount += 1;
          continue;
        }
        reconciliationDeadlines.push(request.timeoutMs);
      }
      for (const timeoutMs of reconciliationDeadlines) {
        expect(timeoutMs).toBeDefined();
        expect(timeoutMs).toBeGreaterThan(0);
        expect(timeoutMs).toBeLessThanOrEqual(5_000);
      }

      const receipt = await loadReceipt(fixture, result);
      expect(receipt.status).toBe('failed');
      expect(receipt.steps.find((step) => step.id === 'codex-marketplace')).toMatchObject({
        outcome: 'failed',
      });
      expect(receipt.steps.find((step) => step.id === 'codex-plugin')).toMatchObject({
        outcome: 'failed',
      });
    });
  });

  it('stops without polling after an unsafe spawn failure', async () => {
    const mutationResult = {
      exitCode: null,
      stdout: '',
      stderr: 'private-token',
      error: 'spawn_failed',
      errorCode: 'PRIVATE_CODE',
    };
    const timing = new VirtualCodexTiming();
    const executor = new ControlledCodexExecutor({
      pluginInstalled: true,
      marketplaceMutationResult: mutationResult,
    });
    const plan = await inspectCodexCli({ executor, scope: 'global' });
    const requestCountBeforeExecution = executor.executionRequests.length;

    const result = await executeCodexCli(plan, {
      executor,
      timing: { now: timing.now, sleep: timing.sleep },
    });

    expect(result.status).toBe('partial');
    expect(executor.executionRequests
      .slice(requestCountBeforeExecution)
      .filter((request) => request.args.join(' ') === 'plugin marketplace list')).toHaveLength(0);
    expect(timing.sleeps).toEqual([]);
    expect(result.manualActions).toContain(
      'Retry the advertised Codex marketplace registration, then verify EremesNG/thoth-mem appears in the marketplace list.',
    );
    for (const diagnostic of result.diagnostics) {
      expect(diagnostic).not.toContain('private-token');
      expect(diagnostic).not.toContain('PRIVATE_CODE');
    }
  });

  it('halts before polling when the attempt checkpoint fails', async () => {
    const executor = new ControlledCodexExecutor({ pluginInstalled: true });
    const plan = await inspectCodexCli({ executor, scope: 'global' });
    const requestCountBeforeExecution = executor.executionRequests.length;

    const result = await executeCodexCli(plan, {
      executor,
      checkpoint: async () => false,
    });

    expect(result).toMatchObject({ status: 'failed', checkpointsConfirmed: false });
    const reconciliationRequests = executor.executionRequests
      .slice(requestCountBeforeExecution)
      .filter((request) => (
        request.args[0] === 'plugin'
        && request.args[1] === 'marketplace'
        && request.args[2] === 'list'
      ));
    expect(reconciliationRequests).toHaveLength(0);
    expect(result.manualActions).toEqual([
      'Inspect the verified in-progress receipt before retrying Codex setup.',
    ]);
  });

  it('halts after independent verification when the final checkpoint fails', async () => {
    let checkpointCount = 0;
    const executor = new ControlledCodexExecutor({ pluginInstalled: true });
    const plan: CodexCliPlan = await inspectCodexCli({ executor, scope: 'global' });
    const requestCountBeforeExecution = executor.executionRequests.length;

    const result = await executeCodexCli(plan, {
      executor,
      checkpoint: async () => ++checkpointCount === 1,
    });

    expect(result).toMatchObject({ status: 'failed', checkpointsConfirmed: false });
    expect(checkpointCount).toBe(2);
    let verificationRequestCount = 0;
    for (let index = requestCountBeforeExecution; index < executor.executionRequests.length; index += 1) {
      const request = executor.executionRequests[index]!;
      if (
        request.args.length === 3
        && request.args[0] === 'plugin'
        && request.args[1] === 'marketplace'
        && request.args[2] === 'list'
      ) {
        verificationRequestCount += 1;
      }
    }
    expect(verificationRequestCount).toBe(1);
    expect(executor.mutatingCalls).toHaveLength(1);
  });

  it('bounds subprocess output and time while passing argument arrays without a shell', async () => {
    const boundedExecutor = createNodeCodexCommandExecutor({
      command: process.execPath,
      timeoutMs: 1_000,
      maxOutputBytes: 64,
    });
    const bounded = await boundedExecutor.execute([
      '-e',
      'process.stdout.write("x".repeat(40)); process.stderr.write("y".repeat(40))',
    ]);
    expect(bounded.outputTruncated).toBe(true);
    expect(Buffer.byteLength(bounded.stdout) + Buffer.byteLength(bounded.stderr)).toBeLessThanOrEqual(64);

    const literalExecutor = createNodeCodexCommandExecutor({
      command: process.execPath,
      timeoutMs: 1_000,
      maxOutputBytes: 1_024,
    });
    const shellLikeArgument = 'safe & echo private-token';
    const literal = await literalExecutor.execute([
      '-e',
      'process.stdout.write(process.argv[1])',
      shellLikeArgument,
    ]);
    expect(literal).toMatchObject({ exitCode: 0, stdout: shellLikeArgument });

    const timeoutExecutor = createNodeCodexCommandExecutor({
      command: process.execPath,
      timeoutMs: 1_000,
      maxOutputBytes: 1_024,
    });
    const timedOut = await timeoutExecutor.execute([
      '-e',
      'setInterval(() => undefined, 1_000)',
    ], { timeoutMs: 50 });
    expect(timedOut.timedOut).toBe(true);
  });

  it.skipIf(process.platform !== 'win32')(
    'passes shell-like arguments literally through a real Windows cmd shim',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'thoth-mem codex cmd shim '));
      const scriptPath = join(root, 'capture-arguments.mjs');
      const shimPath = join(root, 'codex-test.cmd');
      const shellLikeArgument = 'safe & echo private-token';
      await writeFile(
        scriptPath,
        'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n',
        'utf8',
      );
      await writeFile(
        shimPath,
        `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`,
        'utf8',
      );

      try {
        const executor = createNodeCodexCommandExecutor({
          command: shimPath,
          timeoutMs: 1_000,
          maxOutputBytes: 1_024,
        });

        const result = await executor.execute([shellLikeArgument]);

        expect(result).toMatchObject({
          exitCode: 0,
          stdout: JSON.stringify([shellLikeArgument]),
          stderr: '',
        });
        expect(result.stdout).not.toContain('\r\nprivate-token');
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it('reports only a safe OS code when the Codex command is missing', async () => {
    const missingCommand = join(
      tmpdir(),
      `missing codex private-token ${process.pid} ${Date.now()}`,
    );
    const executor = createNodeCodexCommandExecutor({ command: missingCommand });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan.status).toBe('failed');
    expect(plan.diagnostics).toEqual([
      'Codex CLI capability inspection could not start (ENOENT).',
    ]);
    expect(plan.diagnostics.join('\n')).not.toContain(missingCommand);
    expect(plan.diagnostics.join('\n')).not.toContain('private-token');
  });

  it('uses advertised JSON lists to confirm live Codex 0.144 state without mutations', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceInstalled: true,
      pluginInstalled: true,
      marketplaceListJson: true,
      pluginListJson: true,
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan).toMatchObject({
      status: 'ready',
      operations: [
        {
          id: 'codex-marketplace',
          verified: true,
          verificationArgs: ['plugin', 'marketplace', 'list', '--json'],
        },
        {
          id: 'codex-plugin',
          verified: true,
          verificationArgs: ['plugin', 'list', '--json'],
        },
      ],
    });
    expect(executor.calls).toContainEqual(['plugin', 'marketplace', 'list', '--json']);
    expect(executor.calls).toContainEqual(['plugin', 'list', '--json']);
    expect(executor.mutatingCalls).toEqual([]);
  });

  it('independently verifies successful controlled mutations through advertised JSON lists', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      pluginListJson: true,
    });
    const plan = await inspectCodexCli({ executor, scope: 'global' });
    const requestCountBeforeExecution = executor.executionRequests.length;

    const result = await executeCodexCli(plan, { executor });

    expect(result.status).toBe('complete');
    expect(executor.mutatingCalls).toEqual([
      ['plugin', 'marketplace', 'add', 'EremesNG/thoth-mem'],
      ['plugin', 'add', 'thoth-mem'],
    ]);
    expect(executor.executionRequests.slice(requestCountBeforeExecution)).toEqual([
      { args: ['plugin', 'marketplace', 'add', 'EremesNG/thoth-mem'], timeoutMs: 120_000 },
      { args: ['plugin', 'marketplace', 'list', '--json'], timeoutMs: 5_000 },
      { args: ['plugin', 'add', 'thoth-mem'], timeoutMs: 120_000 },
      { args: ['plugin', 'list', '--json'], timeoutMs: 5_000 },
    ]);
  });

  it('selects JSON independently for each list command only when its help advertises it', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceInstalled: true,
      pluginInstalled: true,
      marketplaceListJson: true,
      pluginListJson: false,
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan.operations).toEqual([
      expect.objectContaining({
        id: 'codex-marketplace',
        verificationArgs: ['plugin', 'marketplace', 'list', '--json'],
      }),
      expect.objectContaining({
        id: 'codex-plugin',
        verificationArgs: ['plugin', 'list'],
      }),
    ]);
    expect(executor.calls).not.toContainEqual(['plugin', 'list', '--json']);
  });

  it.each([
    'thoth-mem',
    'thoth-mem@thoth-mem',
  ])('rejects bare legacy plugin identity %s without installed-and-enabled evidence', async (output) => {
    const executor = new ControlledCodexExecutor({
      marketplaceListOutput: legacyMarketplaceInventory(true),
      pluginListOutput: output,
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan.operations).toEqual([
      expect.objectContaining({ id: 'codex-marketplace', verified: true }),
      expect.objectContaining({ id: 'codex-plugin', verified: false }),
    ]);
    expect(strategyOf(plan)).toBeNull();
    expect((evidenceOf(plan) as { managerState?: unknown }).managerState)
      .toBe('unclassifiable');
    expect(plan.status).toBe('requires_user_action');
  });

  it.each([
    'EremesNG/thoth-mem',
    'EremesNG/thoth-mem.git',
    'https://github.com/EremesNG/thoth-mem',
    'https://github.com/EremesNG/thoth-mem.git',
  ])('accepts the recognized canonical marketplace Git source %s', async (source) => {
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      marketplaceListOutput: marketplaceJson(true, { source }),
      pluginInstalled: true,
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan.operations[0]).toMatchObject({ id: 'codex-marketplace', verified: true });
  });

  it.each([
    {
      name: 'wrong marketplace name',
      output: marketplaceJson(true, { name: 'thoth-memory' }),
    },
    {
      name: 'wrong repository',
      output: marketplaceJson(true, { source: 'https://github.com/EremesNG/other.git' }),
    },
    {
      name: 'repository prefix',
      output: marketplaceJson(true, { source: 'https://github.com/EremesNG/thoth-mem-extra.git' }),
    },
    {
      name: 'repository suffix',
      output: marketplaceJson(true, { source: 'https://github.com/prefix-EremesNG/thoth-mem.git' }),
    },
    {
      name: 'unrecognized provenance type',
      output: marketplaceJson(true, { sourceType: 'archive' }),
    },
  ])('rejects structured marketplace state with $name', async ({ output }) => {
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      marketplaceListOutput: output,
      pluginInstalled: true,
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan.operations[0]).toMatchObject({ id: 'codex-marketplace', verified: false });
  });

  it.each([
    {
      name: 'available-only entry',
      output: pluginJson(false),
    },
    {
      name: 'installed false',
      output: pluginJson(true, {
        installed: [{
          pluginId: 'thoth-mem@thoth-mem',
          name: 'thoth-mem',
          marketplaceName: 'thoth-mem',
          installed: false,
          enabled: true,
        }],
      }),
    },
    {
      name: 'disabled entry',
      output: pluginJson(true, {
        installed: [{
          pluginId: 'thoth-mem@thoth-mem',
          name: 'thoth-mem',
          marketplaceName: 'thoth-mem',
          installed: true,
          enabled: false,
        }],
      }),
    },
    {
      name: 'wrong plugin id with exact name and marketplace',
      output: pluginJson(true, {
        installed: [{
          pluginId: 'thoth-memory@thoth-mem',
          name: 'thoth-mem',
          marketplaceName: 'thoth-mem',
          installed: true,
          enabled: true,
        }],
      }),
    },
    {
      name: 'missing plugin id with exact name and marketplace',
      output: pluginJson(true, {
        installed: [{
          name: 'thoth-mem',
          marketplaceName: 'thoth-mem',
          installed: true,
          enabled: true,
        }],
      }),
    },
    {
      name: 'correct plugin id with conflicting name',
      output: pluginJson(true, {
        installed: [{
          pluginId: 'thoth-mem@thoth-mem',
          name: 'thoth-memory',
          marketplaceName: 'thoth-mem',
          installed: true,
          enabled: true,
        }],
      }),
    },
    {
      name: 'correct plugin id with missing name',
      output: pluginJson(true, {
        installed: [{
          pluginId: 'thoth-mem@thoth-mem',
          marketplaceName: 'thoth-mem',
          installed: true,
          enabled: true,
        }],
      }),
    },
    {
      name: 'correct plugin id with conflicting marketplace',
      output: pluginJson(true, {
        installed: [{
          pluginId: 'thoth-mem@thoth-mem',
          name: 'thoth-mem',
          marketplaceName: 'other',
          installed: true,
          enabled: true,
        }],
      }),
    },
    {
      name: 'correct plugin id with missing marketplace',
      output: pluginJson(true, {
        installed: [{
          pluginId: 'thoth-mem@thoth-mem',
          name: 'thoth-mem',
          installed: true,
          enabled: true,
        }],
      }),
    },
  ])('rejects structured plugin state with $name', async ({ output }) => {
    const executor = new ControlledCodexExecutor({
      marketplaceInstalled: true,
      pluginListJson: true,
      pluginListOutput: output,
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan.operations[1]).toMatchObject({ id: 'codex-plugin', verified: false });
  });

  it('fails closed without throwing or text fallback for malformed and unexpected advertised JSON', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      pluginListJson: true,
      marketplaceListOutput: '{"marketplaces":["EremesNG/thoth-mem"',
      pluginListOutput: JSON.stringify({ unexpected: 'thoth-mem@thoth-mem' }),
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan.status).toBe('requires_user_action');
    expect(plan.operations).toEqual([
      expect.objectContaining({ id: 'codex-marketplace', verified: false }),
      expect.objectContaining({ id: 'codex-plugin', verified: false }),
    ]);
  });

  it('verifies the official legacy plugin table with single-space row separators', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceListOutput: 'https://github.com/EremesNG/thoth-mem.git\n',
      pluginListOutput: legacyPluginList('installed, enabled'),
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan.operations).toEqual([
      expect.objectContaining({ id: 'codex-marketplace', verified: true }),
      expect.objectContaining({ id: 'codex-plugin', verified: true }),
    ]);
    expect(executor.calls).not.toContainEqual(['plugin', 'marketplace', 'list', '--json']);
    expect(executor.calls).not.toContainEqual(['plugin', 'list', '--json']);
  });

  it.each([
    { name: 'disabled state', status: 'installed, disabled', pluginId: 'thoth-mem@thoth-mem' },
    { name: 'not-installed state', status: 'not installed', pluginId: 'thoth-mem@thoth-mem' },
    { name: 'status suffix', status: 'installed, enabled, pending', pluginId: 'thoth-mem@thoth-mem' },
    { name: 'lookalike plugin id', status: 'installed, enabled', pluginId: 'thoth-memory@thoth-mem' },
  ])('rejects official legacy plugin rows with $name', async ({ status, pluginId }) => {
    const executor = new ControlledCodexExecutor({
      marketplaceInstalled: true,
      pluginListOutput: legacyPluginList(status, pluginId),
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan.operations[1]).toMatchObject({ id: 'codex-plugin', verified: false });
  });

  it('rejects synthetic legacy plugin name and marketplace columns', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceInstalled: true,
      pluginListOutput: [
        'Plugin ID             Name       Marketplace  Status   Install Path',
        'thoth-mem@thoth-mem   thoth-mem  thoth-mem    enabled  C:\\Users\\Example User\\Codex Data',
      ].join('\n'),
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan.operations[1]).toMatchObject({ id: 'codex-plugin', verified: false });
  });

  it('fails closed for a legacy marketplace name/root table without Git provenance', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceListOutput: [
        'MARKETPLACE  ROOT',
        'thoth-mem    C:\\Users\\Example User\\.codex\\plugins\\marketplaces\\thoth-mem',
      ].join('\n'),
      pluginInstalled: true,
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan.operations[0]).toMatchObject({ id: 'codex-marketplace', verified: false });
  });

  it('accepts the legacy help-advertised plugin selector and exact global argument arrays', async () => {
    const executor = new ControlledCodexExecutor();

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan).toMatchObject({
      status: 'ready',
      operations: [
        {
          id: 'codex-marketplace',
          available: true,
          mutationArgs: ['plugin', 'marketplace', 'add', 'EremesNG/thoth-mem'],
          verificationArgs: ['plugin', 'marketplace', 'list'],
        },
        {
          id: 'codex-plugin',
          available: true,
          mutationArgs: ['plugin', 'add', 'thoth-mem'],
          verificationArgs: ['plugin', 'list'],
        },
      ],
    });
  });

  it('accepts the Codex 0.144 marketplace-qualified plugin selector', async () => {
    const executor = new ControlledCodexExecutor({
      pluginSelector: '<PLUGIN[@MARKETPLACE]>',
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan).toMatchObject({
      status: 'ready',
      operations: [
        { id: 'codex-marketplace', available: true },
        {
          id: 'codex-plugin',
          available: true,
          mutationArgs: ['plugin', 'add', 'thoth-mem@thoth-mem'],
          verificationArgs: ['plugin', 'list'],
        },
      ],
    });
  });

  it('accepts bracketed inline project scope in exact mutation and verification arrays', async () => {
    const executor = new ControlledCodexExecutor({
      projectScoped: true,
      inlineProjectScoped: true,
    });
    const projectPath = 'C:\\workspaces\\project with spaces';

    const plan = await inspectCodexCli({
      executor,
      scope: 'project',
      projectPath,
    });

    expect(plan).toMatchObject({
      status: 'ready',
      operations: [
        {
          id: 'codex-marketplace',
          available: true,
          mutationArgs: [
            'plugin', 'marketplace', 'add', '--project', projectPath, 'EremesNG/thoth-mem',
          ],
          verificationArgs: ['plugin', 'marketplace', 'list', '--project', projectPath],
        },
        {
          id: 'codex-plugin',
          available: true,
          mutationArgs: ['plugin', 'add', '--project', projectPath, 'thoth-mem'],
          verificationArgs: ['plugin', 'list', '--project', projectPath],
        },
      ],
    });
  });

  it('does not verify near-match marketplace or plugin identities', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceListOutput: 'EremesNG/thoth-memory\n',
      pluginListOutput: 'not-thoth-mem\n',
    });

    const plan = await inspectCodexCli({ executor, scope: 'global' });

    expect(plan.status).toBe('requires_user_action');
    expect(plan.operations).toEqual([
      expect.objectContaining({ id: 'codex-marketplace', verified: false }),
      expect.objectContaining({ id: 'codex-plugin', verified: false }),
    ]);
    expect(plan.steps).toEqual([
      expect.objectContaining({ outcome: 'planned' }),
      expect.objectContaining({ outcome: 'planned' }),
    ]);
    expect(executor.mutatingCalls).toEqual([]);
  });

  it('uses only manager state and independently verifies both advertised operations', async () => {
    await withCodexFixture(async (fixture) => {
      const executor = new ControlledCodexExecutor();

      const result = await runSetup(fixture, executor);

      expect(executor.calls.slice(0, 10)).toEqual([
        ['--version'],
        ['--help'],
        ['plugin', '--help'],
        ['plugin', 'marketplace', '--help'],
        ['plugin', 'marketplace', 'add', '--help'],
        ['plugin', 'marketplace', 'list', '--help'],
        ['plugin', 'add', '--help'],
        ['plugin', 'list', '--help'],
        ['plugin', 'marketplace', 'list'],
        ['plugin', 'list'],
      ]);
      expect(result.status).toBe('complete');
      const exitCode = getSetupExitCode(result.status);
      expect(exitCode).toBe(0);
      expect(result.changed).toBe(true);
      expect(result.manual_actions).toEqual([]);
      expect(executor.mutatingCalls).toEqual([
        ['plugin', 'marketplace', 'add', 'EremesNG/thoth-mem'],
        ['plugin', 'add', 'thoth-mem'],
      ]);
      expect(await pathExists(fixture.paths.configPath)).toBe(false);
      expect(await pathExists(fixture.paths.assetPath)).toBe(false);

      const receipt = await loadReceipt(fixture, result);
      expect(receipt.status).toBe('complete');
      expect(receipt.steps.find((step) => step.id === 'codex-marketplace')).toMatchObject({
        kind: 'external_command',
        external_scope: 'global',
        outcome: 'confirmed',
      });
      expect(receipt.steps.find((step) => step.id === 'codex-plugin')).toMatchObject({
        kind: 'external_command',
        external_scope: 'global',
        outcome: 'confirmed',
      });
    });
  });

  it('returns partial when one safely advertised operation verifies and the other fails', async () => {
    await withCodexFixture(async (fixture) => {
      const executor = new ControlledCodexExecutor({ failPluginAdd: true });

      const result = await runSetup(fixture, executor);

      expect(result.status).toBe('partial');
      expect(getSetupExitCode(result.status)).toBe(2);
      expect(result.steps).toContainEqual({
        name: 'Register thoth-mem Codex marketplace (global)',
        outcome: 'confirmed',
      });
      expect(result.steps).toContainEqual({
        name: 'Install thoth-mem Codex plugin (global)',
        outcome: 'failed',
      });
      expect(result.manual_actions).toContain(
        'Retry the advertised Codex plugin installation, then verify thoth-mem appears in the plugin list.',
      );
      expect(result.diagnostics).toContain(
        'Plugin installation command exited with code 19.',
      );
      expect(result.diagnostics.join('\n')).not.toContain('private-token');
      const receipt = await loadReceipt(fixture, result);
      expect(receipt.status).toBe('partial');
    });
  });

  it('treats exit zero without independent state verification as partial', async () => {
    await withCodexFixture(async (fixture) => {
      const timing = new VirtualCodexTiming();
      const executor = new ControlledCodexExecutor({ unverifiablePlugin: true });

      const result = await runSetup(
        fixture,
        executor,
        fixture.request,
        undefined,
        timing,
      );

      expect(result.status).toBe('partial');
      expect(result.steps).toContainEqual({
        name: 'Install thoth-mem Codex plugin (global)',
        outcome: 'failed',
      });
      expect(result.diagnostics).toContain(
        'Codex plugin installation exited successfully but independent verification did not confirm thoth-mem.',
      );
    });
  });

  it('uses isolated legacy filesystem ownership when manager grammar is unavailable and state is absent', async () => {
    await withCodexFixture(async (fixture) => {
      const executor = new ControlledCodexExecutor({ pluginAvailable: false });

      const result = await runSetup(fixture, executor);

      expect(result.status).toBe('complete');
      expect(getSetupExitCode(result.status)).toBe(0);
      expect(result.changed).toBe(true);
      expect(result.receipt).not.toBeNull();
      expect(executor.mutatingCalls).toEqual([]);
      expect(await pathExists(fixture.paths.configPath)).toBe(true);
      expect(await pathExists(fixture.paths.assetPath)).toBe(true);
      expect(result.manual_actions).toEqual([]);
    });
  });

  it('does not let verified marketplace state mask unavailable plugin installation', async () => {
    await withCodexFixture(async (fixture) => {
      const executor = new ControlledCodexExecutor({
        marketplaceInstalled: true,
        pluginAvailable: false,
      });

      const result = await runSetup(fixture, executor);

      expect(result.status).toBe('requires_user_action');
      expect(result.steps).toContainEqual({
        name: 'Register thoth-mem Codex marketplace (global)',
        outcome: 'confirmed',
      });
      expect(result.steps).toContainEqual({
        name: 'Install thoth-mem Codex plugin (global)',
        outcome: 'unavailable',
      });
      expect(result.status).not.toBe('complete');
      expect(executor.mutatingCalls).toEqual([]);
    });
  });

  it('is a verified no-op when filesystem and both external states already match', async () => {
    await withCodexFixture(async (fixture) => {
      const executor = new ControlledCodexExecutor();
      const first = await runSetup(fixture, executor, fixture.request, ['codex-first']);
      expect(first.status).toBe('complete');
      const mutationCount = executor.mutatingCalls.length;
      const receiptRoot = join(fixture.dataDir, 'setup', 'receipts');
      const receiptsBefore = await readdir(receiptRoot);

      const second = await runSetup(fixture, executor, fixture.request, ['codex-second']);

      expect(second).toMatchObject({ status: 'complete', changed: false, receipt: null });
      expect(executor.mutatingCalls).toHaveLength(mutationCount);
      expect(await readdir(receiptRoot)).toEqual(receiptsBefore);
    });
  });

  it('keeps project setup mutation-free when project-scoped grammar is not advertised', async () => {
    await withCodexFixture(async (fixture) => {
      const executor = new ControlledCodexExecutor();

      const result = await runSetup(fixture, executor);

      expect(result.status).toBe('requires_user_action');
      expect(result.changed).toBe(false);
      expect(executor.mutatingCalls).toEqual([]);
      expect(executor.calls.some((args) => args.includes(fixture.projectPath))).toBe(false);
      expect(await pathExists(fixture.paths.targetRoot)).toBe(false);
      expect(result.diagnostics).toContain(
        'The detected Codex CLI does not advertise project-scoped marketplace and plugin operations.',
      );
    }, 'project');
  });

  it('plans exact advertised operations without writes, receipts, backups, or mutations', async () => {
    await withCodexFixture(async (fixture) => {
      const executor = new ControlledCodexExecutor();
      const request = { ...fixture.request, planOnly: true };

      const result = await runSetup(fixture, executor, request);

      expect(result).toMatchObject({ status: 'complete', changed: false, receipt: null });
      expect(result.steps).toContainEqual({
        name: 'Register thoth-mem Codex marketplace (global)',
        outcome: 'planned',
      });
      expect(result.steps).toContainEqual({
        name: 'Install thoth-mem Codex plugin (global)',
        outcome: 'planned',
      });
      expect(executor.mutatingCalls).toEqual([]);
      expect(await pathExists(fixture.paths.targetRoot)).toBe(false);
      expect(await pathExists(join(fixture.dataDir, 'setup'))).toBe(false);
    });
  });

  it('fails closed on probe failure and bounds privacy-safe diagnostics', async () => {
    await withCodexFixture(async (fixture) => {
      const failedProbe = new ControlledCodexExecutor({
        rootProbe: {
          exitCode: null,
          stdout: '',
          stderr: `private-token-${'x'.repeat(100_000)}`,
          timedOut: true,
          outputTruncated: true,
        },
      });

      const failed = await runSetup(fixture, failedProbe);

      expect(failed.status).toBe('failed');
      expect(getSetupExitCode(failed.status)).toBe(1);
      expect(failed.changed).toBe(false);
      expect(failed.receipt).toBeNull();
      expect(failed.diagnostics.join('\n')).not.toContain('private-token');
      expect(failed.diagnostics.join('\n').length).toBeLessThan(512);
      expect(await pathExists(fixture.paths.targetRoot)).toBe(false);

      const oversized = new ControlledCodexExecutor({ oversizedListOutput: true });
      const oversizedResult = await runSetup(fixture, oversized);
      expect(oversizedResult.status).toBe('failed');
      expect(oversizedResult.diagnostics.join('\n')).not.toContain('private-token');
      expect(oversizedResult.diagnostics.join('\n').length).toBeLessThan(512);
    });
  });

  it('synthesizes collision diagnostics without leaking raw command output', async () => {
    const privateHome = 'C:\\Users\\Private User\\.codex';
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      pluginListJson: true,
      pluginInstalled: true,
      marketplaceRemoveAvailable: true,
      marketplaceRemoveJson: true,
      marketplaceListResults: [
        success(marketplaceJson(false)),
        success(marketplaceJson(false)),
      ],
      marketplaceMutationResult: collisionFailure([
        'Authorization: Bearer private-authorization',
        'token=private-token',
        'https://private-user:private-password@example.test/repository?secret=private-query',
        `[marketplaces.private]\nroot=${privateHome}`,
        'unrelated-marketplace private-plugin private-cache-entry',
        'x'.repeat(2_000),
      ].join('\n')),
    });
    const plan = await inspectCodexCli({ executor, scope: 'global' });

    const result = await executeCodexCli(plan, { executor });

    expect(result.status).toBe('requires_user_action');
    const marketplace = operationEvidenceOf(result)
      .find((operation) => operation.id === 'codex-marketplace');
    expect(marketplace).toMatchObject({
      safeAttempt: 'attempted',
      commandReason: 'nonzero',
      failureClass: 'different_source_marketplace_collision',
      finalOutcome: 'failed',
      requiresUserAction: true,
    });
    const rendered = JSON.stringify(result);
    for (const secret of [
      'private-authorization',
      'private-token',
      'private-password',
      'private-query',
      privateHome,
      '[marketplaces.private]',
      'unrelated-marketplace',
      'private-cache-entry',
    ]) {
      expect(rendered).not.toContain(secret);
    }
    expect(result.diagnostics.every((diagnostic) => diagnostic.length <= 512)).toBe(true);
    expect(result.manualActions).toContain(
      'codex plugin marketplace remove thoth-mem --json',
    );
  });

  it('rereads exact state after an output-limit attempt and lets that state win', async () => {
    const checkpoints: CodexExternalCheckpoint[] = [];
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      pluginListJson: true,
      pluginInstalled: true,
      marketplaceListResults: [
        success(marketplaceJson(false)),
        success(marketplaceJson(true)),
      ],
      marketplaceMutationResult: {
        exitCode: null,
        stdout: `Authorization: Bearer output-secret-${'x'.repeat(70_000)}`,
        stderr: 'token=stderr-secret',
        outputTruncated: true,
      },
    });
    const plan = await inspectCodexCli({ executor, scope: 'global' });
    const callCount = executor.calls.length;

    const result = await executeCodexCli(plan, {
      executor,
      checkpoint: async (checkpoint) => {
        checkpoints.push(checkpoint);
        return true;
      },
    });

    expect(result.status).toBe('complete');
    expect(executor.calls.slice(callCount)).toContainEqual([
      'plugin', 'marketplace', 'list', '--json',
    ]);
    expect(operationEvidenceOf(result)).toContainEqual(expect.objectContaining({
      id: 'codex-marketplace',
      commandReason: 'output_limit',
      reread: { performed: true, state: 'present' },
      finalOutcome: 'confirmed',
    }));
    expect(checkpoints.map((checkpoint) => [
      checkpoint.id,
      checkpointPhaseOf(checkpoint),
      checkpoint.outcome,
    ])).toEqual([
      ['codex-marketplace', 'attempt', 'failed'],
      ['codex-marketplace', 'reread', 'confirmed'],
    ]);
    expect(result.diagnostics.every((diagnostic) => diagnostic.length <= 512)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('output-secret');
    expect(JSON.stringify(result)).not.toContain('stderr-secret');
  });

  it('keeps operations independent and gives manual ambiguity precedence over partial', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      pluginListJson: true,
      marketplaceRemoveAvailable: true,
      marketplaceRemoveJson: true,
      marketplaceListResults: [
        success(marketplaceJson(false)),
        success(marketplaceJson(false)),
      ],
      marketplaceMutationResult: collisionFailure(),
    });
    const plan = await inspectCodexCli({ executor, scope: 'global' });

    const result = await executeCodexCli(plan, { executor });

    expect(result.status).toBe('requires_user_action');
    expect(executor.mutatingCalls).toEqual([
      ['plugin', 'marketplace', 'add', 'EremesNG/thoth-mem'],
      ['plugin', 'add', 'thoth-mem'],
    ]);
    expect(operationEvidenceOf(result)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'codex-marketplace',
        initialState: 'absent',
        finalOutcome: 'failed',
        requiresUserAction: true,
      }),
      expect.objectContaining({
        id: 'codex-plugin',
        initialState: 'absent',
        finalOutcome: 'confirmed',
        requiresUserAction: false,
      }),
    ]));
  });

  it('does not let force create orphan cleanup authority', async () => {
    const exercise = async (force: boolean) => withCodexFixture(async (fixture) => {
      const executor = new ControlledCodexExecutor({
        marketplaceListJson: true,
        pluginListJson: true,
        marketplaceRemoveAvailable: true,
        marketplaceRemoveJson: true,
        marketplaceListResults: [
          success(marketplaceJson(false)),
          success(marketplaceJson(false)),
        ],
        marketplaceMutationResult: collisionFailure(),
      });
      const result = await runSetup(fixture, executor, {
        ...fixture.request,
        force,
      });

      return {
        status: result.status,
        manualActions: result.manual_actions,
        mutatingCalls: executor.mutatingCalls,
      };
    });

    const normal = await exercise(false);
    const forced = await exercise(true);

    expect(normal.status).toBe('requires_user_action');
    expect(forced).toEqual(normal);
    expect(forced.manualActions).toContain(
      'codex plugin marketplace remove thoth-mem --json',
    );
    expect(forced.mutatingCalls.some((args) => args.includes('remove'))).toBe(false);
  });

  it.each([
    {
      name: 'message-only evidence with a malformed reread',
      mutation: collisionFailure(),
      postState: success('{"marketplaces":['),
    },
    {
      name: 'wrong-scope evidence',
      mutation: collisionFailure('scope=project-other'),
      postState: success(marketplaceJson(false)),
    },
    {
      name: 'divergent source evidence',
      mutation: collisionFailure('source=https://github.com/Other/repository.git'),
      postState: success(marketplaceJson(false)),
    },
    {
      name: 'escaped reparse evidence',
      mutation: collisionFailure('reparse point resolves outside the selected Codex home'),
      postState: success(marketplaceJson(false)),
    },
    {
      name: 'concurrent manager activity',
      mutation: collisionFailure('manager busy: another marketplace operation is in progress'),
      postState: success(marketplaceJson(false)),
    },
    {
      name: 'material state change',
      mutation: collisionFailure(),
      postState: success(marketplaceJson(true, {
        source: 'https://github.com/Other/repository.git',
      })),
    },
  ])('fails closed for $name without inventing cleanup authority', async ({
    mutation,
    postState,
  }) => {
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      pluginListJson: true,
      pluginInstalled: true,
      marketplaceRemoveAvailable: true,
      marketplaceRemoveJson: true,
      marketplaceListResults: [success(marketplaceJson(false)), postState],
      marketplaceMutationResult: mutation,
    });
    const plan = await inspectCodexCli({ executor, scope: 'global' });

    const result = await executeCodexCli(plan, { executor });

    expect(result.status).toBe('requires_user_action');
    expect(result.manualActions).not.toContain(
      'codex plugin marketplace remove thoth-mem --json',
    );
    expect(executor.mutatingCalls.some((args) => args.includes('remove'))).toBe(false);
  });

  it('treats a hidden path alone as ordinary failure rather than orphan ownership', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      pluginListJson: true,
      pluginInstalled: true,
      marketplaceListResults: [
        success(marketplaceJson(false)),
        success(marketplaceJson(false)),
      ],
      marketplaceMutationResult: failure(
        17,
        'C:\\Users\\Private User\\.codex\\.tmp\\marketplaces\\thoth-mem',
      ),
    });
    const plan = await inspectCodexCli({ executor, scope: 'global' });

    const result = await executeCodexCli(plan, { executor });

    expect(result.status).toBe('partial');
    expect(operationEvidenceOf(result)).toContainEqual(expect.objectContaining({
      id: 'codex-marketplace',
      failureClass: null,
      requiresUserAction: false,
    }));
    expect(JSON.stringify(result)).not.toContain('Private User');
  });

  it('renders project remove guidance with a placeholder and never invokes it automatically', async () => {
    const projectPath = 'C:\\Users\\Private User\\project';
    const executor = new ControlledCodexExecutor({
      projectScoped: true,
      inlineProjectScoped: true,
      marketplaceListJson: true,
      pluginListJson: true,
      pluginInstalled: true,
      marketplaceRemoveAvailable: true,
      marketplaceRemoveJson: true,
      marketplaceListResults: [
        success(marketplaceJson(false)),
        success(marketplaceJson(false)),
      ],
      marketplaceMutationResult: collisionFailure(),
    });
    const plan = await inspectCodexCli({
      executor,
      scope: 'project',
      projectPath,
    });

    const result = await executeCodexCli(plan, { executor });

    expect(result.status).toBe('requires_user_action');
    expect(result.manualActions.join('\n')).toContain('codex plugin marketplace remove');
    expect(result.manualActions.join('\n')).toContain('<selected-project>');
    expect(result.manualActions.join('\n')).toContain('--json');
    expect(result.manualActions.join('\n')).not.toContain(projectPath);
    expect(executor.mutatingCalls.some((args) => args.includes('remove'))).toBe(false);
  });

  it('does not invent remove guidance when help grammar is unrecognized', async () => {
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      pluginListJson: true,
      pluginInstalled: true,
      marketplaceRemoveAvailable: true,
      marketplaceRemoveHelp: 'Usage: codex plugin marketplace delete <NAME>',
      marketplaceListResults: [
        success(marketplaceJson(false)),
        success(marketplaceJson(false)),
      ],
      marketplaceMutationResult: collisionFailure(),
    });
    const plan = await inspectCodexCli({ executor, scope: 'global' });

    const result = await executeCodexCli(plan, { executor });

    expect(result.status).toBe('requires_user_action');
    expect(result.manualActions.join('\n')).not.toContain('codex plugin marketplace remove');
    expect(executor.mutatingCalls.some((args) => args.includes('remove'))).toBe(false);
  });

  it('preserves attempt-reread order and halts before reread when checkpointing fails', async () => {
    const events: string[] = [];
    const executor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      pluginListJson: true,
      marketplaceMutationResult: failure(17, 'ordinary controlled failure'),
      onExecute: (args) => events.push(`execute:${args.join(' ')}`),
    });
    const plan = await inspectCodexCli({ executor, scope: 'global' });
    events.length = 0;

    const result = await executeCodexCli(plan, {
      executor,
      checkpoint: async (checkpoint) => {
        events.push(
          `checkpoint:${checkpoint.id}:${checkpointPhaseOf(checkpoint)}:${checkpoint.outcome}`,
        );
        return true;
      },
    });

    expect(result.status).toBe('partial');
    expect(events).toEqual([
      'execute:plugin marketplace add EremesNG/thoth-mem',
      'checkpoint:codex-marketplace:attempt:failed',
      'execute:plugin marketplace list --json',
      'checkpoint:codex-marketplace:reread:failed',
      'execute:plugin add thoth-mem',
      'checkpoint:codex-plugin:attempt:confirmed',
      'execute:plugin list --json',
      'checkpoint:codex-plugin:reread:confirmed',
    ]);

    const haltedEvents: string[] = [];
    const haltedExecutor = new ControlledCodexExecutor({
      marketplaceListJson: true,
      pluginListJson: true,
      onExecute: (args) => haltedEvents.push(`execute:${args.join(' ')}`),
    });
    const haltedPlan = await inspectCodexCli({ executor: haltedExecutor, scope: 'global' });
    haltedEvents.length = 0;
    const halted = await executeCodexCli(haltedPlan, {
      executor: haltedExecutor,
      checkpoint: async (checkpoint) => {
        haltedEvents.push(
          `checkpoint:${checkpoint.id}:${checkpointPhaseOf(checkpoint)}:${checkpoint.outcome}`,
        );
        return false;
      },
    });
    expect(halted.status).toBe('failed');
    expect(haltedEvents).toEqual([
      'execute:plugin marketplace add EremesNG/thoth-mem',
      'checkpoint:codex-marketplace:attempt:confirmed',
    ]);
  });
});
