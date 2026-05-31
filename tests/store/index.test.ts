import { describe, it, expect, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';
import { vectorToBuffer } from '../../src/retrieval/sqlite-vec.js';
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

    it('hybrid retrieval: uses Hybrid Retrieval defaults, fuses semantic/lexical/KG lanes, and degrades gracefully', async () => {
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
      expect(response?.laneOrder).toEqual(['sentence', 'chunk', 'lexical', 'kg']);
      expect(response?.degradedFallback?.includes('lexical')).toBe(true);
      expect(response?.degradedFallback?.includes('kg')).toBe(true);
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

    it('graph lane: returns kg_triples evidence with fallback metadata shape', async () => {
      store = new Store(':memory:');
      const saved = store.saveObservation({
        title: 'KG lane',
        content: 'API key belongs to service account in project hybrid-test.',
        project: 'hybrid-test',
      });
      const runtime = store as any;
      await runtime.processSemanticJobs({ limit: 20 });
      const response = await runtime.hybridRetrieve({ query: 'service account api key' });
      const hit = response.results.find((r: any) => r.observation.id === saved.observation.id);
      expect(hit).toBeDefined();
      expect(hit.evidence.byLane.kg?.length ?? 0).toBeGreaterThan(0);
      const kgEvidence = hit.evidence.byLane.kg[0];
      if (kgEvidence.source === 'kg_triples') {
        expect(typeof kgEvidence.kg?.provenance).toBe('string');
        expect(typeof kgEvidence.kg?.confidence).toBe('number');
      }
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
      runtime.semanticRuntime = { pending: false, stale: false, degraded: false, degradedReason: null };
      const provider = {
        config: store.config.embedding!,
        embed: async (texts: string[]) => texts.map(() => vector),
      };
      const response = await runtime.hybridRetrieve({ query: 'rotate encryption keys', embeddingProvider: provider });
      const hit = response.results.find((r: any) => r.observation.id === saved.observation.id);
      expect(hit.evidence.primary.lane).toBe('sentence');
      expect(hit.evidence.promotedParent?.chunkKey).toBeTruthy();
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
      expect(typeof kg?.dedupeKey).toBe('string');

      const factsFallback = store.getDb().prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'observation_facts'"
      ).get() as { name?: string } | undefined;
      expect(factsFallback?.name).toBe('observation_facts');
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

    it('degraded: returns lexical+kg lanes when semantic runtime is pending', async () => {
      store = new Store(':memory:');
      store.saveObservation({ title: 'Degraded fallback', content: 'encrypt data at rest', project: 'hybrid-test' });
      const runtime = store as any;
      const response = await runtime.hybridRetrieve({ query: 'encrypt data' });
      expect(response.pending).toBe(true);
      expect(response.degradedFallback).toContain('lexical');
      expect(response.degradedFallback).toContain('kg');
    });
  });
});
