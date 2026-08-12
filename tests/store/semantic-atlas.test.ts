import { describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';

function insertKgTriple(store: Store, input: {
  observationId: number;
  subject: string;
  relation: string;
  object: string;
  project: string | null;
  topicKey?: string | null;
}) {
  const db = store.getDb();
  const upsertEntity = db.prepare(
    `INSERT INTO kg_entities (entity_key, entity_type, canonical_name, aliases_json, metadata_json, updated_at)
     VALUES (?, 'concept', ?, '[]', '{}', datetime('now'))
     ON CONFLICT(entity_key) DO UPDATE SET updated_at = datetime('now')
     RETURNING id`,
  );
  const subject = upsertEntity.get(`atlas:${input.subject.toLowerCase()}`, input.subject) as { id: number };
  const object = upsertEntity.get(`atlas:${input.object.toLowerCase()}`, input.object) as { id: number };

  db.prepare(
    `INSERT INTO kg_triples (
      subject_entity_id, relation, object_entity_id, source_type, source_id,
      project, topic_key, provenance, confidence, triple_hash, extractor_version
    ) VALUES (?, ?, ?, 'observation', ?, ?, ?, ?, 0.9, ?, 'semantic-atlas-test')`,
  ).run(
    subject.id,
    input.relation,
    object.id,
    input.observationId,
    input.project,
    input.topicKey ?? null,
    `observation:${input.observationId}`,
    `atlas:${input.observationId}:${input.relation}:${input.object}`,
  );
}

function seedFreshAtlasSummary(store: Store, input: {
  project: string;
  sourceObservationId: number;
  summary: string;
}) {
  const db = store.getDb();
  const graphSignature = store.getCommunitySummaryState({ project: input.project }).current_graph_signature;
  const runId = db.prepare(
    `INSERT INTO kg_community_runs (
      run_key, project, algorithm, algorithm_version, summary_generator, config_hash, graph_signature,
      status, freshness, degraded, degraded_reasons_json, coverage_json, communities_count,
      entities_count, triples_count, source_observations_count, committed_at
    ) VALUES (?, ?, 'connected_components_v1', '1', 'extractive_v1', 'atlas-summary-test', ?,
      'committed', 'fresh', 0, '[]', '{}', 1, 2, 1, 1, datetime('now'))`,
  ).run(
    `atlas-summary-${input.sourceObservationId}`,
    input.project,
    graphSignature,
  ).lastInsertRowid as number;
  db.prepare(
    `INSERT INTO kg_communities (
      run_id, project, community_id, level, community_key, summary_text, summary_max_chars,
      entity_count, triple_count, source_observation_count, top_entities_json, top_relations_json,
      source_observation_ids_json, coverage_json, provenance_json, confidence, degraded, degraded_reasons_json
    ) VALUES (?, ?, ?, 0, ?, ?, 1200, 2, 1, 1, '["Atlas evidence"]', '["HAS_WHAT"]', ?, '{}', '{}', 0.9, 0, '[]')`,
  ).run(
    runId,
    input.project,
    `summary-community-${input.sourceObservationId}`,
    `atlas-summary-key-${input.sourceObservationId}`,
    input.summary,
    JSON.stringify([input.sourceObservationId]),
  );
}

describe('Store semantic atlas', () => {
  it('navigates complete token-scoped Universe, Community, and Neighborhood projections', async () => {
    const store = new Store(':memory:');
    try {
      const projects = [
        'semantic-<private>ALPHA_SECRET</private>',
        'semantic-<private>BETA_SECRET</private>',
      ];
      const observationIds: number[] = [];

      for (let index = 0; index < 36; index += 1) {
        const project = projects[index % projects.length]!;
        const saved = store.saveObservation({
          title: `Semantic memory ${index}`,
          content: index % 9 === 0
            ? `Legacy memory without structured graph evidence ${index}`
            : `**What**: Evidence for semantic memory ${index}`,
          project,
          session_id: `semantic-session-${index}`,
          topic_key: index % 7 === 0 ? undefined : `semantic/topic-${index}`,
          type: index % 2 === 0 ? 'decision' : 'discovery',
        });
        observationIds.push(saved.observation.id);

        // Keep some memories deliberately legacy-only: semantic completeness cannot
        // depend on KG, embeddings, topics, or committed community summaries.
        if (index % 9 !== 0) {
          insertKgTriple(store, {
            observationId: saved.observation.id,
            subject: `Semantic memory ${index}`,
            relation: 'USES',
            object: `evidence-group-${Math.floor(index / 12)}`,
            project,
            topicKey: index % 7 === 0 ? null : `semantic/topic-${index}`,
          });
        }
      }
      const legacyOnlyIds = observationIds.filter((_id, index) => index % 9 === 0);
      store.getDb().prepare(
        `DELETE FROM kg_triples WHERE source_type = 'observation' AND source_id IN (${legacyOnlyIds.map(() => '?').join(',')})`,
      ).run(...legacyOnlyIds);

      const universe = store.getSemanticAtlasPage({ level: 'universe' });
      expect(universe.level).toBe('universe');
      expect(universe.nodes.every((node) => node.kind === 'community')).toBe(true);
      expect(universe.nodes.reduce((sum, node) => sum + (node.member_count ?? 0), 0)).toBe(36);
      expect(universe.counts).toMatchObject({ memory_count: 36, project_count: 2 });
      expect(universe.counts.community_count).toBe(universe.nodes.length);
      expect(universe.counts.assigned_memory_count).toBe(36);
      expect(universe.coverage.observations_without_kg).toBe(4);
      expect(universe.nodes.some((node) => node.label.includes('evidence-group-'))).toBe(true);
      expect(universe.facets.projects).toHaveLength(2);
      expect(new Set(universe.facets.projects.map((option) => option.token)).size).toBe(2);
      expect(new Set(universe.facets.projects.map((option) => option.label)).size).toBe(2);
      expect(universe.edges.every((edge) => edge.kind === 'aggregate')).toBe(true);

      const serializedUniverse = JSON.stringify(universe);
      expect(serializedUniverse).not.toContain('ALPHA_SECRET');
      expect(serializedUniverse).not.toContain('BETA_SECRET');
      expect(serializedUniverse).not.toContain('<private>');

      const projectToken = universe.facets.projects[0]!.token;
      const scopedUniverse = store.getSemanticAtlasPage({
        level: 'universe',
        project_token: projectToken,
      });
      expect(scopedUniverse.counts.memory_count).toBe(18);
      expect(scopedUniverse.navigation.scope.project?.token).toBe(projectToken);

      seedFreshAtlasSummary(store, {
        project: projects[0]!,
        sourceObservationId: observationIds[0]!,
        summary: 'Architecture constellation <private>SUMMARY_ALPHA_SECRET</private>',
      });
      seedFreshAtlasSummary(store, {
        project: projects[1]!,
        sourceObservationId: observationIds[1]!,
        summary: 'Architecture constellation [private]SUMMARY_BETA_SECRET[/private]',
      });
      const summarizedUniverse = store.getSemanticAtlasPage({
        level: 'universe',
        project_token: projectToken,
      });
      expect(summarizedUniverse.coverage.summary_state).toBe('fresh');
      expect(summarizedUniverse.nodes.some((node) => node.label === 'Architecture constellation')).toBe(true);
      expect(JSON.stringify(summarizedUniverse)).not.toMatch(/SUMMARY_(?:ALPHA|BETA)_SECRET/);

      const communityIds = universe.nodes.map((node) => node.id);
      const accumulatedMemberIds = new Set<string>();
      for (const communityId of communityIds) {
        let cursor: string | undefined;
        do {
          const page = store.getSemanticAtlasPage({
            level: 'community',
            community_id: communityId,
            page_size: 5,
            cursor,
          });
          expect(page.nodes.every((node) => node.kind === 'observation')).toBe(true);
          page.nodes.forEach((node) => accumulatedMemberIds.add(node.id));
          expect(page.edges.every((edge) => (
            accumulatedMemberIds.has(edge.source_id) && accumulatedMemberIds.has(edge.target_id)
          ))).toBe(true);
          cursor = page.continuation ?? undefined;
        } while (cursor);
      }
      expect([...accumulatedMemberIds].sort()).toEqual(observationIds.map((id) => `obs:${id}`).sort());

      const focusNodeId = `obs:${observationIds[1]}`;
      const neighborhood = store.getSemanticAtlasPage({
        level: 'neighborhood',
        focus_node_id: focusNodeId,
        depth: 2,
        page_size: 250,
      });
      expect(neighborhood.level).toBe('neighborhood');
      expect(neighborhood.nodes.some((node) => node.id === focusNodeId)).toBe(true);
      expect(neighborhood.nodes.some((node) => node.kind === 'fact')).toBe(true);
      expect(neighborhood.nodes.length).toBeLessThanOrEqual(300);
      const neighborhoodIds = new Set(neighborhood.nodes.map((node) => node.id));
      expect(neighborhood.edges.every((edge) => (
        neighborhoodIds.has(edge.source_id) && neighborhoodIds.has(edge.target_id)
      ))).toBe(true);
      expect(neighborhood.edges.some((edge) => edge.kind === 'fact')).toBe(true);
      expect(neighborhood.navigation).toMatchObject({ focus_node_id: focusNodeId, depth: 2 });

      const context = store.getSemanticObservatoryContext({
        project_token: projectToken,
        query: 'Semantic memory',
      });
      expect(context.scope.project?.token).toBe(projectToken);
      const recall = await store.getSemanticObservatoryRecall({
        context_token: context.context_token,
        lanes: ['lexical'],
        limit: 3,
      });
      const hit = recall.lanes.lexical[0];
      expect(hit).toBeDefined();
      expect(hit?.project?.token).toBe(projectToken);
      expect(hit?.community_id).toMatch(/^community:/);
      const pivot = store.resolveSemanticObservatoryPivot({
        pivot_token: hit!.pivot_token,
        target: 'map',
      });
      expect(pivot).toMatchObject({
        focus_node_id: `obs:${hit!.observation_id}`,
        community_id: hit!.community_id,
        target: 'map',
      });
      expect(pivot.scope.project?.token).toBe(projectToken);
      const serializedSearch = JSON.stringify({ context, recall, pivot });
      expect(serializedSearch).not.toContain('ALPHA_SECRET');
      expect(serializedSearch).not.toContain('BETA_SECRET');
      expect(serializedSearch).not.toContain('<private>');
    } finally {
      store.close();
    }
  });

  it('partitions 6,000 memories without metadata or high-degree hubs collapsing natural groups', () => {
    const store = new Store(':memory:');
    try {
      const db = store.getDb();
      const insertFixture = db.transaction(() => {
        const insertSession = db.prepare(
          `INSERT INTO sessions (id, project, directory) VALUES (?, ?, NULL)`,
        );
        for (let index = 0; index < 120; index += 1) {
          insertSession.run(`dense-session-${index}`, `dense-project-${index % 12}`);
        }

        const insertObservation = db.prepare(
          `INSERT INTO observations (
            id, session_id, type, title, content, project, scope, topic_key,
            normalized_hash, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'project', ?, ?, datetime('now'), datetime('now'))`,
        );
        for (let id = 1; id <= 6_000; id += 1) {
          const group = Math.floor((id - 1) / 50);
          insertObservation.run(
            id,
            `dense-session-${group}`,
            id % 2 === 0 ? 'decision' : 'discovery',
            `Dense memory ${String(id).padStart(5, '0')} ${'shared-prefix-'.repeat(4)}`,
            `Structural evidence for dense memory ${id}`,
            `dense-project-${group % 12}`,
            `dense/topic/${group}`,
            `dense-hash-${id}`,
          );
        }

        const insertEntity = db.prepare(
          `INSERT INTO kg_entities (
            entity_key, entity_type, canonical_name, aliases_json, metadata_json, updated_at
          ) VALUES (?, 'concept', ?, '[]', '{}', datetime('now')) RETURNING id`,
        );
        const subjectId = (insertEntity.get('dense:subject', 'Dense memories') as { id: number }).id;
        const objects = new Map<string, number>();
        const objectId = (name: string): number => {
          const existing = objects.get(name);
          if (existing !== undefined) return existing;
          const inserted = insertEntity.get(`dense:${name}`, name) as { id: number };
          objects.set(name, inserted.id);
          return inserted.id;
        };
        const insertTriple = db.prepare(
          `INSERT INTO kg_triples (
            subject_entity_id, relation, object_entity_id, source_type, source_id,
            project, topic_key, provenance, confidence, triple_hash, extractor_version
          ) VALUES (?, ?, ?, 'observation', ?, ?, ?, ?, 0.9, ?, 'semantic-atlas-dense-test')`,
        );
        const addTriple = (observationId: number, relation: string, object: string, suffix = '') => {
          const group = Math.floor((observationId - 1) / 50);
          insertTriple.run(
            subjectId,
            relation,
            objectId(object),
            observationId,
            `dense-project-${group % 12}`,
            `dense/topic/${group}`,
            `observation:${observationId}`,
            `dense:${observationId}:${relation}:${object}:${suffix}`,
          );
        };

        // 118 natural groups of 50; the final 100 observations deliberately
        // remain structurally isolated and must still receive one assignment.
        for (let id = 1; id <= 5_900; id += 1) {
          addTriple(id, 'USES', `natural-group-${Math.floor((id - 1) / 50)}`);
        }
        // One evidence entity shared by every observation is a god node and
        // must be excluded before pair generation.
        for (let id = 1; id <= 6_000; id += 1) {
          addTriple(id, 'REFERENCES', 'global-workspace-god-node');
        }
        // Observation 1 bridges 80 otherwise independent groups. It is a
        // projection superhub; excluding it must preserve each natural group.
        for (let group = 1; group <= 80; group += 1) {
          const representativeId = (group * 50) + 1;
          addTriple(1, 'AFFECTS', `hub-bridge-${group}`, 'hub');
          addTriple(representativeId, 'AFFECTS', `hub-bridge-${group}`, 'representative');
        }
      });
      insertFixture();

      const universe = store.getSemanticAtlasPage({ level: 'universe' });
      expect(universe.counts.memory_count).toBe(6_000);
      expect(universe.nodes.length).toBeGreaterThanOrEqual(30);
      expect(universe.nodes.length).toBeLessThanOrEqual(150);
      expect(universe.nodes.reduce((sum, node) => sum + (node.member_count ?? 0), 0)).toBe(6_000);
      expect(Math.max(...universe.nodes.map((node) => node.member_count ?? 0))).toBeLessThanOrEqual(1_000);
      const aggregatePairs = universe.edges.map((edge) => [edge.source_id, edge.target_id].sort().join('|'));
      expect(new Set(aggregatePairs).size).toBe(aggregatePairs.length);

      const communityByObservation = new Map<string, string>();
      for (const community of universe.nodes) {
        let cursor: string | undefined;
        do {
          const page = store.getSemanticAtlasPage({
            level: 'community',
            community_id: community.id,
            cursor,
          });
          for (const node of page.nodes) communityByObservation.set(node.id, community.id);
          cursor = page.continuation ?? undefined;
        } while (cursor);
      }
      expect(communityByObservation.size).toBe(6_000);
      for (let group = 1; group <= 80; group += 1) {
        const naturalMembers = Array.from({ length: 50 }, (_, offset) => `obs:${(group * 50) + offset + 1}`);
        expect(new Set(naturalMembers.map((id) => communityByObservation.get(id))).size).toBe(1);
      }
    } finally {
      store.close();
    }
  }, 60_000);

  it('builds and names communities from configured structural KG evidence only', () => {
    const store = new Store(':memory:');
    try {
      for (let index = 0; index < 180; index += 1) {
        const region = index % 3;
        const saved = store.saveObservation({
          title: `Structural memory ${index}`,
          content: '**What**: Synthetic global content section',
          project: `structural-project-${region}`,
          session_id: `structural-session-${index}`,
          topic_key: `structural/topic-${index}`,
          type: 'decision',
        });
        insertKgTriple(store, {
          observationId: saved.observation.id,
          subject: `Structural memory ${index}`,
          relation: 'USES',
          object: `Region ${region} service`,
          project: `structural-project-${region}`,
          topicKey: `structural/topic-${index}`,
        });
        insertKgTriple(store, {
          observationId: saved.observation.id,
          subject: `Structural memory ${index}`,
          relation: 'USES',
          object: 'Synthetic global content section',
          project: `structural-project-${region}`,
          topicKey: `structural/topic-${index}`,
        });
      }

      const universe = store.getSemanticAtlasPage({ level: 'universe' });
      expect(universe.nodes.length).toBeGreaterThanOrEqual(30);
      expect(universe.edges.length).toBeGreaterThan(0);
      expect(new Set(universe.nodes.map((node) => node.label)).size).toBeGreaterThan(1);
      expect(universe.nodes.some((node) => node.label.includes('Region'))).toBe(true);
      expect(JSON.stringify(universe.nodes)).not.toContain('Synthetic global content section');
    } finally {
      store.close();
    }
  });

  it('rejects invalid facets, mixed cursors, changed generations, gone communities, and out-of-scope focus', () => {
    const store = new Store(':memory:');
    try {
      for (let index = 0; index < 8; index += 1) {
        const saved = store.saveObservation({
          title: `Mutable atlas memory ${index}`,
          content: `**What**: mutable-atlas-group`,
          project: 'mutable-atlas',
          session_id: `mutable-atlas-session-${index}`,
          topic_key: `mutable/atlas/${index}`,
          type: 'decision',
        });
        insertKgTriple(store, {
          observationId: saved.observation.id,
          subject: `Mutable atlas memory ${index}`,
          relation: 'HAS_WHAT',
          object: 'mutable-atlas-group',
          project: 'mutable-atlas',
          topicKey: `mutable/atlas/${index}`,
        });
      }
      const universe = store.getSemanticAtlasPage({ level: 'universe' });
      const communityId = universe.nodes[0]!.id;
      const firstPage = store.getSemanticAtlasPage({
        level: 'community',
        community_id: communityId,
        page_size: 1,
      });
      expect(firstPage.continuation).not.toBeNull();
      expect(() => store.getSemanticAtlasPage({
        level: 'universe',
        cursor: firstPage.continuation ?? undefined,
      })).toThrow(expect.objectContaining({ code: 'VIZ_ATLAS_CURSOR_INVALID' }));
      expect(() => store.getSemanticAtlasPage({
        level: 'universe',
        project_token: 'facet:project:not-current',
      })).toThrow(expect.objectContaining({ code: 'VIZ_ATLAS_FACET_INVALID' }));

      store.getDb().prepare(
        `UPDATE observations SET title = title || ' changed', updated_at = datetime('now', '+1 second') WHERE id = 1`,
      ).run();
      expect(() => store.getSemanticAtlasPage({
        level: 'community',
        community_id: communityId,
        page_size: 1,
        cursor: firstPage.continuation ?? undefined,
      })).toThrow(expect.objectContaining({ code: 'VIZ_ATLAS_GENERATION_STALE' }));

      store.getDb().prepare(`UPDATE observations SET deleted_at = datetime('now') WHERE id = 1`).run();
      expect(() => store.getSemanticAtlasPage({
        level: 'community',
        community_id: communityId,
      })).toThrow(expect.objectContaining({ code: 'VIZ_ATLAS_COMMUNITY_GONE' }));
      expect(() => store.getSemanticAtlasPage({
        level: 'neighborhood',
        focus_node_id: 'obs:1',
      })).toThrow(expect.objectContaining({ code: 'VIZ_ATLAS_FOCUS_INVALID' }));
    } finally {
      store.close();
    }
  });
});
