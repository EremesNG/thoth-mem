import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  RETRIEVAL_EVAL_MIN_RECALL_AT_1,
  RETRIEVAL_EVAL_MIN_RECALL_AT_K,
  assertRetrievalEvalGate,
  buildRetrievalTokenSavingsEnvelope,
  runRetrievalEval,
  type RetrievalEvalReport,
} from '../../src/evals/retrieval.js';
import { fuseCandidates, type LaneCandidate } from '../../src/retrieval/ranking.js';
import { Store } from '../../src/store/index.js';
import type { Observation } from '../../src/store/types.js';

function rankingObservation(id: number, title: string): Observation {
  return {
    id,
    sync_id: null,
    session_id: 'ranking-session',
    type: 'decision',
    title,
    content: `${title} body`,
    tool_name: null,
    project: 'community-ranking',
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

function seedCommunityGraph(store: Store, project: string): number {
  const source = store.saveObservation({
    title: `${project} community source`,
    content: 'Apollo orchestration depends on Orbit cache for retrieval evidence.',
    type: 'decision',
    project,
    topic_key: `eval/${project}/community-source`,
  }).observation.id;
  const db = store.getDb();
  const subject = db.prepare(
    'INSERT INTO kg_entities (entity_key, entity_type, canonical_name) VALUES (?, ?, ?)'
  ).run(`${project}:apollo`, 'concept', 'Apollo orchestration').lastInsertRowid as number;
  const object = db.prepare(
    'INSERT INTO kg_entities (entity_key, entity_type, canonical_name) VALUES (?, ?, ?)'
  ).run(`${project}:orbit`, 'concept', 'Orbit cache').lastInsertRowid as number;

  db.prepare(
    `INSERT INTO kg_triples (
      subject_entity_id, relation, object_entity_id, source_type, source_id,
      project, topic_key, provenance, confidence, triple_hash
    ) VALUES (?, 'DEPENDS_ON', ?, 'observation', ?, ?, ?, 'eval-community', 0.9, ?)`
  ).run(subject, object, source, project, `eval/${project}/community-source`, `${project}:apollo-orbit`);

  return source;
}

describe('community retrieval integration', () => {
  it('community evidence is in kg lane', async () => {
    const store = new Store(':memory:', {
      communitySummaries: {
        enabled: true,
        readPath: { enabled: true },
        maxRetrievalCommunities: 1,
      },
    });
    try {
      const sourceId = seedCommunityGraph(store, 'community-lane-eval');
      store.rebuildCommunitySummaries({ project: 'community-lane-eval' });

      const retrieval = await store.hybridRetrieve({
        query: 'Apollo Orbit retrieval evidence',
        project: 'community-lane-eval',
        limit: 5,
      });
      const laneSet = new Set(retrieval.results.flatMap((hit) => hit.lanes));
      const communityCandidates = retrieval.results.flatMap((hit) =>
        hit.evidence.byLane.kg?.filter((candidate) => candidate.source === 'kg_community_summary') ?? []
      );

      expect([...laneSet].sort()).toEqual(expect.arrayContaining(['kg']));
      expect([...laneSet].sort()).toEqual(expect.not.arrayContaining(['community']));
      expect(communityCandidates).toHaveLength(1);
      expect(communityCandidates[0]).toMatchObject({
        lane: 'kg',
        observationId: sourceId,
        community: {
          freshness: 'fresh',
          degraded: false,
          sourceObservationIds: [sourceId],
          entityCount: 2,
          tripleCount: 1,
        },
      });
    } finally {
      store.close();
    }
  });

  it('direct kg outranks community summary', () => {
    const observations = new Map([
      [10, rankingObservation(10, 'Community summary')],
      [20, rankingObservation(20, 'Direct KG triple')],
    ]);
    const candidates: LaneCandidate[] = [
      {
        lane: 'kg',
        observationId: 10,
        score: 1,
        source: 'kg_community_summary',
        text: 'Community-level Apollo evidence',
        community: {
          communityId: 'c_tie',
          runId: 1,
          freshness: 'fresh',
          degraded: false,
          sourceObservationIds: [10],
          entityCount: 2,
          tripleCount: 1,
        },
      },
      {
        lane: 'kg',
        observationId: 20,
        score: 1,
        source: 'kg_triples',
        text: 'Apollo DEPENDS_ON Orbit',
        kg: {
          provenance: 'eval-direct',
          confidence: 1,
          sourceType: 'observation',
        },
      },
    ];

    const hits = fuseCandidates(observations, candidates);

    expect(hits.map((hit) => hit.evidence.primary.source)).toEqual(['kg_triples', 'kg_community_summary']);
  });

  it('degraded summaries fall back to baseline', async () => {
    const store = new Store(':memory:', {
      communitySummaries: {
        enabled: true,
        readPath: { enabled: true },
      },
    });
    try {
      const sourceId = seedCommunityGraph(store, 'community-missing-eval');

      const retrieval = await store.hybridRetrieve({
        query: 'Apollo Orbit retrieval evidence',
        project: 'community-missing-eval',
        limit: 5,
      });

      expect(retrieval.results.some((hit) => hit.observation.id === sourceId)).toBe(true);
      expect(retrieval.degradedFallback).toContain('kg_communities_missing');
      expect(retrieval.results.flatMap((hit) => hit.evidence.byLane.kg ?? []))
        .not.toEqual(expect.arrayContaining([
          expect.objectContaining({ source: 'kg_community_summary' }),
        ]));
    } finally {
      store.close();
    }
  });

  it('enrichment-unavailable summaries fall back through hybrid retrieval', async () => {
    const store = new Store(':memory:', {
      communitySummaries: {
        enabled: true,
        readPath: { enabled: true },
        enrichment: { enabled: true },
      },
    });
    try {
      const sourceId = seedCommunityGraph(store, 'community-enrichment-fallback-eval');
      const rebuild = store.rebuildCommunitySummaries({ project: 'community-enrichment-fallback-eval' });

      const retrieval = await store.hybridRetrieve({
        query: 'Apollo Orbit retrieval evidence',
        project: 'community-enrichment-fallback-eval',
        limit: 5,
      });

      expect(rebuild.status).toBe('committed');
      expect(rebuild.freshness).toBe('degraded');
      expect(rebuild.degraded_reasons).toContain('enrichment_unavailable');
      expect(retrieval.degradedFallback).toContain('kg_communities_degraded');
      expect(retrieval.results.some((hit) => hit.observation.id === sourceId)).toBe(true);
      expect(retrieval.results.flatMap((hit) => hit.evidence.byLane.kg ?? []))
        .not.toEqual(expect.arrayContaining([
          expect.objectContaining({ source: 'kg_community_summary' }),
        ]));
    } finally {
      store.close();
    }
  });

  it('read path defaults off even when summaries are rebuilt', async () => {
    const store = new Store(':memory:');
    try {
      const sourceId = seedCommunityGraph(store, 'community-default-off-eval');
      store.rebuildCommunitySummaries({ project: 'community-default-off-eval' });

      const retrieval = await store.hybridRetrieve({
        query: 'Apollo Orbit retrieval evidence',
        project: 'community-default-off-eval',
        limit: 5,
      });

      expect(store.config.communitySummaries.readPath.enabled).toBe(false);
      expect(retrieval.results.some((hit) => hit.observation.id === sourceId)).toBe(true);
      expect(retrieval.degradedFallback).not.toEqual(expect.arrayContaining([
        expect.stringMatching(/^kg_communities_/),
      ]));
      expect(retrieval.results.flatMap((hit) => hit.evidence.byLane.kg ?? []))
        .not.toEqual(expect.arrayContaining([
          expect.objectContaining({ source: 'kg_community_summary' }),
        ]));
    } finally {
      store.close();
    }
  });

  it('bounds community retrieval output and coverage metadata', async () => {
    const store = new Store(':memory:', {
      communitySummaries: {
        enabled: true,
        readPath: { enabled: true },
        summaryMaxChars: 1200,
        maxRetrievalCommunities: 1,
      },
    });
    try {
      seedCommunityGraph(store, 'community-bounds-eval');
      store.rebuildCommunitySummaries({ project: 'community-bounds-eval' });

      const direct = store.getCommunitySummariesForRetrieval({
        project: 'community-bounds-eval',
        limit: 10,
        maxChars: 40,
      });
      const retrieval = await store.hybridRetrieve({
        query: 'Apollo Orbit retrieval evidence',
        project: 'community-bounds-eval',
        limit: 5,
      });
      const communityCandidates = retrieval.results.flatMap((hit) =>
        hit.evidence.byLane.kg?.filter((candidate) => candidate.source === 'kg_community_summary') ?? []
      );

      expect(direct.candidates).toHaveLength(1);
      expect(direct.candidates[0].summary_text.length).toBeLessThanOrEqual(40);
      expect(direct.candidates[0].source_observation_ids.length).toBeLessThanOrEqual(1);
      expect(communityCandidates).toHaveLength(1);
      expect(communityCandidates[0].text.length).toBeLessThanOrEqual(1200);
      expect(communityCandidates[0].community?.sourceObservationIds.length).toBeLessThanOrEqual(12);
      expect(communityCandidates[0].community?.entityCount).toBeGreaterThan(0);
      expect(communityCandidates[0].community?.tripleCount).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });
});

describe('retrieval eval baseline', () => {
  let report: RetrievalEvalReport;

  beforeAll(async () => {
    report = await runRetrievalEval();
  }, 20_000);

  it('measures deterministic hybrid recall under synthetic noise', async () => {
    expect(() => assertRetrievalEvalGate(report)).not.toThrow();
    expect(report.summary.total_cases).toBeGreaterThanOrEqual(5);
    expect(report.summary.recall_at_1).toBeGreaterThanOrEqual(RETRIEVAL_EVAL_MIN_RECALL_AT_1);
    expect(report.summary.recall_at_k).toBeGreaterThanOrEqual(RETRIEVAL_EVAL_MIN_RECALL_AT_K);
    expect(report.summary.mean_reciprocal_rank).toBeGreaterThanOrEqual(0.97);
    expect(report.summary.context_compression).toBeGreaterThan(0);
    expect(report.summary.retrieval_defaults.lane_order).toBe('sentence > kg > chunk > lexical');
    expect(report.summary.retrieval_defaults.sentence_top_k).toBe(100);
    expect(report.summary.hybrid.pending_rate).toBeGreaterThanOrEqual(0);
    expect(report.summary.hybrid.degraded_rate).toBeGreaterThanOrEqual(0);
    expect(report.summary.hybrid.lexical_prefix_hit_rate).toBeGreaterThanOrEqual(0);
    expect(report.summary.hybrid.raw_semantic_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.hyde_semantic_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.kg_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.kg_primary_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.evidence_lineage_coverage).toBeGreaterThan(0);
    expect(report.summary.hybrid.stale_result_rate).toBe(1);
    expect(report.summary.hybrid.kg_provenance_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.lane_truth_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.facts_source_rate).toBeGreaterThan(0);
  });

  it('exposes a canonical token-savings metrics envelope without replacing existing summary fields', async () => {
    const envelope = report.summary.token_savings_metrics;
    const rebuilt = buildRetrievalTokenSavingsEnvelope(report.summary, report.cases);
    const fullChars = report.cases.reduce((sum, result) => sum + result.full_content_chars, 0);
    const returnedChars = report.cases.reduce((sum, result) => sum + result.context_chars, 0);
    const evidenceChars = report.cases.reduce((sum, result) => sum + result.primary_evidence_chars, 0);

    expect(envelope).toEqual(rebuilt);
    expect(envelope).toMatchObject({
      source: 'retrieval_eval',
      measurement: 'aggregate',
      full_chars: fullChars,
      evidence_chars: evidenceChars,
      returned_chars: returnedChars,
      saved_chars: fullChars - returnedChars,
      compression_ratio: report.summary.context_compression,
      compression_basis: 'returned_chars',
      recall_at_1: report.summary.recall_at_1,
      recall_at_k: report.summary.recall_at_k,
      mean_reciprocal_rank: report.summary.mean_reciprocal_rank,
      context_compression: report.summary.context_compression,
      surgical_compression: report.summary.hybrid.surgical_compression,
      kg_hit_rate: report.summary.hybrid.kg_hit_rate,
      kg_primary_rate: report.summary.hybrid.kg_primary_rate,
      sentence_primary_rate: report.summary.hybrid.sentence_primary_rate,
      community_no_fifth_lane_rate: report.summary.hybrid.community_no_fifth_lane_rate,
    });
    expect(envelope).toMatchObject({
      community_read_path_default_off_rate: 1,
      community_disabled_no_regression_rate: 1,
      community_enabled_no_regression_rate: 1,
      community_fallback_rate: 1,
      community_no_fifth_lane_rate: 1,
      community_direct_kg_no_regression_rate: 1,
      community_multi_hop_no_regression_rate: 1,
      community_summary_bounds_rate: 1,
      community_coverage_bounds_rate: 1,
      community_enrichment_unavailable_fallback_rate: 1,
    });
    expect(envelope.saved_chars).toBeGreaterThan(0);
  });

  it('formats a markdown benchmark report', async () => {
    expect(report.markdown).toContain('# Retrieval Eval Baseline (Hybrid Retrieval)');
    expect(report.markdown).toContain('| Recall @ 1 |');
    expect(report.markdown).toContain('| Mean Reciprocal Rank |');
    expect(report.markdown).toContain('| Pending Rate |');
    expect(report.markdown).toContain('| Stale Result Prevention Rate |');
    expect(report.markdown).toContain('| KG Provenance Rate |');
    expect(report.markdown).toContain('| KG Primary Lane Rate |');
    expect(report.markdown).toContain('| Lane Truth Rate |');
    expect(report.markdown).toContain('## Retrieval Defaults');
    expect(report.markdown).toContain('## Case Results');
    expect(report.markdown).toContain('| Rephrased cases |');
  });

  it('lane contribution gates: requires non-zero semantic/HyDE and KG enrichment when fixtures support them', async () => {
    expect(report.summary.hybrid.raw_semantic_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.hyde_semantic_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.kg_hit_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.stale_result_rate).toBe(1);
    expect(report.summary.hybrid.kg_provenance_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.lane_truth_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.facts_source_rate).toBeGreaterThan(0);
  });

  it('rejects reports below the retrieval eval gate', () => {
    const lowScoringReport = {
      ...report,
      summary: {
        ...report.summary,
        recall_at_1: RETRIEVAL_EVAL_MIN_RECALL_AT_1 - 0.001,
      },
    };

    expect(() => assertRetrievalEvalGate(lowScoringReport)).toThrow(
      `Recall@1 ${lowScoringReport.summary.recall_at_1} is below required ${RETRIEVAL_EVAL_MIN_RECALL_AT_1}`
    );
  });

  it('facts source checks pass on KG-only evidence and graph cases use kg_triples candidates', async () => {
    expect(report.summary.hybrid.facts_source_rate).toBeGreaterThan(0);

    const graphLite = report.cases.find((result) => result.name === 'graph-lite recall');
    const graphRank = report.cases.find((result) => result.name === 'graph-only ranked recall');

    expect(graphLite?.found).toBe(true);
    expect(graphRank?.found).toBe(true);
    expect(report.markdown).toContain('| Facts Source Coverage Rate |');
  });

  it('includes the shared-entity multi-hop recall gate', async () => {
    const multiHop = report.cases.find((result) => result.name === 'kg multi-hop shared entity recall');

    expect(multiHop).toBeDefined();
    expect(multiHop?.found).toBe(true);
    expect(multiHop?.rank).toBeLessThanOrEqual(5);
  });

  it('includes the supersession-wins retrieval gate', async () => {
    const supersession = report.cases.find((result) => result.name === 'supersession current fact wins');

    expect(supersession).toBeDefined();
    expect(supersession?.found).toBe(true);
    expect(supersession?.rank).toBe(1);
  });

  it('reports supersession OFF/ON no-regression evidence', async () => {
    expect(report.summary.hybrid.supersession_no_regression_rate).toBe(1);
    expect(report.summary.hybrid.supersession_flag_off_rate).toBe(1);
    expect(report.markdown).toContain('| Supersession OFF/ON No-Regression Rate |');
    expect(report.markdown).toContain('| Supersession Flag-Off Behavior Rate |');
  });

  it('reports maintenance duplicate suppression with source reachability', async () => {
    expect(report.summary.hybrid.maintenance_duplicate_suppression_rate).toBe(1);
    expect(report.summary.hybrid.maintenance_source_reachability_rate).toBe(1);
    expect(report.markdown).toContain('| Maintenance Duplicate Suppression Rate |');
    expect(report.markdown).toContain('| Maintenance Source Reachability Rate |');
  });

  it('reports maintenance reflection quality and idempotency evidence', async () => {
    expect(report.summary.hybrid.maintenance_reflection_quality_rate).toBe(1);
    expect(report.summary.hybrid.maintenance_reflection_idempotency_rate).toBe(1);
    expect(report.markdown).toContain('| Maintenance Reflection Quality Rate |');
    expect(report.markdown).toContain('| Maintenance Reflection Idempotency Rate |');
  });

  it('reports maintenance decay down-weighting without hiding current facts', async () => {
    expect(report.summary.hybrid.maintenance_decay_current_fact_rate).toBe(1);
    expect(report.summary.hybrid.maintenance_decay_reachability_rate).toBe(1);
    expect(report.markdown).toContain('| Maintenance Decay Current Fact Rate |');
    expect(report.markdown).toContain('| Maintenance Decay Reachability Rate |');
  });

  it('reports maintenance default no-regression and export/import regeneration evidence', async () => {
    expect(report.summary.hybrid.maintenance_no_regression_rate).toBe(1);
    expect(report.summary.hybrid.maintenance_export_import_regeneration_rate).toBe(1);
    expect(report.markdown).toContain('| Maintenance OFF/ON No-Regression Rate |');
    expect(report.markdown).toContain('| Maintenance Export/Import Regeneration Rate |');
  });

  it('reports KG pruning keep-N and OFF/ON no-regression evidence', async () => {
    expect(report.summary.hybrid.kg_prune_retention_rate).toBe(1);
    expect(report.summary.hybrid.kg_prune_no_regression_rate).toBe(1);
    expect(report.markdown).toContain('| KG Prune Retention Rate |');
    expect(report.markdown).toContain('| KG Prune OFF/ON No-Regression Rate |');
  });

  it('reports community read-path no-regression, fallback, and bounds evidence', async () => {
    expect(report.summary.hybrid.community_read_path_default_off_rate).toBe(1);
    expect(report.summary.hybrid.community_disabled_no_regression_rate).toBe(1);
    expect(report.summary.hybrid.community_enabled_no_regression_rate).toBe(1);
    expect(report.summary.hybrid.community_fallback_rate).toBe(1);
    expect(report.summary.hybrid.community_no_fifth_lane_rate).toBe(1);
    expect(report.summary.hybrid.community_direct_kg_no_regression_rate).toBe(1);
    expect(report.summary.hybrid.community_multi_hop_no_regression_rate).toBe(1);
    expect(report.summary.hybrid.community_summary_bounds_rate).toBe(1);
    expect(report.summary.hybrid.community_coverage_bounds_rate).toBe(1);
    expect(report.summary.hybrid.community_enrichment_unavailable_fallback_rate).toBe(1);
    expect(report.summary.token_savings_metrics.community_read_path_default_off_rate).toBe(1);
    expect(report.summary.token_savings_metrics.community_disabled_no_regression_rate).toBe(1);
    expect(report.summary.token_savings_metrics.community_enabled_no_regression_rate).toBe(1);
    expect(report.summary.token_savings_metrics.community_no_fifth_lane_rate).toBe(1);
    expect(report.markdown).toContain('| Community Read Path Default-Off Rate |');
    expect(report.markdown).toContain('| Community Enabled No-Regression Rate |');
    expect(report.markdown).toContain('| Community Summary Bounds Rate |');
    expect(report.markdown).toContain('| Community Enrichment Unavailable Fallback Rate |');
  });

  it('formats an explicit community readiness gate section for rollout decisions', async () => {
    expect(report.markdown).toContain('## Community Read Path Readiness');
    expect(report.markdown).toContain('| Gate | Status | Rate |');
    expect(report.markdown).toContain('| Default-off preserved | PASS | 100.0% |');
    expect(report.markdown).toContain('| Disabled no-regression | PASS | 100.0% |');
    expect(report.markdown).toContain('| Enabled no-regression | PASS | 100.0% |');
    expect(report.markdown).toContain('| Missing/stale/degraded/rebuilding/failed fallback | PASS | 100.0% |');
    expect(report.markdown).toContain('| No fifth lane | PASS | 100.0% |');
    expect(report.markdown).toContain('| Direct KG no-regression | PASS | 100.0% |');
    expect(report.markdown).toContain('| Multi-hop no-regression | PASS | 100.0% |');
    expect(report.markdown).toContain('| Summary bounds | PASS | 100.0% |');
    expect(report.markdown).toContain('| Coverage bounds | PASS | 100.0% |');
    expect(report.markdown).toContain('| Enrichment-unavailable fallback | PASS | 100.0% |');
  });

  it('eval fixture path seeds graph candidates from kg_triples and never writes legacy facts', () => {
    const source = readFileSync(join(process.cwd(), 'src/evals/retrieval.ts'), 'utf-8');

    expect(source).toContain('INSERT INTO kg_triples');
    expect(source).not.toContain('observation_facts');
  });

  it('eval fallback readiness covers rebuilding and requires usable fallback hits', () => {
    const source = readFileSync(join(process.cwd(), 'src/evals/retrieval.ts'), 'utf-8');

    expect(source).toContain('kg_communities_rebuilding');
    expect(source).toContain('enrichmentUnavailableHybrid');
    expect(source).toContain('result.results.length > 0');
    expect(source).not.toContain('result.results.length >= 0');
  });

  it('reports ArcRift-style evidence gap metrics from hybrid retrieval', async () => {
    expect(report.summary.corpus.total_observations).toBeGreaterThanOrEqual(100);
    expect(report.summary.corpus.noise_observations).toBeGreaterThanOrEqual(90);
    expect(report.summary.case_mix.rephrased_cases).toBeGreaterThanOrEqual(8);
    expect(report.summary.hybrid.surgical_compression).toBeGreaterThanOrEqual(0.75);
    expect(report.summary.hybrid.hyde_lift_rate).toBeGreaterThan(0);
    expect(report.summary.hybrid.hybrid_rank_source_rate).toBe(1);
    expect(report.cases.some((result) => (
      result.hyde_rank !== null && (result.raw_rank === null || result.hyde_rank < result.raw_rank)
    ))).toBe(true);
    expect(report.markdown).toContain('## Corpus');
    expect(report.markdown).toContain('| Surgical Compression |');
    expect(report.markdown).toContain('| HyDE Lift Rate |');
  });

  it('keeps global sync recall discoverable under synthetic distractors', async () => {
    const syncCase = report.cases.find((result) => result.name === 'global sync recall');

    expect(syncCase).toBeDefined();
    expect(syncCase?.found).toBe(true);
    expect(syncCase?.rank).toBe(1);
  });

  it('supports explicit larger-corpus scale runs', async () => {
    const scaledReport = await runRetrievalEval({ noiseCount: 120 });

    expect(scaledReport.summary.corpus.noise_observations).toBe(120);
    expect(scaledReport.summary.corpus.total_observations).toBe(143);
    expect(scaledReport.summary.case_mix.rephrased_cases).toBeGreaterThanOrEqual(8);
    expect(scaledReport.summary.recall_at_1).toBeGreaterThanOrEqual(RETRIEVAL_EVAL_MIN_RECALL_AT_1);
    expect(scaledReport.summary.recall_at_k).toBeGreaterThanOrEqual(RETRIEVAL_EVAL_MIN_RECALL_AT_K);
  }, 20_000);

  it('includes a curated non-synthetic corpus slice in the ranking gate', async () => {
    expect(report.summary.corpus.non_synthetic_observations).toBeGreaterThanOrEqual(4);
    expect(report.summary.case_mix.non_synthetic_cases).toBeGreaterThanOrEqual(4);
    expect(report.cases.filter((result) => result.kind === 'non-synthetic').every((result) => result.rank === 1)).toBe(true);
    expect(report.markdown).toContain('| Non-synthetic observations |');
    expect(report.markdown).toContain('| Non-synthetic cases |');
  });
});
