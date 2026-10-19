import React from 'react';
import { User } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import {
  Building2,
  PlusCircle,
  Briefcase,
  MapPin,
  ArrowRight,
  PhoneCall,
  Landmark
} from 'lucide-react';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { getTranslation } from '../lib/translations';

export interface JobRecordItem {
  id: string;
  worker_id?: string;
  status: string;
  created_at: string;
  workers?: {
    id?: string;
    profiles?: {
      id?: string;
      phone_number?: string | null;
      full_name?: string | null;
    } | null;
  } | null;
}

export interface PostedJobItem {
  id: string;
  title: string;
  category: string;
  offered_wages: number;
  description: string | null;
  status: string;
  created_at: string;
  job_records?: JobRecordItem[];
}

interface DashboardTabProps {
  currentLang?: string;
  user: User | null;
  myPostedJobs: PostedJobItem[];
  loadingMyJobs: boolean;
  onNavigateTab: (tab: string) => void;
  onRequireLogin: () => void;
  onMarkJobCompleted: (jobId: string) => void;
  onBrowseWorkers: (category: string) => void;
  onPayWage: (
    recipientId: string,
    recipientName: string,
    recipientPhone?: string | null,
    jobId?: string,
    amount?: number
  ) => void;
}

export function DashboardTab({
  currentLang = 'English',
  user,
  myPostedJobs,
  loadingMyJobs,
  onNavigateTab,
  onRequireLogin,
  onMarkJobCompleted,
  onBrowseWorkers,
  onPayWage,
}: DashboardTabProps) {
  const t = (key: string): string => getTranslation(currentLang, key);

  return (
    <motion.div
      key="tab-my-jobs"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-8"
    >
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <span className="text-xs font-bold text-brand-600 uppercase tracking-wider block mb-1">
            {t('workforceManagement')}
          </span>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900">
              {t('dashboardTitle')}
            </h1>
            <VoiceSpeakerButton
              text={`${t('dashboardTitle')}. ${t('dashboardSub')}`}
              lang={currentLang}
              label={t('listenDashboard')}
            />
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {t('dashboardSub')}
          </p>
        </div>

        {user && (
          <button
            onClick={() => onNavigateTab('post-job')}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs sm:text-sm transition-all shadow-xs flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{t('postAnotherJob')}</span>
          </button>
        )}
      </div>

      {/* IF NOT LOGGED IN */}
      {!user ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center max-w-lg mx-auto space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
            <Building2 className="w-7 h-7" />
          </div>
          <h3 className="font-heading font-extrabold text-xl text-slate-900">
            {t('loginToViewDashboard')}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            {t('loginDashboardSub')}
          </p>
          <button
            onClick={onRequireLogin}
            className="w-full py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm shadow-sm transition-all"
          >
            {t('login')}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* SUMMARY STATS BAR */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                {t('totalJobsPosted')}
              </span>
              <span className="font-heading font-black text-3xl text-slate-900">
                {myPostedJobs.length}
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                {t('activeListings')}
              </span>
              <span className="font-heading font-black text-3xl text-emerald-600">
                {myPostedJobs.filter((j) => j.status === 'open').length}
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                {t('totalApplicants')}
              </span>
              <span className="font-heading font-black text-3xl text-amber-600">
                {myPostedJobs.reduce((acc, j) => acc + (j.job_records?.length || 0), 0)}
              </span>
            </div>
          </div>

          {/* JOBS LIST */}
          {loadingMyJobs ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              {t('loadingPostedJobs')}
            </div>
          ) : myPostedJobs.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8 space-y-4">
              <Briefcase className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="font-heading font-bold text-lg text-slate-800">
                {t('noJobsPosted')}
              </h3>
              <button
                onClick={() => onNavigateTab('post-job')}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                {t('tabPostJob')}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {myPostedJobs.map((job) => {
                const applicants = job.job_records || [];

                return (
                  <div
                    key={job.id}
                    className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5"
                  >
                    {/* JOB SUMMARY BAR */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200">
                            {job.category}
                          </span>
                          <span
                            className={`text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded ${
                              job.status === 'open'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {job.status}
                          </span>
                        </div>
                        <h3 className="font-heading font-bold text-lg text-slate-900">
                          {job.title}
                        </h3>
                        {job.description && (
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span>{job.description}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-extrabold text-sm px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                          ₹{job.offered_wages} / day
                        </span>
                        {job.status === 'open' && (
                          <button
                            onClick={() => onMarkJobCompleted(job.id)}
                            className="text-xs font-bold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                          >
                            {t('markCompleted')}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* APPLICANTS / INTERESTED WORKERS LIST */}
                    <div className="pt-4 border-t border-slate-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          {t('interestedWorkersList')} ({applicants.length})
                        </span>
                        <button
                          onClick={() => onBrowseWorkers(job.category)}
                          className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                        >
                          <span>{t('browseMatchingWorkers')}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>

                      {applicants.length === 0 ? (
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500">
                          {t('noApplicantsYet')}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {applicants.map((rec) => {
                            const workerName = rec.workers?.profiles?.full_name || t('interestedWorkerFallback');
                            const phone = rec.workers?.profiles?.phone_number;

                            return (
                              <div
                                key={rec.id}
                                className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-2"
                              >
                                <div>
                                  <h4 className="font-bold text-xs sm:text-sm text-slate-900">
                                    {workerName}
                                  </h4>
                                  <span className="text-[10px] text-slate-500">
                                    {t('appliedOn')}: {new Date(rec.created_at).toLocaleDateString()}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {phone ? (
                                    <a
                                      href={`tel:${phone}`}
                                      className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
                                    >
                                      <PhoneCall className="w-3.5 h-3.5" />
                                      <span>{t('call')}</span>
                                    </a>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-medium">
                                      {t('numberNotShared')}
                                    </span>
                                  )}

                                  <button
                                    onClick={() => {
                                      if (!user) {
                                        onRequireLogin();
                                        return;
                                      }
                                      onPayWage(
                                        rec.workers?.profiles?.id || rec.worker_id || rec.workers?.id || '',
                                        workerName,
                                        phone,
                                        job.id,
                                        job.offered_wages || 500
                                      );
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5 border border-emerald-200 transition-colors"
                                  >
                                    <Landmark className="w-3.5 h-3.5 text-emerald-700" />
                                    <span>₹ {t('payWageToBank')}</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default DashboardTab;
