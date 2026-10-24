import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Search,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

interface AuditLogRecord {
  id: string;
  admin_id: string | null;
  admin_email: string | null;
  action: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export function AuditLogsView() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [targetFilter, setTargetFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  // Metadata Drawer
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setLogs(data as unknown as AuditLogRecord[]);
      }
    } catch (err) {
      console.warn('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (targetFilter !== 'all' && log.target_type !== targetFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const actionMatch = (log.action || '').toLowerCase().includes(q);
        const reasonMatch = (log.reason || '').toLowerCase().includes(q);
        const adminMatch = (log.admin_email || log.admin_id || '').toLowerCase().includes(q);
        const targetIdMatch = (log.target_id || '').toLowerCase().includes(q);
        if (!actionMatch && !reasonMatch && !adminMatch && !targetIdMatch) return false;
      }

      return true;
    });
  }, [logs, targetFilter, searchQuery]);

  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, currentPage]);

  const formatAction = (act: string) => {
    return act
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
            Immutable Audit Trail
          </span>
          <h1 className="text-2xl font-heading font-black text-white tracking-tight">
            Security & Governance Audit Logs
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Tamper-resistant ledger recording administrator logins, user suspensions, and moderation updates.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchLogs}
          className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white transition flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* FILTERS & SEARCH */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by action, reason, target ID, admin email..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="w-full md:w-64">
          <select
            value={targetFilter}
            onChange={(e) => {
              setTargetFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Target Types</option>
            <option value="profile">User Profile</option>
            <option value="worker">Worker Profile</option>
            <option value="job">Job Listing</option>
            <option value="equipment">Machinery Asset</option>
            <option value="complaint">Grievance Case</option>
            <option value="content">Content CMS</option>
            <option value="auth">Admin Authentication</option>
          </select>
        </div>
      </div>

      {/* LOGS TABLE */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-bold">Timestamp</th>
                <th className="py-3 px-4 font-bold">Administrator</th>
                <th className="py-3 px-4 font-bold">Action</th>
                <th className="py-3 px-4 font-bold">Target & ID</th>
                <th className="py-3 px-4 font-bold">Audit Reason</th>
                <th className="py-3 px-4 font-bold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
                    <span>Loading audit records...</span>
                  </td>
                </tr>
              ) : paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No audit records found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => {
                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition">
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>

                      {/* Administrator */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-xs truncate max-w-[130px]">
                          {log.admin_email || 'System Admin'}
                        </div>
                        {log.admin_id && (
                          <div className="text-[10px] text-slate-500 font-mono truncate max-w-[130px]">
                            {log.admin_id.slice(0, 8)}...
                          </div>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.action.includes('suspend') || log.action.includes('delete')
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : log.action.includes('restore') || log.action.includes('login')
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {formatAction(log.action)}
                        </span>
                      </td>

                      {/* Target */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                        <span className="text-white capitalize font-sans font-bold block text-xs">
                          {log.target_type}
                        </span>
                        <span>{log.target_id.slice(0, 12)}...</span>
                      </td>

                      {/* Reason */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs text-slate-300 truncate max-w-[220px]">
                          {log.reason || 'Routine administrative action'}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                          title="Inspect Metadata & Raw Payload"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
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
            Showing <strong className="text-white">{paginatedLogs.length}</strong> of{' '}
            <strong className="text-white">{filteredLogs.length}</strong> audit records
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

      {/* METADATA INSPECT DRAWER */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex justify-end">
          <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                  Audit Entry ID: {selectedLog.id}
                </span>
                <h3 className="font-heading font-black text-base text-white">
                  {formatAction(selectedLog.action)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Timestamp:</span>
                <span className="font-mono text-white">{new Date(selectedLog.created_at).toISOString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Admin User:</span>
                <span className="font-bold text-white">{selectedLog.admin_email || 'System'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Target Type:</span>
                <span className="font-bold text-white capitalize">{selectedLog.target_type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Target ID:</span>
                <span className="font-mono text-emerald-400">{selectedLog.target_id}</span>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-slate-500 text-[11px] block mb-1">Audit Justification:</span>
                <p className="text-slate-200 leading-relaxed text-xs p-3 bg-slate-900 rounded-xl border border-slate-800">
                  {selectedLog.reason || 'No specific justification recorded.'}
                </p>
              </div>

              {selectedLog.metadata && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-slate-500 text-[11px] block mb-1">Sanitized Metadata:</span>
                  <pre className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-[11px] text-emerald-300 font-mono overflow-x-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditLogsView;
