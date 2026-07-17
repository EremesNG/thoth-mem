import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';

import type {
  CodexSetupStrategy,
  SetupHarness,
  SetupScope,
  SetupStatus,
  SetupStepOutcome,
} from './types.js';
import type { CodexCliEvidence } from './codex-cli.js';
import type { CodexManagedFragment } from './harnesses/codex.js';

export type ReceiptFaultPoint =
  | 'key-stage'
  | 'key-sync'
  | 'key-rename'
  | 'receipt-stage'
  | 'receipt-sync'
  | 'receipt-rename'
  | 'receipt-parent-sync';

export interface ReceiptFaultEvent {
  point: ReceiptFaultPoint;
  path: string;
}

export interface SetupReceiptStep {
  id: string;
  kind: 'filesystem' | 'external_command' | 'verification';
  outcome: SetupStepOutcome;
  owned_key?: string;
  path?: string;
  external_scope?: SetupScope;
  pre_hash?: string;
  post_hash?: string;
  backup_path?: string;
  managed_fragment?: SetupReceiptManagedFragmentEvidence;
  diagnostic?: string;
}

export type SetupReceiptFragmentState =
  | { state: 'absent' }
  | { state: 'present'; sha256: string };

export interface SetupReceiptManagedFragmentEvidence {
  config_path: string;
  owned_location: string;
  operation: 'apply' | 'remove';
  kind: CodexManagedFragment['kind'];
  pre_state: SetupReceiptFragmentState;
  post_state: SetupReceiptFragmentState;
  restore: {
    leading_separator: string;
    before_text: string | null;
    after_text: string;
  };
}

export interface SetupReceiptV1 {
  schema_version: 1;
  id: string;
  operation: 'setup' | 'rollback';
  status: 'in_progress' | SetupStatus | 'rolled_back';
  harness: SetupHarness;
  scope: SetupScope;
  target: string;
  package_version: string;
  force: boolean;
  started_at: string;
  updated_at: string;
  steps: SetupReceiptStep[];
  supersedes?: string;
  hmac_sha256: string;
}

export interface SetupReceiptExternalCheckpoint {
  sequence: number;
  id: 'codex-marketplace' | 'codex-plugin';
  outcome: SetupStepOutcome;
  observed_at: string;
  diagnostic?: string;
}

export interface SetupReceiptV2ManagerEvidence {
  initial_state: CodexCliEvidence['managerState'];
  marketplace: {
    name: 'thoth-mem';
    source: 'EremesNG/thoth-mem';
    pre_existing_verified: boolean;
    created_by_attempt: boolean;
    final_verified: boolean;
  };
  plugin: {
    plugin_id: 'thoth-mem@thoth-mem';
    name: 'thoth-mem';
    marketplace_name: 'thoth-mem';
    installed: boolean;
    enabled: boolean;
    pre_existing_verified: boolean;
    created_by_attempt: boolean;
    final_verified: boolean;
  };
  final_verified_at: string | null;
}

export interface SetupReceiptV2 {
  schema_version: 2;
  id: string;
  operation: 'setup';
  status: 'in_progress' | SetupStatus;
  harness: 'codex';
  scope: SetupScope;
  target: string;
  package_version: string;
  force: boolean;
  started_at: string;
  updated_at: string;
  steps: SetupReceiptStep[];
  strategy: CodexSetupStrategy;
  capability_evidence: CodexCliEvidence;
  manager_evidence: SetupReceiptV2ManagerEvidence;
  external_checkpoints: SetupReceiptExternalCheckpoint[];
  hmac_sha256: string;
}

export type SetupReceipt = SetupReceiptV1 | SetupReceiptV2;

export interface ReceiptPaths {
  receiptRoot: string;
  receiptPath: string;
  backupRoot: string;
}

export interface ReceiptPersistenceOptions {
  dataDir: string;
  expectedBasePath?: string;
  fault?: (event: ReceiptFaultEvent) => void | Promise<void>;
}

export type ReceiptWriteResult<T extends SetupReceipt = SetupReceipt> =
  | {
      ok: true;
      receipt: T;
      keyProtection: 'enforced' | 'best_effort_windows';
    }
  | { ok: false; reason: string };

export type ReceiptLoadResult =
  | { ok: true; receipt: SetupReceipt }
  | { ok: false; reason: string };

export type ReceiptScanResult =
  | { ok: true; receipts: Array<{ path: string; receipt: SetupReceipt }> }
  | { ok: false; reason: string };

interface ReceiptKeyResult {
  ok: true;
  key: Buffer;
  protection: 'enforced' | 'best_effort_windows';
}

interface ReceiptKeyFailure {
  ok: false;
  reason: string;
}

const RECEIPT_V1_KEYS = [
  'schema_version',
  'id',
  'operation',
  'status',
  'harness',
  'scope',
  'target',
  'package_version',
  'force',
  'started_at',
  'updated_at',
  'steps',
  'supersedes',
  'hmac_sha256',
] as const;
const RECEIPT_V2_KEYS = [
  ...RECEIPT_V1_KEYS.filter((key) => key !== 'hmac_sha256' && key !== 'supersedes'),
  'strategy',
  'capability_evidence',
  'manager_evidence',
  'external_checkpoints',
  'hmac_sha256',
] as const;
const STEP_KEYS = [
  'id',
  'kind',
  'outcome',
  'owned_key',
  'path',
  'external_scope',
  'pre_hash',
  'post_hash',
  'backup_path',
  'managed_fragment',
  'diagnostic',
] as const;
const HMAC_PATTERN = /^[0-9a-f]{64}$/;
const RECEIPT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_RECEIPT_BYTES = 1024 * 1024;
const MAX_RECEIPT_CHECKPOINTS = 256;
const MAX_RECEIPT_DIAGNOSTIC_LENGTH = 512;
const MAX_MANAGED_FRAGMENT_BYTES = 4 * 1024;
const CODEX_MANAGED_OWNED_LOCATION = 'plugins.\"thoth-mem\".mcp_servers.\"thoth-mem\"';

export function getReceiptKeyPath(dataDir: string): string {
  return join(dataDir, 'setup', 'receipt.key');
}

export function resolveSetupReceiptPaths(basePath: string, id: string): ReceiptPaths {
  const receiptRoot = join(basePath, id);
  return {
    receiptRoot,
    receiptPath: join(receiptRoot, 'receipt.json'),
    backupRoot: join(receiptRoot, 'backups'),
  };
}

export function createCodexManagedFragmentReceiptEvidence(
  configPath: string,
  operation: SetupReceiptManagedFragmentEvidence['operation'],
  fragment: CodexManagedFragment,
): SetupReceiptManagedFragmentEvidence {
  const beforeState: SetupReceiptFragmentState = fragment.beforeHash === null
    ? { state: 'absent' }
    : { state: 'present', sha256: fragment.beforeHash };
  const afterState: SetupReceiptFragmentState = {
    state: 'present',
    sha256: fragment.afterHash,
  };
  const evidence: SetupReceiptManagedFragmentEvidence = {
    config_path: configPath,
    owned_location: fragment.ownedLocation,
    operation,
    kind: fragment.kind,
    pre_state: operation === 'apply' ? beforeState : afterState,
    post_state: operation === 'apply' ? afterState : beforeState,
    restore: {
      leading_separator: fragment.leadingSeparator,
      before_text: fragment.beforeText,
      after_text: fragment.afterText,
    },
  };
  if (!isSetupReceiptManagedFragmentEvidence(evidence)) {
    throw new Error('codex-managed-fragment-receipt-evidence-invalid');
  }
  return evidence;
}

export function codexManagedFragmentFromReceiptEvidence(
  evidence: SetupReceiptManagedFragmentEvidence,
): CodexManagedFragment {
  if (!isSetupReceiptManagedFragmentEvidence(evidence)) {
    throw new Error('codex-managed-fragment-receipt-evidence-invalid');
  }
  const beforeHash = evidence.restore.before_text === null
    ? null
    : fragmentHash(evidence.restore.before_text);
  return {
    kind: evidence.kind,
    ownedLocation: evidence.owned_location,
    leadingSeparator: evidence.restore.leading_separator,
    beforeText: evidence.restore.before_text,
    beforeHash,
    afterText: evidence.restore.after_text,
    afterHash: fragmentHash(evidence.restore.after_text),
  };
}

type SetupReceiptV1Input = Omit<SetupReceiptV1, 'schema_version' | 'hmac_sha256'>
  & Partial<Pick<SetupReceiptV1, 'schema_version' | 'hmac_sha256'>>;
type SetupReceiptV2Input = Omit<SetupReceiptV2, 'hmac_sha256'>
  & Partial<Pick<SetupReceiptV2, 'hmac_sha256'>>;

export function createSetupReceipt(input: SetupReceiptV2Input): SetupReceiptV2;
export function createSetupReceipt(input: SetupReceiptV1Input): SetupReceiptV1;
export function createSetupReceipt(
  input: SetupReceiptV1Input | SetupReceiptV2Input,
): SetupReceipt {
  if (input.schema_version === 2) {
    return {
      ...input,
      schema_version: 2,
      hmac_sha256: '',
    };
  }
  return {
    ...input,
    schema_version: 1,
    hmac_sha256: '',
  };
}

export async function persistSetupReceipt(
  receiptPath: string,
  receipt: SetupReceiptV1,
  options: ReceiptPersistenceOptions,
): Promise<ReceiptWriteResult<SetupReceiptV1>>;
export async function persistSetupReceipt(
  receiptPath: string,
  receipt: SetupReceiptV2,
  options: ReceiptPersistenceOptions,
): Promise<ReceiptWriteResult<SetupReceiptV2>>;
export async function persistSetupReceipt(
  receiptPath: string,
  receipt: SetupReceipt,
  options: ReceiptPersistenceOptions,
): Promise<ReceiptWriteResult>;
export async function persistSetupReceipt(
  receiptPath: string,
  receipt: SetupReceipt,
  options: ReceiptPersistenceOptions,
): Promise<ReceiptWriteResult> {
  if (!isSetupReceipt(receipt, true)) {
    return { ok: false, reason: 'receipt_schema_invalid' };
  }
  const basePath = options.expectedBasePath ?? dirname(dirname(receiptPath));
  if (!await receiptPathMatches(receiptPath, basePath, receipt.id)) {
    return { ok: false, reason: 'receipt_path_invalid' };
  }

  const keyResult = await ensureReceiptKey(options, basePath);
  if (!keyResult.ok) {
    return keyResult;
  }

  const signedReceipt: SetupReceipt = {
    ...receipt,
    hmac_sha256: signReceipt(receipt, keyResult.key),
  };
  const receiptRoot = dirname(receiptPath);
  const stagePath = join(receiptRoot, `.receipt.thoth-mem-stage-${randomUUID()}`);
  try {
    await mkdir(receiptRoot, { recursive: true });
    await invokeFault(options, 'receipt-stage', stagePath);
    const handle = await open(stagePath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(signedReceipt, null, 2)}\n`, 'utf8');
      await handle.chmod(0o600);
      await invokeFault(options, 'receipt-sync', stagePath);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await invokeFault(options, 'receipt-rename', receiptPath);
    await rename(stagePath, receiptPath);
    await invokeFault(options, 'receipt-parent-sync', receiptRoot);
    await syncDirectoryBestEffort(receiptRoot);
    return {
      ok: true,
      receipt: signedReceipt,
      keyProtection: keyResult.protection,
    };
  } catch {
    await rm(stagePath, { force: true }).catch(() => undefined);
    return { ok: false, reason: 'receipt_persistence_failed' };
  }
}

export async function loadSetupReceipt(
  receiptPath: string,
  options: ReceiptPersistenceOptions,
): Promise<ReceiptLoadResult> {
  const basePath = options.expectedBasePath ?? dirname(dirname(receiptPath));
  if (!await receiptPathHasValidTopology(receiptPath, basePath)) {
    return { ok: false, reason: 'receipt_path_invalid' };
  }

  let parsed: unknown;
  try {
    const details = await lstat(receiptPath);
    if (
      !details.isFile()
      || details.isSymbolicLink()
      || details.size > MAX_RECEIPT_BYTES
    ) {
      return { ok: false, reason: 'receipt_unavailable' };
    }
    parsed = JSON.parse(await readFile(receiptPath, 'utf8'));
  } catch {
    return { ok: false, reason: 'receipt_unavailable' };
  }
  if (!isSetupReceipt(parsed, false)) {
    return { ok: false, reason: 'receipt_schema_invalid' };
  }
  if (!await receiptPathMatches(receiptPath, basePath, parsed.id)) {
    return { ok: false, reason: 'receipt_path_invalid' };
  }

  const keyResult = await readReceiptKey(options.dataDir, false);
  if (!keyResult.ok) {
    return keyResult;
  }
  const expectedHmac = signReceipt(parsed, keyResult.key);
  const actual = Buffer.from(parsed.hmac_sha256, 'hex');
  const expected = Buffer.from(expectedHmac, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, reason: 'hmac_mismatch' };
  }
  return { ok: true, receipt: parsed };
}

export async function scanSetupReceipts(
  basePath: string,
  options: ReceiptPersistenceOptions,
): Promise<ReceiptScanResult> {
  let receiptPaths: string[];
  try {
    receiptPaths = await listReceiptPaths(basePath);
  } catch {
    return { ok: false, reason: 'receipt_scan_failed' };
  }
  if (receiptPaths.length === 0) {
    return { ok: true, receipts: [] };
  }
  const receipts: Array<{ path: string; receipt: SetupReceipt }> = [];
  for (const receiptPath of receiptPaths) {
    const loaded = await loadSetupReceipt(receiptPath, {
      ...options,
      expectedBasePath: basePath,
    });
    if (!loaded.ok) {
      return loaded;
    }
    receipts.push({ path: receiptPath, receipt: loaded.receipt });
  }
  return { ok: true, receipts };
}

function signReceipt(receipt: SetupReceipt, key: Buffer): string {
  const { hmac_sha256: _ignored, ...unsignedReceipt } = receipt;
  return createHmac('sha256', key)
    .update(canonicalJson(unsignedReceipt), 'utf8')
    .digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw new Error('receipt-canonicalization-failed');
  }
  return encoded;
}

function isSetupReceipt(value: unknown, allowBlankHmac: boolean): value is SetupReceipt {
  if (!isRecord(value)) {
    return false;
  }
  return value.schema_version === 1
    ? isSetupReceiptV1(value, allowBlankHmac)
    : value.schema_version === 2 && isSetupReceiptV2(value, allowBlankHmac);
}

function isSetupReceiptV1(
  value: Record<string, unknown>,
  allowBlankHmac: boolean,
): boolean {
  if (!hasAllowedKeys(value, RECEIPT_V1_KEYS)) {
    return false;
  }
  if (
    value.schema_version !== 1
    || !isReceiptId(value.id)
    || !isOneOf(value.operation, ['setup', 'rollback'])
    || !isOneOf(value.status, [
      'in_progress',
      'complete',
      'failed',
      'partial',
      'requires_user_action',
      'rolled_back',
    ])
    || !isOneOf(value.harness, ['opencode', 'codex', 'claude'])
    || !isOneOf(value.scope, ['global', 'project'])
    || typeof value.target !== 'string'
    || !isAbsolute(value.target)
    || !isNonEmptyString(value.package_version)
    || typeof value.force !== 'boolean'
    || !isIsoTimestamp(value.started_at)
    || !isIsoTimestamp(value.updated_at)
    || !Array.isArray(value.steps)
    || value.steps.length > 128
    || !value.steps.every((step) => isSetupReceiptStep(step, false))
    || (value.supersedes !== undefined
      && (!isReceiptId(value.supersedes) || value.supersedes === value.id))
    || typeof value.hmac_sha256 !== 'string'
    || !(HMAC_PATTERN.test(value.hmac_sha256) || (allowBlankHmac && value.hmac_sha256 === ''))
  ) {
    return false;
  }
  return true;
}

function isSetupReceiptV2(
  value: Record<string, unknown>,
  allowBlankHmac: boolean,
): boolean {
  if (!hasOnlyKeys(value, RECEIPT_V2_KEYS)) {
    return false;
  }
  if (
    value.schema_version !== 2
    || !isReceiptId(value.id)
    || value.operation !== 'setup'
    || !isOneOf(value.status, [
      'in_progress',
      'complete',
      'failed',
      'partial',
      'requires_user_action',
    ])
    || value.harness !== 'codex'
    || !isOneOf(value.scope, ['global', 'project'])
    || typeof value.target !== 'string'
    || !isAbsolute(value.target)
    || !isNonEmptyString(value.package_version)
    || typeof value.force !== 'boolean'
    || !isIsoTimestamp(value.started_at)
    || !isIsoTimestamp(value.updated_at)
    || !Array.isArray(value.steps)
    || value.steps.length > 128
    || !value.steps.every((step) => isSetupReceiptStep(step, true))
    || !isOneOf(value.strategy, ['plugin_manager', 'legacy_filesystem'])
    || !isCodexCapabilityEvidence(value.capability_evidence, value.scope)
    || !isSetupReceiptManagerEvidence(value.manager_evidence)
    || !isExternalCheckpointLedger(value.external_checkpoints)
    || typeof value.hmac_sha256 !== 'string'
    || !(HMAC_PATTERN.test(value.hmac_sha256) || (allowBlankHmac && value.hmac_sha256 === ''))
  ) {
    return false;
  }
  return true;
}

function isCodexCapabilityEvidence(value: unknown, scope: unknown): value is CodexCliEvidence {
  if (!isRecord(value) || !hasOnlyKeys(value, ['version', 'capabilities', 'managerState'])) {
    return false;
  }
  const version = value.version;
  const capabilities = value.capabilities;
  if (
    !isRecord(version)
    || !hasOnlyKeys(version, ['value', 'classification'])
    || !(version.value === null || isBoundedString(version.value, 64))
    || !isOneOf(version.classification, ['tested', 'untested', 'unknown'])
    || !isRecord(capabilities)
    || !hasOnlyKeys(capabilities, ['scope', 'marketplace', 'plugin', 'complete'])
    || capabilities.scope !== scope
    || !isOperationCapabilityEvidence(capabilities.marketplace)
    || !isOperationCapabilityEvidence(capabilities.plugin)
    || typeof capabilities.complete !== 'boolean'
    || !isOneOf(value.managerState, ['absent', 'compatible', 'partial', 'unclassifiable'])
  ) {
    return false;
  }
  const marketplace = capabilities.marketplace as Record<string, unknown>;
  const plugin = capabilities.plugin as Record<string, unknown>;
  return capabilities.complete === (
    marketplace.mutation === true
    && marketplace.verification === true
    && plugin.mutation === true
    && plugin.verification === true
  );
}

function isOperationCapabilityEvidence(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ['mutation', 'verification', 'format'])
    && typeof value.mutation === 'boolean'
    && typeof value.verification === 'boolean'
    && (value.format === null || isOneOf(value.format, ['json', 'legacy']));
}

function isSetupReceiptManagerEvidence(value: unknown): value is SetupReceiptV2ManagerEvidence {
  if (
    !isRecord(value)
    || !hasOnlyKeys(value, ['initial_state', 'marketplace', 'plugin', 'final_verified_at'])
    || !isOneOf(value.initial_state, ['absent', 'compatible', 'partial', 'unclassifiable'])
    || !(value.final_verified_at === null || isIsoTimestamp(value.final_verified_at))
  ) {
    return false;
  }
  const marketplace = value.marketplace;
  const plugin = value.plugin;
  if (
    !isRecord(marketplace)
    || !hasOnlyKeys(marketplace, [
      'name',
      'source',
      'pre_existing_verified',
      'created_by_attempt',
      'final_verified',
    ])
    || marketplace.name !== 'thoth-mem'
    || marketplace.source !== 'EremesNG/thoth-mem'
    || !isManagerOutcomeEvidence(marketplace)
    || !isRecord(plugin)
    || !hasOnlyKeys(plugin, [
      'plugin_id',
      'name',
      'marketplace_name',
      'installed',
      'enabled',
      'pre_existing_verified',
      'created_by_attempt',
      'final_verified',
    ])
    || plugin.plugin_id !== 'thoth-mem@thoth-mem'
    || plugin.name !== 'thoth-mem'
    || plugin.marketplace_name !== 'thoth-mem'
    || typeof plugin.installed !== 'boolean'
    || typeof plugin.enabled !== 'boolean'
    || !isManagerOutcomeEvidence(plugin)
  ) {
    return false;
  }
  return plugin.final_verified === (plugin.installed === true && plugin.enabled === true)
    && (value.final_verified_at === null
      || (marketplace.final_verified === true && plugin.final_verified === true));
}

function isManagerOutcomeEvidence(value: Record<string, unknown>): boolean {
  return typeof value.pre_existing_verified === 'boolean'
    && typeof value.created_by_attempt === 'boolean'
    && typeof value.final_verified === 'boolean'
    && !(value.pre_existing_verified && value.created_by_attempt)
    && (!value.created_by_attempt || value.final_verified === true);
}

function isExternalCheckpointLedger(value: unknown): value is SetupReceiptExternalCheckpoint[] {
  return Array.isArray(value)
    && value.length <= MAX_RECEIPT_CHECKPOINTS
    && value.every((checkpoint, index) => (
      isRecord(checkpoint)
      && hasAllowedKeys(checkpoint, ['sequence', 'id', 'outcome', 'observed_at', 'diagnostic'])
      && checkpoint.sequence === index + 1
      && isOneOf(checkpoint.id, ['codex-marketplace', 'codex-plugin'])
      && isOneOf(checkpoint.outcome, ['planned', 'skipped', 'confirmed', 'failed', 'unavailable'])
      && isIsoTimestamp(checkpoint.observed_at)
      && optionalBoundedString(checkpoint, 'diagnostic', MAX_RECEIPT_DIAGNOSTIC_LENGTH)
    ));
}

function isSetupReceiptStep(
  value: unknown,
  allowManagedFragment: boolean,
): value is SetupReceiptStep {
  if (!isRecord(value) || !hasAllowedKeys(value, STEP_KEYS)) {
    return false;
  }
  if (
    !isNonEmptyString(value.id)
    || !isOneOf(value.kind, ['filesystem', 'external_command', 'verification'])
    || !isOneOf(value.outcome, ['planned', 'skipped', 'confirmed', 'failed', 'unavailable'])
  ) {
    return false;
  }
  const managedFragment = value.managed_fragment;
  if (
    managedFragment !== undefined
    && (
      !allowManagedFragment
      || value.kind !== 'filesystem'
      || value.pre_hash !== undefined
      || value.post_hash !== undefined
      || !isSetupReceiptManagedFragmentEvidence(managedFragment)
      || value.path !== managedFragment.config_path
      || value.owned_key !== managedFragment.owned_location
    )
  ) {
    return false;
  }
  return optionalString(value, 'owned_key')
    && optionalAbsolutePath(value, 'path')
    && (value.external_scope === undefined || isOneOf(value.external_scope, ['global', 'project']))
    && optionalString(value, 'pre_hash')
    && optionalString(value, 'post_hash')
    && optionalAbsolutePath(value, 'backup_path')
    && optionalBoundedString(value, 'diagnostic', MAX_RECEIPT_DIAGNOSTIC_LENGTH);
}

function isSetupReceiptManagedFragmentEvidence(
  value: unknown,
): value is SetupReceiptManagedFragmentEvidence {
  if (
    !isRecord(value)
    || !hasOnlyKeys(value, [
      'config_path',
      'owned_location',
      'operation',
      'kind',
      'pre_state',
      'post_state',
      'restore',
    ])
    || typeof value.config_path !== 'string'
    || !isAbsolute(value.config_path)
    || value.owned_location !== CODEX_MANAGED_OWNED_LOCATION
    || !isOneOf(value.operation, ['apply', 'remove'])
    || !isOneOf(value.kind, ['insert', 'replace'])
    || !isSetupReceiptFragmentState(value.pre_state)
    || !isSetupReceiptFragmentState(value.post_state)
    || !isRecord(value.restore)
    || !hasOnlyKeys(value.restore, [
      'leading_separator',
      'before_text',
      'after_text',
    ])
    || !isOneOf(value.restore.leading_separator, ['', '\n', '\r\n'])
    || !(value.restore.before_text === null || isBoundedFragmentText(value.restore.before_text))
    || !isBoundedFragmentText(value.restore.after_text)
    || (value.kind === 'insert' && value.restore.before_text !== null)
    || (value.kind === 'replace' && (
      value.restore.before_text === null
      || value.restore.leading_separator !== ''
    ))
  ) {
    return false;
  }
  const beforeState: SetupReceiptFragmentState = value.restore.before_text === null
    ? { state: 'absent' }
    : { state: 'present', sha256: fragmentHash(value.restore.before_text) };
  const afterState: SetupReceiptFragmentState = {
    state: 'present',
    sha256: fragmentHash(value.restore.after_text),
  };
  return value.operation === 'apply'
    ? fragmentStatesEqual(value.pre_state, beforeState)
      && fragmentStatesEqual(value.post_state, afterState)
    : fragmentStatesEqual(value.pre_state, afterState)
      && fragmentStatesEqual(value.post_state, beforeState);
}

function isSetupReceiptFragmentState(value: unknown): value is SetupReceiptFragmentState {
  if (!isRecord(value) || !isOneOf(value.state, ['absent', 'present'])) {
    return false;
  }
  return value.state === 'absent'
    ? hasOnlyKeys(value, ['state'])
    : hasOnlyKeys(value, ['state', 'sha256'])
      && typeof value.sha256 === 'string'
      && HMAC_PATTERN.test(value.sha256);
}

function fragmentStatesEqual(
  left: SetupReceiptFragmentState,
  right: SetupReceiptFragmentState,
): boolean {
  return left.state === right.state
    && (left.state === 'absent'
      || (right.state === 'present' && left.sha256 === right.sha256));
}

function isBoundedFragmentText(value: unknown): value is string {
  return typeof value === 'string'
    && Buffer.byteLength(value, 'utf8') <= MAX_MANAGED_FRAGMENT_BYTES;
}

function fragmentHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === allowedKeys.length
    && actualKeys.every((key) => allowedKeys.includes(key));
}

function hasAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return isNonEmptyString(value) && value.length <= maxLength;
}

function isReceiptId(value: unknown): value is string {
  return typeof value === 'string' && RECEIPT_ID_PATTERN.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function optionalString(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || isNonEmptyString(value[key]);
}

function optionalBoundedString(
  value: Record<string, unknown>,
  key: string,
  maxLength: number,
): boolean {
  return value[key] === undefined || isBoundedString(value[key], maxLength);
}

function optionalAbsolutePath(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined
    || (typeof value[key] === 'string' && isAbsolute(value[key]));
}

async function ensureReceiptKey(
  options: ReceiptPersistenceOptions,
  receiptBasePath: string,
): Promise<ReceiptKeyResult | ReceiptKeyFailure> {
  const existing = await readReceiptKey(options.dataDir, true);
  if (existing.ok || existing.reason !== 'receipt_key_missing') {
    return existing;
  }
  try {
    if ((await listReceiptPaths(receiptBasePath)).length > 0) {
      return { ok: false, reason: 'receipt_key_missing' };
    }
  } catch {
    return { ok: false, reason: 'receipt_scan_failed' };
  }

  const keyPath = getReceiptKeyPath(options.dataDir);
  const keyDirectory = dirname(keyPath);
  const stagePath = join(keyDirectory, `.receipt-key.thoth-mem-stage-${randomUUID()}`);
  try {
    await mkdir(keyDirectory, { recursive: true });
    await invokeFault(options, 'key-stage', stagePath);
    const handle = await open(stagePath, 'wx', 0o600);
    try {
      await handle.writeFile(`${randomBytes(32).toString('hex')}\n`, 'utf8');
      await handle.chmod(0o600);
      await invokeFault(options, 'key-sync', stagePath);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await invokeFault(options, 'key-rename', keyPath);
    try {
      await link(stagePath, keyPath);
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }
    await rm(stagePath, { force: true });
    await syncDirectoryBestEffort(keyDirectory);
    return readReceiptKey(options.dataDir, true);
  } catch {
    await rm(stagePath, { force: true }).catch(() => undefined);
    return { ok: false, reason: 'receipt_key_creation_failed' };
  }
}

async function readReceiptKey(
  dataDir: string,
  enforcePermissions: boolean,
): Promise<ReceiptKeyResult | ReceiptKeyFailure> {
  const keyPath = getReceiptKeyPath(dataDir);
  try {
    const details = await lstat(keyPath);
    if (!details.isFile() || details.isSymbolicLink() || details.size > 256) {
      return { ok: false, reason: 'receipt_key_corrupt' };
    }
    const encoded = (await readFile(keyPath, 'utf8')).trim();
    if (!HMAC_PATTERN.test(encoded)) {
      return { ok: false, reason: 'receipt_key_corrupt' };
    }
    if (process.platform !== 'win32') {
      if (enforcePermissions && (details.mode & 0o777) !== 0o600) {
        await chmod(keyPath, 0o600);
      } else if (!enforcePermissions && (details.mode & 0o777) !== 0o600) {
        return { ok: false, reason: 'receipt_key_permissions_invalid' };
      }
    }
    return {
      ok: true,
      key: Buffer.from(encoded, 'hex'),
      protection: process.platform === 'win32' ? 'best_effort_windows' : 'enforced',
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      return { ok: false, reason: 'receipt_key_missing' };
    }
    return { ok: false, reason: 'receipt_key_unavailable' };
  }
}

async function listReceiptPaths(basePath: string): Promise<string[]> {
  try {
    const entries = await readdir(basePath, { withFileTypes: true });
    const paths: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        continue;
      }
      const receiptPath = join(basePath, entry.name, 'receipt.json');
      try {
        const details = await lstat(receiptPath);
        if (details.isFile() && !details.isSymbolicLink()) {
          paths.push(receiptPath);
        }
      } catch (error) {
        if (!isMissingPathError(error)) {
          throw error;
        }
      }
    }
    return paths.sort();
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }
}

async function receiptPathHasValidTopology(
  receiptPath: string,
  expectedBasePath: string,
): Promise<boolean> {
  if (
    !isAbsolute(receiptPath)
    || !isAbsolute(expectedBasePath)
    || basename(receiptPath) !== 'receipt.json'
  ) {
    return false;
  }
  const receiptRoot = dirname(resolve(receiptPath));
  const basePath = resolve(expectedBasePath);
  const relativeRoot = relative(basePath, receiptRoot);
  if (
    !relativeRoot
    || isAbsolute(relativeRoot)
    || relativeRoot === '..'
    || relativeRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    || relativeRoot.includes('/')
    || relativeRoot.includes('\\')
  ) {
    return false;
  }
  try {
    const [canonicalBase, canonicalRoot] = await Promise.all([
      resolveFromNearestExistingAncestor(basePath),
      resolveFromNearestExistingAncestor(receiptRoot),
    ]);
    return dirname(canonicalRoot) === canonicalBase;
  } catch {
    return false;
  }
}

async function receiptPathMatches(
  receiptPath: string,
  expectedBasePath: string,
  id: string,
): Promise<boolean> {
  return isReceiptId(id)
    && basename(dirname(receiptPath)) === id
    && await receiptPathHasValidTopology(receiptPath, expectedBasePath);
}

async function resolveFromNearestExistingAncestor(path: string): Promise<string> {
  let current = resolve(path);
  const missingSegments: string[] = [];
  while (true) {
    try {
      return resolve(await realpath(current), ...missingSegments.reverse());
    } catch (error) {
      if (!isMissingPathError(error) && !isNotDirectoryError(error)) {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        throw error;
      }
      missingSegments.push(basename(current));
      current = parent;
    }
  }
}

async function syncDirectoryBestEffort(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, 'r');
    await handle.sync();
  } catch (error) {
    const code = error instanceof Error && 'code' in error
      ? (error as NodeJS.ErrnoException).code
      : undefined;
    if (!['EACCES', 'EBADF', 'EINVAL', 'EISDIR', 'EPERM'].includes(code ?? '')) {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function invokeFault(
  options: ReceiptPersistenceOptions,
  point: ReceiptFaultPoint,
  path: string,
): Promise<void> {
  await options.fault?.({ point, path });
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function isNotDirectoryError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ENOTDIR';
}

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'EEXIST';
}
