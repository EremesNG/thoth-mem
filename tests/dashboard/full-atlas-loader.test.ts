import { describe, expect, it } from 'vitest';

import { ApiError } from '../../dashboard/src/api/client.js';
import type {
  VizGraphPageRequest,
  VizGraphPageResponse,
  VizNode,
} from '../../dashboard/src/api/client.js';
import { loadFullAtlas } from '../../dashboard/src/components/observatory/full-atlas-loader.js';

const health = { semantic_state: 'ready' as const, pending_jobs: 0 };

function node(id: string): VizNode {
  return {
    id,
    kind: 'observation',
    label: id,
    snippet: id,
    project: 'atlas',
    session_id: 'session',
    topic_key: `topic/${id}`,
    type: 'manual',
    seed_x: 0,
    seed_y: 0,
  };
}

function page(
  nodes: VizNode[],
  continuation: string | null,
  edges: VizGraphPageResponse['edges'] = [],
): VizGraphPageResponse {
  return {
    nodes,
    edges,
    state: nodes.length > 1 ? 'dense' : 'sparse',
    continuation,
    truncated: continuation !== null,
    health,
  };
}

describe('full atlas loader', () => {
  it('drains duplicate-only pages and publishes one complete stable identity set', async () => {
    const calls: Array<string | undefined> = [];
    const snapshots: string[] = [];
    const pages = new Map<string | undefined, VizGraphPageResponse>([
      [undefined, page([node('obs:1')], 'duplicate')],
      ['duplicate', page([node('obs:1')], 'last')],
      ['last', page([node('obs:2')], null, [{
        id: 'edge:1',
        source_id: 'obs:1',
        target_id: 'obs:2',
        relation: 'RELATED_TO',
        label: 'related',
        summary: 'related',
      }])],
    ]);

    const result = await loadFullAtlas({
      request: { project: 'atlas', page_size: 250 },
      signal: new AbortController().signal,
      fetchPage: async (request: VizGraphPageRequest) => {
        calls.push(request.cursor);
        const response = pages.get(request.cursor);
        if (!response) throw new Error('Unexpected cursor');
        return response;
      },
      onSnapshot: (snapshot) => snapshots.push(snapshot.phase),
      yieldControl: async () => undefined,
    });

    expect(calls).toEqual([undefined, 'duplicate', 'last']);
    expect(result.phase).toBe('complete');
    expect(result.pagesLoaded).toBe(3);
    expect(result.data?.nodes.map(({ id }) => id)).toEqual(['obs:1', 'obs:2']);
    expect(result.data?.edges.map(({ id }) => id)).toEqual(['edge:1']);
    expect(snapshots[0]).toBe('initial');
    expect(snapshots.at(-1)).toBe('complete');
  });

  it('retains coherent pages after an ordinary failure and resumes from its cursor', async () => {
    const first = await loadFullAtlas({
      request: { project: 'atlas' },
      signal: new AbortController().signal,
      fetchPage: async ({ cursor }) => {
        if (!cursor) return page([node('obs:1')], 'resume-here');
        throw new Error('Network unavailable');
      },
      onSnapshot: () => undefined,
      yieldControl: async () => undefined,
    });

    expect(first).toMatchObject({
      phase: 'partial-error',
      continuation: 'resume-here',
      error: 'Network unavailable',
    });
    expect(first.data?.nodes.map(({ id }) => id)).toEqual(['obs:1']);

    const resumed = await loadFullAtlas({
      request: { project: 'atlas' },
      initialData: first.data,
      initialCursor: first.continuation,
      signal: new AbortController().signal,
      fetchPage: async ({ cursor }) => {
        expect(cursor).toBe('resume-here');
        return page([node('obs:2')], null);
      },
      onSnapshot: () => undefined,
      yieldControl: async () => undefined,
    });

    expect(resumed.phase).toBe('complete');
    expect(resumed.data?.nodes.map(({ id }) => id)).toEqual(['obs:1', 'obs:2']);
  });

  it('discards invalid generations, restarts twice, then exposes one bounded retry state', async () => {
    let attempt = 0;
    const snapshots: Array<{ phase: string; ids: string[] }> = [];
    const stale = () => new ApiError(409, 'Graph generation changed', {
      code: 'VIZ_GRAPH_GENERATION_STALE',
      retryable: true,
    });

    const result = await loadFullAtlas({
      request: { project: 'atlas' },
      signal: new AbortController().signal,
      fetchPage: async ({ cursor }) => {
        if (!cursor) {
          attempt += 1;
          return page([node(`stale:${attempt}`)], `cursor:${attempt}`);
        }
        throw stale();
      },
      onSnapshot: (snapshot) => snapshots.push({
        phase: snapshot.phase,
        ids: snapshot.data?.nodes.map(({ id }) => id) ?? [],
      }),
      yieldControl: async () => undefined,
    });

    expect(attempt).toBe(3);
    expect(snapshots.filter(({ phase }) => phase === 'restarting')).toHaveLength(2);
    expect(result).toMatchObject({
      phase: 'partial-error',
      continuation: null,
      restartCount: 2,
      errorCode: 'VIZ_GRAPH_GENERATION_STALE',
    });
    expect(result.data).toBeNull();
  });

  it('aborts without publishing a late terminal state', async () => {
    const controller = new AbortController();
    const phases: string[] = [];
    const pending = loadFullAtlas({
      request: { project: 'atlas' },
      signal: controller.signal,
      fetchPage: async (_request, signal) => await new Promise<VizGraphPageResponse>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
      }),
      onSnapshot: (snapshot) => phases.push(snapshot.phase),
      yieldControl: async () => undefined,
    });

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(phases).toEqual(['initial']);
  });
});
