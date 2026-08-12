import { describe, expect, it } from 'vitest';

import { withDashboardBrowser } from './dashboard-browser-harness.js';

describe('semantic atlas production navigation', () => {
  it('drills Universe to Community to Neighborhood and restores the semantic trail', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'universe'`, 30_000);
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 0`);

      expect(browser.requests.some(({ url }) => url.includes('/viz/atlas'))).toBe(true);
      expect(browser.requests.some(({ url }) => url.includes('/viz/graph'))).toBe(false);
      expect(await browser.text('.map-health-strip')).toMatch(/memories.*projects.*constellations/i);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-atlas-level')).toBe('universe');
      expect(await browser.text('#graph-navigator-heading')).toBe('Constellations');

      await browser.evaluate(`document.querySelector('.graph-navigator li > button:first-child')?.click()`);
      await browser.waitFor(`new URL(location.href).searchParams.get('level') === 'community' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'community'`, 30_000);
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 0`);
      expect(await browser.text('.graph-navigator li')).toContain('Memory');
      expect(await browser.text('#graph-navigator-heading')).toBe('Memories in this constellation');

      await browser.evaluate(`document.querySelector('.graph-navigator li > button:first-child')?.click()`);
      await browser.waitFor(`new URL(location.href).searchParams.get('level') === 'neighborhood' && Boolean(new URL(location.href).searchParams.get('focus')) && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'neighborhood'`, 30_000);
      await browser.waitFor(`document.querySelector('.atlas-dock')?.getAttribute('data-open') === 'true'`);
      await browser.waitFor(`document.querySelector('#graph-navigator-heading')?.textContent === 'Neighborhood evidence'`, 30_000);
      expect(await browser.text('#graph-navigator-heading')).toBe('Neighborhood evidence');
      const neighborhoodUrl = await browser.url();
      const focusedId = new URL(neighborhoodUrl).searchParams.get('focus');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`, 30_000);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === ${JSON.stringify(focusedId)}`, 30_000);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-focus-id')).toBe(focusedId);
      expect(await browser.attribute('.graph-navigator', 'data-focus-id')).toBe(focusedId);

      await browser.clickText('.focus-trail button', 'Back');
      await browser.waitFor(`new URL(location.href).searchParams.get('level') === 'community'`);
      await browser.clickText('.focus-trail button', 'Back');
      await browser.waitFor(`!new URL(location.href).searchParams.has('level') && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'universe'`);
      await browser.clickText('.focus-trail button', 'Forward');
      await browser.waitFor(`new URL(location.href).searchParams.get('level') === 'community'`);

      expect(browser.requests.some(({ url }) => url.includes('/viz/graph'))).toBe(false);
      expect(browser.requests.filter(({ url }) => !url.startsWith(browser.origin) && !url.startsWith('data:'))).toHaveLength(0);
    }, { observations: 84, faultInjection: { deadlineMs: 55_000 } });
  }, 65_000);

  it('commits safe facet tokens without serializing canonical project values', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]')`);
      await browser.click('[role="combobox"][aria-label="Project"]');
      await browser.waitFor(`document.querySelectorAll('[role="listbox"][aria-label="Project choices"] [role="option"]').length > 1`);
      await browser.evaluate(`document.querySelectorAll('[role="listbox"][aria-label="Project choices"] [role="option"]')[1]?.click()`);
      await browser.waitFor(`Boolean(new URL(location.href).searchParams.get('project_token'))`);

      const url = new URL(await browser.url());
      expect(url.searchParams.get('project_token')).toBeTruthy();
      expect(url.searchParams.has('project')).toBe(false);
      expect(url.href).not.toContain('browser-nebula');
      expect(browser.requests.some(({ url: requestUrl }) => requestUrl.includes('/viz/atlas') && requestUrl.includes('project_token='))).toBe(true);
      expect(browser.requests.some(({ url: requestUrl }) => requestUrl.includes('project=browser-nebula'))).toBe(false);
    }, { observations: 24 });
  }, 45_000);

  it('renders a meaningful 6,000-memory Universe and enters Community within the interaction budget', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'universe'`, 80_000);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`, 30_000);
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length >= 30`, 30_000);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-final-fit-settled') === 'true'`, 30_000);

      const universe = await browser.evaluate<{
        labels: string[];
        pointCount: number;
        linkCount: number;
      }>(`(() => {
        const shell = document.querySelector('[data-testid="map-canvas-shell"]');
        return {
          labels: [...document.querySelectorAll('.graph-navigator li > button:first-child')]
            .map((item) => item.textContent?.trim() ?? '')
            .filter(Boolean),
          pointCount: Number(shell?.getAttribute('data-point-count') ?? 0),
          linkCount: Number(shell?.getAttribute('data-link-count') ?? 0),
        };
      })()`);

      expect(await browser.text('.map-health-strip')).toMatch(/6,000 memories.*projects.*constellations/i);
      expect(universe.pointCount).toBeGreaterThanOrEqual(30);
      expect(universe.pointCount).toBeLessThanOrEqual(150);
      expect(universe.linkCount).toBeGreaterThan(0);
      expect(new Set(universe.labels).size).toBeGreaterThanOrEqual(30);
      expect(universe.labels.some((label) => /Browser region/i.test(label))).toBe(true);
      expect(browser.requests.some(({ url }) => url.includes('/viz/graph'))).toBe(false);

      const regionField = await browser.evaluate<{
        count: number;
        quadrants: number;
        spanXRatio: number;
        spanYRatio: number;
      }>(`(() => {
        const host = document.querySelector('.cosmos-graph-host')?.getBoundingClientRect();
        const labels = [...document.querySelectorAll('.cosmos-node-label[data-role="region"]')]
          .map((label) => label.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0);
        if (!host || labels.length === 0) return { count: 0, quadrants: 0, spanXRatio: 0, spanYRatio: 0 };
        const centers = labels.map((rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }));
        const quadrants = new Set(centers.map(({ x, y }) => String(Number(x >= host.left + host.width / 2)) + String(Number(y >= host.top + host.height / 2))));
        const xs = centers.map(({ x }) => x);
        const ys = centers.map(({ y }) => y);
        return {
          count: labels.length,
          quadrants: quadrants.size,
          spanXRatio: (Math.max(...xs) - Math.min(...xs)) / host.width,
          spanYRatio: (Math.max(...ys) - Math.min(...ys)) / host.height,
        };
      })()`);
      expect(regionField.count, JSON.stringify(regionField)).toBeGreaterThanOrEqual(6);
      expect(regionField.quadrants, JSON.stringify(regionField)).toBeGreaterThanOrEqual(3);
      expect(regionField.spanXRatio, JSON.stringify(regionField)).toBeGreaterThan(0.3);
      expect(regionField.spanYRatio, JSON.stringify(regionField)).toBeGreaterThan(0.25);
      const motionBefore = await browser.attribute('[data-testid="map-canvas-shell"]', 'data-motion-probe');
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 650))`);
      const motionAfter = await browser.attribute('[data-testid="map-canvas-shell"]', 'data-motion-probe');
      expect(motionBefore).toBeTruthy();
      expect(motionAfter).toBeTruthy();
      expect(motionAfter).not.toBe(motionBefore);

      await browser.evaluate(`(() => {
        globalThis.__THOTH_ATLAS_LONG_TASKS__ = [];
        const observer = new PerformanceObserver((list) => {
          globalThis.__THOTH_ATLAS_LONG_TASKS__.push(...list.getEntries().map((entry) => entry.duration));
        });
        try { observer.observe({ type: 'longtask', buffered: false }); } catch {}
        globalThis.__THOTH_ATLAS_LONG_OBSERVER__ = observer;
        globalThis.__THOTH_ATLAS_TRANSITION_STARTED__ = performance.now();
        globalThis.__THOTH_ATLAS_TRANSITION_TIMELINE__ = [];
        const capture = () => {
          const surface = document.querySelector('[data-testid="memory-map-surface"]');
          const shell = document.querySelector('[data-testid="map-canvas-shell"]');
          globalThis.__THOTH_ATLAS_TRANSITION_TIMELINE__.push({
            at: performance.now() - globalThis.__THOTH_ATLAS_TRANSITION_STARTED__,
            surfaceLevel: surface?.getAttribute('data-atlas-level'),
            phase: surface?.getAttribute('data-atlas-load-state'),
            shellLevel: shell?.getAttribute('data-atlas-level'),
            version: shell?.getAttribute('data-dataset-version'),
            finalFit: shell?.getAttribute('data-final-fit-settled'),
          });
        };
        globalThis.__THOTH_ATLAS_TRANSITION_OBSERVER__ = new MutationObserver(capture);
        globalThis.__THOTH_ATLAS_TRANSITION_OBSERVER__.observe(document.body, { subtree: true, childList: true, attributes: true });
        document.querySelector('.graph-navigator li > button:first-child')?.addEventListener('click', () => {
          globalThis.__THOTH_ATLAS_TRANSITION_STARTED__ = performance.now();
          globalThis.__THOTH_ATLAS_TRANSITION_TIMELINE__ = [];
          capture();
        }, { once: true });
        capture();
      })()`);
      const priorDatasetVersion = Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-dataset-version'));
      await browser.evaluate(`document.querySelector('.graph-navigator li > button:first-child')?.click()`);
      try {
        await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'community'
          && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'
          && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-atlas-level') === 'community'
          && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'
          && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-final-fit-settled') === 'true'
          && Number(document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-dataset-version') ?? 0) > ${priorDatasetVersion}
          && Number(document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-point-count') ?? 0) > 0
          && document.querySelectorAll('.cosmos-graph-host canvas').length === 1
          && document.querySelectorAll('.graph-navigator li').length > 0`, 30_000);
      } catch (cause) {
        const diagnostics = await browser.evaluate<Record<string, string | number | null>>(`(() => {
          const surface = document.querySelector('[data-testid="memory-map-surface"]');
          const shell = document.querySelector('[data-testid="map-canvas-shell"]');
          return {
            surfaceLevel: surface?.getAttribute('data-atlas-level') ?? null,
            loadState: surface?.getAttribute('data-atlas-load-state') ?? null,
            shellLevel: shell?.getAttribute('data-atlas-level') ?? null,
            status: shell?.getAttribute('data-renderer-status') ?? null,
            finalFit: shell?.getAttribute('data-final-fit-settled') ?? null,
            datasetVersion: Number(shell?.getAttribute('data-dataset-version') ?? 0),
            pointCount: Number(shell?.getAttribute('data-point-count') ?? 0),
            canvases: document.querySelectorAll('.cosmos-graph-host canvas').length,
            rows: document.querySelectorAll('.graph-navigator li').length,
          };
        })()`);
        throw new Error(`${cause instanceof Error ? cause.message : String(cause)}; ${JSON.stringify(diagnostics)}`);
      }

      const transition = await browser.evaluate<{
        elapsedMs: number;
        maximumLongTaskMs: number;
        resources: Array<{ name: string; duration: number; responseEnd: number }>;
        timeline: Array<Record<string, string | number | null>>;
      }>(`(() => {
        const pending = globalThis.__THOTH_ATLAS_LONG_OBSERVER__?.takeRecords().map((entry) => entry.duration) ?? [];
        globalThis.__THOTH_ATLAS_LONG_OBSERVER__?.disconnect();
        globalThis.__THOTH_ATLAS_TRANSITION_OBSERVER__?.disconnect();
        return {
          elapsedMs: Number(document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-last-render-commit-at') ?? performance.now())
            - globalThis.__THOTH_ATLAS_TRANSITION_STARTED__,
          maximumLongTaskMs: Math.max(0, ...(globalThis.__THOTH_ATLAS_LONG_TASKS__ ?? []), ...pending),
          resources: performance.getEntriesByType('resource')
            .filter((entry) => entry.name.includes('/viz/atlas'))
            .map((entry) => ({ name: entry.name, duration: entry.duration, responseEnd: entry.responseEnd })),
          timeline: globalThis.__THOTH_ATLAS_TRANSITION_TIMELINE__ ?? [],
        };
      })()`);
      expect(transition.elapsedMs, JSON.stringify(transition)).toBeLessThan(250);
      expect(transition.maximumLongTaskMs, JSON.stringify(transition)).toBeLessThan(200);
      expect(browser.requests.filter(({ url }) => !url.startsWith(browser.origin) && !url.startsWith('data:'))).toHaveLength(0);
    }, { observations: 6_000, faultInjection: { deadlineMs: 120_000 } });
  }, 130_000);

  it('pivots a token-scoped Recall result into its current owning community', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]')`);
      await browser.click('[role="combobox"][aria-label="Project"]');
      await browser.waitFor(`document.querySelectorAll('[role="listbox"][aria-label="Project choices"] [role="option"]').length > 1`);
      await browser.evaluate(`document.querySelectorAll('[role="listbox"][aria-label="Project choices"] [role="option"]')[1]?.click()`);
      await browser.fill('input[aria-label="Explore memories"]', 'Browser memory');
      await browser.waitFor(`Boolean(new URL(location.href).searchParams.get('project_token')) && new URL(location.href).searchParams.get('q') === 'Browser memory' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'universe' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length >= 30`, 30_000);

      const scopedUrl = new URL(await browser.url());
      const projectToken = scopedUrl.searchParams.get('project_token');
      expect(projectToken).toBeTruthy();
      expect(scopedUrl.searchParams.has('project')).toBe(false);

      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`new URL(location.href).searchParams.get('level') === 'community' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete' && document.querySelector('.graph-navigator li[data-node-id^="obs:"]')`, 30_000);
      await browser.click('.graph-navigator li[data-node-id^="obs:"] > button:first-child');
      await browser.waitFor(`new URL(location.href).searchParams.get('level') === 'neighborhood' && document.querySelector('.atlas-dock')?.getAttribute('data-open') === 'true' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      const initialCommunity = new URL(await browser.url()).searchParams.get('community');
      expect(initialCommunity).toBeTruthy();

      await browser.clickText('.atlas-dock-tabs button', 'Related');
      await browser.waitFor(`document.querySelectorAll('.observatory-lane-group:first-child .observatory-evidence-item button[title="Pivot to map"]').length > 1`, 30_000);
      const target = await browser.evaluate<{ focusId: string; communityId: string; title: string }>(`(async () => {
        const currentCommunity = new URL(location.href).searchParams.get('community');
        const items = [...document.querySelectorAll('.observatory-lane-group:first-child .observatory-evidence-item')];
        for (const item of items) {
          const title = item.querySelector('strong')?.textContent?.trim() ?? '';
          const match = title.match(/Browser memory (\\d+)/i);
          if (!match) continue;
          const focusId = 'obs:' + match[1];
          const locationScope = new URL(location.href).searchParams;
          const request = new URLSearchParams({ level: 'neighborhood', focus_node_id: focusId, depth: '1', page_size: '250' });
          for (const name of ['project_token', 'session_token', 'topic_token', 'type', 'relation']) {
            const value = locationScope.get(name);
            if (value) request.set(name, value);
          }
          const query = locationScope.get('q');
          if (query) request.set('query', query);
          const response = await fetch('/viz/atlas?' + request.toString()).then((value) => value.json());
          const communityId = response.navigation?.community_id;
          if (!communityId || communityId === currentCommunity) continue;
          const button = item.querySelector('button[title="Pivot to map"]');
          if (!(button instanceof HTMLElement)) continue;
          globalThis.__THOTH_EXPECTED_RECALL_PIVOT__ = { focusId, communityId, title };
          button.click();
          return globalThis.__THOTH_EXPECTED_RECALL_PIVOT__;
        }
        throw new Error('Recall did not expose an out-of-community memory');
      })()`);

      expect(target.communityId).not.toBe(initialCommunity);
      await browser.waitFor(`new URL(location.href).searchParams.get('focus') === ${JSON.stringify(target.focusId)} && new URL(location.href).searchParams.get('community') === ${JSON.stringify(target.communityId)} && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === ${JSON.stringify(target.focusId)} && document.querySelector('.graph-navigator li.active')?.getAttribute('data-node-id') === ${JSON.stringify(target.focusId)} && document.querySelector('.memory-overview h2')?.textContent?.includes(${JSON.stringify(target.title)})`, 30_000);

      const pivotUrl = new URL(await browser.url());
      expect(pivotUrl.searchParams.get('project_token')).toBe(projectToken);
      expect(pivotUrl.searchParams.get('q')).toBe('Browser memory');
      expect(pivotUrl.searchParams.has('project')).toBe(false);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-focus-id')).toBe(target.focusId);
      expect(await browser.attribute('.graph-navigator li.active > button:first-child', 'aria-current')).toBe('true');
      expect(await browser.text('.memory-overview h2')).toContain(target.title);
      expect(browser.requests.some(({ url }) => url.includes('/observatory/context') && url.includes('project_token='))).toBe(true);
      expect(browser.requests.some(({ url }) => url.includes('/observatory/recall') && url.includes('context_token='))).toBe(true);
      expect(browser.requests.some(({ url, method }) => url.includes('/observatory/pivot') && method === 'POST')).toBe(true);
    }, { observations: 180, faultInjection: { deadlineMs: 60_000 } });
  }, 70_000);

  it('loads Raw graph identities only after one explicit diagnostic action and restores Universe', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      expect(browser.requests.some(({ url }) => url.includes('/viz/graph'))).toBe(false);

      await browser.click('button[aria-label="Open Raw graph diagnostics"]');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'raw'`, 30_000);
      expect(browser.requests.some(({ url }) => url.includes('/viz/graph'))).toBe(true);
      expect(await browser.text('.map-health-strip')).toMatch(/graph entities.*relationships/i);
      expect(await browser.text('body')).not.toMatch(/\b\d+ memories gathered\b/i);

      await browser.click('button[aria-label="Exit Raw graph diagnostics"]');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'universe'`);
      expect(new URL(await browser.url()).searchParams.has('raw')).toBe(false);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-atlas-level')).toBe('universe');
    }, { observations: 24 });
  }, 50_000);

  it('refuses an oversized Raw rich view without requesting the heterogeneous graph', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      const atlas = await browser.evaluate<Record<string, unknown>>(`fetch('/viz/atlas?level=universe&page_size=250').then((response) => response.json())`);
      const oversizedAtlas = {
        ...atlas,
        generation: 'oversized-raw-diagnostics-fixture',
        counts: {
          ...(atlas.counts as Record<string, unknown>),
          raw_entity_count: 21_383,
          raw_relationship_count: 48_240,
        },
        navigation: {
          ...(atlas.navigation as Record<string, unknown>),
          raw_rich_render_safe: false,
          raw_rich_render_limit: 5_000,
        },
      };
      await browser.setRoutes([{ includes: '/viz/atlas', status: 200, body: oversizedAtlas }]);
      await browser.fill('input[aria-label="Explore memories"]', 'oversized fixture');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-atlas-generation') === 'oversized-raw-diagnostics-fixture'`);

      await browser.click('button[aria-label="Open Raw graph diagnostics"]');
      await browser.waitFor(`document.querySelector('.atlas-diagnostics')?.getAttribute('data-mode') === 'refused'`);
      expect(await browser.text('.atlas-diagnostics-notice')).toMatch(/21,383 graph entities.*5,000-entity interactive limit/i);
      expect(browser.requests.some(({ url }) => url.includes('/viz/graph'))).toBe(false);
      expect(await browser.attribute('[data-testid="memory-map-surface"]', 'data-atlas-level')).toBe('universe');
    }, { observations: 24 });
  }, 50_000);
});
