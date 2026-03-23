import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';
import type { ExportData, Observation, Session, UserPrompt } from '../../src/store/types.js';

function normalizeObservation(observation: Observation) {
  return {
    sync_id: observation.sync_id,
    session_id: observation.session_id,
    type: observation.type,
    title: observation.title,
    content: observation.content,
    tool_name: observation.tool_name,
    project: observation.project,
    scope: observation.scope,
    topic_key: observation.topic_key,
    normalized_hash: observation.normalized_hash,
    revision_count: observation.revision_count,
    duplicate_count: observation.duplicate_count,
    last_seen_at: observation.last_seen_at,
    created_at: observation.created_at,
    updated_at: observation.updated_at,
    deleted_at: observation.deleted_at,
  };
}

function normalizePrompt(prompt: UserPrompt) {
  return {
    sync_id: prompt.sync_id,
    session_id: prompt.session_id,
    content: prompt.content,
    project: prompt.project,
    created_at: prompt.created_at,
  };
}

function normalizeSession(session: Session) {
  return {
    id: session.id,
    project: session.project,
    directory: session.directory,
    started_at: session.started_at,
    ended_at: session.ended_at,
    summary: session.summary,
  };
}

function seedStore(store: Store): void {
  store.startSession('session-a', 'project-a', '/workspace/project-a');
  store.startSession('session-b', 'project-b', '/workspace/project-b');

  store.saveObservation({
    session_id: 'session-a',
    title: 'Observation A',
    content: 'Content A',
    type: 'decision',
    project: 'project-a',
  });
  store.saveObservation({
    session_id: 'session-b',
    title: 'Observation B',
    content: 'Content B',
    type: 'bugfix',
    project: 'project-b',
  });

  store.savePrompt('session-a', 'Prompt A', 'project-a');
  store.savePrompt('session-b', 'Prompt B', 'project-b');
}

describe('Store — exportData/importData', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('exportData returns all sessions, observations, and prompts', () => {
    seedStore(store);

    const exported = store.exportData();

    expect(exported.version).toBe(1);
    expect(exported.sessions).toHaveLength(2);
    expect(exported.observations).toHaveLength(2);
    expect(exported.prompts).toHaveLength(2);
  });

  it('exportData with a project filter only returns data from that project', () => {
    seedStore(store);

    const exported = store.exportData('project-a');

    expect(exported.project).toBe('project-a');
    expect(exported.sessions).toHaveLength(1);
    expect(exported.sessions[0].project).toBe('project-a');
    expect(exported.observations).toHaveLength(1);
    expect(exported.observations[0].project).toBe('project-a');
    expect(exported.prompts).toHaveLength(1);
    expect(exported.prompts[0].project).toBe('project-a');
  });

  it('importData imports sessions, observations, and prompts', () => {
    const sourceStore = new Store(':memory:');

    try {
      seedStore(sourceStore);
      const data = sourceStore.exportData();

      const result = store.importData(data);

      expect(result).toEqual({
        sessions_imported: 2,
        observations_imported: 2,
        prompts_imported: 2,
        skipped: 0,
      });

      const exported = store.exportData();
      expect(exported.sessions).toHaveLength(2);
      expect(exported.observations).toHaveLength(2);
      expect(exported.prompts).toHaveLength(2);
    } finally {
      sourceStore.close();
    }
  });

  it('importData deduplicates existing observations and prompts by sync_id', () => {
    const sourceStore = new Store(':memory:');

    try {
      sourceStore.startSession('session-a', 'project-a');
      sourceStore.saveObservation({ session_id: 'session-a', title: 'Obs A', content: 'Content A', project: 'project-a' });
      sourceStore.savePrompt('session-a', 'Prompt A', 'project-a');

      const data = sourceStore.exportData();

      const firstImport = store.importData(data);
      const secondImport = store.importData(data);

      expect(firstImport).toEqual({
        sessions_imported: 1,
        observations_imported: 1,
        prompts_imported: 1,
        skipped: 0,
      });
      expect(secondImport).toEqual({
        sessions_imported: 0,
        observations_imported: 0,
        prompts_imported: 0,
        skipped: 2,
      });
    } finally {
      sourceStore.close();
    }
  });

  it('importData creates missing sessions referenced by imported observations and prompts', () => {
    const data: ExportData = {
      version: 1,
      exported_at: '2026-03-23T10:00:00.000Z',
      sessions: [],
      observations: [{
        id: 1,
        sync_id: '11111111-1111-4111-8111-111111111111',
        session_id: 'created-from-observation',
        type: 'manual',
        title: 'Imported observation',
        content: 'Observation content',
        tool_name: null,
        project: 'project-a',
        scope: 'project',
        topic_key: null,
        normalized_hash: null,
        revision_count: 1,
        duplicate_count: 1,
        last_seen_at: null,
        created_at: '2026-03-23 10:00:00',
        updated_at: '2026-03-23 10:00:00',
        deleted_at: null,
      }],
      prompts: [{
        id: 1,
        sync_id: '22222222-2222-4222-8222-222222222222',
        session_id: 'created-from-prompt',
        content: 'Imported prompt',
        project: 'project-b',
        created_at: '2026-03-23 10:05:00',
      }],
    };

    const result = store.importData(data);

    expect(result.sessions_imported).toBe(0);
    expect(result.observations_imported).toBe(1);
    expect(result.prompts_imported).toBe(1);
    expect(store.getSession('created-from-observation')).not.toBeNull();
    expect(store.getSession('created-from-prompt')).not.toBeNull();
  });

  it('importData generates a sync_id for imported observations without one', () => {
    const data: ExportData = {
      version: 1,
      exported_at: '2026-03-23T10:00:00.000Z',
      sessions: [{
        id: 'session-a',
        project: 'project-a',
        directory: null,
        started_at: '2026-03-23 10:00:00',
        ended_at: null,
        summary: null,
      }],
      observations: [{
        id: 1,
        sync_id: null,
        session_id: 'session-a',
        type: 'manual',
        title: 'Legacy observation',
        content: 'Legacy content',
        tool_name: null,
        project: 'project-a',
        scope: 'project',
        topic_key: null,
        normalized_hash: null,
        revision_count: 1,
        duplicate_count: 1,
        last_seen_at: null,
        created_at: '2026-03-23 10:00:00',
        updated_at: '2026-03-23 10:00:00',
        deleted_at: null,
      }],
      prompts: [],
    };

    store.importData(data);

    const imported = store.exportData().observations[0];

    expect(imported.sync_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('round-trips exported data into a fresh store without losing content', () => {
    const sourceStore = new Store(':memory:');
    const targetStore = new Store(':memory:');

    try {
      seedStore(sourceStore);

      const exported = sourceStore.exportData();
      const importResult = targetStore.importData(exported);
      const roundTripped = targetStore.exportData();

      expect(importResult.skipped).toBe(0);
      expect(roundTripped.sessions.map(normalizeSession)).toEqual(exported.sessions.map(normalizeSession));
      expect(roundTripped.observations.map(normalizeObservation)).toEqual(exported.observations.map(normalizeObservation));
      expect(roundTripped.prompts.map(normalizePrompt)).toEqual(exported.prompts.map(normalizePrompt));
    } finally {
      sourceStore.close();
      targetStore.close();
    }
  });
});
