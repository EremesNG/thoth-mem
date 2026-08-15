import { describe, expect, it } from 'vitest';
import { buildHumanOptions, presentRelation } from '../../dashboard/src/components/dashboard-presentation.js';
import { formatBoundedResult, presentBoundedResult, presentStoredText } from '../../dashboard/src/components/safe-presentation.js';
import type { SemanticAtlasPageResponse } from '../../dashboard/src/api/client.js';
import { withDashboardBrowser } from './dashboard-browser-harness.js';

describe('safe presentation boundary', () => {
  it('strips both private marker syntaxes case-insensitively', () => {
    expect(presentStoredText('public <private>token</private> tail [PRIVATE]secret[/PRIVATE]')).toBe('public tail');
  });
  it('sanitizes nested bounded results and caps arrays', () => {
    const result = presentBoundedResult({ rows: Array.from({ length: 30 }, (_, index) => `row ${index} <private>x</private>`) }) as { rows: string[] };
    expect(result.rows).toHaveLength(24);
    expect(formatBoundedResult(result)).not.toMatch(/<private>|\[private\]/i);
  });
  it('sanitizes closed selector options without changing their canonical values', () => {
    const [option] = buildHumanOptions(['SUPPORTS [private]OPTION_SECRET[/private]'], presentRelation);
    expect(option.value).toContain('OPTION_SECRET');
    expect(option.label).not.toContain('OPTION_SECRET');
    expect(option.searchText).not.toContain('OPTION_SECRET');
  });
  it('keeps graph labels, filter choices, Lens summaries and technical disclosure private-safe in the mounted dashboard', async () => {
    await withDashboardBrowser(async (browser) => {
      const health = { semantic_state: 'ready', pending_jobs: 0 };
      const facets = {
        projects: [{ token: 'facet:project:opaque', label: 'Visible project <private>OPTION_SECRET</private>', count: 1 }],
        sessions: [],
        topics: [],
        types: ['manual' as const],
        relations: ['SUPPORTS [private]RELATION_SECRET[/private]'],
      };
      const atlasBase = {
        generation: 'private-presentation-fixture',
        edges: [],
        counts: { memory_count: 1, project_count: 1, community_count: 1, assigned_memory_count: 1, unclustered_memory_count: 0, supporting_entity_count: 0, relationship_count: 0, raw_entity_count: 3, raw_relationship_count: 2 },
        coverage: { state: 'fresh' as const, projection_source: 'deterministic-kg' as const, summary_state: 'missing' as const, observations_with_kg: 1, observations_without_kg: 0, degraded_reasons: [] },
        facets,
        continuation: null,
        truncated: false,
        health,
      };
      const navigation = (level: 'universe' | 'community' | 'neighborhood') => ({
        community_id: level === 'universe' ? null : 'community:safe',
        focus_node_id: level === 'neighborhood' ? 'obs:1' : null,
        depth: level === 'neighborhood' ? 2 as const : null,
        omitted_nodes: 0,
        omitted_edges: 0,
        raw_rich_render_safe: true,
        raw_rich_render_limit: 5_000,
        scope: { project: null, session: null, topic: null, type: null, relation: null },
      });
      const observationNode = { id: 'obs:1', kind: 'observation' as const, label: 'Visible memory <private>NODE_SECRET</private>', snippet: 'Public [private]SNIPPET_SECRET[/private]', project: { token: 'facet:project:opaque', label: 'Visible project <private>PROJECT_SECRET</private>' }, session: null, topic: { token: 'facet:topic:opaque', label: 'Visible topic [private]TOPIC_SECRET[/private]' }, type: 'manual' as const, community_id: 'community:safe', member_count: null, project_count: null, unclustered: false, seed_x: 0.5, seed_y: 0.5 };
      const universe = { ...atlasBase, level: 'universe' as const, nodes: [{ id: 'community:safe', kind: 'community' as const, label: 'Visible constellation', snippet: '1 memory', project: null, session: null, topic: null, type: null, community_id: 'community:safe', member_count: 1, project_count: 1, unclustered: false, seed_x: 0.5, seed_y: 0.5 }], navigation: navigation('universe') } satisfies SemanticAtlasPageResponse;
      const community = { ...atlasBase, level: 'community' as const, nodes: [observationNode], navigation: navigation('community') } satisfies SemanticAtlasPageResponse;
      const neighborhood = { ...atlasBase, level: 'neighborhood' as const, nodes: [observationNode], navigation: navigation('neighborhood') } satisfies SemanticAtlasPageResponse;
      await browser.setRoutes([
        { includes: '/viz/atlas?level=neighborhood', status: 200, body: neighborhood },
        { includes: '/viz/atlas?level=community', status: 200, body: community },
        { includes: '/viz/atlas?level=universe', status: 200, body: universe },
        { includes: '/viz/inspect/node/obs:', status: 200, body: { id: 'obs:1', kind: 'observation', label: 'Visible memory <private>LENS_TITLE_SECRET</private>', snippet: 'Readable [private]LENS_SECRET[/private]', metadata: { note: '<private>METADATA_SECRET</private>', project: 'browser-nebula' }, links: [] } },
      ]);
      await browser.goto('/');
      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]') && document.querySelectorAll('.graph-navigator li').length === 1`);
      await browser.click('[role="combobox"][aria-label="Project"]');
      expect(await browser.text('.guided-select-popover')).toContain('Visible project');
      expect(await browser.evaluate<string>('document.querySelector(\'.guided-select-popover\')?.outerHTML ?? \'\'')).not.toMatch(/OPTION_SECRET|<private>/i);
      await browser.key('Escape');
      await browser.click('button[aria-label="Close filters"]');
      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'community' && document.querySelector('.graph-navigator li[data-node-id="obs:1"]')`);
      await browser.clickText('.graph-navigator li > button:first-child', 'Visible memory');
      await browser.waitFor(`document.querySelector('.memory-overview h2')?.textContent?.includes('Visible memory') && document.querySelector('.memory-overview details.technical-disclosure')`);
      await browser.waitFor(`document.querySelector('.active-focus-summary') && document.querySelector('.memory-overview')`);
      await browser.click('.memory-overview details.technical-disclosure summary');
      const html = await browser.evaluate<string>('document.documentElement.outerHTML');
      for (const secret of ['OPTION_SECRET', 'RELATION_SECRET', 'NODE_SECRET', 'SNIPPET_SECRET', 'PROJECT_SECRET', 'TOPIC_SECRET', 'LENS_TITLE_SECRET', 'LENS_SECRET', 'METADATA_SECRET']) expect(html).not.toContain(secret);
    }, { observations: 3, webglDisabled: true });
  }, 40_000);
});
