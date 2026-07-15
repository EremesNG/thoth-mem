import spawn from 'cross-spawn';

import type {
  CodexSetupStrategy,
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
const SAFE_DIAGNOSTIC_MAX_CHARS = 512;
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
const TESTED_CODEX_VERSION = { major: 0, minor: 144 } as const;

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
  initialState: CodexObservedState;
  verified: boolean;
  available: boolean;
  mutationArgs: string[] | null;
  verificationArgs: string[] | null;
  unavailableDiagnostic: string;
}

export type CodexVersionClassification = 'tested' | 'untested' | 'unknown';
export type CodexManagerState = 'absent' | 'compatible' | 'partial' | 'unclassifiable';
export type CodexObservedState = 'present' | 'absent' | 'conflicting' | 'unclassifiable';
export type CodexCheckpointPhase = 'attempt' | 'reread';
export type SafeCommandFailureClass =
  | 'different_source_marketplace_collision'
  | 'scope_conflict'
  | 'divergent_source'
  | 'unsafe_path'
  | 'concurrent_activity';
export type SafeCommandReason = 'ok' | 'timeout' | 'output_limit' | 'spawn_failure' | 'nonzero';

export interface CodexOperationCapabilityEvidence {
  mutation: boolean;
  verification: boolean;
  format: 'json' | 'legacy' | null;
}

export interface CodexCliEvidence {
  version: {
    value: string | null;
    classification: CodexVersionClassification;
  };
  capabilities: {
    scope: SetupScope;
    marketplace: CodexOperationCapabilityEvidence;
    plugin: CodexOperationCapabilityEvidence;
    complete: boolean;
  };
  managerState: CodexManagerState;
}

export interface CodexCliPlan {
  scope: SetupScope;
  status: 'ready' | 'failed' | 'requires_user_action';
  strategy: CodexSetupStrategy | null;
  evidence: CodexCliEvidence;
  operations: CodexOperationPlan[];
  steps: SetupStep[];
  diagnostics: string[];
  manualActions: string[];
  manualMarketplaceRemoveCommand: string | null;
}

export interface CodexExternalCheckpoint {
  id: CodexExternalStepId;
  phase: CodexCheckpointPhase;
  outcome: SetupStepOutcome;
  diagnostic?: string;
}

export interface CodexOperationExecutionEvidence {
  id: CodexExternalStepId;
  initialState: CodexObservedState;
  safeAttempt: 'not_needed' | 'attempted' | 'blocked';
  commandReason: SafeCommandReason | null;
  failureClass: SafeCommandFailureClass | null;
  diagnostic?: string;
  attemptCheckpoint: { persisted: boolean; outcome: SetupStepOutcome } | null;
  reread: { performed: boolean; state: CodexObservedState };
  rereadCheckpoint: { persisted: boolean; outcome: SetupStepOutcome } | null;
  finalOutcome: Exclude<SetupStepOutcome, 'planned'>;
  requiresUserAction: boolean;
}

export interface CodexCliExecutionResult {
  status: SetupStatus;
  changed: boolean;
  steps: SetupStep[];
  diagnostics: string[];
  manualActions: string[];
  checkpointsConfirmed: boolean;
  operations: CodexOperationExecutionEvidence[];
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
  stdout: string;
  exitCode: number | null;
  reason: SafeCommandReason;
  errorCode?: string;
  failureClass?: SafeCommandFailureClass;
  collisionObserved?: boolean;
  safeDiagnostic?: string;
}

interface OperationGrammar {
  available: boolean;
  mutationArgs: string[] | null;
  verificationArgs: string[] | null;
  verificationFormat: 'json' | 'legacy' | null;
  manualRemoveCommand?: string | null;
}

interface StateVerification {
  ok: boolean;
  verified: boolean;
  state: CodexObservedState;
  reason: SafeCommandReason;
  errorCode?: string;
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
  const versionProbe = await runSafe(options.executor, ['--version']);
  if (!versionProbe.ok) {
    return failedPlan(
      options.scope,
      probeFailureDiagnostic(versionProbe.reason, versionProbe.errorCode),
    );
  }
  const version = classifyCodexVersion(versionProbe.stdout);
  const rootHelp = await runSafe(options.executor, ['--help']);
  if (!rootHelp.ok) {
    return failedPlan(
      options.scope,
      probeFailureDiagnostic(rootHelp.reason, rootHelp.errorCode),
    );
  }
  if (!advertisesCommand(rootHelp.output, 'plugin')) {
    return unavailablePlan(options.scope, version, false, false);
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
        'codex-marketplace',
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
    ? await verifyState(options.executor, pluginGrammar.verificationArgs, 'codex-plugin')
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
    initialState: marketplaceVerification?.state ?? 'unclassifiable',
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
    initialState: pluginVerification?.state ?? 'unclassifiable',
    verified: pluginVerification?.verified ?? false,
    grammar: pluginGrammar,
    unavailableDiagnostic: options.scope === 'project'
      ? 'The detected Codex CLI does not advertise project-scoped plugin installation.'
      : 'The detected Codex CLI does not advertise a safely verifiable plugin installation command.',
  });
  const operations = [marketplace, plugin];
  const evidence = codexCliEvidence(
    options.scope,
    version,
    marketplaceGrammar,
    pluginGrammar,
    marketplaceVerification?.state ?? 'unclassifiable',
    pluginVerification?.state ?? 'unclassifiable',
  );
  const strategy = selectCodexStrategy(evidence);
  const unavailable = operations.filter((operation) => !operation.verified && !operation.available);
  const allProjectOperationsUnavailable = options.scope === 'project'
    && unavailable.length === operations.length;
  const diagnostics = allProjectOperationsUnavailable
    ? ['The detected Codex CLI does not advertise project-scoped marketplace and plugin operations.']
    : unavailable.map((operation) => operation.unavailableDiagnostic);
  if (strategy === null && evidence.managerState === 'unclassifiable') {
    diagnostics.push('Codex manager state could not be classified safely for the selected scope.');
  }

  return {
    scope: options.scope,
    status: strategy === null ? 'requires_user_action' : 'ready',
    strategy,
    evidence,
    operations,
    steps: operations.map(operationStep),
    diagnostics,
    manualActions: unavailable.length > 0 ? [manualPluginsAction()] : [],
    manualMarketplaceRemoveCommand: marketplaceGrammar.manualRemoveCommand ?? null,
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
      operations: unexecutedOperationEvidence(plan.operations),
    };
  }
  if (plan.strategy === null) {
    return {
      status: 'requires_user_action',
      changed: false,
      steps: plan.steps,
      diagnostics: plan.diagnostics,
      manualActions: plan.manualActions,
      checkpointsConfirmed: true,
      operations: unexecutedOperationEvidence(plan.operations),
    };
  }
  if (plan.strategy === 'legacy_filesystem') {
    return {
      status: 'complete',
      changed: false,
      steps: plan.operations.map((operation) => ({ name: operation.name, outcome: 'skipped' })),
      diagnostics: plan.diagnostics,
      manualActions: [],
      checkpointsConfirmed: true,
      operations: plan.operations.map((operation) => operationEvidence(
        operation,
        'not_needed',
        'skipped',
      )),
    };
  }

  const steps: SetupStep[] = [];
  const diagnostics: string[] = [];
  const manualActions: string[] = [];
  const operations: CodexOperationExecutionEvidence[] = [];
  let changed = false;
  let checkpointsConfirmed = true;
  let verifiedCount = 0;

  for (const operation of plan.operations) {
    if (operation.verified) {
      steps.push({ name: operation.name, outcome: 'confirmed' });
      operations.push(operationEvidence(operation, 'not_needed', 'confirmed'));
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
      : mutationFailureDiagnostic(operation.noun, plan.scope, mutation);
    const attemptOutcome: Exclude<SetupStepOutcome, 'planned' | 'skipped' | 'unavailable'> = mutation.ok
      ? 'confirmed'
      : 'failed';
    checkpointsConfirmed = await persistCheckpoint(options, phasedCheckpoint({
      id: operation.id,
      outcome: attemptOutcome,
      diagnostic: attemptDiagnostic,
    }, 'attempt'));
    if (!checkpointsConfirmed) {
      diagnostics.push('Codex external command outcome could not be checkpointed in the setup receipt.');
      steps.push({ name: operation.name, outcome: 'failed' });
      operations.push(operationEvidence(operation, 'attempted', 'failed', {
        commandReason: mutation.reason,
        failureClass: mutation.failureClass ?? null,
        diagnostic: attemptDiagnostic,
        attemptCheckpoint: { persisted: false, outcome: attemptOutcome },
      }));
      break;
    }

    let rereadPerformed = true;
    let verification: StateVerification;
    if (mutation.reason === 'nonzero' || mutation.reason === 'output_limit') {
      verification = await verifyState(
        options.executor,
        operation.verificationArgs!,
        operation.id,
      );
    } else if (mutation.reason === 'ok' || mutation.reason === 'timeout') {
      verification = await reconcileState(
        options.executor,
        operation.verificationArgs!,
        operation.id,
        options.timing,
      );
    } else {
      rereadPerformed = false;
      verification = {
        ok: false,
        verified: false,
        state: operation.initialState,
        reason: mutation.reason,
        ...(mutation.errorCode ? { errorCode: mutation.errorCode } : {}),
      };
    }
    const verified = verification.ok && verification.verified;
    const manualRecovery = classifyManualRecovery(
      plan,
      operation,
      mutation,
      verification,
      rereadPerformed,
      verified,
    );
    let finalDiagnostic: string | undefined;
    if (!verified) {
      if (manualRecovery.requiresUserAction) {
        finalDiagnostic = manualRecoveryDiagnostic(plan.scope, mutation, verification);
      } else if (!mutation.ok) {
        finalDiagnostic = mutationFailureDiagnostic(operation.noun, plan.scope, mutation);
      } else if (verification.ok) {
        finalDiagnostic = `Codex ${operation.noun} exited successfully but independent verification did not confirm thoth-mem.`;
      } else {
        finalDiagnostic = verificationFailureDiagnostic(
          operation.noun,
          verification.reason,
          verification.errorCode,
        );
      }
      pushUnique(diagnostics, boundedDiagnostic(finalDiagnostic));
      pushUnique(
        manualActions,
        manualRecovery.requiresUserAction
          ? manualRecovery.manualAction
          : retryAction(operation.id),
      );
    }

    const rereadOutcome: Exclude<SetupStepOutcome, 'planned' | 'skipped' | 'unavailable'> = verified
      ? 'confirmed'
      : 'failed';
    checkpointsConfirmed = await persistCheckpoint(options, phasedCheckpoint({
      id: operation.id,
      outcome: rereadOutcome,
      ...(finalDiagnostic ? { diagnostic: finalDiagnostic } : {}),
    }, 'reread'));
    if (!checkpointsConfirmed) {
      diagnostics.push('Codex external verification outcome could not be checkpointed in the setup receipt.');
      steps.push({ name: operation.name, outcome: 'failed' });
      operations.push(operationEvidence(operation, 'attempted', 'failed', {
        commandReason: mutation.reason,
        failureClass: mutation.failureClass ?? null,
        diagnostic: finalDiagnostic ?? (!mutation.ok ? attemptDiagnostic : undefined),
        attemptCheckpoint: { persisted: true, outcome: attemptOutcome },
        reread: { performed: rereadPerformed, state: verification.state },
        rereadCheckpoint: { persisted: false, outcome: rereadOutcome },
        requiresUserAction: manualRecovery.requiresUserAction,
      }));
      break;
    }

    steps.push({ name: operation.name, outcome: verified ? 'confirmed' : 'failed' });
    operations.push(operationEvidence(
      operation,
      'attempted',
      verified ? 'confirmed' : 'failed',
      {
        commandReason: mutation.reason,
        failureClass: mutation.failureClass ?? null,
        diagnostic: finalDiagnostic ?? (!mutation.ok ? attemptDiagnostic : undefined),
        attemptCheckpoint: { persisted: true, outcome: attemptOutcome },
        reread: { performed: rereadPerformed, state: verification.state },
        rereadCheckpoint: { persisted: true, outcome: rereadOutcome },
        requiresUserAction: manualRecovery.requiresUserAction,
      },
    ));
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
      operations: completeMissingOperationEvidence(plan.operations, operations),
    };
  }

  const status = operations.some((operation) => operation.requiresUserAction)
    ? 'requires_user_action'
    : externalStatus(verifiedCount, plan.operations.length);
  return {
    status,
    changed,
    steps,
    diagnostics,
    manualActions,
    checkpointsConfirmed: true,
    operations,
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
  const grammar = await inspectOperationGrammar(options, {
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
  if ('failure' in grammar) {
    return grammar;
  }
  return {
    ...grammar,
    manualRemoveCommand: await inspectMarketplaceRemoveCommand(
      options,
      marketplaceHelp.output,
    ),
  };
}

async function inspectMarketplaceRemoveCommand(
  options: InspectCodexCliOptions,
  marketplaceHelp: string,
): Promise<string | null> {
  if (!advertisesCommand(marketplaceHelp, 'remove')) {
    return null;
  }
  const result = await runSafe(
    options.executor,
    ['plugin', 'marketplace', 'remove', '--help'],
  );
  if (
    !result.ok
    || !advertisesUsage(result.output, 'codex plugin marketplace remove', '<NAME>')
    || !advertisesJsonOption(result.output)
    || (options.scope === 'project' && !advertisesProjectOption(result.output))
  ) {
    return null;
  }
  return options.scope === 'global'
    ? 'codex plugin marketplace remove thoth-mem --json'
    : 'codex plugin marketplace remove --project <selected-project> thoth-mem --json';
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
  if (verificationArgs && advertisesJsonOption(listHelp)) {
    verificationArgs.push('--json');
  }
  return {
    available: mutationArgs !== null && verificationArgs !== null,
    mutationArgs,
    verificationArgs,
    verificationFormat: verificationArgs
      ? (verificationArgs.includes('--json') ? 'json' : 'legacy')
      : null,
  };
}

function operationPlan(input: {
  id: CodexExternalStepId;
  name: string;
  noun: CodexOperationPlan['noun'];
  initialState: CodexObservedState;
  verified: boolean;
  grammar: OperationGrammar;
  unavailableDiagnostic: string;
}): CodexOperationPlan {
  return {
    id: input.id,
    name: input.name,
    noun: input.noun,
    initialState: input.initialState,
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
    verificationFormat: null,
    manualRemoveCommand: null,
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

function advertisesJsonOption(help: string): boolean {
  return /(?:^|[\s[,])--json(?:[=\s,\]]|$)/m.test(help);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function verifyState(
  executor: CodexCommandExecutor,
  args: string[],
  operation: CodexExternalStepId,
  timeoutMs = SHORT_PROBE_TIMEOUT_MS,
): Promise<StateVerification> {
  const result = await runSafe(executor, args, timeoutMs);
  const state = result.ok
    ? operationState(result.stdout, operation, args.includes('--json'))
    : 'unclassifiable';
  return {
    ok: result.ok,
    verified: result.ok && state === 'present',
    state,
    reason: result.reason,
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
  };
}

async function reconcileState(
  executor: CodexCommandExecutor,
  args: string[],
  operation: CodexExternalStepId,
  injectedTiming?: CodexExecutionTiming,
): Promise<StateVerification> {
  const timing = injectedTiming ?? {
    now: Date.now,
    sleep: sleepFor,
  };
  const startedAt = timing.now();
  let polls = 0;
  let latest: StateVerification = {
    ok: true,
    verified: false,
    state: 'absent',
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
      operation,
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

function operationState(
  output: string,
  operation: CodexExternalStepId,
  structuredJson: boolean,
): CodexObservedState {
  if (structuredJson) {
    return operation === 'codex-marketplace'
      ? verifiesMarketplaceJson(output)
      : verifiesPluginJson(output);
  }
  return operation === 'codex-marketplace'
    ? verifiesLegacyMarketplace(output)
    : verifiesLegacyPlugin(output);
}

function verifiesMarketplaceJson(output: string): CodexObservedState {
  const parsed = parseJsonRecord(output);
  if (!parsed || !Array.isArray(parsed.marketplaces)) {
    return 'unclassifiable';
  }
  const candidates = parsed.marketplaces;
  if (!candidates.every(isRecord)) {
    return 'unclassifiable';
  }
  const exactName = candidates.filter((candidate) => candidate.name === MARKETPLACE_NAME);
  if (exactName.length === 0) {
    return 'absent';
  }
  return exactName.some((candidate) => {
    const source = candidate.marketplaceSource;
    return isRecord(source)
      && source.sourceType === 'git'
      && isCanonicalMarketplaceSource(source.source);
  }) ? 'present' : 'conflicting';
}

function verifiesPluginJson(output: string): CodexObservedState {
  const parsed = parseJsonRecord(output);
  if (!parsed || !Array.isArray(parsed.installed) || !Array.isArray(parsed.available)) {
    return 'unclassifiable';
  }
  if (![...parsed.installed, ...parsed.available].every(isRecord)) {
    return 'unclassifiable';
  }
  const exact = parsed.installed.filter((candidate) => (
    candidate.pluginId === `${PLUGIN_NAME}@${MARKETPLACE_NAME}`
    || candidate.name === PLUGIN_NAME
    || candidate.marketplaceName === MARKETPLACE_NAME
  ));
  if (exact.length === 0) {
    return 'absent';
  }
  return exact.some((candidate) => {
    const exactIdentity = candidate.pluginId === `${PLUGIN_NAME}@${MARKETPLACE_NAME}`
      && candidate.name === PLUGIN_NAME
      && candidate.marketplaceName === MARKETPLACE_NAME;
    return exactIdentity && candidate.installed === true && candidate.enabled === true;
  }) ? 'present' : 'conflicting';
}

function verifiesLegacyMarketplace(output: string): CodexObservedState {
  const lines = nonEmptyLines(output);
  if (lines.some((line) => isCanonicalMarketplaceSource(line))) {
    return 'present';
  }
  const rows = fixedWidthRows(lines);
  const headerIndex = rows.findIndex((row) => (
    normalizedColumnIndex(row, ['name']) >= 0
    && normalizedColumnIndex(row, ['source', 'repository', 'repository source']) >= 0
  ));
  if (headerIndex < 0) {
    return 'unclassifiable';
  }
  const header = rows[headerIndex]!;
  const nameIndex = normalizedColumnIndex(header, ['name']);
  const sourceIndex = normalizedColumnIndex(header, ['source', 'repository', 'repository source']);
  const targetRows = rows.slice(headerIndex + 1).filter((row) => row[nameIndex] === MARKETPLACE_NAME);
  if (targetRows.length === 0) {
    return 'absent';
  }
  return targetRows.some((row) => (
    row[nameIndex] === MARKETPLACE_NAME
    && isCanonicalMarketplaceSource(row[sourceIndex])
  )) ? 'present' : 'conflicting';
}

function verifiesLegacyPlugin(output: string): CodexObservedState {
  const lines = output
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const pluginId = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;
  const headerIndex = lines.findIndex((line) => (
    /^\s*PLUGIN\s+STATUS\s+VERSION\s+PATH\s*$/.test(line)
  ));
  if (headerIndex < 0) {
    return 'unclassifiable';
  }
  const enabledRow = new RegExp(
    `^\\s*${escapeRegExp(pluginId)}\\s+installed, enabled(?:\\s+|$)`,
  );
  const targetRows = lines.slice(headerIndex + 1).filter((line) => line.includes(pluginId));
  if (targetRows.length === 0) {
    return 'absent';
  }
  return targetRows.some((line) => enabledRow.test(line)) ? 'present' : 'conflicting';
}

function parseJsonRecord(output: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(output);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCanonicalMarketplaceSource(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const githubPrefix = 'https://github.com/';
  let repository = value.startsWith(githubPrefix)
    ? value.slice(githubPrefix.length)
    : value;
  if (repository.endsWith('.git')) {
    repository = repository.slice(0, -4);
  }
  return repository === MARKETPLACE_SOURCE;
}

function nonEmptyLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function fixedWidthRows(lines: string[]): string[][] {
  return lines.map((line) => line.split(/\s{2,}/));
}

function normalizedColumnIndex(row: string[], candidates: string[]): number {
  const normalized = row.map((column) => column.trim().toLowerCase());
  return normalized.findIndex((column) => candidates.includes(column));
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
      stdout: '',
      exitCode: null,
      reason: 'spawn_failure',
      ...(errorCode ? { errorCode } : {}),
    };
  }
  if (result.timedOut) {
    return { ok: false, output: '', stdout: '', exitCode: result.exitCode, reason: 'timeout' };
  }
  if (result.outputTruncated || byteLength(result.stdout) + byteLength(result.stderr) > DEFAULT_MAX_OUTPUT_BYTES) {
    return {
      ok: false,
      output: '',
      stdout: '',
      exitCode: result.exitCode,
      reason: 'output_limit',
    };
  }
  if (result.error) {
    const errorCode = safeSpawnErrorCode(result.errorCode);
    return {
      ok: false,
      output: '',
      stdout: '',
      exitCode: result.exitCode,
      reason: 'spawn_failure',
      ...(errorCode ? { errorCode } : {}),
    };
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0) {
    const classification = classifyNonzeroOutput(output);
    return {
      ok: false,
      output: '',
      stdout: '',
      exitCode: result.exitCode,
      reason: 'nonzero',
      ...classification,
      safeDiagnostic: boundedDiagnostic(nonzeroSafeDiagnostic(
        classification.failureClass,
        result.exitCode,
      )),
    };
  }
  return { ok: true, output, stdout: result.stdout, exitCode: result.exitCode, reason: 'ok' };
}

function classifyNonzeroOutput(output: string): Pick<
  SafeCommandResult,
  'failureClass' | 'collisionObserved'
> {
  const collisionObserved = /marketplace\s+['"]?thoth-mem['"]?\s+is already added from a different source;\s*remove it before adding this source/i.test(output);
  if (!collisionObserved) {
    return {};
  }
  if (/^scope\s*=\s*.+$/im.test(output)) {
    return { failureClass: 'scope_conflict', collisionObserved: true };
  }
  if (/^source\s*=\s*.+$/im.test(output)) {
    return { failureClass: 'divergent_source', collisionObserved: true };
  }
  if (/reparse|resolves? outside|symbolic link|junction/i.test(output)) {
    return { failureClass: 'unsafe_path', collisionObserved: true };
  }
  if (/manager busy|another marketplace operation|operation is in progress/i.test(output)) {
    return { failureClass: 'concurrent_activity', collisionObserved: true };
  }
  return {
    failureClass: 'different_source_marketplace_collision',
    collisionObserved: true,
  };
}

function nonzeroSafeDiagnostic(
  failureClass: SafeCommandFailureClass | undefined,
  exitCode: number | null,
): string {
  switch (failureClass) {
    case 'different_source_marketplace_collision':
      return 'Codex reported that thoth-mem is already added from a different marketplace source.';
    case 'scope_conflict':
      return 'Codex reported marketplace collision evidence for a conflicting scope.';
    case 'divergent_source':
      return 'Codex reported marketplace collision evidence with divergent source provenance.';
    case 'unsafe_path':
      return 'Codex reported marketplace collision evidence with unsafe path or link state.';
    case 'concurrent_activity':
      return 'Codex reported marketplace collision evidence while manager activity was in progress.';
    default:
      return exitCode === null
        ? 'Codex command returned a nonzero result.'
        : `Codex command exited with code ${exitCode}.`;
  }
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function classifyCodexVersion(output: string): CodexCliEvidence['version'] {
  const match = /(?:^|\s)(\d+)\.(\d+)\.(\d+)(?:\s|$)/.exec(output.trim());
  if (!match) {
    return { value: null, classification: 'unknown' };
  }
  const value = `${match[1]}.${match[2]}.${match[3]}`;
  const tested = Number(match[1]) === TESTED_CODEX_VERSION.major
    && Number(match[2]) === TESTED_CODEX_VERSION.minor;
  return { value, classification: tested ? 'tested' : 'untested' };
}

function operationCapability(grammar: OperationGrammar): CodexOperationCapabilityEvidence {
  return {
    mutation: grammar.mutationArgs !== null,
    verification: grammar.verificationArgs !== null,
    format: grammar.verificationFormat,
  };
}

function classifyManagerState(
  marketplace: CodexObservedState,
  plugin: CodexObservedState,
): CodexManagerState {
  if (
    marketplace === 'unclassifiable'
    || marketplace === 'conflicting'
    || plugin === 'unclassifiable'
    || plugin === 'conflicting'
  ) {
    return 'unclassifiable';
  }
  if (marketplace === 'present' && plugin === 'present') {
    return 'compatible';
  }
  if (marketplace === 'absent' && plugin === 'absent') {
    return 'absent';
  }
  return 'partial';
}

function codexCliEvidence(
  scope: SetupScope,
  version: CodexCliEvidence['version'],
  marketplaceGrammar: OperationGrammar,
  pluginGrammar: OperationGrammar,
  marketplaceState: CodexObservedState,
  pluginState: CodexObservedState,
): CodexCliEvidence {
  const marketplace = operationCapability(marketplaceGrammar);
  const plugin = operationCapability(pluginGrammar);
  return {
    version,
    capabilities: {
      scope,
      marketplace,
      plugin,
      complete: marketplace.mutation
        && marketplace.verification
        && plugin.mutation
        && plugin.verification,
    },
    managerState: classifyManagerState(marketplaceState, pluginState),
  };
}

function selectCodexStrategy(evidence: CodexCliEvidence): CodexSetupStrategy | null {
  if (evidence.managerState === 'unclassifiable') {
    return null;
  }
  if (
    evidence.version.classification === 'tested'
    && evidence.capabilities.complete
  ) {
    return 'plugin_manager';
  }
  return evidence.managerState === 'absent' ? 'legacy_filesystem' : null;
}

function emptyCodexCliEvidence(scope: SetupScope): CodexCliEvidence {
  const unavailable: CodexOperationCapabilityEvidence = {
    mutation: false,
    verification: false,
    format: null,
  };
  return {
    version: { value: null, classification: 'unknown' },
    capabilities: {
      scope,
      marketplace: unavailable,
      plugin: unavailable,
      complete: false,
    },
    managerState: 'unclassifiable',
  };
}

function failedPlan(scope: SetupScope, diagnostic: string): CodexCliPlan {
  const operations = unavailableOperations(scope);
  return {
    scope,
    status: 'failed',
    strategy: null,
    evidence: emptyCodexCliEvidence(scope),
    operations,
    steps: operations.map((operation) => ({ name: operation.name, outcome: 'failed' })),
    diagnostics: [diagnostic],
    manualActions: ['Verify the Codex CLI is installed and its non-mutating help/list commands are available, then retry.'],
    manualMarketplaceRemoveCommand: null,
  };
}

function unavailablePlan(
  scope: SetupScope,
  version: CodexCliEvidence['version'],
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
    strategy: null,
    evidence: {
      ...emptyCodexCliEvidence(scope),
      version,
    },
    operations,
    steps: operations.map(operationStep),
    diagnostics: ['The detected Codex CLI does not advertise a safe plugin management surface.'],
    manualActions: [manualPluginsAction()],
    manualMarketplaceRemoveCommand: null,
  };
}

function unavailableOperations(scope: SetupScope): CodexOperationPlan[] {
  return [
    {
      id: 'codex-marketplace',
      name: `Register thoth-mem Codex marketplace (${scope})`,
      noun: 'marketplace registration',
      initialState: 'unclassifiable',
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
      initialState: 'unclassifiable',
      verified: false,
      available: false,
      mutationArgs: null,
      verificationArgs: null,
      unavailableDiagnostic: 'Codex plugin installation is unavailable.',
    },
  ];
}

function operationEvidence(
  operation: CodexOperationPlan,
  safeAttempt: CodexOperationExecutionEvidence['safeAttempt'],
  finalOutcome: CodexOperationExecutionEvidence['finalOutcome'],
  overrides: Partial<CodexOperationExecutionEvidence> = {},
): CodexOperationExecutionEvidence {
  return {
    id: operation.id,
    initialState: operation.initialState,
    safeAttempt,
    commandReason: null,
    failureClass: null,
    attemptCheckpoint: null,
    reread: { performed: false, state: operation.initialState },
    rereadCheckpoint: null,
    finalOutcome,
    requiresUserAction: false,
    ...overrides,
  };
}

function unexecutedOperationEvidence(
  operations: CodexOperationPlan[],
): CodexOperationExecutionEvidence[] {
  return operations.map((operation) => operationEvidence(
    operation,
    operation.verified ? 'not_needed' : 'blocked',
    operation.verified ? 'confirmed' : 'unavailable',
  ));
}

function completeMissingOperationEvidence(
  planned: CodexOperationPlan[],
  executed: CodexOperationExecutionEvidence[],
): CodexOperationExecutionEvidence[] {
  const ids = new Set(executed.map((operation) => operation.id));
  return [
    ...executed,
    ...planned
      .filter((operation) => !ids.has(operation.id))
      .map((operation) => operationEvidence(operation, 'blocked', 'unavailable')),
  ];
}

function classifyManualRecovery(
  plan: CodexCliPlan,
  operation: CodexOperationPlan,
  mutation: SafeCommandResult,
  verification: StateVerification,
  rereadPerformed: boolean,
  verified: boolean,
): { requiresUserAction: boolean; manualAction: string } {
  if (verified || operation.id !== 'codex-marketplace' || !mutation.collisionObserved) {
    return { requiresUserAction: false, manualAction: retryAction(operation.id) };
  }
  const corroboratedStableAbsence = operation.initialState === 'absent'
    && rereadPerformed
    && verification.ok
    && verification.state === 'absent'
    && mutation.failureClass === 'different_source_marketplace_collision';
  if (corroboratedStableAbsence && plan.manualMarketplaceRemoveCommand) {
    return {
      requiresUserAction: true,
      manualAction: plan.manualMarketplaceRemoveCommand,
    };
  }
  return {
    requiresUserAction: true,
    manualAction: `Inspect the ${plan.scope} Codex marketplace list, resolve the unverified thoth-mem marketplace residue through Codex, then rerun setup.`,
  };
}

function manualRecoveryDiagnostic(
  scope: SetupScope,
  mutation: SafeCommandResult,
  verification: StateVerification,
): string {
  const state = verification.state === 'absent'
    ? 'the exact marketplace list still reports thoth-mem absent'
    : `the exact marketplace state is ${verification.state}`;
  const classification = mutation.failureClass === 'different_source_marketplace_collision'
    ? 'a different-source marketplace collision'
    : 'ambiguous marketplace collision evidence';
  return boundedDiagnostic(
    `Codex marketplace registration (${scope}) encountered ${classification}; ${state}. Manual Codex recovery is required before setup is retried.`,
  );
}

function phasedCheckpoint(
  checkpoint: Omit<CodexExternalCheckpoint, 'phase'>,
  phase: CodexCheckpointPhase,
): CodexExternalCheckpoint {
  const result = { ...checkpoint } as CodexExternalCheckpoint;
  Object.defineProperty(result, 'phase', {
    value: phase,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return result;
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function boundedDiagnostic(value: string): string {
  return truncateSafeDiagnostic(redactSafeDiagnostic(value));
}

function redactSafeDiagnostic(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/authorization\s*:\s*(?:bearer\s+)?[^\s,;]+/gi, 'Authorization: [redacted]')
    .replace(/https?:\/\/[^/\s:@]+:[^@\s/]+@/gi, 'https://[redacted]@')
    .replace(/([?&](?:token|secret|password|key)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\b(token|secret|password|authorization)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b[A-Za-z]:\\Users\\[^\\\r\n]+(?:\\[^\s\r\n]*)?/g, '<home>')
    .replace(/\/(?:Users|home)\/[^/\s]+(?:\/[^\s]*)?/g, '<home>');
}

function truncateSafeDiagnostic(value: string): string {
  if (value.length <= SAFE_DIAGNOSTIC_MAX_CHARS) {
    return value;
  }
  const suffix = '… [truncated]';
  return `${value.slice(0, SAFE_DIAGNOSTIC_MAX_CHARS - suffix.length)}${suffix}`;
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
  scope: SetupScope,
  result: SafeCommandResult,
): string {
  if (result.failureClass) {
    return boundedDiagnostic(
      `${capitalize(noun)} (${scope}) failed: ${result.safeDiagnostic ?? nonzeroSafeDiagnostic(result.failureClass, result.exitCode)} Exact selected-scope verification determines the final state.`,
    );
  }
  if (result.reason === 'nonzero' && result.exitCode !== null) {
    return `${capitalize(noun)} command exited with code ${result.exitCode}.`;
  }
  return boundedDiagnostic(
    `${capitalize(noun)} command failed safely: ${probeFailureDiagnostic(
      result.reason,
      result.errorCode,
    )}`,
  );
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
