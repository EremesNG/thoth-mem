import {
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
  SetupHarness,
  SetupScope,
  SetupStatus,
  SetupStepOutcome,
} from './types.js';

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
  diagnostic?: string;
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
  hmac_sha256: string;
}

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

export type ReceiptWriteResult =
  | {
      ok: true;
      receipt: SetupReceiptV1;
      keyProtection: 'enforced' | 'best_effort_windows';
    }
  | { ok: false; reason: string };

export type ReceiptLoadResult =
  | { ok: true; receipt: SetupReceiptV1 }
  | { ok: false; reason: string };

export type ReceiptScanResult =
  | { ok: true; receipts: Array<{ path: string; receipt: SetupReceiptV1 }> }
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

const RECEIPT_KEYS = [
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
  'diagnostic',
] as const;
const HMAC_PATTERN = /^[0-9a-f]{64}$/;
const RECEIPT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_RECEIPT_BYTES = 1024 * 1024;

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

export function createSetupReceipt(
  input: Omit<SetupReceiptV1, 'schema_version' | 'hmac_sha256'>
    & Partial<Pick<SetupReceiptV1, 'schema_version' | 'hmac_sha256'>>,
): SetupReceiptV1 {
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

  const signedReceipt: SetupReceiptV1 = {
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
  const receipts: Array<{ path: string; receipt: SetupReceiptV1 }> = [];
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

function signReceipt(receipt: SetupReceiptV1, key: Buffer): string {
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

function isSetupReceipt(value: unknown, allowBlankHmac: boolean): value is SetupReceiptV1 {
  if (!isRecord(value) || !hasOnlyKeys(value, RECEIPT_KEYS)) {
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
    || !isOneOf(value.harness, ['opencode', 'codex'])
    || !isOneOf(value.scope, ['global', 'project'])
    || typeof value.target !== 'string'
    || !isAbsolute(value.target)
    || !isNonEmptyString(value.package_version)
    || typeof value.force !== 'boolean'
    || !isIsoTimestamp(value.started_at)
    || !isIsoTimestamp(value.updated_at)
    || !Array.isArray(value.steps)
    || value.steps.length > 128
    || !value.steps.every(isSetupReceiptStep)
    || typeof value.hmac_sha256 !== 'string'
    || !(HMAC_PATTERN.test(value.hmac_sha256) || (allowBlankHmac && value.hmac_sha256 === ''))
  ) {
    return false;
  }
  return true;
}

function isSetupReceiptStep(value: unknown): value is SetupReceiptStep {
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
  return optionalString(value, 'owned_key')
    && optionalAbsolutePath(value, 'path')
    && (value.external_scope === undefined || isOneOf(value.external_scope, ['global', 'project']))
    && optionalString(value, 'pre_hash')
    && optionalString(value, 'post_hash')
    && optionalAbsolutePath(value, 'backup_path')
    && optionalString(value, 'diagnostic');
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
