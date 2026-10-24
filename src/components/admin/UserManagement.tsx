import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { logAdminAction, getStoredAdminSession } from '../../lib/adminAuth';
import {
  Search,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  MapPin,
  ChevronLeft,
  ChevronRight,
  UserX,
  UserCheck,
  Flag,
  X,
  CreditCard,
} from 'lucide-react';

interface ProfileRecord {
  id: string;
  role: 'worker' | 'employer' | 'admin';
  full_name: string;
  phone_number: string | null;
  email: string | null;
  location: string | null;
  village: string | null;
  district: string | null;
  state: string | null;
  account_status: string | null;
  created_at: string | null;
  bank_account_no: string | null;
  upi_id: string | null;
  category?: string | null;
  skills?: string[] | null;
  experience_years?: number | null;
  daily_wage?: number | null;
  workers?: {
    category?: string | null;
    skills?: string[] | null;
    experience_years?: number | null;
    daily_wage?: number | null;
    average_rating?: number | null;
    is_available?: boolean | null;
    experience_description?: string | null;
  } | null;
}

export function UserManagement() {
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'worker' | 'employer'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deactivated'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Privacy: show full phone number map
  const [revealedPhones, setRevealedPhones] = useState<Record<string, boolean>>({});

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Selected User Detail Drawer
  const [selectedProfile, setSelectedProfile] = useState<ProfileRecord | null>(null);

  // Moderation Action Modal state
  const [modModal, setModModal] = useState<{
    isOpen: boolean;
    profile: ProfileRecord | null;
    actionType: 'suspend' | 'restore' | 'flag';
    reason: string;
    submitting: boolean;
    error: string;
  }>({
    isOpen: false,
    profile: null,
    actionType: 'suspend',
    reason: '',
    submitting: false,
    error: '',
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, role, full_name, phone_number, email, location, village, district, state,
          account_status, created_at, bank_account_no, upi_id, category, skills, experience_years, daily_wage,
          workers (
            category, skills, experience_years, daily_wage, average_rating, is_available, experience_description
          )
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setProfiles(data as unknown as ProfileRecord[]);
      }
    } catch (err) {
      console.warn('Error fetching profiles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Masking phone number helper
  const formatPhone = (phone: string | null | undefined, profileId: string) => {
    if (!phone) return 'No Phone';
    const isRevealed = revealedPhones[profileId];
    if (isRevealed) return phone;
    const clean = phone.trim();
    if (clean.length < 7) return clean;
    return clean.slice(0, 3) + ' ••••• ' + clean.slice(-4);
  };

  const togglePhoneReveal = (profileId: string) => {
    setRevealedPhones((prev) => ({ ...prev, [profileId]: !prev[profileId] }));
  };

  // Filtered profiles
  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      // Role filter
      if (roleFilter !== 'all' && p.role !== roleFilter) return false;

      // Status filter
      const pStatus = p.account_status || 'active';
      if (statusFilter !== 'all' && pStatus !== statusFilter) return false;

      // Category filter (for workers)
      if (categoryFilter !== 'all') {
        const cat = p.category || p.workers?.category;
        if (cat !== categoryFilter) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (p.full_name || '').toLowerCase().includes(q);
        const phoneMatch = (p.phone_number || '').includes(q);
        const locMatch = `${p.location || ''} ${p.village || ''} ${p.district || ''}`.toLowerCase().includes(q);
        const skillMatch = (p.skills || p.workers?.skills || []).some((s) => s.toLowerCase().includes(q));
        if (!nameMatch && !phoneMatch && !locMatch && !skillMatch) return false;
      }

      return true;
    });
  }, [profiles, roleFilter, statusFilter, categoryFilter, searchQuery]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredProfiles.length / PAGE_SIZE) || 1;
  const paginatedProfiles = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProfiles.slice(start, start + PAGE_SIZE);
  }, [filteredProfiles, currentPage]);

  // Calculate worker profile completeness
  const getCompleteness = (p: ProfileRecord): number => {
    let score = 0;
    if (p.full_name) score += 20;
    if (p.phone_number) score += 20;
    if (p.location || p.village) score += 20;
    if (p.category || p.workers?.category) score += 20;
    if ((p.skills && p.skills.length > 0) || (p.workers?.skills && p.workers.skills.length > 0)) score += 10;
    if (p.bank_account_no || p.upi_id) score += 10;
    return score;
  };

  // Open moderation confirmation modal
  const openModerationModal = (profile: ProfileRecord, action: 'suspend' | 'restore' | 'flag') => {
    setModModal({
      isOpen: true,
      profile,
      actionType: action,
      reason: '',
      submitting: false,
      error: '',
    });
  };

  // Submit moderation action
  const handleConfirmModeration = async () => {
    if (!modModal.profile) return;
    if (!modModal.reason.trim()) {
      setModModal((prev) => ({ ...prev, error: 'A valid moderation reason is required for administrative auditing.' }));
      return;
    }

    setModModal((prev) => ({ ...prev, submitting: true, error: '' }));

    try {
      const adminSession = getStoredAdminSession();
      const targetId = modModal.profile.id;
      const targetRole = modModal.profile.role;

      if (modModal.actionType === 'suspend') {
        // Soft-deactivate profile
        await supabase
          .from('profiles')
          .update({ account_status: 'deactivated' })
          .eq('id', targetId);

        // If worker, set is_available = false
        if (targetRole === 'worker') {
          await supabase
            .from('workers')
            .update({ is_available: false })
            .eq('id', targetId);
        }

        await logAdminAction({
          adminId: adminSession?.user?.id,
          adminEmail: adminSession?.user?.email,
          action: 'user_account_suspended',
          targetType: 'profile',
          targetId,
          reason: modModal.reason.trim(),
          metadata: { previous_status: modModal.profile.account_status, name: modModal.profile.full_name },
        });

        showToast(`Account for ${modModal.profile.full_name} has been suspended.`);
      } else if (modModal.actionType === 'restore') {
        // Restore active status
        await supabase
          .from('profiles')
          .update({ account_status: 'active' })
          .eq('id', targetId);

        if (targetRole === 'worker') {
          await supabase
            .from('workers')
            .update({ is_available: true })
            .eq('id', targetId);
        }

        await logAdminAction({
          adminId: adminSession?.user?.id,
          adminEmail: adminSession?.user?.email,
          action: 'user_account_restored',
          targetType: 'profile',
          targetId,
          reason: modModal.reason.trim(),
          metadata: { previous_status: modModal.profile.account_status, name: modModal.profile.full_name },
        });

        showToast(`Account for ${modModal.profile.full_name} has been restored.`);
      } else if (modModal.actionType === 'flag') {
        // Log flagged alert
        await logAdminAction({
          adminId: adminSession?.user?.id,
          adminEmail: adminSession?.user?.email,
          action: 'user_account_flagged',
          targetType: 'profile',
          targetId,
          reason: modModal.reason.trim(),
          metadata: { name: modModal.profile.full_name },
        });

        showToast(`Account for ${modModal.profile.full_name} flagged for supervisory review.`);
      }

      setModModal({ isOpen: false, profile: null, actionType: 'suspend', reason: '', submitting: false, error: '' });
      fetchUsers();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error updating account status.';
      setModModal((prev) => ({ ...prev, submitting: false, error: message }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-2xl shadow-2xl text-xs font-bold border flex items-center gap-2 ${
            toast.type === 'success'
              ? 'bg-emerald-950 border-emerald-800 text-emerald-200'
              : 'bg-rose-950 border-rose-800 text-rose-200'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
            Platform Users
          </span>
          <h1 className="text-2xl font-heading font-black text-white tracking-tight">
            User & Worker Directory Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Search, inspect, and moderate registered workers and job hirers across rural districts.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchUsers}
          className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white transition flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Refresh Users</span>
        </button>
      </div>

      {/* FILTERS & SEARCH BAR */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by name, phone, village, skills..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Role Filter */}
          <div>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as 'all' | 'worker' | 'employer');
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Roles (Workers & Employers)</option>
              <option value="worker">Workers Only</option>
              <option value="employer">Employers Only</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'all' | 'active' | 'deactivated');
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Account Statuses</option>
              <option value="active">Active Accounts</option>
              <option value="deactivated">Suspended / Deactivated</option>
            </select>
          </div>
        </div>

        {/* Category Pills (Workers) */}
        {roleFilter !== 'employer' && (
          <div className="flex items-center gap-2 overflow-x-auto pt-1 text-xs">
            <span className="text-slate-500 font-bold shrink-0">Category:</span>
            {['all', 'Agriculture', 'Construction', 'Daily work', 'Skilled self-employed'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategoryFilter(cat);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {cat === 'all' ? 'All Domains' : cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* USER TABLE VIEW */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-bold">User & Role</th>
                <th className="py-3 px-4 font-bold">Protected Phone</th>
                <th className="py-3 px-4 font-bold">Location / District</th>
                <th className="py-3 px-4 font-bold">Domain / Wage</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold text-right">Moderation Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
                    <span>Loading platform users...</span>
                  </td>
                </tr>
              ) : paginatedProfiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No users found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedProfiles.map((p) => {
                  const isDeactivated = p.account_status === 'deactivated';
                  const domain = p.category || p.workers?.category || (p.role === 'employer' ? 'Hirer / Employer' : 'General Labor');
                  const wage = p.daily_wage || p.workers?.daily_wage;

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition">
                      {/* Name & Role */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                              p.role === 'worker'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                            }`}
                          >
                            {p.full_name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div className="overflow-hidden">
                            <div className="font-bold text-white text-xs truncate">
                              {p.full_name || 'Unnamed Citizen'}
                            </div>
                            <span
                              className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                p.role === 'worker'
                                  ? 'bg-emerald-950 text-emerald-300'
                                  : 'bg-blue-950 text-blue-300'
                              }`}
                            >
                              {p.role}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Phone Number with Privacy Mask */}
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <span>{formatPhone(p.phone_number, p.id)}</span>
                          {p.phone_number && (
                            <button
                              type="button"
                              onClick={() => togglePhoneReveal(p.id)}
                              className="text-slate-500 hover:text-emerald-400 transition cursor-pointer p-0.5"
                              title={revealedPhones[p.id] ? 'Mask phone' : 'Reveal phone'}
                            >
                              {revealedPhones[p.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Location */}
                      <td className="py-3.5 px-4 text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate max-w-[140px]">
                            {p.village || p.location || p.district || 'Rural Center'}
                          </span>
                        </div>
                      </td>

                      {/* Domain / Wage */}
                      <td className="py-3.5 px-4">
                        <div className="text-white font-medium truncate max-w-[150px]">{domain}</div>
                        {wage ? (
                          <div className="text-[11px] text-emerald-400 font-bold">₹{wage}/day</div>
                        ) : null}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isDeactivated ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                            Suspended
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                            Active
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedProfile(p)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                            title="Inspect User Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {isDeactivated ? (
                            <button
                              type="button"
                              onClick={() => openModerationModal(p, 'restore')}
                              className="p-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 transition cursor-pointer"
                              title="Restore Account"
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openModerationModal(p, 'suspend')}
                              className="p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 transition cursor-pointer"
                              title="Suspend Account"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openModerationModal(p, 'flag')}
                            className="p-1.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 transition cursor-pointer"
                            title="Flag Account for Review"
                          >
                            <Flag className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing <strong className="text-white">{paginatedProfiles.length}</strong> of{' '}
            <strong className="text-white">{filteredProfiles.length}</strong> users
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-30 hover:bg-slate-800 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-white px-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-30 hover:bg-slate-800 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* USER DETAIL INSPECT DRAWER */}
      {selectedProfile && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex justify-end">
          <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
                  {selectedProfile.full_name?.charAt(0) || 'U'}
                </div>
                <div>
                  <h3 className="font-heading font-black text-base text-white">
                    {selectedProfile.full_name}
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    ID: {selectedProfile.id.slice(0, 8)}...
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProfile(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Completeness Score */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-bold">Profile Completeness Score</span>
                <span className="text-emerald-400 font-black">{getCompleteness(selectedProfile)}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  style={{ width: `${getCompleteness(selectedProfile)}%` }}
                  className="h-full bg-emerald-500 rounded-full"
                />
              </div>
            </div>

            {/* Overview Section */}
            <div className="space-y-3 text-xs">
              <h4 className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                Profile Information
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Role</span>
                  <span className="font-bold text-white capitalize">{selectedProfile.role}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Account Status</span>
                  <span className={`font-bold ${selectedProfile.account_status === 'deactivated' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {selectedProfile.account_status || 'active'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Phone Number</span>
                  <span className="font-mono font-bold text-white">
                    {selectedProfile.phone_number || 'Unprovided'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Registered Date</span>
                  <span className="font-bold text-white">
                    {selectedProfile.created_at ? new Date(selectedProfile.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Worker Specific Details */}
            {selectedProfile.role === 'worker' && (
              <div className="space-y-3 text-xs">
                <h4 className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                  Worker Domain & Skills
                </h4>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Domain:</span>
                    <span className="font-bold text-white">{selectedProfile.category || selectedProfile.workers?.category || 'General'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Expected Daily Wage:</span>
                    <span className="font-bold text-emerald-400">₹{selectedProfile.daily_wage || selectedProfile.workers?.daily_wage || 500}/day</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Experience Years:</span>
                    <span className="font-bold text-white">{selectedProfile.experience_years || selectedProfile.workers?.experience_years || 1} years</span>
                  </div>
                </div>

                {/* Skills Chips */}
                <div>
                  <span className="text-slate-500 text-[11px] block mb-1.5 font-bold">Registered Skills:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedProfile.skills || selectedProfile.workers?.skills || []).length === 0 ? (
                      <span className="text-slate-500 italic text-[11px]">No skill chips added</span>
                    ) : (
                      (selectedProfile.skills || selectedProfile.workers?.skills || []).map((sk, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-700">
                          {sk}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Direct Bank Settlement Indicator */}
            <div className="space-y-3 text-xs">
              <h4 className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                Direct Settlement Status
              </h4>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  <span>Direct Bank / UPI Account:</span>
                </div>
                <span className="font-bold text-white">
                  {selectedProfile.bank_account_no || selectedProfile.upi_id ? 'Configured ✓' : 'Not Linked'}
                </span>
              </div>
            </div>

            {/* Drawer Actions */}
            <div className="pt-4 border-t border-slate-800 flex items-center gap-2">
              {selectedProfile.account_status === 'deactivated' ? (
                <button
                  type="button"
                  onClick={() => {
                    openModerationModal(selectedProfile, 'restore');
                    setSelectedProfile(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer"
                >
                  Restore Account
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    openModerationModal(selectedProfile, 'suspend');
                    setSelectedProfile(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition cursor-pointer"
                >
                  Suspend Account
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION & AUDIT REASON MODAL */}
      {modModal.isOpen && modModal.profile && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  modModal.actionType === 'suspend'
                    ? 'bg-rose-500/20 text-rose-400'
                    : modModal.actionType === 'restore'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-amber-500/20 text-amber-400'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-black text-base text-white capitalize">
                  Confirm Account {modModal.actionType}
                </h3>
                <p className="text-xs text-slate-400">
                  Target User: <strong className="text-white">{modModal.profile.full_name}</strong>
                </p>
              </div>
            </div>

            {modModal.error && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs">
                {modModal.error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5" htmlFor="audit-reason">
                Required Audit Reason & Justification *
              </label>
              <textarea
                id="audit-reason"
                required
                rows={3}
                value={modModal.reason}
                onChange={(e) => setModModal((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="State the regulatory, safety, or citizen request reason for this change..."
                className="w-full p-3 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                This entry will be permanently written to the admin audit ledger.
              </span>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModModal({ isOpen: false, profile: null, actionType: 'suspend', reason: '', submitting: false, error: '' })}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modModal.submitting}
                onClick={handleConfirmModeration}
                className={`flex-1 py-2.5 rounded-xl text-white font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
                  modModal.actionType === 'suspend'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {modModal.submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Confirm Action</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagement;
