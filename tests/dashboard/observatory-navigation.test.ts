import { describe, expect, it } from 'vitest';
import { applyObservatoryPivot, buildObservatoryUrl, createInitialObservatoryState, navigateObservatoryTrail, parseObservatorySearch, recoverObservatoryFocus, serializeObservatoryState } from '../../dashboard/src/components/observatory/context-store.js';
import { withDashboardBrowser } from './dashboard-browser-harness.js';

describe('observatory deep-link state', () => {
  it('round-trips opaque project hierarchy and bounded project pages in the location trail', () => {
    let state = createInitialObservatoryState();
    expect(state).toMatchObject({ hierarchy: 'project', level: 'universe', projectId: null, pageCursor: null });
    state = applyObservatoryPivot(state, {
      hierarchy: 'project', level: 'universe', projectId: null, communityId: null,
      regionId: null, focusNodeId: null, pageCursor: 'atlas-page:2',
    });
    state = applyObservatoryPivot(state, {
      hierarchy: 'project', level: 'project', projectId: 'project:opaque', communityId: null,
      regionId: null, focusNodeId: null, pageCursor: null,
    });
    state = applyObservatoryPivot(state, {
      hierarchy: 'project', level: 'community', projectId: 'project:opaque', communityId: 'community:owned',
      regionId: null, focusNodeId: null, pageCursor: null,
    });

    expect(parseObservatorySearch(serializeObservatoryState(state))).toMatchObject({
      hierarchy: 'project', level: 'community', projectId: 'project:opaque',
      communityId: 'community:owned', pageCursor: null,
    });
    expect(navigateObservatoryTrail(navigateObservatoryTrail(state, -1), -1)).toMatchObject({
      hierarchy: 'project', level: 'universe', projectId: null, pageCursor: 'atlas-page:2',
    });
    expect(state.locationTrail).toHaveLength(4);
  });

  it('round-trips region focus only at Community', () => {
    const community = {
      ...createInitialObservatoryState(), hierarchy: 'global' as const, level: 'community' as const,
      communityId: 'community:42', regionId: 'region:opaque',
    };
    expect(parseObservatorySearch(serializeObservatoryState(community))).toMatchObject({
      level: 'community', communityId: 'community:42', regionId: 'region:opaque',
    });
    expect(parseObservatorySearch('?level=universe&region=region%3Aopaque')).toMatchObject({ regionId: null });
    expect(applyObservatoryPivot(createInitialObservatoryState(), {
      level: 'community', communityId: 'community:42', regionId: 'region:opaque', focusNodeId: null,
    })).toMatchObject({ level: 'community', communityId: 'community:42', regionId: 'region:opaque' });
  });

  it('round-trips scope, density, cue, instrument and focus identifiers', () => {
    const state = { ...createInitialObservatoryState(), hierarchy:'global' as const, level:'neighborhood' as const, communityId:'community:42', scope: { project_token:'facet:project:opaque', session_token:'facet:session:opaque', topic_token:'facet:topic:opaque', type:'decision' as const, relation:'SUPPORTS', query:'why' }, density:'wide' as const, focusNodeId:'obs:42', activeSurface:'timeline' as const };
    const parsed = parseObservatorySearch(serializeObservatoryState(state));
    expect(parsed).toMatchObject({ level:'neighborhood', communityId:'community:42', scope: state.scope, density:'wide', focusNodeId:'obs:42', activeSurface:'timeline' });
    expect(buildObservatoryUrl(state)).toMatch(/^\/?/);
    expect(buildObservatoryUrl(state)).not.toContain('contextToken');
  });
  it('recovers unsupported instrument and density values', () => {
    expect(parseObservatorySearch('?surface=unknown&density=chaos')).toMatchObject({ activeSurface:'map', density:'balanced' });
  });
  it('clears a missing deep-link focus without losing scope', () => {
    const state = { ...createInitialObservatoryState(), level:'neighborhood' as const, communityId:'community:p', scope:{project_token:'facet:project:p'}, focusNodeId:'obs:missing', focusTrail:['obs:missing'], focusTrailIndex:0 };
    expect(recoverObservatoryFocus(state, ['obs:1'])).toMatchObject({level:'universe',communityId:null,scope:{project_token:'facet:project:p'},focusNodeId:null,visibleNodeIds:['obs:1'],focusTrail:[],focusTrailIndex:-1});
  });
  it('rejects raw facet URLs and restores full semantic locations without appending history', () => {
    expect(parseObservatorySearch('?project=%3Cprivate%3ESECRET%3C%2Fprivate%3E&level=community&community=community%3Aold')).toMatchObject({
      level: 'universe', communityId: null, focusNodeId: null, scope: {},
    });
    let state = createInitialObservatoryState();
    state = applyObservatoryPivot(state, { contextToken:'ctx-1', level:'community', communityId:'community:1', focusNodeId:null });
    state = applyObservatoryPivot(state, { contextToken:'ctx-2', level:'neighborhood', communityId:'community:1', focusNodeId:'obs:1' });
    expect(state.locationTrail).toHaveLength(3);
    const back = navigateObservatoryTrail(state, -1);
    expect(back).toMatchObject({ level:'community', communityId:'community:1', focusNodeId:null, locationTrailIndex:1 });
    const forward = navigateObservatoryTrail(back, 1);
    expect(forward).toMatchObject({ level:'neighborhood', communityId:'community:1', focusNodeId:'obs:1', locationTrailIndex:2 });
    expect(forward.locationTrail).toHaveLength(3);
  });
  it('resets the internal atlas trail when the Universe breadcrumb returns to the root', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`);
      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'community'`);
      expect(await browser.count('.focus-trail')).toBe(1);

      await browser.click('.atlas-breadcrumbs button:first-child');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'universe' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`);

      expect(await browser.count('.focus-trail')).toBe(0);
    }, { observations: 24 });
  }, 45_000);
  it('restores Universe, Community, and Neighborhood through browser history and recovers invalid focus', async () => {
    await withDashboardBrowser(async (browser) => {
      const graphCount = async () => {
        await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 0`);
        return await browser.count('.graph-navigator li');
      };
      await browser.goto('/');
      const states: Array<{ url: string; nodes: number }> = [{ url: await browser.url(), nodes: await graphCount() }];
      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'community'`);
      states.push({ url: await browser.url(), nodes: await graphCount() });
      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'neighborhood'`);
      states.push({ url: await browser.url(), nodes: await graphCount() });
      await browser.back(); states.push({ url: await browser.url(), nodes: await graphCount() });
      await browser.back(); states.push({ url: await browser.url(), nodes: await graphCount() });
      await browser.forward(); states.push({ url: await browser.url(), nodes: await graphCount() });
      expect(states.every((state) => state.nodes > 0)).toBe(true);
      expect(states.map((state) => new URL(state.url).searchParams.get('level'))).toEqual([
        null, 'community', 'neighborhood', 'community', null, 'community',
      ]);

      const communityId = new URL(states[1]!.url).searchParams.get('community');
      await browser.goto(`/?level=neighborhood&community=${encodeURIComponent(communityId ?? '')}&focus=obs%3A999999`);
      await browser.waitFor(`!new URLSearchParams(location.search).has('focus') && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'universe'`);
      expect(await graphCount()).toBeGreaterThan(0);
    }, { observations: 16 });
  }, 45_000);

  it('keeps URL, GPU, semantic navigation and Lens synchronized through the semantic focus trail', async () => {
    await withDashboardBrowser(async (browser) => {
      const urlFocus = () => browser.evaluate<string>(`new URLSearchParams(location.search).get('focus') ?? ''`);
      const activeLabel = () => browser.text('.graph-navigator li.active > button:first-child');
      const assertFocusSeams = async (focusId: string, label: string) => {
        expect(await urlFocus()).toBe(focusId);
        expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-focus-id')).toBe(focusId);
        expect(await activeLabel()).toBe(label);
        expect(await browser.text('.memory-overview h2')).toBe(label.replace(/^Memory:\s*/, '').split(',')[0]);
      };

      await browser.goto('/');
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 0`);
      const communityId = await browser.evaluate<string>(`document.querySelector('.graph-navigator li[data-node-id]')?.getAttribute('data-node-id') ?? ''`);
      expect(communityId).toBeTruthy();
      await browser.click(`.graph-navigator li[data-node-id="${communityId}"] > button:first-child`);
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'community'`);
      await browser.waitFor(`(document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'community' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete') || Boolean(document.querySelector('.observatory-error')?.textContent)`);
      expect(await browser.text('.observatory-error')).toBe('');
      expect(await browser.count('.graph-navigator li[data-node-id^="obs:"]')).toBeGreaterThan(1);
      await browser.click('.graph-navigator li[data-node-id^="obs:"] > button:first-child');
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'neighborhood' && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === new URLSearchParams(location.search).get('focus')`);
      const previousFocus = await urlFocus();
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete' && document.querySelector('.graph-navigator li.active')?.getAttribute('data-node-id') === ${JSON.stringify(previousFocus)} && document.querySelectorAll('.graph-navigator li[data-node-id^="obs:"]').length > 1`);
      const previousLabel = await activeLabel();

      await browser.click('.graph-navigator li[data-node-id^="obs:"]:not(.active) > button:first-child');
      await browser.waitFor(`new URLSearchParams(location.search).get('focus') !== ${JSON.stringify(previousFocus)} && document.querySelector('.graph-navigator li.active')?.getAttribute('data-node-id') === new URLSearchParams(location.search).get('focus')`);
      const nextFocus = await urlFocus();
      const nextLabel = await activeLabel();

      await browser.clickText('.focus-trail button', 'Back');
      await browser.waitFor(`new URLSearchParams(location.search).get('focus') === ${JSON.stringify(previousFocus)} && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === ${JSON.stringify(previousFocus)} && document.querySelector('.graph-navigator li.active')?.getAttribute('data-node-id') === ${JSON.stringify(previousFocus)}`);
      await assertFocusSeams(previousFocus, previousLabel);
      await browser.clickText('.focus-trail button', 'Forward');
      await browser.waitFor(`new URLSearchParams(location.search).get('focus') === ${JSON.stringify(nextFocus)} && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === ${JSON.stringify(nextFocus)} && document.querySelector('.graph-navigator li.active')?.getAttribute('data-node-id') === ${JSON.stringify(nextFocus)}`);
      await assertFocusSeams(nextFocus, nextLabel);
    }, { observations: 84 });
  }, 45_000);

  it('rejects a superseded semantic response and preserves token-only filter history', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]')`);
      await browser.click('[role="combobox"][aria-label="Project"]');
      await browser.fill('[role="combobox"][aria-label="Project"]', 'browser');
      await browser.key('ArrowDown');
      await browser.key('Enter');
      await browser.waitFor(`Boolean(new URLSearchParams(location.search).get('project_token')) && document.querySelector('.guided-scope-bar[data-resource-state="ready"]')`);
      const projectToken = new URL(await browser.url()).searchParams.get('project_token');
      expect(await browser.url()).not.toContain('browser-nebula');

      const currentAtlas = await browser.evaluate<Record<string, unknown>>(`fetch('/viz/atlas?level=universe&page_size=250&project_token=${encodeURIComponent(projectToken ?? '')}').then((response) => response.json())`);
      await browser.setRoutes([{
        includes: '/viz/atlas',
        status: 503,
        delayMs: 800,
        body: { ...currentAtlas, generation: 'superseded-atlas-fixture' },
      }]);
      await browser.clickText('.guided-scope-resource button', 'Refresh choices');
      await browser.waitFor(`document.querySelector('.guided-scope-bar')?.getAttribute('data-resource-state') === 'loading'`);
      await browser.clearRoutes();
      await browser.click('button[aria-label="Clear Project"]');
      await browser.waitFor(`!new URLSearchParams(location.search).has('project_token') && document.querySelector('.guided-scope-bar[data-resource-state="ready"]')`);
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 950))`);
      expect(await browser.text('.observatory-error')).not.toContain('superseded-atlas-fixture');
      expect(await browser.evaluate(`document.querySelector('[role="combobox"][aria-label="Project"]')?.value`)).toBe('All projects');

      await browser.back();
      await browser.waitFor(`new URLSearchParams(location.search).get('project_token') === ${JSON.stringify(projectToken)}`);
      expect(await browser.url()).not.toContain('browser-nebula');
      await browser.forward();
      await browser.waitFor(`!new URLSearchParams(location.search).has('project_token')`);
      expect(browser.requests.some(({ url }) => url.includes('/viz/graph'))).toBe(false);
    }, { observations: 16 });
  }, 50_000);
});
