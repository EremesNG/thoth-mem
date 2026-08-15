import { describe, expect, it } from 'vitest';
import { accessibleNodeSummary, connectedObservationIds, graphCommandForKey } from '../../dashboard/src/components/map/map-navigation.js';
import { DashboardBrowser, withDashboardBrowser } from './dashboard-browser-harness.js';

async function enterCommunity(browser: DashboardBrowser): Promise<void> {
  await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'universe'`, 30_000);
  await browser.evaluate(`document.querySelector('.graph-navigator li > button:first-child')?.click()`);
  await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'community' && document.querySelectorAll('.graph-navigator li').length > 1`, 30_000);
}

async function enterNeighborhood(browser: DashboardBrowser): Promise<void> {
  await enterCommunity(browser);
  await browser.clickText('.graph-navigator li > button:first-child', 'Browser memory 1');
  await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'neighborhood' && new URLSearchParams(location.search).has('focus')`, 30_000);
}

describe('graph accessibility facilities', () => {
  it('exposes distinct keyboard actions for a project nebula and its constellation cores', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`);
      expect(await browser.text('#graph-navigator-heading')).toBe('Projects and constellations');
      await browser.evaluate(`document.querySelector('.graph-project-groups .project-group-action')?.focus()`);
      await browser.key('Enter');
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'project' && new URLSearchParams(location.search).has('project_id')`);
      expect(await browser.text('#graph-navigator-heading')).toBe('Constellations in this project');
      await browser.back();
      await browser.waitFor(`!new URLSearchParams(location.search).has('level')`);
      await browser.evaluate(`document.querySelector('.graph-project-groups li[data-node-id] > button:first-child')?.focus()`);
      await browser.key(' ');
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'community' && new URLSearchParams(location.search).has('project_id')`);
      expect(await browser.text('#graph-navigator-heading')).toBe('Memories in this constellation');
    }, { observations: 24 });
  }, 45_000);

  it('keeps project contour and label hits distinct from contained Cosmos cores', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`);
      try {
        await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-region-screen-ready') === 'true'`, 30_000);
      } catch (cause) {
        const diagnostics = await browser.evaluate(`(() => {
          const shell = document.querySelector('[data-testid="map-canvas-shell"]');
          return {
            finalFit: shell?.getAttribute('data-final-fit-settled'),
            fitEpoch: shell?.getAttribute('data-fit-epoch'),
            finalFitEpoch: shell?.getAttribute('data-final-fit-epoch'),
            regionFitEpoch: shell?.getAttribute('data-region-fit-epoch'),
            regions: [...document.querySelectorAll('.semantic-region-layer g[data-region-id]')].map((group) => ({
              id: group.getAttribute('data-region-id'),
              sources: group.getAttribute('data-source-points'),
              bounds: group.getAttribute('data-region-bounds'),
              labelVisible: group.getAttribute('data-label-visible'),
            })),
          };
        })()`);
        throw new Error(`${cause instanceof Error ? cause.message : String(cause)}; ${JSON.stringify(diagnostics)}`);
      }
      await browser.click('button[aria-label="Pause motion"]');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-paused') === 'true'`);

      const target = async () => browser.evaluate<{
        projectId: string;
        label: { x: number; y: number };
        contour: { x: number; y: number };
        core: { id: string; x: number; y: number };
      }>(`(() => {
        const host = document.querySelector('.cosmos-graph-host')?.getBoundingClientRect();
        const group = [...document.querySelectorAll('.semantic-region-layer g[data-region-id]')].find((candidate) => candidate.querySelector(':scope > text'));
        const label = group?.querySelector(':scope > text')?.getBoundingClientRect();
        const path = group?.querySelector(':scope > path');
        const points = JSON.parse(group?.getAttribute('data-source-points') ?? '[]');
        if (!host || !group || !label || !(path instanceof SVGPathElement) || !points[0]?.id) throw new Error('Missing project interaction geometry');
        const local = path.getPointAtLength(Math.max(1, path.getTotalLength() * 0.08));
        const screen = local.matrixTransform(path.getScreenCTM());
        return {
          projectId: group.getAttribute('data-region-id') ?? '',
          label: { x: label.left + label.width / 2, y: label.top + label.height / 2 },
          contour: { x: screen.x, y: screen.y },
          core: { id: points[0].id, x: host.left + points[0].x, y: host.top + points[0].y },
        };
      })()`);

      const labelTarget = await target();
      await browser.mouseClick(labelTarget.label.x, labelTarget.label.y);
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'project' && new URLSearchParams(location.search).get('project_id') === ${JSON.stringify(labelTarget.projectId)}`);

      await browser.back();
      await browser.waitFor(`!new URLSearchParams(location.search).has('level') && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-region-screen-ready') === 'true'`);
      const contourTarget = await target();
      await browser.mouseClick(contourTarget.contour.x, contourTarget.contour.y);
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'project' && new URLSearchParams(location.search).get('project_id') === ${JSON.stringify(contourTarget.projectId)}`);

      await browser.back();
      await browser.waitFor(`!new URLSearchParams(location.search).has('level') && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-region-screen-ready') === 'true'`);
      const coreTarget = await target();
      await browser.mouseClick(coreTarget.core.x, coreTarget.core.y);
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'community' && new URLSearchParams(location.search).get('project_id') === ${JSON.stringify(coreTarget.projectId)}`);
      expect(new URL(await browser.url()).searchParams.get('community')).toBeTruthy();
    }, { observations: 72, projectCount: 6 });
  }, 55_000);

  it('reveals suppressed constellation and memory names on pointer hover without navigating', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-region-screen-ready') === 'true'`, 30_000);
      await browser.click('button[aria-label="Pause motion"]');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-paused') === 'true'`);

      const hoverSuppressedNode = async () => {
        await browser.waitFor(`document.querySelector('.semantic-node-hit-target[data-persistent-label="false"]')`);
        const target = await browser.evaluate<{ id: string; x: number; y: number; label: string }>(`(() => {
          const hit = document.querySelector('.semantic-node-hit-target[data-persistent-label="false"]');
          if (!(hit instanceof SVGCircleElement)) throw new Error('Missing suppressed semantic node target');
          const bounds = hit.getBoundingClientRect();
          const id = hit.getAttribute('data-node-id') ?? '';
          const label = document.querySelector('.graph-navigator li[data-node-id="' + CSS.escape(id) + '"] > button:first-child')?.textContent?.trim() ?? '';
          return { id, x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, label };
        })()`);
        const originalUrl = await browser.url();
        await browser.mouseMove(target.x, target.y);
        await browser.waitFor(`Boolean(document.querySelector('.cosmos-point-tooltip')?.textContent)`);
        expect(target.label).toContain(await browser.text('.cosmos-point-tooltip'));
        expect(await browser.url()).toBe(originalUrl);
      };

      await hoverSuppressedNode();
      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'community' && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-region-screen-ready') === 'true'`, 30_000);
      if (await browser.attribute('[data-testid="map-canvas-shell"]', 'data-paused') !== 'true') {
        await browser.click('button[aria-label="Pause motion"]');
      }
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-paused') === 'true'`);
      await hoverSuppressedNode();
    }, { observations: 72, projectCount: 6 });
  }, 55_000);

  it('exposes every viewport, traversal, selection, expansion, pan, and clear command', () => {
    const keys=['0','+','-','r','p','ArrowRight','ArrowLeft','Enter','e','h','j','k','l','Escape'];
    expect(keys.map(graphCommandForKey)).toEqual(['fit','zoom-in','zoom-out','reset','toggle-pause','next','previous','select','expand','pan-left','pan-down','pan-up','pan-right','clear']);
  });
  it('produces a private-safe semantic node name',()=>{
    expect(accessibleNodeSummary({id:'obs:1',kind:'observation',label:'Visible <private>secret</private>',snippet:'',project:null,topic_key:null,type:'decision',seed_x:0,seed_y:0},'SUPPORTS')).toBe('observation, Visible, decision, SUPPORTS');
  });
  it('keeps memory traversal on observations while evidence remains selectable', () => {
    const nodes = [
      { id: 'obs:1', kind: 'observation' as const, label: 'One', snippet: '', project: null, topic_key: null, type: 'decision' as const, seed_x: 0, seed_y: 0 },
      { id: 'obs:2', kind: 'observation' as const, label: 'Two', snippet: '', project: null, topic_key: null, type: 'decision' as const, seed_x: 1, seed_y: 0 },
      { id: 'fact:1', kind: 'fact' as const, label: 'Evidence', snippet: '', project: null, topic_key: null, type: null, seed_x: .5, seed_y: 0 },
    ];
    const edges = [
      { id: 'e:memory', source_id: 'obs:1', target_id: 'obs:2', relation: 'SUPPORTS', kind: 'semantic' as const, label: '', summary: '' },
      { id: 'e:fact', source_id: 'obs:1', target_id: 'fact:1', relation: 'HAS_FACT', kind: 'fact' as const, label: '', summary: '' },
    ];
    expect(connectedObservationIds('obs:1', nodes, edges)).toEqual(['obs:1', 'obs:2']);
  });
  it('publishes a new focused semantic location only with its matching populated generation', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
      await enterCommunity(browser);
      const target = await browser.evaluate<{
        id: string;
        label: string;
        response: Record<string, unknown>;
      }>(`(async () => {
        const row = [...document.querySelectorAll('.graph-navigator li')]
          .find((item) => item.textContent?.includes('Browser memory 1'));
        if (!(row instanceof HTMLElement) || !row.dataset.nodeId) throw new Error('Missing target memory');
        const communityId = new URL(location.href).searchParams.get('community');
        const projectId = new URL(location.href).searchParams.get('project_id');
        if (!communityId) throw new Error('Missing current community');
        if (!projectId) throw new Error('Missing current project');
        const query = new URLSearchParams({
          hierarchy: 'project',
          level: 'neighborhood',
          project_id: projectId,
          community_id: communityId,
          focus_node_id: row.dataset.nodeId,
          depth: '2',
          page_size: '150',
        });
        const response = await fetch('/viz/atlas?' + query.toString()).then((value) => value.json());
        const node = response.nodes?.find((candidate) => candidate.id === row.dataset.nodeId);
        return { id: row.dataset.nodeId, label: node?.label ?? 'Browser memory 1', response };
      })()`);
      await browser.setRoutes([{
        includes: 'level=neighborhood',
        status: 200,
        body: { ...target.response, continuation: null },
        delayMs: 420,
      }]);
      await browser.evaluate(`(() => {
        globalThis.__THOTH_ATOMIC_LOCATION_FRAMES__ = [];
        const capture = () => {
          const surface = document.querySelector('[data-testid="memory-map-surface"]');
          const shell = document.querySelector('[data-testid="map-canvas-shell"]');
          globalThis.__THOTH_ATOMIC_LOCATION_FRAMES__.push({
            focus: new URL(location.href).searchParams.get('focus'),
            level: surface?.getAttribute('data-atlas-level'),
            phase: surface?.getAttribute('data-atlas-load-state'),
            context: document.querySelector('.observatory-context-strip span:nth-child(4)')?.textContent ?? '',
            shellFocus: shell?.getAttribute('data-focus-id') ?? '',
            navigatorFocus: document.querySelector('.graph-navigator')?.getAttribute('data-focus-id') ?? '',
          });
        };
        const observer = new MutationObserver(capture);
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
        globalThis.__THOTH_ATOMIC_LOCATION_OBSERVER__ = observer;
        capture();
      })()`);

      await browser.evaluate(`document.querySelector('li[data-node-id=${JSON.stringify(target.id)}] > button:first-child')?.click()`);
      await browser.waitFor(`new URL(location.href).searchParams.get('focus') === ${JSON.stringify(target.id)}`);
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'
        && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-atlas-level') === 'neighborhood'
        && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === ${JSON.stringify(target.id)}
        && document.querySelector('.graph-navigator li.active')?.getAttribute('data-node-id') === ${JSON.stringify(target.id)}
        && document.querySelector('.memory-overview h2')?.textContent?.includes(${JSON.stringify(target.label)})`, 30_000);
      const frames = await browser.evaluate<Array<{
        focus: string | null;
        level: string | null;
        phase: string | null;
        context: string;
        shellFocus: string;
        navigatorFocus: string;
      }>>(`(() => {
        globalThis.__THOTH_ATOMIC_LOCATION_OBSERVER__?.disconnect();
        return globalThis.__THOTH_ATOMIC_LOCATION_FRAMES__ ?? [];
      })()`);
      const contradictoryFrames = frames.filter((frame) => (
        frame.focus === target.id
        && (
          frame.level !== 'neighborhood'
          || frame.context.includes('whole universe')
          || !frame.context.includes(target.label)
          || frame.shellFocus !== target.id
          || frame.navigatorFocus !== target.id
        )
      ));
      expect(contradictoryFrames, JSON.stringify(contradictoryFrames)).toEqual([]);
      expect(await browser.text('.observatory-context-strip span:nth-child(4)')).toContain(target.label);
      await browser.clearRoutes();
    }, { observations: 84, faultInjection: { deadlineMs: 55_000 } });
  }, 65_000);
  it('keeps native Enter and Space activation on focused constellation controls', async () => {
    await withDashboardBrowser(async (browser) => {
      for (const key of ['Enter', ' ']) {
        await browser.goto('/');
        await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'
          && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'universe'
          && document.querySelectorAll('.graph-navigator li').length > 0`, 30_000);
        await browser.evaluate(`document.querySelector('.graph-navigator li > button:first-child')?.focus()`);
        await browser.key(key);
        await browser.waitFor(`new URL(location.href).searchParams.get('level') === 'community'
          && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'community'`, 30_000);
        expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-atlas-level')).toBe('community');
      }
    }, { observations: 84, faultInjection: { deadlineMs: 55_000 } });
  }, 65_000);
  it('mounts one viewport-dominant world-first Neural Atlas', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/');
      await enterCommunity(browser);
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
      expect(metrics.linkMin).toBeGreaterThanOrEqual(0.72);
    }, { observations: 48 });
  }, 40_000);
  it('runs the living constellation through the real GPU renderer', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/');
      await enterCommunity(browser);
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

      await browser.click('button[aria-label="Close memory dock"]');
      await browser.waitFor(`document.querySelector('.atlas-dock')?.getAttribute('data-open') === 'false' && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`, 30_000);
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
      const clickedPointId = await browser.attribute('[data-testid="map-canvas"]', 'data-pointer-probe-id');
      expect(clickedPointId).toBeTruthy();
      await browser.mouseClick(pointerPosition.clientX, pointerPosition.clientY);
      await browser.waitFor(`new URLSearchParams(location.search).get('focus') === ${JSON.stringify(clickedPointId)} && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === ${JSON.stringify(clickedPointId)} && document.querySelector('.graph-navigator li[data-node-id=${JSON.stringify(clickedPointId)}]') && document.querySelector('.atlas-dock')?.getAttribute('data-open') === 'true'`);
      const pointerFocus = clickedPointId!;
      await browser.click('button[title="Pause or resume (P)"]');

      await browser.click('button[title="Expand selected memory (E)"]');
      await browser.waitFor(`document.querySelector('.atlas-dock')?.getAttribute('data-open') === 'true'`);
      expect(new URL(await browser.url()).searchParams.get('focus')).toBe(pointerFocus);
      expect(browser.requests.some((request) => request.url.includes('/observatory/map/frontier'))).toBe(false);

      for (const title of ['Fit visible nodes (0)', 'Zoom in (+)', 'Zoom out (-)', 'Reset viewport (R)']) {
        await browser.click(`button[title=${JSON.stringify(title)}]`);
      }
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-last-command')).toBe('reset');

      await browser.click('button[title="Pause or resume (P)"]');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-paused') === 'true'`);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-paused')).toBe('true');

      await browser.reducedMotion();
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-reduced-motion')).toBe('true');
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-transition-duration')).toBe('0');
    });
  }, 40_000);
  it('executes pointer and keyboard graph commands with kind-aware Lens behavior in a real browser', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/'); await enterNeighborhood(browser);
      const focusText = async () => await browser.text('.observatory-context-strip span:nth-child(4)');
      await browser.waitFor(`document.querySelector('.observatory-context-strip span:nth-child(4)')?.textContent?.includes('Browser memory 1')`, 30_000);
      const initial = await focusText();
      for (const title of ['Fit visible nodes (0)','Zoom in (+)','Zoom out (-)','Reset viewport (R)','Pause or resume (P)','Pan left (H)','Pan down (J)','Pan up (K)','Pan right (L)']) await browser.click(`button[title=${JSON.stringify(title)}]`);
      expect(await focusText()).toBe(initial);
      const initialFocusId = new URL(await browser.url()).searchParams.get('focus');
      await browser.click('button[title="Next connected memory (Arrow Right)"]');
      await browser.waitFor(`new URLSearchParams(location.search).get('focus') !== ${JSON.stringify(initialFocusId)} && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      const pointerNextId = new URL(await browser.url()).searchParams.get('focus');
      const pointerNext=await focusText();
      await browser.click('button[title="Previous connected memory (Arrow Left)"]');
      await browser.waitFor(`new URLSearchParams(location.search).get('focus') !== ${JSON.stringify(pointerNextId)} && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      const pointerPrevious=await focusText(); expect(pointerNext).not.toBe(initial); expect(pointerPrevious).not.toBe(pointerNext);
      await browser.click('button[title="Open memory overview (Enter)"]'); await browser.waitFor(`document.querySelector('.memory-overview .node-kind')?.getAttribute('data-node-kind') === 'observation'`);
      await browser.click('button[title="Expand selected memory (E)"]'); expect(await focusText()).toBe(pointerPrevious);
      await browser.waitFor(`[...document.querySelectorAll('.graph-navigator li > button:first-child')].some((button)=>button.textContent?.includes('Learned fact:'))`);
      await browser.clickText('.graph-navigator li > button:first-child','Learned fact:'); await browser.waitFor(`document.querySelector('.memory-overview .node-kind')?.getAttribute('data-node-kind') === 'fact'`);
      expect(await browser.text('.memory-overview')).toContain('Learned fact'); expect(browser.requests.filter((request)=>request.url.includes('/viz/inspect/node/fact:'))).toHaveLength(0);
      await browser.goto('/'); await enterNeighborhood(browser); await browser.click('button[title="Clear focus (Escape)"]');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'community' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete' && document.querySelectorAll('.graph-navigator li').length > 1`, 30_000);
      expect(await focusText()).toContain('whole universe');
      await browser.clickText('.graph-navigator li > button:first-child','Browser memory 1');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'neighborhood' && document.querySelector('.observatory-context-strip span:nth-child(4)')?.textContent?.includes('Browser memory 1')`, 30_000);
      for (const key of ['0','+','-','r','p','h','j','k','l']) await browser.key(key);
      let keyboardFocus = new URL(await browser.url()).searchParams.get('focus');
      for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft']) {
        await browser.key(key);
        await browser.waitFor(`new URLSearchParams(location.search).get('focus') !== ${JSON.stringify(keyboardFocus)} && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
        keyboardFocus = new URL(await browser.url()).searchParams.get('focus');
        expect(keyboardFocus).toMatch(/^obs:\d+$/);
      }
      await browser.key('Enter');
      await browser.waitFor(`document.querySelector('.memory-overview .node-kind')?.getAttribute('data-node-kind') === 'observation'`);
      await browser.key('e');
      expect(await focusText()).not.toContain('whole universe'); expect(await browser.count('.memory-overview')).toBe(1);
      await browser.key('Escape');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'community'
        && document.querySelector('.observatory-context-strip span:nth-child(4)')?.textContent?.includes('whole universe')`, 30_000);
      expect(await focusText()).toContain('whole universe');
      for (const [width,height] of [[1440,900],[1024,768],[360,800]]) { await browser.viewport(width,height); expect(await browser.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth')).toBe(true); }
      await browser.reducedMotion(); expect(await browser.evaluate<boolean>(`matchMedia('(prefers-reduced-motion: reduce)').matches`)).toBe(true);
      expect(browser.requests.filter((request) => !request.url.startsWith(browser.origin) && !request.url.startsWith('data:'))).toHaveLength(0);
    });
  }, 40_000);
  it('keeps the focused label visible when a zoomed constellation resizes to mobile', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.viewport(1440, 900);
      await browser.goto('/');
      await enterNeighborhood(browser);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`);
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
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'failed' && document.querySelectorAll('.graph-navigator li').length > 0`);
      await browser.evaluate(`document.querySelector('.graph-navigator li > button:first-child')?.click()`);
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'community' && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'failed' && document.querySelectorAll('.graph-navigator li').length > 1`, 30_000);
      const navigatorCount = await browser.count('.graph-navigator li');
      expect(await browser.text('.cosmos-renderer-fallback')).toContain('Rich constellation unavailable');
      expect(await browser.count('.cosmos-renderer-fallback button')).toBe(1);
      const fallbackNavigator = await browser.evaluate<{ clipPath: string; width: number; height: number; display: string }>(`(() => {
        const navigator = document.querySelector('.graph-navigator');
        if (!(navigator instanceof HTMLElement)) return { clipPath: 'missing', width: 0, height: 0, display: 'missing' };
        const rect = navigator.getBoundingClientRect();
        const style = getComputedStyle(navigator);
        return { clipPath: style.clipPath, width: rect.width, height: rect.height, display: style.display };
      })()`);
      expect(fallbackNavigator.clipPath, JSON.stringify(fallbackNavigator)).toBe('none');
      expect(fallbackNavigator.width, JSON.stringify(fallbackNavigator)).toBeGreaterThan(240);
      expect(fallbackNavigator.height, JSON.stringify(fallbackNavigator)).toBeGreaterThan(80);

      await browser.clickText('.graph-navigator li > button:first-child', 'Browser memory 1');
      await browser.waitFor(`document.querySelector('.memory-overview h2')?.textContent?.includes('Browser memory 1')`);
      const focusedNavigatorCount = await browser.count('.graph-navigator li');
      const focusedLabel = await browser.text('.observatory-context-strip span:nth-child(4)');
      const focusedId = new URL(await browser.url()).searchParams.get('focus');
      expect(focusedLabel).toContain('Browser memory 1');

      await browser.evaluate(`globalThis.__THOTH_RESTORE_WEBGL__?.()`);
      await browser.click('.cosmos-renderer-fallback button');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`);
      expect(navigatorCount).toBeGreaterThan(0);
      expect(focusedNavigatorCount).toBeGreaterThan(0);
      expect(await browser.count('.graph-navigator li')).toBe(focusedNavigatorCount);
      expect(await browser.text('.observatory-context-strip span:nth-child(4)')).toBe(focusedLabel);
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
