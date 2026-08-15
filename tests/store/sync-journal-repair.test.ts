import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';
import { StaleAdminPreviewError } from '../../src/store/types.js';

describe('sync journal repair administration', () => {
  let store: Store | undefined;
  afterEach(() => store?.close());

  it('previews, fingerprint-binds, applies, and converges without inventing identities', () => {
    store = new Store(':memory:');
    const first = store.saveObservation({ title: 'gap', content: 'repair me', project: 'p' }).observation;
    const second = store.saveObservation({ title: 'ineligible', content: 'leave me', project: 'p' }).observation;
    const db = store.getDb();
    db.prepare("DELETE FROM sync_mutations WHERE entity_type = 'observation' AND entity_id = ?").run(first.id);
    db.prepare('UPDATE observations SET sync_id = NULL WHERE id = ?').run(second.id);

    const preview = store.previewSyncJournalRepair({ project: 'p' });
    expect(preview.dry_run).toBe(true);
    expect(preview.counts.scanned).toBe(preview.counts.candidates + preview.counts.skipped + preview.counts.ineligible_identity);
    expect(preview.counts.candidates).toBe(1);
    expect(preview.counts.ineligible_identity).toBe(1);
    expect(() => store!.applySyncJournalRepair({
      scope: { project: 'p' },
      expected_selection_fingerprint: 'sha256:' + '0'.repeat(64),
    })).toThrow(StaleAdminPreviewError);

    const applied = store.applySyncJournalRepair({
      scope: { project: 'p' },
      expected_selection_fingerprint: preview.selection_fingerprint,
    });
    expect(applied.counts.repaired).toBe(1);
    expect(store.previewSyncJournalRepair({ project: 'p' }).counts.candidates).toBe(0);
  });

  it('bounds a repair batch at 10,000 and reports exact continuation', () => {
    store = new Store(':memory:');
    const insert = store.getDb().prepare('INSERT INTO sessions(id, project) VALUES (?, ?)');
    store.getDb().transaction(() => {
      for (let index = 0; index < 10_001; index += 1) insert.run(`gap-${String(index).padStart(5, '0')}`, 'p');
    })();
    const preview = store.previewSyncJournalRepair({ project: 'p' });
    expect(preview.counts).toMatchObject({ candidates: 10_001, selected: 10_000, remaining: 1 });
    expect(preview.samples).toHaveLength(50);
    expect(preview.has_more).toBe(true);
    const applied = store.applySyncJournalRepair({ scope: { project: 'p' }, expected_selection_fingerprint: preview.selection_fingerprint });
    expect(applied.counts.repaired).toBe(10_000);
    expect(store.previewSyncJournalRepair({ project: 'p' }).counts.candidates).toBe(1);
  });

  it('restores a tombstoned observation from an inbound non-delete current-state event without re-journaling', () => {
    store = new Store(':memory:');
    const saved = store.saveObservation({ title: 'old', content: 'old', project: 'p' }).observation;
    store.deleteObservation(saved.id);
    const before = (store.getDb().prepare('SELECT COUNT(*) AS count FROM sync_mutations').get() as { count: number }).count;
    const result = store.applyV2Chunk({ version: 2, chunk_id: 'repair-roundtrip', from_mutation_id: 1, to_mutation_id: 1,
      created_at: new Date().toISOString(), mutations: [{ operation: 'update', entity_type: 'observation', entity_id: saved.id,
        sync_id: saved.sync_id!, data: { session_id: saved.session_id, type: saved.type, title: 'restored', content: 'active',
          project: 'p', scope: 'project', deleted_at: null } }] });
    expect(result.applied).toBe(1);
    expect(store.getObservation(saved.id)).toMatchObject({ title: 'restored', content: 'active', deleted_at: null });
    const after = (store.getDb().prepare('SELECT COUNT(*) AS count FROM sync_mutations').get() as { count: number }).count;
    expect(after).toBe(before);
  });

  it('repairs create, update, and delete coverage without changing source state and is repeat-safe', () => {
    store = new Store(':memory:');
    const createdGap = store.saveObservation({ title: 'created gap', content: 'created gap', project: 'p' }).observation;
    const updateGap = store.saveObservation({ title: 'update gap', content: 'update gap', project: 'p' }).observation;
    const deleteGap = store.saveObservation({ title: 'delete gap', content: 'delete gap', project: 'p' }).observation;
    store.updateObservation({ id: updateGap.id, title: 'updated source' });
    store.deleteObservation(deleteGap.id);
    const db = store.getDb();
    db.prepare("DELETE FROM sync_mutations WHERE entity_type = 'observation' AND entity_id = ?").run(createdGap.id);
    db.prepare("INSERT INTO sync_mutations (operation, entity_type, entity_id, sync_id, project) VALUES ('delete', 'observation', ?, ?, 'p')")
      .run(updateGap.id, updateGap.sync_id);
    db.prepare("DELETE FROM sync_mutations WHERE entity_type = 'observation' AND entity_id = ? AND operation = 'delete'").run(deleteGap.id);
    const before = db.prepare('SELECT id, title, content, sync_id, deleted_at, created_at, updated_at FROM observations WHERE id IN (?, ?, ?) ORDER BY id')
      .all(createdGap.id, updateGap.id, deleteGap.id);

    const preview = store.previewSyncJournalRepair({ project: 'p' });
    expect(preview.counts.by_operation).toEqual({ create: 1, update: 1, delete: 1 });
    const applied = store.applySyncJournalRepair({ scope: { project: 'p' }, expected_selection_fingerprint: preview.selection_fingerprint });
    expect(applied.counts.repaired).toBe(3);
    expect(db.prepare('SELECT id, title, content, sync_id, deleted_at, created_at, updated_at FROM observations WHERE id IN (?, ?, ?) ORDER BY id')
      .all(createdGap.id, updateGap.id, deleteGap.id)).toEqual(before);
    expect(() => store!.applySyncJournalRepair({ scope: { project: 'p' }, expected_selection_fingerprint: preview.selection_fingerprint }))
      .toThrow(StaleAdminPreviewError);
    const empty = store.previewSyncJournalRepair({ project: 'p' });
    expect(store.applySyncJournalRepair({ scope: { project: 'p' }, expected_selection_fingerprint: empty.selection_fingerprint }).counts.repaired).toBe(0);
  });
});
