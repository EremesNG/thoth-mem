import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('Store — Session Operations', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('startSession creates a new session', () => {
    const session = store.startSession('session-1', 'project-a');

    expect(session.id).toBe('session-1');
    expect(session.project).toBe('project-a');
    expect(session.directory).toBeNull();
  });

  it('startSession is idempotent', () => {
    const first = store.startSession('session-1', 'project-a');
    const second = store.startSession('session-1', 'project-a');

    expect(second).toEqual(first);
  });

  it('startSession with directory', () => {
    const session = store.startSession('session-1', 'project-a', '/tmp/project-a');

    expect(session.directory).toBe('/tmp/project-a');
  });

  it('endSession sets ended_at and summary', () => {
    store.startSession('session-1', 'project-a');

    const ended = store.endSession('session-1', 'done');

    expect(ended).not.toBeNull();
    expect(ended?.ended_at).not.toBeNull();
    expect(ended?.summary).toBe('done');
  });

  it('endSession returns null for unknown session', () => {
    expect(store.endSession('missing')).toBeNull();
  });

  it('endSession returns null for already-ended session', () => {
    store.startSession('session-1', 'project-a');
    expect(store.endSession('session-1', 'done')).not.toBeNull();

    expect(store.endSession('session-1', 'again')).toBeNull();
  });

  it('getSession returns session by id', () => {
    store.startSession('session-1', 'project-a');

    const session = store.getSession('session-1');

    expect(session?.id).toBe('session-1');
  });

  it('getSession returns null for unknown id', () => {
    expect(store.getSession('missing')).toBeNull();
  });

  it('recentSessions returns only sessions with observations', () => {
    store.startSession('s1', 'project-a');
    store.startSession('s2', 'project-b');

    store.getDb().prepare(
      `INSERT INTO observations (session_id, type, title, content, scope) VALUES (?, ?, ?, ?, ?)`
    ).run('s1', 'manual', 'test', 'test content', 'project');

    const recent = store.recentSessions();

    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe('s1');
  });

  it('allSessions returns all sessions ordered by started_at DESC', () => {
    store.startSession('s1', 'project-a');
    store.endSession('s1');
    store.startSession('s2', 'project-b');
    store.getDb().prepare(`UPDATE sessions SET started_at = ? WHERE id = ?`).run('2020-01-01 00:00:00', 's1');

    const sessions = store.allSessions();

    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe('s2');
    expect(sessions[1].id).toBe('s1');
  });
});
