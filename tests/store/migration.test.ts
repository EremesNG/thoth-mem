import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { Store } from '../../src/store/index.js';
import { MIGRATIONS_SQL, PRAGMAS } from '../../src/store/schema.js';

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
});
