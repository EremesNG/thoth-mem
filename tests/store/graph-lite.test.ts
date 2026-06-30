import { describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';

function deleteKgTriples(store: Store) {
  store.getDb().prepare("DELETE FROM kg_triples WHERE source_type = 'observation'").run();
}

describe('Store graph-lite facts', () => {
  it('derives facts from structured observation content and metadata', () => {
    const store = new Store(':memory:');

    try {
      const saved = store.saveObservation({
        title: 'JWT auth middleware',
        type: 'decision',
        project: 'auth-project',
        topic_key: 'architecture/auth-model',
        content: [
          '**What**: Implemented JWT middleware',
          '**Why**: Routes need authenticated access',
          '**Where**: src/auth/middleware.ts',
          '**Learned**: Keep token parsing isolated',
        ].join('\n'),
      }).observation;

      const facts = store.getObservationFacts({ observation_id: saved.id });

      expect(facts.map((fact) => [fact.subject, fact.relation, fact.object])).toEqual([
        ['JWT auth middleware', 'HAS_TYPE', 'decision'],
        ['JWT auth middleware', 'IN_PROJECT', 'auth-project'],
        ['JWT auth middleware', 'HAS_TOPIC_KEY', 'architecture/auth-model'],
        ['JWT auth middleware', 'HAS_WHAT', 'Implemented JWT middleware'],
        ['JWT auth middleware', 'HAS_WHY', 'Routes need authenticated access'],
        ['JWT auth middleware', 'HAS_WHERE', 'src/auth/middleware.ts'],
        ['JWT auth middleware', 'HAS_LEARNED', 'Keep token parsing isolated'],
      ]);
    } finally {
      store.close();
    }
  });

  it('derives facts from plain structured observation labels', () => {
    const store = new Store(':memory:');

    try {
      const saved = store.saveObservation({
        title: 'Plain structured memory',
        type: 'learning',
        project: 'plain-project',
        content: [
          'What: Plain labels create graph facts',
          'Why: Agents may save non-bold structured content',
          'Where: src/store/index.ts',
          'Learned: Support both structured formats',
        ].join('\n'),
      }).observation;

      const facts = store.getObservationFacts({ observation_id: saved.id });

      expect(facts.map((fact) => [fact.subject, fact.relation, fact.object])).toEqual([
        ['Plain structured memory', 'HAS_TYPE', 'learning'],
        ['Plain structured memory', 'IN_PROJECT', 'plain-project'],
        ['Plain structured memory', 'HAS_WHAT', 'Plain labels create graph facts'],
        ['Plain structured memory', 'HAS_WHY', 'Agents may save non-bold structured content'],
        ['Plain structured memory', 'HAS_WHERE', 'src/store/index.ts'],
        ['Plain structured memory', 'HAS_LEARNED', 'Support both structured formats'],
      ]);
    } finally {
      store.close();
    }
  });

  it('filters facts by project and topic key', () => {
    const store = new Store(':memory:');

    try {
      store.saveObservation({
        title: 'Auth topic',
        content: '**What**: Auth content',
        project: 'auth-project',
        topic_key: 'architecture/auth-model',
      });
      store.saveObservation({
        title: 'Cache topic',
        content: '**What**: Cache content',
        project: 'cache-project',
        topic_key: 'architecture/cache-model',
      });

      const facts = store.getObservationFacts({
        project: 'auth-project',
        topic_key: 'architecture/auth-model',
      });

      expect(facts.length).toBeGreaterThan(0);
      expect(facts.every((fact) => fact.project === 'auth-project')).toBe(true);
      expect(facts.every((fact) => fact.topic_key === 'architecture/auth-model')).toBe(true);
      expect(facts.some((fact) => fact.object === 'Auth content')).toBe(true);
      expect(facts.some((fact) => fact.object === 'Cache content')).toBe(false);
    } finally {
      store.close();
    }
  });

  it('replaces derived facts when a topic-key observation is upserted', () => {
    const store = new Store(':memory:');

    try {
      const first = store.saveObservation({
        title: 'Auth topic',
        content: '**What**: Old auth content',
        project: 'auth-project',
        topic_key: 'architecture/auth-model',
      }).observation;

      const second = store.saveObservation({
        title: 'Auth topic v2',
        content: '**What**: New auth content',
        project: 'auth-project',
        topic_key: 'architecture/auth-model',
      }).observation;

      expect(second.id).toBe(first.id);

      const facts = store.getObservationFacts({ observation_id: first.id });

      expect(facts.some((fact) => fact.object === 'New auth content')).toBe(true);
      expect(facts.some((fact) => fact.object === 'Old auth content')).toBe(false);
      expect(facts.some((fact) => fact.subject === 'Auth topic v2')).toBe(true);
    } finally {
      store.close();
    }
  });

  it('excludes facts for soft-deleted observations', () => {
    const store = new Store(':memory:');

    try {
      const saved = store.saveObservation({
        title: 'Delete graph fact target',
        content: '**What**: Delete graph fact content',
        project: 'delete-project',
      }).observation;

      expect(store.getObservationFacts({ observation_id: saved.id })).not.toHaveLength(0);
      expect(store.deleteObservation(saved.id)).toBe(true);
      expect(store.getObservationFacts({ observation_id: saved.id })).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  it('rebuilds derived facts for existing observations in one project', () => {
    const store = new Store(':memory:');

    try {
      const saved = store.saveObservation({
        title: 'Backfill auth memory',
        type: 'decision',
        project: 'auth-project',
        topic_key: 'architecture/auth-model',
        content: [
          '**What**: Backfill auth graph facts',
          '**Why**: Existing memories predate graph-lite',
          '**Where**: src/auth/index.ts',
        ].join('\n'),
      }).observation;

      deleteKgTriples(store);
      expect(store.getObservationFacts({ project: 'auth-project' }).map((fact) => fact.relation)).toEqual([
        'HAS_TYPE',
        'IN_PROJECT',
        'HAS_TOPIC_KEY',
      ]);

      const result = store.rebuildObservationFacts({ project: 'auth-project' });
      const facts = store.getObservationFacts({ observation_id: saved.id });

      expect(result.project).toBe('auth-project');
      expect(result.observations_scanned).toBe(1);
      expect(result.facts_deleted).toBe(0);
      expect(result.facts_created).toBeGreaterThan(0);
      expect(facts.map((fact) => fact.relation)).toEqual([
        'HAS_TYPE',
        'IN_PROJECT',
        'HAS_TOPIC_KEY',
        'HAS_WHAT',
        'HAS_WHY',
        'HAS_WHERE',
      ]);
    } finally {
      store.close();
    }
  });

  it('rebuilds derived facts only for the requested project', () => {
    const store = new Store(':memory:');

    try {
      const auth = store.saveObservation({
        title: 'Auth memory',
        content: '**What**: Auth graph content',
        project: 'auth-project',
      }).observation;
      const cache = store.saveObservation({
        title: 'Cache memory',
        content: '**What**: Cache graph content',
        project: 'cache-project',
      }).observation;

      deleteKgTriples(store);

      const result = store.rebuildObservationFacts({ project: 'auth-project' });

      expect(result.project).toBe('auth-project');
      expect(result.observations_scanned).toBe(1);
      expect(store.getObservationFacts({ observation_id: auth.id })).toHaveLength(3);
      expect(store.getObservationFacts({ observation_id: cache.id }).map((fact) => fact.relation)).toEqual([
        'HAS_TYPE',
        'IN_PROJECT',
      ]);
    } finally {
      store.close();
    }
  });
});
