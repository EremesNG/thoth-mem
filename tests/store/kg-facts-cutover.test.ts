import { describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';

function createLegacyObservationFactsTable(store: Store) {
  store.getDb().exec(`
    CREATE TABLE IF NOT EXISTS observation_facts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      observation_id INTEGER NOT NULL,
      subject        TEXT NOT NULL,
      relation       TEXT NOT NULL,
      object         TEXT NOT NULL,
      project        TEXT,
      topic_key      TEXT,
      type           TEXT NOT NULL,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_observation_facts_observation ON observation_facts(observation_id);
    CREATE INDEX IF NOT EXISTS idx_observation_facts_project ON observation_facts(project);
    CREATE INDEX IF NOT EXISTS idx_observation_facts_topic ON observation_facts(topic_key);
  `);
}

function seedKgBackedObservation(store: Store) {
  const saved = store.saveObservation({
    title: 'JWT auth middleware',
    type: 'decision',
    project: 'auth-project',
    session_id: 'session-auth',
    topic_key: 'architecture/auth-model',
    content: [
      '**What**: Implemented JWT middleware',
      '**Why**: Routes need authenticated access',
      '**Where**: src/auth/middleware.ts',
      '**Learned**: Keep token parsing isolated',
    ].join('\n'),
  }).observation;

  return saved;
}

function countObservationTriples(store: Store, observationId: number): number {
  return (store.getDb().prepare(
    "SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?"
  ).get(observationId) as { count: number }).count;
}

function insertKgTriple(store: Store, input: {
  observationId: number;
  subject: string;
  relation: string;
  object: string;
  project: string | null;
  tripleHash: string;
}): number {
  const db = store.getDb();
  const upsertEntity = db.prepare(
    `INSERT INTO kg_entities (entity_key, entity_type, canonical_name, aliases_json, metadata_json, updated_at)
     VALUES (?, 'concept', ?, '[]', '{}', datetime('now'))
     ON CONFLICT(entity_key) DO UPDATE SET updated_at = datetime('now')
     RETURNING id`
  );
  const subject = upsertEntity.get(`test:${input.tripleHash}:subject`, input.subject) as { id: number };
  const object = upsertEntity.get(`test:${input.tripleHash}:object`, input.object) as { id: number };

  const result = db.prepare(
    `INSERT INTO kg_triples (
      subject_entity_id, relation, object_entity_id, source_type, source_id,
      project, provenance, confidence, triple_hash, extractor_version
    ) VALUES (?, ?, ?, 'observation', ?, ?, ?, 0.9, ?, 'test')`
  ).run(
    subject.id,
    input.relation,
    object.id,
    input.observationId,
    input.project,
    `observation:${input.observationId}`,
    input.tripleHash
  );
  return Number(result.lastInsertRowid);
}

function dropLegacyObservationFactsTable(store: Store) {
  store.getDb().exec(`
    DROP INDEX IF EXISTS idx_observation_facts_observation;
    DROP INDEX IF EXISTS idx_observation_facts_project;
    DROP INDEX IF EXISTS idx_observation_facts_topic;
    DROP TABLE IF EXISTS observation_facts;
  `);
}

describe('Store KG-backed observation facts cutover', () => {
  it('projects ObservationFact rows from KG triples plus synthesized metadata in deterministic order', () => {
    const store = new Store(':memory:');

    try {
      const saved = seedKgBackedObservation(store);

      const facts = store.getObservationFactsFromKg({ observation_id: saved.id });

      expect(facts.map((fact) => [fact.subject, fact.relation, fact.object])).toEqual([
        ['JWT auth middleware', 'HAS_TYPE', 'decision'],
        ['JWT auth middleware', 'IN_PROJECT', 'auth-project'],
        ['JWT auth middleware', 'HAS_TOPIC_KEY', 'architecture/auth-model'],
        ['JWT auth middleware', 'HAS_WHAT', 'Implemented JWT middleware'],
        ['JWT auth middleware', 'HAS_WHY', 'Routes need authenticated access'],
        ['JWT auth middleware', 'HAS_WHERE', 'src/auth/middleware.ts'],
        ['JWT auth middleware', 'HAS_LEARNED', 'Keep token parsing isolated'],
      ]);
      expect(facts.every((fact) => fact.observation_id === saved.id)).toBe(true);
      expect(facts.every((fact) => fact.project === 'auth-project')).toBe(true);
      expect(facts.every((fact) => fact.topic_key === 'architecture/auth-model')).toBe(true);
    } finally {
      store.close();
    }
  });

  it('projects uncapped content sections byte-for-byte with legacy-compatible metadata order', () => {
    const store = new Store(':memory:');

    try {
      const longLearned = `Long learned ${'0123456789'.repeat(60)}`;
      const saved = store.saveObservation({
        title: 'Long structured memory',
        type: 'architecture',
        project: 'long-project',
        topic_key: 'architecture/long-structured-memory',
        content: [
          '**What**: Build the direct adapter parity fixture',
          '**Why**: Coverage must prove KG rows match the old ledger shape',
          '**Where**: tests/store/kg-facts-cutover.test.ts',
          `**Learned**: ${longLearned}`,
        ].join('\n'),
      }).observation;

      const facts = store.getObservationFactsFromKg({ observation_id: saved.id });

      expect(facts.map((fact) => [fact.subject, fact.relation, fact.object])).toEqual([
        ['Long structured memory', 'HAS_TYPE', 'architecture'],
        ['Long structured memory', 'IN_PROJECT', 'long-project'],
        ['Long structured memory', 'HAS_TOPIC_KEY', 'architecture/long-structured-memory'],
        ['Long structured memory', 'HAS_WHAT', 'Build the direct adapter parity fixture'],
        ['Long structured memory', 'HAS_WHY', 'Coverage must prove KG rows match the old ledger shape'],
        ['Long structured memory', 'HAS_WHERE', 'tests/store/kg-facts-cutover.test.ts'],
        ['Long structured memory', 'HAS_LEARNED', longLearned],
      ]);
      expect(facts.find((fact) => fact.relation === 'HAS_LEARNED')?.object.length).toBeGreaterThan(500);
      expect(facts.every((fact) => fact.observation_id === saved.id)).toBe(true);
      expect(facts.every((fact) => fact.project === 'long-project')).toBe(true);
      expect(facts.every((fact) => fact.topic_key === 'architecture/long-structured-memory')).toBe(true);
    } finally {
      store.close();
    }
  });

  it('honors filters and excludes soft-deleted observations plus non-observation triples', () => {
    const store = new Store(':memory:');

    try {
      const auth = seedKgBackedObservation(store);
      const cache = store.saveObservation({
        title: 'Cache memory',
        type: 'learning',
        project: 'cache-project',
        topic_key: 'architecture/cache-model',
        content: '**What**: Cache graph content',
      }).observation;

      const objectEntity = store.getDb().prepare("SELECT id FROM kg_entities WHERE canonical_name = 'Cache graph content'").get() as { id: number };
      const subjectEntity = store.getDb().prepare("SELECT id FROM kg_entities WHERE canonical_name = 'architecture/cache-model'").get() as { id: number };
      store.getDb().prepare(
        `INSERT INTO kg_triples (
          subject_entity_id, relation, object_entity_id, source_type, source_id,
          provenance, confidence, triple_hash
        ) VALUES (?, 'HAS_WHAT', ?, 'prompt', ?, 'prompt:1', 0.9, 'prompt:cache-fact')`
      ).run(subjectEntity.id, objectEntity.id, cache.id);

      expect(store.getObservationFactsFromKg({ project: 'auth-project' }).map((fact) => fact.observation_id))
        .toEqual(Array(7).fill(auth.id));
      expect(store.getObservationFactsFromKg({ topic_key: 'architecture/cache-model' }).map((fact) => fact.relation))
        .toEqual(['HAS_TYPE', 'IN_PROJECT', 'HAS_TOPIC_KEY', 'HAS_WHAT']);

      expect(store.deleteObservation(auth.id)).toBe(true);
      expect(store.getObservationFactsFromKg({ observation_id: auth.id })).toEqual([]);
      expect(store.getObservationFactsFromKg({ observation_id: cache.id }).filter((fact) => fact.object === 'Cache graph content'))
        .toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it('honors observation_id filter and emits derived project metadata when project is omitted', () => {
    const store = new Store(':memory:');

    try {
      const withoutMetadata = store.saveObservation({
        title: 'Metadata only memory',
        type: 'manual',
        content: 'No structured sections here.',
      }).observation;
      const other = seedKgBackedObservation(store);

      const facts = store.getObservationFactsFromKg({ observation_id: withoutMetadata.id });

      expect(facts).toEqual([
        {
          id: expect.any(Number),
          observation_id: withoutMetadata.id,
          subject: 'Metadata only memory',
          relation: 'HAS_TYPE',
          object: 'manual',
          project: 'thoth-mem',
          topic_key: null,
          type: 'manual',
          created_at: expect.any(String),
        },
        {
          id: expect.any(Number),
          observation_id: withoutMetadata.id,
          subject: 'Metadata only memory',
          relation: 'IN_PROJECT',
          object: 'thoth-mem',
          project: 'thoth-mem',
          topic_key: null,
          type: 'manual',
          created_at: expect.any(String),
        },
      ]);
      expect(store.getObservationFactsFromKg({ observation_id: other.id }).map((fact) => fact.observation_id))
        .toEqual(Array(7).fill(other.id));
    } finally {
      store.close();
    }
  });

  it('uses KG facts by default while the legacy flag still reads observation_facts', () => {
    const kgStore = new Store(':memory:');
    const legacyStore = new Store(':memory:', { graphFactsSource: 'legacy' });

    try {
      const kgSaved = seedKgBackedObservation(kgStore);
      expect(kgStore.getObservationFacts({ observation_id: kgSaved.id }).map((fact) => fact.relation))
        .toEqual(['HAS_TYPE', 'IN_PROJECT', 'HAS_TOPIC_KEY', 'HAS_WHAT', 'HAS_WHY', 'HAS_WHERE', 'HAS_LEARNED']);

      createLegacyObservationFactsTable(legacyStore);
      const legacySaved = legacyStore.saveObservation({
        title: 'Legacy facts',
        type: 'decision',
        project: 'legacy-project',
        content: '**What**: Legacy table content',
      }).observation;
      expect(legacyStore.getObservationFacts({ observation_id: legacySaved.id }).map((fact) => fact.relation))
        .toEqual(['HAS_TYPE', 'IN_PROJECT', 'HAS_WHAT']);
    } finally {
      kgStore.close();
      legacyStore.close();
    }
  });

  it('reports compact legacy drift status when explicit legacy source lacks observation_facts', () => {
    const store = new Store(':memory:', { graphFactsSource: 'legacy' });

    try {
      const drift = store.getLegacyFactsDrift();
      const health = store.getOperationalHealth({ project: 'legacy-project' });

      expect(drift).toEqual({
        status: 'degraded',
        source: 'legacy',
        missing_table: 'observation_facts',
        message: 'explicit legacy graphFactsSource is configured but observation_facts is missing',
      });
      expect(health.legacy_drift.status).toBe('degraded');
      expect(health.legacy_drift.missing_table).toBe('observation_facts');
      expect(health.status).toBe('degraded');
    } finally {
      store.close();
    }
  });

  it('default KG read paths do not require observation_facts to exist', async () => {
    const store = new Store(':memory:', { retrievalDefaults: { minSemanticScore: 1 } });

    try {
      const saved = seedKgBackedObservation(store);
      dropLegacyObservationFactsTable(store);

      expect(store.getObservationFacts({ observation_id: saved.id }).map((fact) => fact.relation))
        .toEqual(['HAS_TYPE', 'IN_PROJECT', 'HAS_TOPIC_KEY', 'HAS_WHAT', 'HAS_WHY', 'HAS_WHERE', 'HAS_LEARNED']);
      const response = await (store as any).hybridRetrieve({ query: 'middleware', project: 'auth-project', limit: 5 });
      expect(response.results.map((result: any) => result.observation.id)).toContain(saved.id);
    } finally {
      store.close();
    }
  });

  it('explicit legacy facts read degrades to empty when observation_facts is missing', () => {
    const store = new Store(':memory:', { graphFactsSource: 'legacy' });

    try {
      seedKgBackedObservation(store);
      dropLegacyObservationFactsTable(store);

      expect(store.getObservationFacts({ project: 'auth-project' })).toEqual([]);
      expect(store.getLegacyFactsDrift()).toMatchObject({
        status: 'degraded',
        missing_table: 'observation_facts',
      });
    } finally {
      store.close();
    }
  });

  it('explicit legacy facts read still surfaces unrelated SQL failures', () => {
    const store = new Store(':memory:', { graphFactsSource: 'legacy' });

    try {
      createLegacyObservationFactsTable(store);
      store.getDb().exec('DROP TABLE observations;');

      expect(() => store.getObservationFacts({ project: 'auth-project' })).toThrow(/no such table: observations/);
    } finally {
      store.close();
    }
  });

  it('does not use observation_facts as a default KG-lane source', async () => {
    const store = new Store(':memory:');

    try {
      const saved = store.saveObservation({
        title: 'Graph-only legacy fallback',
        content: 'plain body without the codename',
        project: 'kg-cutover',
      }).observation;
      store.getDb().prepare('DELETE FROM kg_triples WHERE source_id = ?').run(saved.id);
      createLegacyObservationFactsTable(store);
      store.getDb().prepare(
        'INSERT INTO observation_facts (observation_id, subject, relation, object, project, topic_key, type) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(saved.id, 'Helios', 'HAS_WHAT', 'Redis cache decision', 'kg-cutover', null, 'decision');

      const response = await (store as any).hybridRetrieve({ query: 'helios', project: 'kg-cutover', limit: 5 });

      expect(response.results).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  it('ranks equal KG-only candidates by observation id without a legacy facts table', async () => {
    const store = new Store(':memory:', { retrievalDefaults: { minSemanticScore: 1 } });
    const runtime = store as any;

    try {
      const first = store.saveObservation({
        title: 'First equal KG candidate',
        content: 'unrelated body one',
        project: 'kg-tie',
      }).observation;
      const second = store.saveObservation({
        title: 'Second equal KG candidate',
        content: 'unrelated body two',
        project: 'kg-tie',
      }).observation;
      store.getDb().prepare("DELETE FROM kg_triples WHERE source_type = 'observation'").run();
      dropLegacyObservationFactsTable(store);
      insertKgTriple(store, {
        observationId: second.id,
        subject: 'Helios',
        relation: 'USES',
        object: 'Shared cache',
        project: 'kg-tie',
        tripleHash: 'tie:second',
      });
      insertKgTriple(store, {
        observationId: first.id,
        subject: 'Helios',
        relation: 'USES',
        object: 'Shared cache',
        project: 'kg-tie',
        tripleHash: 'tie:first',
      });

      const response = await runtime.hybridRetrieve({ query: 'helios', project: 'kg-tie', limit: 5 });

      expect(response.results.map((result: any) => result.observation.id).slice(0, 2)).toEqual([first.id, second.id]);
      expect(response.results.every((result: any) => result.evidence.primary.source === 'kg_triples')).toBe(true);
    } finally {
      store.close();
    }
  });

  it('synchronously writes default KG facts on save without observation_facts', () => {
    const store = new Store(':memory:');

    try {
      dropLegacyObservationFactsTable(store);

      const saved = store.saveObservation({
        title: 'Sync KG save',
        type: 'decision',
        project: 'sync-kg',
        topic_key: 'sync/kg-save',
        content: [
          '**What**: Sync KG content',
          '**Why**: Save must return with graph facts',
        ].join('\n'),
      }).observation;

      const table = store.getDb().prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'observation_facts'"
      ).get();
      const facts = store.getObservationFacts({ observation_id: saved.id });
      const triples = store.getDb().prepare(
        "SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?"
      ).get(saved.id) as { count: number };
      const pendingJobs = store.getDb().prepare(
        "SELECT kind, state FROM semantic_jobs WHERE observation_id = ? ORDER BY kind"
      ).all(saved.id) as Array<{ kind: string; state: string }>;

      expect(table).toBeUndefined();
      expect(facts.map((fact) => fact.relation)).toEqual([
        'HAS_TYPE',
        'IN_PROJECT',
        'HAS_TOPIC_KEY',
        'HAS_WHAT',
        'HAS_WHY',
      ]);
      expect(triples.count).toBeGreaterThan(0);
      expect(pendingJobs).toEqual([
        { kind: 'chunk', state: 'pending' },
        { kind: 'extract_kg', state: 'pending' },
        { kind: 'sentence', state: 'pending' },
      ]);
    } finally {
      store.close();
    }
  });

  it('synchronously refreshes default KG facts on update without observation_facts', () => {
    const store = new Store(':memory:');

    try {
      const saved = store.saveObservation({
        title: 'Sync KG update',
        type: 'decision',
        project: 'sync-kg',
        content: '**What**: Initial graph content',
      }).observation;
      dropLegacyObservationFactsTable(store);

      const updated = store.updateObservation({
        id: saved.id,
        content: '**What**: Updated graph content',
      });

      expect(updated).not.toBeNull();
      expect(store.getObservationFacts({ observation_id: saved.id }).map((fact) => [fact.relation, fact.object]))
        .toEqual([
          ['HAS_TYPE', 'decision'],
          ['IN_PROJECT', 'sync-kg'],
          ['HAS_WHAT', 'Updated graph content'],
        ]);
    } finally {
      store.close();
    }
  });

  it('hard deletes KG artifacts without observation_facts', () => {
    const store = new Store(':memory:');

    try {
      const saved = seedKgBackedObservation(store);
      dropLegacyObservationFactsTable(store);

      expect(() => store.deleteObservation(saved.id, true)).not.toThrow();

      const triples = store.getDb().prepare(
        "SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?"
      ).get(saved.id) as { count: number };
      expect(triples.count).toBe(0);
    } finally {
      store.close();
    }
  });

  it('hard delete nulls supersession pointers that target the deleted observation triples', () => {
    const store = new Store(':memory:');

    try {
      const oldOwner = store.saveObservation({
        title: 'Old owner',
        content: '**What**: Redis cache',
        project: 'delete-supersession',
      }).observation;
      const newOwner = store.saveObservation({
        title: 'New owner',
        content: '**What**: Valkey cache',
        project: 'delete-supersession',
      }).observation;
      store.getDb().prepare("DELETE FROM kg_triples WHERE source_type = 'observation'").run();
      const oldTripleId = insertKgTriple(store, {
        observationId: oldOwner.id,
        subject: 'cache decision',
        relation: 'HAS_WHAT',
        object: 'Redis cache',
        project: 'delete-supersession',
        tripleHash: 'delete-supersession:old',
      });
      const newTripleId = insertKgTriple(store, {
        observationId: newOwner.id,
        subject: 'cache decision',
        relation: 'HAS_WHAT',
        object: 'Valkey cache',
        project: 'delete-supersession',
        tripleHash: 'delete-supersession:new',
      });
      store.getDb().prepare(
        'UPDATE kg_triples SET superseded_by_triple_id = ?, superseded_at = datetime(\'now\') WHERE id = ?'
      ).run(newTripleId, oldTripleId);

      expect(() => store.deleteObservation(newOwner.id, true)).not.toThrow();

      const oldRow = store.getDb().prepare(
        'SELECT source_id, superseded_by_triple_id, superseded_at FROM kg_triples WHERE id = ?'
      ).get(oldTripleId) as { source_id: number; superseded_by_triple_id: number | null; superseded_at: string | null };
      const newRows = store.getDb().prepare(
        "SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?"
      ).get(newOwner.id) as { count: number };

      expect(oldRow).toEqual({
        source_id: oldOwner.id,
        superseded_by_triple_id: null,
        superseded_at: null,
      });
      expect(newRows.count).toBe(0);
    } finally {
      store.close();
    }
  });

  it('rebuilds deterministic KG facts without observation_facts and converges on repeat', () => {
    const store = new Store(':memory:');

    try {
      const saved = store.saveObservation({
        title: 'Rebuild KG only',
        type: 'decision',
        project: 'rebuild-kg',
        topic_key: 'rebuild/kg-only',
        content: [
          '**What**: Rebuild graph content',
          '**Where**: src/store/index.ts',
        ].join('\n'),
      }).observation;
      const skipped = store.saveObservation({
        title: 'Skipped project',
        content: '**What**: Other project content',
        project: 'other-project',
      }).observation;
      store.getDb().prepare("DELETE FROM kg_triples WHERE source_type = 'observation'").run();
      dropLegacyObservationFactsTable(store);

      const first = store.rebuildObservationFacts({ project: 'rebuild-kg' });
      const second = store.rebuildObservationFacts({ project: 'rebuild-kg' });

      const inScopeTriples = store.getDb().prepare(
        "SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?"
      ).get(saved.id) as { count: number };
      const outOfScopeTriples = store.getDb().prepare(
        "SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?"
      ).get(skipped.id) as { count: number };

      expect(first).toMatchObject({
        project: 'rebuild-kg',
        observations_scanned: 1,
        facts_deleted: 0,
      });
      expect(first.facts_created).toBeGreaterThan(0);
      expect(second.facts_created).toBe(0);
      expect(second.facts_deleted).toBe(0);
      expect((
        store.getDb().prepare(
          `SELECT COUNT(*) AS count
           FROM kg_triples
           WHERE source_type = 'observation'
             AND source_id = ?
             AND (superseded_by_triple_id IS NOT NULL OR superseded_at IS NOT NULL)`
        ).get(saved.id) as { count: number }
      ).count).toBe(0);
      expect(inScopeTriples.count).toBeGreaterThan(0);
      expect(outOfScopeTriples.count).toBe(0);
      expect(store.getObservationFacts({ observation_id: saved.id }).map((fact) => fact.relation))
        .toEqual(['HAS_TYPE', 'IN_PROJECT', 'HAS_TOPIC_KEY', 'HAS_WHAT', 'HAS_WHERE']);
    } finally {
      store.close();
    }
  });

  it('rebuild supersedes stale stored KG rows when current extraction has the genuine replacement', () => {
    const store = new Store(':memory:');

    try {
      const saved = store.saveObservation({
        title: 'Rebuild stale memory',
        type: 'decision',
        project: 'rebuild-stale',
        topic_key: 'rebuild/stale',
        content: '**What**: Current graph content',
      }).observation;
      const staleTripleId = insertKgTriple(store, {
        observationId: saved.id,
        subject: 'rebuild/stale',
        relation: 'HAS_WHAT',
        object: 'Stale graph content',
        project: 'rebuild-stale',
        tripleHash: 'rebuild-stale:stale-what',
      });

      const result = store.rebuildObservationFacts({ project: 'rebuild-stale' });
      const stale = store.getDb().prepare(
        `SELECT superseded_by_triple_id, superseded_at
         FROM kg_triples
         WHERE id = ?`
      ).get(staleTripleId) as { superseded_by_triple_id: number | null; superseded_at: string | null };
      const replacement = store.getDb().prepare(
        `SELECT kt.id
         FROM kg_triples kt
         JOIN kg_entities oe ON oe.id = kt.object_entity_id
         WHERE kt.source_id = ?
           AND kt.relation = 'HAS_WHAT'
           AND oe.canonical_name = 'Current graph content'
           AND kt.superseded_at IS NULL`
      ).get(saved.id) as { id: number } | undefined;

      expect(result.facts_deleted).toBe(1);
      expect(stale.superseded_at).toEqual(expect.any(String));
      expect(stale.superseded_by_triple_id).toBe(replacement?.id);
    } finally {
      store.close();
    }
  });

  it('does not duplicate deterministic triples across re-save and background KG processing', async () => {
    const store = new Store(':memory:');
    const runtime = store as any;

    try {
      const saved = store.saveObservation({
        title: 'Idempotent KG write',
        type: 'decision',
        project: 'idempotent-kg',
        topic_key: 'kg/idempotent-write',
        content: '**What**: Stable graph fact',
      }).observation;
      const initial = countObservationTriples(store, saved.id);

      const resaved = store.saveObservation({
        title: 'Idempotent KG write',
        type: 'decision',
        project: 'idempotent-kg',
        topic_key: 'kg/idempotent-write',
        content: '**What**: Stable graph fact',
      }).observation;
      await runtime.processSemanticJobs({ limit: 20 });
      const afterJobs = countObservationTriples(store, saved.id);
      const duplicateHashes = store.getDb().prepare(
        `SELECT triple_hash, COUNT(*) AS count
         FROM kg_triples
         WHERE source_type = 'observation' AND source_id = ?
         GROUP BY triple_hash
         HAVING COUNT(*) > 1`
      ).all(saved.id) as Array<{ triple_hash: string; count: number }>;

      expect(resaved.id).toBe(saved.id);
      expect(afterJobs).toBe(initial);
      expect(duplicateHashes).toEqual([]);
    } finally {
      store.close();
    }
  });

  it('raw inserted observations without KG content return metadata-only rows and safe empty KG search', async () => {
    const store = new Store(':memory:');
    const runtime = store as any;

    try {
      store.startSession('raw-session', 'raw-project');
      const result = store.getDb().prepare(
        `INSERT INTO observations (session_id, type, title, content, project, scope)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('raw-session', 'manual', 'Raw metadata memory', 'No graph content marker here', 'raw-project', 'project');
      const observationId = Number(result.lastInsertRowid);

      const facts = store.getObservationFactsFromKg({ observation_id: observationId });
      const graph = store.getVisualizationSlice({ project: 'raw-project', max_nodes: 20, max_edges: 20 });
      const response = await runtime.hybridRetrieve({ query: 'absent-term', project: 'raw-project', limit: 5 });

      expect(facts.map((fact) => [fact.relation, fact.object])).toEqual([
        ['HAS_TYPE', 'manual'],
        ['IN_PROJECT', 'raw-project'],
      ]);
      expect(graph.edges.map((edge) => edge.relation)).toEqual(expect.arrayContaining(['HAS_TYPE', 'IN_PROJECT']));
      expect(response.results).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  it('builds visualization relation filters and edges from the KG projection by default', () => {
    const store = new Store(':memory:');

    try {
      seedKgBackedObservation(store);

      const filters = store.getVisualizationFilters({ project: 'auth-project' });
      expect(filters.relations).toEqual([
        'HAS_LEARNED',
        'HAS_TOPIC_KEY',
        'HAS_TYPE',
        'HAS_WHAT',
        'HAS_WHERE',
        'HAS_WHY',
        'IN_PROJECT',
      ]);

      const slice = store.getVisualizationSlice({
        project: 'auth-project',
        relation: 'HAS_WHAT',
        query: 'middleware',
        max_nodes: 100,
        max_edges: 100,
      });

      expect(slice.edges.some((edge) => edge.relation === 'HAS_WHAT')).toBe(true);
      expect(slice.nodes.some((node) => node.label === 'Implemented JWT middleware')).toBe(true);
    } finally {
      store.close();
    }
  });

  // ── Task 3.2: legacy-mode savepoint smoke check ──
  // In legacy mode, refreshGraphFacts -> refreshObservationFacts ->
  // replaceObservationFacts opens its OWN this.db.transaction() (:1088), which
  // now NESTS inside the outer save/update transaction added by this change.
  // better-sqlite3 ^12.10.0 converts the inner transaction() to a SAVEPOINT, so
  // no "transaction within a transaction" error should surface, and
  // observation_facts must still be fully replaced on update.
  it('completes legacy-mode save/update with nested facts transaction as a savepoint', () => {
    const store = new Store(':memory:', { graphFactsSource: 'legacy' });
    createLegacyObservationFactsTable(store);

    try {
      let saved!: ReturnType<Store['saveObservation']>['observation'];
      expect(() => {
        saved = store.saveObservation({
          title: 'Legacy nested tx',
          type: 'decision',
          project: 'legacy-nested',
          content: '**What**: Initial legacy content',
        }).observation;
      }).not.toThrow();

      // Facts written via the nested (now savepoint) transaction on save.
      expect(store.getObservationFacts({ observation_id: saved.id }).map((fact) => [fact.relation, fact.object]))
        .toEqual([
          ['HAS_TYPE', 'decision'],
          ['IN_PROJECT', 'legacy-nested'],
          ['HAS_WHAT', 'Initial legacy content'],
        ]);

      // Update path also nests the facts transaction inside the outer wrap.
      let updated: ReturnType<Store['updateObservation']> = null;
      expect(() => {
        updated = store.updateObservation({ id: saved.id, content: '**What**: Updated legacy content' });
      }).not.toThrow();
      expect(updated).not.toBeNull();

      // observation_facts fully replaced: old HAS_WHAT gone, new one present,
      // exactly one row per relation (no duplicate accumulation).
      const factRows = store.getDb().prepare(
        'SELECT relation, object FROM observation_facts WHERE observation_id = ? ORDER BY id'
      ).all(saved.id) as Array<{ relation: string; object: string }>;
      expect(factRows).toEqual([
        { relation: 'HAS_TYPE', object: 'decision' },
        { relation: 'IN_PROJECT', object: 'legacy-nested' },
        { relation: 'HAS_WHAT', object: 'Updated legacy content' },
      ]);
    } finally {
      store.close();
    }
  });
});
