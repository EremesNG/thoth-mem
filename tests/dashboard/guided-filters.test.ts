import { describe, expect, it } from 'vitest';

import { withDashboardBrowser } from './dashboard-browser-harness.js';

describe('guided observatory filters', () => {
  it('commits only searchable canonical options with complete keyboard semantics', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
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
