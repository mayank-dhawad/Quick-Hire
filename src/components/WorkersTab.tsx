import React from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
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
  IndianRupee,
  Navigation,
  Map,
  List,
  SlidersHorizontal,
  X,
  Loader2
} from 'lucide-react';
import { WorkerItem } from './WorkerDiscoveryModal';
import { WorkersMapView } from './WorkersMapView';
import { geocodeAddress, calculateHaversineDistanceKm } from '../lib/geocoding';
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

  // Nearby Search State
  const [jobLocationInput, setJobLocationInput] = React.useState<string>('');
  const [isLocating, setIsLocating] = React.useState<boolean>(false);
  const [searchCoords, setSearchCoords] = React.useState<{ lat: number; lon: number; label: string } | null>(null);
  const [selectedRadiusKm, setSelectedRadiusKm] = React.useState<number | null>(null);
  const [sortByNearest, setSortByNearest] = React.useState<boolean>(false);
  const [showMapView, setShowMapView] = React.useState<boolean>(false);

  // Secure Worker Contact State
  const [workerPhones, setWorkerPhones] = React.useState<Record<string, string>>({});
  const [callingWorkerId, setCallingWorkerId] = React.useState<string | null>(null);
  const [callError, setCallError] = React.useState<{ workerId: string; message: string } | null>(null);

  const handleCallWorker = async (workerId: string, initialPhone?: string | null) => {
    const existing = initialPhone || workerPhones[workerId];
    if (existing) {
      window.location.href = `tel:${existing}`;
      return;
    }
    if (!user) {
      onRequireLogin();
      return;
    }
    setCallingWorkerId(workerId);
    setCallError(null);
    try {
      const { data, error } = await (supabase.rpc as any)('get_worker_contact_phone', {
        p_worker_id: workerId,
      });
      if (error) {
        setCallError({
          workerId,
          message: error.message || 'Unable to retrieve worker contact number.',
        });
        return;
      }
      if (data && (data as any).phone_number) {
        const retrievedPhone = (data as any).phone_number;
        setWorkerPhones((prev) => ({ ...prev, [workerId]: retrievedPhone }));
        window.location.href = `tel:${retrievedPhone}`;
      }
    } catch (err: any) {
      setCallError({
        workerId,
        message: err.message || 'Network error retrieving contact details.',
      });
    } finally {
      setCallingWorkerId(null);
    }
  };

  // Handle location geocoding on enter / button click
  const handleLocationSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = jobLocationInput.trim();
    if (!clean) {
      setSearchCoords(null);
      setSelectedRadiusKm(null);
      setSortByNearest(false);
      return;
    }

    setIsLocating(true);
    try {
      const res = await geocodeAddress(clean);
      if (res) {
        setSearchCoords({
          lat: res.latitude,
          lon: res.longitude,
          label: res.displayName.split(',')[0] || clean,
        });
        // Default to 50km radius and auto-enable distance sorting
        setSelectedRadiusKm((prev) => prev || 50);
        setSortByNearest(true);
      } else {
        alert('Could not find geographic coordinates for: "' + clean + '". Please check spelling (e.g. Village, District).');
      }
    } catch (err) {
      console.warn('Location search error:', err);
    } finally {
      setIsLocating(false);
    }
  };

  const handleClearLocation = () => {
    setJobLocationInput('');
    setSearchCoords(null);
    setSelectedRadiusKm(null);
    setSortByNearest(false);
    setShowMapView(false);
  };

  // Compute processed worker list with distances, radius filtering, and sorting
  const processedWorkers = React.useMemo(() => {
    return filteredWorkers
      .map((w) => {
        // Resolve worker coordinates from worker record or profile
        const lat = w.latitude !== null && w.latitude !== undefined
          ? Number(w.latitude)
          : w.profiles?.latitude !== null && w.profiles?.latitude !== undefined
          ? Number(w.profiles.latitude)
          : null;

        const lon = w.longitude !== null && w.longitude !== undefined
          ? Number(w.longitude)
          : w.profiles?.longitude !== null && w.profiles?.longitude !== undefined
          ? Number(w.profiles.longitude)
          : null;

        let distanceKm: number | null = null;
        if (searchCoords && lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
          distanceKm = calculateHaversineDistanceKm(searchCoords.lat, searchCoords.lon, lat, lon);
        }

        return {
          ...w,
          latitude: lat,
          longitude: lon,
          distance_km: distanceKm,
        };
      })
      .filter((w) => {
        // If radius is active and search coords are set, filter by distance
        if (searchCoords && selectedRadiusKm !== null) {
          if (w.distance_km === null) return false; // Exclude workers without coordinates from radius-filtered results
          return w.distance_km <= selectedRadiusKm;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortByNearest && searchCoords) {
          if (a.distance_km !== null && b.distance_km !== null) {
            return a.distance_km - b.distance_km;
          }
          if (a.distance_km !== null) return -1;
          if (b.distance_km !== null) return 1;
        }
        return 0;
      });
  }, [filteredWorkers, searchCoords, selectedRadiusKm, sortByNearest]);

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

        {/* NEARBY WORKERS SEARCH BAR & RADIUS FILTER */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-brand-600" />
              <h3 className="font-heading font-extrabold text-sm text-slate-900">
                {t('nearbySearchTitle')}
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              {t('nearbySearchSub')}
            </p>
          </div>

          <form onSubmit={handleLocationSearch} className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1 flex items-center bg-white border border-slate-300 rounded-xl px-3.5 focus-within:border-brand-500 shadow-2xs">
              <MapPin className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                value={jobLocationInput}
                onChange={(e) => setJobLocationInput(e.target.value)}
                placeholder={t('locationInputPlaceholder')}
                className="w-full py-2.5 text-xs sm:text-sm text-slate-900 outline-none placeholder:text-slate-400 font-medium"
              />
              {jobLocationInput && (
                <button
                  type="button"
                  onClick={handleClearLocation}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isLocating}
              className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              {isLocating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('locatingAddress')}</span>
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4" />
                  <span>Find Nearby</span>
                </>
              )}
            </button>
          </form>

          {/* RADIUS SELECTION & MAP TOGGLE */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-600 mr-1 flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3 text-slate-400" />
                <span>{t('searchRadiusLabel')}</span>
              </span>
              {[10, 25, 50, 100].map((radius) => {
                const isActive = selectedRadiusKm === radius;
                return (
                  <button
                    key={radius}
                    type="button"
                    onClick={() => {
                      if (!searchCoords && jobLocationInput.trim()) {
                        handleLocationSearch();
                      }
                      setSelectedRadiusKm(isActive ? null : radius);
                    }}
                    className={`px-2.5 py-1 rounded-lg border font-bold transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-brand-500 text-white border-brand-500 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {radius} km
                  </button>
                );
              })}
              {selectedRadiusKm !== null && (
                <button
                  type="button"
                  onClick={() => setSelectedRadiusKm(null)}
                  className="text-[11px] font-bold text-slate-400 hover:text-slate-600 ml-1 underline cursor-pointer"
                >
                  {t('allDistances')}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {searchCoords && (
                <button
                  type="button"
                  onClick={() => setSortByNearest((prev) => !prev)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                    sortByNearest
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {t('sortByDistance')}
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowMapView((prev) => !prev)}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                {showMapView ? (
                  <>
                    <List className="w-3.5 h-3.5 text-brand-600" />
                    <span>{t('hideMap')}</span>
                  </>
                ) : (
                  <>
                    <Map className="w-3.5 h-3.5 text-brand-600" />
                    <span>{t('toggleMap')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* OPTIONAL COLLAPSIBLE MAP VIEW */}
        {showMapView && (
          <WorkersMapView
            workers={processedWorkers}
            centerLat={searchCoords?.lat}
            centerLon={searchCoords?.lon}
            centerLabel={searchCoords?.label}
            radiusKm={selectedRadiusKm || undefined}
            currentLang={currentLang}
            onSelectWorker={(worker) => handleCallWorker(worker.id, worker.profiles?.phone_number)}
            onCallWorker={(workerId) => handleCallWorker(workerId)}
            onClose={() => setShowMapView(false)}
          />
        )}
      </div>

      {/* WORKERS GRID */}
      {workersLoading ? (
        <div className="text-center py-20 text-slate-400 text-sm">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <span>Loading verified workers...</span>
        </div>
      ) : processedWorkers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8 space-y-4">
          <Users className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="font-heading font-bold text-lg text-slate-800">
            {t('noWorkersFound')}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            Try clearing the search query, widening your radius filter, or switching categories to discover other available workers.
          </p>
          <button
            onClick={() => {
              onSelectCategory('All');
              onSearchQueryChange('');
              handleClearLocation();
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {processedWorkers.map((worker) => {
            const phone = worker.profiles?.phone_number;
            const name = worker.profiles?.full_name || 'Verified Worker';
            const isAssisted = worker.profiles?.is_assisted_profile;
            const distance = worker.distance_km;

            return (
              <div
                key={worker.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-brand-400 hover:shadow-md transition-all p-6 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-4">
                  {/* HEADER: CATEGORY BADGE, DISTANCE BADGE & RATING */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 border border-brand-200">
                        {worker.category}
                      </span>
                      {distance !== null && distance !== undefined && (
                        <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <Navigation className="w-3 h-3 text-emerald-600" />
                          <span>{distance} {t('kmAway')}</span>
                        </span>
                      )}
                    </div>
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

                {/* CALL ACTION WITH SECURE RPC RETRIEVAL */}
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  {callError?.workerId === worker.id && (
                    <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                      {callError.message}
                    </div>
                  )}

                  {workerPhones[worker.id] || phone ? (
                    <a
                      href={`tel:${workerPhones[worker.id] || phone}`}
                      className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-all hover:scale-[1.01]"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>{t('callNow')}: {workerPhones[worker.id] || phone}</span>
                    </a>
                  ) : (
                    <button
                      onClick={() => handleCallWorker(worker.id, phone)}
                      disabled={callingWorkerId === worker.id}
                      className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-all hover:scale-[1.01] disabled:opacity-60 cursor-pointer"
                    >
                      {callingWorkerId === worker.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Connecting...</span>
                        </>
                      ) : (
                        <>
                          <Phone className="w-4 h-4" />
                          <span>{user ? t('callNow') : t('loginDirectNumber')}</span>
                        </>
                      )}
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
                        workerPhones[worker.id] || phone
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
