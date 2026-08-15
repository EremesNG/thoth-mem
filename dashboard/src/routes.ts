export const DASHBOARD_ROUTES = {
  observatory: '/',
  retrieval: '/',
  operations: '/console/operations',
  traces: '/console/traces',
  indexing: '/console/indexing',
  observatoryAlias: '/console/graph',
  graphLite: '/console/graph',
} as const;

export type DashboardRoute = 'observatory' | 'observatoryAlias' | 'operations' | 'traces' | 'indexing' | 'unknown';
export function resolveDashboardRoute(pathname: string): DashboardRoute {
  if (pathname === DASHBOARD_ROUTES.observatory) return 'observatory';
  if (pathname === DASHBOARD_ROUTES.operations) return 'operations';
  if (pathname === DASHBOARD_ROUTES.traces) return 'traces';
  if (pathname === DASHBOARD_ROUTES.indexing) return 'indexing';
  if (pathname === DASHBOARD_ROUTES.observatoryAlias) return 'observatoryAlias';
  return 'unknown';
}
