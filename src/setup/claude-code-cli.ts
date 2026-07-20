import spawn from 'cross-spawn';

import type { SetupScope } from './types.js';

export const CLAUDE_MARKETPLACE_SOURCE = 'EremesNG/thoth-mem';
export const CLAUDE_MARKETPLACE_NAME = 'thoth-mem';
export const CLAUDE_PLUGIN_ID = 'thoth-mem@thoth-mem';

const PROBE_TIMEOUT_MS = 5_000;
const MUTATION_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const SAFE_SPAWN_ERROR_CODES = new Set([
  'EACCES',
  'EAGAIN',
  'EFTYPE',
  'EINTR',
  'EINVAL',
  'EIO',
  'ENOENT',
  'ENOEXEC',
  'ENOMEM',
  'ENOTDIR',
  'EPERM',
]);

export interface ClaudeCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  outputTruncated?: boolean;
  error?: string;
  errorCode?: string;
}

export interface ClaudeCommandExecutionOptions {
  cwd?: string;
  timeoutMs: number;
}

export interface ClaudeCommandExecutor {
  execute(
    args: readonly string[],
    options?: ClaudeCommandExecutionOptions,
  ): Promise<ClaudeCommandResult>;
}

export interface NodeClaudeCommandExecutorOptions {
  command?: string;
  maxOutputBytes?: number;
}

export type ClaudeManagerState = 'absent' | 'present' | 'foreign' | 'ambiguous';

export interface ClaudeManagerInspection {
  status: 'ready' | 'requires_user_action' | 'failed';
  marketplace: ClaudeManagerState;
  plugin: ClaudeManagerState;
  removalReady: boolean;
  diagnostics: string[];
  manualActions: string[];
}

export type ClaudeManagerOperation =
  | 'marketplace-add'
  | 'plugin-install'
  | 'plugin-uninstall'
  | 'marketplace-remove';

export interface ClaudeManagerOperationResult {
  ok: boolean;
  interrupted: boolean;
  diagnostic: string | null;
}

export interface InspectClaudeCodeManagerOptions {
  executor: ClaudeCommandExecutor;
  scope: SetupScope;
  projectPath?: string;
}

export function createNodeClaudeCommandExecutor(
  options: NodeClaudeCommandExecutorOptions = {},
): ClaudeCommandExecutor {
  const command = options.command ?? 'claude';
  const maxOutputBytes = options.maxOutputBytes ?? MAX_OUTPUT_BYTES;

  return {
    execute(args, execution = { timeoutMs: PROBE_TIMEOUT_MS }) {
      return executeCommand(
        command,
        args,
        execution.timeoutMs,
        execution.cwd,
        maxOutputBytes,
      );
    },
  };
}

export async function inspectClaudeCodeManager(
  options: InspectClaudeCodeManagerOptions,
): Promise<ClaudeManagerInspection> {
  const execution = executionOptions(options.scope, options.projectPath, PROBE_TIMEOUT_MS);
  const version = await run(options.executor, ['--version'], execution);
  if (!version.ok) {
    return failedInspection(version.errorCode
      ? `Claude Code version probing could not start (${version.errorCode}).`
      : 'Claude Code version probing failed safely.');
  }
  if (!/^claude-code\s+1\./i.test(version.stdout.trim())) {
    return manualInspection('The detected Claude Code version is not in the verified manager family.');
  }

  const helpCommands = [
    ['plugin', '--help'],
    ['plugin', 'marketplace', '--help'],
    ['plugin', 'marketplace', 'add', '--help'],
    ['plugin', 'marketplace', 'list', '--help'],
    ['plugin', 'marketplace', 'remove', '--help'],
    ['plugin', 'install', '--help'],
    ['plugin', 'list', '--help'],
    ['plugin', 'uninstall', '--help'],
  ] as const;
  const help = await Promise.all(helpCommands.map((args) => run(options.executor, args, execution)));
  if (help.some((result) => !result.ok)) {
    return failedInspection('Claude Code manager capability probing failed safely.');
  }
  const [pluginHelp, marketplaceHelp, marketplaceAddHelp, marketplaceListHelp, marketplaceRemoveHelp, installHelp, listHelp, uninstallHelp] = help;
  if (
    !containsAll(pluginHelp!.stdout, ['marketplace', 'install', 'list', 'uninstall'])
    || !containsAll(marketplaceHelp!.stdout, ['add', 'list', 'remove'])
    || !containsAll(marketplaceAddHelp!.stdout, ['--scope'])
    || !containsAll(marketplaceListHelp!.stdout, ['--scope', '--json'])
    || !containsAll(marketplaceRemoveHelp!.stdout, ['--scope'])
    || !containsAll(installHelp!.stdout, ['--scope'])
    || !containsAll(listHelp!.stdout, ['--scope', '--json'])
    || !containsAll(uninstallHelp!.stdout, ['--scope'])
  ) {
    return manualInspection('The detected Claude Code manager grammar or removal path is not safely verifiable.');
  }

  const [marketplaces, plugins] = await Promise.all([
    run(options.executor, scopedCommand(['plugin', 'marketplace', 'list', '--json'], options.scope), execution),
    run(options.executor, scopedCommand(['plugin', 'list', '--json'], options.scope), execution),
  ]);
  if (!marketplaces.ok || !plugins.ok) {
    return failedInspection('Claude Code manager state could not be reread safely.');
  }
  const marketplace = classifyMarketplace(marketplaces.stdout);
  const plugin = classifyPlugin(plugins.stdout);
  if (marketplace === 'ambiguous' || plugin === 'ambiguous') {
    return manualInspection('Claude Code manager state is malformed or ambiguous for thoth-mem.');
  }
  if (marketplace === 'foreign' || plugin === 'foreign') {
    return {
      status: 'requires_user_action',
      marketplace,
      plugin,
      removalReady: true,
      diagnostics: ['A foreign Claude Code marketplace or plugin uses the thoth-mem identity.'],
      manualActions: ['Preserve the existing manager-owned installation and resolve ownership manually.'],
    };
  }
  if ((marketplace === 'absent' && plugin === 'present') || (marketplace === 'present' && plugin === 'absent')) {
    return {
      status: 'ready',
      marketplace,
      plugin,
      removalReady: true,
      diagnostics: [],
      manualActions: [],
    };
  }
  return {
    status: 'ready',
    marketplace,
    plugin,
    removalReady: true,
    diagnostics: [],
    manualActions: [],
  };
}

export async function runClaudeCodeManagerOperation(options: {
  executor: ClaudeCommandExecutor;
  operation: ClaudeManagerOperation;
  scope: SetupScope;
  projectPath?: string;
}): Promise<ClaudeManagerOperationResult> {
  const args = scopedCommand(operationCommand(options.operation), options.scope);
  try {
    const result = await options.executor.execute(args, executionOptions(
      options.scope,
      options.projectPath,
      MUTATION_TIMEOUT_MS,
    ));
    if (result.exitCode === 0 && !result.timedOut && !result.outputTruncated) {
      return { ok: true, interrupted: false, diagnostic: null };
    }
    return {
      ok: false,
      interrupted: false,
      diagnostic: 'Claude Code manager command did not complete with independently verifiable success.',
    };
  } catch {
    return {
      ok: false,
      interrupted: true,
      diagnostic: 'Claude Code manager command was interrupted before post-state verification.',
    };
  }
}

function operationCommand(operation: ClaudeManagerOperation): string[] {
  switch (operation) {
    case 'marketplace-add':
      return ['plugin', 'marketplace', 'add', CLAUDE_MARKETPLACE_SOURCE];
    case 'plugin-install':
      return ['plugin', 'install', CLAUDE_PLUGIN_ID];
    case 'plugin-uninstall':
      return ['plugin', 'uninstall', CLAUDE_PLUGIN_ID];
    case 'marketplace-remove':
      return ['plugin', 'marketplace', 'remove', CLAUDE_MARKETPLACE_NAME];
  }
}

function scopedCommand(args: readonly string[], scope: SetupScope): string[] {
  return [...args, '--scope', scope === 'global' ? 'user' : 'project'];
}

function executionOptions(
  scope: SetupScope,
  projectPath: string | undefined,
  timeoutMs: number,
): ClaudeCommandExecutionOptions {
  return {
    timeoutMs,
    ...(scope === 'project' && projectPath ? { cwd: projectPath } : {}),
  };
}

function failedInspection(diagnostic: string): ClaudeManagerInspection {
  return {
    status: 'requires_user_action',
    marketplace: 'ambiguous',
    plugin: 'ambiguous',
    removalReady: false,
    diagnostics: [diagnostic],
    manualActions: ['Verify the installed Claude Code command and retry.'],
  };
}

function manualInspection(diagnostic: string): ClaudeManagerInspection {
  return {
    status: 'requires_user_action',
    marketplace: 'ambiguous',
    plugin: 'ambiguous',
    removalReady: false,
    diagnostics: [diagnostic],
    manualActions: ['Use the documented Claude Code manager workflow manually; no thoth-mem change was made.'],
  };
}

function containsAll(value: string, tokens: readonly string[]): boolean {
  const normalized = value.toLowerCase();
  return tokens.every((token) => normalized.includes(token));
}

function classifyMarketplace(text: string): ClaudeManagerState {
  const parsed = parseList(text, 'marketplaces');
  if (!parsed) return 'ambiguous';
  const matches = parsed.filter((entry) => entry.name === CLAUDE_MARKETPLACE_NAME);
  if (matches.length === 0) return 'absent';
  if (matches.length !== 1) return 'ambiguous';
  return matches[0]?.source === CLAUDE_MARKETPLACE_SOURCE ? 'present' : 'foreign';
}

function classifyPlugin(text: string): ClaudeManagerState {
  const parsed = parseList(text, 'plugins');
  if (!parsed) return 'ambiguous';
  const matches = parsed.filter((entry) => entry.name === CLAUDE_MARKETPLACE_NAME || entry.id === CLAUDE_PLUGIN_ID);
  if (matches.length === 0) return 'absent';
  if (matches.length !== 1) return 'ambiguous';
  const plugin = matches[0]!;
  return plugin.id === CLAUDE_PLUGIN_ID
    && plugin.name === CLAUDE_MARKETPLACE_NAME
    && plugin.marketplace === CLAUDE_MARKETPLACE_NAME
    && plugin.enabled === true
    ? 'present'
    : 'foreign';
}

function parseList(text: string, key: string): Array<Record<string, unknown>> | null {
  if (Buffer.byteLength(text, 'utf8') > MAX_OUTPUT_BYTES) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const value = parsed[key];
    return Array.isArray(value) && value.every(isRecord) ? value : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function run(
  executor: ClaudeCommandExecutor,
  args: readonly string[],
  options: ClaudeCommandExecutionOptions,
): Promise<{ ok: boolean; stdout: string; errorCode?: string }> {
  try {
    const result = await executor.execute(args, options);
    const stdout = result.stdout.length <= MAX_OUTPUT_BYTES ? result.stdout : '';
    const errorCode = safeSpawnErrorCode(result.errorCode);
    return {
      ok: result.exitCode === 0 && !result.timedOut && !result.outputTruncated && stdout.length > 0,
      stdout,
      ...(errorCode ? { errorCode } : {}),
    };
  } catch (error) {
    const errorCode = safeSpawnErrorCode(error);
    return { ok: false, stdout: '', ...(errorCode ? { errorCode } : {}) };
  }
}

function safeSpawnErrorCode(error: unknown): string | undefined {
  let code: unknown;
  if (typeof error === 'string') {
    code = error;
  } else if (error && typeof error === 'object' && 'code' in error) {
    code = (error as { code?: unknown }).code;
  }
  return typeof code === 'string' && SAFE_SPAWN_ERROR_CODES.has(code)
    ? code
    : undefined;
}

function executeCommand(
  command: string,
  args: readonly string[],
  timeoutMs: number,
  cwd: string | undefined,
  maxOutputBytes: number,
): Promise<ClaudeCommandResult> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const errorCode = safeSpawnErrorCode(error);
      resolve({
        exitCode: null,
        stdout: '',
        stderr: '',
        error: 'spawn_failed',
        ...(errorCode ? { errorCode } : {}),
      });
      return;
    }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let outputTruncated = false;
    const append = (current: string, chunk: Buffer): string => {
      if (Buffer.byteLength(current, 'utf8') >= maxOutputBytes) {
        outputTruncated = true;
        return current;
      }
      const remaining = maxOutputBytes - Buffer.byteLength(current, 'utf8');
      const text = chunk.toString('utf8');
      if (Buffer.byteLength(text, 'utf8') > remaining) {
        outputTruncated = true;
        return current + Buffer.from(text, 'utf8').subarray(0, remaining).toString('utf8');
      }
      return current + text;
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout?.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.on('error', (error) => {
      clearTimeout(timer);
      const errorCode = safeSpawnErrorCode(error);
      resolve({
        exitCode: null,
        stdout,
        stderr,
        error: 'spawn_failed',
        ...(errorCode ? { errorCode } : {}),
      });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut, outputTruncated });
    });
  });
}
