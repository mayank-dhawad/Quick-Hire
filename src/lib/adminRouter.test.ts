import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCurrentRoute,
  isAdminPath,
  navigateTo,
  subscribeToRoute,
  ROUTE_PATH_MAP,
} from './adminRouter';

describe('AdminRouter', () => {
  beforeEach(() => {
    window.history.pushState(null, '', '/');
  });

  it('identifies public route when pathname is root "/"', () => {
    window.history.pushState(null, '', '/');
    const { route, path } = getCurrentRoute();
    expect(route).toBe('public');
    expect(path).toBe('/');
    expect(isAdminPath()).toBe(false);
  });

  it('identifies admin-login route when pathname is "/admin/login"', () => {
    window.history.pushState(null, '', '/admin/login');
    const { route } = getCurrentRoute();
    expect(route).toBe('admin-login');
    expect(isAdminPath('/admin/login')).toBe(true);
  });

  it('identifies admin-overview route when pathname is "/admin" or "/admin/overview"', () => {
    window.history.pushState(null, '', '/admin');
    expect(getCurrentRoute().route).toBe('admin-overview');

    window.history.pushState(null, '', '/admin/overview');
    expect(getCurrentRoute().route).toBe('admin-overview');
  });

  it('identifies specific admin sub-routes correctly', () => {
    const testCases: Array<{ path: string; expected: string }> = [
      { path: '/admin/users', expected: 'admin-users' },
      { path: '/admin/jobs', expected: 'admin-jobs' },
      { path: '/admin/equipment', expected: 'admin-equipment' },
      { path: '/admin/complaints', expected: 'admin-complaints' },
      { path: '/admin/content', expected: 'admin-content' },
      { path: '/admin/analytics', expected: 'admin-analytics' },
      { path: '/admin/audit-logs', expected: 'admin-audit-logs' },
    ];

    testCases.forEach(({ path, expected }) => {
      window.history.pushState(null, '', path);
      expect(getCurrentRoute().route).toBe(expected);
      expect(isAdminPath(path)).toBe(true);
    });
  });

  it('dispatches route changes through subscribeToRoute on navigateTo', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToRoute(listener);

    navigateTo('/admin/users');
    expect(listener).toHaveBeenCalledWith('admin-users', '/admin/users');

    navigateTo('/admin/complaints');
    expect(listener).toHaveBeenCalledWith('admin-complaints', '/admin/complaints');

    unsubscribe();
    navigateTo('/admin/jobs');
    // Should not be called after unsubscribe
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('verifies ROUTE_PATH_MAP has all admin routes mapped', () => {
    expect(ROUTE_PATH_MAP['admin-overview']).toBe('/admin');
    expect(ROUTE_PATH_MAP['admin-users']).toBe('/admin/users');
    expect(ROUTE_PATH_MAP['admin-jobs']).toBe('/admin/jobs');
    expect(ROUTE_PATH_MAP['admin-equipment']).toBe('/admin/equipment');
    expect(ROUTE_PATH_MAP['admin-complaints']).toBe('/admin/complaints');
    expect(ROUTE_PATH_MAP['admin-content']).toBe('/admin/content');
    expect(ROUTE_PATH_MAP['admin-analytics']).toBe('/admin/analytics');
    expect(ROUTE_PATH_MAP['admin-audit-logs']).toBe('/admin/audit-logs');
  });
});
