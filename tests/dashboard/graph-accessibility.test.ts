import { describe, expect, it } from 'vitest';
import { accessibleNodeSummary, graphCommandForKey } from '../../dashboard/src/components/map/map-navigation.js';
import { withDashboardBrowser } from './dashboard-browser-harness.js';

describe('graph accessibility facilities', () => {
  it('exposes every viewport, traversal, selection, expansion, pan, and clear command', () => {
    const keys=['0','+','-','r','p','ArrowRight','ArrowLeft','Enter','e','h','j','k','l','Escape'];
    expect(keys.map(graphCommandForKey)).toEqual(['fit','zoom-in','zoom-out','reset','toggle-pause','next','previous','select','expand','pan-left','pan-down','pan-up','pan-right','clear']);
  });
  it('produces a private-safe semantic node name',()=>{
    expect(accessibleNodeSummary({id:'obs:1',kind:'observation',label:'Visible <private>secret</private>',snippet:'',project:null,topic_key:null,type:'decision',seed_x:0,seed_y:0},'SUPPORTS')).toBe('observation, Visible, decision, SUPPORTS');
  });
  it('mounts one viewport-dominant world-first Neural Atlas', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready' && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-initial-settled') === 'true'`);

      const metrics = await browser.evaluate<{
        atlas: { left: number; top: number; right: number; bottom: number; width: number; height: number };
        stage: { left: number; top: number; right: number; bottom: number; width: number; height: number };
        canvas: { left: number; top: number; right: number; bottom: number; width: number; height: number };
        controlsInside: boolean;
        scrollHeight: number;
        viewport: { width: number; height: number };
        worldAspect: number;
        pointMax: number;
        linkMin: number;
      }>(`(() => {
        const atlas = document.querySelector('[data-testid="neural-atlas-workspace"]');
        const stage = document.querySelector('.map-stage');
        const canvas = document.querySelector('[data-testid="map-canvas-shell"]');
        if (!(atlas instanceof HTMLElement) || !(stage instanceof HTMLElement) || !(canvas instanceof HTMLElement)) {
          throw new Error('Missing immersive atlas surface');
        }
        const atlasRect = atlas.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const controls = [...stage.querySelectorAll('button')].filter((button) => {
          const style = getComputedStyle(button);
          return style.display !== 'none' && style.visibility !== 'hidden' && button.getClientRects().length > 0;
        });
        const controlsInside = controls.every((control) => {
          const rect = control.getBoundingClientRect();
          return rect.left >= stageRect.left - 1 && rect.right <= stageRect.right + 1 && rect.top >= stageRect.top - 1 && rect.bottom <= stageRect.bottom + 1;
        });
        return {
          atlas: atlasRect.toJSON(),
          stage: stageRect.toJSON(),
          canvas: canvasRect.toJSON(),
          controlsInside,
          scrollHeight: document.documentElement.scrollHeight,
          viewport: { width: innerWidth, height: innerHeight },
          worldAspect: Number(canvas.getAttribute('data-world-aspect')),
          pointMax: Number(canvas.getAttribute('data-point-max')),
          linkMin: Number(canvas.getAttribute('data-link-min')),
        };
      })()`);

      expect(metrics.atlas.height).toBeGreaterThanOrEqual(metrics.viewport.height - 2);
      expect(metrics.stage.width / metrics.stage.height).toBeGreaterThanOrEqual(1.45);
      expect(metrics.stage.width).toBeGreaterThan(metrics.viewport.width * 0.7);
      expect(metrics.canvas.width).toBeCloseTo(metrics.stage.width, 0);
      expect(metrics.canvas.height).toBeCloseTo(metrics.stage.height, 0);
      expect(metrics.controlsInside).toBe(true);
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.viewport.height + 2);
      expect(metrics.worldAspect).toBeGreaterThan(0);
      expect(metrics.pointMax).toBeLessThanOrEqual(8);
      expect(metrics.linkMin).toBeGreaterThanOrEqual(0.8);
    }, { observations: 48 });
  }, 40_000);
  it('runs the living constellation through the real GPU renderer', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready' && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-initial-settled') === 'true'`);

      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-renderer')).toBe('cosmos');
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-visual-language')).toBe('organic-neural');
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-point-shape')).toBe('circle');
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-curved-links')).toBe('true');
      expect(Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-community-count'))).toBeGreaterThan(0);
      expect(await browser.count('.cosmos-graph-host canvas')).toBe(1);
      expect(await browser.count('.map-legend')).toBe(0);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-initial-settled')).toBe('true');

      await browser.clickText('.graph-navigator li > button:first-child', 'Browser memory 1');
      await browser.waitFor(`new URLSearchParams(location.search).has('focus')`);
      const navigatorFocus = await browser.evaluate<string>(`new URLSearchParams(location.search).get('focus') ?? ''`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === ${JSON.stringify(navigatorFocus)} && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-motion-phase') === 'idle'`);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-focus-id')).toBe(navigatorFocus);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-last-transition')).toBe('focus');
      expect(await browser.count('.cosmos-node-aura[data-role="focus"]')).toBe(1);
      expect(await browser.count('.cosmos-node-label[data-role="focus"]')).toBe(1);
      expect(await browser.count('.cosmos-node-label[data-role="neighbor"]')).toBeGreaterThan(0);
      expect(await browser.text('.cosmos-node-label[data-role="focus"]')).toContain('Browser memory 1');
      expect(await browser.evaluate<number>(`(() => {
        const labels = [...document.querySelectorAll('.cosmos-node-label')]
          .filter((label) => label instanceof HTMLElement && getComputedStyle(label).display !== 'none')
          .map((label) => label.getBoundingClientRect());
        let overlaps = 0;
        for (let left = 0; left < labels.length; left += 1) {
          for (let right = left + 1; right < labels.length; right += 1) {
            const a = labels[left];
            const b = labels[right];
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps += 1;
          }
        }
        return overlaps;
      })()`)).toBe(0);

      await browser.click('button[title="Clear focus (Escape)"]');
      await browser.click('button[title="Pause or resume (P)"]');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas"]')?.hasAttribute('data-pointer-probe-x') && document.querySelector('[data-testid="map-canvas"]')?.hasAttribute('data-pointer-probe-y')`);
      await browser.evaluate(`document.querySelector('.map-stage')?.scrollIntoView({ block: 'center' })`);
      const pointerPosition = await browser.evaluate<{ clientX: number; clientY: number }>(`(() => {
        const canvas = document.querySelector('.cosmos-graph-host canvas');
        const host = document.querySelector('[data-testid="map-canvas"]');
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing Cosmos canvas');
        if (!(host instanceof HTMLElement)) throw new Error('Missing Cosmos host');
        const rect = canvas.getBoundingClientRect();
        const probeX = host.getAttribute('data-pointer-probe-x');
        const probeY = host.getAttribute('data-pointer-probe-y');
        const clientX = rect.left + Number(probeX);
        const clientY = rect.top + Number(probeY);
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
          throw new Error(JSON.stringify({ probeX, probeY, rect: rect.toJSON() }));
        }
        const hit = document.elementFromPoint(clientX, clientY);
        return { clientX, clientY, hit: hit === canvas ? 'canvas' : hit?.className || hit?.nodeName || 'none', viewport: [innerWidth, innerHeight], rect: rect.toJSON() };
      })()`);
      if ((pointerPosition as { hit?: string }).hit !== 'canvas') throw new Error(`Pointer target obscured: ${JSON.stringify(pointerPosition)}`);
      await browser.mouseMove(pointerPosition.clientX, pointerPosition.clientY);
      await browser.waitFor(`Boolean(document.querySelector('.cosmos-point-tooltip')?.textContent)`);
      await browser.mouseClick(pointerPosition.clientX, pointerPosition.clientY);
      await browser.waitFor(`new URLSearchParams(location.search).has('focus')`);
      const pointerFocus = await browser.evaluate<string>(`new URLSearchParams(location.search).get('focus') ?? ''`);
      await browser.click('button[title="Pause or resume (P)"]');

      const datasetVersion = Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-dataset-version'));
      await browser.setRoutes([{ includes: '/observatory/map/frontier', method: 'POST', status: 200, body: {
        nodes: [{ id: 'obs:999', kind: 'observation', label: 'Newly connected memory', snippet: 'A memory entering the visible neighborhood.', project: 'browser-nebula', session_id: 'browser-session', topic_key: 'browser/alpha', type: 'discovery', seed_x: 0.72, seed_y: 0.28 }],
        edges: [{ id: 'edge:expansion', source_id: pointerFocus, target_id: 'obs:999', relation: 'SUPPORTS', kind: 'semantic', label: 'Supports', summary: 'A newly revealed relationship.' }],
        frontier_state: { added_node_ids: ['obs:999'], already_visible_node_ids: [], exhausted: true, continuation: null, reason: 'no-neighbors' },
        health: { semantic_state: 'ready', pending_jobs: 0 },
      } }]);
      await browser.click('button[title="Expand selected memory (E)"]');
      await browser.waitFor(`Number(document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-dataset-version')) > ${datasetVersion}`);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-last-transition')).toBe('expansion');
      await browser.clearRoutes();

      for (const title of ['Fit visible nodes (0)', 'Zoom in (+)', 'Zoom out (-)', 'Reset viewport (R)']) {
        await browser.click(`button[title=${JSON.stringify(title)}]`);
      }
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-last-command')).toBe('reset');

      await browser.click('button[title="Pause or resume (P)"]');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-paused') === 'true'`);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-paused')).toBe('true');

      await browser.reducedMotion();
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-reduced-motion')).toBe('true');
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-transition-duration')).toBe('0');
    });
  }, 40_000);
  it('executes pointer and keyboard graph commands with kind-aware Lens behavior in a real browser', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/?project=browser-nebula&focus=obs%3A1'); await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 1`);
      const focusText = async () => await browser.text('.observatory-context-strip span:nth-child(3)');
      const initial = await focusText();
      for (const title of ['Fit visible nodes (0)','Zoom in (+)','Zoom out (-)','Reset viewport (R)','Pause or resume (P)','Pan left (H)','Pan down (J)','Pan up (K)','Pan right (L)']) await browser.click(`button[title=${JSON.stringify(title)}]`);
      expect(await focusText()).toBe(initial);
      await browser.click('button[title="Next connected memory (Arrow Right)"]'); const pointerNext=await focusText();
      await browser.click('button[title="Previous connected memory (Arrow Left)"]'); const pointerPrevious=await focusText(); expect(pointerNext).not.toBe(initial); expect(pointerPrevious).not.toBe(pointerNext);
      await browser.click('button[title="Open memory overview (Enter)"]'); await browser.waitFor(`document.querySelector('.memory-overview .node-kind')?.getAttribute('data-node-kind') === 'observation'`);
      await browser.click('button[title="Expand selected memory (E)"]'); expect(await focusText()).toBe(pointerPrevious);
      for(const [kind,label] of [['project','Project:'],['session','Work session:'],['topic','Topic:']] as const){
        await browser.click('button[title="Clear focus (Escape)"]'); await browser.clickText('.graph-navigator li > button:first-child',label); await browser.waitFor(`document.querySelector('.memory-overview .node-kind')?.getAttribute('data-node-kind') === '${kind}'`);
        expect(await browser.text('.memory-overview')).toContain('Explore connections'); expect(await browser.text('.memory-overview')).toContain('Find related');
        expect(browser.requests.filter((request) => request.url.includes(`/viz/inspect/node/${kind}:`))).toHaveLength(0);
      }
      const fact={id:'fact:synthetic',kind:'fact',label:'Sanitized local fact',snippet:'Useful local fact detail',project:'browser-nebula',session_id:'browser-session',topic_key:'browser/alpha',type:null,seed_x:.4,seed_y:.5};
      await browser.setRoutes([{includes:'/viz/slice',status:200,body:{nodes:[fact],edges:[],state:'sparse',continuation:null,truncated:false,health:{semantic_state:'ready',pending_jobs:0}}}]); await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`[...document.querySelectorAll('.graph-navigator li > button:first-child')].some((button)=>button.textContent?.includes('Learned fact:'))`); await browser.clickText('.graph-navigator li > button:first-child','Learned fact:'); await browser.waitFor(`document.querySelector('.memory-overview .node-kind')?.getAttribute('data-node-kind') === 'fact'`);
      expect(await browser.text('.memory-overview')).toContain('Useful local fact detail'); expect(browser.requests.filter((request)=>request.url.includes('/viz/inspect/node/fact:'))).toHaveLength(0); await browser.clearRoutes();
      await browser.goto('/?project=browser-nebula&focus=obs%3A1'); await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 1`); await browser.click('button[title="Clear focus (Escape)"]'); expect(await focusText()).toContain('whole constellation');
      await browser.clickText('.graph-navigator li > button:first-child','Browser memory 1');
      for (const key of ['0','+','-','r','p','h','j','k','l','ArrowRight','ArrowRight','ArrowLeft','Enter','e']) await browser.key(key);
      expect(await focusText()).not.toContain('whole constellation'); expect(await browser.count('.memory-overview')).toBe(1);
      await browser.key('Escape'); expect(await focusText()).toContain('whole constellation');
      for (const [width,height] of [[1440,900],[1024,768],[360,800]]) { await browser.viewport(width,height); expect(await browser.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth')).toBe(true); }
      await browser.reducedMotion(); expect(await browser.evaluate<boolean>(`matchMedia('(prefers-reduced-motion: reduce)').matches`)).toBe(true);
      expect(browser.requests.filter((request) => !request.url.startsWith(browser.origin) && !request.url.startsWith('data:'))).toHaveLength(0);
    });
  }, 40_000);
  it('keeps the focused label visible when a zoomed constellation resizes to mobile', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready' && document.querySelectorAll('.graph-navigator li').length > 0`);
      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`document.querySelectorAll('.cosmos-node-label[data-role="focus"]').length === 1`);
      await browser.click('button[title="Zoom in (+)"]');
      await browser.click('button[title="Zoom in (+)"]');

      for (const [width, height] of [[1024, 768], [360, 800]] as const) {
        await browser.viewport(width, height);
        await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 350))`);
        expect(await browser.count('.cosmos-node-label[data-role="focus"]')).toBe(1);
        expect(await browser.evaluate<boolean>(`(() => {
          const host=document.querySelector('.cosmos-graph-host')?.getBoundingClientRect();
          const label=document.querySelector('.cosmos-node-label[data-role="focus"]')?.getBoundingClientRect();
          return Boolean(host && label && label.left >= host.left && label.right <= host.right && label.top >= host.top && label.bottom <= host.bottom);
        })()`)).toBe(true);
      }
    }, { observations: 16 });
  }, 40_000);
  it('keeps exploration usable when the GPU view fails and restores it without losing focus', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/?project=browser-nebula');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'failed' && document.querySelectorAll('.graph-navigator li').length > 0`);
      const navigatorCount = await browser.count('.graph-navigator li');
      expect(await browser.text('.cosmos-renderer-fallback')).toContain('Rich constellation unavailable');
      expect(await browser.count('.cosmos-renderer-fallback button')).toBe(1);
      expect(await browser.evaluate<boolean>(`(() => {
        const navigator = document.querySelector('.graph-navigator');
        if (!(navigator instanceof HTMLElement)) return false;
        const rect = navigator.getBoundingClientRect();
        return getComputedStyle(navigator).clipPath === 'none' && rect.width > 240 && rect.height > 100;
      })()`)).toBe(true);

      await browser.clickText('.graph-navigator li > button:first-child', 'Browser memory 1');
      await browser.waitFor(`document.querySelector('.memory-overview h2')?.textContent?.includes('Browser memory 1')`);
      const focusedNavigatorCount = await browser.count('.graph-navigator li');
      const focusedLabel = await browser.text('.observatory-context-strip span:nth-child(3)');
      const focusedId = new URL(await browser.url()).searchParams.get('focus');
      expect(focusedLabel).toContain('Browser memory 1');

      await browser.evaluate(`globalThis.__THOTH_RESTORE_WEBGL__?.()`);
      await browser.click('.cosmos-renderer-fallback button');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`);
      expect(navigatorCount).toBeGreaterThan(focusedNavigatorCount);
      expect(await browser.count('.graph-navigator li')).toBe(focusedNavigatorCount);
      expect(await browser.text('.observatory-context-strip span:nth-child(3)')).toBe(focusedLabel);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-focus-id')).toBe(focusedId);

      await browser.pageScale(2);
      expect(await browser.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      await browser.pageScale(1);
      await browser.viewport(360, 800);
      await browser.coarsePointer();
      expect(await browser.evaluate<boolean>(`matchMedia('(pointer: coarse)').matches`)).toBe(true);
      expect(await browser.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      const mobileDock = await browser.evaluate<{ left: number; right: number; top: number; bottom: number; width: number; height: number; viewportWidth: number; viewportHeight: number }>(`(() => {
        const rect=document.querySelector('.atlas-dock')?.getBoundingClientRect();
        if (!rect) throw new Error('Missing mobile memory dock');
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
      })()`);
      expect(mobileDock.left).toBeGreaterThanOrEqual(0);
      expect(mobileDock.right).toBeLessThanOrEqual(mobileDock.viewportWidth + 1);
      expect(mobileDock.bottom).toBeLessThanOrEqual(mobileDock.viewportHeight + 1);
      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.click('[role="combobox"][aria-label="Project"]');
      expect(await browser.evaluate<boolean>(`(() => { const rect=document.querySelector('.guided-select-popover')?.getBoundingClientRect(); return Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight + 1); })()`)).toBe(true);
      await browser.key('Escape');
      expect(await browser.text('body')).not.toMatch(/HIDDEN_\d+/);
      expect(browser.requests.filter((request) => !request.url.startsWith(browser.origin) && !request.url.startsWith('data:'))).toHaveLength(0);
      await browser.goto('/console/operations');
      expect(await browser.count('[data-testid="map-canvas-shell"]')).toBe(0);
      expect(await browser.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      expect(await browser.count('.control-room .primary-action')).toBe(1);
    }, { observations: 12, webglDisabled: true });
  }, 40_000);
});
