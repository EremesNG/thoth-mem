import { describe, expect, it } from 'vitest';
import { buildHumanOptions, presentRelation } from '../../dashboard/src/components/dashboard-presentation.js';
import { formatBoundedResult, presentBoundedResult, presentStoredText } from '../../dashboard/src/components/safe-presentation.js';
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
      await browser.setRoutes([
        { includes: '/viz/filters', status: 200, body: { projects: ['Visible project <private>OPTION_SECRET</private>'], sessions: [], topic_keys: [], types: ['manual'], relations: ['SUPPORTS [private]RELATION_SECRET[/private]'] } },
        { includes: '/viz/slice', status: 200, body: { nodes: [{ id: 'obs:1', kind: 'observation', label: 'Visible memory <private>NODE_SECRET</private>', snippet: 'Public [private]SNIPPET_SECRET[/private]', project: 'Visible project <private>PROJECT_SECRET</private>', session_id: 'browser-session', topic_key: 'Visible topic [private]TOPIC_SECRET[/private]', type: 'manual', seed_x: 0.5, seed_y: 0.5 }], edges: [], state: 'sparse', continuation: null, truncated: false, health } },
        { includes: '/viz/inspect/node/obs:', status: 200, body: { id: 'obs:1', kind: 'observation', label: 'Visible memory <private>LENS_TITLE_SECRET</private>', snippet: 'Readable [private]LENS_SECRET[/private]', metadata: { note: '<private>METADATA_SECRET</private>', project: 'browser-nebula' }, links: [] } },
        { includes: '/observatory/map/frontier', method: 'POST', status: 200, delayMs: 2_000, body: { nodes: [], edges: [], frontier_state: { added_node_ids: [], already_visible_node_ids: ['obs:1'], exhausted: true, continuation: null, reason: 'no-neighbors' }, health } },
      ]);
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]') && document.querySelectorAll('.graph-navigator li').length === 1`);
      await browser.click('[role="combobox"][aria-label="Project"]');
      expect(await browser.text('.guided-select-popover')).toContain('Visible project');
      await browser.key('Escape');
      await browser.clickText('.graph-navigator li > button:first-child', 'Visible memory');
      await browser.waitFor(`document.querySelector('.memory-lens h2')?.textContent?.includes('Visible memory') && document.querySelector('.memory-lens details.technical-disclosure')`);
      await browser.waitFor(`document.querySelector('.active-focus-summary') && document.querySelector('.observatory-map-inspector')`);
      await browser.click('.memory-lens details.technical-disclosure summary');
      const html = await browser.evaluate<string>('document.documentElement.outerHTML');
      for (const secret of ['OPTION_SECRET', 'RELATION_SECRET', 'NODE_SECRET', 'SNIPPET_SECRET', 'PROJECT_SECRET', 'TOPIC_SECRET', 'LENS_TITLE_SECRET', 'LENS_SECRET', 'METADATA_SECRET']) expect(html).not.toContain(secret);
    }, { observations: 3 });
  }, 40_000);
});
