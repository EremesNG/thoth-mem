import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { Store } from '../../src/store/index.js';
import { runMigrations } from '../../src/store/migrations.js';
import { MIGRATIONS_SQL, PRAGMAS } from '../../src/store/schema.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';

describe('Store — Migration behaviors', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('auto-generates sync_id on saveObservation and savePrompt', () => {
    const observation = store.saveObservation({
      title: 'Generated sync id',
      content: 'Observation content',
      project: 'project-a',
    }).observation;
    const prompt = store.savePrompt('session-1', 'Prompt content', 'project-a');

    expect(observation.sync_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(prompt.sync_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('creates a unique sync_id for each saved observation and prompt', () => {
    const observationA = store.saveObservation({ title: 'Obs A', content: 'Content A', project: 'project-a' }).observation;
    const observationB = store.saveObservation({ title: 'Obs B', content: 'Content B', project: 'project-a' }).observation;
    const promptA = store.savePrompt('session-1', 'Prompt A', 'project-a');
    const promptB = store.savePrompt('session-1', 'Prompt B', 'project-a');

    const syncIds = [observationA.sync_id, observationB.sync_id, promptA.sync_id, promptB.sync_id];

    expect(new Set(syncIds).size).toBe(4);
  });

  it('keeps sync_id null for legacy observations inserted without migration data', () => {
    store.startSession('legacy-session', 'legacy-project');

    const result = store.getDb().prepare(
      `INSERT INTO observations (session_id, type, title, content, project, scope)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('legacy-session', 'manual', 'Legacy observation', 'Legacy content', 'legacy-project', 'project');

    const observation = store.getObservation(Number(result.lastInsertRowid));

    expect(observation).not.toBeNull();
    expect(observation?.sync_id).toBeNull();
  });

  it('applies MIGRATIONS_SQL idempotently when run multiple times', () => {
    const db = new Database(':memory:');

    try {
      for (const pragma of PRAGMAS) {
        db.exec(pragma);
      }

      db.exec(`
        CREATE TABLE observations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL
        );
        CREATE TABLE user_prompts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          content TEXT NOT NULL
        );
      `);

      expect(() => {
        for (let pass = 0; pass < 2; pass++) {
          for (const sql of MIGRATIONS_SQL) {
            try {
              db.exec(sql);
            } catch {
              // Mirrors Store.runMigrations() behavior.
            }
          }
        }
      }).not.toThrow();

      const observationColumns = db.prepare('PRAGMA table_info(observations)').all() as Array<{ name: string }>;
      const promptColumns = db.prepare('PRAGMA table_info(user_prompts)').all() as Array<{ name: string }>;

      expect(observationColumns.map((column) => column.name)).toContain('sync_id');
      expect(promptColumns.map((column) => column.name)).toContain('sync_id');
    } finally {
      db.close();
    }
  });

  it('runMigrations is idempotent when re-run on same database', () => {
    const db = store.getDb();

    expect(() => {
      runMigrations(db);
      runMigrations(db);
    }).not.toThrow();
  });

  it('rebuilds observations FTS when topic_key column is missing', () => {
    const db = store.getDb();
    const saved = store.saveObservation({
      title: 'FTS migration target',
      content: 'Should be findable via rebuilt topic key index',
      type: 'architecture',
      topic_key: 'migration_topic_key_match',
      project: 'migration-project',
    }).observation;

    db.exec('DROP TRIGGER IF EXISTS obs_fts_insert');
    db.exec('DROP TRIGGER IF EXISTS obs_fts_delete');
    db.exec('DROP TRIGGER IF EXISTS obs_fts_update');
    db.exec('DROP TABLE IF EXISTS observations_fts');

    db.exec(`
      CREATE VIRTUAL TABLE observations_fts USING fts5(
        title, content, tool_name, type, project,
        content='observations',
        content_rowid='id'
      );

      CREATE TRIGGER obs_fts_insert AFTER INSERT ON observations BEGIN
        INSERT INTO observations_fts(rowid, title, content, tool_name, type, project)
        VALUES (new.id, new.title, new.content, new.tool_name, new.type, new.project);
      END;

      CREATE TRIGGER obs_fts_delete AFTER DELETE ON observations BEGIN
        INSERT INTO observations_fts(observations_fts, rowid, title, content, tool_name, type, project)
        VALUES ('delete', old.id, old.title, old.content, old.tool_name, old.type, old.project);
      END;

      CREATE TRIGGER obs_fts_update AFTER UPDATE ON observations BEGIN
        INSERT INTO observations_fts(observations_fts, rowid, title, content, tool_name, type, project)
        VALUES ('delete', old.id, old.title, old.content, old.tool_name, old.type, old.project);
        INSERT INTO observations_fts(rowid, title, content, tool_name, type, project)
        VALUES (new.id, new.title, new.content, new.tool_name, new.type, new.project);
      END;

      INSERT INTO observations_fts(observations_fts) VALUES ('rebuild');
    `);

    const preColumns = db.prepare('PRAGMA table_info(observations_fts)').all() as Array<{ name: string }>;
    expect(preColumns.map((column) => column.name)).not.toContain('topic_key');

    runMigrations(db);

    const postColumns = db.prepare('PRAGMA table_info(observations_fts)').all() as Array<{ name: string }>;
    expect(postColumns.map((column) => column.name)).toContain('topic_key');

    const results = store.searchObservations({ query: 'migration_topic_key_match' });
    expect(results.some((result) => result.id === saved.id)).toBe(true);
  });

  it('enriches empty session project and null directory on ON CONFLICT', () => {
    store.startSession('session-1', '');

    store.ensureSession('session-1', 'real-project', '/workspace/real-project');

    const session = store.getSession('session-1');

    expect(session?.project).toBe('real-project');
    expect(session?.directory).toBe('/workspace/real-project');
  });

  it('does not overwrite existing valid session project and directory on ON CONFLICT', () => {
    store.startSession('session-1', 'kept-project', '/workspace/kept-project');

    store.ensureSession('session-1', 'new-project', '/workspace/new-project');

    const session = store.getSession('session-1');

    expect(session?.project).toBe('kept-project');
    expect(session?.directory).toBe('/workspace/kept-project');
  });

  it('fresh DB startup creates all required tables and FTS columns', () => {
    const db = store.getDb();

    // Verify all core tables exist
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as Array<{ name: string }>;
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('observations');
    expect(tableNames).toContain('observations_fts');
    expect(tableNames).toContain('sync_chunks');
    expect(tableNames).toContain('sync_mutations');

    // Verify FTS includes topic_key column
    const ftsColumns = db.prepare('PRAGMA table_info(observations_fts)').all() as Array<{ name: string }>;
    const ftsColumnNames = ftsColumns.map(c => c.name);
    expect(ftsColumnNames).toContain('topic_key');

    // Verify sync tables have expected structure
    const syncChunksColumns = db.prepare('PRAGMA table_info(sync_chunks)').all() as Array<{ name: string }>;
    const syncChunksColumnNames = syncChunksColumns.map(c => c.name);
    expect(syncChunksColumnNames).toContain('chunk_id');
    expect(syncChunksColumnNames).toContain('status');

    const syncMutationsColumns = db.prepare('PRAGMA table_info(sync_mutations)').all() as Array<{ name: string }>;
    const syncMutationsColumnNames = syncMutationsColumns.map(c => c.name);
    expect(syncMutationsColumnNames).toContain('operation');
    expect(syncMutationsColumnNames).toContain('entity_type');
  });

  it('repeated startup on same database converges without errors', () => {
    const dbPath = join(tmpdir(), `thoth-test-${randomUUID()}.db`);
    
    try {
      // First startup
      const store1 = new Store(dbPath);
      store1.saveObservation({
        title: 'First startup observation',
        content: 'Created on first startup',
        project: 'test-project',
      });
      const db1 = store1.getDb();
      const tables1 = db1.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).all() as Array<{ name: string }>;
      store1.close();

      // Second startup on same database
      const store2 = new Store(dbPath);
      const db2 = store2.getDb();
      const tables2 = db2.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).all() as Array<{ name: string }>;

      // Verify same tables exist after repeated startup
      expect(tables2.map(t => t.name)).toEqual(tables1.map(t => t.name));

      // Verify FTS still has topic_key
      const ftsColumns = db2.prepare('PRAGMA table_info(observations_fts)').all() as Array<{ name: string }>;
      expect(ftsColumns.map(c => c.name)).toContain('topic_key');

      // Verify previous data is still accessible
      const observations = store2.searchObservations({ query: 'First startup' });
      expect(observations.length).toBeGreaterThan(0);

      store2.close();
    } finally {
      try {
        unlinkSync(dbPath);
        unlinkSync(`${dbPath}-shm`);
        unlinkSync(`${dbPath}-wal`);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('FTS topic_key column is searchable after fresh startup', () => {
    const saved = store.saveObservation({
      title: 'Topic key search test',
      content: 'Verify topic_key is indexed in FTS',
      type: 'architecture',
      topic_key: 'unique_topic_key_for_search',
      project: 'test-project',
    }).observation;

    // Search by topic_key should find the observation
    const results = store.searchObservations({ query: 'unique_topic_key_for_search' });
    expect(results.some(r => r.id === saved.id)).toBe(true);
  });

  it('sync tables have required indexes after fresh startup', () => {
    const db = store.getDb();

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_sync%' ORDER BY name"
    ).all() as Array<{ name: string }>;
    const indexNames = indexes.map(i => i.name);

    expect(indexNames).toContain('idx_sync_chunks_chunk_id');
    expect(indexNames).toContain('idx_sync_mutations_entity');
    expect(indexNames).toContain('idx_sync_mutations_created_at');
  });

});
