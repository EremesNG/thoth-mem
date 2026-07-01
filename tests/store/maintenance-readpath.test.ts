import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('Store maintenance read-path consumption', () => {
  let store: Store;

  afterEach(() => {
    store.close();
  });

  describe('enabled read path', () => {
    beforeEach(() => {
      store = new Store(':memory:', {
        maintenance: {
          reflection: { enabled: false },
          decay: { enabled: false },
        },
        knowledgeGraph: { kgMultiHopEnabled: false },
      });
    });

    it('suppresses duplicate compact retrieval noise while preserving source reachability', async () => {
      const first = store.saveObservation({
        title: 'Duplicate source A',
        content: 'shared consolidation token keeps source reachable',
        project: 'maint-project',
        type: 'learning',
      }).observation;
      const second = store.saveObservation({
        title: 'Duplicate source B',
        content: 'shared consolidation token keeps source reachable',
        project: 'maint-project',
        type: 'learning',
      }).observation;

      store.runMaintenance({ scope: { project: 'maint-project' } });

      const retrieval = await store.hybridRetrieve({
        query: 'shared consolidation token',
        project: 'maint-project',
        limit: 10,
      });

      const duplicateHits = retrieval.results.filter((hit) => [first.id, second.id].includes(hit.observation.id));
      expect(duplicateHits).toHaveLength(1);
      expect(duplicateHits[0].evidence.maintenance?.consolidation?.memberIds).toEqual([first.id, second.id]);
      expect(store.getObservation(first.id)?.content).toContain('source reachable');
      expect(store.getObservation(second.id)?.content).toContain('source reachable');
    });

    it('clears stale consolidation metadata when an evaluated source stops being a duplicate', async () => {
      const first = store.saveObservation({
        title: 'Mutable duplicate source A',
        content: 'mutable consolidation marker starts duplicated',
        project: 'consolidation-rollback',
        type: 'learning',
      }).observation;
      const second = store.saveObservation({
        title: 'Mutable duplicate source B',
        content: 'mutable consolidation marker starts duplicated',
        project: 'consolidation-rollback',
        type: 'learning',
      }).observation;
      store.runMaintenance({ scope: { project: 'consolidation-rollback' } });

      store.updateObservation({
        id: second.id,
        content: 'fresh solitary zephyr quasar should surface by itself',
      });
      store.runMaintenance({ scope: { project: 'consolidation-rollback' } });

      const staleMemberRow = store.getDb().prepare(
        `SELECT m.source_id
         FROM maintenance_consolidation_members m
         JOIN maintenance_consolidations c ON c.id = m.consolidation_id
         WHERE m.source_kind = 'observation'
           AND m.source_id = ?`
      ).get(second.id);
      const retrieval = await store.hybridRetrieve({
        query: 'fresh solitary zephyr quasar',
        project: 'consolidation-rollback',
        limit: 10,
      });

      expect(staleMemberRow).toBeUndefined();
      expect(retrieval.results.map((hit) => hit.observation.id)).toEqual([second.id]);
      expect(retrieval.results[0].evidence.maintenance?.consolidation).toBeUndefined();
      expect(store.getObservation(first.id)?.content).toContain('starts duplicated');
      expect(store.getObservation(second.id)?.content).toContain('should surface by itself');
    });

    it('does not consolidate exact-hash records across different topic keys', async () => {
      store.saveObservation({
        title: 'Topic A duplicate',
        content: 'topic isolated duplicate marker',
        project: 'topic-isolation',
        type: 'learning',
        topic_key: 'topic/a',
      });
      const topicB = store.saveObservation({
        title: 'Topic B duplicate',
        content: 'topic isolated duplicate marker',
        project: 'topic-isolation',
        type: 'learning',
        topic_key: 'topic/b',
      }).observation;

      store.runMaintenance({ scope: { project: 'topic-isolation' } });

      const retrieval = await store.hybridRetrieve({
        query: 'topic isolated duplicate marker',
        project: 'topic-isolation',
        topic_key: 'topic/b',
        limit: 10,
      });

      expect(retrieval.results.map((hit) => hit.observation.id)).toEqual([topicB.id]);
      expect(retrieval.results[0].observation.topic_key).toBe('topic/b');
      expect(retrieval.results[0].evidence.maintenance?.consolidation).toBeUndefined();
    });

    it('ignores legacy consolidation metadata whose canonical is outside the active topic filter', async () => {
      const topicA = store.saveObservation({
        title: 'Legacy topic A canonical',
        content: 'legacy bad consolidation topic filter marker',
        project: 'legacy-topic-filter',
        type: 'learning',
        topic_key: 'topic/a',
      }).observation;
      const topicB = store.saveObservation({
        title: 'Legacy topic B member',
        content: 'legacy bad consolidation topic filter marker',
        project: 'legacy-topic-filter',
        type: 'learning',
        topic_key: 'topic/b',
      }).observation;

      const db = store.getDb();
      const run = db.prepare(
        `INSERT INTO maintenance_runs (
           run_key, mode, scope_json, config_json, status, counts_json, degraded_json, completed_at
         ) VALUES (?, 'apply', ?, '{}', 'applied', '{}', '[]', datetime('now'))`
      ).run('legacy-cross-topic-consolidation', '{"project":"legacy-topic-filter"}');
      const consolidation = db.prepare(
        `INSERT INTO maintenance_consolidations (
           run_id, cluster_key, canonical_kind, canonical_id, reason_class, signal_json, review_required
         ) VALUES (?, ?, 'observation', ?, 'legacy-cross-topic', '{}', 0)`
      ).run(Number(run.lastInsertRowid), 'legacy-cross-topic-cluster', topicA.id);
      const insertMember = db.prepare(
        `INSERT INTO maintenance_consolidation_members (
           consolidation_id, source_kind, source_id, role, signal_json
         ) VALUES (?, 'observation', ?, ?, '{}')`
      );
      insertMember.run(Number(consolidation.lastInsertRowid), topicA.id, 'canonical');
      insertMember.run(Number(consolidation.lastInsertRowid), topicB.id, 'member');

      const retrieval = await store.hybridRetrieve({
        query: 'legacy bad consolidation topic filter marker',
        project: 'legacy-topic-filter',
        topic_key: 'topic/b',
        limit: 10,
      });

      expect(retrieval.results.map((hit) => hit.observation.id)).toEqual([topicB.id]);
      expect(retrieval.results[0].observation.topic_key).toBe('topic/b');
      expect(retrieval.results[0].evidence.maintenance?.consolidation).toBeUndefined();
      expect(store.getObservation(topicA.id)?.topic_key).toBe('topic/a');
    });
  });

  it('promotes reflected learnings and preserves source lineage', async () => {
    store = new Store(':memory:', {
      maintenance: {
        consolidation: { enabled: false },
        decay: { enabled: false },
        reflection: { enabled: true, minSourceCount: 2 },
      },
      knowledgeGraph: { kgMultiHopEnabled: false },
    });
    const sourceA = store.saveObservation({
      title: 'Credential rotation source A',
      content: 'credential rotation durable learning emerges from source A',
      project: 'reflect-project',
      type: 'decision',
    }).observation;
    const sourceB = store.saveObservation({
      title: 'Credential rotation source B',
      content: 'credential rotation durable learning emerges from source B',
      project: 'reflect-project',
      type: 'decision',
    }).observation;

    const result = store.runMaintenance({ scope: { project: 'reflect-project' } });
    const reflectionId = result.reflections[0].planned_observation_id;
    expect(reflectionId).toBeTypeOf('number');

    const retrieval = await store.hybridRetrieve({
      query: 'Credential rotation source',
      project: 'reflect-project',
      limit: 10,
    });

    expect(retrieval.results[0].observation.id).toBe(reflectionId);
    expect(retrieval.results[0].evidence.maintenance?.reflection?.sourceIds).toEqual([sourceA.id, sourceB.id]);
    expect(store.getObservation(sourceA.id)).not.toBeNull();
    expect(store.getObservation(sourceB.id)).not.toBeNull();
  });

  it('down-weights decayed records without hiding them', async () => {
    store = new Store(':memory:', {
      maintenance: {
        consolidation: { enabled: false },
        reflection: { enabled: false },
        decay: { enabled: true, staleAfterDays: 1, scoreMultiplier: 0.4 },
      },
      knowledgeGraph: { kgMultiHopEnabled: false },
    });
    const stale = store.saveObservation({
      title: 'Stale migration note',
      content: 'priority token should stay recoverable',
      project: 'decay-project',
      type: 'manual',
    }).observation;
    const current = store.saveObservation({
      title: 'Current migration decision',
      content: 'priority token should stay recoverable',
      project: 'decay-project',
      type: 'decision',
    }).observation;
    store.getDb().prepare("UPDATE observations SET created_at = '2020-01-01 00:00:00', updated_at = '2020-01-01 00:00:00' WHERE id = ?")
      .run(stale.id);

    store.runMaintenance({ scope: { project: 'decay-project' } });

    const retrieval = await store.hybridRetrieve({
      query: 'priority token recoverable',
      project: 'decay-project',
      limit: 10,
    });

    expect(retrieval.results.map((hit) => hit.observation.id)).toEqual([current.id, stale.id]);
    expect(retrieval.results[1].evidence.maintenance?.decay).toMatchObject({
      scoreMultiplier: 0.4,
      state: 'attenuated',
    });
    expect(store.getObservation(stale.id)?.content).toContain('stay recoverable');
  });

  it('clears stale decay metadata when a record no longer matches decay policy', async () => {
    store = new Store(':memory:', {
      maintenance: {
        consolidation: { enabled: false },
        reflection: { enabled: false },
        decay: { enabled: true, staleAfterDays: 1, scoreMultiplier: 0.4 },
      },
      knowledgeGraph: { kgMultiHopEnabled: false },
    });
    const stale = store.saveObservation({
      title: 'Recovering implementation note',
      content: 'reversible decay marker',
      project: 'decay-rollback',
      type: 'manual',
    }).observation;
    const current = store.saveObservation({
      title: 'Current implementation decision',
      content: 'reversible decay marker',
      project: 'decay-rollback',
      type: 'decision',
    }).observation;
    store.getDb().prepare(
      "UPDATE observations SET created_at = '2020-01-01 00:00:00', updated_at = '2020-01-01 00:00:00' WHERE id = ?"
    ).run(stale.id);
    store.runMaintenance({ scope: { project: 'decay-rollback' } });

    store.updateObservation({
      id: stale.id,
      title: 'Recovered implementation decision',
      content: 'reversible decay marker',
      type: 'decision',
    });
    store.runMaintenance({ scope: { project: 'decay-rollback' } });

    const decayRow = store.getDb().prepare(
      'SELECT source_id FROM maintenance_decay WHERE source_kind = ? AND source_id = ?'
    ).get('observation', stale.id);
    const retrieval = await store.hybridRetrieve({
      query: 'reversible decay marker',
      project: 'decay-rollback',
      limit: 10,
    });

    expect(decayRow).toBeUndefined();
    expect(retrieval.results.map((hit) => hit.observation.id)).toEqual([stale.id, current.id]);
    expect(retrieval.results[0].evidence.maintenance?.decay).toBeUndefined();
  });

  it('ignores persisted maintenance metadata when maintenance is disabled', async () => {
    store = new Store(':memory:', {
      maintenance: {
        enabled: false,
        consolidation: { enabled: false },
        reflection: { enabled: false },
        decay: { enabled: true, staleAfterDays: 1, scoreMultiplier: 0.2 },
      },
      knowledgeGraph: { kgMultiHopEnabled: false },
    });
    const stale = store.saveObservation({
      title: 'Disabled maintenance stale note',
      content: 'master disable marker',
      project: 'master-disable',
      type: 'manual',
    }).observation;
    const current = store.saveObservation({
      title: 'Disabled maintenance current decision',
      content: 'master disable marker',
      project: 'master-disable',
      type: 'decision',
    }).observation;
    store.getDb().prepare(
      "UPDATE observations SET created_at = '2020-01-01 00:00:00', updated_at = '2020-01-01 00:00:00' WHERE id = ?"
    ).run(stale.id);
    const run = store.getDb().prepare(
      `INSERT INTO maintenance_runs (
         run_key, mode, scope_json, config_json, status, counts_json, degraded_json, completed_at
       ) VALUES (?, 'apply', ?, '{}', 'applied', '{}', '[]', datetime('now'))`
    ).run('disabled-master-decay-metadata', '{"project":"master-disable"}');
    store.getDb().prepare(
      `INSERT INTO maintenance_decay (
         source_kind, source_id, score, state, reason_class, policy_json, run_id
       ) VALUES ('observation', ?, 0.2, 'attenuated', 'age-low-value', '{}', ?)`
    ).run(stale.id, Number(run.lastInsertRowid));

    const retrieval = await store.hybridRetrieve({
      query: 'master disable marker',
      project: 'master-disable',
      limit: 10,
    });

    expect(store.config.maintenance.readPath.enabled).toBe(false);
    expect(new Set(retrieval.results.map((hit) => hit.observation.id))).toEqual(new Set([stale.id, current.id]));
    expect(retrieval.results.map((hit) => hit.evidence.maintenance)).toEqual([undefined, undefined]);
  });

  it('consumes persisted maintenance metadata when maintenance is disabled and read-path is explicitly enabled', async () => {
    store = new Store(':memory:', {
      maintenance: {
        enabled: true,
        readPath: { enabled: true },
        consolidation: { enabled: false },
        reflection: { enabled: false },
        decay: { enabled: true, staleAfterDays: 1, scoreMultiplier: 0.2 },
      },
      knowledgeGraph: { kgMultiHopEnabled: false },
    });
    const stale = store.saveObservation({
      title: 'Disabled maintenance stale note',
      content: 'explicit read-path override marker',
      project: 'master-disable-override',
      type: 'manual',
    }).observation;
    const current = store.saveObservation({
      title: 'Disabled maintenance current decision',
      content: 'explicit read-path override marker',
      project: 'master-disable-override',
      type: 'decision',
    }).observation;
    store.getDb().prepare(
      "UPDATE observations SET created_at = '2020-01-01 00:00:00', updated_at = '2020-01-01 00:00:00' WHERE id = ?"
    ).run(stale.id);
    store.runMaintenance({ scope: { project: 'master-disable-override' } });
    store.config.maintenance.enabled = false;

    const retrieval = await store.hybridRetrieve({
      query: 'explicit read-path override marker',
      project: 'master-disable-override',
      limit: 10,
    });

    const resultIds = retrieval.results.map((hit) => hit.observation.id);
    expect(new Set(resultIds)).toEqual(new Set([stale.id, current.id]));
    expect(retrieval.results.find((hit) => hit.observation.id === current.id)?.evidence.maintenance).toBeUndefined();
    expect(retrieval.results.find((hit) => hit.observation.id === stale.id)?.evidence.maintenance?.decay).toMatchObject({
      scoreMultiplier: 0.2,
      state: 'attenuated',
    });
  });

  it('matches baseline retrieval when maintenance read-path consumption is disabled', async () => {
    store = new Store(':memory:', {
      maintenance: {
        readPath: { enabled: false },
        reflection: { enabled: false },
        decay: { enabled: false },
      },
      knowledgeGraph: { kgMultiHopEnabled: false },
    });
    store.saveObservation({
      title: 'Baseline source A',
      content: 'baseline parity token',
      project: 'baseline-project',
      type: 'learning',
    });
    store.saveObservation({
      title: 'Baseline source B',
      content: 'baseline parity token',
      project: 'baseline-project',
      type: 'learning',
    });

    const before = await store.hybridRetrieve({
      query: 'baseline parity token',
      project: 'baseline-project',
      limit: 10,
    });
    store.runMaintenance({ scope: { project: 'baseline-project' } });
    const after = await store.hybridRetrieve({
      query: 'baseline parity token',
      project: 'baseline-project',
      limit: 10,
    });

    expect(after.results.map((hit) => [hit.observation.id, hit.score, hit.evidence.maintenance])).toEqual(
      before.results.map((hit) => [hit.observation.id, hit.score, hit.evidence.maintenance]),
    );
  });
});
