import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../src/store/index.js';
import { OBSERVATION_TYPES, type SaveObservationInput } from '../src/store/types.js';

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
