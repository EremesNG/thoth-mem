import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';
import { capturePassiveLearnings } from '../../src/tools/mem-capture-passive.js';

describe('mem_capture_passive tool', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('parses English header with bulleted items', () => {
    const result = capturePassiveLearnings(store, {
      content: `## Key Learnings:
- First lesson
- Second lesson`,
      project: 'demo',
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('Extracted 2 learnings: 2 saved, 0 duplicates skipped');
  });

  it('parses Spanish header', () => {
    const result = capturePassiveLearnings(store, {
      content: `## Aprendizajes Clave
* Leccion uno
* Leccion dos`,
      project: 'demo',
    });

    expect(result.content[0].text).toBe('Extracted 2 learnings: 2 saved, 0 duplicates skipped');
  });

  it('parses numbered items', () => {
    const result = capturePassiveLearnings(store, {
      content: `## Key Learnings
1. Numbered one
2. Numbered two`,
      project: 'demo',
    });

    expect(result.content[0].text).toBe('Extracted 2 learnings: 2 saved, 0 duplicates skipped');
  });

  it('returns error when no header is found', () => {
    const result = capturePassiveLearnings(store, {
      content: 'Nothing useful here',
      project: 'demo',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No '## Key Learnings:' or '## Aprendizajes Clave:' section found in content");
  });

  it('deduplicates repeated captures', () => {
    const content = `## Key Learnings:
- Shared lesson
- Another lesson`;

    const first = capturePassiveLearnings(store, { content, project: 'demo' });
    const second = capturePassiveLearnings(store, { content, project: 'demo' });

    expect(first.content[0].text).toBe('Extracted 2 learnings: 2 saved, 0 duplicates skipped');
    expect(second.content[0].text).toBe('Extracted 2 learnings: 0 saved, 2 duplicates skipped');
  });

  it('parses mixed bullets and numbers in the same section', () => {
    const result = capturePassiveLearnings(store, {
      content: `## Key Learnings:
- Bullet one
2. Numbered two
* Bullet three`,
      project: 'demo',
    });

    expect(result.content[0].text).toBe('Extracted 3 learnings: 3 saved, 0 duplicates skipped');
  });
});
