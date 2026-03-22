import { describe, it, expect, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Store', () => {
  let store: Store;

  afterEach(() => {
    if (store) {
      try { store.close(); } catch { /* already closed */ }
    }
  });

  it('opens an in-memory database', () => {
    store = new Store(':memory:');
    expect(store).toBeDefined();
  });

  it('creates all tables on initialization', () => {
    store = new Store(':memory:');
    const db = store.getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('observations');
    expect(tableNames).toContain('observation_versions');
    expect(tableNames).toContain('user_prompts');
  });

  it('can close and reopen', () => {
    store = new Store(':memory:');
    store.close();
    store = new Store(':memory:');
    expect(store).toBeDefined();
  });

  it('handles file-based database (idempotent schema)', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'thoth-store-'));
    const dbPath = join(tmpDir, 'test.db');

    const store1 = new Store(dbPath);
    store1.close();

    const store2 = new Store(dbPath);
    const db = store2.getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all() as { name: string }[];
    expect(tables.length).toBeGreaterThanOrEqual(4);
    store2.close();

    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('ensureSession', () => {
    it('creates a new session', () => {
      store = new Store(':memory:');
      store.ensureSession('session-1', 'myproject', '/path/to/project');

      const db = store.getDb();
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get('session-1') as any;
      expect(session).toBeDefined();
      expect(session.project).toBe('myproject');
      expect(session.directory).toBe('/path/to/project');
    });

    it('is idempotent (second call does nothing)', () => {
      store = new Store(':memory:');
      store.ensureSession('session-1', 'myproject');
      store.ensureSession('session-1', 'myproject');

      const db = store.getDb();
      const count = db.prepare('SELECT COUNT(*) as c FROM sessions WHERE id = ?').get('session-1') as any;
      expect(count.c).toBe(1);
    });

    it('handles null directory', () => {
      store = new Store(':memory:');
      store.ensureSession('session-1', 'myproject');

      const db = store.getDb();
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get('session-1') as any;
      expect(session.directory).toBeNull();
    });
  });

  it('merges partial config', () => {
    store = new Store(':memory:', { maxContentLength: 50_000, previewLength: 500 });
    expect(store.config.maxContentLength).toBe(50_000);
    expect(store.config.previewLength).toBe(500);
    expect(store.config.maxSearchResults).toBe(20);
  });
});
