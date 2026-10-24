import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { logAdminAction, getStoredAdminSession } from '../../lib/adminAuth';
import {
  FileCheck,
  Tag,
  Scale,
  RefreshCw,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  X,
  Layers,
} from 'lucide-react';

interface PlatformContentRecord {
  id: string;
  content_key: string;
  section: 'category' | 'legal_card' | 'government_resource' | 'search_tag' | 'faq' | 'announcement';
  language: 'en' | 'hi' | 'mr';
  title: string;
  description: string | null;
  metadata?: { url?: string; badge?: string; [key: string]: unknown } | null;
  display_order: number | null;
  is_active: boolean;
}

export function ContentManagement() {
  const [activeSection, setActiveSection] = useState<'legal_card' | 'government_resource' | 'category' | 'search_tag'>('legal_card');
  const [activeLang, setActiveLang] = useState<'en' | 'hi' | 'mr'>('en');
  const [contentItems, setContentItems] = useState<PlatformContentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit / Add Modal state
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    item: PlatformContentRecord | null;
    contentKey: string;
    title: string;
    description: string;
    metadataUrl: string;
    metadataBadge: string;
    displayOrder: number;
    submitting: boolean;
    error: string;
  }>({
    isOpen: false,
    item: null,
    contentKey: '',
    title: '',
    description: '',
    metadataUrl: '',
    metadataBadge: '',
    displayOrder: 1,
    submitting: false,
    error: '',
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchContent = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('platform_content')
        .select('*')
        .order('display_order', { ascending: true });

      if (!error && data) {
        setContentItems(data as unknown as PlatformContentRecord[]);
      }
    } catch (err) {
      console.warn('Error fetching platform content:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // Filter items for currently selected section & language
  const visibleItems = contentItems.filter(
    (item) => item.section === activeSection && item.language === activeLang
  );

  const openEditModal = (item?: PlatformContentRecord) => {
    if (item) {
      setEditModal({
        isOpen: true,
        item,
        contentKey: item.content_key,
        title: item.title,
        description: item.description || '',
        metadataUrl: item.metadata?.url || '',
        metadataBadge: item.metadata?.badge || '',
        displayOrder: item.display_order || 1,
        submitting: false,
        error: '',
      });
    } else {
      setEditModal({
        isOpen: true,
        item: null,
        contentKey: `item_${Date.now()}`,
        title: '',
        description: '',
        metadataUrl: '',
        metadataBadge: '',
        displayOrder: visibleItems.length + 1,
        submitting: false,
        error: '',
      });
    }
  };

  const handleSaveContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditModal((prev) => ({ ...prev, submitting: true, error: '' }));

    try {
      const adminSession = getStoredAdminSession();

      const metadata: Record<string, string> = {};
      if (editModal.metadataUrl) metadata.url = editModal.metadataUrl.trim();
      if (editModal.metadataBadge) metadata.badge = editModal.metadataBadge.trim();

      const payload = {
        content_key: editModal.contentKey.trim().toLowerCase().replace(/\s+/g, '_'),
        section: activeSection,
        language: activeLang,
        title: editModal.title.trim(),
        description: editModal.description.trim() || null,
        metadata,
        display_order: Number(editModal.displayOrder) || 1,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (editModal.item?.id) {
        // Update existing record
        const { error: updErr } = await supabase
          .from('platform_content')
          .update(payload)
          .eq('id', editModal.item.id);

        if (updErr) throw updErr;

        await logAdminAction({
          adminId: adminSession?.user?.id,
          adminEmail: adminSession?.user?.email,
          action: 'content_updated',
          targetType: 'content',
          targetId: editModal.item.id,
          reason: `Updated ${activeSection} item: ${payload.title} (${activeLang})`,
        });
      } else {
        // Insert new record
        const { data: insData, error: insErr } = await supabase
          .from('platform_content')
          .insert(payload)
          .select()
          .single();

        if (insErr) throw insErr;

        await logAdminAction({
          adminId: adminSession?.user?.id,
          adminEmail: adminSession?.user?.email,
          action: 'content_created',
          targetType: 'content',
          targetId: insData?.id || payload.content_key,
          reason: `Created new ${activeSection} item: ${payload.title} (${activeLang})`,
        });
      }

      showToast(`Content item "${payload.title}" saved successfully.`);
      setEditModal((prev) => ({ ...prev, isOpen: false }));
      fetchContent();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error saving content.';
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
            Content Management & CMS
          </span>
          <h1 className="text-2xl font-heading font-black text-white tracking-tight">
            Website Content & Localization Manager
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Maintain legal-rights cards, official government links, categories, and multilingual regional texts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openEditModal()}
          className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Content Item</span>
        </button>
      </div>

      {/* SECTION TABS & LANGUAGE TOGGLE */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Sections */}
        <div className="flex items-center gap-2 overflow-x-auto text-xs">
          {[
            { id: 'legal_card', label: 'Legal Rights Cards', icon: Scale },
            { id: 'government_resource', label: 'Government Resources', icon: FileCheck },
            { id: 'category', label: 'Job Categories', icon: Layers },
            { id: 'search_tag', label: 'Suggested Tags', icon: Tag },
          ].map((sec) => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id as 'legal_card' | 'government_resource' | 'category' | 'search_tag')}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 shadow-xs'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Language Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start md:self-auto text-xs">
          {[
            { id: 'en', label: 'English' },
            { id: 'hi', label: 'हिंदी (Hindi)' },
            { id: 'mr', label: 'मराठी (Marathi)' },
          ].map((lang) => (
            <button
              key={lang.id}
              type="button"
              onClick={() => setActiveLang(lang.id as 'en' | 'hi' | 'mr')}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                activeLang === lang.id
                  ? 'bg-slate-800 text-emerald-400 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT ITEMS GRID */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 bg-slate-900/90 border border-slate-800 rounded-2xl">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
          <span>Loading content items...</span>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="p-12 text-center text-slate-500 bg-slate-900/90 border border-slate-800 rounded-2xl">
          <p className="mb-3">No content records stored for this section in the selected language.</p>
          <button
            type="button"
            onClick={() => openEditModal()}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition cursor-pointer"
          >
            Create first {activeSection} in {activeLang.toUpperCase()}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition shadow-xl flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                    Key: {item.content_key}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                    Order #{item.display_order}
                  </span>
                </div>

                <h3 className="font-heading font-bold text-base text-white">
                  {item.title}
                </h3>

                {item.description && (
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {item.description}
                  </p>
                )}

                {item.metadata?.url && (
                  <div className="mt-2 text-xs text-emerald-400 font-mono truncate flex items-center gap-1">
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.metadata.url}</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">
                  Lang: <strong className="text-slate-300 uppercase">{item.language}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => openEditModal(item)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Content</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* EDIT / CREATE MODAL */}
      {editModal.isOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-heading font-black text-base text-white">
                {editModal.item ? 'Edit Content Item' : 'New Content Item'}
              </h3>
              <button
                type="button"
                onClick={() => setEditModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editModal.error && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs">
                {editModal.error}
              </div>
            )}

            <form onSubmit={handleSaveContent} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="cm-key">
                  Content Key Identifier *
                </label>
                <input
                  id="cm-key"
                  type="text"
                  required
                  disabled={Boolean(editModal.item)}
                  value={editModal.contentKey}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, contentKey: e.target.value }))}
                  placeholder="e.g. min_wage_act"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="cm-title">
                  Title ({activeLang.toUpperCase()}) *
                </label>
                <input
                  id="cm-title"
                  type="text"
                  required
                  value={editModal.title}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Item Title in selected language"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="cm-desc">
                  Description / Body Text
                </label>
                <textarea
                  id="cm-desc"
                  rows={3}
                  value={editModal.description}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Localized body content or description..."
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {activeSection === 'government_resource' && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="cm-url">
                    Official Website URL
                  </label>
                  <input
                    id="cm-url"
                    type="url"
                    value={editModal.metadataUrl}
                    onChange={(e) => setEditModal((prev) => ({ ...prev, metadataUrl: e.target.value }))}
                    placeholder="https://eshram.gov.in/"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              )}

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
                  {editModal.submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Save to Database</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ContentManagement;
