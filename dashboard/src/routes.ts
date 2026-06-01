export const DASHBOARD_ROUTES = {
  retrieval: '/',
  operations: '/console/operations',
  traces: '/console/traces',
  indexing: '/console/indexing',
  graphLite: '/console/graph',
} as const;

export function resolveDashboardRoute(pathname: string): keyof typeof DASHBOARD_ROUTES | 'unknown' {
  if (pathname === DASHBOARD_ROUTES.retrieval) return 'retrieval';
  if (pathname === DASHBOARD_ROUTES.operations) return 'operations';
  if (pathname === DASHBOARD_ROUTES.traces) return 'traces';
  if (pathname === DASHBOARD_ROUTES.indexing) return 'indexing';
  if (pathname === DASHBOARD_ROUTES.graphLite) return 'graphLite';
  return 'unknown';
}
