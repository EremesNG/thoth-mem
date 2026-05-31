import type { Store } from '../store/index.js';
import type { EmbeddingProviderAdapter } from '../retrieval/providers.js';
import { deterministicVecRowid, splitChunkIntoSentences, splitIntoChunks } from '../retrieval/sentences.js';
import { vectorToBuffer } from '../retrieval/sqlite-vec.js';
import { extractKnowledgeTriples } from './kg-extractor.js';

interface JobRow {
  id: number;
  kind: 'chunk' | 'sentence' | 'rebuild_semantic' | 'extract_kg';
  observation_id: number | null;
  job_key: string;
  source_key: string | null;
  max_attempts: number;
  attempt_count: number;
}

export async function processNextSemanticJob(
  store: Store,
  input?: { embeddingProvider?: EmbeddingProviderAdapter | null }
): Promise<{ processed: boolean; kind?: JobRow['kind'] }> {
  const db = store.getDb();
  const job = db.prepare(
    `SELECT * FROM semantic_jobs
     WHERE state = 'pending' AND available_at <= datetime('now')
     ORDER BY priority ASC, id ASC
     LIMIT 1`
  ).get() as JobRow | undefined;

  if (!job) {
    return { processed: false };
  }

  db.prepare(
    "UPDATE semantic_jobs SET state = 'running', attempt_count = attempt_count + 1, started_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(job.id);

  try {
    if (job.kind === 'chunk' && job.observation_id !== null) {
      await processChunkJob(store, job.observation_id, input?.embeddingProvider ?? null);
    } else if (job.kind === 'sentence' && job.observation_id !== null) {
      await processSentenceJob(store, job.observation_id, input?.embeddingProvider ?? null);
    } else if (job.kind === 'rebuild_semantic') {
      processRebuildJob(store, job.job_key);
    } else if (job.kind === 'extract_kg' && job.observation_id !== null) {
      processKgJob(store, job.observation_id);
    }

    db.prepare(
      "UPDATE semantic_jobs SET state = 'done', finished_at = datetime('now'), updated_at = datetime('now'), last_error = NULL WHERE id = ?"
    ).run(job.id);
    return { processed: true, kind: job.kind };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const finalState = job.attempt_count + 1 >= job.max_attempts ? 'failed' : 'pending';
    db.prepare(
      "UPDATE semantic_jobs SET state = ?, last_error = ?, available_at = datetime('now', '+1 second'), updated_at = datetime('now') WHERE id = ?"
    ).run(finalState, msg, job.id);
    return { processed: true, kind: job.kind };
  }
}

export async function processSemanticJobs(
  store: Store,
  input?: { embeddingProvider?: EmbeddingProviderAdapter | null; limit?: number }
): Promise<number> {
  const limit = input?.limit ?? 50;
  let count = 0;
  while (count < limit) {
    const result = await processNextSemanticJob(store, input);
    if (!result.processed) {
      break;
    }
    count += 1;
  }
  return count;
}

async function processChunkJob(
  store: Store,
  observationId: number,
  embeddingProvider: EmbeddingProviderAdapter | null
): Promise<void> {
  const db = store.getDb();
  const obs = db.prepare('SELECT id, content, project, topic_key FROM observations WHERE id = ? AND deleted_at IS NULL').get(observationId) as
    | { id: number; content: string; project: string | null; topic_key: string | null }
    | undefined;
  if (!obs) {
    return;
  }

  const chunks = splitIntoChunks({ observationId: obs.id, text: obs.content });
  const upsertChunk = db.prepare(
    `INSERT INTO semantic_chunks (observation_id, chunk_key, chunk_index, content, project, topic_key, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(chunk_key) DO UPDATE SET
       content = excluded.content,
       project = excluded.project,
       topic_key = excluded.topic_key,
       updated_at = datetime('now')`
  );

  for (const chunk of chunks) {
    upsertChunk.run(obs.id, chunk.chunkKey, chunk.chunkIndex, chunk.content, obs.project, obs.topic_key);
  }

  await embedLane(store, 'chunk', chunks.map((c) => ({ key: c.chunkKey, content: c.content, observationId: obs.id })), embeddingProvider);
  db.prepare(
    `INSERT INTO semantic_jobs (job_key, kind, state, priority, observation_id, source_key)
     VALUES (?, 'sentence', 'pending', 60, ?, ?)
     ON CONFLICT(job_key) DO NOTHING`
  ).run(`sentence:${obs.id}`, obs.id, `observation:${obs.id}`);
}

async function processSentenceJob(
  store: Store,
  observationId: number,
  embeddingProvider: EmbeddingProviderAdapter | null
): Promise<void> {
  const db = store.getDb();
  const chunks = db.prepare(
    'SELECT chunk_key, content FROM semantic_chunks WHERE observation_id = ? ORDER BY chunk_index ASC'
  ).all(observationId) as Array<{ chunk_key: string; content: string }>;
  if (chunks.length === 0) {
    return;
  }

  const upsertSentence = db.prepare(
    `INSERT INTO semantic_sentences (observation_id, chunk_key, sentence_key, sentence_index, content, project, topic_key, updated_at)
     SELECT ?, ?, ?, ?, ?, o.project, o.topic_key, datetime('now')
     FROM observations o WHERE o.id = ?
     ON CONFLICT(sentence_key) DO UPDATE SET
       content = excluded.content,
       project = excluded.project,
       topic_key = excluded.topic_key,
       updated_at = datetime('now')`
  );

  const items: Array<{ key: string; content: string; observationId: number }> = [];
  for (const chunk of chunks) {
    const sentences = splitChunkIntoSentences({ observationId, chunkKey: chunk.chunk_key, text: chunk.content });
    for (const sentence of sentences) {
      upsertSentence.run(observationId, chunk.chunk_key, sentence.sentenceKey, sentence.sentenceIndex, sentence.content, observationId);
      items.push({ key: sentence.sentenceKey, content: sentence.content, observationId });
    }
  }
  await embedLane(store, 'sentence', items, embeddingProvider);
}

async function embedLane(
  store: Store,
  lane: 'chunk' | 'sentence',
  items: Array<{ key: string; content: string; observationId: number }>,
  embeddingProvider: EmbeddingProviderAdapter | null
): Promise<void> {
  const db = store.getDb();
  if (items.length === 0) {
    return;
  }

  if (!embeddingProvider) {
    db.prepare("UPDATE semantic_index_state SET pending = 1, stale = 1, updated_at = datetime('now') WHERE lane = ?").run(lane);
    return;
  }

  const vectors = await embeddingProvider.embed(items.map((item) => item.content), 'document');
  const vecTable = lane === 'chunk' ? 'vec_chunks' : 'vec_sentences';
  const upsertRowid = db.prepare(
    `INSERT INTO semantic_vector_rowids (lane, source_key, vec_rowid, observation_id, lineage_hash, embedding_hash, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(lane, source_key) DO UPDATE SET
       vec_rowid = excluded.vec_rowid,
       observation_id = excluded.observation_id,
       lineage_hash = excluded.lineage_hash,
       embedding_hash = excluded.embedding_hash,
       updated_at = datetime('now')`
  );

  const deleteVec = db.prepare(`DELETE FROM ${vecTable} WHERE rowid = ?`);
  const insertVec = db.prepare(`INSERT INTO ${vecTable}(rowid, embedding) VALUES (?, ?)`);

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const rowid = deterministicVecRowid(`${lane}:${item.key}`);
    const vector = vectorToBuffer(vectors[i] ?? []);
    deleteVec.run(rowid);
    insertVec.run(rowid, vector);
    upsertRowid.run(lane, item.key, rowid, item.observationId, item.key, store.config.embedding?.configHash ?? null);
  }

  db.prepare(
    "UPDATE semantic_index_state SET pending = 0, stale = 0, degraded = 0, last_ready_at = datetime('now'), updated_at = datetime('now') WHERE lane = ?"
  ).run(lane);
}

function processRebuildJob(store: Store, jobKey: string): void {
  const db = store.getDb();
  const observations = db.prepare('SELECT id FROM observations WHERE deleted_at IS NULL ORDER BY id ASC').all() as Array<{ id: number }>;
  for (const row of observations) {
    db.prepare(
      `INSERT INTO semantic_jobs (job_key, kind, state, priority, observation_id, source_key)
       VALUES (?, 'chunk', 'pending', 50, ?, ?)
       ON CONFLICT(job_key) DO NOTHING`
    ).run(`chunk:${row.id}`, row.id, `observation:${row.id}`);
    db.prepare(
      `INSERT INTO semantic_jobs (job_key, kind, state, priority, observation_id, source_key)
       VALUES (?, 'extract_kg', 'pending', 70, ?, ?)
       ON CONFLICT(job_key) DO NOTHING`
    ).run(`kg:${row.id}`, row.id, `observation:${row.id}`);
  }

  db.prepare(
    "UPDATE semantic_index_state SET pending = 1, stale = 1, embedding_config_hash = ?, updated_at = datetime('now') WHERE lane IN ('chunk','sentence')"
  ).run(store.config.embedding?.configHash ?? null);
  db.prepare("UPDATE semantic_jobs SET source_key = ? WHERE job_key = ?").run('global', jobKey);
}

function processKgJob(store: Store, observationId: number): void {
  const db = store.getDb();
  const obs = db.prepare('SELECT id, content, project, topic_key, sync_id FROM observations WHERE id = ? AND deleted_at IS NULL').get(observationId) as
    | { id: number; content: string; project: string | null; topic_key: string | null; sync_id: string | null }
    | undefined;
  if (!obs) return;

  const extraction = extractKnowledgeTriples({ content: obs.content, provenance: `observation:${obs.id}` });
  db.prepare(
    `INSERT INTO kg_taxonomy_metadata (id, taxonomy_version, entity_types_json, relation_types_json, updated_at)
     VALUES (1, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       taxonomy_version = excluded.taxonomy_version,
       entity_types_json = excluded.entity_types_json,
       relation_types_json = excluded.relation_types_json,
       updated_at = datetime('now')`
  ).run(extraction.taxonomy.version, JSON.stringify(extraction.taxonomy.entityTypes), JSON.stringify(extraction.taxonomy.relationTypes));

  const upsertEntity = db.prepare(
    `INSERT INTO kg_entities (entity_key, entity_type, canonical_name, aliases_json, metadata_json, updated_at)
     VALUES (?, ?, ?, '[]', '{}', datetime('now'))
     ON CONFLICT(entity_key) DO UPDATE SET updated_at = datetime('now')
     RETURNING id`
  );

  const insertTriple = db.prepare(
    `INSERT INTO kg_triples (
      subject_entity_id, relation, object_entity_id, source_type, source_id, source_sync_id,
      project, topic_key, provenance, confidence, triple_hash, extractor_version, updated_at
     ) VALUES (?, ?, ?, 'observation', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(triple_hash) DO UPDATE SET
       confidence = excluded.confidence,
       updated_at = datetime('now')`
  );

  for (const triple of extraction.triples) {
    const subject = upsertEntity.get(`entity:${triple.subject}`, triple.subjectType, triple.subject) as { id: number };
    const object = upsertEntity.get(`entity:${triple.object}`, triple.objectType, triple.object) as { id: number };
    insertTriple.run(
      subject.id,
      triple.relation,
      object.id,
      obs.id,
      obs.sync_id,
      obs.project,
      obs.topic_key,
      triple.provenance,
      triple.confidence,
      triple.tripleHash,
      extraction.taxonomy.version
    );
  }
}
