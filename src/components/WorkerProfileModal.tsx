import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import { UserCheck, CheckCircle2, AlertTriangle, Trash2, ShieldAlert, MapPin } from 'lucide-react';
import { speakText, getVoiceGuidance } from '../lib/speech';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { getTranslation, normalizeLanguage } from '../lib/translations';
import { Database } from '../lib/database.types';

type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];

type WorkerCategory = 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed';

interface WorkerProfileProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSaved: () => void;
  currentLang?: string;
  onDeactivateAccount?: () => Promise<void> | void;
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
}: WorkerProfileProps) {
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<WorkerCategory>('Agriculture');
  const [skillsInput, setSkillsInput] = useState('');
  const [experienceYears, setExperienceYears] = useState('1');
  const [isAssisted, setIsAssisted] = useState(false);
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
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profile) {
      setFullName(profile.full_name || '');
      setPhoneNumber(profile.phone_number || '');
      if ('location' in profile && profile.location) {
        setLocation(String(profile.location));
      }
    }

    const { data: worker } = await supabase
      .from('workers')
      .select('*')
      .eq('id', user.id)
      .single();

    if (worker) {
      setCategory(worker.category);
      setSkillsInput((worker.skills || []).join(', '));
      setExperienceYears(String(worker.experience_years || 1));
    }
  }, [user]);

  useEffect(() => {
    if (user && isOpen && !isAssisted) {
      loadExistingProfile();
    }
  }, [user, isOpen, isAssisted, loadExistingProfile]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!user) return;
    setFeedbackMsg(null);

    if (!fullName.trim() || !phoneNumber.trim()) {
      setFeedbackMsg({ type: 'error', text: t('enterNameAndPhone') });
      return;
    }

    setSaving(true);
    try {
      // Ensure user input entered in regional scripts (Hindi, Marathi, Telugu, Bengali)
      // is cleanly NFC-normalized Unicode before saving to Supabase PostgreSQL
      const cleanFullName = fullName.trim().normalize('NFC');
      const cleanPhoneNumber = phoneNumber.trim();
      const cleanLocation = location.trim().normalize('NFC');
      const parsedSkills = skillsInput
        .split(/[,،、]/)
        .map((s) => s.trim().normalize('NFC'))
        .filter(Boolean);

      const profilePayload: ProfileInsert = {
        id: user.id,
        full_name: cleanFullName,
        phone_number: cleanPhoneNumber,
        role: 'worker',
        is_assisted_profile: isAssisted,
        created_by: isAssisted ? user.id : null,
        account_status: 'active',
        ...(cleanLocation ? { location: cleanLocation } : {}),
      };

      let { error: profError } = await supabase.from('profiles').upsert(profilePayload);
      // If the location column does not exist on remote database yet (code 42703), retry gracefully without it
      if (profError && (profError.code === '42703' || profError.message?.includes('location'))) {
        const fallbackPayload: ProfileInsert = {
          id: user.id,
          full_name: cleanFullName,
          phone_number: cleanPhoneNumber,
          role: 'worker',
          is_assisted_profile: isAssisted,
          created_by: isAssisted ? user.id : null,
          account_status: 'active',
        };
        const retry = await supabase.from('profiles').upsert(fallbackPayload);
        profError = retry.error;
      }
      if (profError) throw profError;

      const { error: workerErr } = await supabase.from('workers').upsert({
        id: user.id,
        category,
        skills: parsedSkills,
        experience_years: Number(experienceYears) || 1,
        is_available: true,
      });

      if (workerErr) throw workerErr;

      setFeedbackMsg({ type: 'success', text: t('profileSavedSuccess') });
      speakText(t('profileSavedSuccess'), currentLang);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 900);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
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
      // 1. Soft-delete: update profiles.account_status to 'deactivated'
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ account_status: 'deactivated' })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // 2. Hide worker from public directory while retaining relational job_records
      await supabase
        .from('workers')
        .update({ is_available: false })
        .eq('id', user.id);

      speakText(t('accountDeactivatedSuccess'), currentLang);

      // 3. Trigger sign out and parent state reset
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
          className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden border border-slate-200 max-h-[90vh] overflow-y-auto"
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

          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-heading font-extrabold text-2xl text-slate-900">
              {t('workerProfile')}
            </h2>
            <VoiceSpeakerButton
              text={`${t('workerProfile')}. ${t('workerProfileModalDesc')}`}
              lang={currentLang}
              label="Listen to worker profile instructions"
            />
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mb-5">
            {t('workerProfileModalDesc')}
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
              ) : null}
              <span>{feedbackMsg.text}</span>
            </div>
          )}

          <div className="flex flex-col gap-4">
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

            {/* FULL NAME */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {t('workerName')} *
                </label>
                <VoiceSpeakerButton
                  text={getVoiceGuidance('workerName', currentLang)}
                  lang={currentLang}
                  label="Listen to worker name instruction"
                />
              </div>
              <input
                type="text"
                value={fullName}
                onClick={() => speakText(getVoiceGuidance('workerName', currentLang), currentLang)}
                onFocus={() => speakText(getVoiceGuidance('workerName', currentLang), currentLang)}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('workerNamePlaceholder')}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl outline-none text-sm font-medium focus:border-brand-500 shadow-2xs"
              />
            </div>

            {/* PHONE NUMBER */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {t('phoneLabel')} *
                </label>
                <VoiceSpeakerButton
                  text={getVoiceGuidance('phoneInput', currentLang)}
                  lang={currentLang}
                  label="Listen to phone number instruction"
                />
              </div>
              <input
                type="tel"
                value={phoneNumber}
                onClick={() => speakText(getVoiceGuidance('phoneInput', currentLang), currentLang)}
                onFocus={() => speakText(getVoiceGuidance('phoneInput', currentLang), currentLang)}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder={t('phonePlaceholder')}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl outline-none text-sm font-medium focus:border-brand-500 shadow-2xs"
              />
            </div>

            {/* LOCATION */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {t('locationLabel') || t('pincodeLabel')}
                </label>
                <VoiceSpeakerButton
                  text={getVoiceGuidance('jobLocation', currentLang)}
                  lang={currentLang}
                  label="Listen to location instruction"
                />
              </div>
              <div className="flex items-center border border-slate-300 rounded-xl px-4 focus-within:border-brand-500 shadow-2xs bg-white">
                <MapPin className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  value={location}
                  onClick={() => speakText(getVoiceGuidance('jobLocation', currentLang), currentLang)}
                  onFocus={() => speakText(getVoiceGuidance('jobLocation', currentLang), currentLang)}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t('locationPlaceholder') || t('pincodePlaceholder')}
                  className="w-full py-3 text-sm font-medium text-slate-900 outline-none bg-transparent"
                />
              </div>
            </div>

            {/* CATEGORY */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
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
                onClick={() => speakText(getVoiceGuidance('workerCategory', currentLang), currentLang)}
                onFocus={() => speakText(getVoiceGuidance('workerCategory', currentLang), currentLang)}
                onChange={(e) => setCategory(e.target.value as WorkerCategory)}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl outline-none text-sm font-semibold bg-white focus:border-brand-500 shadow-2xs"
              >
                <option value="Agriculture">{t('catAgri')}</option>
                <option value="Construction">{t('catConst')}</option>
                <option value="Daily work">{t('catDaily')}</option>
                <option value="Skilled self-employed">{t('catSkilled')}</option>
              </select>
            </div>

            {/* SKILLS */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
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
                onClick={() => speakText(getVoiceGuidance('workerSkills', currentLang), currentLang)}
                onFocus={() => speakText(getVoiceGuidance('workerSkills', currentLang), currentLang)}
                onChange={(e) => setSkillsInput(e.target.value)}
                placeholder={t('skillsPlaceholderWorker')}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl outline-none text-sm font-medium focus:border-brand-500 shadow-2xs"
              />

              {/* QUICK ONE-TAP SKILL CHIPS */}
              <div className="pt-1.5">
                <span className="text-[11px] font-bold text-slate-500 block mb-1.5">
                  {t('clickToAddCommonSkills') || 'Tap to Add Skills:'}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {((LOCALIZED_COMMON_SKILLS[normalizeLanguage(currentLang)] || COMMON_SKILLS_BY_CATEGORY)[category]).map((skill) => {
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

            {/* YEARS OF EXPERIENCE */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
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
                onClick={() => speakText(getVoiceGuidance('workerExperience', currentLang), currentLang)}
                onFocus={() => speakText(getVoiceGuidance('workerExperience', currentLang), currentLang)}
                onChange={(e) => setExperienceYears(e.target.value)}
                placeholder={t('yearsExpPlaceholder')}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl outline-none text-sm font-medium focus:border-brand-500 shadow-2xs"
              />
            </div>

            {/* SUBMIT BUTTON */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3.5 mt-2 rounded-xl text-sm font-bold bg-brand-500 hover:bg-brand-600 text-white transition-all shadow-sm disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {saving ? (
                <span>{t('savingWorkerProfileBtn')}</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t('saveWorkerProfileBtn')}</span>
                </>
              )}
            </button>

            {/* DANGER ZONE / ACCOUNT DEACTIVATION WITH DATA RETENTION */}
            <div className="mt-6 pt-5 border-t border-slate-200">
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
                    className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-rose-700 hover:text-rose-800 bg-white hover:bg-rose-100 border border-rose-300 transition-colors flex items-center justify-center gap-2 shadow-2xs"
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
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}