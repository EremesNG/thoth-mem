import { describe, it, expect, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';
import { vectorToBuffer } from '../../src/retrieval/sqlite-vec.js';
import { deterministicVecRowid, splitChunkIntoSentences, splitIntoChunks } from '../../src/retrieval/sentences.js';
import { KG_ENTITY_TYPES } from '../../src/indexing/kg-extractor.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Store', () => {
  let store: Store;

  afterEach(() => {
    if (store) {
      try { store.close(); } catch { /* already closed */ }
    }
  });

  it('opens an in-memory database', () => {
    store = new Store(':memory:');
    expect(store).toBeDefined();
  });

  it('creates all tables on initialization', () => {
    store = new Store(':memory:');
    const db = store.getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('observations');
    expect(tableNames).toContain('observation_versions');
    expect(tableNames).toContain('user_prompts');
  });

  it('can close and reopen', () => {
    store = new Store(':memory:');
    store.close();
    store = new Store(':memory:');
    expect(store).toBeDefined();
  });

  it('handles file-based database (idempotent schema)', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'thoth-store-'));
    const dbPath = join(tmpDir, 'test.db');

    const store1 = new Store(dbPath);
    store1.close();

    const store2 = new Store(dbPath);
    const db = store2.getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all() as { name: string }[];
    expect(tables.length).toBeGreaterThanOrEqual(4);
    store2.close();

    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('ensureSession', () => {
    it('creates a new session', () => {
      store = new Store(':memory:', { retrievalDefaults: { minSemanticScore: 0 } });
      store.ensureSession('session-1', 'myproject', '/path/to/project');

      const db = store.getDb();
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get('session-1') as any;
      expect(session).toBeDefined();
      expect(session.project).toBe('myproject');
      expect(session.directory).toBe('/path/to/project');
    });

    it('is idempotent (second call does nothing)', () => {
      store = new Store(':memory:', { retrievalDefaults: { minSemanticScore: 0 } });
      store.ensureSession('session-1', 'myproject');
      store.ensureSession('session-1', 'myproject');

      const db = store.getDb();
      const count = db.prepare('SELECT COUNT(*) as c FROM sessions WHERE id = ?').get('session-1') as any;
      expect(count.c).toBe(1);
    });

    it('handles null directory', () => {
      store = new Store(':memory:', { retrievalDefaults: { minSemanticScore: 0 } });
      store.ensureSession('session-1', 'myproject');

      const db = store.getDb();
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get('session-1') as any;
      expect(session.directory).toBeNull();
    });
  });

  it('merges partial config', () => {
    store = new Store(':memory:', { maxContentLength: 50_000, previewLength: 500 });
    expect(store.config.maxContentLength).toBe(50_000);
    expect(store.config.previewLength).toBe(500);
    expect(store.config.maxSearchResults).toBe(20);
  });

  describe('hybrid retrieval/index contracts', () => {
    it('stale semantic cleanup: update removes stale semantic artifacts after reindex completion', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const db = store.getDb();
      const vector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 0.11 : 0));
      const provider = {
        config: store.config.embedding!,
        embed: async (texts: string[]) => texts.map(() => vector),
      };

      const saved = store.saveObservation({
        title: 'stale semantic cleanup update',
        content: 'old-secret-token phrase',
        project: 'hybrid-test',
      });
      await runtime.processSemanticJobs({ limit: 20, embeddingProvider: provider });
      store.updateObservation({
        id: saved.observation.id,
        content: 'fresh-public-token phrase',
      });
      await runtime.processSemanticJobs({ limit: 20, embeddingProvider: provider });

      const staleChunk = db.prepare(
        "SELECT COUNT(*) AS count FROM semantic_chunks WHERE observation_id = ? AND content LIKE '%old-secret-token%'"
      ).get(saved.observation.id) as { count: number };
      const staleSentence = db.prepare(
        "SELECT COUNT(*) AS count FROM semantic_sentences WHERE observation_id = ? AND content LIKE '%old-secret-token%'"
      ).get(saved.observation.id) as { count: number };

      expect(staleChunk.count).toBe(0);
      expect(staleSentence.count).toBe(0);
    });

    it('stale semantic cleanup: delete and rebuild remove orphan semantic vectors', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const db = store.getDb();
      const vector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 0.13 : 0));
      const provider = {
        config: store.config.embedding!,
        embed: async (texts: string[]) => texts.map(() => vector),
      };

      const saved = store.saveObservation({
        title: 'stale semantic cleanup delete',
        content: 'to-delete semantic body',
        project: 'hybrid-test',
      });
      await runtime.processSemanticJobs({ limit: 20, embeddingProvider: provider });
      const beforeVecRows = db.prepare(
        'SELECT (SELECT COUNT(*) FROM vec_chunks) + (SELECT COUNT(*) FROM vec_sentences) AS count'
      ).get() as { count: number };
      expect(beforeVecRows.count).toBeGreaterThan(0);
      db.prepare('DELETE FROM observations WHERE id = ?').run(saved.observation.id);
      runtime.enqueueManualSemanticRebuild?.({ scope: 'all', reason: 'cleanup-check' });
      await runtime.processSemanticJobs({ limit: 20, embeddingProvider: provider });

      const orphanRowids = db.prepare(
        `SELECT COUNT(*) AS count
         FROM semantic_vector_rowids svr
         LEFT JOIN observations o ON o.id = svr.observation_id
       WHERE o.id IS NULL`
      ).get() as { count: number };
      const remainingVecRows = db.prepare(
        'SELECT (SELECT COUNT(*) FROM vec_chunks) + (SELECT COUNT(*) FROM vec_sentences) AS count'
      ).get() as { count: number };

      expect(orphanRowids.count).toBe(0);
      expect(remainingVecRows.count).toBe(0);
    });

    it('hard delete removes semantic vectors and knowledge triples before metadata is lost', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const db = store.getDb();
      const vector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 0.17 : 0));
      const provider = {
        config: store.config.embedding!,
        embed: async (texts: string[]) => texts.map(() => vector),
      };

      const saved = store.saveObservation({
        title: 'hard delete cleanup',
        content: 'api-key belongs-to vault-service for cleanup testing',
        project: 'hybrid-test',
      });
      await runtime.processSemanticJobs({ limit: 20, embeddingProvider: provider });

      const beforeVecRows = db.prepare(
        'SELECT (SELECT COUNT(*) FROM vec_chunks) + (SELECT COUNT(*) FROM vec_sentences) AS count'
      ).get() as { count: number };
      const beforeTriples = db.prepare("SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?")
        .get(saved.observation.id) as { count: number };

      expect(beforeVecRows.count).toBeGreaterThan(0);
      expect(beforeTriples.count).toBeGreaterThan(0);
      expect(store.deleteObservation(saved.observation.id, true)).toBe(true);

      const afterVecRows = db.prepare(
        'SELECT (SELECT COUNT(*) FROM vec_chunks) + (SELECT COUNT(*) FROM vec_sentences) AS count'
      ).get() as { count: number };
      const afterRowids = db.prepare('SELECT COUNT(*) AS count FROM semantic_vector_rowids WHERE observation_id = ?')
        .get(saved.observation.id) as { count: number };
      const afterTriples = db.prepare("SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?")
        .get(saved.observation.id) as { count: number };

      expect(afterVecRows.count).toBe(0);
      expect(afterRowids.count).toBe(0);
      expect(afterTriples.count).toBe(0);
    });

    it('kg source-safe: update replaces stale triples and keeps source lineage bound to latest content', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const db = store.getDb();
      const saved = store.saveObservation({
        title: 'kg source-safe',
        content: 'api-key belongs-to payments-service',
        project: 'hybrid-test',
      });
      await runtime.processSemanticJobs({ limit: 20 });
      store.updateObservation({
        id: saved.observation.id,
        content: 'api-key belongs-to auth-service',
      });
      await runtime.processSemanticJobs({ limit: 20 });

      const triples = db.prepare(
        `SELECT s.canonical_name AS subject, t.relation, o.canonical_name AS object, t.provenance
         FROM kg_triples t
         JOIN kg_entities s ON s.id = t.subject_entity_id
         JOIN kg_entities o ON o.id = t.object_entity_id
         WHERE t.source_type = 'observation' AND t.source_id = ?
         ORDER BY t.id`
      ).all(saved.observation.id) as Array<{ subject: string; relation: string; object: string; provenance: string | null }>;

      expect(triples.length).toBeGreaterThan(0);
      expect(triples.some((triple) => `${triple.subject} ${triple.relation} ${triple.object}`.includes('payments-service'))).toBe(false);
      expect(triples.every((triple) => typeof triple.provenance === 'string' && triple.provenance.length > 0)).toBe(true);
    });

    it('kg source-safe: retries upsert by deterministic key and avoid duplicate triples', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const db = store.getDb();
      const saved = store.saveObservation({
        title: 'kg source-safe retries',
        content: 'secret belongs-to vault',
        project: 'hybrid-test',
      });
      await runtime.processSemanticJobs({ limit: 20 });
      const before = db.prepare("SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?")
        .get(saved.observation.id) as { count: number };
      store.updateObservation({
        id: saved.observation.id,
        content: 'secret belongs-to vault',
      });
      await runtime.processSemanticJobs({ limit: 20 });
      const after = db.prepare("SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?")
        .get(saved.observation.id) as { count: number };

      expect(after.count).toBeLessThanOrEqual(before.count);
    });

    it('atomic claim: two workers cannot claim the same pending semantic job', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const db = store.getDb();
      const saved = store.saveObservation({
        title: 'atomic claim',
        content: 'worker claim race target',
        project: 'hybrid-test',
      });
      db.prepare('DELETE FROM semantic_jobs').run();
      db.prepare(
        `INSERT INTO semantic_jobs (job_key, kind, state, priority, observation_id, source_key)
         VALUES (?, 'chunk', 'pending', 50, ?, ?)`
      ).run(`chunk:${saved.observation.id}`, saved.observation.id, `observation:${saved.observation.id}`);

      const claimA = await runtime.processSemanticJobs({ limit: 1, embeddingProvider: null, workerId: 'worker-a' });
      const claimB = await runtime.processSemanticJobs({ limit: 1, embeddingProvider: null, workerId: 'worker-b' });
      const runningRows = db.prepare(
        "SELECT COUNT(*) AS count FROM semantic_jobs WHERE observation_id = ? AND state = 'running'"
      ).get(saved.observation.id) as { count: number };

      expect(claimA + claimB).toBeLessThanOrEqual(1);
      expect(runningRows.count).toBeLessThanOrEqual(1);
    });

    it('semantic jobs defer sentence indexing until chunk rows exist', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const db = store.getDb();
      const saved = store.saveObservation({
        title: 'sentence waits for chunks',
        content: 'Sentence indexing should wait for chunk materialization.',
        project: 'hybrid-test',
      });

      db.prepare("UPDATE semantic_jobs SET state = 'running' WHERE job_key = ?")
        .run(`chunk:${saved.observation.id}`);

      await runtime.processSemanticJobs({ limit: 1, embeddingProvider: null });

      const sentenceJob = db.prepare(
        'SELECT state, attempt_count FROM semantic_jobs WHERE job_key = ?'
      ).get(`sentence:${saved.observation.id}`) as { state: string; attempt_count: number };
      const sentenceRows = db.prepare(
        'SELECT COUNT(*) AS count FROM semantic_sentences WHERE observation_id = ?'
      ).get(saved.observation.id) as { count: number };

      expect(sentenceJob).toEqual({ state: 'pending', attempt_count: 0 });
      expect(sentenceRows.count).toBe(0);
    });

    it('semantic jobs retry until max_attempts before failing with terminal diagnostics', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const db = store.getDb();
      const saved = store.saveObservation({
        title: 'retry attempts',
        content: 'retry this embedding job',
        project: 'hybrid-test',
      });
      db.prepare("DELETE FROM semantic_jobs WHERE kind != 'chunk'").run();
      const failingProvider = {
        config: store.config.embedding!,
        embed: async () => {
          throw new Error('embedding offline');
        },
      };

      await runtime.processSemanticJobs({ limit: 1, embeddingProvider: failingProvider });
      let row = db.prepare('SELECT state, attempt_count FROM semantic_jobs WHERE job_key = ?')
        .get(`chunk:${saved.observation.id}`) as { state: string; attempt_count: number };
      expect(row).toEqual({ state: 'pending', attempt_count: 1 });

      db.prepare("UPDATE semantic_jobs SET available_at = datetime('now') WHERE job_key = ?").run(`chunk:${saved.observation.id}`);
      await runtime.processSemanticJobs({ limit: 1, embeddingProvider: failingProvider });
      row = db.prepare('SELECT state, attempt_count FROM semantic_jobs WHERE job_key = ?')
        .get(`chunk:${saved.observation.id}`) as { state: string; attempt_count: number };
      expect(row).toEqual({ state: 'pending', attempt_count: 2 });

      db.prepare("UPDATE semantic_jobs SET available_at = datetime('now') WHERE job_key = ?").run(`chunk:${saved.observation.id}`);
      await runtime.processSemanticJobs({ limit: 1, embeddingProvider: failingProvider });
      row = db.prepare('SELECT state, attempt_count, last_error, finished_at FROM semantic_jobs WHERE job_key = ?')
        .get(`chunk:${saved.observation.id}`) as { state: string; attempt_count: number; last_error: string | null; finished_at: string | null };
      expect(row).toMatchObject({ state: 'failed', attempt_count: 3, last_error: 'embedding offline' });
      expect(row.finished_at).toEqual(expect.any(String));
    });

    it('semantic jobs recover stale running claims before processing', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const db = store.getDb();
      const saved = store.saveObservation({
        title: 'stale running claim',
        content: 'A worker claimed this job before the process stopped.',
        project: 'hybrid-test',
      });
      db.prepare(
        `UPDATE semantic_jobs
         SET state = 'running',
             attempt_count = 1,
             started_at = datetime('now', '-2 hours')
         WHERE job_key = ?`
      ).run(`chunk:${saved.observation.id}`);

      await runtime.processSemanticJobs({ limit: 1, embeddingProvider: null });

      const row = db.prepare(
        'SELECT state, attempt_count, finished_at FROM semantic_jobs WHERE job_key = ?'
      ).get(`chunk:${saved.observation.id}`) as { state: string; attempt_count: number; finished_at: string | null };
      expect(row.state).toBe('done');
      expect(row.attempt_count).toBe(1);
      expect(row.finished_at).toEqual(expect.any(String));
    });

    it('semantic jobs recover failed vector rowid collisions without failing the lane', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const db = store.getDb();
      const saved = store.saveObservation({
        title: 'rowid collision',
        content: 'First sentence should receive a vector. Second sentence should also receive a vector.',
        project: 'hybrid-test',
      });
      const provider = {
        config: store.config.embedding!,
        embed: async (texts: string[]) => texts.map(() => (
          Array.from({ length: 384 }, (_, index) => (index === 0 ? 0.1 : 0))
        )),
      };

      await runtime.processSemanticJobs({ limit: 1, embeddingProvider: provider });
      const chunk = db.prepare(
        'SELECT chunk_key, content FROM semantic_chunks WHERE observation_id = ? ORDER BY chunk_index ASC LIMIT 1'
      ).get(saved.observation.id) as { chunk_key: string; content: string };
      const sentence = splitChunkIntoSentences({
        observationId: saved.observation.id,
        chunkKey: chunk.chunk_key,
        text: chunk.content,
      })[0];
      const collidingRowid = deterministicVecRowid(`sentence:${sentence.sentenceKey}`);
      db.prepare(
        `INSERT INTO semantic_vector_rowids (lane, source_key, vec_rowid, observation_id, lineage_hash)
         VALUES ('sentence', 'sentence:preexisting-collision', ?, 999999, 'collision')`
      ).run(collidingRowid);
      db.prepare(
        `UPDATE semantic_jobs
         SET state = 'failed',
             attempt_count = 3,
             last_error = 'UNIQUE constraint failed: semantic_vector_rowids.lane, semantic_vector_rowids.vec_rowid',
             finished_at = datetime('now')
         WHERE job_key = ?`
      ).run(`sentence:${saved.observation.id}`);

      await runtime.processSemanticJobs({ limit: 1, embeddingProvider: provider });

      const job = db.prepare(
        'SELECT state, last_error FROM semantic_jobs WHERE job_key = ?'
      ).get(`sentence:${saved.observation.id}`) as { state: string; last_error: string | null };
      const rowids = db.prepare(
        `SELECT source_key, vec_rowid
         FROM semantic_vector_rowids
         WHERE lane = 'sentence' AND source_key IN (?, 'sentence:preexisting-collision')
         ORDER BY source_key`
      ).all(sentence.sentenceKey) as Array<{ source_key: string; vec_rowid: number }>;

      expect(job).toEqual({ state: 'done', last_error: null });
      expect(rowids).toHaveLength(2);
      expect(new Set(rowids.map((row) => row.vec_rowid)).size).toBe(2);
    });

    it('semantic index state clears sticky pending when queue and vector coverage are complete', async () => {
      const embedding = {
        provider: 'transformers_local' as const,
        model: 'mock-embedding',
        baseUrl: null,
        dimensions: 3,
        hyde: { enabled: false, model: null, baseUrl: null, timeoutMs: 4000 },
        configHash: 'mock-embedding-hash',
      };
      store = new Store(':memory:', { embedding });
      const runtime = store as any;
      const db = store.getDb();
      const provider = {
        config: embedding,
        embed: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]),
      };
      store.saveObservation({
        title: 'complete coverage pending flag',
        content: 'Chunk vector exists. Sentence vector exists.',
        project: 'hybrid-test',
      });
      await runtime.processSemanticJobs({ limit: 20, embeddingProvider: provider });
      db.prepare(
        "UPDATE semantic_index_state SET pending = 1, stale = 0, degraded = 0 WHERE lane IN ('chunk','sentence')"
      ).run();

      const progress = store.getSemanticIndexProgress();
      const state = store.getSemanticIndexState();

      expect(progress.totals.pending).toBe(0);
      expect(progress.totals.running).toBe(0);
      expect(progress.totals.failed).toBe(0);
      expect(progress.lanes.every((lane: { pending: boolean; stale: boolean; degraded: boolean }) => (
        !lane.pending && !lane.stale && !lane.degraded
      ))).toBe(true);
      expect(state).toMatchObject({ pending: false, stale: false, degraded: false });
    });

    it('semantic job worker skips terminal failures and continues later queued work', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const db = store.getDb();
      const failedSource = store.saveObservation({
        title: 'failed source',
        content: 'embedding provider outage should not starve the queue',
        project: 'hybrid-test',
      });
      const laterSource = store.saveObservation({
        title: 'later source',
        content: 'Auth service depends on Redis cache.',
        project: 'hybrid-test',
      });
      db.prepare('DELETE FROM semantic_jobs').run();
      db.prepare(
        `INSERT INTO semantic_jobs (job_key, kind, state, priority, observation_id, source_key, max_attempts)
         VALUES (?, 'chunk', 'pending', 10, ?, ?, 1)`
      ).run(`chunk:${failedSource.observation.id}`, failedSource.observation.id, `observation:${failedSource.observation.id}`);
      db.prepare(
        `INSERT INTO semantic_jobs (job_key, kind, state, priority, observation_id, source_key)
         VALUES (?, 'extract_kg', 'pending', 20, ?, ?)`
      ).run(`kg:${laterSource.observation.id}`, laterSource.observation.id, `observation:${laterSource.observation.id}`);
      const failingProvider = {
        config: store.config.embedding!,
        embed: async () => {
          throw new Error('embedding offline');
        },
      };

      await runtime.processSemanticJobs({ limit: 1, embeddingProvider: failingProvider });
      await runtime.processSemanticJobs({ limit: 5, embeddingProvider: null });

      const rows = db.prepare('SELECT job_key, state FROM semantic_jobs ORDER BY priority ASC')
        .all() as Array<{ job_key: string; state: string }>;
      const tripleCount = db.prepare("SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?")
        .get(laterSource.observation.id) as { count: number };
      expect(rows).toEqual([
        { job_key: `chunk:${failedSource.observation.id}`, state: 'failed' },
        { job_key: `kg:${laterSource.observation.id}`, state: 'done' },
      ]);
      expect(tripleCount.count).toBeGreaterThan(0);
    });

    it('fusion policy: lane order/weights change winner when lexical and semantic disagree', async () => {
      store = new Store(':memory:', { retrievalDefaults: { minSemanticScore: 0 } });
      const runtime = store as any;
      const semanticVector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 0.9 : 0));
      const lexicalVector = Array.from({ length: 384 }, (_, i) => (i === 1 ? 0.9 : 0));
      const queryVector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 0.9 : 0));
      const provider = {
        config: store.config.embedding!,
        embed: async (texts: string[]) => texts.map((text) => {
          const normalized = text.toLowerCase();
          if (normalized.includes('semantic') || normalized.includes('rollover')) return semanticVector;
          if (normalized.includes('rotate key rotate key')) return lexicalVector;
          return queryVector;
        }),
      };
      const semanticHit = store.saveObservation({
        title: 'fusion policy semantic',
        content: 'rotate cryptographic material with staged key rollover',
        project: 'hybrid-test',
      });
      const lexicalHit = store.saveObservation({
        title: 'fusion policy lexical',
        content: 'rotate key rotate key rotate key',
        project: 'hybrid-test',
      });
      await runtime.processSemanticJobs({ limit: 20, embeddingProvider: provider });

      const base = await runtime.hybridRetrieve({
        query: 'rotate key rollover',
        laneOrder: ['sentence', 'chunk', 'lexical', 'kg'],
        laneWeights: { sentence: 2, chunk: 2, lexical: 0, kg: 0 },
      });
      const lexicalFavored = await runtime.hybridRetrieve({
        query: 'rotate key rollover',
        laneOrder: ['lexical', 'sentence', 'chunk', 'kg'],
        laneWeights: { sentence: 0, chunk: 0, lexical: 3, kg: 0 },
      });

      const baseTop = base.results[0]?.observation?.id;
      const lexicalTop = lexicalFavored.results[0]?.observation?.id;
      expect([semanticHit.observation.id, lexicalHit.observation.id]).toContain(baseTop);
      expect([semanticHit.observation.id, lexicalHit.observation.id]).toContain(lexicalTop);
      expect(baseTop).not.toBe(lexicalTop);
    });

    it('semantic index: save is non-blocking, semantic state is pending, and rebuild requests are deduped', () => {
      store = new Store(':memory:');
      store.saveObservation({
        title: 'Semantic async',
        content: 'Background indexing should be eventual.',
        project: 'hybrid-test',
      });

      const runtime = store as any;
      const semanticState = runtime.getSemanticIndexState?.();
      const enqueueA = runtime.requestSemanticRebuild?.({ reason: 'config-hash-mismatch' });
      const enqueueB = runtime.requestSemanticRebuild?.({ reason: 'config-hash-mismatch' });

      expect(semanticState?.pending).toBe(true);
      expect(enqueueA?.dedupeKey).toBe(enqueueB?.dedupeKey);
    });

    it('semantic index: chunk indexing is prioritized before sentence indexing for same source', () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const plan = runtime.planSemanticJobsForObservation?.({
        observationId: 1,
        content: 'chunk before sentence ordering',
      });

      expect(plan?.map((job: { kind: string }) => job.kind)).toEqual(['chunk', 'sentence']);
    });

    it('semantic chunker: uses Glia-style 300-word windows with 80-word overlap', () => {
      const words = Array.from({ length: 650 }, (_, index) => `word${index}`);
      const chunks = splitIntoChunks({ observationId: 7, text: words.join(' ') });

      expect(chunks).toHaveLength(3);
      expect(chunks[0].content.split(/\s+/)).toHaveLength(300);
      expect(chunks[1].content.split(/\s+/).slice(0, 80)).toEqual(words.slice(220, 300));
      expect(chunks[0].chunkKey).toContain('chunk:7:0');
    });

    it('semantic index: indexed save enqueues background work without embedding during save', async () => {
      const embedding = {
        provider: 'transformers_local' as const,
        model: 'mock-embedding',
        baseUrl: null,
        dimensions: 3,
        hyde: { enabled: false, model: null, baseUrl: null, timeoutMs: 4000 },
        configHash: 'mock-embedding-hash',
      };
      store = new Store(':memory:', { embedding });
      const provider = {
        config: embedding,
        calls: 0,
        embed: async (texts: string[]) => {
          provider.calls += 1;
          return texts.map(() => [0.1, 0.2, 0.3]);
        },
      };

      const saved = await store.saveObservationWithIndex({
        title: 'Background chunk vector',
        content: 'Chunk vectors should be queued on save and indexed by the worker.',
        project: 'hybrid-test',
      }, { embeddingProvider: provider });

      const db = store.getDb();
      const chunkVectors = db.prepare(
        "SELECT COUNT(*) AS count FROM semantic_vector_rowids WHERE lane = 'chunk' AND observation_id = ?"
      ).get(saved.observation.id) as { count: number };
      const sentenceVectors = db.prepare(
        "SELECT COUNT(*) AS count FROM semantic_vector_rowids WHERE lane = 'sentence' AND observation_id = ?"
      ).get(saved.observation.id) as { count: number };
      const chunkJob = db.prepare("SELECT state FROM semantic_jobs WHERE kind = 'chunk' AND observation_id = ?")
        .get(saved.observation.id) as { state: string };
      const sentenceJob = db.prepare("SELECT state FROM semantic_jobs WHERE kind = 'sentence' AND observation_id = ?")
        .get(saved.observation.id) as { state: string };

      expect(provider.calls).toBe(0);
      expect(chunkVectors.count).toBe(0);
      expect(sentenceVectors.count).toBe(0);
      expect(chunkJob.state).toBe('pending');
      expect(sentenceJob.state).toBe('pending');
    });

    it('semantic index: writes vectors with sqlite-vec integer rowids', async () => {
      const embedding = {
        provider: 'transformers_local' as const,
        model: 'mock-embedding',
        baseUrl: null,
        dimensions: 3,
        hyde: { enabled: false, model: null, baseUrl: null, timeoutMs: 4000 },
        configHash: 'mock-embedding-hash',
      };
      store = new Store(':memory:', { embedding });
      const provider = {
        config: embedding,
        embed: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]),
      };
      const saved = store.saveObservation({
        title: 'Vector rowid',
        content: 'Chunk vectors should be inserted into sqlite-vec.',
        project: 'hybrid-test',
      });
      const runtime = store as any;

      await runtime.processSemanticJobs({ limit: 1, embeddingProvider: provider });

      const db = store.getDb();
      const vectorRows = db.prepare("SELECT COUNT(*) AS count FROM semantic_vector_rowids WHERE lane = 'chunk' AND observation_id = ?")
        .get(saved.observation.id) as { count: number };
      const vecRows = db.prepare('SELECT COUNT(*) AS count FROM vec_chunks')
        .get() as { count: number };

      expect(vectorRows.count).toBeGreaterThan(0);
      expect(vecRows.count).toBeGreaterThan(0);
    });

    it('semantic index: keeps a lane pending while same-lane jobs remain queued', async () => {
      const embedding = {
        provider: 'transformers_local' as const,
        model: 'mock-embedding',
        baseUrl: null,
        dimensions: 3,
        hyde: { enabled: false, model: null, baseUrl: null, timeoutMs: 4000 },
        configHash: 'mock-embedding-hash',
      };
      store = new Store(':memory:', { embedding });
      const provider = {
        config: embedding,
        embed: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]),
      };

      store.saveObservation({
        title: 'Lane backlog one',
        content: 'First chunk vector waits in a larger backlog.',
        project: 'hybrid-test',
      });
      store.saveObservation({
        title: 'Lane backlog two',
        content: 'Second chunk vector keeps the lane incomplete.',
        project: 'hybrid-test',
      });
      const runtime = store as any;

      await runtime.processSemanticJobs({ limit: 1, embeddingProvider: provider });

      const chunkState = store.getDb().prepare(
        "SELECT pending, stale FROM semantic_index_state WHERE lane = 'chunk'"
      ).get() as { pending: number; stale: number };
      const pendingChunkJobs = store.getDb().prepare(
        "SELECT COUNT(*) AS count FROM semantic_jobs WHERE kind = 'chunk' AND state = 'pending'"
      ).get() as { count: number };

      expect(pendingChunkJobs.count).toBeGreaterThan(0);
      expect(chunkState).toEqual({ pending: 1, stale: 1 });
    });

    it('hybrid retrieval: uses Hybrid Retrieval defaults, fuses core lanes, and degrades gracefully', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const response = await runtime.hybridRetrieve?.({ query: 'encrypt data at rest' });

      expect(response?.defaults).toEqual({
        sentenceTopK: 100,
        chunkTopK: 20,
        lexicalLimit: 20,
        minSemanticScore: 0.3,
        l2DistanceScale: 20,
      });
      expect(response?.laneOrder).toEqual(['sentence', 'kg', 'chunk', 'lexical']);
      expect(response?.degradedFallback?.includes('lexical')).toBe(true);
      expect(response?.degradedFallback?.includes('kg')).toBe(false);
      expect(response?.lexicalQuery).toContain('"encrypt"*');
      expect(response?.scoreFromDistance?.(20)).toBeCloseTo(Math.exp(-1), 10);
    });

    it('sentence KNN: applies sqlite-vec kNN, distance scoring, and source attribution', async () => {
      store = new Store(':memory:');
      const saved = store.saveObservation({
        title: 'KNN sentence',
        content: 'Rotate keys every week. Encrypt data at rest.',
        project: 'hybrid-test',
      });
      const runtime = store as any;
      const vector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 0.1 : 0));
      const db = store.getDb();
      db.prepare(
        `INSERT INTO semantic_sentences (observation_id, chunk_key, sentence_key, sentence_index, content, project)
         VALUES (?, 'chunk:seed', 'sentence:seed', 0, 'Rotate keys every week.', 'hybrid-test')`
      ).run(saved.observation.id);
      db.prepare(
        `INSERT INTO semantic_vector_rowids (lane, source_key, vec_rowid, observation_id, lineage_hash)
         VALUES ('sentence', 'sentence:seed', 1001, ?, 'sentence:seed')`
      ).run(saved.observation.id);
      db.prepare('INSERT INTO vec_sentences(rowid, embedding) VALUES (1001, ?)').run(vectorToBuffer(vector));

      const lane = runtime.querySentenceLane({
        vector,
        source: 'raw_query',
        topK: 100,
        minSemanticScore: 0,
        l2DistanceScale: 20,
      });

      expect(lane.length).toBeGreaterThan(0);
      expect(lane[0].source).toBe('raw_query');
      expect(lane[0].lane).toBe('sentence');
    });

    it('chunk KNN: applies sqlite-vec kNN and thresholding with chunk evidence', async () => {
      store = new Store(':memory:');
      const saved = store.saveObservation({
        title: 'KNN chunk',
        content: 'Large parent chunk for chunk matching and retrieval.',
        project: 'hybrid-test',
      });
      const runtime = store as any;
      const vector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 0.4 : 0));
      const db = store.getDb();
      db.prepare(
        `INSERT INTO semantic_chunks (observation_id, chunk_key, chunk_index, content, project)
         VALUES (?, 'chunk:seed', 0, 'Large parent chunk for chunk matching and retrieval.', 'hybrid-test')`
      ).run(saved.observation.id);
      db.prepare(
        `INSERT INTO semantic_vector_rowids (lane, source_key, vec_rowid, observation_id, lineage_hash)
         VALUES ('chunk', 'chunk:seed', 1002, ?, 'chunk:seed')`
      ).run(saved.observation.id);
      db.prepare('INSERT INTO vec_chunks(rowid, embedding) VALUES (1002, ?)').run(vectorToBuffer(vector));

      const lane = runtime.queryChunkLane({
        vector,
        source: 'raw_query',
        topK: 20,
        minSemanticScore: 0,
        l2DistanceScale: 20,
      });

      expect(lane.length).toBeGreaterThan(0);
      expect(lane[0].lane).toBe('chunk');
      expect(lane[0].distance).toBeGreaterThanOrEqual(0);
    });

    it('FTS prefix: uses sanitized OR prefix terms', async () => {
      store = new Store(':memory:');
      store.saveObservation({
        title: 'FTS prefix',
        content: 'Encryption keys and key rotation policy.',
        project: 'hybrid-test',
      });
      const runtime = store as any;
      const response = await runtime.hybridRetrieve({ query: 'encrypt key rot' });
      expect(response.lexicalQuery).toContain('OR');
      expect(response.lexicalQuery).toContain('"encrypt"*');
    });

    it('FTS lexical evidence returns matching sentences instead of whole observations', async () => {
      store = new Store(':memory:');
      const saved = store.saveObservation({
        title: 'FTS surgical trim',
        content: 'Alpha setup is unrelated. Rotate encryption keys weekly. Billing notes stay out of the recall.',
        project: 'hybrid-test',
      });
      const runtime = store as any;
      const response = await runtime.hybridRetrieve({ query: 'encrypt', project: 'hybrid-test' });
      const hit = response.results.find((r: any) => r.observation.id === saved.observation.id);
      const lexicalEvidence = hit.evidence.byLane.lexical[0].text;

      expect(lexicalEvidence).toContain('Rotate encryption keys weekly.');
      expect(lexicalEvidence).not.toContain('Alpha setup');
      expect(lexicalEvidence).not.toContain('Billing notes');
    });

    it('graph ranking: KG is a first-class lane and can outrank a weak lexical-only match', async () => {
      store = new Store(':memory:', { retrievalDefaults: { minSemanticScore: 1 } });
      const runtime = store as any;
      const db = store.getDb();
      const lexical = store.saveObservation({
        title: 'Weak lexical mention',
        content: 'Helios appears in a status aside without the retrieval fact.',
        project: 'hybrid-test',
      });
      const graph = store.saveObservation({
        title: 'Graph ranked fact',
        content: 'Unrelated body keeps this out of lexical retrieval.',
        project: 'hybrid-test',
      });

      db.prepare(
        "INSERT INTO kg_entities (entity_key, entity_type, canonical_name, aliases_json, metadata_json) VALUES (?, ?, ?, '[]', '{}')"
      ).run('entity:helios', 'system', 'Helios');
      db.prepare(
        "INSERT INTO kg_entities (entity_key, entity_type, canonical_name, aliases_json, metadata_json) VALUES (?, ?, ?, '[]', '{}')"
      ).run('entity:primary-cache', 'system', 'Primary cache');
      const helios = db.prepare('SELECT id FROM kg_entities WHERE entity_key = ?').get('entity:helios') as { id: number };
      const primaryCache = db.prepare('SELECT id FROM kg_entities WHERE entity_key = ?').get('entity:primary-cache') as { id: number };
      db.prepare(
        `INSERT INTO kg_triples (
          subject_entity_id, relation, object_entity_id, source_type, source_id, source_sync_id,
          project, topic_key, provenance, confidence, triple_hash, extractor_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        helios.id,
        'USES',
        primaryCache.id,
        'observation',
        graph.observation.id,
        graph.observation.sync_id,
        'hybrid-test',
        null,
        'store-test:ranked-kg',
        0.95,
        'store-test:ranked-kg',
        'v1',
      );

      const response = await runtime.hybridRetrieve({ query: 'helios', project: 'hybrid-test', limit: 5 });
      expect(response.results.map((r: any) => r.observation.id)).toContain(lexical.observation.id);
      expect(response.results[0].observation.id).toBe(graph.observation.id);
      expect(response.results[0].evidence.primary.lane).toBe('kg');
      expect(response.results[0].evidence.primary.source).toBe('kg_triples');
    });

    it('graph discovery: can return query-matching graph facts even without lexical or semantic core hits', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const saved = store.saveObservation({
        title: 'Graph discovery only',
        content: 'body intentionally does not mention codename',
        project: 'hybrid-test',
      });
      store.getDb().prepare(
        'INSERT INTO observation_facts (observation_id, subject, relation, object, project, topic_key, type) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(saved.observation.id, 'Helios', 'HAS_WHAT', 'Redis cache decision', 'hybrid-test', null, 'decision');

      const response = await runtime.hybridRetrieve({ query: 'helios', project: 'hybrid-test', limit: 5 });
      const hit = response.results.find((r: any) => r.observation.id === saved.observation.id);
      expect(hit).toBeDefined();
      expect(hit.evidence.primary.lane).toBe('kg');
      expect(hit.evidence.primary.source).toBe('observation_facts');
    });

    it('graph discovery: orders graph-only KG candidates by confidence when lane weight is enabled', async () => {
      store = new Store(':memory:', { retrievalDefaults: { minSemanticScore: 1 } });
      const runtime = store as any;
      const db = store.getDb();

      const first = store.saveObservation({
        title: 'Graph direct match',
        content: 'unrelated note about caching',
        project: 'hybrid-test',
      });
      const second = store.saveObservation({
        title: 'Graph fallback match',
        content: 'another unrelated note about deployment',
        project: 'hybrid-test',
      });

      db.prepare(
        "INSERT INTO kg_entities (entity_key, entity_type, canonical_name, aliases_json, metadata_json) VALUES (?, ?, ?, '[]', '{}')"
      ).run('entity:helios', 'system', 'Helios');
      db.prepare(
        "INSERT INTO kg_entities (entity_key, entity_type, canonical_name, aliases_json, metadata_json) VALUES (?, ?, ?, '[]', '{}')"
      ).run('entity:primary-cache', 'system', 'Primary cache');
      db.prepare(
        "INSERT INTO kg_entities (entity_key, entity_type, canonical_name, aliases_json, metadata_json) VALUES (?, ?, ?, '[]', '{}')"
      ).run('entity:secondary-cache', 'system', 'Secondary cache');

      const helios = db.prepare('SELECT id FROM kg_entities WHERE entity_key = ?').get('entity:helios') as { id: number };
      const primaryCache = db.prepare('SELECT id FROM kg_entities WHERE entity_key = ?').get('entity:primary-cache') as { id: number };
      const secondaryCache = db.prepare('SELECT id FROM kg_entities WHERE entity_key = ?').get('entity:secondary-cache') as { id: number };

      db.prepare(
        `INSERT INTO kg_triples (
          subject_entity_id, relation, object_entity_id, source_type, source_id, source_sync_id,
          project, topic_key, provenance, confidence, triple_hash, extractor_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        helios.id,
        'USES',
        primaryCache.id,
        'observation',
        first.observation.id,
        first.observation.sync_id,
        'hybrid-test',
        null,
        'store-test:high-confidence',
        0.91,
        'store-test:helios-high',
        'v1',
      );
      db.prepare(
        `INSERT INTO kg_triples (
          subject_entity_id, relation, object_entity_id, source_type, source_id, source_sync_id,
          project, topic_key, provenance, confidence, triple_hash, extractor_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        helios.id,
        'USES',
        secondaryCache.id,
        'observation',
        second.observation.id,
        second.observation.sync_id,
        'hybrid-test',
        null,
        'store-test:low-confidence',
        0.15,
        'store-test:helios-low',
        'v1',
      );

      const response = await runtime.hybridRetrieve({ query: 'helios', project: 'hybrid-test', limit: 5 });
      const ids = response.results.map((r: any) => r.observation.id);
      expect(ids.slice(0, 2)).toEqual([first.observation.id, second.observation.id]);
      expect(response.results[0].evidence.primary.source).toBe('kg_triples');
      expect(response.results[0].score).toBeGreaterThan(response.results[1].score);
    });

    it('graph discovery: unrelated KG facts do not flood retrieval', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      for (let index = 0; index < 5; index += 1) {
        const saved = store.saveObservation({
          title: `Graph flood ${index}`,
          content: 'content does not include codenames',
          project: 'hybrid-test',
        });
        store.getDb().prepare(
          'INSERT INTO observation_facts (observation_id, subject, relation, object, project, topic_key, type) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(saved.observation.id, `Other-${index}`, 'HAS_WHAT', `Non matching object ${index}`, 'hybrid-test', null, 'decision');
      }

      const response = await runtime.hybridRetrieve({ query: 'helios', project: 'hybrid-test', limit: 5 });
      expect(response.results.length).toBe(0);
    });

    it('fusion: deterministically merges lane evidence and uses stable tie-breakers', async () => {
      store = new Store(':memory:');
      store.saveObservation({ title: 'Fusion A', content: 'encrypt data at rest and rotate keys', project: 'hybrid-test' });
      store.saveObservation({ title: 'Fusion B', content: 'encrypt data at rest and rotate keys', project: 'hybrid-test' });
      const runtime = store as any;
      const response = await runtime.hybridRetrieve({ query: 'encrypt data rotate' });
      expect(response.results.length).toBeGreaterThanOrEqual(2);
      const ids = response.results.map((r: any) => r.observation.id);
      expect([...ids].sort((a, b) => b - a)).toEqual(ids);
    });

    it('HyDE: embeds raw query always and adds hypothetical embedding when available', async () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const success = await runtime.prepareSemanticInputs?.({
        query: 'How do we rotate API credentials?',
        hyde: { enabled: true, mode: 'success' },
      });
      const fallback = await runtime.prepareSemanticInputs?.({
        query: 'How do we rotate API credentials?',
        hyde: { enabled: true, mode: 'timeout' },
      });

      expect(success?.inputs.map((input: { source: string }) => input.source)).toEqual(['raw_query', 'hyde_answer']);
      expect(fallback?.inputs.map((input: { source: string }) => input.source)).toEqual(['raw_query']);
    });

    it('HyDE: uses the configured generator by default and supports per-query disable', async () => {
      store = new Store(':memory:', {
        hyde: {
          enabled: true,
          provider: 'transformers_local',
          model: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct',
          baseUrl: null,
          timeoutMs: 4000,
        },
      });
      const runtime = store as any;
      const generator = {
        generate: async () => 'API credentials are rotated by issuing a new key and revoking the old one.',
      };

      const enabled = await runtime.prepareSemanticInputs?.({
        query: 'How do we rotate API credentials?',
        hydeGenerator: generator,
      });
      const disabled = await runtime.prepareSemanticInputs?.({
        query: 'How do we rotate API credentials?',
        hyde: { enabled: false },
        hydeGenerator: generator,
      });

      expect(enabled?.inputs.map((input: { source: string }) => input.source)).toEqual(['raw_query', 'hyde_answer']);
      expect(disabled?.inputs.map((input: { source: string }) => input.source)).toEqual(['raw_query']);
    });

    it('small-to-big: returns sentence-first evidence and optional promoted parent context', () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const assembled = runtime.assembleHybridEvidence?.({
        sentenceHit: { text: 'Rotate encryption keys weekly.', score: 0.41 },
        parentChunk: { text: 'Long parent chunk context', id: 'chunk-1' },
        threshold: 0.3,
      });

      expect(assembled?.primary.text).toBe('Rotate encryption keys weekly.');
      expect(assembled?.primary.kind).toBe('sentence');
      expect(assembled?.promotedParent?.id).toBe('chunk-1');
    });

    it('small-to-big: hybrid retrieval keeps sentence as primary and promotes parent chunk', async () => {
      store = new Store(':memory:');
      const saved = store.saveObservation({
        title: 'Small big retrieval',
        content: 'Rotate encryption keys weekly. Keep parent context nearby.',
        project: 'hybrid-test',
      });
      const runtime = store as any;
      const vector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 0.7 : 0));
      const db = store.getDb();
      db.prepare(
        `INSERT INTO semantic_chunks (observation_id, chunk_key, chunk_index, content, project)
         VALUES (?, 'chunk:small-big', 0, 'Rotate encryption keys weekly. Keep parent context nearby.', 'hybrid-test')`
      ).run(saved.observation.id);
      db.prepare(
        `INSERT INTO semantic_sentences (observation_id, chunk_key, sentence_key, sentence_index, content, project)
         VALUES (?, 'chunk:small-big', 'sentence:small-big', 0, 'Rotate encryption keys weekly.', 'hybrid-test')`
      ).run(saved.observation.id);
      db.prepare(
        `INSERT INTO semantic_vector_rowids (lane, source_key, vec_rowid, observation_id, lineage_hash)
         VALUES ('sentence', 'sentence:small-big', 1003, ?, 'sentence:small-big')`
      ).run(saved.observation.id);
      db.prepare(
        `INSERT INTO semantic_vector_rowids (lane, source_key, vec_rowid, observation_id, lineage_hash)
         VALUES ('chunk', 'chunk:small-big', 1004, ?, 'chunk:small-big')`
      ).run(saved.observation.id);
      db.prepare('INSERT INTO vec_sentences(rowid, embedding) VALUES (1003, ?)').run(vectorToBuffer(vector));
      db.prepare('INSERT INTO vec_chunks(rowid, embedding) VALUES (1004, ?)').run(vectorToBuffer(vector));
      db.prepare(
        "UPDATE semantic_index_state SET pending = 0, stale = 0, degraded = 0 WHERE lane IN ('chunk','sentence')"
      ).run();
      const provider = {
        config: store.config.embedding!,
        embed: async (texts: string[]) => texts.map(() => vector),
      };
      const response = await runtime.hybridRetrieve({ query: 'rotate encryption keys', embeddingProvider: provider });
      const hit = response.results.find((r: any) => r.observation.id === saved.observation.id);
      expect(hit.evidence.primary.lane).toBe('sentence');
      expect(hit.evidence.promotedParent?.chunkKey).toBeTruthy();
    });

    it('small-to-big: parent promotion policy follows retrieval thresholding and does not promote without sentence evidence', async () => {
      store = new Store(':memory:', { retrievalDefaults: { minSemanticScore: 1.1 } });
      const saved = store.saveObservation({
        title: 'Small big threshold policy',
        content: 'Rotate encryption keys weekly. Keep parent context nearby.',
        project: 'hybrid-test',
      });
      const runtime = store as any;
      const vector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 0.7 : 0));
      const db = store.getDb();
      db.prepare(
        `INSERT INTO semantic_chunks (observation_id, chunk_key, chunk_index, content, project)
         VALUES (?, 'chunk:small-big-threshold', 0, 'Rotate encryption keys weekly. Keep parent context nearby.', 'hybrid-test')`
      ).run(saved.observation.id);
      db.prepare(
        `INSERT INTO semantic_sentences (observation_id, chunk_key, sentence_key, sentence_index, content, project)
         VALUES (?, 'chunk:small-big-threshold', 'sentence:small-big-threshold', 0, 'Rotate encryption keys weekly.', 'hybrid-test')`
      ).run(saved.observation.id);
      db.prepare(
        `INSERT INTO semantic_vector_rowids (lane, source_key, vec_rowid, observation_id, lineage_hash)
         VALUES ('sentence', 'sentence:small-big-threshold', 1203, ?, 'sentence:small-big-threshold')`
      ).run(saved.observation.id);
      db.prepare(
        `INSERT INTO semantic_vector_rowids (lane, source_key, vec_rowid, observation_id, lineage_hash)
         VALUES ('chunk', 'chunk:small-big-threshold', 1204, ?, 'chunk:small-big-threshold')`
      ).run(saved.observation.id);
      db.prepare('INSERT INTO vec_sentences(rowid, embedding) VALUES (1203, ?)').run(vectorToBuffer(vector));
      db.prepare('INSERT INTO vec_chunks(rowid, embedding) VALUES (1204, ?)').run(vectorToBuffer(vector));
      db.prepare(
        "UPDATE semantic_index_state SET pending = 0, stale = 0, degraded = 0 WHERE lane IN ('chunk','sentence')"
      ).run();
      const provider = {
        config: store.config.embedding!,
        embed: async (texts: string[]) => texts.map(() => vector),
      };

      const response = await runtime.hybridRetrieve({ query: 'rotate encryption keys', project: 'hybrid-test', embeddingProvider: provider });
      const hit = response.results.find((r: any) => r.observation.id === saved.observation.id);
      expect(hit.evidence.primary.lane).toBe('lexical');
      expect(hit.evidence.promotedParent).toBeUndefined();
    });

    it('knowledge graph: defines taxonomy breadth, provenance/confidence, dedupe, and observation_facts fallback', () => {
      store = new Store(':memory:');
      const runtime = store as any;
      const kg = runtime.extractKnowledgeTriples?.({
        content: 'API key belongs to service account in project hybrid-test.',
      });

      expect(Array.isArray(kg?.taxonomy?.entityTypes)).toBe(true);
      expect(Array.isArray(kg?.taxonomy?.relationTypes)).toBe(true);
      expect(kg?.taxonomy?.entityTypes.length).toBeGreaterThanOrEqual(22);
      expect(kg?.taxonomy?.relationTypes.length).toBeGreaterThanOrEqual(20);
      expect(kg?.triples?.every((triple: { provenance?: string; confidence?: number }) =>
        typeof triple.provenance === 'string' && typeof triple.confidence === 'number'
      )).toBe(true);
      expect(kg?.triples?.some((triple: { relation?: string }) => triple.relation === 'BELONGS_TO')).toBe(true);
      expect(kg?.triples?.every((triple: { subjectType?: string; objectType?: string }) =>
        KG_ENTITY_TYPES.includes(triple.subjectType as typeof KG_ENTITY_TYPES[number])
        && KG_ENTITY_TYPES.includes(triple.objectType as typeof KG_ENTITY_TYPES[number])
        && triple.subjectType !== 'entity'
        && triple.objectType !== 'entity'
      )).toBe(true);
      expect(typeof kg?.dedupeKey).toBe('string');

      const factsFallback = store.getDb().prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'observation_facts'"
      ).get() as { name?: string } | undefined;
      expect(factsFallback?.name).toBe('observation_facts');
    });

    it('observation_facts fallback: keeps kg_triples evidence and adds matching facts as complementary provenance', async () => {
      store = new Store(':memory:', { retrievalDefaults: { minSemanticScore: 0 } });
      const runtime = store as any;
      const saved = store.saveObservation({
        title: 'KG + facts',
        content: 'service account belongs-to security-platform',
        project: 'hybrid-test',
      });
      await runtime.processSemanticJobs({ limit: 20 });
      store.getDb().prepare(
        'INSERT INTO observation_facts (observation_id, subject, relation, object, project, topic_key, type) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(saved.observation.id, 'service account', 'HAS_WHAT', 'security platform rotation', 'hybrid-test', null, 'discovery');

      const response = await runtime.hybridRetrieve({ query: 'service account security platform', project: 'hybrid-test' });
      const hit = response.results.find((r: any) => r.observation.id === saved.observation.id);
      expect(hit).toBeDefined();
      const kgSources = new Set((hit.evidence.byLane.kg ?? []).map((c: any) => c.source));
      expect(kgSources.has('kg_triples')).toBe(true);
      expect(kgSources.has('observation_facts')).toBe(true);
    });

    it('background indexing: processSemanticJobs indexes chunks/sentences and converges idempotently', async () => {
      store = new Store(':memory:');
      const saved = store.saveObservation({
        title: 'Index me',
        content: 'Sentence one. Sentence two.',
        project: 'hybrid-test',
      });

      const runtime = store as any;
      const firstPass = await runtime.processSemanticJobs?.({ limit: 20 });
      const secondPass = await runtime.processSemanticJobs?.({ limit: 20 });

      const db = store.getDb();
      const chunkCount = db.prepare('SELECT COUNT(*) as count FROM semantic_chunks WHERE observation_id = ?')
        .get(saved.observation.id) as { count: number };
      const sentenceCount = db.prepare('SELECT COUNT(*) as count FROM semantic_sentences WHERE observation_id = ?')
        .get(saved.observation.id) as { count: number };

      expect(firstPass).toBeGreaterThan(0);
      expect(secondPass).toBe(0);
      expect(chunkCount.count).toBeGreaterThan(0);
      expect(sentenceCount.count).toBeGreaterThan(0);
    });

    it('background indexing: enriches long observations with optional KG LLM triples', async () => {
      store = new Store(':memory:', {
        kgLlm: {
          enabled: true,
          provider: 'ollama',
          model: 'qwen2.5:7b-instruct',
          baseUrl: 'http://127.0.0.1:11434',
          timeoutMs: 8000,
          minContentChars: 100,
        },
      } as any);
      const calls: string[] = [];
      const saved = store.saveObservation({
        title: 'Long KG source',
        content: Array.from({ length: 10 }, (_, index) => (
          `Turn ${index}: the memory router and context budget were discussed without an explicit relation.`
        )).join('\n'),
        project: 'hybrid-test',
      });

      const runtime = store as any;
      await runtime.processSemanticJobs({
        limit: 20,
        kgLlmExtractor: {
          extract: async (input: { content: string }) => {
            calls.push(input.content);
            return [
              {
                subject: 'Memory Router',
                relation: 'DEPENDS_ON',
                object: 'Context Budget',
                confidence: 0.94,
              },
            ];
          },
        },
      });

      const row = store.getDb().prepare(
        `SELECT se.canonical_name AS subject, kt.relation, oe.canonical_name AS object, kt.confidence
         FROM kg_triples kt
         JOIN kg_entities se ON se.id = kt.subject_entity_id
         JOIN kg_entities oe ON oe.id = kt.object_entity_id
         WHERE kt.source_id = ? AND kt.relation = 'DEPENDS_ON'`
      ).get(saved.observation.id) as { subject: string; relation: string; object: string; confidence: number } | undefined;

      expect(calls).toHaveLength(1);
      expect(row).toMatchObject({
        subject: 'memory router',
        relation: 'DEPENDS_ON',
        object: 'context budget',
        confidence: 0.94,
      });
    });

    it('background indexing: records optional KG LLM failures as job telemetry while completing deterministic KG', async () => {
      store = new Store(':memory:', {
        kgLlm: {
          enabled: true,
          provider: 'ollama',
          model: 'qwen2.5:7b-instruct',
          baseUrl: 'http://127.0.0.1:11434',
          timeoutMs: 8000,
          minContentChars: 100,
        },
      } as any);
      const saved = store.saveObservation({
        title: 'KG LLM telemetry source',
        content: [
          'Auth service depends on Redis cache.',
          ...Array.from({ length: 10 }, (_, index) => (
            `Turn ${index}: long conversation context keeps the LLM enrichment gate enabled.`
          )),
        ].join('\n'),
        project: 'hybrid-test',
      });

      const runtime = store as any;
      await runtime.processSemanticJobs({
        limit: 20,
        kgLlmExtractor: {
          extract: async () => {
            throw new Error('kg provider offline');
          },
        },
      });

      const job = store.getDb().prepare(
        'SELECT state, last_error FROM semantic_jobs WHERE job_key = ?'
      ).get(`kg:${saved.observation.id}`) as { state: string; last_error: string | null };
      const triples = store.getDb().prepare(
        "SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?"
      ).get(saved.observation.id) as { count: number };
      const progress = runtime.getSemanticIndexProgress({ project: 'hybrid-test' });

      expect(job.state).toBe('done');
      expect(job.last_error).toContain('KG LLM enrichment failed: kg provider offline');
      expect(triples.count).toBeGreaterThan(0);
      expect(progress.recentErrors.some((error: { jobKey: string; lastError: string | null }) => (
        error.jobKey === `kg:${saved.observation.id}`
        && error.lastError?.includes('kg provider offline')
      ))).toBe(true);
    });

    it('rebuild: manual rebuild enqueue is idempotent and hash mismatch marks stale', () => {
      store = new Store(':memory:');
      const runtime = store as any;

      const a = runtime.enqueueManualSemanticRebuild?.({ scope: 'global', reason: 'manual' });
      const b = runtime.enqueueManualSemanticRebuild?.({ scope: 'global', reason: 'manual' });
      expect(a?.dedupeKey).toBe(b?.dedupeKey);

      const state = runtime.getSemanticIndexState?.();
      expect(state?.pending).toBe(true);
      expect(state?.stale).toBe(true);
    });

    it('rebuild: requeues existing semantic jobs even when previous attempts are done', async () => {
      store = new Store(':memory:');
      const saved = store.saveObservation({
        title: 'Requeue semantic job',
        content: 'Rebuild should retry chunk vectors after provider changes.',
        project: 'hybrid-test',
      });
      const runtime = store as any;
      const db = store.getDb();

      db.prepare(
        "UPDATE semantic_jobs SET state = 'done', attempt_count = 2, finished_at = datetime('now') WHERE job_key = ?"
      ).run(`chunk:${saved.observation.id}`);
      db.prepare(
        "UPDATE semantic_jobs SET state = 'done', attempt_count = 2, finished_at = datetime('now') WHERE job_key = ?"
      ).run(`sentence:${saved.observation.id}`);

      runtime.enqueueManualSemanticRebuild?.({ scope: 'all', reason: 'manual' });
      await runtime.processSemanticJobs({ limit: 1, embeddingProvider: null });

      const row = db.prepare('SELECT state, attempt_count FROM semantic_jobs WHERE job_key = ?')
        .get(`chunk:${saved.observation.id}`) as { state: string; attempt_count: number };
      const sentenceRow = db.prepare('SELECT state, attempt_count FROM semantic_jobs WHERE job_key = ?')
        .get(`sentence:${saved.observation.id}`) as { state: string; attempt_count: number };
      expect(row.state).toBe('pending');
      expect(row.attempt_count).toBe(0);
      expect(sentenceRow.state).toBe('pending');
      expect(sentenceRow.attempt_count).toBe(0);
    });

    it('degraded: returns lexical fallback when semantic runtime is pending', async () => {
      store = new Store(':memory:');
      store.saveObservation({ title: 'Degraded fallback', content: 'encrypt data at rest', project: 'hybrid-test' });
      const runtime = store as any;
      const response = await runtime.hybridRetrieve({ query: 'encrypt data' });
      expect(response.pending).toBe(true);
      expect(response.degradedFallback).toContain('lexical');
      expect(response.degradedFallback).not.toContain('kg');
    });
  });
});
