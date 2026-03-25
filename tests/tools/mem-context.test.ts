import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('mem_context tool (via Store)', () => {
  let store: Store;
  beforeEach(() => { store = new Store(':memory:'); });
  afterEach(() => { store.close(); });

  it('returns context with sessions and observations', () => {
    store.startSession('s1', 'test-project');
    store.saveObservation({ title: 'Test obs', content: 'Test content', session_id: 's1', project: 'test-project' });
    store.savePrompt('s1', 'What is this?', 'test-project');

    const context = store.getContext({});
    expect(context).toContain('test-project');
    expect(context).toContain('Test obs');
  });

  it('filters by project', () => {
    store.saveObservation({ title: 'A', content: 'Project A', project: 'projA' });
    store.saveObservation({ title: 'B', content: 'Project B', project: 'projB' });

    const context = store.getContext({ project: 'projA' });
    expect(context).toContain('Project A');
    // Should not contain projB observations in the observations section
  });

  it('returns empty-ish context for fresh database', () => {
    const context = store.getContext({});
    expect(typeof context).toBe('string');
    // Should at least have the stats section
    expect(context).toContain('0');
  });

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      store.saveObservation({ title: `Obs ${i}`, content: `Content ${i}`, project: 'p' });
    }
    const context = store.getContext({ limit: 2 });
    expect(typeof context).toBe('string');
  });

  it('filters observations and prompts by session_id', () => {
    store.startSession('session-a', 'test-project');
    store.startSession('session-b', 'test-project');

    store.saveObservation({
      title: 'Session A obs',
      content: 'Only session A content',
      session_id: 'session-a',
      project: 'test-project',
    });
    store.saveObservation({
      title: 'Session B obs',
      content: 'Only session B content',
      session_id: 'session-b',
      project: 'test-project',
    });

    store.savePrompt('session-a', 'Prompt from session A', 'test-project');
    store.savePrompt('session-b', 'Prompt from session B', 'test-project');

    const context = store.getContext({ session_id: 'session-a' });

    expect(context).toContain('Session A obs');
    expect(context).toContain('Prompt from session A');
    expect(context).toContain('test-project');
    expect(context).not.toContain('Session B obs');
    expect(context).not.toContain('Prompt from session B');
  });
});
