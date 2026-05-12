import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Store } from '../../src/store/index.js';
import { registerMemSessionSummary } from '../../src/tools/mem-session-summary.js';

describe('mem_session_summary tool (via Store)', () => {
  let store: Store;
  let toolHandler: (input: any) => Promise<any>;
  let toolSchema: Record<string, z.ZodTypeAny>;

  async function invokeMemSessionSummary(input: Record<string, unknown>): Promise<any> {
    const parsed = z.object(toolSchema).safeParse(input);
    if (!parsed.success) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: parsed.error.issues.map((issue) => issue.message).join('; ') }],
      };
    }

    return toolHandler(parsed.data);
  }

  beforeEach(() => {
    store = new Store(':memory:');

    const server = {
      tool: vi.fn((name: string, _description: string, schema: Record<string, z.ZodTypeAny>, handler: (input: any) => Promise<any>) => {
        if (name === 'mem_session_summary') {
          toolSchema = schema;
          toolHandler = handler;
        }
      }),
    } as unknown as McpServer;

    registerMemSessionSummary(server, store);
  });

  afterEach(() => {
    store.close();
  });

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

  it('reuses one summary observation per session and preserves prior versions', async () => {
    store.startSession('s1', 'test-project');

    await invokeMemSessionSummary({ content: sampleSummary, project: 'test-project', session_id: 's1' });

    const updatedSummary = `## Goal
Working on auth system rollout

## Discoveries
- JWT tokens need refresh rotation and revocation support

## Accomplished
- ✅ Added JWT middleware and session checkpointing

## Relevant Files
- src/auth/middleware.ts — JWT validation`;

    await invokeMemSessionSummary({ content: updatedSummary, project: 'test-project', session_id: 's1' });

    const summaries = store.searchObservations({
      query: 'auth system',
      type: 'session_summary',
      project: 'test-project',
      session_id: 's1',
      topic_key_exact: 'session/s1/summary',
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0].topic_key).toBe('session/s1/summary');
    expect(summaries[0].revision_count).toBe(2);
    expect(summaries[0].content).toContain('session checkpointing');

    const versions = store.getObservationVersions(summaries[0].id);
    expect(versions).toHaveLength(1);
    expect(versions[0].content).toContain('Added JWT middleware');
    expect(versions[0].content).not.toContain('session checkpointing');
  });

  it('refreshes the session summary and ended_at on later checkpoints', async () => {
    store.startSession('s1', 'test-project');

    await invokeMemSessionSummary({ content: sampleSummary, project: 'test-project', session_id: 's1' });

    store.getDb().prepare("UPDATE sessions SET ended_at = ? WHERE id = ?").run('2000-01-01 00:00:00', 's1');

    const updatedSummary = `## Goal
Working on auth system rollout

## Discoveries
- JWT tokens need refresh rotation

## Accomplished
- ✅ Added JWT middleware checkpoint

## Relevant Files
- src/auth/middleware.ts — JWT validation`;

    await invokeMemSessionSummary({ content: updatedSummary, project: 'test-project', session_id: 's1' });

    const session = store.getSession('s1');
    expect(session).not.toBeNull();
    expect(session!.summary).toBe('Working on auth system rollout');
    expect(session!.ended_at).not.toBe('2000-01-01 00:00:00');
  });
});
