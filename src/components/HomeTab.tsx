import React from 'react';
import { User } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Search,
  ArrowRight,
  PlusCircle,
  UserCheck,
  Sparkles,
  Clock,
  PhoneCall,
  Award,
  Briefcase,
  MapPin,
  Send
} from 'lucide-react';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { getTranslation } from '../lib/translations';
import { getJobSpeechText } from '../lib/speech';

export interface JobItem {
  id: string;
  title: string;
  category: string;
  required_skills: string[];
  offered_wages: number;
  description: string | null;
  status: string | null;
  created_at: string;
  employer_id: string;
}

interface HomeTabProps {
  currentLang?: string;
  onNavigateTab: (tab: string) => void;
  user: User | null;
  onRequireLogin: () => void;
  onOpenWorkerProfile: () => void;
  onOpenDiscovery: (category?: string, skill?: string) => void;
  activeJobs: JobItem[];
  appliedJobIds: Set<string>;
  onApplyForJob: (jobId: string) => void;
  onSelectCategory: (category: string) => void;
}

export function HomeTab({
  currentLang = 'English',
  onNavigateTab,
  user,
  onRequireLogin,
  onOpenWorkerProfile,
  onOpenDiscovery,
  activeJobs,
  appliedJobIds,
  onApplyForJob,
  onSelectCategory,
}: HomeTabProps) {
  const t = (key: string): string => getTranslation(currentLang, key);

  return (
    <motion.div
      key="tab-home"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-10"
    >
      {/* OFFICIAL MARQUEE / CITIZEN ADVISORY NOTICE BAR */}
      <div className="bg-amber-50 border border-amber-200 text-amber-950 text-xs sm:text-sm py-2.5 px-4 rounded-2xl flex items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <span className="text-base shrink-0">📢</span>
          <span className="font-semibold leading-relaxed">
            <strong className="text-amber-900">Official Advisory:</strong> QuickHire is a 100% Free Direct Employment & Equipment Portal. Never pay middlemen or commission fees. Verify bank details in the Bank & Payouts tab for direct wage transfer.
          </span>
        </div>
        <VoiceSpeakerButton
          text="Official Advisory: QuickHire is a 100% Free Direct Employment and Equipment Portal. Never pay middlemen or commission fees. Verify bank details in the Bank and Payouts tab for direct wage transfer."
          lang={currentLang}
          label="Listen to official citizen advisory"
        />
      </div>

      {/* HERO SECTION */}
      <div className="bg-gradient-to-br from-brand-50/70 via-white to-amber-50/40 rounded-3xl border border-slate-200/90 p-8 sm:p-12 relative overflow-hidden shadow-sm">
        <div className="max-w-3xl space-y-6 relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-100 text-brand-800 border border-brand-200 text-xs sm:text-sm font-bold">
            <CheckCircle2 className="w-4 h-4 text-brand-600" />
            <span>{t('heroBadge')}</span>
          </div>

          <h1 className="font-heading font-extrabold text-3xl sm:text-5xl lg:text-[52px] leading-[1.14] text-slate-900 tracking-tight whitespace-pre-line">
            {t('heroTitle')}
          </h1>

          <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl">
            {t('heroSub')}
          </p>

          <div className="flex flex-wrap items-center gap-3.5 pt-2">
            <button
              onClick={() => onNavigateTab('workers')}
              className="px-6 py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm sm:text-base transition-all shadow-md shadow-brand-500/20 flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              <span>{t('heroFindWorkers')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => onNavigateTab('post-job')}
              className="px-6 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm sm:text-base transition-all shadow-md shadow-amber-500/20 flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t('heroPostJob')}</span>
            </button>

            <button
              onClick={() => {
                if (!user) onRequireLogin();
                else onOpenWorkerProfile();
              }}
              className="px-5 py-3.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-sm sm:text-base transition-all shadow-xs flex items-center gap-2"
            >
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>{t('heroRegisterWorker')}</span>
            </button>

            <button
              onClick={() => onOpenDiscovery('All', '')}
              className="px-4 py-3.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-brand-800 border border-brand-200 font-bold text-sm sm:text-base transition-all shadow-xs flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-brand-600" />
              <span>{t('skillMatcher')}</span>
            </button>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-96 h-96 bg-brand-200/40 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* 4 CORE VALUE METRICS STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-start gap-3.5 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading font-extrabold text-sm sm:text-base text-slate-900">{t('statMiddlemen')}</h3>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t('statMiddlemenDesc')}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-start gap-3.5 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading font-extrabold text-sm sm:text-base text-slate-900">{t('statWages')}</h3>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t('statWagesDesc')}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-start gap-3.5 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading font-extrabold text-sm sm:text-base text-slate-900">{t('statCall')}</h3>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t('statCallDesc')}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-start gap-3.5 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading font-extrabold text-sm sm:text-base text-slate-900">{t('statAssisted')}</h3>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t('statAssistedDesc')}</p>
          </div>
        </div>
      </div>

      {/* WORK CATEGORIES */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-brand-600 uppercase tracking-wider block mb-1">
              Employment Domains
            </span>
            <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900">
              {t('categoriesTitle')}
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">
              {t('categoriesSub')}
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('workers')}
            className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 self-start sm:self-auto"
          >
            <span>Browse Full Directory</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Agriculture */}
          <div
            onClick={() => {
              onSelectCategory('Agriculture');
              onNavigateTab('workers');
            }}
            className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-brand-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 group-hover:bg-brand-500 group-hover:text-white text-emerald-700 flex items-center justify-center text-xl transition-colors mb-4">
                🌾
              </div>
              <h3 className="font-heading font-extrabold text-lg text-slate-900 group-hover:text-brand-600 transition-colors">
                {t('catAgri')}
              </h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {t('catAgriDesc')}
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-brand-600">
              <span>Explore Workers</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Card 2: Construction */}
          <div
            onClick={() => {
              onSelectCategory('Construction');
              onNavigateTab('workers');
            }}
            className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-brand-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 group-hover:bg-amber-500 group-hover:text-white text-amber-700 flex items-center justify-center text-xl transition-colors mb-4">
                🏗️
              </div>
              <h3 className="font-heading font-extrabold text-lg text-slate-900 group-hover:text-amber-600 transition-colors">
                {t('catConst')}
              </h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {t('catConstDesc')}
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-amber-600">
              <span>Explore Workers</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Card 3: Daily work */}
          <div
            onClick={() => {
              onSelectCategory('Daily work');
              onNavigateTab('workers');
            }}
            className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-brand-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 group-hover:bg-blue-500 group-hover:text-white text-blue-700 flex items-center justify-center text-xl transition-colors mb-4">
                📦
              </div>
              <h3 className="font-heading font-extrabold text-lg text-slate-900 group-hover:text-blue-600 transition-colors">
                {t('catDaily')}
              </h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {t('catDailyDesc')}
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-600">
              <span>Explore Workers</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Card 4: Skilled */}
          <div
            onClick={() => {
              onSelectCategory('Skilled self-employed');
              onNavigateTab('workers');
            }}
            className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-brand-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-purple-50 group-hover:bg-purple-500 group-hover:text-white text-purple-700 flex items-center justify-center text-xl transition-colors mb-4">
                🔧
              </div>
              <h3 className="font-heading font-extrabold text-lg text-slate-900 group-hover:text-purple-600 transition-colors">
                {t('catSkilled')}
              </h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {t('catSkilledDesc')}
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-brand-600">
              <span>Explore Workers</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div className="bg-slate-900 text-white rounded-3xl p-8 sm:p-12 space-y-8">
        <div className="max-w-2xl">
          <span className="text-xs font-bold text-brand-300 uppercase tracking-wider block mb-1">
            Transparent Process
          </span>
          <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-white">
            {t('howItWorksTitle')}
          </h2>
          <p className="text-slate-400 text-sm mt-2">
            {t('howItWorksSub')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700/60 space-y-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center font-black text-sm">
              01
            </div>
            <h3 className="font-heading font-bold text-lg text-white">{t('step1Title')}</h3>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">{t('step1Desc')}</p>
          </div>

          <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700/60 space-y-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-black text-sm">
              02
            </div>
            <h3 className="font-heading font-bold text-lg text-white">{t('step2Title')}</h3>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">{t('step2Desc')}</p>
          </div>

          <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700/60 space-y-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-black text-sm">
              03
            </div>
            <h3 className="font-heading font-bold text-lg text-white">{t('step3Title')}</h3>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">{t('step3Desc')}</p>
          </div>
        </div>
      </div>

      {/* OPEN JOBS SPOTLIGHT FEED */}
      <div id="jobs-feed" className="space-y-6 scroll-mt-24">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-brand-600 uppercase tracking-wider block mb-1">
              Live Work Demand
            </span>
            <h2 className="font-heading font-extrabold text-2xl text-slate-900">
              {t('openJobsSpotlight')}
            </h2>
          </div>
          <button
            onClick={() => onNavigateTab('post-job')}
            className="text-xs font-bold text-brand-700 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-3.5 py-2 rounded-xl border border-brand-200 transition-colors flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{t('tabPostJob')}</span>
          </button>
        </div>

        {activeJobs.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm p-6">
            <Briefcase className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p>No active job listings currently open. Employers can post jobs in seconds!</p>
            <button
              onClick={() => onNavigateTab('post-job')}
              className="mt-4 px-4 py-2 bg-brand-500 text-white rounded-xl text-xs font-bold hover:bg-brand-600 transition-colors"
            >
              Post the First Job
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
            {activeJobs.slice(0, 6).map((job) => (
              <div
                key={job.id}
                className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-slate-300 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 border border-brand-200">
                      {job.category}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <VoiceSpeakerButton
                        text={getJobSpeechText(job, currentLang)}
                        lang={currentLang}
                        label="Listen to job details"
                      />
                      <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                        ₹{job.offered_wages} / day
                      </span>
                    </div>
                  </div>

                  <h3 className="font-heading font-bold text-base text-slate-900 mb-1">
                    {job.title}
                  </h3>

                  {job.description && (
                    <p className="text-xs text-slate-500 mb-3 flex items-center gap-1 line-clamp-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{job.description}</span>
                    </p>
                  )}

                  {job.required_skills && job.required_skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-5">
                      {job.required_skills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="text-[11px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => onApplyForJob(job.id)}
                  disabled={appliedJobIds.has(job.id)}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                    appliedJobIds.has(job.id)
                      ? 'bg-slate-100 text-slate-500 border border-slate-200 cursor-not-allowed'
                      : 'bg-brand-500 hover:bg-brand-600 text-white shadow-xs'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{appliedJobIds.has(job.id) ? t('alreadyInterested') : t('interestedBtn')}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default HomeTab;
