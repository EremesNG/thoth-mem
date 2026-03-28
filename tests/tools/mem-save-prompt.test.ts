import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/store/index.js';
import { getMemSavePromptSessionId } from '../../src/tools/mem-save-prompt.js';

describe('mem_save_prompt tool (via Store)', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('saves a prompt and returns an ID', () => {
    const prompt = store.savePrompt('session-1', 'What is Thoth?', 'project-a');

    expect(prompt.id).toBeGreaterThan(0);
    expect(prompt.content).toBe('What is Thoth?');
    expect(prompt.session_id).toBe('session-1');
  });

  it('prompt appears in recent prompts', () => {
    store.savePrompt('session-1', 'First prompt', 'project-a');
    store.savePrompt('session-2', 'Second prompt', 'project-a');

    const prompts = store.recentPrompts(10, 'project-a');

    expect(prompts).toHaveLength(2);
    expect(prompts.map((prompt) => prompt.content)).toContain('First prompt');
    expect(prompts.map((prompt) => prompt.content)).toContain('Second prompt');
  });

  it('creates a default session_id when not provided', () => {
    expect(getMemSavePromptSessionId(undefined, 'project-a')).toBe('manual-save-project-a');
    expect(getMemSavePromptSessionId(undefined, undefined)).toBe('manual-save-unknown');
  });

  it('filters prompts by project on retrieval', () => {
    store.savePrompt('session-a', 'Prompt A', 'project-a');
    store.savePrompt('session-b', 'Prompt B', 'project-b');

    const projectAPrompts = store.recentPrompts(10, 'project-a');
    const projectBPrompts = store.recentPrompts(10, 'project-b');

    expect(projectAPrompts).toHaveLength(1);
    expect(projectAPrompts[0].content).toBe('Prompt A');
    expect(projectBPrompts).toHaveLength(1);
    expect(projectBPrompts[0].content).toBe('Prompt B');
  });

  it('duplicate content within 30s is skipped', () => {
    const first = store.savePrompt('session-dedup', 'Repeated prompt', 'project-a');
    const second = store.savePrompt('session-dedup', 'Repeated prompt', 'project-a');

    expect(second.id).toBe(first.id);

    const countRow = store.getDb().prepare(
      'SELECT COUNT(*) as count FROM user_prompts WHERE session_id = ? AND content = ?'
    ).get('session-dedup', 'Repeated prompt') as { count: number };

    expect(countRow.count).toBe(1);
  });

  it('different content is always saved', () => {
    store.savePrompt('session-different', 'Prompt A', 'project-a');
    store.savePrompt('session-different', 'Prompt B', 'project-a');

    const countRow = store.getDb().prepare(
      'SELECT COUNT(*) as count FROM user_prompts WHERE session_id = ?'
    ).get('session-different') as { count: number };

    expect(countRow.count).toBe(2);
  });

  it('same content after window expires is saved', () => {
    const first = store.savePrompt('session-window', 'Windowed prompt', 'project-a');

    store.getDb().prepare(
      "UPDATE user_prompts SET created_at = datetime('now', '-60 seconds') WHERE id = ?"
    ).run(first.id);

    const second = store.savePrompt('session-window', 'Windowed prompt', 'project-a');

    expect(second.id).not.toBe(first.id);

    const countRow = store.getDb().prepare(
      'SELECT COUNT(*) as count FROM user_prompts WHERE session_id = ? AND content = ?'
    ).get('session-window', 'Windowed prompt') as { count: number };

    expect(countRow.count).toBe(2);
  });
});
