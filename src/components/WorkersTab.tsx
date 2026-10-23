import React from 'react';
import { User } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import {
  PlusCircle,
  Search,
  Users,
  Star,
  CheckCircle2,
  Award,
  PhoneCall,
  Phone,
  Landmark,
  Sparkles,
  MapPin,
  IndianRupee
} from 'lucide-react';
import { WorkerItem } from './WorkerDiscoveryModal';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { speakText, getVoiceGuidance, getWorkerSpeechText } from '../lib/speech';
import { getTranslation, getSuggestedSkillTags } from '../lib/translations';

interface WorkersTabProps {
  currentLang?: string;
  workersLoading: boolean;
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  filteredWorkers: WorkerItem[];
  user: User | null;
  onRequireLogin: () => void;
  onRegisterSkillProfile: () => void;
  onOpenDirectPayment: (recipientId: string, recipientName: string, recipientPhone?: string | null) => void;
  onOpenWorkerDiscovery: (category: string, skill: string) => void;
}

export function WorkersTab({
  currentLang = 'English',
  workersLoading,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchQueryChange,
  filteredWorkers,
  user,
  onRequireLogin,
  onRegisterSkillProfile,
  onOpenDirectPayment,
  onOpenWorkerDiscovery,
}: WorkersTabProps) {
  const t = (key: string): string => getTranslation(currentLang, key);
  const suggestedTags = getSuggestedSkillTags(currentLang);

  return (
    <motion.div
      key="tab-workers"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-8"
    >
      {/* DIRECTORY HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <span className="text-xs font-bold text-brand-600 uppercase tracking-wider block mb-1">
            Verified Local Talent
          </span>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900">
            {t('directoryTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {t('directorySub')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRegisterSkillProfile}
            className="px-4 py-2.5 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-xl text-xs sm:text-sm font-bold transition-colors flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4 text-brand-600" />
            <span>{t('registerSkillProfile')}</span>
          </button>
        </div>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* CATEGORY SELECTOR */}
          <select
            value={selectedCategory}
            onChange={(e) => onSelectCategory(e.target.value)}
            className="px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:border-brand-500 shadow-2xs"
          >
            <option value="All">{t('allCategories')}</option>
            <option value="Agriculture">{t('catAgri')}</option>
            <option value="Construction">{t('catConst')}</option>
            <option value="Daily work">{t('catDaily')}</option>
            <option value="Skilled self-employed">{t('catSkilled')}</option>
          </select>

          {/* SEARCH INPUT */}
          <div className="flex-1 flex items-center bg-white border border-slate-300 rounded-xl px-4 focus-within:border-brand-500 shadow-2xs">
            <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onClick={() => speakText(getVoiceGuidance('searchSkills', currentLang), currentLang)}
              onFocus={() => speakText(getVoiceGuidance('searchSkills', currentLang), currentLang)}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchQueryChange('')}
                className="text-xs text-slate-400 hover:text-slate-600 font-bold px-1.5"
              >
                Clear
              </button>
            )}
            <VoiceSpeakerButton
              text={getVoiceGuidance('searchSkills', currentLang)}
              lang={currentLang}
              label="Listen to search instructions"
              className="ml-2"
            />
          </div>
        </div>

        {/* QUICK TAG CHIPS - REACTIVELY LOCALIZED */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-500 font-bold whitespace-nowrap">
            {t('suggestedTags')}
          </span>
          {suggestedTags.map((tag) => {
            const isSelected =
              searchQuery.trim().toLowerCase() === tag.label.toLowerCase() ||
              searchQuery.trim().toLowerCase() === tag.canonicalName.toLowerCase();
            return (
              <button
                key={tag.id}
                onClick={() => onSearchQueryChange(isSelected ? '' : tag.label)}
                className={`px-3 py-1 rounded-lg border whitespace-nowrap font-semibold transition-colors ${
                  isSelected
                    ? 'bg-brand-500 text-white border-brand-500 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tag.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* WORKERS GRID */}
      {workersLoading ? (
        <div className="text-center py-20 text-slate-400 text-sm">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <span>Loading verified workers...</span>
        </div>
      ) : filteredWorkers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8 space-y-4">
          <Users className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="font-heading font-bold text-lg text-slate-800">
            {t('noWorkersFound')}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            Try clearing the search query or switching categories to discover other available workers.
          </p>
          <button
            onClick={() => {
              onSelectCategory('All');
              onSearchQueryChange('');
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkers.map((worker) => {
            const phone = worker.profiles?.phone_number;
            const name = worker.profiles?.full_name || 'Verified Worker';
            const isAssisted = worker.profiles?.is_assisted_profile;

            return (
              <div
                key={worker.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-brand-400 hover:shadow-md transition-all p-6 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-4">
                  {/* HEADER: CATEGORY BADGE & RATING */}
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 border border-brand-200">
                      {worker.category}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span>{worker.average_rating ? worker.average_rating.toFixed(1) : '4.8'}</span>
                    </span>
                  </div>

                  {/* WORKER IDENTITY */}
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading font-bold text-lg text-slate-900">
                        {name}
                      </h3>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <VoiceSpeakerButton
                        text={getWorkerSpeechText(
                          {
                            name,
                            category: worker.category,
                            experience_years: worker.experience_years,
                            skills: worker.skills,
                          },
                          currentLang
                        )}
                        lang={currentLang}
                        label="Listen to worker profile"
                      />
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-medium flex-wrap">
                      <span className="flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-slate-400" />
                        <span>{worker.experience_years || 1}+ {t('yearsExp')}</span>
                      </span>
                      {(worker.daily_wage || 0) > 0 && (
                        <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-bold text-[11px] border border-emerald-200">
                          <span>₹{worker.daily_wage}/day</span>
                        </span>
                      )}
                      {(worker.profiles?.village || worker.profiles?.district || worker.profiles?.location) && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-600">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>
                            {worker.profiles?.village && worker.profiles?.district
                              ? `${worker.profiles.village}, ${worker.profiles.district}`
                              : worker.profiles?.district || worker.profiles?.location}
                          </span>
                        </span>
                      )}
                      {isAssisted && (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                          {t('assistedBadge')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* SKILLS CHIPS */}
                  {worker.skills && worker.skills.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Verified Skills
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {worker.skills.map((skill, idx) => (
                          <span
                            key={idx}
                            className="text-xs font-semibold bg-slate-100 text-slate-800 px-2.5 py-1 rounded-md"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* CALL ACTION WITH NATIVE TEL LINK */}
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  {phone ? (
                    <a
                      href={`tel:${phone}`}
                      className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-all hover:scale-[1.01]"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>{t('callNow')}: {phone}</span>
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
                      if (!user) {
                        onRequireLogin();
                        return;
                      }
                      onOpenDirectPayment(
                        worker.profiles?.id || worker.id,
                        name,
                        phone
                      );
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 border border-emerald-200"
                  >
                    <Landmark className="w-3.5 h-3.5 text-emerald-700" />
                    <span>{t('payWageToBank')}</span>
                  </button>

                  <button
                    onClick={() => {
                      onOpenWorkerDiscovery(worker.category, worker.skills?.[0] || '');
                    }}
                    className="w-full py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 border border-slate-200/80"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                    <span>{t('viewProfileAndSkills')}</span>
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

export default WorkersTab;
