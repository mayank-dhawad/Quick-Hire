import React, { useEffect, useState, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Star, Search, UserCheck, MapPin, IndianRupee, Briefcase, Award, Lock, Users } from 'lucide-react';
import { speakText, getVoiceGuidance, getWorkerSpeechText } from '../lib/speech';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { getTranslation } from '../lib/translations';

export type WorkerCategory = 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed';

export interface WorkerProfileData {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  is_assisted_profile: boolean | null;
  location?: string | null;
  village?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geocoded_address?: string | null;
}

export interface WorkerItem {
  id: string;
  category: WorkerCategory;
  skills: string[];
  experience_years: number | null;
  daily_wage?: number | null;
  experience_description?: string | null;
  preferred_work_location?: string | null;
  availability_status?: string | null;
  average_rating: number | null;
  is_available: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
  geocoded_address?: string | null;
  distance_km?: number | null;
  profiles?: WorkerProfileData | null;
}

interface WorkerDiscoveryProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory: string;
  initialSkillSearch: string;
  currentLang?: string;
  user?: User | null;
  onRequireLogin?: () => void;
}

export function WorkerDiscoveryModal({
  isOpen,
  onClose,
  initialCategory,
  initialSkillSearch,
  currentLang = 'English',
  user = null,
  onRequireLogin,
}: WorkerDiscoveryProps) {
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory || 'All');
  const [skillQuery, setSkillQuery] = useState(initialSkillSearch || '');
  const [selectedWorker, setSelectedWorker] = useState<WorkerItem | null>(null);

  const t = useCallback((key: string): string => {
    return getTranslation(currentLang, key);
  }, [currentLang]);

  useEffect(() => {
    setCategoryFilter(initialCategory || 'All');
    setSkillQuery(initialSkillSearch || '');
  }, [initialCategory, initialSkillSearch]);

  const fetchWorkers = useCallback(async () => {
    // Session Guard: only logged-in users may browse workers
    const { data: { session } } = await supabase.auth.getSession();
    const activeUser = session?.user ?? user;
    if (!activeUser) {
      setWorkers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. Primary secure discovery path: sanitized public_worker_directory view
      let viewQuery = (supabase.from('public_worker_directory') as any).select('*');
      if (categoryFilter !== 'All') {
        viewQuery = viewQuery.eq('category', categoryFilter as WorkerCategory);
      }

      const { data: viewData, error: viewError } = await viewQuery;
      if (!viewError && Array.isArray(viewData)) {
        const mapped = (viewData as any[]).map((row: any) => {
          const lat = row.latitude !== null && row.latitude !== undefined && !isNaN(Number(row.latitude)) && Number(row.latitude) !== 0 ? Number(row.latitude) : null;
          const lon = row.longitude !== null && row.longitude !== undefined && !isNaN(Number(row.longitude)) && Number(row.longitude) !== 0 ? Number(row.longitude) : null;
          return {
            id: row.id,
            category: row.category,
            skills: Array.isArray(row.skills) ? row.skills : [],
            experience_years: row.experience_years,
            daily_wage: row.daily_wage,
            experience_description: row.experience_description,
            preferred_work_location: row.preferred_work_location,
            availability_status: row.is_available ? 'available' : 'unavailable',
            average_rating: row.average_rating,
            is_available: row.is_available,
            latitude: lat,
            longitude: lon,
            profiles: {
              id: row.id,
              full_name: row.full_name,
              phone_number: null,
              is_assisted_profile: row.is_assisted_profile,
              location: row.location,
              village: row.village,
              city: row.city,
              district: row.district,
              state: row.state,
              latitude: lat,
              longitude: lon,
            },
          };
        });
        setWorkers(mapped as unknown as WorkerItem[]);
        return;
      }

      if (viewError) {
        console.warn('WorkerDiscoveryModal: public_worker_directory query failed, falling back:', viewError);
      }

      // 2. Resilient fallback for older schemas or view absence
      let query = supabase
        .from('workers')
        .select(`
          id, category, skills, experience_years, average_rating, is_available, location,
          profiles ( id, full_name, phone_number, is_assisted_profile, location, village, city, district, state, daily_wage )
        `)
        .eq('is_available', true);

      if (categoryFilter !== 'All') {
        query = query.eq('category', categoryFilter as WorkerCategory);
      }

      let { data, error } = await query;
      if (error && (error.code === '42703' || String(error.message).includes('column'))) {
        let minimalQuery = supabase
          .from('workers')
          .select(`
            id, category, skills, experience_years, average_rating, is_available, location,
            profiles ( id, full_name, phone_number, is_assisted_profile, location, village, district, state )
          `)
          .eq('is_available', true);

        if (categoryFilter !== 'All') {
          minimalQuery = minimalQuery.eq('category', categoryFilter as WorkerCategory);
        }
        const fallbackRes = await minimalQuery;
        data = fallbackRes.data as any;
        error = fallbackRes.error;
      }

      if (error) {
        console.error('WorkerDiscoveryModal: Fallback query failed:', error);
      }

      if (!error && Array.isArray(data)) {
        const normalized = data.map((row: any) => {
          const prof = row.profiles || {};
          const compositeLoc =
            prof.location ||
            row.location ||
            [prof.village, prof.city, prof.district, prof.state].filter(Boolean).join(', ') ||
            null;

          const lat =
            row.latitude !== null && row.latitude !== undefined && !isNaN(Number(row.latitude)) && Number(row.latitude) !== 0
              ? Number(row.latitude)
              : prof.latitude !== null && prof.latitude !== undefined && !isNaN(Number(prof.latitude)) && Number(prof.latitude) !== 0
              ? Number(prof.latitude)
              : null;

          const lon =
            row.longitude !== null && row.longitude !== undefined && !isNaN(Number(row.longitude)) && Number(row.longitude) !== 0
              ? Number(row.longitude)
              : prof.longitude !== null && prof.longitude !== undefined && !isNaN(Number(prof.longitude)) && Number(prof.longitude) !== 0
              ? Number(prof.longitude)
              : null;

          return {
            id: row.id,
            category: row.category,
            skills: Array.isArray(row.skills) ? row.skills : [],
            experience_years: row.experience_years,
            daily_wage: prof.daily_wage || row.daily_wage || null,
            experience_description: row.experience_description || null,
            preferred_work_location: row.preferred_work_location || compositeLoc,
            availability_status: row.is_available ? 'available' : 'unavailable',
            average_rating: row.average_rating,
            is_available: row.is_available,
            latitude: lat,
            longitude: lon,
            profiles: {
              id: prof.id || row.id,
              full_name: prof.full_name || null,
              phone_number: prof.phone_number || null,
              is_assisted_profile: prof.is_assisted_profile ?? false,
              location: compositeLoc,
              village: prof.village || null,
              city: prof.city || null,
              district: prof.district || null,
              state: prof.state || null,
              latitude: lat,
              longitude: lon,
            },
          };
        });
        setWorkers(normalized as unknown as WorkerItem[]);
      }
    } catch (fetchErr) {
      console.warn('Worker discovery fetch error handled gracefully:', fetchErr);
    } finally {
      setLoading(false);
    }
  }, [user, categoryFilter]);

  useEffect(() => {
    if (isOpen) {
      fetchWorkers();
    }
  }, [isOpen, fetchWorkers]);

  if (!isOpen) return null;

  const filteredWorkers = workers.filter((w) => {
    if (!skillQuery.trim()) return true;
    const q = skillQuery.toLowerCase().normalize('NFC').trim();
    const matchesSkill = w.skills?.some((s: string) =>
      s.toLowerCase().normalize('NFC').includes(q)
    );
    const matchesName = w.profiles?.full_name?.toLowerCase().normalize('NFC').includes(q);
    return matchesSkill || matchesName;
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-ink-primary/40 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-50 rounded-[24px] shadow-2xl p-6 sm:p-8"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-extrabold text-2xl text-ink-primary">
                {t('skillMatcherTitle')}
              </h2>
              <VoiceSpeakerButton
                text={`${t('skillMatcherTitle')}. ${t('skillMatcherSub')}`}
                lang={currentLang}
                label={t('listenSkillMatcher')}
              />
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white hover:bg-borderLight text-ink-muted transition-colors shadow-sm"
            >
              ✕
            </button>
          </div>

          <p className="text-xs sm:text-sm text-ink-muted mb-4">
            {t('skillMatcherSub')}
          </p>

          {/* IF NOT LOGGED IN */}
          {!user ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4 shadow-sm my-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-50 border border-brand-200 text-brand-700 flex items-center justify-center mx-auto">
                <Users className="w-7 h-7" />
              </div>
              <h3 className="font-heading font-extrabold text-xl text-slate-900">
                {t('loginToViewWorkers')}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-md mx-auto">
                {t('loginWorkersSub')}
              </p>
              <button
                onClick={() => {
                  onClose();
                  onRequireLogin?.();
                }}
                className="w-full py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                <span>{t('login')}</span>
              </button>
            </div>
          ) : (
            <>
              {/* CATEGORY FILTER BUTTONS */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                {t('filterByCategory')}
              </span>
              <VoiceSpeakerButton
                text={getVoiceGuidance('categoryFilter', currentLang)}
                lang={currentLang}
                label={t('listenCategoryFilter')}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'All', label: t('allCategories') },
                { id: 'Agriculture', label: t('catAgri') },
                { id: 'Construction', label: t('catConst') },
                { id: 'Daily work', label: t('catDaily') },
                { id: 'Skilled self-employed', label: t('catSkilled') },
              ].map((cat) => {
                const isActive = categoryFilter === cat.id;
                return (
                  <button
                    type="button"
                    key={cat.id}
                    onClick={() => {
                      setCategoryFilter(cat.id);
                      speakText(cat.label, currentLang);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? 'bg-brand-500 text-white shadow-sm ring-2 ring-brand-500/20'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs'
                    }`}
                  >
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SEARCH BAR */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3.5 mb-4 shadow-2xs focus-within:border-brand-500">
            <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              value={skillQuery}
              onClick={() => speakText(getVoiceGuidance('searchSkills', currentLang), currentLang)}
              onFocus={() => speakText(getVoiceGuidance('searchSkills', currentLang), currentLang)}
              onChange={(e) => setSkillQuery(e.target.value)}
              placeholder={t('searchSkillPlaceholder')}
              className="w-full py-2.5 text-sm outline-none bg-transparent text-slate-900"
            />
            <VoiceSpeakerButton
              text={getVoiceGuidance('searchSkills', currentLang)}
              lang={currentLang}
              label={t('listenSearchSkills')}
              className="ml-2"
            />
          </div>

          {/* MATCHING RESULTS HEADER */}
          <div className="flex items-center justify-between pb-3 pt-1 border-b border-slate-200 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-slate-900">
                {filteredWorkers.length} {t('matchingWorkersCount')}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold">
                {categoryFilter === 'All'
                  ? t('allCategories')
                  : categoryFilter === 'Agriculture'
                  ? t('catAgri')
                  : categoryFilter === 'Construction'
                  ? t('catConst')
                  : categoryFilter === 'Daily work'
                  ? t('catDaily')
                  : t('catSkilled')}
              </span>
            </div>
            {(categoryFilter !== 'All' || skillQuery.trim()) && (
              <button
                onClick={() => {
                  setCategoryFilter('All');
                  setSkillQuery('');
                }}
                className="text-xs font-bold text-brand-600 hover:text-brand-700 hover:underline"
              >
                {t('clearFilters')}
              </button>
            )}
          </div>

          {loading ? (
            <div className="text-center py-10 text-slate-500 text-sm font-medium">{t('loadingWorkers')}</div>
          ) : filteredWorkers.length === 0 ? (
            <div className="text-center py-12 px-4 bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm space-y-3">
              <UserCheck className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-700">{t('noWorkersFilterMsg')}</p>
              {(categoryFilter !== 'All' || skillQuery.trim()) && (
                <button
                  onClick={() => {
                    setCategoryFilter('All');
                    setSkillQuery('');
                  }}
                  className="px-4 py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-bold rounded-xl transition-colors inline-block"
                >
                  {t('clearFilters')}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredWorkers.map((worker) => (
                <div
                  key={worker.id}
                  onClick={() => setSelectedWorker(worker)}
                  className="bg-white p-5 rounded-2xl border border-borderLight hover:border-brand-500 shadow-xs transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-[11px] font-bold text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-md inline-block mb-1">
                          {worker.category === 'Agriculture'
                            ? t('catAgri')
                            : worker.category === 'Construction'
                            ? t('catConst')
                            : worker.category === 'Daily work'
                            ? t('catDaily')
                            : t('catSkilled')}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-heading font-bold text-base text-ink-primary">
                            {worker.profiles?.full_name || t('verifiedWorker')}
                          </h3>
                          <VoiceSpeakerButton
                            text={getWorkerSpeechText(
                              {
                                name: worker.profiles?.full_name,
                                category: worker.category,
                                experience_years: worker.experience_years,
                                skills: worker.skills,
                              },
                              currentLang
                            )}
                            lang={currentLang}
                            label={t('listenWorkerProfile')}
                          />
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        {worker.average_rating || '4.5'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-xs text-ink-muted mb-3">
                      <span>
                        {t('experienceLabel')}{' '}
                        <strong>
                          {worker.experience_years || 1}+ {t('yearsLabel')}
                        </strong>
                      </span>
                      {(worker.daily_wage || 0) > 0 && (
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                          ₹{worker.daily_wage}/day
                        </span>
                      )}
                      {(worker.profiles?.village || worker.profiles?.district || worker.profiles?.location) && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>
                            {worker.profiles?.village && worker.profiles?.district
                              ? `${worker.profiles.village}, ${worker.profiles.district}`
                              : worker.profiles?.district || worker.profiles?.location}
                          </span>
                        </span>
                      )}
                      {worker.profiles?.is_assisted_profile && (
                        <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                          {t('assistedBadge')}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {worker.skills?.map((skill: string, idx: number) => (
                        <span
                          key={idx}
                          className="text-xs bg-slate-100 text-ink-primary px-2.5 py-0.5 rounded-md font-medium"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-borderLight flex items-center justify-between">
                    <span className="text-xs font-semibold text-brand-600">{t('viewProfileAndCall')}</span>
                    <Phone className="w-4 h-4 text-brand-500" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedWorker && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50">
              <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
                <button
                  onClick={() => setSelectedWorker(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm"
                >
                  ✕
                </button>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-heading font-extrabold text-xl text-ink-primary">
                        {selectedWorker.profiles?.full_name || t('workerProfileModalTitle')}
                      </h3>
                      <VoiceSpeakerButton
                        text={getWorkerSpeechText(
                          {
                            name: selectedWorker.profiles?.full_name,
                            category: selectedWorker.category,
                            experience_years: selectedWorker.experience_years,
                            skills: selectedWorker.skills,
                          },
                          currentLang
                        )}
                        lang={currentLang}
                        label={t('listenWorkerProfile')}
                      />
                    </div>
                    <span className="text-xs font-semibold text-brand-600">
                      {selectedWorker.category === 'Agriculture'
                        ? t('catAgri')
                        : selectedWorker.category === 'Construction'
                        ? t('catConst')
                        : selectedWorker.category === 'Daily work'
                        ? t('catDaily')
                        : t('catSkilled')}{' '}
                      · {selectedWorker.experience_years || 1} {t('yearsExp')}
                    </span>
                  </div>
                </div>

                <div className="mb-4">
                  <span className="text-xs font-bold text-ink-muted uppercase block mb-1.5">
                    {t('skillsTitle')}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedWorker.skills?.map((s: string, i: number) => (
                      <span key={i} className="text-xs bg-brand-50 text-brand-700 font-semibold px-3 py-1 rounded-lg">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Additional worker metadata */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {(selectedWorker.daily_wage || 0) > 0 && (
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Expected Wage</span>
                      <span className="text-xs font-bold text-emerald-700 flex items-center">
                        <IndianRupee className="w-3.5 h-3.5 mr-0.5" />
                        {selectedWorker.daily_wage} / day
                      </span>
                    </div>
                  )}
                  {(selectedWorker.profiles?.village || selectedWorker.profiles?.district || selectedWorker.profiles?.location) && (
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Work Region</span>
                      <span className="text-xs font-semibold text-slate-800 flex items-center truncate">
                        <MapPin className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" />
                        {selectedWorker.profiles?.village && selectedWorker.profiles?.district
                          ? `${selectedWorker.profiles.village}, ${selectedWorker.profiles.district}`
                          : selectedWorker.profiles?.district || selectedWorker.profiles?.location}
                      </span>
                    </div>
                  )}
                </div>

                {selectedWorker.experience_description && (
                  <div className="mb-4 bg-amber-50/70 border border-amber-200 p-3 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-amber-800 block mb-1">
                      Experience & Specialization
                    </span>
                    <p className="text-xs text-amber-950 font-medium leading-relaxed">
                      {selectedWorker.experience_description}
                    </p>
                  </div>
                )}

                {selectedWorker.preferred_work_location && (
                  <div className="mb-4 text-xs text-slate-600 flex items-center gap-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                    <span><strong>Preferred area:</strong> {selectedWorker.preferred_work_location}</span>
                  </div>
                )}

                {selectedWorker.profiles?.phone_number ? (
                  <a
                    href={`tel:${selectedWorker.profiles.phone_number}`}
                    className="w-full py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
                  >
                    <Phone className="w-4 h-4" /> {t('callWorker')}: {selectedWorker.profiles.phone_number}
                  </a>
                ) : (
                  <div className="text-center py-3 bg-slate-100 rounded-xl text-xs text-ink-muted">
                    {t('phoneAvailableToRegistered')}
                  </div>
                )}
              </div>
            </div>
          )}
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}