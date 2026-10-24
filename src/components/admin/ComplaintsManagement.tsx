import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { logAdminAction, getStoredAdminSession } from '../../lib/adminAuth';
import {
  ShieldAlert,
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  PlusCircle,
  BadgeAlert,
  Scale,
} from 'lucide-react';

interface ComplaintRecord {
  id: string;
  reporter_id: string | null;
  reporter_phone: string | null;
  reporter_name: string | null;
  target_type: 'worker' | 'employer' | 'job' | 'equipment' | 'payment' | 'platform' | 'other';
  target_id: string | null;
  target_name: string | null;
  category: 'unpaid_wages' | 'unsafe_conditions' | 'harassment' | 'fraud' | 'misleading_equipment' | 'platform_abuse' | 'other';
  title: string;
  description: string;
  status: 'open' | 'under_review' | 'investigating' | 'resolved' | 'dismissed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assigned_to: string | null;
  resolution_notes: string | null;
  evidence_urls: string[] | null;
  created_at: string;
  updated_at: string | null;
  resolved_at: string | null;
}

export function ComplaintsManagement() {
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Selected Complaint for Case Drawer
  const [selectedCase, setSelectedCase] = useState<ComplaintRecord | null>(null);

  // Status & Resolution update modal
  const [updateModal, setUpdateModal] = useState<{
    isOpen: boolean;
    caseItem: ComplaintRecord | null;
    status: 'open' | 'under_review' | 'investigating' | 'resolved' | 'dismissed';
    priority: 'low' | 'medium' | 'high' | 'critical';
    resolutionNotes: string;
    submitting: boolean;
    error: string;
  }>({
    isOpen: false,
    caseItem: null,
    status: 'under_review',
    priority: 'medium',
    resolutionNotes: '',
    submitting: false,
    error: '',
  });

  // Manual Grievance Entry Modal (for toll-free intake)
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    title: '',
    reporterName: '',
    reporterPhone: '',
    targetType: 'employer' as 'worker' | 'employer' | 'job' | 'equipment' | 'payment' | 'platform' | 'other',
    targetName: '',
    category: 'unpaid_wages' as 'unpaid_wages' | 'unsafe_conditions' | 'harassment' | 'fraud' | 'misleading_equipment' | 'platform_abuse' | 'other',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    description: '',
    submitting: false,
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('complaints')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setComplaints(data as unknown as ComplaintRecord[]);
      }
    } catch (err) {
      console.warn('Error fetching complaints:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  // Filtered complaints
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && c.category !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (c.title || '').toLowerCase().includes(q);
        const descMatch = (c.description || '').toLowerCase().includes(q);
        const repMatch = (c.reporter_name || '').toLowerCase().includes(q);
        const repPhone = (c.reporter_phone || '').includes(q);
        const tgtMatch = (c.target_name || '').toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !repMatch && !repPhone && !tgtMatch) return false;
      }

      return true;
    });
  }, [complaints, statusFilter, priorityFilter, categoryFilter, searchQuery]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredComplaints.length / PAGE_SIZE) || 1;
  const paginatedComplaints = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredComplaints.slice(start, start + PAGE_SIZE);
  }, [filteredComplaints, currentPage]);

  // Open Update Modal
  const openUpdateModal = (c: ComplaintRecord) => {
    setUpdateModal({
      isOpen: true,
      caseItem: c,
      status: c.status,
      priority: c.priority,
      resolutionNotes: c.resolution_notes || '',
      submitting: false,
      error: '',
    });
  };

  // Submit case update
  const handleSaveCaseUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateModal.caseItem) return;

    setUpdateModal((prev) => ({ ...prev, submitting: true, error: '' }));

    try {
      const adminSession = getStoredAdminSession();
      const caseId = updateModal.caseItem.id;
      const prevStatus = updateModal.caseItem.status;
      const nextStatus = updateModal.status;

      const payload: {
        status: 'open' | 'under_review' | 'investigating' | 'resolved' | 'dismissed';
        priority: 'low' | 'medium' | 'high' | 'critical';
        resolution_notes: string | null;
        updated_at: string;
        assigned_to: string | null;
        resolved_at?: string;
      } = {
        status: nextStatus,
        priority: updateModal.priority,
        resolution_notes: updateModal.resolutionNotes.trim() || null,
        updated_at: new Date().toISOString(),
        assigned_to: adminSession?.user?.id || null,
      };

      if (nextStatus === 'resolved' || nextStatus === 'dismissed') {
        payload.resolved_at = new Date().toISOString();
      }

      const { error: updErr } = await supabase
        .from('complaints')
        .update(payload)
        .eq('id', caseId);

      if (updErr) throw updErr;

      // Log in admin audit logs
      await logAdminAction({
        adminId: adminSession?.user?.id,
        adminEmail: adminSession?.user?.email,
        action: 'complaint_case_updated',
        targetType: 'complaint',
        targetId: caseId,
        reason: updateModal.resolutionNotes.trim() || `Case status shifted from ${prevStatus} to ${nextStatus}`,
        metadata: {
          case_title: updateModal.caseItem.title,
          category: updateModal.caseItem.category,
          previous_status: prevStatus,
          new_status: nextStatus,
          priority: updateModal.priority,
        },
      });

      showToast(`Grievance case updated to ${nextStatus}.`);
      setUpdateModal({
        isOpen: false,
        caseItem: null,
        status: 'under_review',
        priority: 'medium',
        resolutionNotes: '',
        submitting: false,
        error: '',
      });
      fetchComplaints();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error updating grievance case.';
      setUpdateModal((prev) => ({ ...prev, submitting: false, error: message }));
    }
  };

  // Submit manual grievance entry
  const handleCreateManualComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualForm((prev) => ({ ...prev, submitting: true }));

    try {
      const adminSession = getStoredAdminSession();

      const newCase = {
        title: manualForm.title.trim(),
        reporter_name: manualForm.reporterName.trim() || 'Toll-Free Helpline Citizen',
        reporter_phone: manualForm.reporterPhone.trim() || null,
        target_type: manualForm.targetType,
        target_name: manualForm.targetName.trim() || null,
        category: manualForm.category,
        priority: manualForm.priority,
        status: 'open' as const,
        description: manualForm.description.trim(),
        assigned_to: adminSession?.user?.id || null,
      };

      const { data, error } = await supabase.from('complaints').insert(newCase).select().single();
      if (error) throw error;

      await logAdminAction({
        adminId: adminSession?.user?.id,
        adminEmail: adminSession?.user?.email,
        action: 'complaint_logged_by_admin',
        targetType: 'complaint',
        targetId: data?.id || 'manual_entry',
        reason: 'Citizen grievance recorded via toll-free helpline intake',
        metadata: { title: newCase.title, category: newCase.category },
      });

      showToast('Grievance case successfully logged into system.');
      setIsManualModalOpen(false);
      setManualForm({
        title: '',
        reporterName: '',
        reporterPhone: '',
        targetType: 'employer',
        targetName: '',
        category: 'unpaid_wages',
        priority: 'medium',
        description: '',
        submitting: false,
      });
      fetchComplaints();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error logging complaint.';
      showToast(message, 'error');
      setManualForm((prev) => ({ ...prev, submitting: false }));
    }
  };

  const openCasesCount = complaints.filter(
    (c) => c.status === 'open' || c.status === 'under_review' || c.status === 'investigating'
  ).length;

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
          <span className="text-xs font-bold text-rose-400 uppercase tracking-wider block">
            Dispute Resolution & Grievance Bureau
          </span>
          <h1 className="text-2xl font-heading font-black text-white tracking-tight">
            Complaints, Safety & Grievances Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Supervise wage disputes, working condition violations, fraud, and harassment reports.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsManualModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Log Helpline Grievance</span>
          </button>

          <button
            type="button"
            onClick={fetchComplaints}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            title="Refresh Complaints"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* STATS SUMMARY BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
          <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Grievances</span>
          <div className="text-2xl font-black text-white mt-1">{complaints.length}</div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
          <span className="text-[10px] text-rose-400 uppercase font-bold block">Active / Unresolved</span>
          <div className="text-2xl font-black text-rose-400 mt-1">{openCasesCount}</div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
          <span className="text-[10px] text-amber-400 uppercase font-bold block">Critical Priority</span>
          <div className="text-2xl font-black text-amber-400 mt-1">
            {complaints.filter((c) => c.priority === 'critical' && c.status !== 'resolved').length}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
          <span className="text-[10px] text-emerald-400 uppercase font-bold block">Successfully Mediated</span>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            {complaints.filter((c) => c.status === 'resolved').length}
          </div>
        </div>
      </div>

      {/* FILTERS & SEARCH */}
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
              placeholder="Search reports by title, reporter, target name..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Case Statuses</option>
              <option value="open">Open (New)</option>
              <option value="under_review">Under Review</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1 text-xs">
          <span className="text-slate-500 font-bold shrink-0">Violation Category:</span>
          {[
            { id: 'all', label: 'All Issues' },
            { id: 'unpaid_wages', label: 'Unpaid Wages' },
            { id: 'unsafe_conditions', label: 'Unsafe Conditions' },
            { id: 'harassment', label: 'Harassment' },
            { id: 'fraud', label: 'Profile Fraud' },
            { id: 'misleading_equipment', label: 'Misleading Machinery' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setCategoryFilter(cat.id);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap cursor-pointer ${
                categoryFilter === cat.id
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* COMPLAINTS TABLE */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-bold">Case Title & Category</th>
                <th className="py-3 px-4 font-bold">Reporter</th>
                <th className="py-3 px-4 font-bold">Target Entity</th>
                <th className="py-3 px-4 font-bold">Priority</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-rose-400" />
                    <span>Loading grievance records...</span>
                  </td>
                </tr>
              ) : paginatedComplaints.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No grievance reports found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedComplaints.map((c) => {
                  return (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition">
                      {/* Case Title & Category */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-xs truncate max-w-[220px]">
                          {c.title}
                        </div>
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-800 text-rose-300 border border-slate-700 capitalize">
                          {c.category.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Reporter */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-white truncate max-w-[130px]">
                          {c.reporter_name || 'Citizen Reporter'}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {c.reporter_phone || 'Confidential'}
                        </div>
                      </td>

                      {/* Target */}
                      <td className="py-3.5 px-4">
                        <div className="text-white font-medium truncate max-w-[130px]">
                          {c.target_name || c.target_type}
                        </div>
                        <span className="text-[10px] text-slate-500 uppercase font-bold">
                          {c.target_type}
                        </span>
                      </td>

                      {/* Priority */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            c.priority === 'critical'
                              ? 'bg-rose-500 text-white font-black animate-pulse'
                              : c.priority === 'high'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : c.priority === 'medium'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {c.priority}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                            c.status === 'resolved'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : c.status === 'dismissed'
                              ? 'bg-slate-800 text-slate-400'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {c.status.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedCase(c)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                            title="Inspect Case Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => openUpdateModal(c)}
                            className="px-2 py-1 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-bold transition cursor-pointer"
                            title="Update Status / Resolve"
                          >
                            <span>Resolve</span>
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
            Showing <strong className="text-white">{paginatedComplaints.length}</strong> of{' '}
            <strong className="text-white">{filteredComplaints.length}</strong> reports
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

      {/* CASE INSPECTION DRAWER */}
      {selectedCase && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex justify-end">
          <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                  Case ID: {selectedCase.id.slice(0, 8)}...
                </span>
                <h3 className="font-heading font-black text-base text-white">
                  {selectedCase.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCase(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Case Details Card */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Category:</span>
                <span className="font-bold text-white capitalize">{selectedCase.category.replace('_', ' ')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Priority:</span>
                <span className="font-bold uppercase text-rose-400">{selectedCase.priority}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Case Status:</span>
                <span className="font-bold text-emerald-400 capitalize">{selectedCase.status.replace('_', ' ')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Date Filed:</span>
                <span className="font-bold text-white">{new Date(selectedCase.created_at).toLocaleString()}</span>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-slate-500 text-[11px] block mb-1">Grievance Narrative:</span>
                <p className="text-slate-200 leading-relaxed text-xs p-3 bg-slate-900 rounded-xl border border-slate-800">
                  {selectedCase.description}
                </p>
              </div>

              {selectedCase.resolution_notes && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-emerald-400 font-bold text-[11px] block mb-1">Resolution & Case Notes:</span>
                  <p className="text-slate-300 leading-relaxed text-xs p-3 bg-slate-900 rounded-xl border border-slate-800">
                    {selectedCase.resolution_notes}
                  </p>
                </div>
              )}
            </div>

            {/* Statutory Disclaimer */}
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-900/60 text-[11px] text-amber-200/90 leading-relaxed space-y-1">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5" />
                <span>Statutory Dispute Notice</span>
              </div>
              Platform grievance resolution reflects administrative dispute settlement and intermediary moderation. It does not replace formal proceedings under the Minimum Wages Act or Payment of Wages Act.
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  openUpdateModal(selectedCase);
                  setSelectedCase(null);
                }}
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition cursor-pointer"
              >
                Update Case Status & Resolution
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPDATE STATUS MODAL */}
      {updateModal.isOpen && updateModal.caseItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-black">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-black text-base text-white">
                    Update Grievance Case
                  </h3>
                  <span className="text-[11px] text-slate-400 truncate max-w-[200px] block">
                    {updateModal.caseItem.title}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUpdateModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {updateModal.error && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs">
                {updateModal.error}
              </div>
            )}

            <form onSubmit={handleSaveCaseUpdate} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="case-status-sel">
                  Update Case Status
                </label>
                <select
                  id="case-status-sel"
                  value={updateModal.status}
                  onChange={(e) => setUpdateModal((prev) => ({ ...prev, status: e.target.value as ComplaintRecord['status'] }))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="open">Open (Unresolved)</option>
                  <option value="under_review">Under Review</option>
                  <option value="investigating">Investigating / Calling Parties</option>
                  <option value="resolved">Resolved (Mediated Settlement)</option>
                  <option value="dismissed">Dismissed (No Action Required)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="case-priority-sel">
                  Priority Level
                </label>
                <select
                  id="case-priority-sel"
                  value={updateModal.priority}
                  onChange={(e) => setUpdateModal((prev) => ({ ...prev, priority: e.target.value as ComplaintRecord['priority'] }))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="case-res-notes">
                  Resolution Notes & Administrative Action *
                </label>
                <textarea
                  id="case-res-notes"
                  required
                  rows={3}
                  value={updateModal.resolutionNotes}
                  onChange={(e) => setUpdateModal((prev) => ({ ...prev, resolutionNotes: e.target.value }))}
                  placeholder="Record calls made, wage settlements reached, profile suspensions, or warning notices..."
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setUpdateModal((prev) => ({ ...prev, isOpen: false }))}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateModal.submitting}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {updateModal.submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Save Case Record</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANUAL COMPLAINT CREATION MODAL */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-black">
                  <BadgeAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-black text-base text-white">
                    Intake Helpline Grievance
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Direct logging from 1800-180-1551 call intake
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualComplaint} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="man-title">
                  Case Summary / Title *
                </label>
                <input
                  id="man-title"
                  type="text"
                  required
                  value={manualForm.title}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Unpaid wages for Rampur field harvest"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="man-rep-name">
                    Reporter Name
                  </label>
                  <input
                    id="man-rep-name"
                    type="text"
                    value={manualForm.reporterName}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, reporterName: e.target.value }))}
                    placeholder="Citizen caller name"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="man-rep-phone">
                    Caller Mobile Number
                  </label>
                  <input
                    id="man-rep-phone"
                    type="text"
                    value={manualForm.reporterPhone}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, reporterPhone: e.target.value }))}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="man-cat">
                    Violation Category
                  </label>
                  <select
                    id="man-cat"
                    value={manualForm.category}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, category: e.target.value as ComplaintRecord['category'] }))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="unpaid_wages">Unpaid Wages / Settlement</option>
                    <option value="unsafe_conditions">Unsafe Working Conditions</option>
                    <option value="harassment">Harassment / Abusive Conduct</option>
                    <option value="fraud">Fraudulent Profile / Impersonation</option>
                    <option value="misleading_equipment">Misleading Machinery Listing</option>
                    <option value="platform_abuse">Other Platform Abuse</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="man-prio">
                    Priority
                  </label>
                  <select
                    id="man-prio"
                    value={manualForm.priority}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, priority: e.target.value as ComplaintRecord['priority'] }))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="man-desc">
                  Incident Description & Caller Statement *
                </label>
                <textarea
                  id="man-desc"
                  required
                  rows={3}
                  value={manualForm.description}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Record specific reporting details, dates, parties involved, and location..."
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={manualForm.submitting}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {manualForm.submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Log Grievance Ticket</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ComplaintsManagement;
