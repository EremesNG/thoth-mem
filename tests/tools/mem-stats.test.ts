import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('mem_stats tool (via Store)', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('returns zeros and none for an empty database', () => {
    const stats = store.getStats();

    expect(stats.total_sessions).toBe(0);
    expect(stats.total_observations).toBe(0);
    expect(stats.total_prompts).toBe(0);
    expect(stats.projects).toEqual([]);

    const text = [
      '## Thoth Memory Statistics',
      `- **Sessions:** ${stats.total_sessions}`,
      `- **Observations:** ${stats.total_observations}`,
      `- **User Prompts:** ${stats.total_prompts}`,
      `- **Projects:** ${stats.projects.join(', ') || 'none'}`,
    ].join('\n');

    expect(text).toContain('Projects:** none');
  });

  it('returns accurate counts after adding sessions, observations, and prompts', () => {
    store.startSession('s1', 'alpha');
    store.startSession('s2', 'beta');

    store.saveObservation({ title: 'Obs 1', content: 'Content 1', session_id: 's1', project: 'alpha' });
    store.saveObservation({ title: 'Obs 2', content: 'Content 2', session_id: 's2', project: 'beta' });
    store.saveObservation({ title: 'Obs 3', content: 'Content 3', session_id: 's2', project: 'beta' });

    store.savePrompt('s1', 'Prompt 1', 'alpha');
    store.savePrompt('s2', 'Prompt 2', 'beta');

    const stats = store.getStats();

    expect(stats.total_sessions).toBe(2);
    expect(stats.total_observations).toBe(3);
    expect(stats.total_prompts).toBe(2);
  });

  it('returns all distinct project names', () => {
    store.startSession('s1', 'alpha');
    store.startSession('s2', 'beta');
    store.saveObservation({ title: 'Obs 1', content: 'Content 1', session_id: 's1', project: 'alpha' });
    store.saveObservation({ title: 'Obs 2', content: 'Content 2', session_id: 's2', project: 'beta' });
    store.savePrompt('s1', 'Prompt 1', 'alpha');
    store.savePrompt('s2', 'Prompt 2', 'beta');

    const stats = store.getStats();

    expect(stats.projects).toEqual(['alpha', 'beta']);
  });
});
