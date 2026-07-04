import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { Store } from '../../src/store/index.js';
import { runMigrations, runMigrationsWithSemantic } from '../../src/store/migrations.js';
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

  it('creates maintenance metadata tables idempotently during migrations', () => {
    const db = store.getDb();

    expect(() => {
      runMigrationsWithSemantic(db, {});
      runMigrationsWithSemantic(db, {});
    }).not.toThrow();

    const tableNames = (db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'maintenance_%' ORDER BY name"
    ).all() as Array<{ name: string }>).map((row) => row.name);
    const indexes = (db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_maintenance_%' ORDER BY name"
    ).all() as Array<{ name: string }>).map((row) => row.name);

    expect(tableNames).toEqual([
      'maintenance_consolidation_members',
      'maintenance_consolidations',
      'maintenance_decay',
      'maintenance_reflection_sources',
      'maintenance_reflections',
      'maintenance_runs',
    ]);
    expect(indexes).toContain('idx_maintenance_decay_state');
  });

  it('drops legacy observation_facts table and indexes idempotently in semantic migrations', () => {
    const db = store.getDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS observation_facts (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        observation_id INTEGER NOT NULL,
        subject        TEXT NOT NULL,
        relation       TEXT NOT NULL,
        object         TEXT NOT NULL,
        project        TEXT,
        topic_key      TEXT,
        type           TEXT NOT NULL,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_observation_facts_observation ON observation_facts(observation_id);
      CREATE INDEX IF NOT EXISTS idx_observation_facts_project ON observation_facts(project);
      CREATE INDEX IF NOT EXISTS idx_observation_facts_topic ON observation_facts(topic_key);
    `);

    expect(() => {
      runMigrationsWithSemantic(db, {});
      runMigrationsWithSemantic(db, {});
    }).not.toThrow();

    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'observation_facts'"
    ).get() as { name: string } | undefined;
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_observation_facts_%'"
    ).all() as Array<{ name: string }>;

    expect(table).toBeUndefined();
    expect(indexes).toEqual([]);
  });

  it('runMigrationsWithSemantic remains idempotent after the legacy graph table has already been dropped', () => {
    const db = store.getDb();

    expect(() => {
      runMigrationsWithSemantic(db, {});
      runMigrationsWithSemantic(db, {});
      runMigrationsWithSemantic(db, {
        sqliteVecReady: true,
        embeddingDimensions: 384,
        embeddingConfigHash: 'post-drop-idempotent',
      });
    }).not.toThrow();

    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'observation_facts'"
    ).get() as { name: string } | undefined;
    expect(table).toBeUndefined();
  });

  it('adds nullable kg_triples supersession columns idempotently to legacy databases', () => {
    const db = new Database(':memory:');

    try {
      for (const pragma of PRAGMAS) {
        db.exec(pragma);
      }

      db.exec(`
        CREATE TABLE observations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sync_id TEXT,
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          tool_name TEXT,
          project TEXT,
          topic_key TEXT
        );

        CREATE TABLE user_prompts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sync_id TEXT,
          session_id TEXT NOT NULL,
          content TEXT NOT NULL
        );

        CREATE TABLE kg_entities (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_key     TEXT NOT NULL UNIQUE,
          entity_type    TEXT NOT NULL,
          canonical_name TEXT NOT NULL,
          aliases_json   TEXT,
          metadata_json  TEXT,
          created_at     TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE kg_triples (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          subject_entity_id INTEGER NOT NULL,
          relation         TEXT NOT NULL,
          object_entity_id INTEGER NOT NULL,
          source_type      TEXT NOT NULL CHECK(source_type IN ('observation','prompt','session_summary','unknown')),
          source_id        INTEGER,
          source_sync_id   TEXT,
          project          TEXT,
          topic_key        TEXT,
          provenance       TEXT NOT NULL,
          confidence       REAL NOT NULL DEFAULT 0.0,
          triple_hash      TEXT NOT NULL UNIQUE,
          extractor_version TEXT,
          created_at       TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO kg_entities(entity_key, entity_type, canonical_name)
        VALUES ('entity:a', 'system', 'a'), ('entity:b', 'system', 'b');
        INSERT INTO kg_triples(
          subject_entity_id, relation, object_entity_id, source_type, source_id,
          provenance, confidence, triple_hash
        )
        VALUES (1, 'USES', 2, 'observation', 42, 'legacy', 0.9, 'legacy-hash');
      `);

      expect(db.prepare('PRAGMA table_info(kg_triples)').all()).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'superseded_by_triple_id' }),
          expect.objectContaining({ name: 'superseded_at' }),
        ])
      );

      runMigrationsWithSemantic(db, {});
      runMigrationsWithSemantic(db, {});

      const columns = db.prepare('PRAGMA table_info(kg_triples)').all() as Array<{
        name: string;
        notnull: number;
        type: string;
      }>;
      const byName = new Map(columns.map((column) => [column.name, column]));
      const row = db.prepare(
        'SELECT superseded_by_triple_id, superseded_at FROM kg_triples WHERE triple_hash = ?'
      ).get('legacy-hash') as { superseded_by_triple_id: number | null; superseded_at: string | null };
      const index = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_kg_triples_superseded'"
      ).get() as { name?: string } | undefined;
      const pruneIndex = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_kg_triples_slot_superseded'"
      ).get() as { name?: string } | undefined;

      expect(byName.get('superseded_by_triple_id')).toMatchObject({ type: 'INTEGER', notnull: 0 });
      expect(byName.get('superseded_at')).toMatchObject({ type: 'TEXT', notnull: 0 });
      expect(row).toEqual({ superseded_by_triple_id: null, superseded_at: null });
      expect(index?.name).toBe('idx_kg_triples_superseded');
      expect(pruneIndex?.name).toBe('idx_kg_triples_slot_superseded');
    } finally {
      db.close();
    }
  });

  it('legacy graphFactsSource can rebuild a recreated legacy table for rollback fixtures', () => {
    const legacyStore = new Store(':memory:', { graphFactsSource: 'legacy' });

    try {
      const db = legacyStore.getDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS observation_facts (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          observation_id INTEGER NOT NULL,
          subject        TEXT NOT NULL,
          relation       TEXT NOT NULL,
          object         TEXT NOT NULL,
          project        TEXT,
          topic_key      TEXT,
          type           TEXT NOT NULL,
          created_at     TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_observation_facts_observation ON observation_facts(observation_id);
        CREATE INDEX IF NOT EXISTS idx_observation_facts_project ON observation_facts(project);
        CREATE INDEX IF NOT EXISTS idx_observation_facts_topic ON observation_facts(topic_key);
      `);
      const saved = legacyStore.saveObservation({
        title: 'Rollback graph fixture',
        type: 'decision',
        project: 'rollback-project',
        topic_key: 'rollback/graph',
        content: '**What**: Recreated legacy table remains readable',
      }).observation;
      db.prepare('DELETE FROM observation_facts WHERE observation_id = ?').run(saved.id);

      const result = legacyStore.rebuildObservationFacts({ project: 'rollback-project' });

      expect(result).toMatchObject({
        project: 'rollback-project',
        observations_scanned: 1,
        facts_deleted: 0,
        facts_created: 4,
      });
      expect(legacyStore.getObservationFacts({ observation_id: saved.id }).map((fact) => fact.relation)).toEqual([
        'HAS_TYPE',
        'IN_PROJECT',
        'HAS_TOPIC_KEY',
        'HAS_WHAT',
      ]);
    } finally {
      legacyStore.close();
    }
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

  it('queues semantic rebuild when upgrading a database with pre-existing observations', () => {
    const dbPath = join(tmpdir(), `thoth-legacy-semantic-${randomUUID()}.db`);
    const legacyDb = new Database(dbPath);

    try {
      for (const pragma of PRAGMAS) {
        legacyDb.exec(pragma);
      }

      legacyDb.exec(`
        CREATE TABLE sessions (
          id         TEXT PRIMARY KEY,
          project    TEXT NOT NULL,
          directory  TEXT,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          ended_at   TEXT,
          summary    TEXT
        );

        CREATE TABLE observations (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          sync_id         TEXT,
          session_id      TEXT NOT NULL,
          type            TEXT NOT NULL,
          title           TEXT NOT NULL,
          content         TEXT NOT NULL,
          tool_name       TEXT,
          project         TEXT,
          scope           TEXT NOT NULL DEFAULT 'project',
          topic_key       TEXT,
          normalized_hash TEXT,
          revision_count  INTEGER NOT NULL DEFAULT 1,
          duplicate_count INTEGER NOT NULL DEFAULT 1,
          last_seen_at    TEXT,
          created_at      TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
          deleted_at      TEXT
        );

        INSERT INTO sessions(id, project) VALUES ('legacy-session', 'legacy-project');
        INSERT INTO observations(session_id, type, title, content, project, scope)
        VALUES ('legacy-session', 'manual', 'Legacy observation', 'Legacy content for semantic rebuild', 'legacy-project', 'project');
      `);
      legacyDb.close();

      const upgradedStore = new Store(dbPath, {
        embedding: {
          provider: 'transformers_local',
          model: 'mock-embedding',
          baseUrl: null,
          dimensions: 384,
          configHash: 'legacy-upgrade-hash',
        },
      });

      try {
        const rebuildJob = upgradedStore.getDb().prepare(
          "SELECT state FROM semantic_jobs WHERE kind = 'rebuild_semantic' LIMIT 1"
        ).get() as { state: string } | undefined;
        const progress = upgradedStore.getSemanticIndexProgress({ project: 'legacy-project' });

        expect(rebuildJob?.state).toBe('pending');
        expect(progress.coverage.observations).toBe(1);
        expect(progress.coverage.chunks).toBe(0);
      } finally {
        upgradedStore.close();
      }
    } finally {
      if (legacyDb.open) {
        legacyDb.close();
      }
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

  it('upgrades legacy kg_triples schema without supersession columns on startup', () => {
    const dbPath = join(tmpdir(), `thoth-legacy-kg-${randomUUID()}.db`);
    const legacyDb = new Database(dbPath);

    try {
      for (const pragma of PRAGMAS) {
        legacyDb.exec(pragma);
      }

      legacyDb.exec(`
        CREATE TABLE kg_taxonomy_metadata (
          id                INTEGER PRIMARY KEY CHECK (id = 1),
          taxonomy_version  TEXT NOT NULL,
          entity_types_json TEXT NOT NULL,
          relation_types_json TEXT NOT NULL,
          updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE kg_entities (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_key     TEXT NOT NULL UNIQUE,
          entity_type    TEXT NOT NULL,
          canonical_name TEXT NOT NULL,
          aliases_json   TEXT,
          metadata_json  TEXT,
          created_at     TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE kg_triples (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          subject_entity_id INTEGER NOT NULL,
          relation         TEXT NOT NULL,
          object_entity_id INTEGER NOT NULL,
          source_type      TEXT NOT NULL CHECK(source_type IN ('observation','prompt','session_summary','unknown')),
          source_id        INTEGER,
          source_sync_id   TEXT,
          project          TEXT,
          topic_key        TEXT,
          provenance       TEXT NOT NULL,
          confidence       REAL NOT NULL DEFAULT 0.0,
          triple_hash      TEXT NOT NULL UNIQUE,
          extractor_version TEXT,
          created_at       TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (subject_entity_id) REFERENCES kg_entities(id) ON DELETE CASCADE,
          FOREIGN KEY (object_entity_id) REFERENCES kg_entities(id) ON DELETE CASCADE
        );
      `);

      legacyDb.close();

      const upgradedStore = new Store(dbPath);
      const db = upgradedStore.getDb();

      const kgColumns = db.prepare('PRAGMA table_info(kg_triples)').all() as Array<{ name: string; type: string }>;
      const columnNames = kgColumns.map((column) => column.name);
      const supersededByColumn = kgColumns.find((column) => column.name === 'superseded_by_triple_id');

      expect(columnNames).toContain('superseded_by_triple_id');
      expect(columnNames).toContain('superseded_at');
      expect(supersededByColumn?.type).toBe('INTEGER');

      const kgTriplesSchema = db.prepare(
        'SELECT sql FROM sqlite_master WHERE type=\'table\' AND name=\'kg_triples\''
      ).get() as { sql: string };

      expect(kgTriplesSchema.sql).not.toContain('"superseded_by_triple_id" INTEGER REFERENCES');

      const kgIndexes = db.prepare(
        'SELECT name, sql FROM sqlite_master WHERE type=\'index\' AND tbl_name=\'kg_triples\' ORDER BY name'
      ).all() as Array<{ name: string; sql: string | null }>;
      const indexNames = kgIndexes.map((index) => index.name);
      const slotIndex = kgIndexes.find((index) => index.name === 'idx_kg_triples_slot_superseded');

      expect(indexNames).toContain('idx_kg_triples_superseded');
      expect(indexNames).toContain('idx_kg_triples_slot_superseded');
      expect(slotIndex?.sql).toContain('(source_id, subject_entity_id, relation, superseded_at)');

      upgradedStore.close();
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

  describe('sqlite-vec migration/readiness (hybrid retrieval baseline)', () => {
    it('sqlite-vec: creates vec0 tables for chunk and sentence embeddings', () => {
      const db = store.getDb();
      const vecTables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('vec_chunks', 'vec_sentences') ORDER BY name"
      ).all() as Array<{ name: string }>;

      expect(vecTables.map((table) => table.name)).toEqual(['vec_chunks', 'vec_sentences']);
    });

    it('sqlite-vec: tracks semantic lane readiness metadata', () => {
      const db = store.getDb();
      const semanticState = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'semantic_index_state'"
      ).get() as { name?: string } | undefined;

      expect(semanticState?.name).toBe('semantic_index_state');
    });

    it('sqlite-vec: migration remains idempotent with vec schema present', () => {
      const db = store.getDb();

      expect(() => {
        runMigrations(db);
        runMigrations(db);
      }).not.toThrow();
    });

    it('sqlite-vec: marks semantic state stale on embedding dimension mismatch', () => {
      const db = store.getDb();
      const staleCount = db.prepare(
        "SELECT COUNT(*) AS c FROM semantic_index_state WHERE stale = 1"
      ).get() as { c: number };

      expect(staleCount.c).toBeGreaterThan(0);
    });

    it('sqlite-vec: recreates vector tables when embedding dimensions change', () => {
      const db = store.getDb();

      runMigrationsWithSemantic(db, {
        sqliteVecReady: true,
        embeddingDimensions: 384,
        embeddingConfigHash: 'dim-384',
      });
      runMigrationsWithSemantic(db, {
        sqliteVecReady: true,
        embeddingDimensions: 768,
        embeddingConfigHash: 'dim-768',
      });

      const vecTables = db.prepare(
        "SELECT name, sql FROM sqlite_master WHERE name IN ('vec_chunks', 'vec_sentences') ORDER BY name"
      ).all() as Array<{ name: string; sql: string }>;
      const staleCount = db.prepare(
        "SELECT COUNT(*) AS c FROM semantic_index_state WHERE stale = 1 AND pending = 1"
      ).get() as { c: number };

      expect(vecTables).toHaveLength(2);
      expect(vecTables.every((table) => table.sql.includes('float[768]'))).toBe(true);
      expect(staleCount.c).toBe(2);
    });
  });
});
