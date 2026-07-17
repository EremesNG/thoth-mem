import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
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
  STATE_LIFECYCLE_INTENTS,
  type AdapterCapabilities,
  type Clock,
  type HarnessId,
  type LifecycleFileProtection,
  type StateLifecycleIntent,
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

export const DELIVERY_CONFIRMATION_EVENT_KIND = 'delivery_confirmation' as const;
export type ConfirmedLifecycleEventKind = StateLifecycleIntent | typeof DELIVERY_CONFIRMATION_EVENT_KIND;

export interface ConfirmedLifecycleEvent {
  key: string;
  intent: ConfirmedLifecycleEventKind;
  confirmedAt: string;
  canonicalPromptId?: number;
}

export const COMPACTION_GATE_TTL_MS = 5 * 60 * 1_000;

    export interface CompactionGate {
      version: 1;
      authority: string;
      sourceIdentity?: string;
      status: 'confirmed' | 'reserved';
      confirmedAt: string;
      expiresAt: string;
      reservationId?: string;
    }

    export interface CompactionGateAuthority {
      authority: string;
      sourceIdentity?: string;
    }

    export type CompactionGateReservation =
      | { status: 'reserved'; reservationId: string }
      | { status: 'missing' | 'expired' | 'mismatched' | 'ambiguous' };

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
  compactionGate?: CompactionGate;
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
  intent: StateLifecycleIntent;
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
      invalidateCompactionGate(confirmedAt: string): void;
      confirmCompactionGate(authority: CompactionGateAuthority, confirmedAt: string): void;
      reserveCompactionGate(sourceIdentity: string | undefined, reservedAt: string): CompactionGateReservation;
      releaseCompactionGate(reservationId: string, releasedAt: string): boolean;
      consumeCompactionGate(reservationId: string, consumedAt: string): boolean;
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

function isCompactionGate(value: unknown): value is CompactionGate {
      if (!isRecord(value)
        || value.version !== 1
        || typeof value.authority !== 'string'
        || !/^[a-f0-9]{64}$/.test(value.authority)
        || (value.sourceIdentity !== undefined
          && (typeof value.sourceIdentity !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceIdentity)))
        || (value.status !== 'confirmed' && value.status !== 'reserved')
        || !isTimestamp(value.confirmedAt)
        || !isTimestamp(value.expiresAt)) {
        return false;
      }
      const hasReservation = typeof value.reservationId === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.reservationId);
      return value.status === 'reserved' ? hasReservation : value.reservationId === undefined;
    }

    function isConfirmedEvent(value: unknown): value is ConfirmedLifecycleEvent {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.key === 'string'
    && /^[a-f0-9]{64}$/.test(value.key)
    && typeof value.intent === 'string'
    && ((STATE_LIFECYCLE_INTENTS as readonly string[]).includes(value.intent)
      || value.intent === DELIVERY_CONFIRMATION_EVENT_KIND)
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
        || (value.compactionGate !== undefined && !isCompactionGate(value.compactionGate))
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

export const DELIVERY_ATTEMPT_TTL_MS = 5 * 60 * 1_000;
const MAX_DELIVERY_ATTEMPT_TOKEN_CODE_POINTS = 4_096;
const MAX_DELIVERY_BINDING_CODE_POINTS = 512;
const MAX_DELIVERY_MAPPING_CODE_POINTS = 128;
const DELIVERY_CHANNELS = ['opencode-protocol-output', 'runner-stdout'] as const;
export type DeliveryAttemptPurpose = 'recovery_context' | 'post_compaction_guidance';

export interface DeliveryAttemptBinding {
  eventMappingId: string;
  deliveryChannel: typeof DELIVERY_CHANNELS[number];
  deliveryMappingId: string;
}

export interface DeliveryAttemptIssue extends DeliveryAttemptBinding {
  purpose: DeliveryAttemptPurpose;
  directiveText: string;
}

export interface DeliveryAttemptConfirmation extends DeliveryAttemptBinding {
  purpose: DeliveryAttemptPurpose;
  directiveText: string;
  deliveryAttempt: string;
}

export type DeliveryAttemptConfirmationResult =
  | { outcome: 'confirmed' | 'no_op'; retryable: false }
  | { outcome: 'failed'; retryable: boolean; reason: string };

interface DeliveryAttemptClaims extends DeliveryAttemptBinding {
  version: 1;
  harness: HarnessId;
  projectId: string;
  rootSessionId: string;
  purpose: DeliveryAttemptPurpose;
  directiveSha256: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

function isBoundedOpaque(value: unknown, maximum: number): value is string {
  return typeof value === 'string'
    && Array.from(value).length > 0
    && Array.from(value).length <= maximum;
}

function isDeliveryMapping(value: unknown): value is string {
  return isBoundedOpaque(value, MAX_DELIVERY_MAPPING_CODE_POINTS)
    && /^[a-z0-9][a-z0-9.-]*$/.test(value);
}

function isDeliveryChannel(value: unknown): value is DeliveryAttemptBinding['deliveryChannel'] {
  return value === 'opencode-protocol-output' || value === 'runner-stdout';
}

function isDeliveryPurpose(value: unknown): value is DeliveryAttemptPurpose {
  return value === 'recovery_context' || value === 'post_compaction_guidance';
}

function isDeliveryDirective(value: unknown): value is string {
  return typeof value === 'string'
    && Array.from(value).length > 0
    && Array.from(value).length <= 1_000;
}

function isDeliveryBinding(value: DeliveryAttemptBinding): boolean {
  return isDeliveryMapping(value.eventMappingId)
    && isDeliveryChannel(value.deliveryChannel)
    && isDeliveryMapping(value.deliveryMappingId);
}

function directiveSha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function deliveryAttemptSignature(secret: Buffer, encodedClaims: string): string {
  return createHmac('sha256', secret).update(encodedClaims).digest('hex');
}

function parseDeliveryAttemptClaims(token: string, secret: Buffer): DeliveryAttemptClaims | undefined {
  if (!isBoundedOpaque(token, MAX_DELIVERY_ATTEMPT_TOKEN_CODE_POINTS)) return undefined;
  const pieces = token.split('.');
  if (pieces.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(pieces[0]) || !/^[a-f0-9]{64}$/.test(pieces[1])) return undefined;
  const expected = Buffer.from(deliveryAttemptSignature(secret, pieces[0]), 'hex');
  const actual = Buffer.from(pieces[1], 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(pieces[0], 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const keys = [
    'version', 'harness', 'projectId', 'rootSessionId', 'purpose', 'eventMappingId', 'deliveryChannel',
    'deliveryMappingId', 'directiveSha256', 'nonce', 'issuedAt', 'expiresAt',
  ];
  if (Object.keys(parsed).length !== keys.length || !keys.every((key) => Object.hasOwn(parsed, key))) return undefined;
  if (parsed.version !== 1
    || typeof parsed.harness !== 'string'
    || !(HARNESS_IDS as readonly string[]).includes(parsed.harness)
    || !isBoundedOpaque(parsed.projectId, MAX_DELIVERY_BINDING_CODE_POINTS)
    || !isBoundedOpaque(parsed.rootSessionId, MAX_DELIVERY_BINDING_CODE_POINTS)
    || !isDeliveryPurpose(parsed.purpose)
    || !isDeliveryMapping(parsed.eventMappingId)
    || !isDeliveryChannel(parsed.deliveryChannel)
    || !isDeliveryMapping(parsed.deliveryMappingId)
    || typeof parsed.directiveSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(parsed.directiveSha256)
    || typeof parsed.nonce !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.nonce)
    || typeof parsed.issuedAt !== 'number'
    || !Number.isSafeInteger(parsed.issuedAt)
    || typeof parsed.expiresAt !== 'number'
    || !Number.isSafeInteger(parsed.expiresAt)
    || parsed.expiresAt - parsed.issuedAt !== DELIVERY_ATTEMPT_TTL_MS) return undefined;
  return {
    version: 1,
    harness: parsed.harness as HarnessId,
    projectId: parsed.projectId as string,
    rootSessionId: parsed.rootSessionId as string,
    purpose: parsed.purpose as DeliveryAttemptPurpose,
    eventMappingId: parsed.eventMappingId as string,
    deliveryChannel: parsed.deliveryChannel as DeliveryAttemptBinding['deliveryChannel'],
    deliveryMappingId: parsed.deliveryMappingId as string,
    directiveSha256: parsed.directiveSha256 as string,
    nonce: parsed.nonce as string,
    issuedAt: parsed.issuedAt as number,
    expiresAt: parsed.expiresAt as number,
  };
}

function deliveryStateError(error: unknown): DeliveryAttemptConfirmationResult {
  const retryable = error instanceof LifecycleStateLockError
    || (error instanceof Error
      && 'code' in error
      && ['EAGAIN', 'EBUSY', 'EIO', 'EMFILE', 'ENFILE', 'ENOSPC'].includes(String(error.code)));
  return {
    outcome: 'failed',
    retryable,
    reason: retryable
      ? 'Delivery confirmation state is temporarily locked; retry the same attempt.'
      : 'Delivery confirmation state could not be verified safely.',
  };
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

  invalidateCompactionGate(confirmedAt: string): void {
        if (!this.state.compactionGate) {
          return;
        }
        delete this.state.compactionGate;
        this.state.updatedAt = confirmedAt;
        this.dirty = true;
      }

      confirmCompactionGate(authority: CompactionGateAuthority, confirmedAt: string): void {
        if (!/^[a-f0-9]{64}$/.test(authority.authority)
          || (authority.sourceIdentity !== undefined && !/^[a-f0-9]{64}$/.test(authority.sourceIdentity))
          || !isTimestamp(confirmedAt)) {
          throw new LifecycleStateCorruptionError();
        }
        const confirmedAtMillis = Date.parse(confirmedAt);
        this.state.compactionGate = {
          version: 1,
          authority: authority.authority,
          ...(authority.sourceIdentity ? { sourceIdentity: authority.sourceIdentity } : {}),
          status: 'confirmed',
          confirmedAt,
          expiresAt: new Date(confirmedAtMillis + COMPACTION_GATE_TTL_MS).toISOString(),
        };
        if (serializedBytes(this.state) > this.limits.maxStateBytes) {
          throw new Error('Lifecycle state metadata exceeds the configured byte bound');
        }
        this.state.updatedAt = confirmedAt;
        this.dirty = true;
      }

      reserveCompactionGate(sourceIdentity: string | undefined, reservedAt: string): CompactionGateReservation {
        const gate = this.state.compactionGate;
        if (!gate) {
          return { status: 'missing' };
        }
        if (!isTimestamp(reservedAt)) {
          throw new LifecycleStateCorruptionError();
        }
        if (Date.parse(gate.expiresAt) <= Date.parse(reservedAt)) {
          delete this.state.compactionGate;
          this.state.updatedAt = reservedAt;
          this.dirty = true;
          return { status: 'expired' };
        }
        if (gate.sourceIdentity !== sourceIdentity) {
          return { status: 'mismatched' };
        }
        if (gate.status === 'reserved') {
          return { status: 'ambiguous' };
        }
        const reservationId = randomUUID();
        this.state.compactionGate = { ...gate, status: 'reserved', reservationId };
        this.state.updatedAt = reservedAt;
        this.dirty = true;
        return { status: 'reserved', reservationId };
      }

      releaseCompactionGate(reservationId: string, releasedAt: string): boolean {
        const gate = this.state.compactionGate;
        if (!gate || gate.status !== 'reserved' || gate.reservationId !== reservationId || !isTimestamp(releasedAt)) {
          return false;
        }
        this.state.compactionGate = {
          version: gate.version,
          authority: gate.authority,
          ...(gate.sourceIdentity ? { sourceIdentity: gate.sourceIdentity } : {}),
          status: 'confirmed',
          confirmedAt: gate.confirmedAt,
          expiresAt: gate.expiresAt,
        };
        this.state.updatedAt = releasedAt;
        this.dirty = true;
        return true;
      }

      consumeCompactionGate(reservationId: string, consumedAt: string): boolean {
        const gate = this.state.compactionGate;
        if (!gate || gate.status !== 'reserved' || gate.reservationId !== reservationId || !isTimestamp(consumedAt)) {
          return false;
        }
        delete this.state.compactionGate;
        this.state.updatedAt = consumedAt;
        this.dirty = true;
        return true;
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

  async createCompactionGateAuthority(
        eventKey: string,
        sourceIdentity?: string,
      ): Promise<CompactionGateAuthority> {
        if (!/^[a-f0-9]{64}$/.test(eventKey)
          || (sourceIdentity !== undefined
            && (Array.from(sourceIdentity).length === 0 || Array.from(sourceIdentity).length > MAX_DELIVERY_BINDING_CODE_POINTS))) {
          throw new LifecycleStateCorruptionError();
        }
        const { secret } = await this.readOrCreateSecret();
        return {
          authority: eventKey,
          ...(sourceIdentity
            ? { sourceIdentity: createHmac('sha256', secret).update('compaction-gate-source:' + sourceIdentity).digest('hex') }
            : {}),
        };
      }

      async issueDeliveryAttempt(issue: DeliveryAttemptIssue): Promise<string> {
    if (!isDeliveryBinding(issue) || !isDeliveryPurpose(issue.purpose) || !isDeliveryDirective(issue.directiveText)
      || !isBoundedOpaque(this.options.projectId, MAX_DELIVERY_BINDING_CODE_POINTS)
      || !isBoundedOpaque(this.options.rootSessionId, MAX_DELIVERY_BINDING_CODE_POINTS)) {
      throw new LifecycleStateCorruptionError();
    }
    const { secret } = await this.readOrCreateSecret();
    const issuedAt = this.clock.now().getTime();
    const claims: DeliveryAttemptClaims = {
      version: 1,
      harness: this.options.harness,
      projectId: this.options.projectId,
      rootSessionId: this.options.rootSessionId,
      purpose: issue.purpose,
      eventMappingId: issue.eventMappingId,
      deliveryChannel: issue.deliveryChannel,
      deliveryMappingId: issue.deliveryMappingId,
      directiveSha256: directiveSha256(issue.directiveText),
      nonce: randomUUID(),
      issuedAt,
      expiresAt: issuedAt + DELIVERY_ATTEMPT_TTL_MS,
    };
    const encodedClaims = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    return encodedClaims + '.' + deliveryAttemptSignature(secret, encodedClaims);
  }

  async confirmDeliveryAttempt(input: DeliveryAttemptConfirmation): Promise<DeliveryAttemptConfirmationResult> {
    if (!isDeliveryBinding(input) || !isDeliveryPurpose(input.purpose) || !isDeliveryDirective(input.directiveText)) {
      return { outcome: 'failed', retryable: false, reason: 'Delivery confirmation payload is malformed.' };
    }
    try {
      const { secret } = await this.readOrCreateSecret();
      const claims = parseDeliveryAttemptClaims(input.deliveryAttempt, secret);
      if (!claims) {
        return { outcome: 'failed', retryable: false, reason: 'Delivery attempt signature is invalid.' };
      }
      if (this.clock.now().getTime() >= claims.expiresAt) {
        return { outcome: 'failed', retryable: false, reason: 'Delivery attempt has expired.' };
      }
      if (claims.harness !== this.options.harness
        || claims.projectId !== this.options.projectId
        || claims.rootSessionId !== this.options.rootSessionId
        || claims.purpose !== input.purpose
        || claims.eventMappingId !== input.eventMappingId
        || claims.deliveryChannel !== input.deliveryChannel
        || claims.deliveryMappingId !== input.deliveryMappingId
        || claims.directiveSha256 !== directiveSha256(input.directiveText)) {
        return { outcome: 'failed', retryable: false, reason: 'Delivery attempt binding does not match this confirmation.' };
      }
      const key = createHmac('sha256', secret)
        .update('delivery-confirmation:' + input.deliveryAttempt)
        .digest('hex');
      return await this.runExclusive(async (transaction) => {
        if (transaction.hasConfirmedEvent(key)) {
          return { outcome: 'no_op', retryable: false };
        }
        const outcome = transaction.confirmEvent({
          key,
          intent: DELIVERY_CONFIRMATION_EVENT_KIND,
          confirmedAt: this.clock.now().toISOString(),
        });
        return outcome === 'duplicate'
          ? { outcome: 'no_op', retryable: false }
          : { outcome: 'confirmed', retryable: false };
      });
    } catch (error) {
      return deliveryStateError(error);
    }
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
