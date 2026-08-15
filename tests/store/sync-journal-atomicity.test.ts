import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('local sync journal atomicity', () => {
  let store: Store | undefined;
  afterEach(() => store?.close());

  it('rolls a prompt primary insert back when journaling aborts', () => {
    store = new Store(':memory:');
    store.ensureSession('s', 'p');
    store.getDb().exec("CREATE TRIGGER block_prompt_journal BEFORE INSERT ON sync_mutations WHEN NEW.entity_type = 'prompt' BEGIN SELECT RAISE(ABORT, 'blocked'); END");
    expect(() => store!.savePrompt('s', 'content', 'p')).toThrow(/blocked/);
    expect((store.getDb().prepare('SELECT COUNT(*) AS count FROM user_prompts').get() as { count: number }).count).toBe(0);
  });

  it('rolls an observation insert back when its journal event aborts', () => {
    store = new Store(':memory:');
    store.getDb().exec("CREATE TRIGGER block_observation_journal BEFORE INSERT ON sync_mutations WHEN NEW.entity_type = 'observation' BEGIN SELECT RAISE(ABORT, 'blocked'); END");
    expect(() => store!.saveObservation({ title: 'atomic', content: 'atomic', project: 'p' })).toThrow(/blocked/);
    expect((store.getDb().prepare('SELECT COUNT(*) AS count FROM observations').get() as { count: number }).count).toBe(0);
  });

  it.each([
    ['endSession', (target: Store) => target.endSession('session', 'ended')],
    ['checkpointSession', (target: Store) => target.checkpointSession('session', 'checkpointed')],
  ])('rolls %s back when its session update journal event aborts', (_name, write) => {
    store = new Store(':memory:');
    store.startSession('session', 'p');
    const mutationCount = store.getMutationsSince(0).length;
    store.getDb().exec("CREATE TRIGGER block_session_update_journal BEFORE INSERT ON sync_mutations WHEN NEW.entity_type = 'session' AND NEW.operation = 'update' BEGIN SELECT RAISE(ABORT, 'session update blocked'); END");

    expect(() => write(store!)).toThrow(/session update blocked/);
    expect(store.getSession('session')).toMatchObject({ ended_at: null, summary: null });
    expect(store.getMutationsSince(0)).toHaveLength(mutationCount);
  });

  it.each([
    ['observation', (target: Store) => target.saveObservation({ session_id: 'implicit', title: 'atomic', content: 'atomic', project: 'p' })],
    ['prompt', (target: Store) => target.savePrompt('implicit', 'atomic', 'p')],
  ])('rolls an implicitly-created session back with a failed %s write', (entityType, write) => {
    store = new Store(':memory:');
    store.getDb().exec(`CREATE TRIGGER block_entity_journal BEFORE INSERT ON sync_mutations WHEN NEW.entity_type = '${entityType}' BEGIN SELECT RAISE(ABORT, 'entity blocked'); END`);

    expect(() => write(store!)).toThrow(/entity blocked/);
    expect(store.getSession('implicit')).toBeNull();
    expect(store.getExportWatermark()).toBe(0);
  });

  it('preflights project migration identities and rolls journal failure back', () => {
    store = new Store(':memory:');
    const observation = store.saveObservation({ title: 'migrate', content: 'migrate', project: 'old' }).observation;
    store.getDb().prepare('UPDATE observations SET sync_id = NULL WHERE id = ?').run(observation.id);
    expect(() => store!.migrateProject('old', 'new')).toThrow(/stable identity/);
    expect(store.getDb().prepare('SELECT project FROM observations WHERE id = ?').get(observation.id)).toEqual({ project: 'old' });
    store.getDb().prepare('UPDATE observations SET sync_id = ? WHERE id = ?').run('restored-id', observation.id);
    store.getDb().exec("CREATE TRIGGER block_migration_journal BEFORE INSERT ON sync_mutations WHEN NEW.operation = 'update' AND NEW.project = 'new' BEGIN SELECT RAISE(ABORT, 'migration blocked'); END");
    expect(() => store!.migrateProject('old', 'new')).toThrow(/migration blocked/);
    expect(store.getDb().prepare('SELECT project FROM observations WHERE id = ?').get(observation.id)).toEqual({ project: 'old' });
  });

  it.each([
    ['topic-key upsert', (target: Store, id: number) => target.saveObservation({ title: 'changed', content: 'changed', project: 'p', topic_key: 'atomic/topic' }), 'atomic/topic'],
    ['explicit update', (target: Store, id: number) => target.updateObservation({ id, title: 'changed', content: 'changed' }), undefined],
    ['duplicate refresh', (target: Store) => target.saveObservation({ title: 'original', content: 'original', project: 'p' }), undefined],
  ])('rolls observation %s state and journal changes back together', (_name, write, topicKey) => {
    store = new Store(':memory:');
    const saved = store.saveObservation({ title: 'original', content: 'original', project: 'p', ...(topicKey ? { topic_key: topicKey } : {}) }).observation;
    const mutationCount = store.getMutationsSince(0).length;
    store.getDb().exec("CREATE TRIGGER block_observation_update_journal BEFORE INSERT ON sync_mutations WHEN NEW.entity_type = 'observation' AND NEW.operation = 'update' BEGIN SELECT RAISE(ABORT, 'observation update blocked'); END");

    expect(() => write(store!, saved.id)).toThrow(/observation update blocked/);
    expect(store.getObservation(saved.id)).toMatchObject({ title: 'original', content: 'original', revision_count: 1, duplicate_count: 1 });
    expect(store.getObservationVersions(saved.id)).toHaveLength(0);
    expect(store.getMutationsSince(0)).toHaveLength(mutationCount);
  });

  it.each([false, true])('rolls an observation %s-delete back when journaling aborts', (hardDelete) => {
    store = new Store(':memory:');
    const saved = store.saveObservation({ title: 'delete', content: 'delete', project: 'p' }).observation;
    const mutationCount = store.getMutationsSince(0).length;
    store.getDb().exec("CREATE TRIGGER block_observation_delete_journal BEFORE INSERT ON sync_mutations WHEN NEW.entity_type = 'observation' AND NEW.operation = 'delete' BEGIN SELECT RAISE(ABORT, 'observation delete blocked'); END");

    expect(() => store!.deleteObservation(saved.id, hardDelete)).toThrow(/observation delete blocked/);
    expect(store.getObservation(saved.id)).not.toBeNull();
    expect(store.getMutationsSince(0)).toHaveLength(mutationCount);
  });

  it('rolls local session creation and enrichment back when journaling aborts', () => {
    store = new Store(':memory:');
    store.getDb().exec("CREATE TRIGGER block_session_create_journal BEFORE INSERT ON sync_mutations WHEN NEW.entity_type = 'session' AND NEW.operation = 'create' BEGIN SELECT RAISE(ABORT, 'session create blocked'); END");
    expect(() => store!.startSession('new-session', 'p')).toThrow(/session create blocked/);
    expect(store.getSession('new-session')).toBeNull();
    store.getDb().exec('DROP TRIGGER block_session_create_journal');
    store.startSession('existing', 'unknown');
    store.getDb().exec("CREATE TRIGGER block_session_enrichment_journal BEFORE INSERT ON sync_mutations WHEN NEW.entity_type = 'session' AND NEW.operation = 'update' BEGIN SELECT RAISE(ABORT, 'session enrichment blocked'); END");
    expect(() => store!.ensureSession('existing', 'p', '/workspace')).toThrow(/session enrichment blocked/);
    expect(store.getSession('existing')).toMatchObject({ project: 'unknown', directory: null });
  });

  it('rolls maintenance reflection creation back when its journal event aborts', () => {
    store = new Store(':memory:');
    store.saveObservation({ title: 'source a', content: 'first related memory', project: 'p', type: 'architecture' });
    store.saveObservation({ title: 'source b', content: 'second related memory', project: 'p', type: 'architecture' });
    const mutationCount = store.getMutationsSince(0).length;
    store.getDb().exec("CREATE TRIGGER block_reflection_journal BEFORE INSERT ON sync_mutations WHEN NEW.entity_type = 'observation' AND NEW.operation = 'create' BEGIN SELECT RAISE(ABORT, 'reflection blocked'); END");

    expect(() => store!.runMaintenance({ scope: { project: 'p' } })).toThrow(/reflection blocked/);
    expect(store.previewSyncJournalRepair({ project: 'p' }).samples.some((sample) => sample.sync_id.length === 0)).toBe(false);
    expect(store.getMutationsSince(0)).toHaveLength(mutationCount);
    expect((store.getDb().prepare("SELECT COUNT(*) AS count FROM observations WHERE tool_name = 'maintenance-reflection'").get() as { count: number }).count).toBe(0);
  });

  it('preflights every project-migration identity and emits state-compatible events', () => {
    store = new Store(':memory:');
    store.startSession('migration-session', 'old');
    const active = store.saveObservation({ session_id: 'migration-session', title: 'active', content: 'active', project: 'old' }).observation;
    const deleted = store.saveObservation({ session_id: 'migration-session', title: 'deleted', content: 'deleted', project: 'old' }).observation;
    const prompt = store.savePrompt('migration-session', 'prompt', 'old');
    store.deleteObservation(deleted.id);
    const before = store.getMutationsSince(0).length;

    store.migrateProject('old', 'new');

    expect(store.getMutationsSince(0).slice(before).map(({ entity_type, entity_id, operation, project }) => ({ entity_type, entity_id, operation, project }))).toEqual([
      { entity_type: 'session', entity_id: 0, operation: 'update', project: 'new' },
      { entity_type: 'observation', entity_id: active.id, operation: 'update', project: 'new' },
      { entity_type: 'observation', entity_id: deleted.id, operation: 'delete', project: 'new' },
      { entity_type: 'prompt', entity_id: prompt.id, operation: 'update', project: 'new' },
    ]);

    store.getDb().prepare('UPDATE user_prompts SET sync_id = NULL WHERE id = ?').run(prompt.id);
    expect(() => store!.migrateProject('new', 'again')).toThrow(/prompt.*stable identity/i);
    expect(store.getSession('migration-session')?.project).toBe('new');
  });

  it('does not journal inbound legacy imports, including implicit sessions', () => {
    store = new Store(':memory:');
    const before = (store.getDb().prepare('SELECT COUNT(*) AS count FROM sync_mutations').get() as { count: number }).count;
    store.importData({ version: 1, exported_at: new Date().toISOString(), sessions: [], prompts: [], observations: [{
      id: 1, session_id: 'remote', type: 'manual', title: 'remote', content: 'remote', tool_name: null,
      project: 'p', scope: 'project', topic_key: null, normalized_hash: 'h', sync_id: 'remote-id',
      revision_count: 1, duplicate_count: 1, last_seen_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null,
    }] });
    const after = (store.getDb().prepare('SELECT COUNT(*) AS count FROM sync_mutations').get() as { count: number }).count;
    expect(after).toBe(before);
  });

  it('does not journal inbound V2 creates or session enrichment', () => {
    store = new Store(':memory:');
    store.startSession('remote-session', 'unknown');
    const before = store.getMutationsSince(0).length;
    const now = new Date().toISOString();
    store.applyV2Chunk({
      version: 2, chunk_id: 'inbound-zero-growth', from_mutation_id: 1, to_mutation_id: 2, created_at: now,
      mutations: [
        { operation: 'update', entity_type: 'session', entity_id: 0, sync_id: 'remote-session', data: { project: 'remote-project', directory: '/remote' } },
        { operation: 'create', entity_type: 'prompt', entity_id: 1, sync_id: 'remote-prompt', data: { session_id: 'remote-session', project: 'remote-project', content: 'remote prompt', created_at: now } },
      ],
    });
    expect(store.getSession('remote-session')).toMatchObject({ project: 'remote-project', directory: '/remote' });
    expect(store.getMutationsSince(0)).toHaveLength(before);
  });
});
