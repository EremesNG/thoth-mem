import { describe, expect, it } from 'vitest';

import { withDashboardBrowser } from './dashboard-browser-harness.js';

describe('guided observatory filters', () => {
  it('opens six structured choices on demand without taking height from the atlas', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`);
      const before = await browser.evaluate<{ height: number; scrollHeight: number }>(`(() => {
        const stage = document.querySelector('.map-stage')?.getBoundingClientRect();
        if (!stage) throw new Error('Missing atlas stage');
        return { height: stage.height, scrollHeight: document.documentElement.scrollHeight };
      })()`);

      expect(await browser.count('.guided-scope-bar [role="combobox"]')).toBe(0);
      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.waitFor(`document.querySelectorAll('#atlas-scope-panel [role="combobox"]').length === 6`);
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]')`);
      expect(await browser.attribute('button[aria-controls="atlas-scope-panel"]', 'aria-expanded')).toBe('true');
      expect(await browser.count('#atlas-scope-panel select')).toBe(0);

      await browser.click('[role="combobox"][aria-label="Project"]');
      await browser.waitFor(`document.querySelector('[role="listbox"][aria-label="Project choices"]')`);
      expect(await browser.evaluate<boolean>(`(() => {
        const popover = document.querySelector('.guided-select-popover');
        const panel = document.getElementById('atlas-scope-panel');
        const visual = window.visualViewport;
        if (!(popover instanceof HTMLElement) || !panel || !visual || popover.parentElement !== document.body || panel.contains(popover)) return false;
        const bounds = popover.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.left + bounds.width / 2, Math.min(bounds.bottom - 2, bounds.top + 18));
        return getComputedStyle(popover).position === 'fixed'
          && bounds.left >= visual.offsetLeft + 7
          && bounds.right <= visual.offsetLeft + visual.width - 7
          && bounds.top >= visual.offsetTop + 7
          && bounds.bottom <= visual.offsetTop + visual.height - 7
          && Boolean(hit?.closest('.guided-select-popover'));
      })()`)).toBe(true);
      const whileOpen = await browser.evaluate<{ height: number; scrollHeight: number }>(`(() => {
        const stage = document.querySelector('.map-stage')?.getBoundingClientRect();
        if (!stage) throw new Error('Missing atlas stage');
        return { height: stage.height, scrollHeight: document.documentElement.scrollHeight };
      })()`);
      expect(Math.abs(whileOpen.height - before.height)).toBeLessThanOrEqual(2);
      expect(whileOpen.scrollHeight).toBe(before.scrollHeight);
      await browser.key('Escape');
      expect(await browser.evaluate<string>(`document.activeElement?.getAttribute('aria-label') ?? ''`)).toBe('Project');
      expect(await browser.count('body > .guided-select-popover')).toBe(0);

      await browser.click('button[aria-label="Close filters"]');
      await browser.waitFor(`document.querySelectorAll('#atlas-scope-panel [role="combobox"]').length === 0`);
      const after = await browser.evaluate<{ height: number; scrollHeight: number; viewportHeight: number }>(`(() => {
        const stage = document.querySelector('.map-stage')?.getBoundingClientRect();
        if (!stage) throw new Error('Missing atlas stage');
        return { height: stage.height, scrollHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight };
      })()`);
      expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(2);
      expect(after.scrollHeight).toBeLessThanOrEqual(after.viewportHeight + 2);
    }, { observations: 16 });
  }, 40_000);

  it('commits only searchable canonical options with complete keyboard semantics', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.waitFor(`document.querySelectorAll('.guided-scope-bar [role="combobox"]').length === 6`);
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]') && !document.querySelector('[role="combobox"][aria-label="Project"]')?.hasAttribute('disabled')`);

      expect(await browser.count('.guided-scope-bar [role="combobox"]')).toBe(6);
      expect(await browser.count('.guided-scope-bar select')).toBe(0);
      expect(await browser.count('input[data-semantic-query="true"]')).toBe(1);
      expect(await browser.count('.guided-scope-bar input:not([role="combobox"])')).toBe(0);

      await browser.click('[role="combobox"][aria-label="Project"]');
      await browser.waitFor(`document.querySelector('[role="combobox"][aria-label="Project"]')?.getAttribute('aria-expanded') === 'true'`);
      await browser.fill('[role="combobox"][aria-label="Project"]', 'browser');
      await browser.key('ArrowDown');
      await browser.key('Enter');
      await browser.waitFor(`Boolean(new URLSearchParams(location.search).get('project_token'))`);
      expect(new URL(await browser.url()).href).not.toContain('browser-nebula');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]') && !document.querySelector('[role="combobox"][aria-label="Session"]')?.hasAttribute('disabled')`);
      expect(await browser.attribute('[role="combobox"][aria-label="Project"]', 'aria-expanded')).toBe('false');

      await browser.click('[role="combobox"][aria-label="Session"]');
      await browser.waitFor(`document.querySelector('[role="combobox"][aria-label="Session"]')?.getAttribute('aria-expanded') === 'true'`);
      await browser.evaluate(`document.querySelector('[role="combobox"][aria-label="Session"]')?.focus()`);
      await browser.fill('[role="combobox"][aria-label="Session"]', 'not-a-real-session');
      await browser.key('Enter');
      expect(new URL(await browser.url()).searchParams.get('session_token')).toBeNull();
      await browser.evaluate(`document.querySelector('[role="combobox"][aria-label="Session"]')?.focus()`);
      await browser.key('Escape');
      await browser.waitFor(`document.querySelector('[role="combobox"][aria-label="Session"]')?.getAttribute('aria-expanded') === 'false'`);
      expect(await browser.attribute('[role="combobox"][aria-label="Session"]', 'aria-expanded')).toBe('false');

      await browser.click('[role="combobox"][aria-label="Topic"]');
      await browser.fill('[role="combobox"][aria-label="Topic"]', 'beta');
      await browser.key('ArrowDown');
      await browser.key('Enter');
      await browser.waitFor(`Boolean(new URLSearchParams(location.search).get('topic_token'))`);
      expect(new URL(await browser.url()).href).not.toContain('browser%2Fbeta');
      expect(browser.requests.some(({ url }) => url.includes('/viz/atlas') && url.includes('topic_token='))).toBe(true);
      expect(browser.requests.some(({ url }) => url.includes('/viz/graph'))).toBe(false);

      await browser.click('button[aria-label="Clear Topic"]');
      await browser.waitFor(`!new URLSearchParams(location.search).has('topic_token')`);
      await browser.click('[role="combobox"][aria-label="Memory type"]');
      await browser.evaluate(`document.querySelector('.guided-scope-heading')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
      await browser.waitFor(`document.querySelector('[role="combobox"][aria-label="Memory type"]')?.getAttribute('aria-expanded') === 'false'`);

      await browser.click('[role="combobox"][aria-label="Connection"]');
      await browser.key('ArrowUp');
      await browser.key('Enter');
      await browser.waitFor(`Boolean(new URLSearchParams(location.search).get('relation'))`);

      await browser.click('[role="combobox"][aria-label="Session"]');
      await browser.key('Tab');
      await browser.waitFor(`document.querySelector('[role="combobox"][aria-label="Session"]')?.getAttribute('aria-expanded') === 'false'`);
    }, { observations: 12 });
  }, 40_000);

  it('presents bounded loading, empty, failure and retry states without freeing the value', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.setRoutes([{ includes: '/viz/atlas', status: 503, body: 'Filter choices unavailable', delayMs: 120 }]);
      await browser.goto('/');
      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="error"]')`);
      expect(await browser.text('.guided-scope-resource')).toContain('Could not load filter choices');
      expect(await browser.count('.guided-scope-resource button')).toBe(1);

      await browser.clearRoutes();
      await browser.click('.guided-scope-resource button');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]')`);

      const atlas = await browser.evaluate<Record<string, unknown>>(`fetch('/viz/atlas?level=universe&page_size=250').then((response) => response.json())`);
      await browser.setRoutes([{ includes: '/viz/atlas', status: 200, body: {
        ...atlas,
        generation: 'empty-filter-fixture',
        facets: { projects: [], sessions: [], topics: [], types: [], relations: [] },
      } }]);
      await browser.clickText('.guided-scope-resource button', 'Refresh choices');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-atlas-generation') === 'empty-filter-fixture'`);
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="empty"]')`);
      await browser.click('[role="combobox"][aria-label="Project"]');
      expect(await browser.text('.guided-select-popover')).toContain('No projects found');
      await browser.fill('[role="combobox"][aria-label="Project"]', 'invented-project');
      await browser.key('Enter');
      expect(new URL(await browser.url()).searchParams.get('project_token')).toBeNull();
    }, { observations: 4 });
  }, 40_000);

  it('keeps the portaled choices reachable after mobile zoom and filter-panel scrolling', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(360, 800);
      await browser.goto('/');
      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]')`);
      await browser.waitFor(`document.querySelector('.map-canvas-shell')`);
      const atlasBefore = await browser.evaluate<{ width: number; height: number }>(`(() => {
        const atlas = document.querySelector('.map-canvas-shell')?.getBoundingClientRect();
        if (!atlas) throw new Error('Missing atlas');
        return { width: atlas.width, height: atlas.height };
      })()`);
      await browser.click('[role="combobox"][aria-label="Project"]');
      await browser.pageScale(2);
      await browser.waitFor(`(() => {
        const popover = document.querySelector('.guided-select-popover');
        const visual = window.visualViewport;
        if (!(popover instanceof HTMLElement) || !visual) return false;
        const bounds = popover.getBoundingClientRect();
        return bounds.left >= visual.offsetLeft + 7
          && bounds.right <= visual.offsetLeft + visual.width - 7
          && bounds.top >= visual.offsetTop + 7
          && bounds.bottom <= visual.offsetTop + visual.height - 7;
      })()`);
      await browser.evaluate(`document.querySelector('.guided-scope-bar')?.scrollBy({ top: 90 })`);
      await browser.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
      expect(await browser.evaluate<boolean>(`(() => {
        const popover = document.querySelector('.guided-select-popover');
        const visual = window.visualViewport;
        if (!(popover instanceof HTMLElement) || !visual || popover.parentElement !== document.body) return false;
        const bounds = popover.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + Math.min(18, bounds.height / 2));
        return bounds.left >= visual.offsetLeft + 7
          && bounds.right <= visual.offsetLeft + visual.width - 7
          && bounds.top >= visual.offsetTop + 7
          && bounds.bottom <= visual.offsetTop + visual.height - 7
          && Boolean(hit?.closest('.guided-select-popover'));
      })()`)).toBe(true);
      const atlasAfter = await browser.evaluate<{ width: number; height: number }>(`(() => {
        const atlas = document.querySelector('.map-canvas-shell')?.getBoundingClientRect();
        if (!atlas) throw new Error('Missing atlas');
        return { width: atlas.width, height: atlas.height };
      })()`);
      expect(Math.abs(atlasAfter.width - atlasBefore.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(atlasAfter.height - atlasBefore.height)).toBeLessThanOrEqual(2);
      await browser.key('Escape');
      expect(await browser.count('body > .guided-select-popover')).toBe(0);
      await browser.pageScale(1);
    }, { observations: 12 });
  }, 40_000);
});
