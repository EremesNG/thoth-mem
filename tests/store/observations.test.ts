import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('Store - Observation CRUD', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  describe('saveObservation', () => {
    it('creates a new observation', () => {
      const result = store.saveObservation({ title: 'Test', content: 'Test content' });
      expect(result.action).toBe('created');
      expect(result.observation.id).toBeGreaterThan(0);
      expect(result.observation.type).toBe('manual');
      expect(result.observation.scope).toBe('project');
    });

    it('strips private tags from title and content', () => {
      const result = store.saveObservation({
        title: 'Title <private>secret</private>',
        content: 'Content <private>hidden</private> visible'
      });
      expect(result.observation.title).not.toContain('secret');
      expect(result.observation.content).not.toContain('hidden');
      expect(result.observation.content).toContain('visible');
    });

    it('deduplicates within window', () => {
      const r1 = store.saveObservation({ title: 'Same', content: 'Same content', project: 'p1' });
      const r2 = store.saveObservation({ title: 'Same', content: 'Same content', project: 'p1' });
      expect(r1.action).toBe('created');
      expect(r2.action).toBe('deduplicated');
      expect(r2.observation.id).toBe(r1.observation.id);
      expect(r2.observation.duplicate_count).toBe(2);
    });

    it('deduplicates formatting-only differences', () => {
      const r1 = store.saveObservation({ title: 'Same', content: 'Hello   World', project: 'p1' });
      const r2 = store.saveObservation({ title: 'Same', content: 'hello world', project: 'p1' });
      expect(r1.action).toBe('created');
      expect(r2.action).toBe('deduplicated');
    });

    it('upserts via topic_key', () => {
      const r1 = store.saveObservation({ title: 'V1', content: 'Version 1', topic_key: 'arch/auth', project: 'p1' });
      expect(r1.action).toBe('created');

      const r2 = store.saveObservation({ title: 'V2', content: 'Version 2', topic_key: 'arch/auth', project: 'p1' });
      expect(r2.action).toBe('upserted');
      expect(r2.observation.id).toBe(r1.observation.id);
      expect(r2.observation.title).toBe('V2');
      expect(r2.observation.content).toBe('Version 2');
      expect(r2.observation.revision_count).toBe(2);
    });

    it('saves version on topic_key upsert', () => {
      store.saveObservation({ title: 'V1', content: 'Version 1', topic_key: 'arch/auth', project: 'p1' });
      store.saveObservation({ title: 'V2', content: 'Version 2', topic_key: 'arch/auth', project: 'p1' });

      const id = store.searchObservations({ query: 'Version' })[0].id;
      const versions = store.getObservationVersions(id);
      expect(versions).toHaveLength(1);
      expect(versions[0].title).toBe('V1');
      expect(versions[0].content).toBe('Version 1');
    });

    it('uses specified type and scope', () => {
      const result = store.saveObservation({
        title: 'Decision', content: 'We chose X',
        type: 'decision', scope: 'personal', project: 'p1'
      });
      expect(result.observation.type).toBe('decision');
      expect(result.observation.scope).toBe('personal');
    });

    it('auto-creates session if not exists', () => {
      store.saveObservation({ title: 'Test', content: 'Content', project: 'myproject' });
      const session = store.getSession('manual-save-myproject');
      expect(session).not.toBeNull();
    });
  });

  describe('getObservation', () => {
    it('returns observation by id', () => {
      const { observation } = store.saveObservation({ title: 'Test', content: 'Content' });
      const found = store.getObservation(observation.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe('Test');
    });

    it('returns null for non-existent id', () => {
      expect(store.getObservation(999)).toBeNull();
    });

    it('returns null for soft-deleted observation', () => {
      const { observation } = store.saveObservation({ title: 'Test', content: 'Content' });
      store.getDb().prepare("UPDATE observations SET deleted_at = datetime('now') WHERE id = ?").run(observation.id);
      expect(store.getObservation(observation.id)).toBeNull();
    });
  });

  describe('searchObservations', () => {
    it('finds observations by keyword', () => {
      store.saveObservation({ title: 'JWT middleware', content: 'Authentication logic', project: 'p1' });
      store.saveObservation({ title: 'Database setup', content: 'PostgreSQL config', project: 'p1' });

      const results = store.searchObservations({ query: 'JWT' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('JWT middleware');
      expect(results[0].preview).toBeDefined();
    });

    it('filters by type', () => {
      store.saveObservation({ title: 'Bug', content: 'Fixed it', type: 'bugfix', project: 'p1' });
      store.saveObservation({ title: 'Arch', content: 'Design it', type: 'architecture', project: 'p1' });

      const results = store.searchObservations({ query: 'it', type: 'bugfix' });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('bugfix');
    });

    it('filters by project', () => {
      store.saveObservation({ title: 'A', content: 'Content A', project: 'proj-a' });
      store.saveObservation({ title: 'B', content: 'Content B', project: 'proj-b' });

      const results = store.searchObservations({ query: 'Content', project: 'proj-a' });
      expect(results).toHaveLength(1);
      expect(results[0].project).toBe('proj-a');
    });

    it('returns empty for no matches', () => {
      const results = store.searchObservations({ query: 'nonexistent' });
      expect(results).toHaveLength(0);
    });

    it('handles FTS5 special characters safely', () => {
      store.saveObservation({ title: 'Test', content: 'Some content' });
      expect(() => store.searchObservations({ query: 'AND OR NOT' })).not.toThrow();
      expect(() => store.searchObservations({ query: '(test)' })).not.toThrow();
      expect(() => store.searchObservations({ query: '-test' })).not.toThrow();
    });

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        store.saveObservation({ title: `Item ${i}`, content: `Content for item ${i}` });
      }
      const results = store.searchObservations({ query: 'Content', limit: 2 });
      expect(results).toHaveLength(2);
    });
  });
});
