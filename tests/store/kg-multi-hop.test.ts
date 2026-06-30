import { describe, it, expect, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';
import { DEFAULT_KG_RELATION_ALLOW_LIST, DEFAULT_KNOWLEDGE_GRAPH_CONFIG } from '../../src/config.js';
import type { LaneCandidate } from '../../src/retrieval/ranking.js';
import type { Observation } from '../../src/store/types.js';

type MultiHopInput = {
  seedObservationIds: number[];
  filters?: {
    project?: string;
    session_id?: string;
    scope?: Observation['scope'];
    topic_key?: string;
    type?: Observation['type'];
    time_from?: string;
    time_to?: string;
  };
  maxDepth: number;
  neighborhoodLimit: number;
  relationAllowList: string[];
  multiHopWeight: number;
  depthDecay: number;
};

type MultiHopRuntime = Store & {
  queryKnowledgeMultiHopLane(input: MultiHopInput): LaneCandidate[];
  buildKnowledgeMultiHopTraversalSql(input: {
    seedEntityIds: number[];
    seedObservationIds: number[];
    relationAllowList: string[];
    maxDepth: number;
    neighborhoodLimit: number;
    filters?: MultiHopInput['filters'];
  }): { sql: string; params: Array<string | number> };
};

function runtimeFor(store: Store): MultiHopRuntime {
  return store as unknown as MultiHopRuntime;
}

function insertEntity(store: Store, key: string, canonicalName: string): number {
  const result = store.getDb().prepare(
    `INSERT INTO kg_entities (entity_key, entity_type, canonical_name, aliases_json, metadata_json)
     VALUES (?, 'service', ?, '[]', '{}')
     ON CONFLICT(entity_key) DO UPDATE SET canonical_name = excluded.canonical_name
     RETURNING id`
  ).get(key, canonicalName) as { id: number };
  return result.id;
}

function insertTriple(store: Store, input: {
  subjectId: number;
  relation: string;
  objectId: number;
  observationId: number;
  project: string;
  topicKey?: string | null;
  confidence?: number;
  hash: string;
}): void {
  const observation = store.getObservation(input.observationId);
  store.getDb().prepare(
    `INSERT INTO kg_triples (
      subject_entity_id, relation, object_entity_id, source_type, source_id, source_sync_id,
      project, topic_key, provenance, confidence, triple_hash, extractor_version
    ) VALUES (?, ?, ?, 'observation', ?, ?, ?, ?, ?, ?, ?, 'test')`
  ).run(
    input.subjectId,
    input.relation,
    input.objectId,
    input.observationId,
    observation?.sync_id ?? null,
    input.project,
    input.topicKey ?? null,
    `test:${input.hash}`,
    input.confidence ?? 0.9,
    input.hash,
  );
}

function addObservation(store: Store, title: string, project = 'kg-multi-hop', topicKey?: string): number {
  return store.saveObservation({
    title,
    content: `${title} content avoids query overlap.`,
    project,
    topic_key: topicKey,
  }).observation.id;
}

function clearGeneratedTriples(store: Store): void {
  store.getDb().prepare("DELETE FROM kg_triples WHERE source_type = 'observation'").run();
}

function query(store: Store, seedObservationIds: number[], overrides: Partial<MultiHopInput> = {}): LaneCandidate[] {
  return runtimeFor(store).queryKnowledgeMultiHopLane({
    seedObservationIds,
    maxDepth: 2,
    neighborhoodLimit: 50,
    relationAllowList: DEFAULT_KG_RELATION_ALLOW_LIST,
    multiHopWeight: DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgMultiHopWeight,
    depthDecay: DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgDepthDecay,
    ...overrides,
  });
}

describe('Store KG multi-hop traversal', () => {
  let store: Store | undefined;

  afterEach(() => {
    if (store) {
      store.close();
      store = undefined;
    }
  });

  it('surfaces two-hop neighbors, excludes seeds, and records bridge evidence', () => {
    store = new Store(':memory:');
    const seed = addObservation(store, 'Seed auth incident');
    const first = addObservation(store, 'Token store dependency');
    const second = addObservation(store, 'Vault follow-on dependency');
    clearGeneratedTriples(store);
    const auth = insertEntity(store, 'entity:auth', 'Auth service');
    const token = insertEntity(store, 'entity:token', 'Token store');
    const vault = insertEntity(store, 'entity:vault', 'Vault keyring');
    const ledger = insertEntity(store, 'entity:ledger', 'Ledger archive');
    insertTriple(store, { subjectId: auth, relation: 'USES', objectId: token, observationId: seed, project: 'kg-multi-hop', hash: 'seed-auth-token' });
    insertTriple(store, { subjectId: token, relation: 'DEPENDS_ON', objectId: vault, observationId: first, project: 'kg-multi-hop', confidence: 0.8, hash: 'first-token-vault' });
    insertTriple(store, { subjectId: vault, relation: 'AFFECTS', objectId: ledger, observationId: second, project: 'kg-multi-hop', confidence: 0.7, hash: 'second-vault-ledger' });

    const candidates = query(store, [seed]);

    expect(candidates.map((candidate) => candidate.observationId)).not.toContain(seed);
    expect(candidates.map((candidate) => candidate.observationId)).toEqual(expect.arrayContaining([first, second]));
    const firstCandidate = candidates.find((candidate) => candidate.observationId === first);
    expect(firstCandidate?.source).toBe('kg_multi_hop');
    expect(firstCandidate?.lane).toBe('kg');
    expect(firstCandidate?.text).toContain('DEPENDS_ON');
    expect(firstCandidate?.kg?.provenance).toBe('test:first-token-vault');
    expect(firstCandidate?.kg?.confidence).toBe(0.8);
    expect(firstCandidate?.kg?.depth).toBe(1);

    const secondCandidate = candidates.find((candidate) => candidate.observationId === second);
    expect(secondCandidate?.kg?.depth).toBe(2);
    expect(secondCandidate?.text).toContain('Token store');
    expect(secondCandidate?.text).toContain('AFFECTS');
    expect(secondCandidate?.text).toContain('Vault keyring');
  });

  it('traverses backward from an object-side seed entity', () => {
    store = new Store(':memory:');
    const seed = addObservation(store, 'Ledger seed');
    const reached = addObservation(store, 'Payments neighbor');
    clearGeneratedTriples(store);
    const payments = insertEntity(store, 'entity:payments', 'Payments');
    const ledger = insertEntity(store, 'entity:ledger', 'Ledger');
    insertTriple(store, { subjectId: payments, relation: 'DEPENDS_ON', objectId: ledger, observationId: reached, project: 'kg-multi-hop', hash: 'payments-ledger' });
    insertTriple(store, { subjectId: ledger, relation: 'USES', objectId: ledger, observationId: seed, project: 'kg-multi-hop', hash: 'seed-ledger' });

    const candidates = query(store, [seed]);

    expect(candidates.map((candidate) => candidate.observationId)).toContain(reached);
  });

  it('does not follow excluded metadata relations and honors depth, cycle, cap, and filters', () => {
    store = new Store(':memory:');
    const seed = addObservation(store, 'Seed hub', 'kg-multi-hop', 'topic/seed');
    const structural = addObservation(store, 'Structural neighbor', 'kg-multi-hop', 'topic/structural');
    const metadata = addObservation(store, 'Metadata distractor', 'kg-multi-hop', 'topic/metadata');
    const depthThree = addObservation(store, 'Too deep neighbor', 'kg-multi-hop', 'topic/depth');
    const otherTopic = addObservation(store, 'Other project neighbor', 'kg-other', 'topic/other');
    clearGeneratedTriples(store);
    const hub = insertEntity(store, 'entity:hub', 'Hub');
    const a = insertEntity(store, 'entity:a', 'A');
    const b = insertEntity(store, 'entity:b', 'B');
    const c = insertEntity(store, 'entity:c', 'C');
    const topic = insertEntity(store, 'entity:topic', 'Topic');
    insertTriple(store, { subjectId: hub, relation: 'USES', objectId: a, observationId: seed, project: 'kg-multi-hop', topicKey: 'topic/seed', hash: 'seed-hub-a' });
    insertTriple(store, { subjectId: a, relation: 'USES', objectId: b, observationId: structural, project: 'kg-multi-hop', topicKey: 'topic/keep', confidence: 0.9, hash: 'a-b' });
    insertTriple(store, { subjectId: b, relation: 'USES', objectId: a, observationId: structural, project: 'kg-multi-hop', topicKey: 'topic/keep', confidence: 0.8, hash: 'b-a-cycle' });
    insertTriple(store, { subjectId: b, relation: 'USES', objectId: c, observationId: depthThree, project: 'kg-multi-hop', topicKey: 'topic/keep', hash: 'b-c-depth-three' });
    insertTriple(store, { subjectId: hub, relation: 'HAS_TOPIC', objectId: topic, observationId: metadata, project: 'kg-multi-hop', topicKey: 'topic/keep', hash: 'metadata-topic' });
    insertTriple(store, { subjectId: a, relation: 'DEPENDS_ON', objectId: topic, observationId: otherTopic, project: 'kg-other', topicKey: 'topic/other', hash: 'other-topic' });

    const filtered = query(store, [seed], {
      maxDepth: 2,
      neighborhoodLimit: 1,
      filters: { project: 'kg-multi-hop' },
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].observationId).toBe(structural);
    expect(filtered.map((candidate) => candidate.observationId)).not.toContain(metadata);
    expect(filtered.map((candidate) => candidate.observationId)).not.toContain(depthThree);
    expect(filtered.map((candidate) => candidate.observationId)).not.toContain(otherTopic);
  });

  it('returns no candidates for an empty allow-list', () => {
    store = new Store(':memory:');
    const seed = addObservation(store, 'Seed');
    clearGeneratedTriples(store);

    expect(query(store, [seed], { relationAllowList: [] })).toEqual([]);
  });

  it('uses subject and object indexes in the recursive traversal plan', () => {
    store = new Store(':memory:');
    const seed = addObservation(store, 'Explain seed');
    clearGeneratedTriples(store);
    const auth = insertEntity(store, 'entity:explain-auth', 'Explain auth');
    const token = insertEntity(store, 'entity:explain-token', 'Explain token');
    insertTriple(store, { subjectId: auth, relation: 'USES', objectId: token, observationId: seed, project: 'kg-multi-hop', hash: 'explain-seed' });
    const built = runtimeFor(store).buildKnowledgeMultiHopTraversalSql({
      seedEntityIds: [auth, token],
      seedObservationIds: [seed],
      relationAllowList: DEFAULT_KG_RELATION_ALLOW_LIST,
      maxDepth: 2,
      neighborhoodLimit: 50,
      filters: { project: 'kg-multi-hop' },
    });

    const plan = store.getDb().prepare(`EXPLAIN QUERY PLAN ${built.sql}`).all(...built.params)
      .map((row) => Object.values(row).join(' '))
      .join('\n');

    expect(plan).toContain('idx_kg_triples_subject');
    expect(plan).toContain('idx_kg_triples_object');
    expect(plan).not.toMatch(/SCAN kg_triples/i);
  });
});
