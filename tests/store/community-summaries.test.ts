import { describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';
import { runMigrationsWithSemantic } from '../../src/store/migrations.js';
import type {
  CommunityPreviewResult,
  CommunityRebuildResult,
  CommunityRetrievalResult,
  CommunityStateResult,
} from '../../src/store/types.js';

function tableColumns(store: Store, tableName: string): string[] {
  return (store.getDb().prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>)
    .map((column) => column.name);
}

function indexNames(store: Store): string[] {
  return (store.getDb().prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND (name LIKE 'idx_kg_community_%' OR name LIKE 'idx_kg_communities_%') ORDER BY name"
  ).all() as Array<{ name: string }>).map((row) => row.name);
}

function seedCommittedCommunity(store: Store): { runId: number; communityRowId: number; entityId: number; tripleId: number } {
  const db = store.getDb();
  const subject = db.prepare(
    "INSERT INTO kg_entities (entity_key, entity_type, canonical_name) VALUES ('entity:a', 'concept', 'Entity A')"
  ).run().lastInsertRowid as number;
  const object = db.prepare(
    "INSERT INTO kg_entities (entity_key, entity_type, canonical_name) VALUES ('entity:b', 'concept', 'Entity B')"
  ).run().lastInsertRowid as number;
  const triple = db.prepare(
    `INSERT INTO kg_triples (
      subject_entity_id, relation, object_entity_id, source_type, source_id, project, provenance, confidence, triple_hash
    ) VALUES (?, 'REFERENCES', ?, 'observation', 42, 'community-project', '{}', 0.8, 'triple-hash-a')`
  ).run(subject, object).lastInsertRowid as number;
  const run = db.prepare(
    `INSERT INTO kg_community_runs (
      run_key, project, algorithm, algorithm_version, summary_generator, config_hash, graph_signature,
      status, freshness, degraded, degraded_reasons_json, coverage_json, communities_count,
      entities_count, triples_count, source_observations_count, committed_at
    ) VALUES (
      'run-committed', 'community-project', 'connected_components_v1', '1', 'extractive_v1', 'cfg', 'graph-a',
      'committed', 'fresh', 0, '[]', '{"coverage":1}', 1, 2, 1, 1, datetime('now')
    )`
  ).run().lastInsertRowid as number;
  const community = db.prepare(
    `INSERT INTO kg_communities (
      run_id, project, community_id, level, community_key, summary_text, summary_max_chars,
      entity_count, triple_count, source_observation_count, top_entities_json, top_relations_json,
      source_observation_ids_json, coverage_json, provenance_json, confidence, degraded, degraded_reasons_json
    ) VALUES (?, 'community-project', 'c_abc', 0, 'community-key', 'Summary', 1200, 2, 1, 1,
      '["Entity A"]', '["REFERENCES"]', '[42]', '{"coverage":1}', '{"source":"test"}', 0.8, 0, '[]')`
  ).run(run).lastInsertRowid as number;
  db.prepare(
    `INSERT INTO kg_community_members (
      community_row_id, entity_id, project, run_id, community_id, role, entity_rank, evidence_count, provenance_json
    ) VALUES (?, ?, 'community-project', ?, 'c_abc', 'member', 1, 1, '{}')`
  ).run(community, subject, run);
  db.prepare(
    `INSERT INTO kg_community_evidence (
      community_row_id, triple_id, project, run_id, community_id, source_observation_id,
      relation, superseded, evidence_rank, evidence_text, provenance_json, coverage_json
    ) VALUES (?, ?, 'community-project', ?, 'c_abc', 42, 'REFERENCES', 0, 1, 'Entity A references Entity B', '{}', '{}')`
  ).run(community, triple, run);

  return { runId: run, communityRowId: community, entityId: subject, tripleId: triple };
}

function seedCommittedCommunitySnapshots(
  store: Store,
  project: string,
  summaries: Array<{
    communityId: string;
    summary: string;
    topEntities: string[];
    sourceObservationId: number;
  }>,
): number {
  const currentSignature = store.getCommunitySummaryState({ project }).current_graph_signature;
  const runId = store.getDb().prepare(
    `INSERT INTO kg_community_runs (
      run_key, project, algorithm, algorithm_version, summary_generator, config_hash, graph_signature,
      status, freshness, degraded, degraded_reasons_json, coverage_json, communities_count,
      entities_count, triples_count, source_observations_count, committed_at
    ) VALUES (?, ?, 'connected_components_v1', '1', 'extractive_v1', 'cfg', ?,
      'committed', 'fresh', 0, '[]', '{}', ?, ?, 0, ?, datetime('now'))`
  ).run(
    `run-${project}`,
    project,
    currentSignature,
    summaries.length,
    summaries.length * 2,
    summaries.length,
  ).lastInsertRowid as number;

  for (const [index, summary] of summaries.entries()) {
    store.getDb().prepare(
      `INSERT INTO kg_communities (
        run_id, project, community_id, level, community_key, summary_text, summary_max_chars,
        entity_count, triple_count, source_observation_count, top_entities_json, top_relations_json,
        source_observation_ids_json, coverage_json, provenance_json, confidence, degraded, degraded_reasons_json
      ) VALUES (?, ?, ?, 0, ?, ?, 1200, 2, 0, 1, ?, '["RELATES_TO"]', ?, '{}', '{}', ?, 0, '[]')`
    ).run(
      runId,
      project,
      summary.communityId,
      `${project}|${summary.communityId}`,
      summary.summary,
      JSON.stringify(summary.topEntities),
      JSON.stringify([summary.sourceObservationId]),
      0.75 + (index / 100),
    );
  }

  return runId;
}

function insertObservationSource(store: Store, project: string, title: string, content = 'source body'): number {
  store.getDb().prepare(
    'INSERT INTO sessions (id, project) VALUES (?, ?) ON CONFLICT(id) DO NOTHING'
  ).run(`${project}-fixture-session`, project);
  return store.getDb().prepare(
    `INSERT INTO observations (session_id, type, title, content, project, scope, normalized_hash, sync_id)
     VALUES (?, 'manual', ?, ?, ?, 'project', ?, ?)`
  ).run(
    `${project}-fixture-session`,
    title,
    content,
    project,
    `${project}-${title}-hash`,
    `${project}-${title}-sync`,
  ).lastInsertRowid as number;
}

function insertEntity(store: Store, key: string, name: string): number {
  return store.getDb().prepare(
    'INSERT INTO kg_entities (entity_key, entity_type, canonical_name) VALUES (?, ?, ?)'
  ).run(key, 'concept', name).lastInsertRowid as number;
}

function insertTriple(
  store: Store,
  input: {
    subject: number;
    relation: string;
    object: number;
    project: string;
    sourceId: number;
    hash: string;
    confidence?: number;
  },
): number {
  return store.getDb().prepare(
    `INSERT INTO kg_triples (
      subject_entity_id, relation, object_entity_id, source_type, source_id,
      project, provenance, confidence, triple_hash
    ) VALUES (?, ?, ?, 'observation', ?, ?, '{}', ?, ?)`
  ).run(
    input.subject,
    input.relation,
    input.object,
    input.sourceId,
    input.project,
    input.confidence ?? 0.9,
    input.hash,
  ).lastInsertRowid as number;
}

function seedProjectGraph(store: Store, project: string): void {
  const sourceA = insertObservationSource(store, project, `${project} source A`, 'alpha links beta');
  const sourceB = insertObservationSource(store, project, `${project} source B`, 'gamma links delta');
  const alpha = insertEntity(store, `${project}:alpha`, 'Alpha');
  const beta = insertEntity(store, `${project}:beta`, 'Beta');
  const gamma = insertEntity(store, `${project}:gamma`, 'Gamma');
  const delta = insertEntity(store, `${project}:delta`, 'Delta');

  insertTriple(store, {
    subject: alpha,
    relation: 'RELATES_TO',
    object: beta,
    project,
    sourceId: sourceA,
    hash: `${project}:alpha-beta`,
  });
  insertTriple(store, {
    subject: gamma,
    relation: 'DEPENDS_ON',
    object: delta,
    project,
    sourceId: sourceB,
    hash: `${project}:gamma-delta`,
  });
}

describe('Store — community summary schema foundation', () => {
  it('creates community summary schema tables', () => {
    const store = new Store(':memory:');
    try {
      const tableNames = (store.getDb().prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name IN ('kg_community_runs', 'kg_communities', 'kg_community_members', 'kg_community_evidence')
         ORDER BY name`
      ).all() as Array<{ name: string }>).map((row) => row.name);

      expect(tableNames).toEqual([
        'kg_communities',
        'kg_community_evidence',
        'kg_community_members',
        'kg_community_runs',
      ]);
      expect(tableColumns(store, 'kg_community_runs')).toEqual(expect.arrayContaining([
        'project',
        'run_key',
        'algorithm',
        'algorithm_version',
        'status',
        'freshness',
        'degraded',
        'degraded_reasons_json',
        'coverage_json',
        'graph_signature',
      ]));
      expect(tableColumns(store, 'kg_communities')).toEqual(expect.arrayContaining([
        'run_id',
        'project',
        'community_id',
        'summary_text',
        'top_entities_json',
        'top_relations_json',
        'source_observation_ids_json',
        'coverage_json',
        'provenance_json',
      ]));
      expect(tableColumns(store, 'kg_community_members')).toEqual(expect.arrayContaining([
        'community_row_id',
        'entity_id',
        'project',
        'run_id',
        'community_id',
      ]));
      expect(tableColumns(store, 'kg_community_evidence')).toEqual(expect.arrayContaining([
        'community_row_id',
        'triple_id',
        'source_observation_id',
        'relation',
        'superseded',
        'evidence_rank',
      ]));
    } finally {
      store.close();
    }
  });

  it('indexes support canonical community lookup', () => {
    const store = new Store(':memory:');
    try {
      const seeded = seedCommittedCommunity(store);
      const indexes = indexNames(store);

      expect(indexes).toEqual(expect.arrayContaining([
        'idx_kg_community_runs_project_status_freshness',
        'idx_kg_communities_project_run',
        'idx_kg_community_members_entity',
        'idx_kg_community_evidence_triple',
        'idx_kg_community_evidence_source_observation',
      ]));

      const row = store.getDb().prepare(
        `SELECT c.community_id, m.entity_id, e.triple_id
         FROM kg_community_runs r
         JOIN kg_communities c ON c.run_id = r.id
         JOIN kg_community_members m ON m.community_row_id = c.id
         JOIN kg_community_evidence e ON e.community_row_id = c.id
         WHERE r.project = ? AND r.status = 'committed' AND r.freshness = 'fresh'
           AND c.run_id = ? AND m.entity_id = ? AND e.triple_id = ?`
      ).get('community-project', seeded.runId, seeded.entityId, seeded.tripleId);

      expect(row).toEqual({
        community_id: 'c_abc',
        entity_id: seeded.entityId,
        triple_id: seeded.tripleId,
      });
    } finally {
      store.close();
    }
  });

  it('export/import excludes community artifacts', () => {
    const source = new Store(':memory:');
    const target = new Store(':memory:');
    try {
      source.saveObservation({
        title: 'Portable source',
        content: 'Community artifacts are derived from portable source memory.',
        project: 'community-project',
      });
      seedCommittedCommunity(source);

      const exported = source.exportData('community-project');
      const portableJson = JSON.stringify(exported);

      expect(Object.keys(exported).sort()).toEqual(['exported_at', 'observations', 'project', 'prompts', 'sessions', 'version']);
      expect(exported.version).toBe(1);
      expect(exported).not.toHaveProperty('kg_community_runs');
      expect(portableJson).not.toContain('kg_community_');

      target.importData(exported);
      const targetCommunityRuns = target.getDb().prepare(
        'SELECT COUNT(*) AS count FROM kg_community_runs'
      ).get() as { count: number };

      expect(targetCommunityRuns.count).toBe(0);
      expect(target.exportData('community-project').version).toBe(1);
    } finally {
      source.close();
      target.close();
    }
  });

  it('migrations are idempotent', () => {
    const store = new Store(':memory:');
    try {
      seedCommittedCommunity(store);

      expect(() => {
        runMigrationsWithSemantic(store.getDb(), {});
        runMigrationsWithSemantic(store.getDb(), {});
      }).not.toThrow();

      const runs = store.getDb().prepare(
        "SELECT COUNT(*) AS count FROM kg_community_runs WHERE run_key = 'run-committed'"
      ).get() as { count: number };
      expect(runs.count).toBe(1);
    } finally {
      store.close();
    }
  });

  it('failed run leaves prior committed rows readable', () => {
    const store = new Store(':memory:');
    try {
      const seeded = seedCommittedCommunity(store);
      store.getDb().prepare(
        `INSERT INTO kg_community_runs (
          run_key, project, algorithm, algorithm_version, summary_generator, config_hash, graph_signature,
          status, freshness, degraded, degraded_reasons_json, coverage_json, error, failed_at
        ) VALUES (
          'run-failed', 'community-project', 'connected_components_v1', '1', 'extractive_v1', 'cfg', 'graph-b',
          'failed', 'failed', 1, '["test failure"]', '{}', 'boom', datetime('now')
        )`
      ).run();

      const readable = store.getDb().prepare(
        `SELECT c.id, c.summary_text
         FROM kg_community_runs r
         JOIN kg_communities c ON c.run_id = r.id
         WHERE r.project = ? AND r.status = 'committed'
         ORDER BY r.committed_at DESC, r.id DESC
         LIMIT 1`
      ).get('community-project');

      expect(readable).toEqual({
        id: seeded.communityRowId,
        summary_text: 'Summary',
      });
    } finally {
      store.close();
    }
  });

  it('community type shapes are present', () => {
    const store = new Store(':memory:');
    try {
      const state: CommunityStateResult = store.getCommunitySummaryState({ project: 'shape-project' });
      const preview: CommunityPreviewResult = store.previewCommunitySummaries({ project: 'shape-project', limit: 2 });
      const rebuild: CommunityRebuildResult = store.rebuildCommunitySummaries({ project: 'shape-project' });
      const retrieval: CommunityRetrievalResult = store.getCommunitySummariesForRetrieval({
        project: 'shape-project',
        limit: 2,
        maxChars: 240,
      });

      expect(state.state).toBe('missing');
      expect(preview).toMatchObject({
        project: 'shape-project',
        state: 'empty',
        would_commit: false,
      });
      expect(rebuild).toMatchObject({
        project: 'shape-project',
        status: 'committed',
        freshness: 'empty',
        algorithm: 'connected_components',
      });
      expect(retrieval).toMatchObject({
        project: 'shape-project',
        state: 'empty',
        candidates: [],
      });
    } finally {
      store.close();
    }
  });

  it('rebuild is project-scoped and scoped', () => {
    const store = new Store(':memory:');
    try {
      seedProjectGraph(store, 'community-a');
      seedProjectGraph(store, 'community-b');

      const result = store.rebuildCommunitySummaries({ project: 'community-a' });

      expect(result.status).toBe('committed');
      expect(result.communities_created).toBe(2);
      expect(store.getCommunitySummaryState({ project: 'community-a' }).state).toBe('fresh');
      expect(store.getCommunitySummaryState({ project: 'community-b' }).state).toBe('missing');
      expect(store.getDb().prepare(
        "SELECT COUNT(*) AS count FROM kg_communities WHERE project = 'community-b'"
      ).get()).toEqual({ count: 0 });
    } finally {
      store.close();
    }
  });

  it('connected-components is deterministic', () => {
    const store = new Store(':memory:');
    try {
      seedProjectGraph(store, 'deterministic-community');

      store.rebuildCommunitySummaries({ project: 'deterministic-community' });
      const first = store.getCommunitySummariesForRetrieval({
        project: 'deterministic-community',
        limit: 10,
      }).candidates.map((candidate) => ({
        community_id: candidate.community_id,
        entities: candidate.top_entities,
        observations: candidate.source_observation_ids,
      }));

      store.rebuildCommunitySummaries({ project: 'deterministic-community' });
      const second = store.getCommunitySummariesForRetrieval({
        project: 'deterministic-community',
        limit: 10,
      }).candidates.map((candidate) => ({
        community_id: candidate.community_id,
        entities: candidate.top_entities,
        observations: candidate.source_observation_ids,
      }));

      expect(second).toEqual(first);
      expect(first).toHaveLength(2);
    } finally {
      store.close();
    }
  });

  it('community recall matches relevant summaries before applying the retrieval limit', async () => {
    const store = new Store(':memory:', {
      communitySummaries: {
        enabled: true,
        readPath: { enabled: true },
        maxRetrievalCommunities: 2,
      },
    });
    try {
      const project = 'late-community-match';
      const sourceIds = [
        insertObservationSource(store, project, 'source 1', 'ordinary first source'),
        insertObservationSource(store, project, 'source 2', 'ordinary second source'),
        insertObservationSource(store, project, 'source 3', 'ordinary third source'),
        insertObservationSource(store, project, 'source 4', 'ordinary fourth source'),
      ];
      seedCommittedCommunitySnapshots(store, project, [
        { communityId: 'c_001', summary: 'Routine cache summary', topEntities: ['Cache'], sourceObservationId: sourceIds[0] },
        { communityId: 'c_002', summary: 'Routine queue summary', topEntities: ['Queue'], sourceObservationId: sourceIds[1] },
        { communityId: 'c_003', summary: 'Routine billing summary', topEntities: ['Billing'], sourceObservationId: sourceIds[2] },
        { communityId: 'c_004', summary: 'Needle authz gateway summary', topEntities: ['NeedleAuthz'], sourceObservationId: sourceIds[3] },
      ]);

      const retrieval = await store.hybridRetrieve({
        query: 'needle authz gateway',
        project,
        limit: 5,
      });
      const communityCandidates = retrieval.results.flatMap((hit) =>
        hit.evidence.byLane.kg?.filter((candidate) => candidate.source === 'kg_community_summary') ?? []
      );

      expect(communityCandidates).toHaveLength(1);
      expect(communityCandidates.length).toBeLessThanOrEqual(store.config.communitySummaries.maxRetrievalCommunities);
      expect(retrieval.laneOrder).toEqual(['sentence', 'kg', 'chunk', 'lexical']);
      expect(new Set(retrieval.results.flatMap((hit) => hit.lanes))).not.toContain('community');
      expect(retrieval.results.flatMap((hit) => Object.keys(hit.evidence.byLane))).not.toContain('community');
      expect(communityCandidates[0]).toMatchObject({
        lane: 'kg',
        source: 'kg_community_summary',
        observationId: sourceIds[3],
        community: { communityId: 'c_004' },
      });
    } finally {
      store.close();
    }
  });

  it('enrichment unavailable commits extractive summaries with degraded state', () => {
    const store = new Store(':memory:', {
      communitySummaries: {
        enabled: true,
        enrichment: {
          enabled: true,
        },
      },
    });
    try {
      seedProjectGraph(store, 'enrichment-unavailable-community');

      const rebuild = store.rebuildCommunitySummaries({ project: 'enrichment-unavailable-community' });
      const state = store.getCommunitySummaryState({ project: 'enrichment-unavailable-community' });
      const retrieval = store.getCommunitySummariesForRetrieval({ project: 'enrichment-unavailable-community' });

      expect(rebuild).toMatchObject({
        status: 'committed',
        freshness: 'degraded',
        communities_created: 2,
      });
      expect(rebuild.degraded_reasons).toContain('enrichment_unavailable');
      expect(state).toMatchObject({
        state: 'degraded',
        degraded: true,
      });
      expect(state.degraded_reasons).toContain('enrichment_unavailable');
      expect(retrieval.candidates).toHaveLength(2);
      expect(retrieval.candidates.every((candidate) => candidate.summary_text.length > 0)).toBe(true);
      expect(retrieval.candidates.every((candidate) => candidate.degraded_reasons.includes('enrichment_unavailable'))).toBe(true);
    } finally {
      store.close();
    }
  });

  it('repeated rebuild converges without duplicate active artifacts', () => {
    const store = new Store(':memory:');
    try {
      seedProjectGraph(store, 'converged-community');

      store.rebuildCommunitySummaries({ project: 'converged-community' });
      store.rebuildCommunitySummaries({ project: 'converged-community' });

      const latest = store.getCommunitySummaryState({ project: 'converged-community' });
      const activeRows = store.getDb().prepare(
        `SELECT
           (SELECT COUNT(*) FROM kg_community_runs WHERE project = ? AND status = 'committed' AND freshness = 'fresh') AS runs,
           (SELECT COUNT(*) FROM kg_communities WHERE project = ? AND freshness = 'fresh') AS communities,
           (SELECT COUNT(*) FROM kg_community_members WHERE project = ? AND run_id = ?) AS members,
           (SELECT COUNT(*) FROM kg_community_evidence WHERE project = ? AND run_id = ?) AS evidence`
      ).get(
        'converged-community',
        'converged-community',
        'converged-community',
        latest.latest_committed_run_id,
        'converged-community',
        latest.latest_committed_run_id,
      ) as { runs: number; communities: number; members: number; evidence: number };

      expect(latest.state).toBe('fresh');
      expect(latest.communities_count).toBe(2);
      expect(activeRows).toEqual({
        runs: 1,
        communities: 2,
        members: 4,
        evidence: 2,
      });
    } finally {
      store.close();
    }
  });

  it('empty KG commits explicit empty fallback state', () => {
    const store = new Store(':memory:');
    try {
      const rebuild = store.rebuildCommunitySummaries({ project: 'empty-community' });
      const state = store.getCommunitySummaryState({ project: 'empty-community' });
      const retrieval = store.getCommunitySummariesForRetrieval({ project: 'empty-community' });

      expect(rebuild).toMatchObject({
        status: 'committed',
        freshness: 'empty',
        communities_created: 0,
        entities_scanned: 0,
        triples_scanned: 0,
        source_observations_scanned: 0,
      });
      expect(state).toMatchObject({
        state: 'empty',
        communities_count: 0,
        degraded: true,
      });
      expect(state.degraded_reasons).toContain('empty_kg');
      expect(retrieval).toMatchObject({
        state: 'empty',
        candidates: [],
      });
    } finally {
      store.close();
    }
  });

  it('community rebuild ignores legacy observation_facts when KG is empty', () => {
    const store = new Store(':memory:', { graphFactsSource: 'legacy' });
    try {
      const legacySource = insertObservationSource(
        store,
        'legacy-only-community',
        'legacy source',
        'legacy facts must not become community graph input',
      );
      store.getDb().exec(`
        CREATE TABLE observation_facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          observation_id INTEGER NOT NULL,
          subject TEXT NOT NULL,
          relation TEXT NOT NULL,
          object TEXT NOT NULL,
          project TEXT,
          topic_key TEXT,
          type TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      store.getDb().prepare(
        `INSERT INTO observation_facts (observation_id, subject, relation, object, project, topic_key, type)
         VALUES (?, 'Legacy Subject', 'DEPENDS_ON', 'Legacy Object', 'legacy-only-community', 'legacy/topic', 'decision')`
      ).run(legacySource);

      const rebuild = store.rebuildCommunitySummaries({ project: 'legacy-only-community' });

      expect(rebuild.freshness).toBe('empty');
      expect(rebuild.triples_scanned).toBe(0);
      expect(rebuild.communities_created).toBe(0);
      expect(store.getCommunitySummariesForRetrieval({ project: 'legacy-only-community' }).candidates).toEqual([]);
    } finally {
      store.close();
    }
  });

  it('KG mutation marks stale', () => {
    const store = new Store(':memory:');
    try {
      seedProjectGraph(store, 'stale-community');
      store.rebuildCommunitySummaries({ project: 'stale-community' });
      expect(store.getCommunitySummaryState({ project: 'stale-community' }).state).toBe('fresh');

      store.saveObservation({
        title: 'new KG source',
        content: '**What**: a new relationship enters the graph',
        project: 'stale-community',
      });

      const state = store.getCommunitySummaryState({ project: 'stale-community' });
      expect(state.state).toBe('stale');
      expect(state.degraded_reasons).toContain('saveObservation');
    } finally {
      store.close();
    }
  });

  it('retrieval reads the latest committed run without marking graph drift stale', () => {
    const store = new Store(':memory:');
    try {
      seedProjectGraph(store, 'retrieval-no-signature-scan');
      store.rebuildCommunitySummaries({ project: 'retrieval-no-signature-scan' });

      const source = insertObservationSource(store, 'retrieval-no-signature-scan', 'new direct source', 'new direct graph source');
      const subject = insertEntity(store, 'retrieval-no-signature-scan:new-subject', 'New Subject');
      const object = insertEntity(store, 'retrieval-no-signature-scan:new-object', 'New Object');
      insertTriple(store, {
        subject,
        relation: 'RELATES_TO',
        object,
        project: 'retrieval-no-signature-scan',
        sourceId: source,
        hash: 'retrieval-no-signature-scan:new-triple',
      });

      const retrieval = store.getCommunitySummariesForRetrieval({ project: 'retrieval-no-signature-scan' });
      const runFreshness = store.getDb().prepare(
        "SELECT freshness FROM kg_community_runs WHERE project = ? AND status = 'committed' ORDER BY id DESC LIMIT 1"
      ).get('retrieval-no-signature-scan') as { freshness: string };

      expect(retrieval.state).toBe('fresh');
      expect(retrieval.candidates.length).toBeGreaterThan(0);
      expect(runFreshness.freshness).toBe('fresh');
    } finally {
      store.close();
    }
  });

  it('explicit state returns graph_signature_changed when it first detects signature drift', () => {
    const store = new Store(':memory:');
    try {
      seedProjectGraph(store, 'state-drift-reason');
      store.rebuildCommunitySummaries({ project: 'state-drift-reason' });

      const source = insertObservationSource(store, 'state-drift-reason', 'new direct source', 'new direct graph source');
      const subject = insertEntity(store, 'state-drift-reason:new-subject', 'New Subject');
      const object = insertEntity(store, 'state-drift-reason:new-object', 'New Object');
      insertTriple(store, {
        subject,
        relation: 'RELATES_TO',
        object,
        project: 'state-drift-reason',
        sourceId: source,
        hash: 'state-drift-reason:new-triple',
      });

      const state = store.getCommunitySummaryState({ project: 'state-drift-reason' });

      expect(state.state).toBe('stale');
      expect(state.degraded_reasons).toContain('graph_signature_changed');
    } finally {
      store.close();
    }
  });

  it('failed rebuild keeps prior commit', () => {
    const store = new Store(':memory:');
    try {
      seedProjectGraph(store, 'failure-community');
      const committed = store.rebuildCommunitySummaries({ project: 'failure-community' });
      const before = store.getCommunitySummariesForRetrieval({ project: 'failure-community' }).candidates;

      store.getDb().exec(`
        CREATE TRIGGER fail_community_insert
        BEFORE INSERT ON kg_communities
        BEGIN
          SELECT RAISE(FAIL, 'forced community insert failure');
        END;
      `);
      const failed = store.rebuildCommunitySummaries({ project: 'failure-community' });

      expect(failed.status).toBe('failed');
      expect(failed.run_id).not.toBe(committed.run_id);
      expect(store.getCommunitySummaryState({ project: 'failure-community' }).state).toBe('failed');
      expect(store.getCommunitySummariesForRetrieval({ project: 'failure-community' }).candidates).toEqual(before);
    } finally {
      store.close();
    }
  });

  it('community read-path fallback keeps baseline retrieval usable for unavailable states', async () => {
    const store = new Store(':memory:', {
      communitySummaries: {
        enabled: true,
        readPath: { enabled: true },
      },
    });
    try {
      const seedFallbackProject = (project: string): number => {
        seedProjectGraph(store, project);
        return Number((store.getDb().prepare(
          'SELECT id FROM observations WHERE project = ? ORDER BY id LIMIT 1'
        ).get(project) as { id: number }).id);
      };
      const assertFallback = async (project: string, marker: string, expectedObservationId: number): Promise<void> => {
        const retrieval = await store.hybridRetrieve({
          query: 'alpha beta',
          project,
          limit: 5,
        });

        expect(retrieval.degradedFallback).toContain(marker);
        expect(retrieval.results.some((hit) => hit.observation.id === expectedObservationId)).toBe(true);
        expect(retrieval.results.flatMap((hit) => hit.evidence.byLane.kg ?? []))
          .not.toEqual(expect.arrayContaining([
            expect.objectContaining({ source: 'kg_community_summary' }),
          ]));
        expect(new Set(retrieval.results.flatMap((hit) => hit.lanes))).not.toContain('community');
      };

      const missingSource = seedFallbackProject('fallback-missing-community');
      await assertFallback('fallback-missing-community', 'kg_communities_missing', missingSource);

      const staleSource = seedFallbackProject('fallback-stale-community');
      store.rebuildCommunitySummaries({ project: 'fallback-stale-community' });
      store.markCommunitySummariesStale('fallback-stale-community', 'test_stale');
      await assertFallback('fallback-stale-community', 'kg_communities_stale', staleSource);

      const degradedSource = seedFallbackProject('fallback-degraded-community');
      store.config.communitySummaries.algorithm = 'louvain';
      store.rebuildCommunitySummaries({ project: 'fallback-degraded-community' });
      await assertFallback('fallback-degraded-community', 'kg_communities_degraded', degradedSource);
      store.config.communitySummaries.algorithm = 'connected_components';

      const rebuildingSource = seedFallbackProject('fallback-rebuilding-community');
      store.rebuildCommunitySummaries({ project: 'fallback-rebuilding-community' });
      store.getDb().prepare(
        `INSERT INTO kg_community_runs (
          run_key, project, algorithm, algorithm_version, summary_generator, config_hash, graph_signature,
          status, freshness, degraded, degraded_reasons_json, coverage_json
        ) VALUES (
          'running-fallback', 'fallback-rebuilding-community', 'connected_components_v1', '1', 'extractive_v1',
          'cfg', 'graph-running', 'running', 'fresh', 1, '["test_rebuilding"]', '{}'
        )`
      ).run();
      await assertFallback('fallback-rebuilding-community', 'kg_communities_rebuilding', rebuildingSource);

      const failedSource = seedFallbackProject('fallback-failed-community');
      store.rebuildCommunitySummaries({ project: 'fallback-failed-community' });
      store.getDb().exec(`
        CREATE TRIGGER fail_fallback_community_insert
        BEFORE INSERT ON kg_communities
        BEGIN
          SELECT RAISE(FAIL, 'forced fallback community insert failure');
        END;
      `);
      store.rebuildCommunitySummaries({ project: 'fallback-failed-community' });
      await assertFallback('fallback-failed-community', 'kg_communities_failed', failedSource);
    } finally {
      store.close();
    }
  });

  it('preview and drop are bounded and scoped', () => {
    const store = new Store(':memory:');
    try {
      seedProjectGraph(store, 'preview-a');
      seedProjectGraph(store, 'preview-b');
      const sourceCountBefore = store.getDb().prepare(
        'SELECT COUNT(*) AS count FROM observations'
      ).get() as { count: number };
      const kgCountBefore = store.getDb().prepare(
        'SELECT COUNT(*) AS count FROM kg_triples'
      ).get() as { count: number };

      const preview = store.previewCommunitySummaries({ project: 'preview-a', limit: 1, maxChars: 80 });
      expect(preview.would_commit).toBe(false);
      expect(preview.communities).toHaveLength(1);
      expect(preview.truncated).toBe(true);
      expect(store.getCommunitySummaryState({ project: 'preview-a' }).state).toBe('missing');

      store.rebuildCommunitySummaries({ project: 'preview-a' });
      store.rebuildCommunitySummaries({ project: 'preview-b' });
      const drop = store.dropCommunitySummaries({ project: 'preview-a' });

      expect(drop.communities_deleted).toBeGreaterThan(0);
      expect(store.getCommunitySummaryState({ project: 'preview-a' }).state).toBe('missing');
      expect(store.getCommunitySummaryState({ project: 'preview-b' }).state).toBe('fresh');
      expect(store.getDb().prepare('SELECT COUNT(*) AS count FROM observations').get()).toEqual(sourceCountBefore);
      expect(store.getDb().prepare('SELECT COUNT(*) AS count FROM kg_triples').get()).toEqual(kgCountBefore);
    } finally {
      store.close();
    }
  });
});
