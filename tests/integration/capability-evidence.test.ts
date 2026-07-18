import { describe, expect, it } from 'vitest';

    import * as capabilityAuthority from '../../src/integration/runtime/capability-evidence.js';
    import {
      assertResolverProducedAdapterCapabilities,
      authorizePrivatePrepareDelivery,
      resolveRuntimeCapabilityEvidence,
    } from '../../src/integration/runtime/capability-evidence.js';
    import {
      HOST_EVIDENCE,
      UNKNOWN_HOST_EVIDENCE,
      type CapabilityEvidence,
      type HostEvidence,
      type HostHarness,
    } from '../fixtures/integration/host-evidence.js';

    function runtimeHarness(harness: HostHarness): 'opencode' | 'codex' | 'claude' {
      return harness === 'claude-code' ? 'claude' : harness;
    }

    function claimFor(
      evidence: HostEvidence,
      eventMapping: CapabilityEvidence = evidence.activation,
      deliveryMapping: CapabilityEvidence = evidence.recovery,
    ): Record<string, unknown> {
      return {
        hostVersion: evidence.versionFamily,
        payloadMappingId: evidence.payloadMappingId,
        assetExecutionMarker: evidence.activationMarker,
        eventMappingId: eventMapping.mappingId,
        deliveryChannel: deliveryMapping.channel,
        deliveryMappingId: deliveryMapping.mappingId,
      };
    }

    describe('production runtime capability authority', () => {
      it('returns final authority-produced capability and runtime matrices for bounded fixture claims', () => {
        for (const evidence of HOST_EVIDENCE) {
          const result = resolveRuntimeCapabilityEvidence(runtimeHarness(evidence.harness), claimFor(evidence));
          expect(result).toMatchObject({
            status: 'supported',
            mapping: {
              eventMappingId: evidence.activation.mappingId,
              deliveryChannel: evidence.recovery.channel,
              deliveryMappingId: evidence.recovery.mappingId,
            },
            runtimeCapabilities: {
              activation: { state: 'supported', mappingId: evidence.activation.mappingId },
              recovery: { state: 'supported', mappingId: evidence.recovery.mappingId },
            },
          });
          if (result.status !== 'supported') throw new Error('Expected supported fixture resolution');
          expect(Object.isFrozen(result.adapterCapabilities)).toBe(true);
          expect(Object.isFrozen(result.runtimeCapabilities)).toBe(true);
          expect(Object.isFrozen(result.runtimeCapabilities.activation)).toBe(true);
        }
      });

      it('keeps compaction capability independent from activation and recovery', () => {
        for (const evidence of HOST_EVIDENCE) {
          const result = resolveRuntimeCapabilityEvidence(
            runtimeHarness(evidence.harness),
            claimFor(evidence, evidence.compaction, evidence.compaction),
          );
          expect(result).toMatchObject({
            status: 'supported',
            runtimeCapabilities: {
              activation: { state: 'unsupported' },
              recovery: { state: 'supported', mappingId: evidence.compaction.mappingId },
              compaction: { state: 'supported', mappingId: evidence.compaction.mappingId },
              passiveLearning: { state: 'unsupported' },
              terminal: { state: 'unsupported' },
            },
          });
        }
      });

      it('binds final capability matrices to the resolving harness', () => {
        const claude = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
        if (!claude) throw new Error('Expected Claude evidence');
        const result = resolveRuntimeCapabilityEvidence('claude', claimFor(claude));
        if (result.status !== 'supported') throw new Error('Expected supported Claude resolution');

        expect(() => assertResolverProducedAdapterCapabilities(result.adapterCapabilities, 'claude')).not.toThrow();
        expect(() => assertResolverProducedAdapterCapabilities(result.adapterCapabilities, 'opencode')).toThrow(/opencode/i);
      });

      it('returns distinct deeply frozen matrices and keeps Claude SessionEnd outside native finalization', () => {
        const claude = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
        if (!claude) throw new Error('Expected Claude evidence');
        const first = resolveRuntimeCapabilityEvidence('claude', claimFor(claude));
        const later = resolveRuntimeCapabilityEvidence('claude', claimFor(claude));
        if (first.status !== 'supported' || later.status !== 'supported') {
          throw new Error('Expected supported Claude resolutions');
        }
        expect(first.adapterCapabilities).not.toBe(later.adapterCapabilities);
        expect(first.runtimeCapabilities).not.toBe(later.runtimeCapabilities);
        expect(Object.isFrozen(first.adapterCapabilities)).toBe(true);
        expect(Object.isFrozen(later.runtimeCapabilities)).toBe(true);

        const terminal = resolveRuntimeCapabilityEvidence(
          'claude',
          claimFor(claude, claude.terminal, claude.terminal),
        );
        expect(terminal).toMatchObject({ status: 'degraded' });
        expect(terminal).not.toHaveProperty('adapterCapabilities');
      });

      it('resolves the Claude SubagentStop passive mapping independently from terminal finalization', () => {
        const claude = HOST_EVIDENCE.find((entry) => entry.harness === 'claude-code');
        if (!claude) throw new Error('Expected Claude evidence');

        const result = resolveRuntimeCapabilityEvidence(
          'claude',
          claimFor(claude, claude.passiveLearning, claude.passiveLearning),
        );

        expect(result).toMatchObject({
          status: 'supported',
          mapping: {
            eventMappingId: 'claude-subagent-stop-passive-v1',
            deliveryChannel: 'runner-stdout',
            deliveryMappingId: 'claude-subagent-stop-passive-v1',
          },
          runtimeCapabilities: {
            passiveLearning: { state: 'supported', mappingId: 'claude-subagent-stop-passive-v1' },
            terminal: { state: 'unsupported' },
          },
          adapterCapabilities: { finalize_session: { state: 'unsupported' } },
        });
        if (result.status !== 'supported') throw new Error('Expected supported passive-learning resolution');
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.mapping)).toBe(true);
      });

      it('fails closed for malformed, unknown, overlapping, or self-asserted claims', () => {
        const openCode = HOST_EVIDENCE.find((entry) => entry.harness === 'opencode');
        if (!openCode) throw new Error('Expected OpenCode evidence');
        const valid = claimFor(openCode);
        const cases = [
          undefined,
          { ...valid, hostVersion: UNKNOWN_HOST_EVIDENCE.versionFamily },
          { ...valid, deliveryMappingId: openCode.compaction.mappingId },
          { ...valid, supported: true },
          { ...valid, verifiedEvents: ['session.created'] },
          { ...valid, rawPayload: 'SECRET-RAW-PAYLOAD' },
        ];
        for (const claim of cases) {
          const result = resolveRuntimeCapabilityEvidence('opencode', claim);
          expect(result).toMatchObject({ status: 'degraded' });
          expect(result).not.toHaveProperty('adapterCapabilities');
          expect(JSON.stringify(result)).not.toContain('SECRET-RAW-PAYLOAD');
        }
      });

it('accepts only the explicit OpenCode behavior-evidence mapping when hostVersion is unobservable', () => {
  const openCode = HOST_EVIDENCE.find((entry) => entry.harness === 'opencode');
  if (!openCode) throw new Error('Expected OpenCode evidence');
  const claim = {
    payloadMappingId: openCode.payloadMappingId,
    assetExecutionMarker: openCode.activationMarker,
    eventMappingId: openCode.activation.mappingId,
    deliveryChannel: openCode.recovery.channel,
    deliveryMappingId: openCode.recovery.mappingId,
    behaviorEvidenceMappingId: 'opencode-plugin-init-mutation-v1',
    mutableOutputChannel: 'system',
  };
  const eligible = resolveRuntimeCapabilityEvidence('opencode', claim);
  expect(eligible).toMatchObject({
    status: 'eligible',
    mapping: { eventMappingId: openCode.activation.mappingId, deliveryMappingId: openCode.recovery.mappingId },
  });
  if (eligible.status !== 'eligible') throw new Error('Expected eligible OpenCode behavior evidence');
  expect(Object.values(eligible.adapterCapabilities).every((capability) => capability.state !== 'supported')).toBe(true);
  expect(Object.values(eligible.runtimeCapabilities).every((capability) => capability.state !== 'supported')).toBe(true);
  expect(Object.isFrozen(eligible)).toBe(true);
  const authorized = authorizePrivatePrepareDelivery('opencode', eligible);
  expect(authorized).toBeDefined();
  if (!authorized) throw new Error('Expected resolver-authorized private preparation');
  expect(Object.isFrozen(authorized)).toBe(true);
  expect(Object.isFrozen(authorized.capabilities)).toBe(true);
  expect(authorizePrivatePrepareDelivery('claude', eligible)).toBeUndefined();
  const cloned = structuredClone(eligible);
  expect(authorizePrivatePrepareDelivery('opencode', cloned)).toBeUndefined();
  const forged = {
    ...eligible,
    mapping: { ...eligible.mapping },
    prepareDeliveryAuthorization: authorized.authorization,
  } as typeof eligible;
  expect(authorizePrivatePrepareDelivery('opencode', forged)).toBeUndefined();
  const later = resolveRuntimeCapabilityEvidence('opencode', claim);
  if (later.status !== 'eligible') throw new Error('Expected a second eligible resolution');
  const laterAuthorized = authorizePrivatePrepareDelivery('opencode', later);
  expect(later).not.toBe(eligible);
  expect(Object.isFrozen(later)).toBe(true);
  expect(laterAuthorized).toBeDefined();
  expect(laterAuthorized).not.toBe(authorized);
  expect(resolveRuntimeCapabilityEvidence('codex', claim)).toMatchObject({ status: 'degraded' });
  expect(resolveRuntimeCapabilityEvidence('opencode', { ...claim, behaviorEvidenceMappingId: 'unverified' }))
    .toMatchObject({ status: 'degraded' });
});

it('authorizes exact OpenCode normal side effects without inventing hostVersion', () => {
  expect(capabilityAuthority).toHaveProperty('authorizeOpenCodeNormalEffect');
  const authorizeOpenCodeNormalEffect = (capabilityAuthority as Record<string, unknown>)
    .authorizeOpenCodeNormalEffect as typeof authorizePrivatePrepareDelivery;
  const openCode = HOST_EVIDENCE.find((entry) => entry.harness === 'opencode');
  if (!openCode) throw new Error('Expected OpenCode evidence');
  const claims = [
    {
      eventMappingId: 'opencode-session-created-v1',
      deliveryMappingId: 'opencode-session-side-effect-v1',
      expectedCapability: 'enroll_session',
    },
    {
      eventMappingId: 'opencode-user-prompt-v1',
      deliveryMappingId: 'opencode-user-prompt-side-effect-v1',
      expectedCapability: 'capture_root_prompt',
    },
  ] as const;

  for (const candidate of claims) {
    const claim = {
      payloadMappingId: openCode.payloadMappingId,
      assetExecutionMarker: openCode.activationMarker,
      eventMappingId: candidate.eventMappingId,
      deliveryChannel: 'none',
      deliveryMappingId: candidate.deliveryMappingId,
      behaviorEvidenceMappingId: 'opencode-plugin-init-side-effect-v1',
    };
    const eligible = resolveRuntimeCapabilityEvidence('opencode', claim);
    expect(eligible).toMatchObject({
      status: 'eligible',
      mapping: {
        eventMappingId: candidate.eventMappingId,
        deliveryChannel: 'none',
        deliveryMappingId: candidate.deliveryMappingId,
      },
    });
    if (eligible.status !== 'eligible') throw new Error('Expected eligible OpenCode side effect');
    const authorized = authorizeOpenCodeNormalEffect('opencode', eligible);
    expect(authorized?.capabilities[candidate.expectedCapability]).toMatchObject({ state: 'supported' });
    expect(authorizePrivatePrepareDelivery('opencode', eligible)).toBeUndefined();
    expect(authorizeOpenCodeNormalEffect('claude', eligible)).toBeUndefined();
    expect(authorizeOpenCodeNormalEffect('opencode', structuredClone(eligible))).toBeUndefined();
  }
});
    });
