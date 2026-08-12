import { describe, expect, it } from 'vitest';

import type {
  AtlasLevel,
  SemanticAtlasEdge,
  SemanticAtlasNode,
  SemanticAtlasPageResponse,
} from '../../dashboard/src/api/client.js';
import { withDashboardBrowser } from './dashboard-browser-harness.js';

const denseCommunityId = 'community:dense-atlas';

function atlasPage(
  level: AtlasLevel,
  nodes: SemanticAtlasNode[],
  edges: SemanticAtlasEdge[],
  options: {
    communityId?: string | null;
    focusNodeId?: string | null;
    continuation?: string | null;
    truncated?: boolean;
    generation?: string;
  } = {},
): SemanticAtlasPageResponse {
  return {
    level,
    generation: options.generation ?? 'dense-semantic-atlas',
    nodes,
    edges,
    counts: {
      memory_count: 120,
      project_count: 1,
      community_count: 1,
      assigned_memory_count: 120,
      unclustered_memory_count: 0,
      supporting_entity_count: 0,
      relationship_count: 240,
      raw_entity_count: 360,
      raw_relationship_count: 480,
    },
    coverage: {
      state: 'fresh',
      projection_source: 'deterministic-kg',
      summary_state: 'missing',
      observations_with_kg: 120,
      observations_without_kg: 0,
      degraded_reasons: [],
    },
    facets: {
      projects: [{ kind: 'project', token: 'facet:project:browser-nebula', label: 'browser-nebula', count: 120 }],
      sessions: [],
      topics: [],
      types: ['decision', 'discovery'],
      relations: ['SUPPORTS', 'RELATES_TO'],
    },
    navigation: {
      community_id: level === 'universe' ? null : (options.communityId ?? denseCommunityId),
      focus_node_id: level === 'neighborhood' ? (options.focusNodeId ?? null) : null,
      depth: level === 'neighborhood' ? 2 : null,
      omitted_nodes: 0,
      omitted_edges: 0,
      raw_rich_render_safe: true,
      raw_rich_render_limit: 5_000,
      scope: { project: null, session: null, topic: null, type: null, relation: null },
    },
    continuation: options.continuation ?? null,
    truncated: options.truncated ?? false,
    health: { semantic_state: 'ready', pending_jobs: 0 },
  };
}

function denseAtlasPages() {
  const nodes: SemanticAtlasNode[] = Array.from({ length: 120 }, (_, index) => {
    const community = index % 6;
    const angle = (index / 120) * Math.PI * 12;
    return {
      id: `obs:${index + 1}`,
      kind: 'observation',
      label: `Atlas memory ${index + 1}`,
      snippet: 'A public memory in the neural atlas.',
      project: { kind: 'project', token: 'facet:project:browser-nebula', label: 'browser-nebula' },
      session: { kind: 'session', token: `facet:session:${index % 8}`, label: `Session ${index % 8}` },
      topic: { kind: 'topic', token: `facet:topic:${community}`, label: `Community ${community}` },
      type: index % 2 ? 'decision' : 'discovery',
      community_id: denseCommunityId,
      member_count: null,
      project_count: null,
      unclustered: false,
      seed_x: Math.cos(angle) * (2 + community * 0.4) + community * 4,
      seed_y: Math.sin(angle) * (1.2 + community * 0.25) + (community % 2) * 2,
    };
  });
  const edges: SemanticAtlasEdge[] = Array.from({ length: 240 }, (_, index) => ({
    id: `edge:${index}`,
    source_id: `obs:${(index % 120) + 1}`,
    target_id: `obs:${((index * 7 + (index % 6) + 11) % 120) + 1}`,
    relation: index % 3 ? 'SUPPORTS' : 'RELATES_TO',
    kind: index % 3 ? 'semantic' : 'metadata',
    label: 'Related memory',
    summary: 'A public relationship.',
    weight: 1,
    evidence_count: 1,
  }));
  return {
    universe: atlasPage('universe', [{
      id: denseCommunityId,
      kind: 'community',
      label: 'Dense constellation',
      snippet: '120 related memories',
      project: null,
      session: null,
      topic: null,
      type: null,
      community_id: denseCommunityId,
      member_count: 120,
      project_count: 1,
      unclustered: false,
      seed_x: 0,
      seed_y: 0,
    }], []),
    community: atlasPage('community', nodes, edges),
    neighborhood: atlasPage('neighborhood', nodes, edges, { focusNodeId: 'obs:1' }),
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
      const atlas = denseAtlasPages();
      await browser.setRoutes([
        { includes: '/viz/atlas?level=neighborhood', status: 200, body: atlas.neighborhood },
        { includes: '/viz/atlas?level=community', status: 200, body: atlas.community },
        { includes: '/viz/atlas?level=universe', status: 200, body: atlas.universe },
      ]);
      await browser.viewport(1440, 900);
      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'universe' && document.querySelectorAll('.graph-navigator li').length === 1`);
      await browser.evaluate(`document.querySelector('.graph-navigator li > button:first-child')?.click()`);
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
      expect(Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-link-min'))).toBeGreaterThanOrEqual(0.72);
      expect(Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-world-aspect'))).toBeGreaterThan(1.2);

      await browser.click('.graph-navigator li > button:first-child');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'neighborhood'`);
      await browser.waitFor(`document.querySelector('.atlas-dock')?.getAttribute('data-open') === 'true'`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') === 'ready' && document.querySelector('.atlas-dock')?.getBoundingClientRect().width > 0`, 30_000);
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

  it('keeps one canvas, focus, pause, and camera command while progressive graph pages arrive', async () => {
    await withDashboardBrowser(async (browser) => {
      const firstNode = {
        id: 'obs:1',
        kind: 'observation' as const,
        label: 'First progressive memory',
        snippet: 'The first bounded page.',
        project: { kind: 'project' as const, token: 'facet:project:browser-nebula', label: 'browser-nebula' },
        session: { kind: 'session' as const, token: 'facet:session:progressive', label: 'progressive-session' },
        topic: { kind: 'topic' as const, token: 'facet:topic:progressive', label: 'atlas/progressive' },
        type: 'decision' as const,
        community_id: 'community:progressive',
        member_count: null,
        project_count: null,
        unclustered: false,
        seed_x: 0,
        seed_y: 0,
      };
      const secondNode = {
        ...firstNode,
        id: 'obs:2',
        label: 'Second progressive memory',
        snippet: 'The delayed continuation page.',
        seed_x: 8,
        seed_y: 3,
      };
      const firstPage = atlasPage('neighborhood', [firstNode], [], {
        communityId: 'community:progressive',
        focusNodeId: firstNode.id,
        continuation: 'page-2',
        truncated: true,
        generation: 'progressive-semantic-atlas',
      });
      const secondPage = atlasPage('neighborhood', [secondNode], [{
        id: 'edge:progressive',
        source_id: firstNode.id,
        target_id: secondNode.id,
        relation: 'SUPPORTS',
        kind: 'semantic',
        label: 'Supports',
        summary: 'A progressive relationship.',
        weight: 1,
        evidence_count: 1,
      }], {
        communityId: 'community:progressive',
        focusNodeId: firstNode.id,
        generation: 'progressive-semantic-atlas',
      });
      await browser.setRoutes([
        {
          includes: 'cursor=page-2',
          status: 200,
          delayMs: 900,
          body: secondPage,
        },
        {
          includes: '/viz/atlas?level=neighborhood',
          status: 200,
          body: firstPage,
        },
      ]);
      await browser.goto('/?level=neighborhood&community=community%3Aprogressive&focus=obs%3A1');
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length === 1`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === 'obs:1'`);
      await browser.click('button[aria-label="Zoom in"]');
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length === 2`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-point-count') === '2'`);
      await browser.waitFor(`document.querySelector('.cosmos-graph-host')?.getAttribute('data-worker-applied-points') === '2'`);
      expect(Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-dataset-version'))).toBeGreaterThanOrEqual(1);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-motion-phase') !== 'activating'`);

      expect(await browser.count('.cosmos-graph-host canvas')).toBe(1);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-focus-id')).toBe('obs:1');
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-motion-phase')).not.toBe('activating');
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-last-command')).toBe('zoom-in');
      await browser.click('button[aria-label="Pause motion"]');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-paused') === 'true'`);
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-paused')).toBe('true');
      await browser.clearRoutes();
    }, { observations: 24 });
  }, 40_000);
});
