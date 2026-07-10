import spawn from 'cross-spawn';

import type {
  SetupScope,
  SetupStatus,
  SetupStep,
  SetupStepOutcome,
} from './types.js';

const MARKETPLACE_SOURCE = 'EremesNG/thoth-mem';
const MARKETPLACE_NAME = 'thoth-mem';
const PLUGIN_NAME = 'thoth-mem';
const SHORT_PROBE_TIMEOUT_MS = 5_000;
const NETWORK_MUTATION_TIMEOUT_MS = 120_000;
const RECONCILIATION_BUDGET_MS = 30_000;
const RECONCILIATION_INTERVAL_MS = 1_000;
const RECONCILIATION_MAX_POLLS = 30;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
const SAFE_SPAWN_ERROR_CODES = new Set([
  'EACCES',
  'EAGAIN',
  'EINTR',
  'EINVAL',
  'EIO',
  'ENOENT',
  'ENOEXEC',
  'ENOMEM',
  'ENOTDIR',
  'EPERM',
]);

export interface CodexCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  outputTruncated?: boolean;
  error?: string;
  errorCode?: string;
}

export interface CodexCommandExecutor {
  execute(
    args: readonly string[],
    options?: CodexCommandExecutionOptions,
  ): Promise<CodexCommandResult>;
}

export interface CodexCommandExecutionOptions {
  timeoutMs: number;
}

export interface NodeCodexCommandExecutorOptions {
  command?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export type CodexExternalStepId = 'codex-marketplace' | 'codex-plugin';

interface CodexOperationPlan {
  id: CodexExternalStepId;
  name: string;
  noun: 'marketplace registration' | 'plugin installation';
  verified: boolean;
  available: boolean;
  mutationArgs: string[] | null;
  verificationArgs: string[] | null;
  unavailableDiagnostic: string;
}

export interface CodexCliPlan {
  scope: SetupScope;
  status: 'ready' | 'failed' | 'requires_user_action';
  operations: CodexOperationPlan[];
  steps: SetupStep[];
  diagnostics: string[];
  manualActions: string[];
}

export interface CodexExternalCheckpoint {
  id: CodexExternalStepId;
  outcome: SetupStepOutcome;
  diagnostic?: string;
}

export interface CodexCliExecutionResult {
  status: SetupStatus;
  changed: boolean;
  steps: SetupStep[];
  diagnostics: string[];
  manualActions: string[];
  checkpointsConfirmed: boolean;
}

export interface InspectCodexCliOptions {
  executor: CodexCommandExecutor;
  scope: SetupScope;
  projectPath?: string;
}

export interface ExecuteCodexCliOptions {
  executor: CodexCommandExecutor;
  checkpoint?: (checkpoint: CodexExternalCheckpoint) => Promise<boolean>;
  timing?: CodexExecutionTiming;
}

export interface CodexExecutionTiming {
  now(): number;
  sleep(delayMs: number): Promise<void>;
}

interface SafeCommandResult {
  ok: boolean;
  output: string;
  exitCode: number | null;
  reason: 'ok' | 'timeout' | 'output_limit' | 'spawn_failure' | 'nonzero';
  errorCode?: string;
}

interface OperationGrammar {
  available: boolean;
  mutationArgs: string[] | null;
  verificationArgs: string[] | null;
}

interface MutationGrammarVariant {
  positional: string;
  value: string;
}

export function createNodeCodexCommandExecutor(
  options: NodeCodexCommandExecutorOptions = {},
): CodexCommandExecutor {
  const command = options.command ?? 'codex';
  const defaultTimeoutMs = options.timeoutMs ?? SHORT_PROBE_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

  return {
    execute(
      args: readonly string[],
      execution?: CodexCommandExecutionOptions,
    ): Promise<CodexCommandResult> {
      return executeCommand(
        command,
        args,
        execution?.timeoutMs ?? defaultTimeoutMs,
        maxOutputBytes,
      );
    },
  };
}

export async function inspectCodexCli(
  options: InspectCodexCliOptions,
): Promise<CodexCliPlan> {
  const rootHelp = await runSafe(options.executor, ['--help']);
  if (!rootHelp.ok) {
    return failedPlan(
      options.scope,
      probeFailureDiagnostic(rootHelp.reason, rootHelp.errorCode),
    );
  }
  if (!advertisesCommand(rootHelp.output, 'plugin')) {
    return unavailablePlan(options.scope, false, false);
  }

  const pluginHelp = await runSafe(options.executor, ['plugin', '--help']);
  if (!pluginHelp.ok) {
    return failedPlan(
      options.scope,
      probeFailureDiagnostic(pluginHelp.reason, pluginHelp.errorCode),
    );
  }

  const marketplaceGrammar = await inspectMarketplaceGrammar(
    options,
    pluginHelp.output,
  );
  if ('failure' in marketplaceGrammar) {
    return failedPlan(options.scope, marketplaceGrammar.failure);
  }
  const pluginGrammar = await inspectPluginGrammar(options, pluginHelp.output);
  if ('failure' in pluginGrammar) {
    return failedPlan(options.scope, pluginGrammar.failure);
  }

  const marketplaceVerification = marketplaceGrammar.verificationArgs
    ? await verifyState(
        options.executor,
        marketplaceGrammar.verificationArgs,
        MARKETPLACE_SOURCE,
      )
    : null;
  if (marketplaceVerification && !marketplaceVerification.ok) {
    return failedPlan(
      options.scope,
      verificationProbeDiagnostic(
        'marketplace',
        marketplaceVerification.reason,
        marketplaceVerification.errorCode,
      ),
    );
  }
  const pluginVerification = pluginGrammar.verificationArgs
    ? await verifyState(options.executor, pluginGrammar.verificationArgs, PLUGIN_NAME)
    : null;
  if (pluginVerification && !pluginVerification.ok) {
    return failedPlan(
      options.scope,
      verificationProbeDiagnostic(
        'plugin',
        pluginVerification.reason,
        pluginVerification.errorCode,
      ),
    );
  }

  const marketplace = operationPlan({
    id: 'codex-marketplace',
    name: `Register thoth-mem Codex marketplace (${options.scope})`,
    noun: 'marketplace registration',
    verified: marketplaceVerification?.verified ?? false,
    grammar: marketplaceGrammar,
    unavailableDiagnostic: options.scope === 'project'
      ? 'The detected Codex CLI does not advertise project-scoped marketplace registration.'
      : 'The detected Codex CLI does not advertise a safely verifiable marketplace registration command.',
  });
  const plugin = operationPlan({
    id: 'codex-plugin',
    name: `Install thoth-mem Codex plugin (${options.scope})`,
    noun: 'plugin installation',
    verified: pluginVerification?.verified ?? false,
    grammar: pluginGrammar,
    unavailableDiagnostic: options.scope === 'project'
      ? 'The detected Codex CLI does not advertise project-scoped plugin installation.'
      : 'The detected Codex CLI does not advertise a safely verifiable plugin installation command.',
  });
  const operations = [marketplace, plugin];
  const unavailable = operations.filter((operation) => !operation.verified && !operation.available);
  const allProjectOperationsUnavailable = options.scope === 'project'
    && unavailable.length === operations.length;
  const diagnostics = allProjectOperationsUnavailable
    ? ['The detected Codex CLI does not advertise project-scoped marketplace and plugin operations.']
    : unavailable.map((operation) => operation.unavailableDiagnostic);

  return {
    scope: options.scope,
    status: unavailable.length > 0 ? 'requires_user_action' : 'ready',
    operations,
    steps: operations.map(operationStep),
    diagnostics,
    manualActions: unavailable.length > 0 ? [manualPluginsAction()] : [],
  };
}

export async function executeCodexCli(
  plan: CodexCliPlan,
  options: ExecuteCodexCliOptions,
): Promise<CodexCliExecutionResult> {
  if (plan.status !== 'ready') {
    return {
      status: plan.status,
      changed: false,
      steps: plan.steps,
      diagnostics: plan.diagnostics,
      manualActions: plan.manualActions,
      checkpointsConfirmed: true,
    };
  }

  const steps: SetupStep[] = [];
  const diagnostics: string[] = [];
  const manualActions: string[] = [];
  let changed = false;
  let checkpointsConfirmed = true;
  let verifiedCount = 0;

  for (const operation of plan.operations) {
    if (operation.verified) {
      steps.push({ name: operation.name, outcome: 'confirmed' });
      verifiedCount += 1;
      continue;
    }

    changed = true;
    const mutation = await runSafe(
      options.executor,
      operation.mutationArgs!,
      NETWORK_MUTATION_TIMEOUT_MS,
    );
    const attemptDiagnostic = mutation.ok
      ? `${capitalize(operation.noun)} command completed; independent verification is pending.`
      : mutationFailureDiagnostic(operation.noun, mutation);
    checkpointsConfirmed = await persistCheckpoint(options, {
      id: operation.id,
      outcome: mutation.ok ? 'planned' : 'failed',
      diagnostic: attemptDiagnostic,
    });
    if (!checkpointsConfirmed) {
      diagnostics.push('Codex external command outcome could not be checkpointed in the setup receipt.');
      steps.push({ name: operation.name, outcome: 'failed' });
      break;
    }

    const verification = mutation.reason === 'ok' || mutation.reason === 'timeout'
      ? await reconcileState(
          options.executor,
          operation.verificationArgs!,
          operation.id === 'codex-marketplace' ? MARKETPLACE_SOURCE : PLUGIN_NAME,
          options.timing,
        )
      : {
          ok: false,
          verified: false,
          reason: mutation.reason,
          ...(mutation.errorCode ? { errorCode: mutation.errorCode } : {}),
        };
    const verified = verification.ok && verification.verified;
    let finalDiagnostic: string | undefined;
    if (!verified) {
      if (!mutation.ok) {
        finalDiagnostic = mutationFailureDiagnostic(operation.noun, mutation);
      } else if (verification.ok) {
        finalDiagnostic = `Codex ${operation.noun} exited successfully but independent verification did not confirm thoth-mem.`;
      } else {
        finalDiagnostic = verificationFailureDiagnostic(
          operation.noun,
          verification.reason,
          verification.errorCode,
        );
      }
      diagnostics.push(finalDiagnostic);
      manualActions.push(retryAction(operation.id));
    }

    checkpointsConfirmed = await persistCheckpoint(options, {
      id: operation.id,
      outcome: verified ? 'confirmed' : 'failed',
      ...(finalDiagnostic ? { diagnostic: finalDiagnostic } : {}),
    });
    if (!checkpointsConfirmed) {
      diagnostics.push('Codex external verification outcome could not be checkpointed in the setup receipt.');
      steps.push({ name: operation.name, outcome: 'failed' });
      break;
    }

    steps.push({ name: operation.name, outcome: verified ? 'confirmed' : 'failed' });
    if (verified) {
      verifiedCount += 1;
    }
  }

  if (!checkpointsConfirmed) {
    return {
      status: 'failed',
      changed,
      steps: completeMissingSteps(plan.operations, steps),
      diagnostics,
      manualActions: ['Inspect the verified in-progress receipt before retrying Codex setup.'],
      checkpointsConfirmed: false,
    };
  }

  const status = externalStatus(verifiedCount, plan.operations.length);
  return {
    status,
    changed,
    steps,
    diagnostics,
    manualActions,
    checkpointsConfirmed: true,
  };
}

async function inspectMarketplaceGrammar(
  options: InspectCodexCliOptions,
  pluginHelp: string,
): Promise<OperationGrammar | { failure: string }> {
  if (!advertisesCommand(pluginHelp, 'marketplace')) {
    return unavailableGrammar();
  }
  const marketplaceHelp = await runSafe(options.executor, ['plugin', 'marketplace', '--help']);
  if (!marketplaceHelp.ok) {
    return {
      failure: probeFailureDiagnostic(marketplaceHelp.reason, marketplaceHelp.errorCode),
    };
  }
  const hasAdd = advertisesCommand(marketplaceHelp.output, 'add');
  const hasList = advertisesCommand(marketplaceHelp.output, 'list');
  return inspectOperationGrammar(options, {
    hasAdd,
    hasList,
    addHelpArgs: ['plugin', 'marketplace', 'add', '--help'],
    listHelpArgs: ['plugin', 'marketplace', 'list', '--help'],
    addUsage: 'codex plugin marketplace add',
    listUsage: 'codex plugin marketplace list',
    mutationVariants: [{ positional: '<SOURCE>', value: MARKETPLACE_SOURCE }],
    mutationBase: ['plugin', 'marketplace', 'add'],
    verificationBase: ['plugin', 'marketplace', 'list'],
  });
}

async function inspectPluginGrammar(
  options: InspectCodexCliOptions,
  pluginHelp: string,
): Promise<OperationGrammar | { failure: string }> {
  return inspectOperationGrammar(options, {
    hasAdd: advertisesCommand(pluginHelp, 'add'),
    hasList: advertisesCommand(pluginHelp, 'list'),
    addHelpArgs: ['plugin', 'add', '--help'],
    listHelpArgs: ['plugin', 'list', '--help'],
    addUsage: 'codex plugin add',
    listUsage: 'codex plugin list',
    mutationVariants: [
      { positional: '<PLUGIN>', value: PLUGIN_NAME },
      {
        positional: '<PLUGIN[@MARKETPLACE]>',
        value: `${PLUGIN_NAME}@${MARKETPLACE_NAME}`,
      },
    ],
    mutationBase: ['plugin', 'add'],
    verificationBase: ['plugin', 'list'],
  });
}

async function inspectOperationGrammar(
  options: InspectCodexCliOptions,
  shape: {
    hasAdd: boolean;
    hasList: boolean;
    addHelpArgs: string[];
    listHelpArgs: string[];
    addUsage: string;
    listUsage: string;
    mutationVariants: MutationGrammarVariant[];
    mutationBase: string[];
    verificationBase: string[];
  },
): Promise<OperationGrammar | { failure: string }> {
  let addHelp = '';
  let listHelp = '';
  if (shape.hasAdd) {
    const result = await runSafe(options.executor, shape.addHelpArgs);
    if (!result.ok) {
      return { failure: probeFailureDiagnostic(result.reason, result.errorCode) };
    }
    addHelp = result.output;
  }
  if (shape.hasList) {
    const result = await runSafe(options.executor, shape.listHelpArgs);
    if (!result.ok) {
      return { failure: probeFailureDiagnostic(result.reason, result.errorCode) };
    }
    listHelp = result.output;
  }

  const mutationVariant = shape.hasAdd
    ? shape.mutationVariants.find((variant) => (
        advertisesUsage(addHelp, shape.addUsage, variant.positional)
      ))
    : undefined;
  const listGrammar = shape.hasList
    && advertisesUsage(listHelp, shape.listUsage);
  const projectScoped = options.scope === 'project';
  const scopedGrammar = !projectScoped
    || (advertisesProjectOption(addHelp) && advertisesProjectOption(listHelp));
  const mutationArgs = mutationVariant && scopedGrammar
    ? withScope(shape.mutationBase, options, mutationVariant.value)
    : null;
  const verificationArgs = listGrammar && (!projectScoped || advertisesProjectOption(listHelp))
    ? withScope(shape.verificationBase, options)
    : null;
  return {
    available: mutationArgs !== null && verificationArgs !== null,
    mutationArgs,
    verificationArgs,
  };
}

function operationPlan(input: {
  id: CodexExternalStepId;
  name: string;
  noun: CodexOperationPlan['noun'];
  verified: boolean;
  grammar: OperationGrammar;
  unavailableDiagnostic: string;
}): CodexOperationPlan {
  return {
    id: input.id,
    name: input.name,
    noun: input.noun,
    verified: input.verified,
    available: input.grammar.available,
    mutationArgs: input.grammar.mutationArgs,
    verificationArgs: input.grammar.verificationArgs,
    unavailableDiagnostic: input.unavailableDiagnostic,
  };
}

function operationStep(operation: CodexOperationPlan): SetupStep {
  let outcome: SetupStepOutcome = 'unavailable';
  if (operation.verified) {
    outcome = 'confirmed';
  } else if (operation.available) {
    outcome = 'planned';
  }
  return {
    name: operation.name,
    outcome,
  };
}

function externalStatus(verifiedCount: number, operationCount: number): SetupStatus {
  if (verifiedCount === operationCount) {
    return 'complete';
  }
  return verifiedCount > 0 ? 'partial' : 'failed';
}

function unavailableGrammar(): OperationGrammar {
  return {
    available: false,
    mutationArgs: null,
    verificationArgs: null,
  };
}

function withScope(
  base: string[],
  options: InspectCodexCliOptions,
  value?: string,
): string[] {
  const args = [...base];
  if (options.scope === 'project') {
    args.push('--project', options.projectPath!);
  }
  if (value) {
    args.push(value);
  }
  return args;
}

function advertisesCommand(help: string, command: string): boolean {
  const expression = new RegExp(`^\\s{0,8}${escapeRegExp(command)}(?:\\s{2,}|$)`, 'm');
  return expression.test(help);
}

function advertisesUsage(help: string, command: string, positional?: string): boolean {
  const marker = `usage: ${command.toLowerCase()}`;
  const normalized = help.toLowerCase();
  const start = normalized.indexOf(marker);
  if (start < 0) {
    return false;
  }
  const lineEnd = help.indexOf('\n', start);
  const usage = help.slice(start, lineEnd < 0 ? help.length : lineEnd);
  return positional ? usage.includes(positional) : true;
}

function advertisesProjectOption(help: string): boolean {
  return /(?:^|\s|\[)--project\s+<[^>]+>/m.test(help);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function verifyState(
  executor: CodexCommandExecutor,
  args: string[],
  expected: string,
  timeoutMs = SHORT_PROBE_TIMEOUT_MS,
): Promise<{
  ok: boolean;
  verified: boolean;
  reason: SafeCommandResult['reason'];
  errorCode?: string;
}> {
  const result = await runSafe(executor, args, timeoutMs);
  return {
    ok: result.ok,
    verified: result.ok && containsIdentity(result.output, expected),
    reason: result.reason,
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
  };
}

async function reconcileState(
  executor: CodexCommandExecutor,
  args: string[],
  expected: string,
  injectedTiming?: CodexExecutionTiming,
): Promise<{
  ok: boolean;
  verified: boolean;
  reason: SafeCommandResult['reason'];
  errorCode?: string;
}> {
  const timing = injectedTiming ?? {
    now: Date.now,
    sleep: sleepFor,
  };
  const startedAt = timing.now();
  let polls = 0;
  let latest: {
    ok: boolean;
    verified: boolean;
    reason: SafeCommandResult['reason'];
    errorCode?: string;
  } = {
    ok: true,
    verified: false,
    reason: 'ok',
  };

  while (polls < RECONCILIATION_MAX_POLLS) {
    const remainingBeforePoll = remainingReconciliationBudget(startedAt, timing.now());
    if (remainingBeforePoll <= 0) {
      break;
    }

    latest = await verifyState(
      executor,
      args,
      expected,
      Math.min(SHORT_PROBE_TIMEOUT_MS, remainingBeforePoll),
    );
    polls += 1;
    if (!latest.ok || latest.verified || polls >= RECONCILIATION_MAX_POLLS) {
      break;
    }

    const remainingAfterPoll = remainingReconciliationBudget(startedAt, timing.now());
    if (remainingAfterPoll <= 0) {
      break;
    }
    await timing.sleep(Math.min(RECONCILIATION_INTERVAL_MS, remainingAfterPoll));
  }

  return latest;
}

function remainingReconciliationBudget(startedAt: number, now: number): number {
  return Math.max(0, RECONCILIATION_BUDGET_MS - Math.max(0, now - startedAt));
}

function sleepFor(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function containsIdentity(output: string, identity: string): boolean {
  const escaped = escapeRegExp(identity);
  return new RegExp(`(?:^|[\\s\"'])${escaped}(?:$|[\\s\"'])`, 'm').test(output);
}

async function runSafe(
  executor: CodexCommandExecutor,
  args: string[],
  timeoutMs = SHORT_PROBE_TIMEOUT_MS,
): Promise<SafeCommandResult> {
  let result: CodexCommandResult;
  try {
    result = await executor.execute(args, { timeoutMs });
  } catch (error) {
    const errorCode = safeSpawnErrorCode(error);
    return {
      ok: false,
      output: '',
      exitCode: null,
      reason: 'spawn_failure',
      ...(errorCode ? { errorCode } : {}),
    };
  }
  if (result.timedOut) {
    return { ok: false, output: '', exitCode: result.exitCode, reason: 'timeout' };
  }
  if (result.outputTruncated || byteLength(result.stdout) + byteLength(result.stderr) > DEFAULT_MAX_OUTPUT_BYTES) {
    return { ok: false, output: '', exitCode: result.exitCode, reason: 'output_limit' };
  }
  if (result.error) {
    const errorCode = safeSpawnErrorCode(result.errorCode);
    return {
      ok: false,
      output: '',
      exitCode: result.exitCode,
      reason: 'spawn_failure',
      ...(errorCode ? { errorCode } : {}),
    };
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0) {
    return { ok: false, output: '', exitCode: result.exitCode, reason: 'nonzero' };
  }
  return { ok: true, output, exitCode: result.exitCode, reason: 'ok' };
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function failedPlan(scope: SetupScope, diagnostic: string): CodexCliPlan {
  const operations = unavailableOperations(scope);
  return {
    scope,
    status: 'failed',
    operations,
    steps: operations.map((operation) => ({ name: operation.name, outcome: 'failed' })),
    diagnostics: [diagnostic],
    manualActions: ['Verify the Codex CLI is installed and its non-mutating help/list commands are available, then retry.'],
  };
}

function unavailablePlan(
  scope: SetupScope,
  marketplaceVerified: boolean,
  pluginVerified: boolean,
): CodexCliPlan {
  const operations = unavailableOperations(scope).map((operation) => ({
    ...operation,
    verified: operation.id === 'codex-marketplace' ? marketplaceVerified : pluginVerified,
  }));
  return {
    scope,
    status: 'requires_user_action',
    operations,
    steps: operations.map(operationStep),
    diagnostics: ['The detected Codex CLI does not advertise a safe plugin management surface.'],
    manualActions: [manualPluginsAction()],
  };
}

function unavailableOperations(scope: SetupScope): CodexOperationPlan[] {
  return [
    {
      id: 'codex-marketplace',
      name: `Register thoth-mem Codex marketplace (${scope})`,
      noun: 'marketplace registration',
      verified: false,
      available: false,
      mutationArgs: null,
      verificationArgs: null,
      unavailableDiagnostic: 'Codex marketplace registration is unavailable.',
    },
    {
      id: 'codex-plugin',
      name: `Install thoth-mem Codex plugin (${scope})`,
      noun: 'plugin installation',
      verified: false,
      available: false,
      mutationArgs: null,
      verificationArgs: null,
      unavailableDiagnostic: 'Codex plugin installation is unavailable.',
    },
  ];
}

function probeFailureDiagnostic(
  reason: SafeCommandResult['reason'],
  errorCode?: string,
): string {
  switch (reason) {
    case 'timeout':
      return 'Codex CLI capability inspection timed out.';
    case 'output_limit':
      return 'Codex CLI capability inspection exceeded the safe output limit.';
    case 'spawn_failure':
      return errorCode
        ? `Codex CLI capability inspection could not start (${errorCode}).`
        : 'Codex CLI capability inspection could not start.';
    case 'nonzero':
      return 'Codex CLI capability inspection returned a nonzero exit code.';
    case 'ok':
      return 'Codex CLI capability inspection failed.';
  }
}

function verificationProbeDiagnostic(
  operation: 'marketplace' | 'plugin',
  reason: SafeCommandResult['reason'],
  errorCode?: string,
): string {
  return `Codex ${operation} state inspection failed: ${probeFailureDiagnostic(reason, errorCode)}`;
}

function mutationFailureDiagnostic(
  noun: CodexOperationPlan['noun'],
  result: SafeCommandResult,
): string {
  if (result.reason === 'nonzero' && result.exitCode !== null) {
    return `${capitalize(noun)} command exited with code ${result.exitCode}.`;
  }
  return `${capitalize(noun)} command failed safely: ${probeFailureDiagnostic(
    result.reason,
    result.errorCode,
  )}`;
}

function verificationFailureDiagnostic(
  noun: CodexOperationPlan['noun'],
  reason: SafeCommandResult['reason'],
  errorCode?: string,
): string {
  return `${capitalize(noun)} could not be independently verified: ${probeFailureDiagnostic(
    reason,
    errorCode,
  )}`;
}

function safeSpawnErrorCode(error: unknown): string | undefined {
  let code: unknown;
  if (typeof error === 'string') {
    code = error;
  } else if (error && typeof error === 'object' && 'code' in error) {
    code = (error as { code?: unknown }).code;
  } else {
    return undefined;
  }

  if (typeof code !== 'string' || !SAFE_SPAWN_ERROR_CODES.has(code)) {
    return undefined;
  }
  return code;
}

function retryAction(id: CodexExternalStepId): string {
  return id === 'codex-marketplace'
    ? 'Retry the advertised Codex marketplace registration, then verify EremesNG/thoth-mem appears in the marketplace list.'
    : 'Retry the advertised Codex plugin installation, then verify thoth-mem appears in the plugin list.';
}

function manualPluginsAction(): string {
  return 'Open Codex /plugins, install thoth-mem from EremesNG/thoth-mem, and verify both marketplace and plugin state there.';
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

async function persistCheckpoint(
  options: ExecuteCodexCliOptions,
  checkpoint: CodexExternalCheckpoint,
): Promise<boolean> {
  return options.checkpoint ? options.checkpoint(checkpoint) : true;
}

function completeMissingSteps(
  operations: CodexOperationPlan[],
  steps: SetupStep[],
): SetupStep[] {
  const names = new Set(steps.map((step) => step.name));
  return [
    ...steps,
    ...operations
      .filter((operation) => !names.has(operation.name))
      .map((operation) => ({ name: operation.name, outcome: 'unavailable' as const })),
  ];
}

function executeCommand(
  command: string,
  args: readonly string[],
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<CodexCommandResult> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, [...args], {
        shell: false,
        windowsHide: true,
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

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let timedOut = false;
    let outputTruncated = false;
    let spawnFailed = false;
    let spawnErrorCode: string | undefined;
    const append = (target: Buffer[], chunk: Buffer | string): void => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = Math.max(0, maxOutputBytes - bytes);
      if (buffer.length > remaining) {
        if (remaining > 0) {
          target.push(buffer.subarray(0, remaining));
          bytes += remaining;
        }
        outputTruncated = true;
        child.kill();
        return;
      }
      target.push(buffer);
      bytes += buffer.length;
    };
    child.stdout?.on('data', (chunk: Buffer) => append(stdout, chunk));
    child.stderr?.on('data', (chunk: Buffer) => append(stderr, chunk));
    child.on('error', (error) => {
      spawnFailed = true;
      spawnErrorCode = safeSpawnErrorCode(error);
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    timeout.unref();
    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        ...(timedOut ? { timedOut: true } : {}),
        ...(outputTruncated ? { outputTruncated: true } : {}),
        ...(spawnFailed ? { error: 'spawn_failed' } : {}),
        ...(spawnErrorCode ? { errorCode: spawnErrorCode } : {}),
      });
    });
  });
}
