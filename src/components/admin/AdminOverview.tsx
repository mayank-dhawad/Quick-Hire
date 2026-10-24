import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { navigateTo } from '../../lib/adminRouter';
import {
  Users,
  Briefcase,
  Wrench,
  ShieldAlert,
  UserCheck,
  ArrowRight,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';

interface MetricStats {
  totalWorkers: number;
  totalEmployers: number;
  newRegistrationsWindow: number;
  openJobs: number;
  inProgressJobs: number;
  completedJobs: number;
  cancelledJobs: number;
  totalJobs: number;
  totalEquipment: number;
  availableEquipment: number;
  rentedEquipment: number;
  maintenanceEquipment: number;
  openComplaints: number;
  totalComplaints: number;
}

interface ActivityEvent {
  id: string;
  type: 'registration' | 'job' | 'equipment' | 'complaint' | 'audit';
  title: string;
  subtitle: string;
  timestamp: string;
  badge?: string;
  badgeColor?: string;
}

export function AdminOverview() {
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [stats, setStats] = useState<MetricStats>({
    totalWorkers: 0,
    totalEmployers: 0,
    newRegistrationsWindow: 0,
    openJobs: 0,
    inProgressJobs: 0,
    completedJobs: 0,
    cancelledJobs: 0,
    totalJobs: 0,
    totalEquipment: 0,
    availableEquipment: 0,
    rentedEquipment: 0,
    maintenanceEquipment: 0,
    openComplaints: 0,
    totalComplaints: 0,
  });

  const [recentActivities, setRecentActivities] = useState<ActivityEvent[]>([]);
  const [chartData, setChartData] = useState<Array<{ date: string; workers: number; employers: number }>>([]);

  const fetchLiveMetrics = useCallback(async () => {
    try {
      // Determine cutoff date for window filter
      const now = new Date();
      let cutoffDate: Date | null = null;
      if (timeFilter === '24h') cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      else if (timeFilter === '7d') cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      else if (timeFilter === '30d') cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // 1. Fetch Profiles
      const { data: allProfiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, role, full_name, created_at, account_status');

      let workersCount = 0;
      let employersCount = 0;
      let newRegWindow = 0;
      const recentUsers: ActivityEvent[] = [];

      if (!profErr && allProfiles) {
        allProfiles.forEach((p) => {
          if (p.role === 'worker') workersCount++;
          if (p.role === 'employer') employersCount++;

          if (cutoffDate && p.created_at && new Date(p.created_at) >= cutoffDate) {
            newRegWindow++;
          } else if (!cutoffDate) {
            newRegWindow++;
          }
        });

        // Slice top 5 recent profiles
        allProfiles
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
          .slice(0, 4)
          .forEach((p) => {
            recentUsers.push({
              id: p.id,
              type: 'registration',
              title: `New ${p.role === 'worker' ? 'Worker' : 'Employer'} Registered`,
              subtitle: p.full_name || 'Citizen User',
              timestamp: p.created_at || new Date().toISOString(),
              badge: p.role || 'user',
              badgeColor: p.role === 'worker' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-blue-950 text-blue-400 border border-blue-800',
            });
          });
      }

      // 2. Fetch Jobs
      const { data: allJobs, error: jobErr } = await supabase
        .from('jobs')
        .select('id, title, status, created_at, category, offered_wages');

      let openJ = 0;
      let inProgJ = 0;
      let compJ = 0;
      let cancJ = 0;
      const recentJobs: ActivityEvent[] = [];

      if (!jobErr && allJobs) {
        allJobs.forEach((j) => {
          if (j.status === 'open') openJ++;
          else if (j.status === 'in_progress') inProgJ++;
          else if (j.status === 'completed') compJ++;
          else if (j.status === 'cancelled') cancJ++;
        });

        allJobs
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
          .slice(0, 4)
          .forEach((j) => {
            recentJobs.push({
              id: j.id,
              type: 'job',
              title: `Job Posted: ${j.title}`,
              subtitle: `₹${j.offered_wages}/day · ${j.category}`,
              timestamp: j.created_at || new Date().toISOString(),
              badge: j.status || 'open',
              badgeColor: 'bg-amber-950 text-amber-300 border border-amber-800',
            });
          });
      }

      // 3. Fetch Equipment
      const { data: allEquip, error: equipErr } = await supabase
        .from('equipment')
        .select('id, title, status, created_at, daily_rent');

      let availE = 0;
      let rentE = 0;
      let maintE = 0;

      if (!equipErr && allEquip) {
        allEquip.forEach((e) => {
          if (e.status === 'available') availE++;
          else if (e.status === 'rented') rentE++;
          else if (e.status === 'maintenance') maintE++;
        });
      }

      // 4. Fetch Complaints
      const { data: allComplaints, error: compErr } = await supabase
        .from('complaints')
        .select('id, title, category, status, priority, created_at');

      let openC = 0;
      const recentComplaints: ActivityEvent[] = [];

      if (!compErr && allComplaints) {
        allComplaints.forEach((c) => {
          if (c.status === 'open' || c.status === 'under_review' || c.status === 'investigating') {
            openC++;
          }
        });

        allComplaints
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
          .slice(0, 3)
          .forEach((c) => {
            recentComplaints.push({
              id: c.id,
              type: 'complaint',
              title: `Grievance Reported: ${c.title}`,
              subtitle: `Category: ${c.category} · Priority: ${c.priority}`,
              timestamp: c.created_at || new Date().toISOString(),
              badge: c.status,
              badgeColor: 'bg-rose-950 text-rose-300 border border-rose-800',
            });
          });
      }

      // 5. Aggregate Recent Activities
      const combined = [...recentUsers, ...recentJobs, ...recentComplaints].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setRecentActivities(combined.slice(0, 8));

      // 6. Build Trends Chart Data (Past 7 days buckets)
      const dayBuckets: Record<string, { workers: number; employers: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dayBuckets[key] = { workers: 0, employers: 0 };
      }

      if (allProfiles) {
        allProfiles.forEach((p) => {
          if (p.created_at) {
            const d = new Date(p.created_at);
            const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (dayBuckets[key]) {
              if (p.role === 'worker') dayBuckets[key].workers++;
              if (p.role === 'employer') dayBuckets[key].employers++;
            }
          }
        });
      }

      const formattedChart = Object.entries(dayBuckets).map(([date, counts]) => ({
        date,
        workers: counts.workers,
        employers: counts.employers,
      }));
      setChartData(formattedChart);

      setStats({
        totalWorkers: workersCount,
        totalEmployers: employersCount,
        newRegistrationsWindow: newRegWindow,
        openJobs: openJ,
        inProgressJobs: inProgJ,
        completedJobs: compJ,
        cancelledJobs: cancJ,
        totalJobs: (allJobs || []).length,
        totalEquipment: (allEquip || []).length,
        availableEquipment: availE,
        rentedEquipment: rentE,
        maintenanceEquipment: maintE,
        openComplaints: openC,
        totalComplaints: (allComplaints || []).length,
      });
    } catch (err) {
      console.warn('Metrics aggregation error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timeFilter]);

  useEffect(() => {
    fetchLiveMetrics();
  }, [fetchLiveMetrics]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLiveMetrics();
  };

  return (
    <div className="space-y-8">
      {/* Header & Date Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
            System Dashboard
          </span>
          <h1 className="text-2xl sm:text-3xl font-heading font-black text-white tracking-tight">
            Platform Overview & Live Metrics
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Calculated in real-time from active Supabase database records. Zero mock data.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Time Filter Pills */}
          <div className="bg-slate-900 border border-slate-800 p-1 rounded-xl flex items-center text-xs">
            {(['24h', '7d', '30d', 'all'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setTimeFilter(filter)}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  timeFilter === filter
                    ? 'bg-emerald-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {filter === '24h' ? '24 Hours' : filter === '7d' ? '7 Days' : filter === '30d' ? '30 Days' : 'All Time'}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 hover:text-white transition cursor-pointer"
            title="Refresh Live Metrics"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* CORE KPI SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Registered Workers */}
        <div
          onClick={() => navigateTo('/admin/users')}
          className="bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 p-5 rounded-2xl shadow-xl transition-all hover:shadow-emerald-950/20 cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Users className="w-5 h-5" />
            </span>
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 group-hover:text-emerald-400 transition">
              <span>View Workers</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
          <div className="text-3xl font-heading font-black text-white">
            {loading ? '...' : stats.totalWorkers}
          </div>
          <div className="text-xs font-bold text-slate-300 mt-1">Total Registered Workers</div>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
            Verified agricultural, construction & skilled labor profiles
          </p>
        </div>

        {/* Metric 2: Registered Employers */}
        <div
          onClick={() => navigateTo('/admin/users')}
          className="bg-slate-900/90 border border-slate-800 hover:border-blue-500/40 p-5 rounded-2xl shadow-xl transition-all hover:shadow-blue-950/20 cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <UserCheck className="w-5 h-5" />
            </span>
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 group-hover:text-blue-400 transition">
              <span>View Hirers</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
          <div className="text-3xl font-heading font-black text-white">
            {loading ? '...' : stats.totalEmployers}
          </div>
          <div className="text-xs font-bold text-slate-300 mt-1">Total Registered Employers</div>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
            Farmers, contractors & rural business hirers
          </p>
        </div>

        {/* Metric 3: Active Jobs */}
        <div
          onClick={() => navigateTo('/admin/jobs')}
          className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 p-5 rounded-2xl shadow-xl transition-all hover:shadow-amber-950/20 cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Briefcase className="w-5 h-5" />
            </span>
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 group-hover:text-amber-400 transition">
              <span>View Jobs</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
          <div className="text-3xl font-heading font-black text-white flex items-baseline gap-2">
            <span>{loading ? '...' : stats.openJobs}</span>
            <span className="text-xs font-medium text-slate-500">/ {stats.totalJobs} total</span>
          </div>
          <div className="text-xs font-bold text-slate-300 mt-1">Active Job Listings</div>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
            {stats.completedJobs} completed, {stats.inProgressJobs} in progress
          </p>
        </div>

        {/* Metric 4: Equipment & Machinery */}
        <div
          onClick={() => navigateTo('/admin/equipment')}
          className="bg-slate-900/90 border border-slate-800 hover:border-purple-500/40 p-5 rounded-2xl shadow-xl transition-all hover:shadow-purple-950/20 cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Wrench className="w-5 h-5" />
            </span>
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 group-hover:text-purple-400 transition">
              <span>View Rentals</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
          <div className="text-3xl font-heading font-black text-white flex items-baseline gap-2">
            <span>{loading ? '...' : stats.availableEquipment}</span>
            <span className="text-xs font-medium text-slate-500">/ {stats.totalEquipment} total</span>
          </div>
          <div className="text-xs font-bold text-slate-300 mt-1">Available Rental Listings</div>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
            {stats.rentedEquipment} rented, {stats.maintenanceEquipment} in maintenance
          </p>
        </div>
      </div>

      {/* SECONDARY ROW: GRIEVANCE ALERTS & ACTIVITY CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Activity Trend Chart */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-heading font-black text-base text-white">
                  User Registration Activity (Last 7 Days)
                </h3>
                <p className="text-xs text-slate-400">
                  Daily distribution of new worker vs employer signups
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  Workers
                </span>
                <span className="flex items-center gap-1.5 text-blue-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                  Employers
                </span>
              </div>
            </div>

            {/* SVG Responsive Bar Chart */}
            <div className="h-56 w-full flex items-end justify-between gap-3 pt-6 pb-2 px-2 border-b border-slate-800">
              {chartData.map((item, idx) => {
                const maxVal = Math.max(
                  ...chartData.map((c) => Math.max(c.workers, c.employers)),
                  4
                );
                const workerHeight = (item.workers / maxVal) * 100;
                const employerHeight = (item.employers / maxVal) * 100;

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                    <div className="w-full flex items-end justify-center gap-1.5 h-full">
                      {/* Worker Bar */}
                      <div
                        style={{ height: `${Math.max(workerHeight, 6)}%` }}
                        className="w-1/2 max-w-[20px] bg-emerald-500 rounded-t-md transition-all group-hover:bg-emerald-400 relative"
                        title={`${item.workers} workers`}
                      >
                        {item.workers > 0 && (
                          <span className="opacity-0 group-hover:opacity-100 absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-black text-emerald-300">
                            {item.workers}
                          </span>
                        )}
                      </div>

                      {/* Employer Bar */}
                      <div
                        style={{ height: `${Math.max(employerHeight, 6)}%` }}
                        className="w-1/2 max-w-[20px] bg-blue-500 rounded-t-md transition-all group-hover:bg-blue-400 relative"
                        title={`${item.employers} employers`}
                      >
                        {item.employers > 0 && (
                          <span className="opacity-0 group-hover:opacity-100 absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-black text-blue-300">
                            {item.employers}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 font-bold mt-2 truncate w-full text-center">
                      {item.date}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <span>Window Registrations: <strong className="text-white">{stats.newRegistrationsWindow}</strong></span>
            <span>Total Catalog Workers: <strong className="text-emerald-400">{stats.totalWorkers}</strong></span>
          </div>
        </div>

        {/* Right 1 Col: Grievance & Moderation Queue */}
        <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <ShieldAlert className="w-4 h-4" />
                </span>
                <h3 className="font-heading font-black text-base text-white">
                  Safety & Grievance Cases
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rose-500/20 text-rose-400 border border-rose-500/40">
                {stats.openComplaints} Open
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Grievance reports require prompt administrative evaluation. Open cases include unpaid wage disputes, safety violations, and listing misrepresentations.
            </p>

            <div className="space-y-2.5">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">Active Grievance Tickets:</span>
                <span className="font-bold text-rose-400">{stats.openComplaints}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">Total Lifetime Reports:</span>
                <span className="font-bold text-white">{stats.totalComplaints}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">Equipment in Maintenance:</span>
                <span className="font-bold text-amber-400">{stats.maintenanceEquipment}</span>
              </div>
            </div>
          </div>

          <div className="pt-5 border-t border-slate-800 mt-4">
            <button
              type="button"
              onClick={() => navigateTo('/admin/complaints')}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <span>Manage Grievance Cases</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* THIRD ROW: RECENT PLATFORM ACTIVITY FEED */}
      <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-3xl shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-heading font-black text-base text-white">
              Recent Platform Activity
            </h3>
            <p className="text-xs text-slate-400">
              Live chronological stream of registrations, postings, rentals, and reports
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigateTo('/admin/audit-logs')}
            className="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Full Audit Log</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentActivities.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No recent activity recorded.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {recentActivities.map((act) => (
              <div key={act.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 overflow-hidden">
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      act.type === 'registration'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : act.type === 'job'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {act.type === 'registration' && <Users className="w-4 h-4" />}
                    {act.type === 'job' && <Briefcase className="w-4 h-4" />}
                    {act.type === 'complaint' && <ShieldAlert className="w-4 h-4" />}
                  </span>
                  <div className="overflow-hidden">
                    <div className="text-xs font-bold text-white truncate">
                      {act.title}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {act.subtitle}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {act.badge && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${act.badgeColor}`}>
                      {act.badge}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">
                    {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminOverview;
