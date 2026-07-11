import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Store } from '../../src/store/index.js';
import * as jobs from '../../src/indexing/jobs.js';

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

    it('formats search results in compact mode by default', () => {
      store.saveObservation({ title: 'Compact formatting', content: 'mode formatting token' });

      const text = store.searchObservationsFormatted({ query: 'mode formatting token' });

      expect(text).toContain('Found');
      expect(text).toContain('memory');
      expect(text).toContain('(manual) Compact formatting');
      expect(text).not.toContain('### [manual]');
    });

    it('formats search results in preview mode when requested', () => {
      store.saveObservation({ title: 'Preview formatting', content: 'mode formatting preview token' });

      const text = store.searchObservationsFormatted({ query: 'mode formatting preview token', mode: 'preview' });

      expect(text).toContain('### [manual] Preview formatting');
    });
  });
});

describe('Store - transactional observation writes', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    // Oracle guardrail: the throw-spy is scoped per-test and MUST NOT leak into
    // the happy-path commit assertion below or the full suite.
    vi.restoreAllMocks();
    store.close();
  });

  const countObservations = (title: string): number =>
    (store.getDb().prepare('SELECT COUNT(*) AS count FROM observations WHERE title = ?').get(title) as { count: number }).count;

  const countObservationVersions = (observationId: number): number =>
    (store.getDb().prepare('SELECT COUNT(*) AS count FROM observation_versions WHERE observation_id = ?').get(observationId) as { count: number }).count;

  const countObservationTriples = (observationId: number): number =>
    (store.getDb().prepare(
      "SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation' AND source_id = ?"
    ).get(observationId) as { count: number }).count;

  const countObservationMutations = (): number =>
    (store.getDb().prepare(
      "SELECT COUNT(*) AS count FROM sync_mutations WHERE entity_type = 'observation'"
    ).get() as { count: number }).count;

  // ── Task 2.1: new-insert path rolls back on mid-write KG failure ──
  it('rolls back the new-insert path when the KG write throws mid-transaction', () => {
    const triplesBaseline = (store.getDb().prepare(
      "SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation'"
    ).get() as { count: number }).count;
    const mutationsBaseline = countObservationMutations();

    const spy = vi.spyOn(jobs, 'writeDeterministicKgFacts').mockImplementation(() => {
      throw new Error('injected mid-write KG failure');
    });

    expect(() => store.saveObservation({ title: 'Rollback new-insert', content: 'body', project: 'rb' }))
      .toThrow('injected mid-write KG failure');

    expect(spy).toHaveBeenCalledTimes(1);
    // (a) no observation row survives
    expect(countObservations('Rollback new-insert')).toBe(0);
    // (b) kg_triples unchanged from baseline (new-insert path -> 0)
    expect((store.getDb().prepare(
      "SELECT COUNT(*) AS count FROM kg_triples WHERE source_type = 'observation'"
    ).get() as { count: number }).count).toBe(triplesBaseline);
    // (c) the recordMutation('create', ...) row at :1555 rolled back too
    expect(countObservationMutations()).toBe(mutationsBaseline);
  });

  // ── Task 2.2: topic_key-upsert path rolls back on mid-write KG failure ──
  it('rolls back the topic_key-upsert path when the KG write throws mid-transaction', () => {
    const seeded = store.saveObservation({
      title: 'Upsert V1',
      content: 'Version 1 body',
      topic_key: 'rollback/upsert',
      project: 'rb',
    }).observation;

    const before = store.getObservation(seeded.id)!;
    const versionsBefore = countObservationVersions(seeded.id);
    const triplesBefore = countObservationTriples(seeded.id);

    const spy = vi.spyOn(jobs, 'writeDeterministicKgFacts').mockImplementation(() => {
      throw new Error('injected mid-write KG failure');
    });

    expect(() => store.saveObservation({
      title: 'Upsert V2',
      content: 'Version 2 body',
      topic_key: 'rollback/upsert',
      project: 'rb',
    })).toThrow('injected mid-write KG failure');

    expect(spy).toHaveBeenCalledTimes(1);
    const after = store.getObservation(seeded.id)!;
    // (a) row title/content/revision_count/updated_at unchanged (UPDATE rolled back)
    expect(after.title).toBe(before.title);
    expect(after.content).toBe(before.content);
    expect(after.revision_count).toBe(before.revision_count);
    expect(after.updated_at).toBe(before.updated_at);
    // (b) no new observation_versions row for this call (INSERT rolled back)
    expect(countObservationVersions(seeded.id)).toBe(versionsBefore);
    // (c) kg_triples for that observation unchanged
    expect(countObservationTriples(seeded.id)).toBe(triplesBefore);
  });

  // ── Task 2.3: updateObservation rolls back on mid-write KG failure ──
  it('rolls back updateObservation when the KG write throws mid-transaction', () => {
    const seeded = store.saveObservation({
      title: 'Update target',
      content: 'Original body',
      project: 'rb',
    }).observation;

    const before = store.getObservation(seeded.id)!;
    const versionsBefore = countObservationVersions(seeded.id);
    const triplesBefore = countObservationTriples(seeded.id);

    const spy = vi.spyOn(jobs, 'writeDeterministicKgFacts').mockImplementation(() => {
      throw new Error('injected mid-write KG failure');
    });

    expect(() => store.updateObservation({ id: seeded.id, content: 'Mutated body' }))
      .toThrow('injected mid-write KG failure');

    expect(spy).toHaveBeenCalledTimes(1);
    const after = store.getObservation(seeded.id)!;
    // (a) observation row unchanged (UPDATE rolled back)
    expect(after.content).toBe(before.content);
    expect(after.revision_count).toBe(before.revision_count);
    expect(after.updated_at).toBe(before.updated_at);
    expect(after.normalized_hash).toBe(before.normalized_hash);
    // (b) no new observation_versions row for this call
    expect(countObservationVersions(seeded.id)).toBe(versionsBefore);
    // (c) kg_triples for that observation unchanged
    expect(countObservationTriples(seeded.id)).toBe(triplesBefore);
  });

  // ── Task 3.1: default 'kg' mode — no nested-tx error + happy-path commit ──
  it('commits a normal save on the default kg mode with no nested-transaction error', () => {
    // No spy active here; verifies the wrap did not introduce a
    // "cannot start a transaction within a transaction" error and that a
    // normal write still commits post-wrap.
    let result!: ReturnType<Store['saveObservation']>;
    expect(() => {
      result = store.saveObservation({
        title: 'Happy path commit',
        type: 'decision',
        project: 'rb',
        topic_key: 'rollback/happy',
        content: '**What**: committed content',
      });
    }).not.toThrow();

    expect(result.action).toBe('created');
    expect(result.observation.id).toBeGreaterThan(0);
    expect(countObservations('Happy path commit')).toBe(1);
    expect(countObservationTriples(result.observation.id)).toBeGreaterThan(0);

    // A subsequent update on the same row also commits atomically post-wrap.
    const updated = store.updateObservation({ id: result.observation.id, content: '**What**: updated content' });
    expect(updated).not.toBeNull();
    expect(updated!.content).toBe('**What**: updated content');
  });
});
