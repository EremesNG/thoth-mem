import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { computeHash, checkDuplicate, incrementDuplicate } from '../../src/utils/dedup.js';
import { PRAGMAS, SCHEMA_SQL } from '../../src/store/schema.js';

describe('computeHash', () => {
  it('returns the same hash for the same content', () => {
    expect(computeHash('hello world')).toBe(computeHash('hello world'));
  });

  it('returns different hashes for different content', () => {
    expect(computeHash('hello world')).not.toBe(computeHash('goodbye world'));
  });

  it('normalizes formatting-only differences', () => {
    expect(computeHash('Hello   World\n')).toBe(computeHash(' hello world '));
  });

  it('is deterministic', () => {
    const hash = computeHash('deterministic content');
    expect(hash).toBe(computeHash('deterministic content'));
  });
});

describe('checkDuplicate', () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    for (const p of PRAGMAS) db.exec(p);
    db.exec(SCHEMA_SQL);
    db.prepare("INSERT INTO sessions (id, project) VALUES ('test-session', 'test-project')").run();
  });

  afterEach(() => db.close());

  it('returns not duplicate when no observations exist', () => {
    const result = checkDuplicate(db, 'hash', 'test-project', 'project', 'bugfix', 'Title', 15);
    expect(result).toEqual({ isDuplicate: false });
  });

  it('returns duplicate for matching observation within window', () => {
    const hash = 'hash';
    db.prepare(
      "INSERT INTO observations (session_id, type, title, content, project, scope, normalized_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-5 minutes'))"
    ).run('test-session', 'bugfix', 'Title', 'content', 'test-project', 'project', hash);

    const result = checkDuplicate(db, hash, 'test-project', 'project', 'bugfix', 'Title', 15);
    expect(result.isDuplicate).toBe(true);
    expect(result.existingId).toBeTypeOf('number');
  });

  it('does not match observation outside window', () => {
    const hash = 'hash';
    db.prepare(
      "INSERT INTO observations (session_id, type, title, content, project, scope, normalized_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-30 minutes'))"
    ).run('test-session', 'bugfix', 'Title', 'content', 'test-project', 'project', hash);

    const result = checkDuplicate(db, hash, 'test-project', 'project', 'bugfix', 'Title', 15);
    expect(result).toEqual({ isDuplicate: false });
  });

  it('does not match different project', () => {
    const hash = 'hash';
    db.prepare(
      "INSERT INTO observations (session_id, type, title, content, project, scope, normalized_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-5 minutes'))"
    ).run('test-session', 'bugfix', 'Title', 'content', 'other-project', 'project', hash);

    const result = checkDuplicate(db, hash, 'test-project', 'project', 'bugfix', 'Title', 15);
    expect(result).toEqual({ isDuplicate: false });
  });

  it('does not match different scope', () => {
    const hash = 'hash';
    db.prepare(
      "INSERT INTO observations (session_id, type, title, content, project, scope, normalized_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-5 minutes'))"
    ).run('test-session', 'bugfix', 'Title', 'content', 'test-project', 'personal', hash);

    const result = checkDuplicate(db, hash, 'test-project', 'project', 'bugfix', 'Title', 15);
    expect(result).toEqual({ isDuplicate: false });
  });
});

describe('incrementDuplicate', () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    for (const p of PRAGMAS) db.exec(p);
    db.exec(SCHEMA_SQL);
    db.prepare("INSERT INTO sessions (id, project) VALUES ('test-session', 'test-project')").run();
    db.prepare(
      "INSERT INTO observations (id, session_id, type, title, content, project, scope, normalized_hash, duplicate_count, last_seen_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, 1, NULL)"
    ).run('test-session', 'bugfix', 'Title', 'content', 'test-project', 'project', 'hash');
  });

  afterEach(() => db.close());

  it('increments duplicate_count and sets last_seen_at', () => {
    incrementDuplicate(db, 1);

    const row = db.prepare('SELECT duplicate_count, last_seen_at FROM observations WHERE id = 1').get() as {
      duplicate_count: number;
      last_seen_at: string | null;
    };

    expect(row.duplicate_count).toBe(2);
    expect(row.last_seen_at).toBeTypeOf('string');
  });
});
