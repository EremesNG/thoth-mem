import { describe, expect, it } from 'vitest';
import { writeDeterministicKgFacts } from '../../src/indexing/jobs.js';
import { Store } from '../../src/store/index.js';
import { formatProjectGraph } from '../../src/tools/project-views.js';

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
     RETURNING id`
  );
  const subject = upsertEntity.get(`test:${input.subject.toLowerCase()}`, input.subject) as { id: number };
  const object = upsertEntity.get(`test:${input.object.toLowerCase()}`, input.object) as { id: number };

  db.prepare(
    `INSERT INTO kg_triples (
      subject_entity_id, relation, object_entity_id, source_type, source_id,
      project, topic_key, provenance, confidence, triple_hash, extractor_version
    ) VALUES (?, ?, ?, 'observation', ?, ?, ?, ?, 0.9, ?, 'test')`
  ).run(
    subject.id,
    input.relation,
    object.id,
    input.observationId,
    input.project,
    input.topicKey ?? null,
    `observation:${input.observationId}`,
    `test:${input.observationId}:${input.relation}:${input.subject}:${input.object}`
  );
}

describe('Store visualization', () => {
  it('returns deterministic projection coordinates for unchanged slice scope', () => {
    const store = new Store(':memory:');

    try {
      store.saveObservation({
        title: 'Auth map',
        content: '<private>secret</private> Public auth summary',
        project: 'viz-project',
        topic_key: 'architecture/auth',
        type: 'architecture',
      });
      store.saveObservation({
        title: 'Cache map',
        content: 'Cache summary',
        project: 'viz-project',
        topic_key: 'architecture/cache',
        type: 'pattern',
      });

      const first = store.getVisualizationSlice({ project: 'viz-project', max_nodes: 10, max_edges: 10, depth: 1 });
      const second = store.getVisualizationSlice({ project: 'viz-project', max_nodes: 10, max_edges: 10, depth: 1 });

      expect(first.nodes.map((node) => ({ id: node.id, x: node.seed_x, y: node.seed_y })))
        .toEqual(second.nodes.map((node) => ({ id: node.id, x: node.seed_x, y: node.seed_y })));
      expect(first.nodes.some((node) => node.snippet.includes('secret'))).toBe(false);
    } finally {
      store.close();
    }
  });

  it('reports pending and degraded semantic health states', () => {
    const store = new Store(':memory:');

    try {
      store.saveObservation({
        title: 'Telemetry target',
        content: 'Index telemetry should expose queue and coverage details.',
        project: 'viz-project',
      });
      const pending = store.getVisualizationHealth({ project: 'viz-project' });
      expect(['pending', 'degraded', 'ready', 'rebuilding']).toContain(pending.semantic_state);
      expect(pending.semantic.jobs.pending).toBeGreaterThan(0);
      expect(pending.semantic.jobs.total).toBeGreaterThanOrEqual(pending.semantic.jobs.pending);
      expect(pending.semantic.jobs.oldest_pending_at).toEqual(expect.any(String));
      expect(pending.semantic.jobs.queue_lag_ms).toEqual(expect.any(Number));
      expect(pending.semantic.jobs.by_kind.some((job) => (
        job.kind === 'chunk'
        && job.pending > 0
        && job.oldest_pending_at !== null
        && typeof job.oldest_pending_age_ms === 'number'
      ))).toBe(true);
      expect(pending.semantic.coverage.observations).toBe(1);
      expect(pending.semantic.coverage.chunk_coverage).toBeGreaterThanOrEqual(0);
      expect(pending.semantic.coverage.chunk_coverage).toBeLessThanOrEqual(1);
      expect(pending.semantic.lanes.map((lane) => lane.lane).sort()).toEqual(['chunk', 'sentence']);
      expect(Array.isArray(pending.semantic.recent_errors)).toBe(true);

      store.getDb().prepare("UPDATE semantic_index_state SET degraded = 1, pending = 0 WHERE lane IN ('chunk','sentence')").run();
      const degraded = store.getVisualizationHealth({ project: 'viz-project' });
      expect(degraded.semantic_state).toBe('degraded');
    } finally {
      store.close();
    }
  });

  it('supports viz filtering by session/relation/query and returns richer filter metadata', () => {
    const store = new Store(':memory:');
    try {
      const first = store.saveObservation({
        title: 'Auth decision',
        content: '**What**: Token cache',
        project: 'viz-rich',
        session_id: 'session-a',
        topic_key: 'architecture/auth',
        type: 'decision',
      });
      const second = store.saveObservation({
        title: 'Billing discovery',
        content: '**Why**: Retry strategy',
        project: 'viz-rich',
        session_id: 'session-b',
        topic_key: 'product/billing',
        type: 'discovery',
      });
      writeDeterministicKgFacts(store, first.observation.id);
      writeDeterministicKgFacts(store, second.observation.id);

      const slice = store.getVisualizationSlice({
        project: 'viz-rich',
        session_id: 'session-a',
        relation: 'HAS_WHAT',
        query: 'token',
        observation_type: 'decision',
        max_nodes: 100,
        max_edges: 100,
      });

      expect(slice.edges.length).toBeGreaterThan(0);
      expect(slice.edges.every((edge) => ['fact', 'metadata'].includes(edge.kind ?? ''))).toBe(true);
      expect(slice.nodes.some((node) => node.kind === 'session')).toBe(true);
      expect(slice.nodes.some((node) => node.kind === 'project')).toBe(true);
      expect(slice.nodes.every((node) => !node.snippet.includes('<private>'))).toBe(true);

      const filters = store.getVisualizationFilters({ project: 'viz-rich' });
      expect(filters.sessions).toContain('session-a');
      expect(filters.sessions).toContain('session-b');
      expect(filters.relations).toContain('HAS_WHAT');
      expect(filters.relations).toContain('HAS_WHY');
    } finally {
      store.close();
    }
  });

  it('lists the full graph-lite relation vocabulary and exposes public graph row shapes', () => {
    const store = new Store(':memory:');
    try {
      const saved = store.saveObservation({
        title: 'Vocabulary graph memory',
        content: [
          '**What**: Vocabulary content',
          '**Why**: Relation filters should be complete',
          '**Where**: tests/store/visualization.test.ts',
          '**Learned**: Public graph rows stay KG-backed',
        ].join('\n'),
        project: 'viz-vocabulary',
        session_id: 'viz-vocabulary-session',
        topic_key: 'kg/vocabulary',
        type: 'decision',
      });

      const filters = store.getVisualizationFilters({ project: 'viz-vocabulary' });
      const slice = store.getVisualizationSlice({
        project: 'viz-vocabulary',
        relation: 'HAS_LEARNED',
        query: 'public graph',
        max_nodes: 50,
        max_edges: 50,
      });
      const ledger = store.getObservatoryLedgerDetail({ observation_id: saved.observation.id });
      const projectGraph = formatProjectGraph(store, 'viz-vocabulary', { relation: 'HAS_LEARNED', maxChars: 1000 });

      expect(filters.relations).toEqual([
        'HAS_LEARNED',
        'HAS_TOPIC_KEY',
        'HAS_TYPE',
        'HAS_WHAT',
        'HAS_WHERE',
        'HAS_WHY',
        'IN_PROJECT',
      ]);
      expect(slice.edges).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          source_id: `obs:${saved.observation.id}`,
          target_id: expect.any(String),
          relation: 'HAS_LEARNED',
          kind: 'fact',
        }),
      ]));
      expect(slice.nodes.some((node) => node.id === `obs:${saved.observation.id}` && node.kind === 'observation')).toBe(true);
      expect(ledger?.facts.map((fact) => fact.relation)).toEqual([
        'HAS_TYPE',
        'IN_PROJECT',
        'HAS_TOPIC_KEY',
        'HAS_WHAT',
        'HAS_WHY',
        'HAS_WHERE',
        'HAS_LEARNED',
      ]);
      expect(projectGraph).toContain('Vocabulary graph memory -- HAS_LEARNED --> Public graph rows stay KG-backed');
    } finally {
      store.close();
    }
  });

  it('formats project graph as current-state by default while history remains reachable', () => {
    const store = new Store(':memory:');
    try {
      store.saveObservation({
        title: 'Superseded ledger memory',
        content: '**What**: Redis cache',
        project: 'viz-superseded',
        topic_key: 'kg/superseded-ledger',
        type: 'decision',
      });
      store.saveObservation({
        title: 'Superseded ledger memory',
        content: '**What**: Valkey cache',
        project: 'viz-superseded',
        topic_key: 'kg/superseded-ledger',
        type: 'decision',
      });

      const currentGraph = formatProjectGraph(store, 'viz-superseded', { maxChars: 2000 });
      const historyGraph = formatProjectGraph(store, 'viz-superseded', { includeSuperseded: true, maxChars: 2000 });
      const historyFacts = store.getObservationFacts({ project: 'viz-superseded', include_superseded: true });
      const supersededFact = historyFacts.find((fact) => fact.object === 'Redis cache');

      expect(currentGraph).toContain('Superseded ledger memory -- HAS_WHAT --> Valkey cache');
      expect(currentGraph).not.toContain('Superseded ledger memory -- HAS_WHAT --> Redis cache');
      expect(historyGraph).toContain('Superseded ledger memory -- HAS_WHAT --> Redis cache');
      expect(supersededFact?.superseded).toBe(true);
    } finally {
      store.close();
    }
  });

  it('formats flag-off graph ledger as legacy current output even if rows carry supersession markers', () => {
    const store = new Store(':memory:', {
      knowledgeGraph: {
        kgSupersedeEnabled: false,
      },
    } as any);
    try {
      const saved = store.saveObservation({
        title: 'Flag-off ledger memory',
        content: '**What**: Redis cache',
        project: 'viz-flag-off',
        topic_key: 'kg/flag-off-ledger',
        type: 'decision',
      });
      const row = store.getDb().prepare(
        `SELECT kt.id
         FROM kg_triples kt
         JOIN kg_entities oe ON oe.id = kt.object_entity_id
         WHERE kt.source_id = ?
           AND kt.relation = 'HAS_WHAT'
           AND oe.canonical_name = 'Redis cache'`
      ).get(saved.observation.id) as { id: number };
      store.getDb().prepare(
        "UPDATE kg_triples SET superseded_at = datetime('now') WHERE id = ?"
      ).run(row.id);

      const facts = store.getObservationFacts({ project: 'viz-flag-off' });
      const graph = formatProjectGraph(store, 'viz-flag-off', { maxChars: 2000 });

      expect(facts.find((fact) => fact.object === 'Redis cache')).toEqual(expect.objectContaining({
        object: 'Redis cache',
      }));
      expect(facts.find((fact) => fact.object === 'Redis cache')?.superseded).toBeUndefined();
      expect(graph).toContain('Flag-off ledger memory -- HAS_WHAT --> Redis cache');
    } finally {
      store.close();
    }
  });

  it('supports observatory context/recall/frontier/ledger/timeline with deterministic frontier semantics', async () => {
    const store = new Store(':memory:');
    try {
      const first = store.saveObservation({
        title: 'Auth decision',
        content: '<private>secret</private>\n**What**: JWT rotation',
        project: 'obs-project',
        session_id: 'obs-session',
        topic_key: 'auth/jwt',
        type: 'decision',
      });
      store.saveObservation({
        title: 'Auth learning',
        content: 'token rotation interval is 5m',
        project: 'obs-project',
        session_id: 'obs-session',
        topic_key: 'auth/jwt-learning',
        type: 'learning',
      });
      writeDeterministicKgFacts(store, first.observation.id);

      const context = store.getObservatoryContext({ project: 'obs-project', session_id: 'obs-session', query: 'jwt' });
      const recall = await store.getObservatoryRecall({ context_token: context.context_token, lanes: ['lexical'], limit: 10 });
      expect(recall.lanes.lexical.length).toBeGreaterThan(0);
      expect(recall.lanes.lexical[0].preview).not.toContain('secret');

      const frontierFirst = store.getObservatoryMapFrontier({
        context_token: context.context_token,
        focus_node_id: `obs:${first.observation.id}`,
        visible_node_ids: [],
        max_nodes: 2,
      });
      expect(frontierFirst.frontier_state.added_node_ids.length).toBeGreaterThan(0);
      expect(frontierFirst.frontier_state.reason).toBe('limit');

      const frontierSecond = store.getObservatoryMapFrontier({
        context_token: context.context_token,
        focus_node_id: `obs:${first.observation.id}`,
        visible_node_ids: frontierFirst.frontier_state.added_node_ids,
        continuation: frontierFirst.frontier_state.continuation ?? undefined,
        max_nodes: 2,
      });
      expect(frontierSecond.frontier_state.already_visible_node_ids.length).toBeGreaterThan(0);

      const ledger = store.getObservatoryLedgerDetail({ observation_id: first.observation.id });
      expect(ledger?.what[0]).not.toContain('<private>');

      const timeline = store.getObservatoryTimeline({ context_token: context.context_token, limit: 1 });
      expect(timeline.events.length).toBe(1);
      expect(timeline.continuation).not.toBeNull();
    } finally {
      store.close();
    }
  });

  it('observatory lane truth: reports semantic lanes as unavailable while synchronous KG evidence is ready', async () => {
    const store = new Store(':memory:');
    try {
      store.saveObservation({
        title: 'Only lexical signal',
        content: 'keyword-only match body',
        project: 'obs-lane-truth',
        session_id: 'obs-lane-session',
      });

      const context = store.getObservatoryContext({ project: 'obs-lane-truth', session_id: 'obs-lane-session', query: 'keyword-only' });
      const recall = await store.getObservatoryRecall({
        context_token: context.context_token,
        lanes: ['lexical', 'sentence-vector', 'chunk-vector', 'fact-kg'],
        limit: 20,
      });

      expect(recall.lanes.lexical.length).toBeGreaterThan(0);
      expect(recall.lanes['sentence-vector'].length).toBe(0);
      expect(recall.lanes['chunk-vector'].length).toBe(0);
      expect(recall.lanes['fact-kg'].length).toBeGreaterThan(0);
      expect(recall.lane_states?.lexical?.status).toBe('ready');
      expect(recall.lane_states?.['sentence-vector']?.status).toBe('pending');
      expect(recall.lane_states?.['chunk-vector']?.status).toBe('pending');
      expect(recall.lane_states?.['fact-kg']?.status).toBe('ready');
      expect(recall.lane_states?.['sentence-vector']?.reason).toMatch(/^semantic-/);
      expect(recall.lane_states?.['chunk-vector']?.reason).toMatch(/^semantic-/);
      expect(recall.lane_states?.['fact-kg']?.reason).toBe('ok');
    } finally {
      store.close();
    }
  });

  it('observatory fact-kg can return query-matching graph-only hits as controlled discovery evidence', async () => {
    const store = new Store(':memory:');
    try {
      const saved = store.saveObservation({
        title: 'Graph only observation',
        content: 'plain body without the codename',
        project: 'obs-kg-only',
        session_id: 'obs-kg-session',
      });
      insertKgTriple(store, {
        observationId: saved.observation.id,
        subject: 'Helios',
        relation: 'HAS_WHAT',
        object: 'Redis cache decision',
        project: 'obs-kg-only',
      });

      const context = store.getObservatoryContext({ project: 'obs-kg-only', session_id: 'obs-kg-session', query: 'helios' });
      const recall = await store.getObservatoryRecall({
        context_token: context.context_token,
        lanes: ['fact-kg'],
        limit: 20,
      });

      expect(recall.lanes['fact-kg'].map((hit) => hit.observation_id)).toContain(saved.observation.id);
      expect(recall.lanes['fact-kg'].length).toBeLessThanOrEqual(2);
      expect(recall.lane_states?.['fact-kg']?.status).toBe('ready');
    } finally {
      store.close();
    }
  });

  it('observatory fact-kg enriches canonical core retrieval hits', async () => {
    const store = new Store(':memory:');
    try {
      const saved = store.saveObservation({
        title: 'Graph enriched observation',
        content: 'Helios cache decision is visible in core retrieval.',
        project: 'obs-kg-core',
        session_id: 'obs-kg-core-session',
      });
      insertKgTriple(store, {
        observationId: saved.observation.id,
        subject: 'Helios',
        relation: 'HAS_WHAT',
        object: 'Redis cache decision',
        project: 'obs-kg-core',
      });

      const context = store.getObservatoryContext({ project: 'obs-kg-core', session_id: 'obs-kg-core-session', query: 'helios' });
      const recall = await store.getObservatoryRecall({
        context_token: context.context_token,
        lanes: ['lexical', 'fact-kg'],
        limit: 20,
      });

      expect(recall.lanes.lexical.map((hit) => hit.observation_id)).toContain(saved.observation.id);
      expect(recall.lanes['fact-kg'].map((hit) => hit.observation_id)).toContain(saved.observation.id);
      expect(recall.lane_states?.['fact-kg']?.status).toBe('ready');
    } finally {
      store.close();
    }
  });

  it('observatory semantic lanes use the ready vector index when a provider is available', async () => {
    const store = new Store(':memory:', { retrievalDefaults: { minSemanticScore: 0 } });
    try {
      const vector = Array.from({ length: 384 }, (_, index) => (index === 0 ? 0.21 : 0));
      const provider = {
        config: store.config.embedding!,
        embed: async (texts: string[]) => texts.map(() => vector),
      };
      const saved = store.saveObservation({
        title: 'Semantic observatory',
        content: 'Rotate encryption keys weekly. Keep parent context nearby.',
        project: 'obs-semantic',
        session_id: 'obs-semantic-session',
      });
      await (store as any).processSemanticJobs({ limit: 20, embeddingProvider: provider });

      const context = store.getObservatoryContext({ project: 'obs-semantic', session_id: 'obs-semantic-session', query: 'rotate encryption' });
      const recall = await store.getObservatoryRecall({
        context_token: context.context_token,
        lanes: ['sentence-vector', 'chunk-vector'],
        limit: 20,
        embeddingProvider: provider,
      });

      expect(recall.lanes['sentence-vector'].map((hit) => hit.observation_id)).toContain(saved.observation.id);
      expect(recall.lanes['chunk-vector'].map((hit) => hit.observation_id)).toContain(saved.observation.id);
      expect(recall.lane_states?.['sentence-vector']?.status).toBe('ready');
      expect(recall.lane_states?.['chunk-vector']?.status).toBe('ready');
    } finally {
      store.close();
    }
  });

  it('observatory semantic lanes include HyDE query expansion when configured', async () => {
    const embedding = {
      provider: 'transformers_local' as const,
      model: 'mock-embedding',
      baseUrl: null,
      dimensions: 3,
      configHash: 'mock-embedding-hash',
    };
    const store = new Store(':memory:', {
      embedding,
      hyde: {
        enabled: true,
        provider: 'transformers_local',
        model: 'mock-hyde',
        baseUrl: null,
        timeoutMs: 4000,
      },
      retrievalDefaults: { minSemanticScore: 0.9 },
    });
    try {
      const docVector = [1, 0, 0];
      const farVector = [100, 100, 100];
      const queryTexts: string[] = [];
      const provider = {
        config: embedding,
        embed: async (texts: string[], usage: 'document' | 'query') => {
          if (usage === 'query') {
            queryTexts.push(...texts);
          }
          return texts.map((text) => (
            text.toLowerCase().includes('phoenix shard') ? docVector : farVector
          ));
        },
      };
      const hydeGenerator = {
        generate: async () => 'Phoenix shard failover plan lives in the recovery runbook.',
      };
      const saved = store.saveObservation({
        title: 'HyDE observatory target',
        content: 'Phoenix shard failover plan lives in the recovery runbook.',
        project: 'obs-hyde',
        session_id: 'obs-hyde-session',
      });
      await (store as any).processSemanticJobs({ limit: 20, embeddingProvider: provider });

      const context = store.getObservatoryContext({
        project: 'obs-hyde',
        session_id: 'obs-hyde-session',
        query: 'where is recovery documented',
      });
      const recall = await store.getObservatoryRecall({
        context_token: context.context_token,
        lanes: ['chunk-vector'],
        limit: 20,
        embeddingProvider: provider,
        hydeGenerator,
      });

      expect(queryTexts).toContain('Phoenix shard failover plan lives in the recovery runbook.');
      expect(recall.lanes['chunk-vector'].map((hit) => hit.observation_id)).toContain(saved.observation.id);
      expect(recall.lane_states?.['chunk-vector']?.status).toBe('ready');
    } finally {
      store.close();
    }
  });
});
