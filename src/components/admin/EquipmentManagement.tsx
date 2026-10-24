import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { logAdminAction, getStoredAdminSession } from '../../lib/adminAuth';
import {
  Wrench,
  Search,
  CheckCircle2,
  XCircle,
  RefreshCw,
  MapPin,
  ChevronLeft,
  ChevronRight,
  X,
  Edit,
} from 'lucide-react';

interface EquipmentListingRecord {
  id: string;
  owner_id: string;
  title: string;
  category: 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed';
  description: string | null;
  daily_rent: number;
  deposit_required: number;
  location: string;
  status: 'available' | 'rented' | 'maintenance';
  created_at: string;
  updated_at?: string | null;
  profiles?: {
    id: string;
    full_name: string | null;
    phone_number: string | null;
  } | null;
}

export function EquipmentManagement() {
  const [equipment, setEquipment] = useState<EquipmentListingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Edit / Moderate Modal State
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    item: EquipmentListingRecord | null;
    title: string;
    category: 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed';
    dailyRent: string;
    depositRequired: string;
    location: string;
    status: 'available' | 'rented' | 'maintenance';
    description: string;
    reason: string;
    submitting: boolean;
    error: string;
  }>({
    isOpen: false,
    item: null,
    title: '',
    category: 'Agriculture',
    dailyRent: '',
    depositRequired: '',
    location: '',
    status: 'available',
    description: '',
    reason: '',
    submitting: false,
    error: '',
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchEquipment = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('equipment')
        .select(`
          id, owner_id, title, category, description, daily_rent, deposit_required, location, status, created_at, updated_at,
          profiles:owner_id ( id, full_name, phone_number )
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setEquipment(data as unknown as EquipmentListingRecord[]);
      }
    } catch (err) {
      console.warn('Error fetching equipment:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEquipment();
  }, [fetchEquipment]);

  // Filtered equipment
  const filteredEquipment = useMemo(() => {
    return equipment.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (e.title || '').toLowerCase().includes(q);
        const descMatch = (e.description || '').toLowerCase().includes(q);
        const locMatch = (e.location || '').toLowerCase().includes(q);
        const ownerMatch = (e.profiles?.full_name || '').toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !locMatch && !ownerMatch) return false;
      }

      return true;
    });
  }, [equipment, statusFilter, categoryFilter, searchQuery]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredEquipment.length / PAGE_SIZE) || 1;
  const paginatedEquipment = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEquipment.slice(start, start + PAGE_SIZE);
  }, [filteredEquipment, currentPage]);

  const openEditModal = (item: EquipmentListingRecord) => {
    setEditModal({
      isOpen: true,
      item,
      title: item.title,
      category: item.category || 'Agriculture',
      dailyRent: String(item.daily_rent || 0),
      depositRequired: String(item.deposit_required || 0),
      location: item.location || '',
      status: item.status,
      description: item.description || '',
      reason: '',
      submitting: false,
      error: '',
    });
  };

  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.item) return;

    if (!editModal.reason.trim()) {
      setEditModal((prev) => ({ ...prev, error: 'A valid moderation reason is required for administrative auditing.' }));
      return;
    }

    setEditModal((prev) => ({ ...prev, submitting: true, error: '' }));

    try {
      const adminSession = getStoredAdminSession();
      const itemId = editModal.item.id;

      const payload = {
        title: editModal.title.trim(),
        category: editModal.category as 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed',
        daily_rent: Number(editModal.dailyRent) || 0,
        deposit_required: Number(editModal.depositRequired) || 0,
        location: editModal.location.trim(),
        status: editModal.status,
        description: editModal.description.trim(),
        updated_at: new Date().toISOString(),
      };

      const { error: updErr } = await supabase
        .from('equipment')
        .update(payload)
        .eq('id', itemId);

      if (updErr) throw updErr;

      // Audit log entry
      await logAdminAction({
        adminId: adminSession?.user?.id,
        adminEmail: adminSession?.user?.email,
        action: 'equipment_listing_moderated',
        targetType: 'equipment',
        targetId: itemId,
        reason: editModal.reason.trim(),
        metadata: {
          previous_status: editModal.item.status,
          new_status: editModal.status,
          title: payload.title,
          owner_id: editModal.item.owner_id,
        },
      });

      showToast(`Equipment listing "${payload.title}" updated successfully.`);
      setEditModal({
        isOpen: false,
        item: null,
        title: '',
        category: 'Agriculture',
        dailyRent: '',
        depositRequired: '',
        location: '',
        status: 'available',
        description: '',
        reason: '',
        submitting: false,
        error: '',
      });
      fetchEquipment();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error updating equipment listing.';
      setEditModal((prev) => ({ ...prev, submitting: false, error: message }));
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
            Rural Machinery Assets
          </span>
          <h1 className="text-2xl font-heading font-black text-white tracking-tight">
            Equipment & Machinery Rental Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Moderate tractor, tiller, and heavy machinery rental postings across agricultural clusters.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchEquipment}
          className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white transition flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Refresh Equipment</span>
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
              placeholder="Search machinery, specs, location, owner..."
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
              <option value="all">All Statuses</option>
              <option value="available">Available for Rent</option>
              <option value="rented">Currently Rented</option>
              <option value="maintenance">Under Maintenance</option>
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
              <option value="all">All Domains</option>
              <option value="Agriculture">Agriculture (Tractors/Sprayers)</option>
              <option value="Construction">Construction</option>
              <option value="Daily work">Daily work</option>
              <option value="Skilled self-employed">Tools & Electricals</option>
            </select>
          </div>
        </div>
      </div>

      {/* EQUIPMENT TABLE */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-bold">Machinery Asset</th>
                <th className="py-3 px-4 font-bold">Owner</th>
                <th className="py-3 px-4 font-bold">Location</th>
                <th className="py-3 px-4 font-bold">Daily Rent / Deposit</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
                    <span>Loading equipment catalog...</span>
                  </td>
                </tr>
              ) : paginatedEquipment.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No equipment listings found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedEquipment.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    {/* Machine Title & Domain */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-xs truncate max-w-[200px]">
                        {item.title}
                      </div>
                      <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-800 text-purple-400 border border-slate-700">
                        {item.category}
                      </span>
                    </td>

                    {/* Owner */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-white truncate max-w-[140px]">
                        {item.profiles?.full_name || 'Machine Owner'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {item.profiles?.phone_number || 'N/A'}
                      </div>
                    </td>

                    {/* Location */}
                    <td className="py-3.5 px-4 text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate max-w-[140px]">{item.location || 'Rural Center'}</span>
                      </div>
                    </td>

                    {/* Rent & Deposit */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-emerald-400">₹{item.daily_rent}/day</div>
                      <div className="text-[10px] text-slate-500">Dep: ₹{item.deposit_required}</div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.status === 'available'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : item.status === 'rented'
                            ? 'bg-blue-950 text-blue-300 border border-blue-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1.5 ml-auto cursor-pointer"
                        title="Moderate / Edit Equipment Listing"
                      >
                        <Edit className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Moderate</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing <strong className="text-white">{paginatedEquipment.length}</strong> of{' '}
            <strong className="text-white">{filteredEquipment.length}</strong> listings
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

      {/* EDIT & MODERATE EQUIPMENT MODAL */}
      {editModal.isOpen && editModal.item && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-black">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-black text-base text-white">
                    Moderate Rental Listing
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Owner: {editModal.item.profiles?.full_name || 'Machine Owner'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editModal.error && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs">
                {editModal.error}
              </div>
            )}

            <form onSubmit={handleSaveEquipment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="edit-eq-title">
                  Equipment Title *
                </label>
                <input
                  id="edit-eq-title"
                  type="text"
                  required
                  value={editModal.title}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="edit-eq-cat">
                    Category
                  </label>
                  <select
                    id="edit-eq-cat"
                    value={editModal.category}
                    onChange={(e) => setEditModal((prev) => ({ ...prev, category: e.target.value as EquipmentListingRecord['category'] }))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="Agriculture">Agriculture</option>
                    <option value="Construction">Construction</option>
                    <option value="Daily work">Daily work</option>
                    <option value="Skilled self-employed">Tools & Electricals</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="edit-eq-status">
                    Listing Status
                  </label>
                  <select
                    id="edit-eq-status"
                    value={editModal.status}
                    onChange={(e) => setEditModal((prev) => ({ ...prev, status: e.target.value as EquipmentListingRecord['status'] }))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="available">Available</option>
                    <option value="rented">Rented</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="edit-eq-rent">
                    Daily Rent (₹) *
                  </label>
                  <input
                    id="edit-eq-rent"
                    type="number"
                    required
                    value={editModal.dailyRent}
                    onChange={(e) => setEditModal((prev) => ({ ...prev, dailyRent: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="edit-eq-dep">
                    Security Deposit (₹)
                  </label>
                  <input
                    id="edit-eq-dep"
                    type="number"
                    value={editModal.depositRequired}
                    onChange={(e) => setEditModal((prev) => ({ ...prev, depositRequired: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="edit-eq-loc">
                  Location / Yard Address
                </label>
                <input
                  id="edit-eq-loc"
                  type="text"
                  value={editModal.location}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, location: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="edit-eq-desc">
                  Machinery Description
                </label>
                <textarea
                  id="edit-eq-desc"
                  rows={2}
                  value={editModal.description}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="edit-eq-reason">
                  Required Moderation Reason *
                </label>
                <textarea
                  id="edit-eq-reason"
                  required
                  rows={2}
                  value={editModal.reason}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder="State the verification, safety inspection, or citizen correction reason..."
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditModal((prev) => ({ ...prev, isOpen: false }))}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editModal.submitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {editModal.submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Save Updates</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default EquipmentManagement;
