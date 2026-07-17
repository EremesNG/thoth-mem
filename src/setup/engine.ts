import {createHash, randomUUID} from 'node:crypto';
import {lstat, readFile} from 'node:fs/promises';
import {basename, dirname, isAbsolute, join, relative, resolve} from 'node:path';

import {getConfig} from '../config.js';
import {getVersion} from '../version.js';
import type { ClaudeCommandExecutor } from './claude-code-cli.js';
    import { claudeCodeSetupStrategy } from './harnesses/claude-code.js';
import {
    createNodeCodexCommandExecutor,
    executeCodexCli,
    inspectCodexCli,
    type CodexCliExecutionResult,
    type CodexCliPlan,
    type CodexCommandExecutor,
    type CodexExecutionTiming,
    type CodexExternalCheckpoint,
    type CodexOperationExecutionEvidence,
} from './codex-cli.js';
import {
    applyAtomicFilesystemChanges,
    filesystemDirectoryMatches,
    filesystemEntrySnapshot,
    type AtomicFilesystemResult,
    type FilesystemBackup,
    type FilesystemChange,
    type FilesystemDirectoryEntry,
    type FilesystemFaultEvent,
} from './filesystem.js';
import {
    applyCodexManagedFragment,
    captureCodexManagedFragment,
    planCodexManagedConfig,
    planCodexManagedFragment,
    restoreCodexManagedFragment,
    type CodexManagedFragment,
} from './harnesses/codex.js';
import {
    inspectOpenCodeOwnedState,
    planOpenCodeManagedConfig,
    planOpenCodeManagedRollback,
} from './harnesses/opencode.js';
import {
    getDefaultSetupRoots,
    resolveSetupPaths,
    type SetupPaths,
    type SetupRoots,
} from './paths.js';
import {
    codexManagedFragmentFromReceiptEvidence,
    createCodexManagedFragmentReceiptEvidence,
    createSetupReceipt,
    loadSetupReceipt,
    persistSetupReceipt,
    resolveSetupReceiptPaths,
    scanSetupReceipts,
    type ReceiptFaultEvent,
    type ReceiptPaths,
    type SetupReceipt,
    type SetupReceiptManagedFragmentEvidence,
    type SetupReceiptStep,
    type SetupReceiptV1,
    type SetupReceiptV2,
    type SetupReceiptV2ManagerEvidence,
} from './receipt.js';
import {
    acquireSetupTargetLock,
    canonicalizeSetupTarget,
} from './transaction-lock.js';
import type {
    SetupRequest,
    SetupResult,
    SetupStep,
    SetupStepOutcome,
} from './types.js';

export const SETUP_MANAGED_METADATA_VERSION = 1;

type SetupPathType = 'missing' | 'file' | 'directory' | 'other';
type CodexRegistrationState = 'confirmed' | 'unverified';

export interface SetupFileSystem {
    pathType(path: string): Promise<SetupPathType>;

    readText(path: string): Promise<string>;

    directoryMatches(
        targetPath: string,
        layout: FilesystemDirectoryEntry[],
        ignoredRelativePaths: string[],
    ): Promise<boolean>;
}

export interface CodexRegistrationEvidence {
    scope: 'global' | 'project';
    marketplace: CodexRegistrationState;
    plugin: CodexRegistrationState;
}

export interface SetupEngineOptions {
    roots?: SetupRoots;
    fileSystem?: SetupFileSystem;
    codexRegistration?: CodexRegistrationEvidence;
    codexExecutor?: CodexCommandExecutor;
    claudeExecutor?: ClaudeCommandExecutor;
    codexTiming?: CodexExecutionTiming;
    dataDir?: string;
    executablePath?: string;
    transaction?: {
        idFactory?: () => string;
        now?: () => Date;
        trace?: (event: { kind: string; path?: string }) => void | Promise<void>;
        filesystemFault?: (event: FilesystemFaultEvent) => void | Promise<void>;
        receiptFault?: (event: ReceiptFaultEvent) => void | Promise<void>;
    };
}

interface ManagedSetupMetadata {
  schemaVersion: number;
  packageVersion: string;
  executable: string;
  harness: string;
  scope: string;
  target: string;
  configPath: string;
  assetsPath: string;
  verified: boolean;
}

interface SetupConflict {
  path: string;
  diagnostic: string;
  forceable: boolean;
}

interface SetupInspection {
  paths: SetupPaths;
  configType: SetupPathType;
  managed: boolean;
  conflicts: SetupConflict[];
  sourceAssetsAvailable: boolean;
  codexLegacyState: 'absent' | 'managed' | 'ambiguous' | null;
}

const OPENCODE_MCP_VALUE = {
  type: 'local' as const,
  command: ['thoth-mem', 'mcp', '--no-http'],
  enabled: true,
};
const OPENCODE_PLUGIN_ENTRY = 'export { default } from \'./.thoth-mem/opencode/plugin.mjs\';\n';
const MANAGED_METADATA_NAME = 'thoth-mem.installation.json';
const LEGACY_MANAGED_METADATA_NAME = '.thoth-mem-managed.json';

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export function createNodeSetupFileSystem(): SetupFileSystem {
  return {
    async pathType(path: string): Promise<SetupPathType> {
      try {
        const details = await lstat(path);
        if (details.isFile()) {
          return 'file';
        }
        if (details.isDirectory()) {
          return 'directory';
        }
        return 'other';
      } catch (error) {
        if (isMissingPathError(error)) {
            return 'missing';
        }
          throw error;
      }
    },
      async readText(path: string): Promise<string> {
          return readFile(path, 'utf8');
      },
      async directoryMatches(
          targetPath: string,
          layout: FilesystemDirectoryEntry[],
          ignoredRelativePaths: string[],
      ): Promise<boolean> {
          return filesystemDirectoryMatches(targetPath, layout, ignoredRelativePaths);
      },
  };
}

function displayHarness(request: SetupRequest): 'OpenCode' | 'Codex' | 'Claude Code' {
    if (request.harness === 'opencode') return 'OpenCode';
    return request.harness === 'codex' ? 'Codex' : 'Claude Code';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseManagedMetadata(text: string): ManagedSetupMetadata | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }

  const canonical = parsed as Partial<ManagedSetupMetadata>;
  const legacy = parsed as Record<string, unknown>;
  const candidate: Partial<ManagedSetupMetadata> = canonical.schemaVersion !== undefined
    ? canonical
    : {
        schemaVersion: legacy.schema_version as number | undefined,
        packageVersion: legacy.package_version as string | undefined,
        executable: legacy.executable_path as string | undefined,
        harness: legacy.harness as string | undefined,
        scope: legacy.scope as string | undefined,
        target: legacy.target as string | undefined,
        configPath: legacy.config_path as string | undefined,
        assetsPath: legacy.assets_path as string | undefined,
        verified: legacy.verified as boolean | undefined,
      };
  if (
    typeof candidate.schemaVersion !== 'number'
    || typeof candidate.packageVersion !== 'string'
    || candidate.packageVersion.length === 0
    || typeof candidate.executable !== 'string'
    || !isAbsolute(candidate.executable)
    || typeof candidate.harness !== 'string'
    || typeof candidate.scope !== 'string'
    || typeof candidate.target !== 'string'
    || typeof candidate.configPath !== 'string'
    || typeof candidate.assetsPath !== 'string'
    || typeof candidate.verified !== 'boolean'
  ) {
    return null;
  }

  return candidate as ManagedSetupMetadata;
}

function metadataMatches(
  metadata: ManagedSetupMetadata,
  request: SetupRequest,
  paths: SetupPaths,
): boolean {
  return metadata.schemaVersion === SETUP_MANAGED_METADATA_VERSION
    && metadata.packageVersion === getVersion()
    && metadata.harness === request.harness
    && metadata.scope === request.scope
    && metadata.target === paths.targetRoot
    && metadata.configPath === paths.configPath
    && metadata.assetsPath === paths.assetPath
    && metadata.verified;
}

function setupExecutablePath(options: SetupEngineOptions): string {
  const executable = options.executablePath ?? process.argv[1];
  return executable && isAbsolute(executable)
    ? resolve(executable)
    : resolve(executable ?? 'thoth-mem');
}

async function inspectSetup(
  request: SetupRequest,
  unresolvedPaths: SetupPaths,
  fileSystem: SetupFileSystem,
  options: SetupEngineOptions,
): Promise<SetupInspection> {
  const sourceAssetsType = await fileSystem.pathType(unresolvedPaths.sourceAssetsPath);
  const sourceAssetsAvailable = sourceAssetsType === 'directory';
  if (request.harness === 'opencode' && !sourceAssetsAvailable) {
    throw new Error('packaged-assets-unavailable');
  }
  if (
    unresolvedPaths.sourceSharedPath
    && await fileSystem.pathType(unresolvedPaths.sourceSharedPath) !== 'directory'
  ) {
    throw new Error('packaged-shared-assets-unavailable');
  }

  const candidateTypes = await Promise.all(unresolvedPaths.configCandidates.map(async (path) => ({
    path,
    type: await fileSystem.pathType(path),
  })));
  const existingConfigFiles = candidateTypes.filter((candidate) => candidate.type === 'file');
  const selectedConfigPath = existingConfigFiles.length === 1
    ? existingConfigFiles[0]!.path
    : unresolvedPaths.configPath;
  const paths = selectedConfigPath === unresolvedPaths.configPath
    ? unresolvedPaths
    : { ...unresolvedPaths, configPath: selectedConfigPath };
  const selectedCandidate = candidateTypes.find((candidate) => candidate.path === selectedConfigPath);
  const configType = selectedCandidate?.type ?? 'missing';
  const conflicts: SetupConflict[] = [];

  if (existingConfigFiles.length > 1) {
    conflicts.push({
      path: paths.targetRoot,
      diagnostic: `Multiple OpenCode configuration files exist: ${paths.configCandidates.join(', ')}`,
      forceable: false,
    });
  }
  for (const candidate of candidateTypes) {
    if (candidate.type === 'directory' || candidate.type === 'other') {
      conflicts.push({
        path: candidate.path,
        diagnostic: `Conflict at managed configuration target: ${candidate.path}`,
        forceable: false,
      });
    }
  }

  const configBefore = configType === 'file'
    ? await fileSystem.readText(paths.configPath)
    : null;
  const baselineConfigPlan = request.harness === 'opencode'
    ? planOpenCodeManagedConfig({
        before: configBefore,
        force: false,
        mcpValue: OPENCODE_MCP_VALUE,
      })
    : planCodexManagedConfig({ before: configBefore, force: false });
  for (const conflict of baselineConfigPlan.conflicts) {
    conflicts.push({
      path: `${paths.configPath}#${conflict.location}`,
      diagnostic: `Conflict at managed configuration location: ${paths.configPath}#${conflict.location}`,
      forceable: conflict.forceable,
    });
  }

  const assetType = await fileSystem.pathType(paths.assetPath);
  const canonicalMetadataPath = join(paths.assetPath, MANAGED_METADATA_NAME);
  const canonicalMetadataType = await fileSystem.pathType(canonicalMetadataPath);
  const legacyMetadataType = await fileSystem.pathType(paths.metadataPath);
  if (assetType === 'file' || assetType === 'other') {
    conflicts.push({
      path: paths.assetPath,
      diagnostic: `Conflict at managed asset target: ${paths.assetPath}`,
      forceable: true,
    });
  }

  let metadata: ManagedSetupMetadata | null = null;
  let metadataPath: string | null = null;
  if (canonicalMetadataType === 'file') {
    metadataPath = canonicalMetadataPath;
    metadata = parseManagedMetadata(await fileSystem.readText(canonicalMetadataPath));
  } else if (canonicalMetadataType !== 'missing') {
    conflicts.push({
      path: canonicalMetadataPath,
      diagnostic: `Conflict at managed metadata target: ${canonicalMetadataPath}`,
      forceable: false,
    });
  } else if (legacyMetadataType === 'file') {
    metadataPath = paths.metadataPath;
    metadata = parseManagedMetadata(await fileSystem.readText(paths.metadataPath));
  } else if (legacyMetadataType !== 'missing') {
    conflicts.push({
      path: paths.metadataPath,
      diagnostic: `Conflict at managed metadata target: ${paths.metadataPath}`,
      forceable: false,
    });
  }

  const matchingMetadata = metadata !== null
    && metadataMatches(metadata, request, paths);
  const canonicalMetadataMatches = matchingMetadata && metadataPath === canonicalMetadataPath;
  const assetLayout: FilesystemDirectoryEntry[] = request.harness === 'opencode'
    ? [
        { sourcePath: paths.sourceAssetsPath, targetRelativePath: 'opencode' },
        { sourcePath: paths.sourceSharedPath!, targetRelativePath: 'shared' },
      ]
    : [{ sourcePath: paths.sourceAssetsPath, targetRelativePath: '.' }];
  const assetContentsMatch = assetType === 'directory'
    && await fileSystem.directoryMatches(
      paths.assetPath,
      assetLayout,
      [MANAGED_METADATA_NAME, LEGACY_MANAGED_METADATA_NAME],
    );
  const pluginEntryMatches = request.harness === 'codex'
    || (
      await fileSystem.pathType(paths.pluginEntryPath) === 'file'
      && await fileSystem.readText(paths.pluginEntryPath) === OPENCODE_PLUGIN_ENTRY
    );
  const assetsMatch = assetContentsMatch && pluginEntryMatches;
  const configMatches = configType === 'file'
    && baselineConfigPlan.conflicts.length === 0
    && !baselineConfigPlan.changed
    && baselineConfigPlan.verification.ownedValuesMatch;
  const managed = canonicalMetadataMatches && configMatches && assetsMatch;
  const hasCodexLegacyResidue = request.harness === 'codex'
    && (
      configMatches
      || assetType !== 'missing'
      || metadataPath !== null
      || baselineConfigPlan.conflicts.length > 0
    );
  const codexLegacyState = request.harness === 'codex'
    ? managed
      ? 'managed'
      : hasCodexLegacyResidue
        ? 'ambiguous'
        : 'absent'
    : null;

  if (metadataPath && !matchingMetadata) {
    conflicts.push({
      path: metadataPath,
      diagnostic: `Invalid, stale, or incomplete thoth-mem setup metadata at: ${metadataPath}`,
      forceable: false,
    });
  } else if (!metadataPath && assetType !== 'missing') {
    conflicts.push({
      path: paths.assetPath,
      diagnostic: `Conflict at managed asset target: ${paths.assetPath}`,
      forceable: true,
    });
  }

  if (matchingMetadata && baselineConfigPlan.conflicts.length === 0 && !configMatches) {
    conflicts.push({
      path: paths.configPath,
      diagnostic: `Managed configuration differs from verified setup state: ${paths.configPath}`,
      forceable: true,
    });
  }
  if (matchingMetadata && !assetsMatch) {
    conflicts.push({
      path: paths.assetPath,
      diagnostic: `Managed assets differ from verified setup state: ${paths.assetPath}`,
      forceable: true,
    });
  }

  return {
    paths,
    configType,
    managed,
    conflicts,
    sourceAssetsAvailable,
    codexLegacyState,
  };
}

function failedInspectionResult(
  request: SetupRequest,
  target: string,
  sourceAssetsPath: string,
): SetupResult {
  return {
    status: 'failed',
    changed: false,
    harness: request.harness,
    scope: request.scope,
    target,
    steps: [{
      name: `Inspect packaged ${displayHarness(request)} assets: ${sourceAssetsPath}`,
      outcome: 'failed',
    }],
    diagnostics: [`Unable to inspect the packaged ${displayHarness(request)} setup assets or selected target.`],
    manual_actions: ['Verify filesystem permissions and that the installed package contains the required integration assets.'],
    receipt: null,
  };
}

function invalidPathResult(request: SetupRequest): SetupResult {
  return {
    status: 'failed',
    changed: false,
    harness: request.harness,
    scope: request.scope,
    target: request.projectPath ?? 'unresolved global target',
    steps: [{ name: 'Validate setup paths', outcome: 'failed' }],
    diagnostics: ['Setup paths must be non-empty, absolute roots and remain in the selected scope.'],
    manual_actions: ['Provide a valid explicit project path for project scope and retry.'],
    receipt: null,
  };
}

function requiresSetupActionResult(
  request: SetupRequest,
  paths: SetupPaths,
  diagnostic: string,
  manualAction: string,
  stepName = 'Validate setup transaction state',
): SetupResult {
  return {
    status: 'requires_user_action',
    changed: false,
    harness: request.harness,
    scope: request.scope,
    target: paths.targetRoot,
    steps: [{ name: stepName, outcome: 'unavailable' }],
    diagnostics: [diagnostic],
    manual_actions: [manualAction],
    receipt: null,
  };
}

function codexEvidenceForScope(
  request: SetupRequest,
  evidence: CodexRegistrationEvidence | undefined,
): CodexRegistrationEvidence {
  if (evidence?.scope === request.scope) {
    return evidence;
  }
  return {
    scope: request.scope,
    marketplace: 'unverified',
    plugin: 'unverified',
  };
}

function externalOutcome(state: CodexRegistrationState): SetupStepOutcome {
  return state === 'confirmed' ? 'confirmed' : 'unavailable';
}

function filesystemStepOutcome(
  request: SetupRequest,
  inspection: SetupInspection,
): SetupStepOutcome {
  if (inspection.managed) {
    return 'skipped';
  }
  if (hasBlockingConflict(request, inspection)) {
    return 'unavailable';
  }
  return 'planned';
}

function hasBlockingConflict(
  request: SetupRequest,
  inspection: SetupInspection,
): boolean {
  return inspection.conflicts.some((conflict) => !conflict.forceable || !request.force);
}

function planSteps(
  request: SetupRequest,
  paths: SetupPaths,
  inspection: SetupInspection,
  codexEvidence: CodexRegistrationEvidence,
  codexSteps?: SetupStep[],
): SetupStep[] {
  const harness = displayHarness(request);
  const filesystemOutcome = filesystemStepOutcome(request, inspection);
  const codexComplete = codexEvidence.marketplace === 'confirmed'
    && codexEvidence.plugin === 'confirmed';
  const verificationOutcome: SetupStepOutcome = inspection.managed
    && (request.harness === 'opencode' || codexComplete)
    ? 'confirmed'
    : 'planned';

  const steps: SetupStep[] = [
    {
      name: `Inspect packaged ${harness} assets: ${paths.sourceAssetsPath}`,
      outcome: 'confirmed',
    },
    {
      name: `Inspect ${harness} configuration: ${paths.configPath}`,
      outcome: 'confirmed',
    },
    {
      name: `Install ${harness} assets: ${paths.assetPath}`,
      outcome: filesystemOutcome,
    },
    {
      name: `Merge managed ${harness} configuration: ${paths.configPath}`,
      outcome: filesystemOutcome,
    },
  ];

  if (request.harness === 'codex') {
    steps.push(...(codexSteps ?? [
      {
        name: `Register thoth-mem Codex marketplace (${request.scope})`,
        outcome: externalOutcome(codexEvidence.marketplace),
      },
      {
        name: `Install thoth-mem Codex plugin (${request.scope})`,
        outcome: externalOutcome(codexEvidence.plugin),
      },
    ]));
  }

  steps.push({ name: `Verify ${harness} setup`, outcome: verificationOutcome });
  return steps;
}

function planDiagnostics(
  request: SetupRequest,
  paths: SetupPaths,
  inspection: SetupInspection,
  codexEvidence: CodexRegistrationEvidence,
  includeLegacyCodexDiagnostics = true,
): string[] {
  const diagnostics = inspection.conflicts.map((conflict) => conflict.diagnostic);

  if (!inspection.managed && inspection.configType === 'file') {
    diagnostics.push(`Backup required before mutation: ${paths.configPath}`);
  }
  if (request.force) {
    for (const conflict of inspection.conflicts.filter((candidate) => candidate.forceable)) {
      diagnostics.push(`Force would replace only: ${conflict.path}`);
    }
  }
  if (request.planOnly) {
    diagnostics.push('Plan-only mode performed no writes, backups, receipts, or mutating external commands.');
  }
  if (request.harness === 'codex' && includeLegacyCodexDiagnostics) {
    if (codexEvidence.marketplace !== 'confirmed') {
      diagnostics.push(`No verified Codex marketplace registration state or safe command is available for ${request.scope} scope.`);
    }
    if (codexEvidence.plugin !== 'confirmed') {
      diagnostics.push(`No verified Codex plugin installation state or safe command is available for ${request.scope} scope.`);
    }
  }

  return diagnostics;
}

function manualActions(
  request: SetupRequest,
  inspection: SetupInspection,
  codexEvidence: CodexRegistrationEvidence,
  needsFileChanges: boolean,
  includeLegacyCodexActions = true,
): string[] {
  const actions: string[] = [];

  for (const conflict of inspection.conflicts) {
    if (conflict.forceable && !request.force) {
      actions.push(`Review the conflict and re-run with --force only if thoth-mem may own: ${conflict.path}`);
    } else if (!conflict.forceable) {
      actions.push(`Resolve the conflict manually before retrying: ${conflict.path}`);
    }
  }
  if (request.harness === 'codex' && includeLegacyCodexActions) {
    if (codexEvidence.marketplace !== 'confirmed') {
      actions.push(`Complete and independently verify Codex marketplace registration for ${request.scope} scope.`);
    }
    if (codexEvidence.plugin !== 'confirmed') {
      actions.push(`Complete and independently verify Codex plugin installation for ${request.scope} scope.`);
    }
  }
  if (needsFileChanges && !request.planOnly) {
    actions.push('Apply support is not available in this planning slice; no setup changes were made.');
  }

  return actions;
}

function deriveStatus(
  request: SetupRequest,
  inspection: SetupInspection,
  codexEvidence: CodexRegistrationEvidence,
  needsFileChanges: boolean,
): SetupResult['status'] {
  if (hasBlockingConflict(request, inspection)) {
    return 'requires_user_action';
  }
  if (
    request.harness === 'codex'
    && (codexEvidence.marketplace !== 'confirmed' || codexEvidence.plugin !== 'confirmed')
  ) {
    return 'requires_user_action';
  }
  if (needsFileChanges && !request.planOnly) {
    return 'requires_user_action';
  }
  return 'complete';
}

function codexEvidenceFromPlan(
  request: SetupRequest,
  plan: CodexCliPlan,
): CodexRegistrationEvidence {
  const marketplace = plan.operations.find((operation) => operation.id === 'codex-marketplace');
  const plugin = plan.operations.find((operation) => operation.id === 'codex-plugin');
  return {
    scope: request.scope,
    marketplace: marketplace?.verified ? 'confirmed' : 'unverified',
    plugin: plugin?.verified ? 'confirmed' : 'unverified',
  };
}

function codexPlanningResult(
  request: SetupRequest,
  inspection: SetupInspection,
  plan: CodexCliPlan,
): SetupResult {
  const evidence = codexEvidenceFromPlan(request, plan);
  const needsFileChanges = plan.strategy === 'legacy_filesystem' && !inspection.managed;
  const allExternalVerified = plan.operations.every((operation) => operation.verified);
  let status: SetupResult['status'];
  if (
    hasBlockingConflict(request, inspection)
    || inspection.codexLegacyState === 'ambiguous'
  ) {
    status = 'requires_user_action';
  } else if (plan.strategy === 'legacy_filesystem' && !inspection.sourceAssetsAvailable) {
    status = 'requires_user_action';
  } else if (plan.status === 'failed') {
    status = 'failed';
  } else if (plan.status === 'requires_user_action') {
    status = 'requires_user_action';
  } else if (request.planOnly) {
    status = 'complete';
  } else if (inspection.codexLegacyState === 'managed' && plan.strategy === 'plugin_manager') {
    status = 'requires_user_action';
  } else if (!needsFileChanges && allExternalVerified) {
    status = 'complete';
  } else if (plan.strategy === 'legacy_filesystem' && !needsFileChanges) {
    status = 'complete';
  } else {
    status = 'requires_user_action';
  }

  return {
    status,
    changed: false,
    harness: request.harness,
    scope: request.scope,
    target: inspection.paths.targetRoot,
    steps: codexStrategySteps(request, inspection, evidence, plan),
    diagnostics: [
      ...planDiagnostics(request, inspection.paths, inspection, evidence, false),
      ...plan.diagnostics,
    ],
    manual_actions: [
      ...manualActions(request, inspection, evidence, needsFileChanges, false),
      ...plan.manualActions,
    ],
    receipt: null,
  };
}

function isVerifiedCodexNoOp(
  request: SetupRequest,
  inspection: SetupInspection,
  plan: CodexCliPlan,
): boolean {
  if (
    plan.status !== 'ready'
    || inspection.conflicts.length > 0
    || hasBlockingConflict(request, inspection)
    || inspection.codexLegacyState === 'ambiguous'
  ) {
    return false;
  }
  if (plan.strategy === 'plugin_manager') {
    return inspection.codexLegacyState === 'absent'
      && plan.operations.every((operation) => operation.verified);
  }
  return inspection.sourceAssetsAvailable
    && inspection.managed
    && inspection.codexLegacyState === 'managed';
}

async function inspectVerifiedCodexNoOpBeforeLock(
  request: SetupRequest,
  paths: SetupPaths,
  dataDir: string,
  canonicalTarget: string,
  receiptBasePath: string,
  options: SetupEngineOptions,
): Promise<SetupResult | null> {
  const scanned = await scanSetupReceipts(receiptBasePath, {
    dataDir,
    expectedBasePath: receiptBasePath,
  });
  if (!scanned.ok) {
    return null;
  }
  const matchingReceipts = scanned.receipts.filter(({ receipt }) => (
    receipt.harness === request.harness
    && receipt.scope === request.scope
    && resolve(receipt.target) === resolve(canonicalTarget)
  ));
  if (
    !matchingReceipts.some(({ receipt }) => receipt.status === 'complete')
    || matchingReceipts.some(({ receipt }) => (
    receipt.status === 'in_progress'
    ))
  ) {
    return null;
  }

  let inspection: SetupInspection;
  try {
    inspection = await inspectSetup(request, paths, createNodeSetupFileSystem(), options);
  } catch {
    return null;
  }
  const executor = options.codexExecutor ?? createNodeCodexCommandExecutor();
  const plan = await inspectCodexCli({
    executor,
    scope: request.scope,
    ...(request.projectPath ? { projectPath: request.projectPath } : {}),
  });
  return isVerifiedCodexNoOp(request, inspection, plan)
    ? codexPlanningResult(request, inspection, plan)
    : null;
}

function codexStrategySteps(
  request: SetupRequest,
  inspection: SetupInspection,
  evidence: CodexRegistrationEvidence,
  plan: CodexCliPlan,
): SetupStep[] {
  const scope = request.scope;
  if (plan.strategy === 'legacy_filesystem') {
    const filesystemOutcome = filesystemStepOutcome(request, inspection);
    return [
      {
        name: 'Inspect packaged legacy Codex assets',
        outcome: inspection.sourceAssetsAvailable ? 'confirmed' : 'unavailable',
      },
      {
        name: 'Inspect legacy Codex managed configuration fragment',
        outcome: inspection.codexLegacyState === 'ambiguous' ? 'unavailable' : 'confirmed',
      },
      { name: 'Install legacy Codex assets', outcome: filesystemOutcome },
      { name: 'Merge legacy Codex managed configuration fragment', outcome: filesystemOutcome },
      { name: 'Write legacy Codex installation metadata', outcome: filesystemOutcome },
      {
        name: 'Verify legacy Codex setup',
        outcome: inspection.managed ? 'confirmed' : 'planned',
      },
    ];
  }

  if (plan.strategy === 'plugin_manager') {
    if (inspection.codexLegacyState === 'managed') {
      return [
        { name: `Inspect Codex plugin manager capabilities (${scope})`, outcome: 'confirmed' },
        { name: `Inspect Codex manager state (${scope})`, outcome: 'confirmed' },
        { name: `Verify existing Codex manager state (${scope})`, outcome: 'confirmed' },
        { name: `Checkpoint verified Codex manager state (${scope})`, outcome: 'planned' },
        { name: 'Remove proven legacy Codex managed configuration fragment', outcome: 'planned' },
        { name: 'Remove proven legacy Codex assets', outcome: 'planned' },
        { name: 'Remove proven legacy Codex installation metadata', outcome: 'planned' },
        { name: `Verify Codex plugin-manager setup (${scope})`, outcome: 'planned' },
      ];
    }

    const marketplace = plan.operations.find((operation) => operation.id === 'codex-marketplace')!;
    const plugin = plan.operations.find((operation) => operation.id === 'codex-plugin')!;
    const marketplaceOutcome = marketplace.verified ? 'confirmed' : 'planned';
    const pluginOutcome = plugin.verified ? 'confirmed' : 'planned';
    return [
      { name: `Inspect Codex plugin manager capabilities (${scope})`, outcome: 'confirmed' },
      { name: `Inspect Codex manager state (${scope})`, outcome: 'confirmed' },
      { name: marketplace.name, outcome: marketplaceOutcome },
      { name: `Checkpoint Codex marketplace state (${scope})`, outcome: marketplaceOutcome },
      { name: `Reread Codex manager state after marketplace (${scope})`, outcome: marketplaceOutcome },
      { name: plugin.name, outcome: pluginOutcome },
      { name: `Checkpoint Codex plugin state (${scope})`, outcome: pluginOutcome },
      { name: `Reread Codex manager state after plugin (${scope})`, outcome: pluginOutcome },
      {
        name: `Verify Codex plugin-manager setup (${scope})`,
        outcome: marketplace.verified && plugin.verified ? 'confirmed' : 'planned',
      },
    ];
  }

  return [
    { name: `Inspect Codex plugin manager capabilities (${scope})`, outcome: 'confirmed' },
    { name: `Inspect Codex manager state (${scope})`, outcome: 'unavailable' },
    ...plan.steps,
    { name: 'Validate legacy Codex ownership evidence', outcome: 'unavailable' },
  ];
}

interface ReceiptBackedChangeResult<T extends SetupReceipt = SetupReceipt> {
  filesystem: AtomicFilesystemResult;
  receipt: T;
  initialReceiptPersisted: boolean;
  keyProtection: 'enforced' | 'best_effort_windows' | null;
}

interface BoundSetupReceipt {
  receipt: SetupReceiptV1;
  paths: SetupPaths;
  configStep: SetupReceiptStep;
  assetStep: SetupReceiptStep;
  pluginStep: SetupReceiptStep;
}

function canonicalDataDir(
  options: SetupEngineOptions,
  roots: SetupRoots,
  mutating: boolean,
): string {
  if (mutating) {
    return getConfig(options.dataDir ? { dataDir: options.dataDir } : {}).dataDir;
  }
  return options.dataDir
    ?? process.env.THOTH_DATA_DIR
    ?? join(roots.homeDir, '.thoth');
}

function setupReceiptBasePath(
  request: SetupRequest,
  paths: SetupPaths,
  dataDir: string,
): string {
  if (request.scope === 'global') {
    return join(dataDir, 'setup', 'receipts');
  }
  const projectRoot = request.harness === 'codex' || request.harness === 'claude-code'
    ? dirname(paths.targetRoot)
    : paths.targetRoot;
  return join(projectRoot, '.thoth', 'setup', 'receipts');
}

function transactionNow(options: SetupEngineOptions): string {
  return (options.transaction?.now?.() ?? new Date()).toISOString();
}

function nextReceiptId(options: SetupEngineOptions): string {
  return options.transaction?.idFactory?.() ?? randomUUID();
}

async function traceSetup(
  options: SetupEngineOptions,
  kind: string,
  path?: string,
): Promise<void> {
  try {
    await options.transaction?.trace?.({
      kind,
      ...(path ? { path } : {}),
    });
  } catch {
    // Trace observers are diagnostic-only and cannot change transaction state.
  }
}

function fileContentSnapshot(content: string): string {
  return `file:${createHash('sha256').update(content).digest('hex')}`;
}

function withReceiptBackups(
  receipt: SetupReceipt,
  backups: FilesystemBackup[],
  updatedAt: string,
): SetupReceipt {
  const backupByTarget = new Map(backups.map((backup) => [backup.targetPath, backup.backupPath]));
  return {
    ...receipt,
    updated_at: updatedAt,
    steps: receipt.steps.map((step) => {
      if (!step.path) {
        return step;
      }
      const backupPath = backupByTarget.get(step.path);
      return backupPath ? { ...step, backup_path: backupPath } : step;
    }),
  };
}

function withConfirmedReceiptStep(
  receipt: SetupReceipt,
  path: string,
  postHash: string,
  updatedAt: string,
): SetupReceipt {
  let matched = false;
  const steps = receipt.steps.map((step) => {
    if (step.path !== path) {
      return step;
    }
    matched = true;
    return step.managed_fragment
      ? { ...step, outcome: 'confirmed' as const }
      : { ...step, outcome: 'confirmed' as const, post_hash: postHash };
  });
  if (!matched) {
    throw new Error('receipt-step-missing');
  }
  return { ...receipt, updated_at: updatedAt, steps };
}

function withExternalReceiptCheckpoint(
  receipt: SetupReceipt,
  checkpoint: CodexExternalCheckpoint,
  updatedAt: string,
): SetupReceipt {
  let matched = false;
  const steps = receipt.steps.map((step) => {
    if (step.id !== checkpoint.id || step.kind !== 'external_command') {
      return step;
    }
    matched = true;
    if (checkpoint.diagnostic) {
      return {
        ...step,
        outcome: checkpoint.outcome,
        diagnostic: checkpoint.diagnostic,
      };
    }
    const { diagnostic: _previousDiagnostic, ...withoutDiagnostic } = step;
    return { ...withoutDiagnostic, outcome: checkpoint.outcome };
  });
  if (!matched) {
    throw new Error('external-receipt-step-missing');
  }
  const updated = { ...receipt, updated_at: updatedAt, steps };
  if (updated.schema_version === 1) {
    return updated;
  }
  return {
    ...updated,
    external_checkpoints: [
      ...updated.external_checkpoints,
      {
        sequence: updated.external_checkpoints.length + 1,
        id: checkpoint.id,
        outcome: checkpoint.outcome,
        observed_at: updatedAt,
        ...(checkpoint.diagnostic ? { diagnostic: checkpoint.diagnostic } : {}),
      },
    ],
  };
}

async function persistReceiptCheckpoint(
  receiptPath: string,
  receiptBasePath: string,
  receipt: SetupReceipt,
  dataDir: string,
  options: SetupEngineOptions,
) {
  return persistSetupReceipt(receiptPath, receipt, {
    dataDir,
    expectedBasePath: receiptBasePath,
    fault: options.transaction?.receiptFault,
  });
}

async function applyReceiptBackedChanges<T extends SetupReceipt>(input: {
  targetRoot: string;
  sourceRoot?: string;
  receiptBasePath: string;
  receiptPaths: ReceiptPaths;
  dataDir: string;
  receipt: T;
  changes: FilesystemChange[];
  options: SetupEngineOptions;
  postHash: (path: string) => Promise<string>;
  afterWriteAhead?: () => void | Promise<void>;
  changeTraceKind?: string;
}): Promise<ReceiptBackedChangeResult<T>> {
  let activeReceipt = input.receipt;
  let initialReceiptPersisted = false;
  let keyProtection: ReceiptBackedChangeResult['keyProtection'] = null;
  const filesystem = await applyAtomicFilesystemChanges({
    targetRoot: input.targetRoot,
    backupRoot: input.receiptPaths.backupRoot,
    ...(input.sourceRoot ? { sourceRoot: input.sourceRoot } : {}),
    changes: input.changes,
  }, {
    fault: input.options.transaction?.filesystemFault,
    beforeMutations: async ({ backups }) => {
      await traceSetup(input.options, 'backup_synced', input.receiptPaths.backupRoot);
      activeReceipt = withReceiptBackups(
        activeReceipt,
        backups,
        transactionNow(input.options),
      ) as T;
      const persisted = await persistReceiptCheckpoint(
        input.receiptPaths.receiptPath,
        input.receiptBasePath,
        activeReceipt,
        input.dataDir,
        input.options,
      );
      if (!persisted.ok) {
        throw new Error('receipt-write-ahead-failed');
      }
      activeReceipt = persisted.receipt as T;
      keyProtection = persisted.keyProtection;
      initialReceiptPersisted = true;
      await traceSetup(input.options, 'receipt_in_progress', input.receiptPaths.receiptPath);
      await input.afterWriteAhead?.();
    },
    afterChange: async ({ targetPath }) => {
      activeReceipt = withConfirmedReceiptStep(
        activeReceipt,
        targetPath,
        await input.postHash(targetPath),
        transactionNow(input.options),
      ) as T;
      const persisted = await persistReceiptCheckpoint(
        input.receiptPaths.receiptPath,
        input.receiptBasePath,
        activeReceipt,
        input.dataDir,
        input.options,
      );
      if (!persisted.ok) {
        throw new Error('receipt-checkpoint-failed');
      }
      activeReceipt = persisted.receipt as T;
      keyProtection = persisted.keyProtection;
      await traceSetup(input.options, input.changeTraceKind ?? 'target_renamed', targetPath);
    },
  });
  return { filesystem, receipt: activeReceipt, initialReceiptPersisted, keyProtection };
}

async function markRestoredFailure(
  result: ReceiptBackedChangeResult,
  receiptPaths: ReceiptPaths,
  receiptBasePath: string,
  dataDir: string,
  options: SetupEngineOptions,
): Promise<SetupReceipt> {
  if (!result.initialReceiptPersisted || result.filesystem.changed) {
    return result.receipt;
  }
  const failedReceipt: SetupReceipt = {
    ...result.receipt,
    status: 'failed',
    updated_at: transactionNow(options),
    steps: result.receipt.steps.map((step) => (
      step.outcome === 'planned' ? { ...step, outcome: 'failed' as const } : step
    )),
  };
  const persisted = await persistReceiptCheckpoint(
    receiptPaths.receiptPath,
    receiptBasePath,
    failedReceipt,
    dataDir,
    options,
  );
  return persisted.ok ? persisted.receipt : result.receipt;
}

function receiptKeyDiagnostic(
  protection: ReceiptBackedChangeResult['keyProtection'],
): string[] {
  return protection === 'best_effort_windows'
    ? ['Receipt key owner-only permissions are best-effort on Windows.']
    : [];
}

function receiptFailureResult(
  request: SetupRequest,
  paths: SetupPaths,
  changed: boolean,
  receiptPath: string | null,
  diagnostic: string,
): SetupResult {
  return {
    status: 'failed',
    changed,
    harness: request.harness,
    scope: request.scope,
    target: paths.targetRoot,
    steps: [{ name: 'Apply receipt-backed setup transaction', outcome: 'failed' }],
    diagnostics: [diagnostic],
    manual_actions: changed
      ? ['Inspect the verified in-progress receipt before retrying or rolling back.']
      : ['No setup target change remains; review the failed receipt before retrying.'],
    receipt: receiptPath,
  };
}

function hasPathEscape(path: string): boolean {
  return isAbsolute(path)
    || path === '..'
    || path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`);
}

function expectedReceiptBackupPath(
  receiptPath: string,
  targetRoot: string,
  targetPath: string,
): string | null {
  const relativeTarget = relative(targetRoot, targetPath);
  if (hasPathEscape(relativeTarget)) {
    return null;
  }
  return resolve(dirname(receiptPath), 'backups', relativeTarget);
}

function bindSetupReceipt(
  request: SetupRequest,
  unresolvedPaths: SetupPaths,
  canonicalTarget: string,
  receiptBasePath: string,
  receiptPath: string,
  receipt: SetupReceiptV1,
): BoundSetupReceipt | null {
  if (
    receipt.operation !== 'setup'
    || receipt.harness !== request.harness
    || receipt.scope !== request.scope
    || resolve(receipt.target) !== resolve(canonicalTarget)
    || resolve(receiptPath) !== resolve(
      resolveSetupReceiptPaths(receiptBasePath, receipt.id).receiptPath,
    )
    || receipt.steps.length !== 4
  ) {
    return null;
  }
  const byId = new Map(receipt.steps.map((step) => [step.id, step]));
  if (byId.size !== 4) {
    return null;
  }
  const configStep = byId.get('config');
  const assetStep = byId.get('assets');
  const pluginStep = byId.get('plugin');
  const verifyStep = byId.get('verify');
  if (
    !configStep?.path
    || configStep.kind !== 'filesystem'
    || configStep.owned_key !== 'mcp.thoth-mem'
    || !configStep.pre_hash
    || !configStep.post_hash
    || !unresolvedPaths.configCandidates.some((path) => resolve(path) === resolve(configStep.path!))
    || assetStep?.kind !== 'filesystem'
    || resolve(assetStep.path ?? '') !== resolve(unresolvedPaths.assetPath)
    || !assetStep.pre_hash
    || !assetStep.post_hash
    || pluginStep?.kind !== 'filesystem'
    || resolve(pluginStep.path ?? '') !== resolve(unresolvedPaths.pluginEntryPath)
    || !pluginStep.pre_hash
    || !pluginStep.post_hash
    || verifyStep?.kind !== 'verification'
    || verifyStep.path !== undefined
  ) {
    return null;
  }
  for (const step of [configStep, assetStep, pluginStep]) {
    if (step.backup_path) {
      const expected = expectedReceiptBackupPath(
        receiptPath,
        unresolvedPaths.targetRoot,
        step.path!,
      );
      if (!expected || resolve(step.backup_path) !== expected) {
        return null;
      }
    }
  }
  return {
    receipt,
    paths: { ...unresolvedPaths, configPath: configStep.path },
    configStep,
    assetStep,
    pluginStep,
  };
}

async function readRegularFileOrNull(path: string): Promise<string | null> {
  try {
    const details = await lstat(path);
    if (!details.isFile() || details.isSymbolicLink()) {
      throw new Error('setup-file-not-regular');
    }
    return readFile(path, 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }
    throw error;
  }
}

function codexManagedFragmentStateMatches(
  current: string | null,
  evidence: SetupReceiptManagedFragmentEvidence,
  state: 'pre' | 'post',
): boolean {
  try {
    const fragment = codexManagedFragmentFromReceiptEvidence(evidence);
    const source = current ?? '';
    if (state === 'pre') {
      if (evidence.operation === 'apply') {
        applyCodexManagedFragment(source, fragment);
      } else {
        restoreCodexManagedFragment(source, fragment);
      }
    } else if (evidence.operation === 'apply') {
      restoreCodexManagedFragment(source, fragment);
    } else {
      applyCodexManagedFragment(source, fragment);
    }
    return true;
  } catch {
    return false;
  }
}

async function codexManagedFragmentPostSnapshot(
  path: string,
  evidence: SetupReceiptManagedFragmentEvidence,
): Promise<string> {
  const current = await readRegularFileOrNull(path);
  if (!codexManagedFragmentStateMatches(current, evidence, 'post')) {
    throw new Error('codex-managed-fragment-poststate-diverged');
  }
  return evidence.post_state.state === 'absent'
    ? 'managed-fragment:absent'
    : `managed-fragment:${evidence.post_state.sha256}`;
}

function setupMetadata(
  request: SetupRequest,
  paths: SetupPaths,
  options: SetupEngineOptions,
): string {
  return `${JSON.stringify({
    schemaVersion: SETUP_MANAGED_METADATA_VERSION,
    packageVersion: getVersion(),
    executable: setupExecutablePath(options),
    harness: request.harness,
    scope: request.scope,
    target: paths.targetRoot,
    configPath: paths.configPath,
    assetsPath: paths.assetPath,
    verified: true,
  }, null, 2)}\n`;
}

async function hasExactSignedLegacyProof(
  receipts: Array<{ path: string; receipt: SetupReceipt }>,
  request: SetupRequest,
  paths: SetupPaths,
  canonicalTarget: string,
): Promise<boolean> {
  const candidates = receipts.filter(({ receipt }) => (
    receipt.schema_version === 2
    && receipt.status === 'complete'
    && receipt.strategy === 'legacy_filesystem'
    && receipt.scope === request.scope
    && resolve(receipt.target) === resolve(canonicalTarget)
  ));
  if (candidates.length === 0) {
    return false;
  }
  const metadataPath = join(paths.assetPath, MANAGED_METADATA_NAME);
  const [currentConfig, assetHash, metadataHash] = await Promise.all([
    readRegularFileOrNull(paths.configPath),
    filesystemEntrySnapshot(paths.assetPath),
    filesystemEntrySnapshot(metadataPath),
  ]);
  return candidates.some(({ receipt }) => {
    const config = receipt.steps.find((step) => step.id === 'config');
    const assets = receipt.steps.find((step) => step.id === 'assets');
    const metadata = receipt.steps.find((step) => step.id === 'metadata');
    return config?.outcome === 'confirmed'
      && config.path === paths.configPath
      && config.managed_fragment?.operation === 'apply'
      && codexManagedFragmentStateMatches(currentConfig, config.managed_fragment, 'post')
      && assets?.outcome === 'confirmed'
      && assets.path === paths.assetPath
      && assets.post_hash === assetHash
      && metadata?.outcome === 'confirmed'
      && metadata.path === metadataPath
      && metadata.post_hash === metadataHash;
  });
}

function initialCodexManagerEvidence(plan: CodexCliPlan): SetupReceiptV2ManagerEvidence {
  const marketplace = plan.operations.find((operation) => operation.id === 'codex-marketplace');
  const plugin = plan.operations.find((operation) => operation.id === 'codex-plugin');
  return {
    initial_state: plan.evidence.managerState,
    marketplace: {
      name: 'thoth-mem',
      source: 'EremesNG/thoth-mem',
      pre_existing_verified: marketplace?.verified ?? false,
      created_by_attempt: false,
      final_verified: false,
    },
    plugin: {
      plugin_id: 'thoth-mem@thoth-mem',
      name: 'thoth-mem',
      marketplace_name: 'thoth-mem',
      installed: false,
      enabled: false,
      pre_existing_verified: plugin?.verified ?? false,
      created_by_attempt: false,
      final_verified: false,
    },
    final_verified_at: null,
  };
}

function withFinalCodexManagerEvidence(
  receipt: SetupReceiptV2,
  operations: CodexOperationExecutionEvidence[],
  observedAt: string,
): SetupReceiptV2 {
  const marketplace = operations.find((operation) => operation.id === 'codex-marketplace');
  const plugin = operations.find((operation) => operation.id === 'codex-plugin');
  const marketplaceVerified = marketplace?.finalOutcome === 'confirmed';
  const pluginVerified = plugin?.finalOutcome === 'confirmed';
  return {
    ...receipt,
    manager_evidence: {
      ...receipt.manager_evidence,
      marketplace: {
        ...receipt.manager_evidence.marketplace,
        created_by_attempt: !receipt.manager_evidence.marketplace.pre_existing_verified
          && marketplace?.safeAttempt === 'attempted'
          && marketplaceVerified,
        final_verified: marketplaceVerified,
      },
      plugin: {
        ...receipt.manager_evidence.plugin,
        installed: pluginVerified,
        enabled: pluginVerified,
        created_by_attempt: !receipt.manager_evidence.plugin.pre_existing_verified
          && plugin?.safeAttempt === 'attempted'
          && pluginVerified,
        final_verified: pluginVerified,
      },
      final_verified_at: marketplaceVerified && pluginVerified ? observedAt : null,
    },
  };
}

function codexOperationOutcome(
  operation: CodexOperationExecutionEvidence | undefined,
): SetupStepOutcome {
  return operation?.finalOutcome ?? 'unavailable';
}

function codexCheckpointOutcome(
  operation: CodexOperationExecutionEvidence | undefined,
  phase: 'attempt' | 'reread',
): SetupStepOutcome {
  const checkpoint = phase === 'attempt'
    ? operation?.attemptCheckpoint
    : operation?.rereadCheckpoint;
  if (checkpoint) {
    return checkpoint.outcome;
  }
  if (operation?.safeAttempt === 'not_needed') {
    return operation.finalOutcome;
  }
  return operation?.finalOutcome ?? 'unavailable';
}

function codexPluginManagerResultSteps(
  request: SetupRequest,
  plan: CodexCliPlan,
  execution: CodexCliExecutionResult,
): SetupStep[] {
  const scope = request.scope;
  const marketplacePlan = plan.operations.find((operation) => operation.id === 'codex-marketplace');
  const pluginPlan = plan.operations.find((operation) => operation.id === 'codex-plugin');
  const marketplace = execution.operations.find((operation) => operation.id === 'codex-marketplace');
  const plugin = execution.operations.find((operation) => operation.id === 'codex-plugin');
  return [
    { name: `Inspect Codex plugin manager capabilities (${scope})`, outcome: 'confirmed' },
    { name: `Inspect Codex manager state (${scope})`, outcome: 'confirmed' },
    {
      name: marketplacePlan?.name ?? `Register thoth-mem Codex marketplace (${scope})`,
      outcome: codexOperationOutcome(marketplace),
    },
    {
      name: `Checkpoint Codex marketplace state (${scope})`,
      outcome: codexCheckpointOutcome(marketplace, 'attempt'),
    },
    {
      name: `Reread Codex manager state after marketplace (${scope})`,
      outcome: codexCheckpointOutcome(marketplace, 'reread'),
    },
    {
      name: pluginPlan?.name ?? `Install thoth-mem Codex plugin (${scope})`,
      outcome: codexOperationOutcome(plugin),
    },
    {
      name: `Checkpoint Codex plugin state (${scope})`,
      outcome: codexCheckpointOutcome(plugin, 'attempt'),
    },
    {
      name: `Reread Codex manager state after plugin (${scope})`,
      outcome: codexCheckpointOutcome(plugin, 'reread'),
    },
    {
      name: `Verify Codex plugin-manager setup (${scope})`,
      outcome: execution.status === 'complete' ? 'confirmed' : 'failed',
    },
  ];
}

function codexLegacyResultSteps(
  request: SetupRequest,
  inspection: SetupInspection,
  execution: CodexCliExecutionResult,
): SetupStep[] {
  const mutationOutcome = execution.status === 'complete' ? 'confirmed' : 'failed';
  return [
    {
      name: 'Inspect packaged legacy Codex assets',
      outcome: inspection.sourceAssetsAvailable ? 'confirmed' : 'unavailable',
    },
    {
      name: 'Inspect legacy Codex managed configuration fragment',
      outcome: inspection.codexLegacyState === 'ambiguous' ? 'unavailable' : 'confirmed',
    },
    { name: 'Install legacy Codex assets', outcome: mutationOutcome },
    { name: 'Merge legacy Codex managed configuration fragment', outcome: mutationOutcome },
    { name: 'Write legacy Codex installation metadata', outcome: mutationOutcome },
    { name: 'Verify legacy Codex setup', outcome: mutationOutcome },
  ];
}

async function executeOpenCodeSetup(
  request: SetupRequest,
  roots: SetupRoots,
  inspection: SetupInspection,
  dataDir: string,
  canonicalTarget: string,
  receiptBasePath: string,
  options: SetupEngineOptions,
): Promise<SetupResult> {
  const paths = inspection.paths;
  const configBefore = inspection.configType === 'file'
    ? await readRegularFileOrNull(paths.configPath)
    : null;
  const configPlan = planOpenCodeManagedConfig({
    before: configBefore,
    force: request.force,
    mcpValue: OPENCODE_MCP_VALUE,
  });
  if (configPlan.conflicts.length > 0 || !configPlan.verification.ownedValuesMatch) {
    return requiresSetupActionResult(
      request,
      paths,
      'The selected OpenCode configuration cannot be changed safely.',
      'Resolve the owned OpenCode configuration conflict and retry.',
    );
  }

  let assetPreHash: string;
  let pluginPreHash: string;
  try {
    [assetPreHash, pluginPreHash] = await Promise.all([
      filesystemEntrySnapshot(paths.assetPath),
      filesystemEntrySnapshot(paths.pluginEntryPath),
    ]);
  } catch {
    return failedInspectionResult(request, paths.targetRoot, paths.sourceAssetsPath);
  }
  const configPreHash = inspectOpenCodeOwnedState(configBefore).hash;
  const configPostHash = inspectOpenCodeOwnedState(configPlan.after).hash;
  const metadata = setupMetadata(request, paths, options);
  const receiptPaths = resolveSetupReceiptPaths(receiptBasePath, nextReceiptId(options));
  const startedAt = transactionNow(options);
  const steps: SetupReceiptStep[] = [
    {
      id: 'config',
      kind: 'filesystem',
      outcome: configPlan.changed ? 'planned' : 'skipped',
      owned_key: 'mcp.thoth-mem',
      path: paths.configPath,
      pre_hash: configPreHash,
      post_hash: configPostHash,
    },
    {
      id: 'assets',
      kind: 'filesystem',
      outcome: 'planned',
      path: paths.assetPath,
      pre_hash: assetPreHash,
      post_hash: 'pending',
    },
    {
      id: 'plugin',
      kind: 'filesystem',
      outcome: 'planned',
      path: paths.pluginEntryPath,
      pre_hash: pluginPreHash,
      post_hash: fileContentSnapshot(OPENCODE_PLUGIN_ENTRY),
    },
    { id: 'verify', kind: 'verification', outcome: 'planned' },
  ];
  const receipt = createSetupReceipt({
    id: basename(dirname(receiptPaths.receiptPath)),
    operation: 'setup',
    status: 'in_progress',
    harness: request.harness,
    scope: request.scope,
    target: canonicalTarget,
    package_version: getVersion(),
    force: request.force,
    started_at: startedAt,
    updated_at: startedAt,
    steps,
  });
  const changes: FilesystemChange[] = [
    ...(configPlan.changed
      ? [{ kind: 'file' as const, targetPath: paths.configPath, content: configPlan.after }]
      : []),
    {
      kind: 'directory',
      targetPath: paths.assetPath,
      entries: [
        { sourcePath: paths.sourceAssetsPath, targetRelativePath: 'opencode' },
        { sourcePath: paths.sourceSharedPath!, targetRelativePath: 'shared' },
      ],
      generatedFiles: [{
        targetRelativePath: MANAGED_METADATA_NAME,
        content: metadata,
        mode: 0o600,
      }],
    },
    { kind: 'file', targetPath: paths.pluginEntryPath, content: OPENCODE_PLUGIN_ENTRY },
  ];
  const plannedSteps = planSteps(
    request,
    paths,
    inspection,
    codexEvidenceForScope(request, options.codexRegistration),
  );

  const applied = await applyReceiptBackedChanges({
    targetRoot: paths.targetRoot,
    sourceRoot: roots.packageRoot,
    receiptBasePath,
    receiptPaths,
    dataDir,
    receipt,
    changes,
    options,
    postHash: async (path) => path === paths.configPath
      ? inspectOpenCodeOwnedState(await readRegularFileOrNull(path)).hash
      : filesystemEntrySnapshot(path),
  });
  if (applied.filesystem.outcome === 'failed') {
    await markRestoredFailure(
      applied,
      receiptPaths,
      receiptBasePath,
      dataDir,
      options,
    );
    return receiptFailureResult(
      request,
      paths,
      applied.filesystem.changed,
      applied.initialReceiptPersisted ? receiptPaths.receiptPath : null,
      applied.filesystem.remainingArtifacts.length > 0
        ? 'Setup transaction failed with an unresolved temporary filesystem artifact.'
        : 'Setup transaction failed and did not complete.',
    );
  }

  let verified = false;
  try {
    verified = (await inspectSetup(request, paths, createNodeSetupFileSystem(), options)).managed;
  } catch {
    verified = false;
  }
  if (!verified) {
    return receiptFailureResult(
      request,
      paths,
      true,
      receiptPaths.receiptPath,
      'OpenCode setup post-state verification failed.',
    );
  }

  const completeReceipt: SetupReceiptV1 = {
    ...applied.receipt,
    status: 'complete',
    updated_at: transactionNow(options),
    steps: applied.receipt.steps.map((step) => (
      step.id === 'verify' ? { ...step, outcome: 'confirmed' as const } : step
    )),
  };
  const persisted = await persistReceiptCheckpoint(
    receiptPaths.receiptPath,
    receiptBasePath,
    completeReceipt,
    dataDir,
    options,
  );
  if (!persisted.ok) {
    return receiptFailureResult(
      request,
      paths,
      true,
      receiptPaths.receiptPath,
      'OpenCode setup completed but its final receipt could not be confirmed.',
    );
  }
  await traceSetup(options, 'receipt_complete', receiptPaths.receiptPath);
  return {
    status: 'complete',
    changed: true,
    harness: request.harness,
    scope: request.scope,
    target: paths.targetRoot,
    steps: plannedSteps.map((step) => (
      step.outcome === 'planned' ? { ...step, outcome: 'confirmed' as const } : step
    )),
    diagnostics: receiptKeyDiagnostic(applied.keyProtection),
    manual_actions: [],
    receipt: receiptPaths.receiptPath,
  };
}

async function executeCodexSetup(
  request: SetupRequest,
  roots: SetupRoots,
  inspection: SetupInspection,
  dataDir: string,
  canonicalTarget: string,
  receiptBasePath: string,
  options: SetupEngineOptions,
  executor: CodexCommandExecutor,
  codexPlan: CodexCliPlan,
): Promise<SetupResult> {
  const paths = inspection.paths;
  const usesLegacyFilesystem = codexPlan.strategy === 'legacy_filesystem';
  const configBefore = usesLegacyFilesystem && inspection.configType === 'file'
    ? await readRegularFileOrNull(paths.configPath)
    : null;
  const configPlan = planCodexManagedFragment({ before: configBefore, force: request.force });
  if (
    usesLegacyFilesystem
    && (configPlan.conflicts.length > 0 || !configPlan.verification.ownedValuesMatch)
  ) {
    return requiresSetupActionResult(
      request,
      paths,
      'The selected Codex configuration cannot be changed safely.',
      'Resolve the owned Codex configuration conflict and retry.',
    );
  }
  let configAfter = configPlan.after;
  if (usesLegacyFilesystem && configPlan.fragment) {
    try {
      configAfter = applyCodexManagedFragment(configBefore, configPlan.fragment);
    } catch {
      return requiresSetupActionResult(
        request,
        paths,
        'The selected Codex managed fragment changed during planning.',
        'Review the current Codex configuration and retry without overwriting unrelated changes.',
      );
    }
  }

  const metadataPath = join(paths.assetPath, MANAGED_METADATA_NAME);
  let configPreHash: string;
  let assetPreHash: string;
  let metadataPreHash: string;
  try {
    [configPreHash, assetPreHash, metadataPreHash] = await Promise.all([
      filesystemEntrySnapshot(paths.configPath),
      filesystemEntrySnapshot(paths.assetPath),
      filesystemEntrySnapshot(metadataPath),
    ]);
  } catch {
    return failedInspectionResult(request, paths.targetRoot, paths.sourceAssetsPath);
  }

  const needsFileChanges = usesLegacyFilesystem && !inspection.managed;
  const configFragmentEvidence = usesLegacyFilesystem && configPlan.fragment
    ? createCodexManagedFragmentReceiptEvidence(
        paths.configPath,
        'apply',
        configPlan.fragment,
      )
    : undefined;
  if (needsFileChanges && configPlan.changed && !configFragmentEvidence) {
    return requiresSetupActionResult(
      request,
      paths,
      'The planned Codex config mutation lacks exact managed-fragment evidence.',
      'Reinspect the exact managed marker fragment before retrying.',
    );
  }
  const metadata = setupMetadata(request, paths, options);
  const receiptPaths = resolveSetupReceiptPaths(receiptBasePath, nextReceiptId(options));
  const startedAt = transactionNow(options);
  if (codexPlan.strategy === null) {
    return requiresSetupActionResult(
      request,
      paths,
      'Codex ownership strategy could not be selected safely.',
      'Resolve the Codex capability or ownership ambiguity before retrying.',
    );
  }
  const receipt = createSetupReceipt({
    schema_version: 2,
    id: basename(dirname(receiptPaths.receiptPath)),
    operation: 'setup',
    status: 'in_progress',
    harness: 'codex',
    scope: request.scope,
    target: canonicalTarget,
    package_version: getVersion(),
    force: request.force,
    started_at: startedAt,
    updated_at: startedAt,
    strategy: codexPlan.strategy,
    capability_evidence: codexPlan.evidence,
    manager_evidence: initialCodexManagerEvidence(codexPlan),
    external_checkpoints: [],
    steps: [
      {
        id: 'config',
        kind: 'filesystem',
        outcome: needsFileChanges && configPlan.changed ? 'planned' : 'skipped',
        owned_key: 'plugins."thoth-mem".mcp_servers."thoth-mem"',
        path: paths.configPath,
        ...(configFragmentEvidence
          ? { managed_fragment: configFragmentEvidence }
          : {
              pre_hash: configPreHash,
              post_hash: configPlan.changed
                ? fileContentSnapshot(configAfter)
                : configPreHash,
            }),
      },
      {
        id: 'assets',
        kind: 'filesystem',
        outcome: needsFileChanges ? 'planned' : 'skipped',
        path: paths.assetPath,
        pre_hash: assetPreHash,
        post_hash: needsFileChanges ? 'pending' : assetPreHash,
      },
      {
        id: 'metadata',
        kind: 'filesystem',
        outcome: needsFileChanges ? 'planned' : 'skipped',
        path: metadataPath,
        pre_hash: metadataPreHash,
        post_hash: needsFileChanges ? fileContentSnapshot(metadata) : metadataPreHash,
      },
      ...codexPlan.operations.map((operation): SetupReceiptStep => ({
        id: operation.id,
        kind: 'external_command',
        outcome: usesLegacyFilesystem
          ? 'skipped'
          : (operation.verified ? 'confirmed' : 'planned'),
        external_scope: request.scope,
      })),
      { id: 'verify', kind: 'verification', outcome: 'planned' },
    ],
  });
  const changes: FilesystemChange[] = needsFileChanges
    ? [
        {
          kind: 'directory',
          targetPath: paths.assetPath,
          entries: [{ sourcePath: paths.sourceAssetsPath, targetRelativePath: '.' }],
          generatedFiles: [{
            targetRelativePath: MANAGED_METADATA_NAME,
            content: metadata,
            mode: 0o600,
          }],
        },
        ...(configPlan.changed
          ? [{ kind: 'file' as const, targetPath: paths.configPath, content: configAfter }]
          : []),
      ]
    : [];
  const applied = await applyReceiptBackedChanges({
    targetRoot: paths.targetRoot,
    sourceRoot: roots.packageRoot,
    receiptBasePath,
    receiptPaths,
    dataDir,
    receipt,
    changes,
    options,
    postHash: async (path) => path === paths.configPath && configFragmentEvidence
      ? codexManagedFragmentPostSnapshot(path, configFragmentEvidence)
      : filesystemEntrySnapshot(path),
  });
  if (applied.filesystem.outcome === 'failed') {
    await markRestoredFailure(
      applied,
      receiptPaths,
      receiptBasePath,
      dataDir,
      options,
    );
    return receiptFailureResult(
      request,
      paths,
      applied.filesystem.changed,
      applied.initialReceiptPersisted ? receiptPaths.receiptPath : null,
      applied.filesystem.remainingArtifacts.length > 0
        ? 'Codex setup failed with an unresolved temporary filesystem artifact.'
        : 'Codex setup filesystem transaction failed and did not complete.',
    );
  }

  let filesystemVerified = !usesLegacyFilesystem;
  if (usesLegacyFilesystem) {
    try {
      filesystemVerified = (await inspectSetup(
        request,
        paths,
        createNodeSetupFileSystem(),
        options,
      )).managed;
    } catch {
      filesystemVerified = false;
    }
  }
  if (!filesystemVerified) {
    return receiptFailureResult(
      request,
      paths,
      applied.filesystem.changed,
      receiptPaths.receiptPath,
      'Codex setup filesystem post-state verification failed.',
    );
  }

  let activeReceipt = applied.receipt;
  if (usesLegacyFilesystem && needsFileChanges) {
    activeReceipt = withConfirmedReceiptStep(
      activeReceipt,
      metadataPath,
      await filesystemEntrySnapshot(metadataPath),
      transactionNow(options),
    ) as SetupReceiptV2;
    const metadataCheckpoint = await persistReceiptCheckpoint(
      receiptPaths.receiptPath,
      receiptBasePath,
      activeReceipt,
      dataDir,
      options,
    );
    if (!metadataCheckpoint.ok) {
      return receiptFailureResult(
        request,
        paths,
        true,
        receiptPaths.receiptPath,
        'Codex legacy metadata state could not be durably checkpointed.',
      );
    }
    activeReceipt = metadataCheckpoint.receipt as SetupReceiptV2;
  }
  const external = await executeCodexCli(codexPlan, {
    executor,
    ...(options.codexTiming ? { timing: options.codexTiming } : {}),
    checkpoint: async (checkpoint) => {
      let checkpointReceipt: SetupReceiptV2;
      try {
        checkpointReceipt = withExternalReceiptCheckpoint(
          activeReceipt,
          checkpoint,
          transactionNow(options),
        ) as SetupReceiptV2;
      } catch {
        return false;
      }
      const persisted = await persistReceiptCheckpoint(
        receiptPaths.receiptPath,
        receiptBasePath,
        checkpointReceipt,
        dataDir,
        options,
      );
      if (!persisted.ok) {
        return false;
      }
      activeReceipt = persisted.receipt as SetupReceiptV2;
      await traceSetup(options, `external_${checkpoint.id}_${checkpoint.outcome}`, receiptPaths.receiptPath);
      return true;
    },
  });
  if (!external.checkpointsConfirmed) {
    return receiptFailureResult(
      request,
      paths,
      applied.filesystem.changed || external.changed,
      receiptPaths.receiptPath,
      'Codex external setup state could not be durably checkpointed.',
    );
  }

  const finalizedAt = transactionNow(options);
  const operationById = new Map<string, CodexOperationExecutionEvidence>(
    external.operations.map((operation) => [operation.id, operation]),
  );
  const finalReceipt: SetupReceiptV2 = {
    ...withFinalCodexManagerEvidence(activeReceipt, external.operations, finalizedAt),
    status: external.status,
    updated_at: finalizedAt,
    steps: activeReceipt.steps.map((step) => {
      if (step.kind === 'external_command') {
        const operation = operationById.get(step.id);
        return operation ? { ...step, outcome: operation.finalOutcome } : step;
      }
      if (step.id === 'verify') {
        return {
          ...step,
          outcome: external.status === 'complete' ? 'confirmed' as const : 'failed' as const,
        };
      }
      return step;
    }),
  };
  const persisted = await persistReceiptCheckpoint(
    receiptPaths.receiptPath,
    receiptBasePath,
    finalReceipt,
    dataDir,
    options,
  );
  if (!persisted.ok) {
    return receiptFailureResult(
      request,
      paths,
      applied.filesystem.changed || external.changed,
      receiptPaths.receiptPath,
      'Codex setup completed its attempted steps but the final receipt could not be confirmed.',
    );
  }
  await traceSetup(options, `receipt_${external.status}`, receiptPaths.receiptPath);

  const resultSteps = codexPlan.strategy === 'plugin_manager'
    ? codexPluginManagerResultSteps(request, codexPlan, external)
    : codexLegacyResultSteps(request, inspection, external);
  return {
    status: external.status,
    changed: applied.filesystem.changed || external.changed,
    harness: request.harness,
    scope: request.scope,
    target: paths.targetRoot,
    steps: resultSteps,
    diagnostics: [...receiptKeyDiagnostic(applied.keyProtection), ...external.diagnostics],
    manual_actions: external.manualActions,
    receipt: receiptPaths.receiptPath,
  };
}

async function executeCodexMigration(
  request: SetupRequest,
  roots: SetupRoots,
  inspection: SetupInspection,
  dataDir: string,
  canonicalTarget: string,
  receiptBasePath: string,
  options: SetupEngineOptions,
  executor: CodexCommandExecutor,
  codexPlan: CodexCliPlan,
): Promise<SetupResult> {
  const paths = inspection.paths;
  const configBefore = await readRegularFileOrNull(paths.configPath);
  if (configBefore === null) {
    return requiresSetupActionResult(
      request,
      paths,
      'The proven legacy Codex configuration fragment is unavailable.',
      'Restore the exact owned fragment or resolve the ambiguous legacy state manually.',
    );
  }
  let configAfter: string;
  let configFragment: CodexManagedFragment;
  try {
    configFragment = captureCodexManagedFragment(configBefore);
    configAfter = restoreCodexManagedFragment(
      configBefore,
      configFragment,
    );
  } catch {
    return requiresSetupActionResult(
      request,
      paths,
      'The legacy Codex configuration fragment is not exact or independently owned.',
      'Resolve the legacy marker ambiguity manually; --force cannot establish ownership.',
    );
  }

  const metadataPath = join(paths.assetPath, MANAGED_METADATA_NAME);
  const receiptPaths = resolveSetupReceiptPaths(receiptBasePath, nextReceiptId(options));
  const configReceiptPaths = {
    ...receiptPaths,
    backupRoot: join(receiptPaths.backupRoot, 'migration-config'),
  };
  const metadataReceiptPaths = {
    ...receiptPaths,
    backupRoot: join(receiptPaths.backupRoot, 'migration-metadata'),
  };
  const assetReceiptPaths = {
    ...receiptPaths,
    backupRoot: join(receiptPaths.backupRoot, 'migration-assets'),
  };
  const startedAt = transactionNow(options);
  const configFragmentEvidence = createCodexManagedFragmentReceiptEvidence(
    paths.configPath,
    'remove',
    configFragment,
  );
  const receipt = createSetupReceipt({
    schema_version: 2,
    id: basename(dirname(receiptPaths.receiptPath)),
    operation: 'setup',
    status: 'in_progress',
    harness: 'codex',
    scope: request.scope,
    target: canonicalTarget,
    package_version: getVersion(),
    force: request.force,
    started_at: startedAt,
    updated_at: startedAt,
    strategy: 'plugin_manager',
    capability_evidence: codexPlan.evidence,
    manager_evidence: initialCodexManagerEvidence(codexPlan),
    external_checkpoints: [],
    steps: [
      { id: 'migration-manager', kind: 'verification', outcome: 'confirmed' },
      {
        id: 'migration-config',
        kind: 'filesystem',
        outcome: 'planned',
        owned_key: 'plugins."thoth-mem".mcp_servers."thoth-mem"',
        path: paths.configPath,
        managed_fragment: configFragmentEvidence,
      },
      {
        id: 'migration-metadata',
        kind: 'filesystem',
        outcome: 'planned',
        path: metadataPath,
        pre_hash: await filesystemEntrySnapshot(metadataPath),
        post_hash: 'missing',
      },
      {
        id: 'migration-assets',
        kind: 'filesystem',
        outcome: 'planned',
        path: paths.assetPath,
        pre_hash: await filesystemEntrySnapshot(paths.assetPath),
        post_hash: 'missing',
      },
      { id: 'verify', kind: 'verification', outcome: 'planned' },
    ],
  });
  const configApplied = await applyReceiptBackedChanges({
    targetRoot: paths.targetRoot,
    sourceRoot: roots.packageRoot,
    receiptBasePath,
    receiptPaths: configReceiptPaths,
    dataDir,
    receipt,
    changes: [{ kind: 'file', targetPath: paths.configPath, content: configAfter }],
    options,
    postHash: async (path) => path === paths.configPath
      ? codexManagedFragmentPostSnapshot(path, configFragmentEvidence)
      : filesystemEntrySnapshot(path),
    afterWriteAhead: () => traceSetup(options, 'migration_manager_checkpoint', receiptPaths.receiptPath),
    changeTraceKind: 'migration_fragment_removed',
  });
  if (configApplied.filesystem.outcome === 'failed') {
    return receiptFailureResult(
      request,
      paths,
      configApplied.filesystem.changed,
      configApplied.initialReceiptPersisted ? receiptPaths.receiptPath : null,
      'Codex legacy migration stopped before a verified final state.',
    );
  }

  const metadataApplied = await applyReceiptBackedChanges({
    targetRoot: paths.targetRoot,
    sourceRoot: roots.packageRoot,
    receiptBasePath,
    receiptPaths: metadataReceiptPaths,
    dataDir,
    receipt: configApplied.receipt,
    changes: [{ kind: 'remove', targetPath: metadataPath }],
    options,
    postHash: filesystemEntrySnapshot,
    changeTraceKind: 'migration_fragment_removed',
  });
  if (metadataApplied.filesystem.outcome === 'failed') {
    return receiptFailureResult(
      request,
      paths,
      true,
      receiptPaths.receiptPath,
      'Codex legacy metadata migration stopped before a verified checkpoint.',
    );
  }

  const assetsApplied = await applyReceiptBackedChanges({
    targetRoot: paths.targetRoot,
    sourceRoot: roots.packageRoot,
    receiptBasePath,
    receiptPaths: assetReceiptPaths,
    dataDir,
    receipt: metadataApplied.receipt,
    changes: [{ kind: 'remove', targetPath: paths.assetPath }],
    options,
    postHash: filesystemEntrySnapshot,
    changeTraceKind: 'migration_fragment_removed',
  });
  if (assetsApplied.filesystem.outcome === 'failed') {
    return receiptFailureResult(
      request,
      paths,
      true,
      receiptPaths.receiptPath,
      'Codex legacy asset migration stopped before a verified checkpoint.',
    );
  }

  const finalPlan = await inspectCodexCli({
    executor,
    scope: request.scope,
    ...(request.projectPath ? { projectPath: request.projectPath } : {}),
  });
  const finalInspection = await inspectSetup(request, paths, createNodeSetupFileSystem(), options);
  const managerVerified = finalPlan.strategy === 'plugin_manager'
    && finalPlan.operations.every((operation) => operation.verified);
  if (!managerVerified || finalInspection.codexLegacyState !== 'absent') {
    return receiptFailureResult(
      request,
      paths,
      true,
      receiptPaths.receiptPath,
      'Codex migration final reread did not confirm a single manager-owned state.',
    );
  }

  const finalizedAt = transactionNow(options);
  const finalReceipt: SetupReceiptV2 = {
    ...assetsApplied.receipt,
    status: 'complete',
    updated_at: finalizedAt,
    manager_evidence: {
      ...assetsApplied.receipt.manager_evidence,
      marketplace: {
        ...assetsApplied.receipt.manager_evidence.marketplace,
        final_verified: true,
      },
      plugin: {
        ...assetsApplied.receipt.manager_evidence.plugin,
        installed: true,
        enabled: true,
        final_verified: true,
      },
      final_verified_at: finalizedAt,
    },
    steps: assetsApplied.receipt.steps.map((step) => {
      if (step.id === 'verify') {
        return { ...step, outcome: 'confirmed' as const };
      }
      return step;
    }),
  };
  const persisted = await persistReceiptCheckpoint(
    receiptPaths.receiptPath,
    receiptBasePath,
    finalReceipt,
    dataDir,
    options,
  );
  if (!persisted.ok) {
    return receiptFailureResult(
      request,
      paths,
      true,
      receiptPaths.receiptPath,
      'Codex migration completed but its final receipt could not be confirmed.',
    );
  }
  return {
    status: 'complete',
    changed: true,
    harness: 'codex',
    scope: request.scope,
    target: paths.targetRoot,
    steps: codexStrategySteps(request, inspection, codexEvidenceFromPlan(request, finalPlan), finalPlan)
      .map((step) => ({ ...step, outcome: 'confirmed' as const })),
    diagnostics: receiptKeyDiagnostic(assetsApplied.keyProtection),
    manual_actions: [],
    receipt: receiptPaths.receiptPath,
  };
}

function rollbackStepChange(
  step: SetupReceiptStep,
  currentHash: string,
): FilesystemChange | null {
  if (!step.path || !step.pre_hash || currentHash === step.pre_hash) {
    return null;
  }
  if (!step.backup_path) {
    return { kind: 'remove', targetPath: step.path };
  }
  if (step.id === 'assets') {
    return {
      kind: 'directory',
      targetPath: step.path,
      entries: [{ sourcePath: step.backup_path, targetRelativePath: '.' }],
    };
  }
  throw new Error('file-rollback-content-required');
}

async function executeCodexRollback(
  request: SetupRequest,
  paths: SetupPaths,
  dataDir: string,
  canonicalTarget: string,
  receiptBasePath: string,
  options: SetupEngineOptions,
): Promise<SetupResult> {
  const selectedReceiptPath = request.rollbackReceipt!;
  const loaded = await loadSetupReceipt(selectedReceiptPath, {
    dataDir,
    expectedBasePath: receiptBasePath,
  });
  if (!loaded.ok) {
    return requiresSetupActionResult(
      request,
      paths,
      'The selected Codex rollback receipt failed integrity or topology verification.',
      'Use the original signed receipt; --force cannot bypass receipt verification.',
      `Verify rollback receipt: ${selectedReceiptPath}`,
    );
  }
  if (
    loaded.receipt.schema_version !== 2
    || loaded.receipt.harness !== 'codex'
    || loaded.receipt.scope !== request.scope
    || resolve(loaded.receipt.target) !== resolve(canonicalTarget)
  ) {
    return requiresSetupActionResult(
      request,
      paths,
      'The selected receipt does not carry V2 authority for this Codex target.',
      'Use the verified V2 setup receipt created for this exact scope and target.',
    );
  }
  const receipt = loaded.receipt;
  const migrationConfig = receipt.steps.find((step) => step.id === 'migration-config');
  const migrationMetadata = receipt.steps.find((step) => step.id === 'migration-metadata');
  const migrationAssets = receipt.steps.find((step) => step.id === 'migration-assets');
  const isMigration = migrationConfig !== undefined
    && migrationMetadata !== undefined
    && migrationAssets !== undefined;

  if (receipt.strategy === 'plugin_manager' && !isMigration) {
    const createdByAttempt = receipt.manager_evidence.marketplace.created_by_attempt
      || receipt.manager_evidence.plugin.created_by_attempt;
    return createdByAttempt
      ? requiresSetupActionResult(
          request,
          paths,
          'Automatic Codex plugin-manager removal is unavailable for this verified CLI grammar.',
          'Use the Codex plugin manager manually to remove only receipt-created state; thoth-mem will not edit manager cache or config directly.',
          'Inspect receipt-created Codex plugin manager state',
        )
      : {
          status: 'complete',
          changed: false,
          harness: 'codex',
          scope: request.scope,
          target: paths.targetRoot,
          steps: [{ name: 'Preserve pre-existing Codex plugin manager state', outcome: 'confirmed' }],
          diagnostics: [],
          manual_actions: [],
          receipt: null,
        };
  }

  const configStep = isMigration
    ? migrationConfig!
    : receipt.steps.find((step) => step.id === 'config');
  const assetStep = isMigration
    ? migrationAssets!
    : receipt.steps.find((step) => step.id === 'assets');
  if (
    !configStep?.path
    || !configStep.managed_fragment
    || configStep.managed_fragment.config_path !== paths.configPath
    || configStep.managed_fragment.operation !== (isMigration ? 'remove' : 'apply')
    || !assetStep?.path
  ) {
    return requiresSetupActionResult(
      request,
      paths,
      'The selected receipt lacks exact filesystem rollback authority.',
      'Recover the original signed receipt or restore the owned locations manually.',
    );
  }

  let currentConfig: string | null;
  let configAfter: string | null;
  const changes: FilesystemChange[] = [];
  try {
    currentConfig = await readRegularFileOrNull(paths.configPath);
    configAfter = currentConfig;
    const evidence = configStep.managed_fragment;
    const fragment = codexManagedFragmentFromReceiptEvidence(evidence);
    if (codexManagedFragmentStateMatches(currentConfig, evidence, 'post')) {
      configAfter = isMigration
        ? applyCodexManagedFragment(currentConfig ?? '', fragment)
        : restoreCodexManagedFragment(currentConfig ?? '', fragment);
    } else if (!codexManagedFragmentStateMatches(currentConfig, evidence, 'pre')) {
      throw new Error('codex-managed-fragment-diverged');
    }
  } catch {
    return requiresSetupActionResult(
      request,
      paths,
      'The receipt-owned Codex configuration fragment is unavailable or diverged.',
      'Restore the exact signed managed fragment or resolve the marker ambiguity manually.',
    );
  }
  if (configAfter !== currentConfig) {
    changes.push(configAfter === null
      ? { kind: 'remove', targetPath: paths.configPath }
      : { kind: 'file', targetPath: paths.configPath, content: configAfter });
  }

  try {
    const currentAssetHash = await filesystemEntrySnapshot(paths.assetPath);
    if (isMigration) {
      if (currentAssetHash !== assetStep.pre_hash) {
        if (!assetStep.backup_path || !migrationMetadata!.backup_path) {
          throw new Error('migration-assets-backup-missing');
        }
        const [backupHash, metadataBackupHash, metadataContent] = await Promise.all([
          filesystemEntrySnapshot(assetStep.backup_path),
          filesystemEntrySnapshot(migrationMetadata!.backup_path),
          readRegularFileOrNull(migrationMetadata!.backup_path),
        ]);
        if (
          metadataContent === null
          || metadataBackupHash !== migrationMetadata!.pre_hash
        ) {
          throw new Error('migration-metadata-backup-diverged');
        }
        if (currentAssetHash === 'missing') {
          changes.unshift({
            kind: 'directory',
            targetPath: paths.assetPath,
            entries: [{ sourcePath: assetStep.backup_path, targetRelativePath: '.' }],
            generatedFiles: [{
              targetRelativePath: MANAGED_METADATA_NAME,
              content: metadataContent,
              mode: 0o600,
            }],
          });
        } else if (currentAssetHash === backupHash) {
          changes.unshift({
            kind: 'file',
            targetPath: join(paths.assetPath, MANAGED_METADATA_NAME),
            content: metadataContent,
          });
        } else {
          throw new Error('migration-assets-diverged');
        }
      }
    } else if (currentAssetHash !== 'missing') {
      if (currentAssetHash !== assetStep.post_hash) {
        throw new Error('legacy-assets-diverged');
      }
      if (assetStep.backup_path) {
        changes.unshift({
          kind: 'directory',
          targetPath: paths.assetPath,
          entries: [{ sourcePath: assetStep.backup_path, targetRelativePath: '.' }],
        });
      } else {
        changes.unshift({ kind: 'remove', targetPath: paths.assetPath });
      }
    }
  } catch {
    return requiresSetupActionResult(
      request,
      paths,
      'The receipt-owned Codex asset location is unavailable or diverged.',
      'Do not delete lookalike paths; restore the exact receipt backup or resolve the divergence manually.',
    );
  }

  if (changes.length === 0) {
    return {
      status: 'complete',
      changed: false,
      harness: 'codex',
      scope: request.scope,
      target: paths.targetRoot,
      steps: [{ name: 'Confirm receipt-owned Codex rollback state', outcome: 'confirmed' }],
      diagnostics: [],
      manual_actions: [],
      receipt: null,
    };
  }

  const rollbackReceiptPaths = resolveSetupReceiptPaths(receiptBasePath, nextReceiptId(options));
  const startedAt = transactionNow(options);
  const rollbackReceipt = createSetupReceipt({
    id: basename(dirname(rollbackReceiptPaths.receiptPath)),
    operation: 'rollback',
    status: 'in_progress',
    harness: 'codex',
    scope: request.scope,
    target: canonicalTarget,
    package_version: getVersion(),
    force: request.force,
    started_at: startedAt,
    updated_at: startedAt,
    steps: changes.map((change, index) => ({
      id: `codex-rollback-${index + 1}`,
      kind: 'filesystem' as const,
      outcome: 'planned' as const,
      path: change.targetPath,
    })),
  });
  const applied = await applyReceiptBackedChanges({
    targetRoot: paths.targetRoot,
    sourceRoot: dirname(selectedReceiptPath),
    receiptBasePath,
    receiptPaths: rollbackReceiptPaths,
    dataDir,
    receipt: rollbackReceipt,
    changes,
    options,
    postHash: filesystemEntrySnapshot,
  });
  if (applied.filesystem.outcome === 'failed') {
    return receiptFailureResult(
      request,
      paths,
      applied.filesystem.changed,
      applied.initialReceiptPersisted ? rollbackReceiptPaths.receiptPath : null,
      'Receipt-owned Codex rollback did not complete.',
    );
  }
  const completedReceipt: SetupReceiptV1 = {
    ...applied.receipt,
    status: 'complete',
    updated_at: transactionNow(options),
  };
  const completed = await persistReceiptCheckpoint(
    rollbackReceiptPaths.receiptPath,
    receiptBasePath,
    completedReceipt,
    dataDir,
    options,
  );
  if (!completed.ok) {
    return receiptFailureResult(
      request,
      paths,
      true,
      rollbackReceiptPaths.receiptPath,
      'Codex rollback completed but its final receipt could not be confirmed.',
    );
  }
  return {
    status: 'complete',
    changed: true,
    harness: 'codex',
    scope: request.scope,
    target: paths.targetRoot,
    steps: [{ name: 'Restore only receipt-owned Codex fragments', outcome: 'confirmed' }],
    diagnostics: receiptKeyDiagnostic(applied.keyProtection),
    manual_actions: [],
    receipt: rollbackReceiptPaths.receiptPath,
  };
}

async function executeOpenCodeRollback(
  request: SetupRequest,
  unresolvedPaths: SetupPaths,
  dataDir: string,
  canonicalTarget: string,
  receiptBasePath: string,
  options: SetupEngineOptions,
): Promise<SetupResult> {
  const selectedReceiptPath = request.rollbackReceipt!;
  const loaded = await loadSetupReceipt(selectedReceiptPath, {
    dataDir,
    expectedBasePath: receiptBasePath,
  });
  if (!loaded.ok) {
    return requiresSetupActionResult(
      request,
      unresolvedPaths,
      'The selected rollback receipt failed integrity or topology verification.',
      'Select the original verified setup receipt; --force cannot bypass receipt verification.',
      `Verify rollback receipt: ${selectedReceiptPath}`,
    );
  }
  if (loaded.receipt.schema_version !== 1) {
    return requiresSetupActionResult(
      request,
      unresolvedPaths,
      'The selected versioned Codex receipt does not authorize this legacy rollback path.',
      'Use the strategy-aware Codex rollback flow when manager removal support is available.',
      `Verify rollback receipt: ${selectedReceiptPath}`,
    );
  }
  const bound = bindSetupReceipt(
    request,
    unresolvedPaths,
    canonicalTarget,
    receiptBasePath,
    selectedReceiptPath,
    loaded.receipt,
  );
  if (!bound) {
    return requiresSetupActionResult(
      request,
      unresolvedPaths,
      'The selected receipt is not bound to this harness, scope, target, and managed topology.',
      'Use the verified setup receipt created for this exact target.',
    );
  }
  if (bound.receipt.status === 'rolled_back') {
    return {
      status: 'complete',
      changed: false,
      harness: request.harness,
      scope: request.scope,
      target: bound.paths.targetRoot,
      steps: [{ name: `Verify completed rollback: ${selectedReceiptPath}`, outcome: 'confirmed' }],
      diagnostics: [],
      manual_actions: [],
      receipt: null,
    };
  }
  if (bound.receipt.status !== 'complete') {
    return requiresSetupActionResult(
      request,
      bound.paths,
      'Only a verified complete setup receipt can be rolled back.',
      'Resolve the incomplete setup receipt before requesting rollback.',
    );
  }

  let currentConfig: string | null;
  let beforeConfig: string | null;
  let assetCurrentHash: string;
  let pluginCurrentHash: string;
  let assetBackupHash: string;
  let pluginBackupHash: string;
  try {
    [
      currentConfig,
      beforeConfig,
      assetCurrentHash,
      pluginCurrentHash,
      assetBackupHash,
      pluginBackupHash,
    ] = await Promise.all([
      readRegularFileOrNull(bound.paths.configPath),
      bound.configStep.backup_path
        ? readRegularFileOrNull(bound.configStep.backup_path)
        : Promise.resolve(null),
      filesystemEntrySnapshot(bound.paths.assetPath),
      filesystemEntrySnapshot(bound.paths.pluginEntryPath),
      bound.assetStep.backup_path
        ? filesystemEntrySnapshot(bound.assetStep.backup_path)
        : Promise.resolve('missing'),
      bound.pluginStep.backup_path
        ? filesystemEntrySnapshot(bound.pluginStep.backup_path)
        : Promise.resolve('missing'),
    ]);
  } catch {
    return requiresSetupActionResult(
      request,
      bound.paths,
      'A receipt-owned path or backup is unavailable or unsafe.',
      'Restore the verified receipt backup topology before retrying rollback.',
    );
  }
  const configBackupMatches = bound.configStep.backup_path
    ? beforeConfig !== null
      && inspectOpenCodeOwnedState(beforeConfig).hash === bound.configStep.pre_hash
    : beforeConfig === null;
  const assetBackupMatches = bound.assetStep.backup_path
    ? assetBackupHash !== 'missing' && assetBackupHash === bound.assetStep.pre_hash
    : bound.assetStep.pre_hash === 'missing';
  const pluginBackupMatches = bound.pluginStep.backup_path
    ? pluginBackupHash !== 'missing' && pluginBackupHash === bound.pluginStep.pre_hash
    : bound.pluginStep.pre_hash === 'missing';
  if (!configBackupMatches || !assetBackupMatches || !pluginBackupMatches) {
    return requiresSetupActionResult(
      request,
      bound.paths,
      'A receipt-owned backup no longer matches its signed pre-state.',
      'Restore the original verified backup before retrying rollback.',
    );
  }
  const configRollback = planOpenCodeManagedRollback({
    current: currentConfig,
    before: beforeConfig,
    expectedPostHash: bound.configStep.post_hash!,
    force: request.force,
  });
  const assetDiverged = assetCurrentHash !== bound.assetStep.post_hash;
  const pluginDiverged = pluginCurrentHash !== bound.pluginStep.post_hash;
  if (!configRollback.ok || ((assetDiverged || pluginDiverged) && !request.force)) {
    return requiresSetupActionResult(
      request,
      bound.paths,
      'A receipt-owned setup location diverged after installation.',
      'Review the owned divergence and retry with --force only to replace receipt-owned locations.',
    );
  }

  const changes: FilesystemChange[] = [];
  if (configRollback.changed) {
    changes.push(configRollback.after === null
      ? { kind: 'remove', targetPath: bound.paths.configPath }
      : { kind: 'file', targetPath: bound.paths.configPath, content: configRollback.after });
  }
  const assetChange = rollbackStepChange(bound.assetStep, assetCurrentHash);
  if (assetChange) {
    changes.push(assetChange);
  }
  if (pluginCurrentHash !== bound.pluginStep.pre_hash) {
    if (bound.pluginStep.backup_path) {
      const pluginBefore = await readRegularFileOrNull(bound.pluginStep.backup_path);
      if (pluginBefore === null) {
        return requiresSetupActionResult(
          request,
          bound.paths,
          'The receipt-owned plugin backup is unavailable.',
          'Restore the verified plugin backup before retrying rollback.',
        );
      }
      changes.push({
        kind: 'file',
        targetPath: bound.paths.pluginEntryPath,
        content: pluginBefore,
      });
    } else {
      changes.push({ kind: 'remove', targetPath: bound.paths.pluginEntryPath });
    }
  }

  if (changes.length === 0) {
    const rolledBack = await persistReceiptCheckpoint(
      selectedReceiptPath,
      receiptBasePath,
      {
        ...bound.receipt,
        status: 'rolled_back',
        updated_at: transactionNow(options),
      },
      dataDir,
      options,
    );
    return rolledBack.ok
      ? {
          status: 'complete',
          changed: false,
          harness: request.harness,
          scope: request.scope,
          target: bound.paths.targetRoot,
          steps: [{ name: 'Confirm receipt-owned rollback state', outcome: 'confirmed' }],
          diagnostics: [],
          manual_actions: [],
          receipt: null,
        }
      : receiptFailureResult(
          request,
          bound.paths,
          false,
          selectedReceiptPath,
          'Rollback state was already restored but the setup receipt could not be updated.',
        );
  }

  const rollbackReceiptPaths = resolveSetupReceiptPaths(
    receiptBasePath,
    nextReceiptId(options),
  );
  const startedAt = transactionNow(options);
  const rollbackReceipt = createSetupReceipt({
    id: basename(dirname(rollbackReceiptPaths.receiptPath)),
    operation: 'rollback',
    status: 'in_progress',
    harness: request.harness,
    scope: request.scope,
    target: canonicalTarget,
    package_version: getVersion(),
    force: request.force,
    started_at: startedAt,
    updated_at: startedAt,
    steps: [
      {
        id: 'config',
        kind: 'filesystem',
        outcome: configRollback.changed ? 'planned' : 'skipped',
        owned_key: 'mcp.thoth-mem',
        path: bound.paths.configPath,
        pre_hash: inspectOpenCodeOwnedState(currentConfig).hash,
        post_hash: configRollback.postHash,
      },
      {
        id: 'assets',
        kind: 'filesystem',
        outcome: assetChange ? 'planned' : 'skipped',
        path: bound.paths.assetPath,
        pre_hash: assetCurrentHash,
        post_hash: bound.assetStep.pre_hash!,
      },
      {
        id: 'plugin',
        kind: 'filesystem',
        outcome: pluginCurrentHash !== bound.pluginStep.pre_hash ? 'planned' : 'skipped',
        path: bound.paths.pluginEntryPath,
        pre_hash: pluginCurrentHash,
        post_hash: bound.pluginStep.pre_hash!,
      },
      { id: 'verify', kind: 'verification', outcome: 'planned' },
    ],
  });
  const applied = await applyReceiptBackedChanges({
    targetRoot: bound.paths.targetRoot,
    sourceRoot: dirname(selectedReceiptPath),
    receiptBasePath,
    receiptPaths: rollbackReceiptPaths,
    dataDir,
    receipt: rollbackReceipt,
    changes,
    options,
    postHash: async (path) => path === bound.paths.configPath
      ? inspectOpenCodeOwnedState(await readRegularFileOrNull(path)).hash
      : filesystemEntrySnapshot(path),
  });
  if (applied.filesystem.outcome === 'failed') {
    await markRestoredFailure(
      applied,
      rollbackReceiptPaths,
      receiptBasePath,
      dataDir,
      options,
    );
    return receiptFailureResult(
      request,
      bound.paths,
      applied.filesystem.changed,
      applied.initialReceiptPersisted ? rollbackReceiptPaths.receiptPath : null,
      'Receipt-owned rollback did not complete.',
    );
  }

  let rollbackVerified = false;
  try {
    rollbackVerified = inspectOpenCodeOwnedState(
      await readRegularFileOrNull(bound.paths.configPath),
    ).hash === configRollback.postHash
      && await filesystemEntrySnapshot(bound.paths.assetPath) === bound.assetStep.pre_hash
      && await filesystemEntrySnapshot(bound.paths.pluginEntryPath) === bound.pluginStep.pre_hash;
  } catch {
    rollbackVerified = false;
  }
  if (!rollbackVerified) {
    return receiptFailureResult(
      request,
      bound.paths,
      true,
      rollbackReceiptPaths.receiptPath,
      'Rollback post-state verification failed.',
    );
  }

  const originalUpdated = await persistReceiptCheckpoint(
    selectedReceiptPath,
    receiptBasePath,
    {
      ...bound.receipt,
      status: 'rolled_back',
      updated_at: transactionNow(options),
    },
    dataDir,
    options,
  );
  if (!originalUpdated.ok) {
    return receiptFailureResult(
      request,
      bound.paths,
      true,
      rollbackReceiptPaths.receiptPath,
      'Rollback completed but the original setup receipt could not be marked rolled back.',
    );
  }
  const completeRollback: SetupReceiptV1 = {
    ...applied.receipt,
    status: 'complete',
    updated_at: transactionNow(options),
    steps: applied.receipt.steps.map((step) => (
      step.id === 'verify' ? { ...step, outcome: 'confirmed' as const } : step
    )),
  };
  const completed = await persistReceiptCheckpoint(
    rollbackReceiptPaths.receiptPath,
    receiptBasePath,
    completeRollback,
    dataDir,
    options,
  );
  if (!completed.ok) {
    return receiptFailureResult(
      request,
      bound.paths,
      true,
      rollbackReceiptPaths.receiptPath,
      'Rollback completed but its final receipt could not be confirmed.',
    );
  }
  await traceSetup(options, 'receipt_complete', rollbackReceiptPaths.receiptPath);
  return {
    status: 'complete',
    changed: true,
    harness: request.harness,
    scope: request.scope,
    target: bound.paths.targetRoot,
    steps: [
      { name: `Restore receipt-owned configuration: ${bound.paths.configPath}`, outcome: 'confirmed' },
      { name: `Restore receipt-owned assets: ${bound.paths.assetPath}`, outcome: 'confirmed' },
      { name: 'Verify receipt-owned rollback', outcome: 'confirmed' },
    ],
    diagnostics: [
      ...receiptKeyDiagnostic(applied.keyProtection),
        ...(request.force
            ? ['Force rollback was bounded to receipt-owned paths and configuration keys.']
            : []),
    ],
      manual_actions: [],
      receipt: rollbackReceiptPaths.receiptPath,
  };
}

export async function inspectAndPlanSetup(
    request: SetupRequest,
    options: SetupEngineOptions = {},
): Promise<SetupResult> {
    const roots = options.roots ?? getDefaultSetupRoots();
    let paths: SetupPaths;
    try {
        paths = resolveSetupPaths(request, roots);
    } catch {
        return invalidPathResult(request);
    }

    if (request.harness === 'claude-code') {
        return claudeCodeSetupStrategy.inspectAndPlan(request, roots, paths, options);
    }

    const canUseNodeFilesystem = !request.planOnly && options.fileSystem === undefined;
    const canMutateOpenCode = request.harness === 'opencode' && canUseNodeFilesystem;
    const canMutateCodex = request.harness === 'codex'
        && canUseNodeFilesystem
        && request.rollbackReceipt === undefined;
    const canMutateCodexRollback = request.harness === 'codex'
        && canUseNodeFilesystem
    && request.rollbackReceipt !== undefined;
  const needsTargetLock = canMutateOpenCode || canMutateCodex || canMutateCodexRollback;
  let dataDir: string;
  let receiptBasePath: string;
  let canonicalTarget: string;
  try {
    dataDir = canonicalDataDir(options, roots, needsTargetLock);
    if (!isAbsolute(dataDir)) {
      return invalidPathResult(request);
    }
    receiptBasePath = setupReceiptBasePath(request, paths, dataDir);
    canonicalTarget = await canonicalizeSetupTarget(paths.targetRoot);
  } catch {
    return invalidPathResult(request);
  }

  let releaseLock: (() => Promise<void>) | undefined;
  if (canMutateCodex) {
    const noOp = await inspectVerifiedCodexNoOpBeforeLock(
      request,
      paths,
      dataDir,
      canonicalTarget,
      receiptBasePath,
      options,
    );
    if (noOp) {
      return noOp;
    }
  }
  if (needsTargetLock) {
    const lock = await acquireSetupTargetLock(
      dataDir,
      request.harness,
      request.scope,
      paths.targetRoot,
    );
    if (!lock.ok) {
      return requiresSetupActionResult(
        request,
        paths,
        lock.reason === 'busy'
          ? 'Selected setup target is locked by another operation.'
          : 'The selected setup target lock is unavailable.',
        'Wait for the active operation to finish, then retry.',
      );
    }
    releaseLock = lock.release;
  }

  try {
    if (releaseLock) {
      await traceSetup(options, 'lock_acquired');
    }
    const scanned = await scanSetupReceipts(receiptBasePath, {
      dataDir,
      expectedBasePath: receiptBasePath,
    });
    if (!scanned.ok) {
      return requiresSetupActionResult(
        request,
        paths,
        'Selected setup receipts or their HMAC key could not be verified.',
        'Restore the existing receipt key or receipt files; no key was rotated.',
      );
    }
    const incomplete = scanned.receipts.filter(({ receipt }) => (
      receipt.status === 'in_progress'
      && receipt.harness === request.harness
      && receipt.scope === request.scope
      && resolve(receipt.target) === resolve(canonicalTarget)
    ));
    const blockingIncomplete = request.rollbackReceipt
      ? incomplete.filter(({ path }) => resolve(path) !== resolve(request.rollbackReceipt!))
      : incomplete;
    if (blockingIncomplete.length > 0) {
      return {
        status: 'requires_user_action',
        changed: false,
        harness: request.harness,
        scope: request.scope,
        target: paths.targetRoot,
        steps: [{ name: 'Inspect incomplete setup transaction receipts', outcome: 'unavailable' }],
        diagnostics: blockingIncomplete.map(({ path }) => `Incomplete setup receipt: ${path}`),
        manual_actions: ['Inspect the verified in-progress receipt before retrying setup or rollback.'],
        receipt: null,
      };
    }

    if (request.rollbackReceipt) {
      if (canMutateCodexRollback) {
        return await executeCodexRollback(
          request,
          paths,
          dataDir,
          canonicalTarget,
          receiptBasePath,
          options,
        );
      }
      if (!canMutateOpenCode) {
        return requiresSetupActionResult(
          request,
          paths,
          request.planOnly
            ? 'Plan-only rollback inspection performed no writes.'
            : 'Public rollback mutation is available for OpenCode only in this setup phase.',
          'Run the supported OpenCode rollback without --plan, or complete Codex actions manually.',
          `Inspect rollback receipt: ${request.rollbackReceipt}`,
        );
      }
      return await executeOpenCodeRollback(
        request,
        paths,
        dataDir,
        canonicalTarget,
        receiptBasePath,
        options,
      );
    }

    const fileSystem = options.fileSystem ?? createNodeSetupFileSystem();
    let inspection: SetupInspection;
    try {
    inspection = await inspectSetup(request, paths, fileSystem, options);
    } catch {
      return failedInspectionResult(request, paths.targetRoot, paths.sourceAssetsPath);
    }
    paths = inspection.paths;
    if (
      request.harness === 'codex'
      && inspection.codexLegacyState === 'ambiguous'
      && await hasExactSignedLegacyProof(
        scanned.receipts,
        request,
        paths,
        canonicalTarget,
      )
    ) {
      inspection = {
        ...inspection,
        managed: true,
        conflicts: [],
        codexLegacyState: 'managed',
      };
    }

    const needsFileChanges = !inspection.managed;
    const useCodexCli = request.harness === 'codex'
      && (options.codexExecutor !== undefined || options.fileSystem === undefined);
    if (useCodexCli) {
      const executor = options.codexExecutor ?? createNodeCodexCommandExecutor();
      const codexPlan = await inspectCodexCli({
        executor,
        scope: request.scope,
        ...(request.projectPath ? { projectPath: request.projectPath } : {}),
      });
      if (inspection.conflicts.some((conflict) => conflict.forceable)) {
        const ownershipBlockedInspection: SetupInspection = {
          ...inspection,
          conflicts: inspection.conflicts.map((conflict) => ({
            ...conflict,
            forceable: false,
          })),
        };
        return codexPlanningResult(request, ownershipBlockedInspection, codexPlan);
      }
      if (
        request.planOnly
        || codexPlan.status !== 'ready'
        || hasBlockingConflict(request, inspection)
      ) {
        return codexPlanningResult(request, inspection, codexPlan);
      }
      const allExternalVerified = codexPlan.operations.every((operation) => operation.verified);
      if (
        canMutateCodex
        && codexPlan.strategy === 'plugin_manager'
        && inspection.codexLegacyState === 'managed'
        && allExternalVerified
      ) {
        return await executeCodexMigration(
          request,
          roots,
          inspection,
          dataDir,
          canonicalTarget,
          receiptBasePath,
          options,
          executor,
          codexPlan,
        );
      }
      const strategyNeedsFileChanges = codexPlan.strategy === 'legacy_filesystem'
        && needsFileChanges;
      if (
        !strategyNeedsFileChanges
        && (allExternalVerified || codexPlan.strategy === 'legacy_filesystem')
      ) {
        return codexPlanningResult(request, inspection, codexPlan);
      }
      if (canMutateCodex) {
        return await executeCodexSetup(
          request,
          roots,
          inspection,
          dataDir,
          canonicalTarget,
          receiptBasePath,
          options,
          executor,
          codexPlan,
        );
      }
      return codexPlanningResult(request, inspection, codexPlan);
    }

    const codexEvidence = codexEvidenceForScope(request, options.codexRegistration);
    if (
      canMutateOpenCode
      && needsFileChanges
      && !hasBlockingConflict(request, inspection)
    ) {
      return await executeOpenCodeSetup(
        request,
        roots,
        inspection,
        dataDir,
        canonicalTarget,
        receiptBasePath,
        options,
      );
    }
    const status = deriveStatus(request, inspection, codexEvidence, needsFileChanges);
    return {
      status,
      changed: false,
      harness: request.harness,
      scope: request.scope,
      target: paths.targetRoot,
      steps: planSteps(request, paths, inspection, codexEvidence),
      diagnostics: planDiagnostics(request, paths, inspection, codexEvidence),
      manual_actions: manualActions(request, inspection, codexEvidence, needsFileChanges),
      receipt: null,
    };
  } finally {
    await releaseLock?.();
  }
}
