import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../../src/store/index.js';

describe('mem_get_observation tool (via Store)', () => {
  let store: Store;
  beforeEach(() => { store = new Store(':memory:'); });
  afterEach(() => { store.close(); });

  it('returns full observation for small content', () => {
    const { observation } = store.saveObservation({ title: 'Test', content: 'Short content' });
    const result = store.getObservation(observation.id);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Short content');
    expect(result!.title).toBe('Test');
  });

  it('returns null for non-existent ID', () => {
    expect(store.getObservation(999)).toBeNull();
  });

  it('returns null for soft-deleted observation', () => {
    const { observation } = store.saveObservation({ title: 'Test', content: 'Content' });
    store.deleteObservation(observation.id, false);
    expect(store.getObservation(observation.id)).toBeNull();
  });

  it('handles large content for pagination logic', () => {
    const largeContent = 'x'.repeat(60000);
    const { observation } = store.saveObservation({ title: 'Large', content: largeContent });
    const result = store.getObservation(observation.id);
    expect(result!.content.length).toBe(60000);
  });

  it('returns all observation fields', () => {
    const { observation } = store.saveObservation({
      title: 'Full fields',
      content: 'Content here',
      type: 'decision',
      project: 'my-project',
      scope: 'personal',
      topic_key: 'decision/test',
    });
    const result = store.getObservation(observation.id);
    expect(result!.type).toBe('decision');
    expect(result!.project).toBe('my-project');
    expect(result!.scope).toBe('personal');
    expect(result!.topic_key).toBe('decision/test');
    expect(result!.revision_count).toBe(1);
    expect(result!.duplicate_count).toBe(1);
  });
});
