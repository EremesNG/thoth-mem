import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { withDashboardBrowser } from './dashboard-browser-harness.js';

describe('semantic atlas production navigation', () => {
  it('mounts SC-019 atlas shapes and recovery controls through the production bridge', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      const baseline = await browser.evaluate<Record<string, unknown>>(`fetch('/viz/atlas?level=universe&page_size=250').then((response)=>response.json())`);
      const baselineNodes = baseline.nodes as Array<Record<string, unknown>>;
      const present = async (name: string, nodes: Array<Record<string, unknown>>, state: 'empty' | 'sparse' | 'dense', degraded = false) => {
        const generation = `sc019-${name}`;
        await browser.setRoutes([{ includes: '/viz/atlas', status: 200, body: {
          ...baseline, generation, nodes, edges: [], state, continuation: null, truncated: name === 'oversized-region',
          regions: name === 'all-unclustered' ? [] : baseline.regions,
          health: { semantic_state: degraded ? 'degraded' : 'ready', pending_jobs: degraded ? 3 : 0 },
        } }]);
        await browser.fill('input[aria-label="Explore memories"]', name);
        await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-atlas-generation') === ${JSON.stringify(generation)}`);
        expect(await browser.attribute('[data-testid="memory-map-surface"]', 'data-node-count')).toBe(String(nodes.length));
        expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-density')).toBe(state);
      };

      await present('empty', [], 'empty');
      await present('tiny', baselineNodes.slice(0, 1), 'sparse');
      await present('sparse', baselineNodes.slice(0, 4), 'sparse');
      await present('dense', baselineNodes, 'dense');
      await present('all-unclustered', baselineNodes.slice(0, 6).map((node) => ({ ...node, unclustered: true, community_id: null, region_id: null })), 'sparse');
      await present('degraded', baselineNodes.slice(0, 4), 'sparse', true);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-semantic-state')).toBe('degraded');

      await browser.setRoutes([{ includes: '/viz/atlas', status: 410, body: { error: 'Atlas generation is gone', code: 'VIZ_ATLAS_GENERATION_STALE', retryable: true } }]);
      await browser.fill('input[aria-label="Explore memories"]', 'stale-gone');
      await browser.waitFor(`document.querySelector('button[aria-label="Retry universe atlas"]')`);
      expect(await browser.text('[data-resource-notice="partial-error"]')).toMatch(/could not finish|retry/i);

      await browser.setRoutes([{ includes: '/viz/atlas', status: 503, delayMs: 500, body: { error: 'Inspection unavailable', code: 'VIZ_INSPECTION_FAILED', retryable: true } }]);
      await browser.fill('input[aria-label="Explore memories"]', 'aborted-request');
      await browser.evaluate(`new Promise((resolve)=>setTimeout(resolve,80))`);
      await browser.fill('input[aria-label="Explore memories"]', 'replacement-request');
      await browser.waitFor(`document.querySelector('button[aria-label="Retry universe atlas"]')`);
      expect(await browser.text('body')).not.toContain('Atlas loading was aborted');

      await browser.setRoutes([{ includes: '/viz/atlas', status: 200, body: { ...baseline, generation: 'sc019-retry', continuation: null } }]);
      const beforeRetry = browser.requests.filter(({ url }) => url.includes('/viz/atlas')).length;
      await browser.click('button[aria-label="Retry universe atlas"]');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-atlas-generation') === 'sc019-retry'`);
      expect(browser.requests.filter(({ url }) => url.includes('/viz/atlas')).length).toBeGreaterThan(beforeRetry);
      await browser.clearRoutes();
    }, { observations: 180, faultInjection: { deadlineMs: 55_000 } });
  }, 65_000);

  it('captures an oversized 1,000-memory Community semantic-zoom visual matrix', async () => {
    const evidenceRoot = resolve('openspec/changes/dashboard-semantic-zoom-navigation/evidence');
    mkdirSync(evidenceRoot, { recursive: true });
    await withDashboardBrowser(async (browser) => {
      const observedStates: string[] = [];
      const capture = async (name: string) => {
        observedStates.push(name);
        const screenshot = await browser.captureScreenshot();
        writeFileSync(resolve(evidenceRoot, `${name}.png`), Buffer.from(screenshot, 'base64'));
        return screenshot;
      };
      const separableBackgroundRatio = async (screenshot: string) => browser.evaluate<number>(`(async()=>{
        const image=new Image();
        image.src=${JSON.stringify('data:image/png;base64,') }+${JSON.stringify(screenshot)};
        await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject});
        const host=document.querySelector('.cosmos-graph-host')?.getBoundingClientRect();
        if(!host)return 0;
        const scale=image.width/innerWidth;
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.floor(host.width*scale));canvas.height=Math.max(1,Math.floor(host.height*scale));
        const context=canvas.getContext('2d',{willReadFrequently:true});
        if(!context)return 0;
        context.drawImage(image,host.left*scale,host.top*scale,host.width*scale,host.height*scale,0,0,canvas.width,canvas.height);
        const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
        let background=0;
        for(let index=0;index<pixels.length;index+=4){
          const maximum=Math.max(pixels[index],pixels[index+1],pixels[index+2]);
          if(maximum<54)background+=1;
        }
        return background/(pixels.length/4);
      })()`);
      const geometry = async () => browser.evaluate<{ labels: number; labelOverlaps: number; labelsOutside: number; contoursOutside: number }>(`(() => {
        const host=document.querySelector('.cosmos-graph-host')?.getBoundingClientRect();
        const labels=[...document.querySelectorAll('.semantic-region-layer text')].map((item)=>item.getBoundingClientRect()).filter((rect)=>rect.width>0&&rect.height>0);
        const contours=[...document.querySelectorAll('.semantic-region-layer g > path')].map((item)=>item.getBoundingClientRect()).filter((rect)=>rect.width>0&&rect.height>0);
        if(!host)return {labels:0,labelOverlaps:0,labelsOutside:0,contoursOutside:0};
        let labelOverlaps=0;
        for(let index=0;index<labels.length;index+=1)for(const peer of labels.slice(index+1)){const current=labels[index];if(current.left<peer.right&&current.right>peer.left&&current.top<peer.bottom&&current.bottom>peer.top)labelOverlaps+=1;}
        const outside=(rect)=>rect.left<host.left-1||rect.top<host.top-1||rect.right>host.right+1||rect.bottom>host.bottom+1;
        return {labels:labels.length,labelOverlaps,labelsOutside:labels.filter(outside).length,contoursOutside:contours.filter(outside).length};
      })()`);
      await browser.viewport(1440, 900);
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete' && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`, 60_000);
      expect(await browser.text('.map-health-strip')).toMatch(/4,000 memories/i);
      await capture('01-universe-1440x900');
      const largestCommunity = await browser.evaluate<{ id: string; memberCount: number }>(`fetch('/viz/atlas?level=universe&page_size=250').then((response)=>response.json()).then((page)=>{const node=page.nodes.sort((left,right)=>(right.member_count??0)-(left.member_count??0))[0];return {id:node.id,memberCount:node.member_count??0}})`);
      expect(largestCommunity.memberCount).toBe(1_000);
      const largestCommunityId = largestCommunity.id;
      const semanticCommunityRequests = () => browser.requests.filter(({ url }) => {
        const request = new URL(url);
        return request.pathname === '/viz/atlas'
          && request.searchParams.get('level') === 'community'
          && request.searchParams.get('presentation') === 'semantic-zoom'
          && request.searchParams.get('fixture_probe') !== '1';
      });
      const workingSet = await browser.evaluate<Record<string, unknown>>(`fetch('/viz/atlas?level=community&community_id=${encodeURIComponent(largestCommunityId)}&presentation=semantic-zoom&page_size=250&fixture_probe=1',{cache:'no-store'}).then((response)=>response.json())`);
      const workingNodes = workingSet.nodes as Array<{ id: string }>;
      const workingEdges = workingSet.edges as Array<{ id: string; tier: string }>;
      const workingRegions = workingSet.regions as Array<{ member_count: number; representatives: Array<{ node_id: string }> }>;
      const workingBridges = workingSet.region_bridges as Array<{ id: string }>;
      const navigation = workingSet.navigation as Record<string, number>;
      expect(navigation.source_memory_count).toBe(1_000);
      expect(navigation.visible_memory_count).toBe(workingNodes.length);
      expect(navigation.omitted_nodes).toBe(1_000 - workingNodes.length);
      expect(navigation.visible_relationship_count).toBe(workingEdges.length + workingBridges.length);
      expect(navigation.omitted_edges).toBe(navigation.source_relationship_count - navigation.represented_source_relationship_count);
      expect(workingSet.continuation).toBeNull();
      expect(workingRegions.reduce((sum, region) => sum + region.member_count, 0)).toBe(1_000);
      expect(new Set(workingNodes.map((node) => node.id)).size).toBe(workingNodes.length);
      expect(new Set(workingRegions.flatMap((region) => region.representatives.map((representative) => representative.node_id))).size).toBe(workingNodes.length);
      expect(workingRegions).toHaveLength(12);
      expect(workingNodes.length).toBeGreaterThanOrEqual(80);
      expect(workingNodes.length).toBeLessThanOrEqual(180);
      expect(workingEdges.length + workingBridges.length).toBeLessThanOrEqual(450);
      await browser.click(`.graph-navigator li[data-node-id="${largestCommunityId}"] > button:first-child`);
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'community' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete' && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-region-screen-ready') === 'true'`, 45_000);
      expect(semanticCommunityRequests(), JSON.stringify(semanticCommunityRequests())).toHaveLength(1);
      const budget = await browser.evaluate<{ regions: number; memories: number; relationships: number; regionBridges: number }>(`({ regions: document.querySelectorAll('.semantic-region-layer g').length, memories: Number(document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-point-count') ?? 0), relationships: Number(document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-link-count') ?? 0), regionBridges: Number(document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-region-bridge-count') ?? 0) })`);
      expect(budget.regions, JSON.stringify(budget)).toBeGreaterThanOrEqual(6); expect(budget.regions).toBeLessThanOrEqual(12);
      expect(budget.memories).toBeGreaterThanOrEqual(80); expect(budget.memories).toBeLessThanOrEqual(180);
      expect(budget.relationships + budget.regionBridges).toBeLessThanOrEqual(450);
      expect(budget.regionBridges).toBe(workingBridges.length);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-rendered-internal-link-count')).toBe('0');
      expect(await browser.count('.semantic-region-bridge')).toBeLessThanOrEqual(18);
      const desktopGeometry = await geometry();
      expect(desktopGeometry.labels, JSON.stringify(desktopGeometry)).toBeGreaterThanOrEqual(6);
      expect(desktopGeometry.labels).toBeLessThanOrEqual(12);
      expect(desktopGeometry).toMatchObject({ labelOverlaps: 0, labelsOutside: 0, contoursOutside: 0 });
      const overviewScreenshot = await capture('02-community-overview');
      expect(await browser.count('.relationship-legend button')).toBe(3);
      const rendererVersionBeforeFilter = await browser.attribute('[data-testid="map-canvas-shell"]', 'data-dataset-version');
      await browser.click('.relationship-legend button.semantic');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas"]')?.getAttribute('data-painted-relationship-count') === '0'`);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-dataset-version')).toBe(rendererVersionBeforeFilter);
      await browser.click('.relationship-legend button.semantic');
      await browser.waitFor(`Number(document.querySelector('[data-testid="map-canvas"]')?.getAttribute('data-painted-relationship-count') ?? 0) > 0`);
      const backgroundRatio = await separableBackgroundRatio(overviewScreenshot);
      expect(backgroundRatio).toBeGreaterThanOrEqual(0.7);
      const overviewIdentities = await browser.evaluate<string[]>(`[...document.querySelectorAll('.graph-navigator li[data-node-id^="obs:"]')].map((item)=>item.getAttribute('data-node-id')).filter(Boolean).sort()`);
      const requestsBeforeZoom = browser.requests.length;
      for (let index = 0; index < 16 && Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-camera-zoom')) < 1.55; index += 1) {
        await browser.click('button[aria-label="Zoom in"]');
        await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 700))`);
      }
      expect(Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-camera-zoom'))).toBeGreaterThanOrEqual(1.55);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-zoom-band') === 'exploration'`);
      expect(browser.requests.length).toBe(requestsBeforeZoom);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-rendered-internal-link-count')).toBe(String(workingEdges.length));
      expect(await browser.evaluate<string[]>(`[...document.querySelectorAll('.graph-navigator li[data-node-id^="obs:"]')].map((item)=>item.getAttribute('data-node-id')).filter(Boolean).sort()`)).toEqual(overviewIdentities);
      await capture('03-community-exploration');
      for (let index = 0; index < 16 && Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-camera-zoom')) >= 1.35; index += 1) {
        await browser.click('button[aria-label="Zoom out"]');
        await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 700))`);
      }
      expect(Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-camera-zoom'))).toBeLessThan(1.35);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-zoom-band') === 'overview'`);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-rendered-internal-link-count')).toBe('0');
      await browser.viewport(1024, 768); await browser.waitFor(`Number(document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-region-host-width') ?? 9999) <= 900 && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-region-screen-ready') === 'true'`); const tabletGeometry = await geometry(); expect(tabletGeometry.labels).toBeGreaterThanOrEqual(6); expect(tabletGeometry.labels).toBeLessThanOrEqual(9); expect(tabletGeometry).toMatchObject({ labelOverlaps: 0, labelsOutside: 0, contoursOutside: 0 }); await capture('04-tablet-1024x768');
      await browser.viewport(360, 800); await browser.waitFor(`Number(document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-region-host-width') ?? 9999) <= 480 && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-region-screen-ready') === 'true' && document.querySelector('.mobile-nav-trigger')?.getAttribute('aria-expanded') === 'false' && !document.querySelector('.drawer-backdrop') && getComputedStyle(document.querySelector('.command-rail')).visibility === 'hidden'`); await browser.click('button[aria-label="Fit all memories"]'); await browser.evaluate(`new Promise((resolve)=>setTimeout(resolve,500))`); const mobileGeometry = await geometry(); expect(mobileGeometry.labels).toBeGreaterThanOrEqual(4); expect(mobileGeometry.labels).toBeLessThanOrEqual(6); expect(mobileGeometry).toMatchObject({ labelOverlaps: 0, labelsOutside: 0, contoursOutside: 0 }); await capture('05-mobile-360x800');
      await browser.viewport(1440, 900); await browser.pageScale(2); await browser.click('button[aria-label="Fit all memories"]'); await browser.evaluate(`new Promise((resolve)=>setTimeout(resolve,500))`); const scaledGeometry = await geometry(); expect(scaledGeometry.labels).toBeGreaterThanOrEqual(6); expect(scaledGeometry).toMatchObject({ labelOverlaps: 0, labelsOutside: 0, contoursOutside: 0 }); await capture('06-zoom-200-percent'); await browser.pageScale(1);
      await browser.reducedMotion(); await capture('07-reduced-motion');
      const regionId = await browser.attribute('.graph-region-groups button', 'data-region-id');
      expect(regionId).toBeTruthy();
      const semanticRequestsBeforeFocus = semanticCommunityRequests().length;
      await browser.evaluate(`(() => {
        performance.clearResourceTimings();
        globalThis.__THOTH_DENSE_LONG_TASKS__=[];
        globalThis.__THOTH_DENSE_LONG_OBSERVER__=new PerformanceObserver((list)=>globalThis.__THOTH_DENSE_LONG_TASKS__.push(...list.getEntries().map((entry)=>entry.duration)));
        try{globalThis.__THOTH_DENSE_LONG_OBSERVER__.observe({type:'longtask',buffered:false})}catch{}
        globalThis.__THOTH_DENSE_ATLAS_RESPONSES__=[];
        globalThis.__THOTH_DENSE_RESOURCE_OBSERVER__=new PerformanceObserver((list)=>globalThis.__THOTH_DENSE_ATLAS_RESPONSES__.push(...list.getEntries().filter((entry)=>entry.name.includes('/viz/atlas')).map((entry)=>({name:entry.name,responseEnd:entry.responseEnd}))));
        try{globalThis.__THOTH_DENSE_RESOURCE_OBSERVER__.observe({type:'resource',buffered:false})}catch{}
        globalThis.__THOTH_DENSE_NEIGHBORHOOD_STARTED__=performance.now();
      })()`);
      await browser.evaluate(`document.querySelector('.graph-region-groups button')?.focus()`);
      await browser.key('Enter');
      await browser.waitFor(`new URLSearchParams(location.search).get('region') === ${JSON.stringify(regionId)}`, 30_000);
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      await browser.waitFor(`document.querySelector('.atlas-dock')?.getAttribute('data-open') === 'true'`, 30_000);
      expect(semanticCommunityRequests().length - semanticRequestsBeforeFocus).toBe(1);
      const focusedRelationshipCount = Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-link-count'));
      expect(await browser.attribute('[data-testid="memory-map-surface"]', 'data-region-id')).toBe(regionId);
      expect(await browser.attribute('.semantic-region-layer g[data-focused="true"]', 'data-region-id')).toBe(regionId);
      expect(await browser.attribute('.graph-region-groups button[aria-pressed="true"]', 'data-region-id')).toBe(regionId);
      expect(await browser.attribute('[data-testid="map-canvas"]', 'data-replacement-fit-suppressed')).toBe('false');
      const regionCommitEvidence = await browser.evaluate<{ latency: number; exactKey: boolean; history: unknown[] }>(`(() => {
        const history=JSON.parse(document.documentElement.dataset.atlasResponseHistory??'[]');
        const response=[...history].reverse().find((entry)=>entry.level==='community'&&entry.regionId);
        const commits=JSON.parse(document.documentElement.dataset.atlasRenderCommitHistory??'[]');
        const commit=commits.find((entry)=>response&&entry.presentationKey===response.presentationKey&&entry.commitAt>=response.completeAt);
        globalThis.__THOTH_DENSE_REGION_COMMIT_LATENCY__=response&&commit?commit.commitAt-response.completeAt:-1;
        return {latency:globalThis.__THOTH_DENSE_REGION_COMMIT_LATENCY__,exactKey:response?.presentationKey===commit?.presentationKey,history,commits};
      })()`);
      expect(regionCommitEvidence.exactKey, JSON.stringify(regionCommitEvidence)).toBe(true);
      expect(regionCommitEvidence.latency, JSON.stringify(regionCommitEvidence)).toBeGreaterThanOrEqual(0);
      expect(regionCommitEvidence.latency, JSON.stringify(regionCommitEvidence)).toBeLessThan(250);
      await browser.evaluate(`(() => {
        const pending=globalThis.__THOTH_DENSE_LONG_OBSERVER__?.takeRecords().map((entry)=>entry.duration)??[];
        globalThis.__THOTH_DENSE_LONG_OBSERVER__?.disconnect();
        globalThis.__THOTH_DENSE_REGION_LONG_TASK__=Math.max(0,...(globalThis.__THOTH_DENSE_LONG_TASKS__??[]),...pending);
      })()`);
      await capture('08-region-navigation');
      await browser.evaluate(`(() => {
        globalThis.__THOTH_DENSE_LONG_TASKS__=[];
        globalThis.__THOTH_DENSE_LONG_OBSERVER__=new PerformanceObserver((list)=>globalThis.__THOTH_DENSE_LONG_TASKS__.push(...list.getEntries().map((entry)=>entry.duration)));
        try{globalThis.__THOTH_DENSE_LONG_OBSERVER__.observe({type:'longtask',buffered:false})}catch{}
      })()`);
      await browser.evaluate(`document.querySelector('.graph-navigator li[data-node-id^="obs:"] > button:first-child')?.click()`);
      await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'neighborhood' && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready'`); const neighborhoodRelationshipCount = Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-link-count')); expect(neighborhoodRelationshipCount).not.toBe(focusedRelationshipCount);
      const denseTransitionMetrics = await browser.evaluate<{ regionCommitMs: number; neighborhoodCommitMs: number; exactKey: boolean; regionLongTaskMs: number; neighborhoodLongTaskMs: number; maximumLongTaskMs: number }>(`(() => {
        const response=[...JSON.parse(document.documentElement.dataset.atlasResponseHistory??'[]')].reverse().find((entry)=>entry.level==='neighborhood');
        const commit=JSON.parse(document.documentElement.dataset.atlasRenderCommitHistory??'[]').find((entry)=>response&&entry.presentationKey===response.presentationKey&&entry.commitAt>=response.completeAt);
        const pending=globalThis.__THOTH_DENSE_LONG_OBSERVER__?.takeRecords().map((entry)=>entry.duration)??[];
        globalThis.__THOTH_DENSE_LONG_OBSERVER__?.disconnect();
        globalThis.__THOTH_DENSE_RESOURCE_OBSERVER__?.disconnect();
        const neighborhoodLongTaskMs=Math.max(0,...(globalThis.__THOTH_DENSE_LONG_TASKS__??[]),...pending);
        const regionLongTaskMs=globalThis.__THOTH_DENSE_REGION_LONG_TASK__??0;
        return {regionCommitMs:globalThis.__THOTH_DENSE_REGION_COMMIT_LATENCY__??-1,neighborhoodCommitMs:response&&commit?commit.commitAt-response.completeAt:-1,exactKey:response?.presentationKey===commit?.presentationKey,regionLongTaskMs,neighborhoodLongTaskMs,maximumLongTaskMs:Math.max(regionLongTaskMs,neighborhoodLongTaskMs)};
      })()`);
      expect(denseTransitionMetrics.exactKey, JSON.stringify(denseTransitionMetrics)).toBe(true);
      expect(denseTransitionMetrics.regionCommitMs, JSON.stringify(denseTransitionMetrics)).toBeGreaterThanOrEqual(0);
      expect(denseTransitionMetrics.regionCommitMs, JSON.stringify(denseTransitionMetrics)).toBeLessThan(250);
      expect(denseTransitionMetrics.neighborhoodCommitMs, JSON.stringify(denseTransitionMetrics)).toBeGreaterThanOrEqual(0);
      expect(denseTransitionMetrics.neighborhoodCommitMs, JSON.stringify(denseTransitionMetrics)).toBeLessThan(250);
      expect(denseTransitionMetrics.maximumLongTaskMs, JSON.stringify(denseTransitionMetrics)).toBeLessThan(200);
      writeFileSync(resolve(evidenceRoot, 'transition-metrics.json'), `${JSON.stringify(denseTransitionMetrics, null, 2)}\n`);
      await capture('09-neighborhood');
      await browser.back(); await browser.waitFor(`new URLSearchParams(location.search).get('level') === 'community'`); await capture('10-history-restored');
      await browser.click('button[aria-label="Open Raw graph diagnostics"]'); await capture('11-raw-diagnostic-guard');
      expect(observedStates).toEqual([
        '01-universe-1440x900', '02-community-overview', '03-community-exploration',
        '04-tablet-1024x768', '05-mobile-360x800', '06-zoom-200-percent',
        '07-reduced-motion', '08-region-navigation', '09-neighborhood',
        '10-history-restored', '11-raw-diagnostic-guard',
      ]);
    }, { observations: 4_000, semanticZoomCommunitySize: 1_000, faultInjection: { deadlineMs: 110_000 } });
  }, 120_000);
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
