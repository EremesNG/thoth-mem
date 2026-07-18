export const HOSTS = ['opencode', 'codex', 'claude-code'] as const;

    export type HostHarness = (typeof HOSTS)[number];
    export type EvidenceStatus = 'supported' | 'degraded' | 'unsupported';
    export type EvidenceChannel = 'opencode-protocol-output' | 'runner-stdout' | 'none';

    export interface CapabilityEvidence {
      status: EvidenceStatus;
      channel: EvidenceChannel;
      mappingId: string;
      evidenceKey: string;
      safeRecoveryAction: string;
    }

    export interface HostEvidence {
      harness: HostHarness;
      versionFamily: string;
      payloadMappingId: string;
      activationMarker: string;
      activation: CapabilityEvidence;
      recovery: CapabilityEvidence;
      compaction: CapabilityEvidence;
      passiveLearning: CapabilityEvidence;
      terminal: CapabilityEvidence;
    }

    function supportedCapability(
      channel: Exclude<EvidenceChannel, 'none'>,
      mappingId: string,
      evidenceKey: string,
    ): CapabilityEvidence {
      return {
        status: 'supported',
        channel,
        mappingId,
        evidenceKey,
        safeRecoveryAction: 'continue-verified-lifecycle',
      };
    }

    function unavailableCapability(
      status: Exclude<EvidenceStatus, 'supported'>,
      mappingId: string,
      evidenceKey: string,
    ): CapabilityEvidence {
      return {
        status,
        channel: 'none',
        mappingId,
        evidenceKey,
        safeRecoveryAction: 'inspect-supported-host-mapping',
      };
    }

    export const HOST_EVIDENCE: readonly HostEvidence[] = [
      {
        harness: 'opencode',
        versionFamily: 'opencode-1.x',
        payloadMappingId: 'opencode-session-payload-v1',
        activationMarker: 'opencode-activation-v1',
        activation: supportedCapability(
          'opencode-protocol-output',
          'opencode-session-start-v1',
          'activation:opencode:session-start',
        ),
        recovery: supportedCapability(
          'opencode-protocol-output',
          'opencode-recovery-injection-v1',
          'recovery:opencode:session-start',
        ),
        compaction: supportedCapability(
          'opencode-protocol-output',
          'opencode-compaction-v1',
          'compaction:opencode:session-compact',
        ),
        passiveLearning: unavailableCapability(
          'unsupported',
          'opencode-no-passive-learning-v1',
          'passive-learning:opencode:unavailable',
        ),
        terminal: unavailableCapability(
          'unsupported',
          'opencode-no-terminal-v1',
          'terminal:opencode:unavailable',
        ),
      },
      {
        harness: 'codex',
        versionFamily: 'codex-0.144.x',
        payloadMappingId: 'codex-session-payload-v1',
        activationMarker: 'codex-activation-v1',
        activation: supportedCapability(
          'runner-stdout',
          'codex-session-start-v1',
          'activation:codex:session-start',
        ),
        recovery: supportedCapability(
          'runner-stdout',
          'codex-recovery-injection-v1',
          'recovery:codex:session-start',
        ),
        compaction: supportedCapability(
          'runner-stdout',
          'codex-compaction-v1',
          'compaction:codex:session-compact',
        ),
        passiveLearning: unavailableCapability(
          'unsupported',
          'codex-no-passive-learning-v1',
          'passive-learning:codex:unavailable',
        ),
        terminal: unavailableCapability(
          'degraded',
          'codex-stop-not-terminal-v1',
          'terminal:codex:per-turn-stop',
        ),
      },
      {
        harness: 'claude-code',
        versionFamily: 'claude-code-1.x',
        payloadMappingId: 'claude-code-session-payload-v1',
        activationMarker: 'claude-code-activation-v1',
        activation: supportedCapability(
          'runner-stdout',
          'claude-code-session-start-v1',
          'activation:claude-code:session-start',
        ),
        recovery: supportedCapability(
          'runner-stdout',
          'claude-code-recovery-injection-v1',
          'recovery:claude-code:session-start',
        ),
        compaction: supportedCapability(
          'runner-stdout',
          'claude-code-compaction-v1',
          'compaction:claude-code:session-compact',
        ),
        passiveLearning: supportedCapability(
          'runner-stdout',
          'claude-subagent-stop-passive-v1',
          'passive-learning:claude-code:subagent-stop',
        ),
        terminal: unavailableCapability(
          'unsupported',
          'claude-code-semantic-summary-v1',
          'terminal:claude-code:semantic-agent-owned',
        ),
      },
    ];

    export const UNKNOWN_HOST_EVIDENCE = {
      harness: 'unknown',
      versionFamily: 'unknown',
      payloadMappingId: 'unverified',
      activationMarker: 'unverified',
      activation: unavailableCapability('unsupported', 'unverified', 'activation:unknown:unverified'),
      recovery: unavailableCapability('unsupported', 'unverified', 'recovery:unknown:unverified'),
      compaction: unavailableCapability('unsupported', 'unverified', 'compaction:unknown:unverified'),
      passiveLearning: unavailableCapability('unsupported', 'unverified', 'passive-learning:unknown:unverified'),
      terminal: unavailableCapability('unsupported', 'unverified', 'terminal:unknown:unverified'),
    } as const;
