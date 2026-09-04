import { rmSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import Database from 'better-sqlite3';

import { MemoryService } from '../../src/memory-core/service.js';

describe('observation review and promotion', () => {
  it('promotes the exact proposed memory only after an attributable terminal acceptance', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:promotion', name: 'promotion' };
    const session = { rootSessionKey: 'root-1', harness: 'codex' as const };
    try {
      const source = service.save({ project, session, eventKey: 'source', evidence: { kind: 'explicit_save', content: 'The user selected SQLite-only persistence.' } });
      const confirmation = service.save({ project, session, eventKey: 'confirmation', evidence: { kind: 'root_prompt', content: 'Persist the SQLite-only architecture decision.' } });
      const candidate = service.submitObservation({
        project, session, eventKey: 'candidate',
        observation: {
          kind: 'decision', scope: 'project', title: 'SQLite-only persistence',
          claim: 'The persistent memory core remains SQLite-only.',
          proposedMemory: {
            kind: 'architecture', title: 'SQLite-only memory core',
            content: 'Keep the persistent memory core SQLite-only.', topicKey: 'storage/sqlite-only', outcome: 'succeeded',
          },
          supportIds: [source.evidence.id], generator: { kind: 'root_agent', name: 'codex' },
        },
      });

      const reviewed = service.reviewObservation({
        project, session, eventKey: 'review',
        review: {
          observationId: candidate.observation.id, verdict: 'accepted', basis: 'root_user_confirmed',
          policy: { id: 'durable-memory', version: '1' }, reason: 'The root user explicitly confirmed the decision.',
          supportIds: [confirmation.evidence.id],
        },
      });
      expect(reviewed).toMatchObject({ duplicate: false, observation: { state: 'accepted' } });
      expect(service.recall({ projectKey: project.key, query: 'SQLite-only' }).items).toEqual([]);

      const promoted = service.promoteObservation({
        project, session, eventKey: 'promotion', observationId: candidate.observation.id,
      });
      expect(promoted).toMatchObject({ duplicate: false, observation: { state: 'promoted' } });
      expect(promoted.memory).toMatchObject({
        title: 'SQLite-only memory core', content: 'Keep the persistent memory core SQLite-only.', topicKey: 'storage/sqlite-only',
      });
      expect(service.promoteObservation({ project, session, eventKey: 'promotion', observationId: candidate.observation.id })).toMatchObject({
        duplicate: true, memory: { id: promoted.memory.id },
      });
      expect(() => service.promoteObservation({
        project, session: { rootSessionKey: 'root-2', harness: 'codex' }, eventKey: 'promotion', observationId: candidate.observation.id,
      })).toThrow(/session identity/i);
      (service as unknown as { database: Database.Database }).database.prepare("UPDATE sessions SET state='degraded' WHERE id=?").run(promoted.sessionId);
      expect(() => service.promoteObservation({ project, session, eventKey: 'promotion', observationId: candidate.observation.id })).toThrow(/verified root identity/i);
      expect(service.recall({ projectKey: project.key, query: 'SQLite-only' }).items[0]?.id).toBe(promoted.memory.id);
    } finally { service.close(); }
  });

  it('enforces rejection as terminal and blocks rejected promotion', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:rejection', name: 'rejection' };
    const session = { rootSessionKey: 'root-1', harness: 'codex' as const };
    try {
      const source = service.save({ project, session, eventKey: 'source', evidence: { kind: 'explicit_save', content: 'Unconfirmed proposed preference.' } });
      const confirmation = service.save({ project, session, eventKey: 'confirmation', evidence: { kind: 'root_prompt', content: 'Reject this proposed preference.' } });
      const candidate = service.submitObservation({ project, session, eventKey: 'candidate', observation: {
        kind: 'preference', scope: 'project', title: 'Proposed preference', claim: 'Always use an unverified preference.',
        proposedMemory: { kind: 'preference', title: 'Preference', content: 'Always use the unverified preference.' },
        supportIds: [source.evidence.id], generator: { kind: 'root_agent', name: 'codex' },
      } });
      const rejected = service.reviewObservation({ project, session, eventKey: 'reject', review: {
        observationId: candidate.observation.id, verdict: 'rejected', basis: 'root_user_confirmed',
        policy: { id: 'durable-memory', version: '1' }, reason: 'The root user rejected it.', supportIds: [confirmation.evidence.id],
      } });
      expect(rejected.observation.state).toBe('rejected');
      expect(() => service.reviewObservation({ project, session, eventKey: 'second-verdict', review: {
        observationId: candidate.observation.id, verdict: 'accepted', basis: 'root_user_confirmed',
        policy: { id: 'durable-memory', version: '1' }, reason: 'Attempt overwrite.', supportIds: [confirmation.evidence.id],
      } })).toThrow(/terminal review/i);
      expect(() => service.promoteObservation({ project, session, eventKey: 'promotion', observationId: candidate.observation.id })).toThrow(/accepted/i);
      expect(service.recall({ projectKey: project.key, query: 'preference' }).items).toEqual([]);
    } finally { service.close(); }
  });

  it('accepts observable validation and independent review only with their exact attributable supports', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:bases', name: 'bases' };
    const reviewer = { rootSessionKey: 'root-reviewer', harness: 'codex' as const };
    const independent = { rootSessionKey: 'root-independent', harness: 'codex' as const };
    const candidateInput = (eventKey: string, claim: string) => {
      const source = service.save({ project, session: reviewer, eventKey: `${eventKey}:source`, evidence: { kind: 'explicit_save' as const, content: claim } });
      return service.submitObservation({ project, session: reviewer, eventKey, observation: {
        kind: 'fact', scope: 'project', title: claim, claim,
        proposedMemory: { kind: 'discovery', title: claim, content: claim }, supportIds: [source.evidence.id], generator: { kind: 'root_agent', name: 'codex' },
      } });
    };
    try {
      const validated = candidateInput('validated', 'The focused test passes.');
      expect(() => service.save({ project, session: reviewer, eventKey: 'private-validation-support', evidence: {
        kind: 'explicit_save', content: 'Vitest passed.', metadata: { observation_validation: { observation_id: validated.observation.id, result: 'passed', method: '<private>secret</private>' } },
      } })).toThrow(/privacy filtering/i);
      const validation = service.save({ project, session: reviewer, eventKey: 'validation-support', evidence: {
        kind: 'explicit_save', content: 'Vitest passed.', metadata: { observation_validation: { observation_id: validated.observation.id, result: 'passed', method: ' vitest <private>secret</private> ' } },
      } });
      expect(validation.evidence.metadata).toEqual({ observation_validation: { observation_id: validated.observation.id, result: 'passed', method: 'vitest' } });
      expect(service.reviewObservation({ project, session: reviewer, eventKey: 'validation-review', review: {
        observationId: validated.observation.id, verdict: 'accepted', basis: 'observable_validation',
        policy: { id: 'validation', version: '1' }, reason: 'Observed passing test.', supportIds: [validation.evidence.id],
      } }).observation.state).toBe('accepted');

      const independentlyReviewed = candidateInput('independent', 'The plan is internally consistent.');
      const attestation = service.save({ project, session: independent, eventKey: 'attestation-support', evidence: {
        kind: 'handoff', content: 'Independent review accepted.', metadata: { observation_review_attestation: {
          observation_id: independentlyReviewed.observation.id, verdict: 'accepted', reviewer: 'oracle', method: 'artifact review',
        } },
      } });
      expect(service.reviewObservation({ project, session: reviewer, eventKey: 'independent-review', review: {
        observationId: independentlyReviewed.observation.id, verdict: 'accepted', basis: 'independent_review',
        policy: { id: 'oracle', version: '1' }, reason: 'Independent Oracle accepted.', supportIds: [attestation.evidence.id],
      } }).observation.state).toBe('accepted');
    } finally { service.close(); }
  });

  it('rolls back the entire promotion when the memory insert fails', () => {
    const path = `${process.cwd()}/.tmp-observation-promotion-${process.pid}-${Date.now()}.sqlite`;
    const service = new MemoryService({ databasePath: path });
    const project = { key: 'repo:atomic-promotion', name: 'atomic-promotion' };
    const session = { rootSessionKey: 'root-1', harness: 'codex' as const };
    let observationId = '';
    try {
      const source = service.save({ project, session, eventKey: 'source', evidence: { kind: 'explicit_save', content: 'Atomic source.' } });
      const confirmation = service.save({ project, session, eventKey: 'confirmation', evidence: { kind: 'root_prompt', content: 'Confirm atomic promotion.' } });
      const candidate = service.submitObservation({ project, session, eventKey: 'candidate', observation: {
        kind: 'fact', scope: 'project', title: 'Atomic promotion', claim: 'Promotion is atomic.',
        proposedMemory: { kind: 'architecture', title: 'Atomic promotion', content: 'Keep promotion atomic.', topicKey: 'atomic/failure' },
        supportIds: [source.evidence.id], generator: { kind: 'root_agent', name: 'codex' },
      } });
      observationId = candidate.observation.id;
      service.reviewObservation({ project, session, eventKey: 'review', review: {
        observationId, verdict: 'accepted', basis: 'root_user_confirmed', policy: { id: 'atomic', version: '1' }, reason: 'Confirmed.', supportIds: [confirmation.evidence.id],
      } });
      const setup = new Database(path);
      setup.exec("CREATE TRIGGER reject_observation_memory BEFORE INSERT ON memories WHEN new.topic_key='atomic/failure' BEGIN SELECT RAISE(ABORT, 'injected promotion failure'); END;");
      setup.close();

      expect(() => service.promoteObservation({ project, session, eventKey: 'promotion', observationId })).toThrow(/injected promotion failure/i);
      expect(service.get({ id: observationId }).record).toMatchObject({ state: 'accepted', promotedMemoryId: null });
      expect(service.recall({ projectKey: project.key, query: 'atomic' }).items).toEqual([]);
    } finally {
      service.close();
      const cleanup = new Database(path);
      cleanup.close();
      rmSync(path, { force: true });
      rmSync(`${path}-shm`, { force: true });
      rmSync(`${path}-wal`, { force: true });
    }
  });
});
