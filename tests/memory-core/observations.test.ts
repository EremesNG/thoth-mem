import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { observationFromId, rebuildObservationProjection } from '../../src/memory-core/observations.js';
import { MemoryService } from '../../src/memory-core/service.js';

describe('observation candidates', () => {
  it('submits one supported project candidate idempotently without making it recallable', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:observations', name: 'observations' };
    try {
      const support = service.save({
        project,
        evidence: { kind: 'explicit_save', content: 'The repository uses strict TypeScript.' },
      });
      const input = {
        project,
        eventKey: 'observation:strict-typescript',
        observation: {
          kind: 'constraint' as const,
          scope: 'project' as const,
          title: 'Keep strict TypeScript',
          claim: 'The repository requires strict TypeScript without suppression directives.',
          proposedMemory: {
            kind: 'convention' as const,
            title: 'Strict TypeScript',
            content: 'Keep TypeScript strict and do not suppress type errors.',
            topicKey: 'typescript/strict',
            outcome: 'succeeded' as const,
          },
          supportIds: [support.evidence.id],
          generator: { kind: 'root_agent' as const, name: 'codex' },
          concepts: ['TypeScript'],
          files: ['tsconfig.json'],
        },
      };

      const created = service.submitObservation(input);
      const duplicate = service.submitObservation(input);

      expect(created).toMatchObject({ duplicate: false, observation: { state: 'pending', scope: 'project' } });
      expect(duplicate).toMatchObject({ duplicate: true, observation: { id: created.observation.id } });
      expect(service.listObservations({ projectKey: project.key })).toMatchObject({
        items: [{ id: created.observation.id, state: 'pending', supportCount: 1 }],
      });
      expect(service.get({ id: created.observation.id }).record).toMatchObject({
        recordType: 'observation', claim: input.observation.claim, supportIds: [support.evidence.id],
      });
      expect(service.recall({ projectKey: project.key, query: 'strict TypeScript' }).items).toEqual([]);
    } finally { service.close(); }
  });

  it('rejects structured review support evidence unless it references an existing same-project candidate', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      expect(() => service.save({
        project: { key: 'repo:observations', name: 'observations' },
        session: { rootSessionKey: 'root-1', harness: 'codex' },
        eventKey: 'invalid-validation-support',
        evidence: {
          kind: 'explicit_save', content: 'Validation passed.',
          metadata: { observation_validation: { observation_id: 'missing-observation', result: 'passed', method: 'vitest' } },
        },
      })).toThrow(/existing same-project observation/i);
      expect(service.listProjects()).toEqual([]);
    } finally { service.close(); }
  });

  it('partitions a non-branching correction lineage into current leaves and history', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:lineage', name: 'lineage' };
    try {
      const support = service.save({ project, evidence: { kind: 'explicit_save', content: 'Supported correction source.' } });
      const base = service.submitObservation({
        project, eventKey: 'base', observation: {
          kind: 'fact', scope: 'project', title: 'Runtime version', claim: 'The runtime is version 22.',
          proposedMemory: { kind: 'discovery', title: 'Runtime version', content: 'Use runtime version 22.', topicKey: 'runtime/version' },
          supportIds: [support.evidence.id], generator: { kind: 'root_agent', name: 'codex' },
        },
      });
      const correction = service.submitObservation({
        project, eventKey: 'correction', observation: {
          kind: 'fact', scope: 'project', title: 'Runtime version', claim: 'The runtime is version 24.',
          proposedMemory: { kind: 'discovery', title: 'Runtime version', content: 'Use runtime version 24.', topicKey: 'runtime/version' },
          supportIds: [support.evidence.id], generator: { kind: 'root_agent', name: 'codex' }, predecessorId: base.observation.id,
        },
      });

      expect(service.listObservations({ projectKey: project.key, temporal: 'current' }).items.map((item) => item.id)).toEqual([correction.observation.id]);
      expect(service.listObservations({ projectKey: project.key, temporal: 'history' }).items.map((item) => item.id)).toEqual([base.observation.id]);
      expect(() => service.submitObservation({
        project, eventKey: 'branch', observation: {
          kind: 'fact', scope: 'project', title: 'Runtime version', claim: 'The runtime is version 25.',
          proposedMemory: { kind: 'discovery', title: 'Runtime version', content: 'Use runtime version 25.', topicKey: 'runtime/version' },
          supportIds: [support.evidence.id], generator: { kind: 'root_agent', name: 'codex' }, predecessorId: base.observation.id,
        },
      })).toThrow(/unique|successor|predecessor/i);
      expect(service.listObservations({ projectKey: project.key, temporal: 'current' }).items).toHaveLength(1);
    } finally { service.close(); }
  });

  it('rebuilds candidates, terminal reviews, and promotion mappings from canonical evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-observation-rebuild-'));
    const path = join(root, 'memory.sqlite');
    const project = { key: 'repo:rebuild', name: 'rebuild' };
    const session = { rootSessionKey: 'root-1', harness: 'codex' as const };
    let observationId = '';
    let memoryId = '';
    const service = new MemoryService({ databasePath: path });
    try {
      const source = service.save({ project, session, eventKey: 'source', evidence: { kind: 'explicit_save', content: 'Rebuild source.' } });
      const confirmation = service.save({ project, session, eventKey: 'confirmation', evidence: { kind: 'root_prompt', content: 'Confirm rebuild candidate.' } });
      const candidate = service.submitObservation({ project, session, eventKey: 'candidate', observation: {
        kind: 'fact', scope: 'project', title: 'Rebuild fact', claim: 'Observation projections are rebuildable.',
        proposedMemory: { kind: 'architecture', title: 'Rebuild observations', content: 'Rebuild observations from immutable evidence.', topicKey: 'observations/rebuild' },
        supportIds: [source.evidence.id], generator: { kind: 'root_agent', name: 'codex' },
      } });
      service.reviewObservation({ project, session, eventKey: 'review', review: {
        observationId: candidate.observation.id, verdict: 'accepted', basis: 'root_user_confirmed', policy: { id: 'rebuild', version: '1' },
        reason: 'Confirmed.', supportIds: [confirmation.evidence.id],
      } });
      const promoted = service.promoteObservation({ project, session, eventKey: 'promotion', observationId: candidate.observation.id });
      observationId = candidate.observation.id;
      memoryId = promoted.memory.id;
    } finally { service.close(); }

    const database = new Database(path);
    try {
      const beforeFts = database.prepare('SELECT memory_id,title,content FROM memory_fts ORDER BY memory_id').all();
      expect(rebuildObservationProjection(database)).toEqual({ candidates: 1, reviews: 1, promotions: 1, supports: 1, reviewSupports: 1 });
      expect(observationFromId(database, observationId)).toMatchObject({ state: 'promoted', promotedMemoryId: memoryId });
      expect(database.prepare('SELECT memory_id,title,content FROM memory_fts ORDER BY memory_id').all()).toEqual(beforeFts);
      expect(database.pragma('foreign_key_check')).toEqual([]);
    } finally {
      database.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed for cross-session supports, privacy-only claims, and replay drift', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:invalid-candidates', name: 'invalid-candidates' };
    const rootOne = { rootSessionKey: 'root-1', harness: 'codex' as const };
    const rootTwo = { rootSessionKey: 'root-2', harness: 'codex' as const };
    try {
      const one = service.save({ project, session: rootOne, eventKey: 'one', evidence: { kind: 'explicit_save', content: 'Root one support.' } });
      const two = service.save({ project, session: rootTwo, eventKey: 'two', evidence: { kind: 'explicit_save', content: 'Root two support.' } });
      expect(() => service.submitObservation({ project, session: rootOne, eventKey: 'cross-session', observation: {
        kind: 'fact', scope: 'session', title: 'Cross-session', claim: 'Invalid cross-session claim.', coverage: { fromSequence: 1, toSequence: 1 },
        proposedMemory: { kind: 'discovery', title: 'Cross-session', content: 'Invalid.' }, supportIds: [two.evidence.id], generator: { kind: 'root_agent', name: 'codex' },
      } })).toThrow(/covered event range/i);
      expect(() => service.submitObservation({ project, eventKey: 'private-only', observation: {
        kind: 'fact', scope: 'project', title: 'Private', claim: '<private>secret claim</private>',
        proposedMemory: { kind: 'discovery', title: 'Private', content: 'Visible proposed memory.' }, supportIds: [one.evidence.id], generator: { kind: 'root_agent', name: 'codex' },
      } })).toThrow(/privacy filtering/i);
      expect(() => service.submitObservation({ project, eventKey: 'implicit-supersession', observation: {
        kind: 'fact', scope: 'project', title: 'Supersession', claim: 'Candidates cannot request an implicit memory supersession.',
        proposedMemory: { kind: 'discovery', title: 'Supersession', content: 'Invalid.', supersedesId: 'memory:old' } as never,
        supportIds: [one.evidence.id], generator: { kind: 'root_agent', name: 'codex' },
      } })).toThrow(/unknown field.*supersedesId/i);
      const validInput = { project, session: rootOne, eventKey: 'stable', observation: {
        kind: 'fact' as const, scope: 'session' as const, title: 'Stable', claim: 'Stable claim.', coverage: { fromSequence: 1, toSequence: 1 },
        proposedMemory: { kind: 'discovery' as const, title: 'Stable', content: 'Stable claim.' }, supportIds: [one.evidence.id], generator: { kind: 'root_agent' as const, name: 'codex' },
      } };
      service.submitObservation(validInput);
      expect(() => service.submitObservation({ ...validInput, observation: { ...validInput.observation, claim: 'Drifted claim.' } })).toThrow(/different payload/i);
      expect(service.listObservations({ projectKey: project.key }).items).toHaveLength(1);
    } finally { service.close(); }
  });
});
