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
});
