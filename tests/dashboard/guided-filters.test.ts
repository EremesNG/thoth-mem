import { describe, expect, it } from 'vitest';

import { withDashboardBrowser } from './dashboard-browser-harness.js';

describe('guided observatory filters', () => {
  it('opens six structured choices on demand without taking height from the atlas', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`);
      const before = await browser.evaluate<{ height: number; scrollHeight: number }>(`(() => {
        const stage = document.querySelector('.map-stage')?.getBoundingClientRect();
        if (!stage) throw new Error('Missing atlas stage');
        return { height: stage.height, scrollHeight: document.documentElement.scrollHeight };
      })()`);

      expect(await browser.count('.guided-scope-bar [role="combobox"]')).toBe(0);
      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.waitFor(`document.querySelectorAll('#atlas-scope-panel [role="combobox"]').length === 6`);
      expect(await browser.attribute('button[aria-controls="atlas-scope-panel"]', 'aria-expanded')).toBe('true');
      expect(await browser.count('#atlas-scope-panel select')).toBe(0);

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
      await browser.waitFor(`new URLSearchParams(location.search).get('project') === 'browser-nebula'`);
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]') && !document.querySelector('[role="combobox"][aria-label="Session"]')?.hasAttribute('disabled')`);
      expect(await browser.attribute('[role="combobox"][aria-label="Project"]', 'aria-expanded')).toBe('false');

      await browser.click('[role="combobox"][aria-label="Session"]');
      await browser.fill('[role="combobox"][aria-label="Session"]', 'not-a-real-session');
      await browser.key('Enter');
      expect(new URL(await browser.url()).searchParams.get('session_id')).toBeNull();
      await browser.key('Escape');
      await browser.waitFor(`document.querySelector('[role="combobox"][aria-label="Session"]')?.getAttribute('aria-expanded') === 'false'`);
      expect(await browser.attribute('[role="combobox"][aria-label="Session"]', 'aria-expanded')).toBe('false');

      await browser.click('[role="combobox"][aria-label="Topic"]');
      await browser.fill('[role="combobox"][aria-label="Topic"]', 'beta');
      await browser.key('ArrowDown');
      await browser.key('Enter');
      await browser.waitFor(`new URLSearchParams(location.search).get('topic_key') === 'browser/beta'`);
      expect(browser.requests.some(({ url }) => url.includes('/viz/slice') && url.includes('topic_key=browser%2Fbeta'))).toBe(true);
    }, { observations: 12 });
  }, 40_000);

  it('presents bounded loading, empty, failure and retry states without freeing the value', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.setRoutes([{ includes: '/viz/filters', status: 503, body: 'Filter choices unavailable', delayMs: 120 }]);
      await browser.goto('/');
      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="error"]')`);
      expect(await browser.text('.guided-scope-resource')).toContain('Could not load filter choices');
      expect(await browser.count('.guided-scope-resource button')).toBe(1);

      await browser.clearRoutes();
      await browser.click('.guided-scope-resource button');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]')`);

      await browser.setRoutes([{ includes: '/viz/filters', status: 200, body: { projects: [], sessions: [], topic_keys: [], types: [], relations: [] } }]);
      await browser.clickText('.guided-scope-resource button', 'Refresh choices');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="empty"]')`);
      await browser.click('[role="combobox"][aria-label="Project"]');
      expect(await browser.text('.guided-select-popover')).toContain('No projects found');
      await browser.fill('[role="combobox"][aria-label="Project"]', 'invented-project');
      await browser.key('Enter');
      expect(new URL(await browser.url()).searchParams.get('project')).toBeNull();
    }, { observations: 4 });
  }, 40_000);
});
