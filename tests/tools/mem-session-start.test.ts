import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('mem_session_start tool (via Store)', () => {
  let store: Store;
  beforeEach(() => { store = new Store(':memory:'); });
  afterEach(() => { store.close(); });

  it('creates a new session', () => {
    const session = store.startSession('test-1', 'my-project', '/path/to/project');
    expect(session.id).toBe('test-1');
    expect(session.project).toBe('my-project');
    expect(session.directory).toBe('/path/to/project');
  });

  it('is idempotent on repeat call', () => {
    store.startSession('test-1', 'my-project');
    const session = store.startSession('test-1', 'my-project');
    expect(session.id).toBe('test-1');
    // Should not throw
  });

  it('session_start is idempotent', () => {
    store.startSession('same-id', 'project-a', '/dir/a');
    store.startSession('same-id', 'project-a', '/dir/a');

    const sessions = store.allSessions().filter((session) => session.id === 'same-id');
    expect(sessions).toHaveLength(1);
  });

  it('second call preserves original values', () => {
    store.startSession('keep-values', 'foo', '/dir/foo');
    const session = store.startSession('keep-values', 'bar', '/dir/bar');

    expect(session.project).toBe('foo');
    expect(session.directory).toBe('/dir/foo');
  });

  it('second call fills empty values', () => {
    store.startSession('fill-empty', '', '');
    const session = store.startSession('fill-empty', 'bar', '/dir/bar');

    expect(session.project).toBe('bar');
    expect(session.directory).toBe('/dir/bar');
  });

  it('works without directory', () => {
    const session = store.startSession('test-2', 'my-project');
    expect(session.id).toBe('test-2');
    expect(session.directory).toBeNull();
  });

  it('session is retrievable after start', () => {
    store.startSession('test-3', 'my-project');
    const session = store.getSession('test-3');
    expect(session).not.toBeNull();
    expect(session!.project).toBe('my-project');
  });
});
