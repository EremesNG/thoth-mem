import { describe, expect, it } from 'vitest';
import { nodeIdToObservationId } from '../../dashboard/src/components/observatory/observatory-utils.js';
import { withDashboardBrowser } from './dashboard-browser-harness.js';

describe('bounded contextual instruments', () => {
  it('loads Ledger only for canonical observation focus', () => {
    expect(nodeIdToObservationId('obs:42')).toBe(42);
    expect(nodeIdToObservationId('project:42')).toBeNull();
    expect(nodeIdToObservationId(null)).toBeNull();
  });
  it('keeps initial deep links and Recall pivots synchronized with the rich and semantic graph', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/?project=browser-nebula&focus=obs%3A1&q=Memory');
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 1`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === 'obs:1'`);
      expect(await browser.attribute('.graph-navigator li.active > button:first-child', 'aria-current')).toBe('true');

      await browser.setRoutes([
        { includes: '/observatory/pivot', method: 'POST', status: 200, body: { context_token: 'pivot-context', scope: { project: 'browser-nebula' }, focus_node_id: 'obs:2', target: 'map' } },
        { includes: '/observatory/map/frontier', method: 'POST', status: 200, body: { nodes: [], edges: [], frontier_state: { added_node_ids: [], already_visible_node_ids: ['obs:2'], exhausted: true, continuation: null, reason: 'no-neighbors' }, health: { semantic_state: 'ready', pending_jobs: 0 } } },
      ]);
      await browser.clickText('.observatory-tabs button', 'Find related');
      await browser.waitFor(`document.querySelectorAll('button[title="Pivot to map"]').length > 0`);
      await browser.click('button[title="Pivot to map"]');
      await browser.waitFor(`new URLSearchParams(location.search).get('focus') !== 'obs:1'`);
      const pivotFocus = await browser.evaluate<string>(`new URLSearchParams(location.search).get('focus') ?? ''`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === ${JSON.stringify(pivotFocus)}`);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-focus-id')).toBe(pivotFocus);
      expect(await browser.attribute('.graph-navigator li.active > button:first-child', 'aria-current')).toBe('true');
      await browser.clearRoutes();
    }, { observations: 12 });
  }, 40_000);
  it('switches, fails, retries, rejects stale work, and preserves the graph in a real browser', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/?project=browser-nebula&focus=obs%3A1'); await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 0`);
      const initialGraph=await browser.count('.graph-navigator li');
      const cases=[['Find related','/observatory/recall','recall','Try find related again'],['Follow the story','/observatory/timeline','timeline','Try follow the story again'],['See what changed','/observatory/ledger/1','ledger','Try see what changed again'],['Check readiness','/observatory/health','health','Try check readiness again']] as const;
      for(const [label,endpoint,id,retryLabel] of cases){
        await browser.clickText('.observatory-tabs button','Explore'); await browser.setRoutes([{includes:endpoint,status:503,body:{error:`${id} browser failure`}}]);
        await browser.clickText('.observatory-tabs button',label); await browser.waitFor(`[...document.querySelectorAll('.error-container button')].some((button)=>button.textContent?.includes(${JSON.stringify(retryLabel)}))`);
        expect(await browser.count('.graph-navigator li')).toBe(initialGraph);
        const before=browser.requests.filter((request)=>request.url.includes(endpoint)).length; await browser.clearRoutes(); await browser.clickText('.error-container button',retryLabel);
        await browser.waitFor(`![...document.querySelectorAll('.error-container button')].some((button)=>button.textContent?.includes(${JSON.stringify(retryLabel)}))`);
        expect(browser.requests.filter((request)=>request.url.includes(endpoint)).length).toBeGreaterThan(before);
        expect(await browser.count('.graph-navigator li')).toBe(initialGraph);
      }
      await browser.clickText('.observatory-tabs button','Explore');
      await browser.setRoutes([{includes:'/observatory/timeline',status:200,delayMs:500,body:{events:[],continuation:null}}]);
      await browser.clickText('.observatory-tabs button','Follow the story'); await browser.clickText('.observatory-tabs button','Find related'); await new Promise((resolve)=>setTimeout(resolve,650));
      expect(await browser.attribute('.instrument-dock','aria-label')).toBe('Find related view');
      expect(browser.failedRequests.some((request)=>request.url.includes('/observatory/timeline')&&request.canceled)).toBe(true);
      expect(await browser.count('.graph-navigator li')).toBe(initialGraph); await browser.clearRoutes();
      for(const endpoint of ['/observatory/recall','/observatory/timeline','/observatory/ledger/1','/observatory/health']) expect(browser.requests.some((request)=>request.url.includes(endpoint))).toBe(true);
      expect(browser.requests.filter((request)=>request.url.includes('/observatory/recall')||request.url.includes('/observatory/timeline')).every((request)=>new URL(request.url).searchParams.has('context_token'))).toBe(true);
    });
  },40_000);
});
