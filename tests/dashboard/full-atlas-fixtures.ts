import { describe, expect, it } from 'vitest';

import type { SemanticAtlasPageResponse } from '../../dashboard/src/api/client.js';
import { withDashboardBrowser, type BrowserRoute } from './dashboard-browser-harness.js';

const TOTAL_NODES = 2_565;
const TOTAL_EDGES = 5_414;
const PAGE_SIZE = 250;

function atlasNode(index: number) {
  const community = index % 37;
  const angle = index * 0.41;
  return {
    id: `obs:full-${index}`,
    kind: 'observation',
    label: `Complete memory ${index}`,
    snippet: index === 7 ? '<private>FULL_ATLAS_SECRET</private> Public memory' : 'A public complete memory.',
    project: 'browser-nebula',
    session_id: `full-session-${index % 12}`,
    topic_key: `full/community-${community}`,
    type: index % 2 ? 'decision' : 'discovery',
    seed_x: Math.cos(angle) * (50 + community * 3) + community * 28,
    seed_y: Math.sin(angle) * (22 + community * 1.4) + (community % 7) * 19,
  };
}

function completeAtlasRoutes(pageDelayMs = 25): BrowserRoute[] {
  const nodes = Array.from({ length: TOTAL_NODES }, (_, index) => atlasNode(index));
  const edges = Array.from({ length: TOTAL_EDGES }, (_, index) => {
    const sourceIndex = index % TOTAL_NODES;
    let targetIndex = (index * 7919 + 17) % TOTAL_NODES;
    if (targetIndex === sourceIndex) targetIndex = (targetIndex + 1) % TOTAL_NODES;
    return {
      id: `edge:full-${index}`,
      source_id: nodes[sourceIndex].id,
      target_id: nodes[targetIndex].id,
      relation: index % 5 ? 'SUPPORTS' : 'RELATES_TO',
      kind: index % 5 ? 'semantic' : 'metadata',
      label: 'Related memory',
      summary: 'A complete-atlas relationship.',
    };
  });
  const pages = Math.ceil(TOTAL_NODES / PAGE_SIZE);
  const routes: BrowserRoute[] = [];
  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    const start = pageIndex * PAGE_SIZE;
    const primary = nodes.slice(start, start + PAGE_SIZE);
    const primaryIds = new Set(primary.map((node) => node.id));
    const pageEdges = edges.filter((edge) => primaryIds.has(edge.source_id));
    const endpointIds = new Set(pageEdges.flatMap((edge) => [edge.source_id, edge.target_id]));
    const pageNodes = nodes.filter((node) => primaryIds.has(node.id) || endpointIds.has(node.id));
    const body = {
      nodes: pageNodes,
      edges: pageEdges,
      state: 'dense',
      continuation: pageIndex + 1 < pages ? `full-page-${pageIndex + 1}` : null,
      truncated: pageIndex + 1 < pages,
      health: { semantic_state: 'ready', pending_jobs: 0 },
    };
    if (pageIndex === 0) {
      routes.push({ includes: '/viz/graph', status: 200, delayMs: pageDelayMs, body });
    } else {
      routes.unshift({ includes: `cursor=full-page-${pageIndex}`, status: 200, delayMs: pageDelayMs, body });
    }
  }
  return routes;
}

function scopedUniversePage(
  label: string,
  generation: string,
  selectedToken: string | null = null,
): SemanticAtlasPageResponse {
  const projects = [
    { kind: 'project' as const, token: 'facet:project:scope-a', label: 'scope-a', count: 1 },
    { kind: 'project' as const, token: 'facet:project:scope-b', label: 'scope-b', count: 1 },
  ];
  const selectedProject = projects.find((project) => project.token === selectedToken) ?? null;
  return {
    level: 'universe',
    generation,
    nodes: [{
      id: `community:${generation}`,
      kind: 'community',
      label,
      snippet: 'One scoped memory constellation.',
      project: null,
      session: null,
      topic: null,
      type: null,
      community_id: `community:${generation}`,
      member_count: 1,
      project_count: 1,
      unclustered: false,
      seed_x: 0,
      seed_y: 0,
    }],
    edges: [],
    counts: { memory_count: 1, project_count: 1, community_count: 1, assigned_memory_count: 1, unclustered_memory_count: 0, supporting_entity_count: 0, relationship_count: 0, raw_entity_count: 3, raw_relationship_count: 2 },
    coverage: { state: 'fresh', projection_source: 'deterministic-kg', summary_state: 'missing', observations_with_kg: 1, observations_without_kg: 0, degraded_reasons: [] },
    facets: { projects, sessions: [], topics: [], types: [], relations: [] },
    navigation: {
      community_id: null,
      focus_node_id: null,
      depth: null,
      omitted_nodes: 0,
      omitted_edges: 0,
      raw_rich_render_safe: true,
      raw_rich_render_limit: 5_000,
      scope: { project: selectedProject, session: null, topic: null, type: null, relation: null },
    },
    continuation: null,
    truncated: false,
    health: { semantic_state: 'ready', pending_jobs: 0 },
  };
}

export function registerFullAtlasPerformanceTests(): void {
  describe('complete Neural Atlas performance', () => {
  it('automatically renders every graph identity and keeps presentation controls responsive', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.setRoutes(completeAtlasRoutes());
      await browser.viewport(1440, 900);
      await browser.goto('/?hierarchy=global');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      await browser.evaluate(`(() => {
        globalThis.__THOTH_LONG_TASKS__ = [];
        if ('PerformanceObserver' in globalThis) {
          const observer = new PerformanceObserver((list) => {
            globalThis.__THOTH_LONG_TASKS__.push(...list.getEntries().map((entry) => entry.duration));
          });
          try { observer.observe({ type: 'longtask', buffered: true }); } catch {}
          globalThis.__THOTH_LONG_TASK_OBSERVER__ = observer;
        }
      })()`);
      const ambientStartsBeforeRaw = Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-ambient-starts'));
      await browser.click('button[aria-label="Open Raw graph diagnostics"]');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'raw'`, 30_000);
      await browser.waitFor(`Number(document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-dataset-version') ?? 0) >= 1`, 30_000);
      await browser.evaluate(`(() => {
        globalThis.__THOTH_LONG_TASK_OBSERVER__?.takeRecords();
        globalThis.__THOTH_LONG_TASKS__ = [];
      })()`);
      const longTaskMaxima: Record<string, number> = {};
      const collectLongTasks = async (phase: string) => {
        const durations = await browser.evaluate<number[]>(`(() => {
          const pending = globalThis.__THOTH_LONG_TASK_OBSERVER__?.takeRecords().map((entry) => entry.duration) ?? [];
          const measured = [...(globalThis.__THOTH_LONG_TASKS__ ?? []), ...pending];
          globalThis.__THOTH_LONG_TASKS__ = [];
          return measured;
        })()`);
        longTaskMaxima[phase] = Math.max(0, ...durations);
      };
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-initial-settled') === 'true'`, 5_000);
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length === ${TOTAL_NODES} && document.querySelector('.graph-navigator')?.getAttribute('data-list-mode') === 'complete'`, 30_000);

      expect(await browser.count('.graph-navigator li')).toBe(TOTAL_NODES);
      expect(await browser.attribute('.graph-navigator', 'data-list-mode')).toBe('complete');
      expect(await browser.attribute('[data-testid="memory-map-surface"]', 'data-node-count')).toBe(String(TOTAL_NODES));
      expect(await browser.attribute('[data-testid="memory-map-surface"]', 'data-edge-count')).toBe(String(TOTAL_EDGES));
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-point-count')).toBe(String(TOTAL_NODES));
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-link-count')).toBe(String(TOTAL_EDGES));
      expect(await browser.count('.cosmos-graph-host canvas')).toBe(1);
      expect(Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-simulation-starts'))).toBeGreaterThanOrEqual(1);
      expect(Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-simulation-starts'))).toBeLessThanOrEqual(2);
      expect(Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-simulation-ends'))).toBeLessThanOrEqual(1);
      expect(Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-ambient-starts')) - ambientStartsBeforeRaw).toBe(1);
      expect(await browser.text('body')).not.toMatch(/Reveal more|FULL_ATLAS_SECRET|<private>/);
      await collectLongTasks('streaming');

      await browser.evaluate(`document.querySelector('.graph-navigator li > button:first-child')?.click()`);
      await browser.waitFor(`Boolean(document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id'))`);
      await collectLongTasks('focus');
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 700))`);
      expect(await browser.count('.graph-navigator li')).toBe(TOTAL_NODES);
      expect(browser.requests.some((request) => request.url.includes('/viz/slice'))).toBe(false);
      expect(await browser.attribute('[data-testid="memory-map-surface"]', 'data-node-count')).toBe(String(TOTAL_NODES));
      expect(await browser.attribute('[data-testid="memory-map-surface"]', 'data-edge-count')).toBe(String(TOTAL_EDGES));
      await collectLongTasks('fallback');
      await browser.evaluate(`document.querySelector('button[aria-label="Clear selected memory"]')?.click()`);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-focus-id') === ''`);
      await collectLongTasks('clear-focus');

      const pauseStarted = performance.now();
      await browser.click('button[aria-label="Pause motion"]');
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-paused') === 'true'`);
      expect(performance.now() - pauseStarted).toBeLessThan(250);
      await browser.click('button[aria-label="Zoom in"]');
      expect(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-last-command')).toBe('zoom-in');
      await collectLongTasks('controls');

      await browser.click('button[aria-controls="atlas-scope-panel"]');
      const graphRequestCount = browser.requests.filter((request) => request.url.includes('/viz/graph')).length;
      await browser.evaluate(`(() => {
        const label = [...document.querySelectorAll('#atlas-scope-panel label')].find((item) => item.textContent?.trim() === 'Field of view');
        const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
        if (!(input instanceof HTMLElement)) throw new Error('Missing Field of view selector');
        input.click();
      })()`);
      await browser.clickText('[role="option"]', 'Wide');
      await browser.waitFor(`new URL(location.href).searchParams.get('density') === 'wide'`);
      expect(await browser.count('.graph-navigator li')).toBe(TOTAL_NODES);
      expect(browser.requests.filter((request) => request.url.includes('/viz/graph'))).toHaveLength(graphRequestCount);
      await collectLongTasks('filters');

      expect(Math.max(...Object.values(longTaskMaxima)), JSON.stringify(longTaskMaxima)).toBeLessThan(200);
      expect(browser.requests.filter((request) => !request.url.startsWith(browser.origin) && !request.url.startsWith('data:'))).toHaveLength(0);
      await browser.clearRoutes();
    }, { observations: 12, faultInjection: { deadlineMs: 55_000 } });
  }, 65_000);

  it('coalesces realistically spaced graph pages without blocking continuous motion', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.setRoutes(completeAtlasRoutes(650));
      await browser.viewport(1440, 900);
      await browser.goto('/?hierarchy=global');
      await browser.evaluate(`(() => {
        globalThis.__THOTH_SLOW_PAGE_TASKS__ = [];
        if (!('PerformanceObserver' in globalThis)) return;
        const observer = new PerformanceObserver((list) => {
          globalThis.__THOTH_SLOW_PAGE_TASKS__.push(...list.getEntries().map((entry) => entry.duration));
        });
        try { observer.observe({ type: 'longtask', buffered: false }); } catch {}
        globalThis.__THOTH_SLOW_PAGE_OBSERVER__ = observer;
      })()`);
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      await browser.evaluate(`(() => {
        globalThis.__THOTH_SLOW_PAGE_OBSERVER__?.takeRecords();
        globalThis.__THOTH_SLOW_PAGE_TASKS__ = [];
      })()`);
      const ambientStartsBeforeRaw = Number(await browser.attribute('[data-testid="map-canvas-shell"]', 'data-ambient-starts'));
      await browser.click('button[aria-label="Open Raw graph diagnostics"]');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'raw'`, 30_000);
      await browser.waitFor(`Boolean(document.querySelector('[data-testid="map-canvas-shell"]')) && document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-renderer-status') !== 'loading'`, 30_000);
      expect(
        await browser.attribute('[data-testid="map-canvas-shell"]', 'data-renderer-status'),
        await browser.attribute('[data-testid="map-canvas-shell"]', 'data-renderer-error'),
      ).toBe('ready');
      await browser.waitFor(`Number(document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-dataset-version') ?? 0) >= 1`, 30_000);

      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length === ${TOTAL_NODES}`, 30_000);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-initial-settled') === 'true'`, 5_000);
      await browser.waitFor(`document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-final-fit-settled') === 'true' && Number(document.querySelector('[data-testid="map-canvas-shell"]')?.getAttribute('data-motion-diagnostics-epoch') ?? 0) >= 1`, 5_000);

      const longTasks = await browser.evaluate<number[]>(`(() => {
        const pending = globalThis.__THOTH_SLOW_PAGE_OBSERVER__?.takeRecords().map((entry) => entry.duration) ?? [];
        globalThis.__THOTH_SLOW_PAGE_OBSERVER__?.disconnect();
        return [...(globalThis.__THOTH_SLOW_PAGE_TASKS__ ?? []), ...pending];
      })()`);
      const shell = '[data-testid="map-canvas-shell"]';
      const simulationStarts = Number(await browser.attribute(shell, 'data-simulation-starts'));

      expect(await browser.attribute('[data-testid="memory-map-surface"]', 'data-node-count')).toBe(String(TOTAL_NODES));
      expect(await browser.attribute('[data-testid="memory-map-surface"]', 'data-edge-count')).toBe(String(TOTAL_EDGES));
      expect(await browser.count('.cosmos-graph-host canvas')).toBe(1);
      expect(simulationStarts).toBeGreaterThanOrEqual(1);
      expect(simulationStarts).toBeLessThanOrEqual(2);
      expect(Number(await browser.attribute(shell, 'data-simulation-ends'))).toBeLessThanOrEqual(1);
      expect(Number(await browser.attribute(shell, 'data-ambient-starts')) - ambientStartsBeforeRaw).toBe(1);
      expect(Number(await browser.attribute(shell, 'data-maximum-tick-gap'))).toBeLessThanOrEqual(250);
      expect(Number(await browser.attribute(shell, 'data-maximum-step'))).toBeLessThanOrEqual(8);
      const runtimeApplyMs = Number(await browser.attribute('.cosmos-graph-host', 'data-last-data-apply-ms'));
      const maximumRuntimeApplyMs = Number(await browser.attribute('.cosmos-graph-host', 'data-maximum-data-apply-ms'));
      const runtimeStages = await browser.evaluate<Record<string, string>>(`(() => {
        const host = document.querySelector('.cosmos-graph-host');
        if (!(host instanceof HTMLElement)) return {};
        return Object.fromEntries([...host.attributes]
          .filter((attribute) => attribute.name.startsWith('data-maximum-') && attribute.name.endsWith('-ms'))
          .map((attribute) => [attribute.name, attribute.value]));
      })()`);
      expect(
        Math.max(0, ...longTasks),
        JSON.stringify({ longTasks, runtimeApplyMs, maximumRuntimeApplyMs, runtimeStages }),
      ).toBeLessThan(200);
      await browser.clearRoutes();
    }, { observations: 12, faultInjection: { deadlineMs: 55_000 } });
  }, 65_000);
  });
}

export function registerFullAtlasSmokeTests(): void {
  describe('complete Neural Atlas', () => {
  it('completes dense navigation when animation frames stop after streaming begins', async () => {
    await withDashboardBrowser(async (browser) => {
      await browser.setRoutes(completeAtlasRoutes());
      await browser.viewport(1440, 900);
      await browser.goto('/?hierarchy=global');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      await browser.click('button[aria-label="Open Raw graph diagnostics"]');
      await browser.waitFor(`document.querySelector('.graph-navigator')?.getAttribute('data-total-count') === '${TOTAL_NODES}' && document.querySelector('.graph-navigator')?.getAttribute('data-list-mode') === 'streaming'`, 30_000);
      await browser.evaluate(`(() => {
        globalThis.__THOTH_ORIGINAL_REQUEST_ANIMATION_FRAME__ = globalThis.requestAnimationFrame;
        globalThis.__THOTH_ORIGINAL_CANCEL_ANIMATION_FRAME__ = globalThis.cancelAnimationFrame;
        globalThis.requestAnimationFrame = () => 2147483647;
        globalThis.cancelAnimationFrame = () => undefined;
      })()`);

      try {
        await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length === ${TOTAL_NODES} && document.querySelector('.graph-navigator')?.getAttribute('data-list-mode') === 'complete'`, 3_000);
      } finally {
        await browser.evaluate(`(() => {
          globalThis.requestAnimationFrame = globalThis.__THOTH_ORIGINAL_REQUEST_ANIMATION_FRAME__;
          globalThis.cancelAnimationFrame = globalThis.__THOTH_ORIGINAL_CANCEL_ANIMATION_FRAME__;
          delete globalThis.__THOTH_ORIGINAL_REQUEST_ANIMATION_FRAME__;
          delete globalThis.__THOTH_ORIGINAL_CANCEL_ANIMATION_FRAME__;
        })()`);
      }

      expect(await browser.count('.graph-navigator li')).toBe(TOTAL_NODES);
      expect(await browser.attribute('.graph-navigator', 'data-list-mode')).toBe('complete');
      expect(await browser.evaluate<boolean>(`(() => {
        const target = document.querySelector('.graph-navigator li:last-child > button:first-child');
        if (!(target instanceof HTMLElement)) return false;
        target.focus();
        return document.activeElement === target;
      })()`)).toBe(true);
      await browser.clearRoutes();
    }, { observations: 12, faultInjection: { deadlineMs: 30_000 } });
  }, 40_000);

  it('bounds repeated generation churn and completes after explicit retry', async () => {
    await withDashboardBrowser(async (browser) => {
      const churnNode = atlasNode(0);
      await browser.setRoutes([
        {
          includes: 'cursor=churn-page',
          status: 409,
          delayMs: 120,
          body: { error: 'Graph changed', code: 'VIZ_GRAPH_GENERATION_STALE', retryable: true },
        },
        {
          includes: '/viz/graph',
          status: 200,
          body: {
            nodes: [churnNode],
            edges: [],
            state: 'sparse',
            continuation: 'churn-page',
            truncated: true,
            health: { semantic_state: 'ready', pending_jobs: 0 },
          },
        },
      ]);
      await browser.goto('/?hierarchy=global');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`, 30_000);
      await browser.click('button[aria-label="Open Raw graph diagnostics"]');
      await browser.waitFor(`document.querySelector('.atlas-diagnostics')?.getAttribute('data-mode') === 'error'`, 20_000);
      expect(await browser.count('button[aria-label="Open Raw graph diagnostics"]')).toBe(1);
      expect(browser.requests.filter((request) => request.url.includes('/viz/graph')).length).toBeLessThanOrEqual(6);

      const stableNode = { ...atlasNode(1), id: 'obs:stable-after-retry', label: 'Stable after retry' };
      await browser.setRoutes([{
        includes: '/viz/graph',
        status: 200,
        body: {
          nodes: [stableNode],
          edges: [],
          state: 'sparse',
          continuation: null,
          truncated: false,
          health: { semantic_state: 'ready', pending_jobs: 0 },
        },
      }]);
      await browser.click('button[aria-label="Open Raw graph diagnostics"]');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-level') === 'raw' && document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`);
      expect(await browser.count('.graph-navigator li')).toBe(1);
      expect(await browser.text('.graph-navigator')).toContain('Stable after retry');
      expect(await browser.text('body')).not.toContain('FULL_ATLAS_SECRET');
      await browser.clearRoutes();
    }, { observations: 8, faultInjection: { deadlineMs: 40_000 } });
  }, 50_000);

  it('rejects a delayed page after the user replaces its graph scope', async () => {
    await withDashboardBrowser(async (browser) => {
      const initialPage = scopedUniversePage('Initial scope constellation', 'scope-initial');
      const stalePage = scopedUniversePage('Stale scope constellation', 'scope-stale', 'facet:project:scope-a');
      const freshPage = scopedUniversePage('Fresh scope constellation', 'scope-fresh', 'facet:project:scope-a');
      await browser.setRoutes([
        { includes: '/viz/atlas?level=universe&hierarchy=project&project_token=facet%3Aproject%3Ascope-a&query=scope-b', status: 200, delayMs: 40, body: freshPage },
        {
          includes: '/viz/atlas?level=universe&hierarchy=project&project_token=facet%3Aproject%3Ascope-a',
          status: 200,
          delayMs: 1_200,
          body: stalePage,
        },
        { includes: '/viz/atlas?level=universe&hierarchy=project', status: 200, body: initialPage },
      ]);

      await browser.goto('/');
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`);
      await browser.click('button[aria-controls="atlas-scope-panel"]');
      await browser.waitFor(`document.querySelector('.guided-scope-bar[data-resource-state="ready"]')`);
      await browser.click('[role="combobox"][aria-label="Project"]');
      await browser.fill('[role="combobox"][aria-label="Project"]', 'scope-a');
      await browser.key('ArrowDown');
      await browser.key('Enter');
      await browser.waitFor(`new URLSearchParams(location.search).get('project_token') === 'facet:project:scope-a'`);
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 120))`);
      await browser.fill('input[aria-label="Explore memories"]', 'scope-b');
      await browser.waitFor(`new URLSearchParams(location.search).get('q') === 'scope-b'`);
      await browser.waitFor(`document.querySelector('[data-testid="memory-map-surface"]')?.getAttribute('data-atlas-load-state') === 'complete'`);
      await browser.evaluate(`new Promise((resolve) => setTimeout(resolve, 1_350))`);

      expect(await browser.text('.graph-navigator')).toContain('Fresh scope constellation');
      expect(await browser.text('body')).not.toContain('Stale scope constellation');
      expect(await browser.attribute('[data-testid="memory-map-surface"]', 'data-node-count')).toBe('1');
      expect(browser.requests.some((request) => request.url.includes('project_token=facet%3Aproject%3Ascope-a'))).toBe(true);
      expect(browser.requests.some((request) => request.url.includes('query=scope-b'))).toBe(true);
      expect(browser.requests.some((request) => request.url.includes('/viz/graph'))).toBe(false);
      await browser.clearRoutes();
    }, { observations: 4, faultInjection: { deadlineMs: 35_000 } });
  }, 45_000);
  });
}
