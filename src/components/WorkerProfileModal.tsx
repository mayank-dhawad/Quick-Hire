import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ShieldAlert,
  MapPin,
  Mail,
  Calendar,
  User as UserIcon,
  Briefcase,
  IndianRupee,
  FileText,
  Edit3,
  ArrowLeft,
  Sparkles,
  Phone
} from 'lucide-react';
import { speakText, getVoiceGuidance } from '../lib/speech';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { getTranslation, normalizeLanguage } from '../lib/translations';
import { extractErrorMessage } from '../lib/errorHandler';
import { geocodeAddress } from '../lib/geocoding';

type WorkerCategory = 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed';

interface WorkerProfileProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSaved: () => void;
  currentLang?: string;
  onDeactivateAccount?: () => Promise<void> | void;
  isAssistedRegistration?: boolean;
  assistedWorkerId?: string | null;
}

const COMMON_SKILLS_BY_CATEGORY: Record<WorkerCategory, string[]> = {
  Agriculture: ['Harvesting', 'Tractor Driver', 'Crop Sowing', 'Weeding', 'Pesticide Spraying', 'Orchard Pruning'],
  Construction: ['Mason', 'Plastering', 'Concrete Mixing', 'Tile Laying', 'Bar Bending', 'Scaffolding'],
  'Daily work': ['Loading / Unloading', 'Market Porter', 'Helper', 'Warehouse Helper', 'Field Clearing'],
  'Skilled self-employed': ['Plumbing', 'Electrician', 'Carpenter', 'Welder', 'Borewell Mechanic', 'Painter']
};

const LOCALIZED_COMMON_SKILLS: Record<string, Record<WorkerCategory, string[]>> = {
  English: COMMON_SKILLS_BY_CATEGORY,
  'हिंदी (Hindi)': {
    Agriculture: ['फसल कटाई', 'ट्रैक्टर चालक', 'बुवाई', 'निराई', 'कीटनाशक छिड़काव', 'बागवानी'],
    Construction: ['राजमिस्त्री', 'प्लास्टर', 'कंक्रीट मिक्सिंग', 'टाइल लगाना', 'सरिया बांधना', 'शटरिंग'],
    'Daily work': ['लोडिंग / अनलोडिंग', 'मंडी मजदूर', 'सहायक / हेल्पर', 'गोदाम सहायक', 'खेत सफाई'],
    'Skilled self-employed': ['प्लंबर', 'इलेक्ट्रीशियन', 'बढ़ई / कारपेंटर', 'वेल्डर', 'बोरवेल मैकेनिक', 'पेंटर']
  },
  'मराठी (Marathi)': {
    Agriculture: ['कापणी', 'ट्रॅक्टर चालक', 'पेरणी', 'खुरपणी', 'औषध फवारणी', 'बागेचे काम'],
    Construction: ['गवंडी', 'प्लॅस्टर', 'काँक्रीट मिक्सिंग', 'टाईल्स बसवणे', 'सळई बांधणे', 'मदतनीस'],
    'Daily work': ['हमाली / लोडिंग', 'मार्केट मदतनीस', 'हेल्पर', 'गोदाम कामगार', 'शेत स्वच्छता'],
    'Skilled self-employed': ['प्लंबर', 'इलेक्ट्रिशियन', 'सुतार', 'वेल्डर', 'बोअरवेल मेकॅनिक', 'पेंटर']
  },
  'বাংলা (Bengali)': {
    Agriculture: ['ফসল কাটা', 'ট্রাক্টর চালক', 'বীজ বপন', 'নিড়ানি', 'কীটনাশক স্প্রে', 'বাগান পরিচর্যা'],
    Construction: ['রাজমিস্ত্রি', 'প্লাস্টার', 'কংক্রিট মিক্সিং', 'টাইলস বসানো', 'রড বাইন্ডিং', 'সহকারী'],
    'Daily work': ['লোড / আনলোড', 'বাজার কুলি', 'সহায়ক', 'গুদাম কর্মী', 'মাঠ পরিষ্কার'],
    'Skilled self-employed': ['প্লাম্বার', 'ইলেকট্রিশিয়ান', 'ছুতোর', 'ওয়েল্ডার', 'বোরওয়েল মেকানিক', 'রংমিস্ত্রি']
  },
  'తెలుగు (Telugu)': {
    Agriculture: ['పంట కోత', 'ట్రాక్టర్ డ్రైవర్', 'విత్తనాలు నాటడం', 'కలుపు తీయడం', 'మందుల పిచికారీ', 'తోట పని'],
    Construction: ['మేస్త్రీ', 'ప్లాస్టరింగ్', 'కాంక్రీట్ మిక్సింగ్', 'టైల్స్ వేయడం', 'రాడ్ బెండింగ్', 'సహాయకుడు'],
    'Daily work': ['లోడింగ్ / అన్‌లోడింగ్', 'మార్కెట్ కూలీ', 'హెల్పర్', 'గోదాము సహాయకుడు', 'పొలం శుభ్రత'],
    'Skilled self-employed': ['ప్లంబర్', 'ఎలక్ట్రీషియన్', 'వడ్రంగి', 'వెల్డర్', 'బోర్‌వెల్ మెకానిక్', 'పెయింటర్']
  }
};

export function WorkerProfileModal({
  isOpen,
  onClose,
  user,
  onSaved,
  currentLang = 'English',
  onDeactivateAccount,
  isAssistedRegistration = false,
  assistedWorkerId: initialAssistedWorkerId = null,
}: WorkerProfileProps) {
  // Personal details
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | 'Prefer not to say' | ''>('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  // Structured Address details
  const [village, setVillage] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [location, setLocation] = useState('');

  // Worker details
  const [category, setCategory] = useState<WorkerCategory>('Agriculture');
  const [skillsInput, setSkillsInput] = useState('');
  const [experienceYears, setExperienceYears] = useState('1');
  const [dailyWage, setDailyWage] = useState('500');
  const [experienceDescription, setExperienceDescription] = useState('');
  const [preferredWorkLocation, setPreferredWorkLocation] = useState('');

  // Profile management & states
  const [hasExistingProfile, setHasExistingProfile] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [existingProfileData, setExistingProfileData] = useState<Record<string, any> | null>(null);
  const [existingWorkerData, setExistingWorkerData] = useState<Record<string, any> | null>(null);
  const [isAssisted, setIsAssisted] = useState(Boolean(isAssistedRegistration));
  const [assistedWorkerId, setAssistedWorkerId] = useState<string | null>(initialAssistedWorkerId);
  const [saving, setSaving] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const t = useCallback((key: string): string => {
    return getTranslation(currentLang, key);
  }, [currentLang]);

  const addSkillChip = (skill: string) => {
    const existing = skillsInput
      .split(/[,،、]/)
      .map((s) => s.trim().normalize('NFC'))
      .filter(Boolean);
    if (!existing.includes(skill)) {
      existing.push(skill);
      setSkillsInput(existing.join(', '));
      const normLang = normalizeLanguage(currentLang);
      const addedSuffix: Record<string, string> = {
        English: 'added',
        'हिंदी (Hindi)': 'कौशल जोड़ा गया',
        'मराठी (Marathi)': 'कौशल्य जोडले',
        'বাংলা (Bengali)': 'দক্ষতা যোগ করা হয়েছে',
        'తెలుగు (Telugu)': 'నైపుణ్యం జోడించబడింది'
      };
      speakText(`${skill} ${addedSuffix[normLang] || 'added'}`, currentLang);
    }
  };

  const loadExistingProfile = useCallback(async () => {
    if (!user) return;
    try {
      let profile: any = null;
      const { data: pById } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      profile = pById;

      // If not found by user.id, check by user's phone if available
      if (!profile && user.phone) {
        const cleanPhone = user.phone.trim();
        const { data: pByPhone } = await supabase
          .from('profiles')
          .select('*')
          .eq('phone_number', cleanPhone)
          .maybeSingle();
        profile = pByPhone;
      }

      if (profile && (profile.full_name || profile.phone_number)) {
        setExistingProfileData(profile);
        setHasExistingProfile(true);
        setIsEditing(false); // Default to read-only view when profile already exists

        setFullName(profile.full_name || '');
        setPhoneNumber(profile.phone_number || (user.phone || ''));
        setEmail(profile.email || (user.email || ''));
        if (profile.gender) setGender(profile.gender as any);
        if (profile.date_of_birth) setDateOfBirth(profile.date_of_birth);

        setVillage(profile.village || '');
        setCity(profile.city || '');
        setDistrict(profile.district || '');
        setStateName(profile.state || '');
        setPincode(profile.pincode || '');
        setAddressLine(profile.address_line || '');

        const computedLoc = profile.location || [profile.village, profile.district, profile.state].filter(Boolean).join(', ');
        setLocation(computedLoc);

        if (profile.category) setCategory(profile.category as WorkerCategory);
        if (profile.skills && Array.isArray(profile.skills) && profile.skills.length > 0) {
          setSkillsInput(profile.skills.join(', '));
        }
        if (profile.experience_years) setExperienceYears(String(profile.experience_years));
        if (profile.daily_wage) setDailyWage(String(profile.daily_wage));
      } else {
        setHasExistingProfile(false);
        setIsEditing(true); // First-time visit: show create form
        if (user.phone) setPhoneNumber(user.phone);
        if (user.email) setEmail(user.email);
      }

      const workerLookupId = profile?.id || user.id;
      const { data: worker } = await supabase
        .from('workers')
        .select('*')
        .eq('id', workerLookupId)
        .maybeSingle();

      if (worker) {
        setExistingWorkerData(worker);
        if (worker.category) setCategory(worker.category);
        if (worker.skills && worker.skills.length > 0) {
          setSkillsInput(worker.skills.join(', '));
        }
        if (worker.experience_years) setExperienceYears(String(worker.experience_years));
        if (worker.daily_wage) setDailyWage(String(worker.daily_wage));
        if (worker.experience_description) setExperienceDescription(worker.experience_description);
        if (worker.preferred_work_location) setPreferredWorkLocation(worker.preferred_work_location);
      }
    } catch (err) {
      console.warn('Profile load notice:', err);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      setIsAssisted(Boolean(isAssistedRegistration));
      setAssistedWorkerId(initialAssistedWorkerId || null);
    }
  }, [isOpen, isAssistedRegistration, initialAssistedWorkerId]);

  useEffect(() => {
    if (user && isOpen && !isAssisted) {
      loadExistingProfile();
    } else if (isAssisted) {
      // Clear inputs for clean assisted registration
      setHasExistingProfile(false);
      setIsEditing(true);
      setFullName('');
      setPhoneNumber('');
      setEmail('');
      setGender('');
      setDateOfBirth('');
      setVillage('');
      setCity('');
      setDistrict('');
      setStateName('');
      setPincode('');
      setAddressLine('');
      setLocation('');
      setSkillsInput('');
      setExperienceYears('1');
      setDailyWage('500');
      setExperienceDescription('');
      setPreferredWorkLocation('');
      setAssistedWorkerId(initialAssistedWorkerId || null);
    }
  }, [user, isOpen, isAssisted, loadExistingProfile, initialAssistedWorkerId]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!user) {
      setFeedbackMsg({ type: 'error', text: 'You must be signed in to save a profile.' });
      return;
    }
    setFeedbackMsg(null);

    // Safeguard: Never overwrite existing data with empty strings or null during partial updates
    const cleanFullName = fullName.trim().normalize('NFC') || existingProfileData?.full_name || '';
    const cleanPhoneNumber = phoneNumber.trim() || existingProfileData?.phone_number || '';

    if (!cleanFullName || !cleanPhoneNumber) {
      setFeedbackMsg({ type: 'error', text: t('enterNameAndPhone') || 'Please enter citizen name and phone number.' });
      return;
    }

    setSaving(true);
    try {
      const cleanVillage = village.trim().normalize('NFC') || existingProfileData?.village || '';
      const cleanCity = city.trim().normalize('NFC') || existingProfileData?.city || '';
      const cleanDistrict = district.trim().normalize('NFC') || existingProfileData?.district || '';
      const cleanState = stateName.trim().normalize('NFC') || existingProfileData?.state || '';
      const cleanPincode = pincode.trim().normalize('NFC') || existingProfileData?.pincode || '';
      const cleanAddressLine = addressLine.trim().normalize('NFC') || existingProfileData?.address_line || '';
      const cleanEmail = email.trim() || existingProfileData?.email || null;
      const cleanGender = gender || existingProfileData?.gender || null;
      const cleanDob = dateOfBirth || existingProfileData?.date_of_birth || null;
      const cleanExpDesc = experienceDescription.trim().normalize('NFC') || existingWorkerData?.experience_description || null;
      const cleanPreferredLoc = preferredWorkLocation.trim().normalize('NFC') || existingWorkerData?.preferred_work_location || null;
      const cleanWage = Number(dailyWage) || existingProfileData?.daily_wage || 500;
      const cleanYears = Number(experienceYears) || existingProfileData?.experience_years || 1;

      // Construct composite location string
      const locationParts = [cleanVillage, cleanDistrict, cleanState].filter(Boolean);
      const computedLocation = locationParts.length > 0
        ? locationParts.join(', ')
        : (location.trim().normalize('NFC') || existingProfileData?.location || null);

      const parsedSkills = skillsInput
        .split(/[,،、]/)
        .map((s) => s.trim().normalize('NFC'))
        .filter(Boolean);

      // Assisted profiles get a unique UUID so they never overwrite the intermediary!
      const isSelf = !isAssisted;
      const targetId = isSelf ? (existingProfileData?.id || user.id) : (assistedWorkerId || crypto.randomUUID());

      // Asynchronous geocoding for locality coordinates
      let geoLat: number | null = existingWorkerData?.latitude ?? existingProfileData?.latitude ?? null;
      let geoLon: number | null = existingWorkerData?.longitude ?? existingProfileData?.longitude ?? null;
      let geoAddress: string | null = existingWorkerData?.geocoded_address ?? existingProfileData?.geocoded_address ?? null;

      try {
        const geoRes = await geocodeAddress({
          village: cleanVillage,
          city: cleanCity,
          district: cleanDistrict,
          state: cleanState,
          pincode: cleanPincode,
          freeform: computedLocation,
        });

        if (geoRes) {
          geoLat = geoRes.latitude;
          geoLon = geoRes.longitude;
          geoAddress = geoRes.displayName;
        }
      } catch (geoErr) {
        console.warn('Notice: Background geocoding bypassed without blocking profile save:', geoErr);
      }

      // Explicit coordinate range validation: Latitude [-90..90], Longitude [-180..180]
      const isValidCoordinate = (lat: unknown, lon: unknown): boolean =>
        typeof lat === 'number' && !isNaN(lat) && lat >= -90 && lat <= 90 && lat !== 0 &&
        typeof lon === 'number' && !isNaN(lon) && lon >= -180 && lon <= 180 && lon !== 0;

      if (!isValidCoordinate(geoLat, geoLon)) {
        geoLat = null;
        geoLon = null;
      }

      // 1. Prepare profiles payload
      const fullProfilePayload = {
        id: targetId,
        full_name: cleanFullName,
        phone_number: cleanPhoneNumber,
        email: cleanEmail,
        gender: cleanGender,
        date_of_birth: cleanDob,
        address_line: cleanAddressLine || null,
        village: cleanVillage || null,
        city: cleanCity || null,
        district: cleanDistrict || null,
        state: cleanState || null,
        pincode: cleanPincode || null,
        location: computedLocation,
        latitude: geoLat,
        longitude: geoLon,
        geocoded_address: geoAddress,
        role: 'worker' as const,
        category,
        skills: parsedSkills.length > 0 ? parsedSkills : (existingProfileData?.skills || []),
        experience_years: cleanYears,
        daily_wage: cleanWage,
        is_assisted_profile: isAssisted,
        created_by: isAssisted ? user.id : null,
        account_status: 'active',
      };

      // Upsert profile
      let profError: any = null;
      const resProf = await supabase.from('profiles').upsert(fullProfilePayload as any);
      profError = resProf.error;

      // Graceful fallback if database schema lacks location or coordinate columns on older schemas
      if (profError && (profError.code === '42703' || String(profError.message).includes('column') || String(profError.message).includes('location') || String(profError.message).includes('latitude'))) {
        console.warn('Profiles schema mismatch (e.g. location/coordinates missing), saving without optional location columns:', profError.message);
        const { location: _omittedLoc, latitude: _omittedLat, longitude: _omittedLon, geocoded_address: _omittedGeo, ...safeProfilePayload } = fullProfilePayload;
        const retryRes = await supabase.from('profiles').upsert(safeProfilePayload as any);
        profError = retryRes.error;

        // If another optional column also fails, fall back to core baseline columns
        if (profError && (profError.code === '42703' || String(profError.message).includes('column'))) {
          console.warn('Saving minimal verified baseline profile fields without location:', profError.message);
          const baselinePayload = {
            id: targetId,
            full_name: cleanFullName,
            phone_number: cleanPhoneNumber,
            village: cleanVillage || null,
            district: cleanDistrict || null,
            state: cleanState || null,
            role: 'worker' as const,
            is_assisted_profile: isAssisted,
            created_by: isAssisted ? user.id : null,
            account_status: 'active',
          };
          const baselineRetry = await supabase.from('profiles').upsert(baselinePayload as any);
          profError = baselineRetry.error;
        }
      }

      if (profError) {
        throw profError;
      }

      // 2. Prepare workers payload
      const fullWorkerPayload = {
        id: targetId,
        category,
        skills: parsedSkills.length > 0 ? parsedSkills : (existingWorkerData?.skills || []),
        experience_years: cleanYears,
        daily_wage: cleanWage,
        experience_description: cleanExpDesc,
        preferred_work_location: cleanPreferredLoc,
        availability_status: 'available',
        is_available: true,
        location: computedLocation,
        latitude: geoLat,
        longitude: geoLon,
        geocoded_address: geoAddress,
      };

      let workerErr: any = null;
      const resWorker = await supabase.from('workers').upsert(fullWorkerPayload as any);
      workerErr = resWorker.error;

      if (workerErr && (workerErr.code === '42703' || String(workerErr.message).includes('column'))) {
        console.warn('Expanded worker columns not on database yet, saving core verified worker fields:', workerErr.message);
        // Core columns confirmed in remote DB: id, category, skills, experience_years, is_available
        const coreWorkerPayload = {
          id: targetId,
          category,
          skills: parsedSkills.length > 0 ? parsedSkills : (existingWorkerData?.skills || []),
          experience_years: cleanYears,
          is_available: true,
        };
        const retryWorker = await supabase.from('workers').upsert(coreWorkerPayload as any);
        workerErr = retryWorker.error;
      }

      if (workerErr) {
        throw workerErr;
      }

      // Update local state and return to Read-Only mode
      setExistingProfileData(fullProfilePayload);
      setExistingWorkerData(fullWorkerPayload);
      setHasExistingProfile(true);
      setIsEditing(false); // Return to read-only profile view after successful save!

      const successNotice = hasExistingProfile
        ? (t('profileSavedSuccess') || 'Profile updated successfully!')
        : (t('profileSavedSuccess') || 'Profile created successfully!');

      setFeedbackMsg({ type: 'success', text: successNotice });
      speakText(successNotice, currentLang);
      onSaved();
    } catch (err: unknown) {
      console.error('Profile save exception:', err);
      const message = extractErrorMessage(err, 'An unexpected error occurred while saving your profile.');
      setFeedbackMsg({ type: 'error', text: 'Error saving profile: ' + message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivateAccount = async () => {
    if (!user) return;
    setIsDeactivating(true);
    setFeedbackMsg(null);
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ account_status: 'deactivated' })
        .eq('id', user.id);

      if (profileError) throw profileError;

      await supabase
        .from('workers')
        .update({ is_available: false })
        .eq('id', user.id);

      speakText(t('accountDeactivatedSuccess'), currentLang);

      if (onDeactivateAccount) {
        await onDeactivateAccount();
      } else {
        await supabase.auth.signOut();
      }

      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to deactivate account';
      setFeedbackMsg({ type: 'error', text: message });
    } finally {
      setIsDeactivating(false);
      setShowDeactivateConfirm(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden border border-slate-200 max-h-[92vh] overflow-y-auto"
        >
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
          >
            ✕
          </button>

          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-brand-600 mb-4">
            <UserCheck className="w-6 h-6" />
          </div>

          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-extrabold text-2xl text-slate-900">
                {!isEditing && hasExistingProfile && !isAssisted
                  ? t('workerProfile')
                  : hasExistingProfile && !isAssisted
                  ? 'Edit Worker Profile'
                  : 'Create Worker Profile'}
              </h2>
              <VoiceSpeakerButton
                text={`${t('workerProfile')}. ${t('workerProfileModalDesc')}`}
                lang={currentLang}
                label="Listen to worker profile instructions"
              />
            </div>

            {hasExistingProfile && !isAssisted && (
              isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to View</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(true);
                    speakText('Editing worker profile', currentLang);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>
              )
            )}
          </div>

          <p className="text-xs sm:text-sm text-slate-500 mb-5">
            {!isEditing && hasExistingProfile && !isAssisted
              ? 'Your permanent verified rural worker account. Information updates immediately across QuickHire.'
              : hasExistingProfile && !isAssisted
              ? 'Make updates to your personal, address, and skills information below. Saving updates your existing record.'
              : t('workerProfileModalDesc')}
          </p>

          {feedbackMsg && (
            <div
              className={`mb-4 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedbackMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{feedbackMsg.text}</span>
            </div>
          )}

          {!isEditing && hasExistingProfile && !isAssisted ? (
            /* ================= READ-ONLY CITIZEN PROFILE VIEW ================= */
            <div className="flex flex-col gap-5">
              {/* Profile Card Header */}
              <div className="bg-gradient-to-br from-emerald-50/80 via-white to-slate-50 border border-emerald-200/90 rounded-2xl p-5 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-heading font-black text-xl shadow-xs shrink-0">
                      {fullName ? fullName.charAt(0).toUpperCase() : 'W'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-heading font-extrabold text-lg sm:text-xl text-slate-900">
                          {fullName || 'QuickHire Worker'}
                        </h3>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Permanent Account
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <strong className="text-slate-700">{phoneNumber || '—'}</strong>
                        </span>
                        {email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            <span>{email}</span>
                          </span>
                        )}
                        {gender && (
                          <span className="text-slate-400">• {gender}</span>
                        )}
                        {dateOfBirth && (
                          <span className="text-slate-400">• Born {dateOfBirth}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(true);
                      speakText('Editing worker profile', currentLang);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm transition-all shadow-xs flex items-center justify-center gap-2 self-start sm:self-auto cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Edit Profile</span>
                  </button>
                </div>

                {/* Metric Quick Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-emerald-100/90">
                  <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Daily Wage</span>
                    <span className="font-heading font-extrabold text-sm text-emerald-700 flex items-center gap-0.5">
                      <IndianRupee className="w-3.5 h-3.5" />
                      {dailyWage} / day
                    </span>
                  </div>
                  <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Experience</span>
                    <span className="font-heading font-extrabold text-sm text-slate-800">
                      {experienceYears} Years
                    </span>
                  </div>
                  <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Category</span>
                    <span className="font-heading font-extrabold text-xs text-brand-700 truncate block">
                      {category}
                    </span>
                  </div>
                  <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status</span>
                    <span className="font-heading font-extrabold text-xs text-emerald-600 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Available
                    </span>
                  </div>
                </div>
              </div>

              {/* Location Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-brand-600" />
                  Address & Residential Details
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs pt-1">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Village / Town</span>
                    <span className="font-semibold text-slate-800">{village || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">District & State</span>
                    <span className="font-semibold text-slate-800">
                      {[district, stateName].filter(Boolean).join(', ') || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">PIN Code</span>
                    <span className="font-semibold text-slate-800">{pincode || '—'}</span>
                  </div>
                </div>
                {addressLine && (
                  <div className="pt-2 border-t border-slate-200 text-xs">
                    <span className="text-slate-400 block text-[11px]">Street / House Address</span>
                    <span className="font-medium text-slate-700">{addressLine}</span>
                  </div>
                )}
              </div>

              {/* Skills & Experience Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                  Verified Skills & Domain Specializations
                </span>
                {skillsInput ? (
                  <div className="flex flex-wrap gap-2">
                    {skillsInput
                      .split(/[,،、]/)
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs"
                        >
                          <Sparkles className="w-3 h-3 text-emerald-600" />
                          {skill}
                        </span>
                      ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No skills listed yet. Tap Edit Profile to add skills.</p>
                )}

                {experienceDescription && (
                  <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-3 text-xs space-y-1 mt-2">
                    <span className="font-bold text-amber-900 block">Experience & Work Notes:</span>
                    <p className="text-amber-900/90 leading-relaxed">{experienceDescription}</p>
                  </div>
                )}

                {preferredWorkLocation && (
                  <div className="text-xs text-slate-600 flex items-center gap-1.5 pt-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Preferred work locations: <strong className="text-slate-800">{preferredWorkLocation}</strong></span>
                  </div>
                )}
              </div>

              {/* Edit Profile Action Button */}
              <button
                type="button"
                onClick={() => {
                  setIsEditing(true);
                  speakText('Editing worker profile', currentLang);
                }}
                className="w-full py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit Profile Information</span>
              </button>
            </div>
          ) : (
            /* ================= EDIT / CREATE FORM VIEW ================= */
            <div className="flex flex-col gap-5">
            {/* ASSISTED PROFILE CHECKBOX */}
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAssisted}
                  onFocus={() => speakText(getVoiceGuidance('assistedProfile', currentLang), currentLang)}
                  onChange={(e) => setIsAssisted(e.target.checked)}
                  className="w-4 h-4 rounded text-brand-500 accent-brand-500 cursor-pointer"
                />
                <span>{t('assistedCheckboxLabel')}</span>
              </label>
              <VoiceSpeakerButton
                text={getVoiceGuidance('assistedProfile', currentLang)}
                lang={currentLang}
                label="Listen to assisted profile explanation"
              />
            </div>

            {/* SECTION 1: PERSONAL DETAILS */}
            <div className="space-y-3 pt-1 border-t border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-700 block">
                👤 1. Citizen Personal Details
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Full Name */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      {t('workerName')} *
                    </label>
                    <VoiceSpeakerButton
                      text={getVoiceGuidance('workerName', currentLang)}
                      lang={currentLang}
                      label="Listen to name instruction"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t('workerNamePlaceholder')}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none text-sm font-medium focus:border-brand-500 shadow-2xs"
                  />
                </div>

                {/* Phone Number */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      {t('phoneLabel')} *
                    </label>
                    <VoiceSpeakerButton
                      text={getVoiceGuidance('phoneInput', currentLang)}
                      lang={currentLang}
                      label="Listen to phone instruction"
                    />
                  </div>
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder={t('phonePlaceholder')}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none text-sm font-medium focus:border-brand-500 shadow-2xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Email Address */}
                <div className="space-y-1 sm:col-span-1">
                  <label className="text-xs font-bold text-slate-700">
                    Email Address
                  </label>
                  <div className="flex items-center border border-slate-300 rounded-xl px-3 bg-white focus-within:border-brand-500 shadow-2xs">
                    <Mail className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="citizen@mail.com"
                      className="w-full py-2.5 text-xs sm:text-sm font-medium outline-none bg-transparent"
                    />
                  </div>
                </div>

                {/* Gender */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Gender
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none text-xs sm:text-sm font-medium bg-white focus:border-brand-500 shadow-2xs"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male (पुरुष)</option>
                    <option value="Female">Female (महिला)</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>

                {/* Date of Birth */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none text-xs sm:text-sm font-medium bg-white focus:border-brand-500 shadow-2xs"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: STRUCTURED RESIDENTIAL ADDRESS */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-700 block">
                📍 2. Rural Address & Location Details
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Village / Gram Panchayat */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Village / Gram Panchayat
                  </label>
                  <input
                    type="text"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    placeholder="e.g. Rampur"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none text-xs sm:text-sm font-medium focus:border-brand-500 shadow-2xs"
                  />
                </div>

                {/* City / Block / Tehsil */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    City / Block / Tehsil
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Block B / Haveli"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none text-xs sm:text-sm font-medium focus:border-brand-500 shadow-2xs"
                  />
                </div>

                {/* District */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    District
                  </label>
                  <input
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="e.g. Pune / Varanasi"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none text-xs sm:text-sm font-medium focus:border-brand-500 shadow-2xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* State */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    State
                  </label>
                  <input
                    type="text"
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    placeholder="e.g. Maharashtra, UP"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none text-xs sm:text-sm font-medium focus:border-brand-500 shadow-2xs"
                  />
                </div>

                {/* PIN Code */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    PIN Code (6 Digits)
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 411001"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none text-xs sm:text-sm font-medium focus:border-brand-500 shadow-2xs"
                  />
                </div>

                {/* Street / House Address Line */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Street / House / Landmark
                  </label>
                  <input
                    type="text"
                    value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                    placeholder="Near Old Gram Panchayat"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none text-xs sm:text-sm font-medium focus:border-brand-500 shadow-2xs"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 3: WORK DETAILS, SKILLS & WAGE */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-700 block">
                🛠️ 3. Work Domain, Skills & Experience
              </span>

              {/* CATEGORY */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    {t('categoryLabel')} *
                  </label>
                  <VoiceSpeakerButton
                    text={getVoiceGuidance('workerCategory', currentLang)}
                    lang={currentLang}
                    label="Listen to category options"
                  />
                </div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as WorkerCategory)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none text-sm font-semibold bg-white focus:border-brand-500 shadow-2xs"
                >
                  <option value="Agriculture">{t('catAgri')}</option>
                  <option value="Construction">{t('catConst')}</option>
                  <option value="Daily work">{t('catDaily')}</option>
                  <option value="Skilled self-employed">{t('catSkilled')}</option>
                </select>
              </div>

              {/* SKILLS */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    {t('skillsLabel')}
                  </label>
                  <VoiceSpeakerButton
                    text={getVoiceGuidance('workerSkills', currentLang)}
                    lang={currentLang}
                    label="Listen to skills instruction"
                  />
                </div>
                <input
                  type="text"
                  value={skillsInput}
                  onChange={(e) => setSkillsInput(e.target.value)}
                  placeholder={t('skillsPlaceholderWorker')}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none text-sm font-medium focus:border-brand-500 shadow-2xs"
                />

                {/* ONE-TAP CHIPS */}
                <div className="pt-1">
                  <span className="text-[11px] font-bold text-slate-500 block mb-1">
                    {t('clickToAddCommonSkills') || 'Tap to Add Skills:'}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(((LOCALIZED_COMMON_SKILLS[normalizeLanguage(currentLang)] || COMMON_SKILLS_BY_CATEGORY)[category] || [])).map((skill) => {
                      const isSelected = skillsInput
                        .split(/[,،、]/)
                        .map((s) => s.trim().normalize('NFC'))
                        .includes(skill);
                      return (
                        <button
                          type="button"
                          key={skill}
                          onClick={() => addSkillChip(skill)}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors font-medium ${
                            isSelected
                              ? 'bg-brand-500 text-white border-brand-600 font-bold'
                              : 'bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-700 border-slate-200'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}
                          {skill}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* YEARS OF EXPERIENCE */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      {t('experienceYearsLabel')}
                    </label>
                    <VoiceSpeakerButton
                      text={getVoiceGuidance('workerExperience', currentLang)}
                      lang={currentLang}
                      label="Listen to experience instruction"
                    />
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(e.target.value)}
                    placeholder={t('yearsExpPlaceholder')}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none text-sm font-medium focus:border-brand-500 shadow-2xs"
                  />
                </div>

                {/* EXPECTED DAILY WAGE (₹) */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Expected Daily Wage (₹ / day)
                  </label>
                  <div className="flex items-center border border-slate-300 rounded-xl px-3 bg-white focus-within:border-brand-500 shadow-2xs">
                    <IndianRupee className="w-4 h-4 text-slate-400 mr-1.5 shrink-0" />
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={dailyWage}
                      onChange={(e) => setDailyWage(e.target.value)}
                      placeholder="e.g. 500"
                      className="w-full py-2.5 text-sm font-semibold text-slate-900 outline-none bg-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* EXPERIENCE DESCRIPTION */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Experience & Specialization Details
                </label>
                <textarea
                  rows={2}
                  value={experienceDescription}
                  onChange={(e) => setExperienceDescription(e.target.value)}
                  placeholder="e.g. 5 years operating Mahindra and Swaraj tractors, wheat harvesting and mango orchard care."
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl outline-none text-xs sm:text-sm font-medium focus:border-brand-500 shadow-2xs resize-none"
                />
              </div>

              {/* PREFERRED WORK LOCATION */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Preferred Work Locations / Nearby Blocks
                </label>
                <input
                  type="text"
                  value={preferredWorkLocation}
                  onChange={(e) => setPreferredWorkLocation(e.target.value)}
                  placeholder="e.g. Within 15km of Rampur, Block 4 and adjoining villages"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl outline-none text-xs sm:text-sm font-medium focus:border-brand-500 shadow-2xs"
                />
              </div>
            </div>

            {/* SUBMIT BUTTON */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3.5 mt-2 rounded-xl text-sm font-bold bg-brand-500 hover:bg-brand-600 text-white transition-all shadow-sm disabled:opacity-70 flex items-center justify-center gap-2 cursor-pointer"
            >
              {saving ? (
                <span>{hasExistingProfile ? 'Updating Profile...' : t('savingWorkerProfileBtn')}</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{hasExistingProfile ? 'Update Profile' : t('saveWorkerProfileBtn')}</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* DANGER ZONE / ACCOUNT DEACTIVATION WITH DATA RETENTION */}
        <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-rose-800 font-bold text-xs sm:text-sm">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{t('deactivateAccount')}</span>
                  </div>
                  <VoiceSpeakerButton
                    text={`${t('deactivateAccount')}. ${t('deactivateAccountDesc')}`}
                    lang={currentLang}
                    label="Listen to account deactivation info"
                  />
                </div>

                <p className="text-[11px] sm:text-xs text-rose-900/80 leading-relaxed">
                  {t('deactivateAccountDesc')}
                </p>

                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/90 border border-rose-200 text-[10px] font-semibold text-rose-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Data Retention Guaranteed • 100% History Retained</span>
                </div>

                {!showDeactivateConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeactivateConfirm(true)}
                    className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-rose-700 hover:text-rose-800 bg-white hover:bg-rose-100 border border-rose-300 transition-colors flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>{t('deactivateAccount')}</span>
                  </button>
                ) : (
                  <div className="bg-white border-2 border-rose-300 rounded-xl p-3.5 space-y-3 shadow-xs">
                    <div className="flex items-start gap-2 text-rose-900">
                      <ShieldAlert className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-rose-900">
                          {t('confirmDeactivateTitle')}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-1 leading-normal">
                          {t('confirmDeactivateDesc')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isDeactivating}
                        onClick={() => setShowDeactivateConfirm(false)}
                        className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"
                      >
                        {t('cancel')}
                      </button>
                      <button
                        type="button"
                        disabled={isDeactivating}
                        onClick={handleDeactivateAccount}
                        className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                      >
                        {isDeactivating ? (
                          <span>Processing...</span>
                        ) : (
                          <>
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{t('confirmDeactivateBtn')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}