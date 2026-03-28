import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { PRAGMAS, SCHEMA_SQL } from '../../src/store/schema.js';
import { Store } from '../../src/store/index.js';

function setupDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  for (const pragma of PRAGMAS) {
    db.exec(pragma);
  }
  db.exec(SCHEMA_SQL);
  return db;
}

describe('Database Schema', () => {
  it('executes without SQL errors', () => {
    const db = setupDb();
    expect(db).toBeDefined();
    db.close();
  });

  it('is idempotent (can run twice)', () => {
    const db = setupDb();
    db.exec(SCHEMA_SQL);
    db.close();
  });

  it('creates all expected tables', () => {
    const db = setupDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as { name: string }[];

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('observations');
    expect(tableNames).toContain('observation_versions');
    expect(tableNames).toContain('user_prompts');
    expect(tableNames).toContain('observations_fts');
    expect(tableNames).toContain('prompts_fts');
    expect(tableNames).toContain('sync_chunks');
    expect(tableNames).toContain('sync_mutations');
    db.close();
  });

  it('creates all expected triggers', () => {
    const db = setupDb();
    const triggers = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name"
    ).all() as { name: string }[];

    const triggerNames = triggers.map(t => t.name);
    expect(triggerNames).toContain('obs_fts_insert');
    expect(triggerNames).toContain('obs_fts_delete');
    expect(triggerNames).toContain('obs_fts_update');
    expect(triggerNames).toContain('prompt_fts_insert');
    expect(triggerNames).toContain('prompt_fts_delete');
    db.close();
  });

  it('creates all expected indexes', () => {
    const db = setupDb();
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
    ).all() as { name: string }[];

    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_obs_session');
    expect(indexNames).toContain('idx_obs_type');
    expect(indexNames).toContain('idx_obs_project');
    expect(indexNames).toContain('idx_obs_created');
    expect(indexNames).toContain('idx_obs_scope');
    expect(indexNames).toContain('idx_obs_topic');
    expect(indexNames).toContain('idx_obs_deleted');
    expect(indexNames).toContain('idx_obs_dedupe');
    expect(indexNames).toContain('idx_obs_versions_obs');
    expect(indexNames).toContain('idx_prompts_session');
    expect(indexNames).toContain('idx_prompts_project');
    db.close();
  });

  it('enforces observation type CHECK constraint', () => {
    const db = setupDb();
    db.prepare("INSERT INTO sessions (id, project) VALUES ('s1', 'test')").run();

    expect(() => {
      db.prepare(
        "INSERT INTO observations (session_id, type, title, content) VALUES ('s1', 'bugfix', 'test', 'content')"
      ).run();
    }).not.toThrow();

    expect(() => {
      db.prepare(
        "INSERT INTO observations (session_id, type, title, content) VALUES ('s1', 'invalid_type', 'test', 'content')"
      ).run();
    }).toThrow();

    db.close();
  });

  it('enforces observation scope CHECK constraint', () => {
    const db = setupDb();
    db.prepare("INSERT INTO sessions (id, project) VALUES ('s1', 'test')").run();

    expect(() => {
      db.prepare(
        "INSERT INTO observations (session_id, type, title, content, scope) VALUES ('s1', 'manual', 'test', 'c', 'personal')"
      ).run();
    }).not.toThrow();

    expect(() => {
      db.prepare(
        "INSERT INTO observations (session_id, type, title, content, scope) VALUES ('s1', 'manual', 'test', 'c', 'invalid')"
      ).run();
    }).toThrow();

    db.close();
  });

  it('FTS5 triggers sync on insert', () => {
    const db = setupDb();
    db.prepare("INSERT INTO sessions (id, project) VALUES ('s1', 'test')").run();
    db.prepare(
      "INSERT INTO observations (session_id, type, title, content, project) VALUES ('s1', 'bugfix', 'Fix auth bug', 'Fixed JWT validation', 'myproject')"
    ).run();

    const results = db.prepare(
      "SELECT rowid FROM observations_fts WHERE observations_fts MATCH '\"auth\"'"
    ).all();
    expect(results.length).toBe(1);

    db.close();
  });

  it('indexes topic_key in observations FTS', () => {
    const db = setupDb();
    db.prepare("INSERT INTO sessions (id, project) VALUES ('s1', 'test')").run();
    db.prepare(
      "INSERT INTO observations (session_id, type, title, content, project, topic_key) VALUES ('s1', 'architecture', 'Auth model', 'Documented auth architecture', 'myproject', 'architecture_auth_model')"
    ).run();

    const results = db.prepare(
      "SELECT rowid FROM observations_fts WHERE observations_fts MATCH 'architecture_auth_model'"
    ).all();

    expect(results).toHaveLength(1);
    db.close();
  });

  it('creates sync_chunks table', () => {
    const db = setupDb();

    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_chunks'"
    ).get() as { name: string } | undefined;

    expect(row?.name).toBe('sync_chunks');
    db.close();
  });

  it('creates sync_mutations table', () => {
    const db = setupDb();

    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_mutations'"
    ).get() as { name: string } | undefined;

    expect(row?.name).toBe('sync_mutations');
    db.close();
  });

  it('enforces sync_chunks UNIQUE and status CHECK constraints', () => {
    const db = setupDb();

    db.prepare(
      "INSERT INTO sync_chunks (chunk_id, payload_hash, status) VALUES ('chunk-1', 'hash-a', 'applied')"
    ).run();

    expect(() => {
      db.prepare(
        "INSERT INTO sync_chunks (chunk_id, payload_hash, status) VALUES ('chunk-1', 'hash-b', 'applied')"
      ).run();
    }).toThrow();

    expect(() => {
      db.prepare(
        "INSERT INTO sync_chunks (chunk_id, payload_hash, status) VALUES ('chunk-2', 'hash-c', 'unknown')"
      ).run();
    }).toThrow();

    db.close();
  });

  it('sync_chunks table has all required columns after fresh creation', () => {
    const db = setupDb();

    const columns = db.prepare('PRAGMA table_info(sync_chunks)').all() as Array<{ name: string }>;
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('chunk_id');
    expect(columnNames).toContain('payload_hash');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('from_mutation_id');
    expect(columnNames).toContain('to_mutation_id');
    expect(columnNames).toContain('chunk_version');
    expect(columnNames).toContain('created_at');

    db.close();
  });

  it('sync_mutations table has all required columns after fresh creation', () => {
    const db = setupDb();

    const columns = db.prepare('PRAGMA table_info(sync_mutations)').all() as Array<{ name: string }>;
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('operation');
    expect(columnNames).toContain('entity_type');
    expect(columnNames).toContain('entity_id');
    expect(columnNames).toContain('sync_id');
    expect(columnNames).toContain('created_at');

    db.close();
  });

  it('observations_fts includes topic_key column after fresh creation', () => {
    const db = setupDb();

    const columns = db.prepare('PRAGMA table_info(observations_fts)').all() as Array<{ name: string }>;
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain('topic_key');
    expect(columnNames).toContain('title');
    expect(columnNames).toContain('content');
    expect(columnNames).toContain('tool_name');
    expect(columnNames).toContain('type');
    expect(columnNames).toContain('project');

    db.close();
  });

  it('sync_chunks and sync_mutations indexes exist after fresh creation', () => {
    const db = setupDb();

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_sync%' ORDER BY name"
    ).all() as Array<{ name: string }>;
    const indexNames = indexes.map(i => i.name);

    expect(indexNames).toContain('idx_sync_chunks_chunk_id');
    expect(indexNames).toContain('idx_sync_mutations_entity');
    expect(indexNames).toContain('idx_sync_mutations_created_at');

    db.close();
  });

});

describe('Store sync helpers and mutation journal', () => {
  it('isChunkImported returns true for applied chunk', () => {
    const store = new Store(':memory:');

    try {
      expect(store.isChunkImported('chunk-1')).toBe(false);

      store.recordSyncChunk({
        chunk_id: 'chunk-1',
        status: 'applied',
      });

      expect(store.isChunkImported('chunk-1')).toBe(true);
    } finally {
      store.close();
    }
  });

  it('recordSyncChunk is idempotent for repeated chunk_id', () => {
    const store = new Store(':memory:');

    try {
      store.recordSyncChunk({
        chunk_id: 'chunk-1',
        status: 'applied',
        payload_hash: 'hash-a',
      });

      expect(() => {
        store.recordSyncChunk({
          chunk_id: 'chunk-1',
          status: 'failed',
          payload_hash: 'hash-b',
        });
      }).not.toThrow();

      const chunks = store.getSyncChunks();
      expect(chunks).toHaveLength(1);
      expect(chunks[0].status).toBe('failed');
      expect(chunks[0].payload_hash).toBe('hash-b');
    } finally {
      store.close();
    }
  });

  it('getExportWatermark returns latest applied v2 to_mutation_id', () => {
    const store = new Store(':memory:');

    try {
      store.recordSyncChunk({
        chunk_id: 'v1-applied',
        status: 'applied',
        to_mutation_id: 3,
        chunk_version: 1,
      });
      store.recordSyncChunk({
        chunk_id: 'v2-skipped',
        status: 'skipped',
        to_mutation_id: 8,
        chunk_version: 2,
      });
      store.recordSyncChunk({
        chunk_id: 'v2-applied-a',
        status: 'applied',
        to_mutation_id: 5,
        chunk_version: 2,
      });
      store.recordSyncChunk({
        chunk_id: 'v2-applied-b',
        status: 'applied',
        to_mutation_id: 12,
        chunk_version: 2,
      });

      expect(store.getExportWatermark()).toBe(12);
    } finally {
      store.close();
    }
  });

  it('getMutationsSince returns recorded mutations after saveObservation', () => {
    const store = new Store(':memory:');

    try {
      const saved = store.saveObservation({
        title: 'Mutation source',
        content: 'Create mutation should be present',
      });

      const mutations = store.getMutationsSince(0);

      expect(mutations.length).toBeGreaterThanOrEqual(1);
      expect(mutations.some((mutation) =>
        mutation.operation === 'create'
        && mutation.entity_type === 'observation'
        && mutation.entity_id === saved.observation.id
      )).toBe(true);
    } finally {
      store.close();
    }
  });

  it('records delete mutation when observation is deleted', () => {
    const store = new Store(':memory:');

    try {
      const saved = store.saveObservation({
        title: 'Delete target',
        content: 'Delete mutation should be recorded',
      });

      expect(store.deleteObservation(saved.observation.id)).toBe(true);

      const mutations = store.getMutationsSince(0);
      const deleteMutation = mutations.find((mutation) =>
        mutation.operation === 'delete' && mutation.entity_id === saved.observation.id
      );

      expect(deleteMutation).toBeDefined();
      expect(deleteMutation?.entity_type).toBe('observation');
    } finally {
      store.close();
    }
  });
});
