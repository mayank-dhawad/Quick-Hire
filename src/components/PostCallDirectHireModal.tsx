import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import {
  PhoneCall,
  CheckCircle2,
  XCircle,
  Clock,
  Briefcase,
  Calendar,
  MapPin,
  IndianRupee,
  ShieldCheck,
  AlertCircle,
  X,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

import { extractErrorMessage } from '../lib/errorHandler';

export interface DirectHireWorkerInfo {
  id: string;
  full_name: string;
  category?: string;
  daily_wage?: number;
  phone_number?: string | null;
  location?: string | null;
  village?: string | null;
  city?: string | null;
}

interface PostCallDirectHireModalProps {
  isOpen: boolean;
  onClose: () => void;
  worker: DirectHireWorkerInfo | null;
  currentUser: User | null;
  currentLang?: string;
  onAssignmentCreated?: (assignment: Record<string, unknown>, job: Record<string, unknown>) => void;
  onRequireLogin: () => void;
}

export function PostCallDirectHireModal({
  isOpen,
  onClose,
  worker,
  currentUser,
  onAssignmentCreated,
  onRequireLogin,
}: PostCallDirectHireModalProps) {

  // Steps: 'prompt' | 'details' | 'declined' | 'undecided' | 'success'
  const [step, setStep] = useState<'prompt' | 'details' | 'declined' | 'undecided' | 'success'>('prompt');

  // Form fields
  const [jobTitle, setJobTitle] = useState('');
  const [agreedWage, setAgreedWage] = useState<string>('500');
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('08:00');
  const [expectedHours, setExpectedHours] = useState<string>('8');
  const [workLocation, setWorkLocation] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize defaults whenever worker opens
  useEffect(() => {
    if (worker) {
      setStep('prompt');
      setJobTitle(`${worker.category || 'General'} Work Assistance`);
      setAgreedWage(String(worker.daily_wage || 500));
      setScheduledDate(new Date().toISOString().split('T')[0]);
      setStartTime('08:00');
      setExpectedHours('8');
      setWorkLocation(worker.village || worker.location || worker.city || '');
      setErrorMessage(null);
    }
  }, [worker]);

  if (!isOpen || !worker) return null;

  const handleAgreed = () => {
    setStep('details');
  };

  const handleDeclined = () => {
    setStep('declined');
  };

  const handleUndecided = () => {
    setStep('undecided');
  };

  const handleConfirmDirectHire = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) {
      onRequireLogin();
      return;
    }

    const wageNum = Number(agreedWage);
    if (!wageNum || wageNum <= 0) {
      setErrorMessage('Please enter a valid agreed daily wage.');
      return;
    }

    if (!jobTitle.trim()) {
      setErrorMessage('Please enter the work title or type.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. Ensure employer profile exists in public.profiles
      const { data: profileCheck } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', currentUser.id)
        .single();

      if (!profileCheck) {
        await supabase.from('profiles').upsert({
          id: currentUser.id,
          role: 'employer',
          full_name: currentUser.user_metadata?.full_name || 'QuickHire Employer',
          phone_number: currentUser.phone || currentUser.user_metadata?.phone_number || null,
          account_status: 'active',
        });
      }

      // 2. Create the direct phone hire job
      const cleanLocation = workLocation.trim() || 'Work Location';
      const cleanTitle = jobTitle.trim();
      const descriptionText = `Direct phone agreement with ${worker.full_name} | Location: ${cleanLocation} | Hours: ${expectedHours}h`;

      const { data: jobData, error: jobErr } = await supabase.from('jobs')
        .insert([
          {
            employer_id: currentUser.id,
            title: cleanTitle,
            category: worker.category || 'Agriculture',
            required_skills: [worker.category || 'General Labor'],
            offered_wages: wageNum,
            description: descriptionText,
            status: 'open',
            hiring_source: 'direct_phone',
            scheduled_date: scheduledDate || new Date().toISOString().split('T')[0],
            start_time: startTime || '08:00',
            expected_duration_hours: Number(expectedHours) || 8,
            workers_needed: 1,
          },
        ])
        .select()
        .single();

      if (jobErr) throw jobErr;

      // 3. Create the direct hire assignment in job_records
      const { data: assignmentData, error: assignErr } = await supabase.from('job_records')
        .insert([
          {
            job_id: jobData.id,
            worker_id: worker.id,
            status: 'hired',
            hiring_source: 'direct_phone',
            agreement_evidence_type: 'employer_reported_verbal_agreement',
            reported_by: currentUser.id,
            agreed_wage: wageNum,
            total_payable: wageNum,
            total_paid: 0,
            payment_status: 'pending',
          },
        ])
        .select()
        .single();

      if (assignErr) {
        // Handle duplicate assignment gracefully
        if (assignErr.code === '23505') {
          setErrorMessage('This worker is already assigned to this job.');
          return;
        }
        throw assignErr;
      }

      setStep('success');

      if (onAssignmentCreated) {
        onAssignmentCreated(assignmentData, jobData);
      }
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Failed to record direct hire. Please try again.');
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden relative my-6">
        {/* HEADER BAR */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-4 flex items-center justify-between text-white border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FF9933] text-slate-900 flex items-center justify-center font-black shadow-md">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black tracking-widest uppercase text-[#FF9933] block">
                Direct Phone Hiring
              </span>
              <h3 className="font-heading font-extrabold text-base text-white">
                Phone Call Follow-Up
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WORKER SUMMARY PILL */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-900">{worker.full_name}</span>
            {worker.category && (
              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 font-semibold text-[11px]">
                {worker.category}
              </span>
            )}
          </div>
          <span className="font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
            ₹{worker.daily_wage || 500} / day
          </span>
        </div>

        <div className="p-6">
          {/* ============================================================== */}
          {/* STEP 1: INITIAL PROMPT (Did worker agree?)                      */}
          {/* ============================================================== */}
          {step === 'prompt' && (
            <div className="space-y-5">
              <div className="text-center space-y-1.5 pt-1">
                <h4 className="font-heading font-extrabold text-lg text-slate-900">
                  Did the worker agree to take this job?
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                  Record the outcome of your phone conversation with{' '}
                  <strong className="text-slate-700">{worker.full_name}</strong>.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {/* OPTION 1: YES */}
                <button
                  type="button"
                  onClick={handleAgreed}
                  className="w-full p-4 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-500 text-left flex items-center justify-between transition-all group cursor-pointer shadow-xs"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="font-heading font-black text-sm text-emerald-900 block">
                        Yes, worker agreed
                      </span>
                      <span className="text-xs text-emerald-700">
                        We agreed on wage, date and work details
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-emerald-600 group-hover:translate-x-1 transition-transform" />
                </button>

                {/* OPTION 2: NO */}
                <button
                  type="button"
                  onClick={handleDeclined}
                  className="w-full p-4 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-left flex items-center justify-between transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                      <XCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="font-heading font-black text-sm text-rose-900 block">
                        No, worker declined
                      </span>
                      <span className="text-xs text-rose-600">
                        Worker is busy or could not take this job
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-rose-400 group-hover:translate-x-1 transition-transform" />
                </button>

                {/* OPTION 3: NOT DECIDED */}
                <button
                  type="button"
                  onClick={handleUndecided}
                  className="w-full p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left flex items-center justify-between transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-600 text-white flex items-center justify-center shrink-0">
                      <Clock className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="font-heading font-black text-sm text-slate-800 block">
                        Not decided yet
                      </span>
                      <span className="text-xs text-slate-500">
                        Need to speak again or deciding later
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 2: ESSENTIAL JOB DETAILS (When Worker Agreed)             */}
          {/* ============================================================== */}
          {step === 'details' && (
            <form onSubmit={handleConfirmDirectHire} className="space-y-4">
              <div className="space-y-1">
                <h4 className="font-heading font-extrabold text-base text-slate-900">
                  Confirm Essential Job Details
                </h4>
                <p className="text-xs text-slate-500">
                  Enter agreed terms. The worker does not need to accept an in-app request.
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* JOB TITLE */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Work Title / Category
                </label>
                <div className="relative">
                  <Briefcase className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g. Wheat Harvesting, Masonry work"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#FF9933] text-slate-900"
                  />
                </div>
              </div>

              {/* AGREED WAGE & DATE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Agreed Daily Wage (₹)
                  </label>
                  <div className="relative">
                    <IndianRupee className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="number"
                      required
                      min={100}
                      step={10}
                      value={agreedWage}
                      onChange={(e) => setAgreedWage(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#FF9933] text-slate-900"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Scheduled Date
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="date"
                      required
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#FF9933] text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* START TIME & DURATION */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Expected Start Time
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#FF9933] text-slate-900"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Expected Duration (Hours)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={expectedHours}
                    onChange={(e) => setExpectedHours(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#FF9933] text-slate-900"
                  />
                </div>
              </div>

              {/* LOCATION */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Reporting Village / Area
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={workLocation}
                    onChange={(e) => setWorkLocation(e.target.value)}
                    placeholder="e.g. North Field, Rampur Village"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#FF9933] text-slate-900"
                  />
                </div>
              </div>

              {/* TRANSPARENCY NOTICE */}
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p>
                  <strong>Employer-Reported Verbal Agreement:</strong> This assignment is recorded directly from your phone call. Both parties will track attendance and daily wage settlements in the dashboard.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('prompt')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Back
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Creating Assignment...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Create Direct Assignment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* ============================================================== */}
          {/* STEP 3: DECLINED CONFIRMATION                                  */}
          {/* ============================================================== */}
          {step === 'declined' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="font-heading font-extrabold text-base text-slate-900">
                  Recorded: Worker Declined
                </h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  No confirmed assignment was created. You can contact another worker in the directory.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Browse Other Workers
              </button>
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 4: UNDECIDED CONFIRMATION                                 */}
          {/* ============================================================== */}
          {step === 'undecided' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="font-heading font-extrabold text-base text-slate-900">
                  Kept as Pending
                </h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  No confirmed assignment was created. You can decide later or call {worker.full_name} again anytime.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 5: SUCCESS CONFIRMATION                                   */}
          {/* ============================================================== */}
          {step === 'success' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="font-heading font-extrabold text-base text-slate-900">
                  Direct Hire Confirmed!
                </h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  {worker.full_name} is now hired for ₹{agreedWage}/day. Track attendance and wage payment in your My Jobs dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
              >
                View in My Jobs Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

