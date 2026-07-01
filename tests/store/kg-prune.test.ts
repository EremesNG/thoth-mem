import { describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';

function upsertEntity(store: Store, key: string, name: string): number {
  const row = store.getDb().prepare(
    `INSERT INTO kg_entities (entity_key, entity_type, canonical_name, aliases_json, metadata_json, updated_at)
     VALUES (?, 'concept', ?, '[]', '{}', datetime('now'))
     ON CONFLICT(entity_key) DO UPDATE SET updated_at = datetime('now')
     RETURNING id`
  ).get(key, name) as { id: number };
  return row.id;
}

function insertTriple(store: Store, input: {
  sourceId: number;
  subjectId: number;
  objectId: number;
  relation?: string;
  project?: string | null;
  hash: string;
  supersededAt?: string | null;
  supersededBy?: number | null;
}): number {
  const result = store.getDb().prepare(
    `INSERT INTO kg_triples (
      subject_entity_id, relation, object_entity_id, source_type, source_id,
      project, provenance, confidence, triple_hash, extractor_version,
      superseded_at, superseded_by_triple_id
    ) VALUES (?, ?, ?, 'observation', ?, ?, ?, 0.9, ?, 'test', ?, ?)`
  ).run(
    input.subjectId,
    input.relation ?? 'HAS_WHAT',
    input.objectId,
    input.sourceId,
    input.project ?? null,
    `observation:${input.sourceId}`,
    input.hash,
    input.supersededAt ?? null,
    input.supersededBy ?? null
  );
  return Number(result.lastInsertRowid);
}

function countRows(store: Store, where: string, ...params: unknown[]): number {
  return (store.getDb().prepare(`SELECT COUNT(*) AS count FROM ${where}`).get(...params) as { count: number }).count;
}

describe('Store KG superseded pruning', () => {
  it('dry-run previews the same keep-N prune that the real run applies', () => {
    const store = new Store(':memory:', {
      knowledgeGraph: {
        kgSupersededKeepN: 2,
      },
    });

    try {
      const subjectId = upsertEntity(store, 'subject:cache', 'Cache');
      const currentObjectId = upsertEntity(store, 'object:current', 'Dragonfly');
      insertTriple(store, { sourceId: 1, subjectId, objectId: currentObjectId, hash: 'current' });
      for (let i = 1; i <= 4; i++) {
        insertTriple(store, {
          sourceId: 1,
          subjectId,
          objectId: upsertEntity(store, `object:old:${i}`, `Old ${i}`),
          hash: `old:${i}`,
          supersededAt: `2026-01-0${i} 00:00:00`,
        });
      }

      const dryRun = store.pruneSupersededTriples({ dryRun: true });
      expect(dryRun).toMatchObject({
        dry_run: true,
        triples_pruned: 2,
        superseded_before: 4,
        superseded_after: 2,
      });
      expect(countRows(store, 'kg_triples')).toBe(5);

      const real = store.pruneSupersededTriples();
      expect(real).toMatchObject({
        dry_run: false,
        triples_pruned: dryRun.triples_pruned,
        superseded_before: dryRun.superseded_before,
        superseded_after: dryRun.superseded_after,
      });
      expect(countRows(store, "kg_triples WHERE superseded_at IS NOT NULL OR superseded_by_triple_id IS NOT NULL")).toBe(2);
      expect(countRows(store, "kg_triples WHERE superseded_at IS NULL AND superseded_by_triple_id IS NULL")).toBe(1);
      expect(store.pruneSupersededTriples().triples_pruned).toBe(0);
    } finally {
      store.close();
    }
  });

  it('supports keep-N zero, project scoping, dangling-ref NULLing, and orphan cleanup', () => {
    const store = new Store(':memory:', {
      knowledgeGraph: {
        kgSupersededKeepN: 1,
      },
    });

    try {
      const scopedSubjectId = upsertEntity(store, 'subject:scoped', 'Scoped');
      const keepSubjectId = upsertEntity(store, 'subject:other', 'Other');
      const survivorId = insertTriple(store, {
        sourceId: 10,
        subjectId: scopedSubjectId,
        objectId: upsertEntity(store, 'object:survivor', 'Survivor'),
        project: 'scoped',
        hash: 'survivor',
        supersededAt: '2026-01-03 00:00:00',
      });
      const prunedTargetId = insertTriple(store, {
        sourceId: 10,
        subjectId: scopedSubjectId,
        objectId: upsertEntity(store, 'object:orphan-only', 'Orphan only'),
        project: 'scoped',
        hash: 'target',
        supersededAt: '2026-01-01 00:00:00',
      });
      store.getDb().prepare(
        "UPDATE kg_triples SET superseded_by_triple_id = ?, superseded_at = '2026-01-02 00:00:00' WHERE id = ?"
      ).run(prunedTargetId, survivorId);
      insertTriple(store, {
        sourceId: 11,
        subjectId: keepSubjectId,
        objectId: upsertEntity(store, 'object:other-old', 'Other old'),
        project: 'other',
        hash: 'other-old',
        supersededAt: '2026-01-01 00:00:00',
      });

      const result = store.pruneSupersededTriples({ project: 'scoped' });
      expect(result).toMatchObject({
        project: 'scoped',
        triples_pruned: 1,
        dangling_refs_nulled: 1,
      });
      expect(store.getDb().prepare(
        'SELECT superseded_by_triple_id, superseded_at FROM kg_triples WHERE id = ?'
      ).get(survivorId)).toEqual({ superseded_by_triple_id: null, superseded_at: null });
      expect(countRows(store, 'kg_triples WHERE project = ?', 'other')).toBe(1);
      expect(countRows(store, 'kg_entities WHERE canonical_name = ?', 'Orphan only')).toBe(0);
    } finally {
      store.close();
    }
  });

  it('prunes only entities orphaned by the prune set and preserves pre-existing unrelated orphans', () => {
    const store = new Store(':memory:', {
      knowledgeGraph: {
        kgSupersededKeepN: 1,
      },
    });

    try {
      const subjectId = upsertEntity(store, 'subject:scoped-orphan', 'Scoped orphan subject');
      const survivorObjectId = upsertEntity(store, 'object:scoped-survivor', 'Scoped survivor');
      const pruneObjectId = upsertEntity(store, 'object:prune-orphan', 'Prune orphan');
      const unrelatedOrphanId = upsertEntity(store, 'object:unrelated-orphan', 'Unrelated orphan');

      insertTriple(store, {
        sourceId: 20,
        subjectId,
        objectId: survivorObjectId,
        project: 'scoped-orphan',
        hash: 'survivor',
        supersededAt: '2026-01-02 00:00:00',
      });
      insertTriple(store, {
        sourceId: 20,
        subjectId,
        objectId: pruneObjectId,
        project: 'scoped-orphan',
        hash: 'prune-target',
        supersededAt: '2026-01-01 00:00:00',
      });

      const dryRun = store.pruneSupersededTriples({ project: 'scoped-orphan', dryRun: true });
      expect(dryRun).toMatchObject({
        dry_run: true,
        triples_pruned: 1,
        entities_pruned: 1,
      });
      expect(countRows(store, 'kg_entities WHERE id IN (?, ?)', pruneObjectId, unrelatedOrphanId)).toBe(2);

      const real = store.pruneSupersededTriples({ project: 'scoped-orphan' });
      expect(real).toMatchObject({
        dry_run: false,
        triples_pruned: dryRun.triples_pruned,
        entities_pruned: dryRun.entities_pruned,
      });
      expect(countRows(store, 'kg_entities WHERE id = ?', pruneObjectId)).toBe(0);
      expect(countRows(store, 'kg_entities WHERE id = ?', unrelatedOrphanId)).toBe(1);
    } finally {
      store.close();
    }
  });

  it('automatically caps touched slots when both supersession and pruning are enabled', () => {
    const store = new Store(':memory:', {
      knowledgeGraph: {
        kgSupersedeEnabled: true,
        kgPruneEnabled: true,
        kgSupersededKeepN: 1,
      },
    });

    try {
      const saved = store.saveObservation({
        title: 'Auto prune memory',
        type: 'decision',
        project: 'auto-prune',
        topic_key: 'auto/prune',
        content: '**What**: Cache uses Redis',
      }).observation;

      for (const value of ['Cache uses Valkey', 'Cache uses Dragonfly', 'Cache uses Garnet']) {
        store.updateObservation({
          id: saved.id,
          content: `**What**: ${value}`,
        });

        const supersededCount = countRows(
          store,
          "kg_triples WHERE source_type = 'observation' AND source_id = ? AND relation = 'HAS_WHAT' AND (superseded_at IS NOT NULL OR superseded_by_triple_id IS NOT NULL)",
          saved.id,
        );
        const currentCount = countRows(
          store,
          "kg_triples WHERE source_type = 'observation' AND source_id = ? AND relation = 'HAS_WHAT' AND superseded_at IS NULL AND superseded_by_triple_id IS NULL",
          saved.id,
        );

        expect(supersededCount).toBeLessThanOrEqual(1);
        expect(currentCount).toBe(1);
      }
    } finally {
      store.close();
    }
  });

  it('leaves B3 superseded history unpruned when the master pruning flag is off', () => {
    const store = new Store(':memory:', {
      knowledgeGraph: {
        kgSupersedeEnabled: true,
        kgPruneEnabled: false,
        kgSupersededKeepN: 1,
      },
    });

    try {
      const saved = store.saveObservation({
        title: 'Flag off memory',
        type: 'decision',
        project: 'flag-off-prune',
        topic_key: 'flag/off/prune',
        content: '**What**: Queue uses BullMQ',
      }).observation;

      for (const value of ['Queue uses Temporal', 'Queue uses Durable Objects', 'Queue uses SQLite']) {
        store.updateObservation({
          id: saved.id,
          content: `**What**: ${value}`,
        });
      }

      expect(countRows(
        store,
        "kg_triples WHERE source_type = 'observation' AND source_id = ? AND relation = 'HAS_WHAT' AND (superseded_at IS NOT NULL OR superseded_by_triple_id IS NOT NULL)",
        saved.id,
      )).toBe(3);
    } finally {
      store.close();
    }
  });
});
