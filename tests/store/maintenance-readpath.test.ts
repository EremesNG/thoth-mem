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
