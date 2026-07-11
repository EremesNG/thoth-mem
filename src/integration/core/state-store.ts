import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  type FileHandle,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  CAPABILITY_STATES,
  HARNESS_IDS,
  LIFECYCLE_INTENTS,
  type AdapterCapabilities,
  type Clock,
  type HarnessId,
  type LifecycleFileProtection,
  type LifecycleIntent,
} from './types.js';

export interface LifecycleStateLimits {
  maxEventKeys: number;
  maxStateBytes: number;
  lockTimeoutMs: number;
  lockPollMs: number;
  finalizedRetentionMs: number;
}

export const DEFAULT_LIFECYCLE_STATE_LIMITS: LifecycleStateLimits = {
  maxEventKeys: 16_384,
  maxStateBytes: 1_048_576,
  lockTimeoutMs: 2_000,
  lockPollMs: 25,
  finalizedRetentionMs: 30 * 24 * 60 * 60 * 1_000,
};

export interface ConfirmedLifecycleEvent {
  key: string;
  intent: LifecycleIntent;
  confirmedAt: string;
  canonicalPromptId?: number;
}

export interface LifecycleStateV1 {
  schemaVersion: 1;
  harness: HarnessId;
  projectId: string;
  rootSessionId: string;
  capabilities: AdapterCapabilities;
  enrollment: { status: 'pending' | 'confirmed'; confirmedAt?: string };
  confirmedEvents: ConfirmedLifecycleEvent[];
  terminal: { status: 'open' | 'pending' | 'confirmed'; confirmedAt?: string };
  dedupState: 'supported' | 'degraded';
  updatedAt: string;
}

export interface LifecycleStateStoreOptions {
  dataDir: string;
  harness: HarnessId;
  projectId: string;
  rootSessionId: string;
  capabilities: AdapterCapabilities;
  clock?: Clock;
  limits?: Partial<LifecycleStateLimits>;
  lockMetadataPort?: LifecycleLockMetadataPort;
}

export interface EventKeyEvidence {
  intent: LifecycleIntent;
  actor: string;
  nativeEventId?: string;
  hostTimestamp?: string;
  hostSequence?: string;
  sanitizedContent?: string;
}

export type EventKeyResult =
  | { status: 'stable'; key: string; protection: LifecycleFileProtection }
  | { status: 'degraded'; reason: 'missing_stable_event_evidence' };

export interface LifecycleLockMetadata {
  schemaVersion: 1;
  pid: number;
  ownerToken: string;
  createdAt: string;
}

export interface LifecycleLockMetadataPort {
  persist(file: FileHandle, metadata: LifecycleLockMetadata): Promise<void>;
}

interface AcquiredLifecycleLock {
  file: FileHandle;
  ownerToken: string;
}

type LockObservation =
  | { status: 'missing' }
  | { status: 'invalid'; serialized: string }
  | { status: 'valid'; serialized: string; metadata: LifecycleLockMetadata };

export interface LifecycleStateTransaction {
  readonly state: LifecycleStateV1;
  hasConfirmedEvent(key: string): boolean;
  confirmEnrollment(confirmedAt: string): void;
  confirmTerminal(confirmedAt: string): void;
  confirmEvent(event: ConfirmedLifecycleEvent): 'confirmed' | 'duplicate' | 'degraded';
}

export class LifecycleStateLockError extends Error {
  readonly code = 'LIFECYCLE_STATE_LOCK_TIMEOUT';
  readonly retryable = true;

  constructor(timeoutMs: number) {
    super(`Lifecycle state lock timed out after ${timeoutMs}ms`);
    this.name = 'LifecycleStateLockError';
  }
}

export class LifecycleStateCorruptionError extends Error {
  readonly code = 'LIFECYCLE_STATE_INVALID';
  readonly retryable = false;

  constructor() {
    super('Lifecycle state is invalid and was left unchanged for manual recovery');
    this.name = 'LifecycleStateCorruptionError';
  }
}

const systemClock: Clock = {
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const defaultLockMetadataPort: LifecycleLockMetadataPort = {
  async persist(file, metadata) {
    await file.writeFile(JSON.stringify(metadata));
    await file.sync();
  },
};

function clampLimit(value: number | undefined, hardMaximum: number, minimum: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return hardMaximum;
  }
  return Math.max(minimum, Math.min(hardMaximum, Math.floor(value)));
}

function normalizeLimits(input: Partial<LifecycleStateLimits> | undefined): LifecycleStateLimits {
  const lockTimeoutMs = clampLimit(
    input?.lockTimeoutMs,
    DEFAULT_LIFECYCLE_STATE_LIMITS.lockTimeoutMs,
    1,
  );
  return {
    maxEventKeys: clampLimit(
      input?.maxEventKeys,
      DEFAULT_LIFECYCLE_STATE_LIMITS.maxEventKeys,
      1,
    ),
    maxStateBytes: clampLimit(
      input?.maxStateBytes,
      DEFAULT_LIFECYCLE_STATE_LIMITS.maxStateBytes,
      1_024,
    ),
    lockTimeoutMs,
    lockPollMs: clampLimit(input?.lockPollMs, lockTimeoutMs, 1),
    finalizedRetentionMs: clampLimit(
      input?.finalizedRetentionMs,
      DEFAULT_LIFECYCLE_STATE_LIMITS.finalizedRetentionMs,
      1,
    ),
  };
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function serializedBytes(state: LifecycleStateV1): number {
  return Buffer.byteLength(JSON.stringify(state), 'utf8');
}

function stableEventEvidence(evidence: EventKeyEvidence): Record<string, unknown> | null {
  if (evidence.nativeEventId) {
    return { kind: 'native_id', value: evidence.nativeEventId };
  }
  if (!evidence.hostSequence && !evidence.hostTimestamp) {
    return null;
  }
  return {
    kind: 'host_order',
    sequence: evidence.hostSequence ?? null,
    timestamp: evidence.hostTimestamp ?? null,
    sanitizedContent: evidence.sanitizedContent ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isCapabilities(value: unknown): value is AdapterCapabilities {
  if (!isRecord(value) || Object.keys(value).length !== LIFECYCLE_INTENTS.length) {
    return false;
  }

  return LIFECYCLE_INTENTS.every((intent) => {
    const capability = value[intent];
    return isRecord(capability)
      && typeof capability.state === 'string'
      && (CAPABILITY_STATES as readonly string[]).includes(capability.state)
      && isOptionalString(capability.trigger)
      && isOptionalString(capability.reason);
  });
}

function isEnrollmentState(value: unknown): value is LifecycleStateV1['enrollment'] {
  if (!isRecord(value) || (value.status !== 'pending' && value.status !== 'confirmed')) {
    return false;
  }
  return value.status === 'confirmed'
    ? isTimestamp(value.confirmedAt)
    : value.confirmedAt === undefined;
}

function isTerminalState(value: unknown): value is LifecycleStateV1['terminal'] {
  if (!isRecord(value)
    || (value.status !== 'open' && value.status !== 'pending' && value.status !== 'confirmed')) {
    return false;
  }
  return value.status === 'confirmed'
    ? isTimestamp(value.confirmedAt)
    : value.confirmedAt === undefined;
}

function isConfirmedEvent(value: unknown): value is ConfirmedLifecycleEvent {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.key === 'string'
    && /^[a-f0-9]{64}$/.test(value.key)
    && typeof value.intent === 'string'
    && (LIFECYCLE_INTENTS as readonly string[]).includes(value.intent)
    && isTimestamp(value.confirmedAt)
    && (value.canonicalPromptId === undefined
      || (typeof value.canonicalPromptId === 'number'
        && Number.isInteger(value.canonicalPromptId)
        && value.canonicalPromptId > 0));
}

function isLifecycleState(value: unknown): value is LifecycleStateV1 {
  if (!isRecord(value)) {
    return false;
  }
  if (value.schemaVersion !== 1
    || typeof value.harness !== 'string'
    || !(HARNESS_IDS as readonly string[]).includes(value.harness)
    || !isNonEmptyString(value.projectId)
    || !isNonEmptyString(value.rootSessionId)
    || !isCapabilities(value.capabilities)
    || !isEnrollmentState(value.enrollment)
    || !Array.isArray(value.confirmedEvents)
    || !value.confirmedEvents.every(isConfirmedEvent)
    || !isTerminalState(value.terminal)
    || (value.dedupState !== 'supported' && value.dedupState !== 'degraded')
    || !isTimestamp(value.updatedAt)) {
    return false;
  }

  const eventKeys = value.confirmedEvents.map((event) => event.key);
  return new Set(eventKeys).size === eventKeys.length;
}

function isLockMetadata(value: unknown): value is LifecycleLockMetadata {
  if (!isRecord(value)) {
    return false;
  }
  return value.schemaVersion === 1
    && typeof value.pid === 'number'
    && Number.isInteger(value.pid)
    && value.pid > 0
    && typeof value.ownerToken === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.ownerToken,
    )
    && isTimestamp(value.createdAt);
}

function isProcessAlive(pid: number): boolean {
  if (pid === process.pid) {
    return true;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error
      && 'code' in error
      && error.code === 'EPERM';
  }
}

class Transaction implements LifecycleStateTransaction {
  dirty = false;

  constructor(
    readonly state: LifecycleStateV1,
    private readonly limits: LifecycleStateLimits,
  ) {}

  hasConfirmedEvent(key: string): boolean {
    return this.state.confirmedEvents.some((event) => event.key === key);
  }

  confirmEnrollment(confirmedAt: string): void {
    if (this.state.enrollment.status === 'confirmed') {
      return;
    }
    this.state.enrollment = { status: 'confirmed', confirmedAt };
    this.state.updatedAt = confirmedAt;
    this.dirty = true;
  }

  confirmTerminal(confirmedAt: string): void {
    if (this.state.terminal.status === 'confirmed') {
      return;
    }
    this.state.terminal = { status: 'confirmed', confirmedAt };
    this.state.updatedAt = confirmedAt;
    this.dirty = true;
  }

  confirmEvent(event: ConfirmedLifecycleEvent): 'confirmed' | 'duplicate' | 'degraded' {
    if (!/^[a-f0-9]{64}$/.test(event.key)) {
      throw new Error('Lifecycle event key must be an HMAC-SHA256 hex digest');
    }
    if (this.hasConfirmedEvent(event.key)) {
      return 'duplicate';
    }

    this.state.confirmedEvents.push({ ...event });
    this.state.updatedAt = event.confirmedAt;
    let degraded = this.state.dedupState === 'degraded';

    while (this.state.confirmedEvents.length > this.limits.maxEventKeys) {
      this.state.dedupState = 'degraded';
      this.state.confirmedEvents.shift();
      degraded = true;
    }

    while (
      serializedBytes(this.state) > this.limits.maxStateBytes
      && this.state.confirmedEvents.length > 0
    ) {
      this.state.dedupState = 'degraded';
      this.state.confirmedEvents.shift();
      degraded = true;
    }

    if (serializedBytes(this.state) > this.limits.maxStateBytes) {
      throw new Error('Lifecycle state metadata exceeds the configured byte bound');
    }

    this.dirty = true;
    return degraded ? 'degraded' : 'confirmed';
  }
}

export class FileLifecycleStateStore {
  private readonly clock: Clock;
  private readonly limits: LifecycleStateLimits;
  private readonly lockMetadataPort: LifecycleLockMetadataPort;
  private readonly stateRoot: string;
  private readonly secretPath: string;

  constructor(private readonly options: LifecycleStateStoreOptions) {
    this.clock = options.clock ?? systemClock;
    this.limits = normalizeLimits(options.limits);
    this.lockMetadataPort = options.lockMetadataPort ?? defaultLockMetadataPort;
    this.stateRoot = join(options.dataDir, 'integrations', 'state');
    this.secretPath = join(this.stateRoot, '.event-key-secret');
  }

  async createEventKey(evidence: EventKeyEvidence): Promise<EventKeyResult> {
    const stableEvidence = stableEventEvidence(evidence);

    if (!stableEvidence) {
      return { status: 'degraded', reason: 'missing_stable_event_evidence' };
    }

    const { secret, protection } = await this.readOrCreateSecret();
    const key = createHmac('sha256', secret)
      .update(JSON.stringify({
        harness: this.options.harness,
        projectId: this.options.projectId,
        rootSessionId: this.options.rootSessionId,
        intent: evidence.intent,
        actor: evidence.actor,
        evidence: stableEvidence,
      }))
      .digest('hex');
    return { status: 'stable', key, protection };
  }

  async read(): Promise<LifecycleStateV1> {
    const { statePath } = await this.resolvePaths();
    return this.readState(statePath);
  }

  async runExclusive<T>(
    operation: (transaction: LifecycleStateTransaction) => Promise<T>,
  ): Promise<T> {
    const { directory, statePath, lockPath } = await this.resolvePaths();
    await mkdir(directory, { recursive: true });
    const lock = await this.acquireLock(lockPath);

    try {
      const state = await this.readState(statePath);
      const transaction = new Transaction(state, this.limits);
      const result = await operation(transaction);
      if (transaction.dirty) {
        await this.writeState(statePath, state);
      }
      return result;
    } finally {
      try {
        await lock.file.close();
      } finally {
        await this.removeLockIfOwned(lockPath, lock.ownerToken);
      }
    }
  }

  private initialState(): LifecycleStateV1 {
    return {
      schemaVersion: 1,
      harness: this.options.harness,
      projectId: this.options.projectId,
      rootSessionId: this.options.rootSessionId,
      capabilities: this.options.capabilities,
      enrollment: { status: 'pending' },
      confirmedEvents: [],
      terminal: { status: 'open' },
      dedupState: 'supported',
      updatedAt: this.clock.now().toISOString(),
    };
  }

  private async readOrCreateSecret(): Promise<{
    secret: Buffer;
    protection: LifecycleFileProtection;
  }> {
    await mkdir(dirname(this.secretPath), { recursive: true });
    let existingSecret: Buffer | undefined;
    try {
      existingSecret = await readFile(this.secretPath);
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) {
        throw error;
      }
    }

    if (existingSecret) {
      if (existingSecret.length !== 32) {
        throw new LifecycleStateCorruptionError();
      }
      await chmod(this.secretPath, 0o600);
      return {
        secret: existingSecret,
        protection: await this.verifySecretProtection(),
      };
    }

    const secret = randomBytes(32);
    try {
      const file = await open(this.secretPath, 'wx', 0o600);
      try {
        await file.writeFile(secret);
        await file.sync();
      } finally {
        await file.close();
      }
      await chmod(this.secretPath, 0o600);
      return {
        secret,
        protection: await this.verifySecretProtection(),
      };
    } catch (error) {
      if (!isFileSystemError(error, 'EEXIST')) {
        throw error;
      }
      const existing = await readFile(this.secretPath);
      if (existing.length !== 32) {
        throw new LifecycleStateCorruptionError();
      }
      await chmod(this.secretPath, 0o600);
      return {
        secret: existing,
        protection: await this.verifySecretProtection(),
      };
    }
  }

  private async verifySecretProtection(): Promise<LifecycleFileProtection> {
    if (process.platform === 'win32') {
      return {
        state: 'degraded',
        reason: 'windows_acl_not_enforced_by_node_mode',
      };
    }

    const secretStat = await stat(this.secretPath);
    return (secretStat.mode & 0o077) === 0
      ? { state: 'supported' }
      : { state: 'degraded', reason: 'owner_only_mode_unverified' };
  }

  private async resolvePaths(): Promise<{
    directory: string;
    statePath: string;
    lockPath: string;
  }> {
    const { secret } = await this.readOrCreateSecret();
    const sessionKey = createHmac('sha256', secret)
      .update(JSON.stringify({
        harness: this.options.harness,
        projectId: this.options.projectId,
        rootSessionId: this.options.rootSessionId,
      }))
      .digest('hex');
    const directory = join(this.stateRoot, this.options.harness);
    const statePath = join(directory, `${sessionKey}.json`);
    return { directory, statePath, lockPath: `${statePath}.lock` };
  }

  private async acquireLock(lockPath: string): Promise<AcquiredLifecycleLock> {
    const startedAt = this.clock.now().getTime();
    while (true) {
      let file: FileHandle;
      try {
        file = await open(lockPath, 'wx', 0o600);
      } catch (error) {
        if (!isFileSystemError(error, 'EEXIST')) {
          throw error;
        }

        const observation = await this.readLockObservation(lockPath);
        if (observation.status === 'missing') {
          continue;
        }

        if (observation.status === 'valid' && !isProcessAlive(observation.metadata.pid)) {
          await this.removeLockIfOwned(lockPath, observation.metadata.ownerToken);
          continue;
        }

        const timedOut = this.clock.now().getTime() - startedAt >= this.limits.lockTimeoutMs;
        if (observation.status === 'invalid' && timedOut) {
          await this.removeInvalidLock(lockPath, observation.serialized);
          continue;
        }
        if (timedOut) {
          throw new LifecycleStateLockError(this.limits.lockTimeoutMs);
        }
        await this.clock.sleep(this.limits.lockPollMs);
        continue;
      }

      const ownerToken = randomUUID();
      const metadata: LifecycleLockMetadata = {
        schemaVersion: 1,
        pid: process.pid,
        ownerToken,
        createdAt: this.clock.now().toISOString(),
      };
      try {
        await this.lockMetadataPort.persist(file, metadata);
        return { file, ownerToken };
      } catch (error) {
        await file.close().catch(() => undefined);
        await unlink(lockPath).catch((cleanupError) => {
          if (!isFileSystemError(cleanupError, 'ENOENT')) {
            throw cleanupError;
          }
        });
        throw error;
      }
    }
  }

  private async readLockObservation(lockPath: string): Promise<LockObservation> {
    let serialized: string;
    try {
      serialized = await readFile(lockPath, 'utf8');
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) {
        return { status: 'missing' };
      }
      throw error;
    }

    if (Buffer.byteLength(serialized, 'utf8') > 4_096) {
      return { status: 'invalid', serialized };
    }

    try {
      const metadata: unknown = JSON.parse(serialized);
      return isLockMetadata(metadata)
        ? { status: 'valid', serialized, metadata }
        : { status: 'invalid', serialized };
    } catch {
      return { status: 'invalid', serialized };
    }
  }

  private async removeLockIfOwned(lockPath: string, ownerToken: string): Promise<void> {
    const observation = await this.readLockObservation(lockPath);
    if (observation.status !== 'valid' || observation.metadata.ownerToken !== ownerToken) {
      return;
    }
    await unlink(lockPath).catch((error) => {
      if (!isFileSystemError(error, 'ENOENT')) {
        throw error;
      }
    });
  }

  private async removeInvalidLock(lockPath: string, serialized: string): Promise<void> {
    const latest = await this.readLockObservation(lockPath);
    if (latest.status !== 'invalid' || latest.serialized !== serialized) {
      return;
    }
    await unlink(lockPath).catch((error) => {
      if (!isFileSystemError(error, 'ENOENT')) {
        throw error;
      }
    });
  }

  private async readState(statePath: string): Promise<LifecycleStateV1> {
    let serialized: string;
    try {
      serialized = await readFile(statePath, 'utf8');
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) {
        return this.initialState();
      }
      throw error;
    }

    if (Buffer.byteLength(serialized, 'utf8') > this.limits.maxStateBytes) {
      throw new LifecycleStateCorruptionError();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw new LifecycleStateCorruptionError();
    }

    if (!isLifecycleState(parsed)
      || parsed.harness !== this.options.harness
      || parsed.projectId !== this.options.projectId
      || parsed.rootSessionId !== this.options.rootSessionId) {
      throw new LifecycleStateCorruptionError();
    }

    if (parsed.terminal.status === 'confirmed' && parsed.terminal.confirmedAt) {
      const finalizedAt = Date.parse(parsed.terminal.confirmedAt);
      if (Number.isFinite(finalizedAt)
        && this.clock.now().getTime() - finalizedAt > this.limits.finalizedRetentionMs) {
        return this.initialState();
      }
    }

    return parsed;
  }

  private async writeState(statePath: string, state: LifecycleStateV1): Promise<void> {
    const serialized = `${JSON.stringify(state, null, 2)}\n`;
    if (Buffer.byteLength(JSON.stringify(state), 'utf8') > this.limits.maxStateBytes) {
      throw new Error('Lifecycle state exceeds the configured byte bound');
    }

    await mkdir(dirname(statePath), { recursive: true });
    const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
    const file = await open(temporaryPath, 'wx', 0o600);
    try {
      await file.writeFile(serialized, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }

    try {
      await rename(temporaryPath, statePath);
      await chmod(statePath, 0o600);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}
