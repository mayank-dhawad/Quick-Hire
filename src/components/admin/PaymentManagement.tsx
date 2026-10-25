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
  CreditCard,
  Building2,
  QrCode,
  ShieldCheck,
  FileText,
  Clock,
  ArrowDownLeft,
  ArrowUpRight
} from 'lucide-react';

export interface AdminPaymentRecord {
  id: string;
  payer_id: string;
  payee_id: string;
  payment_for_type: 'worker_wage' | 'machine_rental';
  reference_id: string | null;
  amount: number;
  payment_method: string;
  transaction_ref: string | null;
  payment_reference: string | null;
  currency: string | null;
  verification_status: string | null;
  verification_notes: string | null;
  verified_at: string | null;
  status: string;
  created_at: string;
  payer?: { id: string; full_name: string | null; phone_number: string | null } | null;
  payee?: { id: string; full_name: string | null; phone_number: string | null; upi_id: string | null } | null;
}

export interface PaymentAuditEvent {
  id: string;
  payment_id: string;
  previous_status: string | null;
  new_status: string;
  event_type: string;
  actor_id: string | null;
  metadata: any;
  created_at: string;
}

export function PaymentManagement() {
  const [payments, setPayments] = useState<AdminPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Selected Payment Drawer
  const [selectedPayment, setSelectedPayment] = useState<AdminPaymentRecord | null>(null);
  const [auditEvents, setAuditEvents] = useState<PaymentAuditEvent[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Reconciliation Modal
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<'paid' | 'failed' | 'cancelled'>('paid');
  const [reconcileNotes, setReconcileNotes] = useState('');
  const [isReconciling, setIsReconciling] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Fetch all payment records with profiles
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          payer:payer_id ( id, full_name, phone_number ),
          payee:payee_id ( id, full_name, phone_number, upi_id )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Admin payments fetch notice:', error.message);
        // Fallback: load without relations if join syntax varies
        const { data: rawData } = await supabase
          .from('payments')
          .select('*')
          .order('created_at', { ascending: false });
        setPayments((rawData as unknown as AdminPaymentRecord[]) || []);
      } else {
        setPayments((data as unknown as AdminPaymentRecord[]) || []);
      }
    } catch (err) {
      console.warn('Error fetching payments:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Load audit trail when a payment is selected
  useEffect(() => {
    if (!selectedPayment) {
      setAuditEvents([]);
      return;
    }

    const loadAuditTrail = async () => {
      setLoadingAudit(true);
      try {
        const { data } = await supabase
          .from('payment_audit_events')
          .select('*')
          .eq('payment_id', selectedPayment.id)
          .order('created_at', { ascending: false });

        setAuditEvents((data as PaymentAuditEvent[]) || []);
      } catch {
        // non-blocking
      } finally {
        setLoadingAudit(false);
      }
    };

    loadAuditTrail();
  }, [selectedPayment]);

  // Masking helpers
  const maskPhone = (phone?: string | null) => {
    if (!phone) return '—';
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 4) return phone;
    return `+91 ••••• ••${clean.slice(-4)}`;
  };

  const maskUpi = (upi?: string | null) => {
    if (!upi) return 'Not Configured';
    const parts = upi.split('@');
    if (parts.length !== 2) return upi;
    const handle = parts[0];
    const masked = handle.length > 2 ? `${handle.slice(0, 2)}***` : `${handle}***`;
    return `${masked}@${parts[1]}`;
  };

  // Filtered payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (typeFilter !== 'all' && p.payment_for_type !== typeFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const refMatch = p.payment_reference?.toLowerCase().includes(q);
        const utrMatch = p.transaction_ref?.toLowerCase().includes(q);
        const idMatch = p.id.toLowerCase().includes(q);
        const payerMatch = p.payer?.full_name?.toLowerCase().includes(q);
        const payeeMatch = p.payee?.full_name?.toLowerCase().includes(q);
        const methodMatch = p.payment_method?.toLowerCase().includes(q);
        return refMatch || utrMatch || idMatch || payerMatch || payeeMatch || methodMatch;
      }
      return true;
    });
  }, [payments, statusFilter, typeFilter, searchQuery]);

  // Paginated records
  const totalPages = Math.ceil(filteredPayments.length / PAGE_SIZE) || 1;
  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredPayments.slice(start, start + PAGE_SIZE);
  }, [filteredPayments, currentPage]);

  // Reconcile payment action
  const handleReconcilePayment = async () => {
    if (!selectedPayment) return;
    setIsReconciling(true);
    setActionError('');
    setActionSuccess('');

    const session = getStoredAdminSession();
    if (!session) {
      setActionError('Admin session expired. Please re-login.');
      setIsReconciling(false);
      return;
    }

    try {
      const newVerificationStatus = targetStatus === 'paid' ? 'verified' : 'rejected';

      // 1. Try authoritative RPC if installed in database
      const { data: rpcData, error: rpcErr } = await (supabase as any).rpc('reconcile_payment_admin', {
        p_payment_id: selectedPayment.id,
        p_new_status: targetStatus,
        p_verification_status: newVerificationStatus,
        p_notes: reconcileNotes.trim() || 'Admin manual reconciliation',
      });

      if (rpcErr) {
        // Fallback: direct update
        const { error: updErr } = await supabase
          .from('payments')
          .update({
            status: targetStatus,
            verification_status: newVerificationStatus,
            verification_notes: reconcileNotes.trim() || 'Admin manual reconciliation',
            verified_at: targetStatus === 'paid' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedPayment.id);

        if (updErr) throw updErr;

        // Fallback: record audit event
        await supabase.from('payment_audit_events').insert([
          {
            payment_id: selectedPayment.id,
            previous_status: selectedPayment.status,
            new_status: targetStatus,
            event_type: 'admin_reconciled',
            actor_id: session.user.id,
            metadata: {
              notes: reconcileNotes,
              reconciled_by: session.user.email,
            },
          },
        ]);
      }

      // 2. Log to admin audit log
      await logAdminAction({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: 'reconcile_payment',
        targetType: 'payment',
        targetId: selectedPayment.id,
        metadata: {
          previousStatus: selectedPayment.status,
          newStatus: targetStatus,
          notes: reconcileNotes,
        },
        reason: reconcileNotes || 'Administrative payment reconciliation',
      });

      setActionSuccess(`Payment successfully updated to "${targetStatus}" (${newVerificationStatus}).`);
      setReconcileModalOpen(false);

      // Refresh list and selected
      await fetchPayments();
      setSelectedPayment((prev) =>
        prev
          ? {
              ...prev,
              status: targetStatus,
              verification_status: newVerificationStatus,
              verification_notes: reconcileNotes,
            }
          : null
      );
    } catch (err: any) {
      setActionError(err.message || 'Failed to reconcile payment');
    } finally {
      setIsReconciling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CreditCard className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-heading font-black text-white">
              UPI Payments & Wage Settlement Monitoring
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Audit payment attempts, inspect deep-link references, verify UTR submissions, and reconcile wage settlements.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchPayments}
          disabled={loading}
          className="self-start sm:self-center px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Records</span>
        </button>
      </div>

      {/* METRICS OVERVIEW CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Total Attempts
          </span>
          <span className="text-xl sm:text-2xl font-heading font-black text-white">
            {payments.length}
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
            Pending / Awaiting UTR
          </span>
          <span className="text-xl sm:text-2xl font-heading font-black text-amber-400">
            {payments.filter((p) => p.status === 'pending' || p.status === 'created').length}
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 block mb-1">
            Submitted (Pending Verification)
          </span>
          <span className="text-xl sm:text-2xl font-heading font-black text-blue-400">
            {payments.filter((p) => p.status === 'submitted').length}
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">
            Verified & Paid
          </span>
          <span className="text-xl sm:text-2xl font-heading font-black text-emerald-400">
            {payments.filter((p) => p.status === 'paid').length}
          </span>
        </div>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by Payment Ref, UTR, Payer, Payee, or ID..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 outline-none focus:border-emerald-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="submitted">Submitted (UTR Provided)</option>
            <option value="paid">Verified & Paid</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 outline-none focus:border-emerald-500"
          >
            <option value="all">All Types</option>
            <option value="worker_wage">Worker Wages</option>
            <option value="machine_rental">Machine Rentals</option>
          </select>
        </div>
      </div>

      {/* PAYMENTS TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-20 text-center text-slate-500 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
            Loading payments and settlements...
          </div>
        ) : paginatedPayments.length === 0 ? (
          <div className="py-20 text-center text-slate-500 text-xs space-y-1">
            <CreditCard className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="font-bold text-slate-400">No Payment Records Found</p>
            <p className="text-slate-600">Try adjusting your search query or status filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                  <th className="py-3 px-4">Attempt Ref / UTR</th>
                  <th className="py-3 px-4">Payer (Employer)</th>
                  <th className="py-3 px-4">Payee (Worker)</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {paginatedPayments.map((p) => {
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/50 transition-colors">
                      {/* ATTEMPT REF / UTR */}
                      <td className="py-3.5 px-4 font-mono">
                        <span className="font-bold text-slate-200 block truncate max-w-[140px]">
                          {p.payment_reference || p.id.slice(0, 8)}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate max-w-[140px]">
                          {p.transaction_ref ? `UTR: ${p.transaction_ref}` : '(No UTR submitted)'}
                        </span>
                      </td>

                      {/* PAYER */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-200 block truncate max-w-[130px]">
                          {p.payer?.full_name || 'Employer'}
                        </span>
                        <span className="text-[10px] text-slate-500 block font-mono">
                          {maskPhone(p.payer?.phone_number)}
                        </span>
                      </td>

                      {/* PAYEE */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-200 block truncate max-w-[130px]">
                          {p.payee?.full_name || 'Worker'}
                        </span>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {maskUpi(p.payee?.upi_id)}
                        </span>
                      </td>

                      {/* AMOUNT */}
                      <td className="py-3.5 px-4 font-mono font-black text-white">
                        ₹{Number(p.amount).toLocaleString('en-IN')}
                      </td>

                      {/* METHOD */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-medium text-[11px]">
                          {p.payment_method === 'Direct UPI' ? '⚡ UPI' : '🏛️ IMPS'}
                        </span>
                      </td>

                      {/* STATUS */}
                      <td className="py-3.5 px-4">
                        {p.status === 'paid' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Paid (Verified)</span>
                          </span>
                        ) : p.status === 'submitted' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/30">
                            <Clock className="w-3 h-3" />
                            <span>Submitted (Unverified)</span>
                          </span>
                        ) : p.status === 'failed' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-bold border border-rose-500/30">
                            <XCircle className="w-3 h-3" />
                            <span>Failed</span>
                          </span>
                        ) : p.status === 'cancelled' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 text-[10px] font-bold">
                            <span>Cancelled</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Pending</span>
                          </span>
                        )}
                      </td>

                      {/* DATE */}
                      <td className="py-3.5 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(p.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* ACTIONS */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedPayment(p)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>
            Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
            {Math.min(currentPage * PAGE_SIZE, filteredPayments.length)} of{' '}
            {filteredPayments.length} entries
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-200">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* DRAWER: PAYMENT DETAILS & AUDIT TRAIL */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/70 backdrop-blur-xs">
          <div className="w-full max-w-xl h-full bg-slate-900 border-l border-slate-800 p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="font-heading font-black text-lg text-white">
                  Payment Settlement Inspector
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  ID: {selectedPayment.id}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* STATUS BANNER */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                  Current Status
                </span>
                <span className="font-extrabold text-sm uppercase text-slate-200">
                  {selectedPayment.status} ({selectedPayment.verification_status || 'unverified'})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReconcileModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Reconcile Status
              </button>
            </div>

            {/* DETAILS GRID */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Attempt Ref
                </span>
                <span className="font-mono font-bold text-slate-200 block truncate">
                  {selectedPayment.payment_reference || '—'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  UTR / Transaction Ref
                </span>
                <span className="font-mono font-bold text-emerald-400 block truncate">
                  {selectedPayment.transaction_ref || 'Awaiting UTR submission'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Payer
                </span>
                <span className="font-bold text-slate-200 block truncate">
                  {selectedPayment.payer?.full_name || 'Employer'}
                </span>
                <span className="font-mono text-[10px] text-slate-500 block">
                  {maskPhone(selectedPayment.payer?.phone_number)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Payee
                </span>
                <span className="font-bold text-slate-200 block truncate">
                  {selectedPayment.payee?.full_name || 'Worker'}
                </span>
                <span className="font-mono text-[10px] text-slate-500 block">
                  UPI: {maskUpi(selectedPayment.payee?.upi_id)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Payable Amount
                </span>
                <span className="font-black text-base text-white">
                  ₹{Number(selectedPayment.amount).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Job / Reference ID
                </span>
                <span className="font-mono text-[10px] text-slate-300 block truncate">
                  {selectedPayment.reference_id || 'Direct'}
                </span>
              </div>
            </div>

            {/* AUDIT TRAIL */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-300">
                  Payment Lifecycle Audit Events ({auditEvents.length})
                </h4>
              </div>

              {loadingAudit ? (
                <div className="py-6 text-center text-slate-500 text-xs">Loading audit trail...</div>
              ) : auditEvents.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-500 text-xs">
                  No audit log entries recorded for this payment yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {auditEvents.map((evt) => (
                    <div key={evt.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200 font-mono">
                          {evt.event_type}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(evt.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2">
                        <span>Status Transition:</span>
                        <span className="text-slate-300">{evt.previous_status || 'none'}</span>
                        <span>→</span>
                        <strong className="text-emerald-400">{evt.new_status}</strong>
                      </div>
                      {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                        <pre className="text-[10px] bg-slate-900 p-2 rounded-lg text-slate-400 overflow-x-auto mt-1">
                          {JSON.stringify(evt.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADMIN RECONCILIATION */}
      {reconcileModalOpen && selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-black text-lg text-white">
                Reconcile Settlement Status
              </h3>
              <button
                type="button"
                onClick={() => setReconcileModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Administrative reconciliation transitions this attempt to a verified settlement or rejects it. This action is cryptographically tied to your admin identity and logged to the security audit trail.
            </p>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {actionError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Select Target Settlement Status
                </label>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value as any)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 outline-none focus:border-emerald-500"
                >
                  <option value="paid">Verified & Paid (Money Received)</option>
                  <option value="failed">Failed / Verification Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Reconciliation Note / Bank Statement Reference *
                </label>
                <textarea
                  rows={3}
                  value={reconcileNotes}
                  onChange={(e) => setReconcileNotes(e.target.value)}
                  placeholder="e.g. Verified with bank statement credit of ₹500 from UTR 423849182394."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 outline-none focus:border-emerald-500 placeholder-slate-600"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReconcileModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isReconciling}
                onClick={handleReconcilePayment}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isReconciling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Confirm Reconciliation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PaymentManagement;
