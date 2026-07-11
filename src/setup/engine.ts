import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { getConfig } from '../config.js';
import { getVersion } from '../version.js';
import {
  createNodeCodexCommandExecutor,
  executeCodexCli,
  inspectCodexCli,
  type CodexCliPlan,
  type CodexCommandExecutor,
  type CodexExecutionTiming,
  type CodexExternalCheckpoint,
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
import { planCodexManagedConfig } from './harnesses/codex.js';
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
  createSetupReceipt,
  loadSetupReceipt,
  persistSetupReceipt,
  resolveSetupReceiptPaths,
  scanSetupReceipts,
  type ReceiptFaultEvent,
  type ReceiptPaths,
  type SetupReceiptStep,
  type SetupReceiptV1,
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

function displayHarness(request: SetupRequest): 'OpenCode' | 'Codex' {
  return request.harness === 'opencode' ? 'OpenCode' : 'Codex';
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
  executablePath: string,
): boolean {
  return metadata.schemaVersion === SETUP_MANAGED_METADATA_VERSION
    && metadata.packageVersion === getVersion()
    && resolve(metadata.executable) === executablePath
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
  if (sourceAssetsType !== 'directory') {
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
    && metadataMatches(metadata, request, paths, setupExecutablePath(options));
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
  const needsFileChanges = !inspection.managed;
  const allExternalVerified = plan.operations.every((operation) => operation.verified);
  let status: SetupResult['status'];
  if (hasBlockingConflict(request, inspection)) {
    status = 'requires_user_action';
  } else if (plan.status === 'failed') {
    status = 'failed';
  } else if (plan.status === 'requires_user_action') {
    status = 'requires_user_action';
  } else if (request.planOnly || (!needsFileChanges && allExternalVerified)) {
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
    steps: planSteps(request, inspection.paths, inspection, evidence, plan.steps),
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

interface ReceiptBackedChangeResult {
  filesystem: AtomicFilesystemResult;
  receipt: SetupReceiptV1;
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
  const projectRoot = request.harness === 'codex'
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
  receipt: SetupReceiptV1,
  backups: FilesystemBackup[],
  updatedAt: string,
): SetupReceiptV1 {
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
  receipt: SetupReceiptV1,
  path: string,
  postHash: string,
  updatedAt: string,
): SetupReceiptV1 {
  let matched = false;
  const steps = receipt.steps.map((step) => {
    if (step.path !== path) {
      return step;
    }
    matched = true;
    return { ...step, outcome: 'confirmed' as const, post_hash: postHash };
  });
  if (!matched) {
    throw new Error('receipt-step-missing');
  }
  return { ...receipt, updated_at: updatedAt, steps };
}

function withExternalReceiptCheckpoint(
  receipt: SetupReceiptV1,
  checkpoint: CodexExternalCheckpoint,
  updatedAt: string,
): SetupReceiptV1 {
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
  return { ...receipt, updated_at: updatedAt, steps };
}

async function persistReceiptCheckpoint(
  receiptPath: string,
  receiptBasePath: string,
  receipt: SetupReceiptV1,
  dataDir: string,
  options: SetupEngineOptions,
) {
  return persistSetupReceipt(receiptPath, receipt, {
    dataDir,
    expectedBasePath: receiptBasePath,
    fault: options.transaction?.receiptFault,
  });
}

async function applyReceiptBackedChanges(input: {
  targetRoot: string;
  sourceRoot?: string;
  receiptBasePath: string;
  receiptPaths: ReceiptPaths;
  dataDir: string;
  receipt: SetupReceiptV1;
  changes: FilesystemChange[];
  options: SetupEngineOptions;
  postHash: (path: string) => Promise<string>;
}): Promise<ReceiptBackedChangeResult> {
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
      );
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
      activeReceipt = persisted.receipt;
      keyProtection = persisted.keyProtection;
      initialReceiptPersisted = true;
      await traceSetup(input.options, 'receipt_in_progress', input.receiptPaths.receiptPath);
    },
    afterChange: async ({ targetPath }) => {
      activeReceipt = withConfirmedReceiptStep(
        activeReceipt,
        targetPath,
        await input.postHash(targetPath),
        transactionNow(input.options),
      );
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
      activeReceipt = persisted.receipt;
      keyProtection = persisted.keyProtection;
      await traceSetup(input.options, 'target_renamed', targetPath);
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
): Promise<SetupReceiptV1> {
  if (!result.initialReceiptPersisted || result.filesystem.changed) {
    return result.receipt;
  }
  const failedReceipt: SetupReceiptV1 = {
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
  const configBefore = inspection.configType === 'file'
    ? await readRegularFileOrNull(paths.configPath)
    : null;
  const configPlan = planCodexManagedConfig({ before: configBefore, force: request.force });
  if (configPlan.conflicts.length > 0 || !configPlan.verification.ownedValuesMatch) {
    return requiresSetupActionResult(
      request,
      paths,
      'The selected Codex configuration cannot be changed safely.',
      'Resolve the owned Codex configuration conflict and retry.',
    );
  }

  let configPreHash: string;
  let assetPreHash: string;
  try {
    [configPreHash, assetPreHash] = await Promise.all([
      filesystemEntrySnapshot(paths.configPath),
      filesystemEntrySnapshot(paths.assetPath),
    ]);
  } catch {
    return failedInspectionResult(request, paths.targetRoot, paths.sourceAssetsPath);
  }

  const needsFileChanges = !inspection.managed;
  const metadata = setupMetadata(request, paths, options);
  const receiptPaths = resolveSetupReceiptPaths(receiptBasePath, nextReceiptId(options));
  const startedAt = transactionNow(options);
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
    steps: [
      {
        id: 'config',
        kind: 'filesystem',
        outcome: needsFileChanges && configPlan.changed ? 'planned' : 'skipped',
        owned_key: 'plugins."thoth-mem".mcp_servers."thoth-mem"',
        path: paths.configPath,
        pre_hash: configPreHash,
        post_hash: configPlan.changed
          ? fileContentSnapshot(configPlan.after)
          : configPreHash,
      },
      {
        id: 'assets',
        kind: 'filesystem',
        outcome: needsFileChanges ? 'planned' : 'skipped',
        path: paths.assetPath,
        pre_hash: assetPreHash,
        post_hash: needsFileChanges ? 'pending' : assetPreHash,
      },
      ...codexPlan.operations.map((operation): SetupReceiptStep => ({
        id: operation.id,
        kind: 'external_command',
        outcome: operation.verified ? 'confirmed' : 'planned',
        external_scope: request.scope,
      })),
      { id: 'verify', kind: 'verification', outcome: 'planned' },
    ],
  });
  const changes: FilesystemChange[] = needsFileChanges
    ? [
        ...(configPlan.changed
          ? [{ kind: 'file' as const, targetPath: paths.configPath, content: configPlan.after }]
          : []),
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
      ]
    : [];
  const evidence = codexEvidenceFromPlan(request, codexPlan);
  const plannedSteps = planSteps(
    request,
    paths,
    inspection,
    evidence,
    codexPlan.steps,
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
    postHash: filesystemEntrySnapshot,
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

  let filesystemVerified: boolean;
  try {
    filesystemVerified = (await inspectSetup(request, paths, createNodeSetupFileSystem(), options)).managed;
  } catch {
    filesystemVerified = false;
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
  const external = await executeCodexCli(codexPlan, {
    executor,
    ...(options.codexTiming ? { timing: options.codexTiming } : {}),
    checkpoint: async (checkpoint) => {
      let checkpointReceipt: SetupReceiptV1;
      try {
        checkpointReceipt = withExternalReceiptCheckpoint(
          activeReceipt,
          checkpoint,
          transactionNow(options),
        );
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
      activeReceipt = persisted.receipt;
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

  const finalReceipt: SetupReceiptV1 = {
    ...activeReceipt,
    status: external.status,
    updated_at: transactionNow(options),
    steps: activeReceipt.steps.map((step) => (step.id === 'verify'
      ? {
          ...step,
          outcome: external.status === 'complete' ? 'confirmed' as const : 'failed' as const,
        }
      : step)),
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

  const externalByName = new Map(external.steps.map((step) => [step.name, step]));
  const resultSteps = plannedSteps.map((step) => {
    const externalStep = externalByName.get(step.name);
    if (externalStep) {
      return externalStep;
    }
    if (step.name === 'Verify Codex setup') {
      return {
        ...step,
        outcome: external.status === 'complete' ? 'confirmed' as const : 'failed' as const,
      };
    }
    return step.outcome === 'planned' ? { ...step, outcome: 'confirmed' as const } : step;
  });
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

  const canUseNodeFilesystem = !request.planOnly && options.fileSystem === undefined;
  const canMutateOpenCode = request.harness === 'opencode' && canUseNodeFilesystem;
  const canMutateCodex = request.harness === 'codex'
    && canUseNodeFilesystem
    && request.rollbackReceipt === undefined;
  const needsTargetLock = canMutateOpenCode || canMutateCodex;
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
    if (incomplete.length > 0) {
      return {
        status: 'requires_user_action',
        changed: false,
        harness: request.harness,
        scope: request.scope,
        target: paths.targetRoot,
        steps: [{ name: 'Inspect incomplete setup transaction receipts', outcome: 'unavailable' }],
        diagnostics: incomplete.map(({ path }) => `Incomplete setup receipt: ${path}`),
        manual_actions: ['Inspect the verified in-progress receipt before retrying setup or rollback.'],
        receipt: null,
      };
    }

    if (request.rollbackReceipt) {
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
      if (
        request.planOnly
        || codexPlan.status !== 'ready'
        || hasBlockingConflict(request, inspection)
      ) {
        return codexPlanningResult(request, inspection, codexPlan);
      }
      const allExternalVerified = codexPlan.operations.every((operation) => operation.verified);
      if (!needsFileChanges && allExternalVerified) {
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
