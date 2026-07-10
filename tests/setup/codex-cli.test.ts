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
      ));
    }

    const normalized = withoutProjectScope(command);
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
      return success(
        this.options.marketplaceListOutput
          ?? (this.marketplaceInstalled ? 'EremesNG/thoth-mem\n' : 'official\n'),
      );
    }
    if (key === 'plugin list') {
      return success(
        this.options.pluginListOutput
          ?? (this.pluginInstalled ? 'thoth-mem\n' : 'example-plugin\n'),
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
): string {
  if (projectScoped && inlineProjectScoped) {
    return `Usage: ${usage} [--project <PATH>]`;
  }
  return projectScoped
    ? `Usage: ${usage}\nOptions:\n  --project <PATH>  Use project-local plugin state`
    : `Usage: ${usage}`;
}

function failure(exitCode: number, stderr: string): CommandResult {
  return { exitCode, stdout: '', stderr };
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

  it.each([
    {
      name: 'output limit',
      result: { exitCode: null, stdout: '', stderr: '', outputTruncated: true },
    },
    {
      name: 'unsafe spawn failure',
      result: {
        exitCode: null,
        stdout: '',
        stderr: 'private-token',
        error: 'spawn_failed',
        errorCode: 'PRIVATE_CODE',
      },
    },
  ])('stops without polling after terminal $name failures', async ({ result: mutationResult }) => {
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

    expect(plan.status).toBe('ready');
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

  it('applies filesystem state and independently verifies both advertised operations', async () => {
    await withCodexFixture(async (fixture) => {
      const executor = new ControlledCodexExecutor();

      const result = await runSetup(fixture, executor);

      expect(executor.calls.slice(0, 9)).toEqual([
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
      expect(await pathExists(fixture.paths.configPath)).toBe(true);
      expect(await pathExists(fixture.paths.assetPath)).toBe(true);

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

  it('requires user action and performs zero mutation when required grammar is unavailable', async () => {
    await withCodexFixture(async (fixture) => {
      const executor = new ControlledCodexExecutor({ pluginAvailable: false });

      const result = await runSetup(fixture, executor);

      expect(result.status).toBe('requires_user_action');
      expect(getSetupExitCode(result.status)).toBe(3);
      expect(result.changed).toBe(false);
      expect(result.receipt).toBeNull();
      expect(executor.mutatingCalls).toEqual([]);
      expect(await pathExists(fixture.paths.targetRoot)).toBe(false);
      expect(result.manual_actions).toContain(
        'Open Codex /plugins, install thoth-mem from EremesNG/thoth-mem, and verify both marketplace and plugin state there.',
      );
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
});
