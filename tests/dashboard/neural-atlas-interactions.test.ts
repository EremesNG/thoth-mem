import { describe, expect, it } from 'vitest';

import { withDashboardBrowser } from './dashboard-browser-harness.js';

interface MotionProbe {
  x: number;
  y: number;
  tick: number;
}

describe('Neural Atlas interaction and motion', () => {
  it('stays subtly alive and becomes still on explicit pause', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready' && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-initial-settled') === 'true'`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.hasAttribute('data-motion-probe')`);

      const readProbe = async () => JSON.parse(
        await browser.attribute('[data-testid="map-canvas-shell"]', 'data-motion-probe'),
      ) as MotionProbe;
      const before = await readProbe();
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 1100))`);
      const after = await readProbe();
      const drift = Math.hypot(after.x - before.x, after.y - before.y);

      expect(after.tick).toBeGreaterThan(before.tick);
      expect(drift).toBeGreaterThan(0.05);
      expect(drift).toBeLessThanOrEqual(12);

      await browser.click('button[title="Pause or resume (P)"]');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-paused') === 'true'`);
      const pausedBefore = await readProbe();
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 900))`);
      const pausedAfter = await readProbe();

      expect(pausedAfter).toEqual(pausedBefore);
    }, { observations: 48 });
  }, 40_000);

  it('keeps the atlas still under reduced motion while every command remains reachable', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.reducedMotion();
      await browser.viewport(1024, 768);
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`);
      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`document.querySelector('.graph-trail-bar')?.getAttribute('data-active') === 'true'`);

      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-reduced-motion')).toBe('true');
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-transition-duration')).toBe('0');
      expect(await browser.count('.graph-command-bar button')).toBe(5);
      expect(await browser.count('.graph-trail-bar button')).toBe(5);

      const controlsInside = await browser.evaluate<boolean>(`(() => {
        const stage=document.querySelector('.map-stage')?.getBoundingClientRect();
        if (!stage) return false;
        return [...document.querySelectorAll('.graph-command-bar button,.graph-trail-bar button')].every((button) => {
          const rect=button.getBoundingClientRect();
          return rect.left >= stage.left - 1 && rect.right <= stage.right + 1 && rect.top >= stage.top - 1 && rect.bottom <= stage.bottom + 1;
        });
      })()`);
      expect(controlsInside).toBe(true);
    }, { observations: 24 });
  }, 40_000);

  it('stops every live simulation after a WebGL context loss', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready' && document.querySelector('[data-testid="map-canvas-shell"]')?.hasAttribute('data-motion-probe')`);

      await browser.evaluate(`(() => {
        const canvas = document.querySelector('.cosmos-graph-host canvas');
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing live Cosmos canvas');
        canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      })()`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'failed'`);
      const failedProbe = await browser.attribute('[data-testid="map-canvas-shell"]', 'data-motion-probe');
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 2300))`);

      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-renderer-status')).toBe('failed');
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-motion-probe')).toBe(failedProbe);
    }, { observations: 32 });
  }, 40_000);
});
