import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('mem_session_summary tool (via Store)', () => {
  let store: Store;
  beforeEach(() => { store = new Store(':memory:'); });
  afterEach(() => { store.close(); });

  const sampleSummary = `## Goal
Working on auth system

## Discoveries
- JWT tokens need refresh rotation

## Accomplished
- ✅ Added JWT middleware

## Relevant Files
- src/auth/middleware.ts — JWT validation`;

  it('saves summary observation AND closes session', () => {
    store.startSession('s1', 'test-project');

    const result = store.saveObservation({
      title: 'Session summary: test-project',
      content: sampleSummary,
      type: 'session_summary',
      session_id: 's1',
      project: 'test-project',
      scope: 'project',
    });
    store.endSession('s1', 'Working on auth system');

    expect(result.observation.type).toBe('session_summary');
    expect(result.observation.content).toContain('JWT');

    const session = store.getSession('s1');
    expect(session!.ended_at).not.toBeNull();
    expect(session!.summary).toBe('Working on auth system');
  });

  it('uses default session_id from project name', () => {
    const result = store.saveObservation({
      title: 'Session summary: my-project',
      content: sampleSummary,
      type: 'session_summary',
      project: 'my-project',
    });
    expect(result.observation.session_id).toBe('manual-save-my-project');
  });

  it('summary observation is searchable', () => {
    store.saveObservation({
      title: 'Session summary: test-project',
      content: sampleSummary,
      type: 'session_summary',
      project: 'test-project',
    });

    const results = store.searchObservations({ query: 'JWT middleware', type: 'session_summary' });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('summary shows up in context', () => {
    store.saveObservation({
      title: 'Session summary: test-project',
      content: sampleSummary,
      type: 'session_summary',
      project: 'test-project',
    });

    const context = store.getContext({ project: 'test-project' });
    expect(context).toContain('Session summary');
  });
});
