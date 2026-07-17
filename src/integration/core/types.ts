import type { DegradedIdentityEntry, IdentitySource } from '../../store/types.js';

export const HARNESS_IDS = ['opencode', 'codex', 'claude'] as const;
export type HarnessId = typeof HARNESS_IDS[number];

export const LIFECYCLE_INTENTS = [
  'enroll_session',
  'capture_root_prompt',
  'recall_guidance',
  'compact_session',
  'finalize_session',
] as const;
export type LifecycleIntent = typeof LIFECYCLE_INTENTS[number];

export const INTERNAL_LIFECYCLE_INTENTS = ['capture_passive_learning'] as const;
export type InternalLifecycleIntent = typeof INTERNAL_LIFECYCLE_INTENTS[number];
export type IntegrationIntent = LifecycleIntent | InternalLifecycleIntent;

export const STATE_LIFECYCLE_INTENTS = [
  ...LIFECYCLE_INTENTS,
  ...INTERNAL_LIFECYCLE_INTENTS,
] as const;
export type StateLifecycleIntent = typeof STATE_LIFECYCLE_INTENTS[number];

export const CAPABILITY_STATES = ['supported', 'degraded', 'unsupported'] as const;
export type CapabilityState = typeof CAPABILITY_STATES[number];

export const LIFECYCLE_OUTCOMES = ['confirmed', 'failed', 'degraded', 'no_op'] as const;
export type LifecycleOutcome = typeof LIFECYCLE_OUTCOMES[number];

export const MEMORY_TOOL_NAMES = [
  'mem_save',
  'mem_recall',
  'mem_context',
  'mem_get',
  'mem_project',
  'mem_session',
] as const;
export type MemoryToolName = typeof MEMORY_TOOL_NAMES[number];

export interface NormalizedEvent {
  harness: HarnessId;
  intent: IntegrationIntent;
  actor: 'root_user' | 'assistant' | 'subagent' | 'tool' | 'system';
  isRootSession: boolean;
  identity: {
    sessionId?: string;
    project?: string;
    cwd?: string;
  };
  nativeEventId?: string;
  hostTimestamp?: string;
  hostSequence?: string;
  content?: string;
  compactionGate?: {
        phase: 'checkpoint' | 'resume';
        sourceIdentity?: string;
      };
          passiveLearningEvidence?: {
        terminalMappingId: string;
        verifiedTerminalOutput: boolean;
      };
      nativeEvent: string;
}

export interface Capability {
  state: CapabilityState;
  trigger?: string;
  reason?: string;
}

export type AdapterCapabilities = Record<LifecycleIntent, Capability>;

export interface SafeDiagnostic {
  harness: HarnessId;
  capability: IntegrationIntent;
  outcome: Exclude<LifecycleOutcome, 'confirmed' | 'no_op'>;
  reason: string;
  recovery?: string;
}

export type LifecycleEffect =
  | {
    kind: 'memory_call';
    tool: MemoryToolName;
    input: Record<string, unknown>;
    transition: string;
  }
  | { kind: 'inject_protocol'; text: string }
  | { kind: 'diagnostic'; diagnostic: SafeDiagnostic };

export const HOST_OUTPUT_PURPOSES = ['recovery_context', 'post_compaction_guidance'] as const;
export type HostOutputPurpose = typeof HOST_OUTPUT_PURPOSES[number];

export interface HostOutputDirective {
  purpose: HostOutputPurpose;
  text: string;
  deliveryMappingId: string;
}

export interface HostOutputMapping {
  mappingId: string;
  verifiedMappingId: string;
  ready: boolean;
}

export interface HostOutputReadiness {
  recovery?: HostOutputMapping;
  postCompaction?: HostOutputMapping;
}

export interface HostOutputDeliveryState {
  activation: 'unproven' | 'eligible';
  memoryConfirmation: 'confirmed' | 'unconfirmed';
  outputReadiness: 'ready' | 'not_ready' | 'unavailable';
  outputSupport?: 'unproven' | 'eligible' | 'confirmed';
  localEmission: 'not_emitted' | 'emitted';
  modelConsumption: 'unproven';
}

export interface ResolvedLifecycleIdentity {
  rootSessionId: string;
  projectId: string;
  cwd?: string;
  projectSource: IdentitySource;
  sessionSource: 'explicit' | 'placeholder' | 'fallback';
  degraded: DegradedIdentityEntry[];
}

export type PromptCaptureSkipReason =
  | 'private_only'
  | 'malformed_private_tag'
  | 'empty'
  | 'not_root_user'
  | 'not_root_session';

export type PromptCaptureMetadata =
  | {
    action: 'persist';
    truncated: boolean;
    privacyDegraded: boolean;
  }
  | {
    action: 'skip';
    reason: PromptCaptureSkipReason;
    truncated: false;
    privacyDegraded: boolean;
  };

export type PassiveLearningCaptureSkipReason =
  | 'not_subagent'
  | 'not_root_session'
  | 'unverified_terminal_output'
  | 'private_only'
  | 'malformed_private_tag'
  | 'empty'
  | 'unsafe_content';

export type PassiveLearningCaptureMetadata =
  | {
    action: 'persist';
    content: string;
    truncated: boolean;
    privacyDegraded: boolean;
  }
  | {
    action: 'skip';
    reason: PassiveLearningCaptureSkipReason;
    truncated: false;
    privacyDegraded: boolean;
  };

export type LifecycleFileProtection =
  | { state: 'supported' }
  | {
    state: 'degraded';
    reason: 'windows_acl_not_enforced_by_node_mode' | 'owner_only_mode_unverified';
  };

export interface LifecycleResultState {
  deduplication?: 'supported' | 'degraded';
  protection: LifecycleFileProtection;
}

export interface LifecyclePlan {
  capabilityState: CapabilityState;
  identity: ResolvedLifecycleIdentity;
  effects: LifecycleEffect[];
  promptCapture?: PromptCaptureMetadata;
  passiveLearning?: PassiveLearningCaptureMetadata;
}

export interface EffectResult {
  effect: LifecycleEffect;
  confirmed: boolean;
  isError: boolean;
  text: string;
  reference?: { kind: 'prompt' | 'observation'; id: number };
}

export interface LifecycleResult {
  outcome: LifecycleOutcome;
  retryable: boolean;
  harness: HarnessId;
  intent: IntegrationIntent;
  effects: EffectResult[];
  identity: ResolvedLifecycleIdentity;
  promptCapture?: PromptCaptureMetadata;
  passiveLearning?: PassiveLearningCaptureMetadata;
  hostOutputDirective?: HostOutputDirective;
  deliveryAttempt?: string;
  deliveryState?: HostOutputDeliveryState;
  state?: LifecycleResultState;
  diagnostic?: SafeDiagnostic;
}

export interface Clock {
  now(): Date;
  sleep(ms: number): Promise<void>;
}

export interface PromptSanitizer {
  sanitize(input: string):
    | { action: 'persist'; content: string; truncated: boolean; privacyDegraded: boolean }
    | { action: 'skip'; reason: 'private_only' | 'malformed_private_tag' | 'empty' };
}
