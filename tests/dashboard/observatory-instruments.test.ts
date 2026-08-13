import { describe, expect, it } from 'vitest';
import { nodeIdToObservationId } from '../../dashboard/src/components/observatory/observatory-utils.js';
import { buildRegionOverviewModel } from '../../dashboard/src/components/observatory/region-overview-model.js';
import { withDashboardBrowser } from './dashboard-browser-harness.js';

describe('bounded contextual instruments', () => {
  it('loads Ledger only for canonical observation focus', () => {
    expect(nodeIdToObservationId('obs:42')).toBe(42);
    expect(nodeIdToObservationId('project:42')).toBeNull();
    expect(nodeIdToObservationId(null)).toBeNull();
  });
  it('builds a bounded private-safe semantic region dock model', () => {
    const model = buildRegionOverviewModel({
      id: 'region:safe', community_id: 'community:safe', label: 'Safe <private>hidden</private>', summary: 'Public summary',
      member_count: 42, project_count: 2, time_from: '2026-01-01T00:00:00.000Z', time_to: '2026-02-01T00:00:00.000Z',
      concepts: [{ label: 'Architecture', count: 8 }], facets: { projects: [], sessions: [], topics: [], types: [{ value: 'decision', count: 4 }] },
      representatives: Array.from({ length: 14 }, (_, index) => ({ node_id: `obs:${index + 1}`, reason: `Reason ${index + 1}`, signals: ['centrality'] as const, rank: index + 1 })),
      seed_x: 0.2, seed_y: 0.3, unclustered: false,
    }, [], Array.from({ length: 14 }, (_, index) => ({ id: `obs:${index + 1}`, kind: 'observation' as const, label: `Memory ${index + 1}`, snippet: 'Public', project: null, session_id: null, topic_key: null, type: 'decision' as const, created_at: null, updated_at: null, community_id: 'community:safe', region_id: 'region:safe', semantic_level: 'community' as const, degree: 1, seed_x: 0, seed_y: 0 })));
    expect(model.label).toBe('Safe');
    expect(model.facets).toEqual([{ label: 'decision', count: 4 }]);
    expect(model.representatives).toHaveLength(12);
    expect(JSON.stringify(model)).not.toMatch(/hidden|<private>|canonical facet|private marker/i);
  });
  it('keeps instrument navigation beside its content while the atlas remains stable', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/');
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 0`);
      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'community' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete' && document.querySelector('.graph-navigator li[data-node-id^="obs:"]')`);
      await browser.click('.graph-navigator li[data-node-id^="obs:"] > button:first-child');
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'neighborhood' && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`);
      const before = await browser.evaluate<{ nodes: number; width: number; height: number }>(`(() => {
        const canvas = document.querySelector('[data-testid="map-canvas-shell"]')?.getBoundingClientRect();
        if (!canvas) throw new Error('Missing atlas canvas');
        return { nodes: document.querySelectorAll('.graph-navigator li').length, width: canvas.width, height: canvas.height };
      })()`);

      await browser.clickText('.atlas-dock-tabs button', 'Related');
      await browser.waitFor(`document.querySelector('.atlas-dock[data-open="true"] .instrument-dock')`);
      const locality = await browser.evaluate<{ tabs: number; local: boolean; topBefore: number; topAfter: number }>(`(() => {
        const dock = document.querySelector('.atlas-dock');
        const tabs = document.querySelector('.atlas-dock-tabs');
        const body = document.querySelector('.atlas-dock-body');
        const instrument = document.querySelector('.instrument-dock');
        if (!(dock instanceof HTMLElement) || !(tabs instanceof HTMLElement) || !(body instanceof HTMLElement) || !(instrument instanceof HTMLElement)) throw new Error('Missing local instrument dock');
        const topBefore = tabs.getBoundingClientRect().top;
        body.scrollTop = body.scrollHeight;
        return { tabs: tabs.querySelectorAll('button').length, local: dock.contains(tabs) && dock.contains(instrument), topBefore, topAfter: tabs.getBoundingClientRect().top };
      })()`);
      expect(locality.tabs).toBe(5);
      expect(locality.local).toBe(true);
      expect(Math.abs(locality.topAfter - locality.topBefore)).toBeLessThanOrEqual(1);

      await browser.clickText('.atlas-dock-tabs button', 'Story');
      await browser.waitFor(`document.querySelector('.instrument-dock')?.getAttribute('aria-label') === 'Follow the story view'`);
      const after = await browser.evaluate<{ nodes: number; width: number; height: number }>(`(() => {
        const canvas = document.querySelector('[data-testid="map-canvas-shell"]')?.getBoundingClientRect();
        if (!canvas) throw new Error('Missing atlas canvas');
        return { nodes: document.querySelectorAll('.graph-navigator li').length, width: canvas.width, height: canvas.height };
      })()`);
      expect(after.nodes).toBe(before.nodes);
      expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(2);
    }, { observations: 32 });
  }, 40_000);
  it('keeps initial deep links and Recall pivots synchronized with the rich and semantic graph', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 0`);
      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'community' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete' && document.querySelector('.graph-navigator li[data-node-id^="obs:"]')`);
      await browser.click('.graph-navigator li[data-node-id^="obs:"] > button:first-child');
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'neighborhood'`);
      const focusedUrl = new URL(await browser.url());
      const initialFocus = focusedUrl.searchParams.get('focus');
      focusedUrl.searchParams.set('surface', 'timeline');
      focusedUrl.searchParams.set('q', 'Memory');
      await browser.goto(`${focusedUrl.pathname}${focusedUrl.search}`);
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 1`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === ${JSON.stringify(initialFocus)}`);
      await browser.waitFor(`document.querySelector('.atlas-dock')?.getAttribute('data-open') === 'true' && document.querySelector('.instrument-dock')?.getAttribute('aria-label') === 'Follow the story view'`);
      expect(await browser.attribute('.graph-navigator li.active > button:first-child', 'aria-current')).toBe('true');

      await browser.clickText('.observatory-tabs button', 'Related');
      await browser.waitFor(`document.querySelectorAll('button[title="Pivot to map"]').length > 1`);
      await browser.click('button[title="Pivot to map"]', 1);
      await browser.waitFor(`new URLSearchParams(location.search).get('focus') !== ${JSON.stringify(initialFocus)}`);
      const pivotFocus = await browser.evaluate<string>(`new URLSearchParams(location.search).get('focus') ?? ''`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === ${JSON.stringify(pivotFocus)}`);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-focus-id')).toBe(pivotFocus);
      expect(await browser.attribute('.graph-navigator li.active > button:first-child', 'aria-current')).toBe('true');
    }, { observations: 12 });
  }, 40_000);
  it('switches, fails, retries, rejects stale work, and preserves the graph in a real browser', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/'); await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 0`);
      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'community' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete' && document.querySelector('.graph-navigator li[data-node-id^="obs:"]')`);
      await browser.click('.graph-navigator li[data-node-id^="obs:"] > button:first-child');
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'neighborhood' && document.querySelector('.atlas-dock')?.getAttribute('data-open') === 'true' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete' && document.querySelectorAll('.graph-navigator li').length > 0`);
      const observationId = Number((new URL(await browser.url()).searchParams.get('focus') ?? '').replace('obs:', ''));
      const initialGraph=await browser.count('.graph-navigator li');
      const cases=[['Related','/observatory/recall','recall','Try find related again'],['Story','/observatory/timeline','timeline','Try follow the story again'],['Changes',`/observatory/ledger/${observationId}`,'ledger','Try see what changed again'],['Health','/observatory/health','health','Try check readiness again']] as const;
      for(const [label,endpoint,id,retryLabel] of cases){
        await browser.clickText('.observatory-tabs button','Overview'); await browser.setRoutes([{includes:endpoint,status:503,body:{error:`${id} browser failure`}}]);
        await browser.clickText('.observatory-tabs button',label); await browser.waitFor(`[...document.querySelectorAll('.error-container button')].some((button)=>button.textContent?.includes(${JSON.stringify(retryLabel)}))`);
        expect(await browser.count('.graph-navigator li')).toBe(initialGraph);
        const before=browser.requests.filter((request)=>request.url.includes(endpoint)).length; await browser.clearRoutes(); await browser.clickText('.error-container button',retryLabel);
        await browser.waitFor(`![...document.querySelectorAll('.error-container button')].some((button)=>button.textContent?.includes(${JSON.stringify(retryLabel)}))`);
        expect(browser.requests.filter((request)=>request.url.includes(endpoint)).length).toBeGreaterThan(before);
        expect(await browser.count('.graph-navigator li')).toBe(initialGraph);
      }
      await browser.clickText('.observatory-tabs button','Overview');
      await browser.setRoutes([{includes:'/observatory/timeline',status:200,delayMs:500,body:{events:[],continuation:null}}]);
      await browser.clickText('.observatory-tabs button','Story'); await browser.clickText('.observatory-tabs button','Related'); await new Promise((resolve)=>setTimeout(resolve,650));
      expect(await browser.attribute('.instrument-dock','aria-label')).toBe('Find related view');
      expect(browser.failedRequests.some((request)=>request.url.includes('/observatory/timeline')&&request.canceled)).toBe(true);
      expect(await browser.count('.graph-navigator li')).toBe(initialGraph); await browser.clearRoutes();
      for(const endpoint of ['/observatory/recall','/observatory/timeline',`/observatory/ledger/${observationId}`,'/observatory/health']) expect(browser.requests.some((request)=>request.url.includes(endpoint))).toBe(true);
      expect(browser.requests.filter((request)=>request.url.includes('/observatory/recall')||request.url.includes('/observatory/timeline')).every((request)=>new URL(request.url).searchParams.has('context_token'))).toBe(true);
    });
  },40_000);
});
