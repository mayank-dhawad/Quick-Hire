import React from 'react';
import { motion } from 'framer-motion';
import {
  Wrench,
  PlusCircle,
  Search,
  MapPin,
  PhoneCall,
  Phone,
  Landmark,
  Edit3
} from 'lucide-react';
import { EquipmentItem } from './PostEquipmentModal';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { getTranslation } from '../lib/translations';

interface EquipmentRentalTabProps {
  equipmentList: EquipmentItem[];
  equipmentLoading: boolean;
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onPostEquipmentClick: () => void;
  onPayRentClick: (item: EquipmentItem) => void;
  onRequireLogin: () => void;
  isLoggedIn: boolean;
  currentLang?: string;
  currentUserId?: string | null;
  onEditEquipmentClick?: (item: EquipmentItem) => void;
}

export function EquipmentRentalTab({
  equipmentList,
  equipmentLoading,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchQueryChange,
  onPostEquipmentClick,
  onPayRentClick,
  onRequireLogin,
  isLoggedIn,
  currentLang = 'English',
  currentUserId = null,
  onEditEquipmentClick,
}: EquipmentRentalTabProps) {
  const t = (key: string): string => getTranslation(currentLang, key);

  // Filter equipment based on category and search query with NFC normalization
  const filteredEquipment = equipmentList.filter((item) => {
    const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
    if (!matchesCat) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().normalize('NFC').trim();
    const titleMatch = (item.title || '').toLowerCase().normalize('NFC').includes(q);
    const descMatch = (item.description || '').toLowerCase().normalize('NFC').includes(q);
    const locMatch = (item.location || '').toLowerCase().normalize('NFC').includes(q);
    return titleMatch || descMatch || locMatch;
  });

  return (
    <motion.div
      key="tab-equipment"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-8"
    >
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-brand-600 uppercase tracking-wider">
              🚜 {t('tabEquipment')}
            </span>
            <VoiceSpeakerButton
              text={`${t('equipmentTitle')}. ${t('equipmentSub')}`}
              lang={currentLang}
              label="Listen to equipment overview"
            />
          </div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 mt-1">
            {t('equipmentTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            {t('equipmentSub')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onPostEquipmentClick}
            className="px-5 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm transition-all shadow-sm flex items-center gap-2 shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{t('listEquipmentBtn')}</span>
          </button>
        </div>
      </div>

      {/* CATEGORY FILTER CHIPS */}
      <div className="flex flex-wrap items-center gap-2">
        {(['All', 'Agriculture', 'Construction', 'Daily work', 'Skilled self-employed'] as const).map(
          (cat) => {
            const count =
              cat === 'All'
                ? equipmentList.length
                : equipmentList.filter((e) => e.category === cat).length;
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => onSelectCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                  isSelected
                    ? 'bg-brand-500 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>
                  {cat === 'All'
                    ? `🌐 ${t('allCategories')}`
                    : cat === 'Agriculture'
                    ? `🌾 ${t('catAgri')}`
                    : cat === 'Construction'
                    ? `🏗️ ${t('catConst')}`
                    : cat === 'Daily work'
                    ? `📦 ${t('catDaily')}`
                    : `🔧 ${t('catSkilled')}`}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          }
        )}
      </div>

      {/* SEARCH INPUT */}
      <div className="relative max-w-xl">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search tractors, mixers, power tools, water pumps, village..."
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 outline-none focus:border-brand-500 shadow-2xs"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchQueryChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
          >
            Clear
          </button>
        )}
      </div>

      {/* EQUIPMENT GRID */}
      {equipmentLoading ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          <div className="inline-block animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full mb-3" />
          <p>Loading available machinery and tools...</p>
        </div>
      ) : filteredEquipment.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8 space-y-4">
          <Wrench className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="font-heading font-bold text-lg text-slate-800">
            {t('noEquipmentFound')}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Be the first in your village or taluka to list tools or machinery for rent and start earning rental income.
          </p>
          <button
            onClick={() => {
              onSelectCategory('All');
              onSearchQueryChange('');
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEquipment.map((item) => {
            const dailyRate = item.daily_rent ?? item.daily_rate ?? 0;
            const deposit = item.deposit_required ?? item.security_deposit ?? 0;
            const ownerPhone = item.owner_phone;
            const ownerName = item.owner_name || 'Machine Owner';

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-brand-400 hover:shadow-md transition-all p-6 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-4">
                  {/* HEADER: CATEGORY BADGE & STATUS */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 border border-brand-200">
                        {item.category}
                      </span>
                      {currentUserId && item.owner_id === currentUserId && (
                        <button
                          type="button"
                          onClick={() => onEditEquipmentClick?.(item)}
                          className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1 transition-colors cursor-pointer"
                          title={t('editListing')}
                        >
                          <Edit3 className="w-3 h-3 text-amber-700" />
                          <span>{t('editListing')}</span>
                        </button>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        item.status === 'available'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {item.status === 'available' ? '● Available' : '● In Use'}
                    </span>
                  </div>

                  {/* TITLE & DETAILS */}
                  <div>
                    <h3 className="font-heading font-bold text-lg text-slate-900 leading-snug">
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500 font-medium">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{item.location}</span>
                    </div>
                  </div>

                  {item.description && (
                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                      {item.description}
                    </p>
                  )}

                  {/* PRICING STRIP */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        {t('dailyRent')}
                      </span>
                      <span className="font-heading font-black text-lg text-brand-700">
                        ₹{dailyRate}
                        <span className="text-xs font-normal text-slate-500"> / {t('day')}</span>
                      </span>
                    </div>
                    {deposit > 0 ? (
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          {t('securityDeposit')}
                        </span>
                        <span className="text-xs font-bold text-slate-700">
                          ₹{deposit}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">
                        0 Deposit
                      </span>
                    )}
                  </div>

                  {/* OWNER INFO */}
                  <div className="text-xs text-slate-500 flex items-center justify-between pt-1">
                    <span className="font-semibold text-slate-700">
                      Owner: {ownerName}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  {ownerPhone ? (
                    <a
                      href={`tel:${ownerPhone}`}
                      className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-all hover:scale-[1.01]"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>{t('callOwner')}: {ownerPhone}</span>
                    </a>
                  ) : (
                    <button
                      onClick={onRequireLogin}
                      className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                    >
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t('loginDirectNumber')}</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (!isLoggedIn) {
                        onRequireLogin();
                        return;
                      }
                      onPayRentClick(item);
                    }}
                    className="w-full py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 border border-amber-200"
                  >
                    <Landmark className="w-3.5 h-3.5 text-amber-700" />
                    <span>{t('payRentToBank')}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

export default EquipmentRentalTab;
