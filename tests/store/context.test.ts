import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('Store — Context, Timeline, Prompts', () => {
  let store: Store;
  beforeEach(() => { store = new Store(':memory:'); });
  afterEach(() => { store.close(); });

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
