import { describe, expect, it } from 'vitest';

import { DASHBOARD_ROUTES, resolveDashboardRoute } from '../../dashboard/src/routes.js';
import { isWorkspaceRoute, serializeMapFilters } from '../../dashboard/src/components/map/map-state.js';
import {
  buildObservatoryUrl,
  buildObservatoryUrlFromSearch,
  createInitialObservatoryState,
  parseObservatorySearch,
} from '../../dashboard/src/components/observatory/context-store.js';

describe('dashboard observatory-first routing', () => {
  it('assigns the default and canonical route to the observatory workspace', () => {
    expect(DASHBOARD_ROUTES.map).toBe('/');
    expect(DASHBOARD_ROUTES.observatory).toBe('/observatory');
    expect(resolveDashboardRoute('/')).toBe('map');
    expect(resolveDashboardRoute('/observatory')).toBe('observatory');
    expect(isWorkspaceRoute('/')).toBe(true);
    expect(isWorkspaceRoute('/observatory')).toBe(true);
  });

  it('keeps legacy routes classified as adapters into observatory pivots', () => {
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

  it('preserves legacy query state when building observatory pivot URLs', () => {
    expect(buildObservatoryUrlFromSearch('?query=auth&project=thoth-mem&topic_key_exact=security/jwt', 'recall'))
      .toBe('/observatory?surface=recall&project=thoth-mem&topic_key=security%2Fjwt&q=auth');
    expect(buildObservatoryUrlFromSearch('?project=thoth-mem&relation=HAS_WHAT', 'map'))
      .toBe('/observatory?project=thoth-mem&relation=HAS_WHAT');
  });

  it('round-trips scoped observatory state with focus tokens', () => {
    const state = {
      ...createInitialObservatoryState(),
      activeSurface: 'ledger' as const,
      focusNodeId: 'obs:42',
      scope: { project: 'thoth-mem', query: 'frontier', topic_key: 'sdd/dashboard' },
    };

    expect(buildObservatoryUrl(state)).toBe('/observatory?surface=ledger&focus=obs%3A42&project=thoth-mem&topic_key=sdd%2Fdashboard&q=frontier');
    expect(parseObservatorySearch('?surface=timeline&focus=obs%3A42&project=thoth-mem').focusNodeId).toBe('obs:42');
  });
});
