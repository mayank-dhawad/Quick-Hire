import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import {
  ShieldAlert,
  PhoneCall,
  Phone,
  ShieldCheck,
  Scale,
  HeartHandshake,
  FileCheck,
  BadgeAlert,
  IndianRupee,
  ExternalLink,
  AlertCircle,
  Building2,
  BookOpen,
  PlusCircle,
  CheckCircle2,
  X,
  RefreshCw,
  Send,
} from 'lucide-react';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { getTranslation } from '../lib/translations';

interface SafetyTabProps {
  currentLang?: string;
}

export function SafetyTab({ currentLang = 'English' }: SafetyTabProps) {
  const t = (key: string): string => getTranslation(currentLang, key);

  const [isGrievanceOpen, setIsGrievanceOpen] = useState(false);
  const [complaintTitle, setComplaintTitle] = useState('');
  const [complaintCategory, setComplaintCategory] = useState<'unpaid_wages' | 'unsafe_conditions' | 'harassment' | 'fraud' | 'misleading_equipment' | 'platform_abuse' | 'other'>('unpaid_wages');
  const [complaintName, setComplaintName] = useState('');
  const [complaintPhone, setComplaintPhone] = useState('');
  const [complaintDesc, setComplaintDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleSubmitGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaintTitle.trim() || !complaintDesc.trim()) return;
    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from('complaints').insert({
        reporter_id: session?.user?.id || null,
        reporter_name: complaintName.trim() || 'Citizen User',
        reporter_phone: complaintPhone.trim() || null,
        target_type: 'other',
        category: complaintCategory,
        title: complaintTitle.trim(),
        description: complaintDesc.trim(),
        priority: 'medium',
        status: 'open',
      });
      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
        setIsGrievanceOpen(false);
        setComplaintTitle('');
        setComplaintDesc('');
        setComplaintName('');
        setComplaintPhone('');
      }, 2500);
    } catch (err) {
      console.warn('Grievance submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Personal Emergency Contact & SOS State
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [contactSavedNotice, setContactSavedNotice] = useState('');
  const [isBroadcastingSos, setIsBroadcastingSos] = useState(false);
  const [sosBroadcastAlert, setSosBroadcastAlert] = useState<string | null>(null);

  // Fetch current user's emergency contact from profiles
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user?.id) {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('emergency_contact_name, emergency_contact_phone')
            .eq('id', session.user.id)
            .single();
          if (data) {
            if (data.emergency_contact_name) setEmergencyContactName(data.emergency_contact_name);
            if (data.emergency_contact_phone) setEmergencyContactPhone(data.emergency_contact_phone);
          }
        } catch {
          // Graceful fallback if column not present yet
        }
      }
    });
  }, []);

  const handleSaveEmergencyContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = emergencyContactPhone.trim();
    if (!cleanPhone) return;

    setIsSavingContact(true);
    setContactSavedNotice('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        alert('Please log in to save your personal emergency contact.');
        return;
      }
      await supabase
        .from('profiles')
        .update({
          emergency_contact_name: emergencyContactName.trim() || 'Trusted Emergency Contact',
          emergency_contact_phone: cleanPhone,
        } as any)
        .eq('id', session.user.id);

      setContactSavedNotice('Emergency contact saved successfully!');
      setIsEditingContact(false);
      setTimeout(() => setContactSavedNotice(''), 3000);
    } catch (err) {
      console.warn('Error saving emergency contact:', err);
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleTriggerPersonalSos = () => {
    if (!emergencyContactPhone.trim()) {
      setIsEditingContact(true);
      return;
    }

    setIsBroadcastingSos(true);
    setSosBroadcastAlert(null);

    const sendSosWithCoords = (lat?: number, lng?: number) => {
      const cleanPhone = emergencyContactPhone.replace(/\D/g, '');
      const locationPart = lat && lng ? ` My current GPS location: https://maps.google.com/?q=${lat},${lng}` : '';
      const message = `🚨 EMERGENCY SOS ALERT! I need immediate help.${locationPart} Please call me or send help immediately.`;

      // Open SMS dialer with prefilled message
      window.open(`sms:+${cleanPhone}?body=${encodeURIComponent(message)}`, '_blank');
      setSosBroadcastAlert(`Emergency alert prepared for ${emergencyContactName || 'contact'} (${emergencyContactPhone}).`);
      setIsBroadcastingSos(false);
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          sendSosWithCoords(position.coords.latitude, position.coords.longitude);
        },
        () => {
          sendSosWithCoords();
        },
        { timeout: 5000 }
      );
    } else {
      sendSosWithCoords();
    }
  };

  return (
    <motion.div
      key="tab-safety"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-12"
    >
      {/* HEADER */}
      <div className="max-w-2xl">
        <span className="text-xs font-bold text-brand-600 uppercase tracking-wider block mb-1">
          {t('communityTrust')}
        </span>
        <div className="flex items-center gap-2">
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900">
            {t('safetyTitle')}
          </h1>
          <VoiceSpeakerButton
            text={`${t('safetyTitle')}. ${t('safetySub')}`}
            lang={currentLang}
            label="Listen to safety overview"
          />
        </div>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          {t('safetySub')}
        </p>
      </div>

      {/* SECTION 1: EMERGENCY HELPLINES & RURAL SOS */}
      <div className="space-y-5">
        <div className="flex items-center gap-2.5">
          <span className="p-2 rounded-xl bg-rose-100 text-rose-700">
            <ShieldAlert className="w-5 h-5" />
          </span>
          <div>
            <h2 className="font-heading font-bold text-xl text-slate-900">
              {t('sosTitle')}
            </h2>
            <p className="text-xs text-slate-500">
              {t('sosSubtitle')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: 112 */}
          <div className="p-5 rounded-2xl bg-white border border-rose-200 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 inline-block mb-2">
                24x7 Emergency
              </span>
              <h3 className="font-heading font-black text-2xl text-slate-900">112</h3>
              <p className="text-xs font-bold text-slate-700 mt-0.5">{t('sos112Title')}</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                {t('sos112Desc')}
              </p>
            </div>
            <a
              href="tel:112"
              className="w-full py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>{t('callNow')}: 112</span>
            </a>
          </div>

          {/* Card 2: 108 */}
          <div className="p-5 rounded-2xl bg-white border border-amber-200 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-block mb-2">
                Medical & Ambulance
              </span>
              <h3 className="font-heading font-black text-2xl text-slate-900">108</h3>
              <p className="text-xs font-bold text-slate-700 mt-0.5">{t('sos108Title')}</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                {t('sos108Desc')}
              </p>
            </div>
            <a
              href="tel:108"
              className="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>{t('callNow')}: 108</span>
            </a>
          </div>

          {/* Card 3: 1091 */}
          <div className="p-5 rounded-2xl bg-white border border-purple-200 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 inline-block mb-2">
                Women's Safety
              </span>
              <h3 className="font-heading font-black text-2xl text-slate-900">1091</h3>
              <p className="text-xs font-bold text-slate-700 mt-0.5">{t('sos1091Title')}</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                {t('sos1091Desc')}
              </p>
            </div>
            <a
              href="tel:1091"
              className="w-full py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>{t('callNow')}: 1091</span>
            </a>
          </div>

          {/* Card 4: Kisan Helpline */}
          <div className="p-5 rounded-2xl bg-white border border-brand-200 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200 inline-block mb-2">
                Kisan Call Center
              </span>
              <h3 className="font-heading font-black text-base sm:text-lg text-slate-900 leading-tight">1800-180-1551</h3>
              <p className="text-xs font-bold text-slate-700 mt-0.5">{t('sosKisanTitle')}</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                {t('sosKisanDesc')}
              </p>
            </div>
            <a
              href="tel:18001801551"
              className="w-full py-2.5 px-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>{t('callNow')}</span>
            </a>
          </div>
        </div>

        {/* Shramik Helpline Bar */}
        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-emerald-900">National Shramik Toll-Free Helpline: 14434</span>
            <span className="text-emerald-700 hidden md:inline">— {t('shramikHelplineSub')}</span>
          </div>
          <a
            href="tel:14434"
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto shrink-0"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Call 14434</span>
          </a>
        </div>

        {/* PERSONAL EMERGENCY CONTACT & RAPID SOS */}
        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-rose-50/80 via-white to-amber-50/50 border border-rose-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="p-2.5 rounded-xl bg-rose-600 text-white shadow-xs">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </span>
              <div>
                <h3 className="font-heading font-black text-base sm:text-lg text-slate-900">
                  Personal Emergency Contact & Rapid SOS
                </h3>
                <p className="text-xs text-slate-500">
                  Save a trusted family member or local contact for one-tap emergency distress SMS with GPS location
                </p>
              </div>
            </div>

            {emergencyContactPhone && !isEditingContact && (
              <button
                type="button"
                onClick={() => setIsEditingContact(true)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 transition self-start sm:self-auto underline cursor-pointer"
              >
                Change Contact
              </button>
            )}
          </div>

          {sosBroadcastAlert && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{sosBroadcastAlert}</span>
            </div>
          )}

          {contactSavedNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{contactSavedNotice}</span>
            </div>
          )}

          {emergencyContactPhone && !isEditingContact ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-rose-100 shadow-2xs">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">
                  Configured Trusted Contact
                </span>
                <h4 className="font-heading font-bold text-sm text-slate-900">
                  {emergencyContactName || 'Trusted Personal Contact'}
                </h4>
                <p className="text-xs font-mono text-slate-600 flex items-center gap-1">
                  <PhoneCall className="w-3 h-3 text-slate-400" />
                  <span>{emergencyContactPhone}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={`tel:${emergencyContactPhone}`}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Call Contact</span>
                </a>

                <button
                  type="button"
                  onClick={handleTriggerPersonalSos}
                  disabled={isBroadcastingSos}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-xs flex items-center gap-2 transition shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isBroadcastingSos ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Locating GPS...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>🚨 Broadcast SOS Alert</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveEmergencyContact} className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
              <span className="text-xs font-bold text-slate-700 block">
                {emergencyContactPhone ? 'Update Personal Emergency Contact' : 'Register Trusted Emergency Contact'}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1" htmlFor="emergency-contact-name">
                    Contact Name / Relationship
                  </label>
                  <input
                    id="emergency-contact-name"
                    type="text"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    placeholder="e.g. Ramesh (Brother) / Sarpanch"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1" htmlFor="emergency-contact-phone">
                    Emergency Phone Number (+91)
                  </label>
                  <input
                    id="emergency-contact-phone"
                    type="tel"
                    required
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSavingContact}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{isSavingContact ? 'Saving...' : 'Save Emergency Contact'}</span>
                </button>
                {emergencyContactPhone && (
                  <button
                    type="button"
                    onClick={() => setIsEditingContact(false)}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      {/* SECTION 2: LEGAL & STATUTORY FRAMEWORK */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-brand-600 uppercase tracking-wider block mb-1">
              Indian Labour Rights
            </span>
            <h2 className="font-heading font-bold text-xl sm:text-2xl text-slate-900">
              {t('legalRightsTitle')}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {t('legalRightsSub')}
            </p>
          </div>
          <VoiceSpeakerButton
            text={`${t('legalRightsTitle')}. ${t('legalRightsSub')}`}
            lang={currentLang}
            label="Listen to Indian Labour Rights overview"
          />
        </div>

        {/* THREE MAJOR RIGHTS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Fair and Timely Wages */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-amber-400 hover:shadow-md transition-all space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 shadow-2xs">
                  <IndianRupee className="w-6 h-6 stroke-[2.5]" />
                </div>
                <VoiceSpeakerButton
                  text={`${t('right1Title')}. ${t('right1Desc')}`}
                  lang={currentLang}
                  label="Listen to Fair and Timely Wages"
                />
              </div>
              <h3 className="font-heading font-bold text-lg text-slate-900 leading-snug">
                {t('right1Title')}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {t('right1Desc')}
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Agreed Wages · Same-Day Payment · Wage Records</span>
            </div>
          </div>

          {/* Card 2: Safe Working Conditions */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-2xs">
                  <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
                </div>
                <VoiceSpeakerButton
                  text={`${t('right2Title')}. ${t('right2Desc')}`}
                  lang={currentLang}
                  label="Listen to Safe Working Conditions"
                />
              </div>
              <h3 className="font-heading font-bold text-lg text-slate-900 leading-snug">
                {t('right2Title')}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {t('right2Desc')}
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Safe Equipment · Protective Gear · Water & Rest</span>
            </div>
          </div>

          {/* Card 3: Grievances and Social Security */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-brand-400 hover:shadow-md transition-all space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center border border-brand-200 shadow-2xs">
                  <Scale className="w-6 h-6 stroke-[2.5]" />
                </div>
                <VoiceSpeakerButton
                  text={`${t('right3Title')}. ${t('right3Desc')}`}
                  lang={currentLang}
                  label="Listen to Grievances and Social Security"
                />
              </div>
              <h3 className="font-heading font-bold text-lg text-slate-900 leading-snug">
                {t('right3Title')}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {t('right3Desc')}
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-semibold text-brand-800">
              <span className="w-2 h-2 rounded-full bg-brand-500" />
              <span>Dispute Assistance · e-Shram UAN · Emergency 112</span>
            </div>
          </div>
        </div>

        {/* OFFICIAL LABOUR RESOURCES IN INDIA */}
        <div className="pt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Verified Government Portals
              </span>
              <h3 className="font-heading font-bold text-lg sm:text-xl text-slate-900">
                {t('officialResourcesTitle')}
              </h3>
              <p className="text-xs text-slate-500">
                {t('officialResourcesSub')}
              </p>
            </div>
            <VoiceSpeakerButton
              text={`${t('officialResourcesTitle')}. ${t('officialResourcesSub')}`}
              lang={currentLang}
              label="Listen to official labour resources"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Resource 1: Ministry of Labour & Employment */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-brand-400 hover:shadow-sm transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    Govt of India
                  </span>
                  <Building2 className="w-4 h-4 text-brand-600" />
                </div>
                <h4 className="font-heading font-bold text-sm text-slate-900 leading-tight">
                  {t('resourceMoleTitle')}
                </h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {t('resourceMoleDesc')}
                </p>
              </div>
              <a
                href="https://labour.gov.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-between w-full pt-3 border-t border-slate-100 text-xs font-bold text-brand-700 hover:text-brand-800 group"
              >
                <span>labour.gov.in</span>
                <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>

            {/* Resource 2: Maharashtra Labour Department */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-brand-400 hover:shadow-sm transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    Maharashtra State
                  </span>
                  <Scale className="w-4 h-4 text-amber-600" />
                </div>
                <h4 className="font-heading font-bold text-sm text-slate-900 leading-tight">
                  {t('resourceMahaTitle')}
                </h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {t('resourceMahaDesc')}
                </p>
              </div>
              <a
                href="https://labour.maharashtra.gov.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-between w-full pt-3 border-t border-slate-100 text-xs font-bold text-amber-700 hover:text-amber-800 group"
              >
                <span>labour.maharashtra.gov.in</span>
                <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>

            {/* Resource 3: India Code */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-brand-400 hover:shadow-sm transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                    Legislative Repository
                  </span>
                  <BookOpen className="w-4 h-4 text-blue-600" />
                </div>
                <h4 className="font-heading font-bold text-sm text-slate-900 leading-tight">
                  {t('resourceIndiaCodeTitle')}
                </h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {t('resourceIndiaCodeDesc')}
                </p>
              </div>
              <a
                href="https://www.indiacode.nic.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-between w-full pt-3 border-t border-slate-100 text-xs font-bold text-blue-700 hover:text-blue-800 group"
              >
                <span>indiacode.nic.in</span>
                <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>

            {/* Resource 4: e-Shram Portal */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-brand-400 hover:shadow-sm transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    NDUW · UAN
                  </span>
                  <FileCheck className="w-4 h-4 text-emerald-600" />
                </div>
                <h4 className="font-heading font-bold text-sm text-slate-900 leading-tight">
                  {t('resourceEshramTitle')}
                </h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {t('resourceEshramDesc')}
                </p>
              </div>
              <a
                href="https://eshram.gov.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-between w-full pt-3 border-t border-slate-100 text-xs font-bold text-emerald-700 hover:text-emerald-800 group"
              >
                <span>eshram.gov.in</span>
                <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
          </div>
        </div>

        {/* IMPORTANT LEGAL NOTICE & STATUTORY DISCLAIMER */}
        <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-5 sm:p-6 text-xs text-amber-950 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>{t('legalDisclaimerTitle')}</span>
            </div>
            <VoiceSpeakerButton
              text={`${t('legalDisclaimerTitle')}. ${t('legalDisclaimerText')}`}
              lang={currentLang}
              label="Listen to Important Legal Notice"
            />
          </div>
          <p className="leading-relaxed text-slate-700 font-medium">
            {t('legalDisclaimerText')}
          </p>
          <div className="pt-2 border-t border-amber-200/70 flex flex-wrap items-center gap-4 text-[11px] text-amber-900 font-semibold">
            <span>✓ Platform Policy: 0% Commission & Free Direct Dialing</span>
            <span>✓ Statutory Law: Minimum wages & safety rules governed by Indian legislation</span>
          </div>
        </div>
      </div>

      {/* SECTION 3: COMMUNITY CODE OF CONDUCT */}
      <div className="space-y-5">
        <div>
          <span className="text-xs font-bold text-brand-600 uppercase tracking-wider block mb-1">
            Workplace Standards
          </span>
          <h2 className="font-heading font-bold text-xl text-slate-900">
            {t('communityCodeTitle')}
          </h2>
          <p className="text-xs text-slate-500">
            {t('communityCodeSub')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Guide 1 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-xl bg-brand-50 text-brand-700">
                <HeartHandshake className="w-5 h-5" />
              </span>
              <VoiceSpeakerButton
                text={`${t('guide1Title')}. ${t('guide1Desc')}`}
                lang={currentLang}
                label="Listen to guideline"
              />
            </div>
            <h3 className="font-heading font-bold text-base text-slate-900">{t('guide1Title')}</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{t('guide1Desc')}</p>
          </div>

          {/* Guide 2 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-xl bg-amber-50 text-amber-700">
                <Scale className="w-5 h-5" />
              </span>
              <VoiceSpeakerButton
                text={`${t('guide2Title')}. ${t('guide2Desc')}`}
                lang={currentLang}
                label="Listen to guideline"
              />
            </div>
            <h3 className="font-heading font-bold text-base text-slate-900">{t('guide2Title')}</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{t('guide2Desc')}</p>
          </div>

          {/* Guide 3 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <VoiceSpeakerButton
                text={`${t('guide3Title')}. ${t('guide3Desc')}`}
                lang={currentLang}
                label="Listen to guideline"
              />
            </div>
            <h3 className="font-heading font-bold text-base text-slate-900">{t('guide3Title')}</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{t('guide3Desc')}</p>
          </div>

          {/* Guide 4 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-xl bg-purple-50 text-purple-700">
                <FileCheck className="w-5 h-5" />
              </span>
              <VoiceSpeakerButton
                text={`${t('guide4Title')}. ${t('guide4Desc')}`}
                lang={currentLang}
                label="Listen to guideline"
              />
            </div>
            <h3 className="font-heading font-bold text-base text-slate-900">{t('guide4Title')}</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{t('guide4Desc')}</p>
          </div>

          {/* Guide 5 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-xl bg-blue-50 text-blue-700">
                <ShieldAlert className="w-5 h-5" />
              </span>
              <VoiceSpeakerButton
                text={`${t('guide5Title')}. ${t('guide5Desc')}`}
                lang={currentLang}
                label="Listen to guideline"
              />
            </div>
            <h3 className="font-heading font-bold text-base text-slate-900">{t('guide5Title')}</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{t('guide5Desc')}</p>
          </div>

          {/* Guide 6 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-xl bg-rose-50 text-rose-700">
                <BadgeAlert className="w-5 h-5" />
              </span>
              <VoiceSpeakerButton
                text={`${t('guide6Title')}. ${t('guide6Desc')}`}
                lang={currentLang}
                label="Listen to guideline"
              />
            </div>
            <h3 className="font-heading font-bold text-base text-slate-900">{t('guide6Title')}</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{t('guide6Desc')}</p>
          </div>
        </div>
      </div>

      {/* SECTION 4: GRIEVANCE BANNER */}
      <div className="bg-brand-50 border border-brand-200 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <BadgeAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-heading font-extrabold text-base sm:text-lg text-slate-900">
              {t('grievanceTitle')}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              {t('grievanceSub')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsGrievanceOpen(true)}
            className="px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>File Grievance Online</span>
          </button>
          <a
            href="tel:18001801551"
            className="px-5 py-3 rounded-xl bg-[#0f2942] hover:bg-[#1a3d60] text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-colors"
          >
            <PhoneCall className="w-4 h-4 text-amber-300" />
            <span>Call Toll-Free: 1800-180-1551</span>
          </a>
        </div>
      </div>

      {/* ONLINE GRIEVANCE FILING MODAL */}
      <AnimatePresence>
        {isGrievanceOpen && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                    <BadgeAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-heading font-black text-lg text-slate-900">
                      File a Safety & Wage Grievance
                    </h3>
                    <p className="text-xs text-slate-500">
                      Directly routed to the QuickHire Platform Administration Bureau
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsGrievanceOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {submitSuccess ? (
                <div className="py-8 text-center space-y-2">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                  <h4 className="font-heading font-black text-base text-slate-900">
                    Grievance Registered Successfully
                  </h4>
                  <p className="text-xs text-slate-500">
                    An administrator has been alerted. Your complaint ticket is now under active review.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitGrievance} className="space-y-3.5 text-xs text-slate-700">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1" htmlFor="public-g-title">
                      Issue Summary / Title *
                    </label>
                    <input
                      id="public-g-title"
                      type="text"
                      required
                      value={complaintTitle}
                      onChange={(e) => setComplaintTitle(e.target.value)}
                      placeholder="e.g. Unpaid wages for 3 days of harvesting work"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1" htmlFor="public-g-name">
                        Your Full Name
                      </label>
                      <input
                        id="public-g-name"
                        type="text"
                        value={complaintName}
                        onChange={(e) => setComplaintName(e.target.value)}
                        placeholder="Citizen Name"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1" htmlFor="public-g-phone">
                        Contact Mobile Number
                      </label>
                      <input
                        id="public-g-phone"
                        type="tel"
                        value={complaintPhone}
                        onChange={(e) => setComplaintPhone(e.target.value)}
                        placeholder="10-digit mobile number"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1" htmlFor="public-g-cat">
                      Grievance Category
                    </label>
                    <select
                      id="public-g-cat"
                      value={complaintCategory}
                      onChange={(e) => setComplaintCategory(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="unpaid_wages">Unpaid Wages / Settlement Delay</option>
                      <option value="unsafe_conditions">Unsafe Working Conditions</option>
                      <option value="harassment">Harassment or Abusive Behavior</option>
                      <option value="fraud">Fraudulent Listing or Impersonation</option>
                      <option value="misleading_equipment">Misleading Machinery Rental</option>
                      <option value="platform_abuse">Other Platform Abuse</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1" htmlFor="public-g-desc">
                      Detailed Incident Description *
                    </label>
                    <textarea
                      id="public-g-desc"
                      required
                      rows={3}
                      value={complaintDesc}
                      onChange={(e) => setComplaintDesc(e.target.value)}
                      placeholder="Please provide specifics: dates, location, persons involved, agreed amounts..."
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="pt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsGrievanceOpen(false)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <span>Submit Grievance</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default SafetyTab;
