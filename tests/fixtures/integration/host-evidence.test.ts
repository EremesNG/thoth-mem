import { describe, expect, it } from 'vitest';

    import {
      HOST_EVIDENCE,
      UNKNOWN_HOST_EVIDENCE,
    } from './host-evidence.js';

    const CAPABILITY_NAMES = ['activation', 'recovery', 'compaction', 'passiveLearning', 'terminal'] as const;

    describe('host evidence fixture', () => {
      it('maps bounded verified version and payload identifiers for every supported harness', () => {
        expect(HOST_EVIDENCE.map((evidence) => evidence.harness)).toEqual([
          'opencode',
          'codex',
          'claude-code',
        ]);

        for (const evidence of HOST_EVIDENCE) {
          expect(evidence.versionFamily).toMatch(/^[a-z0-9][a-z0-9.-]{0,63}$/);
          expect(evidence.payloadMappingId).toMatch(/^[a-z0-9][a-z0-9.-]{0,63}$/);
          expect(evidence.activationMarker).toMatch(/^[a-z0-9][a-z0-9.-]{0,63}$/);
          expect(evidence.activation.status).toBe('supported');
          expect(evidence.activation.channel).not.toBe('none');
        }
      });

      it('records bounded activation, recovery, compaction, and terminal classifications', () => {
        for (const evidence of HOST_EVIDENCE) {
          for (const capabilityName of CAPABILITY_NAMES) {
            const capability = evidence[capabilityName];
            expect(capability.evidenceKey).toMatch(/^[a-z0-9][a-z0-9:.-]{0,95}$/);
            expect(capability.mappingId).toMatch(/^[a-z0-9][a-z0-9.-]{0,63}$/);
            expect(capability.safeRecoveryAction).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
            expect(capability.status === 'supported' ? capability.channel !== 'none' : capability.channel === 'none').toBe(true);
          }
        }

        expect(HOST_EVIDENCE.find((evidence) => evidence.harness === 'opencode')?.passiveLearning.status).toBe('unsupported');
        expect(HOST_EVIDENCE.find((evidence) => evidence.harness === 'codex')?.passiveLearning.status).toBe('unsupported');
        expect(HOST_EVIDENCE.find((evidence) => evidence.harness === 'claude-code')?.passiveLearning).toMatchObject({
          status: 'supported',
          mappingId: 'claude-subagent-stop-passive-v1',
        });
        expect(HOST_EVIDENCE.find((evidence) => evidence.harness === 'opencode')?.terminal.status).toBe('unsupported');
        expect(HOST_EVIDENCE.find((evidence) => evidence.harness === 'codex')?.terminal.status).toBe('degraded');
        expect(HOST_EVIDENCE.find((evidence) => evidence.harness === 'claude-code')?.terminal.status).toBe('supported');
      });

      it('fails closed when the host version or payload mapping is unknown', () => {
        expect(UNKNOWN_HOST_EVIDENCE.harness).toBe('unknown');
        expect(UNKNOWN_HOST_EVIDENCE.versionFamily).toBe('unknown');
        expect(UNKNOWN_HOST_EVIDENCE.payloadMappingId).toBe('unverified');

        for (const capabilityName of CAPABILITY_NAMES) {
          const capability = UNKNOWN_HOST_EVIDENCE[capabilityName];
          expect(['degraded', 'unsupported']).toContain(capability.status);
          expect(capability.channel).toBe('none');
          expect(capability.safeRecoveryAction).toBe('inspect-supported-host-mapping');
        }
      });

      it('retains identifiers and evidence markers without raw payloads or secrets', () => {
        const serialized = JSON.stringify({ HOST_EVIDENCE, UNKNOWN_HOST_EVIDENCE });

        expect(serialized).not.toMatch(/raw[-_ ]?payload/i);
        expect(serialized).not.toMatch(/authorization|api[-_ ]?key|bearer/i);
        expect(Object.keys(HOST_EVIDENCE[0])).not.toContain('rawPayload');
        expect(Object.keys(HOST_EVIDENCE[0])).not.toContain('secret');
      });
    });
