import { describe, expect, it } from 'vitest';

import { DASHBOARD_ROUTES, resolveDashboardRoute } from '../../dashboard/src/routes.js';
import { isWorkspaceRoute, serializeMapFilters } from '../../dashboard/src/components/map/map-state.js';

describe('dashboard map-first routing', () => {
  it('assigns the default route to the map workspace', () => {
    expect(DASHBOARD_ROUTES.map).toBe('/');
    expect(resolveDashboardRoute('/')).toBe('map');
    expect(isWorkspaceRoute('/')).toBe(true);
  });

  it('keeps legacy overview and Graph-Lite routes reachable', () => {
    expect(DASHBOARD_ROUTES.overview).toBe('/overview');
    expect(DASHBOARD_ROUTES.graphLite).toBe('/graph');
    expect(isWorkspaceRoute('/overview')).toBe(false);
    expect(isWorkspaceRoute('/graph')).toBe(false);
    expect(resolveDashboardRoute('/overview')).toBe('overview');
    expect(resolveDashboardRoute('/graph')).toBe('graphLite');
  });

  it('serializes shareable map filters without empty values', () => {
    expect(serializeMapFilters({
      project: 'thoth-mem',
      sessionId: '',
      topicKey: 'visual/map',
      type: 'decision',
      relation: '',
      query: 'canvas',
      depth: 2,
      maxNodes: 120,
      maxEdges: 360,
    })).toBe('project=thoth-mem&topic_key=visual%2Fmap&type=decision&q=canvas&depth=2&max_nodes=120&max_edges=360');
  });
});
