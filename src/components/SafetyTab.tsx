import React from 'react';
import { motion } from 'framer-motion';
import {
  ShieldAlert,
  PhoneCall,
  Phone,
  ShieldCheck,
  Scale,
  HeartHandshake,
  FileCheck,
  BadgeAlert
} from 'lucide-react';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { getTranslation } from '../lib/translations';

interface SafetyTabProps {
  currentLang?: string;
}

export function SafetyTab({ currentLang = 'English' }: SafetyTabProps) {
  const t = (key: string): string => getTranslation(currentLang, key);

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
            <span className="text-emerald-700 hidden md:inline">— Wage dispute & exploitation reporting for unorganized workers</span>
          </div>
          <a
            href="tel:14434"
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto shrink-0"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Call 14434</span>
          </a>
        </div>
      </div>

      {/* SECTION 2: LEGAL & STATUTORY FRAMEWORK */}
      <div className="space-y-4">
        <div>
          <span className="text-xs font-bold text-brand-600 uppercase tracking-wider block mb-1">
            Indian Labor Rights
          </span>
          <h2 className="font-heading font-bold text-xl text-slate-900">
            {t('legalRightsTitle')}
          </h2>
          <p className="text-xs text-slate-500">
            {t('legalRightsSub')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Scale className="w-5 h-5" />
            </div>
            <h3 className="font-heading font-bold text-base text-slate-900">{t('right1Title')}</h3>
            <p className="text-xs text-slate-600 leading-relaxed">{t('right1Desc')}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-heading font-bold text-base text-slate-900">{t('right2Title')}</h3>
            <p className="text-xs text-slate-600 leading-relaxed">{t('right2Desc')}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
            <h3 className="font-heading font-bold text-base text-slate-900">{t('right3Title')}</h3>
            <p className="text-xs text-slate-600 leading-relaxed">{t('right3Desc')}</p>
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
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="tel:18001801551"
            className="px-5 py-3 rounded-xl bg-[#0f2942] hover:bg-[#1a3d60] text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-colors"
          >
            <PhoneCall className="w-4 h-4 text-amber-300" />
            <span>Call Toll-Free: 1800-180-1551</span>
          </a>
        </div>
      </div>
    </motion.div>
  );
}

export default SafetyTab;
