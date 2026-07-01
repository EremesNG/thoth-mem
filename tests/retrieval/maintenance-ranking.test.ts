import { describe, expect, it } from 'vitest';
import { fuseCandidates, type LaneCandidate, type MaintenanceRankingMetadata } from '../../src/retrieval/ranking.js';
import type { Observation } from '../../src/store/types.js';

function observation(id: number, title: string): Observation {
  return {
    id,
    sync_id: null,
    session_id: 's1',
    type: 'learning',
    title,
    content: `${title} body`,
    tool_name: null,
    project: 'ranking-project',
    scope: 'project',
    topic_key: null,
    normalized_hash: null,
    revision_count: 1,
    duplicate_count: 1,
    last_seen_at: null,
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
    deleted_at: null,
  };
}

function lexical(observationId: number, score: number): LaneCandidate {
  return {
    lane: 'lexical',
    observationId,
    score,
    source: 'lexical_prefix',
    text: `candidate ${observationId}`,
  };
}

describe('maintenance-aware retrieval ranking', () => {
  it('suppresses consolidated duplicate members behind the canonical hit with source provenance', () => {
    const observations = new Map([
      [1, observation(1, 'Canonical')],
      [2, observation(2, 'Duplicate source')],
      [3, observation(3, 'Unrelated')],
    ]);
    const maintenance: MaintenanceRankingMetadata = {
      enabled: true,
      consolidations: new Map([
        [1, { clusterKey: 'cluster-a', canonicalId: 1, memberIds: [1, 2], reasonClass: 'exact-hash' }],
        [2, { clusterKey: 'cluster-a', canonicalId: 1, memberIds: [1, 2], reasonClass: 'exact-hash' }],
      ]),
      reflections: new Map(),
      decays: new Map(),
    };

    const hits = fuseCandidates(observations, [lexical(1, 0.8), lexical(2, 0.95), lexical(3, 0.4)], { maintenance });

    expect(hits.map((hit) => hit.observation.id)).toEqual([1, 3]);
    expect(hits[0].evidence.maintenance?.consolidation).toEqual({
      clusterKey: 'cluster-a',
      canonicalId: 1,
      memberIds: [1, 2],
      suppressedSourceIds: [2],
      reasonClass: 'exact-hash',
    });
  });

  it('promotes reflections while keeping source lineage in evidence', () => {
    const observations = new Map([
      [1, observation(1, 'Source A')],
      [2, observation(2, 'Source B')],
      [10, observation(10, 'Reflected learning')],
    ]);
    const maintenance: MaintenanceRankingMetadata = {
      enabled: true,
      consolidations: new Map(),
      reflections: new Map([
        [10, { sourceIds: [1, 2], reasonClass: 'topic-cluster', boost: 1.4 }],
      ]),
      decays: new Map(),
    };

    const hits = fuseCandidates(observations, [lexical(1, 0.7), lexical(2, 0.7), lexical(10, 0.55)], { maintenance });

    expect(hits[0].observation.id).toBe(10);
    expect(hits[0].evidence.maintenance?.reflection).toEqual({
      sourceIds: [1, 2],
      reasonClass: 'topic-cluster',
      boost: 1.4,
    });
    expect(hits.map((hit) => hit.observation.id)).toEqual([10, 1, 2]);
  });

  it('down-weights decayed hits without hiding them', () => {
    const observations = new Map([
      [1, observation(1, 'Current decision')],
      [2, observation(2, 'Stale note')],
    ]);
    const maintenance: MaintenanceRankingMetadata = {
      enabled: true,
      consolidations: new Map(),
      reflections: new Map(),
      decays: new Map([
        [2, { scoreMultiplier: 0.5, state: 'attenuated', reasonClass: 'stale-age' }],
      ]),
    };

    const hits = fuseCandidates(observations, [lexical(1, 0.7), lexical(2, 0.9)], { maintenance });

    expect(hits.map((hit) => hit.observation.id)).toEqual([1, 2]);
    expect(hits[1].evidence.maintenance?.decay).toEqual({
      scoreMultiplier: 0.5,
      state: 'attenuated',
      reasonClass: 'stale-age',
    });
  });

  it('matches baseline order and evidence when maintenance consumption is disabled', () => {
    const observations = new Map([
      [1, observation(1, 'Canonical')],
      [2, observation(2, 'Duplicate source')],
    ]);
    const candidates = [lexical(1, 0.8), lexical(2, 0.95)];
    const baseline = fuseCandidates(observations, candidates);
    const disabled = fuseCandidates(observations, candidates, {
      maintenance: {
        enabled: false,
        consolidations: new Map([
          [2, { clusterKey: 'cluster-a', canonicalId: 1, memberIds: [1, 2], reasonClass: 'exact-hash' }],
        ]),
        reflections: new Map(),
        decays: new Map([
          [2, { scoreMultiplier: 0.2, state: 'attenuated', reasonClass: 'stale-age' }],
        ]),
      },
    });

    expect(disabled.map((hit) => [hit.observation.id, hit.score, hit.evidence.maintenance])).toEqual(
      baseline.map((hit) => [hit.observation.id, hit.score, hit.evidence.maintenance]),
    );
  });
});
