export const DASHBOARD_ROUTES = {
  map: '/',
  overview: '/overview',
  search: '/search',
  topicKeys: '/topic-keys',
  graphLite: '/graph',
} as const;

export function resolveDashboardRoute(pathname: string): keyof typeof DASHBOARD_ROUTES | 'project' | 'memory' | 'unknown' {
  if (pathname === DASHBOARD_ROUTES.map) return 'map';
  if (pathname === DASHBOARD_ROUTES.overview) return 'overview';
  if (pathname === DASHBOARD_ROUTES.search) return 'search';
  if (pathname === DASHBOARD_ROUTES.topicKeys) return 'topicKeys';
  if (pathname === DASHBOARD_ROUTES.graphLite) return 'graphLite';
  if (/^\/projects\/[^/]+$/.test(pathname)) return 'project';
  if (/^\/memory\/[^/]+$/.test(pathname)) return 'memory';
  return 'unknown';
}
