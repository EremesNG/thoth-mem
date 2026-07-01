import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { Store } from '../../src/store/index.js';

function hash(content: string): string {
  return createHash('sha256').update(content.trim().toLowerCase()).digest('hex');
}

describe('Store — Stats, Delete, Update', () => {
  let store: Store;
  beforeEach(() => { store = new Store(':memory:'); });
  afterEach(() => { store.close(); });

  describe('getStats', () => {
    it('returns accurate counts', () => {
      store.saveObservation({ title: 'A', content: 'Content A', project: 'p1' });
      store.saveObservation({ title: 'B', content: 'Content B', project: 'p2' });
      store.savePrompt('manual-save-p1', 'test prompt', 'p1');
      
      const stats = store.getStats();
      expect(stats.total_sessions).toBeGreaterThanOrEqual(2);
      expect(stats.total_observations).toBe(2);
      expect(stats.total_prompts).toBe(1);
      expect(stats.projects).toContain('p1');
      expect(stats.projects).toContain('p2');
    });

    it('excludes soft-deleted observations from count', () => {
      const { observation } = store.saveObservation({ title: 'A', content: 'Content' });
      store.deleteObservation(observation.id, false);
      const stats = store.getStats();
      expect(stats.total_observations).toBe(0);
    });
  });

  describe('deleteObservation', () => {
    it('soft deletes (hides from search)', () => {
      const { observation } = store.saveObservation({ title: 'Delete me', content: 'Gone soon' });
      const deleted = store.deleteObservation(observation.id, false);
      expect(deleted).toBe(true);
      expect(store.getObservation(observation.id)).toBeNull();
      // But the row still exists in DB
      const raw = store.getDb().prepare('SELECT * FROM observations WHERE id = ?').get(observation.id);
      expect(raw).toBeDefined();
    });

    it('hard deletes (removes permanently)', () => {
      const { observation } = store.saveObservation({ title: 'Delete me', content: 'Gone forever' });
      const deleted = store.deleteObservation(observation.id, true);
      expect(deleted).toBe(true);
      const raw = store.getDb().prepare('SELECT * FROM observations WHERE id = ?').get(observation.id);
      expect(raw).toBeUndefined();
    });

    it('returns false for non-existent id', () => {
      expect(store.deleteObservation(999, false)).toBe(false);
    });

    it('returns false for already soft-deleted', () => {
      const { observation } = store.saveObservation({ title: 'Test', content: 'Content' });
      store.deleteObservation(observation.id, false);
      expect(store.deleteObservation(observation.id, false)).toBe(false);
    });

    it('hard delete also removes versions', () => {
      store.saveObservation({ title: 'V1', content: 'Version 1', topic_key: 'test/key', project: 'p1' });
      store.saveObservation({ title: 'V2', content: 'Version 2', topic_key: 'test/key', project: 'p1' });
      const obs = store.searchObservations({ query: 'Version' })[0];
      store.deleteObservation(obs.id, true);
      const versions = store.getObservationVersions(obs.id);
      expect(versions).toHaveLength(0);
    });
  });

  describe('updateObservation', () => {
    it('updates title only', () => {
      const { observation } = store.saveObservation({ title: 'Old', content: 'Content' });
      const updated = store.updateObservation({ id: observation.id, title: 'New' });
      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('New');
      expect(updated!.content).toBe('Content'); // unchanged
      expect(updated!.revision_count).toBe(2);
    });

    it('updates content and recomputes hash', () => {
      const { observation } = store.saveObservation({ title: 'Test', content: 'Old content' });
      const updated = store.updateObservation({ id: observation.id, content: 'New content' });
      expect(updated!.content).toBe('New content');
      expect(updated!.normalized_hash).not.toBe(observation.normalized_hash);
    });

    it('creates version on update', () => {
      const { observation } = store.saveObservation({ title: 'V1', content: 'Original' });
      store.updateObservation({ id: observation.id, title: 'V2', content: 'Updated' });
      const versions = store.getObservationVersions(observation.id);
      expect(versions).toHaveLength(1);
      expect(versions[0].title).toBe('V1');
      expect(versions[0].content).toBe('Original');
      expect(versions[0].version_number).toBe(1);
    });

    it('returns null for non-existent id', () => {
      expect(store.updateObservation({ id: 999, title: 'test' })).toBeNull();
    });

    it('returns null for soft-deleted observation', () => {
      const { observation } = store.saveObservation({ title: 'Test', content: 'Content' });
      store.deleteObservation(observation.id, false);
      expect(store.updateObservation({ id: observation.id, title: 'test' })).toBeNull();
    });

    it('updates multiple fields at once', () => {
      const { observation } = store.saveObservation({ title: 'Old', content: 'Old', type: 'manual' });
      const updated = store.updateObservation({
        id: observation.id,
        title: 'New Title',
        content: 'New Content',
        type: 'decision',
        scope: 'personal'
      });
      expect(updated!.title).toBe('New Title');
      expect(updated!.content).toBe('New Content');
      expect(updated!.type).toBe('decision');
      expect(updated!.scope).toBe('personal');
    });
  });

  describe('memory maintenance foundation', () => {
    it('evaluates deterministic dry-run plans without mutating metadata', () => {
      const first = store.saveObservation({
        title: 'Shared maintenance decision',
        content: 'Shared duplicate content',
        project: 'maint-project',
        type: 'decision',
      }).observation;
      store.getDb().prepare(
        `INSERT INTO observations (
           session_id, type, title, content, project, scope, normalized_hash, sync_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 day'), datetime('now', '-1 day'))`
      ).run(
        first.session_id,
        first.type,
        'Shared maintenance decision copy',
        first.content,
        first.project,
        first.scope,
        first.normalized_hash,
        '11111111-1111-4111-8111-111111111111'
      );

      const previewA = store.evaluateMaintenance({ scope: { project: 'maint-project' } });
      const previewB = store.evaluateMaintenance({ scope: { project: 'maint-project' } });

      expect(previewA).toEqual(previewB);
      expect(previewA.dry_run).toBe(true);
      expect(previewA.counts.consolidation_candidates).toBe(1);
      expect(previewA.consolidations[0].members.map((member) => member.id).sort()).toHaveLength(2);
      expect(store.getDb().prepare('SELECT COUNT(*) AS count FROM maintenance_runs').get()).toEqual({ count: 0 });
    });

    it('applies maintenance transactionally and preserves consolidation source records', () => {
      const first = store.saveObservation({
        title: 'Consolidation source',
        content: 'Exact duplicated source',
        project: 'maint-project',
        type: 'decision',
      }).observation;
      const duplicateId = Number(store.getDb().prepare(
        `INSERT INTO observations (
           session_id, type, title, content, project, scope, normalized_hash, sync_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        first.session_id,
        first.type,
        'Consolidation source duplicate',
        first.content,
        first.project,
        first.scope,
        first.normalized_hash,
        '22222222-2222-4222-8222-222222222222'
      ).lastInsertRowid);

      const result = store.runMaintenance({ scope: { project: 'maint-project' } });

      expect(result.dry_run).toBe(false);
      expect(result.counts.consolidation_candidates).toBe(1);
      expect(store.getObservation(first.id)).not.toBeNull();
      expect(store.getObservation(duplicateId)).not.toBeNull();

      const members = store.getDb().prepare(
        'SELECT source_id, role FROM maintenance_consolidation_members ORDER BY source_id'
      ).all() as Array<{ source_id: number; role: string }>;
      expect(members.map((member) => member.source_id)).toEqual([first.id, duplicateId].sort((a, b) => a - b));
      expect(members.some((member) => member.role === 'canonical')).toBe(true);
    });

    it('rolls back all maintenance writes if apply fails before commit', () => {
      store.saveObservation({
        title: 'Rollback source A',
        content: 'Rollback exact duplicate',
        project: 'rollback-project',
        type: 'decision',
      });
      store.getDb().prepare(
        `INSERT INTO observations (
           session_id, type, title, content, project, scope, normalized_hash, sync_id, created_at, updated_at
         ) VALUES ('manual-save-rollback-project', 'decision', 'Rollback source B', ?, 'rollback-project', 'project', ?, ?, datetime('now', '-365 days'), datetime('now', '-365 days'))`
      ).run('Rollback exact duplicate', hash('Rollback exact duplicate'), '33333333-3333-4333-8333-333333333333');
      store.getDb().prepare(
        "UPDATE observations SET created_at = datetime('now', '-365 days'), updated_at = datetime('now', '-365 days') WHERE project = 'rollback-project'"
      ).run();
      store.getDb().exec(`
        CREATE TRIGGER fail_maintenance_decay
        BEFORE INSERT ON maintenance_decay
        BEGIN
          SELECT RAISE(ABORT, 'forced maintenance rollback');
        END;
      `);

      expect(() => store.runMaintenance({ scope: { project: 'rollback-project' } })).toThrow(/forced maintenance rollback/);

      expect(store.getDb().prepare('SELECT COUNT(*) AS count FROM maintenance_runs').get()).toEqual({ count: 0 });
      expect(store.getDb().prepare('SELECT COUNT(*) AS count FROM maintenance_consolidations').get()).toEqual({ count: 0 });
      expect(store.getDb().prepare("SELECT COUNT(*) AS count FROM observations WHERE tool_name = 'maintenance-reflection'").get()).toEqual({ count: 0 });
    });

    it('persists reflection outputs as ordinary source-linked learning observations idempotently', () => {
      store.saveObservation({
        title: 'Reflection source A',
        content: 'First related memory',
        project: 'reflect-project',
        type: 'architecture',
      });
      store.saveObservation({
        title: 'Reflection source B',
        content: 'Second related memory',
        project: 'reflect-project',
        type: 'architecture',
      });

      const firstRun = store.runMaintenance({ scope: { project: 'reflect-project' } });
      const secondRun = store.runMaintenance({ scope: { project: 'reflect-project' } });
      const reflectionRows = store.getDb().prepare(
        "SELECT * FROM observations WHERE tool_name = 'maintenance-reflection'"
      ).all() as Array<{ id: number; type: string; topic_key: string | null }>;
      const sourceRows = store.getDb().prepare(
        `SELECT source_id
         FROM maintenance_reflection_sources
         ORDER BY source_id`
      ).all() as Array<{ source_id: number }>;

      expect(firstRun.reflections).toHaveLength(1);
      expect(secondRun.reflections).toHaveLength(1);
      expect(reflectionRows).toHaveLength(1);
      expect(reflectionRows[0].type).toBe('learning');
      expect(reflectionRows[0].topic_key).toMatch(/^maintenance\/reflection\//);
      expect(sourceRows).toHaveLength(2);
    });

    it('applies decay as reversible metadata without deleting source records', () => {
      const stale = store.saveObservation({
        title: 'Stale low-value note',
        content: 'Temporary discovery that should be attenuated',
        project: 'decay-project',
        type: 'discovery',
      }).observation;
      store.getDb().prepare(
        "UPDATE observations SET updated_at = datetime('now', '-365 days'), created_at = datetime('now', '-365 days') WHERE id = ?"
      ).run(stale.id);

      const result = store.runMaintenance({ scope: { project: 'decay-project' } });
      const decay = store.getDb().prepare(
        'SELECT source_kind, source_id, score, state, reason_class FROM maintenance_decay WHERE source_id = ?'
      ).get(stale.id) as { source_kind: string; source_id: number; score: number; state: string; reason_class: string };

      expect(result.counts.decay_candidates).toBeGreaterThan(0);
      expect(decay).toMatchObject({
        source_kind: 'observation',
        source_id: stale.id,
        score: 0.6,
        state: 'attenuated',
      });
      expect(decay.reason_class).toContain('stale-age');
      expect(store.getObservation(stale.id)?.content).toBe(stale.content);
    });

    it('exposes bounded automatic maintenance semantics without an owned scheduler', () => {
      store.close();
      store = new Store(':memory:', {
        maintenance: {
          automatic: { enabled: false },
        },
      });
      store.saveObservation({
        title: 'Automatic maintenance source A',
        content: 'automatic maintenance duplicate marker',
        project: 'auto-maint-project',
        type: 'decision',
      });
      store.saveObservation({
        title: 'Automatic maintenance source B',
        content: 'automatic maintenance duplicate marker',
        project: 'auto-maint-project',
        type: 'decision',
      });

      const disabled = store.runAutomaticMaintenance({ scope: { project: 'auto-maint-project' } });
      expect(disabled.dry_run).toBe(true);
      expect(disabled.degraded).toContain('automatic-maintenance-disabled-manual-preview-only');
      expect(store.getDb().prepare('SELECT COUNT(*) AS count FROM maintenance_runs').get()).toEqual({ count: 0 });

      store.close();
      store = new Store(':memory:', {
        maintenance: {
          automatic: { enabled: true, maxRecordsPerRun: 10 },
        },
      });
      store.saveObservation({
        title: 'Automatic maintenance source C',
        content: 'automatic maintenance duplicate marker',
        project: 'auto-maint-project',
        type: 'decision',
      });
      store.saveObservation({
        title: 'Automatic maintenance source D',
        content: 'automatic maintenance duplicate marker',
        project: 'auto-maint-project',
        type: 'decision',
      });

      const first = store.runAutomaticMaintenance({ scope: { project: 'auto-maint-project' } });
      const second = store.runAutomaticMaintenance({ scope: { project: 'auto-maint-project' } });
      expect(first.dry_run).toBe(false);
      expect(second.dry_run).toBe(false);
      expect(first.counts.records_scanned).toBeLessThanOrEqual(10);
      expect(store.getDb().prepare('SELECT COUNT(*) AS count FROM maintenance_runs').get()).toEqual({ count: 1 });
      expect(store.getDb().prepare("SELECT COUNT(*) AS count FROM observations WHERE tool_name = 'maintenance-reflection'").get()).toEqual({ count: 1 });
    });
  });
});
