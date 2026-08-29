import { describe, expect, it } from 'vitest';

import {
  EVENT_ACTOR_VALUES,
  EVENT_AUTHORITY_VALUES,
  EVIDENCE_KIND_VALUES,
  MEMORY_PROTOCOL_VERSION,
  OBSERVATION_GENERATOR_KIND_VALUES,
  OBSERVATION_KIND_VALUES,
  OBSERVATION_REVIEW_BASIS_VALUES,
  OBSERVATION_REVIEW_VERDICT_VALUES,
  OBSERVATION_SCOPE_VALUES,
  OBSERVATION_STATE_VALUES,
  OBSERVATION_SUPPORT_RELATION_VALUES,
  requireObservationSupportMetadata,
  PRIVACY_CLASS_VALUES,
  RETENTION_CLASS_VALUES,
  SESSION_SUMMARY_CLAIM_KIND_VALUES,
  SESSION_SUMMARY_GENERATOR_KIND_VALUES,
  SESSION_SUMMARY_KIND_VALUES,
  SESSION_SUMMARY_LIMITS,
  SESSION_SUMMARY_STATUS_VALUES,
  SESSION_SUMMARY_SUPPORT_RELATION_VALUES,
  type ContextItem,
  type LifecycleInput,
  type SessionEventRecord,
  type SessionSummaryRecord,
} from '../../src/memory-core/contracts.js';

describe('memory protocol contracts', () => {
  it('publishes the coordinated protocol revision and closed event taxonomies', () => {
    expect(MEMORY_PROTOCOL_VERSION).toBe(3);
    expect(EVIDENCE_KIND_VALUES).toEqual([
      'root_prompt', 'explicit_save', 'checkpoint', 'handoff',
      'legacy_prompt', 'legacy_observation', 'session_summary',
      'observation', 'observation_review', 'observation_promotion',
    ]);
    expect(EVENT_ACTOR_VALUES).toEqual(['user', 'system', 'agent', 'tool']);
    expect(EVENT_AUTHORITY_VALUES).toEqual(['root_user', 'harness', 'agent', 'tool', 'untrusted_external']);
    expect(RETENTION_CLASS_VALUES).toEqual(['project', 'session', 'ephemeral', 'external_reference']);
    expect(PRIVACY_CLASS_VALUES).toEqual(['standard', 'sensitive', 'restricted']);
  });

  it('publishes exact summary taxonomies and bounded submission limits', () => {
    expect(SESSION_SUMMARY_KIND_VALUES).toEqual(['checkpoint', 'final']);
    expect(SESSION_SUMMARY_STATUS_VALUES).toEqual(['current', 'superseded']);
    expect(SESSION_SUMMARY_GENERATOR_KIND_VALUES).toEqual(['root_agent', 'harness', 'model']);
    expect(SESSION_SUMMARY_CLAIM_KIND_VALUES).toEqual([
      'objective', 'completed', 'decision', 'changed_surface',
      'verification', 'pending', 'blocker', 'next_action',
    ]);
    expect(SESSION_SUMMARY_SUPPORT_RELATION_VALUES).toEqual(['supports']);
    expect(SESSION_SUMMARY_LIMITS).toEqual({
      minClaims: 1,
      maxClaims: 32,
      maxClaimCodePoints: 2_000,
      minSupportsPerClaim: 1,
      maxSupportsPerClaim: 16,
      maxCanonicalUtf16Units: 20_000,
    });
  });

  it('publishes the closed observation promotion taxonomies', () => {
    expect(OBSERVATION_KIND_VALUES).toEqual([
      'decision', 'constraint', 'fact', 'procedure', 'result', 'failure', 'preference',
    ]);
    expect(OBSERVATION_SCOPE_VALUES).toEqual(['session', 'project']);
    expect(OBSERVATION_STATE_VALUES).toEqual(['pending', 'accepted', 'rejected', 'promoted']);
    expect(OBSERVATION_REVIEW_VERDICT_VALUES).toEqual(['accepted', 'rejected']);
    expect(OBSERVATION_REVIEW_BASIS_VALUES).toEqual([
      'root_user_confirmed', 'observable_validation', 'independent_review',
    ]);
    expect(OBSERVATION_SUPPORT_RELATION_VALUES).toEqual(['supports']);
    expect(OBSERVATION_GENERATOR_KIND_VALUES).toEqual(['root_agent', 'harness', 'model']);
  });

  it('accepts only exact bounded structured observation support metadata', () => {
    expect(requireObservationSupportMetadata('explicit_save', {
      observation_validation: { observation_id: ' observation-1 ', result: 'passed', method: ' vitest ' },
    })).toEqual({
      observation_validation: { observation_id: 'observation-1', result: 'passed', method: 'vitest' },
    });
    expect(requireObservationSupportMetadata('handoff', {
      observation_review_attestation: {
        observation_id: 'observation-1', verdict: 'accepted', reviewer: 'oracle-1', method: 'artifact review',
      },
    })).toEqual({
      observation_review_attestation: {
        observation_id: 'observation-1', verdict: 'accepted', reviewer: 'oracle-1', method: 'artifact review',
      },
    });
    expect(() => requireObservationSupportMetadata('explicit_save', {
      observation_validation: { observation_id: 'observation-1', result: 'passed', method: 'vitest', authority: 'root_user' },
    })).toThrow(/exact keys/i);
    expect(() => requireObservationSupportMetadata('handoff', {
      observation_validation: { observation_id: 'observation-1', result: 'passed', method: 'vitest' },
    })).toThrow(/observation_review_attestation/i);
    expect(() => requireObservationSupportMetadata('checkpoint', {})).toThrow(/does not support observation metadata/i);
  });

  it('supports discriminated event, summary, and context records', () => {
    const event: SessionEventRecord = {
      evidenceId: 'evidence-1', sessionId: 'session-1', sequence: 1,
      actor: 'agent', authority: 'root_user', retentionClass: 'project', privacyClass: 'standard',
    };
    const summary: SessionSummaryRecord = {
      recordType: 'summary', id: 'summary-1', projectId: 'project-1', sessionId: 'session-1',
      submissionEvidenceId: 'evidence-2', kind: 'checkpoint', version: 1, status: 'current',
      coverage: { fromSequence: 1, toSequence: 1 },
      generator: { kind: 'root_agent', name: 'codex' }, supersedesId: null,
      createdAt: '2026-08-27T00:00:00.000Z',
      claims: [{ id: 'claim-1', ordinal: 0, kind: 'objective', content: 'Ship it', outcome: null, supportIds: ['evidence-1'] }],
    };
    const item: ContextItem = {
      recordType: 'summary', id: summary.id, kind: summary.kind, version: summary.version,
      coverage: summary.coverage, snippet: summary.claims[0]!.content, status: 'current', score: 1,
    };
    expect(event.sequence).toBe(1);
    expect(summary.recordType).toBe('summary');
    expect(item.recordType).toBe('summary');
  });

  it('allows structured summaries only through the lifecycle envelope', () => {
    const input: LifecycleInput = {
      operation: 'checkpoint_pre_compact', harness: 'codex',
      project: { key: 'thoth-mem', name: 'thoth-mem' }, rootSessionKey: 'root-1', eventKey: 'event-1',
      summary: {
        kind: 'checkpoint', coverage: { fromSequence: 1, toSequence: 2 },
        generator: { kind: 'root_agent', name: 'codex' },
        claims: [{ kind: 'next_action', content: 'Continue', supportIds: ['evidence-1'] }],
      },
    };
    expect(input.summary?.kind).toBe('checkpoint');
  });
});
