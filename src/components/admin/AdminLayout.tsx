import React, { useState, useEffect, useCallback } from 'react';
import {
  AdminRoute,
  ROUTE_PATH_MAP,
  navigateTo,
} from '../../lib/adminRouter';
import {
  AdminSession,
  getStoredAdminSession,
  clearAdminSession,
  logAdminAction,
} from '../../lib/adminAuth';
import { supabase } from '../../lib/supabase';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Wrench,
  ShieldAlert,
  Globe2,
  BarChart3,
  FileText,
  LogOut,
  Bell,
  Search,
  Menu,
  X,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface AdminLayoutProps {
  currentRoute: AdminRoute;
  children: React.ReactNode;
  onLogout?: () => void;
  onNavigatePublic?: () => void;
  globalSearchQuery?: string;
  onGlobalSearchChange?: (q: string) => void;
}

interface AdminNotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'alert' | 'warning' | 'info' | 'moderation';
  is_read: boolean;
  link?: string | null;
  created_at?: string | null;
}

export function AdminLayout({
  currentRoute,
  children,
  onLogout,
  onNavigatePublic,
  globalSearchQuery = '',
  onGlobalSearchChange,
}: AdminLayoutProps) {
  const [session, setSession] = useState<AdminSession | null>(() => getStoredAdminSession());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([]);
  const [openComplaintsCount, setOpenComplaintsCount] = useState<number>(0);
  const [searchInput, setSearchInput] = useState(globalSearchQuery);

  // Sync session state
  useEffect(() => {
    const s = getStoredAdminSession();
    if (!s) {
      navigateTo('/admin/login');
      return;
    }
    setSession(s);
  }, [currentRoute]);

  // Fetch pending counts and notifications
  const fetchAdminAlerts = useCallback(async () => {
    try {
      // 1. Open complaints count
      const { count: compCount } = await supabase
        .from('complaints')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'under_review', 'investigating']);

      setOpenComplaintsCount(compCount || 0);

      // 2. Admin notifications
      const { data: notifData } = await supabase
        .from('admin_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (notifData && notifData.length > 0) {
        setNotifications(notifData as AdminNotificationItem[]);
      } else {
        // Fallback default notifications if database is fresh
        const initialNotifs: AdminNotificationItem[] = [];
        if ((compCount || 0) > 0) {
          initialNotifs.push({
            id: 'notif_comp_1',
            title: 'Unresolved Citizen Grievances',
            message: `${compCount} open safety reports require administrator review.`,
            type: 'alert',
            is_read: false,
            link: '/admin/complaints',
          });
        }
        initialNotifs.push({
          id: 'notif_welcome',
          title: 'Security Governance Active',
          message: 'All administrative actions are encrypted and logged to the audit trail.',
          type: 'info',
          is_read: true,
          link: '/admin/audit-logs',
        });
        setNotifications(initialNotifs);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    fetchAdminAlerts();
    const interval = setInterval(fetchAdminAlerts, 60000); // 1-minute live refresh
    return () => clearInterval(interval);
  }, [fetchAdminAlerts]);

  // Handle Mark All Read
  const handleMarkAllRead = async () => {
    try {
      await supabase
        .from('admin_notifications')
        .update({ is_read: true })
        .eq('is_read', false);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  };

  // Handle Admin Logout
  const handleAdminLogout = async () => {
    const adminUser = session?.user;
    if (adminUser) {
      await logAdminAction({
        adminId: adminUser.id,
        adminEmail: adminUser.email || undefined,
        action: 'admin_logout',
        targetType: 'auth',
        targetId: adminUser.id,
        reason: 'Administrator terminated session',
      });
    }

    clearAdminSession();
    await supabase.auth.signOut();
    if (onLogout) {
      onLogout();
    }
    navigateTo('/admin/login');
  };

  const navItems: Array<{
    route: AdminRoute;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string | null;
    badgeColor?: string;
  }> = [
    {
      route: 'admin-overview',
      label: 'Overview & Metrics',
      icon: LayoutDashboard,
    },
    {
      route: 'admin-users',
      label: 'User & Worker Directory',
      icon: Users,
    },
    {
      route: 'admin-jobs',
      label: 'Jobs & Applications',
      icon: Briefcase,
    },
    {
      route: 'admin-equipment',
      label: 'Machinery & Rentals',
      icon: Wrench,
    },
    {
      route: 'admin-complaints',
      label: 'Grievances & Safety',
      icon: ShieldAlert,
      badge: openComplaintsCount > 0 ? openComplaintsCount : null,
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      route: 'admin-content',
      label: 'CMS & Translations',
      icon: Globe2,
    },
    {
      route: 'admin-analytics',
      label: 'Operational Analytics',
      icon: BarChart3,
    },
    {
      route: 'admin-audit-logs',
      label: 'Security Audit Logs',
      icon: FileText,
    },
  ];

  const currentNav = navItems.find((item) => item.route === currentRoute) || navItems[0];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Banner / Security Badge Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-1.5 text-[11px] text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-slate-300">QuickHire Secure Administrative Console</span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="hidden sm:inline text-slate-400 font-mono">
            Role: {session?.adminRole || 'super_admin'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Supabase SMS Auth Active
          </span>
          <button
            type="button"
            onClick={() => {
              if (onNavigatePublic) onNavigatePublic();
              else navigateTo('/');
            }}
            className="text-slate-400 hover:text-emerald-400 transition flex items-center gap-1 cursor-pointer"
            title="Switch to Public QuickHire Portal"
          >
            <span className="hidden sm:inline">Public Website</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR NAVIGATION (Desktop + Mobile Drawer) */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-slate-900/95 lg:bg-slate-900 border-r border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Sidebar Header */}
          <div>
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black shadow-md shadow-emerald-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-heading font-black text-base text-white tracking-tight leading-none">
                    Quick<span className="text-emerald-400">Hire</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Admin Suite
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Links */}
            <nav className="p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentRoute === item.route;
                return (
                  <button
                    key={item.route}
                    type="button"
                    onClick={() => {
                      navigateTo(ROUTE_PATH_MAP[item.route]);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-xs'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 ${
                          isActive ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          item.badgeColor || 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer (Admin Profile & Logout) */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/40">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-black text-xs shrink-0">
                  {session?.user?.email?.charAt(0).toUpperCase() || 'A'}
                </div>
                <div className="overflow-hidden">
                  <div className="text-xs font-bold text-white truncate">
                    {session?.user?.email || 'Administrator'}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono truncate">
                    {session?.verifiedPhone ? `2FA: +${session.verifiedPhone.slice(-4)}` : '2FA Active'}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAdminLogout}
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-300 hover:border-rose-800 border border-slate-700 text-xs font-bold text-slate-300 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out Admin</span>
            </button>
          </div>
        </aside>

        {/* MAIN VIEWPORT */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Top Bar Navigation */}
          <header className="sticky top-0 z-30 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            {/* Left: Mobile hamburger & breadcrumbs */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-medium hidden sm:inline">Admin</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 hidden sm:inline" />
                <span className="font-heading font-black text-white text-sm sm:text-base">
                  {currentNav.label}
                </span>
              </div>
            </div>

            {/* Center: Global Search */}
            <div className="flex-1 max-w-md hidden md:block">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    if (onGlobalSearchChange) onGlobalSearchChange(e.target.value);
                  }}
                  placeholder="Global search (workers, jobs, equipment, complaints)..."
                  className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Right: Actions, Notifications & Quick links */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Notifications Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                  title="Admin Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 p-3 overflow-hidden">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                      <span className="font-heading font-bold text-xs text-white">
                        System Notifications ({unreadCount} unread)
                      </span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllRead}
                          className="text-[10px] text-emerald-400 hover:underline font-bold cursor-pointer"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>

                    <div className="max-h-72 overflow-y-auto space-y-2">
                      {notifications.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-500">
                          No notifications right now.
                        </div>
                      ) : (
                        notifications.map((item) => (
                          <div
                            key={item.id}
                            className={`p-2.5 rounded-xl border text-xs transition ${
                              item.is_read
                                ? 'bg-slate-950/40 border-slate-800 text-slate-400'
                                : 'bg-slate-800/80 border-slate-700 text-slate-200'
                            }`}
                          >
                            <div className="font-bold text-white text-xs flex items-center gap-1.5">
                              {item.type === 'alert' && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                              {item.type === 'info' && <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                              <span>{item.title}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                              {item.message}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* View Public Site button */}
              <button
                type="button"
                onClick={() => {
                  if (onNavigatePublic) onNavigatePublic();
                  else navigateTo('/');
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>QuickHire Site</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </header>

          {/* Child View Content */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export default AdminLayout;
