import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('Store — Context, Timeline, Prompts', () => {
  let store: Store;
  beforeEach(() => { store = new Store(':memory:'); });
  afterEach(() => { store.close(); });

  function saveLargeContext(project = 'caps-project'): string {
    const fullMarker = 'FULL-CONTENT-MARKER-DO-NOT-INLINE';
    for (let i = 0; i < 30; i++) {
      store.saveObservation({
        title: `Large item ${i}`,
        content: `${'large context body '.repeat(220)}${fullMarker}-${i}`,
        project,
      });
    }
    return fullMarker;
  }

  describe('getContext', () => {
    it('returns markdown with all sections', () => {
      store.saveObservation({ title: 'Test', content: 'Content', project: 'p1' });
      store.savePrompt('manual-save-p1', 'What about auth?', 'p1');
      const ctx = store.getContext({});
      expect(ctx).toContain('## Memory from Previous Sessions');
      expect(ctx).toContain('### Recent Sessions');
      expect(ctx).toContain('### Recent Prompts');
      expect(ctx).toContain('### Recent Observations');
      expect(ctx).toContain('Memory stats:');
    });

    it('filters by project', () => {
      store.saveObservation({ title: 'A', content: 'Content A', project: 'proj-a' });
      store.saveObservation({ title: 'B', content: 'Content B', project: 'proj-b' });
      const ctx = store.getContext({ project: 'proj-a' });
      expect(ctx).toContain('Content A');
      expect(ctx).not.toContain('Content B');
    });

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        store.saveObservation({ title: `Item ${i}`, content: `Content ${i}` });
      }
      const ctx = store.getContext({ limit: 2 });
      const obsMatches = ctx.match(/### \[/g);
      expect(obsMatches?.length).toBe(2);
    });

    it('bounds default context output with previews, structure, and mem_get escalation', () => {
      const fullMarker = saveLargeContext();

      const ctx = store.getContext({});

      expect(ctx.length).toBeLessThanOrEqual(8000);
      expect(ctx).toContain('## Memory from Previous Sessions');
      expect(ctx).toContain('### Recent Sessions');
      expect(ctx).toContain('### Recent Prompts');
      expect(ctx).toContain('### Recent Observations');
      expect(ctx).toContain('Memory stats:');
      expect(ctx).toContain('Showing');
      expect(ctx).toContain('omitted');
      expect(ctx).toContain('mem_get(id=');
      expect(ctx).not.toContain(fullMarker);
    });

    it('uses per-call maxOutputChars without mutating the configured default', () => {
      saveLargeContext();

      const tight = store.getContext({ maxOutputChars: 1200 });
      const defaultBound = store.getContext({});

      expect(tight.length).toBeLessThanOrEqual(1200);
      expect(defaultBound.length).toBeGreaterThan(tight.length);
      expect(defaultBound.length).toBeLessThanOrEqual(store.config.maxContextChars);
      expect(store.config.maxContextChars).toBe(8000);
    });

    it('treats maxOutputChars 0 as the unbounded full-content path', () => {
      const fullMarker = saveLargeContext();

      const ctx = store.getContext({ maxOutputChars: 0 });

      expect(ctx.length).toBeGreaterThan(8000);
      expect(ctx).toContain(fullMarker);
      expect(ctx).not.toContain('mem_get(id=');
    });

    it('keeps a visible observation fragment and pointer when the budget is very small', () => {
      store.saveObservation({
        title: 'Too large for budget',
        content: `${'single preview body '.repeat(60)}single-tail`,
        project: 'tiny-budget',
      });

      const ctx = store.getContext({ project: 'tiny-budget', maxOutputChars: 500 });

      expect(ctx.length).toBeLessThanOrEqual(500);
      expect(ctx).toContain('Too large for budget');
      expect(ctx).toContain('mem_get');
    });
  });

  describe('getTimeline', () => {
    it('returns chronological neighborhood', () => {
      const sessionId = 'timeline-session';
      store.startSession(sessionId, 'p1');
      const obs: number[] = [];
      for (let i = 0; i < 7; i++) {
        const r = store.saveObservation({ title: `Obs ${i}`, content: `Content ${i}`, session_id: sessionId, project: 'p1' });
        obs.push(r.observation.id);
      }
      const timeline = store.getTimeline({ observation_id: obs[3], before: 2, after: 2 });
      expect(timeline.focus).not.toBeNull();
      expect(timeline.focus!.title).toBe('Obs 3');
      expect(timeline.before).toHaveLength(2);
      expect(timeline.after).toHaveLength(2);
      expect(timeline.before[0].title).toBe('Obs 1');
      expect(timeline.before[1].title).toBe('Obs 2');
    });

    it('returns null focus for non-existent id', () => {
      const timeline = store.getTimeline({ observation_id: 999 });
      expect(timeline.focus).toBeNull();
    });
  });

  describe('prompts', () => {
    it('saves and retrieves prompts', () => {
      store.startSession('s1', 'p1');
      const prompt = store.savePrompt('s1', 'How to fix auth?', 'p1');
      expect(prompt.id).toBeGreaterThan(0);
      expect(prompt.content).toBe('How to fix auth?');

      const recent = store.recentPrompts(10, 'p1');
      expect(recent).toHaveLength(1);
      expect(recent[0].content).toBe('How to fix auth?');
    });

    it('filters prompts by project', () => {
      store.savePrompt('s1', 'Prompt A', 'proj-a');
      store.savePrompt('s2', 'Prompt B', 'proj-b');
      const recent = store.recentPrompts(10, 'proj-a');
      expect(recent).toHaveLength(1);
      expect(recent[0].content).toBe('Prompt A');
    });
  });
});
