import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';
import type { DeleteProjectResult, SyncMutation } from '../../src/store/types.js';

function countRows(store: Store, table: 'sessions' | 'observations' | 'observation_versions' | 'user_prompts', whereClause?: string, ...params: Array<string | number>) {
  const sql = whereClause
    ? `SELECT COUNT(*) as count FROM ${table} WHERE ${whereClause}`
    : `SELECT COUNT(*) as count FROM ${table}`;

  return (store.getDb().prepare(sql).get(...params) as { count: number }).count;
}

function countObservationVersionsForProject(store: Store, project: string) {
  return (store.getDb().prepare(
    `SELECT COUNT(*) as count
     FROM observation_versions ov
     JOIN observations o ON o.id = ov.observation_id
     WHERE o.project = ?`
  ).get(project) as { count: number }).count;
}

function expectDeleteResult(result: DeleteProjectResult, expected: DeleteProjectResult) {
  expect(result).toEqual(expected);
}

function getDeleteMutations(store: Store): SyncMutation[] {
  return store.getDb().prepare(
    "SELECT * FROM sync_mutations WHERE operation = 'delete' ORDER BY id ASC"
  ).all() as SyncMutation[];
}

describe('Store — deleteProject', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('deletes an isolated project and leaves unrelated project data untouched', () => {
    store.startSession('session-target', 'project-a', '/workspace/project-a');
    store.startSession('session-other', 'project-b', '/workspace/project-b');

    store.saveObservation({
      session_id: 'session-target',
      title: 'Target observation',
      content: 'Delete me',
      project: 'project-a',
    });
    store.savePrompt('session-target', 'Target prompt', 'project-a');

    store.saveObservation({
      session_id: 'session-other',
      title: 'Other observation',
      content: 'Keep me',
      project: 'project-b',
    });
    store.savePrompt('session-other', 'Other prompt', 'project-b');

    expect(store.exportData('project-a').sessions).toHaveLength(1);
    expect(store.exportData('project-a').observations).toHaveLength(1);
    expect(store.exportData('project-a').prompts).toHaveLength(1);

    const result = store.deleteProject('project-a');

    expectDeleteResult(result, {
      project: 'project-a',
      observations_deleted: 1,
      observation_versions_deleted: 0,
      prompts_deleted: 1,
      sessions_deleted: 1,
    });
    expect(store.exportData('project-a').sessions).toHaveLength(0);
    expect(store.exportData('project-a').observations).toHaveLength(0);
    expect(store.exportData('project-a').prompts).toHaveLength(0);
    expect(store.exportData('project-b').sessions).toHaveLength(1);
    expect(store.exportData('project-b').observations).toHaveLength(1);
    expect(store.exportData('project-b').prompts).toHaveLength(1);

    expect(getDeleteMutations(store)).toEqual([
      expect.objectContaining({
        operation: 'delete',
        entity_type: 'observation',
        entity_id: expect.any(Number),
        sync_id: expect.any(String),
      }),
      expect.objectContaining({
        operation: 'delete',
        entity_type: 'prompt',
        entity_id: expect.any(Number),
        sync_id: expect.any(String),
      }),
      expect.objectContaining({
        operation: 'delete',
        entity_type: 'session',
        entity_id: 0,
        sync_id: 'session-target',
      }),
    ]);
  });

  it('counts observation_versions deleted through cascading observation deletion', () => {
    store.startSession('session-target', 'project-a');

    const created = store.saveObservation({
      session_id: 'session-target',
      title: 'Architecture v1',
      content: 'Version 1',
      topic_key: 'architecture/auth-model',
      project: 'project-a',
    });

    store.saveObservation({
      session_id: 'session-target',
      title: 'Architecture v2',
      content: 'Version 2',
      topic_key: 'architecture/auth-model',
      project: 'project-a',
    });

    expect(store.getObservationVersions(created.observation.id)).toHaveLength(1);
    expect(countObservationVersionsForProject(store, 'project-a')).toBe(1);

    const result = store.deleteProject('project-a');

    expectDeleteResult(result, {
      project: 'project-a',
      observations_deleted: 1,
      observation_versions_deleted: 1,
      prompts_deleted: 0,
      sessions_deleted: 1,
    });
    expect(store.getObservation(created.observation.id)).toBeNull();
    expect(countRows(store, 'observation_versions')).toBe(0);
  });

  it('deletes all user_prompts owned by the target project', () => {
    store.startSession('session-target', 'project-a');
    store.startSession('session-other', 'project-b');

    store.savePrompt('session-target', 'Prompt one', 'project-a');
    store.savePrompt('session-target', 'Prompt two', 'project-a');
    store.savePrompt('session-other', 'Prompt three', 'project-b');

    expect(countRows(store, 'user_prompts', 'project = ?', 'project-a')).toBe(2);

    const result = store.deleteProject('project-a');

    expect(result.prompts_deleted).toBe(2);
    expect(countRows(store, 'user_prompts', 'project = ?', 'project-a')).toBe(0);
    expect(countRows(store, 'user_prompts', 'project = ?', 'project-b')).toBe(1);

    const promptDeleteMutations = getDeleteMutations(store).filter(
      (mutation) => mutation.entity_type === 'prompt'
    );

    expect(promptDeleteMutations).toHaveLength(2);
    expect(promptDeleteMutations.every((mutation) => mutation.sync_id)).toBe(true);
  });

  it('fails closed on cross-project prompt conflicts with no row or mutation side effects', () => {
    store.startSession('shared-session', 'project-a');
    store.saveObservation({
      session_id: 'shared-session',
      title: 'Target observation',
      content: 'Owned by project-a',
      project: 'project-a',
    });
    store.savePrompt('shared-session', 'Foreign prompt', 'project-b');

    expect(store.exportData('project-a').observations).toHaveLength(1);
    expect(store.exportData('project-b').prompts).toHaveLength(1);
    expect(countRows(store, 'observations', 'project = ?', 'project-a')).toBe(1);
    expect(countRows(store, 'user_prompts', 'project = ?', 'project-b')).toBe(1);
    expect(countRows(store, 'sessions', 'project = ?', 'project-a')).toBe(1);

    expect(() => store.deleteProject('project-a')).toThrow(/cross-project|shared session|project-b/i);

    expect(store.exportData('project-a').observations).toHaveLength(1);
    expect(store.exportData('project-b').prompts).toHaveLength(1);
    expect(store.getSession('shared-session')?.project).toBe('project-a');
    expect(countRows(store, 'observations', 'project = ?', 'project-a')).toBe(1);
    expect(countRows(store, 'user_prompts', 'project = ?', 'project-b')).toBe(1);
    expect(countRows(store, 'sessions', 'project = ?', 'project-a')).toBe(1);
    expect(getDeleteMutations(store)).toHaveLength(0);
  });

  it('fails closed on cross-project observation conflicts with no row or mutation side effects', () => {
    store.startSession('shared-session', 'project-a');
    store.startSession('other-session', 'project-a');

    store.saveObservation({
      session_id: 'shared-session',
      title: 'Target observation',
      content: 'Owned by project-a',
      project: 'project-a',
    });
    store.saveObservation({
      session_id: 'shared-session',
      title: 'Foreign observation',
      content: 'Owned by project-b',
      project: 'project-b',
    });
    store.savePrompt('other-session', 'Target prompt', 'project-a');

    expect(countRows(store, 'observations', 'project = ?', 'project-a')).toBe(1);
    expect(countRows(store, 'observations', 'project = ?', 'project-b')).toBe(1);
    expect(countRows(store, 'user_prompts', 'project = ?', 'project-a')).toBe(1);
    expect(countRows(store, 'sessions', 'project = ?', 'project-a')).toBe(2);

    expect(() => store.deleteProject('project-a')).toThrow(/cross-project|shared session|project-b/i);

    expect(countRows(store, 'observations', 'project = ?', 'project-a')).toBe(1);
    expect(countRows(store, 'observations', 'project = ?', 'project-b')).toBe(1);
    expect(countRows(store, 'user_prompts', 'project = ?', 'project-a')).toBe(1);
    expect(countRows(store, 'sessions', 'project = ?', 'project-a')).toBe(2);
    expect(getDeleteMutations(store)).toHaveLength(0);
  });

  it('rolls back all deletions when any statement in the delete transaction aborts', () => {
    store.startSession('session-target', 'project-a');

    const created = store.saveObservation({
      session_id: 'session-target',
      title: 'Versioned observation',
      content: 'Version 1',
      topic_key: 'architecture/project-delete',
      project: 'project-a',
    });
    store.saveObservation({
      session_id: 'session-target',
      title: 'Versioned observation',
      content: 'Version 2',
      topic_key: 'architecture/project-delete',
      project: 'project-a',
    });
    store.savePrompt('session-target', 'Prompt that should survive rollback', 'project-a');

    store.getDb().exec(`
      CREATE TRIGGER abort_project_prompt_delete
      BEFORE DELETE ON user_prompts
      WHEN OLD.project = 'project-a'
      BEGIN
        SELECT RAISE(ABORT, 'prompt delete blocked');
      END;
    `);

    expect(countRows(store, 'observations', 'project = ?', 'project-a')).toBe(1);
    expect(countObservationVersionsForProject(store, 'project-a')).toBe(1);
    expect(countRows(store, 'user_prompts', 'project = ?', 'project-a')).toBe(1);
    expect(countRows(store, 'sessions', 'project = ?', 'project-a')).toBe(1);

    expect(() => store.deleteProject('project-a')).toThrow(/prompt delete blocked/);

    expect(store.getObservation(created.observation.id)).not.toBeNull();
    expect(countRows(store, 'observations', 'project = ?', 'project-a')).toBe(1);
    expect(countObservationVersionsForProject(store, 'project-a')).toBe(1);
    expect(countRows(store, 'user_prompts', 'project = ?', 'project-a')).toBe(1);
    expect(countRows(store, 'sessions', 'project = ?', 'project-a')).toBe(1);
    expect(getDeleteMutations(store)).toHaveLength(0);
  });
});
