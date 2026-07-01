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

    expect(Object.keys(exported).sort()).toEqual(['exported_at', 'observations', 'project', 'prompts', 'sessions', 'version']);
    expect(exported.version).toBe(1);
    expect(exported.sessions).toHaveLength(2);
    expect(exported.observations).toHaveLength(2);
    expect(exported.prompts).toHaveLength(2);
    expect(exported).not.toHaveProperty('kg_triples');
    expect(exported).not.toHaveProperty('kg_entities');
    expect(exported).not.toHaveProperty('observation_facts');
  });

  it('exportData stays portable after KG supersession and import ignores KG-only state', () => {
    store.saveObservation({
      title: 'Portable supersession',
      content: '**What**: Redis cache',
      type: 'decision',
      project: 'project-a',
      topic_key: 'kg/portable-supersession',
    });
    store.saveObservation({
      title: 'Portable supersession',
      content: '**What**: Valkey cache',
      type: 'decision',
      project: 'project-a',
      topic_key: 'kg/portable-supersession',
    });

    const exported = store.exportData();
    const portableJson = JSON.stringify(exported);

    expect(exported.version).toBe(1);
    expect(exported).not.toHaveProperty('kg_triples');
    expect(portableJson).not.toContain('kg_triples');
    expect(portableJson).not.toContain('superseded_by_triple_id');
    expect(portableJson).not.toContain('superseded_at');

    const targetStore = new Store(':memory:');
    try {
      const result = targetStore.importData(exported);
      expect(result).toMatchObject({
        observations_imported: 1,
        skipped: 0,
      });
      expect(targetStore.exportData().observations).toHaveLength(1);
    } finally {
      targetStore.close();
    }
  });

  it('exportData includes reflected observations but omits internal maintenance metadata', () => {
    const duplicateSource = store.saveObservation({
      title: 'Portable maintenance duplicate A',
      content: 'portable maintenance duplicate marker',
      type: 'decision',
      project: 'portable-maintenance',
    }).observation;
    store.getDb().prepare(
      `INSERT INTO observations (
         session_id, type, title, content, project, scope, normalized_hash, sync_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 day'), datetime('now', '-1 day'))`
    ).run(
      duplicateSource.session_id,
      duplicateSource.type,
      'Portable maintenance duplicate B',
      duplicateSource.content,
      duplicateSource.project,
      duplicateSource.scope,
      duplicateSource.normalized_hash,
      '66666666-6666-4666-8666-666666666666'
    );
    const stale = store.saveObservation({
      title: 'Portable stale maintenance note',
      content: 'portable stale maintenance marker',
      type: 'discovery',
      project: 'portable-maintenance',
    }).observation;
    store.getDb().prepare(
      "UPDATE observations SET updated_at = datetime('now', '-365 days'), created_at = datetime('now', '-365 days') WHERE id = ?"
    ).run(stale.id);
    store.saveObservation({
      title: 'Portable reflection A',
      content: 'First portable reflection source',
      type: 'architecture',
      project: 'portable-maintenance',
    });
    store.saveObservation({
      title: 'Portable reflection B',
      content: 'Second portable reflection source',
      type: 'architecture',
      project: 'portable-maintenance',
    });
    const maintenance = store.runMaintenance({ scope: { project: 'portable-maintenance' } });

    expect(maintenance.reflections.length).toBeGreaterThan(0);

    const exported = store.exportData('portable-maintenance');
    const portableJson = JSON.stringify(exported);

    expect(exported.observations.some((observation) => observation.tool_name === 'maintenance-reflection')).toBe(true);
    expect(portableJson).not.toContain('maintenance_runs');
    expect(portableJson).not.toContain('maintenance_decay');
    expect(portableJson).not.toContain('maintenance_consolidations');

    const targetStore = new Store(':memory:');
    try {
      const result = targetStore.importData(exported);
      expect(result.observations_imported).toBe(exported.observations.length);
      expect(targetStore.exportData('portable-maintenance').observations.some((observation) =>
        observation.tool_name === 'maintenance-reflection'
      )).toBe(true);
      expect(targetStore.getDb().prepare('SELECT COUNT(*) AS count FROM maintenance_consolidations').get()).toEqual({ count: 0 });
      expect(targetStore.getDb().prepare('SELECT COUNT(*) AS count FROM maintenance_decay').get()).toEqual({ count: 0 });

      const regenerated = targetStore.runMaintenance({ scope: { project: 'portable-maintenance' } });
      expect(regenerated.counts.records_scanned).toBeGreaterThan(0);
      expect(regenerated.counts.consolidation_candidates).toBeGreaterThan(0);
      expect(regenerated.counts.decay_candidates).toBeGreaterThan(0);
      expect(targetStore.getDb().prepare('SELECT COUNT(*) AS count FROM maintenance_consolidations').get()).toEqual({ count: 1 });
      expect(targetStore.getDb().prepare('SELECT COUNT(*) AS count FROM maintenance_decay').get()).toEqual({ count: 1 });
    } finally {
      targetStore.close();
    }
  });

  it('does not duplicate reflected observations after import into a non-empty store', () => {
    store.saveObservation({
      title: 'Portable reflection stable A',
      content: 'First stable portable reflection source',
      type: 'architecture',
      project: 'stable-reflection-portable',
    });
    store.saveObservation({
      title: 'Portable reflection stable B',
      content: 'Second stable portable reflection source',
      type: 'architecture',
      project: 'stable-reflection-portable',
    });
    const sourceRun = store.runMaintenance({ scope: { project: 'stable-reflection-portable' } });
    expect(sourceRun.reflections).toHaveLength(1);
    const exported = store.exportData('stable-reflection-portable');

    const targetStore = new Store(':memory:');
    try {
      targetStore.saveObservation({
        title: 'Preexisting local row',
        content: 'This row shifts imported row ids',
        type: 'manual',
        project: 'local-project',
      });
      targetStore.importData(exported);
      const importedReflectionCount = targetStore.getDb().prepare(
        "SELECT COUNT(*) AS count FROM observations WHERE project = ? AND tool_name = 'maintenance-reflection'"
      ).get('stable-reflection-portable') as { count: number };
      expect(importedReflectionCount.count).toBe(1);

      targetStore.runMaintenance({ scope: { project: 'stable-reflection-portable' } });

      const reflectionRows = targetStore.getDb().prepare(
        "SELECT id, topic_key FROM observations WHERE project = ? AND tool_name = 'maintenance-reflection' ORDER BY id"
      ).all('stable-reflection-portable') as Array<{ id: number; topic_key: string }>;
      expect(reflectionRows).toHaveLength(1);
    } finally {
      targetStore.close();
    }
  });

  it('does not duplicate legacy null-sync reflections after import into a non-empty store', () => {
    store.startSession('legacy-null-sync-session', 'legacy-null-sync-reflection');
    const insertLegacyObservation = store.getDb().prepare(
      `INSERT INTO observations (
         session_id, type, title, content, tool_name, project, scope, topic_key,
         normalized_hash, sync_id, revision_count, duplicate_count, created_at, updated_at
       ) VALUES (?, ?, ?, ?, NULL, ?, 'project', NULL, ?, NULL, 1, 1, ?, ?)`
    );
    insertLegacyObservation.run(
      'legacy-null-sync-session',
      'architecture',
      'Legacy null-sync reflection A',
      'First stable legacy null-sync reflection source',
      'legacy-null-sync-reflection',
      null,
      '2026-03-23 10:00:00',
      '2026-03-23 10:00:00',
    );
    insertLegacyObservation.run(
      'legacy-null-sync-session',
      'architecture',
      'Legacy null-sync reflection B',
      'Second stable legacy null-sync reflection source',
      'legacy-null-sync-reflection',
      null,
      '2026-03-23 10:01:00',
      '2026-03-23 10:01:00',
    );

    const sourceRun = store.runMaintenance({ scope: { project: 'legacy-null-sync-reflection' } });
    expect(sourceRun.reflections).toHaveLength(1);
    const exported = store.exportData('legacy-null-sync-reflection');
    expect(exported.observations.filter((observation) => observation.tool_name !== 'maintenance-reflection'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ sync_id: null }),
        expect.objectContaining({ sync_id: null }),
      ]));

    const targetStore = new Store(':memory:');
    try {
      targetStore.saveObservation({
        title: 'Preexisting local row for null-sync import',
        content: 'This row shifts imported legacy null-sync row ids',
        type: 'manual',
        project: 'local-project',
      });
      targetStore.importData(exported);
      const importedReflectionCount = targetStore.getDb().prepare(
        "SELECT COUNT(*) AS count FROM observations WHERE project = ? AND tool_name = 'maintenance-reflection'"
      ).get('legacy-null-sync-reflection') as { count: number };
      expect(importedReflectionCount.count).toBe(1);

      targetStore.runMaintenance({ scope: { project: 'legacy-null-sync-reflection' } });

      const reflectionRows = targetStore.getDb().prepare(
        "SELECT id, topic_key FROM observations WHERE project = ? AND tool_name = 'maintenance-reflection' ORDER BY id"
      ).all('legacy-null-sync-reflection') as Array<{ id: number; topic_key: string }>;
      expect(reflectionRows).toHaveLength(1);
    } finally {
      targetStore.close();
    }
  });

  it('reuses imported suffixed maintenance reflections on rerun maintenance', () => {
    const collisionProject = 'maintenance-collision-reuse-project';
    const sourceStore = new Store(':memory:');

    try {
      sourceStore.saveObservation({
        title: 'Source one',
        content: 'Source one for suffix collision',
        type: 'decision',
        project: collisionProject,
      });
      sourceStore.saveObservation({
        title: 'Source two',
        content: 'Source two for suffix collision',
        type: 'decision',
        project: collisionProject,
      });

      const plannedBase = sourceStore.evaluateMaintenance({ scope: { project: collisionProject } }).reflections[0]?.topic_key;
      expect(plannedBase).toBeDefined();

      sourceStore.saveObservation({
        title: 'Manual collision at planned base',
        content: 'Manual row that should block base topic reuse',
        type: 'manual',
        topic_key: plannedBase,
        project: collisionProject,
      });

      const sourceRun = sourceStore.runMaintenance({ scope: { project: collisionProject } });
      expect(sourceRun.reflections).toHaveLength(1);
      expect(sourceRun.reflections[0].topic_key).toBe(`${plannedBase}/2`);

      const exported = sourceStore.exportData(collisionProject);

      const targetStore = new Store(':memory:');
      try {
        targetStore.saveObservation({
          title: 'Unrelated local row',
          content: 'Shifts imported ids in the target',
          type: 'manual',
          project: 'local-project',
        });

        targetStore.importData(exported);

        const importedRows = targetStore.getDb().prepare(
          "SELECT id, topic_key FROM observations WHERE project = ? AND tool_name = 'maintenance-reflection' AND deleted_at IS NULL ORDER BY id"
        ).all(collisionProject) as Array<{ id: number; topic_key: string }>;
        expect(importedRows).toHaveLength(1);
        expect(importedRows[0].topic_key).toBe(sourceRun.reflections[0].topic_key);

        targetStore.runMaintenance({ scope: { project: collisionProject } });

        const afterRunRows = targetStore.getDb().prepare(
          "SELECT topic_key FROM observations WHERE project = ? AND tool_name = 'maintenance-reflection' AND deleted_at IS NULL ORDER BY id"
        ).all(collisionProject) as Array<{ topic_key: string }>;
        expect(afterRunRows).toHaveLength(1);
        expect(afterRunRows[0].topic_key).toBe(sourceRun.reflections[0].topic_key);
      } finally {
        targetStore.close();
      }
    } finally {
      sourceStore.close();
    }
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

  it('importData accepts legacy exports without metadata fields', () => {
    const legacyData = {
      version: 1,
      exported_at: '2026-03-23T10:00:00.000Z',
      sessions: [{
        id: 'legacy-session',
        project: 'legacy-project',
        directory: null,
        started_at: '2026-03-23 10:00:00',
        ended_at: null,
        summary: null,
      }],
      observations: [{
        id: 1,
        sync_id: '33333333-3333-4333-8333-333333333333',
        session_id: 'legacy-session',
        type: 'manual',
        title: 'Legacy observation',
        content: 'Legacy content',
        tool_name: null,
        project: 'legacy-project',
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
    } as unknown as ExportData;

    const result = store.importData(legacyData);
    const imported = store.exportData().observations[0];

    expect(result.observations_imported).toBe(1);
    expect(imported.title).toBe('Legacy observation');
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
