import React, { useState, useEffect, useCallback } from 'react';
import { EmojiIcon } from './EmojiIcon';
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
  Edit3,
  IndianRupee,
  CheckCircle2,
  Sparkles,
  Tractor,
  Star,
  Bell,
  RefreshCw,
  Phone,
  Receipt,
  ShieldCheck,
  X,
  History,
  RotateCcw,
  Eye,
  UserCheck,
  Clock,
  Navigation,
  Play,
  Pause
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { RateWorkerModal } from './RateWorkerModal';
import { PaymentReceiptModal, PaymentReceiptData } from './PaymentReceiptModal';
import { speakText } from '../lib/speech';
import { getTranslation, formatLocalizedCurrency, formatLocalizedDate, formatLocalizedNumber } from '../lib/translations';
import { extractErrorMessage } from '../lib/errorHandler';

export interface JobRecordItem {
  id: string;
  worker_id?: string;
  status: string;
  created_at: string;
  hiring_source?: 'application' | 'direct_phone' | string | null;
  agreement_evidence_type?: string | null;
  reported_by?: string | null;
  eta_minutes?: number | null;
  eta_updated_at?: string | null;
  arrived_at?: string | null;
  arrived_reported_by?: string | null;
  attendance_confirmed_at?: string | null;
  attendance_confirmed_by?: string | null;
  work_started_at?: string | null;
  work_completed_at?: string | null;
  break_minutes?: number | null;
  overtime_hours?: number | null;
  total_working_hours?: number | null;
  agreed_wage?: number | null;
  total_payable?: number | null;
  total_paid?: number | null;
  payment_status?: string | null;
  profiles?: {
    id?: string;
    phone_number?: string | null;
    full_name?: string | null;
  } | null;
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
  hiring_source?: 'application' | 'direct_phone' | string | null;
  agreement_evidence_type?: string | null;
  reported_by?: string | null;
  eta_minutes?: number | null;
  arrived_at?: string | null;
  arrived_reported_by?: string | null;
  attendance_confirmed_at?: string | null;
  attendance_confirmed_by?: string | null;
  work_started_at?: string | null;
  work_completed_at?: string | null;
  break_minutes?: number | null;
  overtime_hours?: number | null;
  total_working_hours?: number | null;
  agreed_wage?: number | null;
  total_payable?: number | null;
  total_paid?: number | null;
  payment_status?: string | null;
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

export interface WorkerProfileState {
  id?: string;
  full_name?: string | null;
  phone_number?: string | null;
  village?: string | null;
  district?: string | null;
  state?: string | null;
  city?: string | null;
  pincode?: string | null;
  address_line?: string | null;
  location?: string | null;
  category?: string | null;
  skills?: string[] | null;
  experience_years?: number | null;
  daily_wage?: number | null;
  experience_description?: string | null;
  average_rating?: number | null;
  total_working_hours?: number | null;
  upi_id?: string | null;
  bank_account_no?: string | null;
  bank_ifsc?: string | null;
  bank_account_name?: string | null;
  [key: string]: unknown;
}

export interface ReceiptJobInput {
  id?: string;
  title?: string;
  offered_wages?: number;
  description?: string | null;
  category?: string | null;
  profiles?: { full_name?: string | null; phone_number?: string | null } | null;
}

export interface ReceiptRecordInput {
  id?: string;
  agreed_wage?: number | null;
  total_payable?: number | null;
  total_paid?: number | null;
  total_working_hours?: number | null;
  break_minutes?: number | null;
  overtime_hours?: number | null;
  profiles?: { full_name?: string | null; phone_number?: string | null } | null;
  workers?: { profiles?: { full_name?: string | null; phone_number?: string | null } | null } | null;
}

export interface ReceiptPaymentInput {
  id?: string;
  receipt_number?: string;
  amount?: number;
  payment_method?: string;
  created_at?: string;
  transaction_ref?: string | null;
  [key: string]: unknown;
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
  payment_reference?: string | null;
  verification_status?: string | null;
  status: string | null;
  created_at: string;
  payee_name?: string | null;
  payer_name?: string | null;
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
  userRole?: 'worker' | 'employer' | 'admin' | null;
  myPostedJobs: PostedJobItem[];
  loadingMyJobs: boolean;
  onNavigateTab: (tab: string) => void;
  onRequireLogin: () => void;
  onMarkJobCompleted: (jobId: string) => void;
  onBrowseWorkers: (category: string) => void;
  onOpenWorkerProfile?: () => void;
  onNavigateAdmin?: () => void;
  onPayWage: (
    recipientId: string,
    recipientName: string,
    recipientPhone?: string | null,
    jobId?: string,
    amount?: number,
    assignmentId?: string
  ) => void;
  onRehireWorker?: (worker: { id: string; name: string; category?: string; skills?: string[]; wage?: number }) => void;
  onViewWorkerProfile?: (workerId: string) => void;
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
  onNavigateAdmin,
  onPayWage,
  onRehireWorker,
  onViewWorkerProfile,
}: DashboardTabProps) {
  const t = (key: string): string => getTranslation(currentLang, key);

  // Tab mode: 'worker' or 'employer'
  // The authenticated account role determines the dashboard; users cannot switch roles here.
  const viewMode: 'worker' | 'employer' = userRole === 'employer' || userRole === 'admin' ? 'employer' : 'worker';

  // Worker history state
  const [workerProfile, setWorkerProfile] = useState<WorkerProfileState | null>(null);
  const [appliedJobs, setAppliedJobs] = useState<WorkerAppliedJobItem[]>([]);
  const [wagePayments, setWagePayments] = useState<PaymentRecordItem[]>([]);
  const [rentalPayments, setRentalPayments] = useState<PaymentRecordItem[]>([]);
  const [employerPayments, setEmployerPayments] = useState<PaymentRecordItem[]>([]);
  const [reviews, setReviews] = useState<ReviewRecordItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecordItem[]>([]);
  const [loadingWorkerData, setLoadingWorkerData] = useState(false);
  const [loadingEmployerPayments, setLoadingEmployerPayments] = useState(false);
  const [workerFetchError, setWorkerFetchError] = useState<string | null>(null);

  const [claimableProfiles, setClaimableProfiles] = useState<{
    id: string;
    full_name: string | null;
    location: string | null;
    created_at: string;
  }[]>([]);
  const [claimingProfileId, setClaimingProfileId] = useState<string | null>(null);
  const [claimProfileError, setClaimProfileError] = useState<string | null>(null);
  const [claimSecrets, setClaimSecrets] = useState<Record<string, string>>({});
  const [applicantStatusOverrides, setApplicantStatusOverrides] = useState<Record<string, string>>({});
  const [completionTimestampOverrides, setCompletionTimestampOverrides] = useState<Record<string, string>>({});
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentReceiptData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [overtimeInputs, setOvertimeInputs] = useState<Record<string, string>>({});

  const handleUpdateApplicantStatus = async (recordId: string, newStatus: string) => {
    try {
      setApplicantStatusOverrides((prev) => ({ ...prev, [recordId]: newStatus }));
      await supabase
        .from('job_records')
        .update({ status: newStatus })
        .eq('id', recordId);
    } catch (err) {
      console.warn('Error updating applicant status:', err);
    }
  };

  // Manual ETA & Arrival Handlers
  const handleWorkerOnTheWay = async (recordId: string, etaMins: number = 30) => {
    try {
      setApplicantStatusOverrides((prev) => ({ ...prev, [recordId]: 'on_the_way' }));
      await supabase.from('job_records')
        .update({
          status: 'on_the_way',
          eta_minutes: etaMins,
          eta_updated_at: new Date().toISOString(),
        })
        .eq('id', recordId);
      fetchWorkerHistory();
    } catch (err) {
      console.warn('Error setting on the way:', err);
    }
  };

  const handleWorkerArrived = async (recordId: string, isWorker: boolean) => {
    if (!user) return;
    try {
      setApplicantStatusOverrides((prev) => ({ ...prev, [recordId]: 'arrived' }));
      await supabase.from('job_records')
        .update({
          status: 'arrived',
          arrived_at: new Date().toISOString(),
          arrived_reported_by: user.id,
        })
        .eq('id', recordId);
      if (isWorker) {
        fetchWorkerHistory();
      }
    } catch (err) {
      console.warn('Error marking arrived:', err);
    }
  };

  const handleConfirmAttendance = async (recordId: string) => {
    if (!user) return;
    try {
      setApplicantStatusOverrides((prev) => ({ ...prev, [recordId]: 'attendance_confirmed' }));
      await supabase.from('job_records')
        .update({
          status: 'attendance_confirmed',
          attendance_confirmed_at: new Date().toISOString(),
          attendance_confirmed_by: user.id,
        })
        .eq('id', recordId);
    } catch (err) {
      console.warn('Error confirming attendance:', err);
    }
  };

  const handleStartWork = async (recordId: string) => {
    try {
      setApplicantStatusOverrides((prev) => ({ ...prev, [recordId]: 'in_progress' }));
      await supabase.from('job_records')
        .update({
          status: 'in_progress',
          work_started_at: new Date().toISOString(),
        })
        .eq('id', recordId);
    } catch (err) {
      console.warn('Error starting work:', err);
    }
  };

  const handleToggleBreak = async (recordId: string, currentStatus: string, currentBreakMins: number = 0) => {
    try {
      const nextStatus = currentStatus === 'on_break' ? 'in_progress' : 'on_break';
      const updatedBreak = currentStatus === 'on_break' ? (currentBreakMins || 0) + 30 : (currentBreakMins || 0);
      setApplicantStatusOverrides((prev) => ({ ...prev, [recordId]: nextStatus }));
      await supabase.from('job_records')
        .update({
          status: nextStatus,
          break_minutes: updatedBreak,
        })
        .eq('id', recordId);
    } catch (err) {
      console.warn('Error toggling break:', err);
    }
  };

  const handleCompleteWork = async (
    jobId: string,
    recordId: string,
    baseWage: number,
    overtimeHours: number = 0,
    baseShiftHours: number = 8
  ) => {
    if (!user || userRole !== 'employer') return;
    try {
      const hourlyRate = baseWage > 0 ? baseWage / 8 : 62.5;
      const overtimeWage = Math.round(overtimeHours * hourlyRate);
      const totalPayable = Math.round(baseWage + overtimeWage);
      const netWorkingHours = baseShiftHours + overtimeHours;
      const completedAt = new Date().toISOString();

      const { error } = await supabase.from('job_records')
        .update({
          status: 'completed',
          work_completed_at: completedAt,
          overtime_hours: overtimeHours,
          total_working_hours: netWorkingHours,
          agreed_wage: baseWage,
          total_payable: totalPayable,
          payment_status: 'pending',
        })
        .eq('id', recordId)
        .select('id')
        .single();

      if (error) throw error;
      setApplicantStatusOverrides((prev) => ({ ...prev, [recordId]: 'completed' }));
      setCompletionTimestampOverrides((prev) => ({ ...prev, [recordId]: completedAt }));
    } catch (err) {
      console.warn('Error completing work:', err);
    }
  };

  // Helper to open receipt
  const handleOpenReceipt = (
    job?: ReceiptJobInput | null,
    rec?: ReceiptRecordInput | null,
    payment?: ReceiptPaymentInput | null
  ) => {
    const receiptNum = (payment?.receipt_number as string) ||
      `QH-RCP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${rec?.id ? String(rec.id).slice(0, 4).toUpperCase() : '0001'}`;

    const wage = Number(rec?.agreed_wage) || Number(job?.offered_wages) || 500;
    const payable = Number(rec?.total_payable) || wage;
    const paid = Number(payment?.amount) || Number(rec?.total_paid) || payable;
    const remaining = Math.max(0, payable - (Number(rec?.total_paid) || paid));

    setSelectedReceipt({
      receiptNumber: receiptNum,
      paymentId: payment?.id,
      jobId: job?.id,
      assignmentId: rec?.id,
      jobTitle: job?.title || 'Daily Wage Work',
      employerName: job?.profiles?.full_name || user?.user_metadata?.full_name || 'Employer',
      employerLocation: job?.description,
      workerName: rec?.profiles?.full_name || rec?.workers?.profiles?.full_name || workerProfile?.full_name || 'Worker',
      workerCategory: job?.category,
      agreedWage: wage,
      workingHours: rec?.total_working_hours || 8,
      breakMinutes: rec?.break_minutes || 0,
      approvedOvertimeHours: rec?.overtime_hours || 0,
      totalPayable: payable,
      amountPaid: paid,
      remainingBalance: remaining,
      paymentMethod: payment?.payment_method || 'Direct Cash / Settlement',
      paymentDate: payment?.created_at || new Date().toISOString(),
      transactionRef: payment?.transaction_ref,
      recordedByName: user?.user_metadata?.full_name || 'QuickHire Employer',
      isUserReported: true,
    });
    setIsReceiptOpen(true);
  };

  // Fetch comprehensive worker history
  const fetchWorkerHistory = useCallback(async () => {
    if (!user) return;
    setLoadingWorkerData(true);
    setWorkerFetchError(null);

    try {
      // Offer only unclaimed profiles matching this account's OTP-confirmed phone.
      try {
        const { data: claimableRows, error: claimableError } = await supabase.rpc('get_claimable_assisted_profiles');
        if (claimableError) throw claimableError;
        setClaimableProfiles((claimableRows || []) as {
          id: string;
          full_name: string | null;
          location: string | null;
          created_at: string;
        }[]);
      } catch (claimableError) {
        console.warn('Claimable assisted profiles are unavailable:', claimableError);
        setClaimableProfiles([]);
      }

      // A worker may have older work stored against employer-created assisted profiles.
      // The RPC only returns IDs claimed by this authenticated worker (or an admin).
      let workerProfileIds = [user.id];
      try {
        const { data: claimedRows, error: claimLookupError } = await supabase.rpc(
          'get_claimed_profile_ids',
          { p_user_id: user.id }
        );
        if (claimLookupError) throw claimLookupError;
        workerProfileIds = Array.from(new Set([
          user.id,
          ...((claimedRows || []) as { id: string }[]).map((row) => row.id),
        ]));
      } catch (claimLookupError) {
        console.warn('Claimed worker history lookup unavailable; loading current profile only:', claimLookupError);
      }

      // 1. Fetch the current profile and any linked assisted profiles.
      const { data: prof } = await supabase
        .from('profiles')
        .select(`
          id, full_name, phone_number, role, account_status, category, skills,
          experience_years, daily_wage, experience_description, preferred_work_location,
          availability_status, location, village, city, district, state, pincode,
          created_at, updated_at
        `)
        .eq('id', user.id)
        .single();

      const { data: wrk } = await supabase
        .from('workers')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      const claimedIds = workerProfileIds.filter((id) => id !== user.id);
      let claimedProfile: Record<string, unknown> | null = null;
      let claimedWorker: Record<string, unknown> | null = null;
      if (claimedIds.length > 0) {
        const [{ data: claimedProfiles }, { data: claimedWorkers }] = await Promise.all([
          supabase.from('profiles')
            .select('full_name, category, skills, experience_years, daily_wage, experience_description, preferred_work_location, availability_status, location, village, city, district, state, pincode')
            .in('id', claimedIds),
          supabase.from('workers').select('*').in('id', claimedIds),
        ]);
        claimedProfile = (claimedProfiles?.[0] as Record<string, unknown> | undefined) || null;
        claimedWorker = (claimedWorkers?.[0] as Record<string, unknown> | undefined) || null;
      }

      // 1b. Fetch private banking details from profile_private_details exclusively
      let privateBanking: { bank_name?: string | null; bank_account_no?: string | null; bank_ifsc?: string | null; upi_id?: string | null } | null = null;
      try {
        const { data: priv } = await supabase
          .from('profile_private_details')
          .select('bank_name, bank_account_no, bank_ifsc, upi_id')
          .eq('profile_id', user.id)
          .maybeSingle();
        privateBanking = priv;
      } catch {
        // Non-blocking if table not yet provisioned
      }

      if (prof || wrk || privateBanking || claimedProfile || claimedWorker) {
        const mergedProfile: Record<string, unknown> = {
          ...(claimedProfile || {}),
          ...(claimedWorker || {}),
          ...(prof || {}),
          ...(wrk || {}),
          ...(privateBanking || {}),
          id: user.id,
        };
        const fallbackFields = [
          'full_name', 'phone_number', 'category', 'skills', 'experience_years',
          'daily_wage', 'experience_description', 'preferred_work_location',
          'availability_status', 'location', 'village', 'city', 'district', 'state', 'pincode',
        ];
        for (const field of fallbackFields) {
          const currentValue = mergedProfile[field];
          const isEmptyArray = Array.isArray(currentValue) && currentValue.length === 0;
          const isPlaceholderName = field === 'full_name' && currentValue === 'QuickHire User';
          if (currentValue == null || currentValue === '' || isEmptyArray || isPlaceholderName) {
            mergedProfile[field] = claimedWorker?.[field] ?? claimedProfile?.[field] ?? currentValue;
          }
        }
        setWorkerProfile(mergedProfile as WorkerProfileState);
      }

      // 2. Fetch Applied / Assigned Jobs
      try {
        let { data: records, error: recErr } = await supabase
          .from('job_records')
          .select(`
            id, job_id, status, created_at,
            agreement_evidence_type, reported_by, eta_minutes, arrived_at, arrived_reported_by, attendance_confirmed_at, attendance_confirmed_by, work_started_at, work_completed_at, break_minutes, overtime_hours, total_working_hours, agreed_wage, total_payable, total_paid, payment_status,
            jobs ( id, title, category, offered_wages, description, status, profiles:employer_id ( full_name, phone_number ) )
          `)
          .in('worker_id', workerProfileIds)
          .order('created_at', { ascending: false });

        // Resilient fallback to baseline columns if extended Phase 2 columns do not exist yet (42703)
        if (recErr && (recErr.code === '42703' || String(recErr.message).includes('column') || String(recErr.message).includes('agreement_evidence_type'))) {
          const fallbackRes = await supabase
            .from('job_records')
            .select(`
              id, job_id, status, created_at,
              jobs ( id, title, category, offered_wages, description, status, profiles:employer_id ( full_name, phone_number ) )
            `)
            .in('worker_id', workerProfileIds)
            .order('created_at', { ascending: false });
          records = fallbackRes.data as typeof records;
          recErr = fallbackRes.error;
        }

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
          .in('payee_id', workerProfileIds)
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
          .in('reviewed_profile_id', workerProfileIds)
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

  const handleClaimAssistedProfile = async (profileId: string) => {
    if (!user || claimingProfileId) return;
    const claimSecret = (claimSecrets[profileId] || '').trim();
    if (!claimSecret) {
      setClaimProfileError('Enter the one-time claim code shared by the person who created this profile.');
      return;
    }
    setClaimingProfileId(profileId);
    setClaimProfileError(null);
    try {
      const { data, error } = await supabase.rpc('claim_assisted_worker_profile', {
        p_assisted_profile_id: profileId,
        p_verification_method: 'otp_and_secret_token',
        p_verification_proof: claimSecret,
      });
      if (error) throw error;
      const result = data as { success?: boolean; message?: string } | null;
      if (!result?.success) {
        throw new Error(result?.message || 'This profile could not be linked to your account.');
      }
      setClaimSecrets((current) => ({ ...current, [profileId]: '' }));
      setClaimableProfiles((current) => current.filter((profile) => profile.id !== profileId));
      await fetchWorkerHistory();
    } catch (err: unknown) {
      setClaimProfileError(extractErrorMessage(err, 'Unable to link the previous worker profile.'));
    } finally {
      setClaimingProfileId(null);
    }
  };

  // Fetch employer-initiated payment history
  const fetchEmployerPayments = useCallback(async () => {
    if (!user) return;
    setLoadingEmployerPayments(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('payer_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setEmployerPayments(data as unknown as PaymentRecordItem[]);
      }
    } catch (err) {
      console.warn('Employer payments load error:', err);
    } finally {
      setLoadingEmployerPayments(false);
    }
  }, [user]);

  // Employer reviews submitted and previously hired workers state
  const [employerSubmittedReviews, setEmployerSubmittedReviews] = useState<Record<string, { id: string; rating: number; comment: string | null }>>({});
  const [previouslyHiredWorkers, setPreviouslyHiredWorkers] = useState<{
    workerId: string;
    fullName: string;
    phone: string | null;
    category: string;
    skills: string[];
    averageRating: number | null;
    lastJobTitle: string;
    lastHiredDate: string;
    hiresCount: number;
    dailyWage: number | null;
  }[]>([]);
  const [loadingPreviouslyHired, setLoadingPreviouslyHired] = useState(false);

  // Rate worker modal state
  const [rateModalState, setRateModalState] = useState<{
    isOpen: boolean;
    jobId: string;
    jobTitle: string;
    workerId: string;
    workerName: string;
    existingReview?: { id: string; rating: number; comment: string | null } | null;
  }>({
    isOpen: false,
    jobId: '',
    jobTitle: '',
    workerId: '',
    workerName: '',
    existingReview: null,
  });

  // Fetch reviews submitted by this employer to populate ratings & allow edits
  const fetchEmployerSubmittedReviews = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('id, job_id, reviewed_profile_id, rating, comment')
        .eq('reviewer_profile_id', user.id);

      if (!error && data) {
        const revMap: Record<string, { id: string; rating: number; comment: string | null }> = {};
        data.forEach((r: { id: string; job_id: string; reviewed_profile_id: string; rating: number; comment: string | null }) => {
          // Key by job_id + worker_id
          const key = `${r.job_id}_${r.reviewed_profile_id}`;
          revMap[key] = {
            id: r.id,
            rating: Number(r.rating) || 5,
            comment: r.comment,
          };
        });
        setEmployerSubmittedReviews(revMap);
      }
    } catch (err) {
      console.warn('Notice loading employer submitted reviews:', err);
    }
  }, [user]);

  // Compute distinct previously hired workers from real database records (completed jobs)
  const fetchPreviouslyHiredWorkers = useCallback(async () => {
    if (!user) return;
    setLoadingPreviouslyHired(true);

    try {
      // Find all completed jobs posted by this employer
      const { data: jobsData, error: jobsErr } = await supabase
        .from('jobs')
        .select(`
          id, title, category, status, created_at,
          job_records (
            id, status, created_at, worker_id
          )
        `)
        .eq('employer_id', user.id)
        .order('created_at', { ascending: false });

      if (jobsErr) throw jobsErr;

      // Filter to jobs that are completed (or records where status is 'hired'/'completed')
      const workerHistoryMap = new Map<string, {
        workerId: string;
        lastJobTitle: string;
        lastHiredDate: string;
        hiresCount: number;
        category: string;
      }>();

      interface JobHistoryItem {
        id: string;
        title: string;
        category: string;
        status: string;
        created_at: string;
        job_records?: {
          id: string;
          worker_id: string;
          status: string;
          created_at: string;
        }[];
      }

      ((jobsData as JobHistoryItem[] | null) || []).forEach((j) => {
        const isJobDone = j.status === 'completed';
        (j.job_records || []).forEach((r) => {
          // Count if job is completed or if worker status is 'hired'/'completed'
          if (r.worker_id && (isJobDone || r.status === 'hired' || r.status === 'completed')) {
            const existing = workerHistoryMap.get(r.worker_id);
            if (!existing) {
              workerHistoryMap.set(r.worker_id, {
                workerId: r.worker_id,
                lastJobTitle: j.title || 'General Work',
                lastHiredDate: r.created_at || j.created_at,
                hiresCount: 1,
                category: j.category || 'Daily work',
              });
            } else {
              existing.hiresCount += 1;
              // Keep the most recent hired date
              if (new Date(r.created_at || j.created_at) > new Date(existing.lastHiredDate)) {
                existing.lastHiredDate = r.created_at || j.created_at;
                existing.lastJobTitle = j.title || existing.lastJobTitle;
                existing.category = j.category || existing.category;
              }
            }
          }
        });
      });

      const uniqueWorkerIds = Array.from(workerHistoryMap.keys());
      if (uniqueWorkerIds.length === 0) {
        setPreviouslyHiredWorkers([]);
        return;
      }

      // Fetch verified profiles and worker ratings for these distinct workers
      const [profilesRes, workersRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, phone_number, daily_wage')
          .in('id', uniqueWorkerIds),
        supabase
          .from('workers')
          .select('id, category, skills, average_rating')
          .in('id', uniqueWorkerIds),
      ]);

      interface ProfileSummary { id: string; full_name: string | null; phone_number: string | null; daily_wage: number | null; }
      interface WorkerSummary { id: string; category: string; skills: string[]; average_rating: number | null; }
      const profMap = new Map<string, ProfileSummary>((profilesRes.data || []).map((p: ProfileSummary) => [p.id, p]));
      const wrkMap = new Map<string, WorkerSummary>((workersRes.data || []).map((w: WorkerSummary) => [w.id, w]));

      const combined = uniqueWorkerIds.map((wid) => {
        const hist = workerHistoryMap.get(wid)!;
        const prof = profMap.get(wid);
        const wrk = wrkMap.get(wid);

        return {
          workerId: wid,
          fullName: prof?.full_name || 'Verified Rural Worker',
          phone: prof?.phone_number || null,
          category: wrk?.category || hist.category || 'Daily work',
          skills: wrk?.skills || [],
          averageRating: wrk?.average_rating !== null && wrk?.average_rating !== undefined ? Number(wrk.average_rating) : null,
          lastJobTitle: hist.lastJobTitle,
          lastHiredDate: hist.lastHiredDate,
          hiresCount: hist.hiresCount,
          dailyWage: prof?.daily_wage ? Number(prof.daily_wage) : ((wrk as { daily_wage?: number | null })?.daily_wage ? Number((wrk as { daily_wage?: number | null }).daily_wage) : null),
        };
      });

      // Sort by most recent hire
      combined.sort((a, b) => new Date(b.lastHiredDate).getTime() - new Date(a.lastHiredDate).getTime());
      setPreviouslyHiredWorkers(combined);
    } catch (err) {
      console.warn('Notice loading previously hired workers:', err);
    } finally {
      setLoadingPreviouslyHired(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      if (viewMode === 'worker') {
        fetchWorkerHistory();
      } else {
        fetchEmployerPayments();
        fetchEmployerSubmittedReviews();
        fetchPreviouslyHiredWorkers();
      }
    }
  }, [user, viewMode, fetchWorkerHistory, fetchEmployerPayments, fetchEmployerSubmittedReviews, fetchPreviouslyHiredWorkers]);

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
      {/* SUPER ADMIN CONSOLE BANNER */}
      {userRole === 'admin' && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-emerald-500/40 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase font-black tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Super Admin Session Active
                </span>
                <span className="text-xs text-slate-400 hidden sm:inline">Governance Suite Ready</span>
              </div>
              <h3 className="font-heading font-black text-base text-white mt-1">
                National DPI Administration Console
              </h3>
              <p className="text-xs text-slate-300">
                You are currently viewing the citizen portal. Click below to manage platform users, jobs, grievances, content, and UPI settlements.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onNavigateAdmin) {
                onNavigateAdmin();
              } else if (typeof window !== 'undefined') {
                window.location.href = '/admin';
              }
            }}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs transition-all shadow-md flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Launch Admin Suite →</span>
          </button>
        </div>
      )}

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
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
            {viewMode === 'employer' ? (
              <button
                onClick={() => onNavigateTab('post-job')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs sm:text-sm transition-all shadow-xs flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{t('postAnotherJob')}</span>
              </button>
            ) : (
              <button
                onClick={onOpenWorkerProfile}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
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
          {workerFetchError && (
            <div className="p-4 rounded-xl bg-red-50 text-red-700 text-xs border border-red-200">
              {workerFetchError}
            </div>
          )}
          {claimableProfiles.length > 0 && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5 space-y-3">
              <div>
                <h3 className="font-heading font-extrabold text-base text-emerald-950">
                  Is this your previous worker profile?
                </h3>
                <p className="text-xs text-emerald-900/80 mt-1">
                  We found an unclaimed profile matching your OTP-verified phone number. Enter the one-time claim code given to you by the person who created it to securely recover its earlier jobs and wage history.
                </p>
              </div>
              {claimableProfiles.map((profile) => (
                <div key={profile.id} className="rounded-xl bg-white border border-emerald-100 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-900">{profile.full_name || 'Previous worker profile'}</p>
                    {profile.location && <p className="text-xs text-slate-500 mt-0.5">{profile.location}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">
                      Created {formatLocalizedDate(profile.created_at, currentLang)}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:shrink-0">
                    <input
                      type="password"
                      autoComplete="one-time-code"
                      value={claimSecrets[profile.id] || ''}
                      onChange={(event) => setClaimSecrets((current) => ({ ...current, [profile.id]: event.target.value }))}
                      placeholder="One-time claim code"
                      aria-label={`One-time claim code for ${profile.full_name || 'previous worker profile'}`}
                      className="w-full sm:w-56 rounded-lg border border-slate-200 px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                    <button
                      type="button"
                      disabled={claimingProfileId !== null || !(claimSecrets[profile.id] || '').trim()}
                      onClick={() => handleClaimAssistedProfile(profile.id)}
                      className="shrink-0 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold transition-colors"
                    >
                      {claimingProfileId === profile.id ? 'Linking…' : 'Link my profile'}
                    </button>
                  </div>
                </div>
              ))}
              {claimProfileError && (
                <p role="alert" className="text-xs text-red-700">{claimProfileError}</p>
              )}
            </section>
          )}
          {/* Worker Hero Profile Summary */}
          <div className="bg-gradient-to-br from-emerald-50 via-white to-slate-50 rounded-3xl border border-emerald-200 p-4 sm:p-6 md:p-8 shadow-xs relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-heading font-black text-xl sm:text-2xl shadow-sm shrink-0">
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

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={onOpenWorkerProfile}
                  className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Edit Profile</span>
                </button>
                <button
                  onClick={fetchWorkerHistory}
                  disabled={loadingWorkerData}
                  className="p-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 transition-colors shadow-2xs cursor-pointer shrink-0"
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Applied Jobs
              </span>
              <span className="font-heading font-black text-xl sm:text-3xl text-slate-900">
                {appliedJobs.length}
              </span>
            </div>

            <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Completed Work
              </span>
              <span className="font-heading font-black text-xl sm:text-3xl text-emerald-600">
                {completedJobsCount}
              </span>
            </div>

            <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Wages Received
              </span>
              <span className="font-heading font-black text-xl sm:text-3xl text-amber-600 flex items-center gap-0.5">
                <IndianRupee className="w-4 h-4 sm:w-6 sm:h-6" />
                {formatLocalizedNumber(totalWagesSum, currentLang)}
              </span>
            </div>

            <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Reviews & Ratings
              </span>
              <span className="font-heading font-black text-xl sm:text-3xl text-yellow-600 flex items-center gap-1">
                <Star className="w-4 h-4 sm:w-6 sm:h-6 fill-yellow-400 text-yellow-500" />
                {reviews.length > 0
                  ? (reviews.reduce((a, b) => a + Number(b.rating || 5), 0) / reviews.lengthformatLocalizedNumber((reviews.reduce((a, b) => a + Number(b.rating || 5), 0) / reviews.length), currentLang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                  : '5.0'}
              </span>
            </div>
          </div>

          {/* WORKER PAYMENT DETAILS & UPI SECTION */}
          <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-teal-950 text-white rounded-3xl p-4 sm:p-6 md:p-7 shadow-xl border border-emerald-800/40 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Direct Payout Setup
                  </span>
                  <span className="text-xs text-emerald-400 font-bold">0% Middleman Cut</span>
                </div>
                <h3 className="text-lg sm:text-xl font-heading font-extrabold text-white flex items-center gap-2">
                  <span><EmojiIcon name="activity" className="mr-1 h-4 w-4" /> Worker Direct UPI & Bank Account</span>
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                  {t('eduUpiNoWithdrawal')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onNavigateTab('bank')}
                className="w-full sm:w-auto justify-center px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <Landmark className="w-4 h-4" />
                <span>{workerProfile?.upi_id ? 'Edit UPI & Bank' : 'Add UPI Details'}</span>
              </button>
            </div>

            <div className="pt-3 border-t border-emerald-900/60 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
              <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Saved UPI ID
                </span>
                <span className="font-mono font-bold text-sm text-emerald-300 truncate block">
                  {workerProfile?.upi_id || 'Not Linked Yet'}
                </span>
              </div>

              <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Bank Account / IFSC
                </span>
                <span className="font-mono font-bold text-xs text-slate-200 truncate block">
                  {workerProfile?.bank_account_no
                    ? `••••${workerProfile.bank_account_no.slice(-4)} (${workerProfile.bank_ifsc || 'IFSC'})`
                    : 'Not Configured'}
                </span>
              </div>

              <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Payout Readiness
                </span>
                <span className="font-bold text-xs flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{workerProfile?.upi_id ? 'Ready for Direct UPI' : 'Pending UPI Setup'}</span>
                </span>
              </div>
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
                          {formatLocalizedCurrency(job?.offered_wages || 500, currentLang)} / day
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
                            Applied: {formatLocalizedDate(rec.created_at, currentLang)}
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

                      {/* WORKER LIFECYCLE CONTROLS */}
                      {rec.status === 'hired' && (
                        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200">
                          <span className="text-[11px] font-extrabold text-emerald-900">
                            Assignment Confirmed!
                          </span>
                          <button
                            type="button"
                            onClick={() => handleWorkerOnTheWay(rec.id, 30)}
                            className="w-full sm:w-auto justify-center px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>Mark On the Way (30m)</span>
                          </button>
                        </div>
                      )}

                      {rec.status === 'on_the_way' && (
                        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200">
                          <span className="text-[11px] font-extrabold text-emerald-900 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-emerald-700" />
                            <span>On the way (ETA: {rec.eta_minutes || 30}m)</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleWorkerArrived(rec.id, true)}
                            className="w-full sm:w-auto justify-center px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark Arrived</span>
                          </button>
                        </div>
                      )}

                      {rec.status === 'arrived' && (
                        <div className="pt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Arrived at Site · Awaiting Employer Attendance Confirmation</span>
                        </div>
                      )}

                      {rec.status === 'attendance_confirmed' && (
                        <div className="pt-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Attendance Confirmed · Work Starting Soon</span>
                        </div>
                      )}

                      {rec.status === 'in_progress' && (
                        <div className="pt-2 p-2.5 rounded-xl bg-brand-50 border border-brand-200 text-[11px] font-bold text-brand-800 flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-brand-600 animate-pulse" />
                          <span>Work in Progress</span>
                        </div>
                      )}

                      {rec.status === 'on_break' && (
                        <div className="pt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800 flex items-center gap-1.5">
                          <Pause className="w-4 h-4 text-amber-600" />
                          <span>On Break ({rec.break_minutes || 0}m logged)</span>
                        </div>
                      )}

                      {rec.status === 'completed' && (
                        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                          <div>
                            <span className="text-[10px] font-extrabold uppercase text-emerald-800 block">Work Completed</span>
                            <span className="text-xs font-bold text-slate-800">
                              Total Payable: {formatLocalizedCurrency(rec.total_payable || job?.offered_wages || 500, currentLang)}
                              {rec.total_paid ? ` • Paid: ${formatLocalizedCurrency(rec.total_paid, currentLang)}` : ''}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenReceipt(job, rec)}
                            className="w-full sm:w-auto justify-center px-3 py-2 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>View Receipt</span>
                          </button>
                        </div>
                      )}
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
                    <div key={pay.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                          ₹
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs sm:text-sm text-slate-900">
                              Wage Settlement Received
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              {pay.payment_method}
                            </span>
                            {/* HONEST STATUS BADGE */}
                            {pay.status === 'paid' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                {t('statusPaid')}
                              </span>
                            ) : pay.status === 'submitted' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                                {t('statusSubmitted')}
                              </span>
                            ) : pay.status === 'failed' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
                                {t('statusFailed')}
                              </span>
                            ) : pay.status === 'cancelled' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                                {t('statusCancelled')}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                                {t('statusPending')}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 block mt-0.5 font-mono break-all">
                            {pay.payment_reference ? `Ref: ${pay.payment_reference}` : ''}
                            {pay.transaction_ref ? ` • UTR: ${pay.transaction_ref}` : ''} • {formatLocalizedDate(pay.created_at, currentLang)}
                          </span>
                        </div>
                      </div>
                      <span className="font-heading font-black text-sm sm:text-base text-emerald-700 self-end sm:self-center">
                        +{formatLocalizedCurrency(pay.amount, currentLang)}
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
                            Ref: {rent.transaction_ref || rent.id.slice(0, 8)} • {formatLocalizedDate(rent.created_at, currentLang)}
                          </span>
                        </div>
                      </div>
                      <span className="font-heading font-extrabold text-sm text-slate-800">
                        {formatLocalizedCurrency(rent.amount, currentLang)}
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
                            className={`w-3.5 h-3.5 ${star <= (rev.rating || 5)
                                ? 'fill-yellow-400 text-yellow-500'
                                : 'text-slate-200'
                              }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {formatLocalizedDate(rev.created_at, currentLang)}
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
                          {formatLocalizedDate(notif.created_at, currentLang, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
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
                            className={`text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded ${job.status === 'open'
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
                          {formatLocalizedCurrency(job.offered_wages, currentLang)} / day
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
                            const workerName = rec.profiles?.full_name || rec.workers?.profiles?.full_name || t('interestedWorkerFallback');
                            const phone = rec.profiles?.phone_number || rec.workers?.profiles?.phone_number;
                            const currentStatus = applicantStatusOverrides[rec.id] || rec.status || 'contacted';
                            const isDirectPhoneAgreement = rec.agreement_evidence_type === 'employer_reported_verbal_agreement';
                            const workerProfileId = rec.workers?.profiles?.id || rec.worker_id || rec.workers?.id || '';
                            const totalPayable = rec.total_payable || rec.agreed_wage || job.offered_wages || 500;
                            const totalPaid = rec.total_paid || 0;
                            const remainingBal = Math.max(0, totalPayable - totalPaid);

                            return (
                              <div
                                key={rec.id}
                                className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3"
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className="font-bold text-xs sm:text-sm text-slate-900">
                                        {workerName}
                                      </h4>
                                      <span
                                        className={`text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded ${currentStatus === 'completed'
                                            ? 'bg-purple-100 text-purple-800 border border-purple-300'
                                            : currentStatus === 'hired' || currentStatus === 'in_progress' || currentStatus === 'attendance_confirmed'
                                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                              : currentStatus === 'rejected'
                                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                                          }`}
                                      >
                                        {currentStatus.replace(/_/g, ' ')}
                                      </span>

                                      {rec.hiring_source === 'direct_phone' || isDirectPhoneAgreement ? (
                                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                          Employer-Reported Phone Agreement
                                        </span>
                                      ) : (
                                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                                          In-App Application
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-500 block mt-0.5">
                                      Agreed Daily Wage: {formatLocalizedCurrency(rec.agreed_wage || job.offered_wages || 500, currentLang)}
                                      {rec.total_working_hours ? ` • ${rec.total_working_hours}h worked` : ''}
                                      {rec.overtime_hours ? ` (+${rec.overtime_hours}h overtime)` : ''}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                                    {phone && (
                                      <a
                                        href={`tel:${phone}`}
                                        className="px-2.5 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors"
                                        title="Call worker"
                                      >
                                        <PhoneCall className="w-3.5 h-3.5" />
                                        <span>{t('call')}</span>
                                      </a>
                                    )}

                                    {/* WORKFLOW A: INITIAL HIRE / REJECT */}
                                    {currentStatus !== 'hired' && currentStatus !== 'on_the_way' && currentStatus !== 'arrived' && currentStatus !== 'attendance_confirmed' && currentStatus !== 'in_progress' && currentStatus !== 'on_break' && currentStatus !== 'completed' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateApplicantStatus(rec.id, 'hired')}
                                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                                          title="Hire / Accept this worker"
                                        >
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          <span>Hire</span>
                                        </button>

                                        {currentStatus !== 'rejected' && (
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateApplicantStatus(rec.id, 'rejected')}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                            title="Decline applicant"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* UNIFIED LIFECYCLE CONTROLS (Requirements D, E, F) */}
                                {(currentStatus === 'hired' || currentStatus === 'on_the_way') && (
                                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-[11px] font-bold text-slate-700">
                                      {currentStatus === 'on_the_way'
                                        ? `Worker is on the way (ETA: ${rec.eta_minutes || 30} mins)`
                                        : 'Awaiting arrival at farm / work site'}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateApplicantStatus(rec.id, 'no_show')}
                                        className="px-2 py-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer"
                                        title="Mark as did not arrive"
                                      >
                                        No-Show
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleWorkerArrived(rec.id, false)}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>Mark Worker Arrived</span>
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {currentStatus === 'arrived' && (
                                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-[11px] font-bold text-slate-700">
                                      Worker Arrived ({rec.arrived_reported_by === rec.worker_id ? 'Worker-reported' : 'Employer-reported'})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleConfirmAttendance(rec.id)}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Confirm Attendance</span>
                                    </button>
                                  </div>
                                )}

                                {currentStatus === 'attendance_confirmed' && (
                                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-[11px] font-bold text-emerald-800">
                                      Attendance Confirmed · Ready to start
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleStartWork(rec.id)}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                    >
                                      <Play className="w-3.5 h-3.5" />
                                      <span>Start Work</span>
                                    </button>
                                  </div>
                                )}

                                {(currentStatus === 'in_progress' || currentStatus === 'on_break') && (
                                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] font-bold text-brand-800 flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5 text-brand-600" />
                                        <span>{currentStatus === 'on_break' ? 'Worker on break' : 'Work in progress'}</span>
                                      </span>
                                      {currentStatus === 'in_progress' && (
                                        <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                                          <span className="text-[10px] text-slate-400 font-bold">OT hrs:</span>
                                          <input
                                            type="number"
                                            min="0"
                                            max="8"
                                            placeholder="0"
                                            value={overtimeInputs[rec.id] || ''}
                                            onChange={(e) => setOvertimeInputs((prev) => ({ ...prev, [rec.id]: e.target.value }))}
                                            className="w-10 text-xs font-bold text-slate-800 outline-none text-center"
                                          />
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleBreak(rec.id, currentStatus, rec.break_minutes || 0)}
                                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                                      >
                                        {currentStatus === 'on_break' ? (
                                          <>
                                            <Play className="w-3 h-3 text-emerald-600" />
                                            <span>Resume Work</span>
                                          </>
                                        ) : (
                                          <>
                                            <Pause className="w-3 h-3 text-amber-600" />
                                            <span>Take Break</span>
                                          </>
                                        )}
                                      </button>

                                      {userRole === 'employer' && (
<button
                                        type="button"
                                        onClick={() => handleCompleteWork(job.id, rec.id, rec.agreed_wage || job.offered_wages || 500, Number(overtimeInputs[rec.id] || 0))}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>Complete Work</span>
                                      </button>
)}
                                    </div>
                                  </div>
                                )}

                                {/* SETTLEMENT, RECEIPTS & REVIEWS (Requirement G, H) */}
                                {((currentStatus === 'completed' || currentStatus === 'work_completed') && Boolean(rec.work_completed_at || completionTimestampOverrides[rec.id])) && (
                                  <div className="pt-2 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-100">
                                    <div className="text-xs">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-800">Total Payable: {formatLocalizedCurrency(totalPayable, currentLang)}</span>
                                        <span className="font-bold text-emerald-700">Paid: {formatLocalizedCurrency(totalPaid, currentLang)}</span>
                                        {remainingBal > 0 ? (
                                          <span className="font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-[10px]">
                                            Balance: {formatLocalizedCurrency(remainingBal, currentLang)}
                                          </span>
                                        ) : (
                                          <span className="font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded text-[10px]">
                                            Fully Paid
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {remainingBal > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!user) {
                                              onRequireLogin();
                                              return;
                                            }
                                            onPayWage(
                                              workerProfileId,
                                              workerName,
                                              phone,
                                              job.id,
                                              remainingBal,
                                              rec.id
                                            );
                                          }}
                                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                        >
                                          <Landmark className="w-3.5 h-3.5" />
                                          <span>Record Settlement ({formatLocalizedCurrency(remainingBal, currentLang)})</span>
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => handleOpenReceipt(job, rec)}
                                        className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                                      >
                                        <Receipt className="w-3.5 h-3.5 text-brand-600" />
                                        <span>Receipt</span>
                                      </button>

                                      {(() => {
                                        const reviewKey = `${job.id}_${workerProfileId}`;
                                        const existing = employerSubmittedReviews[reviewKey];

                                        return (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (!user) {
                                                onRequireLogin();
                                                return;
                                              }
                                              setRateModalState({
                                                isOpen: true,
                                                jobId: job.id,
                                                jobTitle: job.title,
                                                workerId: workerProfileId,
                                                workerName,
                                                existingReview: existing || null,
                                              });
                                            }}
                                            className="px-2.5 py-1.5 rounded-lg bg-yellow-50 hover:bg-yellow-100 text-yellow-800 font-bold text-xs flex items-center gap-1 border border-yellow-200 transition-colors cursor-pointer"
                                            title="Rate worker performance"
                                          >
                                            <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-600" />
                                            <span>{existing ? t('editRating') : t('rateWorker')}</span>
                                          </button>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                )}
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

          {/* SECTION: PREVIOUSLY HIRED WORKERS */}
          <div className="space-y-4 pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-brand-600" />
                <div>
                  <h3 className="font-heading font-extrabold text-lg text-slate-900">
                    {t('previouslyHiredTitle')}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t('previouslyHiredSub')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={fetchPreviouslyHiredWorkers}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            {loadingPreviouslyHired ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                Loading previously hired workers from records...
              </div>
            ) : previouslyHiredWorkers.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white border border-slate-200 text-center text-xs text-slate-500 space-y-1">
                <UserCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-bold text-slate-700">No Previously Hired Workers</p>
                <p className="text-slate-400">
                  {t('noPreviouslyHired')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {previouslyHiredWorkers.map((w) => (
                  <div
                    key={w.workerId}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200">
                            {w.category}
                          </span>
                          <h4 className="font-heading font-bold text-base text-slate-900 mt-1">
                            {w.fullName}
                          </h4>
                        </div>
                        <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span>{formatLocalizedNumber(w.averageRating || 5, currentLang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">{t('lastHired')}:</span>
                          <span className="font-medium text-slate-800 truncate max-w-[140px] text-right" title={w.lastJobTitle}>
                            {w.lastJobTitle}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Date:</span>
                          <span className="text-slate-600 font-mono">
                            {formatLocalizedDate(w.lastHiredDate, currentLang)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Total engagements:</span>
                          <span className="font-bold text-emerald-700">
                            {w.hiresCount} {t('timesHired')}
                          </span>
                        </div>
                      </div>

                      {/* Skills tags */}
                      {w.skills && w.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {w.skills.slice(0, 3).map((s, idx) => (
                            <span key={idx} className="text-[10px] bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded">
                              {s}
                            </span>
                          ))}
                          {w.skills.length > 3 && (
                            <span className="text-[10px] text-slate-400 font-medium px-1 py-0.5">
                              +{w.skills.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions: View Profile and Hire Again */}
                    <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (onViewWorkerProfile) {
                            onViewWorkerProfile(w.workerId);
                          } else {
                            onBrowseWorkers(w.category);
                          }
                        }}
                        className="flex-1 py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                        <span>{t('viewProfile')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (onRehireWorker) {
                            onRehireWorker({
                              id: w.workerId,
                              name: w.fullName,
                              category: w.category,
                              skills: w.skills,
                              wage: w.dailyWage || undefined,
                            });
                          } else {
                            onNavigateTab('post-job');
                          }
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{t('hireAgain')}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION: EMPLOYER PAYMENT HISTORY & SETTLEMENTS */}
          <div className="space-y-4 pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-emerald-600" />
                <h3 className="font-heading font-extrabold text-lg text-slate-900">
                  Employer Wage & Rent Settlements History
                </h3>
              </div>
              <button
                type="button"
                onClick={fetchEmployerPayments}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            {loadingEmployerPayments ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                Loading payment history...
              </div>
            ) : employerPayments.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white border border-slate-200 text-center text-xs text-slate-500 space-y-1">
                <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-bold text-slate-700">No Payment Attempts Yet</p>
                <p className="text-slate-400">
                  When you settle daily wages using &quot;Pay Wage to Bank&quot;, records of your UPI attempts and submitted references will appear here.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="divide-y divide-slate-100">
                  {employerPayments.map((pay) => (
                    <div key={pay.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs sm:text-sm text-slate-900">
                            {pay.payment_for_type === 'worker_wage' ? 'Worker Wage Payment' : 'Machine Rent Payment'}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {pay.payment_method}
                          </span>
                          {/* HONEST STATUS BADGE */}
                          {pay.status === 'paid' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                              {t('statusPaid')}
                            </span>
                          ) : pay.status === 'submitted' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                              {t('statusSubmitted')}
                            </span>
                          ) : pay.status === 'failed' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
                              {t('statusFailed')}
                            </span>
                          ) : pay.status === 'cancelled' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                              {t('statusCancelled')}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                              {t('statusPending')}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 block font-mono">
                          {pay.payment_reference ? `Ref: ${pay.payment_reference}` : ''}
                          {pay.transaction_ref ? ` • UTR: ${pay.transaction_ref}` : ' • (Awaiting UTR)'} • {formatLocalizedDate(pay.created_at, currentLang)}
                        </span>
                      </div>

                      <span className="font-heading font-black text-sm sm:text-base text-slate-900 self-end sm:self-center">
                        -{formatLocalizedCurrency(pay.amount, currentLang)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PAYMENT RECEIPT MODAL */}
      <PaymentReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        receipt={selectedReceipt}
      />

      {/* RATE WORKER MODAL */}
      {user && (
        <RateWorkerModal
          isOpen={rateModalState.isOpen}
          onClose={() => setRateModalState((prev) => ({ ...prev, isOpen: false }))}
          jobId={rateModalState.jobId}
          jobTitle={rateModalState.jobTitle}
          workerId={rateModalState.workerId}
          workerName={rateModalState.workerName}
          currentUserId={user.id}
          currentLang={currentLang}
          existingReview={rateModalState.existingReview}
          onReviewSubmitted={(updatedReview) => {
            const key = `${rateModalState.jobId}_${rateModalState.workerId}`;
            setEmployerSubmittedReviews((prev) => ({
              ...prev,
              [key]: updatedReview,
            }));
            // Refresh previously hired worker average ratings
            fetchPreviouslyHiredWorkers();
          }}
        />
      )}
    </motion.div>
  );
}

export default DashboardTab;
