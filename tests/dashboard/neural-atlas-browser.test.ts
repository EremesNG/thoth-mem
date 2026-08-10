import { describe, expect, it } from 'vitest';

import { withDashboardBrowser } from './dashboard-browser-harness.js';

function denseAtlasSlice() {
  const nodes = Array.from({ length: 120 }, (_, index) => {
    const community = index % 6;
    const angle = (index / 120) * Math.PI * 12;
    return {
      id: `obs:${index + 1}`,
      kind: 'observation',
      label: `Atlas memory ${index + 1}`,
      snippet: 'A public memory in the neural atlas.',
      project: 'browser-nebula',
      session_id: `session-${index % 8}`,
      topic_key: `atlas/community-${community}`,
      type: index % 2 ? 'decision' : 'discovery',
      seed_x: Math.cos(angle) * (2 + community * 0.4) + community * 4,
      seed_y: Math.sin(angle) * (1.2 + community * 0.25) + (community % 2) * 2,
    };
  });
  const edges = Array.from({ length: 240 }, (_, index) => ({
    id: `edge:${index}`,
    source_id: `obs:${(index % 120) + 1}`,
    target_id: `obs:${((index * 7 + (index % 6) + 11) % 120) + 1}`,
    relation: index % 3 ? 'SUPPORTS' : 'RELATES_TO',
    kind: index % 3 ? 'semantic' : 'metadata',
    label: 'Related memory',
    summary: 'A public relationship.',
  }));
  return {
    nodes,
    edges,
    state: 'dense',
    continuation: null,
    truncated: false,
    health: { semantic_state: 'ready', pending_jobs: 0 },
  };
}

describe('immersive Neural Atlas production route', () => {
  it('honors Pause when it is requested before the renderer finishes starting', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelector('button[aria-label="Pause motion"]') !== null && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'loading'`);
      await browser.click('button[aria-label="Pause motion"]');
      await browser.waitFor(`document.querySelector('button[aria-label="Resume motion"]') !== null`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`);

      const readProbe = () => browser.evaluate<string | null>(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-motion-probe') ?? null`);
      const before = await readProbe();
      await new Promise((resolve) => setTimeout(resolve, 2_300));
      const after = await readProbe();

      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-paused')).toBe('true');
      expect(after).toBe(before);
    }, { observations: 24 });
  }, 40_000);

  it('renders a dense irregular memory world and keeps every overlay inside the atlas', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.setRoutes([{ includes: '/viz/slice', status: 200, body: denseAtlasSlice() }]);
      await browser.viewport(1440, 900);
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready' && document.querySelectorAll('.graph-navigator li').length === 120`);

      const wholeAtlas = await browser.evaluate<{
        stageRatio: number;
        stageWidth: number;
        canvasWidth: number;
        canvasHeight: number;
        scrollHeight: number;
        viewportHeight: number;
      }>(`(() => {
        const stage = document.querySelector('.map-stage')?.getBoundingClientRect();
        const canvas = document.querySelector('[data-testid="map-canvas-shell"]')?.getBoundingClientRect();
        if (!stage || !canvas) throw new Error('Missing immersive atlas geometry');
        return {
          stageRatio: stage.width / stage.height,
          stageWidth: stage.width,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          scrollHeight: document.documentElement.scrollHeight,
          viewportHeight: innerHeight,
        };
      })()`);
      expect(wholeAtlas.stageRatio).toBeGreaterThan(1.45);
      expect(wholeAtlas.stageWidth).toBeGreaterThan(1_000);
      expect(wholeAtlas.scrollHeight).toBeLessThanOrEqual(wholeAtlas.viewportHeight + 2);
      expect(Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-point-max'))).toBeLessThanOrEqual(8);
      expect(Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-link-min'))).toBeGreaterThanOrEqual(0.8);
      expect(Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-world-aspect'))).toBeGreaterThan(1.2);

      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`document.querySelector('.atlas-dock')?.getAttribute('data-open') === 'true'`);
      const focused = await browser.evaluate<{ width: number; height: number; dockInside: boolean; dialogCount: number }>(`(() => {
        const stage = document.querySelector('.map-stage')?.getBoundingClientRect();
        const canvas = document.querySelector('[data-testid="map-canvas-shell"]')?.getBoundingClientRect();
        const dock = document.querySelector('.atlas-dock')?.getBoundingClientRect();
        if (!stage || !canvas || !dock) throw new Error('Missing focused atlas geometry');
        return {
          width: canvas.width,
          height: canvas.height,
          dockInside: dock.left >= stage.left - 1 && dock.right <= stage.right + 1 && dock.top >= stage.top - 1 && dock.bottom <= stage.bottom + 1,
          dialogCount: document.querySelectorAll('[role="dialog"]').length,
        };
      })()`);
      expect(Math.abs(focused.width - wholeAtlas.canvasWidth)).toBeLessThanOrEqual(2);
      expect(Math.abs(focused.height - wholeAtlas.canvasHeight)).toBeLessThanOrEqual(2);
      expect(focused.dockInside).toBe(true);
      expect(focused.dialogCount).toBe(0);

      const unreachableControls = async () => browser.evaluate<Array<{ label: string; rect: string; hit: string }>>(`(() => {
        const buttons = [...document.querySelectorAll('.graph-command-bar button:not(:disabled), .graph-trail-bar button:not(:disabled)')];
        if (buttons.length !== 10) return [{ label: 'atlas controls', rect: '', hit: 'expected 10, found ' + buttons.length }];
        return buttons.flatMap((button) => {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          const reachable = rect.width > 0 && rect.height > 0 && Boolean(hit && (hit === button || button.contains(hit)));
          return reachable ? [] : [{
            label: button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent ?? '',
            rect: [rect.left, rect.top, rect.right, rect.bottom].map((value) => Math.round(value)).join(','),
            hit: hit instanceof Element ? hit.tagName.toLowerCase() + '.' + String(hit.className) : 'none',
          }];
        });
      })()`);
      await browser.viewport(1024, 768);
      expect(await unreachableControls()).toEqual([]);

      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.waitFor(`document.querySelectorAll('#atlas-scope-panel [role="combobox"]').length === 6`);
      await browser.click('button[aria-label="Close filters"]');
      await browser.viewport(360, 800);
      expect(await unreachableControls()).toEqual([]);
      await browser.pageScale(2);
      await browser.waitFor(`document.querySelector('[data-testid="neural-atlas-workspace"]')?.getAttribute('data-visual-scale') === '2' && Number(document.querySelector('[data-testid="neural-atlas-workspace"]')?.getAttribute('data-visual-width')) <= 181`);
      expect(await browser.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      expect(await browser.evaluate<boolean>(`(() => {
        const dock = document.querySelector('.atlas-dock')?.getBoundingClientRect();
        return Boolean(dock && dock.left >= 0 && dock.right <= innerWidth + 1 && dock.bottom <= innerHeight + 1);
      })()`)).toBe(true);
      expect(await browser.evaluate<Array<{ label: string; rect: string; hit: string; viewport: string }>>(`(() => {
        const viewport = visualViewport;
        if (!viewport) return [{ label: 'visual viewport', rect: '', hit: 'missing', viewport: '' }];
        const left = viewport.offsetLeft;
        const top = viewport.offsetTop;
        const right = left + viewport.width;
        const bottom = top + viewport.height;
        const dock = document.querySelector('.atlas-dock');
        const workspace = document.querySelector('[data-testid="neural-atlas-workspace"]');
        const dockMetrics = dock instanceof Element
          ? ' dock=' + [dock.getBoundingClientRect().left, dock.getBoundingClientRect().right, getComputedStyle(dock).width].join('/')
          : '';
        const visualWidthVariable = workspace instanceof HTMLElement ? workspace.style.getPropertyValue('--atlas-visual-width') : '';
        const controls = [...document.querySelectorAll(
          '.observatory-toolbar button, .graph-command-bar button:not(:disabled), .graph-trail-bar button:not(:disabled), .atlas-dock-header button, .atlas-dock-tabs button',
        )];
        if (controls.length < 18) return [{ label: 'responsive controls', rect: '', hit: 'expected at least 18, found ' + controls.length, viewport: '' }];
        return controls.flatMap((control) => {
          const rect = control.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const hit = document.elementFromPoint(centerX, centerY);
          const reachable = rect.left >= left - 1 && rect.right <= right + 1 && rect.top >= top - 1 && rect.bottom <= bottom + 1
            && Boolean(hit && (hit === control || control.contains(hit)));
          return reachable ? [] : [{
            label: control.getAttribute('aria-label') ?? control.getAttribute('title') ?? control.textContent ?? '',
            rect: [rect.left, rect.top, rect.right, rect.bottom].map((value) => Math.round(value)).join(','),
            hit: hit instanceof Element ? hit.tagName.toLowerCase() + '.' + String(hit.className) : 'none',
            viewport: [left, top, right, bottom].map((value) => Math.round(value)).join(',') + dockMetrics + ' var=' + visualWidthVariable,
          }];
        });
      })()`)).toEqual([]);
      await browser.pageScale(1);

      expect(await browser.text('body')).not.toMatch(/HIDDEN_\d+/);
      expect(browser.requests.filter((request) => !request.url.startsWith(browser.origin) && !request.url.startsWith('data:'))).toHaveLength(0);
      await browser.clearRoutes();
    }, { observations: 24 });
  }, 40_000);
});
