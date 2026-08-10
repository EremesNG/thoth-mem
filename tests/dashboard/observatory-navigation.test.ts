import { describe, expect, it } from 'vitest';
import { buildObservatoryUrl, createInitialObservatoryState, parseObservatorySearch, recoverObservatoryFocus, serializeObservatoryState } from '../../dashboard/src/components/observatory/context-store.js';
import { withDashboardBrowser } from './dashboard-browser-harness.js';

describe('observatory deep-link state', () => {
  it('round-trips scope, density, cue, instrument and focus identifiers', () => {
    const state = { ...createInitialObservatoryState(), scope: { project:'thoth-mem', session_id:'s1', topic_key:'routing', type:'decision' as const, relation:'SUPPORTS', query:'why' }, density:'wide' as const, focusNodeId:'obs:42', activeSurface:'timeline' as const };
    const parsed = parseObservatorySearch(serializeObservatoryState(state));
    expect(parsed).toMatchObject({ scope: state.scope, density:'wide', focusNodeId:'obs:42', activeSurface:'timeline' });
    expect(buildObservatoryUrl(state)).toMatch(/^\/?/);
    expect(buildObservatoryUrl(state)).not.toContain('contextToken');
  });
  it('recovers unsupported instrument and density values', () => {
    expect(parseObservatorySearch('?surface=unknown&density=chaos')).toMatchObject({ activeSurface:'map', density:'balanced' });
  });
  it('clears a missing deep-link focus without losing scope', () => {
    const state = { ...createInitialObservatoryState(), scope:{project:'p'}, focusNodeId:'obs:missing', focusTrail:['obs:missing'], focusTrailIndex:0 };
    expect(recoverObservatoryFocus(state, ['obs:1'])).toMatchObject({scope:{project:'p'},focusNodeId:null,visibleNodeIds:['obs:1'],focusTrail:[],focusTrailIndex:-1});
  });
  it('restores a populated three-state semantic history and recovers a deleted deep-link focus', async () => {
    await withDashboardBrowser(async (browser) => {
      const graphCount = async () => { await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 0`); return await browser.count('.graph-navigator li'); };
      await browser.goto('/?project=browser-nebula&focus=obs%3A1');
      const states: Array<{url:string;nodes:number}> = [{url:await browser.url(),nodes:await graphCount()}];
      await browser.clickText('.graph-navigator li > button:first-child','Project: browser-nebula');
      await browser.waitFor(`location.search.includes('focus=project')`); states.push({url:await browser.url(),nodes:await graphCount()});
      await browser.waitFor(`document.querySelectorAll('.memory-overview .lens-connections button').length > 0`);
      await browser.click('.memory-overview .lens-connections button');
      await browser.waitFor(`new URLSearchParams(location.search).get('focus')?.startsWith('obs:')`); states.push({url:await browser.url(),nodes:await graphCount()});
      await browser.back(); states.push({url:await browser.url(),nodes:await graphCount()});
      await browser.back(); states.push({url:await browser.url(),nodes:await graphCount()});
      await browser.forward(); states.push({url:await browser.url(),nodes:await graphCount()});
      expect(states.every((state) => state.nodes > 0)).toBe(true);
      expect(states.map((state) => new URL(state.url).searchParams.get('focus'))).toEqual(['obs:1',expect.stringMatching(/^project:/),expect.stringMatching(/^obs:/),expect.stringMatching(/^project:/),'obs:1',expect.stringMatching(/^project:/)]);

      await browser.goto('/?project=browser-nebula&focus=deleted-node');
      await browser.waitFor(`!new URLSearchParams(location.search).has('focus') && document.querySelectorAll('.graph-navigator li').length > 0`);
      expect(await graphCount()).toBeGreaterThan(0);
      expect(new URL(await browser.url()).searchParams.get('focus')).toBeNull();
    }, { observations: 16 });
  }, 40_000);

  it('keeps URL, context, GPU, semantic navigation and Lens synchronized through the focus trail', async () => {
    await withDashboardBrowser(async (browser) => {
      const urlFocus = () => browser.evaluate<string>(`new URLSearchParams(location.search).get('focus') ?? ''`);
      const contextLabel = () => browser.text('.observatory-context-strip span:nth-child(3) strong');
      const assertFocusSeams = async (focusId: string, label: string) => {
        expect(await urlFocus()).toBe(focusId);
        expect(await contextLabel()).toBe(label);
        expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-focus-id')).toBe(focusId);
        expect(await browser.text('.graph-navigator li.active > button:first-child')).toContain(label);
        expect(await browser.text('.memory-overview h2')).toBe(label);
      };

      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 0`);
      await browser.clickText('.graph-navigator li > button:first-child', 'Browser memory 1');
      await browser.waitFor(`new URLSearchParams(location.search).has('focus') && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === new URLSearchParams(location.search).get('focus')`);

      await browser.click('button[title="Next connected memory (Arrow Right)"]');
      await browser.waitFor(`new URLSearchParams(location.search).has('focus') && document.querySelector('.focus-trail')?.textContent?.includes('1 / 1')`);
      const previousFocus = await urlFocus();
      const previousLabel = await contextLabel();

      await browser.click('button[title="Next connected memory (Arrow Right)"]');
      await browser.waitFor(`new URLSearchParams(location.search).get('focus') !== ${JSON.stringify(previousFocus)} && document.querySelector('.focus-trail')?.textContent?.includes('2 / 2')`);
      const nextFocus = await urlFocus();
      const nextLabel = await contextLabel();
      await browser.click('button[title="Open memory overview (Enter)"]');
      await browser.waitFor(`document.querySelector('.memory-overview h2')?.textContent === ${JSON.stringify(nextLabel)}`);

      await browser.clickText('.focus-trail button', 'Back');
      await browser.waitFor(`new URLSearchParams(location.search).get('focus') === ${JSON.stringify(previousFocus)}`);
      await assertFocusSeams(previousFocus, previousLabel);

      await browser.clickText('.focus-trail button', 'Forward');
      await browser.waitFor(`new URLSearchParams(location.search).get('focus') === ${JSON.stringify(nextFocus)}`);
      await assertFocusSeams(nextFocus, nextLabel);
    }, { observations: 16 });
  }, 40_000);

  it('ignores a superseded frontier fallback failure after focus changes', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 0`);
      await browser.setRoutes([
        { includes: '/observatory/map/frontier', status: 503, body: 'stale frontier failure' },
        { includes: '/viz/slice', status: 503, delayMs: 1_200, body: 'stale fallback failure' },
      ]);

      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`new URLSearchParams(location.search).has('focus')`);
      const firstFocus = new URL(await browser.url()).searchParams.get('focus');
      for (let attempt = 0; attempt < 20 && !browser.requests.some(({ url }) => url.includes('/viz/slice')); attempt += 1) {
        await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 25))`);
      }
      expect(browser.requests.some(({ url }) => url.includes('/viz/slice'))).toBe(true);

      await browser.clearRoutes();
      await browser.click('button[title="Next connected memory (Arrow Right)"]');
      await browser.waitFor(`new URLSearchParams(location.search).get('focus') !== ${JSON.stringify(firstFocus)} && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === new URLSearchParams(location.search).get('focus')`);
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 1_500))`);

      expect(await browser.text('.observatory-error')).not.toContain('stale frontier failure');
    }, { observations: 16 });
  }, 40_000);

  it('normalizes dependent choices before graph loading and rejects stale metadata races', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/?project=browser-nebula&session_id=missing-session&topic_key=missing-topic');
      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]') && !new URLSearchParams(location.search).has('session_id') && !new URLSearchParams(location.search).has('topic_key')`);
      expect(browser.requests.filter(({ url }) => url.includes('/viz/slice')).every(({ url }) => !url.includes('missing-session') && !url.includes('missing-topic'))).toBe(true);

      await browser.setRoutes([{
        includes: '/viz/filters?project=browser-nebula',
        status: 200,
        delayMs: 450,
        body: { projects: ['browser-nebula'], sessions: ['stale-session'], topic_keys: ['stale-topic'], types: ['manual'], relations: ['STALE_RELATION'] },
      }]);
      await browser.clickText('.guided-scope-resource button', 'Refresh choices');
      await browser.waitFor(`document.querySelector('.guided-scope-bar')?.getAttribute('data-resource-state') === 'loading'`);
      await browser.click('button[aria-label="Clear Project"]');
      await browser.waitFor(`!new URLSearchParams(location.search).has('project') && document.querySelector('.guided-scope-bar[data-resource-state="ready"]')`);
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 550))`);
      expect(new URL(await browser.url()).searchParams.get('project')).toBeNull();
      expect(await browser.evaluate(`document.querySelector('[role="combobox"][aria-label="Project"]')?.value`)).toBe('All projects');

      await browser.clearRoutes();
      await browser.click('[role="combobox"][aria-label="Project"]');
      await browser.fill('[role="combobox"][aria-label="Project"]', 'browser');
      await browser.key('ArrowDown');
      await browser.key('Enter');
      await browser.waitFor(`new URLSearchParams(location.search).get('project') === 'browser-nebula' && document.querySelector('.guided-scope-bar[data-resource-state="ready"]')`);
      await browser.click('[role="combobox"][aria-label="Session"]');
      await browser.fill('[role="combobox"][aria-label="Session"]', 'browser-session');
      await browser.key('ArrowDown');
      await browser.key('Enter');
      await browser.waitFor(`new URLSearchParams(location.search).get('session_id') === 'browser-session'`);

      await browser.back();
      await browser.waitFor(`new URLSearchParams(location.search).get('project') === 'browser-nebula' && !new URLSearchParams(location.search).has('session_id') && document.querySelector('[role="combobox"][aria-label="Session"]')?.value === 'Any session'`);
      await browser.back();
      expect(await browser.url()).toBe(`${browser.origin}/`);
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]') && document.querySelector('[role="combobox"][aria-label="Project"]')?.value === 'All projects'`);
      await browser.forward();
      await browser.waitFor(`new URLSearchParams(location.search).get('project') === 'browser-nebula' && document.querySelector('.guided-scope-bar[data-resource-state="ready"]')`);
      expect(await browser.evaluate(`document.querySelector('[role="combobox"][aria-label="Project"]')?.value`)).toBe('browser-nebula');
    }, { observations: 12 });
  }, 40_000);
});
