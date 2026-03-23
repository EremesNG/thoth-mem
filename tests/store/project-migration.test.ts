import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('Store — migrateProject', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('updates sessions, observations, and prompts for the renamed project', () => {
    store.startSession('session-1', 'old-project', '/workspace/old-project');
    store.saveObservation({ session_id: 'session-1', title: 'Observation', content: 'Content', project: 'old-project' });
    store.savePrompt('session-1', 'Prompt content', 'old-project');

    const result = store.migrateProject('old-project', 'new-project');

    expect(result).toEqual({
      old_project: 'old-project',
      new_project: 'new-project',
      sessions_updated: 1,
      observations_updated: 1,
      prompts_updated: 1,
    });
    expect(store.getSession('session-1')?.project).toBe('new-project');
    expect(store.exportData('new-project').observations).toHaveLength(1);
    expect(store.exportData('new-project').prompts).toHaveLength(1);
  });

  it('returns accurate counts for all migrated record types', () => {
    store.startSession('session-1', 'old-project');
    store.startSession('session-2', 'old-project');
    store.saveObservation({ session_id: 'session-1', title: 'Observation 1', content: 'Content 1', project: 'old-project' });
    store.saveObservation({ session_id: 'session-2', title: 'Observation 2', content: 'Content 2', project: 'old-project' });
    store.savePrompt('session-1', 'Prompt 1', 'old-project');

    const result = store.migrateProject('old-project', 'new-project');

    expect(result.sessions_updated).toBe(2);
    expect(result.observations_updated).toBe(2);
    expect(result.prompts_updated).toBe(1);
  });

  it('returns zero counts when the source project has no matching data', () => {
    store.startSession('session-1', 'other-project');
    store.saveObservation({ session_id: 'session-1', title: 'Observation', content: 'Content', project: 'other-project' });
    store.savePrompt('session-1', 'Prompt', 'other-project');

    const result = store.migrateProject('missing-project', 'new-project');

    expect(result).toEqual({
      old_project: 'missing-project',
      new_project: 'new-project',
      sessions_updated: 0,
      observations_updated: 0,
      prompts_updated: 0,
    });
  });

  it('rolls back all updates when any part of the project migration fails', () => {
    store.startSession('session-1', 'old-project');
    store.saveObservation({ session_id: 'session-1', title: 'Observation', content: 'Content', project: 'old-project' });
    store.savePrompt('session-1', 'Prompt', 'old-project');

    store.getDb().exec(`
      CREATE TRIGGER abort_project_prompt_update
      BEFORE UPDATE OF project ON user_prompts
      WHEN OLD.project = 'old-project' AND NEW.project = 'new-project'
      BEGIN
        SELECT RAISE(ABORT, 'prompt update blocked');
      END;
    `);

    expect(() => store.migrateProject('old-project', 'new-project')).toThrow(/prompt update blocked/);

    expect(store.getSession('session-1')?.project).toBe('old-project');
    expect(store.exportData('new-project').sessions).toHaveLength(0);
    expect(store.exportData('old-project').observations).toHaveLength(1);
    expect(store.exportData('old-project').prompts).toHaveLength(1);
  });
});
