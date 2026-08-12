import { describe, expect, it } from 'vitest';
import { ApiError, type SemanticAtlasNode, type SemanticAtlasPageResponse } from '../../dashboard/src/api/client.js';
import { loadSemanticAtlas } from '../../dashboard/src/components/observatory/semantic-atlas-loader.js';

const health = { semantic_state: 'ready' as const, pending_jobs: 0 };

function node(id: string): SemanticAtlasNode {
  return {
    id,
    kind: 'observation',
    label: id,
    snippet: id,
    project: null,
    session: null,
    topic: null,
    type: 'manual',
    community_id: 'community:1',
    member_count: null,
    project_count: null,
    unclustered: false,
    seed_x: 0,
    seed_y: 0,
  };
}

function page(ids: string[], continuation: string | null, generation = 'g1'): SemanticAtlasPageResponse {
  return {
    level: 'community',
    generation,
    nodes: ids.map(node),
    edges: ids.includes('obs:2') ? [{
      id: 'edge:1', source_id: 'obs:1', target_id: 'obs:2', kind: 'semantic', relation: 'HAS_WHAT',
      label: 'Related', summary: 'Related', weight: 1, evidence_count: 1,
    }] : [],
    counts: {
      memory_count: 2, project_count: 1, community_count: 1, assigned_memory_count: 2,
      unclustered_memory_count: 0, supporting_entity_count: 1, relationship_count: 1,
      raw_entity_count: 5, raw_relationship_count: 4,
    },
    coverage: {
      state: 'fresh', projection_source: 'deterministic-kg', summary_state: 'missing',
      observations_with_kg: 2, observations_without_kg: 0, degraded_reasons: [],
    },
    facets: { projects: [], sessions: [], topics: [], types: ['manual'], relations: ['HAS_WHAT'] },
    navigation: {
      community_id: 'community:1', focus_node_id: null, depth: null, omitted_nodes: 0, omitted_edges: 0,
      raw_rich_render_safe: true, raw_rich_render_limit: 5_000,
      scope: { project: null, session: null, topic: null, type: null, relation: null },
    },
    continuation,
    truncated: continuation !== null,
    health,
  };
}

describe('semantic atlas loader', () => {
  it('merges generation-consistent pages and retains exact counts and endpoint closure', async () => {
    const cursors: Array<string | undefined> = [];
    const result = await loadSemanticAtlas({
      request: { level: 'community', community_id: 'community:1', page_size: 1 },
      signal: new AbortController().signal,
      fetchPage: async ({ cursor }) => {
        cursors.push(cursor);
        return cursor ? page(['obs:2'], null) : page(['obs:1'], 'next');
      },
      onSnapshot: () => undefined,
      yieldControl: async () => undefined,
    });

    expect(cursors).toEqual([undefined, 'next']);
    expect(result.phase).toBe('complete');
    expect(result.data?.nodes.map(({ id }) => id)).toEqual(['obs:1', 'obs:2']);
    expect(result.data?.edges.map(({ id }) => id)).toEqual(['edge:1']);
    expect(result.data?.counts.memory_count).toBe(2);
  });

  it('discards stale accumulators twice and then exposes one bounded retry', async () => {
    let attempt = 0;
    const stale = () => new ApiError(409, 'Atlas changed', {
      code: 'VIZ_ATLAS_GENERATION_STALE', retryable: true,
    });
    const result = await loadSemanticAtlas({
      request: { level: 'community', community_id: 'community:1' },
      signal: new AbortController().signal,
      fetchPage: async ({ cursor }) => {
        if (!cursor) {
          attempt += 1;
          return page([`obs:${attempt}`], `cursor:${attempt}`, `g${attempt}`);
        }
        throw stale();
      },
      onSnapshot: () => undefined,
      yieldControl: async () => undefined,
    });
    expect(attempt).toBe(3);
    expect(result).toMatchObject({ phase: 'partial-error', restartCount: 2, errorCode: 'VIZ_ATLAS_GENERATION_STALE', data: null });
  });

  it('returns a safe parent recovery for a gone community and rejects repeated cursors', async () => {
    const gone = await loadSemanticAtlas({
      request: { level: 'community', community_id: 'community:old' },
      signal: new AbortController().signal,
      fetchPage: async () => { throw new ApiError(409, 'Gone', { code: 'VIZ_ATLAS_COMMUNITY_GONE', recover_to_level: 'universe' }); },
      onSnapshot: () => undefined,
      yieldControl: async () => undefined,
    });
    expect(gone).toMatchObject({ phase: 'recovery', recoveryLevel: 'universe', data: null });

    const missingFocus = await loadSemanticAtlas({
      request: { level: 'neighborhood', community_id: 'community:1', focus_node_id: 'obs:missing' },
      signal: new AbortController().signal,
      fetchPage: async () => { throw new ApiError(404, 'Missing focus', { code: 'VIZ_ATLAS_FOCUS_INVALID', recover_to_level: 'universe' }); },
      onSnapshot: () => undefined,
      yieldControl: async () => undefined,
    });
    expect(missingFocus).toMatchObject({ phase: 'recovery', recoveryLevel: 'universe', data: null });

    const repeated = await loadSemanticAtlas({
      request: { level: 'community', community_id: 'community:1' },
      signal: new AbortController().signal,
      fetchPage: async () => page(['obs:1'], 'same'),
      onSnapshot: () => undefined,
      yieldControl: async () => undefined,
    });
    expect(repeated).toMatchObject({ phase: 'partial-error', error: 'Atlas pagination repeated a cursor' });
  });
});
