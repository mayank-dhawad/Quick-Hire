export type AdminRoute =
  | 'admin-overview'
  | 'admin-users'
  | 'admin-jobs'
  | 'admin-equipment'
  | 'admin-complaints'
  | 'admin-content'
  | 'admin-analytics'
  | 'admin-audit-logs';

export type AppRoute = 'public' | 'admin-login' | AdminRoute;

export const ROUTE_PATH_MAP: Record<AdminRoute, string> = {
  'admin-overview': '/admin',
  'admin-users': '/admin/users',
  'admin-jobs': '/admin/jobs',
  'admin-equipment': '/admin/equipment',
  'admin-complaints': '/admin/complaints',
  'admin-content': '/admin/content',
  'admin-analytics': '/admin/analytics',
  'admin-audit-logs': '/admin/audit-logs',
};

/**
 * Returns the current application route parsed from window.location.pathname
 */
export function getCurrentRoute(): { route: AppRoute; path: string } {
  if (typeof window === 'undefined') {
    return { route: 'public', path: '/' };
  }

  const path = window.location.pathname.toLowerCase().replace(/\/$/, '') || '/';

  if (path === '/admin/login') {
    return { route: 'admin-login', path };
  }

  if (path === '/admin' || path === '/admin/overview') {
    return { route: 'admin-overview', path };
  }

  if (path === '/admin/users' || path.startsWith('/admin/users/')) {
    return { route: 'admin-users', path };
  }

  if (path === '/admin/jobs' || path.startsWith('/admin/jobs/')) {
    return { route: 'admin-jobs', path };
  }

  if (path === '/admin/equipment' || path.startsWith('/admin/equipment/')) {
    return { route: 'admin-equipment', path };
  }

  if (path === '/admin/complaints' || path.startsWith('/admin/complaints/')) {
    return { route: 'admin-complaints', path };
  }

  if (path === '/admin/content' || path.startsWith('/admin/content/')) {
    return { route: 'admin-content', path };
  }

  if (path === '/admin/analytics' || path.startsWith('/admin/analytics/')) {
    return { route: 'admin-analytics', path };
  }

  if (path === '/admin/audit-logs' || path === '/admin/audit' || path.startsWith('/admin/audit/')) {
    return { route: 'admin-audit-logs', path };
  }

  return { route: 'public', path };
}

/**
 * Checks if a given pathname belongs to the admin sub-application
 */
export function isAdminPath(path = typeof window !== 'undefined' ? window.location.pathname : '/'): boolean {
  return path.toLowerCase().startsWith('/admin');
}

type RouteListener = (route: AppRoute, path: string) => void;
const listeners = new Set<RouteListener>();

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const { route, path } = getCurrentRoute();
    listeners.forEach((listener) => listener(route, path));
  });
}

/**
 * Navigates to a specific path using HTML5 pushState and dispatches update to all listeners.
 */
export function navigateTo(path: string): void {
  if (typeof window === 'undefined') return;

  if (window.location.pathname !== path) {
    window.history.pushState(null, '', path);
  }
  const { route } = getCurrentRoute();
  listeners.forEach((listener) => listener(route, path));
}

/**
 * Subscribes to route changes. Returns an unsubscribe cleanup function.
 */
export function subscribeToRoute(listener: RouteListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
