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
  Loader2,
  Crosshair,
  AlertCircle,
  RefreshCw,
  Lock
} from 'lucide-react';
import { WorkerItem } from './WorkerDiscoveryModal';
import { WorkersMapView } from './WorkersMapView';
import {
  geocodeAddress,
  calculateHaversineDistanceKm,
  resolveLocalityCoordinates
} from '../lib/geocoding';
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
  onRefreshWorkers?: () => void;
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
  onRefreshWorkers,
}: WorkersTabProps) {
  const t = (key: string): string => getTranslation(currentLang, key);
  const suggestedTags = getSuggestedSkillTags(currentLang);

  // Nearby Search & Geocoding State
  const [jobLocationInput, setJobLocationInput] = React.useState<string>('');
  const [isLocating, setIsLocating] = React.useState<boolean>(false);
  const [isLocatingGps, setIsLocatingGps] = React.useState<boolean>(false);
  const [gpsError, setGpsError] = React.useState<string | null>(null);
  const [searchCoords, setSearchCoords] = React.useState<{ lat: number; lon: number; label: string } | null>(null);
  const [selectedRadiusKm, setSelectedRadiusKm] = React.useState<number | null>(null);
  const [sortByNearest, setSortByNearest] = React.useState<boolean>(false);
  const [showMapView, setShowMapView] = React.useState<boolean>(false);
  const [selectedWorkerId, setSelectedWorkerId] = React.useState<string | null>(null);

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

  // Browser Geolocation API ("Use My Location")
  const handleGetCurrentLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocatingGps(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(4));
        const lon = Number(position.coords.longitude.toFixed(4));
        setSearchCoords({
          lat,
          lon,
          label: 'Your Current Location',
        });
        setSelectedRadiusKm((prev) => prev || 50);
        setSortByNearest(true);
        setShowMapView(true);
        setIsLocatingGps(false);
      },
      (err) => {
        setIsLocatingGps(false);
        console.warn('Geolocation error:', err.message);
        setGpsError(
          err.code === 1
            ? (t('gpsDenied') || 'Location permission was denied. You can search by entering your village or district name.')
            : 'Unable to retrieve GPS location. Please check browser settings or search by village name.'
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
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
    setGpsError(null);
    try {
      // 1. Check instant offline locality centroid cache first (0ms latency)
      const offlineCentroid = resolveLocalityCoordinates(clean);
      if (offlineCentroid) {
        setSearchCoords({
          lat: offlineCentroid.latitude,
          lon: offlineCentroid.longitude,
          label: offlineCentroid.displayName.split(',')[0] || clean,
        });
        setSelectedRadiusKm((prev) => prev || 50);
        setSortByNearest(true);
        setShowMapView(true);
        return;
      }

      // 2. Throttled Nominatim geocoding
      const res = await geocodeAddress(clean);
      if (res) {
        setSearchCoords({
          lat: res.latitude,
          lon: res.longitude,
          label: res.displayName.split(',')[0] || clean,
        });
        setSelectedRadiusKm((prev) => prev || 50);
        setSortByNearest(true);
        setShowMapView(true);
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
    setGpsError(null);
  };

  // Compute processed worker list with distances, radius filtering, and sorting
  const processedWorkers = React.useMemo(() => {
    return filteredWorkers
      .map((w) => {
        // Resolve worker coordinates from worker record, profile, or known rural locality
        let lat =
          w.latitude !== null && w.latitude !== undefined && !isNaN(Number(w.latitude)) && Number(w.latitude) !== 0
            ? Number(w.latitude)
            : w.profiles?.latitude !== null && w.profiles?.latitude !== undefined && !isNaN(Number(w.profiles.latitude)) && Number(w.profiles.latitude) !== 0
            ? Number(w.profiles.latitude)
            : null;

        let lon =
          w.longitude !== null && w.longitude !== undefined && !isNaN(Number(w.longitude)) && Number(w.longitude) !== 0
            ? Number(w.longitude)
            : w.profiles?.longitude !== null && w.profiles?.longitude !== undefined && !isNaN(Number(w.profiles.longitude)) && Number(w.profiles.longitude) !== 0
            ? Number(w.profiles.longitude)
            : null;

        // Genuine coordinates only — no guessed or invented centroid coordinates

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
          if (w.distance_km === null) return false;
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

  // Count workers with coordinates for map
  const workersWithCoordsCount = processedWorkers.filter(
    (w) => w.latitude !== null && w.longitude !== null && !isNaN(Number(w.latitude)) && !isNaN(Number(w.longitude))
  ).length;

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

        <div className="flex items-center gap-2.5">
          {user && onRefreshWorkers && (
            <button
              onClick={onRefreshWorkers}
              className="p-2.5 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title={t('refreshAvailability') || 'Refresh worker availability'}
            >
              <RefreshCw className="w-4 h-4 text-brand-600" />
              <span className="hidden sm:inline">{t('refreshAvailability')}</span>
            </button>
          )}

          <button
            onClick={onRegisterSkillProfile}
            className="px-4 py-2.5 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-xl text-xs sm:text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer shadow-2xs"
          >
            <PlusCircle className="w-4 h-4 text-brand-600" />
            <span>{t('registerSkillProfile')}</span>
          </button>
        </div>
      </div>

      {/* IF NOT LOGGED IN */}
      {!user ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center max-w-lg mx-auto space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 border border-brand-200 text-brand-700 flex items-center justify-center mx-auto">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="font-heading font-extrabold text-xl text-slate-900">
            {t('loginToViewWorkers')}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            {t('loginWorkersSub')}
          </p>
          <button
            onClick={onRequireLogin}
            className="w-full py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            <span>{t('login')}</span>
          </button>
        </div>
      ) : (
        <>
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
                className="text-xs text-slate-400 hover:text-slate-600 font-bold px-1.5 cursor-pointer"
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
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
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
                className={`px-3 py-1 rounded-lg border whitespace-nowrap font-semibold transition-colors cursor-pointer ${
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
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Use My Location (GPS) Button */}
              <button
                type="button"
                onClick={handleGetCurrentLocation}
                disabled={isLocatingGps}
                title={t('useCurrentLocation') || 'Use My Location'}
                className="px-3.5 py-2.5 bg-brand-50 hover:bg-brand-100 disabled:opacity-50 text-brand-700 border border-brand-200 text-xs sm:text-sm font-bold rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                {isLocatingGps ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                    <span>{t('locatingGps')}</span>
                  </>
                ) : (
                  <>
                    <Crosshair className="w-4 h-4 text-brand-600" />
                    <span>{t('useCurrentLocation')}</span>
                  </>
                )}
              </button>

              {/* Find Nearby (Geocoding) Button */}
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
            </div>
          </form>

          {/* GPS / Geolocation Error Banner */}
          {gpsError && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="flex-1">{gpsError}</span>
              <button
                type="button"
                onClick={() => setGpsError(null)}
                className="text-amber-600 hover:text-amber-800 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* RADIUS SELECTION & MAP TOGGLE */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-600 mr-1 flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3 text-slate-400" />
                <span>{t('searchRadiusLabel')}</span>
              </span>
              {[2, 5, 10, 25, 50].map((radius) => {
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

        {/* ADVANCED WORKER DISCOVERY MAP VIEW */}
        {showMapView && (
          <WorkersMapView
            workers={processedWorkers}
            centerLat={searchCoords?.lat}
            centerLon={searchCoords?.lon}
            centerLabel={searchCoords?.label}
            radiusKm={selectedRadiusKm || undefined}
            currentLang={currentLang}
            selectedWorkerId={selectedWorkerId}
            onSelectWorker={(worker) => {
              setSelectedWorkerId(worker.id);
              handleCallWorker(worker.id, worker.profiles?.phone_number);
            }}
            onCallWorker={(workerId) => handleCallWorker(workerId)}
            onSelectLocation={(lat, lon, label) => {
              setSearchCoords({ lat, lon, label });
              setSelectedRadiusKm((prev) => prev || 50);
              setSortByNearest(true);
            }}
            onRefreshAvailability={onRefreshWorkers}
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
              onSearchQueryChange('');
              onSelectCategory('All');
              handleClearLocation();
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer inline-block"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {processedWorkers.map((worker) => {
            const name = worker.profiles?.full_name || 'Verified Rural Worker';
            const phone = worker.profiles?.phone_number;
            const isAssisted = worker.profiles?.is_assisted_profile;
            const wage = worker.daily_wage || 500;
            const expYears = worker.experience_years || 1;
            const rating = worker.average_rating ? Number(worker.average_rating).toFixed(1) : '5.0';
            const distance = worker.distance_km;
            const isSelected = selectedWorkerId === worker.id;

            return (
              <div
                key={worker.id}
                id={`worker-card-${worker.id}`}
                className={`bg-white rounded-2xl border p-5 flex flex-col justify-between hover:shadow-md transition-all space-y-4 ${
                  isSelected ? 'border-brand-500 ring-2 ring-brand-500/30 bg-brand-50/10' : 'border-slate-200'
                }`}
              >
                <div className="space-y-4">
                  {/* TOP ROW: NAME, CATEGORY, RATING */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-heading font-bold text-base text-slate-900">
                          {name}
                        </h3>
                        <CheckCircle2 className="w-4 h-4 text-brand-600 fill-brand-50 shrink-0" />
                      </div>
                      <span className="text-xs font-semibold text-brand-600 block mt-0.5">
                        {worker.category || 'General Work'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg shrink-0">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                      <span className="text-xs font-bold text-amber-900">{rating}</span>
                    </div>
                  </div>

                  {/* STATS BADGES */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex items-center gap-2">
                      <IndianRupee className="w-4 h-4 text-brand-600 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                          Daily Wage
                        </span>
                        <span className="font-extrabold text-slate-800">
                          ₹{wage} / day
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex items-center gap-2">
                      <Award className="w-4 h-4 text-brand-600 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                          Experience
                        </span>
                        <span className="font-extrabold text-slate-800">
                          {expYears} {expYears === 1 ? 'Year' : 'Years'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* DISTANCE & LOCALITY PILL */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      {distance !== null && distance !== undefined && (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md text-[11px]">
                          <Navigation className="w-3 h-3 text-emerald-600" />
                          <span>{distance} {t('kmAway')}</span>
                        </span>
                      )}

                      {(worker.profiles?.village || worker.profiles?.district || worker.profiles?.location) ? (
                        <span className="inline-flex items-center gap-1 text-slate-600 text-xs">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[180px]">
                            {worker.profiles?.village
                              ? `${worker.profiles.village}, ${worker.profiles.district || ''}`
                              : worker.profiles?.district || worker.profiles?.location}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400 text-xs italic">
                          <MapPin className="w-3 h-3 text-slate-300 shrink-0" />
                          <span>Location not specified</span>
                        </span>
                      )}

                      {/* Explicit indicator when genuine coordinates are missing */}
                      {(worker.latitude === null || worker.longitude === null) && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                          <span>Map location not set</span>
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

                {/* CALL & MAP ACTIONS */}
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

                  <div className="flex items-center gap-2">
                    {/* View on Map Button if worker has coordinates */}
                    {worker.latitude && worker.longitude ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedWorkerId(worker.id);
                          setShowMapView(true);
                          window.scrollTo({ top: 240, behavior: 'smooth' });
                        }}
                        className="flex-1 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 border border-sky-200 cursor-pointer"
                        title={t('viewOnMap')}
                      >
                        <MapPin className="w-3.5 h-3.5 text-sky-600" />
                        <span>{t('viewOnMap')}</span>
                      </button>
                    ) : null}

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
                      className="flex-1 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 border border-emerald-200 cursor-pointer"
                    >
                      <Landmark className="w-3.5 h-3.5 text-emerald-700" />
                      <span>{t('payWageToBank')}</span>
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      onOpenWorkerDiscovery(worker.category, worker.skills?.[0] || '');
                    }}
                    className="w-full py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 border border-slate-200/80 cursor-pointer"
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

      {/* FLOATING MOBILE MAP TOGGLE */}
      <div className="sm:hidden fixed bottom-6 right-5 z-40">
        <button
          type="button"
          onClick={() => {
            setShowMapView((prev) => !prev);
            window.scrollTo({ top: 180, behavior: 'smooth' });
          }}
          className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-full shadow-lg flex items-center gap-2 border-2 border-white cursor-pointer transition-transform active:scale-95"
        >
          {showMapView ? (
            <>
              <List className="w-4 h-4" />
              <span>List View ({processedWorkers.length})</span>
            </>
          ) : (
            <>
              <Map className="w-4 h-4" />
              <span>Map ({workersWithCoordsCount})</span>
            </>
          )}
        </button>
      </div>
        </>
      )}
    </motion.div>
  );
}

export default WorkersTab;
