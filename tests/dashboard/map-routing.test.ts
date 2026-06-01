import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DASHBOARD_ROUTES, resolveDashboardRoute } from '../../dashboard/src/routes.js';

describe('dashboard v2 routing', () => {
  it('assigns canonical workspace routes under the console namespace', () => {
    expect(DASHBOARD_ROUTES.retrieval).toBe('/');
    expect(DASHBOARD_ROUTES.operations).toBe('/console/operations');
    expect(DASHBOARD_ROUTES.traces).toBe('/console/traces');
    expect(DASHBOARD_ROUTES.indexing).toBe('/console/indexing');
    expect(DASHBOARD_ROUTES.graphLite).toBe('/console/graph');

    expect(resolveDashboardRoute('/')).toBe('retrieval');
    expect(resolveDashboardRoute('/console/operations')).toBe('operations');
    expect(resolveDashboardRoute('/console/traces')).toBe('traces');
    expect(resolveDashboardRoute('/console/indexing')).toBe('indexing');
    expect(resolveDashboardRoute('/console/graph')).toBe('graphLite');
  });

  it('keeps API and legacy paths out of dashboard route resolution', () => {
    expect(resolveDashboardRoute('/operations')).toBe('unknown');
    expect(resolveDashboardRoute('/operation-traces')).toBe('unknown');
    expect(resolveDashboardRoute('/index/status')).toBe('unknown');
    expect(resolveDashboardRoute('/graph/rebuild')).toBe('unknown');
    expect(resolveDashboardRoute('/observatory')).toBe('unknown');
    expect(resolveDashboardRoute('/overview')).toBe('unknown');
    expect(resolveDashboardRoute('/graph')).toBe('unknown');
  });

  it('keeps the graph dashboard deep link distinct from graph API routes', () => {
    expect(DASHBOARD_ROUTES.graphLite).toBe('/console/graph');
    expect(resolveDashboardRoute('/console/graph')).toBe('graphLite');
    expect(resolveDashboardRoute('/projects/thoth-mem/graph')).toBe('unknown');
  });

  it('builds dashboard assets from the root so SPA deep links can hydrate', () => {
    const viteConfig = readFileSync('dashboard/vite.config.ts', 'utf8');

    expect(viteConfig).toContain("base: '/',");
    expect(viteConfig).not.toContain("base: './'");
  });
});
