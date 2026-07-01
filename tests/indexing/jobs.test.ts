import { describe, it, expect, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';
import { requeueFailedEmbeddingJobs, recoverRetriableSemanticJobs, writeDeterministicKgFacts } from '../../src/indexing/jobs.js';

describe('requeueFailedEmbeddingJobs', () => {
  let store: Store;

  afterEach(() => {
    if (store) {
      try { store.close(); } catch { /* already closed */ }
    }
  });

  function seedFailedJob(
    db: ReturnType<Store['getDb']>,
    jobKey: string,
    kind: string,
    lastError: string
  ): void {
    db.prepare(
      `INSERT INTO semantic_jobs (job_key, kind, state, priority, attempt_count, max_attempts, last_error, available_at, updated_at)
       VALUES (?, ?, 'failed', 50, 3, 3, ?, datetime('now'), datetime('now'))`
    ).run(jobKey, kind, lastError);
  }

  it('resets chunk and sentence failed jobs to pending regardless of error text', () => {
    store = new Store(':memory:');
    const db = store.getDb();

    seedFailedJob(db, 'chunk:1', 'chunk', 'onnxruntime-common module not found');
    seedFailedJob(db, 'sentence:1', 'sentence', 'onnxruntime-common module not found');

    const changed = requeueFailedEmbeddingJobs(store);
    expect(changed).toBe(2);

    const rows = db.prepare(
      "SELECT job_key, state, attempt_count, last_error FROM semantic_jobs WHERE job_key IN ('chunk:1','sentence:1') ORDER BY job_key"
    ).all() as Array<{ job_key: string; state: string; attempt_count: number; last_error: string | null }>;

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.state).toBe('pending');
      expect(row.attempt_count).toBe(0);
      expect(row.last_error).toBeNull();
    }
  });

  it('does NOT touch failed jobs of other kinds (e.g. extract_kg)', () => {
    store = new Store(':memory:');
    const db = store.getDb();

    seedFailedJob(db, 'chunk:2', 'chunk', 'some error');
    seedFailedJob(db, 'kg:2', 'extract_kg', 'some kg error');

    const changed = requeueFailedEmbeddingJobs(store);
    expect(changed).toBe(1);

    const kgRow = db.prepare(
      "SELECT state, attempt_count FROM semantic_jobs WHERE job_key = 'kg:2'"
    ).get() as { state: string; attempt_count: number };

    expect(kgRow.state).toBe('failed');
    expect(kgRow.attempt_count).toBe(3);
  });

  it('does NOT touch jobs that are not in failed state', () => {
    store = new Store(':memory:');
    const db = store.getDb();

    db.prepare(
      `INSERT INTO semantic_jobs (job_key, kind, state, priority, attempt_count, max_attempts, available_at, updated_at)
       VALUES ('chunk:3', 'chunk', 'pending', 50, 0, 3, datetime('now'), datetime('now'))`
    ).run();
    db.prepare(
      `INSERT INTO semantic_jobs (job_key, kind, state, priority, attempt_count, max_attempts, available_at, updated_at)
       VALUES ('chunk:4', 'chunk', 'done', 50, 3, 3, datetime('now'), datetime('now'))`
    ).run();

    const changed = requeueFailedEmbeddingJobs(store);
    expect(changed).toBe(0);

    const pendingRow = db.prepare(
      "SELECT state FROM semantic_jobs WHERE job_key = 'chunk:3'"
    ).get() as { state: string };
    expect(pendingRow.state).toBe('pending');

    const doneRow = db.prepare(
      "SELECT state FROM semantic_jobs WHERE job_key = 'chunk:4'"
    ).get() as { state: string };
    expect(doneRow.state).toBe('done');
  });

  it('returns 0 when there are no failed embedding jobs', () => {
    store = new Store(':memory:');
    const changed = requeueFailedEmbeddingJobs(store);
    expect(changed).toBe(0);
  });

  it('store.requeueFailedEmbeddingJobs() delegates to the same SQL correctly', () => {
    store = new Store(':memory:');
    const db = store.getDb();

    seedFailedJob(db, 'chunk:10', 'chunk', 'arbitrary error text');
    seedFailedJob(db, 'sentence:10', 'sentence', 'another error');

    const changed = store.requeueFailedEmbeddingJobs();
    expect(changed).toBe(2);

    const rows = db.prepare(
      "SELECT state, attempt_count, last_error FROM semantic_jobs WHERE job_key IN ('chunk:10','sentence:10')"
    ).all() as Array<{ state: string; attempt_count: number; last_error: string | null }>;

    for (const row of rows) {
      expect(row.state).toBe('pending');
      expect(row.attempt_count).toBe(0);
      expect(row.last_error).toBeNull();
    }
  });
});

describe('recoverRetriableSemanticJobs (existing — ensure not broken)', () => {
  let store: Store;

  afterEach(() => {
    if (store) {
      try { store.close(); } catch { /* already closed */ }
    }
  });

  it('only resets failed jobs matching the VEC_ROWID_UNIQUE_ERROR prefix', () => {
    store = new Store(':memory:');
    const db = store.getDb();

    const VEC_ERROR = 'UNIQUE constraint failed: semantic_vector_rowids.lane, semantic_vector_rowids.vec_rowid';

    db.prepare(
      `INSERT INTO semantic_jobs (job_key, kind, state, priority, attempt_count, max_attempts, last_error, available_at, updated_at)
       VALUES ('chunk:20', 'chunk', 'failed', 50, 3, 3, ?, datetime('now'), datetime('now'))`
    ).run(VEC_ERROR + ': extra detail');

    db.prepare(
      `INSERT INTO semantic_jobs (job_key, kind, state, priority, attempt_count, max_attempts, last_error, available_at, updated_at)
       VALUES ('chunk:21', 'chunk', 'failed', 50, 3, 3, 'onnxruntime-common module not found', datetime('now'), datetime('now'))`
    ).run();

    const changed = recoverRetriableSemanticJobs(store);
    expect(changed).toBe(1);

    const vecRow = db.prepare(
      "SELECT state FROM semantic_jobs WHERE job_key = 'chunk:20'"
    ).get() as { state: string };
    expect(vecRow.state).toBe('pending');

    const otherRow = db.prepare(
      "SELECT state FROM semantic_jobs WHERE job_key = 'chunk:21'"
    ).get() as { state: string };
    expect(otherRow.state).toBe('failed');
  });
});

describe('writeDeterministicKgFacts', () => {
  let store: Store;

  afterEach(() => {
    if (store) {
      try { store.close(); } catch { /* already closed */ }
    }
  });

  function kgRows(observationId: number): Array<{
    id: number;
    relation: string;
    object: string;
    superseded_by_triple_id: number | null;
    superseded_at: string | null;
  }> {
    return store.getDb().prepare(
      `SELECT kt.id, kt.relation, oe.canonical_name AS object,
              kt.superseded_by_triple_id, kt.superseded_at
       FROM kg_triples kt
       JOIN kg_entities oe ON oe.id = kt.object_entity_id
       WHERE kt.source_type = 'observation'
         AND kt.source_id = ?
       ORDER BY kt.id`
    ).all(observationId) as Array<{
      id: number;
      relation: string;
      object: string;
      superseded_by_triple_id: number | null;
      superseded_at: string | null;
    }>;
  }

  it('loads an observation internally and persists deterministic KG triples without running jobs', () => {
    store = new Store(':memory:');
    const saved = store.saveObservation({
      title: 'Deterministic KG helper',
      content: 'Auth service depends on Redis cache.',
      project: 'indexing-test',
      topic_key: 'kg/helper',
    });
    const db = store.getDb();

    db.prepare("DELETE FROM kg_triples WHERE source_type = 'observation' AND source_id = ?").run(saved.observation.id);

    writeDeterministicKgFacts(store, saved.observation.id);

    const triples = db.prepare(
      `SELECT se.canonical_name AS subject, kt.relation, oe.canonical_name AS object, kt.provenance
       FROM kg_triples kt
       JOIN kg_entities se ON se.id = kt.subject_entity_id
       JOIN kg_entities oe ON oe.id = kt.object_entity_id
       WHERE kt.source_type = 'observation' AND kt.source_id = ?
       ORDER BY kt.id`
    ).all(saved.observation.id) as Array<{ subject: string; relation: string; object: string; provenance: string }>;

    expect(triples).toContainEqual(expect.objectContaining({
      subject: 'auth service',
      relation: 'DEPENDS_ON',
      object: 'redis cache',
      provenance: `observation:${saved.observation.id}`,
    }));
  });

  it('stores structured section content longer than 500 characters byte-for-byte in KG entities', () => {
    store = new Store(':memory:');
    const longSection = `prefix-${'x'.repeat(520)}-suffix`;
    const saved = store.saveObservation({
      title: 'Long structured section',
      content: `What: ${longSection}`,
      project: 'indexing-test',
      topic_key: 'kg/long-section',
    });
    const db = store.getDb();

    db.prepare("DELETE FROM kg_triples WHERE source_type = 'observation' AND source_id = ?").run(saved.observation.id);
    writeDeterministicKgFacts(store, saved.observation.id);

    const row = db.prepare(
      `SELECT oe.canonical_name AS object
       FROM kg_triples kt
       JOIN kg_entities oe ON oe.id = kt.object_entity_id
       WHERE kt.source_type = 'observation'
         AND kt.source_id = ?
         AND kt.relation = 'HAS_WHAT'`
    ).get(saved.observation.id) as { object: string } | undefined;

    expect(row?.object).toBe(longSection);
  });

  it('keeps first and unchanged deterministic extracts current without duplicates', () => {
    store = new Store(':memory:');
    const saved = store.saveObservation({
      title: 'Stable KG helper',
      content: [
        '**What**: Redis cache',
        '**Why**: Stable graph content',
      ].join('\n'),
      project: 'indexing-test',
      topic_key: 'kg/stable-helper',
    });

    const firstRows = kgRows(saved.observation.id);
    store.saveObservation({
      title: 'Stable KG helper',
      content: [
        '**What**: Redis cache',
        '**Why**: Stable graph content',
      ].join('\n'),
      project: 'indexing-test',
      topic_key: 'kg/stable-helper',
    });
    const secondRows = kgRows(saved.observation.id);

    expect(firstRows.length).toBeGreaterThan(0);
    expect(firstRows.every((row) => row.superseded_at === null && row.superseded_by_triple_id === null)).toBe(true);
    expect(secondRows).toHaveLength(firstRows.length);
    expect(secondRows.every((row) => row.superseded_at === null && row.superseded_by_triple_id === null)).toBe(true);
    expect(new Set(secondRows.map((row) => `${row.relation}:${row.object}`)).size).toBe(secondRows.length);
  });

  it('marks pure removals superseded without a replacement pointer', () => {
    store = new Store(':memory:');
    const saved = store.saveObservation({
      title: 'Pure removal KG helper',
      content: [
        '**What**: Redis cache',
        '**Where**: src/cache.ts',
      ].join('\n'),
      project: 'indexing-test',
      topic_key: 'kg/pure-removal',
    });

    store.saveObservation({
      title: 'Pure removal KG helper',
      content: '**Where**: src/cache.ts',
      project: 'indexing-test',
      topic_key: 'kg/pure-removal',
    });

    const removed = kgRows(saved.observation.id).find((row) => row.relation === 'HAS_WHAT' && row.object === 'Redis cache');
    expect(removed?.superseded_at).toEqual(expect.any(String));
    expect(removed?.superseded_by_triple_id).toBeNull();
  });

  it('marks removed same-source KG triples superseded and points replacements at the new triple', () => {
    store = new Store(':memory:');
    const first = store.saveObservation({
      title: 'Superseded KG helper',
      content: '**What**: Redis cache',
      project: 'indexing-test',
      topic_key: 'kg/supersede-helper',
    });
    const db = store.getDb();

    const updated = store.saveObservation({
      title: 'Superseded KG helper',
      content: '**What**: Valkey cache',
      project: 'indexing-test',
      topic_key: 'kg/supersede-helper',
    });

    expect(updated.observation.id).toBe(first.observation.id);
    const rows = db.prepare(
      `SELECT kt.id, kt.relation, oe.canonical_name AS object, kt.superseded_by_triple_id, kt.superseded_at
       FROM kg_triples kt
       JOIN kg_entities oe ON oe.id = kt.object_entity_id
       WHERE kt.source_type = 'observation'
         AND kt.source_id = ?
         AND kt.relation = 'HAS_WHAT'
       ORDER BY kt.id`
    ).all(first.observation.id) as Array<{
      id: number;
      relation: string;
      object: string;
      superseded_by_triple_id: number | null;
      superseded_at: string | null;
    }>;

    const oldRow = rows.find((row) => row.object === 'Redis cache');
    const newRow = rows.find((row) => row.object === 'Valkey cache');

    expect(oldRow).toBeDefined();
    expect(newRow).toBeDefined();
    expect(oldRow?.superseded_at).toEqual(expect.any(String));
    expect(oldRow?.superseded_by_triple_id).toBe(newRow?.id);
    expect(newRow?.superseded_at).toBeNull();
    expect(newRow?.superseded_by_triple_id).toBeNull();
  });

  it('does not supersede another observation while deterministic update needs no model services', () => {
    store = new Store(':memory:', {
      kgLlm: {
        enabled: true,
        provider: 'ollama',
        model: 'unused-test-model',
        baseUrl: 'http://127.0.0.1:11434',
        timeoutMs: 10,
        minContentChars: 1,
      },
    } as any);
    const a = store.saveObservation({
      title: 'Observation A',
      content: '**What**: Redis cache',
      project: 'indexing-test',
      topic_key: 'kg/no-cross-a',
    });
    const b = store.saveObservation({
      title: 'Observation B',
      content: '**What**: Postgres database',
      project: 'indexing-test',
      topic_key: 'kg/no-cross-b',
    });

    store.saveObservation({
      title: 'Observation A',
      content: '**What**: Valkey cache',
      project: 'indexing-test',
      topic_key: 'kg/no-cross-a',
    });

    const bRows = kgRows(b.observation.id);
    expect(a.observation.id).not.toBe(b.observation.id);
    expect(bRows.some((row) => row.object === 'Postgres database')).toBe(true);
    expect(bRows.every((row) => row.superseded_at === null && row.superseded_by_triple_id === null)).toBe(true);
  });

  it('uses legacy delete-and-reinsert behavior when supersession is disabled', () => {
    store = new Store(':memory:', {
      knowledgeGraph: {
        kgSupersedeEnabled: false,
      },
    } as any);
    const first = store.saveObservation({
      title: 'Flag off KG helper',
      content: '**What**: Redis cache',
      project: 'indexing-test',
      topic_key: 'kg/flag-off-helper',
    });
    const db = store.getDb();

    store.saveObservation({
      title: 'Flag off KG helper',
      content: '**What**: Valkey cache',
      project: 'indexing-test',
      topic_key: 'kg/flag-off-helper',
    });

    const rows = db.prepare(
      `SELECT oe.canonical_name AS object, kt.superseded_by_triple_id, kt.superseded_at
       FROM kg_triples kt
       JOIN kg_entities oe ON oe.id = kt.object_entity_id
       WHERE kt.source_type = 'observation'
         AND kt.source_id = ?
         AND kt.relation = 'HAS_WHAT'
       ORDER BY kt.id`
    ).all(first.observation.id) as Array<{
      object: string;
      superseded_by_triple_id: number | null;
      superseded_at: string | null;
    }>;

    expect(rows).toEqual([
      {
        object: 'Valkey cache',
        superseded_by_triple_id: null,
        superseded_at: null,
      },
    ]);
  });

  it('revives a previously superseded KG triple when the same fact is reasserted', () => {
    store = new Store(':memory:');
    const saved = store.saveObservation({
      title: 'Revived KG helper',
      content: '**What**: Redis cache',
      project: 'indexing-test',
      topic_key: 'kg/revive-helper',
    });
    const db = store.getDb();

    store.saveObservation({
      title: 'Revived KG helper',
      content: '**What**: Valkey cache',
      project: 'indexing-test',
      topic_key: 'kg/revive-helper',
    });
    store.saveObservation({
      title: 'Revived KG helper',
      content: '**What**: Redis cache',
      project: 'indexing-test',
      topic_key: 'kg/revive-helper',
    });

    const rows = db.prepare(
      `SELECT kt.id, oe.canonical_name AS object, kt.superseded_by_triple_id, kt.superseded_at
       FROM kg_triples kt
       JOIN kg_entities oe ON oe.id = kt.object_entity_id
       WHERE kt.source_type = 'observation'
         AND kt.source_id = ?
         AND kt.relation = 'HAS_WHAT'
         AND oe.canonical_name = 'Redis cache'`
    ).all(saved.observation.id) as Array<{
      id: number;
      object: string;
      superseded_by_triple_id: number | null;
      superseded_at: string | null;
    }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].superseded_at).toBeNull();
    expect(rows[0].superseded_by_triple_id).toBeNull();
  });

  it('applies gated content-pattern hints only to concrete same-source prior facts', () => {
    store = new Store(':memory:', {
      knowledgeGraph: {
        kgSupersedeContentPatterns: true,
        kgSupersedeConfidenceThreshold: 0.7,
      },
    } as any);
    const saved = store.saveObservation({
      title: 'Content pattern helper',
      content: '**What**: Redis cache',
      project: 'indexing-test',
      topic_key: 'kg/content-pattern',
    });
    store.saveObservation({
      title: 'Content pattern helper',
      content: [
        '**What**: Redis cache',
        'Redis cache is deprecated.',
      ].join('\n'),
      project: 'indexing-test',
      topic_key: 'kg/content-pattern',
    });

    const row = store.getDb().prepare(
      `SELECT kt.superseded_at
       FROM kg_triples kt
       JOIN kg_entities oe ON oe.id = kt.object_entity_id
       WHERE kt.source_type = 'observation'
         AND kt.source_id = ?
         AND kt.relation = 'HAS_WHAT'
         AND oe.canonical_name = 'Redis cache'`
    ).get(saved.observation.id) as { superseded_at: string | null } | undefined;

    expect(row?.superseded_at).toEqual(expect.any(String));
  });

  it('does not apply content-pattern supersession when disabled or below threshold', () => {
    const disabled = new Store(':memory:', {
      knowledgeGraph: {
        kgSupersedeContentPatterns: false,
        kgSupersedeConfidenceThreshold: 0.7,
      },
    } as any);
    const below = new Store(':memory:', {
      knowledgeGraph: {
        kgSupersedeContentPatterns: true,
        kgSupersedeConfidenceThreshold: 0.8,
      },
    } as any);

    try {
      const disabledSaved = disabled.saveObservation({
        title: 'Disabled content pattern',
        content: 'cache decision -- HAS_WHAT --> Redis cache',
        project: 'indexing-test',
        topic_key: 'kg/pattern-disabled',
      });
      disabled.saveObservation({
        title: 'Disabled content pattern',
        content: [
          'cache decision -- HAS_WHAT --> Redis cache',
          'Redis cache is deprecated.',
        ].join('\n'),
        project: 'indexing-test',
        topic_key: 'kg/pattern-disabled',
      });

      const belowSaved = below.saveObservation({
        title: 'Below threshold content pattern',
        content: 'cache decision -- HAS_WHAT --> Redis cache',
        project: 'indexing-test',
        topic_key: 'kg/pattern-below',
      });
      below.saveObservation({
        title: 'Below threshold content pattern',
        content: [
          'cache decision -- HAS_WHAT --> Redis cache',
          'Redis cache is superseded by Valkey.',
        ].join('\n'),
        project: 'indexing-test',
        topic_key: 'kg/pattern-below',
      });

      const disabledRow = disabled.getDb().prepare(
        `SELECT kt.superseded_at
         FROM kg_triples kt
         JOIN kg_entities oe ON oe.id = kt.object_entity_id
         WHERE kt.source_id = ? AND kt.relation = 'HAS_WHAT' AND oe.canonical_name = 'redis cache'`
      ).get(disabledSaved.observation.id) as { superseded_at: string | null };
      const belowRow = below.getDb().prepare(
        `SELECT kt.superseded_at
         FROM kg_triples kt
         JOIN kg_entities oe ON oe.id = kt.object_entity_id
         WHERE kt.source_id = ? AND kt.relation = 'HAS_WHAT' AND oe.canonical_name = 'redis cache'`
      ).get(belowSaved.observation.id) as { superseded_at: string | null };

      expect(disabledRow.superseded_at).toBeNull();
      expect(belowRow.superseded_at).toBeNull();
    } finally {
      disabled.close();
      below.close();
    }
  });

  it('does not let content-pattern hints mark facts from another observation', () => {
    store = new Store(':memory:', {
      knowledgeGraph: {
        kgSupersedeContentPatterns: true,
        kgSupersedeConfidenceThreshold: 0.7,
      },
    } as any);
    const a = store.saveObservation({
      title: 'Pattern source A',
      content: '**What**: Redis cache',
      project: 'indexing-test',
      topic_key: 'kg/pattern-source-a',
    });
    const b = store.saveObservation({
      title: 'Pattern source B',
      content: '**What**: Postgres database',
      project: 'indexing-test',
      topic_key: 'kg/pattern-source-b',
    });

    store.saveObservation({
      title: 'Pattern source A',
      content: [
        '**What**: Redis cache',
        'Postgres database is deprecated.',
      ].join('\n'),
      project: 'indexing-test',
      topic_key: 'kg/pattern-source-a',
    });

    const bRows = kgRows(b.observation.id);
    expect(a.observation.id).not.toBe(b.observation.id);
    expect(bRows.every((row) => row.superseded_at === null && row.superseded_by_triple_id === null)).toBe(true);
  });
});
