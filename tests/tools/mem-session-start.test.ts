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
