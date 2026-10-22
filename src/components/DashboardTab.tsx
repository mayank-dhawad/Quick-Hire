import React, { useState, useEffect, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import {
  Building2,
  PlusCircle,
  Briefcase,
  MapPin,
  ArrowRight,
  PhoneCall,
  Landmark,
  UserCheck,
  Edit3,
  IndianRupee,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  Tractor,
  Star,
  Bell,
  AlertCircle,
  RefreshCw,
  Phone
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { speakText } from '../lib/speech';
import { getTranslation } from '../lib/translations';
import { extractErrorMessage } from '../lib/errorHandler';

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

export interface WorkerAppliedJobItem {
  id: string;
  job_id: string;
  status: string;
  created_at: string;
  jobs?: {
    id: string;
    title: string;
    category: string;
    offered_wages: number;
    description: string | null;
    status: string;
    profiles?: {
      full_name: string | null;
      phone_number: string | null;
    } | null;
  } | null;
}

export interface PaymentRecordItem {
  id: string;
  payer_id: string;
  payee_id: string;
  payment_for_type: 'worker_wage' | 'machine_rental';
  reference_id: string | null;
  amount: number;
  payment_method: string;
  transaction_ref: string | null;
  status: string | null;
  created_at: string;
}

export interface ReviewRecordItem {
  id: string;
  job_id: string;
  reviewer_profile_id: string;
  reviewed_profile_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface NotificationRecordItem {
  id: string;
  profile_id: string;
  title: string;
  message: string;
  type: string | null;
  is_read: boolean;
  created_at: string;
}

interface DashboardTabProps {
  currentLang?: string;
  user: User | null;
  userRole?: 'worker' | 'employer' | null;
  myPostedJobs: PostedJobItem[];
  loadingMyJobs: boolean;
  onNavigateTab: (tab: string) => void;
  onRequireLogin: () => void;
  onMarkJobCompleted: (jobId: string) => void;
  onBrowseWorkers: (category: string) => void;
  onOpenWorkerProfile?: () => void;
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
  userRole,
  myPostedJobs,
  loadingMyJobs,
  onNavigateTab,
  onRequireLogin,
  onMarkJobCompleted,
  onBrowseWorkers,
  onOpenWorkerProfile,
  onPayWage,
}: DashboardTabProps) {
  const t = (key: string): string => getTranslation(currentLang, key);

  // Tab mode: 'worker' or 'employer'
  const [viewMode, setViewMode] = useState<'worker' | 'employer'>(() => {
    return userRole === 'employer' ? 'employer' : 'worker';
  });

  // Synchronize view mode if role arrives after initial mount
  useEffect(() => {
    if (userRole) {
      setViewMode(userRole);
    }
  }, [userRole]);

  // Worker history state
  const [workerProfile, setWorkerProfile] = useState<any>(null);
  const [appliedJobs, setAppliedJobs] = useState<WorkerAppliedJobItem[]>([]);
  const [wagePayments, setWagePayments] = useState<PaymentRecordItem[]>([]);
  const [rentalPayments, setRentalPayments] = useState<PaymentRecordItem[]>([]);
  const [reviews, setReviews] = useState<ReviewRecordItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecordItem[]>([]);
  const [loadingWorkerData, setLoadingWorkerData] = useState(false);
  const [workerFetchError, setWorkerFetchError] = useState<string | null>(null);

  // Fetch comprehensive worker history
  const fetchWorkerHistory = useCallback(async () => {
    if (!user) return;
    setLoadingWorkerData(true);
    setWorkerFetchError(null);

    try {
      // 1. Fetch Profile and Worker details
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      const { data: wrk } = await supabase
        .from('workers')
        .select('*')
        .eq('id', user.id)
        .single();

      if (prof || wrk) {
        setWorkerProfile({ ...prof, ...(wrk || {}) });
      }

      // 2. Fetch Applied / Assigned Jobs
      try {
        const { data: records, error: recErr } = await supabase
          .from('job_records')
          .select(`
            id, job_id, status, created_at,
            jobs ( id, title, category, offered_wages, description, status, profiles:employer_id ( full_name, phone_number ) )
          `)
          .eq('worker_id', user.id)
          .order('created_at', { ascending: false });

        if (recErr) throw recErr;
        setAppliedJobs((records as unknown as WorkerAppliedJobItem[]) || []);
      } catch (err) {
        console.warn('Notice loading job_records:', err);
      }

      // 3. Fetch Wages Received
      try {
        const { data: wages, error: wageErr } = await supabase
          .from('payments')
          .select('*')
          .eq('payee_id', user.id)
          .eq('payment_for_type', 'worker_wage')
          .order('created_at', { ascending: false });

        if (!wageErr && wages) {
          setWagePayments(wages as PaymentRecordItem[]);
        }
      } catch (err) {
        console.warn('Notice loading wage payments:', err);
      }

      // 4. Fetch Equipment Rentals
      try {
        const { data: rentals, error: rentErr } = await supabase
          .from('payments')
          .select('*')
          .eq('payment_for_type', 'machine_rental')
          .or(`payee_id.eq.${user.id},payer_id.eq.${user.id}`)
          .order('created_at', { ascending: false });

        if (!rentErr && rentals) {
          setRentalPayments(rentals as PaymentRecordItem[]);
        }
      } catch (err) {
        console.warn('Notice loading rental payments:', err);
      }

      // 5. Fetch Reviews Received
      try {
        const { data: revs, error: revErr } = await supabase
          .from('reviews')
          .select('*')
          .eq('reviewed_profile_id', user.id)
          .order('created_at', { ascending: false });

        if (!revErr && revs) {
          setReviews(revs as ReviewRecordItem[]);
        }
      } catch (err) {
        console.warn('Notice loading reviews:', err);
      }

      // 6. Fetch Notifications
      try {
        const { data: notifs, error: notifErr } = await supabase
          .from('notifications')
          .select('*')
          .eq('profile_id', user.id)
          .order('created_at', { ascending: false });

        if (!notifErr && notifs) {
          setNotifications(notifs as NotificationRecordItem[]);
        }
      } catch (err) {
        console.warn('Notice loading notifications:', err);
      }
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Failed to retrieve persistent worker history.');
      setWorkerFetchError(msg);
    } finally {
      setLoadingWorkerData(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && viewMode === 'worker') {
      fetchWorkerHistory();
    }
  }, [user, viewMode, fetchWorkerHistory]);

  const totalWagesSum = wagePayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const completedJobsCount = appliedJobs.filter(
    (j) => j.status === 'completed' || j.jobs?.status === 'completed'
  ).length;

  return (
    <motion.div
      key="tab-my-jobs"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-8"
    >
      {/* HEADER & VIEW MODE SELECTOR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <span className="text-xs font-bold text-brand-600 uppercase tracking-wider block mb-1">
            {viewMode === 'worker' ? 'Citizen Account & Work History' : t('workforceManagement')}
          </span>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900">
              {viewMode === 'worker' ? 'Worker Dashboard & Activity' : t('dashboardTitle')}
            </h1>
            <VoiceSpeakerButton
              text={
                viewMode === 'worker'
                  ? 'Worker dashboard. View your persistent profile, applied jobs, wages received, equipment rentals, and reviews.'
                  : `${t('dashboardTitle')}. ${t('dashboardSub')}`
              }
              lang={currentLang}
              label={t('listenDashboard')}
            />
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {viewMode === 'worker'
              ? '100% persistent history across logins and devices. Direct settlements and verified ratings.'
              : t('dashboardSub')}
          </p>
        </div>

        {user && (
          <div className="flex items-center gap-2.5">
            {/* View Mode Toggle Pill */}
            <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  setViewMode('worker');
                  speakText('Switched to worker dashboard', currentLang);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'worker'
                    ? 'bg-white text-emerald-800 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                👷 Worker View
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('employer');
                  speakText('Switched to employer dashboard', currentLang);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'employer'
                    ? 'bg-white text-amber-800 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                🏢 Employer View
              </button>
            </div>

            {viewMode === 'employer' ? (
              <button
                onClick={() => onNavigateTab('post-job')}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs sm:text-sm transition-all shadow-xs flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{t('postAnotherJob')}</span>
              </button>
            ) : (
              <button
                onClick={onOpenWorkerProfile}
                className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm transition-all shadow-xs flex items-center gap-2 cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit Profile</span>
              </button>
            )}
          </div>
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
            className="w-full py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm shadow-sm transition-all cursor-pointer"
          >
            {t('login')}
          </button>
        </div>
      ) : viewMode === 'worker' ? (
        /* ========================================================================= */
        /*                             WORKER DASHBOARD                              */
        /* ========================================================================= */
        <div className="space-y-8">
          {/* Worker Hero Profile Summary */}
          <div className="bg-gradient-to-br from-emerald-50 via-white to-slate-50 rounded-3xl border border-emerald-200 p-6 sm:p-8 shadow-xs relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-heading font-black text-2xl shadow-sm shrink-0">
                  {workerProfile?.full_name ? workerProfile.full_name.charAt(0).toUpperCase() : 'W'}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-heading font-extrabold text-xl sm:text-2xl text-slate-900">
                      {workerProfile?.full_name || 'QuickHire Worker Account'}
                    </h2>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Permanent Citizen Account
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-slate-600 mt-1">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <strong>{workerProfile?.phone_number || 'Phone saved'}</strong>
                    </span>
                    {(workerProfile?.village || workerProfile?.district) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {[workerProfile?.village, workerProfile?.district, workerProfile?.state]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenWorkerProfile}
                  className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Edit Profile</span>
                </button>
                <button
                  onClick={fetchWorkerHistory}
                  disabled={loadingWorkerData}
                  className="p-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 transition-colors shadow-2xs cursor-pointer"
                  title="Refresh activity history"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingWorkerData ? 'animate-spin text-brand-600' : ''}`} />
                </button>
              </div>
            </div>

            {/* Quick Chips & Skills */}
            {workerProfile?.skills && workerProfile.skills.length > 0 && (
              <div className="mt-4 pt-4 border-t border-emerald-100 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">
                  Skills:
                </span>
                {workerProfile.skills.map((skill: string, idx: number) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-white border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 shadow-2xs flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Metric Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Applied Jobs
              </span>
              <span className="font-heading font-black text-2xl sm:text-3xl text-slate-900">
                {appliedJobs.length}
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Completed Work
              </span>
              <span className="font-heading font-black text-2xl sm:text-3xl text-emerald-600">
                {completedJobsCount}
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Wages Received
              </span>
              <span className="font-heading font-black text-2xl sm:text-3xl text-amber-600 flex items-center gap-0.5">
                <IndianRupee className="w-5 h-5 sm:w-6 sm:h-6" />
                {totalWagesSum.toLocaleString()}
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Reviews & Ratings
              </span>
              <span className="font-heading font-black text-2xl sm:text-3xl text-yellow-600 flex items-center gap-1">
                <Star className="w-5 h-5 sm:w-6 sm:h-6 fill-yellow-400 text-yellow-500" />
                {reviews.length > 0
                  ? (reviews.reduce((a, b) => a + Number(b.rating || 5), 0) / reviews.length).toFixed(1)
                  : '5.0'}
              </span>
            </div>
          </div>

          {/* SECTION A: APPLIED & IN-PROGRESS JOBS */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-brand-600" />
                <h3 className="font-heading font-extrabold text-lg text-slate-900">
                  Applied & Active Work Records
                </h3>
              </div>
              <button
                onClick={() => onNavigateTab('home')}
                className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 cursor-pointer"
              >
                <span>Find More Jobs</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {loadingWorkerData ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Loading persistent job records from database...
              </div>
            ) : appliedJobs.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
                <Briefcase className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="font-bold text-sm text-slate-800">No Job Applications Yet</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Browse open job listings and tap &quot;I&apos;m Interested&quot; to apply. Your applications will permanently appear here.
                </p>
                <button
                  onClick={() => onNavigateTab('home')}
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Browse Jobs Feed
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {appliedJobs.map((rec) => {
                  const job = rec.jobs;
                  const employerName = job?.profiles?.full_name || 'Verified Employer';
                  const employerPhone = job?.profiles?.phone_number;

                  return (
                    <div
                      key={rec.id}
                      className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200">
                              {job?.category || 'Daily work'}
                            </span>
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {rec.status}
                            </span>
                          </div>
                          <h4 className="font-heading font-bold text-base text-slate-900 mt-1">
                            {job?.title || 'Applied Job Position'}
                          </h4>
                        </div>
                        <span className="font-extrabold text-sm px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                          ₹{job?.offered_wages || 500} / day
                        </span>
                      </div>

                      {job?.description && (
                        <p className="text-xs text-slate-500 line-clamp-2">
                          {job.description}
                        </p>
                      )}

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div className="text-slate-600">
                          <span>Employer: <strong className="text-slate-800">{employerName}</strong></span>
                          <span className="block text-[10px] text-slate-400">
                            Applied: {new Date(rec.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        {employerPhone && (
                          <a
                            href={`tel:${employerPhone}`}
                            className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
                          >
                            <PhoneCall className="w-3.5 h-3.5" />
                            <span>Call Employer</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION B: WAGE SETTLEMENTS & RECEIPTS */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Landmark className="w-5 h-5 text-emerald-600" />
              <h3 className="font-heading font-extrabold text-lg text-slate-900">
                Direct Wage Settlements & Receipts
              </h3>
            </div>

            {wagePayments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-xs text-slate-500 space-y-1">
                <Landmark className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-bold text-slate-700">No Direct Wage Settlements Recorded</p>
                <p className="text-slate-400">
                  When employers settle your daily wages via Net Banking (IMPS/NEFT) or Direct UPI, verified payment receipts are permanently recorded here.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="divide-y divide-slate-100">
                  {wagePayments.map((pay) => (
                    <div key={pay.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                          ₹
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs sm:text-sm text-slate-900">
                              Wage Settlement Received
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              {pay.payment_method}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 block mt-0.5">
                            Ref: {pay.transaction_ref || pay.id.slice(0, 8)} • {new Date(pay.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <span className="font-heading font-black text-sm sm:text-base text-emerald-700">
                        +₹{pay.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SECTION C: MACHINERY & EQUIPMENT RENTALS */}
          {rentalPayments.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Tractor className="w-5 h-5 text-amber-600" />
                <h3 className="font-heading font-extrabold text-lg text-slate-900">
                  Machinery & Equipment Rental Activity
                </h3>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="divide-y divide-slate-100">
                  {rentalPayments.map((rent) => (
                    <div key={rent.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                          <Tractor className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="font-bold text-xs sm:text-sm text-slate-900 block">
                            Machine Rental Settlement ({rent.payment_method})
                          </span>
                          <span className="text-[11px] text-slate-400 block mt-0.5">
                            Ref: {rent.transaction_ref || rent.id.slice(0, 8)} • {new Date(rent.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <span className="font-heading font-extrabold text-sm text-slate-800">
                        ₹{rent.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SECTION D: REVIEWS & RATINGS */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              <h3 className="font-heading font-extrabold text-lg text-slate-900">
                Peer Ratings & Employer Reviews ({reviews.length})
              </h3>
            </div>

            {reviews.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-xs text-slate-500">
                <Star className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-bold text-slate-700">No Reviews Recorded Yet</p>
                <p className="text-slate-400">Complete assignments with local employers to receive ratings on your permanent record.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {reviews.map((rev) => (
                  <div key={rev.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-3.5 h-3.5 ${
                              star <= (rev.rating || 5)
                                ? 'fill-yellow-400 text-yellow-500'
                                : 'text-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(rev.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {rev.comment && (
                      <p className="text-xs text-slate-700 italic">&quot;{rev.comment}&quot;</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION E: NOTIFICATIONS & SMS UPDATES */}
          {notifications.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-brand-600" />
                <h3 className="font-heading font-extrabold text-lg text-slate-900">
                  Notifications & SMS Delivery History
                </h3>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="divide-y divide-slate-100">
                  {notifications.map((notif) => (
                    <div key={notif.id} className="p-4 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="font-bold text-xs text-slate-900">{notif.title}</h5>
                        <p className="text-xs text-slate-600 mt-0.5">{notif.message}</p>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {new Date(notif.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /*                            EMPLOYER DASHBOARD                             */
        /* ========================================================================= */
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
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
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
                            className="text-xs font-bold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
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
                          className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 cursor-pointer"
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
                                    className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5 border border-emerald-200 transition-colors cursor-pointer"
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
