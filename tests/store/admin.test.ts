import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';

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
});
