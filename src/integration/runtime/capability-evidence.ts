import type {
      AdapterCapabilities,
      Capability,
      HarnessId,
      LifecycleIntent,
    } from '../core/types.js';

    export const MAX_RUNTIME_CLAIM_CODE_POINTS = 128;
    export const RUNTIME_DELIVERY_CHANNELS = [
      'opencode-protocol-output',
      'runner-stdout',
    ] as const;
    export type RuntimeDeliveryChannel = typeof RUNTIME_DELIVERY_CHANNELS[number];

    export interface RuntimeCapabilityClaim {
      hostVersion: string;
      payloadMappingId: string;
      assetExecutionMarker: string;
      eventMappingId: string;
      deliveryChannel: RuntimeDeliveryChannel;
      deliveryMappingId: string;
    }

    declare const resolverProducedAdapterCapabilitiesBrand: unique symbol;
    export type ResolverProducedAdapterCapabilities<H extends HarnessId = HarnessId> =
      AdapterCapabilities & { readonly [resolverProducedAdapterCapabilitiesBrand]: H };

    const CAPABILITY_HARNESSES = new WeakMap<object, HarnessId>();
    const RESOLUTION_HARNESSES = new WeakMap<object, HarnessId>();

    export function assertResolverProducedAdapterCapabilities<H extends HarnessId>(
      value: unknown,
      expectedHarness: H,
    ): asserts value is ResolverProducedAdapterCapabilities<H> {
      if (typeof value !== 'object' || value === null || CAPABILITY_HARNESSES.get(value) !== expectedHarness) {
        throw new Error('Adapter capabilities are not resolver-produced for ' + expectedHarness + '.');
      }
    }

    export function assertResolverProducedRuntimeCapabilityResolution<H extends HarnessId>(
      value: unknown,
      expectedHarness: H,
    ): asserts value is RuntimeCapabilityResolution {
      if (typeof value !== 'object' || value === null || RESOLUTION_HARNESSES.get(value) !== expectedHarness) {
        throw new Error('Runtime capability resolution is not resolver-produced for ' + expectedHarness + '.');
      }
    }

    export const RUNTIME_CAPABILITY_NAMES = [
      'activation', 'recovery', 'compaction', 'passiveLearning', 'terminal',
    ] as const;
    export type RuntimeCapabilityName = typeof RUNTIME_CAPABILITY_NAMES[number];
    export interface ResolvedRuntimeCapability {
      state: 'supported' | 'degraded' | 'unsupported';
      mappingId?: string;
      reason?: string;
    }
    export type ResolvedRuntimeCapabilities = Record<RuntimeCapabilityName, ResolvedRuntimeCapability>;
    export interface ResolvedRuntimeMapping {
      eventMappingId: string;
      deliveryChannel: RuntimeDeliveryChannel;
      deliveryMappingId: string;
    }
    declare const privatePrepareDeliveryAuthorizationBrand: unique symbol;
    export type PrivatePrepareDeliveryAuthorization = {
      readonly [privatePrepareDeliveryAuthorizationBrand]: never;
    };
    export interface AuthorizedPrivatePrepareDelivery {
      capabilities: ResolverProducedAdapterCapabilities;
      authorization: PrivatePrepareDeliveryAuthorization;
    }

    const ELIGIBLE_RESOLUTION_PROVENANCE = new WeakMap<object, {
      harness: 'opencode';
      authorization: PrivatePrepareDeliveryAuthorization;
    }>();
    const PRIVATE_PREPARE_DELIVERY_AUTHORIZATIONS = new WeakSet<object>();

    function mintPrivatePrepareDeliveryAuthorization(): PrivatePrepareDeliveryAuthorization {
      const authorization = Object.freeze({});
      PRIVATE_PREPARE_DELIVERY_AUTHORIZATIONS.add(authorization);
      return authorization as PrivatePrepareDeliveryAuthorization;
    }

    export function isPrivatePrepareDeliveryAuthorization(
      value: unknown,
    ): value is PrivatePrepareDeliveryAuthorization {
      return typeof value === 'object' && value !== null
        && PRIVATE_PREPARE_DELIVERY_AUTHORIZATIONS.has(value);
    }

    export type RuntimeCapabilityResolution =
      | {
        status: 'supported';
        mapping: ResolvedRuntimeMapping;
        adapterCapabilities: ResolverProducedAdapterCapabilities;
        runtimeCapabilities: ResolvedRuntimeCapabilities;
      }
      | {
        status: 'eligible';
        mapping: ResolvedRuntimeMapping;
        adapterCapabilities: ResolverProducedAdapterCapabilities;
        runtimeCapabilities: ResolvedRuntimeCapabilities;
      }
      | { status: 'degraded'; reason: string };

    interface VerifiedRuntimeMapping extends RuntimeCapabilityClaim {
      harness: HarnessId;
      adapterCapabilities: AdapterCapabilities;
    }

    function deepFreeze<T>(value: T): T {
      if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
      }
      return value;
    }

    function supported(trigger: string): Capability {
      return { state: 'supported', trigger };
    }

    function capabilities(
      triggers: Partial<Record<LifecycleIntent, string>>,
    ): AdapterCapabilities {
      const capability = (intent: LifecycleIntent): Capability => triggers[intent]
        ? supported(triggers[intent])
        : { state: 'unsupported', reason: 'No verified runtime mapping is available for ' + intent + '.' };
      return {
        enroll_session: capability('enroll_session'),
        capture_root_prompt: capability('capture_root_prompt'),
        recall_guidance: capability('recall_guidance'),
        compact_session: capability('compact_session'),
        finalize_session: capability('finalize_session'),
      };
    }


        function behaviorEligibleCapabilities(value: AdapterCapabilities): AdapterCapabilities {
          return Object.fromEntries((Object.entries(value) as Array<[LifecycleIntent, Capability]>).map(([intent, capability]) => [
            intent,
            capability.trigger
              ? {
                state: 'degraded' as const,
                trigger: capability.trigger,
                reason: 'Exact native payload evidence is eligible but does not claim supported host capability.',
              }
              : capability,
          ])) as AdapterCapabilities;
        }
    
        function mintAdapterCapabilities<H extends HarnessId>(
      harness: H,
      value: AdapterCapabilities,
    ): ResolverProducedAdapterCapabilities<H> {
      const minted = deepFreeze(structuredClone(value));
      CAPABILITY_HARNESSES.set(minted, harness);
      return minted as ResolverProducedAdapterCapabilities<H>;
    }

    function mintRuntimeCapabilityResolution<H extends HarnessId>(
      harness: H,
      value: RuntimeCapabilityResolution,
    ): RuntimeCapabilityResolution {
      const resolution = deepFreeze(value);
      RESOLUTION_HARNESSES.set(resolution, harness);
      return resolution;
    }

    const HARNESS_FACTS = {
      opencode: {
        hostVersion: 'opencode-1.x',
        payloadMappingId: 'opencode-session-payload-v1',
        assetExecutionMarker: 'opencode-activation-v1',
      },
      codex: {
        hostVersion: 'codex-0.144.x',
        payloadMappingId: 'codex-session-payload-v1',
        assetExecutionMarker: 'codex-activation-v1',
      },
      claude: {
        hostVersion: 'claude-code-1.x',
        payloadMappingId: 'claude-code-session-payload-v1',
        assetExecutionMarker: 'claude-code-activation-v1',
      },
    } as const;

    function mapping(
      harness: HarnessId,
      eventMappingId: string,
      deliveryChannel: RuntimeDeliveryChannel,
      deliveryMappingId: string,
      adapterCapabilities: AdapterCapabilities,
    ): VerifiedRuntimeMapping {
      return { ...HARNESS_FACTS[harness], harness, eventMappingId, deliveryChannel, deliveryMappingId, adapterCapabilities };
    }

    const VERIFIED_RUNTIME_MAPPINGS = deepFreeze<readonly VerifiedRuntimeMapping[]>([
      mapping('opencode', 'opencode-session-start-v1', 'opencode-protocol-output', 'opencode-recovery-injection-v1', capabilities({
        enroll_session: 'session.created', recall_guidance: 'experimental.chat.system.transform',
      })),
      mapping('opencode', 'opencode-compaction-v1', 'opencode-protocol-output', 'opencode-compaction-v1', capabilities({
        compact_session: 'experimental.session.compacting',
      })),
      mapping('codex', 'codex-session-start-v1', 'runner-stdout', 'codex-recovery-injection-v1', capabilities({
        enroll_session: 'SessionStart', recall_guidance: 'SessionStartContext',
      })),
      mapping('codex', 'codex-user-prompt-v1', 'runner-stdout', 'codex-user-prompt-injection-v1', capabilities({ capture_root_prompt: 'UserPromptSubmit' })),
          mapping('codex', 'codex-compaction-v1', 'runner-stdout', 'codex-compaction-v1', capabilities({ compact_session: 'PreCompact' })),
      mapping('claude', 'claude-code-session-start-v1', 'runner-stdout', 'claude-code-recovery-injection-v1', capabilities({
        enroll_session: 'SessionStart', recall_guidance: 'SessionStart',
      })),
      mapping('claude', 'claude-code-user-prompt-v1', 'runner-stdout', 'claude-code-user-prompt-injection-v1', capabilities({ capture_root_prompt: 'UserPromptSubmit' })),
          mapping('claude', 'claude-code-compaction-v1', 'runner-stdout', 'claude-code-compaction-v1', capabilities({ compact_session: 'PreCompact' })),
      mapping('claude', 'claude-code-session-end-v1', 'runner-stdout', 'claude-code-session-end-v1', capabilities({ finalize_session: 'SessionEnd' })),
      mapping('claude', 'claude-subagent-stop-passive-v1', 'runner-stdout', 'claude-subagent-stop-passive-v1', capabilities({})),
    ]);

    function unavailable(name: string): ResolvedRuntimeCapability {
      return { state: 'unsupported', reason: 'No verified ' + name + ' mapping is available for this resolved runtime claim.' };
    }

    function runtimeCapabilities(
      mappings: Partial<Record<RuntimeCapabilityName, string>>,
    ): ResolvedRuntimeCapabilities {
      const capability = (name: RuntimeCapabilityName): ResolvedRuntimeCapability => mappings[name]
        ? { state: 'supported', mappingId: mappings[name] }
        : unavailable(name === 'passiveLearning' ? 'passive-learning' : name);
      return {
        activation: capability('activation'), recovery: capability('recovery'), compaction: capability('compaction'),
        passiveLearning: capability('passiveLearning'), terminal: capability('terminal'),
      };
    }

    const RUNTIME_CAPABILITIES_BY_EVENT = deepFreeze<Record<string, ResolvedRuntimeCapabilities>>({
      'opencode-session-start-v1': runtimeCapabilities({ activation: 'opencode-session-start-v1', recovery: 'opencode-recovery-injection-v1' }),
      'opencode-compaction-v1': runtimeCapabilities({ recovery: 'opencode-compaction-v1', compaction: 'opencode-compaction-v1' }),
      'codex-session-start-v1': runtimeCapabilities({ activation: 'codex-session-start-v1', recovery: 'codex-recovery-injection-v1' }),
      'codex-user-prompt-v1': runtimeCapabilities({}),
           'codex-compaction-v1': runtimeCapabilities({ recovery: 'codex-compaction-v1', compaction: 'codex-compaction-v1' }),
      'claude-code-session-start-v1': runtimeCapabilities({ activation: 'claude-code-session-start-v1', recovery: 'claude-code-recovery-injection-v1' }),
      'claude-code-user-prompt-v1': runtimeCapabilities({}),
           'claude-code-compaction-v1': runtimeCapabilities({ recovery: 'claude-code-compaction-v1', compaction: 'claude-code-compaction-v1' }),
      'claude-code-session-end-v1': runtimeCapabilities({ terminal: 'claude-code-session-end-v1' }),
      'claude-subagent-stop-passive-v1': runtimeCapabilities({ passiveLearning: 'claude-subagent-stop-passive-v1' }),
    });

    const CLAIM_KEYS = [
      'hostVersion', 'payloadMappingId', 'assetExecutionMarker', 'eventMappingId', 'deliveryChannel', 'deliveryMappingId',
    ] as const;

    function isRecord(value: unknown): value is Record<string, unknown> {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
    function isBoundedIdentifier(value: unknown): value is string {
      return typeof value === 'string'
        && Array.from(value).length > 0
        && Array.from(value).length <= MAX_RUNTIME_CLAIM_CODE_POINTS
        && /^[a-z0-9][a-z0-9.-]*$/.test(value);
    }
    function isDeliveryChannel(value: unknown): value is RuntimeDeliveryChannel {
      return value === 'opencode-protocol-output' || value === 'runner-stdout';
    }
    function parseClaim(value: unknown): RuntimeCapabilityClaim | undefined {
      if (!isRecord(value) || Object.keys(value).length !== CLAIM_KEYS.length || !CLAIM_KEYS.every((key) => Object.hasOwn(value, key))
        || !isBoundedIdentifier(value.hostVersion) || !isBoundedIdentifier(value.payloadMappingId)
        || !isBoundedIdentifier(value.assetExecutionMarker) || !isBoundedIdentifier(value.eventMappingId)
        || !isDeliveryChannel(value.deliveryChannel) || !isBoundedIdentifier(value.deliveryMappingId)) {
        return undefined;
      }
      return {
        hostVersion: value.hostVersion, payloadMappingId: value.payloadMappingId,
        assetExecutionMarker: value.assetExecutionMarker, eventMappingId: value.eventMappingId,
        deliveryChannel: value.deliveryChannel, deliveryMappingId: value.deliveryMappingId,
      };
    }

    const OPENCODE_UNOBSERVABLE_VERSION_BEHAVIOR_MAPPINGS = [
  { eventMappingId: 'opencode-session-start-v1', deliveryMappingId: 'opencode-recovery-injection-v1', mutableOutputChannel: 'system' },
  { eventMappingId: 'opencode-compaction-v1', deliveryMappingId: 'opencode-compaction-v1', mutableOutputChannel: 'context' },
] as const;

interface OpenCodeBehaviorEvidenceClaim {
  payloadMappingId: string;
  assetExecutionMarker: string;
  eventMappingId: string;
  deliveryChannel: RuntimeDeliveryChannel;
  deliveryMappingId: string;
  mutableOutputChannel: 'system' | 'context';
}

function parseOpenCodeBehaviorEvidenceClaim(value: unknown): OpenCodeBehaviorEvidenceClaim | undefined {
  const keys = ['payloadMappingId', 'assetExecutionMarker', 'eventMappingId', 'deliveryChannel', 'deliveryMappingId', 'behaviorEvidenceMappingId', 'mutableOutputChannel'];
  if (!isRecord(value) || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))
    || value.behaviorEvidenceMappingId !== 'opencode-plugin-init-mutation-v1'
    || !isBoundedIdentifier(value.payloadMappingId) || !isBoundedIdentifier(value.assetExecutionMarker)
    || !isBoundedIdentifier(value.eventMappingId) || !isDeliveryChannel(value.deliveryChannel)
    || !isBoundedIdentifier(value.deliveryMappingId)
    || (value.mutableOutputChannel !== 'system' && value.mutableOutputChannel !== 'context')) return undefined;
  const mapping = OPENCODE_UNOBSERVABLE_VERSION_BEHAVIOR_MAPPINGS.find((candidate) =>
    candidate.eventMappingId === value.eventMappingId && candidate.deliveryMappingId === value.deliveryMappingId
    && candidate.mutableOutputChannel === value.mutableOutputChannel,
  );
  if (!mapping) return undefined;
  return {
    payloadMappingId: value.payloadMappingId,
    assetExecutionMarker: value.assetExecutionMarker,
    eventMappingId: value.eventMappingId,
    deliveryChannel: value.deliveryChannel,
    deliveryMappingId: value.deliveryMappingId,
    mutableOutputChannel: value.mutableOutputChannel,
  };
}


        const NATIVE_BEHAVIOR_EVIDENCE_MAPPINGS = {
          codex: 'codex-command-hook-payload-v1',
          claude: 'claude-code-command-hook-payload-v1',
        } as const;
    
        interface NativeBehaviorEvidenceClaim {
          payloadMappingId: string;
          assetExecutionMarker: string;
          eventMappingId: string;
          deliveryChannel: RuntimeDeliveryChannel;
          deliveryMappingId: string;
          behaviorEvidenceMappingId: string;
        }
    
        function parseNativeBehaviorEvidenceClaim(
          harness: HarnessId,
          value: unknown,
        ): NativeBehaviorEvidenceClaim | undefined {
          if ((harness !== 'codex' && harness !== 'claude') || !isRecord(value)) return undefined;
          const behaviorEvidenceMappingId = value.behaviorEvidenceMappingId;
              const keys = [
            'payloadMappingId', 'assetExecutionMarker', 'eventMappingId',
            'deliveryChannel', 'deliveryMappingId', 'behaviorEvidenceMappingId',
          ];
          if (Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))
            || typeof behaviorEvidenceMappingId !== 'string'
            || behaviorEvidenceMappingId !== NATIVE_BEHAVIOR_EVIDENCE_MAPPINGS[harness]
            || !isBoundedIdentifier(value.payloadMappingId)
            || !isBoundedIdentifier(value.assetExecutionMarker)
            || !isBoundedIdentifier(value.eventMappingId)
            || !isDeliveryChannel(value.deliveryChannel)
            || !isBoundedIdentifier(value.deliveryMappingId)) return undefined;
          return {
            payloadMappingId: value.payloadMappingId,
            assetExecutionMarker: value.assetExecutionMarker,
            eventMappingId: value.eventMappingId,
            deliveryChannel: value.deliveryChannel,
            deliveryMappingId: value.deliveryMappingId,
            behaviorEvidenceMappingId,
          };
        }
    
        export function authorizePrivatePrepareDelivery(
      harness: HarnessId,
      resolution: RuntimeCapabilityResolution,
    ): AuthorizedPrivatePrepareDelivery | undefined {
      const provenance = typeof resolution === 'object' && resolution !== null
        ? ELIGIBLE_RESOLUTION_PROVENANCE.get(resolution)
        : undefined;
      if (harness !== 'opencode' || resolution.status !== 'eligible'
        || !provenance || provenance.harness !== harness
        || !isPrivatePrepareDeliveryAuthorization(provenance.authorization)) {
        return undefined;
      }
      const verified = VERIFIED_RUNTIME_MAPPINGS.find((candidate) => candidate.harness === harness
        && candidate.eventMappingId === resolution.mapping.eventMappingId
        && candidate.deliveryChannel === resolution.mapping.deliveryChannel
        && candidate.deliveryMappingId === resolution.mapping.deliveryMappingId);
      return verified
        ? deepFreeze({
          capabilities: mintAdapterCapabilities(harness, verified.adapterCapabilities),
          authorization: provenance.authorization,
        })
        : undefined;
    }

    export function resolveRuntimeCapabilityEvidence(
      harness: HarnessId,
      value: unknown,
    ): RuntimeCapabilityResolution {
            const behaviorClaim = harness === 'opencode' ? parseOpenCodeBehaviorEvidenceClaim(value) : undefined;
      if (behaviorClaim) {
        const verified = VERIFIED_RUNTIME_MAPPINGS.find((candidate) => candidate.harness === 'opencode'
          && candidate.payloadMappingId === behaviorClaim.payloadMappingId
          && candidate.assetExecutionMarker === behaviorClaim.assetExecutionMarker
          && candidate.eventMappingId === behaviorClaim.eventMappingId
          && candidate.deliveryChannel === behaviorClaim.deliveryChannel
          && candidate.deliveryMappingId === behaviorClaim.deliveryMappingId);
        if (!verified) return { status: 'degraded', reason: 'OpenCode behavior evidence does not match a verified host mapping.' };
        const verifiedRuntimeCapabilities = RUNTIME_CAPABILITIES_BY_EVENT[verified.eventMappingId];
        if (!verifiedRuntimeCapabilities) return { status: 'degraded', reason: 'Runtime capability mapping is not available for verified OpenCode behavior evidence.' };
        const resolution = mintRuntimeCapabilityResolution('opencode', {
          status: 'eligible' as const,
          mapping: deepFreeze({ eventMappingId: verified.eventMappingId, deliveryChannel: verified.deliveryChannel, deliveryMappingId: verified.deliveryMappingId }),
          adapterCapabilities: mintAdapterCapabilities(verified.harness, capabilities({})),
          runtimeCapabilities: deepFreeze(runtimeCapabilities({})),
        });
        ELIGIBLE_RESOLUTION_PROVENANCE.set(resolution, {
          harness: 'opencode',
          authorization: mintPrivatePrepareDeliveryAuthorization(),
        });
        return resolution;
      }
const nativeBehaviorClaim = parseNativeBehaviorEvidenceClaim(harness, value);
          if (nativeBehaviorClaim) {
            const verified = VERIFIED_RUNTIME_MAPPINGS.find((candidate) => candidate.harness === harness
              && candidate.payloadMappingId === nativeBehaviorClaim.payloadMappingId
              && candidate.assetExecutionMarker === nativeBehaviorClaim.assetExecutionMarker
              && candidate.eventMappingId === nativeBehaviorClaim.eventMappingId
              && candidate.deliveryChannel === nativeBehaviorClaim.deliveryChannel
              && candidate.deliveryMappingId === nativeBehaviorClaim.deliveryMappingId);
            if (!verified) return { status: 'degraded', reason: 'Native behavior evidence does not match a verified payload mapping.' };
            const resolvedRuntimeCapabilities = RUNTIME_CAPABILITIES_BY_EVENT[verified.eventMappingId];
            if (!resolvedRuntimeCapabilities) return { status: 'degraded', reason: 'Runtime capability mapping is not available for verified native behavior evidence.' };
            const isVerifiedClaudePassiveLearning = verified.harness === 'claude'
              && verified.eventMappingId === 'claude-subagent-stop-passive-v1';
            return mintRuntimeCapabilityResolution(harness, {
              status: isVerifiedClaudePassiveLearning ? 'supported' as const : 'eligible' as const,
              mapping: deepFreeze({
                eventMappingId: verified.eventMappingId,
                deliveryChannel: verified.deliveryChannel,
                deliveryMappingId: verified.deliveryMappingId,
              }),
              adapterCapabilities: mintAdapterCapabilities(harness, behaviorEligibleCapabilities(verified.adapterCapabilities)),
              runtimeCapabilities: deepFreeze(structuredClone(
                isVerifiedClaudePassiveLearning ? resolvedRuntimeCapabilities : runtimeCapabilities({}),
              )),
            });
          }
    const claim = parseClaim(value);
      if (!claim) return { status: 'degraded', reason: 'Runtime capability evidence is missing, malformed, or contains unsupported claims.' };
      const verified = VERIFIED_RUNTIME_MAPPINGS.find((candidate) => candidate.harness === harness
        && candidate.hostVersion === claim.hostVersion && candidate.payloadMappingId === claim.payloadMappingId
        && candidate.assetExecutionMarker === claim.assetExecutionMarker && candidate.eventMappingId === claim.eventMappingId
        && candidate.deliveryChannel === claim.deliveryChannel && candidate.deliveryMappingId === claim.deliveryMappingId);
      if (!verified) return { status: 'degraded', reason: 'Runtime capability evidence does not match a verified host mapping.' };
      const resolvedRuntimeCapabilities = RUNTIME_CAPABILITIES_BY_EVENT[verified.eventMappingId];
      if (!resolvedRuntimeCapabilities) return { status: 'degraded', reason: 'Runtime capability mapping is not available for the verified event.' };
      return mintRuntimeCapabilityResolution(harness, {
        status: 'supported' as const,
        mapping: deepFreeze({ eventMappingId: verified.eventMappingId, deliveryChannel: verified.deliveryChannel, deliveryMappingId: verified.deliveryMappingId }),
        adapterCapabilities: mintAdapterCapabilities(verified.harness, verified.adapterCapabilities),
        runtimeCapabilities: deepFreeze(structuredClone(resolvedRuntimeCapabilities)),
      });
    }
