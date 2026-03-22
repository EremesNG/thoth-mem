import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../../src/store/index.js';
import { registerMemTimeline } from '../../src/tools/mem-timeline.js';

describe('mem_timeline tool', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  function seedSession() {
    const sessionId = 'timeline-session';
    store.startSession(sessionId, 'timeline-project');

    const observations = [
      store.saveObservation({ title: 'One', content: 'First', type: 'decision', session_id: sessionId, project: 'timeline-project' }).observation,
      store.saveObservation({ title: 'Two', content: 'Second', type: 'bugfix', session_id: sessionId, project: 'timeline-project' }).observation,
      store.saveObservation({ title: 'Three', content: 'Third', type: 'pattern', session_id: sessionId, project: 'timeline-project' }).observation,
      store.saveObservation({ title: 'Four', content: 'Fourth', type: 'config', session_id: sessionId, project: 'timeline-project' }).observation,
      store.saveObservation({ title: 'Five', content: 'Fifth', type: 'discovery', session_id: sessionId, project: 'timeline-project' }).observation,
    ];

    return { sessionId, observations };
  }

  function registerTool() {
    const toolSpy = vi.fn();
    const server = { tool: toolSpy } as any;

    registerMemTimeline(server, store);

    expect(toolSpy).toHaveBeenCalledTimes(1);

    return toolSpy.mock.calls[0];
  }

  it('shows correct before/after neighborhood', async () => {
    const [, , , handler] = registerTool();
    const { observations } = seedSession();

    const result = await handler({ observation_id: observations[2].id, before: 2, after: 2 });
    const text = result.content[0].text;

    expect(text).toContain('## Timeline around observation');
    expect(text).toContain('### Before');
    expect(text).toContain('### [decision] One (ID:');
    expect(text).toContain('### [bugfix] Two (ID:');
    expect(text).toContain('### After');
    expect(text).toContain('### [config] Four (ID:');
    expect(text).toContain('### [discovery] Five (ID:');
  });

  it('formats the focus observation correctly', async () => {
    const [, , , handler] = registerTool();
    const { observations } = seedSession();

    const result = await handler({ observation_id: observations[2].id });
    const text = result.content[0].text;

    expect(text).toContain(`### ► Focus: [pattern] Three (ID: ${observations[2].id})`);
    expect(text).toContain('**Project:** timeline-project | **Scope:** project | **Created:**');
    expect(text).toContain('**Revisions:** 1 | **Duplicates:** 1');
    expect(text).toContain('Third');
  });

  it('returns an error for a missing observation', async () => {
    const [, , , handler] = registerTool();

    const result = await handler({ observation_id: 999 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Observation 999 not found');
  });

  it('shows empty before for the first observation', async () => {
    const [, , , handler] = registerTool();
    const { observations } = seedSession();

    const result = await handler({ observation_id: observations[0].id });
    const text = result.content[0].text;

    expect(text).toContain('No earlier observations in this session');
    expect(text).toContain('### [bugfix] Two (ID:');
  });

  it('shows empty after for the last observation', async () => {
    const [, , , handler] = registerTool();
    const { observations } = seedSession();

    const result = await handler({ observation_id: observations[4].id });
    const text = result.content[0].text;

    expect(text).toContain('No later observations in this session');
    expect(text).toContain('### [config] Four (ID:');
  });
});
