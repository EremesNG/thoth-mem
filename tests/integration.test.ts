import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncExport, syncImport } from '../src/sync/index.js';
import { Store } from '../src/store/index.js';
import { OBSERVATION_TYPES, type SaveObservationInput, type SyncChunkV2 } from '../src/store/types.js';
import { VERSION } from '../src/version.js';

describe('Integration', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('exercises the full session lifecycle', () => {
    const session = store.startSession('s1', 'thoth', '/dev/thoth');

    expect(session.id).toBe('s1');
    expect(session.project).toBe('thoth');
    expect(session.directory).toBe('/dev/thoth');

    const observations: SaveObservationInput[] = [
      {
        title: 'Store flow decision',
        content: 'Sharedflow decision: use SQLite-backed memory for durable agent recall.',
        type: 'decision',
        session_id: 's1',
        project: 'thoth',
      },
      {
        title: 'Store flow bugfix',
        content: 'Sharedflow bugfix: repaired FTS sync after observation updates.',
        type: 'bugfix',
        session_id: 's1',
        project: 'thoth',
      },
      {
        title: 'Store flow pattern',
        content: 'Sharedflow pattern: persist project-scoped notes with topic keys.',
        type: 'pattern',
        session_id: 's1',
        project: 'thoth',
      },
    ];

    const saved = observations.map((input) => store.saveObservation(input));
    const searchResults = store.searchObservations({ query: 'Sharedflow', project: 'thoth' });

    expect(searchResults).toHaveLength(3);
    expect(searchResults.map((result) => result.id)).toEqual(
      expect.arrayContaining(saved.map((result) => result.observation.id))
    );

    const fullObservation = store.getObservation(saved[1].observation.id);

    expect(fullObservation).not.toBeNull();
    expect(fullObservation?.content).toBe(observations[1].content);

    const summary = store.saveObservation({
      title: 'Session summary: thoth',
      content: '## Goal\nTest session\n## Accomplished\n- Built tests',
      type: 'session_summary',
      session_id: 's1',
      project: 'thoth',
    });

    expect(summary.action).toBe('created');

    const ended = store.endSession('s1', 'Test session complete');

    expect(ended).not.toBeNull();
    expect(ended?.ended_at).not.toBeNull();
    expect(ended?.summary).toBe('Test session complete');
    expect(store.searchObservations({ query: 'Sharedflow', project: 'thoth' })).toHaveLength(3);
  });

  it('deduplicates repeated observations within the configured window', () => {
    store.startSession('s1', 'thoth', '/dev/thoth');

    const first = store.saveObservation({
      title: 'Duplicate marker',
      content: 'Duplicatemarker content should only be stored once.',
      type: 'decision',
      session_id: 's1',
      project: 'thoth',
    });
    const second = store.saveObservation({
      title: 'Duplicate marker',
      content: 'Duplicatemarker content should only be stored once.',
      type: 'decision',
      session_id: 's1',
      project: 'thoth',
    });

    expect(first.action).toBe('created');
    expect(second.action).toBe('deduplicated');
    expect(second.observation.id).toBe(first.observation.id);
    expect(second.observation.duplicate_count).toBe(2);
    expect(store.searchObservations({ query: 'Duplicatemarker', project: 'thoth' })).toHaveLength(1);
  });

  it('upserts topic-keyed observations and keeps version history', () => {
    store.startSession('s1', 'thoth', '/dev/thoth');

    const first = store.saveObservation({
      title: 'Auth architecture',
      content: 'Original auth architecture used sessions.',
      type: 'architecture',
      topic_key: 'architecture/auth',
      session_id: 's1',
      project: 'thoth',
    });
    const second = store.saveObservation({
      title: 'Auth architecture',
      content: 'Updated auth architecture uses signed tokens.',
      type: 'architecture',
      topic_key: 'architecture/auth',
      session_id: 's1',
      project: 'thoth',
    });

    expect(first.action).toBe('created');
    expect(second.action).toBe('upserted');
    expect(second.observation.id).toBe(first.observation.id);
    expect(second.observation.revision_count).toBe(2);
    expect(second.observation.content).toBe('Updated auth architecture uses signed tokens.');

    const versions = store.getObservationVersions(first.observation.id);

    expect(versions).toHaveLength(1);
    expect(versions[0].version_number).toBe(1);
    expect(versions[0].content).toBe('Original auth architecture used sessions.');
  });

  it('strips private content before persisting observations', () => {
    const saved = store.saveObservation({
      title: 'Secrets audit',
      content: 'API key is <private>sk-secret-123</private> and it works',
      type: 'discovery',
      project: 'thoth',
    });

    const observation = store.getObservation(saved.observation.id);

    expect(observation).not.toBeNull();
    expect(observation?.content).not.toContain('sk-secret-123');
    expect(observation?.content).toContain('API key is');
    expect(observation?.content).toContain('and it works');
  });

  it('accepts every valid observation type and rejects invalid direct SQL inserts', () => {
    store.startSession('s1', 'thoth', '/dev/thoth');

    const results = OBSERVATION_TYPES.map((type) =>
      store.saveObservation({
        title: `Taxonomy ${type}`,
        content: `Taxonomy coverage for ${type}`,
        type,
        session_id: 's1',
        project: 'thoth',
      })
    );

    expect(results.every((result) => result.action === 'created')).toBe(true);
    expect(store.searchObservations({ query: 'Taxonomy', project: 'thoth', limit: OBSERVATION_TYPES.length })).toHaveLength(
      OBSERVATION_TYPES.length
    );

    const db = store.getDb();

    expect(() =>
      db.prepare('INSERT INTO observations (session_id, type, title, content) VALUES (?, ?, ?, ?)').run(
        's1',
        'invalid_type',
        'test',
        'test'
      )
    ).toThrow();
  });

  it('retrieves large observation content without truncation', () => {
    const content = 'abc123'.repeat(10_000);
    const saved = store.saveObservation({
      title: 'Large content',
      content,
      type: 'manual',
      project: 'thoth',
    });

    const observation = store.getObservation(saved.observation.id);

    expect(observation).not.toBeNull();
    expect(observation?.content.length).toBe(60_000);
    expect(observation?.content).toBe(content);
  });

  it('builds context output with recent sessions, observations, prompts, and project filtering', () => {
    populateStoreForContext(store);

    const context = store.getContext({});
    const filtered = store.getContext({ project: 'thoth' });

    expect(context).toContain('Recent Sessions');
    expect(context).toContain('Recent Observations');
    expect(context.toLowerCase()).toContain('stats');
    expect(filtered).toContain('Thoth context observation');
    expect(filtered).toContain('How should Thoth store summaries?');
    expect(filtered).not.toContain('Atlas context observation');
    expect(filtered).not.toContain('How should Atlas sync memory?');
  });

  it('reports accurate aggregate stats for the populated store', () => {
    const expected = populateStoreForContext(store);

    const stats = store.getStats();

    expect(stats.total_sessions).toBe(expected.totalSessions);
    expect(stats.total_observations).toBe(expected.totalObservations);
    expect(stats.total_prompts).toBe(expected.totalPrompts);
    expect(stats.projects).toContain('thoth');
    expect(stats.projects).toEqual(['atlas', 'thoth']);
  });

  it('keeps session lifecycle compatible with start → save → summary flow', () => {
    const session = store.startSession('session-lifecycle', 'thoth', '/dev/thoth');
    expect(session.id).toBe('session-lifecycle');

    const saved = store.saveObservation({
      title: 'Lifecycle observation',
      content: 'Lifecycle content',
      session_id: 'session-lifecycle',
      project: 'thoth',
    });

    const summary = store.saveObservation({
      title: 'Session summary',
      content: '## Goal\nLifecycle test\n## Accomplished\n- Saved observations',
      type: 'session_summary',
      session_id: 'session-lifecycle',
      project: 'thoth',
    });

    const ended = store.endSession('session-lifecycle', 'Lifecycle complete');

    expect(saved.action).toBe('created');
    expect(summary.action).toBe('created');
    expect(ended).not.toBeNull();
    expect(ended?.summary).toBe('Lifecycle complete');
    expect(ended?.ended_at).not.toBeNull();
  });

  describe('sync-and-resilience integration', () => {
    it('converges full lifecycle sync with updates and tombstones', () => {
      const storeA = new Store(':memory:');
      const storeB = new Store(':memory:');
      const syncDir = mkdtempSync(join(tmpdir(), 'thoth-mem-integration-sync-'));

      try {
        storeA.startSession('sync-session-1', 'sync-project', '/dev/sync-project');

        const kept = storeA.saveObservation({
          session_id: 'sync-session-1',
          project: 'sync-project',
          title: 'Lifecycle kept',
          content: 'Original keep content',
          type: 'manual',
        });
        const updated = storeA.saveObservation({
          session_id: 'sync-session-1',
          project: 'sync-project',
          title: 'Lifecycle updated',
          content: 'Original update content',
          type: 'manual',
        });
        const deleted = storeA.saveObservation({
          session_id: 'sync-session-1',
          project: 'sync-project',
          title: 'Lifecycle deleted',
          content: 'Content that should be tombstoned',
          type: 'manual',
        });

        storeA.savePrompt('sync-session-1', 'Prompt from store A', 'sync-project');
        storeA.updateObservation({
          id: updated.observation.id,
          content: 'Updated content from store A',
        });
        storeA.deleteObservation(deleted.observation.id);

        const exportResult = syncExport(storeA, syncDir, 'sync-project');
        expect(exportResult.exported).toBeGreaterThan(0);
        expect(exportResult.chunks).toBe(1);

        const importResult = syncImport(storeB, syncDir);

        expect(importResult.chunks_processed).toBe(1);
        expect(importResult.imported).toBe(1);

        const importedKept = storeB.getObservation(kept.observation.id);
        const importedUpdated = storeB.getObservation(updated.observation.id);

        expect(importedKept).not.toBeNull();
        expect(importedUpdated).not.toBeNull();
        expect(importedUpdated?.content).toBe('Updated content from store A');

        const deletedRow = storeB
          .getDb()
          .prepare('SELECT deleted_at FROM observations WHERE sync_id = ? LIMIT 1')
          .get(deleted.observation.sync_id) as { deleted_at: string | null } | undefined;

        expect(deletedRow).toBeDefined();
        expect(deletedRow?.deleted_at).not.toBeNull();
        expect(storeB.getSession('sync-session-1')).not.toBeNull();
        expect(storeB.exportData('sync-project').prompts.map((prompt) => prompt.content)).toContain('Prompt from store A');
      } finally {
        storeA.close();
        storeB.close();
        rmSync(syncDir, { recursive: true, force: true });
      }
    });

    it('exports only new deltas after a previous incremental export', () => {
      const storeA = new Store(':memory:');
      const syncDir = mkdtempSync(join(tmpdir(), 'thoth-mem-integration-sync-'));

      try {
        storeA.startSession('delta-session', 'delta-project', '/dev/delta');

        const firstObservation = storeA.saveObservation({
          session_id: 'delta-session',
          project: 'delta-project',
          title: 'First export observation',
          content: 'First export content',
          type: 'manual',
        });
        const firstPrompt = storeA.savePrompt('delta-session', 'First export prompt', 'delta-project');

        const firstExport = syncExport(storeA, syncDir, 'delta-project');
        expect(firstExport.exported).toBeGreaterThan(0);

        const secondObservation = storeA.saveObservation({
          session_id: 'delta-session',
          project: 'delta-project',
          title: 'Second export observation',
          content: 'Second export content',
          type: 'manual',
        });
        const secondPrompt = storeA.savePrompt('delta-session', 'Second export prompt', 'delta-project');

        const secondExport = syncExport(storeA, syncDir, 'delta-project');

        expect(secondExport.exported).toBe(2);
        expect(secondExport.sessions).toBe(0);
        expect(secondExport.observations).toBe(1);
        expect(secondExport.prompts).toBe(1);
        expect((secondExport.from_mutation_id as number) > (firstExport.to_mutation_id as number)).toBe(true);

        const secondChunk = JSON.parse(
          gunzipSync(readFileSync(join(syncDir, 'chunks', secondExport.filename))).toString('utf-8')
        ) as SyncChunkV2;

        const secondChunkSyncIds = secondChunk.mutations.map((mutation) => mutation.sync_id);

        expect(secondChunk.mutations).toHaveLength(2);
        expect(secondChunkSyncIds).toContain(secondObservation.observation.sync_id);
        expect(secondChunkSyncIds).toContain(secondPrompt.sync_id);
        expect(secondChunkSyncIds).not.toContain(firstObservation.observation.sync_id);
        expect(secondChunkSyncIds).not.toContain(firstPrompt.sync_id);
      } finally {
        storeA.close();
        rmSync(syncDir, { recursive: true, force: true });
      }
    });

    it('supports exact topic-key search and FTS topic-key lookup end-to-end', () => {
      store.startSession('topic-exact-session', 'topic-project', '/dev/topic');

      const saved = store.saveObservation({
        session_id: 'topic-exact-session',
        project: 'topic-project',
        title: 'Topic exact observation',
        content: 'Observation used for topic-key exact integration test',
        topic_key: 'architecture/syncexacttoken',
        type: 'manual',
      });

      const exact = store.searchObservations({
        query: 'ignored',
        topic_key_exact: 'architecture/syncexacttoken',
        project: 'topic-project',
      });
      const fts = store.searchObservations({ query: 'syncexacttoken', project: 'topic-project' });
      const wrongExact = store.searchObservations({
        query: 'ignored',
        topic_key_exact: 'architecture/not-found',
        project: 'topic-project',
      });

      expect(exact).toHaveLength(1);
      expect(exact[0].id).toBe(saved.observation.id);
      expect(fts.some((result) => result.id === saved.observation.id)).toBe(true);
      expect(wrongExact).toEqual([]);
    });

    it('keeps VERSION constant aligned with package.json version', () => {
      const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as {
        version: string;
      };

      expect(VERSION).toBe(pkg.version);
    });
  });
});

function populateStoreForContext(store: Store): {
  totalSessions: number;
  totalObservations: number;
  totalPrompts: number;
} {
  store.startSession('s1', 'thoth', '/dev/thoth');
  store.startSession('s2', 'atlas', '/dev/atlas');

  const observations: SaveObservationInput[] = [
    {
      title: 'Thoth context observation',
      content: 'Thoth context observation keeps memory summaries searchable.',
      type: 'decision',
      session_id: 's1',
      project: 'thoth',
    },
    {
      title: 'Thoth implementation note',
      content: 'Thoth implementation note tracks context rendering behavior.',
      type: 'pattern',
      session_id: 's1',
      project: 'thoth',
    },
    {
      title: 'Atlas context observation',
      content: 'Atlas context observation should disappear from filtered context.',
      type: 'bugfix',
      session_id: 's2',
      project: 'atlas',
    },
  ];

  for (const input of observations) {
    store.saveObservation(input);
  }

  store.savePrompt('s1', 'How should Thoth store summaries?', 'thoth');
  store.savePrompt('s2', 'How should Atlas sync memory?', 'atlas');

  return {
    totalSessions: 2,
    totalObservations: observations.length,
    totalPrompts: 2,
  };
}
