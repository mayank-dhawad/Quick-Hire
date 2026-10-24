import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { logAdminAction, getStoredAdminSession } from '../../lib/adminAuth';
import {
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

interface JobApplication {
  id: string;
  worker_id: string;
  status: string;
  created_at: string;
  profiles?: {
    id: string;
    full_name: string | null;
    phone_number: string | null;
  } | null;
}

interface AdminJobRecord {
  id: string;
  employer_id: string;
  title: string;
  category: string;
  required_skills: string[];
  offered_wages: number;
  description: string | null;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  profiles?: {
    id: string;
    full_name: string | null;
    phone_number: string | null;
    location: string | null;
  } | null;
  job_records?: JobApplication[];
}

export function JobManagement() {
  const [jobs, setJobs] = useState<AdminJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Selected Job Details Drawer
  const [selectedJob, setSelectedJob] = useState<AdminJobRecord | null>(null);

  // Moderation Dialog State
  const [modModal, setModModal] = useState<{
    isOpen: boolean;
    job: AdminJobRecord | null;
    newStatus: 'open' | 'in_progress' | 'completed' | 'cancelled';
    reason: string;
    submitting: boolean;
    error: string;
  }>({
    isOpen: false,
    job: null,
    newStatus: 'cancelled',
    reason: '',
    submitting: false,
    error: '',
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          id, employer_id, title, category, required_skills, offered_wages, description, status, created_at,
          profiles:employer_id ( id, full_name, phone_number, location ),
          job_records (
            id, worker_id, status, created_at,
            profiles:worker_id ( id, full_name, phone_number )
          )
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setJobs(data as unknown as AdminJobRecord[]);
      }
    } catch (err) {
      console.warn('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (statusFilter !== 'all' && j.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && j.category !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (j.title || '').toLowerCase().includes(q);
        const descMatch = (j.description || '').toLowerCase().includes(q);
        const empMatch = (j.profiles?.full_name || '').toLowerCase().includes(q);
        const skillMatch = (j.required_skills || []).some((s) => s.toLowerCase().includes(q));
        if (!titleMatch && !descMatch && !empMatch && !skillMatch) return false;
      }

      return true;
    });
  }, [jobs, statusFilter, categoryFilter, searchQuery]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredJobs.length / PAGE_SIZE) || 1;
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredJobs.slice(start, start + PAGE_SIZE);
  }, [filteredJobs, currentPage]);

  const openStatusModal = (job: AdminJobRecord, newStatus: 'open' | 'in_progress' | 'completed' | 'cancelled') => {
    setModModal({
      isOpen: true,
      job,
      newStatus,
      reason: '',
      submitting: false,
      error: '',
    });
  };

  const handleConfirmStatusChange = async () => {
    if (!modModal.job) return;
    if (!modModal.reason.trim()) {
      setModModal((prev) => ({ ...prev, error: 'A valid moderation reason is required for administrative auditing.' }));
      return;
    }

    setModModal((prev) => ({ ...prev, submitting: true, error: '' }));

    try {
      const adminSession = getStoredAdminSession();
      const jobId = modModal.job.id;
      const prevStatus = modModal.job.status;
      const nextStatus = modModal.newStatus;

      // Update job status safely without deleting historical records
      const { error: updErr } = await supabase
        .from('jobs')
        .update({ status: nextStatus })
        .eq('id', jobId);

      if (updErr) throw updErr;

      // Record in audit log
      await logAdminAction({
        adminId: adminSession?.user?.id,
        adminEmail: adminSession?.user?.email,
        action: 'job_status_moderated',
        targetType: 'job',
        targetId: jobId,
        reason: modModal.reason.trim(),
        metadata: {
          job_title: modModal.job.title,
          previous_status: prevStatus,
          new_status: nextStatus,
          employer_id: modModal.job.employer_id,
        },
      });

      showToast(`Job listing status changed to ${nextStatus}.`);
      setModModal({ isOpen: false, job: null, newStatus: 'cancelled', reason: '', submitting: false, error: '' });
      fetchJobs();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error updating job status.';
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
            Labor Listings & Applications
          </span>
          <h1 className="text-2xl font-heading font-black text-white tracking-tight">
            Jobs & Application Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track hiring requests, manage applicant interests, and supervise job postings.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchJobs}
          className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white transition flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Refresh Jobs</span>
        </button>
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
              placeholder="Search by job title, description, employer..."
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
              <option value="all">All Job Statuses</option>
              <option value="open">Open (Active Hiring)</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Categories</option>
              <option value="Agriculture">Agriculture</option>
              <option value="Construction">Construction</option>
              <option value="Daily work">Daily work</option>
              <option value="Skilled self-employed">Skilled self-employed</option>
            </select>
          </div>
        </div>
      </div>

      {/* JOBS TABLE */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-bold">Job Title & Domain</th>
                <th className="py-3 px-4 font-bold">Employer</th>
                <th className="py-3 px-4 font-bold">Offered Daily Wage</th>
                <th className="py-3 px-4 font-bold">Applications</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
                    <span>Loading platform jobs...</span>
                  </td>
                </tr>
              ) : paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No jobs found matching your criteria.
                  </td>
                </tr>
              ) : (
                paginatedJobs.map((j) => {
                  const applicantCount = j.job_records?.length || 0;
                  return (
                    <tr key={j.id} className="hover:bg-slate-800/40 transition">
                      {/* Job Title & Category */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-xs truncate max-w-[200px]">
                          {j.title}
                        </div>
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-800 text-emerald-400 border border-slate-700">
                          {j.category}
                        </span>
                      </td>

                      {/* Employer */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-white truncate max-w-[140px]">
                          {j.profiles?.full_name || 'QuickHire Employer'}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[140px]">
                          {j.profiles?.location || 'Rural Center'}
                        </div>
                      </td>

                      {/* Wage */}
                      <td className="py-3.5 px-4 font-bold text-emerald-400">
                        ₹{j.offered_wages}/day
                      </td>

                      {/* Applications */}
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                          {applicantCount} applied
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            j.status === 'open'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : j.status === 'in_progress'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : j.status === 'completed'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {j.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedJob(j)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                            title="Inspect Job & Applications"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {j.status === 'open' ? (
                            <button
                              type="button"
                              onClick={() => openStatusModal(j, 'cancelled')}
                              className="p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 transition cursor-pointer"
                              title="Cancel / Suspend Job"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openStatusModal(j, 'open')}
                              className="p-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 transition cursor-pointer"
                              title="Re-open Job"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
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
            Showing <strong className="text-white">{paginatedJobs.length}</strong> of{' '}
            <strong className="text-white">{filteredJobs.length}</strong> jobs
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

      {/* JOB DETAIL & APPLICANTS DRAWER */}
      {selectedJob && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex justify-end">
          <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="font-heading font-black text-base text-white">
                  {selectedJob.title}
                </h3>
                <span className="text-xs text-emerald-400 font-bold">
                  {selectedJob.category} · ₹{selectedJob.offered_wages}/day
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Job Details Card */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Employer:</span>
                <span className="font-bold text-white">{selectedJob.profiles?.full_name || 'Hirer'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Employer Phone:</span>
                <span className="font-mono font-bold text-slate-300">{selectedJob.profiles?.phone_number || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Listing Status:</span>
                <span className="font-bold text-white capitalize">{selectedJob.status}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Posted At:</span>
                <span className="font-bold text-white">{new Date(selectedJob.created_at).toLocaleString()}</span>
              </div>

              {selectedJob.description && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-slate-500 text-[11px] block mb-1">Description:</span>
                  <p className="text-slate-300 leading-relaxed text-xs">{selectedJob.description}</p>
                </div>
              )}

              {/* Skills */}
              {selectedJob.required_skills && selectedJob.required_skills.length > 0 && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-slate-500 text-[11px] block mb-1">Required Skills:</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedJob.required_skills.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Applicant Workers Section */}
            <div className="space-y-3">
              <h4 className="font-bold text-slate-400 uppercase tracking-wider text-[10px] flex items-center justify-between">
                <span>Interested Workers / Applications</span>
                <span className="text-emerald-400 font-bold">
                  {selectedJob.job_records?.length || 0} applied
                </span>
              </h4>

              {(!selectedJob.job_records || selectedJob.job_records.length === 0) ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-500">
                  No workers have registered interest in this job yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedJob.job_records.map((app) => (
                    <div
                      key={app.id}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">
                          {app.profiles?.full_name || 'Worker'}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {app.profiles?.phone_number || 'No phone'}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                        {app.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODERATION MODAL */}
      {modModal.isOpen && modModal.job && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-black text-base text-white">
                  Moderate Job Status to "{modModal.newStatus}"
                </h3>
                <p className="text-xs text-slate-400 truncate max-w-[260px]">
                  {modModal.job.title}
                </p>
              </div>
            </div>

            {modModal.error && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs">
                {modModal.error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5" htmlFor="job-audit-reason">
                Required Moderation Reason *
              </label>
              <textarea
                id="job-audit-reason"
                required
                rows={3}
                value={modModal.reason}
                onChange={(e) => setModModal((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="State the administrative reason for altering this job status..."
                className="w-full p-3 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                This reason will be recorded permanently in the audit trail.
              </span>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModModal({ isOpen: false, job: null, newStatus: 'cancelled', reason: '', submitting: false, error: '' })}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modModal.submitting}
                onClick={handleConfirmStatusChange}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {modModal.submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Confirm Status</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default JobManagement;
