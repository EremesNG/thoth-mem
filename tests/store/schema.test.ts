import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { PRAGMAS, SCHEMA_SQL } from '../../src/store/schema.js';

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

});
