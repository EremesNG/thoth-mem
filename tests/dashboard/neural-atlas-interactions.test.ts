import { describe, expect, it } from 'vitest';

import { withDashboardBrowser } from './dashboard-browser-harness.js';

interface MotionProbe {
  x: number;
  y: number;
  tick: number;
}

interface ContinuitySample {
  maximumGapMs: number;
  movingWindows: number;
  windowCount: number;
  totalDrift: number;
  sampleCount: number;
  first: MotionProbe | null;
  last: MotionProbe | null;
}

interface DynamicAtlasExtent {
  worldWidth: number;
  worldHeight: number;
  worldAspect: number;
  screenWidth: number;
  screenHeight: number;
  screenAspect: number;
}

const enterCommunity = async (browser: import('./dashboard-browser-harness.js').DashboardBrowser) => {
  await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'universe'`, 30_000);
  await browser.evaluate(`document.querySelector('.graph-navigator li > button:first-child')?.click()`);
  await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'community' && document.querySelectorAll('.graph-navigator li').length > 1`, 30_000);
  await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`, 30_000);
};

describe('Neural Atlas interaction and motion', () => {
  it('stays subtly alive and becomes still on explicit pause', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/?project=browser-nebula');
      await enterCommunity(browser);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready' && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-initial-settled') === 'true'`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-final-fit-settled') === 'true'`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.hasAttribute('data-motion-probe')`);

      const readProbe = async () => JSON.parse(
        await browser.attribute('[data-testid="map-canvas-shell"]', 'data-motion-probe'),
      ) as MotionProbe;
      const continuity = await browser.evaluate<ContinuitySample>(`new Promise((resolve) => {
        const shell = document.querySelector('[data-testid="map-canvas-shell"]');
        if (!(shell instanceof HTMLElement)) throw new Error('Missing motion shell');
        const startedAt = performance.now();
        const samples = [];
        const read = () => {
          const raw = shell.getAttribute('data-motion-probe');
          if (!raw) return;
          samples.push({ at: performance.now() - startedAt, ...JSON.parse(raw) });
        };
        read();
        const observer = new MutationObserver(read);
        observer.observe(shell, { attributes: true, attributeFilter: ['data-motion-probe'] });
        setTimeout(() => {
          observer.disconnect();
          read();
          const boundaries = [0, ...samples.map((sample) => sample.at), 3_100];
          const maximumGapMs = Math.max(...boundaries.slice(1).map((value, index) => value - boundaries[index]));
          const windowCount = 6;
          let movingWindows = 0;
          for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
            const start = windowIndex * 500;
            const end = start + 500;
            const windowSamples = samples.filter((sample) => sample.at >= start && sample.at <= end);
            if (windowSamples.length >= 2 && windowSamples.at(-1).tick > windowSamples[0].tick) movingWindows += 1;
          }
          const first = samples[0];
          const last = samples.at(-1);
          resolve({
            maximumGapMs,
            movingWindows,
            windowCount,
            totalDrift: first && last ? Math.hypot(last.x - first.x, last.y - first.y) : 0,
            sampleCount: samples.length,
            first: first ?? null,
            last: last ?? null,
          });
        }, 3_100);
      })`);

      expect(continuity.maximumGapMs).toBeLessThanOrEqual(250);
      expect(continuity.movingWindows).toBe(continuity.windowCount);
      expect(continuity.totalDrift, JSON.stringify(continuity)).toBeLessThanOrEqual(24);
      expect(continuity.last?.tick ?? 0).toBeGreaterThan(continuity.first?.tick ?? 0);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-ambient-starts')).toBe('1');

      await browser.click('button[title="Pause or resume (P)"]');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-paused') === 'true'`);
      const pausedBefore = await readProbe();
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 2300))`);
      const pausedAfter = await readProbe();

      expect(pausedAfter).toEqual(pausedBefore);

      await browser.click('button[title="Pause or resume (P)"]');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-paused') === 'false'`);
      const resumedBefore = await readProbe();
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 600))`);
      expect((await readProbe()).tick).toBeGreaterThan(resumedBefore.tick);

      await browser.evaluate(`(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      })()`);
      const hiddenBefore = await readProbe();
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 650))`);
      expect(await readProbe()).toEqual(hiddenBefore);

      await browser.evaluate(`(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
      })()`);
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 650))`);
      expect((await readProbe()).tick).toBeGreaterThan(hiddenBefore.tick);
    }, { observations: 48 });
  }, 50_000);

  it('keeps the live simulated and screen-space field extent stable during ambient motion', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/?project=browser-nebula');
      await enterCommunity(browser);
      const shell = '[data-testid="map-canvas-shell"]';
      await browser.waitFor(`document.querySelector('${shell}')?.getAttribute('data-renderer-status') === 'ready' && document.querySelector('${shell}')?.getAttribute('data-initial-settled') === 'true'`);
      await browser.waitFor(`document.querySelector('${shell}')?.getAttribute('data-final-fit-settled') === 'true' && Number(document.querySelector('${shell}')?.getAttribute('data-motion-diagnostics-epoch') ?? 0) >= 1`);
      await browser.waitFor(`Number(document.querySelector('${shell}')?.getAttribute('data-simulated-world-width') ?? 0) > 0 && Number(document.querySelector('${shell}')?.getAttribute('data-screen-field-width') ?? 0) > 0`);
      await browser.waitFor(`document.querySelector('${shell}')?.hasAttribute('data-motion-probe')`);

      const readExtent = async () => browser.evaluate<DynamicAtlasExtent>(`(() => {
        const shell = document.querySelector('[data-testid="map-canvas-shell"]');
        if (!(shell instanceof HTMLElement)) throw new Error('Missing map shell');
        const number = (name) => Number(shell.getAttribute(name));
        return {
          worldWidth: number('data-simulated-world-width'),
          worldHeight: number('data-simulated-world-height'),
          worldAspect: number('data-simulated-world-aspect'),
          screenWidth: number('data-screen-field-width'),
          screenHeight: number('data-screen-field-height'),
          screenAspect: number('data-screen-field-aspect'),
        };
      })()`);
      const before = await readExtent();
      const beforeProbe = JSON.parse(await browser.attribute(shell, 'data-motion-probe')) as MotionProbe;
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 12_000))`);
      const after = await readExtent();
      const afterProbe = JSON.parse(await browser.attribute(shell, 'data-motion-probe')) as MotionProbe;
      const relativeChange = (left: number, right: number) => Math.abs(right - left) / Math.max(1, left);

      expect(afterProbe.tick).toBeGreaterThan(beforeProbe.tick);
      expect(relativeChange(before.worldWidth, after.worldWidth)).toBeLessThanOrEqual(0.04);
      expect(relativeChange(before.worldHeight, after.worldHeight)).toBeLessThanOrEqual(0.04);
      expect(relativeChange(before.worldAspect, after.worldAspect)).toBeLessThanOrEqual(0.05);
      expect(relativeChange(before.screenWidth, after.screenWidth)).toBeLessThanOrEqual(0.04);
      expect(relativeChange(before.screenHeight, after.screenHeight)).toBeLessThanOrEqual(0.04);
      expect(relativeChange(before.screenAspect, after.screenAspect)).toBeLessThanOrEqual(0.05);
      expect(Number(await browser.attribute(shell, 'data-maximum-tick-gap'))).toBeLessThanOrEqual(250);
      expect(Number(await browser.attribute(shell, 'data-maximum-step'))).toBeLessThanOrEqual(8);
    }, { observations: 180, faultInjection: { deadlineMs: 40_000 } });
  }, 50_000);

  it('keeps the atlas still under reduced motion while every command remains reachable', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.reducedMotion();
      await browser.viewport(1024, 768);
      await browser.goto('/?project=browser-nebula');
      await enterCommunity(browser);
      await browser.evaluate(`document.querySelector('.graph-navigator li > button:first-child')?.click()`);
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'neighborhood'`, 30_000);
      await browser.waitFor(`document.querySelector('.graph-trail-bar')?.getAttribute('data-active') === 'true'`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-reduced-motion') === 'true'`, 30_000);

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
      await enterCommunity(browser);
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
